/**
 * Application error classes for consistent error handling.
 *
 * Each error carries an HTTP status code and user-safe message.
 * The global error middleware maps these to HTTP responses.
 */

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code?: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, 'NOT_FOUND');
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'User not authenticated') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code: string = 'CONFLICT') {
    super(message, 409, code);
  }
}

export class ExternalServiceError extends AppError {
  constructor(message: string) {
    super(message, 502, 'EXTERNAL_SERVICE_ERROR');
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT');
  }
}

/**
 * Attempted to set isRollover=true on a category whose ancestor or descendant
 * in the same subtree is already flagged. ROLLOVER-BUDGETS-BRD §3.1 / REQ-019.
 *
 * The frontend branches on code === 'ROLLOVER_SUBTREE_CONFLICT' and uses
 * details.conflictingCategoryIds to render a confirmation modal listing the
 * affected categories. Retrying the update with resolveRolloverConflicts=true
 * atomically unflags the peers.
 */
export class RolloverSubtreeConflictError extends AppError {
  constructor(
    conflictingCategoryIds: string[],
    relation: 'ancestor' | 'descendant' | 'mixed',
  ) {
    super(
      'Only one category per parent/child chain can use rollover',
      400,
      'ROLLOVER_SUBTREE_CONFLICT',
      { conflictingCategoryIds, relation },
    );
  }
}

/**
 * Attempted to set isRollover=true on a non-budgetable category (transfer).
 * ROLLOVER-BUDGETS-BRD REQ-002. Defensive — the Categories UI disables the
 * toggle for transfers, so this should only fire for direct API calls.
 */
export class RolloverNotBudgetableError extends AppError {
  constructor() {
    super(
      'Rollover cannot be set on non-budgetable categories (transfers)',
      400,
      'ROLLOVER_NOT_BUDGETABLE',
    );
  }
}
