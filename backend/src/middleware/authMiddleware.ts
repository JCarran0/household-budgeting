import { Request, Response, NextFunction } from 'express';
import { authService } from '../services';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        username: string;
      };
    }
  }
}

/**
 * Middleware to authenticate JWT tokens
 */
// Main auth middleware for protected routes
export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  authenticate(req, res, next);
};

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
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
    
    if (!validation.valid) {
      res.status(401).json({
        success: false,
        error: validation.error || 'Invalid token',
      });
      return;
    }

    // Attach user info to request
    req.user = {
      userId: validation.decoded.userId,
      username: validation.decoded.username,
    };

    // Log successful authentication
    authService.logSecurityEvent({
      event: 'AUTH_SUCCESS',
      userId: validation.decoded.userId,
      username: validation.decoded.username,
      timestamp: new Date(),
      details: {
        endpoint: req.path,
        method: req.method,
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
    
    if (validation.valid) {
      req.user = {
        userId: validation.decoded.userId,
        username: validation.decoded.username,
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
 * Rate limiting middleware for authentication endpoints
 */
const attemptCounts = new Map<string, { count: number; resetTime: Date }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export const rateLimitAuth = (req: Request, res: Response, next: NextFunction): void => {
  const identifier = req.ip || 'unknown';
  const now = new Date();
  
  const attempts = attemptCounts.get(identifier);
  
  if (attempts) {
    if (now > attempts.resetTime) {
      // Reset window
      attemptCounts.set(identifier, {
        count: 1,
        resetTime: new Date(now.getTime() + WINDOW_MS),
      });
    } else if (attempts.count >= MAX_ATTEMPTS) {
      res.status(429).json({
        success: false,
        error: 'Too many requests. Please try again later.',
      });
      return;
    } else {
      attempts.count++;
    }
  } else {
    attemptCounts.set(identifier, {
      count: 1,
      resetTime: new Date(now.getTime() + WINDOW_MS),
    });
  }
  
  next();
};

/**
 * Middleware to validate request body with Zod schema
 */
export const validateBody = (schema: any) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validated = schema.parse(req.body);
      req.body = validated;
      next();
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors || error.message,
      });
    }
  };
};