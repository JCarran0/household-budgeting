/**
 * Budget Calculation Utilities
 *
 * Shared utilities for budget calculations across frontend and backend
 * These functions eliminate code duplication and ensure consistency
 */

import type { Category, MonthlyBudget, Transaction } from '../types';
import {
  isIncomeCategoryWithCategories,
  isTransferCategory
} from './categoryHelpers';

/**
 * Budget totals breakdown interface
 */
export interface BudgetTotals {
  income: number;
  expense: number;
  transfer: number;
  total: number;
}

/**
 * Options for budget calculation functions
 */
export interface BudgetCalculationOptions {
  excludeHidden?: boolean;
  excludeChildren?: boolean;
  excludeTransfers?: boolean;
}

/**
 * Get set of hidden category IDs (includes categories with hidden parents)
 * This consolidates logic that was duplicated 6 times across the codebase
 *
 * @param categories Array of all categories
 * @returns Set of category IDs that should be considered hidden
 */
export function getHiddenCategoryIds(categories: Category[]): Set<string> {
  const hiddenIds = new Set<string>();

  categories.forEach(cat => {
    if (cat.isHidden) {
      hiddenIds.add(cat.id);
    } else if (cat.parentId) {
      const parent = categories.find(p => p.id === cat.parentId);
      if (parent?.isHidden) {
        hiddenIds.add(cat.id);
      }
    }
  });

  return hiddenIds;
}

/**
 * Get set of child category IDs
 * This consolidates logic that was duplicated 2 times across the codebase
 *
 * @param categories Array of all categories
 * @returns Set of category IDs that are children (have parentId)
 */
export function getChildCategoryIds(categories: Category[]): Set<string> {
  return new Set(categories.filter(c => c.parentId).map(c => c.id));
}

/**
 * Get set of parent category IDs
 *
 * @param categories Array of all categories
 * @returns Set of category IDs that are parents (have children)
 */
export function getParentCategoryIds(categories: Category[]): Set<string> {
  const parentIds = new Set<string>();

  categories.forEach(category => {
    if (category.parentId) {
      parentIds.add(category.parentId);
    }
  });

  return parentIds;
}

/**
 * Determine if a category is income using explicit property with fallback
 * This is the preferred method for budget calculations
 */
function isIncomeCategory(categoryId: string, categories: Category[]): boolean {
  // First try to use explicit isIncome property for performance
  const category = categories.find(cat => cat.id === categoryId);
  if (category && category.isIncome !== undefined) {
    return category.isIncome;
  }

  // Fallback to hierarchy-based detection for backward compatibility
  return isIncomeCategoryWithCategories(categoryId, categories);
}

/**
 * Calculate budget totals from budgets array
 *
 * @param budgets Array of monthly budgets
 * @param categories Array of all categories
 * @param options Calculation options
 * @returns Budget totals breakdown
 */
export function calculateBudgetTotals(
  budgets: MonthlyBudget[],
  categories: Category[],
  options: BudgetCalculationOptions = {}
): BudgetTotals {
  const {
    excludeHidden = false,
    excludeChildren = false,
    excludeTransfers = true
  } = options;

  let income = 0;
  let expense = 0;
  let transfer = 0;

  // Get filtering sets if needed
  const hiddenCategoryIds = excludeHidden ? getHiddenCategoryIds(categories) : new Set<string>();
  const childCategoryIds = excludeChildren ? getChildCategoryIds(categories) : new Set<string>();

  budgets.forEach(budget => {
    // Apply filters
    if (excludeHidden && hiddenCategoryIds.has(budget.categoryId)) {
      return;
    }

    if (excludeChildren && childCategoryIds.has(budget.categoryId)) {
      return;
    }

    // Categorize budget
    if (isTransferCategory(budget.categoryId)) {
      if (!excludeTransfers) {
        transfer += budget.amount;
      }
    } else if (isIncomeCategory(budget.categoryId, categories)) {
      income += budget.amount;
    } else {
      expense += budget.amount;
    }
  });

  return {
    income,
    expense,
    transfer,
    total: income + expense + transfer
  };
}

/**
 * Calculate actual totals from transactions array
 *
 * @param transactions Array of transactions
 * @param categories Array of all categories
 * @param options Calculation options
 * @returns Actual totals breakdown
 */
