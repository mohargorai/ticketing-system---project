/**
 * Database Password Security Audit & Migration Script
 * Scans all registered users in MongoDB, checks their password hash algorithms,
 * rehashes plain-text passwords directly to bcrypt-12, and flags weak hashes
 * for transparent upgrading upon their next login.
 *
 * Usage: node scripts/migrate-passwords.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const authService = require('../services/authService');

const DB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ticketingDB';
const BCRYPT_ROUNDS = 12;

function getBcryptRounds(hash) {
    if (typeof hash !== 'string') return 0;
    const match = hash.match(/^\$2[aby]\$(\d{2})\$/);
    return match ? parseInt(match[1], 10) : 0;
}

function isBcryptHash(hash) {
    return typeof hash === 'string' && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash);
}

async function runMigration() {
    console.log('Connecting to database...');
    await mongoose.connect(DB_URI);
    console.log('Connected to MongoDB.\nStarting password security audit & migration...');

    const users = await User.find({});
    console.log(`Found ${users.length} total user accounts to evaluate.\n`);

    let secureCount = 0;
    let upgradedPlaintextCount = 0;
    let pendingNextLoginCount = 0;

    for (const user of users) {
        const pass = user.password;

        if (isBcryptHash(pass)) {
            const rounds = getBcryptRounds(pass);
            if (rounds >= BCRYPT_ROUNDS) {
                secureCount++;
            } else {
                console.log(`⚠️ User [${user.username}]: Bcrypt hash has ${rounds} rounds (< ${BCRYPT_ROUNDS}). Will automatically upgrade to 12 rounds on next login.`);
                pendingNextLoginCount++;
            }
        } else if (/^[a-f0-9]{32}$/i.test(pass) || /^[a-f0-9]{40}$/i.test(pass)) {
            console.log(`⚠️ User [${user.username}]: Stored as legacy MD5/SHA-1 hash. Will automatically upgrade to bcrypt-12 on next login.`);
            pendingNextLoginCount++;
        } else {
            // Plain text password detected - directly rehash to bcrypt-12
            console.log(`🚨 User [${user.username}]: PLAIN TEXT password detected! Re-hashing with pepper to bcrypt (salt rounds = ${BCRYPT_ROUNDS})...`);
            user.password = await authService.hashPassword(pass);
            await user.save();
            upgradedPlaintextCount++;
            console.log(`✅ User [${user.username}]: Successfully migrated to peppered bcrypt-12.`);
        }
    }

    console.log('\n=============================================');
    console.log('📊 Password Migration & Audit Summary:');
    console.log(`- Total Accounts:                     ${users.length}`);
    console.log(`- Already Secure (Bcrypt >= 12):      ${secureCount}`);
    console.log(`- Plain-text Migrated Immediately:    ${upgradedPlaintextCount}`);
    console.log(`- Pending Next Login Re-hash:         ${pendingNextLoginCount}`);
    console.log('=============================================\n');

    await mongoose.disconnect();
    console.log('Database disconnected. Migration complete.');
}

runMigration().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});

