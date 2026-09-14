/**
 * Auto-Categorization Rule — Zod Validators
 *
 * Lives here rather than in routes/autoCategorize.ts because chat actions need
 * the same schemas (REQ-P011: an action re-uses the rules its HTTP route
 * parses, so tightening one tightens both). Importing a route module from a
 * service creates a cycle — services/index -> chatActions -> routes -> services
 * -- and a cycle here is not a lint complaint: the schema resolves to undefined
 * at module-eval time and every rule create starts returning 400. A neutral
 * module both sides import is the fix, and it is why stopValidators.ts already
 * looks like this.
 */

import { z } from 'zod';

export const MAX_PATTERNS_PER_RULE = 10;

export const createRuleSchema = z.object({
  description: z.string().min(1).max(200),
  patterns: z.array(z.string().min(1).max(100)).min(1).max(MAX_PATTERNS_PER_RULE),
  categoryId: z.string().min(1),
  categoryName: z.string().optional(),
  userDescription: z.string().max(200).optional(),
  isActive: z.boolean().optional(),
  /**
   * Optional telemetry tag — distinguishes manual rule creation from
   * suggestion-driven creation. Logged out via auto_cat_suggestions.rule_created;
   * not stored on the rule itself.
   */
  source: z.enum(['manual', 'suggestion']).default('manual'),
  /**
   * Optional metadata piped through from the suggestion card so the
   * rule_created log line can include cluster context. Ignored unless
   * source === 'suggestion'.
   */
  suggestionMeta: z.object({
    clusterSize: z.number().int().nonnegative(),
    topCategoryCount: z.number().int().nonnegative(),
    agreementPct: z.number().int().min(0).max(100),
    pendingMatchCount: z.number().int().nonnegative(),
    appliedToTxnCount: z.number().int().nonnegative().optional(),
    outcome: z.enum(['created', 'appended', 'replaced']).optional(),
    replacedExisting: z.boolean().optional(),
    addedToExistingRuleId: z.string().optional(),
  }).optional(),
});

export const updateRuleSchema = z.object({
  description: z.string().min(1).max(200).optional(),
  patterns: z.array(z.string().min(1).max(100)).min(1).max(MAX_PATTERNS_PER_RULE).optional(),
  categoryId: z.string().min(1).optional(),
  categoryName: z.string().optional(),
  userDescription: z.string().max(200).optional(),
  isActive: z.boolean().optional(),
  /** Telemetry tag for suggestion-driven Replace flow. Not stored on the rule. */
  source: z.enum(['manual', 'suggestion']).default('manual'),
  suggestionMeta: z.object({
    clusterSize: z.number().int().nonnegative(),
    topCategoryCount: z.number().int().nonnegative(),
    agreementPct: z.number().int().min(0).max(100),
    pendingMatchCount: z.number().int().nonnegative(),
    appliedToTxnCount: z.number().int().nonnegative().optional(),
    outcome: z.enum(['created', 'appended', 'replaced']).optional(),
    replacedExisting: z.boolean().optional(),
    addedToExistingRuleId: z.string().optional(),
  }).optional(),
});

export const reorderRulesSchema = z.object({
  ruleIds: z.array(z.string()).min(1),
});

export type CreateRuleInput = z.infer<typeof createRuleSchema>;
export type UpdateRuleInput = z.infer<typeof updateRuleSchema>;
