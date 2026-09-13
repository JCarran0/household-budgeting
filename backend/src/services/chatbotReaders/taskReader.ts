/**
 * Task Reads for AI Tools (T0) — AI-CAPABILITY-PLATFORM-BRD §9.2.
 *
 * Closes the asymmetry that create_task shipped with: the assistant could write
 * a task but could not read one, so it wrote blind. Read-first/write-second
 * (REQ-P080) means this lands before any further task write action.
 *
 * SCOPE NOTE — 'personal' is NOT a privacy boundary:
 * TaskScope is 'family' | 'personal', and it is tempting to read the second as
 * "mine only". It is not. GET /tasks returns getAllTasks(familyId) with no user
 * filter, so both household members already see every personal task in the UI.
 * The distinction is about leaderboard credit (personal tasks earn none), not
 * visibility. This tool therefore exposes nothing the requesting user cannot
 * already see. If scope ever becomes a real privacy boundary, this comment is
 * the thing that must fail review.
 */

import type { StoredTask, TaskStatus, TaskScope } from '../../shared/types';
import { getFamilyMemberNames, describeAssignee, type FamilyMemberDataReader } from './familyMemberReader';

export interface TaskDataReader extends FamilyMemberDataReader {
  getData<T>(key: string): Promise<T | null>;
}

/** Hard ceiling on rows returned to the model, regardless of `limit`. */
export const TASK_RESULT_HARD_MAX = 200;
const TASK_RESULT_DEFAULT_LIMIT = 50;

export interface QueryTasksInput {
  status?: TaskStatus[];
  scope?: TaskScope;
  assigneeId?: string;
  unassignedOnly?: boolean;
  overdueOnly?: boolean;
  dueBefore?: string;
  dueAfter?: string;
  includeSnoozed?: boolean;
  tags?: string[];
  searchQuery?: string;
  limit?: number;
}

export interface TaskLineForTool {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  scope: TaskScope;
  assignee: { userId: string | null; name: string | null; unresolved: boolean };
  dueDate: string | null;
  /** Explicit rather than inferred from dueDate, so the model never does date math. */
  isOverdue: boolean;
  snoozedUntil: string | null;
  isSnoozed: boolean;
  tags: string[];
  subTaskSummary: { total: number; completed: number };
  createdAt: string;
  completedAt: string | null;
}

export interface QueryTasksToolResult {
  /** TOTAL matches before the cap — not the length of `tasks`. */
  count: number;
  truncated: boolean;
  limit: number;
  /** Echoes the effective filter so the model can tell an empty result from a bad filter. */
  appliedFilters: Record<string, unknown>;
  tasks: TaskLineForTool[];
  /** Counts over the FULL match set, so aggregate questions need no second call. */
  summary: {
    byStatus: Record<TaskStatus, number>;
    overdue: number;
    snoozed: number;
    unassigned: number;
  };
}

function isSnoozed(task: StoredTask, now: Date): boolean {
  if (!task.snoozedUntil) return false;
  return new Date(task.snoozedUntil).getTime() > now.getTime();
}

/**
 * Overdue means: has a due date, that date is in the past, and the task is not
 * already finished. A done task with a past due date is not overdue — it is done.
 */
function isOverdue(task: StoredTask, today: string): boolean {
  if (!task.dueDate) return false;
  if (task.status === 'done' || task.status === 'cancelled') return false;
  return task.dueDate < today;
}

function matchesSearch(task: StoredTask, query: string): boolean {
  const q = query.toLowerCase();
  return (
    task.title.toLowerCase().includes(q) ||
    task.description.toLowerCase().includes(q) ||
    task.tags.some(t => t.toLowerCase().includes(q))
  );
}

export class ChatbotTaskReader {
  constructor(private readonly dataService: TaskDataReader) {}

