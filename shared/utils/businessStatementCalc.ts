/**
 * Business Statement Math — Pure, IO-free computation (Phase 5.1)
 *
 * This module is intentionally kept pure (no IO, no Date.now) so that both
 * the backend statement service and the future frontend PDF-preview can import
 * and reuse it without pulling in any backend dependencies (Plan D9).
 *
 * =============================================================================
 * ROUNDING RULE (D7, corrected 2026-06-06 from the authoritative CSV):
 * =============================================================================
 *
 *   Per-row (DISPLAY ONLY):
 *     commission_i   = roundHalfUp(payout_i × commissionRate)
 *     royalty_i      = payout_i - commission_i  (display subtraction; not separately rounded)
 *
 *   Royalty subtotal (AUTHORITATIVE for remittance):
 *     royaltySubtotal = roundHalfUp( Σ(payout_i) × (1 - commissionRate) )
 *     i.e. sum at FULL PRECISION, round ONCE — NOT Σ(round(royalty_i))
 *
 *   Remittance total:
 *     remittanceTotal = royaltySubtotal - Σ(charges)
 *
 * WHY: Summing per-row rounded royalties (the naive method) would produce a
 * result that is 1 cent HIGHER than the authoritative subtotal in the real
 * payment-068 statement:
 *   - Σ(16 displayed royalties) = 91,832.23   ← naive sum
 *   - roundHalfUp(96665.49 × 0.95) = 91,832.22 ← correct (matches the client's statement)
 * The one-cent gap is a pre-existing, accepted quirk of the legacy Google-Sheet
 * statement. We reproduce it rather than "fix" it (BRD REQ-015, D7).
 *
 *   roundHalfUp implementation:
 *     Math.floor(x * 100 + 0.5) / 100
 *   Works in integer cents to avoid IEEE-754 accumulation. Equivalent to
 *   Excel/Google Sheets =ROUND(x, 2) for positive amounts.
 *
 *   Anchor row from payment-068 (D7):
 *     payout 70220.83 × 0.05 = 3511.0415 → commission 3511.04, royalty 66709.79 (display)
 *
 *   Half-cent boundary case:
 *     payout 0.50 × 0.05 = 0.025 → commission 0.03 (rounds UP)
 *
 * NOTE: The full 16-row payment-068 golden fixture (total payout 96665.49,
 * royaltySubtotal 91832.22, remittanceTotal 91813.22) is asserted from the
 * authoritative CSV export in statementService.test.ts.
 */

import type {
  BusinessStatement,
  StatementLineItem,
  StatementCharge,
  StatementHeader,
} from '../types/index';

// ---------------------------------------------------------------------------
// Default footer notes
// ---------------------------------------------------------------------------

/**
 * Default statement footer notes — the standard OoT legacy template text.
 *
 * Single source of truth shared by: the settings form (pre-fills it for a new
 * workspace), the backend settings service (defaults it at GET so generation
 * snapshots it), and the renderers (fall back to it for statements generated
 * before footer notes existed). An explicitly-saved empty string means "omit"
 * and is preserved everywhere — the default only applies when notes are absent
 * (undefined), never when they were saved blank.
 */
export const DEFAULT_STATEMENT_NOTES =
  'The KDP Disbursement Date is the date funds were transferred from KDP to OoT Media. ' +
  'The Payment Date above is the date the funds were transferred from OoT Media to Dream Big Publishing.\n\n' +
  'Transactions over $100,000 will arrive in two separate ACH transactions over 2 business days.';

// ---------------------------------------------------------------------------
// Types for the pure compute function's input
// ---------------------------------------------------------------------------

/** One trust-inflow transaction as needed by the statement calculator. */
export interface TrustInflowTxn {
  transactionId: string;
  disbursementDate: string; // YYYY-MM-DD — the transaction date
  payout: number;           // gross deposit amount (positive)
}

/** Billable transactions grouped by subtype ID. */
export type BillableBySubtype = Record<string, number[]>; // subTypeId → [amount, ...]

/**
 * Minimal subtype descriptor required by computeStatement.
 * Mirrors the shape of BILLABLE_SUBTYPES entries in categoryTemplates.ts so
 * that the caller (statementService) can pass BILLABLE_SUBTYPES directly.
 * Keeping this in shared/ avoids a cross-boundary import from shared → backend.
 */
