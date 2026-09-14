/**
 * Transaction Metadata Chat Actions (T1) — AI-CAPABILITY-PLATFORM-BRD §9.1.
 *
 * set_transaction_category and set_transaction_description. Both are
 * dataClass 'metadata', which is the ONLY class SEC-P003 permits to become T2,
 * so these are the flagship candidates for the unattended tier in Phase 5.
 * They ship as T1 first, deliberately: REQ-P081 requires durable undo and the
 * activity log before anything runs unattended, and neither exists yet.
 *
 * WHY THE ORPHAN CHECK BELOW IS THE POINT OF THIS FILE:
 * SEC-P030 was written for exactly this case. Stored `categoryId` values in
 * this app are ALREADY known to go orphaned relative to the categories file —
 * it produces cell-vs-modal mismatches and has its own cleanup scripts. A
 * model-supplied categoryId passes `z.string().min(1)` whether or not it names
 * a category that exists. Writing one would put the transaction in a state the
 * UI cannot render and the user cannot easily find again, and would do it
 * silently, in bulk, across a card the user approved with one click.
 *
 * THE AMOUNT IS NEVER TOUCHED. Categorising a transaction changes which bucket
 * a figure lands in, never the figure. Anything that changes an amount — a
 * split, a manual transaction — is dataClass 'financial' and permanently
 * outside T2.
 */

import { z } from 'zod';
import { registerChatAction } from './registry';
import {
  updateCategorySchema,
  updateDescriptionSchema,
} from '../../validators/transactionValidators';
import { transactionService, categoryService } from '../index';
import type { StoredTransaction } from '../transactionService';

const setCategoryParamsSchema = updateCategorySchema.extend({
  transactionId: z.string().min(1),
});

const setDescriptionParamsSchema = updateDescriptionSchema.extend({
  transactionId: z.string().min(1),
});

type SetCategoryParams = z.infer<typeof setCategoryParamsSchema>;
type SetDescriptionParams = z.infer<typeof setDescriptionParamsSchema>;

/**
 * Family-scoped transaction lookup for a WRITE target.
 *
 * Goes through transactionService.getTransactions, which applies
 * excludeRemoved via the filter engine. That is deliberate on a write path:
 * Plaid leaves replaced pending holds in storage as status:'removed', they are
 * invisible everywhere in the UI, and editing one produces a change the user
 * can never see, find, or undo. A removed row is therefore simply not a
 * writable target, and is reported the same way as a missing one.
 *
 * includeHidden is set because hidden is a user's own display choice — a
 * transaction they chose to hide is still theirs to recategorise.
 */
async function lookupTransaction(
  familyId: string,
  transactionId: string,
): Promise<StoredTransaction | null> {
  const result = await transactionService.getTransactions(familyId, { includeHidden: true });
  return (result.transactions ?? []).find(t => t.id === transactionId) ?? null;
}

async function findWritableTransaction(
  familyId: string,
  transactionId: string,
): Promise<StoredTransaction> {
  const txn = await lookupTransaction(familyId, transactionId);
  if (!txn) {
    // Family-scoped, so a transaction belonging to another household is
    // indistinguishable from one that does not exist, and one removed by the
    // bank is indistinguishable from both. That is the correct amount to
    // disclose.
    throw new Error(`That transaction could not be found (${transactionId}).`);
  }
  return txn;
}

function describeMerchant(txn: StoredTransaction): string {
  return txn.userDescription || txn.merchantName || txn.name;
}

