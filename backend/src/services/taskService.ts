/**
 * Task Service
 *
 * Manages household tasks: CRUD, status transitions with auto-assignment,
 * transition logging, board filtering (14-day archiving), and leaderboard
 * computation.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  StoredTask,
  CreateTaskDto,
  UpdateTaskDto,
  TaskStatus,
  LeaderboardResponse,
  LeaderboardEntry,
} from '../shared/types';
import { topOfColumn } from '../shared/utils/taskSortOrder';
import { DataService } from './dataService';
import { FamilyService } from './familyService';

/** Number of days after which done tasks are archived from the board */
const ARCHIVE_AFTER_DAYS = 14;

export class TaskService {
  constructor(
    private dataService: DataService,
    private familyService: FamilyService
  ) {}

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async loadTasks(familyId: string): Promise<StoredTask[]> {
    const tasks = (await this.dataService.getData<StoredTask[]>(`tasks_${familyId}`)) ?? [];
    // Backfill fields added after initial release
    for (const task of tasks) {
      if (!task.tags) task.tags = [];
      if (!task.subTasks) task.subTasks = [];
      // v2.0 fields — lazy heal on read
      if (task.snoozedUntil === undefined) task.snoozedUntil = null;
      if (typeof task.sortOrder !== 'number') {
        // Use createdAt-as-seconds so legacy tasks preserve creation order.
        const created = Date.parse(task.createdAt);
        task.sortOrder = Number.isFinite(created) ? created / 1000 : 0;
      }
    }
    return tasks;
  }

  /**
   * Current minimum sortOrder among active tasks in a status (used to land
   * new/transitioned tasks at the top of the destination column).
   */
  private minSortOrder(tasks: StoredTask[], status: TaskStatus): number | null {
    let min: number | null = null;
    for (const t of tasks) {
      if (t.status !== status) continue;
      if (min === null || t.sortOrder < min) min = t.sortOrder;
    }
    return min;
  }

  private async saveTasks(tasks: StoredTask[], familyId: string): Promise<void> {
    await this.dataService.saveData(`tasks_${familyId}`, tasks);
  }

  /**
   * Check whether a task should be hidden from the active board.
   *
   * v2.0 rules (BRD §3.3, plan D12):
   *   - 'cancelled' → archived immediately (no 14-day window; no Cancelled column)
   *   - 'done'      → archived after ARCHIVE_AFTER_DAYS days
   *   - other       → never archived
   */
  private isArchived(task: StoredTask): boolean {
    if (task.status === 'cancelled') return true;
    if (task.status !== 'done') return false;

    if (!task.completedAt) return false;
    const completed = new Date(task.completedAt);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - ARCHIVE_AFTER_DAYS);

    return completed < cutoff;
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async createTask(
    data: CreateTaskDto,
    userId: string,
    familyId: string
  ): Promise<StoredTask> {
    const now = new Date().toISOString();
    const initialStatus: TaskStatus = data.status === 'started' ? 'started' : 'todo';

    const tasks = await this.loadTasks(familyId);
    const sortOrder = topOfColumn(this.minSortOrder(tasks, initialStatus));

    const task: StoredTask = {
      id: uuidv4(),
      familyId,
      title: data.title,
      description: data.description ?? '',
      status: initialStatus,
      scope: data.scope ?? 'family',
      assigneeId: data.assigneeId ?? null,
      dueDate: data.dueDate ?? null,
      createdAt: now,
      createdBy: userId,
      startedAt: initialStatus === 'started' ? now : null,
      completedAt: null,
      cancelledAt: null,
      assignedAt: data.assigneeId ? now : null,
      transitions: [
        {
          fromStatus: null,
          toStatus: initialStatus,
          timestamp: now,
          userId,
        },
      ],
      tags: data.tags ?? [],
      subTasks: (data.subTasks ?? []).map((st) => ({
        id: uuidv4(),
        title: st.title,
        completed: false,
      })),
      snoozedUntil: null,
      sortOrder,
    };

    tasks.push(task);
    await this.saveTasks(tasks, familyId);

    return task;
  }

