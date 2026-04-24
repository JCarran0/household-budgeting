/**
 * Unit tests for the pure Amazon matching helpers (Sprint 5 / TD-010).
 *
 * The matcher implements the tiered match strategy from AI-AMAZON-RECEIPT-BRD
 * §4.1. These tests pin tier boundaries + ambiguity vs. fallback, since silent
 * regression here would silently mis-attribute charges during manual UAT.
 */

import {
  AMAZON_MERCHANT_PATTERNS,
  TIGHT_DATE_WINDOW_DAYS,
  WIDE_DATE_WINDOW_DAYS,
  amountsMatch,
  createMatch,
  isAmazonMerchant,
  matchSingleOrder,
  withinDateWindow,
} from '../../services/amazon/amazonMatcher';
import type { ParsedAmazonOrder, Transaction } from '../../shared/types';

function makeTx(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'tx-' + Math.random().toString(36).slice(2, 8),
    plaidTransactionId: null,
    accountId: 'acct-1',
    amount: 0,
    date: '2026-04-10',
    name: 'AMAZON.COM',
    userDescription: null,
    merchantName: 'Amazon',
    category: [],
    plaidCategoryId: null,
    categoryId: null,
    pending: false,
    tags: [],
    notes: null,
    isHidden: false,
    isFlagged: false,
    isManual: false,
    isSplit: false,
    parentTransactionId: null,
    splitTransactionIds: [],
    accountOwner: null,
    originalDescription: null,
    location: null,
    createdAt: '2026-04-10T00:00:00Z',
    updatedAt: '2026-04-10T00:00:00Z',
    ...overrides,
  };
}

function makeOrder(overrides: Partial<ParsedAmazonOrder> = {}): ParsedAmazonOrder {
  return {
    orderNumber: '111-1234567-1234567',
    orderDate: '2026-04-10',
    totalAmount: 42.5,
    items: [{ name: 'Widget', estimatedPrice: 42.5, quantity: 1 }],
    ...overrides,
  };
}

describe('isAmazonMerchant', () => {
  it('matches every known merchant pattern (case-insensitive) on name or merchantName', () => {
    for (const pattern of AMAZON_MERCHANT_PATTERNS) {
      expect(
        isAmazonMerchant(makeTx({ name: pattern.toUpperCase(), merchantName: null })),
      ).toBe(true);
      expect(
        isAmazonMerchant(makeTx({ name: 'SOMETHING', merchantName: pattern })),
      ).toBe(true);
    }
  });

  it('ignores non-Amazon merchants', () => {
    expect(
      isAmazonMerchant(makeTx({ name: 'WALMART', merchantName: 'Walmart' })),
    ).toBe(false);
  });

  it('treats missing name/merchantName as empty (no match)', () => {
    expect(
      isAmazonMerchant(makeTx({ name: '', merchantName: null })),
    ).toBe(false);
  });
});

describe('amountsMatch', () => {
  it('matches regardless of transaction sign (Plaid may send either)', () => {
    expect(amountsMatch(42.5, 42.5)).toBe(true);
    expect(amountsMatch(-42.5, 42.5)).toBe(true);
  });

  it('matches to the cent with a sub-penny tolerance', () => {
    expect(amountsMatch(42.504, 42.5)).toBe(true);
    expect(amountsMatch(42.506, 42.5)).toBe(false);
  });

  it('rejects a one-cent mismatch', () => {
    expect(amountsMatch(42.51, 42.5)).toBe(false);
  });
});

describe('withinDateWindow', () => {
  const orderDate = new Date('2026-04-10');

  it('is inclusive at the exact boundary', () => {
    expect(withinDateWindow('2026-04-13', orderDate, TIGHT_DATE_WINDOW_DAYS)).toBe(true);
    expect(withinDateWindow('2026-04-07', orderDate, TIGHT_DATE_WINDOW_DAYS)).toBe(true);
  });

  it('excludes one day outside the window', () => {
    expect(withinDateWindow('2026-04-14', orderDate, TIGHT_DATE_WINDOW_DAYS)).toBe(false);
  });

  it('respects the wide (±7) window', () => {
    expect(withinDateWindow('2026-04-17', orderDate, WIDE_DATE_WINDOW_DAYS)).toBe(true);
    expect(withinDateWindow('2026-04-18', orderDate, WIDE_DATE_WINDOW_DAYS)).toBe(false);
  });
});

