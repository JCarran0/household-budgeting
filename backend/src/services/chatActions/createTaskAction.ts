/**
 * create_task Chat Action
 *
 * Registers the create_task action in the chat action registry.
 *
 * SECURITY (SEC-A001, SEC-A002): Handler receives userId and familyId from
 * ChatActionHandlerContext (populated from JWT), never from LLM output or
 * request body.
 *
 * SECURITY (SEC-A003, SEC-A004): Validation is the createTaskSchema re-used
 * from the HTTP route — single source of truth. Business rules inside
 * taskService.createTask are the same ones applied to direct HTTP callers.
 */

import { registerChatAction } from './registry';
// Re-use the EXACT same schema exported from the tasks route — one source of
// truth for task validation whether the caller is HTTP or chat. (SEC-A004)
import { createTaskSchema } from '../../routes/tasks';
import { taskService } from '../index';
import type { CreateTaskDto } from '../../shared/types';

registerChatAction<CreateTaskDto>({
  actionId: 'create_task',
  label: 'Create a task',
  // T1: creating a task is a user-authored record, not metadata, so it is
  // permanently outside the unattended tier (SEC-P003).
  tier: 'T1',
  dataClass: 'content',
  paramsSchema: createTaskSchema,
  /**
   * REQ-P025 – REQ-P027. Undoing a CREATE means removing what was created,
   * which is the one undo in this system that destroys a record rather than
   * restoring one. Two things make that safe:
   *
   *   - `recordId: null` at capture time, because the task does not exist yet.
   *     The confirm route fills the id in from the resource execute returns.
   *   - The fingerprint check, which is doing real work here rather than being
   *     a formality. If either household member has touched the task since —
   *     retitled it, assigned it, ticked a subtask — the record no longer
   *     matches what the AI created, and undo skips it. Deleting a task
   *     somebody has since filled in would be the worst outcome this feature
   *     could produce, and it is exactly what an unchecked "undo a create"
   *     would do.
   */
  undo: {
    kind: 'task',
    async capture() {
      // `before: null` means "did not exist", so restore removes it.
      return { recordId: null, before: null };
    },
    async read(recordId, ctx) {
      const task = await taskService.getTask(recordId, ctx.familyId);
      if (!task) return null;
      return {
        title: task.title,
        description: task.description,
        scope: task.scope,
        assigneeId: task.assigneeId,
        dueDate: task.dueDate,
        status: task.status,
        tags: [...task.tags],
        subTasks: task.subTasks.map(s => ({ ...s })),
      };
    },
    async restore(recordId, _before, ctx) {
      await taskService.deleteTask(recordId, ctx.familyId);
    },
  },

  async execute(params, ctx) {
    const task = await taskService.createTask(params, ctx.userId, ctx.familyId);
    return {
      type: 'task',
      id: task.id,
      url: `/tasks?taskId=${task.id}`,
      label: task.title,
    };
  },
});
