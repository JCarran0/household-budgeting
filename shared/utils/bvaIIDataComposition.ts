import type { Category, MonthlyBudget, Transaction } from '../types';
import {
  buildCategoryTreeAggregation,
  buildEffectiveBudgetsMap,
  type TreeAggregation,
} from './budgetCalculations';
import { isBudgetableCategory } from './categoryHelpers';

/**
 * Pure-function data composition layer for BvA II.
 *
 * Responsibilities:
 *   - Bucket yearly budgets and YTD transactions into per-category, per-month
 *     maps that feed computeRolloverBalance / buildEffectiveBudgetsMap.
 *   - Produce the target-month per-category actuals map for the tree rollup.
 *   - Compose effective budgets + rollup in a single call the component uses.
 *
 * The canonical removed-transaction filter already runs server-side before the
 * GET /transactions response reaches the client, so callers here only need to
 * respect isHidden + isBudgetableCategory. Savings categories stay included —
 * BvA II shows their rows and only the global spending totals exclude savings.
 *
 * Month-string extraction uses literal string slicing on transaction.date
 * (YYYY-MM-DD), which matches the US Eastern Time anchoring applied by the
 * backend as of the 2026-04 date-boundary fix.
 */

export interface ComposeBvaIIInput {
  categories: Category[];
  yearlyBudgets: MonthlyBudget[]; // all budgets for the active calendar year
  yearlyTransactions: Transaction[]; // all YTD transactions up to and including selectedMonth
  selectedMonth: string; // YYYY-MM
  useRollover: boolean;
}

export interface ComposeBvaIIOutput {
  trees: Map<string, TreeAggregation>;
  /** Per-category effective budgets for the target month (empty map when rollover off). */
  effectiveBudgetsForMonth: Map<string, number>;
  /** Raw per-category actuals for the target month only. */
  actualsForMonth: Map<string, number>;
  /** Full per-category per-month budget grid for the active year. */
  budgetsByCategoryByMonth: Map<string, Map<string, number>>;
  /** Full per-category per-month actuals grid for the active year. */
  actualsByCategoryByMonth: Map<string, Map<string, number>>;
}

export function groupBudgetsByCategoryByMonth(
  budgets: MonthlyBudget[],
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const b of budgets) {
    let byMonth = out.get(b.categoryId);
    if (!byMonth) {
      byMonth = new Map();
      out.set(b.categoryId, byMonth);
    }
    byMonth.set(b.month, (byMonth.get(b.month) ?? 0) + b.amount);
  }
  return out;
}

export function groupActualsByCategoryByMonth(
  transactions: Transaction[],
  categories: Category[],
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const t of transactions) {
    if (t.isHidden) continue;
    if (!t.categoryId) continue;
    if (!isBudgetableCategory(t.categoryId, categories)) continue;
    const monthKey = t.date.slice(0, 7); // YYYY-MM
    let byMonth = out.get(t.categoryId);
    if (!byMonth) {
      byMonth = new Map();
      out.set(t.categoryId, byMonth);
    }
    byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0) + Math.abs(t.amount));
  }
  return out;
}

export function extractMonthActuals(
  byCategoryByMonth: Map<string, Map<string, number>>,
  month: string,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [categoryId, byMonth] of byCategoryByMonth) {
    const v = byMonth.get(month);
    if (v && v !== 0) out.set(categoryId, v);
  }
  return out;
}

export function composeBvaII({
  categories,
  yearlyBudgets,
  yearlyTransactions,
  selectedMonth,
  useRollover,
}: ComposeBvaIIInput): ComposeBvaIIOutput {
  const budgetsByCategoryByMonth = groupBudgetsByCategoryByMonth(yearlyBudgets);
  const actualsByCategoryByMonth = groupActualsByCategoryByMonth(yearlyTransactions, categories);
  const actualsForMonth = extractMonthActuals(actualsByCategoryByMonth, selectedMonth);

  const monthBudgets = yearlyBudgets.filter(b => b.month === selectedMonth);

  let effectiveBudgetsForMonth: Map<string, number> = new Map();
  if (useRollover) {
    effectiveBudgetsForMonth = buildEffectiveBudgetsMap(
      categories,
      selectedMonth,
      budgetsByCategoryByMonth,
      actualsByCategoryByMonth,
    );
  }

  const trees = buildCategoryTreeAggregation(
    categories,
    monthBudgets,
    actualsForMonth,
    {
      excludeTransfers: true,
      excludeHidden: true,
      ...(useRollover ? { budgetsOverride: effectiveBudgetsForMonth } : {}),
    },
  );

  return {
    trees,
    effectiveBudgetsForMonth,
    actualsForMonth,
    budgetsByCategoryByMonth,
    actualsByCategoryByMonth,
  };
}