describe('createMatch', () => {
  it('produces a pending match with one item per order item', () => {
    const order = makeOrder({
      items: [
        { name: 'A', estimatedPrice: 10, quantity: 1 },
        { name: 'B', estimatedPrice: null, quantity: 2 },
      ],
    });
    const tx = makeTx({ id: 'tx-xyz', amount: -42.5 });

    const match = createMatch(order, tx, 'high');

    expect(match.status).toBe('pending');
    expect(match.matchConfidence).toBe('high');
    expect(match.transactionId).toBe('tx-xyz');
    expect(match.orderNumber).toBe(order.orderNumber);
    expect(match.items).toHaveLength(2);
    expect(match.items[0]).toMatchObject({
      name: 'A',
      estimatedPrice: 10,
      isEstimatedPrice: false,
      suggestedCategoryId: null,
      appliedCategoryId: null,
    });
    expect(match.items[1]).toMatchObject({
      name: 'B',
      estimatedPrice: null,
      isEstimatedPrice: true,
    });
    expect(match.splitTransactionIds).toEqual([]);
  });
});

describe('matchSingleOrder — tiered algorithm', () => {
  const order = makeOrder({ orderDate: '2026-04-10', totalAmount: 42.5 });

  it('returns unmatched when no transaction shares the amount', () => {
    const tx = makeTx({ amount: -9.99, date: '2026-04-10' });
    expect(matchSingleOrder(order, [tx], new Set()).type).toBe('unmatched');
  });

  it('tier 1 — exactly one match within ±3 days → high confidence', () => {
    const tx = makeTx({ id: 'tx-1', amount: -42.5, date: '2026-04-11' });
    const result = matchSingleOrder(order, [tx], new Set());
    expect(result.type).toBe('matched');
    if (result.type !== 'matched') return;
    expect(result.match.matchConfidence).toBe('high');
    expect(result.match.transactionId).toBe('tx-1');
  });

  it('tier 2 — exactly one match inside ±7 but outside ±3 → medium', () => {
    const tx = makeTx({ id: 'tx-2', amount: -42.5, date: '2026-04-15' });
    const result = matchSingleOrder(order, [tx], new Set());
    expect(result.type).toBe('matched');
    if (result.type !== 'matched') return;
    expect(result.match.matchConfidence).toBe('medium');
  });

  it('ambiguous — multiple tier-1 candidates → ambiguous with ≤5 candidates', () => {
    const txs = [
      makeTx({ id: 'a', amount: -42.5, date: '2026-04-10' }),
      makeTx({ id: 'b', amount: -42.5, date: '2026-04-11' }),
    ];
    const result = matchSingleOrder(order, txs, new Set());
    expect(result.type).toBe('ambiguous');
    if (result.type !== 'ambiguous') return;
    expect(result.ambiguousMatch.candidates).toHaveLength(2);
    expect(result.ambiguousMatch.candidates.map(c => c.transactionId).sort())
      .toEqual(['a', 'b']);
  });

  it('ambiguous — caps candidate list at 5', () => {
    const txs = Array.from({ length: 7 }, (_, i) =>
      makeTx({ id: `c${i}`, amount: -42.5, date: '2026-04-10' }),
    );
    const result = matchSingleOrder(order, txs, new Set());
    expect(result.type).toBe('ambiguous');
    if (result.type !== 'ambiguous') return;
    expect(result.ambiguousMatch.candidates).toHaveLength(5);
  });

  it('prefers tier-2 candidates over out-of-window ones for ambiguity', () => {
    // two inside ±7, one far outside — ambiguous should list only the two in-window
    const txs = [
      makeTx({ id: 'near1', amount: -42.5, date: '2026-04-15' }),
      makeTx({ id: 'near2', amount: -42.5, date: '2026-04-16' }),
      makeTx({ id: 'far',   amount: -42.5, date: '2026-05-30' }),
    ];
    const result = matchSingleOrder(order, txs, new Set());
    expect(result.type).toBe('ambiguous');
    if (result.type !== 'ambiguous') return;
    const ids = result.ambiguousMatch.candidates.map(c => c.transactionId).sort();
    expect(ids).toEqual(['near1', 'near2']);
  });

  it('fallback — single match outside ±7 window still resolves as medium', () => {
    const tx = makeTx({ id: 'tx-far', amount: -42.5, date: '2026-05-30' });
    const result = matchSingleOrder(order, [tx], new Set());
    expect(result.type).toBe('matched');
    if (result.type !== 'matched') return;
    expect(result.match.matchConfidence).toBe('medium');
  });

  it('skips transactions already consumed by usedIds', () => {
    const used = makeTx({ id: 'used', amount: -42.5, date: '2026-04-10' });
    const fresh = makeTx({ id: 'fresh', amount: -42.5, date: '2026-04-11' });
    const result = matchSingleOrder(order, [used, fresh], new Set(['used']));
    expect(result.type).toBe('matched');
    if (result.type !== 'matched') return;
    expect(result.match.transactionId).toBe('fresh');
  });
});
