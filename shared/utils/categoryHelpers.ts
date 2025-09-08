/**
 * Category helper utilities shared between frontend and backend
 */

// Import Category type for hierarchical functions
import type { Category, BudgetType } from '../types';

/**
 * Check if a category is an income category based on its ID
 * Income categories in Plaid taxonomy start with "INCOME"
 * @deprecated Use isIncomeCategoryHierarchical for proper subcategory support
 */
export function isIncomeCategory(categoryId: string): boolean {
  return categoryId.startsWith('INCOME');
}

/**
 * Check if a category is a transfer category (should be excluded from most reports)
 * Transfer categories are TRANSFER_IN and TRANSFER_OUT and their subcategories
 */
export function isTransferCategory(categoryId: string): boolean {
  return categoryId.startsWith('TRANSFER_IN') || categoryId.startsWith('TRANSFER_OUT');
}

/**
 * Check if a category should be included in budget comparisons
 * Income and transfer categories are typically excluded from expense budgeting
 * @deprecated Use isExpenseCategoryHierarchical for proper subcategory support
 */
export function isExpenseCategory(categoryId: string): boolean {
  return !isIncomeCategory(categoryId) && !isTransferCategory(categoryId);
}

/**
 * Create a lookup map for efficient category hierarchy traversal
 */
export function createCategoryLookup(categories: Category[]): Map<string, Category> {
  return new Map(categories.map(cat => [cat.id, cat]));
}

/**
 * Check if a category or any of its ancestors is an income category
 * This properly handles subcategories under INCOME parent categories
 */
export function isIncomeCategoryHierarchical(
  categoryId: string,
  categoryLookup: Map<string, Category>
): boolean {
  const visited = new Set<string>(); // Prevent infinite loops
  let currentId: string | null = categoryId;
  
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    
    // Check if current category is a root income category
    if (currentId.startsWith('INCOME')) {
      // Only return true if the category actually exists in the lookup
      // This prevents false positives for non-existent INCOME_ categories
      return categoryLookup.has(currentId);
    }
    
    // Move up to parent
    const category = categoryLookup.get(currentId);
    if (!category) {
      // Category doesn't exist, can't traverse further
      return false;
    }
    currentId = category.parentId;
  }
  
  return false;
}

/**
 * Check if a category should be included in budget comparisons using hierarchical logic
 * Income and transfer categories (including subcategories) are excluded from expense budgeting
 */
export function isExpenseCategoryHierarchical(
  categoryId: string,
  categoryLookup: Map<string, Category>
): boolean {
  return !isIncomeCategoryHierarchical(categoryId, categoryLookup) && !isTransferCategory(categoryId);
}

/**
 * Async version that accepts categories array instead of lookup map
 * Useful when you don't already have a lookup map created
 */
export function isIncomeCategoryWithCategories(
  categoryId: string,
  categories: Category[]
): boolean {
  const lookup = createCategoryLookup(categories);
  return isIncomeCategoryHierarchical(categoryId, lookup);
}

/**
 * Async version for expense category detection with categories array
 */
export function isExpenseCategoryWithCategories(
  categoryId: string,
  categories: Category[]
): boolean {
  const lookup = createCategoryLookup(categories);
  return isExpenseCategoryHierarchical(categoryId, lookup);
}

/**
 * Determine the budget type for a given category
 * Income categories should use inverse budget logic (over = good, under = bad)
 * Expense categories use normal budget logic (over = bad, under = good)
 */
export function getBudgetType(
  categoryId: string,
  categories: Category[]
): BudgetType {
  const lookup = createCategoryLookup(categories);
  return isIncomeCategoryHierarchical(categoryId, lookup) ? 'income' : 'expense';
}

/**
 * Check if a category can be budgeted (excludes transfers)
 * Both income and expense categories can be budgeted, but transfers cannot
 */
export function isBudgetableCategory(
  categoryId: string,
  _categories: Category[] // Prefix with underscore to indicate intentionally unused
): boolean {
  // Transfer categories should not be budgetable
  if (isTransferCategory(categoryId)) {
    return false;
  }
  
  // Both income and expense categories are budgetable
  return true;
}