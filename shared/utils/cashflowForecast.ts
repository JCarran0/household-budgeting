/**
 * Year-End Cashflow Forecast — single source of truth.
 *
 * Two surfaces in the app forecast year-end cashflow:
 *   - Reports → Cash Flow tab "This Year" dashboard
 *   - Dashboard page "Projected Net Cashflow" / "Projected Savings" KPIs
 *
 * Both must use identical math so the numbers agree. This helper composes the
 * canonical actuals trio (calculateIncome / calculateSpending / calculateSavings
 * — REQ-005a, hierarchical income detection, signed accumulation) and the
 * parallel budgeted trio (calculateBudgetedIncome / Spending / Savings) into a
 * per-month forecast for a calendar year.
 *
 * V1 boundary rule (confirmed 2026-04-25): the current month is treated as a
 * future month — its cell uses budgeted, not MTD-actuals + remaining-budget.
 * This trades a slight loss of precision for a clean, easy-to-explain rule.
 */

import type { Category, MonthlyBudget } from '../types';
import {
  calculateIncome,
  calculateSavings,
  calculateSpending,
  type TransactionForCalculation,
} from './transactionCalculations';
import {
  calculateBudgetedIncome,
  calculateBudgetedSavings,
  calculateBudgetedSpending,
} from './budgetCalculations';
import { etMonthString } from './easternTime';

export type ForecastCellMode = 'actual' | 'budgeted';

export interface YearForecastCell {
  monthKey: string;        // YYYY-MM
  monthIndex: number;      // 0..11
  monthLabel: string;      // "Jan", "Feb", ...
  mode: ForecastCellMode;
  income: number;
  spending: number;
  savings: number;
  netCashflow: number;     // income − spending − savings (REQ-017)
}

export interface ForecastTotals {
  income: number;
  spending: number;
  savings: number;
  netCashflow: number;
}

export interface YearEndForecast {
  year: number;
  /** YYYY-MM resolved in US Eastern Time. */
  currentMonthKey: string;
  /** 12 cells, Jan..Dec. */
  cells: YearForecastCell[];
  /** Year-end totals = sum of cells. */
  totals: ForecastTotals;
  /** Sum of cells where mode === 'actual' (closed months). */
  ytd: ForecastTotals;
  /** Sum of cells where mode === 'budgeted' (current + future). */
  future: ForecastTotals;
}

export interface ComputeYearEndForecastInput {
  year: number;
  /** Defaults to "now" in US Eastern Time. Tests pass an explicit date. */
  asOf?: Date;
  transactions: TransactionForCalculation[];
  budgets: MonthlyBudget[];
  categories: Category[];
}

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function computeYearEndForecast({
  year,
  asOf,
  transactions,
  budgets,
  categories,
}: ComputeYearEndForecastInput): YearEndForecast {
  const yearStr = String(year);
  const currentMonthKey = etMonthString(asOf);

  // Bucket inputs by YYYY-MM up front so each cell is a constant-time lookup.
  const txByMonth = new Map<string, TransactionForCalculation[]>();
  for (const t of transactions) {
    const m = ('date' in t && typeof (t as { date?: unknown }).date === 'string'
      ? ((t as { date: string }).date).slice(0, 7)
      : '');
    if (!m.startsWith(`${yearStr}-`)) continue;
    const arr = txByMonth.get(m) ?? [];
    arr.push(t);
    txByMonth.set(m, arr);
  }

  const budgetsByMonth = new Map<string, MonthlyBudget[]>();
  for (const b of budgets) {
    if (!b.month.startsWith(`${yearStr}-`)) continue;
    const arr = budgetsByMonth.get(b.month) ?? [];
    arr.push(b);
    budgetsByMonth.set(b.month, arr);
  }

  const cells: YearForecastCell[] = [];
  const totals: ForecastTotals = { income: 0, spending: 0, savings: 0, netCashflow: 0 };
  const ytd: ForecastTotals = { income: 0, spending: 0, savings: 0, netCashflow: 0 };
  const future: ForecastTotals = { income: 0, spending: 0, savings: 0, netCashflow: 0 };

  for (let i = 0; i < 12; i++) {
    const monthKey = `${yearStr}-${String(i + 1).padStart(2, '0')}`;
    const mode: ForecastCellMode = monthKey < currentMonthKey ? 'actual' : 'budgeted';

    let income: number;
    let spending: number;
    let savings: number;

    if (mode === 'actual') {
      const txs = txByMonth.get(monthKey) ?? [];
      income = calculateIncome(txs, categories);
      spending = calculateSpending(txs, categories);
      savings = calculateSavings(txs, categories);
    } else {
      const monthBudgets = budgetsByMonth.get(monthKey) ?? [];
      income = calculateBudgetedIncome(monthBudgets, categories);
      spending = calculateBudgetedSpending(monthBudgets, categories);
      savings = calculateBudgetedSavings(monthBudgets, categories);
    }

    const netCashflow = income - spending - savings;

    cells.push({
      monthKey,
      monthIndex: i,
      monthLabel: MONTH_LABELS[i],
      mode,
      income,
      spending,
      savings,
      netCashflow,
    });

    totals.income += income;
    totals.spending += spending;
    totals.savings += savings;
    totals.netCashflow += netCashflow;

    const bucket = mode === 'actual' ? ytd : future;
    bucket.income += income;
    bucket.spending += spending;
    bucket.savings += savings;
    bucket.netCashflow += netCashflow;
  }

  return { year, currentMonthKey, cells, totals, ytd, future };
}
