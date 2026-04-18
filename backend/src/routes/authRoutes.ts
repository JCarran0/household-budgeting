import { Router, Request, Response, NextFunction } from 'express';
import { authService, familyService } from '../services';
import {
  authenticate,
  rateLimitAuth,
  validateBody
} from '../middleware/authMiddleware';
import { AuthorizationError } from '../errors';
import {
  registrationSchema,
  loginSchema,
  changePasswordSchema,
  tokenRefreshSchema,
  resetRequestSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from '../validators/authValidators';

const router = Router();

/**
 * @route POST /api/v1/auth/register
 * @desc Register a new user
 * @access Public
 */
router.post(
  '/register',
  rateLimitAuth,
  validateBody(registrationSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { username, password, displayName, familyName, joinCode } = req.body;

      // If a join code was provided, validate it before registration
      let existingFamily: { familyId: string } | undefined;
      if (joinCode) {
        const validation = familyService.validateInvitation(joinCode);
        if (!validation.valid || !validation.familyId) {
          res.status(400).json({
            success: false,
            error: validation.error || 'Invalid invitation code',
          });
          return;
        }
        existingFamily = { familyId: validation.familyId };
      }

      const result = await authService.register(username, password, displayName, familyName, existingFamily);

      if (result.success) {
        // Mark the join code as consumed after successful registration
        if (joinCode) {
          familyService.markInvitationUsed(joinCode);
        }
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      next(error);
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
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { username, password } = req.body;

      const result = await authService.login(username, password);

      if (result.success) {
        res.json(result);
      } else {
        // Check if it's a rate limit error
        if (result.error && result.error.includes('Too many failed attempts')) {
          res.status(429).json(result);
        } else {
          res.status(401).json(result);
        }
      }
    } catch (error) {
      next(error);
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
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = req.body;

      const result = await authService.refreshToken(token);

      if (result.success) {
        res.json(result);
      } else {
        res.status(401).json(result);
      }
    } catch (error) {
      next(error);
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
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AuthorizationError();

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
      next(error);
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
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AuthorizationError();

      res.json({
        success: true,
        user: {
          id: req.user.userId,
          username: req.user.username,
          familyId: req.user.familyId,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route PUT /api/v1/auth/profile
 * @desc Update user profile (display name)
 * @access Private
 */
router.put(
  '/profile',
  authenticate,
  validateBody(updateProfileSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AuthorizationError();

      const { displayName, color } = req.body;
      const result = await authService.updateProfile(req.user.userId, displayName, color);

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      next(error);
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
 * @route POST /api/v1/auth/request-reset
 * @desc Request password reset token
 * @access Public
 */
router.post(
  '/request-reset',
  rateLimitAuth,
  validateBody(resetRequestSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { username } = req.body;

      const result = await authService.requestPasswordReset(username);

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route POST /api/v1/auth/reset-password
 * @desc Reset password with token
 * @access Public
 */
router.post(
  '/reset-password',
  rateLimitAuth,
  validateBody(resetPasswordSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { username, token, newPassword } = req.body;

      const result = await authService.resetPassword(username, token, newPassword);

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      next(error);
    }
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
      
      if (validation.valid && validation.decoded) {
        res.json({
          success: true,
          valid: true,
          user: {
            userId: validation.decoded.userId,
            username: validation.decoded.username,
            familyId: validation.decoded.familyId,
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