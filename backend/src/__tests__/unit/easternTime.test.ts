/**
 * Unit tests for the ET date helpers in shared/utils/easternTime.
 *
 * These helpers underpin every user-visible date boundary in the app
 * (month buckets, "today" comparisons, sync windows). The tests cover the
 * UTC/ET seam most likely to bite:
 *   - late-evening ET on month-end where UTC has rolled to next month
 *   - early-morning ET after UTC midnight has rolled the date
 *   - DST transitions (spring-forward + fall-back)
 *   - leap-year Feb
 */

import {
  etDateString,
  etMonthString,
  firstDayOfMonth,
  lastDayOfMonth,
  parseMonthKey,
  etStartOfCurrentMonth,
  etEndOfCurrentMonth,
  EASTERN_TIME_ZONE,
} from '../../shared/utils/easternTime';

describe('EASTERN_TIME_ZONE', () => {
  it('is the IANA identifier for US Eastern', () => {
    expect(EASTERN_TIME_ZONE).toBe('America/New_York');
  });
});

describe('etDateString', () => {
  it('returns ET calendar day even when UTC has rolled to next day', () => {
    // 03:30Z on May 1 = 23:30 EDT on April 30. ET date must still be April 30.
    expect(etDateString(new Date('2026-05-01T03:30:00Z'))).toBe('2026-04-30');
  });

  it('returns ET calendar day even when UTC is still on previous day', () => {
    // 04:01Z on May 1 = 00:01 EDT on May 1. ET date is May 1.
    expect(etDateString(new Date('2026-05-01T04:01:00Z'))).toBe('2026-05-01');
  });

  it('handles DST spring-forward (2026-03-08, EST → EDT)', () => {
    // 06:30Z on 2026-03-08 = 01:30 EST (still before the spring-forward at 02:00).
    expect(etDateString(new Date('2026-03-08T06:30:00Z'))).toBe('2026-03-08');
    // 07:30Z = 03:30 EDT — same local calendar day.
    expect(etDateString(new Date('2026-03-08T07:30:00Z'))).toBe('2026-03-08');
  });

  it('handles DST fall-back (2026-11-01, EDT → EST)', () => {
    // 05:30Z = 01:30 EDT (before fall-back).
    expect(etDateString(new Date('2026-11-01T05:30:00Z'))).toBe('2026-11-01');
    // 06:30Z = 01:30 EST (after fall-back).
    expect(etDateString(new Date('2026-11-01T06:30:00Z'))).toBe('2026-11-01');
  });
});

describe('etMonthString', () => {
  it('returns YYYY-MM in ET', () => {
    expect(etMonthString(new Date('2026-04-15T12:00:00Z'))).toBe('2026-04');
  });

  it('does not advance to next month when UTC does but ET has not', () => {
    // 03:30Z on May 1 = 23:30 EDT on April 30. ET month is April.
    expect(etMonthString(new Date('2026-05-01T03:30:00Z'))).toBe('2026-04');
  });
});

describe('firstDayOfMonth', () => {
  it('pads single-digit months', () => {
    expect(firstDayOfMonth(2026, 0)).toBe('2026-01-01');
    expect(firstDayOfMonth(2026, 8)).toBe('2026-09-01');
    expect(firstDayOfMonth(2026, 11)).toBe('2026-12-01');
  });
});

describe('lastDayOfMonth', () => {
  it('returns 31 for January', () => {
    expect(lastDayOfMonth(2026, 0)).toBe('2026-01-31');
  });

  it('returns 30 for April', () => {
    expect(lastDayOfMonth(2026, 3)).toBe('2026-04-30');
  });

  it('returns 28 for non-leap February', () => {
    expect(lastDayOfMonth(2026, 1)).toBe('2026-02-28');
  });

  it('returns 29 for leap February (2028)', () => {
    expect(lastDayOfMonth(2028, 1)).toBe('2028-02-29');
  });

  it('returns 31 for December', () => {
    expect(lastDayOfMonth(2026, 11)).toBe('2026-12-31');
  });
});

describe('parseMonthKey', () => {
  it('splits a YYYY-MM string into year and zero-based monthIndex', () => {
    expect(parseMonthKey('2026-04')).toEqual({ year: 2026, monthIndex: 3 });
    expect(parseMonthKey('2026-01')).toEqual({ year: 2026, monthIndex: 0 });
    expect(parseMonthKey('2026-12')).toEqual({ year: 2026, monthIndex: 11 });
  });

  it('round-trips with firstDayOfMonth', () => {
    const key = '2026-04';
    const { year, monthIndex } = parseMonthKey(key);
    expect(firstDayOfMonth(year, monthIndex)).toBe('2026-04-01');
    expect(lastDayOfMonth(year, monthIndex)).toBe('2026-04-30');
  });
});

describe('etStartOfCurrentMonth / etEndOfCurrentMonth', () => {
  it('returns ET-month boundaries when UTC has rolled but ET has not', () => {
    // 02:30Z on May 1 = 22:30 EDT on April 30 — still in April for ET.
    const lateApril = new Date('2026-05-01T02:30:00Z');
    expect(etStartOfCurrentMonth(lateApril)).toBe('2026-04-01');
    expect(etEndOfCurrentMonth(lateApril)).toBe('2026-04-30');
  });

  it('returns next ET-month boundaries once ET rolls over', () => {
    // 04:30Z on May 1 = 00:30 EDT on May 1.
    const earlyMay = new Date('2026-05-01T04:30:00Z');
    expect(etStartOfCurrentMonth(earlyMay)).toBe('2026-05-01');
    expect(etEndOfCurrentMonth(earlyMay)).toBe('2026-05-31');
  });
});
