/**
 * Centralized structured logger (TD-017).
 *
 * - Pino. JSON in production (CloudWatch-friendly), pretty in development.
 * - Field-level redaction for sensitive payload paths so a careless `logger.info({ user })`
 *   never ships PII or secrets to logs. The redaction list is conservative; prefer
 *   adding a path here over hoping every call site remembers to omit it.
 * - In `test` mode the level is `silent` so `npm test` output stays clean. Tests that
 *   need to assert on log output can construct their own pino instance via the helper.
 *
 * Security context: TD-002 (raw reset tokens), TD-017 (accountName decryption leak).
 * The redaction list below is the centralized backstop that prevents that class of bug.
 */

import pino from 'pino';
import type { LoggerOptions, Logger } from 'pino';

// Read NODE_ENV directly rather than going through the config singleton — the
// logger must work in test paths where the config module is mocked with a
// partial shape (e.g. encryption.test.ts that only stubs config.auth).
type NodeEnv = 'development' | 'production' | 'test';
function detectNodeEnv(): NodeEnv {
  const raw = process.env.NODE_ENV;
  if (raw === 'production' || raw === 'test' || raw === 'development') return raw;
  return 'development';
}

/**
 * Paths whose values are replaced with `[Redacted]` before output.
 *
 * Pino redaction paths are JSONPath-ish: `*` matches any single key. We list both
 * top-level shapes (for `logger.info({ accessToken })`) and one-level-nested shapes
 * (for `logger.info({ user: { password } })` and `logger.info({ account })`). Adding
 * `*.field` covers the common "log an object" pattern without requiring callers to
 * destructure first.
 */
export const REDACT_PATHS = [
  // Auth / session
  'password',
  'passwordHash',
  'token',
  'refreshToken',
  'resetToken',
  'jwt',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.refreshToken',
  '*.resetToken',
  '*.jwt',

  // Plaid
  'accessToken',
  'plaidAccessToken',
  'publicToken',
  'linkToken',
  '*.accessToken',
  '*.plaidAccessToken',
  '*.publicToken',
  '*.linkToken',

  // Account identifiers (not just secrets — names + numbers are PII for a financial app).
  // Arrays of accounts are common (sync logs, decrypt-failure batches), so include
  // `*[*].field` paths in addition to the single-level `*.field` form.
  'accountName',
  'accountNumber',
  'routingNumber',
  '*.accountName',
  '*.accountNumber',
  '*.routingNumber',
  '*[*].accountName',
  '*[*].accountNumber',
  '*[*].plaidAccessToken',
  'officialName',
  '*.officialName',
  '*[*].officialName',

  // User PII
  'email',
  '*.email',

  // VAPID / push
  'privateKey',
  '*.privateKey',
] as const;

function buildOptions(nodeEnv: NodeEnv): LoggerOptions {
  const base: LoggerOptions = {
    level: nodeEnv === 'test' ? 'silent' : process.env.LOG_LEVEL || 'info',
    redact: {
      paths: [...REDACT_PATHS],
      censor: '[Redacted]',
    },
    base: {
      env: nodeEnv,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (nodeEnv === 'development') {
    return {
      ...base,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname,env',
        },
      },
    };
  }

  // Production: plain JSON to stdout. The PM2 -> CloudWatch agent picks it up
  // line-by-line; no transport here keeps it synchronous and cheap.
  return base;
}

export const logger: Logger = pino(buildOptions(detectNodeEnv()));

/**
 * Build a child logger with a fixed module/component context.
 *
 * Prefer this over passing a `module` field on every call. Child loggers cost
 * almost nothing and produce log lines that are trivially filterable in CloudWatch.
 *
 * @example
 *   const log = childLogger('plaidService');
 *   log.info({ itemId }, 'sync started');
 */
export function childLogger(module: string, bindings: Record<string, unknown> = {}): Logger {
  return logger.child({ module, ...bindings });
}
