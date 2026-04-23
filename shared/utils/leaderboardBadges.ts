/**
 * Pure badge derivation for the task leaderboard.
 *
 * Given a stream of credit events for a single user + the streak milestones
 * produced by `computeStreaksForUser`, a pre-built `FamilyBadgeContext` that
 * covers cross-user/family-wide bookkeeping, and the current moment, return
 * the set of earned badges with their first-tip `earnedAt` timestamps.
 *
 * Badges are data-driven (BRD §4.2): a badge appears when its threshold is
 * currently satisfied, and disappears if the qualifying completions are
 * reverted. The `earnedAt` is the completedAt of the credit that first tipped
 * the threshold against the current dataset.
 *
 * `buildFamilyBadgeContext` is called ONCE by the backend before the per-user
 * compute loop — it pre-computes zero-inbox transitions, shared-completion
 * days, and monthly tallies so per-user derivation stays O(events).
 */

import type { BadgeId, EarnedBadge, Task } from '../types';
import type { CreditEvent } from './leaderboardStreaks';
import { localDayKey } from './leaderboardDays';

type StreakMilestones = Partial<Record<7 | 30 | 100, string>>;

/**
 * Family-wide / cross-user context consumed by the Clean Sweep, Partner in
 * Crime, and Comeback Kid derivations. Built once per leaderboard request.
 */
export interface FamilyBadgeContext {
  /**
   * Clean Sweep (§4.1): chronological timestamps at which the family open-
   * task count transitioned from >0 to 0, each paired with the userId of the
   * crediting completion that caused the transition. Order: ASC by
   * completedAt.
   */
  zeroInboxEvents: Array<{ userId: string; completedAt: string }>;
  /**
   * Partner in Crime (§4.1 / D28): per day (localDayKey), the set of userIds
   * with ≥1 credit on that day + the ISO timestamp at which the day first
   * became "shared" (the second user's first completion).
   */
  dayUserIndex: Map<string, { users: Set<string>; sharedAt: string | null }>;
  /**
   * Comeback Kid (§4.1 / D27): for each CLOSED calendar month (local TZ),
   * the cumulative credit count per user at end-of-day-15 (`mid`) and at
   * end-of-month (`end`). In-progress months are skipped.
   */
  monthlyTallies: Map<string, { mid: Map<string, number>; end: Map<string, number> }>;
}

// ============================================================================
// ISO week helpers (shared with v1.0 Consistency math)
// ============================================================================

/**
 * ISO-week key (YYYY-Www, Monday-start) in the given timezone.
 * Derived from the local YYYY-MM-DD key to stay DST-safe.
 */