  async getTask(taskId: string, familyId: string): Promise<StoredTask | null> {
    const tasks = await this.loadTasks(familyId);
    return tasks.find((t) => t.id === taskId) ?? null;
  }

  async getAllTasks(familyId: string): Promise<StoredTask[]> {
    return this.loadTasks(familyId);
  }

  async updateTask(
    taskId: string,
    data: UpdateTaskDto,
    _userId: string,
    familyId: string
  ): Promise<StoredTask> {
    const tasks = await this.loadTasks(familyId);
    const index = tasks.findIndex((t) => t.id === taskId);
    if (index === -1) {
      throw new Error('Task not found');
    }

    const existing = tasks[index];
    const now = new Date().toISOString();

    const assigneeChanged =
      data.assigneeId !== undefined && data.assigneeId !== existing.assigneeId;

    const updated: StoredTask = {
      ...existing,
      title: data.title ?? existing.title,
      description: data.description ?? existing.description,
      scope: data.scope ?? existing.scope,
      dueDate: data.dueDate !== undefined ? data.dueDate : existing.dueDate,
      assigneeId: data.assigneeId !== undefined ? data.assigneeId : existing.assigneeId,
      assignedAt: assigneeChanged ? now : existing.assignedAt,
      tags: data.tags !== undefined ? data.tags : existing.tags,
      subTasks: data.subTasks !== undefined ? data.subTasks : existing.subTasks,
    };

    tasks[index] = updated;
    await this.saveTasks(tasks, familyId);

    return updated;
  }

  async deleteTask(taskId: string, familyId: string): Promise<void> {
    const tasks = await this.loadTasks(familyId);
    const index = tasks.findIndex((t) => t.id === taskId);
    if (index === -1) {
      throw new Error('Task not found');
    }

    tasks.splice(index, 1);
    await this.saveTasks(tasks, familyId);
  }

  // ---------------------------------------------------------------------------
  // Status transitions
  // ---------------------------------------------------------------------------

  async updateTaskStatus(
    taskId: string,
    newStatus: TaskStatus,
    userId: string,
    familyId: string,
    options: {
      /** Optional synthetic startedAt (Checklist done-checkbox path, v2.0 D2). */
      startedAt?: string;
      /** If true, caller (reorderTask) is providing its own sortOrder — don't override. */
      preserveSortOrder?: boolean;
    } = {}
  ): Promise<StoredTask> {
    const tasks = await this.loadTasks(familyId);
    const index = tasks.findIndex((t) => t.id === taskId);
    if (index === -1) {
      throw new Error('Task not found');
    }

    const existing = tasks[index];
    const now = new Date().toISOString();

    // Append transition
    const transition = {
      fromStatus: existing.status as TaskStatus | null,
      toStatus: newStatus,
      timestamp: now,
      userId,
    };

    // Update convenience timestamps based on new status
    let { startedAt, completedAt, cancelledAt, assigneeId, assignedAt, snoozedUntil } =
      existing;

    switch (newStatus) {
      case 'todo':
        startedAt = null;
        completedAt = null;
        cancelledAt = null;
        break;
      case 'started':
        startedAt = now;
        completedAt = null;
        cancelledAt = null;
        // Auto-assign if unassigned (BRD REQ-005)
        if (!assigneeId) {
          assigneeId = userId;
          assignedAt = now;
        }
        break;
      case 'done':
        completedAt = now;
        cancelledAt = null;
        // Synthetic start stamp: Checklist "done without started first" (D2).
        // Only honored when startedAt was null.
        if (!startedAt && options.startedAt) {
          startedAt = options.startedAt;
        }
        // Terminal — clear snooze (D9)
        snoozedUntil = null;
        break;
      case 'cancelled':
        cancelledAt = now;
        completedAt = null;
        // Terminal — clear snooze (D9)
        snoozedUntil = null;
        break;
    }

    // sortOrder: if status changed, land at top of destination column
    // (plan 2.2, D15). Reorder callers bypass via preserveSortOrder.
    let sortOrder = existing.sortOrder;
    if (!options.preserveSortOrder && existing.status !== newStatus) {
      // Build a provisional list reflecting the new status for min-calc
      sortOrder = topOfColumn(
        this.minSortOrder(
          tasks.filter((t) => t.id !== taskId),
          newStatus
        )
      );
    }

    const updated: StoredTask = {
      ...existing,
      status: newStatus,
      startedAt,
      completedAt,
      cancelledAt,
      assigneeId,
      assignedAt,
      snoozedUntil,
      sortOrder,
      transitions: [...existing.transitions, transition],
    };

    tasks[index] = updated;
    await this.saveTasks(tasks, familyId);

    return updated;
  }

