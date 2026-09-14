/**
 * Budget — Zod Validators
 *
 * Neutral module so chat actions can re-use the schema the HTTP route parses
 * (REQ-P011) without importing the route and creating a
 * services -> chatActions -> routes -> services cycle. A cycle here is not
 * cosmetic: the schema resolves to undefined at module-eval time and the route
 * starts rejecting every valid body.
 */

import { z } from 'zod';

export const createBudgetSchema = z.object({
  categoryId: z.string().min(1),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Invalid month format. Use YYYY-MM'),
  amount: z.number().min(0, 'Budget amount must not be negative'),
  notes: z.string().max(1000, 'Notes must be 1000 characters or fewer').optional()
});

export const batchUpdateBudgetsSchema = z.object({
  updates: z.array(createBudgetSchema)
});

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