function isoWeekKey(iso: string, timezone: string): string {
  const dayKey = localDayKey(iso, timezone);
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Day-of-week (0=Sun..6=Sat) in the given IANA timezone.
 * Derived from the local YYYY-MM-DD key for DST safety.
 */
function localDayOfWeek(iso: string, timezone: string): number {
  const [y, m, d] = localDayKey(iso, timezone).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Local hour (0-23) in the given IANA timezone.
 * Uses the en-GB 24-hour format to extract the hour without lossy parsing.
 */
function localHour(iso: string, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).formatToParts(new Date(iso));
  const hourPart = parts.find((p) => p.type === 'hour');
  const h = hourPart ? parseInt(hourPart.value, 10) : 0;
  // Intl may return "24" for midnight in some locales; normalize.
  return h === 24 ? 0 : h;
}

/** Local YYYY-MM (month key) in the given timezone. */
function localMonthKey(iso: string, timezone: string): string {
  return localDayKey(iso, timezone).slice(0, 7);
}

/** Local YYYY (year) in the given timezone. */
function localYear(iso: string, timezone: string): number {
  return parseInt(localDayKey(iso, timezone).slice(0, 4), 10);
}

/** Local month (1-12) in the given timezone. */
function localMonth(iso: string, timezone: string): number {
  return parseInt(localDayKey(iso, timezone).slice(5, 7), 10);
}

/** Local day-of-month (1-31) in the given timezone. */
function localDayOfMonth(iso: string, timezone: string): number {
  return parseInt(localDayKey(iso, timezone).slice(8, 10), 10);
}

/** ISO string for end-of-day (23:59:59.999 UTC approximation) of the given day key. */
function endOfDayUtc(dayKey: string): string {
  return `${dayKey}T23:59:59.999Z`;
}

/** Number of calendar days between two YYYY-MM-DD keys (b - a). */
function dayDiff(aKey: string, bKey: string): number {
  const [ay, am, ad] = aKey.split('-').map(Number);
  const [by, bm, bd] = bKey.split('-').map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Compare two dueDate strings against a completedAt string. Returns true if
 * completedAt >= dueDate (i.e., "on or after" — eligible for Clutch credit).
 *
 * Handles both ISO datetime (`2026-04-22T12:00:00.000Z`) and date-only
 * (`2026-04-22`) due-date formats. Date-only means end-of-day local, so
 * we compare against end-of-day in the viewer TZ.
 */
function completedOnOrAfterDue(
  completedAt: string,
  dueDate: string,
  timezone: string
): boolean {
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dueDate);
  if (!isDateOnly) {
    // ISO datetime — straightforward.
    return completedAt >= dueDate;
  }
  // Date-only: due means "end of that local day." Compare the local dayKey of
  // completedAt vs. the dueDate itself.
  const completedDayKey = localDayKey(completedAt, timezone);
  return completedDayKey >= dueDate;
}

// ============================================================================
// Family context builder (D23 / D24 / D27 / D28)
// ============================================================================

/**
 * Build the FamilyBadgeContext. Heavy but O((T + E) log (T + E)) where T is
 * task count and E is total event count across all family members.
 *
 * @param tasks         All family-scope tasks currently in the system.
 * @param perUserEvents Per-user CreditEvent streams (already split).
 * @param timezone      IANA timezone for local-day bucketing.
 * @param now           Current moment (for "in-progress month" detection).
 */
export function buildFamilyBadgeContext(
  tasks: Task[],
  perUserEvents: Map<string, CreditEvent[]>,
  timezone: string,
  now: Date
): FamilyBadgeContext {
  // ----- ZERO INBOX REPLAY (D24) -----
  //
  // Approach: replay the CURRENT task set's open-count timeline from the
  // perspective of the live data. Each task that is currently non-closed
  // contributes a permanent +1 from its createdAt onward. Each task that is
  // currently closed contributes +1 at createdAt and -1 at its latest
  // completedAt/cancelledAt. Snoozed-to-future tasks are treated as hidden
  // (not counted). Step through the events sorted ascending; whenever the
  // counter drops to 0, record the crediting event.

  const nowMs = now.getTime();
  const familyTasks = tasks.filter((t) => t.scope === 'family');

  interface Delta {
    t: number;       // ms timestamp
    delta: number;   // +1 or -1
    userId?: string; // credited user (for close events attributed to clean sweep)
    iso?: string;    // original ISO for recording
    closingTaskId?: string; // stable tie-break for simultaneous closes
  }

  const deltas: Delta[] = [];

  for (const task of familyTasks) {
    const isSnoozedFuture =
      task.snoozedUntil !== null && new Date(task.snoozedUntil).getTime() > nowMs;
    if (isSnoozedFuture) continue;

    // Only count tasks that have actually come into existence.
    const createdMs = new Date(task.createdAt).getTime();

    const currentlyClosed = task.status === 'done' || task.status === 'cancelled';

    if (!currentlyClosed) {
      // Open forever from createdAt onward.
      deltas.push({ t: createdMs, delta: +1, iso: task.createdAt });
      continue;
    }

    // Currently closed — find its close event.
    const closedAtIso = task.completedAt ?? task.cancelledAt;
    if (!closedAtIso) {
      // Defensive: status says closed but neither timestamp is set. Treat as
      // open forever to avoid false zero-inbox signals.
      deltas.push({ t: createdMs, delta: +1, iso: task.createdAt });
      continue;
    }
    const closedMs = new Date(closedAtIso).getTime();

    // Attribution: assigneeId if set, else the userId on the most recent
    // 'done' or 'cancelled' transition.
    let creditedUserId: string | null = task.assigneeId;
    if (creditedUserId === null) {
      const closingTransition = [...task.transitions]
        .reverse()
        .find((tr) => tr.toStatus === 'done' || tr.toStatus === 'cancelled');
      creditedUserId = closingTransition?.userId ?? null;
    }

    deltas.push({ t: createdMs, delta: +1, iso: task.createdAt });
    deltas.push({
      t: closedMs,
      delta: -1,
      ...(creditedUserId ? { userId: creditedUserId } : {}),
      iso: closedAtIso,
      closingTaskId: task.id,
    });
  }

  // Stable sort: by time ASC; at the same timestamp, creates (+1) before
  // closes (-1) so "created + immediately closed in the same instant" doesn't
  // falsely register as a zero-inbox transition.
  deltas.sort((a, b) => {
    if (a.t !== b.t) return a.t - b.t;
    if (a.delta !== b.delta) return b.delta - a.delta; // +1 before -1
    const aKey = a.closingTaskId ?? '';
    const bKey = b.closingTaskId ?? '';
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });

  const zeroInboxEvents: Array<{ userId: string; completedAt: string }> = [];
  let counter = 0;
  for (const d of deltas) {
    counter += d.delta;
    if (d.delta === -1 && counter === 0 && d.userId && d.iso) {
      // A close event that brought the open count to zero — clean sweep moment.
      // Only credit parent-task closes (we only pushed -1 for parent closes
      // above; subtask completions don't toggle open-count since the parent
      // remains).
      zeroInboxEvents.push({ userId: d.userId, completedAt: d.iso });
    }
  }

  // ----- DAY-USER INDEX (D28) -----
  //
  // For each local day, track which users have credits + the timestamp at
  // which the second user's first credit landed.

  const dayUserIndex = new Map<string, { users: Set<string>; sharedAt: string | null }>();

  // Merge all per-user events, sorted ASC by completedAt, so we can detect
  // the moment a day became shared.
  const allEvents: CreditEvent[] = [];
  for (const [, evts] of perUserEvents) {
    for (const e of evts) allEvents.push(e);
  }
  allEvents.sort((a, b) =>
    a.completedAt < b.completedAt ? -1 : a.completedAt > b.completedAt ? 1 : 0
  );

  for (const e of allEvents) {
    const dayKey = localDayKey(e.completedAt, timezone);
    let entry = dayUserIndex.get(dayKey);
    if (!entry) {
      entry = { users: new Set(), sharedAt: null };
      dayUserIndex.set(dayKey, entry);
    }
    const hadUser = entry.users.has(e.userId);
    entry.users.add(e.userId);
    // Second distinct user's first event — day becomes shared here.
    if (!hadUser && entry.users.size === 2 && entry.sharedAt === null) {
      entry.sharedAt = e.completedAt;
    }
  }

  // ----- MONTHLY TALLIES (D27) -----
  //
  // For each calendar month (local TZ) with ≥1 credit: cumulative per-user
  // count at end-of-day-15 and at end-of-month. Skip the current in-progress
  // month.

  const currentMonthKey = `${now.toLocaleString('en-CA', { timeZone: timezone, year: 'numeric' })}-${String(
    parseInt(
      now.toLocaleString('en-CA', { timeZone: timezone, month: '2-digit' }),
      10
    )
  ).padStart(2, '0')}`;

  interface MonthlyAcc {
    mid: Map<string, number>;
    end: Map<string, number>;
  }
  const monthlyTallies = new Map<string, MonthlyAcc>();

  for (const e of allEvents) {
    const monthKey = localMonthKey(e.completedAt, timezone);
    if (monthKey === currentMonthKey) continue; // skip in-progress
    const dom = localDayOfMonth(e.completedAt, timezone);
    let acc = monthlyTallies.get(monthKey);
    if (!acc) {
      acc = { mid: new Map(), end: new Map() };
      monthlyTallies.set(monthKey, acc);
    }
    // End-of-month always counts.
    acc.end.set(e.userId, (acc.end.get(e.userId) ?? 0) + 1);
    // Mid-month (end of day 15) counts only if dom <= 15.
    if (dom <= 15) {
      acc.mid.set(e.userId, (acc.mid.get(e.userId) ?? 0) + 1);
    }
  }

  return { zeroInboxEvents, dayUserIndex, monthlyTallies };
}

// ============================================================================
// Per-user derivation
// ============================================================================

/**
 * Compute earned badges for a single user.
 *
 * @param events           Credit events for ONE user (filter upstream).
 * @param streakMilestones From `computeStreaksForUser`.
 * @param timezone         IANA timezone for calendar bucketing.
 * @param familyContext    Pre-built cross-user / family-wide context.
 * @param userId           The user whose badges we're computing.
 * @param now              Current moment (used for Comeback Kid skip + tests).
 */
export function computeEarnedBadges(
  events: CreditEvent[],
  streakMilestones: StreakMilestones,
  timezone: string,
  familyContext: FamilyBadgeContext,
  userId: string,
  now: Date
): EarnedBadge[] {
  const sorted = [...events].sort((a, b) =>
    a.completedAt < b.completedAt ? -1 : a.completedAt > b.completedAt ? 1 : 0
  );

  const earned = new Map<BadgeId, string>();

  // ========================================================================
  // VOLUME (N-in-a-day)
  // ========================================================================
  if (sorted.length > 0) {
    const volumeThresholds: Array<{ id: BadgeId; n: number }> = [
      { id: 'volume_5', n: 5 },
      { id: 'volume_10', n: 10 },
      { id: 'volume_20', n: 20 },
    ];
    const dailyCounts = new Map<string, number>();
    for (const evt of sorted) {
      const day = localDayKey(evt.completedAt, timezone);
      const next = (dailyCounts.get(day) ?? 0) + 1;
      dailyCounts.set(day, next);
      for (const { id, n } of volumeThresholds) {
        if (next === n && !earned.has(id)) {
          earned.set(id, evt.completedAt);
        }
      }
    }
  }

  // ========================================================================
  // CONSISTENCY (distinct days in an ISO week)
  // ========================================================================
  if (sorted.length > 0) {
    const consistencyThresholds: Array<{ id: BadgeId; n: number }> = [
      { id: 'consistency_4', n: 4 },
      { id: 'consistency_5', n: 5 },
      { id: 'consistency_7', n: 7 },
    ];
    const weekDistinctDays = new Map<string, Set<string>>();
    for (const evt of sorted) {
      const day = localDayKey(evt.completedAt, timezone);
      const week = isoWeekKey(evt.completedAt, timezone);
      let set = weekDistinctDays.get(week);
      if (!set) {
        set = new Set();
        weekDistinctDays.set(week, set);
      }
      if (set.has(day)) continue;
      set.add(day);
      const distinct = set.size;
      for (const { id, n } of consistencyThresholds) {
        if (distinct === n && !earned.has(id)) {
          earned.set(id, evt.completedAt);
        }
      }
    }
  }

  // ========================================================================
  // STREAK (from caller-supplied milestones)
  // ========================================================================
  if (streakMilestones[7]) earned.set('streak_7', streakMilestones[7]!);
  if (streakMilestones[30]) earned.set('streak_30', streakMilestones[30]!);
  if (streakMilestones[100]) earned.set('streak_100', streakMilestones[100]!);

  // ========================================================================
  // LIFETIME (cumulative count)
  // ========================================================================
  {
    const lifetimeThresholds: Array<{ id: BadgeId; n: number }> = [
      { id: 'lifetime_10', n: 10 },
      { id: 'lifetime_50', n: 50 },
      { id: 'lifetime_100', n: 100 },
      { id: 'lifetime_500', n: 500 },
      { id: 'lifetime_1000', n: 1000 },
    ];
    for (let i = 0; i < sorted.length; i++) {
      const count = i + 1;
      for (const { id, n } of lifetimeThresholds) {
        if (count === n && !earned.has(id)) {
          earned.set(id, sorted[i].completedAt);
        }
      }
    }
  }

  // ========================================================================
  // WEEKDAY WARRIOR
  //   tier 1 (10): within any single Mon-Fri ISO week
  //   tier 2 (25) / tier 3 (50): across Mon-Fri days within any calendar MONTH
  // ========================================================================
  if (sorted.length > 0) {
    // Tier 1: per-ISO-week Mon-Fri count.
    const weekWeekdayCount = new Map<string, number>();
    // Tiers 2-3: per-calendar-month Mon-Fri count.
    const monthWeekdayCount = new Map<string, number>();

    for (const evt of sorted) {
      const dow = localDayOfWeek(evt.completedAt, timezone);
      if (dow < 1 || dow > 5) continue; // Mon=1..Fri=5
      const wk = isoWeekKey(evt.completedAt, timezone);
      const mk = localMonthKey(evt.completedAt, timezone);
      const wkNext = (weekWeekdayCount.get(wk) ?? 0) + 1;
      const mkNext = (monthWeekdayCount.get(mk) ?? 0) + 1;
      weekWeekdayCount.set(wk, wkNext);
      monthWeekdayCount.set(mk, mkNext);
      if (wkNext === 10 && !earned.has('weekday_warrior_10')) {
        earned.set('weekday_warrior_10', evt.completedAt);
      }
      if (mkNext === 25 && !earned.has('weekday_warrior_25')) {
        earned.set('weekday_warrior_25', evt.completedAt);
      }
      if (mkNext === 50 && !earned.has('weekday_warrior_50')) {
        earned.set('weekday_warrior_50', evt.completedAt);
      }
    }
  }

  // ========================================================================
  // NIGHT OWL / EARLY BIRD (all-time cumulative, hour-of-day filtered)
  // ========================================================================
  {
    let nightCount = 0;
    let earlyCount = 0;
    for (const evt of sorted) {
      const h = localHour(evt.completedAt, timezone);
      if (h >= 21) {
        nightCount += 1;
        if (nightCount === 10 && !earned.has('night_owl_10')) earned.set('night_owl_10', evt.completedAt);
        if (nightCount === 25 && !earned.has('night_owl_25')) earned.set('night_owl_25', evt.completedAt);
        if (nightCount === 50 && !earned.has('night_owl_50')) earned.set('night_owl_50', evt.completedAt);
      }
      if (h < 7) {
        earlyCount += 1;
        if (earlyCount === 10 && !earned.has('early_bird_10')) earned.set('early_bird_10', evt.completedAt);
        if (earlyCount === 25 && !earned.has('early_bird_25')) earned.set('early_bird_25', evt.completedAt);
        if (earlyCount === 50 && !earned.has('early_bird_50')) earned.set('early_bird_50', evt.completedAt);
      }
    }
  }

  // ========================================================================
  // POWER HOUR (rolling 60-minute window, two-pointer; D26)
  // ========================================================================
  if (sorted.length >= 5) {
    let j = 0;
    const windowMs = 60 * 60 * 1000;
    for (let i = 0; i < sorted.length; i++) {
      const iMs = new Date(sorted[i].completedAt).getTime();
      while (j <= i && iMs - new Date(sorted[j].completedAt).getTime() >= windowMs) {
        j += 1;
      }
      const size = i - j + 1;
      if (size >= 5 && !earned.has('power_hour_5')) {
        earned.set('power_hour_5', sorted[i].completedAt);
      }
      if (size >= 10 && !earned.has('power_hour_10')) {
        earned.set('power_hour_10', sorted[i].completedAt);
      }
      if (size >= 15 && !earned.has('power_hour_15')) {
        earned.set('power_hour_15', sorted[i].completedAt);
      }
    }
  }

  // ========================================================================
  // CLEAN SWEEP (from familyContext.zeroInboxEvents)
  // ========================================================================
  {
    const myZeros = familyContext.zeroInboxEvents.filter((z) => z.userId === userId);
    if (myZeros.length >= 1) earned.set('clean_sweep_1', myZeros[0].completedAt);
    if (myZeros.length >= 5) earned.set('clean_sweep_5', myZeros[4].completedAt);
    if (myZeros.length >= 10) earned.set('clean_sweep_10', myZeros[9].completedAt);
    if (myZeros.length >= 25) earned.set('clean_sweep_25', myZeros[24].completedAt);
  }

  // ========================================================================
  // SPRING CLEANER / HOLIDAY HERO (seasonal per-year buckets)
  // ========================================================================
  if (sorted.length > 0) {
    // Spring: March-April of each year.
    const springByYear = new Map<number, number>();
    // Holiday: December of each year.
    const holidayByYear = new Map<number, number>();
    for (const evt of sorted) {
      const y = localYear(evt.completedAt, timezone);
      const mo = localMonth(evt.completedAt, timezone);
      if (mo === 3 || mo === 4) {
        const next = (springByYear.get(y) ?? 0) + 1;
        springByYear.set(y, next);
        if (next === 25 && !earned.has('spring_cleaner_25')) earned.set('spring_cleaner_25', evt.completedAt);
        if (next === 50 && !earned.has('spring_cleaner_50')) earned.set('spring_cleaner_50', evt.completedAt);
        if (next === 100 && !earned.has('spring_cleaner_100')) earned.set('spring_cleaner_100', evt.completedAt);
      }
      if (mo === 12) {
        const next = (holidayByYear.get(y) ?? 0) + 1;
        holidayByYear.set(y, next);
        if (next === 25 && !earned.has('holiday_hero_25')) earned.set('holiday_hero_25', evt.completedAt);
        if (next === 50 && !earned.has('holiday_hero_50')) earned.set('holiday_hero_50', evt.completedAt);
        if (next === 100 && !earned.has('holiday_hero_100')) earned.set('holiday_hero_100', evt.completedAt);
      }
    }
  }

  // ========================================================================
  // PHOENIX (D25 — 14+ day calendar gap since previous credit)
  // ========================================================================
  if (sorted.length >= 2) {
    let phoenixCount = 0;
    for (let i = 1; i < sorted.length; i++) {
      const prevKey = localDayKey(sorted[i - 1].completedAt, timezone);
      const curKey = localDayKey(sorted[i].completedAt, timezone);
      if (dayDiff(prevKey, curKey) >= 14) {
        phoenixCount += 1;
        if (phoenixCount === 1 && !earned.has('phoenix_1')) earned.set('phoenix_1', sorted[i].completedAt);
        if (phoenixCount === 5 && !earned.has('phoenix_5')) earned.set('phoenix_5', sorted[i].completedAt);
        if (phoenixCount === 10 && !earned.has('phoenix_10')) earned.set('phoenix_10', sorted[i].completedAt);
      }
    }
  }

  // ========================================================================
  // CLUTCH (completion on or after dueDate)
  // ========================================================================
  {
    let overdueCount = 0;
    for (const evt of sorted) {
      if (!evt.dueDate) continue;
      if (!completedOnOrAfterDue(evt.completedAt, evt.dueDate, timezone)) continue;
      overdueCount += 1;
      if (overdueCount === 5 && !earned.has('clutch_5')) earned.set('clutch_5', evt.completedAt);
      if (overdueCount === 25 && !earned.has('clutch_25')) earned.set('clutch_25', evt.completedAt);
      if (overdueCount === 50 && !earned.has('clutch_50')) earned.set('clutch_50', evt.completedAt);
    }
  }

  // ========================================================================
  // PARTNER IN CRIME (both users credit on same local day)
  // Both users earn on the SAME set of days with the SAME earnedAt.
  // ========================================================================
  {
    const sharedDayTimestamps: string[] = [];
    for (const entry of familyContext.dayUserIndex.values()) {
      if (entry.users.size >= 2 && entry.sharedAt) {
        sharedDayTimestamps.push(entry.sharedAt);
      }
    }
    sharedDayTimestamps.sort();
    // Only credit users who actually participated — if a user has no events
    // on a "shared" day for this family, the dayUserIndex still flagged it
    // because _someone_ did. Two-user-app assumption: both family members
    // participate in every shared day by definition. Still, gate by "did the
    // viewer contribute to at least one shared day?" — if events.length is
    // zero or their day-set doesn't intersect the shared days, they earn
    // nothing.
    const myDayKeys = new Set<string>();
    for (const evt of sorted) myDayKeys.add(localDayKey(evt.completedAt, timezone));
    // Count only shared days where the viewer participated.
    const mySharedAts: string[] = [];
    for (const [dayKey, entry] of familyContext.dayUserIndex.entries()) {
      if (entry.users.size >= 2 && entry.users.has(userId) && myDayKeys.has(dayKey) && entry.sharedAt) {
        mySharedAts.push(entry.sharedAt);
      }
    }
    mySharedAts.sort();
    if (mySharedAts.length >= 5) earned.set('partner_in_crime_5', mySharedAts[4]);
    if (mySharedAts.length >= 25) earned.set('partner_in_crime_25', mySharedAts[24]);
    if (mySharedAts.length >= 50) earned.set('partner_in_crime_50', mySharedAts[49]);
  }

  // ========================================================================
  // COMEBACK KID (D27 — closed months with mid-month deficit reversed)
  // Only evaluated for CLOSED months.
  // ========================================================================
  {
    // Collect qualifying months in ascending order.
    const monthKeysAsc = Array.from(familyContext.monthlyTallies.keys()).sort();
    const qualifyingEarnedAts: string[] = [];
    for (const mk of monthKeysAsc) {
      const acc = familyContext.monthlyTallies.get(mk)!;
      // Need ≥2 participating users for a comeback to be meaningful.
      const allUsers = new Set<string>([...acc.end.keys(), ...acc.mid.keys()]);
      if (allUsers.size < 2) continue;

      const myMid = acc.mid.get(userId) ?? 0;
      const myEnd = acc.end.get(userId) ?? 0;

      // Behind at mid = at least one other user was strictly ahead at mid.
      let behindMid = false;
      for (const [otherId, n] of acc.mid.entries()) {
        if (otherId !== userId && n > myMid) {
          behindMid = true;
          break;
        }
      }
      if (!behindMid) continue;

      // Ahead at end = viewer strictly ahead of every other participating user
      // at end-of-month.
      let aheadEnd = true;
      for (const [otherId, n] of acc.end.entries()) {
        if (otherId === userId) continue;
        if (myEnd <= n) {
          aheadEnd = false;
          break;
        }
      }
      if (!aheadEnd) continue;

      // earnedAt = last day of month at 23:59:59.999Z. Simple reconstruction:
      // the last day of month is derivable from the month key by selecting
      // the max dayKey observed in that month.
      // Use end-of-day approximation.
      const [y, m] = mk.split('-').map(Number);
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      qualifyingEarnedAts.push(endOfDayUtc(`${mk}-${String(lastDay).padStart(2, '0')}`));
    }

    if (qualifyingEarnedAts.length >= 1) earned.set('comeback_kid_1', qualifyingEarnedAts[0]);
    if (qualifyingEarnedAts.length >= 3) earned.set('comeback_kid_3', qualifyingEarnedAts[2]);
    if (qualifyingEarnedAts.length >= 5) earned.set('comeback_kid_5', qualifyingEarnedAts[4]);
  }

  // Silence unused-now warnings: `now` is reserved for future use + tests.
  void now;

  const out: EarnedBadge[] = Array.from(earned.entries()).map(([id, earnedAt]) => ({
    id,
    earnedAt,
  }));
  out.sort((a, b) => (a.earnedAt < b.earnedAt ? -1 : a.earnedAt > b.earnedAt ? 1 : 0));
  return out;
}
