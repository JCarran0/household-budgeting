/**
 * complete_task Chat Action (T1)
 *
 * AI-CAPABILITY-PLATFORM-BRD §9.2, Phase 3.
 *
 * WHY THIS IS PERMANENTLY T1 AND NEVER T2:
 * Completing a task credits the household leaderboard. An unattended
 * completion would silently award points in a shared, competitive record that
 * the other member can see but did not agree to — and "reversible in one click"
 * (SEC-P001) does not save it, because the badge, the streak and the standing
 * were already visible to a person by the time anyone noticed. The BRD lists
 * this capability explicitly as never-T2; the tier below is the enforcement,
 * and REQ-P015's fixed T2 list is the second lock.
 *
 * SCOPE IS DELIBERATELY NARROW: this action completes a task and does nothing
 * else. It cannot cancel one, cannot reopen one, and cannot set an arbitrary
 * status. A general set_task_status would be the same tier and no harder to
 * build, but it would let a mis-parsed instruction cancel work rather than
 * finish it, and cancellation is the state a user is least likely to notice on
 * a card they are skimming. Widening this is a deliberate decision, not a
 * refactor.
 */

import { z } from 'zod';
import { registerChatAction } from './registry';
import { taskService } from '../index';

const completeTaskParamsSchema = z.object({
  taskId: z.string().min(1),
});

type CompleteTaskActionParams = z.infer<typeof completeTaskParamsSchema>;

registerChatAction<CompleteTaskActionParams>({
  actionId: 'complete_task',
  label: 'Mark a task complete',
  tier: 'T1',
  dataClass: 'content',
  paramsSchema: completeTaskParamsSchema,

  /** SEC-P030: the id must name a real task in THIS family before anything runs. */
  async validateSemantics(params, ctx) {
    const task = await taskService.getTask(params.taskId, ctx.familyId);
    if (!task) {
      throw new Error(`That task no longer exists (${params.taskId}).`);
    }
    if (task.status === 'done') {
      // Not an error state in the service, but re-completing would append a
      // second transition and re-stamp completedAt — which moves the task in
      // the leaderboard's eyes for something that already happened.
      throw new Error(`"${task.title}" is already complete.`);
    }
  },

  /**
   * SEC-P011. The value being replaced here is the STATUS, and showing it
   * matters more than it looks: "mark the trash task done" is ambiguous when
   * two trash tasks exist, and the current status plus assignee is what lets
   * the user tell on the card whether the row picked the right one.
   */
  async describeCurrent(params, ctx) {
    const task = await taskService.getTask(params.taskId, ctx.familyId);
    if (!task) return null;
    return [
      { key: 'taskId', label: 'Task', value: task.title, editable: false, type: 'text' },
      { key: 'status', label: 'Current status', value: task.status, editable: false, type: 'text' },
    ];
  },

  /**
   * REQ-P025. Only the status needs restoring, and the leaderboard is the
   * reason that is exactly enough: credit is computed statelessly from
   * task.completedAt, and updateTaskStatus nulls completedAt on any transition
   * back out of 'done'. Restoring the status therefore withdraws the
   * leaderboard credit as a consequence, with no separate un-crediting step
   * that could drift out of sync with it.
   */
  undo: {
    kind: 'task',
    async capture(params, ctx) {
      const task = await taskService.getTask(params.taskId, ctx.familyId);
      if (!task) return null;
      return { recordId: task.id, before: { status: task.status } };
    },
    async read(recordId, ctx) {
      const task = await taskService.getTask(recordId, ctx.familyId);
      return task ? { status: task.status } : null;
    },
    async restore(recordId, before, ctx) {
      const prior = before as { status: 'todo' | 'started' | 'done' | 'cancelled' };
      await taskService.updateTaskStatus(recordId, prior.status, ctx.userId, ctx.familyId);
    },
  },

  async execute(params, ctx) {
    const task = await taskService.updateTaskStatus(params.taskId, 'done', ctx.userId, ctx.familyId);
    return {
      type: 'task',
      id: task.id,
      url: `/tasks?taskId=${task.id}`,
      label: task.title,
    };
  },
});
