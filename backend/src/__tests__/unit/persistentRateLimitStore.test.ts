/**
 * Tests for the file-backed rate-limit store (TD-005).
 *
 * The exit criterion the execution plan asks for is "rate limit state survives
 * PM2 restart" — exercised here by writing through one store instance,
 * constructing a second instance against the same file, and asserting the
 * second instance refuses the next over-limit hit without a fresh window.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PersistentRateLimitStore } from '../../middleware/rateLimit/persistentStore';

function tmpFile(): string {
  return path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'ratelimit-')),
    'rate_limits.json',
  );
}

async function waitForFlush(): Promise<void> {
  // The store debounces writes by 1s; give it enough time to land on disk.
  await new Promise((r) => setTimeout(r, 1100));
}

describe('PersistentRateLimitStore', () => {
  it('counts hits within the window and denies after max', () => {
    const store = new PersistentRateLimitStore(tmpFile());
    const max = 3;
    const window = 60_000;

    expect(store.hit('auth', '1.2.3.4', max, window).allowed).toBe(true);
    expect(store.hit('auth', '1.2.3.4', max, window).allowed).toBe(true);
    expect(store.hit('auth', '1.2.3.4', max, window).allowed).toBe(true);

    const denied = store.hit('auth', '1.2.3.4', max, window);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
  });

  it('isolates buckets by scope', () => {
    const store = new PersistentRateLimitStore(tmpFile());
    expect(store.hit('auth', 'X', 1, 60_000).allowed).toBe(true);
    // Same identifier, different scope — should not collide.
    expect(store.hit('api', 'X', 1, 60_000).allowed).toBe(true);
  });

  it('resets the window once the previous one expires', async () => {
    const store = new PersistentRateLimitStore(tmpFile());
    expect(store.hit('auth', 'Y', 1, 50).allowed).toBe(true);
    expect(store.hit('auth', 'Y', 1, 50).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 70));
    expect(store.hit('auth', 'Y', 1, 50).allowed).toBe(true);
  });

  it('persists state across instances (the PM2-restart contract)', async () => {
    const file = tmpFile();
    const a = new PersistentRateLimitStore(file);
    a.hit('auth', '9.9.9.9', 2, 60_000);
    a.hit('auth', '9.9.9.9', 2, 60_000);
    await a.flushNow();

    // Construct a fresh store from disk (simulates process restart).
    const b = new PersistentRateLimitStore(file);
    const next = b.hit('auth', '9.9.9.9', 2, 60_000);
    expect(next.allowed).toBe(false);
  });

  it('drops expired entries when reloading from disk', async () => {
    const file = tmpFile();
    const a = new PersistentRateLimitStore(file);
    a.hit('auth', 'expires-soon', 1, 30);
    await a.flushNow();
    await new Promise((r) => setTimeout(r, 40));

    const b = new PersistentRateLimitStore(file);
    // The entry was expired before reload; should be allowed in the new window.
    expect(b.hit('auth', 'expires-soon', 1, 60_000).allowed).toBe(true);
  });

  it('survives a corrupt persistence file by starting fresh', () => {
    const file = tmpFile();
    fs.writeFileSync(file, 'this is not json', 'utf-8');
    const store = new PersistentRateLimitStore(file);
    expect(store.hit('auth', 'X', 1, 60_000).allowed).toBe(true);
  });

  it('debounces writes — multiple hits collapse into one flush', async () => {
    const file = tmpFile();
    const store = new PersistentRateLimitStore(file);
    for (let i = 0; i < 10; i++) {
      store.hit('api', '5.5.5.5', 100, 60_000);
    }
    // No flush has happened yet.
    expect(fs.existsSync(file)).toBe(false);
    await waitForFlush();
    expect(fs.existsSync(file)).toBe(true);
    const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as {
      buckets: Record<string, { count: number }>;
    };
    expect(data.buckets['api:5.5.5.5'].count).toBe(10);
  });
});
