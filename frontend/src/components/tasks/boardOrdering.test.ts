import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { StoredTask, TaskStatus } from '../../../../shared/types';
import {
  isSnoozed,
  bySortOrderAsc,
  byCompletedAtDesc,
  bySnoozeAsc,
  matchesBoardFilters,
  sortBoardForRender,
  spliceBoardForDrop,
  BOARD_COLUMNS,
  STATUS_META,
  COLUMNS,
  SNOOZED_DROPPABLE_ID,
} from './boardOrdering';

// ---------------------------------------------------------------------------
// Fixture builder — keeps tests readable and ensures every field is set, so a
// future addition to `StoredTask` forces a conscious decision here.
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<StoredTask> & { id: string }): StoredTask {
  return {
    id: overrides.id,
    familyId: 'fam-1',
    title: overrides.title ?? `task-${overrides.id}`,
    description: overrides.description ?? '',
    status: overrides.status ?? 'todo',
    scope: overrides.scope ?? 'family',
    assigneeId: overrides.assigneeId ?? null,
    dueDate: overrides.dueDate ?? null,
    createdAt: overrides.createdAt ?? '2026-04-01T00:00:00Z',
    createdBy: overrides.createdBy ?? 'user-1',
    startedAt: overrides.startedAt ?? null,
    completedAt: overrides.completedAt ?? null,
    cancelledAt: overrides.cancelledAt ?? null,
    assignedAt: overrides.assignedAt ?? null,
    transitions: overrides.transitions ?? [],
    tags: overrides.tags ?? [],
    subTasks: overrides.subTasks ?? [],
    snoozedUntil: overrides.snoozedUntil ?? null,
    sortOrder: overrides.sortOrder ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Constants — pin the shape so a rename doesn't silently break consumers.
// ---------------------------------------------------------------------------

describe('board constants', () => {
  it('BOARD_COLUMNS excludes cancelled (v2.0 — Cancelled column retired)', () => {
    expect(BOARD_COLUMNS.map((c) => c.status)).toEqual(['todo', 'started', 'done']);
    expect(BOARD_COLUMNS.map((c) => c.status)).not.toContain('cancelled');
  });

  it('COLUMNS includes all four statuses (history filter options)', () => {
    expect(COLUMNS.map((c) => c.status)).toEqual(['todo', 'started', 'done', 'cancelled']);
  });

  it('STATUS_META covers every TaskStatus', () => {
    const statuses: TaskStatus[] = ['todo', 'started', 'done', 'cancelled'];
    for (const s of statuses) {
      expect(STATUS_META[s]).toBeDefined();
      expect(STATUS_META[s].label.length).toBeGreaterThan(0);
    }
  });

  it('SNOOZED_DROPPABLE_ID is not a valid TaskStatus value', () => {
    const statuses: readonly TaskStatus[] = ['todo', 'started', 'done', 'cancelled'];
    expect(statuses).not.toContain(SNOOZED_DROPPABLE_ID as unknown as TaskStatus);
  });
});

// ---------------------------------------------------------------------------
// isSnoozed — time-sensitive, so freeze Date.
// ---------------------------------------------------------------------------

describe('isSnoozed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-23T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false when snoozedUntil is null', () => {
    expect(isSnoozed(makeTask({ id: 'a', snoozedUntil: null }))).toBe(false);
  });

  it('returns true when snoozedUntil is in the future', () => {
    expect(isSnoozed(makeTask({ id: 'a', snoozedUntil: '2026-04-24T00:00:00Z' }))).toBe(true);
  });

  it('returns false when snoozedUntil is in the past (snooze has expired)', () => {
    expect(isSnoozed(makeTask({ id: 'a', snoozedUntil: '2026-04-22T00:00:00Z' }))).toBe(false);
  });

  it('returns false when snoozedUntil equals now (non-strict: expired at this instant)', () => {
    expect(isSnoozed(makeTask({ id: 'a', snoozedUntil: '2026-04-23T12:00:00Z' }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Comparators — small but important: they drive render order and a wrong
// comparator silently reorders a user's board.
// ---------------------------------------------------------------------------

describe('bySortOrderAsc', () => {
  it('orders by sortOrder ascending', () => {
    const input = [
      makeTask({ id: 'a', sortOrder: 3 }),
      makeTask({ id: 'b', sortOrder: 1 }),
      makeTask({ id: 'c', sortOrder: 2 }),
    ];
    input.sort(bySortOrderAsc);
    expect(input.map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });

  it('treats undefined sortOrder as 0', () => {
    const input = [
      makeTask({ id: 'a', sortOrder: 5 }),
      { ...makeTask({ id: 'b' }), sortOrder: undefined as unknown as number },
      makeTask({ id: 'c', sortOrder: -1 }),
    ];
    input.sort(bySortOrderAsc);
    expect(input.map((t) => t.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('byCompletedAtDesc', () => {
  it('orders by completedAt descending (newest first)', () => {
    const input = [
      makeTask({ id: 'older', completedAt: '2026-03-01T00:00:00Z' }),
      makeTask({ id: 'newer', completedAt: '2026-04-01T00:00:00Z' }),
    ];
    input.sort(byCompletedAtDesc);
    expect(input.map((t) => t.id)).toEqual(['newer', 'older']);
  });

  it('places null completedAt last (empty string sorts before any ISO date under DESC)', () => {
    // Under DESC ordering, bb.localeCompare(ab) puts the larger value first.
    // '' is smaller than any ISO date so tasks with completedAt=null land last.
    const input = [
      makeTask({ id: 'none', completedAt: null }),
      makeTask({ id: 'dated', completedAt: '2026-04-01T00:00:00Z' }),
    ];
    input.sort(byCompletedAtDesc);
    expect(input.map((t) => t.id)).toEqual(['dated', 'none']);
  });
});

describe('bySnoozeAsc', () => {
  it('orders by snoozedUntil ascending (nearest expiry first)', () => {
    const input = [
      makeTask({ id: 'far', snoozedUntil: '2026-05-01T00:00:00Z' }),
      makeTask({ id: 'near', snoozedUntil: '2026-04-24T00:00:00Z' }),
    ];
    input.sort(bySnoozeAsc);
    expect(input.map((t) => t.id)).toEqual(['near', 'far']);
  });
});

// ---------------------------------------------------------------------------
// matchesBoardFilters — this predicate is shared between the render-time
// filter and the post-create "hidden by filters" detection, so drift between
// the two would silently hide new tasks. The tests pin the exact truth table.
// ---------------------------------------------------------------------------

describe('matchesBoardFilters', () => {
  const t = makeTask({
    id: 'a',
    assigneeId: 'user-1',
    scope: 'family',
    tags: ['home', 'urgent'],
  });

  describe('assignee filter', () => {
    it('null filter accepts all tasks', () => {
      expect(matchesBoardFilters(t, null, 'all', [])).toBe(true);
    });

    it('specific assignee accepts matching and rejects others', () => {
      expect(matchesBoardFilters(t, 'user-1', 'all', [])).toBe(true);
      expect(matchesBoardFilters(t, 'user-2', 'all', [])).toBe(false);
    });

    it('__unassigned__ accepts only tasks with null assigneeId', () => {
      const unassigned = makeTask({ id: 'b', assigneeId: null });
      expect(matchesBoardFilters(unassigned, '__unassigned__', 'all', [])).toBe(true);
      expect(matchesBoardFilters(t, '__unassigned__', 'all', [])).toBe(false);
    });
  });

  describe('scope filter', () => {
    const personalTask = makeTask({ id: 'p', scope: 'personal' });

    it('"all" accepts both scopes', () => {
      expect(matchesBoardFilters(t, null, 'all', [])).toBe(true);
      expect(matchesBoardFilters(personalTask, null, 'all', [])).toBe(true);
    });

    it('"family" rejects personal tasks', () => {
      expect(matchesBoardFilters(t, null, 'family', [])).toBe(true);
      expect(matchesBoardFilters(personalTask, null, 'family', [])).toBe(false);
    });

    it('"personal" rejects family tasks', () => {
      expect(matchesBoardFilters(t, null, 'personal', [])).toBe(false);
      expect(matchesBoardFilters(personalTask, null, 'personal', [])).toBe(true);
    });
  });

  describe('tags filter', () => {
    it('empty tags array accepts all tasks', () => {
      expect(matchesBoardFilters(t, null, 'all', [])).toBe(true);
    });

    it('requires ALL filter tags to be present (conjunction, not disjunction)', () => {
      expect(matchesBoardFilters(t, null, 'all', ['home'])).toBe(true);
      expect(matchesBoardFilters(t, null, 'all', ['home', 'urgent'])).toBe(true);
      expect(matchesBoardFilters(t, null, 'all', ['home', 'missing'])).toBe(false);
    });

    it('handles undefined task.tags as empty list', () => {
      const noTags = { ...makeTask({ id: 'c' }), tags: undefined as unknown as string[] };
      expect(matchesBoardFilters(noTags, null, 'all', ['home'])).toBe(false);
      expect(matchesBoardFilters(noTags, null, 'all', [])).toBe(true);
    });
  });

  it('combines all three filters (AND semantics)', () => {
    expect(matchesBoardFilters(t, 'user-1', 'family', ['home'])).toBe(true);
    expect(matchesBoardFilters(t, 'user-2', 'family', ['home'])).toBe(false);
    expect(matchesBoardFilters(t, 'user-1', 'personal', ['home'])).toBe(false);
    expect(matchesBoardFilters(t, 'user-1', 'family', ['missing'])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sortBoardForRender — status-group first, then per-column rule.
// ---------------------------------------------------------------------------

describe('sortBoardForRender', () => {
  it('groups by status in the order todo → started → done → cancelled', () => {
    const input = [
      makeTask({ id: 'cancelled', status: 'cancelled', cancelledAt: '2026-04-01T00:00:00Z' }),
      makeTask({ id: 'done', status: 'done', completedAt: '2026-04-01T00:00:00Z' }),
      makeTask({ id: 'started', status: 'started', sortOrder: 1 }),
      makeTask({ id: 'todo', status: 'todo', sortOrder: 1 }),
    ];
    const sorted = sortBoardForRender(input);
    expect(sorted.map((t) => t.id)).toEqual(['todo', 'started', 'done', 'cancelled']);
  });

  it('sorts todo/started by sortOrder ASC within group', () => {
    const input = [
      makeTask({ id: 'todo-late', status: 'todo', sortOrder: 3 }),
      makeTask({ id: 'todo-early', status: 'todo', sortOrder: 1 }),
      makeTask({ id: 'todo-mid', status: 'todo', sortOrder: 2 }),
    ];
    expect(sortBoardForRender(input).map((t) => t.id)).toEqual([
      'todo-early',
      'todo-mid',
      'todo-late',
    ]);
  });

  it('sorts done by completedAt DESC within group (newest first)', () => {
    const input = [
      makeTask({ id: 'old', status: 'done', completedAt: '2026-03-01T00:00:00Z' }),
      makeTask({ id: 'new', status: 'done', completedAt: '2026-04-20T00:00:00Z' }),
      makeTask({ id: 'mid', status: 'done', completedAt: '2026-04-10T00:00:00Z' }),
    ];
    expect(sortBoardForRender(input).map((t) => t.id)).toEqual(['new', 'mid', 'old']);
  });

  it('does not mutate the input array', () => {
    const input = [
      makeTask({ id: 'b', status: 'started', sortOrder: 2 }),
      makeTask({ id: 'a', status: 'todo', sortOrder: 1 }),
    ];
    const snapshot = input.map((t) => t.id);
    sortBoardForRender(input);
    expect(input.map((t) => t.id)).toEqual(snapshot);
  });
});

// ---------------------------------------------------------------------------
// spliceBoardForDrop — the drag-drop correctness landmine. If this returns
// the wrong order, the card bounces back mid-animation. Heavy coverage here.
// ---------------------------------------------------------------------------

describe('spliceBoardForDrop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-23T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the original array unchanged when taskId is not found', () => {
    const input = [makeTask({ id: 'a', status: 'todo', sortOrder: 1 })];
    const result = spliceBoardForDrop(input, 'missing', 'started', 5, 0);
    expect(result).toBe(input);
  });

  it('moves a task to the start of its destination column (destinationIndex=0)', () => {
    const input = [
      makeTask({ id: 'existing-1', status: 'started', sortOrder: 10 }),
      makeTask({ id: 'existing-2', status: 'started', sortOrder: 20 }),
      makeTask({ id: 'dragged', status: 'todo', sortOrder: 1 }),
    ];
    const result = spliceBoardForDrop(input, 'dragged', 'started', 5, 0);
    expect(result.map((t) => t.id)).toEqual(['dragged', 'existing-1', 'existing-2']);
    const dragged = result.find((t) => t.id === 'dragged');
    expect(dragged?.status).toBe('started');
    expect(dragged?.sortOrder).toBe(5);
  });

  it('moves a task into the middle of the destination column (destinationIndex=1)', () => {
    const input = [
      makeTask({ id: 'existing-1', status: 'started', sortOrder: 10 }),
      makeTask({ id: 'existing-2', status: 'started', sortOrder: 20 }),
      makeTask({ id: 'dragged', status: 'todo', sortOrder: 1 }),
    ];
    const result = spliceBoardForDrop(input, 'dragged', 'started', 15, 1);
    expect(result.map((t) => t.id)).toEqual(['existing-1', 'dragged', 'existing-2']);
  });

  it('appends to the end when destinationIndex equals the column length', () => {
    const input = [
      makeTask({ id: 'existing-1', status: 'started', sortOrder: 10 }),
      makeTask({ id: 'existing-2', status: 'started', sortOrder: 20 }),
      makeTask({ id: 'dragged', status: 'todo', sortOrder: 1 }),
    ];
    const result = spliceBoardForDrop(input, 'dragged', 'started', 25, 2);
    expect(result.map((t) => t.id)).toEqual(['existing-1', 'existing-2', 'dragged']);
  });

  it('skips snoozed items when counting the destination index', () => {
    // Snoozed items are in the array but render in the Snoozed column, NOT in
    // their status column. destinationIndex=0 should target the first VISIBLE
    // item in the started column, which is the second array item.
    const input = [
      makeTask({
        id: 'snoozed',
        status: 'started',
        snoozedUntil: '2026-04-24T00:00:00Z',
        sortOrder: 5,
      }),
      makeTask({ id: 'visible-1', status: 'started', sortOrder: 10 }),
      makeTask({ id: 'visible-2', status: 'started', sortOrder: 20 }),
      makeTask({ id: 'dragged', status: 'todo', sortOrder: 1 }),
    ];
    const result = spliceBoardForDrop(input, 'dragged', 'started', 8, 0);
    // dragged should land before visible-1 (the first visible), not before snoozed
    const draggedIdx = result.findIndex((t) => t.id === 'dragged');
    const visible1Idx = result.findIndex((t) => t.id === 'visible-1');
    const snoozedIdx = result.findIndex((t) => t.id === 'snoozed');
    expect(draggedIdx).toBeLessThan(visible1Idx);
    expect(draggedIdx).toBeGreaterThan(snoozedIdx);
  });

  it('reorders within the same column (no status change)', () => {
    const input = [
      makeTask({ id: 'a', status: 'todo', sortOrder: 1 }),
      makeTask({ id: 'b', status: 'todo', sortOrder: 2 }),
      makeTask({ id: 'c', status: 'todo', sortOrder: 3 }),
    ];
    // Drag 'c' to the top of todo. After removing 'c': [a, b]. destinationIndex=0
    // → insert before 'a'.
    const result = spliceBoardForDrop(input, 'c', 'todo', 0.5, 0);
    expect(result.map((t) => t.id)).toEqual(['c', 'a', 'b']);
  });

  it('handles dragging into an empty destination column', () => {
    const input = [
      makeTask({ id: 'dragged', status: 'todo', sortOrder: 1 }),
      makeTask({ id: 'other', status: 'started', sortOrder: 10 }),
    ];
    const result = spliceBoardForDrop(input, 'dragged', 'done', 5, 0);
    // 'done' column is empty — dragged should be in the result with status=done
    const dragged = result.find((t) => t.id === 'dragged');
    expect(dragged?.status).toBe('done');
    expect(dragged?.sortOrder).toBe(5);
    expect(result).toHaveLength(2);
  });

  it('updates status and sortOrder on the moved task', () => {
    const input = [makeTask({ id: 'x', status: 'todo', sortOrder: 1 })];
    const result = spliceBoardForDrop(input, 'x', 'done', 99, 0);
    expect(result[0]).toMatchObject({ id: 'x', status: 'done', sortOrder: 99 });
  });

  it('preserves other fields on the moved task', () => {
    const input = [
      makeTask({
        id: 'x',
        status: 'todo',
        sortOrder: 1,
        title: 'Important task',
        tags: ['home'],
        assigneeId: 'user-1',
      }),
    ];
    const result = spliceBoardForDrop(input, 'x', 'started', 5, 0);
    expect(result[0]).toMatchObject({
      title: 'Important task',
      tags: ['home'],
      assigneeId: 'user-1',
    });
  });

  it('inserts after the last item of the column when destinationIndex overshoots', () => {
    // Defensive: if pangea gives us an index past the visible column end, the
    // fallback branch should place the card at the end of the column (not at
    // the array end, which would break status-group contiguity).
    const input = [
      makeTask({ id: 'col-1', status: 'started', sortOrder: 10 }),
      makeTask({ id: 'col-2', status: 'started', sortOrder: 20 }),
      makeTask({ id: 'other-col', status: 'done', completedAt: '2026-04-01T00:00:00Z' }),
      makeTask({ id: 'dragged', status: 'todo', sortOrder: 1 }),
    ];
    const result = spliceBoardForDrop(input, 'dragged', 'started', 30, 99);
    // dragged should land after col-2 but before other-col (end of started group)
    const ids = result.map((t) => t.id);
    const draggedIdx = ids.indexOf('dragged');
    expect(ids.indexOf('col-2')).toBeLessThan(draggedIdx);
    expect(draggedIdx).toBeLessThan(ids.indexOf('other-col'));
  });
});
