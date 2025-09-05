/**
 * Transaction Categorization User Story Tests
 * 
 * Critical path tests for transaction categorization functionality
 * including inline category editing feature
 */

import {
  registerUser,
  authenticatedGet,
  authenticatedPost,
  authenticatedPut,
} from '../helpers/apiHelper';
import { authService, dataService, transactionService } from '../../services';
import { StoredTransaction } from '../../services/transactionService';

describe('User Story: Transaction Categorization', () => {
  let authToken: string;
  let userId: string;
  let groceryCategory: any;
  let diningCategory: any;
  let testTransaction: StoredTransaction;
  
  beforeEach(async () => {
    // Clear all test data
    if ('clear' in dataService) {
      (dataService as any).clear();
    }
    // Reset rate limiting between tests
    authService.resetRateLimiting();
    
    // Create a test user
    const rand = Math.random().toString(36).substring(2, 8);
    const user = await registerUser(`catuser${rand}`, 'secure categorization test passphrase');
    authToken = user.token;
    userId = user.userId;
    
    // Create test categories
    const groceryResponse = await authenticatedPost(
      '/api/v1/categories',
      authToken,
      {
        name: 'Groceries',
        parentId: null,
        isHidden: false,
        isSavings: false
      }
    );
    
    const diningResponse = await authenticatedPost(
      '/api/v1/categories',
      authToken,
      {
        name: 'Dining Out',
        parentId: null,
        isHidden: false,
        isSavings: false
      }
    );
    
    expect(groceryResponse.status).toBe(201);
    expect(diningResponse.status).toBe(201);
    
    groceryCategory = groceryResponse.body;
    diningCategory = diningResponse.body;
    
    // Create a test transaction
    testTransaction = {
      id: 'test-tx-001',
      userId: userId,
      accountId: 'test-account',
      plaidAccountId: 'plaid-account-123',
      plaidTransactionId: 'plaid-test-tx-001',
      amount: -50.00, // $50 expense
      date: '2025-01-15',
      name: 'Kroger',
      merchantName: 'Kroger',
      category: ['Shops', 'Groceries'],
      categoryId: '19013000',
      userCategoryId: groceryCategory.id, // Initially in groceries
      status: 'posted',
      pending: false,
      isoCurrencyCode: 'USD',
      tags: [],
      notes: null,
      isHidden: false,
      isSplit: false,
      parentTransactionId: null,
      splitTransactionIds: [],
      userDescription: null,
      location: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    await dataService.saveData(`transactions_${userId}`, [testTransaction]);
  });
  
  describe('As a user, I can update transaction categories inline', () => {
    test('I can update a transaction from one category to another', async () => {
      // Update transaction category via API
      const response = await authenticatedPut(
        `/api/v1/transactions/${testTransaction.id}/category`,
        authToken,
        { categoryId: diningCategory.id }
      );
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Verify the transaction was updated
      const transactions = await dataService.getData<StoredTransaction[]>(
        `transactions_${userId}`
      ) || [];
      const updatedTransaction = transactions.find(t => t.id === testTransaction.id);
      
      expect(updatedTransaction).toBeDefined();
      expect(updatedTransaction?.userCategoryId).toBe(diningCategory.id);
    });
    
    test('I can set a transaction to uncategorized by passing null', async () => {
      // Update transaction to uncategorized
      const response = await authenticatedPut(
        `/api/v1/transactions/${testTransaction.id}/category`,
        authToken,
        { categoryId: null }
      );
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Verify the transaction is now uncategorized
      const transactions = await dataService.getData<StoredTransaction[]>(
        `transactions_${userId}`
      ) || [];
      const updatedTransaction = transactions.find(t => t.id === testTransaction.id);
      
      expect(updatedTransaction).toBeDefined();
      expect(updatedTransaction?.userCategoryId).toBeNull();
    });
    
    test('I can update an uncategorized transaction to have a category', async () => {
      // First, set transaction to uncategorized
      await transactionService.updateTransactionCategory(
        userId,
        testTransaction.id,
        null
      );
      
      // Now update it to have a category
      const response = await authenticatedPut(
        `/api/v1/transactions/${testTransaction.id}/category`,
        authToken,
        { categoryId: diningCategory.id }
      );
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Verify the transaction now has the category
      const transactions = await dataService.getData<StoredTransaction[]>(
        `transactions_${userId}`
      ) || [];
      const updatedTransaction = transactions.find(t => t.id === testTransaction.id);
      
      expect(updatedTransaction).toBeDefined();
      expect(updatedTransaction?.userCategoryId).toBe(diningCategory.id);
    });
    
    test('I get an error when updating a non-existent transaction', async () => {
      const response = await authenticatedPut(
        `/api/v1/transactions/non-existent-tx/category`,
        authToken,
        { categoryId: groceryCategory.id }
      );
      
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });
    
    test('I cannot update another user\'s transaction category', async () => {
      // Create another user
      const otherUser = await registerUser('otheruser123', 'other user passphrase test');
      
      // Try to update our transaction with the other user's token
      const response = await authenticatedPut(
        `/api/v1/transactions/${testTransaction.id}/category`,
        otherUser.token,
        { categoryId: diningCategory.id }
      );
      
      // Should not find the transaction since it belongs to a different user
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      
      // Verify our transaction wasn't changed
      const transactions = await dataService.getData<StoredTransaction[]>(
        `transactions_${userId}`
      ) || [];
      const unchangedTransaction = transactions.find(t => t.id === testTransaction.id);
      
      expect(unchangedTransaction?.userCategoryId).toBe(groceryCategory.id);
    });
    
    test('Category update accepts string or null but not undefined', async () => {
      // Valid: string category ID
      let response = await authenticatedPut(
        `/api/v1/transactions/${testTransaction.id}/category`,
        authToken,
        { categoryId: diningCategory.id }
      );
      expect(response.status).toBe(200);
      
      // Valid: null for uncategorized
      response = await authenticatedPut(
        `/api/v1/transactions/${testTransaction.id}/category`,
        authToken,
        { categoryId: null }
      );
      expect(response.status).toBe(200);
      
      // Invalid: missing categoryId field
      response = await authenticatedPut(
        `/api/v1/transactions/${testTransaction.id}/category`,
        authToken,
        {}
      );
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid request data');
    });
  });
  
  describe('As a user, transaction categorization affects budget calculations', () => {
    test('Changing category updates transaction data correctly', async () => {
      // Create budgets for both categories
      const groceryBudgetResponse = await authenticatedPost(
        '/api/v1/budgets',
        authToken,
        {
          categoryId: groceryCategory.id,
          month: '2025-01',
          amount: 500
        }
      );
      
      const diningBudgetResponse = await authenticatedPost(
        '/api/v1/budgets',
        authToken,
        {
          categoryId: diningCategory.id,
          month: '2025-01',
          amount: 200
        }
      );
      
      expect(groceryBudgetResponse.status).toBe(201);
      expect(diningBudgetResponse.status).toBe(201);
      
      // Move transaction from grocery to dining
      const updateResponse = await authenticatedPut(
        `/api/v1/transactions/${testTransaction.id}/category`,
        authToken,
        { categoryId: diningCategory.id }
      );
      
      expect(updateResponse.status).toBe(200);
      
      // Verify the transaction was updated correctly
      const transactions = await dataService.getData<StoredTransaction[]>(
        `transactions_${userId}`
      ) || [];
      const updatedTransaction = transactions.find(t => t.id === testTransaction.id);
      
      expect(updatedTransaction).toBeDefined();
      expect(updatedTransaction?.userCategoryId).toBe(diningCategory.id);
    });
    
    test('Setting category to null excludes transaction from categorized transactions', async () => {
      // Create budget for grocery category
      const budgetResponse = await authenticatedPost(
        '/api/v1/budgets',
        authToken,
        {
          categoryId: groceryCategory.id,
          month: '2025-01',
          amount: 500
        }
      );
      
      expect(budgetResponse.status).toBe(201);
      
      // Initially transaction is in grocery category
      let transactions = await dataService.getData<StoredTransaction[]>(
        `transactions_${userId}`
      ) || [];
      let transaction = transactions.find(t => t.id === testTransaction.id);
      expect(transaction?.userCategoryId).toBe(groceryCategory.id);
      
      // Set transaction to uncategorized (null)
      const updateResponse = await authenticatedPut(
        `/api/v1/transactions/${testTransaction.id}/category`,
        authToken,
        { categoryId: null }
      );
      
      expect(updateResponse.status).toBe(200);
      
      // Transaction should now be uncategorized
      transactions = await dataService.getData<StoredTransaction[]>(
        `transactions_${userId}`
      ) || [];
      transaction = transactions.find(t => t.id === testTransaction.id);
      expect(transaction?.userCategoryId).toBeNull();
    });
  });
  
  describe('As a user, uncategorized count updates when I categorize transactions', () => {
    test('Uncategorized count decreases when I categorize a transaction', async () => {
      // Create an uncategorized transaction
      const uncategorizedTx: StoredTransaction = {
        ...testTransaction,
        id: 'uncategorized-tx-001',
        userCategoryId: null,
        name: 'Unknown Store',
      };
      
      const existingTransactions = await dataService.getData<StoredTransaction[]>(
        `transactions_${userId}`
      ) || [];
      
      await dataService.saveData(
        `transactions_${userId}`,
        [...existingTransactions, uncategorizedTx]
      );
      
      // Get initial uncategorized count
      let countResponse = await authenticatedGet(
        '/api/v1/transactions/uncategorized/count',
        authToken
      );
      
      expect(countResponse.status).toBe(200);
      const initialCount = countResponse.body.count;
      expect(initialCount).toBeGreaterThan(0);
      
      // Categorize the transaction
      const updateResponse = await authenticatedPut(
        `/api/v1/transactions/uncategorized-tx-001/category`,
        authToken,
        { categoryId: groceryCategory.id }
      );
      
      expect(updateResponse.status).toBe(200);
      
      // Get updated count
      countResponse = await authenticatedGet(
        '/api/v1/transactions/uncategorized/count',
        authToken
      );
      
      expect(countResponse.body.count).toBe(initialCount - 1);
    });
    
    test('Uncategorized count increases when I remove category from a transaction', async () => {
      // Get initial uncategorized count
      let countResponse = await authenticatedGet(
        '/api/v1/transactions/uncategorized/count',
        authToken
      );
      
      const initialCount = countResponse.body.count;
      
      // Remove category from our test transaction (set to null)
      const updateResponse = await authenticatedPut(
        `/api/v1/transactions/${testTransaction.id}/category`,
        authToken,
        { categoryId: null }
      );
      
      expect(updateResponse.status).toBe(200);
      
      // Get updated count
      countResponse = await authenticatedGet(
        '/api/v1/transactions/uncategorized/count',
        authToken
      );
      
      expect(countResponse.body.count).toBe(initialCount + 1);
    });
  });
});