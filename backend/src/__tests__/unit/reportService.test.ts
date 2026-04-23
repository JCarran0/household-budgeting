/**
 * Unit tests for ReportService
 *
 * Pre-refactor coverage (R3: Split ReportService).
 * Uses InMemoryDataService — no mocks, no filesystem.
 *
 * Data model reminder (Plaid convention):
 *   positive amount = expense / debit
 *   negative amount = income / credit
 */

import { InMemoryDataService } from '../../services/dataService';
import { ReportService } from '../../services/reportService';
import { ActualsOverrideService } from '../../services/actualsOverrideService';
import { StoredTransaction } from '../../services/transactionService';
import { Category } from '../../shared/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTransaction(
  overrides: Partial<StoredTransaction> & Pick<StoredTransaction, 'id' | 'amount' | 'date'>
): StoredTransaction {
  return {
    userId: 'test-user-reports',
    accountId: 'acc-1',
    plaidTransactionId: null,
    plaidAccountId: 'plaid-acc-1',
    name: 'Test Transaction',
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
  // Food hierarchy
  { id: 'FOOD', name: 'Food', parentId: null, isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
  { id: 'FOOD_GROCERIES', name: 'Groceries', parentId: 'FOOD', isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
  { id: 'FOOD_RESTAURANTS', name: 'Restaurants', parentId: 'FOOD', isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false },

  // Transport hierarchy
  { id: 'TRANSPORT', name: 'Transport', parentId: null, isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
  { id: 'TRANSPORT_GAS', name: 'Gas', parentId: 'TRANSPORT', isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false },

  // Income hierarchy
  { id: 'INCOME', name: 'Income', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: true, isSavings: false },
  { id: 'INCOME_SALARY', name: 'Salary', parentId: 'INCOME', isCustom: false, isHidden: false, isRollover: false, isIncome: true, isSavings: false },

  // Hidden category — children should be effectively hidden
  { id: 'HIDDEN_CAT', name: 'Hidden', parentId: null, isCustom: true, isHidden: true, isRollover: false, isIncome: false, isSavings: false },
  { id: 'HIDDEN_CHILD', name: 'Hidden Child', parentId: 'HIDDEN_CAT', isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false },

  // Savings / rollover hierarchy
  { id: 'CUSTOM_SAVINGS', name: 'Savings', parentId: null, isCustom: true, isHidden: false, isRollover: true, isIncome: false, isSavings: true },
  { id: 'CUSTOM_SAVINGS_EMERGENCY', name: 'Emergency Fund', parentId: 'CUSTOM_SAVINGS', isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
];

// Dates span 2025-01 through 2025-04 so tests can use fixed month ranges
const TRANSACTIONS: StoredTransaction[] = [
  // --- January 2025 ---
  makeTransaction({ id: 'txn-jan-groceries-1', amount: 120, date: '2025-01-10', categoryId: 'FOOD_GROCERIES' }),
  makeTransaction({ id: 'txn-jan-groceries-2', amount: 80, date: '2025-01-25', categoryId: 'FOOD_GROCERIES' }),
  makeTransaction({ id: 'txn-jan-restaurants', amount: 50, date: '2025-01-15', categoryId: 'FOOD_RESTAURANTS' }),
  makeTransaction({ id: 'txn-jan-gas', amount: 60, date: '2025-01-20', categoryId: 'TRANSPORT_GAS' }),
  makeTransaction({ id: 'txn-jan-salary', amount: -5000, date: '2025-01-31', categoryId: 'INCOME_SALARY' }),
  // Hidden transaction — must be excluded from all reports
  makeTransaction({ id: 'txn-jan-hidden-txn', amount: 999, date: '2025-01-05', categoryId: 'FOOD_GROCERIES', isHidden: true }),
  // Pending transaction — must be excluded
  makeTransaction({ id: 'txn-jan-pending', amount: 40, date: '2025-01-28', categoryId: 'FOOD_GROCERIES', pending: true }),
  // Removed transaction — excluded by status filter (pending holds replaced by posted versions)
  makeTransaction({ id: 'txn-jan-removed', amount: 200, date: '2025-01-12', categoryId: 'FOOD_GROCERIES', status: 'removed', isHidden: true }),
  // Transaction in a hidden parent category
  makeTransaction({ id: 'txn-jan-hidden-cat', amount: 75, date: '2025-01-18', categoryId: 'HIDDEN_CAT' }),
  // Transaction in a child of hidden parent
  makeTransaction({ id: 'txn-jan-hidden-child', amount: 30, date: '2025-01-22', categoryId: 'HIDDEN_CHILD' }),
  // Savings subcategory transaction
  makeTransaction({ id: 'txn-jan-savings', amount: 500, date: '2025-01-31', categoryId: 'CUSTOM_SAVINGS_EMERGENCY' }),
  // Uncategorized expense
  makeTransaction({ id: 'txn-jan-uncategorized', amount: 25, date: '2025-01-07', categoryId: null }),
  // Transfer — excluded from income/expense by calculateIncome/calculateExpenses (shared utils).
  // getCategoryBreakdown does NOT exclude transfers; this is the expected behavior.
  // We include it as hidden to avoid inflating the breakdown total, which would make
  // the percentage-sum assertion fragile.
  makeTransaction({ id: 'txn-jan-transfer-out', amount: 1000, date: '2025-01-15', categoryId: 'TRANSFER_OUT_INTERNAL', isHidden: true }),

  // --- February 2025 ---
  makeTransaction({ id: 'txn-feb-groceries', amount: 150, date: '2025-02-12', categoryId: 'FOOD_GROCERIES' }),
  makeTransaction({ id: 'txn-feb-restaurants', amount: 65, date: '2025-02-20', categoryId: 'FOOD_RESTAURANTS' }),
  makeTransaction({ id: 'txn-feb-gas', amount: 55, date: '2025-02-14', categoryId: 'TRANSPORT_GAS' }),
  makeTransaction({ id: 'txn-feb-salary', amount: -5000, date: '2025-02-28', categoryId: 'INCOME_SALARY' }),
  makeTransaction({ id: 'txn-feb-savings', amount: 500, date: '2025-02-28', categoryId: 'CUSTOM_SAVINGS_EMERGENCY' }),

  // --- March 2025 ---
  makeTransaction({ id: 'txn-mar-groceries', amount: 130, date: '2025-03-05', categoryId: 'FOOD_GROCERIES' }),
  makeTransaction({ id: 'txn-mar-gas', amount: 70, date: '2025-03-10', categoryId: 'TRANSPORT_GAS' }),
  makeTransaction({ id: 'txn-mar-salary', amount: -5200, date: '2025-03-31', categoryId: 'INCOME_SALARY' }),
  makeTransaction({ id: 'txn-mar-savings', amount: 500, date: '2025-03-31', categoryId: 'CUSTOM_SAVINGS_EMERGENCY' }),

  // --- April 2025 ---
  makeTransaction({ id: 'txn-apr-groceries', amount: 110, date: '2025-04-08', categoryId: 'FOOD_GROCERIES' }),
  makeTransaction({ id: 'txn-apr-salary', amount: -4800, date: '2025-04-30', categoryId: 'INCOME_SALARY' }),
];

const USER_ID = 'test-user-reports';
const TX_KEY = `transactions_${USER_ID}`;

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('ReportService', () => {
  let dataService: InMemoryDataService;
  let reportService: ReportService;
  let actualsOverrideService: ActualsOverrideService;

  beforeAll(async () => {
    dataService = new InMemoryDataService();
    actualsOverrideService = new ActualsOverrideService(dataService);
    reportService = new ReportService(dataService, actualsOverrideService);

    await dataService.saveCategories(CATEGORIES, USER_ID);
    await dataService.saveData(TX_KEY, TRANSACTIONS);
  });

  afterAll(() => {
    dataService.clear();
  });

  // =========================================================================
  // getSpendingTrends
  // =========================================================================

  describe('getSpendingTrends', () => {
    test('returns success with trends array', async () => {
      const result = await reportService.getSpendingTrends(USER_ID, '2025-01', '2025-01');

      expect(result.success).toBe(true);
      expect(Array.isArray(result.trends)).toBe(true);
    });

    test('groups spending by category and month', async () => {
      const result = await reportService.getSpendingTrends(USER_ID, '2025-01', '2025-01');

      expect(result.trends).toBeDefined();
      const groceriesTrend = result.trends!.find(
        t => t.month === '2025-01' && t.categoryId === 'FOOD_GROCERIES'
      );

      // Jan groceries: 120 + 80 = 200 (hidden txn at 999 and pending at 40 excluded)
      expect(groceriesTrend).toBeDefined();
      expect(groceriesTrend!.amount).toBeCloseTo(200);
      expect(groceriesTrend!.transactionCount).toBe(2);
    });

    test('produces one entry per category per month across a multi-month range', async () => {
      const result = await reportService.getSpendingTrends(USER_ID, '2025-01', '2025-02');

      expect(result.trends).toBeDefined();
      const months = [...new Set(result.trends!.map(t => t.month))].sort();
      expect(months).toEqual(['2025-01', '2025-02']);
    });

    test('excludes hidden transactions (isHidden: true)', async () => {
      const result = await reportService.getSpendingTrends(USER_ID, '2025-01', '2025-01');

      expect(result.trends).toBeDefined();
      // txn-jan-hidden-txn has amount 999 — if included it would show up in FOOD_GROCERIES
      const groceriesTrend = result.trends!.find(
        t => t.categoryId === 'FOOD_GROCERIES' && t.month === '2025-01'
      );
      // Should be 200, not 1199
      expect(groceriesTrend!.amount).toBeCloseTo(200);
    });

    test('excludes pending transactions', async () => {
      const result = await reportService.getSpendingTrends(USER_ID, '2025-01', '2025-01');

      expect(result.trends).toBeDefined();
      const groceriesTrend = result.trends!.find(
        t => t.categoryId === 'FOOD_GROCERIES' && t.month === '2025-01'
      );
      // Pending 40 must not be included; total stays at 200
      expect(groceriesTrend!.amount).toBeCloseTo(200);
    });

    test('excludes transactions in hidden parent categories', async () => {
      const result = await reportService.getSpendingTrends(USER_ID, '2025-01', '2025-01');

      expect(result.trends).toBeDefined();
      const hiddenTrend = result.trends!.find(
        t => t.categoryId === 'HIDDEN_CAT' || t.categoryId === 'HIDDEN_CHILD'
      );
      expect(hiddenTrend).toBeUndefined();
    });

    test('filters by specific categoryIds when provided', async () => {
      const result = await reportService.getSpendingTrends(
        USER_ID, '2025-01', '2025-01', ['TRANSPORT_GAS']
      );

      expect(result.trends).toBeDefined();
      const categoryIds = result.trends!.map(t => t.categoryId);
      expect(categoryIds.every(id => id === 'TRANSPORT_GAS')).toBe(true);
      // Food categories must not appear
      expect(categoryIds).not.toContain('FOOD_GROCERIES');
    });
  });

  // =========================================================================
  // getCategoryBreakdown
  // =========================================================================

  describe('getCategoryBreakdown', () => {
    test('returns success with a breakdown array and total', async () => {
      const result = await reportService.getCategoryBreakdown(
        USER_ID, '2025-01-01', '2025-01-31'
      );

      expect(result.success).toBe(true);
      expect(Array.isArray(result.breakdown)).toBe(true);
      expect(typeof result.total).toBe('number');
    });

    test('groups subcategory spending under parent categories', async () => {
      const result = await reportService.getCategoryBreakdown(
        USER_ID, '2025-01-01', '2025-01-31'
      );

      expect(result.breakdown).toBeDefined();
      const foodEntry = result.breakdown!.find(b => b.categoryId === 'FOOD');
      expect(foodEntry).toBeDefined();
      expect(Array.isArray(foodEntry!.subcategories)).toBe(true);

      const groceriesSub = foodEntry!.subcategories!.find(s => s.categoryId === 'FOOD_GROCERIES');
      expect(groceriesSub).toBeDefined();
    });

    test('calculates percentage relative to total correctly', async () => {
      const result = await reportService.getCategoryBreakdown(
        USER_ID, '2025-01-01', '2025-01-31'
      );

      expect(result.breakdown).toBeDefined();
      expect(result.total).toBeGreaterThan(0);

      for (const entry of result.breakdown!) {
        // Each parent percentage should be <= 100
        expect(entry.percentage).toBeGreaterThanOrEqual(0);
        expect(entry.percentage).toBeLessThanOrEqual(100);
      }

      // Percentages of all top-level entries should sum to approximately 100
      const totalPct = result.breakdown!.reduce((sum, b) => sum + b.percentage, 0);
      expect(totalPct).toBeCloseTo(100, 1);
    });

    test('excludes hidden categories and children of hidden parents', async () => {
      const result = await reportService.getCategoryBreakdown(
        USER_ID, '2025-01-01', '2025-01-31'
      );

      expect(result.breakdown).toBeDefined();
      const hiddenEntry = result.breakdown!.find(
        b => b.categoryId === 'HIDDEN_CAT' || b.categoryId === 'HIDDEN_CHILD'
      );
      expect(hiddenEntry).toBeUndefined();
    });

    test('excludes savings subcategory transactions (CUSTOM_SAVINGS children)', async () => {
      const result = await reportService.getCategoryBreakdown(
        USER_ID, '2025-01-01', '2025-01-31'
      );

      expect(result.breakdown).toBeDefined();
      const savingsEntry = result.breakdown!.find(
        b => b.categoryId === 'CUSTOM_SAVINGS_EMERGENCY'
      );
      // The savings subcategory must not appear in the regular breakdown
      expect(savingsEntry).toBeUndefined();

      // Also check none of the subcategory arrays contain it
      for (const parent of result.breakdown!) {
        if (parent.subcategories) {
          const savingsSub = parent.subcategories.find(
            s => s.categoryId === 'CUSTOM_SAVINGS_EMERGENCY'
          );
          expect(savingsSub).toBeUndefined();
        }
      }
    });

    test('flat mode (includeSubcategories: false) returns one entry per leaf category', async () => {
      const result = await reportService.getCategoryBreakdown(
        USER_ID, '2025-01-01', '2025-01-31', false
      );

      expect(result.breakdown).toBeDefined();
      // In flat mode no entry should carry subcategories
      for (const entry of result.breakdown!) {
        expect(entry.subcategories).toBeUndefined();
      }

      // Individual subcategory IDs should appear directly
      const ids = result.breakdown!.map(b => b.categoryId);
      expect(ids).toContain('FOOD_GROCERIES');
    });
  });

  // =========================================================================
  // getIncomeCategoryBreakdown
  // =========================================================================

  describe('getIncomeCategoryBreakdown', () => {
    test('returns success with income breakdown and total', async () => {
      const result = await reportService.getIncomeCategoryBreakdown(
        USER_ID, '2025-01-01', '2025-01-31'
      );

      expect(result.success).toBe(true);
      expect(result.total).toBeGreaterThan(0);
    });

    test('only includes transactions with negative amounts under income categories', async () => {
      const result = await reportService.getIncomeCategoryBreakdown(
        USER_ID, '2025-01-01', '2025-01-31'
      );

      expect(result.breakdown).toBeDefined();
      // The only income transaction in January is txn-jan-salary: -5000
      const incomeEntry = result.breakdown!.find(b => b.categoryId === 'INCOME');
      expect(incomeEntry).toBeDefined();
      // total income should be 5000 (absolute value of -5000)
      expect(result.total).toBeCloseTo(5000);
    });

    test('uses absolute values for income amounts', async () => {
      const result = await reportService.getIncomeCategoryBreakdown(
        USER_ID, '2025-01-01', '2025-03-31'
      );

      expect(result.total).toBeGreaterThan(0);
      // All amounts in breakdown must be positive
      if (result.breakdown) {
        for (const entry of result.breakdown) {
          expect(entry.amount).toBeGreaterThanOrEqual(0);
          if (entry.subcategories) {
            for (const sub of entry.subcategories) {
              expect(sub.amount).toBeGreaterThanOrEqual(0);
            }
          }
        }
      }
    });
  });

  // =========================================================================
  // getSavingsCategoryBreakdown
  // =========================================================================

  describe('getSavingsCategoryBreakdown', () => {
    test('returns success with a breakdown array', async () => {
      const result = await reportService.getSavingsCategoryBreakdown(
        USER_ID, '2025-01-01', '2025-01-31'
      );

      expect(result.success).toBe(true);
      expect(Array.isArray(result.breakdown)).toBe(true);
    });

    test('only includes transactions from savings subcategories', async () => {
      const result = await reportService.getSavingsCategoryBreakdown(
        USER_ID, '2025-01-01', '2025-01-31'
      );

      expect(result.breakdown).toBeDefined();
      // Only CUSTOM_SAVINGS_EMERGENCY should appear
      const ids = result.breakdown!.map(b => b.categoryId);
      expect(ids).toContain('CUSTOM_SAVINGS_EMERGENCY');
      // Regular food/transport must not be here
      expect(ids).not.toContain('FOOD_GROCERIES');
      expect(ids).not.toContain('TRANSPORT_GAS');
    });

    test('returns correct total for savings contributions', async () => {
      const result = await reportService.getSavingsCategoryBreakdown(
        USER_ID, '2025-01-01', '2025-01-31'
      );

      // txn-jan-savings is 500
      expect(result.total).toBeCloseTo(500);
    });
  });

  // =========================================================================
  // getCashFlowSummary
  // =========================================================================

  describe('getCashFlowSummary', () => {
    test('returns one summary entry per month in the requested range', async () => {
      const result = await reportService.getCashFlowSummary(USER_ID, '2025-01', '2025-03');

      expect(result.success).toBe(true);
      expect(result.summary).toHaveLength(3);
      expect(result.summary!.map(s => s.month)).toEqual(['2025-01', '2025-02', '2025-03']);
    });

    test('calculates income, expenses, savings, and netFlow per month', async () => {
      const result = await reportService.getCashFlowSummary(USER_ID, '2025-02', '2025-02');

      expect(result.summary).toBeDefined();
      const feb = result.summary![0];

      // Feb income: 5000 (salary, negative amount → abs value)
      expect(feb.income).toBeCloseTo(5000);
      // Spending excludes savings/transfer categories
      expect(feb.expenses).toBeGreaterThan(0);
      // netFlow always = income − spending − savings (truly free cash after consumption AND savings commitments)
      expect(feb.netFlow).toBeCloseTo(feb.income - feb.expenses - feb.savings);
    });

    test('excludes hidden transactions from all calculations', async () => {
      // Jan has a hidden txn worth 999 — it must not influence income or expenses
      const result = await reportService.getCashFlowSummary(USER_ID, '2025-01', '2025-01');

      expect(result.summary).toBeDefined();
      const jan = result.summary![0];
      // Hidden txn is 999 expense — if included expenses would be ≥ 1199
      // Without it: 120+80+50+60+25 = 335 (uncategorized) + savings 500 + transfer 1000 excluded
      // Upper bound without hidden: expenses < 1000 (transfer excluded, hidden excluded)
      // Note: transfer (TRANSFER_OUT) is excluded by calculateExpenses via isTransferCategory
      expect(jan.expenses).toBeLessThan(1100);
    });

    test('excludes pending transactions from cash flow', async () => {
      const result = await reportService.getCashFlowSummary(USER_ID, '2025-01', '2025-01');

      expect(result.summary).toBeDefined();
      const jan = result.summary![0];
      // Pending txn-jan-pending is 40 — if included we could detect it by checking
      // the groceries contribution. We verify expenses don't include it:
      // Non-pending, non-hidden, non-transfer expenses in Jan:
      //   groceries: 120+80=200, restaurants: 50, gas: 60, savings: 500, uncategorized: 25
      //   hidden-cat txn (75) excluded, hidden-child txn (30) excluded
      // Total visible expenses (excl transfers) = 835
      // With pending 40 it would be 875; so jan.expenses should not equal 875
      expect(jan.expenses).not.toBeCloseTo(875);
    });

    test('uses actuals overrides when present for a month', async () => {
      // Create an override for 2025-03 with known values
      await actualsOverrideService.createOrUpdateOverride(USER_ID, {
        month: '2025-03',
        totalIncome: 9999,
        totalExpenses: 1111,
      });

      const result = await reportService.getCashFlowSummary(USER_ID, '2025-03', '2025-03');

      // Clean up immediately to avoid contaminating other tests
      const overrides = await actualsOverrideService.getOverrides(USER_ID);
      if (overrides.success && overrides.overrides) {
        const march = overrides.overrides.find(o => o.month === '2025-03');
        if (march) {
          await actualsOverrideService.deleteOverride(USER_ID, march.id);
        }
      }

      expect(result.success).toBe(true);
      expect(result.summary).toBeDefined();
      const mar = result.summary![0];
      expect(mar.income).toBeCloseTo(9999);
      expect(mar.expenses).toBeCloseTo(1111);
      expect(mar.netFlow).toBeCloseTo(9999 - 1111);
    });
  });

  // =========================================================================
  // generateProjections
  // =========================================================================

  describe('generateProjections', () => {
    test('returns the requested number of projection months', async () => {
      const result = await reportService.generateProjections(USER_ID, 4);

      expect(result.success).toBe(true);
      expect(result.projections).toHaveLength(4);
    });

    test('defaults to 6 projection months when no argument provided', async () => {
      const result = await reportService.generateProjections(USER_ID);

      expect(result.success).toBe(true);
      expect(result.projections).toHaveLength(6);
    });

    test('assigns a confidence level to every projection', async () => {
      const result = await reportService.generateProjections(USER_ID, 3);

      expect(result.projections).toBeDefined();
      const validConfidences = new Set(['high', 'medium', 'low']);
      for (const proj of result.projections!) {
        expect(validConfidences.has(proj.confidence)).toBe(true);
      }
    });
  });

  // =========================================================================
  // getYearToDateSummary
  // =========================================================================

  describe('getYearToDateSummary', () => {
    // YTD uses new Date() internally, so these tests are forward-compatible but
    // require that our test transactions exist within the current year OR that
    // we verify structural correctness rather than exact amounts when months differ.

    test('returns success with a summary object', async () => {
      const result = await reportService.getYearToDateSummary(USER_ID);

      expect(result.success).toBe(true);
      expect(result.summary).toBeDefined();
    });

    test('summary includes all required fields with numeric values', async () => {
      const result = await reportService.getYearToDateSummary(USER_ID);

      expect(result.summary).toBeDefined();
      const s = result.summary!;
      expect(typeof s.totalIncome).toBe('number');
      expect(typeof s.totalExpenses).toBe('number');
      expect(typeof s.netIncome).toBe('number');
      expect(typeof s.averageMonthlyIncome).toBe('number');
      expect(typeof s.averageMonthlyExpenses).toBe('number');
      expect(typeof s.savingsRate).toBe('number');
      expect(Array.isArray(s.topCategories)).toBe(true);
    });

    test('top categories are sorted by amount descending and capped at 5', async () => {
      const result = await reportService.getYearToDateSummary(USER_ID);

      expect(result.summary).toBeDefined();
      const top = result.summary!.topCategories;
      expect(top.length).toBeLessThanOrEqual(5);

      for (let i = 1; i < top.length; i++) {
        expect(top[i - 1].amount).toBeGreaterThanOrEqual(top[i].amount);
      }
    });

    test('netIncome equals totalIncome minus totalExpenses', async () => {
      const result = await reportService.getYearToDateSummary(USER_ID);

      expect(result.summary).toBeDefined();
      const s = result.summary!;
      expect(s.netIncome).toBeCloseTo(s.totalIncome - s.totalExpenses);
    });
  });

  // =========================================================================
  // Helper method behavior (tested via public API)
  // =========================================================================

  describe('helper methods via public API', () => {
    test('getMonthRange includes both boundary months (tested via getSpendingTrends)', async () => {
      const result = await reportService.getSpendingTrends(USER_ID, '2025-01', '2025-04');

      expect(result.trends).toBeDefined();
      const months = [...new Set(result.trends!.map(t => t.month))].sort();
      // Must include Jan and Apr (the boundaries)
      expect(months).toContain('2025-01');
      expect(months).toContain('2025-04');
    });

    test('getMonthRange with same start and end returns exactly one month', async () => {
      const result = await reportService.getSpendingTrends(USER_ID, '2025-02', '2025-02');

      expect(result.trends).toBeDefined();
      const months = [...new Set(result.trends!.map(t => t.month))];
      expect(months).toEqual(['2025-02']);
    });

    test('hidden parent category propagates to child categories (tested via getCategoryBreakdown)', async () => {
      const result = await reportService.getCategoryBreakdown(
        USER_ID, '2025-01-01', '2025-01-31'
      );

      expect(result.breakdown).toBeDefined();
      // HIDDEN_CHILD has isHidden: false, but its parent HIDDEN_CAT has isHidden: true
      // Therefore HIDDEN_CHILD must also be excluded
      const allIds = result.breakdown!.flatMap(b => [
        b.categoryId,
        ...(b.subcategories ?? []).map(s => s.categoryId),
      ]);
      expect(allIds).not.toContain('HIDDEN_CHILD');
    });

    test('getSavingsSubcategoryIds only matches children of CUSTOM_SAVINGS (tested via getCategoryBreakdown)', async () => {
      // FOOD_GROCERIES is not a child of CUSTOM_SAVINGS — must appear in regular breakdown
      const result = await reportService.getCategoryBreakdown(
        USER_ID, '2025-01-01', '2025-01-31'
      );

      expect(result.breakdown).toBeDefined();
      const allIds = result.breakdown!.flatMap(b => [
        b.categoryId,
        ...(b.subcategories ?? []).map(s => s.categoryId),
      ]);
      expect(allIds).toContain('FOOD_GROCERIES');
    });
  });
});
