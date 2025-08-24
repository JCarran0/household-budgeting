import { z } from 'zod';

// Custom password validation
const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters long')
  .max(100, 'Password must be less than 100 characters')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .refine((password) => {
    const commonPasswords = ['password123', '12345678', 'qwerty123', 'abc12345', 'password'];
    return !commonPasswords.includes(password.toLowerCase());
  }, 'Password is too common');

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