const nodemailer = require('nodemailer');

// Initialize transporter: use SMTP if configured in .env, otherwise fallback to development mock
let transporter;

if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
} else {
    // Development / Test transporter
    transporter = {
        sendMail: async (options) => {
            console.info(`[EMAIL_SERVICE: MOCK DISPATCH]`);
            console.info(`To: ${options.to}`);
            console.info(`Subject: ${options.subject}`);
            console.info(`Reset Link Preview: ${options.text || options.html}`);
            return { messageId: 'mock-' + Date.now() };
        }
    };
}

/**
 * Sends an email notification when an account is locked due to consecutive failed logins.
 */
async function sendLockoutEmail(toEmail, resetLink) {
    if (!toEmail) return;
    try {
        const mailOptions = {
            from: process.env.EMAIL_FROM || '"Security Team" <security@ticketing-app.com>',
            to: toEmail,
            subject: 'Security Alert: Account Temporarily Locked',
            text: `Hello,\n\nWe noticed multiple failed login attempts on your account. As a security precaution, your account has been temporarily locked for 15 minutes.\n\nIf this was not you, or if you wish to unlock and reset your credentials immediately, please use the following link:\n${resetLink}\n\nThis link will expire in 1 hour.\n\nRegards,\nSecurity Team`,
            html: `
                <div style="font-family: Arial, sans-serif; color: #222; max-width: 600px; padding: 20px;">
                    <h2 style="color: #dc3545;">Security Alert: Account Locked</h2>
                    <p>We noticed multiple failed login attempts on your account. For your safety, the account has been temporarily locked for 15 minutes.</p>
                    <p>If you need to unlock your account and reset your password right away, click the button below:</p>
                    <p style="margin: 30px 0;">
                        <a href="${resetLink}" style="background-color: #dc3545; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password & Unlock Account</a>
                    </p>
                    <p style="font-size: 12px; color: #777;">This link expires in 1 hour. If you made these attempts yourself, you may also wait 15 minutes and try again.</p>
                </div>
            `
        };
        await transporter.sendMail(mailOptions);
    } catch (err) {
        console.error('Failed to send lockout notification email:', err.message);
    }
}

/**
 * Sends a password reset email requested by user.
 */
async function sendPasswordResetEmail(toEmail, resetLink) {
    if (!toEmail) return;
    try {
        const mailOptions = {
            from: process.env.EMAIL_FROM || '"Support Team" <support@ticketing-app.com>',
            to: toEmail,
            subject: 'Password Reset Request',
            text: `Hello,\n\nYou requested a password reset for your account. Please use the following link to set a new password:\n${resetLink}\n\nThis link will expire in 1 hour.\n\nIf you did not request this, please ignore this email.`,
            html: `
                <div style="font-family: Arial, sans-serif; color: #222; max-width: 600px; padding: 20px;">
                    <h2>Password Reset Request</h2>
                    <p>You requested a password reset for your account. Click the button below to choose a new password:</p>
                    <p style="margin: 30px 0;">
                        <a href="${resetLink}" style="background-color: #0d6efd; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
                    </p>
                    <p style="font-size: 12px; color: #777;">This link expires in 1 hour. If you did not make this request, you can safely ignore this email.</p>
                </div>
            `
        };
        await transporter.sendMail(mailOptions);
    } catch (err) {
        console.error('Failed to send password reset email:', err.message);
    }
}

module.exports = {
    sendLockoutEmail,
    sendPasswordResetEmail
};

