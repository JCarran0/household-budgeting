/**
 * Financial-class chat actions (T1, permanently) — AI-CAPABILITY-PLATFORM-BRD §9.1.
 *
 *   set_transaction_hidden        — exclude/include a transaction in reported totals
 *   set_budget_amount             — set one category's budget for one month
 *   create_auto_categorize_rule   — a forward-acting categorization rule
 *
 * All three are dataClass 'financial'. §9.1 classifies them that way for
 * different reasons — hiding changes reported totals in BvA, a budget amount is
 * named in SEC-P003's exclusion list outright, and a rule is forward-acting so
 * one write changes all future categorization — but the effect is the same:
 * none of them can ever be promoted to the unattended tier.
 *
 * WHAT IS DELIBERATELY ABSENT: split_transaction.
 * §9.1 lists it as T1 ("creates child records; not cleanly reversible in one
 * click"), and that turns out to understate it. This app has no unsplit — not
 * in the service layer, not in the UI, nowhere. A split creates N child
 * transactions and hides the parent, and nothing in the product puts that back.
 * Giving the model a write primitive that neither undo nor the user can reverse
 * inverts SEC-P001. Splitting becomes available to the assistant when the app
 * itself can unsplit, and not before.
 *
 * SECURITY (SEC-A004 / REQ-P011): params re-use createBudgetSchema and
 * createRuleSchema from their HTTP routes, so tightening validation there
 * applies here automatically.
 */

import { z } from 'zod';
import { registerChatAction } from './registry';
import { createBudgetSchema } from '../../validators/budgetValidators';
import { createRuleSchema } from '../../validators/ruleValidators';
import {
  transactionService,
  categoryService,
  budgetService,
  autoCategorizeService,
} from '../index';
import type { StoredTransaction } from '../transactionService';
import type { DisplayField } from '../../shared/types';

// -----------------------------------------------------------------------------
// Shared helpers
// -----------------------------------------------------------------------------

/**
 * Family-scoped lookup of a WRITE target. See transactionMetadataActions for
 * the full reasoning: getTransactions applies excludeRemoved, so a row the bank
 * replaced is not a writable target and reads the same as a missing one.
 */
async function findWritableTransaction(
  familyId: string,
  transactionId: string,
): Promise<StoredTransaction> {
  const result = await transactionService.getTransactions(familyId, { includeHidden: true });
  const txn = (result.transactions ?? []).find(t => t.id === transactionId);
  if (!txn) {
    throw new Error(`That transaction could not be found (${transactionId}).`);
  }
  return txn;
}

function describeMerchant(txn: StoredTransaction): string {
  return txn.userDescription || txn.merchantName || txn.name;
}

