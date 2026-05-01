/**
 * File-backed rate-limit bucket store (TD-005).
 *
 * Why a file and not Redis:
 *   The deployment is a single PM2 process on a single EC2 instance. The only
 *   thing the in-memory `Map` couldn't survive was a process restart (PM2
 *   reload, deploy, crash). Persisting to a single JSON file kept under
 *   `DATA_DIR` is enough to close that gap without standing up Redis. If we
 *   ever scale horizontally this needs to move to a shared store.
 *
 * Why a debounced flush rather than write-through:
 *   At ~5 req/min/user the cost of a write-per-hit is trivial, but the
 *   `/api` general limiter fires on every request — write-through would mean
 *   one fsync per API call. Debouncing collapses bursts to one write per
 *   second; the worst-case data loss on crash is ≤1 second of counter
 *   increments, which is well within the rate-limit window's tolerance.
 *
 * Storage location:
 *   `DATA_DIR/rate_limits.json`. Local to the process (NOT in S3) — rate-limit
 *   state is per-instance, not per-family, so it does not belong in the
 *   replicated user-data store. Production runs filesystem-on-EBS for this
 *   even though the user data lives in S3.
 */
import fs from 'fs';
import path from 'path';
import { childLogger } from '../../utils/logger';

const log = childLogger('rateLimit');

interface RateLimitEntry {
  count: number;
  resetAt: number; // epoch ms
}

interface RateLimitFile {
  buckets: Record<string, RateLimitEntry>;
}

export interface RateLimitHitResult {
  allowed: boolean;
  /** Milliseconds until the current window resets. Always populated. */
  retryAfterMs: number;
  /** Current count after this hit (for observability/tests). */
  count: number;
}

export class PersistentRateLimitStore {
  private buckets = new Map<string, RateLimitEntry>();
  private dirty = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly filePath: string;
  /** Hard ceiling on bucket cardinality so a bot spraying random IPs cannot
   *  blow up memory or the on-disk file. The oldest expired buckets are
   *  evicted first; if all are still active we evict the soonest-to-reset. */
  private readonly maxBuckets = 50_000;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.loadSync();
  }

  private loadSync(): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const data = JSON.parse(raw) as RateLimitFile;
      const now = Date.now();
      for (const [key, entry] of Object.entries(data.buckets ?? {})) {
        if (entry && typeof entry.count === 'number' && typeof entry.resetAt === 'number') {
          if (entry.resetAt > now) {
            this.buckets.set(key, entry);
          }
        }
      }
    } catch (err) {
      // A corrupt file should never crash the server — start fresh.
      log.warn({ err }, 'failed to load persistent state, starting fresh');
    }
  }

  hit(scope: string, identifier: string, max: number, windowMs: number): RateLimitHitResult {
    const key = `${scope}:${identifier}`;
    const now = Date.now();
    let entry = this.buckets.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
    }
    entry.count++;
    this.buckets.set(key, entry);
    this.evictIfNeeded(now);
    this.scheduleFlush();

    if (entry.count > max) {
      return {
        allowed: false,
        retryAfterMs: Math.max(0, entry.resetAt - now),
        count: entry.count,
      };
    }
    return {
      allowed: true,
      retryAfterMs: Math.max(0, entry.resetAt - now),
      count: entry.count,
    };
  }

  private evictIfNeeded(now: number): void {
    if (this.buckets.size <= this.maxBuckets) return;
    // Sort by resetAt ascending — expired/soonest-expiring first.
    const sorted = [...this.buckets.entries()].sort(
      (a, b) => a[1].resetAt - b[1].resetAt,
    );
    const toRemove = this.buckets.size - this.maxBuckets;
    for (let i = 0; i < toRemove; i++) {
      this.buckets.delete(sorted[i][0]);
    }
    // Suppress unused warning when no expired entries existed.
    void now;
  }

  private scheduleFlush(): void {
    this.dirty = true;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      void this.flush();
    }, 1000);
    // Don't keep the event loop alive just for the flush timer.
    this.flushTimer.unref?.();
  }

  private async flush(): Promise<void> {
    this.flushTimer = null;
    if (!this.dirty) return;
    this.dirty = false;

    // GC expired entries before serializing.
    const now = Date.now();
    for (const [key, entry] of this.buckets) {
      if (entry.resetAt <= now) this.buckets.delete(key);
    }

    const data: RateLimitFile = { buckets: Object.fromEntries(this.buckets) };
    try {
      await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      await fs.promises.writeFile(tmp, JSON.stringify(data), 'utf-8');
      await fs.promises.rename(tmp, this.filePath);
    } catch (err) {
      log.warn({ err }, 'failed to flush state');
      // Mark dirty so we retry on the next hit.
      this.dirty = true;
    }
  }

  /** Force an immediate synchronous-ish flush. Intended for graceful shutdown. */
  async flushNow(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.dirty = true;
    await this.flush();
  }

  /** Test-only: clear all buckets. */
  reset(): void {
    this.buckets.clear();
    this.dirty = false;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