export function calculateActualTotals(
  transactions: Transaction[],
  categories: Category[],
  options: BudgetCalculationOptions = {}
): BudgetTotals {
  const {
    excludeHidden = false,
    excludeChildren = false,
    excludeTransfers = true
  } = options;

  let income = 0;
  let expense = 0;
  let transfer = 0;

  // Get filtering sets if needed
  const hiddenCategoryIds = excludeHidden ? getHiddenCategoryIds(categories) : new Set<string>();
  const childCategoryIds = excludeChildren ? getChildCategoryIds(categories) : new Set<string>();

  transactions.forEach(transaction => {
    // Skip if transaction itself is hidden
    if (transaction.isHidden) {
      return;
    }

    // Skip if no category assigned
    if (!transaction.categoryId) {
      return;
    }

    // Apply filters
    if (excludeHidden && hiddenCategoryIds.has(transaction.categoryId)) {
      return;
    }

    if (excludeChildren && childCategoryIds.has(transaction.categoryId)) {
      return;
    }

    const amount = Math.abs(transaction.amount);

    // Categorize transaction
    if (isTransferCategory(transaction.categoryId)) {
      if (!excludeTransfers) {
        transfer += amount;
      }
    } else if (isIncomeCategory(transaction.categoryId, categories)) {
      income += amount;
    } else {
      expense += amount;
    }
  });

  return {
    income,
    expense,
    transfer,
    total: income + expense + transfer
  };
}

/**
 * Calculate budget vs actual comparison
 *
 * @param budgetTotals Budgeted amounts
 * @param actualTotals Actual amounts
 * @returns Comparison metrics
 */
export function calculateBudgetVsActual(
  budgetTotals: BudgetTotals,
  actualTotals: BudgetTotals
) {
  return {
    income: {
      budgeted: budgetTotals.income,
      actual: actualTotals.income,
      remaining: actualTotals.income - budgetTotals.income, // For income: positive = exceeding target
      percentUsed: budgetTotals.income > 0 ? Math.round((actualTotals.income / budgetTotals.income) * 100) : 0,
      isOverBudget: actualTotals.income < budgetTotals.income // For income: under target is "over budget"
    },
    expense: {
      budgeted: budgetTotals.expense,
      actual: actualTotals.expense,
      remaining: budgetTotals.expense - actualTotals.expense, // For expense: positive = under budget
      percentUsed: budgetTotals.expense > 0 ? Math.round((actualTotals.expense / budgetTotals.expense) * 100) : 0,
      isOverBudget: actualTotals.expense > budgetTotals.expense
    },
    transfer: {
      budgeted: budgetTotals.transfer,
      actual: actualTotals.transfer,
      remaining: budgetTotals.transfer - actualTotals.transfer,
      percentUsed: budgetTotals.transfer > 0 ? Math.round((actualTotals.transfer / budgetTotals.transfer) * 100) : 0,
      isOverBudget: actualTotals.transfer > budgetTotals.transfer
    },
    total: {
      budgeted: budgetTotals.total,
      actual: actualTotals.total,
      remaining: budgetTotals.total - actualTotals.total,
      percentUsed: budgetTotals.total > 0 ? Math.round((actualTotals.total / budgetTotals.total) * 100) : 0,
      isOverBudget: actualTotals.total > budgetTotals.total
    }
  };
}

/**
 * Create actuals map from transactions for a given category set
 * This is used for budget comparison calculations
 *
 * @param transactions Array of transactions
 * @param categories Array of all categories
 * @param options Calculation options
 * @returns Map of categoryId -> actual amount spent
 */
export function createActualsMap(
  transactions: Transaction[],
  categories: Category[],
  options: BudgetCalculationOptions = {}
): Record<string, number> {
  const {
    excludeHidden = true,
    excludeChildren = false,
    excludeTransfers = true
  } = options;

  // Get filtering sets if needed
  const hiddenCategoryIds = excludeHidden ? getHiddenCategoryIds(categories) : new Set<string>();
  const childCategoryIds = excludeChildren ? getChildCategoryIds(categories) : new Set<string>();

  const actualsByCategory: Record<string, number> = {};

  transactions.forEach(transaction => {
    // Skip hidden transactions
    if (transaction.isHidden) {
      return;
    }

    // Skip if no category assigned
    if (!transaction.categoryId) {
      return;
    }

    // Apply filters
    if (excludeHidden && hiddenCategoryIds.has(transaction.categoryId)) {
      return;
    }

    if (excludeChildren && childCategoryIds.has(transaction.categoryId)) {
      return;
    }

    if (excludeTransfers && isTransferCategory(transaction.categoryId)) {
      return;
    }

    const amount = Math.abs(transaction.amount);
    actualsByCategory[transaction.categoryId] =
      (actualsByCategory[transaction.categoryId] || 0) + amount;
  });

  return actualsByCategory;
}

