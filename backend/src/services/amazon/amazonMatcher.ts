/**
 * Amazon receipt matching — pure functions.
 *
 * Extracted from `amazonReceiptService.ts` (Sprint 5 / TD-010). These functions
 * own the tiered order → transaction matching algorithm and a few closely
 * related helpers (merchant detection, amount/date comparators). All pure,
 * no I/O, no network — the orchestrator still owns persistence and
 * eligibility computation.
 */

import { randomUUID } from 'crypto';
import type {
  ParsedAmazonOrder,
  Transaction,
  AmazonTransactionMatch,
  AmbiguousAmazonMatch,
} from '../../shared/types';

/** Merchant-name substrings that identify Amazon transactions. */
export const AMAZON_MERCHANT_PATTERNS = [
  'amazon',
  'amzn',
  'kindle svcs',
  'amzn mktp',
  'amazon digital',
  'amazon mktpl',
  'amazon reta',
];

export const TIGHT_DATE_WINDOW_DAYS = 3;
export const WIDE_DATE_WINDOW_DAYS = 7;
export const MS_PER_DAY = 86_400_000;
export const CUSTOM_AMAZON_CATEGORY = 'CUSTOM_AMAZON';

export type SingleMatchResult =
  | { type: 'matched'; match: AmazonTransactionMatch }
  | { type: 'ambiguous'; ambiguousMatch: AmbiguousAmazonMatch }
  | { type: 'unmatched' };

/** Is the transaction from an Amazon merchant? (case-insensitive substring.) */
export function isAmazonMerchant(transaction: Transaction): boolean {
  const name = (transaction.name || '').toLowerCase();
  const merchant = (transaction.merchantName || '').toLowerCase();
  return AMAZON_MERCHANT_PATTERNS.some(
    pattern => name.includes(pattern) || merchant.includes(pattern),
  );
}

/**
 * Characters a bank's scrubber can leave behind once it has masked a
 * descriptor. Punctuation is in the set because the masking observed on
 * Capital One (from 2026-07-18) replaces alphanumerics only and leaves
 * punctuation in place: `Amazon.com*531C57BL2` arrives as
 * `******.*************`.
 */
const MASK_ONLY = /^[*.\s-]+$/;

/**
 * Did the bank tell us nothing at all about this merchant?
 *
 * True only when the descriptor has been fully masked upstream — every
 * character is a mask character, at least one of them an asterisk, and Plaid's
 * enrichment came back empty too (a fully-masked `name` gives it nothing to
 * enrich from, so `merchantName` is null).
 *
 * This deliberately does NOT fire on a partially masked descriptor. Capital One
 * preserves the merchant token up to the first space, so `AMAZON ***********`
 * still identifies itself and is matched by `isAmazonMerchant` on its own
 * merits. Only a descriptor with no space at all — the `Amazon.com*ORDERID`
 * form — loses everything.
 *
 * Note that an unmasked `*` is ordinary in card descriptors (`Fine*Woodworking`,
 * `UEP*ICHIDDO RAMEN`), which is why the whole string must be mask characters
 * rather than merely containing one.
 */
export function hasOpaqueDescriptor(transaction: Transaction): boolean {
  const name = (transaction.name || '').trim();
  if (!name.includes('*')) return false;
  if (!MASK_ONLY.test(name)) return false;
  return (transaction.merchantName || '').trim() === '';
}

/**
 * Should this transaction be offered to the receipt matcher?
 *
 * Two different reasons qualify, and they are kept distinct on purpose:
 *   - `isAmazonMerchant` — the descriptor says Amazon. We know what it is.
 *   - `hasOpaqueDescriptor` — the bank masked it, so we cannot rule Amazon
 *     *out*. We are not asserting it is Amazon; we are declining to exclude an
 *     unidentifiable transaction from a flow whose entire job is to supply the
 *     identity the bank withheld.
 *
 * Nothing downstream treats the second group as Amazon on this basis alone. A
 * match still requires an exact amount match against a real parsed order inside
 * the date window, and the user still confirms it before anything is written.
 */
export function isReceiptMatchCandidate(transaction: Transaction): boolean {
  return isAmazonMerchant(transaction) || hasOpaqueDescriptor(transaction);
}

/**
 * Amazon charges are positive expenses in this app's Plaid setup; bank tx
 * amounts may be signed either way. Compare absolute values, match to the cent.
 */
export function amountsMatch(txAmount: number, orderAmount: number): boolean {
  return Math.abs(Math.abs(txAmount) - orderAmount) < 0.005;
}

/** Is the transaction date within ±days of the order date? */
export function withinDateWindow(
  txDateStr: string,
  orderDate: Date,
  days: number,
): boolean {
  const txDate = new Date(txDateStr);
  const diff = Math.abs(txDate.getTime() - orderDate.getTime());
  return diff <= days * MS_PER_DAY;
}

/** Build a pending match for an order + transaction pairing. */
export function createMatch(
  order: ParsedAmazonOrder,
  transaction: Transaction,
  confidence: 'high' | 'medium',
): AmazonTransactionMatch {
  return {
    id: randomUUID(),
    orderNumber: order.orderNumber,
    transactionId: transaction.id,
    matchConfidence: confidence,
    items: order.items.map(item => ({
      name: item.name,
      estimatedPrice: item.estimatedPrice,
      suggestedCategoryId: null,
      appliedCategoryId: null,
      confidence: 0,
      isEstimatedPrice: item.estimatedPrice === null,
    })),
    splitTransactionIds: [],
    status: 'pending',
  };
}

/**
 * Tiered match for a single order (BRD §4.1):
 *   Tier 1 — exact amount + date within ±3 days, exactly one candidate → high
 *   Tier 2 — exact amount + date within ±7 days, exactly one candidate → medium
 *   Tier 3 — multiple amount matches → ambiguous (up to 5 candidates)
 *   Fallback — single amount match outside the 7-day window → medium
 */
export function matchSingleOrder(
  order: ParsedAmazonOrder,
  transactions: Transaction[],
  usedIds: Set<string>,
): SingleMatchResult {
  const orderDate = new Date(order.orderDate);
  const orderAmount = order.totalAmount;

  const amountMatches = transactions.filter(
    t => !usedIds.has(t.id) && amountsMatch(t.amount, orderAmount),
  );

  if (amountMatches.length === 0) {
    return { type: 'unmatched' };
  }

  const tier1 = amountMatches.filter(t =>
    withinDateWindow(t.date, orderDate, TIGHT_DATE_WINDOW_DAYS),
  );
  if (tier1.length === 1) {
    return { type: 'matched', match: createMatch(order, tier1[0], 'high') };
  }

  const tier2 = amountMatches.filter(t =>
    withinDateWindow(t.date, orderDate, WIDE_DATE_WINDOW_DAYS),
  );
  if (tier2.length === 1) {
    return { type: 'matched', match: createMatch(order, tier2[0], 'medium') };
  }

  const candidates = (tier2.length > 0 ? tier2 : amountMatches).slice(0, 5);
  if (candidates.length > 1) {
    return {
      type: 'ambiguous',
      ambiguousMatch: {
        order,
        candidates: candidates.map(t => ({
          transactionId: t.id,
          date: t.date,
          amount: t.amount,
          description: t.name,
        })),
      },
    };
  }

  if (candidates.length === 1) {
    return { type: 'matched', match: createMatch(order, candidates[0], 'medium') };
  }

  return { type: 'unmatched' };
}
