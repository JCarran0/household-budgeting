/**
 * Wrapped Service
 *
 * Orchestrates the daily and weekly Wrapped feature:
 *   - Assembles WrappedInput from live task/trip/project/transaction data.
 *   - Calls the pure compute engine (computeDailyWrapped / computeWeeklyCards).
 *   - Persists WeeklyWrapped records and the per-user dispatch log.
 *   - Manages the rolling 7-day copy-variant ID cache for repetition avoidance.
 *   - Fires push notifications via PushNotificationService.
 *
 * All I/O lives here; the engine is pure and stateless.
 */

import type { DataService } from './dataService';
import type { TaskService } from './taskService';
import type { TripService } from './tripService';
import type { ProjectService } from './projectService';
import type { TransactionService } from './transactionService';
import type { UserService } from './userService';
import type { PushNotificationService } from './pushNotificationService';
import { computeDailyWrapped, computeWeeklyCards } from '../shared/utils/wrappedEngine';
import { evaluateRules } from '../shared/utils/wrappedRules';
import type { WrappedInput } from '../shared/utils/wrappedRules';
import {
  localDateKey,
  isoWeekBoundaries,
  isInNineToMidnightWindow,
  isInWeeklyExtendedWindow,
} from '../shared/utils/wrappedDays';
import {
  computeStreaksForUser,
  type CreditEvent,
} from '../shared/utils/leaderboardStreaks';
import {
  buildFamilyBadgeContext,
  computeEarnedBadges,
} from '../shared/utils/leaderboardBadges';
import { BADGE_CATALOG } from '../shared/types';
import type {
  WrappedDailyPayload,
  WrappedWeeklyRecord,
  WrappedWeeklyCards,
  WrappedDispatchLogEntry,
  WrappedCadence,
  StoredTask,
  StoredProject,
} from '../shared/types';
import type { StoredTrip } from '../shared/types';
import type { StoredTransaction } from './transactionService';

// WrappedInput type import already brings in evaluateRules; engine handles the rest.
// Re-export here for convenience if needed downstream.
export { evaluateRules };

interface FireResult {
  fired: boolean;
  delivered: boolean;
}

/** Maximum number of dispatch log entries to retain per user (FIFO trim). */
const MAX_DISPATCH_LOG_ENTRIES = 60;

/** Number of days to retain copy-variant IDs for repetition avoidance. */
const RECENT_COPY_TTL_DAYS = 7;

// ---------------------------------------------------------------------------
// Attribution helper (mirrors taskService leaderboard logic)
// ---------------------------------------------------------------------------

