const { z } = require('zod');

/**
 * Sanitizes input string to remove HTML tags, script blocks, and dangerous control characters.
 */
function sanitizeInput(value) {
    if (typeof value !== 'string') return value;
    return value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Strip script tags and content
        .replace(/<[^>]*>?/gm, '') // Strip all HTML tags
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Strip control chars and null bytes
        .trim();
}

/**
 * Zod Schemas for Authentication and User Input
 */
const signupSchema = z.object({
    username: z.string()
        .min(3, "Length check")
        .max(30, "Length check")
        .regex(/^[a-zA-Z0-9_.-]+$/, "Character check"),
    email: z.string()
        .email()
        .min(5)
        .max(255)
        .optional()
        .or(z.literal('')),
    password: z.string()
        .min(8, "Length check")
        .max(128, "Length check"),
    displayName: z.string()
        .min(1)
        .max(50)
        .optional()
        .or(z.literal('')),
    fullName: z.string()
        .min(1)
        .max(50)
        .optional()
        .or(z.literal(''))
});

const adminSignupSchema = z.object({
    username: z.string()
        .min(3)
        .max(30)
        .regex(/^[a-zA-Z0-9_.-]+$/),
    password: z.string()
        .min(8)
        .max(128),
    secretKey: z.string()
        .min(1)
        .max(128)
});

const loginSchema = z.object({
    username: z.string()
        .min(3)
        .max(255),
    password: z.string()
        .min(8)
        .max(128)
});

const forgotPasswordSchema = z.object({
    email: z.string()
        .email()
        .min(5)
        .max(255)
});

const resetPasswordSchema = z.object({
    token: z.string()
        .min(16)
        .max(128),
    newPassword: z.string()
        .min(8)
        .max(128)
});

const changePasswordSchema = z.object({
    currentPassword: z.string()
        .min(8)
        .max(128),
    newPassword: z.string()
        .min(8)
        .max(128)
});

const profileUpdateSchema = z.object({
    fullName: z.string().max(100).optional().or(z.literal('')),
    phone: z.string().max(25).optional().or(z.literal('')),
    dob: z.string().max(30).optional().or(z.literal('')),
    address: z.string().max(200).optional().or(z.literal(''))
});

/**
 * Factory creating validation middleware for a given Zod schema.
 * Performs deep input sanitization, validates format & length, logs failures without sensitive data,
 * and returns a generic error response that leaks no field details.
 */
function validateAuth(schema) {
    return (req, res, next) => {
        // Sanitize string inputs in body
        if (req.body && typeof req.body === 'object') {
            for (const key of Object.keys(req.body)) {
                if (typeof req.body[key] === 'string') {
                    req.body[key] = sanitizeInput(req.body[key]);
                }
            }
        }

        const parseResult = schema.safeParse(req.body);

        if (!parseResult.success) {
            // Log validation failures server-side for security monitoring
            // CRITICAL: NEVER log raw passwords or credential values
            console.warn(`[AUTH_VALIDATION_FAILURE] ${new Date().toISOString()} - IP: ${req.ip} - Path: ${req.originalUrl || req.path} - Fields:`,
                parseResult.error.issues.map(issue => ({
                    field: issue.path.join('.'),
                    code: issue.code
                }))
            );

            // Generic error message - does not reveal which field failed
            return res.status(400).json({
                success: false,
                message: "Invalid input provided."
            });
        }

        req.body = parseResult.data;
        next();
    };
}

module.exports = {
    sanitizeInput,
    validateAuth,
    signupSchema,
    adminSignupSchema,
    loginSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
    changePasswordSchema,
    profileUpdateSchema
};

