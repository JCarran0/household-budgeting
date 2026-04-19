/**
 * Unit tests for the filterTasksForProject / computeProjectTaskSummary helpers.
 *
 * These are pure functions with no React or frontend dependencies, so they can
 * be tested in the backend jest environment.
 *
 * The helpers live in frontend/src/lib/projectTaskFilters.ts but the logic is
 * portable — we re-implement a local copy here so the backend test suite can
 * run it without pulling in React.
 *
 * NOTE: if the helper is ever extracted to shared/utils, update this import.
 */

// ---------------------------------------------------------------------------
// Inline copy of the helper (mirrors frontend/src/lib/projectTaskFilters.ts)
// so we don't take a dependency on the frontend module graph.
// ---------------------------------------------------------------------------

import type { StoredTask } from '../../shared/types';

const ARCHIVE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

function filterTasksForProject(
  tasks: StoredTask[],
  projectTag: string,
  now: Date = new Date()
): StoredTask[] {
  const cutoff = new Date(now.getTime() - ARCHIVE_AFTER_MS);

  return tasks.filter((task) => {
    if (!(task.tags ?? []).includes(projectTag)) return false;

    if (task.status === 'done' && task.completedAt) {
      if (new Date(task.completedAt) < cutoff) return false;
    }
    if (task.status === 'cancelled' && task.cancelledAt) {
      if (new Date(task.cancelledAt) < cutoff) return false;
    }

    return true;
  });
}

function computeProjectTaskSummary(tasks: StoredTask[]) {
  return {
    completed: tasks.filter((t) => t.status === 'done').length,
    total: tasks.length,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT_TAG = 'project:kitchen-reno:2026';
const OTHER_TAG = 'project:bath-reno:2026';

const NOW = new Date('2026-05-01T12:00:00Z');
const RECENT = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days ago
const OLD = new Date(NOW.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(); // 20 days ago

function makeTask(overrides: Partial<StoredTask>): StoredTask {
  return {
    id: Math.random().toString(36).substring(2),
    familyId: 'fam1',
    title: 'Task',
    description: '',
    status: 'todo',
    scope: 'family',
    assigneeId: null,
    dueDate: null,
    createdAt: NOW.toISOString(),
    createdBy: 'user1',
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    assignedAt: null,
    transitions: [],
    tags: [],
    subTasks: [],
    snoozedUntil: null,
    sortOrder: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('filterTasksForProject', () => {
  it('excludes tasks that do not carry the project tag', () => {
    const task = makeTask({ tags: ['unrelated-tag'] });
    expect(filterTasksForProject([task], PROJECT_TAG, NOW)).toHaveLength(0);
  });

  it('excludes tasks with no tags', () => {
    const task = makeTask({ tags: [] });
    expect(filterTasksForProject([task], PROJECT_TAG, NOW)).toHaveLength(0);
  });

  it('includes tasks carrying the project tag', () => {
    const task = makeTask({ tags: [PROJECT_TAG] });
    const result = filterTasksForProject([task], PROJECT_TAG, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(task.id);
  });

  it('includes a done task completed < 14 days ago', () => {
    const task = makeTask({ tags: [PROJECT_TAG], status: 'done', completedAt: RECENT });
    expect(filterTasksForProject([task], PROJECT_TAG, NOW)).toHaveLength(1);
  });

  it('excludes a done task completed > 14 days ago', () => {
    const task = makeTask({ tags: [PROJECT_TAG], status: 'done', completedAt: OLD });
    expect(filterTasksForProject([task], PROJECT_TAG, NOW)).toHaveLength(0);
  });

  it('includes a cancelled task cancelled < 14 days ago', () => {
    const task = makeTask({ tags: [PROJECT_TAG], status: 'cancelled', cancelledAt: RECENT });
    expect(filterTasksForProject([task], PROJECT_TAG, NOW)).toHaveLength(1);
  });

  it('excludes a cancelled task cancelled > 14 days ago', () => {
    const task = makeTask({ tags: [PROJECT_TAG], status: 'cancelled', cancelledAt: OLD });
    expect(filterTasksForProject([task], PROJECT_TAG, NOW)).toHaveLength(0);
  });

  it('always includes todo tasks regardless of age', () => {
    const task = makeTask({ tags: [PROJECT_TAG], status: 'todo', createdAt: OLD });
    expect(filterTasksForProject([task], PROJECT_TAG, NOW)).toHaveLength(1);
  });

  it('always includes started tasks regardless of age', () => {
    const task = makeTask({ tags: [PROJECT_TAG], status: 'started', startedAt: OLD });
    expect(filterTasksForProject([task], PROJECT_TAG, NOW)).toHaveLength(1);
  });

  it('handles a mixed set and returns only the expected subset', () => {
    const tasks: StoredTask[] = [
      makeTask({ tags: [PROJECT_TAG], status: 'todo' }),                        // included
      makeTask({ tags: [PROJECT_TAG], status: 'done', completedAt: RECENT }),    // included (recent)
      makeTask({ tags: [PROJECT_TAG], status: 'done', completedAt: OLD }),       // excluded (archived)
      makeTask({ tags: [OTHER_TAG], status: 'todo' }),                           // excluded (wrong project)
      makeTask({ tags: [] }),                                                     // excluded (no tag)
    ];

    const result = filterTasksForProject(tasks, PROJECT_TAG, NOW);
    expect(result).toHaveLength(2);
    expect(result.every((t) => t.tags.includes(PROJECT_TAG))).toBe(true);
  });
});

describe('computeProjectTaskSummary', () => {
  it('returns 0/0 for empty list', () => {
    expect(computeProjectTaskSummary([])).toEqual({ completed: 0, total: 0 });
  });

  it('counts total correctly across all statuses', () => {
    const tasks = [
      makeTask({ status: 'todo' }),
      makeTask({ status: 'started' }),
      makeTask({ status: 'done' }),
      makeTask({ status: 'cancelled' }),
    ];
    expect(computeProjectTaskSummary(tasks).total).toBe(4);
  });

  it('counts only done tasks as completed', () => {
    const tasks = [
      makeTask({ status: 'done' }),
      makeTask({ status: 'done' }),
      makeTask({ status: 'cancelled' }),
      makeTask({ status: 'todo' }),
    ];
    expect(computeProjectTaskSummary(tasks)).toEqual({ completed: 2, total: 4 });
  });
});
