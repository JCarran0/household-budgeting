/**
 * Category helper utilities shared between frontend and backend
 */

/**
 * Check if a category is an income category based on its ID
 * Income categories in Plaid taxonomy start with "INCOME"
 */
export function isIncomeCategory(categoryId: string): boolean {
  return categoryId.startsWith('INCOME');
}

/**
 * Check if a category is a transfer category (should be excluded from most reports)
 * Transfer categories are TRANSFER_IN and TRANSFER_OUT
 */
export function isTransferCategory(categoryId: string): boolean {
  return categoryId === 'TRANSFER_IN' || categoryId === 'TRANSFER_OUT';
}

/**
 * Check if a category should be included in budget comparisons
 * Income and transfer categories are typically excluded from expense budgeting
 */
export function isExpenseCategory(categoryId: string): boolean {
  return !isIncomeCategory(categoryId) && !isTransferCategory(categoryId);
}