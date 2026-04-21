import type { Category, MonthlyBudget, Transaction } from '../types';
import {
  buildCategoryTreeAggregation,
  computeRolloverBalance,
} from './budgetCalculations';
import { isBudgetableCategory } from './categoryHelpers';
import {
  computeAvailable,
  getSectionType,
  toneSignedRollover,
  type SectionType,
} from './bvaIIDisplay';

/**
 * Pure-function data composition layer for BvA II — BRD Revision 2.
 *
 * Responsibilities:
 *   - Bucket yearly budgets and YTD transactions into per-category/per-month
 *     grids used for rollover derivation.
 *   - Run buildCategoryTreeAggregation with RAW monthly budgets — Budgeted
 *     column is always raw under Rev-2 (REQ-010).
 *   - Tone-sign rollover per-row (null for non-rollover categories) and
 *     roll subtree rollover up to the parent row.
 *   - Compute tone-signed Available per row per the toggle (REQ-011/011a).
 *
 * The canonical removed-transaction filter runs server-side before the GET
 * /transactions response reaches the client, so callers only respect isHidden
 * + isBudgetableCategory. Savings categories stay included — BvA II shows
 * their rows and only global spending totals exclude savings.
 *
 * Month-string extraction uses literal YYYY-MM slicing to stay US Eastern
 * Time anchored (per the 2026-04 date-boundary fix).
 */

export interface ComposeBvaIIInput {
  categories: Category[];
  yearlyBudgets: MonthlyBudget[];
  yearlyTransactions: Transaction[];
  selectedMonth: string; // YYYY-MM
  useRollover: boolean;
}

/** A displayable child row. */
export interface BvaIIChildRow {
  categoryId: string;
  categoryName: string;
  actual: number;
  budgeted: number;
  /** Tone-signed rollover for this category. null = not a rollover category. */
  rollover: number | null;
  /** Tone-signed Available — already respects useRollover toggle. */
  available: number;
  isRollover: boolean;
}

/** A displayable parent row carrying its children. */
export interface BvaIIParentRow {
  parentId: string;
  parentName: string;
  section: SectionType;
  actual: number;
  budgeted: number;
  /** Subtree sum of tone-signed rollover values; null if nothing in subtree is flagged. */
  rollover: number | null;
  /** Tone-signed Available for the parent row — already respects useRollover. */
  available: number;
  children: BvaIIChildRow[];
}

export interface ComposeBvaIIOutput {
  parents: BvaIIParentRow[];
  /** Full per-category per-month budget grid for the active year (for edit modal). */
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

  // Budgeted column uses RAW monthly budgets — BRD Rev-2 REQ-010. No override.
  const trees = buildCategoryTreeAggregation(
    categories,
    monthBudgets,
    actualsForMonth,
    { excludeTransfers: true, excludeHidden: true },
  );

  const categoryById = new Map(categories.map(c => [c.id, c]));
  const emptyMonthMap: Map<string, number> = new Map();

  // Precompute tone-signed rollover per category id so parent rollup sums
  // identical values the children display.
  const rolloverByCategoryId = new Map<string, number | null>();
  for (const c of categories) {
    if (!c.isRollover || !isBudgetableCategory(c.id, categories)) {
      rolloverByCategoryId.set(c.id, null);
      continue;
    }
    const budgets = budgetsByCategoryByMonth.get(c.id) ?? emptyMonthMap;
    const actuals = actualsByCategoryByMonth.get(c.id) ?? emptyMonthMap;
    const raw = computeRolloverBalance(c, selectedMonth, budgets, actuals);
    const section: SectionType = c.isIncome
      ? 'income'
      : (c.isSavings ? 'savings' : (c.parentId
          ? (categoryById.get(c.parentId)?.isSavings ? 'savings' : 'spending')
          : 'spending'));
    rolloverByCategoryId.set(c.id, toneSignedRollover(section, raw));
  }

  const parents: BvaIIParentRow[] = [];

  for (const tree of trees.values()) {
    const section = getSectionType(tree, categoryById);

    // Per-child rows
    const children: BvaIIChildRow[] = tree.children.map(c => {
      const cat = categoryById.get(c.categoryId);
      const isRollover = cat?.isRollover ?? false;
      const rollover = rolloverByCategoryId.get(c.categoryId) ?? null;
      const available = computeAvailable(
        section,
        c.actual,
        c.budgeted,
        rollover,
        useRollover,
      );
      return {
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        actual: c.actual,
        budgeted: c.budgeted,
        rollover,
        available,
        isRollover,
      };
    });

    // Parent rollover — sum tone-signed contributions across the subtree.
    // Per REQ-017 subtree exclusivity, at most one node is flagged, so the
    // sum collapses to that node's value. Summing still works in the
    // degenerate (or hypothetical future-relaxed) case.
    let subtreeHasRollover = false;
    let subtreeRolloverSum = 0;
    const parentOwnRollover = rolloverByCategoryId.get(tree.parentId);
    if (parentOwnRollover !== null && parentOwnRollover !== undefined) {
      subtreeHasRollover = true;
      subtreeRolloverSum += parentOwnRollover;
    }
    for (const child of children) {
      if (child.rollover !== null) {
        subtreeHasRollover = true;
        subtreeRolloverSum += child.rollover;
      }
    }
    const parentRollover = subtreeHasRollover ? subtreeRolloverSum : null;

    const parentAvailable = computeAvailable(
      section,
      tree.effectiveActual,
      tree.effectiveBudget,
      parentRollover,
      useRollover,
    );

    parents.push({
      parentId: tree.parentId,
      parentName: tree.parentName,
      section,
      actual: tree.effectiveActual,
      budgeted: tree.effectiveBudget,
      rollover: parentRollover,
      available: parentAvailable,
      children,
    });
  }

  return {
    parents,
    budgetsByCategoryByMonth,
    actualsByCategoryByMonth,
  };
}
