require('dotenv').config();
const {
    validateAuth,
    signupSchema,
    loginSchema,
    forgotPasswordSchema,
    sanitizeInput
} = require('../middleware/authValidation');

const authService = require('../services/authService');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

async function runTests() {
    console.log('🧪 Starting Security & Authentication Test Suite...\n');

    let passed = 0;
    let failed = 0;

    function assert(cond, name) {
        if (cond) {
            console.log(`  ✅ PASS: ${name}`);
            passed++;
        } else {
            console.error(`  ❌ FAIL: ${name}`);
            failed++;
        }
    }

    // ==========================================
    // 1. INPUT VALIDATION & SANITIZATION TESTS
    // ==========================================
    console.log('--- Test Suite 1: Input Validation & Sanitization ---');

    // 1.1 HTML/Script stripping
    const dirty = '<script>alert("hacked")</script>hello<b>world</b>';
    const clean = sanitizeInput(dirty);
    assert(clean === 'helloworld', `sanitizeInput strips script and HTML tags: "${clean}"`);

    // 1.2 Control chars & null bytes stripping
    const dirtyChars = 'user\x00name\x1F';
    const cleanChars = sanitizeInput(dirtyChars);
    assert(cleanChars === 'username', `sanitizeInput strips null bytes and control chars: "${cleanChars}"`);

    // 1.3 Signup schema rejection on short password
    const shortPassRes = signupSchema.safeParse({ username: 'validuser', password: '123' });
    assert(!shortPassRes.success, 'Reject signup password shorter than 8 characters');

    // 1.4 Signup schema rejection on invalid username
    const badUserRes = signupSchema.safeParse({ username: 'user<script>', password: 'password123' });
    assert(!badUserRes.success, 'Reject signup username containing illegal characters');

    // 1.5 Generic error simulation with validateAuth
    let sentStatus = null;
    let sentJson = null;
    const mockRes = {
        status: (s) => { sentStatus = s; return mockRes; },
        json: (j) => { sentJson = j; return mockRes; }
    };
    const mockReq = {
        ip: '127.0.0.1',
        path: '/api/signup',
        body: { username: 'u', password: '123' }
    };
    const mockNext = () => {};

    validateAuth(signupSchema)(mockReq, mockRes, mockNext);
    assert(sentStatus === 400, 'Validation failure returns status 400');
    assert(sentJson.message === 'Invalid input provided.', 'Validation failure returns generic message without disclosing field');

    // ==========================================
    // 2. PASSWORD HASHING (BCRYPT 12 + PEPPER) & MIGRATION
    // ==========================================
    console.log('\n--- Test Suite 2: Password Storage, Pepper, Hashing & Migration ---');

    // 2.1 Pepper generation & 72-byte normalization
    const pepperedDigest = authService.pepperPassword('MySecurePassword123');
    assert(typeof pepperedDigest === 'string' && pepperedDigest.length === 64, 'Pepper produces 64-character HMAC-SHA256 digest');

    // 2.2 Hash uses at least 12 salt rounds
    const testHash = await authService.hashPassword('MySecurePassword123');
    const rounds = authService.getBcryptRounds(testHash);
    assert(rounds >= 12, `Password hashed with bcrypt salt rounds >= 12 (actual: ${rounds})`);

    // 2.3 Constant-time comparison with pepper works
    const isMatch = await bcrypt.compare(pepperedDigest, testHash);
    assert(isMatch === true, 'Bcrypt compares successfully with peppered password');

    // 2.4 Unpeppered password fails against peppered hash (demonstrating database leak protection)
    const isUnpepperedMatch = await bcrypt.compare('MySecurePassword123', testHash);
    assert(isUnpepperedMatch === false, 'Raw unpeppered password fails against peppered hash (db dump protection)');

    const isWrongMatch = await bcrypt.compare(authService.pepperPassword('WrongPassword123'), testHash);
    assert(isWrongMatch === false, 'Bcrypt safely rejects incorrect password');

    // 2.5 Password round detection
    const tenRoundHash = await bcrypt.hash('legacyPass123', 10);
    assert(authService.getBcryptRounds(tenRoundHash) === 10, 'Detects legacy bcrypt rounds = 10');

    // ==========================================
    // 3. ACCOUNT LOCKOUT & GENERIC RESPONSES
    // ==========================================
    console.log('\n--- Test Suite 3: Account Lockout & Generic Responses ---');

    // Mock User.findOne to test password reset and login without requiring live DB connection
    const origFindOne = User.findOne;
    User.findOne = async () => null; // simulates nonexistent user

    const forgotRes = await authService.generatePasswordReset('nonexistent@example.com');
    assert(
        forgotRes.message === "If that email is registered, you'll receive a reset link",
        'Password reset returns generic safe response for nonexistent email'
    );

    // Test authenticateUser when user is nonexistent
    const loginFailRes = await authService.authenticateUser('randomUnknownUser', 'SomePassword123');
    assert(loginFailRes.success === false, 'Login fails for nonexistent user');
    assert(loginFailRes.genericError === true, 'Returns generic failure flag');

    // Restore findOne
    User.findOne = origFindOne;

    // ==========================================
    // 4. SUMMARY
    // ==========================================
    console.log('\n=============================================');
    console.log(`Results: ${passed} Passed, ${failed} Failed`);
    console.log('=============================================\n');

    if (failed > 0) process.exit(1);
    process.exit(0);
}

runTests().catch(err => {
    console.error('Test run failed:', err);
    process.exit(1);
});
