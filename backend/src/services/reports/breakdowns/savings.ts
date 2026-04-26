/**
 * Savings category breakdown — pure helper.
 *
 * Extracted from `ReportService.getSavingsCategoryBreakdown` (Sprint 5.5 / TD-010).
 * No I/O, no class, no DataService dependency.
 * The class method retains the try/catch envelope and success/error wrapping.
 */

import { Category } from '../../../shared/types';
import { StoredTransaction } from '../../transactionService';
import { CategoryBreakdown } from '../../reportService';
import { getSavingsCategoryIds } from '../../reportHelpers';

export interface SavingsBreakdownResult {
  breakdown: CategoryBreakdown[];
  total: number;
}

/**
 * Compute the savings category breakdown for a date range.
 * Only savings categories (top-level `isSavings=true` and their subcategories) are included.
 *
 * @param transactions  All active transactions for the family (pre-filtered by excludeRemoved).
 * @param categories    All categories for the family.
 * @param startDate     Inclusive start date in YYYY-MM-DD format.
 * @param endDate       Inclusive end date in YYYY-MM-DD format.
 * @returns `{ breakdown, total }` — no success/error envelope.
 */
export function buildSavingsBreakdown(
  transactions: StoredTransaction[],
  categories: Category[],
  startDate: string,
  endDate: string
): SavingsBreakdownResult {
  const savingsCatIds = getSavingsCategoryIds(categories);

  // Filter transactions for savings categories only
  const filteredTransactions = transactions.filter(t =>
    t.date >= startDate &&
    t.date <= endDate &&
    !t.isHidden &&
    !t.pending &&
    t.amount > 0 &&
    t.categoryId !== null && t.categoryId !== undefined && savingsCatIds.has(t.categoryId)
  );

  const total = filteredTransactions.reduce((sum, t) => sum + t.amount, 0);

  // Group by category
  const categorySpending = new Map<string, { amount: number; count: number }>();

  for (const txn of filteredTransactions) {
    const categoryId = txn.categoryId!;
    const current = categorySpending.get(categoryId) ?? { amount: 0, count: 0 };
    categorySpending.set(categoryId, {
      amount: current.amount + txn.amount,
      count: current.count + 1,
    });
  }

  // Build flat breakdown (savings are all subcategories)
  const breakdown: CategoryBreakdown[] = [];
  for (const [categoryId, data] of categorySpending) {
    const category = categories.find(c => c.id === categoryId);
    breakdown.push({
      categoryId,
      categoryName: category?.name ?? 'Unknown Savings',
      amount: data.amount,
      percentage: total > 0 ? (data.amount / total) * 100 : 0,
      transactionCount: data.count,
    });
  }

  // Sort by amount descending
  breakdown.sort((a, b) => b.amount - a.amount);

  return { breakdown, total };
}