/** Find the most recent 'done' transition on a task. */
function findCompletionTransition(
  task: StoredTask,
): { userId: string; timestamp: string } | null {
  if (!task.completedAt) return null;
  for (let i = task.transitions.length - 1; i >= 0; i--) {
    const t = task.transitions[i];
    if (t.toStatus === 'done' && t.timestamp === task.completedAt) return t;
  }
  for (let i = task.transitions.length - 1; i >= 0; i--) {
    if (task.transitions[i].toStatus === 'done') return task.transitions[i];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main service class
// ---------------------------------------------------------------------------

export class WrappedService {
  constructor(
    private readonly dataService: DataService,
    private readonly taskService: TaskService,
    private readonly tripService: TripService,
    private readonly projectService: ProjectService,
    private readonly transactionService: TransactionService,
    private readonly userService: UserService,
    private readonly pushService: PushNotificationService,
  ) {}

  // =========================================================================
  // Public API — read paths
  // =========================================================================

  /**
   * Return the daily Wrapped payload for a user.
   *
   * Returns `null` when:
   *   - `wrappedEnabled === false`
   *   - current local time is outside the 9 PM – midnight window
   *   - an active trip covers today (vacation suppression)
   */
  async getDailyPayload(
    userId: string,
    now: Date = new Date(),
  ): Promise<WrappedDailyPayload | null> {
    const user = await this.userService.getUser(userId);
    if (!user || !user.wrappedEnabled) return null;

    const tz = user.timezone;

    if (!isInNineToMidnightWindow(now, tz)) return null;

    const dateKey = localDateKey(now, tz);
    const tripsToday = await this.getActiveTripsForDate(user.familyId, dateKey);
    if (tripsToday.length > 0) return null;

    const windowStart = `${dateKey}T00:00:00.000Z`;
    const windowEnd = `${dateKey}T23:59:59.999Z`;

    const recentRaw = await this.dataService.getRecentCopyIds(user.familyId);
    const recentCopyIds = new Set(this.pruneOldCopyIds(recentRaw, now).map((e) => e.copyId));

    const members = await this.getFamilyMembers(user.familyId);
    const input = await this.buildWrappedInput(
      user.familyId,
      windowStart,
      windowEnd,
      'daily',
      tz,
      members,
      now,
    );

    return computeDailyWrapped(input, { recentCopyIds, rng: Math.random });
  }

  /**
   * Return a weekly Wrapped record for a user.
   *
   * - If `weekStart` is provided, load from archive (returns the stored record).
   * - If omitted and within the extended window (Sun 9 PM – Mon midnight),
   *   return the current week's record (computing + persisting if new).
   * - If omitted and outside the window, return the most-recent archived record.
   *
   * Suppressed records are returned with `suppressed: true` so the frontend
   * can render the placeholder label.
   */
  async getWeeklyRecord(
    userId: string,
    weekStart?: string,
    now: Date = new Date(),
  ): Promise<WrappedWeeklyRecord | null> {
    const user = await this.userService.getUser(userId);
    if (!user || !user.wrappedEnabled) return null;

    const tz = user.timezone;
    const records = await this.dataService.getWeeklyWrappeds(user.familyId);

    if (weekStart) {
      // Archive lookup — return stored record as-is (immutable after creation).
      return records.find((r) => r.weekStart === weekStart) ?? null;
    }

    if (isInWeeklyExtendedWindow(now, tz)) {
      // Current week — check for existing snapshot first (immutability).
      const { start, end } = isoWeekBoundaries(now, tz);
      const existing = records.find((r) => r.weekStart === start);
      if (existing) return existing;

      // No snapshot yet — compute and persist.
      return this.computeAndPersistWeeklyRecord(user.familyId, start, end, tz, now);
    }

    // Outside the extended window — return the most-recent archived record.
    if (records.length === 0) return null;
    const sorted = [...records].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
    return sorted[0];
  }

  /**
   * Paginate the weekly archive for a user (reverse-chronological, 10 per page).
   * Cursor = weekStart of the last item seen on the previous page.
   */
  async listArchive(
    userId: string,
    cursor?: string,
  ): Promise<{ items: WrappedWeeklyRecord[]; nextCursor?: string }> {
    const user = await this.userService.getUser(userId);
    // Gate on wrappedEnabled like every other read path. Weekly records are
    // FAMILY-scoped (`weekly_wrappeds_{familyId}`), so without this check a
    // family member who has not been enabled would receive an enabled member's
    // Wrapped archive — which breaks the per-user bake rollout.
    if (!user || !user.wrappedEnabled) return { items: [] };

    const records = await this.dataService.getWeeklyWrappeds(user.familyId);
    const sorted = [...records].sort((a, b) => b.weekStart.localeCompare(a.weekStart));

    const PAGE_SIZE = 10;
    let startIdx = 0;
    if (cursor) {
      const idx = sorted.findIndex((r) => r.weekStart === cursor);
      startIdx = idx === -1 ? 0 : idx + 1;
    }

    const page = sorted.slice(startIdx, startIdx + PAGE_SIZE);
    const nextCursor =
      startIdx + PAGE_SIZE < sorted.length ? page[page.length - 1].weekStart : undefined;

    return { items: page, nextCursor };
  }

  // =========================================================================
  // Public API — scheduler fire paths
  // =========================================================================

  /**
   * Fire the daily Wrapped for a user.
   *
   * Idempotent on `(userId, 'daily', localDateKey)`.
   * Returns `{ fired: false }` when skipped for any reason.
   */
  async fireDaily(userId: string, now: Date = new Date()): Promise<FireResult> {
    const user = await this.userService.getUser(userId);
    if (!user || !user.wrappedEnabled) return { fired: false, delivered: false };

    const tz = user.timezone;
    const dateKey = localDateKey(now, tz);

    // Vacation suppression
    const tripsToday = await this.getActiveTripsForDate(user.familyId, dateKey);
    if (tripsToday.length > 0) return { fired: false, delivered: false };

    // Idempotency check
    const log = await this.dataService.getWrappedDispatchLog(userId);
    if (log.some((e) => e.cadence === 'daily' && e.localDateKey === dateKey)) {
      return { fired: false, delivered: false };
    }

    // Compute payload
    const windowStart = `${dateKey}T00:00:00.000Z`;
    const windowEnd = `${dateKey}T23:59:59.999Z`;

    const recentRaw = await this.dataService.getRecentCopyIds(user.familyId);
    const pruned = this.pruneOldCopyIds(recentRaw, now);
    const recentCopyIds = new Set(pruned.map((e) => e.copyId));

    const members = await this.getFamilyMembers(user.familyId);
    const input = await this.buildWrappedInput(
      user.familyId,
      windowStart,
      windowEnd,
      'daily',
      tz,
      members,
      now,
    );
    const payload = computeDailyWrapped(input, { recentCopyIds, rng: Math.random });

    // Send push
    const { delivered } = await this.pushService.sendWrapped(
      userId,
      'daily',
      payload.headline.tier,
      payload.headline.count,
      payload.highlights.length,
      dateKey,
    );

    // Append dispatch log (FIFO-capped)
    const logEntry: WrappedDispatchLogEntry = {
      userId,
      cadence: 'daily',
      localDateKey: dateKey,
      firedAt: now.toISOString(),
      delivered,
    };
    const updatedLog = [...log, logEntry].slice(-MAX_DISPATCH_LOG_ENTRIES);
    await this.dataService.saveWrappedDispatchLog(updatedLog, userId);

    // Update copy-variant cache
    const usedIds = [
      payload.headline.copyVariantId,
      ...payload.highlights.map((h) => h.copyVariantId),
    ];
    await this.appendRecentCopyIds(user.familyId, usedIds, now);

    console.log(JSON.stringify({
      event: 'wrapped.push.fired',
      userId,
      cadence: 'daily',
      tier: payload.headline.tier,
      highlightCount: payload.highlights.length,
      delivered,
    }));

    return { fired: true, delivered };
  }

  /**
   * Fire the weekly Wrapped for a user.
   *
   * Snapshot-immutable: if a WeeklyWrapped already exists for this week, it is
   * reused and a push is sent without recomputing (BRD §8.3).
   * Idempotent on `(userId, 'weekly', mondayKey)`.
   */
  async fireWeekly(userId: string, now: Date = new Date()): Promise<FireResult> {
    const user = await this.userService.getUser(userId);
    if (!user || !user.wrappedEnabled) return { fired: false, delivered: false };

    const tz = user.timezone;
    const { start: mondayKey, end: sundayKey } = isoWeekBoundaries(now, tz);

    // Vacation suppression — any trip day in the week counts
    const tripInWeek = await this.doesWeekContainTrip(user.familyId, mondayKey, sundayKey);

    // Idempotency check
    const log = await this.dataService.getWrappedDispatchLog(userId);
    if (log.some((e) => e.cadence === 'weekly' && e.localDateKey === mondayKey)) {
      return { fired: false, delivered: false };
    }

    // Check for existing snapshot (immutability)
    const records = await this.dataService.getWeeklyWrappeds(user.familyId);
    let record = records.find((r) => r.weekStart === mondayKey);

    if (!record) {
      // Compute and persist new snapshot
      record = await this.computeAndPersistWeeklyRecord(
        user.familyId,
        mondayKey,
        sundayKey,
        tz,
        now,
        tripInWeek,
      );
    }

    // Don't push for trip-suppressed weeks, but DO write the record + log entry
    let delivered = false;

    if (!record.suppressed) {
      const headlineCount = record.cards?.headline.count ?? 0;
      const highlightCount = record.cards?.highlights.length ?? 0;

      const result = await this.pushService.sendWrapped(
        userId,
        'weekly',
        headlineCount >= 10 ? 4 : headlineCount >= 6 ? 3 : headlineCount >= 3 ? 2 : headlineCount >= 1 ? 1 : 0,
        headlineCount,
        highlightCount,
        mondayKey,
      );
      delivered = result.delivered;
    }

    // Append dispatch log
    const logEntry: WrappedDispatchLogEntry = {
      userId,
      cadence: 'weekly',
      localDateKey: mondayKey,
      firedAt: now.toISOString(),
      delivered,
    };
    const updatedLog = [...log, logEntry].slice(-MAX_DISPATCH_LOG_ENTRIES);
    await this.dataService.saveWrappedDispatchLog(updatedLog, userId);

    // Update copy-variant cache
    if (record.cards) {
      const usedIds = [
        record.cards.headline.copyVariantId,
        ...record.cards.highlights.map((h) => h.copyVariantId),
      ];
      await this.appendRecentCopyIds(user.familyId, usedIds, now);
    }

    console.log(JSON.stringify({
      event: 'wrapped.push.fired',
      userId,
      cadence: 'weekly',
      suppressed: record.suppressed,
      delivered,
    }));

    return { fired: true, delivered };
  }

  /**
   * Toggle `wrappedEnabled` for a target user (admin-only).
   * Delegates authorization check to UserService.
   */
  async setWrappedEnabled(
    targetUserId: string,
    enabled: boolean,
    adminUserId: string,
  ): Promise<void> {
    await this.userService.setWrappedEnabled(targetUserId, enabled, adminUserId);
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  /** Compute a new WeeklyWrapped record and persist it to the archive. */
  private async computeAndPersistWeeklyRecord(
    familyId: string,
    weekStart: string,
    weekEnd: string,
    tz: string,
    now: Date,
    forceSuppress?: boolean,
  ): Promise<WrappedWeeklyRecord> {
    const suppressed = forceSuppress ?? (await this.doesWeekContainTrip(familyId, weekStart, weekEnd));

    const recentRaw = await this.dataService.getRecentCopyIds(familyId);
    const pruned = this.pruneOldCopyIds(recentRaw, now);
    const recentCopyIds = new Set(pruned.map((e) => e.copyId));

    let cards: WrappedWeeklyCards | null = null;
    const usedCopyIds: string[] = [];

    if (!suppressed) {
      const windowStart = `${weekStart}T00:00:00.000Z`;
      const windowEnd = `${weekEnd}T23:59:59.999Z`;
      const members = await this.getFamilyMembers(familyId);
      const input = await this.buildWrappedInput(
        familyId,
        windowStart,
        windowEnd,
        'weekly',
        tz,
        members,
        now,
      );

      // nextFireLocalIso: next Sunday after weekEnd
      const [y, m, d] = weekEnd.split('-').map(Number);
      const nextSunday = new Date(Date.UTC(y, m - 1, d + 7));
      const nextFireLocalIso = nextSunday.toISOString().slice(0, 10);

      cards = computeWeeklyCards(input, {
        recentCopyIds,
        rng: Math.random,
        nextFireLocalIso,
      });

      usedCopyIds.push(
        cards.headline.copyVariantId,
        ...cards.highlights.map((h) => h.copyVariantId),
      );
    }

    const record: WrappedWeeklyRecord = {
      id: weekStart,
      familyId,
      weekStart,
      weekEnd,
      tz,
      suppressed,
      cards,
      usedCopyIds,
      createdAt: now.toISOString(),
    };

    const records = await this.dataService.getWeeklyWrappeds(familyId);
    const withNew = [...records.filter((r) => r.weekStart !== weekStart), record];
    await this.dataService.saveWeeklyWrappeds(withNew, familyId);

    return record;
  }

  /**
   * Build the WrappedInput struct by gathering all data needed by the rule engine.
   * This is the sole I/O boundary — all data fetching lives here.
   */
  private async buildWrappedInput(
    familyId: string,
    windowStart: string,
    windowEnd: string,
    cadence: WrappedCadence,
    tz: string,
    members: Array<{ id: string; displayName: string }>,
    now: Date,
  ): Promise<WrappedInput> {
    // 1. Load all tasks for the family.
    const allTasks = await this.taskService.getAllTasks(familyId);

    // 2. Build credit events per user (same logic as taskService leaderboard).
    const eventsByUser = new Map<string, CreditEvent[]>();
    for (const member of members) {
      eventsByUser.set(member.id, []);
    }

    for (const task of allTasks) {
      if (task.scope !== 'family') continue;

      if (task.completedAt) {
        const transition = findCompletionTransition(task);
        if (transition) {
          const creditedUserId = task.assigneeId ?? transition.userId;
          const events = eventsByUser.get(creditedUserId) ?? [];
          events.push({ userId: creditedUserId, completedAt: task.completedAt, ...(task.dueDate ? { dueDate: task.dueDate } : {}) });
          eventsByUser.set(creditedUserId, events);
        }
      }

      for (const st of task.subTasks) {
        if (!st.completed || !st.completedAt) continue;
        const creditedUserId = task.assigneeId ?? st.completedBy;
        if (!creditedUserId) continue;
        const events = eventsByUser.get(creditedUserId) ?? [];
        events.push({ userId: creditedUserId, completedAt: st.completedAt });
        eventsByUser.set(creditedUserId, events);
      }
    }

    // 3. Build family badge context (for badge rules).
    const familyContext = buildFamilyBadgeContext(allTasks, eventsByUser, tz, now);

    // 4. Compute per-user data for the window.
    const perUser = new Map<string, WrappedInput['perUser'] extends Map<string, infer V> ? V : never>();

    for (const member of members) {
      const events = eventsByUser.get(member.id) ?? [];
      const streaks = computeStreaksForUser(events, tz, now);
      const earnedBadges = computeEarnedBadges(
        events,
        streaks.streakMilestones,
        tz,
        familyContext,
        member.id,
        now,
      );

      // Newly earned badges in window.
      const newlyEarnedBadges = earnedBadges
        .filter(
          (b) => b.earnedAt >= windowStart && b.earnedAt <= windowEnd,
        )
        .map((b) => {
          const def = BADGE_CATALOG.find((bc) => bc.id === b.id);
          return {
            badgeId: b.id,
            tier: (def?.tier ?? 1) as 1 | 2 | 3 | 4 | 5,
            earnedAt: b.earnedAt,
            label: def?.label ?? b.id,
            celebrationCopy: def?.celebrationCopy ?? '',
          };
        });

      // Per-user rolling 30-day daily max (for personalBest rule).
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

      const dailyCounts = new Map<string, number>();
      for (const e of events) {
        if (e.completedAt < thirtyDaysAgoISO) continue;
        const dk = e.completedAt.slice(0, 10);
        dailyCounts.set(dk, (dailyCounts.get(dk) ?? 0) + 1);
      }
      const allTimeDaily30 = dailyCounts.size > 0 ? Math.max(...dailyCounts.values()) : 0;

      // Whether streak grew during this window.
      const eventsInWindow = events.filter(
        (e) => e.completedAt >= windowStart && e.completedAt <= windowEnd,
      );
      const streakBefore = computeStreaksForUser(
        events.filter((e) => e.completedAt < windowStart),
        tz,
        new Date(windowStart),
      );
      const grewStreakInWindow =
        eventsInWindow.length > 0 && streaks.currentStreak > streakBefore.currentStreak;

      perUser.set(member.id, {
        creditEvents: events,
        allTimeDaily30,
        currentStreak: streaks.currentStreak,
        grewStreakInWindow,
        newlyEarnedBadges,
      });
    }

    // 5. Closed tasks in window (family scope, for zombie rule).
    const closedTasksInWindow = allTasks
      .filter(
        (t) =>
          t.scope === 'family' &&
          t.status === 'done' &&
          t.completedAt &&
          t.completedAt >= windowStart &&
          t.completedAt <= windowEnd,
      )
      .map((t) => {
        const transition = findCompletionTransition(t);
        const completedByUserId = t.assigneeId ?? transition?.userId ?? '';
        return {
          id: t.id,
          title: t.title,
          createdAt: t.createdAt,
          completedAt: t.completedAt!,
          completedByUserId,
        };
      });

    // 6. Project closes in window (≥3 items closed on the same project).
    const projects = await this.projectService.getAllProjects(familyId);
    const projectCloses = this.computeProjectCloses(allTasks, projects, windowStart, windowEnd);

    // 7. Trip stops added in window.
    const trips = await this.tripService.getAllTrips(familyId);
    const tripStopsAdded = this.computeTripStopsAdded(trips, windowStart, windowEnd);

    // 8. Transactions categorized in window.
    const transactionsCategorized = await this.computeTransactionsCategorized(
      familyId,
      windowStart,
      windowEnd,
    );

    // 9. Prior week data (weekly cadence only).
    let priorWeek: { familyTotal: number } | null = null;
    let midweekState: { byUserId: Record<string, number> } | null = null;

    if (cadence === 'weekly') {
      // Prior week boundaries
      const weekStartDate = new Date(windowStart);
      const priorWeekEnd = new Date(weekStartDate);
      priorWeekEnd.setUTCDate(priorWeekEnd.getUTCDate() - 1);
      const priorWeekStart = new Date(priorWeekEnd);
      priorWeekStart.setUTCDate(priorWeekStart.getUTCDate() - 6);

      const pwStart = priorWeekStart.toISOString();
      const pwEnd = `${priorWeekEnd.toISOString().slice(0, 10)}T23:59:59.999Z`;

      let priorTotal = 0;
      for (const [, userData] of perUser) {
        priorTotal += userData.creditEvents.filter(
          (e) => e.completedAt >= pwStart && e.completedAt <= pwEnd,
        ).length;
      }
      priorWeek = { familyTotal: priorTotal };

      // Midweek state: end-of-day Wednesday (index 2 of Mon=0..Sun=6)
      const [wy, wm, wd] = windowStart.slice(0, 10).split('-').map(Number);
      const wednesday = new Date(Date.UTC(wy, wm - 1, wd + 2));
      const wednesdayEnd = `${wednesday.toISOString().slice(0, 10)}T23:59:59.999Z`;

      const midweekByUser: Record<string, number> = {};
      for (const [userId, userData] of perUser) {
        midweekByUser[userId] = userData.creditEvents.filter(
          (e) => e.completedAt >= windowStart && e.completedAt <= wednesdayEnd,
        ).length;
      }
      midweekState = { byUserId: midweekByUser };
    }

    return {
      familyId,
      windowStart,
      windowEnd,
      cadence,
      tz,
      members,
      perUser,
      closedTasksInWindow,
      projectCloses,
      tripStopsAdded,
      transactionsCategorized,
      priorWeek,
      midweekState,
    };
  }

  /** Get the display-name-bearing member list for a family. */
  private async getFamilyMembers(
    familyId: string,
  ): Promise<Array<{ id: string; displayName: string }>> {
    const family = await this.dataService.getFamily(familyId);
    if (!family) return [];
    return family.members.map((m) => ({ id: m.userId, displayName: m.displayName }));
  }

  /** Returns trips that overlap a given date (vacation suppression). */
  private async getActiveTripsForDate(familyId: string, dateKey: string): Promise<StoredTrip[]> {
    const trips = await this.tripService.getAllTrips(familyId);
    return trips.filter(
      (t) => t.startDate <= dateKey && t.endDate >= dateKey,
    );
  }

  /** Returns true if any trip covers any day in [weekStart, weekEnd]. */
  private async doesWeekContainTrip(
    familyId: string,
    weekStart: string,
    weekEnd: string,
  ): Promise<boolean> {
    const trips = await this.tripService.getAllTrips(familyId);
    return trips.some((t) => t.startDate <= weekEnd && t.endDate >= weekStart);
  }

  /**
   * Compute project closes: groups of ≥3 closed project-tagged tasks in the window,
   * grouped by project tag.
   */
  private computeProjectCloses(
    tasks: StoredTask[],
    projects: StoredProject[],
    windowStart: string,
    windowEnd: string,
  ): WrappedInput['projectCloses'] {
    // Build a map from task tag → project
    const projectByTag = new Map<string, StoredProject>();
    for (const project of projects) {
      projectByTag.set(project.tag, project);
    }

    // Count closed tasks per project tag in the window
    const countByTag = new Map<string, { count: number; byUserId: string }>();
    for (const task of tasks) {
      if (task.status !== 'done' || !task.completedAt) continue;
      if (task.completedAt < windowStart || task.completedAt > windowEnd) continue;

      for (const tag of task.tags) {
        if (!projectByTag.has(tag)) continue;
        const transition = findCompletionTransition(task);
        const creditedUserId = task.assigneeId ?? transition?.userId ?? '';
        const existing = countByTag.get(tag);
        countByTag.set(tag, {
          count: (existing?.count ?? 0) + 1,
          byUserId: creditedUserId,
        });
      }
    }

    const result: WrappedInput['projectCloses'] = [];
    for (const [tag, { count, byUserId }] of countByTag) {
      if (count < 3) continue;
      const project = projectByTag.get(tag);
      if (!project) continue;
      result.push({
        projectId: project.id,
        projectName: project.name,
        count,
        byUserId,
      });
    }

    return result;
  }

  /**
   * Compute trip stops added in the window (≥3 stops on the same trip).
   */
  private computeTripStopsAdded(
    trips: StoredTrip[],
    windowStart: string,
    windowEnd: string,
  ): WrappedInput['tripStopsAdded'] {
    const result: WrappedInput['tripStopsAdded'] = [];

    for (const trip of trips) {
      const stopsInWindow = trip.stops.filter(
        (s) => s.createdAt >= windowStart && s.createdAt <= windowEnd,
      );
      if (stopsInWindow.length < 3) continue;

      // Attribution: last modifier of the trip, or fallback to empty string
      result.push({
        tripId: trip.id,
        tripName: trip.name,
        count: stopsInWindow.length,
        byUserId: trip.lastModifiedBy ?? '',
      });
    }

    return result;
  }

  /**
   * Count transactions categorized in the window (receipt sweep rule).
   * A categorized transaction has a non-null categoryId and was updated in the window.
   */
  private async computeTransactionsCategorized(
    familyId: string,
    windowStart: string,
    windowEnd: string,
  ): Promise<{ count: number; byUserId: string | null }> {
    const result = await this.transactionService.getTransactions(familyId, {
      startDate: windowStart.slice(0, 10),
      endDate: windowEnd.slice(0, 10),
    });

    const transactions = result.transactions ?? [];
    const categorized = transactions.filter((t: StoredTransaction) => {
      if (!t.categoryId) return false;
      const updatedAt = t.updatedAt instanceof Date
        ? t.updatedAt.toISOString()
        : String(t.updatedAt);
      return updatedAt >= windowStart && updatedAt <= windowEnd;
    });

    return { count: categorized.length, byUserId: null };
  }

  /** Prune copy-variant cache entries older than RECENT_COPY_TTL_DAYS days. */
  private pruneOldCopyIds(
    entries: Array<{ copyId: string; usedAt: string }>,
    now: Date,
  ): Array<{ copyId: string; usedAt: string }> {
    // Must use the INJECTED clock, not `new Date()`. Every fire path threads a
    // `now` for deterministic tests and correct replay/backfill behaviour; a
    // wall-clock cutoff here silently prunes everything when `now` is not today.
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - RECENT_COPY_TTL_DAYS);
    const cutoffISO = cutoff.toISOString();
    return entries.filter((e) => e.usedAt >= cutoffISO);
  }

  /** Append new copy variant IDs to the family's rolling recent-copy cache. */
  private async appendRecentCopyIds(
    familyId: string,
    newIds: string[],
    now: Date,
  ): Promise<void> {
    const existing = await this.dataService.getRecentCopyIds(familyId);
    const pruned = this.pruneOldCopyIds(existing, now);
    const nowISO = now.toISOString();
    const newEntries = newIds.map((copyId) => ({ copyId, usedAt: nowISO }));
    await this.dataService.saveRecentCopyIds([...pruned, ...newEntries], familyId);
  }
}
