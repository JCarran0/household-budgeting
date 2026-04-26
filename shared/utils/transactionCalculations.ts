/**
 * Transaction Calculation Utilities
 *
 * Shared utilities for calculating income, expenses, savings, and spending across
 * the app (Reports KPIs, chatbot data, monthly summaries). Aligned with
 * `calculateActualTotals` in budgetCalculations.ts so Dashboard and Reports
 * agree numerically.
 *
 * Bucketing rule (per SAVINGS-CATEGORY-BRD REQ-005a):
 *   Transactions are bucketed by **category type**, not by amount sign.
 *   Within each bucket, amounts are accumulated **signed**, so a refund
 *   (negative amount) in an expense category nets against expense rather
 *   than being silently dropped or reclassified as income. Uncategorized
 *   transactions are excluded — match `calculateActualTotals` behavior;
 *   the app's uncategorized badge surfaces these separately.
 */

import { isTransferCategory, isIncomeCategory } from './categoryHelpers';
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
 * Total income for the period. Signed accumulation within the income-category
 * bucket; returned as a positive number (Plaid stores income as negative).
 *
 * A paycheck reversal (positive amount in an income category) reduces income.
 */
export function calculateIncome(
  transactions: TransactionForCalculation[],
  // categories accepted for API uniformity with the other helpers; not consulted
  // because isIncomeCategory uses Plaid's category-id prefix to detect income.
  _categories: Category[] = []
): number {
  void _categories;
  let income = 0;
  for (const t of transactions) {
    if (isSkippable(t)) continue;
    if (!isIncomeCategory(t.categoryId!)) continue;
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
  _categories: Category[] = []
): number {
  void _categories;
  let expenses = 0;
  for (const t of transactions) {
    if (isSkippable(t)) continue;
    if (isTransferCategory(t.categoryId!)) continue;
    if (isIncomeCategory(t.categoryId!)) continue;
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
  const savingsIds = getSavingsCategoryIds(categories);
  let spending = 0;
  for (const t of transactions) {
    if (isSkippable(t)) continue;
    if (isTransferCategory(t.categoryId!)) continue;
    if (isIncomeCategory(t.categoryId!)) continue;
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
  _categories: Category[] = []
) {
  void _categories;
  const income: TransactionForCalculation[] = [];
  const expenses: TransactionForCalculation[] = [];
  const transfers: TransactionForCalculation[] = [];

  for (const txn of transactions) {
    if (txn.isHidden || txn.pending) continue;
    if (!txn.categoryId) continue;

    if (isTransferCategory(txn.categoryId)) {
      transfers.push(txn);
    } else if (isIncomeCategory(txn.categoryId)) {
      income.push(txn);
    } else {
      expenses.push(txn);
    }
  }

  return { income, expenses, transfers };
}
