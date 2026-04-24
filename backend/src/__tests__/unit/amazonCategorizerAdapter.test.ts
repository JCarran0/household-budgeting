/**
 * Unit tests for the pure helpers in `amazonCategorizerAdapter`.
 *
 * The Claude round-trip itself is integration-tested; here we pin the prompt
 * construction, few-shot example sampling, and the rounding absorption that
 * keeps split-transaction math exact.
 */

import {
  buildCategoryContext,
  buildExamplesFromTransactions,
  buildSplitRecommendations,
} from '../../services/amazon/amazonCategorizerAdapter';
import type {
  AmazonTransactionMatch,
  Category,
  Transaction,
} from '../../shared/types';

function cat(overrides: Partial<Category> & { id: string; name: string }): Category {
  return {
    parentId: null,
    isCustom: false,
    isHidden: false,
    isRollover: false,
    isIncome: false,
    isSavings: false,
    color: '',
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
    ...overrides,
  } as Category;
}

function tx(overrides: Partial<Transaction> & { id: string }): Transaction {
  return {
    plaidTransactionId: null,
    accountId: 'acct',
    amount: -10,
    date: '2026-04-10',
    name: 'Foo',
    userDescription: null,
    merchantName: null,
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
  } as Transaction;
}

describe('buildCategoryContext', () => {
  it('renders parents with children inline and parents without children alone', () => {
    const categories = [
      cat({ id: 'FOOD', name: 'Food' }),
      cat({ id: 'FOOD_GROCERIES', name: 'Groceries', parentId: 'FOOD' }),
      cat({ id: 'FOOD_DINING', name: 'Dining', parentId: 'FOOD' }),
      cat({ id: 'RENT', name: 'Rent' }), // no children
    ];
    const result = buildCategoryContext(categories);
    expect(result).toContain('Food (FOOD): Groceries (FOOD_GROCERIES), Dining (FOOD_DINING)');
    expect(result).toContain('Rent (RENT)');
    // Leaf-only entry should not carry a colon
    expect(result.split('\n').find(l => l.startsWith('Rent'))).toBe('Rent (RENT)');
  });

  it('excludes hidden parents and hidden children', () => {
    const categories = [
      cat({ id: 'FOOD', name: 'Food' }),
      cat({ id: 'FOOD_GROCERIES', name: 'Groceries', parentId: 'FOOD' }),
      cat({ id: 'FOOD_DINING', name: 'Dining', parentId: 'FOOD', isHidden: true }),
      cat({ id: 'HIDDEN', name: 'Hidden parent', isHidden: true }),
    ];
    const result = buildCategoryContext(categories);
    expect(result).toContain('Groceries (FOOD_GROCERIES)');
    expect(result).not.toContain('Dining');
    expect(result).not.toContain('Hidden parent');
  });
});

describe('buildExamplesFromTransactions', () => {
  it('groups by category, sorts categories by transaction count desc, caps per-category', () => {
    const cats = [cat({ id: 'A', name: 'AAA' }), cat({ id: 'B', name: 'BBB' })];
    // 6 in B (capped to 5), 2 in A — B should appear first
    const transactions = [
      ...Array.from({ length: 6 }, (_, i) =>
        tx({ id: `b${i}`, categoryId: 'B', merchantName: `Merch${i}`, amount: -5 }),
      ),
      tx({ id: 'a1', categoryId: 'A', merchantName: 'MA1', amount: -2 }),
      tx({ id: 'a2', categoryId: 'A', merchantName: 'MA2', amount: -3 }),
    ];
    const result = buildExamplesFromTransactions(transactions, cats);
    const lines = result.split('\n');
    expect(lines[0]).toMatch(/^BBB \(B\):/);
    // 5 quoted merchant entries (not 6)
    const firstLineMerchants = lines[0].match(/"Merch\d+"/g);
    expect(firstLineMerchants).toHaveLength(5);
    expect(lines[1]).toMatch(/^AAA \(A\):/);
  });

  it('skips transactions without a categoryId and unknown category ids', () => {
    const cats = [cat({ id: 'KNOWN', name: 'Known' })];
    const transactions = [
      tx({ id: '1', categoryId: null }),
      tx({ id: '2', categoryId: 'UNKNOWN' }),
      tx({ id: '3', categoryId: 'KNOWN', merchantName: 'M3', amount: -1 }),
    ];
    const result = buildExamplesFromTransactions(transactions, cats);
    expect(result).toBe('Known (KNOWN): "M3" ($1.00)');
  });

  it('falls back to tx.name when merchantName is null', () => {
    const cats = [cat({ id: 'C', name: 'Cat' })];
    const transactions = [
      tx({ id: '1', categoryId: 'C', merchantName: null, name: 'RAW-NAME', amount: -7 }),
    ];
    expect(buildExamplesFromTransactions(transactions, cats))
      .toBe('Cat (C): "RAW-NAME" ($7.00)');
  });
});