/**
 * Roll up a parent category's totals from already-computed per-category comparisons.
 *
 * This is the per-component-friendly form of buildCategoryTreeAggregation: callers
 * who already have {categoryId, budgeted, actual} comparisons (e.g. from the budget
 * comparison API) can use this directly without re-aggregating raw budgets and
 * transactions. Internally it applies the same canonical rules:
 *
 *   - REQ-002: budgeted = max(directParentBudget, sum(children budgets))
 *   - REQ-004: actual   = directParentActual + sum(children actuals) — always additive
 *
 * @param parentId Parent category ID
 * @param children Array of child comparisons
 * @param existingParent Existing parent comparison (if any)
 * @param categories Array of all categories (used to detect income parents)
 * @returns Rolled-up parent comparison with both effective totals and the original
 *          direct-on-parent values preserved (originalBudget / originalActual)
 */
export function calculateEnhancedParentTotals(
  parentId: string,
  children: Array<{
    categoryId: string;
    budgeted: number;
    actual: number;
    isIncomeCategory?: boolean;
  }>,
  existingParent: {
    budgeted: number;
    actual: number;
    isIncomeCategory?: boolean;
  } | undefined,
  categories: Category[]
) {
  const childBudgetSum = children.reduce((sum, child) => sum + child.budgeted, 0);
  const childActualSum = children.reduce((sum, child) => sum + child.actual, 0);

  // Determine if this is an income category
  const isIncomeCategoryResult = existingParent?.isIncomeCategory ||
    (children.length > 0 && children[0].isIncomeCategory) ||
    isIncomeCategory(parentId, categories);

  // REQ-002: max rule applies uniformly to income and expense parents.
  // Parent budget represents the umbrella total; children are subdivisions.
  const directParentBudget = existingParent?.budgeted ?? 0;
  const budgeted = Math.max(directParentBudget, childBudgetSum);

  // REQ-004: actuals are always additive — direct parent + sum of children.
  const actual = existingParent
    ? childActualSum + existingParent.actual
    : childActualSum;

  // Calculate remaining and over budget based on category type
  let remaining: number;
  let isOverBudget: boolean;

  if (isIncomeCategoryResult) {
    // Income: positive remaining = exceeding target (good)
    remaining = actual - budgeted;
    isOverBudget = actual < budgeted; // Under target is "over budget" for income
  } else {
    // Expense: positive remaining = under budget (good)
    remaining = budgeted - actual;
    isOverBudget = actual > budgeted;
  }

  const percentUsed = budgeted > 0 ? Math.round((actual / budgeted) * 100) : 0;

  return {
    categoryId: parentId,
    budgeted,
    actual,
    remaining,
    percentUsed,
    isOverBudget,
    isIncomeCategory: isIncomeCategoryResult,
    isCalculated: !existingParent || (childBudgetSum > 0), // Flag if includes child data
    childrenIds: children.map(c => c.categoryId),
    originalBudget: existingParent?.budgeted,
    originalActual: existingParent?.actual,
  };
}

/**
 * Filter budgetable transactions (excludes transfers by default)
 *
 * @param transactions Array of transactions
 * @param categories Array of categories
 * @returns Filtered transactions that can be budgeted
 */
export function getBudgetableTransactions(
  transactions: Transaction[],
  _categories: Category[]
): Transaction[] {
  return transactions.filter(transaction => {
    // Skip hidden transactions
    if (transaction.isHidden) {
      return false;
    }

    // Skip if no category
    if (!transaction.categoryId) {
      return false;
    }

    // Exclude transfers
    if (isTransferCategory(transaction.categoryId)) {
      return false;
    }

    return true;
  });
}

/**
 * Get IDs of all savings categories (top-level with isSavings=true + their children).
 *
 * @param categories Array of all categories
 * @returns Set of category IDs that are savings categories
 */
