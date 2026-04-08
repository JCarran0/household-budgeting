/**
 * Pure helper functions extracted from ReportService.
 * No class, no DataService dependency.
 */

import { Category } from '../shared/types';
import { format, addMonths } from 'date-fns';

/**
 * Generate an inclusive list of YYYY-MM month strings between start and end.
 */
export function getMonthRange(startMonth: string, endMonth: string): string[] {
  const months: string[] = [];

  // Parse months properly - split by dash and create date
  const [startYear, startMonthNum] = startMonth.split('-').map(Number);
  const [endYear, endMonthNum] = endMonth.split('-').map(Number);

  let current = new Date(startYear, startMonthNum - 1, 1); // Month is 0-based
  const end = new Date(endYear, endMonthNum - 1, 1);

  while (current <= end) {
    months.push(format(current, 'yyyy-MM'));
    current = addMonths(current, 1);
  }

  return months;
}

/**
 * Calculate the population standard deviation of a numeric array.
 */
export function calculateStdDev(values: number[]): number {
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - avg, 2));
  const avgSquaredDiff = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.sqrt(avgSquaredDiff);
}

/**
 * Get IDs of categories that are effectively hidden — either directly
 * hidden or children of a hidden parent.
 */
export function getEffectivelyHiddenCategoryIds(categories: Category[]): Set<string> {
  const hiddenIds = new Set<string>();

  // First, add directly hidden categories
  categories.filter(c => c.isHidden).forEach(c => hiddenIds.add(c.id));

  // Then, add subcategories of hidden parents
  categories.forEach(category => {
    if (category.parentId && hiddenIds.has(category.parentId)) {
      hiddenIds.add(category.id);
    }
  });

  return hiddenIds;
}

/**
 * Get IDs of subcategories under the CUSTOM_SAVINGS parent.
 */
export function getSavingsSubcategoryIds(categories: Category[]): Set<string> {
  const savingsSubcategoryIds = new Set<string>();

  // Find all subcategories of the CUSTOM_SAVINGS parent category
  categories.forEach(category => {
    if (category.parentId === 'CUSTOM_SAVINGS') {
      savingsSubcategoryIds.add(category.id);
    }
  });

  return savingsSubcategoryIds;
}