describe('buildSplitRecommendations — rounding absorption', () => {
  const cats = [cat({ id: 'X', name: 'X' }), cat({ id: 'Y', name: 'Y' })];
  const catMap = new Map(cats.map(c => [c.id, c]));

  function makeMatch(id: string, transactionId: string): AmazonTransactionMatch {
    return {
      id,
      orderNumber: 'n',
      transactionId,
      matchConfidence: 'high',
      items: [],
      splitTransactionIds: [],
      status: 'pending',
    };
  }

  it('adjusts the last split to absorb sub-cent rounding error', () => {
    const match = makeMatch('m1', 't1');
    const transactions = [tx({ id: 't1', amount: -10.0 })];
    const txMap = new Map(transactions.map(t => [t.id, t]));
    const output = {
      categorizations: [],
      splitRecommendations: [
        {
          matchId: 'm1',
          splits: [
            { itemName: 'a', estimatedAmount: 3.33, suggestedCategoryId: 'X', confidence: 0.9, isEstimatedPrice: false },
            { itemName: 'b', estimatedAmount: 3.33, suggestedCategoryId: 'X', confidence: 0.9, isEstimatedPrice: false },
            { itemName: 'c', estimatedAmount: 3.33, suggestedCategoryId: 'Y', confidence: 0.9, isEstimatedPrice: false },
          ],
        },
      ],
    };
    const [result] = buildSplitRecommendations(output, [match], txMap, catMap);
    const total = result.splits.reduce((s, x) => s + x.estimatedAmount, 0);
    expect(Math.abs(total - 10)).toBeLessThan(0.005);
    expect(result.splits[2].estimatedAmount).toBe(3.34);
    expect(result.originalAmount).toBe(10);
    expect(result.totalMatchesOriginal).toBe(true);
  });

  it('leaves the splits alone when they already match to the cent', () => {
    const match = makeMatch('m1', 't1');
    const transactions = [tx({ id: 't1', amount: -10.0 })];
    const txMap = new Map(transactions.map(t => [t.id, t]));
    const output = {
      categorizations: [],
      splitRecommendations: [
        {
          matchId: 'm1',
          splits: [
            { itemName: 'a', estimatedAmount: 4.5, suggestedCategoryId: 'X', confidence: 0.9, isEstimatedPrice: false },
            { itemName: 'b', estimatedAmount: 5.5, suggestedCategoryId: 'Y', confidence: 0.9, isEstimatedPrice: false },
          ],
        },
      ],
    };
    const [result] = buildSplitRecommendations(output, [match], txMap, catMap);
    expect(result.splits.map(s => s.estimatedAmount)).toEqual([4.5, 5.5]);
  });

  it('enriches splits with categoryName, falling back to "Unknown" for unknown ids', () => {
    const match = makeMatch('m1', 't1');
    const transactions = [tx({ id: 't1', amount: -5 })];
    const txMap = new Map(transactions.map(t => [t.id, t]));
    const output = {
      categorizations: [],
      splitRecommendations: [
        {
          matchId: 'm1',
          splits: [
            { itemName: 'a', estimatedAmount: 5, suggestedCategoryId: 'UNKNOWN', confidence: 0.9, isEstimatedPrice: false },
          ],
        },
      ],
    };
    const [result] = buildSplitRecommendations(output, [match], txMap, catMap);
    expect((result.splits[0] as { categoryName: string }).categoryName).toBe('Unknown');
  });

  it('returns originalAmount = 0 when the transaction is missing', () => {
    const match = makeMatch('m1', 'missing-tx');
    const txMap = new Map<string, Transaction>();
    const output = {
      categorizations: [],
      splitRecommendations: [
        {
          matchId: 'm1',
          splits: [
            { itemName: 'a', estimatedAmount: 7, suggestedCategoryId: 'X', confidence: 0.9, isEstimatedPrice: false },
          ],
        },
      ],
    };
    const [result] = buildSplitRecommendations(output, [match], txMap, catMap);
    expect(result.originalAmount).toBe(0);
  });
});