  // ---------------------------------------------------------------------------
  // v2.0 — Snooze
  // ---------------------------------------------------------------------------

  async snoozeTask(
    taskId: string,
    snoozedUntil: string | null,
    familyId: string
  ): Promise<StoredTask> {
    const tasks = await this.loadTasks(familyId);
    const index = tasks.findIndex((t) => t.id === taskId);
    if (index === -1) {
      throw new Error('Task not found');
    }

    const existing = tasks[index];
    if (existing.status === 'done' || existing.status === 'cancelled') {
      throw new Error('Cannot snooze a done or cancelled task');
    }

    // Snooze is orthogonal — no status change, no transition log, no assignee change (D6/D10).
    const updated: StoredTask = {
      ...existing,
      snoozedUntil,
    };

    tasks[index] = updated;
    await this.saveTasks(tasks, familyId);

    return updated;
  }

  // ---------------------------------------------------------------------------
  // v2.0 — Manual reorder
  // ---------------------------------------------------------------------------

  async reorderTask(
    taskId: string,
    targetStatus: TaskStatus,
    sortOrder: number,
    userId: string,
    familyId: string
  ): Promise<StoredTask> {
    if (targetStatus === 'done' || targetStatus === 'cancelled') {
      throw new Error('Reorder not allowed for done or cancelled tasks');
    }

    const tasks = await this.loadTasks(familyId);
    const index = tasks.findIndex((t) => t.id === taskId);
    if (index === -1) {
      throw new Error('Task not found');
    }

    const existing = tasks[index];

    // If status is actually changing, delegate to updateTaskStatus so the
    // transition log and auto-assign behavior run — then overwrite sortOrder
    // with the caller's value (preserveSortOrder short-circuits the top-of-column logic).
    if (existing.status !== targetStatus) {
      const transitioned = await this.updateTaskStatus(
        taskId,
        targetStatus,
        userId,
        familyId,
        { preserveSortOrder: true }
      );
      // Apply caller-provided sortOrder after the transition write
      const tasksAfter = await this.loadTasks(familyId);
      const i2 = tasksAfter.findIndex((t) => t.id === taskId);
      if (i2 === -1) throw new Error('Task not found');
      tasksAfter[i2] = { ...transitioned, sortOrder };
      await this.saveTasks(tasksAfter, familyId);
      return tasksAfter[i2];
    }

    // Pure sortOrder update — no transition, no other field touched.
    const updated: StoredTask = { ...existing, sortOrder };
    tasks[index] = updated;
    await this.saveTasks(tasks, familyId);
    return updated;
  }

  // ---------------------------------------------------------------------------
  // Board query (excludes archived tasks; hides snoozed by default)
  // ---------------------------------------------------------------------------

  async getBoardTasks(
    familyId: string,
    options: { includeSnoozed?: boolean } = {}
  ): Promise<StoredTask[]> {
    const tasks = await this.loadTasks(familyId);
    const now = Date.now();
    return tasks.filter((t) => {
      if (this.isArchived(t)) return false;
      if (!options.includeSnoozed && t.snoozedUntil) {
        const until = new Date(t.snoozedUntil).getTime();
        if (Number.isFinite(until) && until > now) return false;
      }
      return true;
    });
  }

  // ---------------------------------------------------------------------------
  // Leaderboard
  // ---------------------------------------------------------------------------

