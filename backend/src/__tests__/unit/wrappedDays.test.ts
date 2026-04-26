/**
 * Tests for shared/utils/wrappedDays.ts
 *
 * Covers: DST spring-forward, fall-back, far-East (Asia/Tokyo),
 * far-West (Pacific/Honolulu), midnight UTC crossing mid-window, and
 * scheduler window logic.
 */

import {
  localDateKey,
  isInNineToMidnightWindow,
  isInWeeklyExtendedWindow,
  isoWeekBoundaries,
  dayOfWeekLabel,
  isSchedulerWindow,
} from '../../shared/utils/wrappedDays';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a UTC Date from a human-readable local datetime in the given TZ.
 * Strategy: use a UTC timestamp adjusted by the known offset. For tests
 * we pass an explicit UTC ISO string so DST is deterministic. */
function utc(iso: string): Date {
  return new Date(iso);
}

// ---------------------------------------------------------------------------
// localDateKey
// ---------------------------------------------------------------------------

describe('localDateKey', () => {
  it('returns YYYY-MM-DD in America/New_York', () => {
    // 2026-04-25 01:00 UTC = 2026-04-24 21:00 ET (EDT, UTC-4)
    expect(localDateKey(utc('2026-04-25T01:00:00Z'), 'America/New_York')).toBe('2026-04-24');
  });

  it('returns YYYY-MM-DD in UTC', () => {
    expect(localDateKey(utc('2026-04-25T01:00:00Z'), 'UTC')).toBe('2026-04-25');
  });

  it('Asia/Tokyo — UTC+9, advances date across midnight', () => {
    // 2026-04-24 23:00 UTC = 2026-04-25 08:00 JST
    expect(localDateKey(utc('2026-04-24T23:00:00Z'), 'Asia/Tokyo')).toBe('2026-04-25');
  });

  it('Pacific/Honolulu — UTC-10, lags behind UTC', () => {
    // 2026-04-25 08:00 UTC = 2026-04-24 22:00 HST
    expect(localDateKey(utc('2026-04-25T08:00:00Z'), 'Pacific/Honolulu')).toBe('2026-04-24');
  });

  it('DST spring-forward 2026-03-08 — clocks skip 2 AM in New_York', () => {
    // 2026-03-08 06:59 UTC = 2026-03-08 01:59 EST (UTC-5)
    expect(localDateKey(utc('2026-03-08T06:59:00Z'), 'America/New_York')).toBe('2026-03-08');
    // 2026-03-08 07:01 UTC = 2026-03-08 03:01 EDT (UTC-4)  ← clocks jumped
    expect(localDateKey(utc('2026-03-08T07:01:00Z'), 'America/New_York')).toBe('2026-03-08');
  });

  it('DST fall-back 2026-11-01 — 2 AM repeats in New_York', () => {
    // 2026-11-01 05:59 UTC = 2026-11-01 01:59 EDT (UTC-4) — just before fall-back
    expect(localDateKey(utc('2026-11-01T05:59:00Z'), 'America/New_York')).toBe('2026-11-01');
    // 2026-11-01 06:01 UTC = 2026-11-01 01:01 EST (UTC-5) — just after
    expect(localDateKey(utc('2026-11-01T06:01:00Z'), 'America/New_York')).toBe('2026-11-01');
  });
});

// ---------------------------------------------------------------------------
// isInNineToMidnightWindow
// ---------------------------------------------------------------------------

