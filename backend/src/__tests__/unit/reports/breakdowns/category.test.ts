/**
 * Unit tests for buildCategoryBreakdown (Sprint 5.5 / TD-010).
 *
 * Covers: hierarchical rollup, flat-list path, savings exclusion (the landmine),
 * hidden-category exclusion, zero-total edge case, sort order.
 */

import { buildCategoryBreakdown } from '../../../../services/reports/breakdowns/category';
import { StoredTransaction } from '../../../../services/transactionService';
import { Category } from '../../../../shared/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTx(
  overrides: Partial<StoredTransaction> & Pick<StoredTransaction, 'id' | 'amount' | 'date'>
): StoredTransaction {
  return {
    userId: 'fam-1',
    accountId: 'acc-1',
    plaidTransactionId: null,
    plaidAccountId: 'plaid-acc-1',
    name: 'Test',
    userDescription: null,
    merchantName: null,
    category: null,
    plaidCategoryId: null,
    categoryId: null,
    status: 'posted',
    pending: false,
    isoCurrencyCode: 'USD',
    tags: [],
    notes: null,
    isHidden: false,
    isFlagged: false,
    isSplit: false,
    parentTransactionId: null,
    splitTransactionIds: [],
    accountOwner: null,
    originalDescription: null,
    location: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const CATEGORIES: Category[] = [
  { id: 'FOOD', name: 'Food', parentId: null, isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
  { id: 'FOOD_GROCERIES', name: 'Groceries', parentId: 'FOOD', isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
  { id: 'FOOD_RESTAURANTS', name: 'Restaurants', parentId: 'FOOD', isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
  { id: 'TRANSPORT', name: 'Transport', parentId: null, isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
  { id: 'TRANSPORT_GAS', name: 'Gas', parentId: 'TRANSPORT', isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
  // Hidden parent — its children are also effectively hidden
  { id: 'HIDDEN_CAT', name: 'Hidden', parentId: null, isCustom: true, isHidden: true, isRollover: false, isIncome: false, isSavings: false },
  { id: 'HIDDEN_CHILD', name: 'Hidden Child', parentId: 'HIDDEN_CAT', isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
  // Savings — must be excluded from spending breakdown
  { id: 'SAVINGS', name: 'Savings', parentId: null, isCustom: true, isHidden: false, isRollover: true, isIncome: false, isSavings: true },
  { id: 'SAVINGS_EMERGENCY', name: 'Emergency Fund', parentId: 'SAVINGS', isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
];

const START = '2025-01-01';
const END = '2025-01-31';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildCategoryBreakdown', () => {
  test('returns zero total and empty breakdown when there are no transactions', () => {
    const result = buildCategoryBreakdown([], CATEGORIES, START, END, true);
    expect(result.total).toBe(0);
    expect(result.breakdown).toEqual([]);
  });

  test('hierarchical: rolls up child amounts under parent', () => {
    const txns = [
      makeTx({ id: 't1', amount: 120, date: '2025-01-10', categoryId: 'FOOD_GROCERIES' }),
      makeTx({ id: 't2', amount: 50, date: '2025-01-15', categoryId: 'FOOD_RESTAURANTS' }),
    ];
    const result = buildCategoryBreakdown(txns, CATEGORIES, START, END, true);

    expect(result.total).toBeCloseTo(170);
    const food = result.breakdown.find(b => b.categoryId === 'FOOD')!;
    expect(food).toBeDefined();
    expect(food.amount).toBeCloseTo(170);
    expect(food.subcategories).toHaveLength(2);
  });

  test('hierarchical: parent with own transactions adds its own amount to rollup', () => {
    const txns = [
      makeTx({ id: 't1', amount: 100, date: '2025-01-10', categoryId: 'FOOD' }),       // parent direct
      makeTx({ id: 't2', amount: 50, date: '2025-01-15', categoryId: 'FOOD_GROCERIES' }), // child
    ];
    const result = buildCategoryBreakdown(txns, CATEGORIES, START, END, true);

    const food = result.breakdown.find(b => b.categoryId === 'FOOD')!;
    expect(food.amount).toBeCloseTo(150);
    // transactionCount = 1 for parent direct + 1 for child
    expect(food.transactionCount).toBe(2);
  });

  test('LANDMINE: savings transactions are excluded from spending breakdown', () => {
    const txns = [
      makeTx({ id: 't1', amount: 120, date: '2025-01-10', categoryId: 'FOOD_GROCERIES' }),
      makeTx({ id: 't2', amount: 500, date: '2025-01-31', categoryId: 'SAVINGS_EMERGENCY' }), // savings — must be excluded
    ];
    const result = buildCategoryBreakdown(txns, CATEGORIES, START, END, true);

    expect(result.total).toBeCloseTo(120);
    // No savings entry should appear
    const savingsEntry = result.breakdown.find(b => b.categoryId === 'SAVINGS' || b.categoryId === 'SAVINGS_EMERGENCY');
    expect(savingsEntry).toBeUndefined();
  });

  test('excludes hidden categories and their children', () => {
    const txns = [
      makeTx({ id: 't1', amount: 120, date: '2025-01-10', categoryId: 'FOOD_GROCERIES' }),
      makeTx({ id: 't2', amount: 999, date: '2025-01-10', categoryId: 'HIDDEN_CAT' }),    // hidden parent
      makeTx({ id: 't3', amount: 555, date: '2025-01-10', categoryId: 'HIDDEN_CHILD' }), // child of hidden
    ];
    const result = buildCategoryBreakdown(txns, CATEGORIES, START, END, true);

    expect(result.total).toBeCloseTo(120);
    expect(result.breakdown.find(b => b.categoryId === 'HIDDEN_CAT')).toBeUndefined();
  });

  test('sort order: breakdown sorted by amount descending', () => {
    const txns = [
      makeTx({ id: 't1', amount: 30, date: '2025-01-10', categoryId: 'TRANSPORT_GAS' }),
      makeTx({ id: 't2', amount: 200, date: '2025-01-10', categoryId: 'FOOD_GROCERIES' }),
    ];
    const result = buildCategoryBreakdown(txns, CATEGORIES, START, END, true);

    expect(result.breakdown[0].categoryId).toBe('FOOD');
    expect(result.breakdown[1].categoryId).toBe('TRANSPORT');
  });

  test('flat list: includeSubcategories=false has no nested subcategories', () => {
    const txns = [
      makeTx({ id: 't1', amount: 120, date: '2025-01-10', categoryId: 'FOOD_GROCERIES' }),
      makeTx({ id: 't2', amount: 50, date: '2025-01-10', categoryId: 'FOOD_RESTAURANTS' }),
    ];
    const result = buildCategoryBreakdown(txns, CATEGORIES, START, END, false);

    expect(result.breakdown.every(b => b.subcategories === undefined)).toBe(true);
    const ids = result.breakdown.map(b => b.categoryId);
    expect(ids).toContain('FOOD_GROCERIES');
    expect(ids).toContain('FOOD_RESTAURANTS');
  });

  test('uncategorized transactions appear as Uncategorized entry', () => {
    const txns = [
      makeTx({ id: 't1', amount: 25, date: '2025-01-07', categoryId: null }),
    ];
    const result = buildCategoryBreakdown(txns, CATEGORIES, START, END, true);

    const uncatEntry = result.breakdown.find(b => b.categoryId === 'uncategorized');
    expect(uncatEntry).toBeDefined();
    expect(uncatEntry!.amount).toBeCloseTo(25);
  });

  test('excludes pending and out-of-range transactions', () => {
    const txns = [
      makeTx({ id: 't1', amount: 100, date: '2025-01-10', categoryId: 'FOOD_GROCERIES' }),
      makeTx({ id: 't2', amount: 50, date: '2025-01-10', categoryId: 'FOOD_GROCERIES', pending: true }),
      makeTx({ id: 't3', amount: 200, date: '2025-02-01', categoryId: 'FOOD_GROCERIES' }), // out of range
    ];
    const result = buildCategoryBreakdown(txns, CATEGORIES, START, END, true);
    expect(result.total).toBeCloseTo(100);
  });
});