  async getLeaderboard(
    familyId: string,
    timezone: string
  ): Promise<LeaderboardResponse> {
    const tasks = await this.loadTasks(familyId);
    const members = await this.familyService.getFamilyMembers(familyId);

    // Compute time boundaries in the requested timezone
    const now = new Date();
    const todayStart = getStartOfDay(now, timezone);
    const weekStart = getStartOfWeek(now, timezone);
    const monthStart = getStartOfMonth(now, timezone);

    // Initialize counts per member
    const counts = new Map<string, { today: number; week: number; month: number }>();
    for (const member of members) {
      counts.set(member.userId, { today: 0, week: 0, month: 0 });
    }

    // Scan tasks for completions.
    // v2.0 (D13): count based on most recent completedAt, attributed to the
    // user who performed that transition — but ONLY for family-scope tasks.
    // Personal tasks contribute zero to any leaderboard total.
    for (const task of tasks) {
      if (!task.completedAt) continue;
      if (task.scope !== 'family') continue;

      // Find the transition that corresponds to the most recent completedAt
      const completionTransition = findCompletionTransition(task);
      if (!completionTransition) continue;

      const completedTime = new Date(task.completedAt);
      const completedByUserId = completionTransition.userId;

      // Ensure the user has a counter (might be a former member)
      if (!counts.has(completedByUserId)) {
        counts.set(completedByUserId, { today: 0, week: 0, month: 0 });
      }
      const userCounts = counts.get(completedByUserId)!;

      if (completedTime >= monthStart) userCounts.month++;
      if (completedTime >= weekStart) userCounts.week++;
      if (completedTime >= todayStart) userCounts.today++;
    }

    // Build entries
    const memberMap = new Map(members.map((m) => [m.userId, m]));
    const entries: LeaderboardEntry[] = [];

    for (const [userId, c] of counts) {
      const member = memberMap.get(userId);
      entries.push({
        userId,
        displayName: member?.displayName ?? 'Unknown',
        completedToday: c.today,
        completedThisWeek: c.week,
        completedThisMonth: c.month,
        ...(member?.color !== undefined ? { color: member.color } : {}),
      });
    }

    // Sort by monthly completions descending as default ordering
    entries.sort((a, b) => b.completedThisMonth - a.completedThisMonth);

    return {
      entries,
      boundaries: {
        todayStart: todayStart.toISOString(),
        weekStart: weekStart.toISOString(),
        monthStart: monthStart.toISOString(),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find the transition entry that corresponds to the task's most recent
 * completedAt timestamp (the last transition to 'done').
 */
function findCompletionTransition(
  task: StoredTask
): { userId: string; timestamp: string } | null {
  if (!task.completedAt) return null;

  // Walk transitions in reverse to find the most recent 'done' transition
  for (let i = task.transitions.length - 1; i >= 0; i--) {
    const t = task.transitions[i];
    if (t.toStatus === 'done' && t.timestamp === task.completedAt) {
      return t;
    }
  }

  // Fallback: just find the last 'done' transition
  for (let i = task.transitions.length - 1; i >= 0; i--) {
    if (task.transitions[i].toStatus === 'done') {
      return task.transitions[i];
    }
  }

  return null;
}

/**
 * Get the start of today in a given IANA timezone.
 */
function getStartOfDay(now: Date, timezone: string): Date {
  const formatted = now.toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD
  return new Date(`${formatted}T00:00:00`);
}

/**
 * Get the start of the current week (Monday) in a given IANA timezone.
 */
function getStartOfWeek(now: Date, timezone: string): Date {
  // Get today's date string in the target timezone
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: timezone });
  const localDate = new Date(`${todayStr}T00:00:00`);
  const dayOfWeek = localDate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  localDate.setDate(localDate.getDate() - daysFromMonday);
  return localDate;
}

/**
 * Get the start of the current month in a given IANA timezone.
 */
function getStartOfMonth(now: Date, timezone: string): Date {
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: timezone });
  const [year, month] = todayStr.split('-');
  return new Date(`${year}-${month}-01T00:00:00`);
}
