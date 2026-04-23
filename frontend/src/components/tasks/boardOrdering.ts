import type { StoredTask, TaskStatus } from '../../../../shared/types';

/** Rendered Kanban columns (v2.0: Cancelled column retired). */
export const BOARD_COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'todo', label: 'Todo', color: 'blue' },
  { status: 'started', label: 'Started', color: 'yellow' },
  { status: 'done', label: 'Done', color: 'green' },
];

/** Droppable id for the synthetic Snoozed column (not a TaskStatus). */
export const SNOOZED_DROPPABLE_ID = '__snoozed__';

/** Full status → {label, color} map for badges and history filter options. */
export const STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  todo: { label: 'Todo', color: 'blue' },
  started: { label: 'Started', color: 'yellow' },
  done: { label: 'Done', color: 'green' },
  cancelled: { label: 'Cancelled', color: 'gray' },
};

/** Legacy export for places that still want the array form. */
export const COLUMNS = (Object.keys(STATUS_META) as TaskStatus[]).map((status) => ({
  status,
  label: STATUS_META[status].label,
  color: STATUS_META[status].color,
}));

/** A task is "currently snoozed" if snoozedUntil is set and in the future. */
export function isSnoozed(task: StoredTask): boolean {
  if (!task.snoozedUntil) return false;
  return new Date(task.snoozedUntil).getTime() > Date.now();
}

/** sortOrder ASC — for todo/started columns. Stable, handles undefined. */
export function bySortOrderAsc(a: StoredTask, b: StoredTask): number {
  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
}

/** completedAt DESC — for the Done column. */
export function byCompletedAtDesc(a: StoredTask, b: StoredTask): number {
  const ab = a.completedAt ?? '';
  const bb = b.completedAt ?? '';
  return bb.localeCompare(ab);
}

/** snoozedUntil ASC — for the Snoozed column (nearest expiry first). */
export function bySnoozeAsc(a: StoredTask, b: StoredTask): number {
  return (a.snoozedUntil ?? '').localeCompare(b.snoozedUntil ?? '');
}

/**
 * Predicate for the Board view filter bar (assignee + scope + tags). Shared
 * between the render-time filter and the post-create "hidden by filters"
 * detection so they can't drift.
 */
export function matchesBoardFilters(
  t: StoredTask,
  filterAssignee: string | null,
  filterScope: string,
  filterTags: string[],
): boolean {
  if (filterAssignee === '__unassigned__') {
    if (t.assigneeId !== null) return false;
  } else if (filterAssignee && t.assigneeId !== filterAssignee) {
    return false;
  }
  if (filterScope === 'family' && t.scope !== 'family') return false;
  if (filterScope === 'personal' && t.scope !== 'personal') return false;
  if (filterTags.length > 0) {
    const taskTags = t.tags ?? [];
    if (!filterTags.every((tag) => taskTags.includes(tag))) return false;
  }
  return true;
}

export const STATUS_GROUP_ORDER: Record<TaskStatus, number> = {
  todo: 0,
  started: 1,
  done: 2,
  cancelled: 3,
};

/**
 * Sort the full flat board array into render order:
 *   status group (todo → started → done → cancelled), then per-column rule.
 * Done once on server data receipt; subsequent local mutations splice rather
 * than re-sort to avoid racing pangea-dnd's drop animation.
 */
export function sortBoardForRender(tasks: StoredTask[]): StoredTask[] {
  const next = [...tasks];
  next.sort((a, b) => {
    if (a.status !== b.status) {
      return STATUS_GROUP_ORDER[a.status] - STATUS_GROUP_ORDER[b.status];
    }
    if (a.status === 'done' || a.status === 'cancelled') {
      return byCompletedAtDesc(a, b);
    }
    return bySortOrderAsc(a, b);
  });
  return next;
}

/**
 * Splice a task into its new position in the flat board array, producing an
 * array whose render order matches pangea-dnd's post-drop expectation.
 *
 * `destinationIndex` is the index within the destination column as rendered
 * (snoozed items excluded, user filters NOT applied — see caller).
 */
export function spliceBoardForDrop(
  prev: StoredTask[],
  taskId: string,
  newStatus: TaskStatus,
  newSortOrder: number,
  destinationIndex: number,
): StoredTask[] {
  const without: StoredTask[] = [];
  let removed: StoredTask | null = null;
  for (const t of prev) {
    if (t.id === taskId) removed = t;
    else without.push(t);
  }
  if (!removed) return prev;

  const updated: StoredTask = { ...removed, status: newStatus, sortOrder: newSortOrder };

  // Walk `without`, counting items that render in the destination column,
  // and find the insertion point matching `destinationIndex`.
  let seenInColumn = 0;
  let insertAt = without.length; // default: end of array
  for (let i = 0; i < without.length; i++) {
    const t = without[i];
    if (t.status !== newStatus) continue;
    if (isSnoozed(t)) continue;
    if (seenInColumn === destinationIndex) {
      insertAt = i;
      break;
    }
    seenInColumn++;
  }
  // If we filled the column without hitting destinationIndex, insert after the
  // last item of that column (preserves group contiguity).
  if (insertAt === without.length && seenInColumn > 0 && seenInColumn <= destinationIndex) {
    for (let i = without.length - 1; i >= 0; i--) {
      if (without[i].status === newStatus && !isSnoozed(without[i])) {
        insertAt = i + 1;
        break;
      }
    }
  }

  return [...without.slice(0, insertAt), updated, ...without.slice(insertAt)];
}
