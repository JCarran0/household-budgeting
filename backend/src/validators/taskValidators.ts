/**
 * Task — Zod Validators
 *
 * Neutral module so chat actions can re-use the schemas the HTTP routes parse
 * (REQ-P011, SEC-A004: one source of truth, so tightening a rule here applies
 * to both paths at once).
 *
 * WHY NOT JUST EXPORT THEM FROM routes/tasks.ts:
 * That is what it used to do, and it worked only by accident of import order.
 * `services/index -> chatActions/index -> routes/tasks -> services/index` is a
 * cycle, and a cycle here does not warn — the schema resolves to `undefined` at
 * module-eval time and the route starts returning 400 for every valid request,
 * surfacing as a TypeError somewhere downstream that names nothing about the
 * cause. It took out 29 auto-categorization tests when the same pattern was
 * repeated on the rules route. See TD-031.
 */

import { z } from 'zod';

export const subTaskCreateSchema = z.object({
  title: z.string().min(1).max(200),
});

export const subTaskSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(200),
  completed: z.boolean(),
  assigneeId: z.string().nullable().optional(),
});

// Exported so the chat action handler can re-use the same schema.
// SECURITY (SEC-A004): One source of truth — tightening this schema
// automatically applies to both the HTTP route and the chat action path.
export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  scope: z.enum(['family', 'personal']).optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD').nullable().optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
  subTasks: z.array(subTaskCreateSchema).max(50).optional(),
  status: z.enum(['todo', 'started']).optional(),
  /**
   * Optional explicit sortOrder. When omitted the service assigns top-of-column.
   * Used by Checklist v2.1 quick entry to insert a new task directly below the
   * user's cursor position rather than at the top of the column.
   */
  sortOrder: z.number().finite().optional(),
});

// Exported so the update_task chat action re-uses the same schema (REQ-P011).
// SECURITY (SEC-A004): one source of truth — tightening this automatically
// applies to both the HTTP route and the chat action path.
export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  scope: z.enum(['family', 'personal']).optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD').nullable().optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
  subTasks: z.array(subTaskSchema).max(50).optional(),
});

export const updateStatusSchema = z.object({
  status: z.enum(['todo', 'started', 'done', 'cancelled']),
  startedAt: z.string().datetime().optional(),
});

export const leaderboardQuerySchema = z.object({
  timezone: z.string().min(1),
});

export const snoozeSchema = z.object({
  snoozedUntil: z
    .string()
    .datetime()
    .nullable()
    .refine(
      (val) => val === null || new Date(val).getTime() > Date.now(),
      'snoozedUntil must be in the future'
    ),
});

export const reorderSchema = z.object({
  status: z.enum(['todo', 'started', 'done', 'cancelled']),
  sortOrder: z.number().finite(),
});

export const boardQuerySchema = z.object({
  includeSnoozed: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