export interface BillableSubtypeDescriptor {
  id: string;
  label: string;
}

/** All inputs required by computeStatement — caller supplies everything. */
export interface ComputeStatementInput {
  trustInflowTxns: TrustInflowTxn[];
  billableBySubtype: BillableBySubtype;
  /** All configured charge sub-types, in display order (REQ-016: zero lines included). */
  billableSubtypes: ReadonlyArray<BillableSubtypeDescriptor>;
  commissionRate: number;    // e.g. 0.05
  paymentNumber: number;     // e.g. 68
  paymentDate: string;       // YYYY-MM-DD
  periodMonth: string;       // YYYY-MM
  clientHeader: StatementHeader;
}

// ---------------------------------------------------------------------------
// Rounding helper
// ---------------------------------------------------------------------------

/**
 * Round a number to the nearest cent using the "round half-up" convention.
 *
 * Works in integer cents to avoid IEEE-754 accumulation errors.
 * For any positive payout × rate, this produces the same result as
 * Excel/Google Sheets =ROUND(x, 2).
 *
 * Half-cent pin test: roundHalfUp(0.025) === 0.03
 */
export function roundHalfUp(value: number): number {
  return Math.floor(value * 100 + 0.5) / 100;
}

// ---------------------------------------------------------------------------
// Pure statement computation
// ---------------------------------------------------------------------------

/**
 * Compute all statement fields from input transactions and metadata.
 *
 * Returns everything in BusinessStatement EXCEPT id and createdAt, which
 * are assigned by the persistence layer (statementService.generateStatement).
 */
export function computeStatement(
  input: ComputeStatementInput,
): Omit<BusinessStatement, 'id' | 'createdAt'> {
  const {
    trustInflowTxns,
    billableBySubtype,
    billableSubtypes,
    commissionRate,
    paymentNumber,
    paymentDate,
    periodMonth,
    clientHeader,
  } = input;

  // --- Per-row commission and royalty (for DISPLAY only) ---
  // royalty_i is the display value for each row; it is NOT summed to produce
  // the authoritative royaltySubtotal (see BRD REQ-015 and D7 corrected rule).
  const lineItems: StatementLineItem[] = trustInflowTxns.map((txn) => {
    const commission = roundHalfUp(txn.payout * commissionRate);
    const royalty = txn.payout - commission;
    return {
      disbursementDate: txn.disbursementDate,
      payout: txn.payout,
      commission,
      royalty,
      transactionId: txn.transactionId,
    };
  });

  // --- Royalty subtotal (AUTHORITATIVE — round once on the full-precision aggregate) ---
  // Correct formula: roundHalfUp( Σ(payout_i) × (1 - commissionRate) )
  // This deliberately differs from Σ(royalty_i) by at most 1 cent, matching
  // the legacy Google-Sheet statement behaviour (BRD REQ-015, D7).
  const payoutSum = trustInflowTxns.reduce((sum, txn) => sum + txn.payout, 0);
  const royaltySubtotal = roundHalfUp(payoutSum * (1 - commissionRate));

  // --- Other fees & charges — one entry per billableSubtypes, including $0 lines (REQ-016) ---
  // Each amount is rounded to cents so the stored/displayed total is exact
  // (sums of cent-precise transaction amounts can otherwise carry float noise).
  const charges: StatementCharge[] = billableSubtypes.map((subtype) => {
    const amounts = billableBySubtype[subtype.id] ?? [];
    const amount = roundHalfUp(amounts.reduce((sum, a) => sum + a, 0));
    return {
      subType: subtype.id,
      label: subtype.label,
      amount,
    };
  });

  // --- Remittance total ---
  // roundHalfUp guards the final subtraction against IEEE-754 noise so the
  // stored remittance is an exact cent value (e.g. 91832.22 - 19.00 → 91813.22).
  const totalCharges = charges.reduce((sum, c) => sum + c.amount, 0);
  const remittanceTotal = roundHalfUp(royaltySubtotal - totalCharges);

  return {
    paymentNumber,
    paymentDate,
    periodMonth,
    commissionRate,
    lineItems,
    royaltySubtotal,
    charges,
    remittanceTotal,
    clientHeader,
  };
}