export function getSavingsCategoryIds(categories: Category[]): Set<string> {
  const ids = new Set<string>();
  for (const cat of categories) {
    if (!cat.parentId && (cat.isSavings ?? false)) {
      ids.add(cat.id);
    } else if (cat.parentId) {
      const parent = categories.find(p => p.id === cat.parentId);
      if (parent?.isSavings ?? false) {
        ids.add(cat.id);
      }
    }
  }
  return ids;
}

/**
 * Utility function to determine if a category should be excluded from parent/child filtering
 *
 * @param categoryId Category ID to check
 * @param categories Array of all categories
 * @param options Filtering options
 * @returns true if category should be excluded
 */
export function shouldExcludeCategory(
  categoryId: string,
  categories: Category[],
  options: BudgetCalculationOptions = {}
): boolean {
  const {
    excludeHidden = false,
    excludeChildren = false,
    excludeTransfers = true
  } = options;

  if (excludeTransfers && isTransferCategory(categoryId)) {
    return true;
  }

  if (excludeHidden) {
    const hiddenIds = getHiddenCategoryIds(categories);
    if (hiddenIds.has(categoryId)) {
      return true;
    }
  }

  if (excludeChildren) {
    const childIds = getChildCategoryIds(categories);
    if (childIds.has(categoryId)) {
      return true;
    }
  }

  return false;
}

// =============================================================================
// Canonical Category Tree Rollup
// (CATEGORY-HIERARCHY-BUDGETING-BRD.md — single source of truth for parent rollup)
// =============================================================================

/**
 * Per-child aggregation row inside a tree.
 */
export interface ChildAggregation {
  categoryId: string;
  categoryName: string;
  budgeted: number;
  actual: number;
}

/**
 * Per-tree aggregation produced by buildCategoryTreeAggregation.
 *
 * effectiveBudget applies REQ-002: max(directBudget, childBudgetSum).
 * effectiveActual applies REQ-004: directActual + sum(child actuals) — always additive.
 */
export interface TreeAggregation {
  parentId: string;
  parentName: string;
  isIncome: boolean;
  directBudget: number;
  childBudgetSum: number;
  effectiveBudget: number;       // REQ-002: max(directBudget, childBudgetSum)
  directActual: number;
  childActualSum: number;
  effectiveActual: number;       // REQ-004: directActual + childActualSum
  children: ChildAggregation[];
}

/**
 * Classification of a tree's budget state — supports REQ-010's three-case rule for
 * Reports → "Unbudgeted Spending":
 *   - parent_budgeted     → directBudget > 0; tree is covered as a pool
 *   - child_budgeted_only → directBudget == 0 && childBudgetSum > 0; siblings without
 *                           budgets surface as leaf-level unbudgeted rows
 *   - unbudgeted          → no node in the tree has a budget
 */
export type TreeBudgetState = 'parent_budgeted' | 'child_budgeted_only' | 'unbudgeted';

export interface BuildTreeAggregationOptions {
  /** Exclude transactions/budgets in savings categories (per SAVINGS-CATEGORY-BRD). */
  excludeSavings?: boolean;
  /** Exclude transfer categories from the aggregation entirely. Defaults to true. */
  excludeTransfers?: boolean;
  /** Exclude hidden categories (and children of hidden parents). Defaults to true. */
  excludeHidden?: boolean;
}

/**
 * Build a per-parent rollup of budgets and actuals for a single reporting period.
 *
 * Implements the canonical hierarchy semantics from CATEGORY-HIERARCHY-BUDGETING-BRD §2.1:
 *   - REQ-002: effectiveBudget = max(directBudget, childBudgetSum) for both income and expense.
 *   - REQ-004: effectiveActual = directActual + sum(child actuals), always additive.
 *
 * Filters (savings/transfer/hidden) are applied BEFORE rollup so excluded categories
 * never contribute to parent totals.
 *
 * @param categories All categories for the family.
 * @param budgets Budget rows scoped to the reporting period (caller filters by month/range).
 * @param actuals Map of categoryId → actual amount for the reporting period.
 * @param options Filter options.
 * @returns Map keyed by parentId. Only parents that survive filtering and have at
 *          least one direct budget, child budget, direct actual, or child actual appear.
 */
