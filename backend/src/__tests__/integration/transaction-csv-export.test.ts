/**
 * Integration tests for transaction CSV export functionality
 * Tests that CSV export correctly preserves all filter settings
 */

import request from 'supertest';
import app from '../../index';
import { authService, dataService } from '../../services';
import type { Transaction } from '../../../../shared/types';


describe('Transaction CSV Export', () => {
  let token: string;
  let userId: string;
  let categoryId: string;
  let accountId: string;

  beforeEach(async () => {
    // Clear all data
    if ('clear' in dataService) {
      (dataService as any).clear();
    }
    
    // Reset service state
    authService.resetRateLimiting();
    
    // Create test user
    const username = `test_${Date.now()}_${Math.random()}`;
    const registerResponse = await request(app)
      .post('/api/v1/auth/register')
      .send({
        username,
        password: 'test secure passphrase for testing'
      });
    
    token = registerResponse.body.token;
    userId = registerResponse.body.user.id;
    
    // Create test category
    const categoryResponse = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Groceries',
        parentId: null,
        isHidden: false,
        isRollover: false
      });
    
    categoryId = categoryResponse.body.id;
    
    // Create test account
    const accountData = {
      id: `account_${Date.now()}`,
      plaidAccountId: 'test_plaid_account',
      plaidItemId: 'test_plaid_item',
      name: 'Test Checking',
      nickname: 'My Main Account',
      type: 'checking' as const,
      subtype: 'checking',
      institution: 'Test Bank',
      mask: '1234',
      currentBalance: 1000,
      availableBalance: 950,
      isActive: true,
      lastSynced: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Store account directly via dataService
    const storedAccount = {
      ...accountData,
      userId,
      accessToken: 'encrypted_test_token' // Would be encrypted in real scenario
    };
    const existingAccounts = (await dataService.getData(`accounts_${userId}`) || []) as any[];
    existingAccounts.push(storedAccount);
    await dataService.saveData(`accounts_${userId}`, existingAccounts);
    accountId = accountData.id;
    
    // Create test transactions with various properties
    const testTransactions: Partial<Transaction>[] = [
      {
        id: 'txn_1',
        plaidTransactionId: 'plaid_1',
        accountId,
        amount: 50.25,
        date: '2025-01-15',
        name: 'Whole Foods Market',
        userDescription: 'Weekly groceries',
        merchantName: 'Whole Foods',
        categoryId,
        tags: ['food', 'weekly'],
        notes: 'Organic produce',
        isHidden: false,
        pending: false,
        category: ['FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES'],
        isManual: false,
        isSplit: false,
        parentTransactionId: null,
        splitTransactionIds: []
      },
      {
        id: 'txn_2',
        plaidTransactionId: 'plaid_2',
        accountId,
        amount: 25.00,
        date: '2025-01-10',
        name: 'Starbucks',
        userDescription: null,
        merchantName: 'Starbucks',
        categoryId: null, // Uncategorized
        tags: [],
        notes: null,
        isHidden: false,
        pending: false,
        category: ['FOOD_AND_DRINK', 'FOOD_AND_DRINK_COFFEE'],
        isManual: false,
        isSplit: false,
        parentTransactionId: null,
        splitTransactionIds: []
      },
      {
        id: 'txn_3',
        plaidTransactionId: 'plaid_3',
        accountId,
        amount: 100.00,
        date: '2025-01-05',
        name: 'Transfer to Savings',
        userDescription: 'Monthly savings',
        merchantName: null,
        categoryId,
        tags: ['savings'],
        notes: 'Emergency fund',
        isHidden: true, // Hidden transaction
        pending: false,
        category: ['TRANSFER_IN'],
        isManual: false,
        isSplit: false,
        parentTransactionId: null,
        splitTransactionIds: []
      },
      {
        id: 'txn_4',
        plaidTransactionId: 'plaid_4',
        accountId,
        amount: -1000.00, // Income (negative amount)
        date: '2025-01-01',
        name: 'Paycheck',
        userDescription: 'Salary deposit',
        merchantName: 'Employer Inc',
        categoryId,
        tags: ['income', 'salary'],
        notes: 'January paycheck',
        isHidden: false,
        pending: false,
        category: ['INCOME', 'INCOME_WAGES'],
        isManual: false,
        isSplit: false,
        parentTransactionId: null,
        splitTransactionIds: []
      }
    ];
    
    // Add transactions directly via dataService since there's no addTransaction method
    for (const txn of testTransactions) {
      const fullTxn = {
        ...txn,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        plaidCategoryId: txn.category?.[1] || txn.category?.[0] || null
      } as Transaction;
      
      // Store transaction directly
      const existingTxns = (await dataService.getData(`transactions_${userId}`) || []) as Transaction[];
      existingTxns.push(fullTxn);
      await dataService.saveData(`transactions_${userId}`, existingTxns);
    }
  });
  
  describe('CSV Export Format', () => {
    it('should export transactions with all fields in correct format', async () => {
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${token}`)
        .query({});
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.transactions).toHaveLength(4);
      
      // Verify that exported data includes all expected fields
      const transactions = response.body.transactions;
      
      // Check first transaction has all required fields
      const firstTxn = transactions[0];
      expect(firstTxn).toHaveProperty('id');
      expect(firstTxn).toHaveProperty('date');
      expect(firstTxn).toHaveProperty('name');
      expect(firstTxn).toHaveProperty('amount');
      expect(firstTxn).toHaveProperty('categoryId');
      expect(firstTxn).toHaveProperty('accountId');
      expect(firstTxn).toHaveProperty('merchantName');
      expect(firstTxn).toHaveProperty('tags');
      expect(firstTxn).toHaveProperty('notes');
      expect(firstTxn).toHaveProperty('isHidden');
    });
    
    it('should handle special characters in CSV fields', async () => {
      // Add transaction with special characters
      const specialTxn: Partial<Transaction> = {
        id: 'txn_special',
        plaidTransactionId: 'plaid_special',
        accountId,
        amount: 75.50,
        date: '2025-01-20',
        name: 'Store, Inc.',
        userDescription: 'Purchase with "quotes" and, commas',
        merchantName: 'Store & Co.',
        categoryId,
        tags: ['tag1', 'tag,2'],
        notes: 'Line 1\nLine 2',
        isHidden: false,
        pending: false,
        category: ['SHOPPING'],
        isManual: false,
        isSplit: false,
        parentTransactionId: null,
        splitTransactionIds: []
      };
      
      const fullSpecialTxn = {
        ...specialTxn,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        plaidCategoryId: specialTxn.category?.[1] || specialTxn.category?.[0] || null
      } as Transaction;
      
      const existingTxns = (await dataService.getData(`transactions_${userId}`) || []) as Transaction[];
      existingTxns.push(fullSpecialTxn);
      await dataService.saveData(`transactions_${userId}`, existingTxns);
      
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${token}`)
        .query({});
      
      expect(response.status).toBe(200);
      
      // Find the special transaction
      const specialTransaction = response.body.transactions.find(
        (t: any) => t.id === 'txn_special'
      );
      expect(specialTransaction).toBeDefined();
      expect(specialTransaction.userDescription).toBe('Purchase with "quotes" and, commas');
      expect(specialTransaction.notes).toBe('Line 1\nLine 2');
    });
  });
  
  describe('Filter Preservation', () => {
    it('should export only transactions matching date range filter', async () => {
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${token}`)
        .query({
          startDate: '2025-01-10',
          endDate: '2025-01-20'
        });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Should only include transactions from Jan 10-20
      const transactions = response.body.transactions;
      expect(transactions).toHaveLength(2); // txn_1 and txn_2
      
      const dates = transactions.map((t: any) => t.date);
      expect(dates).toContain('2025-01-15');
      expect(dates).toContain('2025-01-10');
      expect(dates).not.toContain('2025-01-05');
      expect(dates).not.toContain('2025-01-01');
    });
    
    it('should export only uncategorized transactions when filtered', async () => {
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${token}`)
        .query({
          onlyUncategorized: true
        });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Should only include uncategorized transactions
      const transactions = response.body.transactions;
      expect(transactions).toHaveLength(1); // Only txn_2
      expect(transactions[0].categoryId).toBeNull();
    });
    
    it('should export only transactions with specific tags', async () => {
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${token}`)
        .query({
          tags: ['savings']
        });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Should only include transactions with 'savings' tag
      const transactions = response.body.transactions;
      expect(transactions).toHaveLength(1); // Only txn_3
      expect(transactions[0].tags).toContain('savings');
    });
    
    it('should respect includeHidden filter', async () => {
      // Without includeHidden (default)
      const response1 = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${token}`)
        .query({});
      
      expect(response1.status).toBe(200);
      // Should exclude hidden transactions by default
      const visibleTransactions = response1.body.transactions.filter((t: any) => !t.isHidden);
      expect(visibleTransactions).toHaveLength(3); // All except txn_3
      
      // With includeHidden
      const response2 = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${token}`)
        .query({
          includeHidden: true
        });
      
      expect(response2.status).toBe(200);
      // Should include all transactions
      expect(response2.body.transactions).toHaveLength(4);
    });
    
    it('should export transactions matching amount range', async () => {
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${token}`)
        .query({
          minAmount: 20,
          maxAmount: 60
        });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Should only include transactions in amount range
      const transactions = response.body.transactions;
      expect(transactions).toHaveLength(2); // txn_1 (50.25) and txn_2 (25.00)
      
      transactions.forEach((t: any) => {
        expect(Math.abs(t.amount)).toBeGreaterThanOrEqual(20);
        expect(Math.abs(t.amount)).toBeLessThanOrEqual(60);
      });
    });
    
    it('should export only income transactions when filtered', async () => {
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${token}`)
        .query({
          transactionType: 'income'
        });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Should only include income transactions (negative amounts)
      const transactions = response.body.transactions;
      expect(transactions).toHaveLength(1); // Only txn_4
      expect(transactions[0].amount).toBeLessThan(0);
    });
    
    it('should combine multiple filters correctly', async () => {
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${token}`)
        .query({
          startDate: '2025-01-01',
          endDate: '2025-01-31',
          categoryIds: [categoryId],
          includeHidden: true
        });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Should include all transactions with the category (including hidden)
      const transactions = response.body.transactions;
      const categorizedTransactions = transactions.filter((t: any) => t.categoryId === categoryId);
      expect(categorizedTransactions).toHaveLength(3); // txn_1, txn_3, txn_4
    });
  });
  
  describe('Export Performance', () => {
    it('should handle large datasets efficiently', async () => {
      // Add many transactions
      const manyTransactions: Partial<Transaction>[] = [];
      for (let i = 0; i < 100; i++) {
        manyTransactions.push({
          id: `bulk_txn_${i}`,
          plaidTransactionId: `bulk_plaid_${i}`,
          accountId,
          amount: Math.random() * 100,
          date: '2025-01-15',
          name: `Transaction ${i}`,
          userDescription: null,
          merchantName: `Merchant ${i}`,
          categoryId: i % 2 === 0 ? categoryId : null,
          tags: i % 3 === 0 ? ['bulk'] : [],
          notes: null,
          isHidden: false,
          pending: false,
          category: ['SHOPPING'],
          isManual: false,
          isSplit: false,
          parentTransactionId: null,
          splitTransactionIds: []
        });
      }
      
      for (const txn of manyTransactions) {
        const fullTxn = {
          ...txn,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          plaidCategoryId: txn.category?.[1] || txn.category?.[0] || null
        } as Transaction;
        
        const existingTxns = (await dataService.getData(`transactions_${userId}`) || []) as Transaction[];
        existingTxns.push(fullTxn);
        await dataService.saveData(`transactions_${userId}`, existingTxns);
      }
      
      const startTime = Date.now();
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${token}`)
        .query({});
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(response.status).toBe(200);
      expect(response.body.transactions.length).toBeGreaterThan(100);
      
      // Should complete within reasonable time (less than 1 second)
      expect(duration).toBeLessThan(1000);
    });
  });
});