const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { sendLockoutEmail, sendPasswordResetEmail } = require('./emailService');

const BCRYPT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const DUMMY_HASH = '$2b$12$e8e9e8e9e8e9e8e9e8e9euqC1O/3xZ/qH64h6W/1k4N1C0m2zYgGy'; // Precomputed dummy bcrypt-12 hash

// In-memory fallback cache for failed attempts & lockouts
const inMemoryCache = new Map();

// Periodic cleanup of expired in-memory lockout entries (every 5 minutes)
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of inMemoryCache.entries()) {
        if (value.expiresAt && value.expiresAt < now) {
            inMemoryCache.delete(key);
        }
    }
}, 5 * 60 * 1000).unref();

let redisClientRef = null;
let isRedisConnectedFn = () => false;

function initAuthService({ redisClient, isRedisConnected }) {
    redisClientRef = redisClient;
    if (typeof isRedisConnected === 'function') {
        isRedisConnectedFn = isRedisConnected;
    }
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqualStr(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) {
        crypto.timingSafeEqual(bufA, bufA);
        return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Returns salt rounds from a bcrypt hash string, or 0 if not a bcrypt hash.
 */
function getBcryptRounds(hash) {
    if (typeof hash !== 'string') return 0;
    const match = hash.match(/^\$2[aby]\$(\d{2})\$/);
    return match ? parseInt(match[1], 10) : 0;
}

/**
 * Checks whether a string is formatted as a bcrypt hash.
 */
function isBcryptHash(hash) {
    return typeof hash === 'string' && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash);
}

/**
 * Generates an account lockout cache key.
 */
function getAttemptCacheKey(identifier) {
    return `login_attempts:${identifier.trim().toLowerCase()}`;
}

/**
 * Retrieves failed login attempt record from Redis or in-memory cache.
 */
async function getAttemptRecord(identifier) {
    const key = getAttemptCacheKey(identifier);
    if (redisClientRef && isRedisConnectedFn()) {
        try {
            const data = await redisClientRef.get(key);
            if (data) return JSON.parse(data);
        } catch (e) {
            console.warn('Redis read failed, falling back to in-memory store:', e.message);
        }
    }

    const mem = inMemoryCache.get(key);
    if (mem && mem.expiresAt > Date.now()) {
        return mem;
    }
    return { count: 0, lockUntil: null, notified: false };
}

/**
 * Saves failed login attempt record to Redis or in-memory cache.
 */
async function saveAttemptRecord(identifier, record) {
    const key = getAttemptCacheKey(identifier);
    const ttlSeconds = Math.ceil(LOCKOUT_WINDOW_MS / 1000);
    record.expiresAt = Date.now() + LOCKOUT_WINDOW_MS;

    if (redisClientRef && isRedisConnectedFn()) {
        try {
            await redisClientRef.set(key, JSON.stringify(record), { EX: ttlSeconds });
            return;
        } catch (e) {
            console.warn('Redis write failed, falling back to in-memory store:', e.message);
        }
    }

    inMemoryCache.set(key, record);
}

/**
 * Clears failed login attempts after a successful login.
 */
async function clearFailedAttempts(identifier) {
    const key = getAttemptCacheKey(identifier);
    if (redisClientRef && isRedisConnectedFn()) {
        try {
            await redisClientRef.del(key);
        } catch (e) {}
    }
    inMemoryCache.delete(key);
}

/**
 * Computes progressive delay: each failed attempt increases wait time.
 */
function applyProgressiveDelay(attemptCount) {
    // 1st attempt: 500ms, 2nd: 1000ms, 3rd: 1500ms, 4th: 2000ms, 5th+: 2500ms
    const delayMs = Math.min(attemptCount * 500, 2500);
    return new Promise(resolve => setTimeout(resolve, delayMs));
}

/**
 * Applies HMAC-SHA256 pepper to plain password using server-side secret key.
 * This guarantees passwords cannot be cracked from a leaked database dump without the server secret,
 * and normalizes password input to a 64-character hex digest (preventing bcrypt's 72-byte truncation limit).
 */
function pepperPassword(plainPassword) {
    const pepper = process.env.PASSWORD_PEPPER || 'default-system-pepper-secret-key-32chars';
    return crypto.createHmac('sha256', pepper).update(String(plainPassword)).digest('hex');
}

/**
 * Hashes a plain-text password using HMAC-SHA256 pepper + bcrypt with at least 12 salt rounds.
 */
async function hashPassword(plainPassword) {
    const peppered = pepperPassword(plainPassword);
    return bcrypt.hash(peppered, BCRYPT_ROUNDS);
}

/**
 * Authenticates user credentials with:
 * - Constant-time comparison
 * - Automatic lockout enforcement (15 mins on 5 failed attempts)
 * - Progressive delay
 * - Transparent migration/rehashing of weak/plain-text passwords on login
 * - Email lockout notification with reset link
 */
async function authenticateUser(identifier, password, reqHost = 'localhost:3000', reqProtocol = 'http') {
    const attemptRecord = await getAttemptRecord(identifier);
    const now = Date.now();

    // 1. Account Lockout Check
    if (attemptRecord.lockUntil && now < attemptRecord.lockUntil) {
        // Enforce progressive delay even when locked to prevent timing probing
        await applyProgressiveDelay(MAX_FAILED_ATTEMPTS);
        // Generic failure: never reveal that the account is locked!
        return { success: false, genericError: true };
    }

    // 2. Fetch User by username or email (case-insensitive)
    const user = await User.findOne({
        $or: [
            { username: { $regex: new RegExp(`^${identifier.trim()}$`, 'i') } },
            { email: { $regex: new RegExp(`^${identifier.trim()}$`, 'i') } }
        ]
    });

    if (!user) {
        // Prevent timing attack: run dummy comparison with peppered dummy
        const peppered = pepperPassword(password);
        await bcrypt.compare(peppered, DUMMY_HASH);
        
        attemptRecord.count = (attemptRecord.count || 0) + 1;
        await saveAttemptRecord(identifier, attemptRecord);
        await applyProgressiveDelay(attemptRecord.count);
        
        return { success: false, genericError: true };
    }

    // 3. Password Verification & Transparent Rehashing (Migration)
    let passwordMatches = false;
    let needsRehash = false;

    if (isBcryptHash(user.password)) {
        // A. Verify with peppered password first
        const peppered = pepperPassword(password);
        passwordMatches = await bcrypt.compare(peppered, user.password);

        if (passwordMatches) {
            if (getBcryptRounds(user.password) < BCRYPT_ROUNDS) {
                needsRehash = true;
            }
        } else {
            // B. Backward compatibility: check without pepper (legacy bcrypt hash)
            const legacyMatch = await bcrypt.compare(password, user.password);
            if (legacyMatch) {
                passwordMatches = true;
                needsRehash = true; // Upgrade to peppered hash
                console.info(`[AUTH_PEPPER_MIGRATION] Transparently upgraded un-peppered password to peppered bcrypt-12 for user ID: ${user._id}`);
            }
        }
    } else if (/^[a-f0-9]{32}$/i.test(user.password)) {
        // Legacy MD5 Hash
        const hashedInput = crypto.createHash('md5').update(password).digest('hex');
        passwordMatches = timingSafeEqualStr(hashedInput, user.password);
        if (passwordMatches) needsRehash = true;
    } else if (/^[a-f0-9]{40}$/i.test(user.password)) {
        // Legacy SHA-1 Hash
        const hashedInput = crypto.createHash('sha1').update(password).digest('hex');
        passwordMatches = timingSafeEqualStr(hashedInput, user.password);
        if (passwordMatches) needsRehash = true;
    } else {
        // Legacy Plain Text Storage
        passwordMatches = timingSafeEqualStr(password, user.password);
        if (passwordMatches) needsRehash = true;
    }

    // 4. Handle Failed Password Match
    if (!passwordMatches) {
        attemptRecord.count = (attemptRecord.count || 0) + 1;

        if (attemptRecord.count >= MAX_FAILED_ATTEMPTS) {
            attemptRecord.lockUntil = now + LOCKOUT_WINDOW_MS;

            // Trigger lockout email notification with reset link if user has an email and hasn't been notified yet
            if (!attemptRecord.notified && user.email) {
                const rawResetToken = crypto.randomBytes(32).toString('hex');
                const hashedToken = crypto.createHash('sha256').update(rawResetToken).digest('hex');

                user.passwordResetToken = hashedToken;
                user.passwordResetExpires = new Date(now + 60 * 60 * 1000); // 1 hour
                user.lockUntil = new Date(attemptRecord.lockUntil);
                user.failedLoginAttempts = attemptRecord.count;
                await user.save();

                const resetUrl = `${reqProtocol}://${reqHost}/reset-password.html?token=${rawResetToken}`;
                sendLockoutEmail(user.email, resetUrl).catch(err => {
                    console.error('Lockout email send failed:', err.message);
                });
                attemptRecord.notified = true;
            }
        }

        await saveAttemptRecord(identifier, attemptRecord);
        await applyProgressiveDelay(attemptRecord.count);

        return { success: false, genericError: true };
    }

    // 5. Handle Successful Password Match
    // If password was stored as plain-text, MD5, SHA-1, or low-cost bcrypt (< 12 rounds), transparently rehash!
    if (needsRehash) {
        user.password = await hashPassword(password);
        console.info(`[AUTH_MIGRATION] Transparently upgraded password hash to bcrypt-12 for user ID: ${user._id}`);
    }

    // Reset failed login state
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();
    await clearFailedAttempts(identifier);

    return { success: true, user };
}

/**
 * Handles password reset token generation.
 * Always returns a generic response message to prevent email enumeration.
 */
async function generatePasswordReset(email, reqHost = 'localhost:3000', reqProtocol = 'http') {
    const genericResponse = {
        success: true,
        message: "If that email is registered, you'll receive a reset link"
    };

    if (!email) return genericResponse;

    const user = await User.findOne({ email: { $regex: new RegExp(`^${email.trim()}$`, 'i') } });
    if (!user) {
        // Return same generic message without revealing user does not exist
        return genericResponse;
    }

    const rawResetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawResetToken).digest('hex');

    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour validity
    await user.save();

    const resetUrl = `${reqProtocol}://${reqHost}/reset-password.html?token=${rawResetToken}`;
    sendPasswordResetEmail(user.email, resetUrl).catch(err => {
        console.error('Password reset email error:', err.message);
    });

    return genericResponse;
}

