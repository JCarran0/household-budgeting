/**
 * Unit tests for buildIncomeBreakdown (Sprint 5.5 / TD-010).
 *
 * Covers: hierarchical rollup, flat-list path, hidden-category exclusion,
 * zero-total edge case, sort order, missing income parent, and that
 * spending transactions are excluded.
 */

import { buildIncomeBreakdown } from '../../../../services/reports/breakdowns/income';
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
  { id: 'INCOME', name: 'Income', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: true, isSavings: false },
  { id: 'INCOME_SALARY', name: 'Salary', parentId: 'INCOME', isCustom: false, isHidden: false, isRollover: false, isIncome: true, isSavings: false },
  { id: 'INCOME_FREELANCE', name: 'Freelance', parentId: 'INCOME', isCustom: false, isHidden: false, isRollover: false, isIncome: true, isSavings: false },
  { id: 'FOOD', name: 'Food', parentId: null, isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
  { id: 'HIDDEN_INCOME', name: 'Hidden Income', parentId: null, isCustom: true, isHidden: true, isRollover: false, isIncome: true, isSavings: false },
];

const START = '2025-01-01';
const END = '2025-01-31';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildIncomeBreakdown', () => {
  test('returns empty result when no income parent category exists', () => {
    const noIncomeCategories: Category[] = [
      { id: 'FOOD', name: 'Food', parentId: null, isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
    ];
    const result = buildIncomeBreakdown([], noIncomeCategories, START, END, true);
    expect(result.breakdown).toEqual([]);
    expect(result.total).toBe(0);
  });

  test('returns zero total and empty breakdown when there are no income transactions', () => {
    const result = buildIncomeBreakdown([], CATEGORIES, START, END, true);
    expect(result.total).toBe(0);
    expect(result.breakdown).toEqual([]);
  });

  test('hierarchical: rolls up subcategory amounts under income parent', () => {
    const txns = [
      makeTx({ id: 't1', amount: -5000, date: '2025-01-15', categoryId: 'INCOME_SALARY' }),
      makeTx({ id: 't2', amount: -1000, date: '2025-01-20', categoryId: 'INCOME_FREELANCE' }),
    ];
    const result = buildIncomeBreakdown(txns, CATEGORIES, START, END, true);

    expect(result.total).toBeCloseTo(6000);
    expect(result.breakdown).toHaveLength(1);

    const parent = result.breakdown[0];
    expect(parent.categoryId).toBe('INCOME');
    expect(parent.amount).toBeCloseTo(6000);
    expect(parent.percentage).toBeCloseTo(100);
    expect(parent.transactionCount).toBe(2);

    expect(parent.subcategories).toHaveLength(2);
    const salary = parent.subcategories!.find(s => s.categoryId === 'INCOME_SALARY')!;
    expect(salary.amount).toBeCloseTo(5000);
    expect(salary.percentage).toBeCloseTo((5000 / 6000) * 100);
  });

  test('hierarchical: subcategories sorted by amount descending', () => {
    const txns = [
      makeTx({ id: 't1', amount: -1000, date: '2025-01-10', categoryId: 'INCOME_FREELANCE' }),
      makeTx({ id: 't2', amount: -5000, date: '2025-01-15', categoryId: 'INCOME_SALARY' }),
    ];
    const result = buildIncomeBreakdown(txns, CATEGORIES, START, END, true);
    const subs = result.breakdown[0].subcategories!;
    expect(subs[0].categoryId).toBe('INCOME_SALARY');
    expect(subs[1].categoryId).toBe('INCOME_FREELANCE');
  });

  test('flat list: includeSubcategories=false returns one entry per leaf category', () => {
    const txns = [
      makeTx({ id: 't1', amount: -5000, date: '2025-01-15', categoryId: 'INCOME_SALARY' }),
      makeTx({ id: 't2', amount: -1000, date: '2025-01-20', categoryId: 'INCOME_FREELANCE' }),
    ];
    const result = buildIncomeBreakdown(txns, CATEGORIES, START, END, false);

    // Flat list: one entry per leaf, no nesting
    expect(result.breakdown.every(b => b.subcategories === undefined)).toBe(true);
    const ids = result.breakdown.map(b => b.categoryId);
    expect(ids).toContain('INCOME_SALARY');
    expect(ids).toContain('INCOME_FREELANCE');
  });

  test('excludes spending (positive-amount) transactions from income breakdown', () => {
    const txns = [
      makeTx({ id: 't1', amount: -5000, date: '2025-01-15', categoryId: 'INCOME_SALARY' }),
      makeTx({ id: 't2', amount: 200, date: '2025-01-10', categoryId: 'FOOD' }), // spending — must be excluded
    ];
    const result = buildIncomeBreakdown(txns, CATEGORIES, START, END, true);
    expect(result.total).toBeCloseTo(5000);
  });

  test('excludes hidden category transactions', () => {
    const txns = [
      makeTx({ id: 't1', amount: -5000, date: '2025-01-15', categoryId: 'INCOME_SALARY' }),
      makeTx({ id: 't2', amount: -2000, date: '2025-01-20', categoryId: 'INCOME_SALARY', isHidden: true }),
    ];
    const result = buildIncomeBreakdown(txns, CATEGORIES, START, END, true);
    expect(result.total).toBeCloseTo(5000);
    expect(result.breakdown[0].transactionCount).toBe(1);
  });

  test('excludes pending transactions', () => {
    const txns = [
      makeTx({ id: 't1', amount: -5000, date: '2025-01-15', categoryId: 'INCOME_SALARY' }),
      makeTx({ id: 't2', amount: -3000, date: '2025-01-20', categoryId: 'INCOME_SALARY', pending: true }),
    ];
    const result = buildIncomeBreakdown(txns, CATEGORIES, START, END, true);
    expect(result.total).toBeCloseTo(5000);
  });

  test('excludes transactions outside the date range', () => {
    const txns = [
      makeTx({ id: 't1', amount: -5000, date: '2025-01-15', categoryId: 'INCOME_SALARY' }),
      makeTx({ id: 't2', amount: -5000, date: '2025-02-01', categoryId: 'INCOME_SALARY' }), // out of range
    ];
    const result = buildIncomeBreakdown(txns, CATEGORIES, START, END, true);
    expect(result.total).toBeCloseTo(5000);
  });
});