export function buildCategoryTreeAggregation(
  categories: Category[],
  budgets: MonthlyBudget[],
  actuals: Map<string, number> | Record<string, number>,
  options: BuildTreeAggregationOptions = {}
): Map<string, TreeAggregation> {
  const {
    excludeSavings = false,
    excludeTransfers = true,
    excludeHidden = true,
  } = options;

  const actualsMap: Map<string, number> = actuals instanceof Map
    ? actuals
    : new Map(Object.entries(actuals));

  const hiddenIds = excludeHidden ? getHiddenCategoryIds(categories) : new Set<string>();
  const savingsIds = excludeSavings ? getSavingsCategoryIds(categories) : new Set<string>();

  const isExcluded = (categoryId: string): boolean => {
    if (excludeTransfers && isTransferCategory(categoryId)) return true;
    if (excludeHidden && hiddenIds.has(categoryId)) return true;
    if (excludeSavings && savingsIds.has(categoryId)) return true;
    return false;
  };

  const categoryById = new Map(categories.map(c => [c.id, c]));

  // Resolve a category to its parent id (a parent maps to itself).
  const resolveParentId = (categoryId: string): string | null => {
    const cat = categoryById.get(categoryId);
    if (!cat) return null;
    return cat.parentId ?? cat.id;
  };

  const trees = new Map<string, TreeAggregation>();

  const ensureTree = (parentId: string): TreeAggregation | null => {
    if (isExcluded(parentId)) return null;
    const existing = trees.get(parentId);
    if (existing) return existing;
    const parentCat = categoryById.get(parentId);
    if (!parentCat) return null;
    const fresh: TreeAggregation = {
      parentId,
      parentName: parentCat.name,
      isIncome: isIncomeCategory(parentId, categories),
      directBudget: 0,
      childBudgetSum: 0,
      effectiveBudget: 0,
      directActual: 0,
      childActualSum: 0,
      effectiveActual: 0,
      children: [],
    };
    trees.set(parentId, fresh);
    return fresh;
  };

  const ensureChild = (tree: TreeAggregation, childCategoryId: string): ChildAggregation | null => {
    const cat = categoryById.get(childCategoryId);
    if (!cat) return null;
    let child = tree.children.find(c => c.categoryId === childCategoryId);
    if (!child) {
      child = { categoryId: childCategoryId, categoryName: cat.name, budgeted: 0, actual: 0 };
      tree.children.push(child);
    }
    return child;
  };

  // Fold budgets into trees.
  for (const budget of budgets) {
    if (isExcluded(budget.categoryId)) continue;
    const parentId = resolveParentId(budget.categoryId);
    if (!parentId) continue;
    const tree = ensureTree(parentId);
    if (!tree) continue;
    if (budget.categoryId === parentId) {
      tree.directBudget += budget.amount;
    } else {
      tree.childBudgetSum += budget.amount;
      const child = ensureChild(tree, budget.categoryId);
      if (child) child.budgeted += budget.amount;
    }
  }

  // Fold actuals into trees.
  for (const [categoryId, amount] of actualsMap) {
    if (isExcluded(categoryId)) continue;
    const parentId = resolveParentId(categoryId);
    if (!parentId) continue;
    const tree = ensureTree(parentId);
    if (!tree) continue;
    if (categoryId === parentId) {
      tree.directActual += amount;
    } else {
      tree.childActualSum += amount;
      const child = ensureChild(tree, categoryId);
      if (child) child.actual += amount;
    }
  }

  // Finalize derived totals per REQ-002 / REQ-004.
  for (const tree of trees.values()) {
    tree.effectiveBudget = Math.max(tree.directBudget, tree.childBudgetSum);
    tree.effectiveActual = tree.directActual + tree.childActualSum;
  }

  return trees;
}

/**
 * Classify a tree's budget state per REQ-010. Accepts the narrowest input it
 * needs so callers don't have to construct a full TreeAggregation just to
 * classify period-level totals (the period totals have the same shape for
 * these two fields and that's all this function reads).
 */
export function classifyTreeBudgetState(
  tree: { directBudget: number; childBudgetSum: number },
): TreeBudgetState {
  if (tree.directBudget > 0) return 'parent_budgeted';
  if (tree.childBudgetSum > 0) return 'child_budgeted_only';
  return 'unbudgeted';
}

/**
 * Whether a tree is "unused" — has a meaningful budget but actual spending below
 * the threshold (default 10%, matching the existing widget threshold). Per REQ-011.
 */
