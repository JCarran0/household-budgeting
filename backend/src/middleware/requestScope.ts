/**
 * Per-request async scope (TD-011 part 1b).
 *
 * Opens an AsyncLocalStorage context for each HTTP request with a fresh
 * `repoCache` Map. `UnifiedDataService.getData` consults the map to memoize
 * reads within a single request, so the common "read full collection, modify,
 * save" pattern — repeated across 10+ handlers per chatbot tool loop — only
 * pays one deserialization cost per collection per request.
 *
 * The scope is request-local only. Cross-request data sharing is impossible
 * because each request opens its own `AsyncLocalStorage.run(...)`. Background
 * jobs running outside any HTTP request see `getRequestScope() === undefined`
 * and fall through to the underlying storage read.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request, Response, NextFunction } from 'express';

export interface RequestScope {
  /** Per-request memo for data-layer reads, keyed by storage key. */
  repoCache: Map<string, unknown>;
}

const als = new AsyncLocalStorage<RequestScope>();

export function requestScopeMiddleware(
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  als.run({ repoCache: new Map() }, () => next());
}

export function getRequestScope(): RequestScope | undefined {
  return als.getStore();
}

/** Test-only: run `fn` inside a fresh scope without the Express middleware. */
export function withRequestScope<R>(fn: () => R | Promise<R>): Promise<R> {
  return new Promise<R>((resolve, reject) => {
    als.run({ repoCache: new Map() }, () => {
      Promise.resolve()
        .then(fn)
        .then(resolve, reject);
    });
  });
}
