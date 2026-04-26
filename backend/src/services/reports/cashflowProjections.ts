/**
 * Cash flow outlook projection assembly — pure helper.
 *
 * Extracted from `ReportService.generateCashFlowProjections` (Sprint 5.5 / TD-010).
 * No I/O, no class, no DataService dependency.
 *
 * The class method retains:
 *   - The `lastKnownBudget` backwards search (requires dataService)
 *   - The two `getCashFlowSummary` calls (requires `this`)
 *   - The try/catch envelope and success/error wrapping
 *
 * This helper owns only the per-month projection assembly loop.
 */

import { format, addMonths, subMonths } from 'date-fns';
import { Category, MonthlyBudget } from '../../shared/types';
import { CashFlowSummary, CashFlowOutlookProjection } from '../reportService';
import { calculateBudgetTotals } from '../../shared/utils/budgetCalculations';

export interface CashFlowOutlookParams {
  /** All family categories (needed for budget total calculation). */
  categories: Category[];
  /** Last month's budgets found by the backwards-walk in the class method. Null when none exist. */
  lastKnownBudget: MonthlyBudget[] | null;
  /** CashFlowSummary array from the 6-month historical window. */
  historicalSummary: CashFlowSummary[];
  /** CashFlowSummary array covering the prior-year window aligned to projection months. */
  priorYearSummary: CashFlowSummary[];
  /** True when priorYearResult returned at least one month with income or expenses > 0. */
  hasPriorYearData: boolean;
  /** Number of months to project forward from today. */
  monthsToProject: number;
  /**
   * Reference point for projection ("today").
   * Accepting a parameter rather than `new Date()` keeps this function pure and testable.
   */
  today: Date;
  /**
   * Per-month budget lookup function.
   * The class method passes a closure that calls `this.dataService.getData`.
   */
  getMonthBudgets: (month: string) => Promise<MonthlyBudget[]>;
}

/**
 * Assemble the forward-looking cashflow projections for each month.
 *
 * @returns Array of `CashFlowOutlookProjection` — no success/error envelope.
 */
export async function buildCashFlowOutlook(
  params: CashFlowOutlookParams
): Promise<CashFlowOutlookProjection[]> {
  const {
    categories,
    lastKnownBudget,
    historicalSummary,
    priorYearSummary,
    hasPriorYearData,
    monthsToProject,
    today,
    getMonthBudgets,
  } = params;

  const avgNetCashflow =
    historicalSummary.reduce((sum, m) => sum + m.netCashflow, 0) / historicalSummary.length;

  const projections: CashFlowOutlookProjection[] = [];

  for (let i = 1; i <= monthsToProject; i++) {
    const projMonth = format(addMonths(today, i), 'yyyy-MM');

    // 1. Get budgeted cashflow
    let monthBudgets = await getMonthBudgets(projMonth);
    let isBudgetExtrapolated = false;

    if (monthBudgets.length === 0 && lastKnownBudget) {
      monthBudgets = lastKnownBudget;
      isBudgetExtrapolated = true;
    }

    let budgetedCashflow: number | null = null;
    if (monthBudgets.length > 0) {
      const totals = calculateBudgetTotals(monthBudgets, categories, { excludeHidden: false });
      budgetedCashflow = totals.income - totals.expense;
    }

    // 2. Get prior year same month actual cashflow
    const priorYearMonth = format(subMonths(addMonths(today, i), 12), 'yyyy-MM');
    let priorYearCashflow: number | null = null;

    if (hasPriorYearData) {
      const priorYearData = priorYearSummary.find(m => m.month === priorYearMonth);
      if (priorYearData) {
        priorYearCashflow = priorYearData.netCashflow;
      }
    }

    // 3. Average cashflow (constant across all projection months)
    const averageCashflow = avgNetCashflow;

    projections.push({
      month: projMonth,
      budgetedCashflow,
      isBudgetExtrapolated,
      priorYearCashflow,
      averageCashflow,
    });
  }

  return projections;
}
