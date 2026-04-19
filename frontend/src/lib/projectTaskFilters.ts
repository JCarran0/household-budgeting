/**
 * Utility: filter tasks for a project's Tasks tab.
 *
 * Applies two rules (D6, D8 from PROJECTS-ENHANCEMENTS-PLAN.yaml):
 *   - D6: task must have the project tag in its tags[] array
 *   - D8: tasks that have been done/cancelled for more than 14 days are excluded
 *         (same archiving rule as the Kanban board, from TASK-MANAGEMENT-BRD §3.4)
 */

import type { StoredTask } from '../../../shared/types';

const ARCHIVE_AFTER_MS = 14 * 24 * 60 * 60 * 1000; // 14 days in ms

/**
 * Returns the subset of `tasks` that belong to `projectTag` and are not archived.
 *
 * @param tasks      Full task list (all statuses)
 * @param projectTag The project's tag string, e.g. "project:kitchen-reno:2026"
 * @param now        Reference timestamp (injectable for unit testing)
 */
export function filterTasksForProject(
  tasks: StoredTask[],
  projectTag: string,
  now: Date = new Date()
): StoredTask[] {
  const cutoff = new Date(now.getTime() - ARCHIVE_AFTER_MS);

  return tasks.filter((task) => {
    // Must carry the project tag
    if (!(task.tags ?? []).includes(projectTag)) return false;

    // Archive rule: done/cancelled tasks older than 14 days are hidden
    if (task.status === 'done' && task.completedAt) {
      if (new Date(task.completedAt) < cutoff) return false;
    }
    if (task.status === 'cancelled' && task.cancelledAt) {
      if (new Date(task.cancelledAt) < cutoff) return false;
    }

    return true;
  });
}

/**
 * Compute the completion summary counts from an already-filtered task list.
 * Returns { completed, total } where:
 *   - completed = count of tasks with status 'done'
 *   - total     = count of all tasks in the filtered list (regardless of status)
 */
export function computeProjectTaskSummary(tasks: StoredTask[]): {
  completed: number;
  total: number;
} {
  return {
    completed: tasks.filter((t) => t.status === 'done').length,
    total: tasks.length,
  };
}
