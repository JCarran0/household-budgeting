import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors';
import { config } from '../config';

/**
 * Global error handler middleware.
 *
 * Maps AppError subclasses to appropriate HTTP responses.
 * Unknown errors become 500 Internal Server Error.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log all errors
  console.error(`[${err.name}]`, err.message);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      ...(err.code && { code: err.code }),
      ...(err.details && { details: err.details }),
    });
    return;
  }

  // Zod validation errors
  if (err.name === 'ZodError') {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
    });
    return;
  }

  // Unknown errors — don't leak details in production
  const isDevelopment = config.server.nodeEnv === 'development';
  res.status(500).json({
    success: false,
    error: isDevelopment ? err.message : 'Internal server error',
    ...(isDevelopment && { stack: err.stack }),
  });
}
