/**
 * Income category breakdown — pure helper.
 *
 * Extracted from `ReportService.getIncomeCategoryBreakdown` (Sprint 5.5 / TD-010).
 * No I/O, no class, no DataService dependency.
 * The class method retains the try/catch envelope and success/error wrapping.
 */

import { Category } from '../../../shared/types';
import { StoredTransaction } from '../../transactionService';
import { CategoryBreakdown } from '../../reportService';
import { getEffectivelyHiddenCategoryIds } from '../../reportHelpers';

export interface IncomeBreakdownResult {
  breakdown: CategoryBreakdown[];
  total: number;
}

/**
 * Compute the income category breakdown for a date range.
 *
 * @param transactions  All active transactions for the family (pre-filtered by excludeRemoved).
 * @param categories    All categories for the family.
 * @param startDate     Inclusive start date in YYYY-MM-DD format.
 * @param endDate       Inclusive end date in YYYY-MM-DD format.
 * @param includeSubcategories  When true returns a hierarchical result; false returns a flat list.
 * @returns `{ breakdown, total }` — no success/error envelope.
 */
export function buildIncomeBreakdown(
  transactions: StoredTransaction[],
  categories: Category[],
  startDate: string,
  endDate: string,
  includeSubcategories: boolean
): IncomeBreakdownResult {
  const hiddenCategoryIds = getEffectivelyHiddenCategoryIds(categories);

  // Find the Income parent category (Plaid PFC standard category)
  const incomeParentCategory = categories.find(c =>
    !c.parentId &&
    (c.name.toLowerCase().includes('income') || c.id.includes('INCOME') || c.id === 'INCOME')
  );

  if (!incomeParentCategory) {
    return { breakdown: [], total: 0 };
  }

  // Get all income category IDs (parent + children)
  const incomeSubcategories = categories.filter(c => c.parentId === incomeParentCategory.id);
  const incomeCategoryIds = new Set([
    incomeParentCategory.id,
    ...incomeSubcategories.map(c => c.id),
  ]);

  // Filter transactions for income (negative amounts from income categories only, excluding hidden)
  const filteredTransactions = transactions.filter(t =>
    t.date >= startDate &&
    t.date <= endDate &&
    !t.isHidden &&
    !t.pending &&
    t.amount < 0 &&
    t.categoryId !== null && t.categoryId !== undefined && incomeCategoryIds.has(t.categoryId) &&
    !hiddenCategoryIds.has(t.categoryId!)
  );

  // Calculate total income (absolute value)
  const total = filteredTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);

  // Group by category
  const categoryIncome = new Map<string, { amount: number; count: number }>();

  for (const txn of filteredTransactions) {
    const categoryId = txn.categoryId!;
    const current = categoryIncome.get(categoryId) ?? { amount: 0, count: 0 };
    categoryIncome.set(categoryId, {
      amount: current.amount + Math.abs(txn.amount),
      count: current.count + 1,
    });
  }

  const breakdown: CategoryBreakdown[] = [];

  if (includeSubcategories) {
    const parent = incomeParentCategory;
    const subcategoryBreakdown: CategoryBreakdown[] = [];
    let parentAmount = 0;
    let parentCount = 0;

    // Add parent's own income if any
    const parentIncome = categoryIncome.get(parent.id);
    if (parentIncome) {
      parentAmount += parentIncome.amount;
      parentCount += parentIncome.count;
    }

    // Add subcategories
    for (const sub of incomeSubcategories) {
      const subIncome = categoryIncome.get(sub.id);
      if (subIncome) {
        parentAmount += subIncome.amount;
        parentCount += subIncome.count;
        subcategoryBreakdown.push({
          categoryId: sub.id,
          categoryName: sub.name,
          amount: subIncome.amount,
          percentage: total > 0 ? (subIncome.amount / total) * 100 : 0,
          transactionCount: subIncome.count,
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

    // Add uncategorized income if any (key 'uncategorized' is used by caller — but income
    // filter requires a known categoryId so this is defensive only)
    const uncategorized = categoryIncome.get('uncategorized');
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
    for (const [categoryId, data] of categoryIncome) {
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
