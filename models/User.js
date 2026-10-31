const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    
    // Role-Based Access Control (RBAC)
    isAdmin: { type: Boolean, default: false },
    
    // Profile fields
    fullName: { type: String, default: '' },
    email: { type: String, default: '', index: true },
    phone: { type: String, default: '' },
    dob: { type: Date, default: null },       
    address: { type: String, default: '' },

    // Security & Account Lockout
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },

    // Password Reset
    passwordResetToken: { type: String, default: null },
    passwordResetExpires: { type: Date, default: null }
}, {
    timestamps: true
});

module.exports = mongoose.model('User', userSchema);
