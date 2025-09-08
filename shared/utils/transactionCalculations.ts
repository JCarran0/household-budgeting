/**
 * Transaction Calculation Utilities
 * 
 * Shared utilities for calculating income, expenses, and other financial metrics
 * These functions ensure consistent handling of transfers across the application
 */

import { isTransferCategory } from './categoryHelpers';

export interface TransactionForCalculation {
  amount: number;
  categoryId?: string | null;
  isHidden?: boolean;
  pending?: boolean;
}

/**
 * Calculate total income from transactions (excluding transfers)
 * Income = negative amounts that are not transfers
 * @param transactions Array of transactions to calculate from
 * @returns Total income amount (positive value)
 */
export function calculateIncome(transactions: TransactionForCalculation[]): number {
  return transactions
    .filter(t => {
      // Exclude hidden and pending if specified
      if (t.isHidden || t.pending) return false;
      
      // Exclude transfers
      if (t.categoryId && isTransferCategory(t.categoryId)) return false;
      
      // Income = negative amounts in Plaid
      return t.amount < 0;
    })
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
}

/**
 * Calculate total expenses from transactions (excluding transfers)
 * Expenses = positive amounts that are not transfers
 * @param transactions Array of transactions to calculate from
 * @returns Total expense amount (positive value)
 */
export function calculateExpenses(transactions: TransactionForCalculation[]): number {
  return transactions
    .filter(t => {
      // Exclude hidden and pending if specified
      if (t.isHidden || t.pending) return false;
      
      // Exclude transfers
      if (t.categoryId && isTransferCategory(t.categoryId)) return false;
      
      // Expenses = positive amounts in Plaid
      return t.amount >= 0;
    })
    .reduce((sum, t) => sum + t.amount, 0);
}

/**
 * Calculate net cash flow (income - expenses, excluding transfers)
 * @param transactions Array of transactions to calculate from
 * @returns Net cash flow (positive = surplus, negative = deficit)
 */
export function calculateNetCashFlow(transactions: TransactionForCalculation[]): number {
  const income = calculateIncome(transactions);
  const expenses = calculateExpenses(transactions);
  return income - expenses;
}

/**
 * Calculate savings rate as percentage of income
 * @param transactions Array of transactions to calculate from
 * @returns Savings rate as percentage (0-100), or 0 if no income
 */
export function calculateSavingsRate(transactions: TransactionForCalculation[]): number {
  const income = calculateIncome(transactions);
  if (income === 0) return 0;
  
  const netFlow = calculateNetCashFlow(transactions);
  return (netFlow / income) * 100;
}

/**
 * Separate transactions into income, expenses, and transfers
 * @param transactions Array of transactions to categorize
 * @returns Object with separated transaction arrays
 */
export function categorizeTransactions(transactions: TransactionForCalculation[]) {
  const income: TransactionForCalculation[] = [];
  const expenses: TransactionForCalculation[] = [];
  const transfers: TransactionForCalculation[] = [];
  
  for (const txn of transactions) {
    // Skip hidden and pending
    if (txn.isHidden || txn.pending) continue;
    
    // Check if transfer
    if (txn.categoryId && isTransferCategory(txn.categoryId)) {
      transfers.push(txn);
    } else if (txn.amount < 0) {
      income.push(txn);
    } else {
      expenses.push(txn);
    }
  }
  
  return { income, expenses, transfers };
}

/**
 * Calculate totals for income, expenses, and transfers
 * @param transactions Array of transactions to calculate from
 * @returns Object with calculated totals
 */
export function calculateTransactionTotals(transactions: TransactionForCalculation[]) {
  const { income, expenses, transfers } = categorizeTransactions(transactions);
  
  return {
    totalIncome: income.reduce((sum, t) => sum + Math.abs(t.amount), 0),
    totalExpenses: expenses.reduce((sum, t) => sum + t.amount, 0),
    totalTransfersIn: transfers.filter(t => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0),
    totalTransfersOut: transfers.filter(t => t.amount >= 0).reduce((sum, t) => sum + t.amount, 0),
    netCashFlow: calculateNetCashFlow(transactions),
    savingsRate: calculateSavingsRate(transactions)
  };
}