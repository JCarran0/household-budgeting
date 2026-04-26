/**
 * Unit tests for buildSavingsBreakdown (Sprint 5.5 / TD-010).
 *
 * Covers: flat breakdown of savings categories, zero-total edge case,
 * exclusion of non-savings transactions, exclusion of hidden/pending txns,
 * sort order, and percentage calculation.
 */

import { buildSavingsBreakdown } from '../../../../services/reports/breakdowns/savings';
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
  { id: 'SAVINGS', name: 'Savings', parentId: null, isCustom: true, isHidden: false, isRollover: true, isIncome: false, isSavings: true },
  { id: 'SAVINGS_EMERGENCY', name: 'Emergency Fund', parentId: 'SAVINGS', isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
  { id: 'SAVINGS_VACATION', name: 'Vacation Fund', parentId: 'SAVINGS', isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
  // Non-savings spending category — must not appear in savings breakdown
  { id: 'FOOD', name: 'Food', parentId: null, isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
];

const START = '2025-01-01';
const END = '2025-01-31';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildSavingsBreakdown', () => {
  test('returns zero total and empty breakdown when there are no transactions', () => {
    const result = buildSavingsBreakdown([], CATEGORIES, START, END);
    expect(result.total).toBe(0);
    expect(result.breakdown).toEqual([]);
  });

  test('returns zero total when no savings categories are configured', () => {
    const noSavingsCategories: Category[] = [
      { id: 'FOOD', name: 'Food', parentId: null, isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
    ];
    const txns = [
      makeTx({ id: 't1', amount: 500, date: '2025-01-15', categoryId: 'FOOD' }),
    ];
    const result = buildSavingsBreakdown(txns, noSavingsCategories, START, END);
    expect(result.total).toBe(0);
    expect(result.breakdown).toEqual([]);
  });

  test('includes savings category transactions in breakdown', () => {
    const txns = [
      makeTx({ id: 't1', amount: 500, date: '2025-01-15', categoryId: 'SAVINGS_EMERGENCY' }),
      makeTx({ id: 't2', amount: 200, date: '2025-01-20', categoryId: 'SAVINGS_VACATION' }),
    ];
    const result = buildSavingsBreakdown(txns, CATEGORIES, START, END);

    expect(result.total).toBeCloseTo(700);
    expect(result.breakdown).toHaveLength(2);

    const emergency = result.breakdown.find(b => b.categoryId === 'SAVINGS_EMERGENCY')!;
    expect(emergency.amount).toBeCloseTo(500);
    expect(emergency.percentage).toBeCloseTo((500 / 700) * 100);
  });

  test('excludes non-savings transactions from savings breakdown', () => {
    const txns = [
      makeTx({ id: 't1', amount: 500, date: '2025-01-15', categoryId: 'SAVINGS_EMERGENCY' }),
      makeTx({ id: 't2', amount: 150, date: '2025-01-10', categoryId: 'FOOD' }), // spending — must be excluded
    ];
    const result = buildSavingsBreakdown(txns, CATEGORIES, START, END);

    expect(result.total).toBeCloseTo(500);
    expect(result.breakdown.find(b => b.categoryId === 'FOOD')).toBeUndefined();
  });

  test('sort order: breakdown sorted by amount descending', () => {
    const txns = [
      makeTx({ id: 't1', amount: 200, date: '2025-01-10', categoryId: 'SAVINGS_VACATION' }),
      makeTx({ id: 't2', amount: 500, date: '2025-01-15', categoryId: 'SAVINGS_EMERGENCY' }),
    ];
    const result = buildSavingsBreakdown(txns, CATEGORIES, START, END);

    expect(result.breakdown[0].categoryId).toBe('SAVINGS_EMERGENCY');
    expect(result.breakdown[1].categoryId).toBe('SAVINGS_VACATION');
  });

  test('excludes hidden transactions', () => {
    const txns = [
      makeTx({ id: 't1', amount: 500, date: '2025-01-15', categoryId: 'SAVINGS_EMERGENCY' }),
      makeTx({ id: 't2', amount: 300, date: '2025-01-20', categoryId: 'SAVINGS_EMERGENCY', isHidden: true }),
    ];
    const result = buildSavingsBreakdown(txns, CATEGORIES, START, END);
    expect(result.total).toBeCloseTo(500);
    expect(result.breakdown[0].transactionCount).toBe(1);
  });

  test('excludes pending transactions', () => {
    const txns = [
      makeTx({ id: 't1', amount: 500, date: '2025-01-15', categoryId: 'SAVINGS_EMERGENCY' }),
      makeTx({ id: 't2', amount: 300, date: '2025-01-20', categoryId: 'SAVINGS_EMERGENCY', pending: true }),
    ];
    const result = buildSavingsBreakdown(txns, CATEGORIES, START, END);
    expect(result.total).toBeCloseTo(500);
  });

  test('excludes transactions outside the date range', () => {
    const txns = [
      makeTx({ id: 't1', amount: 500, date: '2025-01-15', categoryId: 'SAVINGS_EMERGENCY' }),
      makeTx({ id: 't2', amount: 500, date: '2025-02-01', categoryId: 'SAVINGS_EMERGENCY' }), // out of range
    ];
    const result = buildSavingsBreakdown(txns, CATEGORIES, START, END);
    expect(result.total).toBeCloseTo(500);
  });

  test('percentage sums to 100 when two savings categories have transactions', () => {
    const txns = [
      makeTx({ id: 't1', amount: 300, date: '2025-01-10', categoryId: 'SAVINGS_EMERGENCY' }),
      makeTx({ id: 't2', amount: 700, date: '2025-01-15', categoryId: 'SAVINGS_VACATION' }),
    ];
    const result = buildSavingsBreakdown(txns, CATEGORIES, START, END);
    const totalPct = result.breakdown.reduce((sum, b) => sum + b.percentage, 0);
    expect(totalPct).toBeCloseTo(100);
  });
});
