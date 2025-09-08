import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { DataService, User } from './dataService';

interface AuthResult {
  success: boolean;
  error?: string;
  user?: {
    id: string;
    username: string;
  };
  token?: string;
  message?: string;
}

// JWT payload structure
interface JWTPayload {
  userId: string;
  username: string;
  iat?: number;
  exp?: number;
}

interface TokenValidationResult {
  valid: boolean;
  error?: string;
  decoded?: JWTPayload;
}

interface PasswordStrengthResult {
  isValid: boolean;
  errors?: string[];
}

interface SecurityEventDetails {
  userId?: string;
  attempts?: number;
  reason?: string;
  ip?: string;
  userAgent?: string;
  tokenExpires?: string;
}

interface SecurityEvent {
  event: string;
  username?: string;
  userId?: string;
  timestamp: Date;
  details: SecurityEventDetails;
}

interface ResetToken {
  token: string;
  username: string;
  expiresAt: Date;
  used: boolean;
}

export class AuthService {
  private dataService: DataService;
  private failedAttempts: Map<string, number> = new Map();
  private lockoutTime: Map<string, Date> = new Map();
  private readonly maxFailedAttempts = 5;
  private readonly lockoutDuration = 15 * 60 * 1000; // 15 minutes
  private securityLogs: SecurityEvent[] = [];
  private resetTokens: Map<string, ResetToken> = new Map();
  private resetRequestTime: Map<string, Date> = new Map();
  private readonly resetTokenExpiry = 15 * 60 * 1000; // 15 minutes
  private readonly resetRequestCooldown = 5 * 60 * 1000; // 5 minutes between requests

  constructor(dataService: DataService) {
    this.dataService = dataService;
  }

