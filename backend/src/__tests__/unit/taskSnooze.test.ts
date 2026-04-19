/**
 * Unit tests for the snooze-date resolver.
 *
 * Dates/times are all "local" from the user's perspective; the resolver takes
 * an explicit tzOffsetMinutes (Date#getTimezoneOffset convention: positive
 * when local is behind UTC).
 */

import { resolveSnoozeDate, isSnoozeActive } from '../../shared/utils/taskSnooze';

/** US Eastern standard time (UTC-5 → offset +300). */
const EST = 300;
/** US Pacific standard time (UTC-8 → offset +480). */
const PST = 480;
/** UTC (zero offset). */
const UTC = 0;

/** Interpret an ISO string back into local-wall-clock parts given an offset. */
function localParts(iso: string, tzOffsetMinutes: number) {
  const d = new Date(new Date(iso).getTime() - tzOffsetMinutes * 60_000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    dayOfWeek: d.getUTCDay(),
  };
}

describe('resolveSnoozeDate', () => {
  describe('tomorrow', () => {
    it('shifts by one local day at 06:00', () => {
      // 2026-05-10 (Sun) 10:00 EST
      const now = new Date('2026-05-10T15:00:00.000Z');
      const iso = resolveSnoozeDate('tomorrow', now, EST);
      expect(localParts(iso, EST)).toMatchObject({
        year: 2026, month: 5, day: 11, hour: 6, minute: 0,
      });
    });

    it('handles crossing UTC-local day boundary', () => {
      // 23:30 EST (= next-day UTC) — "tomorrow" should still be EST-tomorrow
      const now = new Date('2026-05-11T03:30:00.000Z'); // 23:30 EST on 2026-05-10
      const iso = resolveSnoozeDate('tomorrow', now, EST);
      expect(localParts(iso, EST).day).toBe(11);
    });

    it('crosses month boundary correctly', () => {
      const now = new Date('2026-04-30T15:00:00.000Z'); // Apr 30 EST
      const iso = resolveSnoozeDate('tomorrow', now, EST);
      expect(localParts(iso, EST)).toMatchObject({ year: 2026, month: 5, day: 1, hour: 6 });
    });

    it('crosses year boundary correctly', () => {
      const now = new Date('2026-12-31T15:00:00.000Z');
      const iso = resolveSnoozeDate('tomorrow', now, EST);
      expect(localParts(iso, EST)).toMatchObject({ year: 2027, month: 1, day: 1, hour: 6 });
    });
  });

  describe('next_week', () => {
    it('returns next Monday when today is Sunday', () => {
      // 2026-05-10 is Sunday
      const now = new Date('2026-05-10T17:00:00.000Z'); // 12:00 EST Sun
      const iso = resolveSnoozeDate('next_week', now, EST);
      const parts = localParts(iso, EST);
      expect(parts).toMatchObject({ year: 2026, month: 5, day: 11, hour: 6 });
      expect(parts.dayOfWeek).toBe(1); // Monday
    });

    it('returns +7 days when today is Monday', () => {
      const now = new Date('2026-05-11T17:00:00.000Z'); // Mon noon EST
      const iso = resolveSnoozeDate('next_week', now, EST);
      const parts = localParts(iso, EST);
      expect(parts.dayOfWeek).toBe(1);
      expect(parts.day).toBe(18);
    });

    it.each([
      ['Tuesday', '2026-05-12', 18],
      ['Wednesday', '2026-05-13', 18],
      ['Thursday', '2026-05-14', 18],
      ['Friday', '2026-05-15', 18],
      ['Saturday', '2026-05-16', 18],
    ])('returns next Monday for %s', (_, yyyyMMdd, expectedDay) => {
      const now = new Date(`${yyyyMMdd}T17:00:00.000Z`);
      const iso = resolveSnoozeDate('next_week', now, EST);
      const parts = localParts(iso, EST);
      expect(parts.dayOfWeek).toBe(1);
      expect(parts.day).toBe(expectedDay);
    });
  });

  describe('next_month', () => {
    it('returns 1st of next month', () => {
      const now = new Date('2026-05-15T17:00:00.000Z'); // May 15 EST
      const iso = resolveSnoozeDate('next_month', now, EST);
      expect(localParts(iso, EST)).toMatchObject({ year: 2026, month: 6, day: 1, hour: 6 });
    });

    it('returns 1st of month-after-next when today is the 1st (BRD: never same-day)', () => {
      const now = new Date('2026-05-01T17:00:00.000Z'); // May 1 EST
      const iso = resolveSnoozeDate('next_month', now, EST);
      expect(localParts(iso, EST)).toMatchObject({ year: 2026, month: 7, day: 1, hour: 6 });
    });

    it('crosses year boundary', () => {
      const now = new Date('2026-12-15T17:00:00.000Z');
      const iso = resolveSnoozeDate('next_month', now, EST);
      expect(localParts(iso, EST)).toMatchObject({ year: 2027, month: 1, day: 1 });
    });

    it('handles end-of-January → February', () => {
      const now = new Date('2026-01-31T17:00:00.000Z');
      const iso = resolveSnoozeDate('next_month', now, EST);
      expect(localParts(iso, EST)).toMatchObject({ year: 2026, month: 2, day: 1 });
    });
  });

  describe('custom', () => {
    it('returns customDate at 06:00 local', () => {
      const now = new Date('2026-05-15T00:00:00.000Z');
      const iso = resolveSnoozeDate('custom', now, EST, '2026-07-04');
      expect(localParts(iso, EST)).toMatchObject({ year: 2026, month: 7, day: 4, hour: 6 });
    });

    it('accepts leap-year Feb 29', () => {
      const now = new Date('2028-01-01T00:00:00.000Z');
      const iso = resolveSnoozeDate('custom', now, EST, '2028-02-29');
      expect(localParts(iso, EST)).toMatchObject({ year: 2028, month: 2, day: 29 });
    });

    it('throws when customDate is missing', () => {
      expect(() => resolveSnoozeDate('custom', new Date(), EST)).toThrow();
    });

    it('throws on malformed customDate', () => {
      expect(() => resolveSnoozeDate('custom', new Date(), EST, '04/19/2026')).toThrow();
    });
  });

  describe('timezones', () => {
    it('respects PST offset for tomorrow', () => {
      const now = new Date('2026-05-10T20:00:00.000Z'); // 13:00 PST Sun
      const iso = resolveSnoozeDate('tomorrow', now, PST);
      expect(localParts(iso, PST)).toMatchObject({ day: 11, hour: 6 });
    });

    it('respects UTC for tomorrow', () => {
      const now = new Date('2026-05-10T10:00:00.000Z');
      const iso = resolveSnoozeDate('tomorrow', now, UTC);
      expect(localParts(iso, UTC)).toMatchObject({ day: 11, hour: 6 });
    });
  });
});

describe('isSnoozeActive', () => {
  it('returns false for null', () => {
    expect(isSnoozeActive(null, new Date())).toBe(false);
  });
  it('returns true for future', () => {
    const now = new Date('2026-05-10T10:00:00.000Z');
    const future = new Date('2026-05-11T10:00:00.000Z').toISOString();
    expect(isSnoozeActive(future, now)).toBe(true);
  });
  it('returns false for past', () => {
    const now = new Date('2026-05-10T10:00:00.000Z');
    const past = new Date('2026-05-09T10:00:00.000Z').toISOString();
    expect(isSnoozeActive(past, now)).toBe(false);
  });
});
