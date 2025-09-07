import {
  registerUser,
  authenticatedGet,
  authenticatedPost,
} from '../helpers/apiHelper';
import { authService, dataService, transactionService, budgetService, categoryService } from '../../services';
import { InMemoryDataService } from '../../services/dataService';
import { format, addMonths, startOfMonth } from 'date-fns';

/**
 * Budget Date Filtering Integration Tests
 * 
 * Integration Path: Tests the complete flow from frontend date calculation
 * to backend transaction filtering for budget vs actual calculations.
 * 
 * Critical Bug Prevention: Ensures monthly budget calculations don't include
 * transactions from the first day of the following month.
 * 
 * User Stories Covered:
 * - As a user, I can see accurate budget vs actual calculations
 * - As a user, I can filter transactions by date range correctly
 * - As a user, monthly budget comparisons only include that month's data
 */

describe('User Story: Budget Date Filtering Integration', () => {
  let testUserId: string;
  let authToken: string;
  
  beforeEach(async () => {
    // Clear all data
    if ('clear' in dataService) {
      (dataService as InMemoryDataService).clear();
    }
    
    // Reset rate limiting
    authService.resetRateLimiting();
    
    // Create test user and get auth token
    const username = `bdf${Math.random().toString(36).substring(2, 8)}`;
    const password = 'budget date filtering test passphrase';
    
    const result = await registerUser(username, password);
    authToken = result.token;
    testUserId = result.userId;
  });

  describe('As a user, monthly budget calculations must exclude next month transactions', () => {
    it('should only include current month transactions in budget comparison API', async () => {
      // Create mortgage payment category
      const category = await categoryService.createCategory({
        name: 'Mortgage Payment',
        parentId: null,
        isHidden: false,
        isSavings: false
      }, testUserId);
      
      // Create July 2025 budget
      await budgetService.createOrUpdateBudget({
        categoryId: category.id,
        month: '2025-07',
        amount: 2500
      }, testUserId);
      
      // Create transactions that simulate the bug scenario
      // Transaction on July 1st - should be included
      await transactionService.createTestTransaction({
        userId: testUserId,
        accountId: 'test-account-1',
        plaidTransactionId: 'july-mortgage-payment',
        plaidAccountId: 'plaid-account-1',
        amount: 2215.60,
        date: '2025-07-01', // July 1st
        name: 'KEYBANK NA LOAN PMT',
        userDescription: null,
        merchantName: null,
        category: ['LOAN_PAYMENTS', 'LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT'],
        plaidCategoryId: null,
        categoryId: category.id,
        status: 'posted' as const,
        pending: false,
        isoCurrencyCode: 'USD',
        tags: [],
        notes: null,
        isHidden: false,
        location: null
      });
      
      // Transaction on August 1st - should NOT be included in July calculations
      await transactionService.createTestTransaction({
        userId: testUserId,
        accountId: 'test-account-1',
        plaidTransactionId: 'august-mortgage-payment',
        plaidAccountId: 'plaid-account-1',
        amount: 2215.60,
        date: '2025-08-01', // August 1st - the boundary issue
        name: 'KEYBANK NA LOAN PMT',
        userDescription: null,
        merchantName: null,
        category: ['LOAN_PAYMENTS', 'LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT'],
        plaidCategoryId: null,
        categoryId: category.id,
        status: 'posted' as const,
        pending: false,
        isoCurrencyCode: 'USD',
        tags: [],
        notes: null,
        isHidden: false,
        location: null
      });
      
      // Test the fixed date range calculation (mimics frontend fix)
      const selectedDate = new Date('2025-07-15'); // July 2025
      const startDate = format(selectedDate, 'yyyy-MM-01'); // '2025-07-01'
      const endDate = format(addMonths(startOfMonth(selectedDate), 1).getTime() - 1, 'yyyy-MM-dd'); // '2025-07-31'
      
      // Fetch transactions with corrected date range
      const transactionResponse = await authenticatedGet('/api/v1/transactions', authToken, { 
        startDate,
        endDate,
        categoryIds: [category.id]
      });
      
      expect(transactionResponse.status).toBe(200);
      expect(transactionResponse.body.success).toBe(true);
      expect(transactionResponse.body.transactions).toHaveLength(1); // Only July transaction
      expect(transactionResponse.body.transactions[0].date).toBe('2025-07-01');
      expect(transactionResponse.body.transactions[0].amount).toBe(2215.60);
      
      // Calculate actuals from filtered transactions (mimics frontend calculation)
      const julyTransactions = transactionResponse.body.transactions;
      const actualsByCategory: Record<string, number> = {};
      julyTransactions.forEach((transaction: any) => {
        if (transaction.categoryId && !transaction.isHidden) {
          const amount = Math.abs(transaction.amount);
          actualsByCategory[transaction.categoryId] = 
            (actualsByCategory[transaction.categoryId] || 0) + amount;
        }
      });
      
      // Test budget comparison API with correct actuals
      const comparisonResponse = await authenticatedPost('/api/v1/budgets/comparison/2025-07', authToken, { actuals: actualsByCategory });
      
      expect(comparisonResponse.status).toBe(200);
      expect(comparisonResponse.body.comparisons).toHaveLength(1);
      
      const mortgageComparison = comparisonResponse.body.comparisons[0];
      expect(mortgageComparison.categoryId).toBe(category.id);
      expect(mortgageComparison.budgeted).toBe(2500);
      expect(mortgageComparison.actual).toBe(2215.60); // Single transaction, not doubled
      expect(mortgageComparison.remaining).toBeCloseTo(284.40, 2);
      expect(mortgageComparison.percentUsed).toBe(89);
      expect(mortgageComparison.isOverBudget).toBe(false);
    });
    
    it('should handle various month boundary scenarios correctly', async () => {
      // Test different month boundaries that could cause issues
      const testCases = [
        {
          month: '2025-02',
          description: 'February (28 days)',
          startDate: '2025-02-01',
          endDate: '2025-02-28',
          nextMonthDate: '2025-03-01'
        },
        {
          month: '2024-02', 
          description: 'February (leap year, 29 days)',
          startDate: '2024-02-01',
          endDate: '2024-02-29',
          nextMonthDate: '2024-03-01'
        },
        {
          month: '2025-12',
          description: 'December to January transition',
          startDate: '2025-12-01', 
          endDate: '2025-12-31',
          nextMonthDate: '2026-01-01'
        }
      ];
      
      const category = await categoryService.createCategory({
        name: 'Boundary Test Category',
        parentId: null,
        isHidden: false,
        isSavings: false
      }, testUserId);
      
      for (const testCase of testCases) {
        // Create budget for the month
        await budgetService.createOrUpdateBudget({
          categoryId: category.id,
          month: testCase.month,
          amount: 1000
        }, testUserId);
        
        // Create transaction on last day of month (should be included)
        await transactionService.createTestTransaction({
          userId: testUserId,
          accountId: 'test-account-boundary',
          plaidTransactionId: `${testCase.month}-last-day`,
          plaidAccountId: 'plaid-boundary-account',
          amount: 200,
          date: testCase.endDate,
          name: `Transaction on ${testCase.endDate}`,
          userDescription: null,
          merchantName: null,
          category: ['GENERAL_MERCHANDISE'],
          plaidCategoryId: null,
          categoryId: category.id,
          status: 'posted' as const,
          pending: false,
          isoCurrencyCode: 'USD',
          tags: [],
          notes: null,
          isHidden: false,
          location: null
        });
        
        // Create transaction on first day of next month (should NOT be included)
        await transactionService.createTestTransaction({
          userId: testUserId,
          accountId: 'test-account-boundary',
          plaidTransactionId: `${testCase.month}-next-month`,
          plaidAccountId: 'plaid-boundary-account',
          amount: 150,
          date: testCase.nextMonthDate,
          name: `Transaction on ${testCase.nextMonthDate}`,
          userDescription: null,
          merchantName: null,
          category: ['GENERAL_MERCHANDISE'],
          plaidCategoryId: null,
          categoryId: category.id,
          status: 'posted' as const,
          pending: false,
          isoCurrencyCode: 'USD',
          tags: [],
          notes: null,
          isHidden: false,
          location: null
        });
        
        // Test transaction filtering for the month
        const transactionResponse = await authenticatedGet('/api/v1/transactions', authToken, {
          startDate: testCase.startDate,
          endDate: testCase.endDate,
          categoryIds: [category.id]
        });
        
        expect(transactionResponse.status).toBe(200);
        expect(transactionResponse.body.transactions).toHaveLength(1);
        expect(transactionResponse.body.transactions[0].date).toBe(testCase.endDate);
        expect(transactionResponse.body.transactions[0].amount).toBe(200);
        
        // Test budget comparison only includes current month
        const actualsByCategory = { [category.id]: 200 }; // Only the included transaction
        
        const comparisonResponse = await authenticatedPost(`/api/v1/budgets/comparison/${testCase.month}`, authToken, { actuals: actualsByCategory });
        
        expect(comparisonResponse.status).toBe(200);
        const comparison = comparisonResponse.body.comparisons[0];
        expect(comparison.actual).toBe(200); // Only current month transaction
        expect(comparison.remaining).toBe(800); // 1000 - 200
        
        // Clean up for next test case
        await budgetService.deleteBudgetsByCategory(category.id, testUserId);
        // Note: We don't clean up transactions as they're isolated by date filters
      }
    });
    
    it('should handle timezone-independent date boundaries', async () => {
      // Test that date boundaries work regardless of system timezone
      const category = await categoryService.createCategory({
        name: 'Timezone Test Category',
        parentId: null,
        isHidden: false,
        isSavings: false
      }, testUserId);
      
      await budgetService.createOrUpdateBudget({
        categoryId: category.id,
        month: '2025-03',
        amount: 800
      }, testUserId);
      
      // Create transactions at exact boundary moments
      const boundaryTransactions = [
        { date: '2025-03-01', amount: 100, description: 'First moment of March' },
        { date: '2025-03-31', amount: 200, description: 'Last day of March' },
        { date: '2025-04-01', amount: 300, description: 'First moment of April (should be excluded)' }
      ];
      
      for (const [index, txn] of boundaryTransactions.entries()) {
        await transactionService.createTestTransaction({
          userId: testUserId,
          accountId: 'timezone-test-account',
          plaidTransactionId: `timezone-test-${index}`,
          plaidAccountId: 'timezone-plaid-account',
          amount: txn.amount,
          date: txn.date,
          name: txn.description,
          userDescription: null,
          merchantName: null,
          category: ['GENERAL_MERCHANDISE'],
          plaidCategoryId: null,
          categoryId: category.id,
          status: 'posted' as const,
          pending: false,
          isoCurrencyCode: 'USD',
          tags: [],
          notes: null,
          isHidden: false,
          location: null
        });
      }
      
      // Test March filtering (should include March 1st and 31st, exclude April 1st)
      const transactionResponse = await authenticatedGet('/api/v1/transactions', authToken, {
        startDate: '2025-03-01',
        endDate: '2025-03-31',
        categoryIds: [category.id]
      });
      
      expect(transactionResponse.status).toBe(200);
      expect(transactionResponse.body.transactions).toHaveLength(2); // March 1st and 31st only
      
      const marchTransactions = transactionResponse.body.transactions;
      const totalMarchAmount = marchTransactions.reduce((sum: number, txn: any) => sum + Math.abs(txn.amount), 0);
      expect(totalMarchAmount).toBe(300); // 100 + 200, not including April's 300
      
      // Verify budget comparison reflects correct boundary
      const comparisonResponse = await authenticatedPost('/api/v1/budgets/comparison/2025-03', authToken, { actuals: { [category.id]: totalMarchAmount } });
      
      expect(comparisonResponse.status).toBe(200);
      const comparison = comparisonResponse.body.comparisons[0];
      expect(comparison.actual).toBe(300); // Only March transactions
      expect(comparison.remaining).toBe(500); // 800 - 300
    });
  });
});