registerChatAction<SetCategoryParams>({
  actionId: 'set_transaction_category',
  label: 'Set a transaction category',
  tier: 'T1',
  // Classification only — which bucket the money is reported in, never the
  // amount. This is what makes it T2-eligible later (SEC-P003).
  dataClass: 'metadata',
  paramsSchema: setCategoryParamsSchema,

  async validateSemantics(params, ctx) {
    await findWritableTransaction(ctx.familyId, params.transactionId);

    // null is a legitimate value: it means "uncategorized".
    if (params.categoryId === null) return;

    const category = await categoryService.getCategoryById(params.categoryId, ctx.familyId);
    if (!category) {
      // The orphan case this whole file is shaped around.
      throw new Error(
        `No category matches "${params.categoryId}". Use get_categories to find a real category id.`,
      );
    }
  },

  /** SEC-P011: the user needs to see what the transaction is categorised as NOW. */
  async describeCurrent(params, ctx) {
    const txn = await lookupTransaction(ctx.familyId, params.transactionId);
    if (!txn) return null;

    const current = txn.categoryId
      ? await categoryService.getCategoryById(txn.categoryId, ctx.familyId)
      : null;

    const value =
      txn.categoryId === null
        ? '(uncategorized)'
        : current
          ? current.name
          // Say so rather than printing a bare id: the user is being asked to
          // approve replacing a value, and "Unknown" is the honest rendering
          // of a value the app itself cannot resolve.
          : `Unknown category (${txn.categoryId})`;

    return [
      { key: 'transactionId', label: 'Transaction', value: describeMerchant(txn), editable: false, type: 'text' },
      { key: 'categoryId', label: 'Current category', value, editable: false, type: 'text' },
    ];
  },

  undo: {
    kind: 'transaction',
    async capture(params, ctx) {
      const txn = await lookupTransaction(ctx.familyId, params.transactionId);
      if (!txn) return null;
      return { recordId: txn.id, before: { categoryId: txn.categoryId } };
    },
    async read(recordId, ctx) {
      const txn = await lookupTransaction(ctx.familyId, recordId);
      return txn ? { categoryId: txn.categoryId } : null;
    },
    async restore(recordId, before, ctx) {
      const prior = before as { categoryId: string | null };
      const result = await transactionService.updateTransactionCategory(
        ctx.familyId,
        recordId,
        prior.categoryId,
      );
      if (!result.success) throw new Error(result.error ?? 'Could not restore the category.');
    },
  },

  async execute(params, ctx) {
    const result = await transactionService.updateTransactionCategory(
      ctx.familyId,
      params.transactionId,
      params.categoryId,
    );
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to update category');
    }
    const txn = await lookupTransaction(ctx.familyId, params.transactionId);
    return {
      type: 'transaction',
      id: params.transactionId,
      url: `/transactions?transactionId=${params.transactionId}`,
      label: txn ? describeMerchant(txn) : params.transactionId,
    };
  },
});

registerChatAction<SetDescriptionParams>({
  actionId: 'set_transaction_description',
  label: 'Rename a transaction',
  tier: 'T1',
  dataClass: 'metadata',
  paramsSchema: setDescriptionParamsSchema,

  async validateSemantics(params, ctx) {
    await findWritableTransaction(ctx.familyId, params.transactionId);
  },

  async describeCurrent(params, ctx) {
    const txn = await lookupTransaction(ctx.familyId, params.transactionId);
    if (!txn) return null;

    return [
      {
        key: 'transactionId',
        label: 'Transaction',
        // The bank's own name, so the user can tell which row this is even
        // when a user description is already overriding it in the UI.
        value: txn.merchantName || txn.name,
        editable: false,
        type: 'text',
      },
      {
        key: 'description',
        label: 'Current name',
        value: txn.userDescription && txn.userDescription.trim() !== ''
          ? txn.userDescription
          : '(not renamed)',
        editable: false,
        type: 'text',
      },
    ];
  },

  undo: {
    kind: 'transaction',
    async capture(params, ctx) {
      const txn = await lookupTransaction(ctx.familyId, params.transactionId);
      if (!txn) return null;
      return { recordId: txn.id, before: { description: txn.userDescription ?? null } };
    },
    async read(recordId, ctx) {
      const txn = await lookupTransaction(ctx.familyId, recordId);
      return txn ? { description: txn.userDescription ?? null } : null;
    },
    async restore(recordId, before, ctx) {
      const prior = before as { description: string | null };
      const result = await transactionService.updateTransactionDescription(
        ctx.familyId,
        recordId,
        prior.description,
      );
      if (!result.success) throw new Error(result.error ?? 'Could not restore the name.');
    },
  },

  async execute(params, ctx) {
    const result = await transactionService.updateTransactionDescription(
      ctx.familyId,
      params.transactionId,
      params.description,
    );
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to update description');
    }
    return {
      type: 'transaction',
      id: params.transactionId,
      url: `/transactions?transactionId=${params.transactionId}`,
      label: params.description ?? (txnLabelFallback(params.transactionId)),
    };
  },
});

/** Used only when a rename clears the description; the id is all we have left. */
function txnLabelFallback(transactionId: string): string {
  return `Transaction ${transactionId}`;
}
