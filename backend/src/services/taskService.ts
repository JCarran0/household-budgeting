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
import { DataService } from './dataService';
import { FamilyService } from './familyService';

/** Number of days after which done/cancelled tasks are archived from the board */
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
    }
    return tasks;
  }

  private async saveTasks(tasks: StoredTask[], familyId: string): Promise<void> {
    await this.dataService.saveData(`tasks_${familyId}`, tasks);
  }

  /**
   * Check whether a task should be hidden from the active board.
   * Tasks in done/cancelled for more than ARCHIVE_AFTER_DAYS are archived.
   */
  private isArchived(task: StoredTask): boolean {
    if (task.status !== 'done' && task.status !== 'cancelled') return false;

    const terminalTimestamp = task.status === 'done' ? task.completedAt : task.cancelledAt;
    if (!terminalTimestamp) return false;

    const terminalDate = new Date(terminalTimestamp);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - ARCHIVE_AFTER_DAYS);

    return terminalDate < cutoff;
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
    };

    const tasks = await this.loadTasks(familyId);
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
    familyId: string
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
    let { startedAt, completedAt, cancelledAt, assigneeId, assignedAt } = existing;

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
        break;
      case 'cancelled':
        cancelledAt = now;
        completedAt = null;
        break;
    }

    const updated: StoredTask = {
      ...existing,
      status: newStatus,
      startedAt,
      completedAt,
      cancelledAt,
      assigneeId,
      assignedAt,
      transitions: [...existing.transitions, transition],
    };

    tasks[index] = updated;
    await this.saveTasks(tasks, familyId);

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Board query (excludes archived tasks)
  // ---------------------------------------------------------------------------

  async getBoardTasks(familyId: string): Promise<StoredTask[]> {
    const tasks = await this.loadTasks(familyId);
    return tasks.filter((t) => !this.isArchived(t));
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
    // Per BRD: count based on most recent completedAt, attributed to the user
    // who performed that transition.
    for (const task of tasks) {
      if (!task.completedAt) continue;

      // Find the transition that corresponds to the most recent completedAt
      const completionTransition = findCompletionTransition(task);
      if (!completionTransition) continue;

      const completedTime = new Date(task.completedAt);
      const completedByUserId = completionTransition.userId;

      // Personal tasks count only for the creator
      if (task.scope === 'personal' && completedByUserId !== task.createdBy) continue;

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
