/**
 * Rate-limit middleware factory (TD-005).
 *
 * Three named limiters:
 *   - `rateLimitGlobalApi` — per-IP, ~100 req/min, applied to the whole
 *     `/api` surface in `app.ts`. Catches scrapers and accidental client
 *     loops. Sized so a normal session stays well under the limit.
 *   - `rateLimitAuth` — per-IP, 10 req / 15 min, for login / register /
 *     password-reset endpoints (preserves the prior auth-rate-limit budget).
 *   - `rateLimitChatbot` — per-userId, 5 req / min, layered on top of the
 *     global limiter for chatbot routes (preserves SEC-016 budget).
 *
 * Identifier contract: `identifier` returns `null` when there is no usable
 * key (e.g. chatbot limiter on an unauthenticated request); the middleware
 * skips rate-limiting in that case and lets downstream auth handle it.
 */
import { Request, Response, NextFunction } from 'express';
import path from 'path';
import { PersistentRateLimitStore } from './persistentStore';

let storeSingleton: PersistentRateLimitStore | null = null;

function getStore(): PersistentRateLimitStore {
  if (storeSingleton) return storeSingleton;
  const dataDir = process.env.DATA_DIR || './data';
  const filePath = path.join(dataDir, 'rate_limits.json');
  storeSingleton = new PersistentRateLimitStore(filePath);
  return storeSingleton;
}

export interface RateLimitOptions {
  /** Bucket namespace — keeps `auth:1.2.3.4` from colliding with `api:1.2.3.4`. */
  scope: string;
  max: number;
  windowMs: number;
  /** Returns the rate-limit bucket key, or `null` to skip limiting. */
  identifier: (req: Request) => string | null;
  message?: string;
}

export function createRateLimiter(opts: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (process.env.NODE_ENV === 'test') {
      next();
      return;
    }
    const id = opts.identifier(req);
    if (!id) {
      next();
      return;
    }
    const result = getStore().hit(opts.scope, id, opts.max, opts.windowMs);
    if (!result.allowed) {
      res.setHeader('Retry-After', Math.ceil(result.retryAfterMs / 1000));
      res.status(429).json({
        success: false,
        error: opts.message ?? 'Too many requests. Please try again later.',
      });
      return;
    }
    next();
  };
}

// =============================================================================
// Pre-built limiters used across the codebase
// =============================================================================

const AUTH_MAX = 10;
const AUTH_WINDOW_MS = 15 * 60 * 1000;

export const rateLimitAuth = createRateLimiter({
  scope: 'auth',
  max: AUTH_MAX,
  windowMs: AUTH_WINDOW_MS,
  identifier: (req) => req.ip ?? 'unknown',
});

const CHATBOT_MAX = 5;
const CHATBOT_WINDOW_MS = 60_000;

export const rateLimitChatbot = createRateLimiter({
  scope: 'chatbot',
  max: CHATBOT_MAX,
  windowMs: CHATBOT_WINDOW_MS,
  identifier: (req) => req.user?.userId ?? null,
  message: 'Slow down! You can send up to 5 messages per minute.',
});

const API_MAX = 100;
const API_WINDOW_MS = 60_000;

export const rateLimitGlobalApi = createRateLimiter({
  scope: 'api',
  max: API_MAX,
  windowMs: API_WINDOW_MS,
  identifier: (req) => req.ip ?? 'unknown',
});

/** Test-only helper. */
export function resetPersistentRateLimitStore(): void {
  if (process.env.NODE_ENV !== 'test') return;
  storeSingleton?.reset();
}

/** For graceful shutdown — flush the in-memory state to disk. */
export async function flushPersistentRateLimitStore(): Promise<void> {
  await storeSingleton?.flushNow();
}

export { PersistentRateLimitStore } from './persistentStore';
