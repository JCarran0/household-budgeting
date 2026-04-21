import type { Category } from '../types';
import type { TreeAggregation } from './budgetCalculations';

/**
 * BvA II display helpers — type-aware tone/section classification.
 *
 * THE NUMERIC VARIANCE IS ALWAYS `actual − budgeted`, UNCHANGED BY SECTION.
 * Only the tone (favorable / unfavorable / neutral) and the "over / under"
 * filter meaning flip per section. Do not flip signs based on section; future
 * readers must be able to trust that `+$100` means the same thing everywhere
 * (BUDGET-VS-ACTUALS-II-BRD REQ-032).
 */

export type SectionType = 'income' | 'spending' | 'savings';

export type VarianceTone = 'favorable' | 'unfavorable' | 'neutral';

/**
 * Classify a tree into one of the three accordion sections.
 *
 * Precedence:
 *   1. isIncome (from the tree aggregation's own flag) → income.
 *   2. Top-level category flagged isSavings → savings.
 *   3. Otherwise → spending.
 *
 * The category hierarchy is type-consistent (REQ-034) — a subtree inherits
 * the parent's type — so checking the parent record is sufficient.
 */
export function getSectionType(
  tree: TreeAggregation,
  categoryById: Map<string, Category>,
): SectionType {
  if (tree.isIncome) return 'income';
  const parent = categoryById.get(tree.parentId);
  if (parent?.isSavings) return 'savings';
  return 'spending';
}

/**
 * Goodness tone for a row given its section.
 *
 * Spending:  actual > budgeted  → unfavorable (overspent).
 * Income:    actual > budgeted  → favorable   (exceeded income target).
 * Savings:   actual > budgeted  → favorable   (saved more than planned).
 *
 * Equal or both-zero rows are neutral.
 */
export function getVarianceTone(
  section: SectionType,
  actual: number,
  budgeted: number,
): VarianceTone {
  if (actual === budgeted) return 'neutral';
  if (section === 'spending') {
    return actual > budgeted ? 'unfavorable' : 'favorable';
  }
  return actual > budgeted ? 'favorable' : 'unfavorable';
}

/**
 * Section label/ordering helper — Income → Spending → Savings (REQ-008),
 * matching the Cash Flow three-line convention established by the Savings
 * Category BRD.
 */
export const SECTION_ORDER: readonly SectionType[] = ['income', 'spending', 'savings'];
export const SECTION_LABEL: Record<SectionType, string> = {
  income: 'Income',
  spending: 'Spending',
  savings: 'Savings',
};