export function isTreeUnused(tree: TreeAggregation, threshold = 0.1): boolean {
  if (tree.effectiveBudget <= 0) return false;
  return (tree.effectiveActual / tree.effectiveBudget) < threshold;
}

/**
 * Whether a tree's effective actual exceeds its effective budget for the period.
 * Used by widgets that surface variance ("over budget"). Per REQ-009.
 *
 * Note: this is type-agnostic. The income/expense distinction is about how the
 * variance is *interpreted* (under-target is "bad" for income — REQ-002a), not
 * whether actual > budget. Callers that need the income-flavored interpretation
 * (under-target = bad) should compare effectiveActual < effectiveBudget instead.
 */
export function isTreeOverBudget(tree: TreeAggregation): boolean {
  if (tree.effectiveBudget <= 0) return false;
  return tree.effectiveActual > tree.effectiveBudget;
}

/**
 * Per-month input row for buildPeriodRollup.
 */
export interface MonthlyRollupInput {
  month: string;
  budgets: MonthlyBudget[];
  actuals: Map<string, number> | Record<string, number>;
}

/**
 * Per-tree period-level rollup. Extends TreeAggregation with stats that only
 * make sense across multiple months. Period budget/actual fields are the sums
 * of the per-month effective values (max applied per-month, then summed) so
 * monthly variance integrity is preserved.
 *
 * Note: childIds is provided as an array for ergonomic iteration; the children
 * field on TreeAggregation carries the per-child period totals.
 */
export interface PeriodTreeRollup extends TreeAggregation {
  monthsWithBudget: number;
  monthsOverBudget: number;
  childIds: string[];
}

/**
 * Build a per-tree rollup across a date range, applying the canonical hierarchy
 * semantics from CATEGORY-HIERARCHY-BUDGETING-BRD §2.1. For each month the
 * caller provides budgets + actuals; the helper:
 *
 *   1. Builds a per-month TreeAggregation via buildCategoryTreeAggregation
 *      (so each month independently applies REQ-002 max and REQ-004 additive).
 *   2. Folds per-month results into per-tree period totals.
 *   3. Tracks monthsWithBudget and monthsOverBudget using the per-month effective
 *      values — this is required for "consistently over budget" widgets, where
 *      summing across the period would lose the per-month signal.
 *
 * The resulting map has one entry per parent tree present in the data.
 */
export function buildPeriodRollup(
  categories: Category[],
  monthlyData: MonthlyRollupInput[],
  options: BuildTreeAggregationOptions = {},
): Map<string, PeriodTreeRollup> {
  const period = new Map<string, PeriodTreeRollup>();

  for (const monthEntry of monthlyData) {
    const perMonth = buildCategoryTreeAggregation(
      categories, monthEntry.budgets, monthEntry.actuals, options,
    );

    for (const [parentId, mt] of perMonth) {
      let acc = period.get(parentId);
      if (!acc) {
        acc = {
          parentId,
          parentName: mt.parentName,
          isIncome: mt.isIncome,
          directBudget: 0,
          childBudgetSum: 0,
          effectiveBudget: 0,
          directActual: 0,
          childActualSum: 0,
          effectiveActual: 0,
          children: [],
          monthsWithBudget: 0,
          monthsOverBudget: 0,
          childIds: [],
        };
        period.set(parentId, acc);
      }
      acc.directBudget += mt.directBudget;
      acc.childBudgetSum += mt.childBudgetSum;
      acc.effectiveBudget += mt.effectiveBudget;
      acc.directActual += mt.directActual;
      acc.childActualSum += mt.childActualSum;
      acc.effectiveActual += mt.effectiveActual;
      if (mt.effectiveBudget > 0) acc.monthsWithBudget += 1;
      if (mt.effectiveBudget > 0 && mt.effectiveActual > mt.effectiveBudget) {
        acc.monthsOverBudget += 1;
      }

      // Fold per-month child totals into period child totals.
      for (const child of mt.children) {
        let existing = acc.children.find(c => c.categoryId === child.categoryId);
        if (!existing) {
          existing = { categoryId: child.categoryId, categoryName: child.categoryName, budgeted: 0, actual: 0 };
          acc.children.push(existing);
          acc.childIds.push(child.categoryId);
        }
        existing.budgeted += child.budgeted;
        existing.actual += child.actual;
      }
    }
  }

  return period;
}