  async queryTasks(
    familyId: string,
    input: QueryTasksInput,
    now: Date = new Date(),
  ): Promise<QueryTasksToolResult> {
    const all = (await this.dataService.getData<StoredTask[]>(`tasks_${familyId}`)) ?? [];
    const today = now.toISOString().slice(0, 10);

    let results = all;

    if (input.status && input.status.length > 0) {
      const wanted = new Set(input.status);
      results = results.filter(t => wanted.has(t.status));
    }
    if (input.scope) {
      results = results.filter(t => t.scope === input.scope);
    }
    if (input.assigneeId) {
      results = results.filter(t => t.assigneeId === input.assigneeId);
    }
    if (input.unassignedOnly) {
      results = results.filter(t => t.assigneeId === null);
    }
    if (input.overdueOnly) {
      results = results.filter(t => isOverdue(t, today));
    }
    if (input.dueBefore) {
      results = results.filter(t => t.dueDate !== null && t.dueDate < input.dueBefore!);
    }
    if (input.dueAfter) {
      results = results.filter(t => t.dueDate !== null && t.dueDate > input.dueAfter!);
    }
    // Snoozed tasks are hidden from the board by default, so they are hidden
    // here by default too — a tool that disagrees with the UI about what is
    // "on the list" is worse than no tool.
    if (!input.includeSnoozed) {
      results = results.filter(t => !isSnoozed(t, now));
    }
    if (input.tags && input.tags.length > 0) {
      const wanted = input.tags.map(t => t.toLowerCase());
      results = results.filter(t => t.tags.some(tag => wanted.includes(tag.toLowerCase())));
    }
    if (input.searchQuery) {
      results = results.filter(t => matchesSearch(t, input.searchQuery!));
    }

    const names = await getFamilyMemberNames(this.dataService, familyId);

    const summary = {
      byStatus: { todo: 0, started: 0, done: 0, cancelled: 0 } as Record<TaskStatus, number>,
      overdue: 0,
      snoozed: 0,
      unassigned: 0,
    };
    for (const t of results) {
      summary.byStatus[t.status] += 1;
      if (isOverdue(t, today)) summary.overdue += 1;
      if (isSnoozed(t, now)) summary.snoozed += 1;
      if (t.assigneeId === null) summary.unassigned += 1;
    }

    const requested = input.limit ?? TASK_RESULT_DEFAULT_LIMIT;
    const limit = Math.max(1, Math.min(requested, TASK_RESULT_HARD_MAX));

    // Sort before capping so the cap keeps the most actionable rows: overdue
    // first, then soonest-due, then most recently created.
    const sorted = [...results].sort((a, b) => {
      const aOver = isOverdue(a, today) ? 0 : 1;
      const bOver = isOverdue(b, today) ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      return a.createdAt < b.createdAt ? 1 : -1;
    });

    return {
      count: results.length,
      truncated: results.length > limit,
      limit,
      appliedFilters: {
        status: input.status ?? null,
        scope: input.scope ?? null,
        assigneeId: input.assigneeId ?? null,
        unassignedOnly: input.unassignedOnly ?? false,
        overdueOnly: input.overdueOnly ?? false,
        dueBefore: input.dueBefore ?? null,
        dueAfter: input.dueAfter ?? null,
        includeSnoozed: input.includeSnoozed ?? false,
        tags: input.tags ?? null,
        searchQuery: input.searchQuery ?? null,
      },
      tasks: sorted.slice(0, limit).map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        scope: t.scope,
        assignee: describeAssignee(t.assigneeId, names),
        dueDate: t.dueDate,
        isOverdue: isOverdue(t, today),
        snoozedUntil: t.snoozedUntil,
        isSnoozed: isSnoozed(t, now),
        tags: t.tags,
        subTaskSummary: {
          total: t.subTasks.length,
          completed: t.subTasks.filter(s => s.completed).length,
        },
        createdAt: t.createdAt,
        completedAt: t.completedAt,
      })),
      summary,
    };
  }

  /** Roster for "who can I assign this to?" — names, not a user record. */
  async getFamilyMembers(familyId: string): Promise<{ members: { userId: string; displayName: string }[] }> {
    const names = await getFamilyMemberNames(this.dataService, familyId);
    return { members: [...names].map(([userId, displayName]) => ({ userId, displayName })) };
  }
}
