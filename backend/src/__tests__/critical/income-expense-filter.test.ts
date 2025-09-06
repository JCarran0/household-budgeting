/**
 * Critical Path Tests for Income vs Expense Transaction Filtering
 */

import request from 'supertest';
import app from '../../app';
import { authService, dataService } from '../../services';
import { StoredTransaction } from '../../services/transactionService';

describe('User Story: Income vs Expense Transaction Filtering', () => {
  let testUserId: string;
  let authToken: string;

  beforeAll(() => {
    // Use InMemoryDataService for testing
    (dataService as any).data = new Map();
    (dataService as any).clear = function() {
      this.data.clear();
    };
    
    // Reset rate limiting
    if ('resetRateLimiting' in authService) {
      (authService as any).resetRateLimiting();
    }
  });

  beforeEach(async () => {
    // Clear all data
    if ('clear' in dataService) {
      (dataService as any).clear();
    }
    
    // Reset rate limiting
    if ('resetRateLimiting' in authService) {
      (authService as any).resetRateLimiting();
    }
    
    // Create a test user
    const username = `testuser_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({
        username,
        password: 'this is my secure test passphrase',
      });
    
    if (response.status !== 201) {
      console.error('Registration failed:', response.body);
    }
    expect(response.status).toBe(201);
    authToken = response.body.token;
    testUserId = response.body.user.id;
  });

  describe('As a user, I can filter transactions by income vs expense', () => {

    beforeEach(async () => {
      // Create test transactions with various amounts
      // In Plaid, positive amounts are expenses (debits), negative amounts are income (credits)
      const testTransactions: StoredTransaction[] = [
        // Income transactions (negative amounts)
        {
          id: 'txn1',
          userId: testUserId,
          accountId: 'acc1',
          plaidTransactionId: 'plaid1',
          plaidAccountId: 'plaid_acc1',
          amount: -2500.00, // Salary income
          date: '2025-01-15',
          name: 'Direct Deposit Payroll',
          userDescription: null,
          merchantName: 'EMPLOYER INC',
          category: ['TRANSFER', 'DEPOSIT'],
          plaidCategoryId: 'TRANSFER_DEPOSIT',
          categoryId: 'TRANSFER_DEPOSIT',
          status: 'posted',
          pending: false,
          tags: [],
          notes: null,
          isHidden: false,
          isSplit: false,
          parentTransactionId: null,
          splitTransactionIds: [],
          isoCurrencyCode: 'USD',
          location: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'txn2',
          userId: testUserId,
          accountId: 'acc1',
          plaidTransactionId: 'plaid2',
          plaidAccountId: 'plaid_acc1',
          amount: -150.00, // Refund income
          date: '2025-01-10',
          name: 'Refund from Amazon',
          userDescription: null,
          merchantName: 'AMAZON',
          category: ['SHOPS', 'ONLINE'],
          plaidCategoryId: 'SHOPS_ONLINE',
          categoryId: 'SHOPS_ONLINE',
          status: 'posted',
          pending: false,
          tags: [],
          notes: null,
          isHidden: false,
          isSplit: false,
          parentTransactionId: null,
          splitTransactionIds: [],
          isoCurrencyCode: 'USD',
          location: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'txn3',
          userId: testUserId,
          accountId: 'acc1',
          plaidTransactionId: 'plaid3',
          plaidAccountId: 'plaid_acc1',
          amount: -75.00, // Cashback income
          date: '2025-01-05',
          name: 'Credit Card Rewards',
          userDescription: null,
          merchantName: 'CHASE REWARDS',
          category: ['BANK_FEES', 'REWARDS'],
          plaidCategoryId: 'BANK_FEES_REWARDS',
          categoryId: 'BANK_FEES_REWARDS',
          status: 'posted',
          pending: false,
          tags: [],
          notes: null,
          isHidden: false,
          isSplit: false,
          parentTransactionId: null,
          splitTransactionIds: [],
          isoCurrencyCode: 'USD',
          location: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        // Expense transactions (positive amounts)
        {
          id: 'txn4',
          userId: testUserId,
          accountId: 'acc1',
          plaidTransactionId: 'plaid4',
          plaidAccountId: 'plaid_acc1',
          amount: 150.00, // Restaurant expense
          date: '2025-01-12',
          name: 'The Italian Place',
          userDescription: null,
          merchantName: 'THE ITALIAN PLACE',
          category: ['FOOD_AND_DRINK', 'RESTAURANTS'],
          plaidCategoryId: 'FOOD_AND_DRINK_RESTAURANTS',
          categoryId: 'FOOD_AND_DRINK_RESTAURANTS',
          status: 'posted',
          pending: false,
          tags: ['dining'],
          notes: null,
          isHidden: false,
          isSplit: false,
          parentTransactionId: null,
          splitTransactionIds: [],
          isoCurrencyCode: 'USD',
          location: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'txn5',
          userId: testUserId,
          accountId: 'acc1',
          plaidTransactionId: 'plaid5',
          plaidAccountId: 'plaid_acc1',
          amount: 65.50, // Gas expense
          date: '2025-01-08',
          name: 'Shell Gas Station',
          userDescription: null,
          merchantName: 'SHELL',
          category: ['TRANSPORTATION', 'GAS'],
          plaidCategoryId: 'TRANSPORTATION_GAS',
          categoryId: 'TRANSPORTATION_GAS',
          status: 'posted',
          pending: false,
          tags: [],
          notes: null,
          isHidden: false,
          isSplit: false,
          parentTransactionId: null,
          splitTransactionIds: [],
          isoCurrencyCode: 'USD',
          location: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'txn6',
          userId: testUserId,
          accountId: 'acc1',
          plaidTransactionId: 'plaid6',
          plaidAccountId: 'plaid_acc1',
          amount: 1200.00, // Rent expense
          date: '2025-01-01',
          name: 'Monthly Rent Payment',
          userDescription: null,
          merchantName: 'PROPERTY MANAGEMENT',
          category: ['GENERAL_SERVICES', 'RENT'],
          plaidCategoryId: 'GENERAL_SERVICES_RENT',
          categoryId: 'GENERAL_SERVICES_RENT',
          status: 'posted',
          pending: false,
          tags: ['rent'],
          notes: null,
          isHidden: false,
          isSplit: false,
          parentTransactionId: null,
          splitTransactionIds: [],
          isoCurrencyCode: 'USD',
          location: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // Save test transactions to data service
      await dataService.saveData(`transactions_${testUserId}`, testTransactions);

      // Transactions created for testing
    });

    test('I can view all transactions when no filter is applied', async () => {
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.transactions).toHaveLength(6);
    });

    test('I can filter to see only income transactions', async () => {
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ transactionType: 'income' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.transactions).toHaveLength(3);
      
      // All returned transactions should be income (negative amounts)
      response.body.transactions.forEach((txn: StoredTransaction) => {
        expect(txn.amount).toBeLessThan(0);
      });
      
      // Should include all income transactions
      const returnedIds = response.body.transactions.map((t: StoredTransaction) => t.id);
      expect(returnedIds).toContain('txn1'); // Salary
      expect(returnedIds).toContain('txn2'); // Refund
      expect(returnedIds).toContain('txn3'); // Cashback
    });

    test('I can filter to see only expense transactions', async () => {
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ transactionType: 'expense' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.transactions).toHaveLength(3);
      
      // All returned transactions should be expenses (positive amounts)
      response.body.transactions.forEach((txn: StoredTransaction) => {
        expect(txn.amount).toBeGreaterThan(0);
      });
      
      // Should include all expense transactions
      const returnedIds = response.body.transactions.map((t: StoredTransaction) => t.id);
      expect(returnedIds).toContain('txn4'); // Restaurant
      expect(returnedIds).toContain('txn5'); // Gas
      expect(returnedIds).toContain('txn6'); // Rent
    });

    test('I can see all transactions when filter is set to "all"', async () => {
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ transactionType: 'all' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.transactions).toHaveLength(6);
    });

    test('Income/expense filter works with other filters', async () => {
      // Filter for income transactions in a specific date range
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ 
          transactionType: 'income',
          startDate: '2025-01-10',
          endDate: '2025-01-20'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.transactions).toHaveLength(2);
      
      // Should only include income transactions within date range
      const returnedIds = response.body.transactions.map((t: StoredTransaction) => t.id);
      expect(returnedIds).toContain('txn1'); // Salary on Jan 15
      expect(returnedIds).toContain('txn2'); // Refund on Jan 10
      expect(returnedIds).not.toContain('txn3'); // Cashback on Jan 5 (outside range)
    });

    test('Income/expense filter works with search queries', async () => {
      // Search for "payment" among expense transactions
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ 
          transactionType: 'expense',
          searchQuery: 'payment'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.transactions).toHaveLength(1);
      expect(response.body.transactions[0].id).toBe('txn6'); // Rent payment
    });

    test('Income/expense filter works with amount range filters', async () => {
      // Filter for high-value income (> $100)
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ 
          transactionType: 'income',
          minAmount: 100
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.transactions).toHaveLength(2);
      
      // Should include salary and refund (both > $100 in absolute value)
      const returnedIds = response.body.transactions.map((t: StoredTransaction) => t.id);
      expect(returnedIds).toContain('txn1'); // $2500 salary
      expect(returnedIds).toContain('txn2'); // $150 refund
      expect(returnedIds).not.toContain('txn3'); // $75 cashback (below threshold)
    });

    test('Invalid transaction type values are handled gracefully', async () => {
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ transactionType: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid');
    });
  });

  describe('Transaction type filter edge cases', () => {
    test('Zero-amount transactions are handled correctly', async () => {
      // Create a zero-amount transaction
      const zeroTransaction: StoredTransaction = {
        id: 'txn_zero',
        userId: testUserId,
        accountId: 'acc1',
        plaidTransactionId: 'plaid_zero',
        plaidAccountId: 'plaid_acc1',
        amount: 0,
        date: '2025-01-20',
        name: 'Zero Amount Transaction',
        userDescription: null,
        merchantName: 'TEST',
        category: ['OTHER'],
        plaidCategoryId: 'OTHER',
        categoryId: 'OTHER',
        status: 'posted',
        pending: false,
        tags: [],
        notes: null,
        isHidden: false,
        isSplit: false,
        parentTransactionId: null,
        splitTransactionIds: [],
        isoCurrencyCode: 'USD',
        location: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await dataService.saveData(`transactions_${testUserId}`, [zeroTransaction]);

      // Zero amount should be treated as expense (non-negative)
      const expenseResponse = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ transactionType: 'expense' });

      expect(expenseResponse.status).toBe(200);
      expect(expenseResponse.body.transactions).toHaveLength(1);
      expect(expenseResponse.body.transactions[0].id).toBe('txn_zero');

      // Should not appear in income filter
      const incomeResponse = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ transactionType: 'income' });

      expect(incomeResponse.status).toBe(200);
      expect(incomeResponse.body.transactions).toHaveLength(0);
    });
  });
});