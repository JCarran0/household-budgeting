/**
 * update_task Chat Action (T1)
 *
 * AI-CAPABILITY-PLATFORM-BRD §9.2, Phase 3. The first UPDATE action in the
 * registry, which makes it the first implementer of two hooks that until now
 * had no production caller:
 *
 *   - describeCurrent (SEC-P011) — creates have nothing to overwrite, so the
 *     before/after display on the plan card has never rendered real data.
 *     An update is exactly the case the requirement was written for: the user
 *     needs to see what they are replacing, not only what it becomes.
 *   - validateSemantics (SEC-P030) — a well-formed taskId is not a real task,
 *     and a well-formed assigneeId is not necessarily someone in this family.
 *
 * SECURITY (SEC-A001/A002): userId and familyId come from the grant, which came
 * from the JWT. The model supplies only the taskId and the fields to change,
 * and both are resolved against family-scoped data before anything is written.
 *
 * SECURITY (SEC-A004 / REQ-P011): params re-use updateTaskSchema exported from
 * routes/tasks.ts, so tightening validation there applies here automatically.
 * The only addition is `taskId`, which the HTTP route carries in its URL path
 * rather than its body — the identifier has to arrive somehow, and adding it
 * here keeps the field rules themselves single-sourced.
 */

import { z } from 'zod';
import { registerChatAction } from './registry';
import { updateTaskSchema } from '../../routes/tasks';
import { taskService, familyService } from '../index';
import type { StoredTask } from '../../shared/types';

const updateTaskParamsSchema = updateTaskSchema.extend({
  taskId: z.string().min(1),
});

type UpdateTaskActionParams = z.infer<typeof updateTaskParamsSchema>;

/**
 * The fields update_task can write, and therefore exactly what undo must
 * restore and fingerprint. Deliberately NOT the whole StoredTask: transitions,
 * timestamps and sortOrder change for reasons unrelated to this action, and
 * including them would make every undo look like a modified record.
 */
function mutableTaskFields(task: StoredTask) {
  return {
    title: task.title,
    description: task.description,
    scope: task.scope,
    assigneeId: task.assigneeId,
    dueDate: task.dueDate,
    tags: [...task.tags],
    subTasks: task.subTasks.map(s => ({ ...s })),
  };
}

function formatAssignee(assigneeId: string | null, names: Map<string, string>): string {
  if (assigneeId === null) return 'Unassigned';
  return names.get(assigneeId) ?? `Unknown member (${assigneeId})`;
}

registerChatAction<UpdateTaskActionParams>({
  actionId: 'update_task',
  label: 'Update a task',
  // T1 permanently: a task is a user-authored record, not metadata (SEC-P003).
  tier: 'T1',
  dataClass: 'content',
  paramsSchema: updateTaskParamsSchema,

  /**
   * SEC-P030. Every identifier the model supplied is resolved here, against
   * family-scoped reads, before the batch executes.
   *
   * The error messages name only what the user already knows they asked for.
   * "Task <id> could not be found" is safe; echoing a title fetched from
   * another family would not be, which is why the task lookup is scoped by
   * familyId rather than looked up globally and then checked.
   */
  async validateSemantics(params, ctx) {
    const task = await taskService.getTask(params.taskId, ctx.familyId);
    if (!task) {
      // Covers both "no such task" and "a task belonging to another family":
      // getTask is family-scoped, so a cross-family id is indistinguishable
      // from a missing one — which is the correct amount of information to
      // leak, namely none.
      throw new Error(`That task no longer exists (${params.taskId}).`);
    }

    if (params.assigneeId !== undefined && params.assigneeId !== null) {
      const members = await familyService.getFamilyMembers(ctx.familyId);
      if (!members.some(m => m.userId === params.assigneeId)) {
        throw new Error('That assignee is not a member of this household.');
      }
    }
  },

  /**
   * SEC-P011. Returns one field per value being REPLACED, so the card can show
   * current-vs-proposed. Fields the proposal does not touch are omitted — a
   * before/after row for something that is not changing is noise that makes the
   * rows that are changing harder to see, which is the legibility failure
   * §5.2 is guarding against.
   */
  async describeCurrent(params, ctx) {
    const task = await taskService.getTask(params.taskId, ctx.familyId);
    if (!task) return null;

    const names = new Map(
      (await familyService.getFamilyMembers(ctx.familyId)).map(m => [m.userId, m.displayName]),
    );

    const fields: { key: string; label: string; value: string; editable: boolean; type: 'text' | 'textarea' | 'date' | 'select' | 'tags' }[] = [];

    if (params.title !== undefined) {
      fields.push({ key: 'title', label: 'Title', value: task.title, editable: false, type: 'text' });
    }
    if (params.description !== undefined) {
      fields.push({
        key: 'description',
        label: 'Description',
        // An empty description would render as nothing, which reads as "this
        // field is not part of the change" rather than "it is currently blank".
        value: task.description.trim() === '' ? '(none)' : task.description,
        editable: false,
        type: 'textarea',
      });
    }
    if (params.assigneeId !== undefined) {
      fields.push({
        key: 'assigneeId',
        label: 'Assignee',
        value: formatAssignee(task.assigneeId, names),
        editable: false,
        type: 'select',
      });
    }
    if (params.dueDate !== undefined) {
      fields.push({
        key: 'dueDate',
        label: 'Due date',
        value: task.dueDate ?? '(no due date)',
        editable: false,
        type: 'date',
      });
    }
    if (params.scope !== undefined) {
      fields.push({ key: 'scope', label: 'Scope', value: task.scope, editable: false, type: 'select' });
    }
    if (params.tags !== undefined) {
      fields.push({
        key: 'tags',
        label: 'Tags',
        value: task.tags.length > 0 ? task.tags.join(', ') : '(none)',
        editable: false,
        type: 'tags',
      });
    }
    if (params.subTasks !== undefined) {
      const done = task.subTasks.filter(s => s.completed).length;
      fields.push({
        key: 'subTasks',
        label: 'Subtasks',
        value: task.subTasks.length === 0 ? '(none)' : `${task.subTasks.length} (${done} complete)`,
        editable: false,
        type: 'text',
      });
    }

    return fields.length > 0 ? fields : null;
  },

  /**
   * REQ-P025. Captures the whole set of fields this action can change, so any
   * combination of them restores — recording only the fields the proposal
   * happened to touch would leave a later undo unable to reverse a different
   * row that touched others.
   */
  undo: {
    kind: 'task',
    async capture(params, ctx) {
      const task = await taskService.getTask(params.taskId, ctx.familyId);
      if (!task) return null;
      return { recordId: task.id, before: mutableTaskFields(task) };
    },
    async read(recordId, ctx) {
      const task = await taskService.getTask(recordId, ctx.familyId);
      return task ? mutableTaskFields(task) : null;
    },
    async restore(recordId, before, ctx) {
      const prior = before as ReturnType<typeof mutableTaskFields>;
      await taskService.updateTask(recordId, prior, ctx.userId, ctx.familyId);
    },
  },

  async execute(params, ctx) {
    const { taskId, ...updates } = params;
    const task = await taskService.updateTask(taskId, updates, ctx.userId, ctx.familyId);
    return {
      type: 'task',
      id: task.id,
      url: `/tasks?taskId=${task.id}`,
      label: task.title,
    };
  },
});
