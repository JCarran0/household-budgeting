/**
 * Unit tests for pure streak math (shared/utils/leaderboardStreaks).
 */

import {
  computeStreaksForUser,
  type CreditEvent,
} from '../../shared/utils/leaderboardStreaks';

const TZ = 'America/New_York';

/** Build an ISO datetime at noon local for a given local YYYY-MM-DD. */
function noonEastern(date: string): string {
  // Noon local = 17:00Z in EST (UTC-5); 16:00Z in EDT (UTC-4). Use 17:00Z —
  // that safely lands on `date` local for most of the year and we don't
  // depend on DST spot-checks in helper-happy-path cases.
  return `${date}T17:00:00.000Z`;
}

function evt(date: string): CreditEvent {
  return { userId: 'u1', completedAt: noonEastern(date) };
}

function now(date: string): Date {
  // "Now" pinned to 15:00Z so that in America/New_York local date is `date`.
  return new Date(`${date}T15:00:00.000Z`);
}

describe('computeStreaksForUser', () => {
  it('returns zeros on empty events', () => {
    const s = computeStreaksForUser([], TZ, now('2026-04-19'));
    expect(s.currentStreak).toBe(0);
    expect(s.bestStreak).toBe(0);
    expect(s.bestStreakAchievedAt).toBeNull();
    expect(s.streakMilestones).toEqual({});
  });

  it('single event today → current 1, best 1', () => {
    const s = computeStreaksForUser([evt('2026-04-19')], TZ, now('2026-04-19'));
    expect(s.currentStreak).toBe(1);
    expect(s.bestStreak).toBe(1);
    expect(s.bestStreakAchievedAt).toBe(noonEastern('2026-04-19'));
  });

  it('single event yesterday, none today → current 1 (grace), best 1', () => {
    const s = computeStreaksForUser([evt('2026-04-18')], TZ, now('2026-04-19'));
    expect(s.currentStreak).toBe(1);
    expect(s.bestStreak).toBe(1);
  });

  it('single event 2 days ago → current 0, best 1', () => {
    const s = computeStreaksForUser([evt('2026-04-17')], TZ, now('2026-04-19'));
    expect(s.currentStreak).toBe(0);
    expect(s.bestStreak).toBe(1);
  });

  it('3 consecutive days ending today → current 3, best 3', () => {
    const s = computeStreaksForUser(
      [evt('2026-04-17'), evt('2026-04-18'), evt('2026-04-19')],
      TZ,
      now('2026-04-19')
    );
    expect(s.currentStreak).toBe(3);
    expect(s.bestStreak).toBe(3);
  });

  it('3 consecutive ending yesterday, none today → current 3 (grace), best 3, achievedAt = day 3 earliest', () => {
    const s = computeStreaksForUser(
      [evt('2026-04-16'), evt('2026-04-17'), evt('2026-04-18')],
      TZ,
      now('2026-04-19')
    );
    expect(s.currentStreak).toBe(3);
    expect(s.bestStreak).toBe(3);
    expect(s.bestStreakAchievedAt).toBe(noonEastern('2026-04-18'));
  });

  it('5 consecutive ending yesterday, gap, 2 consecutive ending today → current 2, best 5', () => {
    const events = [
      evt('2026-04-10'),
      evt('2026-04-11'),
      evt('2026-04-12'),
      evt('2026-04-13'),
      evt('2026-04-14'),
      // gap on 2026-04-15..2026-04-17
      evt('2026-04-18'),
      evt('2026-04-19'),
    ];
    const s = computeStreaksForUser(events, TZ, now('2026-04-19'));
    expect(s.currentStreak).toBe(2);
    expect(s.bestStreak).toBe(5);
  });

  it('7-day streak → streakMilestones[7] set', () => {
    const events: CreditEvent[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(Date.UTC(2026, 3, 13 + i));
      const dayKey = day.toISOString().slice(0, 10);
      events.push(evt(dayKey));
    }
    const s = computeStreaksForUser(events, TZ, now('2026-04-19'));
    expect(s.bestStreak).toBe(7);
    expect(s.streakMilestones[7]).toBe(noonEastern('2026-04-19'));
    expect(s.streakMilestones[30]).toBeUndefined();
  });

  it('30-day streak → both [7] and [30] set; [7].earnedAt < [30].earnedAt', () => {
    const events: CreditEvent[] = [];
    for (let i = 0; i < 30; i++) {
      const day = new Date(Date.UTC(2026, 2, 21 + i));
      events.push(evt(day.toISOString().slice(0, 10)));
    }
    const s = computeStreaksForUser(events, TZ, now('2026-04-19'));
    expect(s.bestStreak).toBe(30);
    expect(s.streakMilestones[7]).toBeDefined();
    expect(s.streakMilestones[30]).toBeDefined();
    expect(s.streakMilestones[7]! < s.streakMilestones[30]!).toBe(true);
    expect(s.streakMilestones[100]).toBeUndefined();
  });

  it('multiple events on the same day count as ONE streak day (no double advance)', () => {
    const events: CreditEvent[] = [
      { userId: 'u1', completedAt: '2026-04-19T14:00:00.000Z' },
      { userId: 'u1', completedAt: '2026-04-19T18:00:00.000Z' },
      { userId: 'u1', completedAt: '2026-04-19T22:00:00.000Z' },
    ];
    const s = computeStreaksForUser(events, TZ, now('2026-04-19'));
    expect(s.currentStreak).toBe(1);
    expect(s.bestStreak).toBe(1);
  });

  it('DST spring-forward week does not produce an off-by-one (America/New_York)', () => {
    // DST 2026-03-08 (2nd Sunday of March). Walk events across that day.
    const events: CreditEvent[] = [
      evt('2026-03-06'),
      evt('2026-03-07'),
      evt('2026-03-08'),
      evt('2026-03-09'),
      evt('2026-03-10'),
    ];
    const s = computeStreaksForUser(events, TZ, now('2026-03-10'));
    expect(s.currentStreak).toBe(5);
    expect(s.bestStreak).toBe(5);
  });

  it('timezone shift: event at 23:30 UTC counts as the previous day in Los Angeles', () => {
    const LA = 'America/Los_Angeles';
    // 2026-04-19T06:30Z is 2026-04-18 23:30 PDT, i.e. still the 18th locally.
    const events: CreditEvent[] = [
      { userId: 'u1', completedAt: '2026-04-19T06:30:00.000Z' },
    ];
    // "now" at 2026-04-19T15:00Z is 2026-04-19 08:00 PDT → today is the 19th.
    const s = computeStreaksForUser(events, LA, new Date('2026-04-19T15:00:00.000Z'));
    // The event is "yesterday" in LA → grace rule → current streak 1.
    expect(s.currentStreak).toBe(1);
    expect(s.bestStreak).toBe(1);
  });
});