function formatUsd(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

async function categoryLabel(categoryId: string, familyId: string): Promise<string> {
  const category = await categoryService.getCategoryById(categoryId, familyId);
  // An orphaned id renders as itself rather than vanishing — the same way the
  // project and transaction readers already report one.
  return category?.name ?? `Unknown category (${categoryId})`;
}

// -----------------------------------------------------------------------------
// set_transaction_hidden
// -----------------------------------------------------------------------------

const setHiddenParamsSchema = z.object({
  transactionId: z.string().min(1),
  isHidden: z.boolean(),
});

type SetHiddenParams = z.infer<typeof setHiddenParamsSchema>;

registerChatAction<SetHiddenParams>({
  actionId: 'set_transaction_hidden',
  label: 'Hide or unhide a transaction',
  tier: 'T1',
  // BRD §9.1: hiding changes reported totals in Budget vs. Actuals. The field
  // is a boolean, but what it governs is whether an amount counts, which is why
  // this is 'financial' and not 'metadata' like a category assignment.
  dataClass: 'financial',
  paramsSchema: setHiddenParamsSchema,

  /**
   * SEC-P030, plus the guard that matters most in this file.
   *
   * splitTransaction sets the PARENT's isHidden to true on purpose: the parent
   * is excluded so its children can be counted in its place. Unhiding a split
   * parent therefore double-counts the money — the parent's full amount plus
   * every child's share land in the same totals. It is a silent, plausible,
   * arithmetic-breaking write, so a split parent is not a valid target in
   * either direction.
   */
  async validateSemantics(params, ctx) {
    const txn = await findWritableTransaction(ctx.familyId, params.transactionId);

    if (txn.isSplit) {
      throw new Error(
        `"${describeMerchant(txn)}" was split into separate transactions. Its visibility is what ` +
          `keeps the split from being counted twice, so it has to stay as it is — change the ` +
          `split parts instead.`,
      );
    }
    if (txn.isHidden === params.isHidden) {
      throw new Error(
        `"${describeMerchant(txn)}" is already ${params.isHidden ? 'hidden' : 'visible'}.`,
      );
    }
  },

  /** SEC-P011 — which transaction, for how much, and what it is doing now. */
  async describeCurrent(params, ctx) {
    const txn = await findWritableTransaction(ctx.familyId, params.transactionId);
    const fields: DisplayField[] = [
      {
        key: 'transactionId',
        label: 'Transaction',
        value: `${describeMerchant(txn)} — ${formatUsd(Math.abs(txn.amount))} on ${txn.date}`,
        editable: false,
        type: 'text',
      },
      {
        key: 'isHidden',
        label: 'Currently',
        value: txn.isHidden ? 'Hidden from totals' : 'Counted in totals',
        editable: false,
        type: 'text',
      },
    ];
    return fields;
  },

  undo: {
    kind: 'transaction',
    async capture(params, ctx) {
      const result = await transactionService.getTransactions(ctx.familyId, { includeHidden: true });
      const txn = (result.transactions ?? []).find(t => t.id === params.transactionId);
      if (!txn) return null;
      return { recordId: txn.id, before: { isHidden: txn.isHidden } };
    },
    async read(recordId, ctx) {
      const result = await transactionService.getTransactions(ctx.familyId, { includeHidden: true });
      const txn = (result.transactions ?? []).find(t => t.id === recordId);
      return txn ? { isHidden: txn.isHidden } : null;
    },
    async restore(recordId, before, ctx) {
      const prior = before as { isHidden: boolean };
      await transactionService.updateTransactionHidden(ctx.familyId, recordId, prior.isHidden);
    },
  },

  async execute(params, ctx) {
    const txn = await findWritableTransaction(ctx.familyId, params.transactionId);
    const result = await transactionService.updateTransactionHidden(
      ctx.familyId,
      params.transactionId,
      params.isHidden,
    );
    if (!result.success) throw new Error(result.error ?? 'Failed to update the transaction.');

    return {
      type: 'transaction',
      id: txn.id,
      url: `/transactions?transactionId=${txn.id}`,
      label: `${describeMerchant(txn)} — ${params.isHidden ? 'hidden from' : 'counted in'} totals`,
    };
  },
});

// -----------------------------------------------------------------------------
// set_budget_amount
// -----------------------------------------------------------------------------

/**
 * `notes` is omitted deliberately. budgetService only overwrites notes when the
 * field is present on the payload, precisely so an amount-only edit cannot
 * clobber a note someone wrote. Leaving the field out of these params keeps
 * that protection rather than re-deriving it.
 */
const setBudgetParamsSchema = createBudgetSchema.omit({ notes: true });

type SetBudgetParams = z.infer<typeof setBudgetParamsSchema>;

registerChatAction<SetBudgetParams>({
  actionId: 'set_budget_amount',
  label: 'Set a monthly budget amount',
  tier: 'T1',
  // SEC-P003 names budget amounts in its exclusion list outright.
  dataClass: 'financial',
  paramsSchema: setBudgetParamsSchema,

  async validateSemantics(params, ctx) {
    const category = await categoryService.getCategoryById(params.categoryId, ctx.familyId);
    if (!category) {
      // The orphaned-categoryId case this app already has history with.
      throw new Error(`That category no longer exists (${params.categoryId}).`);
    }
    if (category.isIncome) {
      // Not a hard product rule, but budgeting an income category through a
      // chat card is almost always a misread of "budget" — and the user is
      // approving a number, not a category choice they can easily re-check.
      throw new Error(
        `"${category.name}" is an income category. Budget amounts belong on spending or savings categories.`,
      );
    }
  },

  /** SEC-P011 — the new number means nothing without the one it replaces. */
  async describeCurrent(params, ctx) {
    const existing = await budgetService.getBudget(params.categoryId, params.month, ctx.familyId);
    return [
      {
        key: 'categoryId',
        label: 'Category',
        value: await categoryLabel(params.categoryId, ctx.familyId),
        editable: false,
        type: 'text',
      },
      {
        key: 'month',
        label: 'Month',
        value: params.month,
        editable: false,
        type: 'text',
      },
      {
        key: 'amount',
        label: 'Current budget',
        // "Not budgeted" and "budgeted at $0" are different facts and the
        // difference is the whole point of the row.
        value: existing ? formatUsd(existing.amount) : '(not budgeted)',
        editable: false,
        type: 'text',
      },
    ];
  },

  undo: {
    kind: 'budget',
    async capture(params, ctx) {
      const existing = await budgetService.getBudget(params.categoryId, params.month, ctx.familyId);
      return {
        recordId: `${params.categoryId}:${params.month}`,
        // null means there was no budget at all — restoring means removing the
        // one this action created, not setting it to zero.
        before: existing ? { amount: existing.amount } : null,
      };
    },
    async read(recordId, ctx) {
      const [categoryId, month] = recordId.split(':');
      const existing = await budgetService.getBudget(categoryId, month, ctx.familyId);
      return existing ? { amount: existing.amount } : null;
    },
    async restore(recordId, before, ctx) {
      const [categoryId, month] = recordId.split(':');
      const prior = before as { amount: number } | null;

      if (prior === null) {
        const existing = await budgetService.getBudget(categoryId, month, ctx.familyId);
        if (existing) await budgetService.deleteBudget(existing.id, ctx.familyId);
        return;
      }
      await budgetService.createOrUpdateBudget(
        { categoryId, month, amount: prior.amount },
        ctx.familyId,
      );
    },
  },

  async execute(params, ctx) {
    const budget = await budgetService.createOrUpdateBudget(
      { categoryId: params.categoryId, month: params.month, amount: params.amount },
      ctx.familyId,
    );
    const name = await categoryLabel(params.categoryId, ctx.familyId);

    return {
      type: 'budget',
      id: `${params.categoryId}:${params.month}`,
      url: `/budgets?month=${params.month}`,
      label: `${name} — ${formatUsd(budget.amount)} for ${params.month}`,
    };
  },
});

// -----------------------------------------------------------------------------
// create_auto_categorize_rule
// -----------------------------------------------------------------------------

/**
 * `source` and `suggestionMeta` are stripped: they are telemetry the HTTP route
 * logs and never stores on the rule, so carrying them here would put fields on
 * the card that describe nothing the user is approving (SEC-P010).
 */
const createRuleParamsSchema = createRuleSchema.omit({ source: true, suggestionMeta: true });

type CreateRuleParams = z.infer<typeof createRuleParamsSchema>;

registerChatAction<CreateRuleParams>({
  actionId: 'create_auto_categorize_rule',
  label: 'Create an auto-categorization rule',
  tier: 'T1',
  // §9.1: forward-acting. One write changes all future categorization, so this
  // is never a candidate for the unattended tier regardless of data class.
  dataClass: 'financial',
  paramsSchema: createRuleParamsSchema,

  async validateSemantics(params, ctx) {
    const category = await categoryService.getCategoryById(params.categoryId, ctx.familyId);
    if (!category) {
      throw new Error(`That category no longer exists (${params.categoryId}).`);
    }

    // createRule refuses a pattern that already belongs to another rule.
    // Surfacing it here turns a mid-batch failure into a clean rejection with
    // nothing written, and names the rule in the way (REQ-P023).
    const existing = await autoCategorizeService.getRules(ctx.familyId);
    const proposed = params.patterns.map(p => p.toLowerCase());
    for (const rule of existing) {
      const clash = rule.patterns.find(p => proposed.includes(p.toLowerCase()));
      if (clash) {
        throw new Error(`"${clash}" is already matched by the rule "${rule.description}".`);
      }
    }
  },

  undo: {
    kind: 'auto_categorize_rule',
    async capture() {
      // A create: no prior state, and no id until it exists. The route fills
      // recordId in from the resource execute returns.
      return { recordId: null, before: null };
    },
    async read(recordId, ctx) {
      const rules = await autoCategorizeService.getRules(ctx.familyId);
      const rule = rules.find(r => r.id === recordId);
      return rule ? { ...rule } : null;
    },
    async restore(recordId, _before, ctx) {
      await autoCategorizeService.deleteRule(ctx.familyId, recordId);
    },
  },

  async execute(params, ctx) {
    const result = await autoCategorizeService.createRule(ctx.familyId, {
      description: params.description,
      patterns: params.patterns,
      categoryId: params.categoryId,
      // Resolved server-side rather than taken from the model: categoryName is
      // a display string stored on the rule, and a wrong one would mislabel
      // every future match.
      categoryName: await categoryLabel(params.categoryId, ctx.familyId),
      ...(params.userDescription !== undefined ? { userDescription: params.userDescription } : {}),
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
    });
    if (!result.success || !result.rule) {
      throw new Error(result.error ?? 'Failed to create the rule.');
    }

    return {
      type: 'auto_categorize_rule',
      id: result.rule.id,
      // The rules live on a tab of /categories that carries no URL state, so
      // the page is as specific as a deep link can honestly be.
      url: '/categories',
      // "from now on" is load-bearing: creating a rule does NOT recategorize
      // anything that already exists, and a log entry that reads as though it
      // did would send the user looking for changes that never happened.
      label: `Rule "${result.rule.description}" — from now on, matches go to ${result.rule.categoryName}`,
    };
  },
});
