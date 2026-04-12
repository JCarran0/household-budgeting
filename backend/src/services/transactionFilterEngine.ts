/**
 * Transaction Filter Engine
 *
 * Pure, stateless filtering pipeline for StoredTransaction arrays.
 * No class, no DataService dependency — takes data in, returns filtered data out.
 */

import { StoredTransaction, TransactionFilter, TransactionsResult } from './transactionService';
import { isTransferCategory } from '../shared/utils/categoryHelpers';
import { excludeRemoved } from './transactionReader';

/**
 * Apply filters to a list of transactions.
 *
 * Pure function — no side effects, no data access.
 * Reproduces the exact behavior of the former inline logic in
 * TransactionService.getTransactions(), including:
 *   - unfilteredTotal calculated after date/account/hidden but before
 *     category/tag/search/amount/type filters
 *   - includePending applied twice (base filter + secondary)
 *   - exactAmount uses Math.abs; minAmount/maxAmount use raw amount
 *   - Transfer detection via isTransferCategory()
 *   - Date descending sort
 */
export function filterTransactions(
  allTransactions: StoredTransaction[],
  filter: TransactionFilter = {}
): TransactionsResult {
  // Get base transactions (excluding removed and pending if not included)
  let baseTransactions = excludeRemoved(allTransactions);

  // Apply base filters that affect the total count
  if (!filter.includePending) {
    baseTransactions = baseTransactions.filter((txn: StoredTransaction) => !txn.pending);
  }

  let filtered = baseTransactions;

  // Apply date and account filters (these are part of the base query)
  if (filter.startDate) {
    filtered = filtered.filter((txn: StoredTransaction) => txn.date >= filter.startDate!);
  }

  if (filter.endDate) {
    filtered = filtered.filter((txn: StoredTransaction) => txn.date <= filter.endDate!);
  }

  if (filter.accountIds && filter.accountIds.length > 0) {
    filtered = filtered.filter((txn: StoredTransaction) => filter.accountIds!.includes(txn.accountId));
  }

  // Calculate total after date/account filters but before search/category/tag filters
  // This gives us the denominator for "Showing X of Y transactions"
  const totalBeforeSearchFilters = filter.includeHidden
    ? filtered.length
    : filtered.filter((txn: StoredTransaction) => !txn.isHidden).length;

  if (filter.categoryIds && filter.categoryIds.length > 0) {
    filtered = filtered.filter((txn: StoredTransaction) => {
      // Handle "uncategorized" special case first
      if (filter.categoryIds!.includes('uncategorized')) {
        // If uncategorized is selected, include transactions without categories
        if (!txn.categoryId) return true;
      }

      // For regular categories, check if the transaction's category is in the filter
      return txn.categoryId ? filter.categoryIds!.includes(txn.categoryId) : false;
    });
  }

  if (filter.tags && filter.tags.length > 0) {
    filtered = filtered.filter((txn: StoredTransaction) =>
      filter.tags!.some(tag => txn.tags.includes(tag))
    );
  }

  if (!filter.includePending) {
    filtered = filtered.filter((txn: StoredTransaction) => !txn.pending);
  }

  if (!filter.includeHidden) {
    filtered = filtered.filter((txn: StoredTransaction) => !txn.isHidden);
  }

  if (filter.onlyUncategorized) {
    filtered = filtered.filter((txn: StoredTransaction) => !txn.categoryId);
  }

  if (filter.onlyFlagged) {
    filtered = filtered.filter((txn: StoredTransaction) => txn.isFlagged);
  }

  // Handle exact amount search with tolerance
  if (filter.exactAmount !== undefined) {
    const tolerance = filter.amountTolerance || 0.50; // Default tolerance of $0.50
    const targetAmount = filter.exactAmount;
    filtered = filtered.filter((txn: StoredTransaction) => {
      const txnAmount = Math.abs(txn.amount);
      return txnAmount >= (targetAmount - tolerance) && txnAmount <= (targetAmount + tolerance);
    });
  } else {
    // Handle min/max range search (only if not doing exact search)
    if (filter.minAmount !== undefined) {
      filtered = filtered.filter((txn: StoredTransaction) => txn.amount >= filter.minAmount!);
    }

    if (filter.maxAmount !== undefined) {
      filtered = filtered.filter((txn: StoredTransaction) => txn.amount <= filter.maxAmount!);
    }
  }

  if (filter.searchQuery) {
    const query = filter.searchQuery.toLowerCase();
    filtered = filtered.filter((txn: StoredTransaction) =>
      txn.name.toLowerCase().includes(query) ||
      (txn.userDescription && txn.userDescription.toLowerCase().includes(query)) ||
      (txn.merchantName && txn.merchantName.toLowerCase().includes(query)) ||
      txn.tags.some(tag => tag.toLowerCase().includes(query)) ||
      (txn.notes && txn.notes.toLowerCase().includes(query))
    );
  }

  // Filter by income vs expense vs transfers
  if (filter.transactionType && filter.transactionType !== 'all') {
    filtered = filtered.filter((txn: StoredTransaction) => {
      // Check if this is a transfer transaction
      const isTransfer = txn.categoryId ? isTransferCategory(txn.categoryId) : false;

      if (filter.transactionType === 'transfer') {
        // Show only transfers
        return isTransfer;
      } else if (filter.transactionType === 'income' || filter.transactionType === 'expense') {
        // Exclude transfers from income/expense filters
        if (isTransfer) return false;

        // In Plaid, positive amounts are debits (expenses), negative amounts are credits (income)
        // Zero amounts are treated as expenses (non-income)
        const isExpense = txn.amount >= 0;
        return filter.transactionType === 'expense' ? isExpense : !isExpense;
      }

      return true;
    });
  }

  // Sort by date descending
  filtered.sort((a: StoredTransaction, b: StoredTransaction) => b.date.localeCompare(a.date));

  return {
    success: true,
    transactions: filtered,
    totalCount: filtered.length,
    unfilteredTotal: totalBeforeSearchFilters,
  };
}
