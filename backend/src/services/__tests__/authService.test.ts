import { AuthService } from '../authService';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

// Mock dependencies
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');
jest.mock('uuid');

describe('AuthService', () => {
  let authService: AuthService;
  const mockDataService = {
    getUser: jest.fn(),
    getUserByUsername: jest.fn(),
    createUser: jest.fn(),
    updateUser: jest.fn(),
    getAllUsers: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService(mockDataService as any);
  });

  describe('User Registration', () => {
    const validRegistrationData = {
      username: 'testuser',
      password: 'SecurePassword123!',
    };

    it('should register a new user with valid credentials', async () => {
      const hashedPassword = 'hashed_password';
      const userId = 'generated-uuid';
      
      (uuidv4 as jest.Mock).mockReturnValue(userId);
      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);
      mockDataService.getUserByUsername.mockResolvedValue(null);
      mockDataService.createUser.mockResolvedValue({
        id: userId,
        username: validRegistrationData.username,
        passwordHash: hashedPassword,
        createdAt: new Date(),
      });

      const result = await authService.register(
        validRegistrationData.username,
        validRegistrationData.password
      );

      expect(result).toEqual({
        success: true,
        user: {
          id: userId,
          username: validRegistrationData.username,
        },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith(validRegistrationData.password, 10);
      expect(mockDataService.createUser).toHaveBeenCalledWith({
        id: userId,
        username: validRegistrationData.username,
        passwordHash: hashedPassword,
        createdAt: expect.any(Date),
      });
    });

    it('should reject registration with existing username', async () => {
      mockDataService.getUserByUsername.mockResolvedValue({
        id: 'existing-user',
        username: validRegistrationData.username,
      });

      const result = await authService.register(
        validRegistrationData.username,
        validRegistrationData.password
      );

      expect(result).toEqual({
        success: false,
        error: 'Username already exists',
      });
      expect(mockDataService.createUser).not.toHaveBeenCalled();
    });

    it('should reject registration with weak password', async () => {
      const weakPassword = '123';

      const result = await authService.register(
        validRegistrationData.username,
        weakPassword
      );

      expect(result).toEqual({
        success: false,
        error: 'Password must be at least 8 characters long',
      });
      expect(mockDataService.createUser).not.toHaveBeenCalled();
    });

    it('should reject registration with invalid username', async () => {
      const invalidUsername = 'a'; // Too short

      const result = await authService.register(
        invalidUsername,
        validRegistrationData.password
      );

      expect(result).toEqual({
        success: false,
        error: 'Username must be between 3 and 20 characters',
      });
      expect(mockDataService.createUser).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      mockDataService.getUserByUsername.mockRejectedValue(
        new Error('Database connection failed')
      );

      const result = await authService.register(
        validRegistrationData.username,
        validRegistrationData.password
      );

      expect(result).toEqual({
        success: false,
        error: 'Registration failed. Please try again.',
      });
    });
  });

  describe('User Login', () => {
    const validLoginData = {
      username: 'testuser',
      password: 'SecurePassword123!',
    };

    const mockUser = {
      id: 'user-123',
      username: 'testuser',
      passwordHash: 'hashed_password',
      createdAt: new Date(),
    };

    it('should login user with correct credentials', async () => {
      const mockToken = 'jwt_token_here';
      
      mockDataService.getUserByUsername.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (jwt.sign as jest.Mock).mockReturnValue(mockToken);

      const result = await authService.login(
        validLoginData.username,
        validLoginData.password
      );

      expect(result).toEqual({
        success: true,
        token: mockToken,
        user: {
          id: mockUser.id,
          username: mockUser.username,
        },
      });
      expect(bcrypt.compare).toHaveBeenCalledWith(
        validLoginData.password,
        mockUser.passwordHash
      );
      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: mockUser.id, username: mockUser.username },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );
    });

    it('should reject login with non-existent username', async () => {
      mockDataService.getUserByUsername.mockResolvedValue(null);

      const result = await authService.login(
        'nonexistent',
        validLoginData.password
      );

      expect(result).toEqual({
        success: false,
        error: 'Invalid username or password',
      });
      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('should reject login with incorrect password', async () => {
      mockDataService.getUserByUsername.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await authService.login(
        validLoginData.username,
        'wrongpassword'
      );

      expect(result).toEqual({
        success: false,
        error: 'Invalid username or password',
      });
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('should implement rate limiting after failed attempts', async () => {
      mockDataService.getUserByUsername.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      // Simulate multiple failed login attempts
      for (let i = 0; i < 5; i++) {
        await authService.login(validLoginData.username, 'wrongpassword');
      }

      // The 6th attempt should be rate limited
      const result = await authService.login(
        validLoginData.username,
        validLoginData.password
      );

      expect(result).toEqual({
        success: false,
        error: 'Too many failed attempts. Please try again later.',
      });
    });
  });

  describe('JWT Token Management', () => {
    it('should generate a valid JWT token', () => {
      const userId = 'user-123';
      const username = 'testuser';
      const mockToken = 'generated_jwt_token';
      
      (jwt.sign as jest.Mock).mockReturnValue(mockToken);

      const token = authService.generateToken(userId, username);

      expect(token).toBe(mockToken);
      expect(jwt.sign).toHaveBeenCalledWith(
        { userId, username },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );
    });

    it('should validate a valid JWT token', () => {
      const mockToken = 'valid_jwt_token';
      const mockDecoded = {
        userId: 'user-123',
        username: 'testuser',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
      };
      
      (jwt.verify as jest.Mock).mockReturnValue(mockDecoded);

      const result = authService.validateToken(mockToken);

      expect(result).toEqual({
        valid: true,
        decoded: mockDecoded,
      });
      expect(jwt.verify).toHaveBeenCalledWith(mockToken, process.env.JWT_SECRET);
    });

    it('should reject an invalid JWT token', () => {
      const mockToken = 'invalid_jwt_token';
      
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const result = authService.validateToken(mockToken);

      expect(result).toEqual({
        valid: false,
        error: 'Invalid token',
      });
    });

    it('should reject an expired JWT token', () => {
      const mockToken = 'expired_jwt_token';
      
      (jwt.verify as jest.Mock).mockImplementation(() => {
        const error: any = new Error('Token expired');
        error.name = 'TokenExpiredError';
        throw error;
      });

      const result = authService.validateToken(mockToken);

      expect(result).toEqual({
        valid: false,
        error: 'Token expired',
      });
    });

    it('should refresh a valid token', async () => {
      const oldToken = 'old_jwt_token';
      const newToken = 'new_jwt_token';
      const mockDecoded = {
        userId: 'user-123',
        username: 'testuser',
      };
      
      (jwt.verify as jest.Mock).mockReturnValue(mockDecoded);
      (jwt.sign as jest.Mock).mockReturnValue(newToken);

      const result = await authService.refreshToken(oldToken);

      expect(result).toEqual({
        success: true,
        token: newToken,
      });
      expect(jwt.verify).toHaveBeenCalledWith(oldToken, process.env.JWT_SECRET);
      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: mockDecoded.userId, username: mockDecoded.username },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );
    });
  });

  describe('Password Management', () => {
    it('should change password with correct current password', async () => {
      const userId = 'user-123';
      const currentPassword = 'OldPassword123!';
      const newPassword = 'NewPassword456!';
      const mockUser = {
        id: userId,
        username: 'testuser',
        passwordHash: 'old_hash',
      };
      const newHash = 'new_hash';

      mockDataService.getUser.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue(newHash);
      mockDataService.updateUser.mockResolvedValue({
        ...mockUser,
        passwordHash: newHash,
      });

      const result = await authService.changePassword(
        userId,
        currentPassword,
        newPassword
      );

      expect(result).toEqual({
        success: true,
        message: 'Password changed successfully',
      });
      expect(bcrypt.compare).toHaveBeenCalledWith(currentPassword, mockUser.passwordHash);
      expect(bcrypt.hash).toHaveBeenCalledWith(newPassword, 10);
      expect(mockDataService.updateUser).toHaveBeenCalledWith(userId, {
        passwordHash: newHash,
      });
    });

    it('should reject password change with incorrect current password', async () => {
      const userId = 'user-123';
      const mockUser = {
        id: userId,
        username: 'testuser',
        passwordHash: 'old_hash',
      };

      mockDataService.getUser.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await authService.changePassword(
        userId,
        'WrongPassword',
        'NewPassword456!'
      );

      expect(result).toEqual({
        success: false,
        error: 'Current password is incorrect',
      });
      expect(mockDataService.updateUser).not.toHaveBeenCalled();
    });

    it('should validate password strength requirements', () => {
      const weakPasswords = [
        'short',           // Too short
        '12345678',        // No letters
        'abcdefgh',        // No numbers
        'password123',     // Too common
      ];

      weakPasswords.forEach(password => {
        const result = authService.validatePasswordStrength(password);
        expect(result.isValid).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors!.length).toBeGreaterThan(0);
      });

      const strongPassword = 'SecurePass123!@#';
      const result = authService.validatePasswordStrength(strongPassword);
      expect(result.isValid).toBe(true);
      expect(result.errors).toBeUndefined();
    });
  });

  describe('Security Features', () => {
    it('should track failed login attempts', async () => {
      const username = 'testuser';
      const mockUser = {
        id: 'user-123',
        username,
        passwordHash: 'hash',
      };

      mockDataService.getUserByUsername.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      // First failed attempt
      await authService.login(username, 'wrong1');
      expect(authService.getFailedAttempts(username)).toBe(1);

      // Second failed attempt
      await authService.login(username, 'wrong2');
      expect(authService.getFailedAttempts(username)).toBe(2);

      // Successful login should reset counter
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (jwt.sign as jest.Mock).mockReturnValue('token');
      await authService.login(username, 'correct');
      expect(authService.getFailedAttempts(username)).toBe(0);
    });

    it('should implement account lockout after max failed attempts', async () => {
      const username = 'testuser';
      const maxAttempts = 5;
      const mockUser = {
        id: 'user-123',
        username,
        passwordHash: 'hash',
      };

      mockDataService.getUserByUsername.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      // Simulate max failed attempts
      for (let i = 0; i < maxAttempts; i++) {
        await authService.login(username, `wrong${i}`);
      }

      // Next attempt should be locked out
      const result = await authService.login(username, 'correct');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Too many failed attempts');
    });

    it('should sanitize user input to prevent injection attacks', () => {
      const maliciousInputs = [
        '<script>alert("xss")</script>',
        'admin\' OR \'1\'=\'1',
        '../../../etc/passwd',
        'user\0name',
      ];

      maliciousInputs.forEach(input => {
        const sanitized = authService.sanitizeInput(input);
        expect(sanitized).not.toContain('<script>');
        expect(sanitized).not.toContain('\'');
        expect(sanitized).not.toContain('../');
        expect(sanitized).not.toContain('\0');
      });
    });

    it('should log security events', async () => {
      const logSpy = jest.spyOn(authService, 'logSecurityEvent');
      const username = 'testuser';
      
      // Failed login
      mockDataService.getUserByUsername.mockResolvedValue(null);
      await authService.login(username, 'password');
      
      expect(logSpy).toHaveBeenCalledWith({
        event: 'LOGIN_FAILED',
        username,
        timestamp: expect.any(Date),
        details: expect.any(Object),
      });

      // Successful registration
      mockDataService.getUserByUsername.mockResolvedValue(null);
      mockDataService.createUser.mockResolvedValue({
        id: 'new-user',
        username: 'newuser',
      });
      (bcrypt.hash as jest.Mock).mockResolvedValue('hash');
      (uuidv4 as jest.Mock).mockReturnValue('new-user');
      
      await authService.register('newuser', 'Password123!');
      
      expect(logSpy).toHaveBeenCalledWith({
        event: 'USER_REGISTERED',
        username: 'newuser',
        timestamp: expect.any(Date),
        details: expect.any(Object),
      });
    });
  });
});