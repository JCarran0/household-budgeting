/**
 * Unit tests for buildCashFlowOutlook (Sprint 5.5 / TD-010).
 *
 * Covers: budgetedCashflow null when no budgets exist, isBudgetExtrapolated
 * flag, priorYearCashflow null when hasPriorYearData=false, averageCashflow
 * is constant across all projection months, correct number of projections,
 * and projection month strings are correct.
 */

import { buildCashFlowOutlook, CashFlowOutlookParams } from '../../../services/reports/cashflowProjections';
import { CashFlowSummary } from '../../../services/reportService';
import { Category, MonthlyBudget } from '../../../shared/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a CashFlowSummary for a given month with income > expenses (positive netCashflow). */
function makeHistoricalMonth(month: string, income = 5000, expenses = 3000, savings = 500): CashFlowSummary {
  return { month, income, expenses, savings, netCashflow: income - expenses - savings };
}

/** Build a params object with sensible defaults, overrideable per test. */
function makeParams(overrides: Partial<CashFlowOutlookParams> = {}): CashFlowOutlookParams {
  // Use mid-month to avoid UTC→local-timezone boundary issues with date-fns addMonths.
  const today = new Date('2025-04-15T12:00:00');
  const historicalSummary: CashFlowSummary[] = [
    makeHistoricalMonth('2024-10'),
    makeHistoricalMonth('2024-11'),
    makeHistoricalMonth('2024-12'),
    makeHistoricalMonth('2025-01'),
    makeHistoricalMonth('2025-02'),
    makeHistoricalMonth('2025-03'),
  ];

  return {
    categories: [] as Category[],
    lastKnownBudget: null,
    historicalSummary,
    priorYearSummary: [],
    hasPriorYearData: false,
    monthsToProject: 3,
    today,
    getMonthBudgets: async (_month: string) => [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildCashFlowOutlook', () => {
  test('returns correct number of projections', async () => {
    const result = await buildCashFlowOutlook(makeParams({ monthsToProject: 4 }));
    expect(result).toHaveLength(4);
  });

  test('projection months are correct consecutive YYYY-MM strings', async () => {
    const today = new Date('2025-04-15T12:00:00');
    const result = await buildCashFlowOutlook(makeParams({ today, monthsToProject: 3 }));
    expect(result[0].month).toBe('2025-05');
    expect(result[1].month).toBe('2025-06');
    expect(result[2].month).toBe('2025-07');
  });

  test('budgetedCashflow is null when no budgets exist and no lastKnownBudget', async () => {
    const result = await buildCashFlowOutlook(makeParams({
      lastKnownBudget: null,
      getMonthBudgets: async () => [],
    }));
    result.forEach(p => expect(p.budgetedCashflow).toBeNull());
    result.forEach(p => expect(p.isBudgetExtrapolated).toBe(false));
  });

  test('isBudgetExtrapolated is true when month has no budgets but lastKnownBudget exists', async () => {
    // lastKnownBudget contains one income budget entry
    const lastKnownBudget: MonthlyBudget[] = [
      { id: 'b1', categoryId: 'INCOME', month: '2025-03', amount: 5000 },
    ];
    const categories: Category[] = [
      { id: 'INCOME', name: 'Income', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: true, isSavings: false },
    ];
    const result = await buildCashFlowOutlook(makeParams({
      categories,
      lastKnownBudget,
      getMonthBudgets: async () => [], // no month-specific budgets
    }));
    result.forEach(p => {
      expect(p.isBudgetExtrapolated).toBe(true);
      // budgetedCashflow should be non-null (income budget exists)
      expect(p.budgetedCashflow).not.toBeNull();
    });
  });

  test('isBudgetExtrapolated is false when the month has its own budgets', async () => {
    const monthBudget: MonthlyBudget[] = [
      { id: 'b1', categoryId: 'INCOME', month: '2025-05', amount: 6000 },
    ];
    const categories: Category[] = [
      { id: 'INCOME', name: 'Income', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: true, isSavings: false },
    ];
    const result = await buildCashFlowOutlook(makeParams({
      categories,
      lastKnownBudget: monthBudget, // also has lastKnown, but month-specific wins
      today: new Date('2025-04-15T12:00:00'),
      monthsToProject: 1,
      getMonthBudgets: async (month) => month === '2025-05' ? monthBudget : [],
    }));
    expect(result[0].isBudgetExtrapolated).toBe(false);
  });

  test('priorYearCashflow is null when hasPriorYearData is false', async () => {
    const result = await buildCashFlowOutlook(makeParams({ hasPriorYearData: false }));
    result.forEach(p => expect(p.priorYearCashflow).toBeNull());
  });

  test('priorYearCashflow is populated from priorYearSummary when hasPriorYearData is true', async () => {
    const today = new Date('2025-04-15T12:00:00');
    // First projection month is 2025-05; prior year same month is 2024-05
    const priorYearSummary: CashFlowSummary[] = [
      makeHistoricalMonth('2024-05', 4800, 2900, 400), // netCashflow = 4800 - 2900 - 400 = 1500
      makeHistoricalMonth('2024-06', 4800, 3000, 400),
      makeHistoricalMonth('2024-07', 4800, 3100, 400),
    ];
    const result = await buildCashFlowOutlook(makeParams({
      today,
      monthsToProject: 3,
      priorYearSummary,
      hasPriorYearData: true,
    }));
    expect(result[0].priorYearCashflow).toBeCloseTo(1500);
    expect(result[1].priorYearCashflow).toBeCloseTo(4800 - 3000 - 400);
  });

  test('averageCashflow is constant across all projection months', async () => {
    // historicalSummary with 3 months: netCashflow = 1500 each
    const historicalSummary: CashFlowSummary[] = [
      makeHistoricalMonth('2025-01', 5000, 3000, 500), // net = 1500
      makeHistoricalMonth('2025-02', 5000, 3000, 500),
      makeHistoricalMonth('2025-03', 5000, 3000, 500),
    ];
    const result = await buildCashFlowOutlook(makeParams({
      historicalSummary,
      monthsToProject: 4,
    }));
    const avg = result[0].averageCashflow;
    expect(avg).toBeCloseTo(1500);
    result.forEach(p => expect(p.averageCashflow).toBeCloseTo(avg));
  });

  test('averageCashflow reflects true average of varied historical months', async () => {
    const historicalSummary: CashFlowSummary[] = [
      makeHistoricalMonth('2025-01', 5000, 3000, 0),   // net = 2000
      makeHistoricalMonth('2025-02', 4000, 3500, 0),   // net = 500
      makeHistoricalMonth('2025-03', 6000, 3000, 0),   // net = 3000
    ];
    // Expected avg = (2000 + 500 + 3000) / 3 = 1833.33...
    const result = await buildCashFlowOutlook(makeParams({ historicalSummary, monthsToProject: 2 }));
    result.forEach(p => expect(p.averageCashflow).toBeCloseTo((2000 + 500 + 3000) / 3));
  });
});
