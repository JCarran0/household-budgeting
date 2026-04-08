import { Request, Response, NextFunction } from 'express';
import {
  AppError,
  ValidationError,
  NotFoundError,
  AuthorizationError,
  ForbiddenError,
  ConflictError,
  ExternalServiceError,
  RateLimitError,
} from '../../errors';
import { errorHandler } from '../../middleware/errorHandler';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

const mockReq = {} as Request;
const mockNext = jest.fn() as unknown as NextFunction;

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

describe('AppError', () => {
  it('sets message, statusCode, and optional code', () => {
    const err = new AppError('something broke', 503, 'SERVICE_UNAVAILABLE');
    expect(err.message).toBe('something broke');
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('works without a code', () => {
    const err = new AppError('no code', 500);
    expect(err.code).toBeUndefined();
  });

  it('is an instance of Error', () => {
    expect(new AppError('x', 500)).toBeInstanceOf(Error);
  });

  it('sets name to the constructor name', () => {
    expect(new AppError('x', 500).name).toBe('AppError');
  });
});

describe('ValidationError', () => {
  it('has statusCode 400', () => {
    expect(new ValidationError('bad input').statusCode).toBe(400);
  });

  it('has code VALIDATION_ERROR', () => {
    expect(new ValidationError('bad input').code).toBe('VALIDATION_ERROR');
  });

  it('is an instance of AppError and Error', () => {
    const err = new ValidationError('bad');
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
  });

  it('preserves the message', () => {
    expect(new ValidationError('field required').message).toBe('field required');
  });
});

describe('NotFoundError', () => {
  it('has statusCode 404', () => {
    expect(new NotFoundError('not found').statusCode).toBe(404);
  });

  it('has code NOT_FOUND', () => {
    expect(new NotFoundError('not found').code).toBe('NOT_FOUND');
  });

  it('is an instance of AppError', () => {
    expect(new NotFoundError('x')).toBeInstanceOf(AppError);
  });
});

describe('AuthorizationError', () => {
  it('has statusCode 401', () => {
    expect(new AuthorizationError().statusCode).toBe(401);
  });

  it('has code UNAUTHORIZED', () => {
    expect(new AuthorizationError().code).toBe('UNAUTHORIZED');
  });

  it('uses default message when none provided', () => {
    expect(new AuthorizationError().message).toBe('User not authenticated');
  });

  it('accepts a custom message', () => {
    expect(new AuthorizationError('token expired').message).toBe('token expired');
  });
});

describe('ForbiddenError', () => {
  it('has statusCode 403', () => {
    expect(new ForbiddenError().statusCode).toBe(403);
  });

  it('has code FORBIDDEN', () => {
    expect(new ForbiddenError().code).toBe('FORBIDDEN');
  });

  it('uses default message when none provided', () => {
    expect(new ForbiddenError().message).toBe('Access denied');
  });
});

describe('ConflictError', () => {
  it('has statusCode 409', () => {
    expect(new ConflictError('already exists').statusCode).toBe(409);
  });

  it('has code CONFLICT', () => {
    expect(new ConflictError('already exists').code).toBe('CONFLICT');
  });
});

describe('ExternalServiceError', () => {
  it('has statusCode 502', () => {
    expect(new ExternalServiceError('upstream down').statusCode).toBe(502);
  });

  it('has code EXTERNAL_SERVICE_ERROR', () => {
    expect(new ExternalServiceError('upstream down').code).toBe('EXTERNAL_SERVICE_ERROR');
  });
});

describe('RateLimitError', () => {
  it('has statusCode 429', () => {
    expect(new RateLimitError().statusCode).toBe(429);
  });

  it('has code RATE_LIMIT', () => {
    expect(new RateLimitError().code).toBe('RATE_LIMIT');
  });

  it('uses default message when none provided', () => {
    expect(new RateLimitError().message).toBe('Too many requests');
  });
});

// ---------------------------------------------------------------------------
// errorHandler middleware
// ---------------------------------------------------------------------------

describe('errorHandler middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('responds with the AppError statusCode and message', () => {
    const res = createMockRes();
    errorHandler(new AppError('custom error', 418, 'TEAPOT'), mockReq, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(418);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.error).toBe('custom error');
    expect(body.code).toBe('TEAPOT');
  });

  it('responds 400 for ValidationError', () => {
    const res = createMockRes();
    errorHandler(new ValidationError('invalid field'), mockReq, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.error).toBe('invalid field');
  });

  it('responds 404 for NotFoundError', () => {
    const res = createMockRes();
    errorHandler(new NotFoundError('resource missing'), mockReq, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('responds 401 for AuthorizationError', () => {
    const res = createMockRes();
    errorHandler(new AuthorizationError(), mockReq, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('omits code field when AppError has no code', () => {
    const res = createMockRes();
    errorHandler(new AppError('oops', 500), mockReq, res, mockNext);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.code).toBeUndefined();
  });

  it('responds 400 for a ZodError-shaped error', () => {
    const res = createMockRes();
    const zodLike = new Error('zod message');
    zodLike.name = 'ZodError';
    errorHandler(zodLike, mockReq, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('responds 500 for unknown errors in test (non-development) env', () => {
    const res = createMockRes();
    // NODE_ENV=test in the test suite, which is treated as non-development
    errorHandler(new Error('secret internal detail'), mockReq, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.success).toBe(false);
    // In non-development, message should be generic
    expect(body.error).toBe('Internal server error');
  });

  it('always includes success: false and error in the response body', () => {
    const errors = [
      new ValidationError('v'),
      new NotFoundError('n'),
      new AuthorizationError(),
      new ForbiddenError(),
      new ConflictError('c'),
    ];
    for (const err of errors) {
      const res = createMockRes();
      errorHandler(err, mockReq, res, mockNext);
      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body).toHaveProperty('success', false);
      expect(body).toHaveProperty('error');
    }
  });
});
