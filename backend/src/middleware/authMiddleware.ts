import { Request, Response, NextFunction } from 'express';
import { authService, dataService } from '../services';
import { z, ZodError } from 'zod';
import { rateLimitAuth as rateLimitAuthImpl, resetPersistentRateLimitStore } from './rateLimit';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        username: string;
        familyId: string;
      };
    }
  }
}

// Cache for family membership verification (userId -> { familyId, cachedAt })
// Prevents removed users from accessing family data with stale JWT tokens.
// TTL: 60 seconds — acceptable propagation delay for a 2-user app.
const membershipCache = new Map<string, { familyId: string; cachedAt: Date }>();
const MEMBERSHIP_CACHE_TTL = 60 * 1000; // 60 seconds

/**
 * Verify the user's current familyId in storage matches the JWT claim.
 * Returns true if the membership is valid, false if the user has been removed.
 * Cached for 60 seconds to avoid a DB read on every request.
 */
async function verifyFamilyMembership(userId: string, claimedFamilyId: string): Promise<boolean> {
  // Skip verification in test environment unless explicitly testing this
  if (process.env.NODE_ENV === 'test' && !process.env.TEST_MEMBERSHIP_VERIFICATION) {
    return true;
  }

  const cached = membershipCache.get(userId);
  const now = new Date();

  if (cached && (now.getTime() - cached.cachedAt.getTime()) < MEMBERSHIP_CACHE_TTL) {
    return cached.familyId === claimedFamilyId;
  }

  // Cache miss or expired — check storage
  const user = await dataService.getUser(userId);
  if (!user) {
    membershipCache.delete(userId);
    return false;
  }

  membershipCache.set(userId, {
    familyId: user.familyId,
    cachedAt: now,
  });

  return user.familyId === claimedFamilyId;
}

/**
 * Middleware to authenticate JWT tokens
 */
// Main auth middleware for protected routes
export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  void authenticate(req, res, next);
};

export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({
        success: false,
        error: 'No authorization header provided',
      });
      return;
    }

    // Check for Bearer token format
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      res.status(401).json({
        success: false,
        error: 'Invalid authorization header format. Use: Bearer <token>',
      });
      return;
    }

    const token = parts[1];

    // Validate token
    const validation = authService.validateToken(token);

    if (!validation.valid || !validation.decoded) {
      res.status(401).json({
        success: false,
        error: validation.error || 'Invalid token',
      });
      return;
    }

    // Require familyId in token (forces re-login for pre-migration tokens)
    if (!validation.decoded.familyId) {
      res.status(401).json({
        success: false,
        error: 'Token missing familyId. Please log in again.',
      });
      return;
    }

    // Verify the user's familyId hasn't changed (e.g., member was removed)
    const membershipValid = await verifyFamilyMembership(
      validation.decoded.userId,
      validation.decoded.familyId,
    );
    if (!membershipValid) {
      res.status(401).json({
        success: false,
        error: 'Family membership changed. Please log in again.',
      });
      return;
    }

    // Attach user info to request
    req.user = {
      userId: validation.decoded.userId,
      username: validation.decoded.username,
      familyId: validation.decoded.familyId,
    };

    // Log successful authentication
    authService.logSecurityEvent({
      event: 'AUTH_SUCCESS',
      userId: validation.decoded.userId,
      username: validation.decoded.username,
      timestamp: new Date(),
      details: {
        userId: validation.decoded.userId,
      },
    });

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed',
    });
  }
};

/**
 * Middleware to optionally authenticate JWT tokens
 * Continues even if no token is provided
 */
export const optionalAuthenticate = (req: Request, _res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      next();
      return;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      next();
      return;
    }

    const token = parts[1];
    const validation = authService.validateToken(token);
    
    if (validation.valid && validation.decoded && validation.decoded.familyId) {
      req.user = {
        userId: validation.decoded.userId,
        username: validation.decoded.username,
        familyId: validation.decoded.familyId,
      };
    }

    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

/**
 * Middleware to check if user is authenticated
 * Returns user info if authenticated
 */
export const checkAuth = (req: Request, res: Response): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  res.json({
    success: true,
    user: req.user,
  });
};

/**
 * Rate limiting middleware for authentication endpoints.
 * Re-exported from `./rateLimit` so the auth surface uses the persistent
 * (PM2-restart-safe) store. Kept under this name so existing route files
 * (`authRoutes.ts`, `feedback.ts`) don't have to change their imports.
 */
export const rateLimitAuth = rateLimitAuthImpl;

/**
 * Reset rate limiting - FOR TESTING ONLY
 */
export const resetRateLimiting = (): void => {
  if (process.env.NODE_ENV === 'test') {
    resetPersistentRateLimitStore();
  }
};

/**
 * Reset membership cache - FOR TESTING ONLY
 */
export const resetMembershipCache = (): void => {
  if (process.env.NODE_ENV === 'test') {
    membershipCache.clear();
  }
};

/**
 * Middleware to validate request body with Zod schema
 */
export const validateBody = <T>(schema: z.ZodType<T>) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validated = schema.parse(req.body);
      req.body = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: JSON.stringify(error.format()),
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  };
};