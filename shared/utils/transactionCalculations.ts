/**
 * Transaction Calculation Utilities
 *
 * Shared utilities for calculating income, expenses, savings, and spending across
 * the app (Reports KPIs, chatbot data, monthly summaries).
 *
 * Bucketing rule (per SAVINGS-CATEGORY-BRD REQ-005a):
 *   Transactions are bucketed by **category type**, not by amount sign.
 *   Within each bucket, amounts are accumulated **signed**, so a refund
 *   (negative amount) in an expense category nets against expense rather
 *   than being silently dropped or reclassified as income. Uncategorized
 *   transactions are excluded — the app's uncategorized badge surfaces
 *   these separately.
 *
 * Income detection uses `isIncomeCategoryHierarchical`, which honors BOTH
 * the Plaid `INCOME_*` prefix AND custom categories that set `isIncome=true`.
 * Prefix-only detection (used by `calculateActualTotals` in budgetCalculations.ts)
 * misses custom income categories and is being phased out here.
 */

import {
  isTransferCategory,
  isIncomeCategory,
  isIncomeCategoryHierarchical,
  createCategoryLookup,
} from './categoryHelpers';
import { getSavingsCategoryIds } from './budgetCalculations';
import type { Category } from '../types';

export interface TransactionForCalculation {
  amount: number;
  categoryId?: string | null;
  isHidden?: boolean;
  pending?: boolean;
}

function isSkippable(t: TransactionForCalculation): boolean {
  if (t.isHidden || t.pending) return true;
  if (!t.categoryId) return true;
  return false;
}

/**
 * Income detection: prefer hierarchical (honors custom `isIncome=true` categories
 * and Plaid `INCOME_*` prefix). Falls back to prefix-only when no categories array
 * is supplied — `isIncomeCategoryHierarchical` requires the category to exist in
 * the lookup, so an empty lookup would incorrectly reject INCOME_* categories.
 */
function detectIncome(categoryId: string, lookup: Map<string, Category>): boolean {
  if (lookup.size === 0) return isIncomeCategory(categoryId);
  return isIncomeCategoryHierarchical(categoryId, lookup);
}

/**
 * Total income for the period. Signed accumulation within the income-category
 * bucket; returned as a positive number (Plaid stores income as negative).
 *
 * A paycheck reversal (positive amount in an income category) reduces income.
 */
export function calculateIncome(
  transactions: TransactionForCalculation[],
  categories: Category[] = []
): number {
  const lookup = createCategoryLookup(categories);
  let income = 0;
  for (const t of transactions) {
    if (isSkippable(t)) continue;
    if (!detectIncome(t.categoryId!, lookup)) continue;
    income += -t.amount;
  }
  return income;
}

/**
 * Total expenses (everything that isn't income or transfer — INCLUDES savings).
 * Signed accumulation: refunds net against expense.
 *
 * Most callers want `calculateSpending` instead, which excludes savings.
 */
export function calculateExpenses(
  transactions: TransactionForCalculation[],
  categories: Category[] = []
): number {
  const lookup = createCategoryLookup(categories);
  let expenses = 0;
  for (const t of transactions) {
    if (isSkippable(t)) continue;
    if (isTransferCategory(t.categoryId!)) continue;
    if (detectIncome(t.categoryId!, lookup)) continue;
    expenses += t.amount;
  }
  return expenses;
}

/**
 * Total savings contributions. Signed accumulation within the savings-category
 * bucket: a 401k reversal (negative amount) reduces savings.
 */
export function calculateSavings(
  transactions: TransactionForCalculation[],
  categories: Category[]
): number {
  const savingsIds = getSavingsCategoryIds(categories);
  let savings = 0;
  for (const t of transactions) {
    if (isSkippable(t)) continue;
    if (!savingsIds.has(t.categoryId!)) continue;
    savings += t.amount;
  }
  return savings;
}

/**
 * Consumption-only spending: expenses excluding savings, transfers, and income.
 * Signed accumulation, so refunds net against spending.
 *
 * This is the "Monthly Spending" / "Reports Expenses" definition.
 */
export function calculateSpending(
  transactions: TransactionForCalculation[],
  categories: Category[]
): number {
  const lookup = createCategoryLookup(categories);
  const savingsIds = getSavingsCategoryIds(categories);
  let spending = 0;
  for (const t of transactions) {
    if (isSkippable(t)) continue;
    if (isTransferCategory(t.categoryId!)) continue;
    if (detectIncome(t.categoryId!, lookup)) continue;
    if (savingsIds.has(t.categoryId!)) continue;
    spending += t.amount;
  }
  return spending;
}

/**
 * Net cash flow = income − expenses (expenses includes savings here).
 * For the savings-aware net, callers should compute `income − spending − savings`
 * directly so the savings line is visible.
 */
export function calculateNetCashFlow(
  transactions: TransactionForCalculation[],
  categories: Category[] = []
): number {
  return calculateIncome(transactions, categories) - calculateExpenses(transactions, categories);
}

/**
 * Separate transactions into income, expenses, and transfers by category type.
 * Uncategorized transactions are skipped.
 */
export function categorizeTransactions(
  transactions: TransactionForCalculation[],
  categories: Category[] = []
) {
  const lookup = createCategoryLookup(categories);
  const income: TransactionForCalculation[] = [];
  const expenses: TransactionForCalculation[] = [];
  const transfers: TransactionForCalculation[] = [];

  for (const txn of transactions) {
    if (txn.isHidden || txn.pending) continue;
    if (!txn.categoryId) continue;

    if (isTransferCategory(txn.categoryId)) {
      transfers.push(txn);
    } else if (detectIncome(txn.categoryId, lookup)) {
      income.push(txn);
    } else {
      expenses.push(txn);
    }
  }

  return { income, expenses, transfers };
}
