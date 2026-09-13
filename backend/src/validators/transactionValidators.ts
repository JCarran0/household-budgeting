/**
 * Transaction — Zod Validators
 *
 * Neutral module so chat actions can re-use the schemas the HTTP routes parse
 * (REQ-P011, SEC-A004: one source of truth, so tightening a rule here applies
 * to both paths at once).
 *
 * WHY NOT JUST EXPORT THEM FROM routes/transactions.ts:
 * That is what it used to do, and it worked only by accident of import order.
 * `services/index -> chatActions/index -> routes/transactions -> services/index`
 * is a cycle, and a cycle here does not warn — the schema resolves to
 * `undefined` at module-eval time and the route starts returning 400 for every
 * valid request, surfacing as a TypeError somewhere downstream that names
 * nothing about the cause. It took out 29 auto-categorization tests when the
 * same pattern was repeated on the rules route. See TD-031.
 *
 * NOTE ON splitTransactionSchema: it lives here because the route parses it,
 * NOT because a chat action uses it. There is deliberately no split action —
 * this app has no unsplit, so a model-reachable split would be irreversible.
 */

import { z } from 'zod';

export const transactionFilterSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  accountId: z.string().optional(), // Single accountId for simple filtering
  accountIds: z.array(z.string()).optional(),
  categoryIds: z.union([z.array(z.string()), z.string()]).optional().transform(val => {
    if (typeof val === 'string') return [val];
    return val;
  }),
  tagsMatchAll: z.union([z.boolean(), z.string()]).optional().transform(val =>
    typeof val === 'string' ? val === 'true' : val
  ),
  tags: z.union([z.array(z.string()), z.string()]).optional().transform(val => {
    if (typeof val === 'string') return [val];
    return val;
  }),
  searchQuery: z.string().optional(),
  includePending: z.union([z.boolean(), z.string()]).optional().transform(val => {
    if (typeof val === 'string') return val === 'true';
    return val;
  }),
  includeHidden: z.union([z.boolean(), z.string()]).optional().transform(val => {
    if (typeof val === 'string') return val === 'true';
    return val;
  }),
  onlyUncategorized: z.union([z.boolean(), z.string()]).optional().transform(val => {
    if (typeof val === 'string') return val === 'true';
    return val;
  }),
  onlyFlagged: z.union([z.boolean(), z.string()]).optional().transform(val => {
    if (typeof val === 'string') return val === 'true';
    return val;
  }),
  minAmount: z.union([z.number(), z.string()]).optional().transform(val => {
    if (typeof val === 'string') return parseFloat(val);
    return val;
  }),
  maxAmount: z.union([z.number(), z.string()]).optional().transform(val => {
    if (typeof val === 'string') return parseFloat(val);
    return val;
  }),
  exactAmount: z.union([z.number(), z.string()]).optional().transform(val => {
    if (typeof val === 'string') return parseFloat(val);
    return val;
  }),
  amountTolerance: z.union([z.number(), z.string()]).optional().transform(val => {
    if (typeof val === 'string') return parseFloat(val);
    return val;
  }),
  transactionType: z.enum(['income', 'expense', 'transfer', 'all']).optional(),
});

export const updateCategorySchema = z.object({
  categoryId: z.union([z.string().min(1), z.null()]),
});

export const addTagsSchema = z.object({
  tags: z.array(z.string().min(1)),
});

export const updateDescriptionSchema = z.object({
  description: z.string().nullable(),
});

export const updateNotesSchema = z.object({
  notes: z.string().nullable(),
});

export const updateHiddenSchema = z.object({
  isHidden: z.boolean(),
});

export const updateFlaggedSchema = z.object({
  isFlagged: z.boolean(),
});

export const splitTransactionSchema = z.object({
  splits: z.array(z.object({
    amount: z.number().positive(),
    categoryId: z.string().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })).min(2),
});

export const syncAllSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const bulkUpdateSchema = z.object({
  transactionIds: z.array(z.string().min(1)).min(1).max(100),
  updates: z.object({
    categoryId: z.union([z.string().min(1), z.null()]).optional(),
    userDescription: z.union([z.string(), z.null()]).optional(),
    isHidden: z.boolean().optional(),
    isFlagged: z.boolean().optional(),
    tagsToAdd: z.array(z.string().min(1)).optional(),
    tagsToRemove: z.array(z.string().min(1)).optional(),
  }).refine(data => Object.keys(data).length > 0, {
    message: 'At least one update field must be provided',
  }),
});
