/**
 * Transfer Filter Test
 * Tests that transfer transactions are properly filtered from income/expense views
 */

import { isTransferCategory } from '../../shared/utils/categoryHelpers';

describe('Transfer Category Detection', () => {
  describe('isTransferCategory', () => {
    it('should identify TRANSFER_IN as a transfer', () => {
      expect(isTransferCategory('TRANSFER_IN')).toBe(true);
    });

    it('should identify TRANSFER_OUT as a transfer', () => {
      expect(isTransferCategory('TRANSFER_OUT')).toBe(true);
    });

    it('should identify TRANSFER_IN subcategories as transfers', () => {
      expect(isTransferCategory('TRANSFER_IN_DEPOSIT')).toBe(true);
      expect(isTransferCategory('TRANSFER_IN_CASH_ADVANCES_AND_LOANS')).toBe(true);
      expect(isTransferCategory('TRANSFER_IN_SAVINGS')).toBe(true);
    });

    it('should identify TRANSFER_OUT subcategories as transfers', () => {
      expect(isTransferCategory('TRANSFER_OUT_WITHDRAWAL')).toBe(true);
      expect(isTransferCategory('TRANSFER_OUT_SAVINGS')).toBe(true);
      expect(isTransferCategory('TRANSFER_OUT_ACCOUNT_TRANSFER')).toBe(true);
    });

    it('should not identify income categories as transfers', () => {
      expect(isTransferCategory('INCOME')).toBe(false);
      expect(isTransferCategory('INCOME_WAGES')).toBe(false);
      expect(isTransferCategory('INCOME_DIVIDENDS')).toBe(false);
    });

    it('should not identify expense categories as transfers', () => {
      expect(isTransferCategory('FOOD_AND_DRINK')).toBe(false);
      expect(isTransferCategory('GENERAL_MERCHANDISE')).toBe(false);
      expect(isTransferCategory('TRANSPORTATION')).toBe(false);
    });

    it('should not identify null/undefined as transfers', () => {
      expect(isTransferCategory('')).toBe(false);
    });
  });
});

describe('Transaction Type Filtering', () => {
  const mockTransactions = [
    { id: '1', amount: 100, categoryId: 'FOOD_AND_DRINK' }, // Expense
    { id: '2', amount: -2000, categoryId: 'INCOME_WAGES' }, // Income
    { id: '3', amount: 500, categoryId: 'TRANSFER_OUT_SAVINGS' }, // Transfer out
    { id: '4', amount: -1000, categoryId: 'TRANSFER_IN_DEPOSIT' }, // Transfer in
    { id: '5', amount: 50, categoryId: null }, // Uncategorized expense
    { id: '6', amount: -100, categoryId: null }, // Uncategorized income
  ];

  describe('Income filter', () => {
    it('should include only non-transfer negative amounts', () => {
      const filtered = mockTransactions.filter((txn) => {
        const isTransfer = txn.categoryId ? isTransferCategory(txn.categoryId) : false;
        if (isTransfer) return false;
        return txn.amount < 0; // Negative amounts are income in Plaid
      });

      expect(filtered).toHaveLength(2);
      expect(filtered.map(t => t.id)).toEqual(['2', '6']);
    });
  });

  describe('Expense filter', () => {
    it('should include only non-transfer positive amounts', () => {
      const filtered = mockTransactions.filter((txn) => {
        const isTransfer = txn.categoryId ? isTransferCategory(txn.categoryId) : false;
        if (isTransfer) return false;
        return txn.amount >= 0; // Positive amounts are expenses in Plaid
      });

      expect(filtered).toHaveLength(2);
      expect(filtered.map(t => t.id)).toEqual(['1', '5']);
    });
  });

  describe('Transfer filter', () => {
    it('should include only transfer transactions', () => {
      const filtered = mockTransactions.filter((txn) => {
        return txn.categoryId ? isTransferCategory(txn.categoryId) : false;
      });

      expect(filtered).toHaveLength(2);
      expect(filtered.map(t => t.id)).toEqual(['3', '4']);
    });
  });

  describe('All filter', () => {
    it('should include all transactions', () => {
      const filtered = mockTransactions; // No filtering
      expect(filtered).toHaveLength(6);
    });
  });
});