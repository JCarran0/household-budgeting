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
  paramsSchema: createTaskSchema,
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