  async register(username: string, password: string): Promise<AuthResult> {
    try {
      // Validate username
      if (!username || username.length < 3 || username.length > 20) {
        return {
          success: false,
          error: 'Username must be between 3 and 20 characters',
        };
      }

      // Validate password strength
      const passwordValidation = this.validatePasswordStrength(password);
      if (!passwordValidation.isValid) {
        return {
          success: false,
          error: passwordValidation.errors?.[0] || 'Invalid password',
        };
      }

      // Check if username already exists
      const existingUser = await this.dataService.getUserByUsername(username);
      if (existingUser) {
        return {
          success: false,
          error: 'Username already exists',
        };
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create user
      const user: User = {
        id: uuidv4(),
        username,
        passwordHash,
        createdAt: new Date(),
      };

      const createdUser = await this.dataService.createUser(user);

      // Generate JWT token for auto-login after registration
      const token = this.generateToken(createdUser.id, createdUser.username);

      // Log security event
      this.logSecurityEvent({
        event: 'USER_REGISTERED',
        username,
        timestamp: new Date(),
        details: { userId: createdUser.id },
      });

      return {
        success: true,
        token,
        user: {
          id: createdUser.id,
          username: createdUser.username,
        },
      };
    } catch (error) {
      console.error('Registration error:', error);
      return {
        success: false,
        error: 'Registration failed. Please try again.',
      };
    }
  }

  async login(username: string, password: string): Promise<AuthResult> {
    try {
      // Check if account is locked
      if (this.isAccountLocked(username)) {
        return {
          success: false,
          error: 'Too many failed attempts. Please try again later.',
        };
      }

      // Find user
      const user = await this.dataService.getUserByUsername(username);
      if (!user) {
        this.recordFailedAttempt(username);
        this.logSecurityEvent({
          event: 'LOGIN_FAILED',
          username,
          timestamp: new Date(),
          details: { reason: 'User not found' },
        });
        return {
          success: false,
          error: 'Invalid username or password',
        };
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        this.recordFailedAttempt(username);
        this.logSecurityEvent({
          event: 'LOGIN_FAILED',
          username,
          timestamp: new Date(),
          details: { reason: 'Invalid password' },
        });
        return {
          success: false,
          error: 'Invalid username or password',
        };
      }

      // Reset failed attempts on successful login
      this.resetFailedAttempts(username);

      // Generate JWT token
      const token = this.generateToken(user.id, user.username);

      // Update last login
      await this.dataService.updateUser(user.id, {
        lastLogin: new Date(),
      });

      this.logSecurityEvent({
        event: 'LOGIN_SUCCESS',
        username,
        userId: user.id,
        timestamp: new Date(),
        details: {},
      });

      return {
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
        },
      };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: 'Login failed. Please try again.',
      };
    }
  }

  generateToken(userId: string, username: string): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }

    return jwt.sign(
      { userId, username },
      secret,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } as jwt.SignOptions
    );
  }

  validateToken(token: string): TokenValidationResult {
    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        throw new Error('JWT_SECRET is not configured');
      }

      const decoded = jwt.verify(token, secret);
      
      // Ensure decoded is our expected JWTPayload structure
      if (typeof decoded === 'object' && decoded !== null && 'userId' in decoded && 'username' in decoded) {
        return {
          valid: true,
          decoded: decoded as JWTPayload,
        };
      }
      
      return {
        valid: false,
        error: 'Invalid token structure',
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        return {
          valid: false,
          error: 'Token expired',
        };
      }
      return {
        valid: false,
        error: 'Invalid token',
      };
    }
  }

  async refreshToken(oldToken: string): Promise<AuthResult> {
    try {
      const validation = this.validateToken(oldToken);
      
      if (!validation.valid || !validation.decoded) {
        return {
          success: false,
          error: validation.error || 'Invalid token',
        };
      }

      const { userId, username } = validation.decoded;
      const newToken = this.generateToken(userId, username);

      return {
        success: true,
        token: newToken,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Token refresh failed',
      };
    }
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<AuthResult> {
    try {
      // Get user
      const user = await this.dataService.getUser(userId);
      if (!user) {
        return {
          success: false,
          error: 'User not found',
        };
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValidPassword) {
        this.logSecurityEvent({
          event: 'PASSWORD_CHANGE_FAILED',
          userId,
          username: user.username,
          timestamp: new Date(),
          details: { reason: 'Invalid current password' },
        });
        return {
          success: false,
          error: 'Current password is incorrect',
        };
      }

      // Validate new password
      const passwordValidation = this.validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        return {
          success: false,
          error: passwordValidation.errors?.[0] || 'Invalid password',
        };
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      // Update password
      await this.dataService.updateUser(userId, {
        passwordHash: newPasswordHash,
      });

      this.logSecurityEvent({
        event: 'PASSWORD_CHANGED',
        userId,
        username: user.username,
        timestamp: new Date(),
        details: {},
      });

      return {
        success: true,
        message: 'Password changed successfully',
      };
    } catch (error) {
      console.error('Password change error:', error);
      return {
        success: false,
        error: 'Password change failed',
      };
    }
  }

  async requestPasswordReset(username: string): Promise<AuthResult> {
    try {
      // Check if user exists
      const user = await this.dataService.getUserByUsername(username);
      if (!user) {
        // Don't reveal if user exists or not
        this.logSecurityEvent({
          event: 'PASSWORD_RESET_REQUESTED',
          username,
          timestamp: new Date(),
          details: { reason: 'User not found' },
        });
        return {
          success: true,
          message: 'If the username exists, a reset token has been generated. Check server logs.',
        };
      }

      // Check rate limiting
      const lastRequest = this.resetRequestTime.get(username);
      if (lastRequest && new Date().getTime() - lastRequest.getTime() < this.resetRequestCooldown) {
        this.logSecurityEvent({
          event: 'PASSWORD_RESET_RATE_LIMITED',
          username,
          userId: user.id,
          timestamp: new Date(),
          details: { reason: 'Too many requests' },
        });
        return {
          success: false,
          error: 'Please wait before requesting another reset token.',
        };
      }

      // Generate secure reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + this.resetTokenExpiry);

      // Store reset token
      this.resetTokens.set(resetToken, {
        token: resetToken,
        username,
        expiresAt,
        used: false,
      });

      // Update request time
      this.resetRequestTime.set(username, new Date());

      // Log the token to server logs (this is how you'll access it)
      console.log('');
      console.log('='.repeat(80));
      console.log('🔐 PASSWORD RESET TOKEN GENERATED');
      console.log('='.repeat(80));
      console.log(`Username: ${username}`);
      console.log(`Reset Token: ${resetToken}`);
      console.log(`Expires At: ${expiresAt.toISOString()}`);
      console.log(`Valid for: 15 minutes`);
      console.log('='.repeat(80));
      console.log('');

      this.logSecurityEvent({
        event: 'PASSWORD_RESET_REQUESTED',
        username,
        userId: user.id,
        timestamp: new Date(),
        details: { tokenExpires: expiresAt.toISOString() },
      });

      return {
        success: true,
        message: 'Reset token generated successfully. Check server logs for the token.',
      };
    } catch (error) {
      console.error('Password reset request error:', error);
      return {
        success: false,
        error: 'Reset request failed. Please try again.',
      };
    }
  }

  async resetPassword(
    username: string,
    token: string,
    newPassword: string
  ): Promise<AuthResult> {
    try {
      // Find reset token
      const resetToken = this.resetTokens.get(token);
      if (!resetToken) {
        this.logSecurityEvent({
          event: 'PASSWORD_RESET_FAILED',
          username,
          timestamp: new Date(),
          details: { reason: 'Invalid token' },
        });
        return {
          success: false,
          error: 'Invalid or expired reset token.',
        };
      }

      // Check if token matches username
      if (resetToken.username !== username) {
        this.logSecurityEvent({
          event: 'PASSWORD_RESET_FAILED',
          username,
          timestamp: new Date(),
          details: { reason: 'Token username mismatch' },
        });
        return {
          success: false,
          error: 'Invalid reset token.',
        };
      }

      // Check if token is expired
      if (new Date() > resetToken.expiresAt) {
        this.resetTokens.delete(token);
        this.logSecurityEvent({
          event: 'PASSWORD_RESET_FAILED',
          username,
          timestamp: new Date(),
          details: { reason: 'Token expired' },
        });
        return {
          success: false,
          error: 'Reset token has expired.',
        };
      }

      // Check if token is already used
      if (resetToken.used) {
        this.logSecurityEvent({
          event: 'PASSWORD_RESET_FAILED',
          username,
          timestamp: new Date(),
          details: { reason: 'Token already used' },
        });
        return {
          success: false,
          error: 'Reset token has already been used.',
        };
      }

      // Get user
      const user = await this.dataService.getUserByUsername(username);
      if (!user) {
        this.resetTokens.delete(token);
        this.logSecurityEvent({
          event: 'PASSWORD_RESET_FAILED',
          username,
          timestamp: new Date(),
          details: { reason: 'User not found' },
        });
        return {
          success: false,
          error: 'User not found.',
        };
      }

      // Validate new password
      const passwordValidation = this.validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        return {
          success: false,
          error: passwordValidation.errors?.[0] || 'Invalid password',
        };
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      // Update password
      await this.dataService.updateUser(user.id, {
        passwordHash: newPasswordHash,
      });

      // Mark token as used and remove it
      resetToken.used = true;
      this.resetTokens.delete(token);

      // Clear any failed login attempts for this user
      this.resetFailedAttempts(username);

      this.logSecurityEvent({
        event: 'PASSWORD_RESET_COMPLETED',
        username,
        userId: user.id,
        timestamp: new Date(),
        details: {},
      });

      return {
        success: true,
        message: 'Password has been reset successfully. You can now log in with your new password.',
      };
    } catch (error) {
      console.error('Password reset error:', error);
      return {
        success: false,
        error: 'Password reset failed. Please try again.',
      };
    }
  }

  validatePasswordStrength(password: string): PasswordStrengthResult {
    const errors: string[] = [];

    // Require minimum length of 15 characters for passphrase security
    if (!password || password.length < 15) {
      errors.push('Password must be at least 15 characters long');
    }

    // Check for extremely common/weak passwords
    const commonPasswords = [
      'password123456',
      '123456789012345',
      'qwertyuiopasdfg',
      'aaaaaaaaaaaaaaa',
      '111111111111111'
    ];
    if (commonPasswords.includes(password.toLowerCase())) {
      errors.push('Password is too common or weak');
    }

    // Warn if password is just repeated characters
    if (password && password.length >= 15) {
      const uniqueChars = new Set(password).size;
      if (uniqueChars < 3) {
        errors.push('Password must contain more variety');
      }
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  sanitizeInput(input: string): string {
    // Remove dangerous characters and patterns
    let sanitized = input.replace(/<script[^>]*>.*?<\/script>/gi, '');
    sanitized = sanitized.replace(/[<>'"]/g, '');
    sanitized = sanitized.replace(/\.\.\//g, '');
    sanitized = sanitized.replace(/\0/g, '');
    return sanitized.trim();
  }

  private recordFailedAttempt(username: string): void {
    const attempts = this.failedAttempts.get(username) || 0;
    this.failedAttempts.set(username, attempts + 1);

    if (attempts + 1 >= this.maxFailedAttempts) {
      this.lockoutTime.set(username, new Date(Date.now() + this.lockoutDuration));
      this.logSecurityEvent({
        event: 'ACCOUNT_LOCKED',
        username,
        timestamp: new Date(),
        details: { attempts: attempts + 1 },
      });
    }
  }

  private resetFailedAttempts(username: string): void {
    this.failedAttempts.delete(username);
    this.lockoutTime.delete(username);
  }

  private isAccountLocked(username: string): boolean {
    const lockoutEnd = this.lockoutTime.get(username);
    if (!lockoutEnd) {
      return false;
    }

    if (new Date() > lockoutEnd) {
      this.lockoutTime.delete(username);
      this.failedAttempts.delete(username);
      return false;
    }

    return true;
  }

  getFailedAttempts(username: string): number {
    return this.failedAttempts.get(username) || 0;
  }

  /**
   * Reset all rate limiting state - FOR TESTING ONLY
   */
  resetRateLimiting(): void {
    if (process.env.NODE_ENV === 'test') {
      this.failedAttempts.clear();
      this.lockoutTime.clear();
    }
  }

  logSecurityEvent(event: SecurityEvent): void {
    this.securityLogs.push(event);
    // In production, this would write to a secure log file or service
    if (process.env.NODE_ENV !== 'test') {
      console.log('Security Event:', JSON.stringify(event));
    }
  }

  getSecurityLogs(): SecurityEvent[] {
    return this.securityLogs;
  }
}