import { z } from 'zod';

// Custom password validation - passphrases are more secure!
const passwordSchema = z.string()
  .min(15, 'Password must be at least 15 characters long')
  .max(200, 'Password must be less than 200 characters')
  .refine((password) => {
    // Check for extremely common/weak passwords
    const commonPasswords = [
      'password123456',
      '123456789012345',
      'qwertyuiopasdfg',
      'aaaaaaaaaaaaaaa',
      '111111111111111'
    ];
    return !commonPasswords.includes(password.toLowerCase());
  }, 'Password is too common or weak')
  .refine((password) => {
    // Ensure password has some variety (at least 3 unique characters)
    const uniqueChars = new Set(password).size;
    return uniqueChars >= 3;
  }, 'Password must contain more variety');

// Username validation
const usernameSchema = z.string()
  .min(3, 'Username must be at least 3 characters long')
  .max(20, 'Username must be less than 20 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens')
  .transform(val => val.toLowerCase());

// Registration schema
export const registrationSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

// Login schema
export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

// Change password schema
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
  confirmPassword: z.string().min(1, 'Password confirmation is required'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// Token refresh schema
export const tokenRefreshSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

// JWT payload schema
export const jwtPayloadSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  username: z.string().min(1),
  iat: z.number().optional(),
  exp: z.number().optional(),
});

// Type exports
export type RegistrationInput = z.infer<typeof registrationSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type TokenRefreshInput = z.infer<typeof tokenRefreshSchema>;
export type JWTPayload = z.infer<typeof jwtPayloadSchema>;