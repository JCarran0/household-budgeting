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
    } else if (isIncomeCategoryWithCategories(budget.categoryId, categories)) {
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
    } else if (isIncomeCategoryWithCategories(transaction.categoryId, categories)) {
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
 * Enhanced hierarchical parent calculation for budget comparisons
 * This calculates parent totals based on children and existing parent budgets
 *
 * @param parentId Parent category ID
 * @param children Array of child comparisons
 * @param existingParent Existing parent comparison (if any)
 * @param categories Array of all categories
 * @returns Enhanced parent comparison
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
  const isIncomeCategory = existingParent?.isIncomeCategory ||
    (children.length > 0 && children[0].isIncomeCategory) ||
    isIncomeCategoryWithCategories(parentId, categories);

  // Calculate budgeted amount (additive approach for both income and expense)
  const budgeted = existingParent
    ? childBudgetSum + existingParent.budgeted
    : childBudgetSum;

  // Calculate actual amount (always additive)
  const actual = existingParent
    ? childActualSum + existingParent.actual
    : childActualSum;

  // Calculate remaining and over budget based on category type
  let remaining: number;
  let isOverBudget: boolean;

  if (isIncomeCategory) {
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
    isIncomeCategory,
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