describe('isInNineToMidnightWindow', () => {
  const TZ = 'America/New_York';

  it('returns false at 8:59 PM ET', () => {
    // EDT is UTC-4; 8:59 PM EDT = 00:59 UTC next day
    expect(isInNineToMidnightWindow(utc('2026-04-25T00:59:00Z'), TZ)).toBe(false);
  });

  it('returns true at exactly 9:00 PM ET', () => {
    // 9:00 PM EDT = 01:00 UTC
    expect(isInNineToMidnightWindow(utc('2026-04-25T01:00:00Z'), TZ)).toBe(true);
  });

  it('returns true at 11:59 PM ET', () => {
    // 11:59 PM EDT = 03:59 UTC
    expect(isInNineToMidnightWindow(utc('2026-04-25T03:59:00Z'), TZ)).toBe(true);
  });

  it('returns false at midnight ET (00:00)', () => {
    // Midnight EDT = 04:00 UTC
    expect(isInNineToMidnightWindow(utc('2026-04-25T04:00:00Z'), TZ)).toBe(false);
  });

  it('UTC midnight crossing — 9 PM Honolulu is 7 AM UTC next day', () => {
    // 9 PM HST (UTC-10) = 07:00 UTC  → true
    expect(isInNineToMidnightWindow(utc('2026-04-25T07:00:00Z'), 'Pacific/Honolulu')).toBe(true);
    // 8:59 PM HST = 06:59 UTC → false
    expect(isInNineToMidnightWindow(utc('2026-04-25T06:59:00Z'), 'Pacific/Honolulu')).toBe(false);
  });

  it('DST spring-forward does not shift the 9 PM check into a wrong day', () => {
    // 2026-03-08 (spring forward), 9 PM EDT = 01:00 UTC 2026-03-09
    expect(isInNineToMidnightWindow(utc('2026-03-09T01:00:00Z'), TZ)).toBe(true);
  });

  it('DST fall-back — the extra hour does not create a false negative', () => {
    // 2026-11-01 after clocks fall back; 9 PM EST (UTC-5) = 02:00 UTC
    expect(isInNineToMidnightWindow(utc('2026-11-02T02:00:00Z'), TZ)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isInWeeklyExtendedWindow
// ---------------------------------------------------------------------------

describe('isInWeeklyExtendedWindow', () => {
  const TZ = 'America/New_York';

  it('returns false on Saturday 9:30 PM', () => {
    // 2026-04-25 is a Saturday; 9:30 PM EDT = 01:30 UTC 2026-04-26
    expect(isInWeeklyExtendedWindow(utc('2026-04-26T01:30:00Z'), TZ)).toBe(false);
  });

  it('returns false on Sunday 8:59 PM ET', () => {
    // 2026-04-26 is a Sunday; 8:59 PM EDT = 00:59 UTC 2026-04-27
    expect(isInWeeklyExtendedWindow(utc('2026-04-27T00:59:00Z'), TZ)).toBe(false);
  });

  it('returns true on Sunday at 9:00 PM ET', () => {
    // 9:00 PM EDT = 01:00 UTC 2026-04-27
    expect(isInWeeklyExtendedWindow(utc('2026-04-27T01:00:00Z'), TZ)).toBe(true);
  });

  it('returns true on Sunday 11:59 PM ET', () => {
    expect(isInWeeklyExtendedWindow(utc('2026-04-27T03:59:00Z'), TZ)).toBe(true);
  });

  it('returns true on Monday 12:01 AM ET (extended window)', () => {
    // 12:01 AM EDT Monday = 04:01 UTC
    expect(isInWeeklyExtendedWindow(utc('2026-04-27T04:01:00Z'), TZ)).toBe(true);
  });

  it('returns true on Monday 11:59 PM ET (last moment of extended window)', () => {
    // Monday 11:59 PM EDT = Tuesday 03:59 UTC
    expect(isInWeeklyExtendedWindow(utc('2026-04-28T03:59:00Z'), TZ)).toBe(true);
  });

  it('returns false on Tuesday 12:00 AM ET (window closed)', () => {
    // Tuesday midnight EDT = 04:00 UTC
    expect(isInWeeklyExtendedWindow(utc('2026-04-28T04:00:00Z'), TZ)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isoWeekBoundaries
// ---------------------------------------------------------------------------

describe('isoWeekBoundaries', () => {
  const TZ = 'America/New_York';

  it('Wednesday returns the surrounding Mon–Sun', () => {
    // 2026-04-22 is a Wednesday
    const { start, end } = isoWeekBoundaries(utc('2026-04-22T12:00:00Z'), TZ);
    expect(start).toBe('2026-04-20'); // Monday
    expect(end).toBe('2026-04-26');   // Sunday
  });

  it('Monday returns Monday as start, Sunday +6 as end', () => {
    const { start, end } = isoWeekBoundaries(utc('2026-04-20T12:00:00Z'), TZ);
    expect(start).toBe('2026-04-20');
    expect(end).toBe('2026-04-26');
  });

  it('Sunday returns the preceding Monday as start', () => {
    const { start, end } = isoWeekBoundaries(utc('2026-04-26T12:00:00Z'), TZ);
    expect(start).toBe('2026-04-20');
    expect(end).toBe('2026-04-26');
  });

  it('Tokyo — UTC+9 near midnight does not bleed into wrong week', () => {
    // 2026-04-27 01:00 UTC = 2026-04-27 10:00 JST (Monday)
    const { start } = isoWeekBoundaries(utc('2026-04-27T01:00:00Z'), 'Asia/Tokyo');
    expect(start).toBe('2026-04-27'); // Monday
  });

  it('spans year boundary correctly (Dec 28 is in the week starting Dec 28)', () => {
    // 2026-12-28 is a Monday
    const { start, end } = isoWeekBoundaries(utc('2026-12-28T12:00:00Z'), 'UTC');
    expect(start).toBe('2026-12-28');
    expect(end).toBe('2027-01-03');
  });
});

// ---------------------------------------------------------------------------
// dayOfWeekLabel
// ---------------------------------------------------------------------------

describe('dayOfWeekLabel', () => {
  it('2026-04-20 is Monday', () => {
    expect(dayOfWeekLabel('2026-04-20', 'UTC')).toBe('Monday');
  });
  it('2026-04-26 is Sunday', () => {
    expect(dayOfWeekLabel('2026-04-26', 'UTC')).toBe('Sunday');
  });
  it('2026-04-25 is Saturday', () => {
    expect(dayOfWeekLabel('2026-04-25', 'UTC')).toBe('Saturday');
  });
  it('2026-01-01 is Thursday', () => {
    expect(dayOfWeekLabel('2026-01-01', 'UTC')).toBe('Thursday');
  });
});

// ---------------------------------------------------------------------------
// isSchedulerWindow
// ---------------------------------------------------------------------------

describe('isSchedulerWindow', () => {
  const TZ = 'America/New_York';

  it('returns true at 9:00 PM ET', () => {
    expect(isSchedulerWindow(utc('2026-04-25T01:00:00Z'), TZ)).toBe(true);
  });

  it('returns true at 9:14 PM ET', () => {
    expect(isSchedulerWindow(utc('2026-04-25T01:14:00Z'), TZ)).toBe(true);
  });

  it('returns false at 9:15 PM ET', () => {
    expect(isSchedulerWindow(utc('2026-04-25T01:15:00Z'), TZ)).toBe(false);
  });

  it('returns false at 8:59 PM ET', () => {
    expect(isSchedulerWindow(utc('2026-04-25T00:59:00Z'), TZ)).toBe(false);
  });

  it('returns false at 10:00 PM ET (outside window)', () => {
    expect(isSchedulerWindow(utc('2026-04-25T02:00:00Z'), TZ)).toBe(false);
  });
});
