/**
 * Spending category breakdown — pure helper.
 *
 * Extracted from `ReportService.getCategoryBreakdown` (Sprint 5.5 / TD-010).
 * No I/O, no class, no DataService dependency.
 * The class method retains the try/catch envelope and success/error wrapping.
 *
 * LANDMINE: savings categories are deliberately excluded from this breakdown.
 * Do NOT remove the `savingsCatIds` filter — it prevents savings contributions
 * from inflating the spending total.
 */

import { Category } from '../../../shared/types';
import { StoredTransaction } from '../../transactionService';
import { CategoryBreakdown } from '../../reportService';
import { getEffectivelyHiddenCategoryIds, getSavingsCategoryIds } from '../../reportHelpers';

export interface CategoryBreakdownHelperResult {
  breakdown: CategoryBreakdown[];
  total: number;
}

/**
 * Compute the spending category breakdown for a date range.
 * Savings categories are excluded (see module docblock).
 *
 * @param transactions  All active transactions for the family (pre-filtered by excludeRemoved).
 * @param categories    All categories for the family.
 * @param startDate     Inclusive start date in YYYY-MM-DD format.
 * @param endDate       Inclusive end date in YYYY-MM-DD format.
 * @param includeSubcategories  When true returns a hierarchical result; false returns a flat list.
 * @returns `{ breakdown, total }` — no success/error envelope.
 */
export function buildCategoryBreakdown(
  transactions: StoredTransaction[],
  categories: Category[],
  startDate: string,
  endDate: string,
  includeSubcategories: boolean
): CategoryBreakdownHelperResult {
  const hiddenCategoryIds = getEffectivelyHiddenCategoryIds(categories);
  const savingsCatIds = getSavingsCategoryIds(categories);

  // Filter transactions (excluding hidden categories and savings categories)
  const filteredTransactions = transactions.filter(t =>
    t.date >= startDate &&
    t.date <= endDate &&
    !t.isHidden &&
    !t.pending &&
    t.amount > 0 &&
    (!t.categoryId || !hiddenCategoryIds.has(t.categoryId)) &&
    (!t.categoryId || !savingsCatIds.has(t.categoryId))
  );

  const total = filteredTransactions.reduce((sum, t) => sum + t.amount, 0);

  // Group by category
  const categorySpending = new Map<string, { amount: number; count: number }>();

  for (const txn of filteredTransactions) {
    const categoryId = txn.categoryId ?? 'uncategorized';
    const current = categorySpending.get(categoryId) ?? { amount: 0, count: 0 };
    categorySpending.set(categoryId, {
      amount: current.amount + txn.amount,
      count: current.count + 1,
    });
  }

  const breakdown: CategoryBreakdown[] = [];

  if (includeSubcategories) {
    const parentCategories = categories.filter(c => !c.parentId);

    for (const parent of parentCategories) {
      const subcategories = categories.filter(c => c.parentId === parent.id);
      const subcategoryBreakdown: CategoryBreakdown[] = [];
      let parentAmount = 0;
      let parentCount = 0;

      const parentSpending = categorySpending.get(parent.id);
      if (parentSpending) {
        parentAmount += parentSpending.amount;
        parentCount += parentSpending.count;
      }

      for (const sub of subcategories) {
        const subSpending = categorySpending.get(sub.id);
        if (subSpending) {
          parentAmount += subSpending.amount;
          parentCount += subSpending.count;
          subcategoryBreakdown.push({
            categoryId: sub.id,
            categoryName: sub.name,
            amount: subSpending.amount,
            percentage: total > 0 ? (subSpending.amount / total) * 100 : 0,
            transactionCount: subSpending.count,
          });
        }
      }

      if (parentAmount > 0) {
        breakdown.push({
          categoryId: parent.id,
          categoryName: parent.name,
          amount: parentAmount,
          percentage: total > 0 ? (parentAmount / total) * 100 : 0,
          transactionCount: parentCount,
          subcategories: subcategoryBreakdown.length > 0 ? subcategoryBreakdown : undefined,
        });
      }
    }

    // Add uncategorized if any
    const uncategorized = categorySpending.get('uncategorized');
    if (uncategorized) {
      breakdown.push({
        categoryId: 'uncategorized',
        categoryName: 'Uncategorized',
        amount: uncategorized.amount,
        percentage: total > 0 ? (uncategorized.amount / total) * 100 : 0,
        transactionCount: uncategorized.count,
      });
    }
  } else {
    // Flat list
    for (const [categoryId, data] of categorySpending) {
      const category = categories.find(c => c.id === categoryId);
      breakdown.push({
        categoryId,
        categoryName: category?.name ?? 'Uncategorized',
        amount: data.amount,
        percentage: total > 0 ? (data.amount / total) * 100 : 0,
        transactionCount: data.count,
      });
    }
  }

  // Sort by amount descending
  breakdown.sort((a, b) => b.amount - a.amount);

  return { breakdown, total };
}
