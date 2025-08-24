import { Router, Request, Response } from 'express';
import { AuthService } from '../services/authService';
import { JSONDataService } from '../services/dataService';
import { 
  authenticate, 
  rateLimitAuth, 
  validateBody 
} from '../middleware/authMiddleware';
import {
  registrationSchema,
  loginSchema,
  changePasswordSchema,
  tokenRefreshSchema,
} from '../validators/authValidators';

const router = Router();

// Initialize services
const dataService = new JSONDataService();
const authService = new AuthService(dataService);

/**
 * @route POST /api/v1/auth/register
 * @desc Register a new user
 * @access Public
 */
router.post(
  '/register',
  rateLimitAuth,
  validateBody(registrationSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { username, password } = req.body;
      
      const result = await authService.register(username, password);
      
      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        success: false,
        error: 'Registration failed',
      });
    }
  }
);

/**
 * @route POST /api/v1/auth/login
 * @desc Login user and return JWT token
 * @access Public
 */
router.post(
  '/login',
  rateLimitAuth,
  validateBody(loginSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { username, password } = req.body;
      
      const result = await authService.login(username, password);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(401).json(result);
      }
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        error: 'Login failed',
      });
    }
  }
);

/**
 * @route POST /api/v1/auth/refresh
 * @desc Refresh JWT token
 * @access Public (with valid token)
 */
router.post(
  '/refresh',
  validateBody(tokenRefreshSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { token } = req.body;
      
      const result = await authService.refreshToken(token);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(401).json(result);
      }
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(500).json({
        success: false,
        error: 'Token refresh failed',
      });
    }
  }
);

/**
 * @route POST /api/v1/auth/change-password
 * @desc Change user password
 * @access Private
 */
router.post(
  '/change-password',
  authenticate,
  validateBody(changePasswordSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Not authenticated',
        });
        return;
      }

      const { currentPassword, newPassword } = req.body;
      const { userId } = req.user;
      
      const result = await authService.changePassword(
        userId,
        currentPassword,
        newPassword
      );
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({
        success: false,
        error: 'Password change failed',
      });
    }
  }
);

/**
 * @route GET /api/v1/auth/me
 * @desc Get current user info
 * @access Private
 */
router.get(
  '/me',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Not authenticated',
        });
        return;
      }

      const user = await dataService.getUser(req.user.userId);
      
      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found',
        });
        return;
      }

      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin,
        },
      });
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get user info',
      });
    }
  }
);

/**
 * @route POST /api/v1/auth/logout
 * @desc Logout user (client-side token removal)
 * @access Private
 */
router.post(
  '/logout',
  authenticate,
  (req: Request, res: Response): void => {
    // Log the logout event
    if (req.user) {
      authService.logSecurityEvent({
        event: 'LOGOUT',
        userId: req.user.userId,
        username: req.user.username,
        timestamp: new Date(),
        details: {},
      });
    }

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  }
);

/**
 * @route GET /api/v1/auth/verify
 * @desc Verify if token is valid
 * @access Public
 */
router.get(
  '/verify',
  (req: Request, res: Response): void => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: 'No token provided',
        });
        return;
      }

      const token = authHeader.substring(7);
      const validation = authService.validateToken(token);
      
      if (validation.valid) {
        res.json({
          success: true,
          valid: true,
          user: {
            userId: validation.decoded.userId,
            username: validation.decoded.username,
          },
        });
      } else {
        res.status(401).json({
          success: false,
          valid: false,
          error: validation.error,
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Token verification failed',
      });
    }
  }
);

export default router;