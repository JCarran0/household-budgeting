/**
 * SA-12 regression — account lockout must be case-insensitive.
 *
 * User lookup resolves case-insensitively (`dataService.getUserByUsername`),
 * but the lockout counter used to key off the raw submitted string. That let an
 * attacker reset the 5-attempt budget just by changing capitalization —
 * `jared`, `Jared`, `jArEd` each got a fresh allowance against one account,
 * making the primary brute-force control effectively unbounded.
 *
 * Two independent layers are pinned here, because either alone would close the
 * hole and we do not want a future edit to quietly remove both:
 *   1. `loginSchema` normalizes the username before it reaches the service.
 *   2. The lockout map itself keys case-insensitively.
 */

import { loginSchema } from '../../validators/authValidators';
import { AuthService } from '../../services/authService';
import type { DataService } from '../../services/dataService';

describe('login username normalization (SA-12)', () => {
  it('lowercases the username so lockout state cannot be split by casing', () => {
    const parsed = loginSchema.parse({ username: 'jArEd', password: 'irrelevant' });
    expect(parsed.username).toBe('jared');
  });

  it('normalizes every casing variant to the same key', () => {
    const variants = ['jared', 'Jared', 'JARED', 'jArEd'];
    const normalized = new Set(
      variants.map(u => loginSchema.parse({ username: u, password: 'x' }).username),
    );
    expect(normalized.size).toBe(1);
  });

  it('leaves the password untouched', () => {
    const parsed = loginSchema.parse({ username: 'Jared', password: 'MixedCasePass123!' });
    expect(parsed.password).toBe('MixedCasePass123!');
  });
});

describe('lockout counter keying (SA-12)', () => {
  /**
   * The service layer must hold the invariant on its own, independent of
   * whether the validator ran — internal callers and future routes may reach
   * these paths without passing through `loginSchema`.
   */
  function buildService(): AuthService {
    // The lockout map is in-memory and touched only by the counter methods, so
    // a stub DataService is enough to construct the service.
    return new AuthService({} as unknown as DataService);
  }

  // These are private; the counter is only observable via getFailedAttempts.
  function recordFailure(service: AuthService, username: string): void {
    (service as unknown as { recordFailedAttempt(u: string): void }).recordFailedAttempt(username);
  }

  it('accumulates attempts across casing variants into one counter', () => {
    const service = buildService();

    recordFailure(service, 'jared');
    recordFailure(service, 'Jared');
    recordFailure(service, 'jArEd');

    // Three attempts against one account, however they were capitalized.
    expect(service.getFailedAttempts('jared')).toBe(3);
    expect(service.getFailedAttempts('JARED')).toBe(3);
  });

  it('locks the account regardless of which casing crossed the threshold', () => {
    const service = buildService();
    const isLocked = (u: string) =>
      (service as unknown as { isAccountLocked(u: string): boolean }).isAccountLocked(u);

    // Default maxFailedAttempts is 5; spread them across casings.
    ['jared', 'Jared', 'JARED', 'jArEd', 'jareD'].forEach(u => recordFailure(service, u));

    expect(isLocked('jared')).toBe(true);
    expect(isLocked('JaReD')).toBe(true);
  });

  it('clears the counter for every casing on a successful login', () => {
    const service = buildService();
    const reset = (u: string) =>
      (service as unknown as { resetFailedAttempts(u: string): void }).resetFailedAttempts(u);

    recordFailure(service, 'Jared');
    recordFailure(service, 'JARED');
    expect(service.getFailedAttempts('jared')).toBe(2);

    reset('jared');
    expect(service.getFailedAttempts('JARED')).toBe(0);
  });
});
