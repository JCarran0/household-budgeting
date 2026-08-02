import { describe, expect, it } from 'vitest';
import {
  CONSENT_WARNING_DAYS,
  STALE_TRANSACTIONS_DAYS,
  daysSince,
  daysUntil,
  hasExpiringConsent,
  hasStaleTransactions,
} from './accountHealth';

const NOW = new Date('2026-08-02T12:00:00Z');

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}
function daysAhead(n: number): string {
  return new Date(NOW.getTime() + n * 86_400_000).toISOString();
}

describe('daysSince / daysUntil', () => {
  it('returns null for absent or unparseable input', () => {
    expect(daysSince(null, NOW)).toBeNull();
    expect(daysSince(undefined, NOW)).toBeNull();
    expect(daysSince('not-a-date', NOW)).toBeNull();
    expect(daysUntil(null, NOW)).toBeNull();
  });

  it('are inverses of each other', () => {
    expect(daysSince(daysAgo(10), NOW)).toBeCloseTo(10);
    expect(daysUntil(daysAhead(10), NOW)).toBeCloseTo(10);
    expect(daysUntil(daysAgo(10), NOW)).toBeCloseTo(-10);
  });
});

describe('hasStaleTransactions', () => {
  it('is false when Plaid pulled transactions recently', () => {
    expect(hasStaleTransactions({ lastTransactionUpdate: daysAgo(1) }, NOW)).toBe(false);
    expect(hasStaleTransactions({ lastTransactionUpdate: daysAgo(4) }, NOW)).toBe(false);
  });

  it('is true at and beyond the threshold', () => {
    expect(hasStaleTransactions({ lastTransactionUpdate: daysAgo(STALE_TRANSACTIONS_DAYS) }, NOW)).toBe(true);
    expect(hasStaleTransactions({ lastTransactionUpdate: daysAgo(19) }, NOW)).toBe(true);
  });

  it('stays silent when the field is absent rather than warning on every card', () => {
    // Accounts synced before this field existed carry no value. Warning on all
    // of them would train the user to ignore the warning.
    expect(hasStaleTransactions({ lastTransactionUpdate: null }, NOW)).toBe(false);
    expect(hasStaleTransactions({}, NOW)).toBe(false);
  });

  it('catches the real incident shape: 2026-07-15 stall observed on 2026-08-02', () => {
    // The Capital One Item reported healthy the whole time; only this field moved.
    expect(hasStaleTransactions({ lastTransactionUpdate: '2026-07-15T16:21:59.812Z' }, NOW)).toBe(true);
  });
});

describe('hasExpiringConsent', () => {
  it('is false when consent is comfortably in the future or absent', () => {
    expect(hasExpiringConsent({ consentExpirationTime: daysAhead(365) }, NOW)).toBe(false);
    expect(hasExpiringConsent({ consentExpirationTime: daysAhead(CONSENT_WARNING_DAYS + 1) }, NOW)).toBe(false);
    expect(hasExpiringConsent({ consentExpirationTime: null }, NOW)).toBe(false);
    expect(hasExpiringConsent({}, NOW)).toBe(false);
  });

  it('is true inside the warning window and after expiry', () => {
    expect(hasExpiringConsent({ consentExpirationTime: daysAhead(CONSENT_WARNING_DAYS) }, NOW)).toBe(true);
    expect(hasExpiringConsent({ consentExpirationTime: daysAhead(3) }, NOW)).toBe(true);
    expect(hasExpiringConsent({ consentExpirationTime: daysAgo(1) }, NOW)).toBe(true);
  });

  it('would not have fired for the 35-day-out consent seen during the incident', () => {
    // Capital One read 2026-09-06 on 2026-08-02 — correctly not yet a warning.
    expect(hasExpiringConsent({ consentExpirationTime: '2026-09-06T16:31:18Z' }, NOW)).toBe(false);
  });
});