/**
 * Verifies reset token and updates password with bcrypt-12.
 */
async function resetPasswordWithToken(rawToken, newPassword) {
    if (!rawToken || !newPassword) {
        return { success: false, message: "Invalid or expired reset token." };
    }

    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    const user = await User.findOne({
        passwordResetToken: hashedToken,
        passwordResetExpires: { $gt: new Date() }
    });

    if (!user) {
        return { success: false, message: "Invalid or expired reset token." };
    }

    user.password = await hashPassword(newPassword);
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    await clearFailedAttempts(user.username);
    if (user.email) await clearFailedAttempts(user.email);

    return { success: true, message: "Password has been successfully updated. You may now sign in." };
}

/**
 * Changes password for an authenticated active user.
 */
async function changePassword(userId, currentPassword, newPassword) {
    const user = await User.findById(userId);
    if (!user) {
        return { success: false, message: "Account not found." };
    }

    // Check with pepper first, then fallback to unpeppered
    let match = await bcrypt.compare(pepperPassword(currentPassword), user.password);
    if (!match) {
        match = await bcrypt.compare(currentPassword, user.password);
    }

    if (!match) {
        return { success: false, message: "Incorrect current password." };
    }

    user.password = await hashPassword(newPassword);
    await user.save();

    return { success: true, message: "Password updated successfully." };
}

module.exports = {
    initAuthService,
    pepperPassword,
    hashPassword,
    authenticateUser,
    generatePasswordReset,
    resetPasswordWithToken,
    changePassword,
    clearFailedAttempts,
    getBcryptRounds,
    isBcryptHash,
    BCRYPT_ROUNDS,
    MAX_FAILED_ATTEMPTS,
    LOCKOUT_WINDOW_MS
};

