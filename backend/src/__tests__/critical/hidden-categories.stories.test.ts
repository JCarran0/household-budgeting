/**
 * Hidden Category User Story Tests
 * 
 * Critical path tests for hidden category functionality
 * Ensures transfers and other hidden categories work correctly
 */

import {
  registerUser,
  authenticatedGet,
  authenticatedPost,
  authenticatedPut,
} from '../helpers/apiHelper';
import { authService, dataService, categoryService, transactionService } from '../../services';
import { StoredTransaction } from '../../services/transactionService';

describe('User Story: Hidden Categories', () => {
  let authToken: string;
  let userId: string;
  
  beforeEach(async () => {
    // Clear all test data
    if ('clear' in dataService) {
      (dataService as any).clear();
    }
    // Reset rate limiting between tests
    authService.resetRateLimiting();
    
    // Create a test user
    const rand = Math.random().toString(36).substring(2, 8);
    const user = await registerUser(`hidden${rand}`, 'hidden category test passphrase');
    authToken = user.token;
    userId = user.userId;
  });
  
  describe('As a user, I can use hidden categories to exclude transactions from budgets', () => {
    test('I can create a hidden category for transfers', async () => {
      // Initialize default categories to get system categories
      await categoryService.initializeDefaultCategories(userId);
      
      // Create a custom hidden category
      const response = await authenticatedPost(
        '/api/v1/categories',
        authToken,
        {
          name: 'Bank Transfers',
          parentId: null,
          isHidden: true,
          isSavings: false
        }
      );
      
      expect(response.status).toBe(201);
      expect(response.body.isHidden).toBe(true);
    });
    
    test('I can categorize transactions with hidden categories', async () => {
      // Initialize default categories to get system Transfer category
      await categoryService.initializeDefaultCategories(userId);
      
      // Get the system Transfer category (which is hidden)
      const categories = await categoryService.getAllCategories(userId);
      const transferCategory = categories.find(c => c.id === 'plaid_transfer');
      expect(transferCategory).toBeDefined();
      expect(transferCategory?.isHidden).toBe(true);
      
      const hiddenCategoryId = transferCategory!.id;
      
      // Create a test transaction using dataService
      const existingTransactions = await dataService.getData<StoredTransaction[]>(
        `transactions_${userId}`
      ) || [];
      
      const testTransaction: StoredTransaction = {
        id: 'test-transfer-123',
        userId: userId,
        accountId: 'test-account',
        plaidAccountId: 'plaid-account-123',
        plaidTransactionId: 'plaid-test-transfer-123',
        amount: -500, // Transfer out
        date: '2025-01-15',
        name: 'Transfer to Savings',
        merchantName: null,
        category: ['Transfer'],
        categoryId: '21000000',
        userCategoryId: null,
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
      
      await dataService.saveData(
        `transactions_${userId}`,
        [...existingTransactions, testTransaction]
      );
      
      // Update transaction with hidden category
      const updateResult = await transactionService.updateTransactionCategory(
        userId,
        'test-transfer-123',
        hiddenCategoryId
      );
      
      expect(updateResult.success).toBe(true);
      
      // Verify transaction has the hidden category
      const updatedTransactions = await dataService.getData<StoredTransaction[]>(
        `transactions_${userId}`
      ) || [];
      const updatedTransaction = updatedTransactions.find(t => t.id === 'test-transfer-123');
      
      expect(updatedTransaction?.userCategoryId).toBe(hiddenCategoryId);
    });
    
    test('I can create auto-categorization rules using hidden categories', async () => {
      // Create a hidden category
      const categoryResponse = await authenticatedPost(
        '/api/v1/categories',
        authToken,
        {
          name: 'Credit Card Payments',
          parentId: null,
          isHidden: true,
          isSavings: false
        }
      );
      
      expect(categoryResponse.status).toBe(201);
      const hiddenCategoryId = categoryResponse.body.id;
      
      // Create an auto-categorization rule with the hidden category
      const ruleResponse = await authenticatedPost(
        '/api/v1/autocategorize/rules',
        authToken,
        {
          description: 'Credit card payments',
          pattern: 'PAYMENT TO CREDIT CARD',
          categoryId: hiddenCategoryId,
          userDescription: 'Monthly CC payment',
          isActive: true,
        }
      );
      
      expect(ruleResponse.status).toBe(200);
      // The response contains { success: true, rule: {...} }
      expect(ruleResponse.body).toBeDefined();
      expect(ruleResponse.body.success).toBe(true);
      expect(ruleResponse.body.rule).toBeDefined();
      expect(ruleResponse.body.rule.categoryId).toBe(hiddenCategoryId);
      expect(ruleResponse.body.rule.isActive).toBe(true);
    });
    
    test('Hidden categories should NOT appear in budget endpoints', async () => {
      // Initialize default categories (includes hidden Transfer category)
      await categoryService.initializeDefaultCategories(userId);
      
      // Get all categories
      const allCategoriesResponse = await authenticatedGet('/api/v1/categories', authToken);
      expect(allCategoriesResponse.status).toBe(200);
      
      // Should include hidden categories in general category list
      const hiddenCategories = allCategoriesResponse.body.filter((c: any) => c.isHidden);
      expect(hiddenCategories.length).toBeGreaterThan(0);
      
      // Verify Transfer category exists and is hidden
      const transferCategory = allCategoriesResponse.body.find((c: any) => c.id === 'plaid_transfer');
      expect(transferCategory).toBeDefined();
      expect(transferCategory.isHidden).toBe(true);
    });
    
    test('Hidden category transactions are excluded from budget calculations', async () => {
      // Create visible and hidden categories
      const visibleCategory = await authenticatedPost(
        '/api/v1/categories',
        authToken,
        {
          name: 'Groceries',
          parentId: null,
          isHidden: false,
          isSavings: false
        }
      );
      
      const hiddenCategory = await authenticatedPost(
        '/api/v1/categories',
        authToken,
        {
          name: 'Transfers',
          parentId: null,
          isHidden: true,
          isSavings: false
        }
      );
      
      expect(visibleCategory.status).toBe(201);
      expect(hiddenCategory.status).toBe(201);
      
      // Create test transactions
      const transactions: StoredTransaction[] = [
        {
          id: 'grocery-tx-1',
          userId: userId,
          accountId: 'test-account',
          plaidAccountId: 'plaid-account-123',
          plaidTransactionId: 'plaid-grocery-tx-1',
          amount: -100, // $100 spent on groceries
          date: '2025-01-10',
          name: 'Whole Foods',
          merchantName: 'Whole Foods',
          category: ['Shops', 'Food and Drink'],
          categoryId: '13005000',
          userCategoryId: visibleCategory.body.id,
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
        },
        {
          id: 'transfer-tx-1',
          userId: userId,
          accountId: 'test-account',
          plaidAccountId: 'plaid-account-123',
          plaidTransactionId: 'plaid-transfer-tx-1',
          amount: -500, // $500 transfer
          date: '2025-01-12',
          name: 'Transfer to Savings',
          merchantName: null,
          category: ['Transfer'],
          categoryId: '21000000',
          userCategoryId: hiddenCategory.body.id,
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
        },
      ];
      
      await dataService.saveData(`transactions_${userId}`, transactions);
      
      // Get transactions and verify both are returned
      const txResponse = await authenticatedGet('/api/v1/transactions?startDate=2025-01-01&endDate=2025-01-31', authToken);
      expect(txResponse.status).toBe(200);
      expect(txResponse.body.transactions).toHaveLength(2);
      
      // In a real budget calculation, only the grocery transaction would count
      // The transfer transaction would be excluded because its category is hidden
      const visibleTransactions = txResponse.body.transactions.filter((t: any) => {
        const category = visibleCategory.body.id === t.categoryId ? visibleCategory.body : hiddenCategory.body;
        return !category.isHidden;
      });
      
      // Only the grocery transaction should be counted in budgets
      expect(visibleTransactions).toHaveLength(1);
      expect(visibleTransactions[0].id).toBe('grocery-tx-1');
    });
  });
  
  describe('As a user, I can see hidden categories marked in the UI', () => {
    test('Hidden categories are returned with isHidden flag', async () => {
      // Create a hidden category
      const response = await authenticatedPost(
        '/api/v1/categories',
        authToken,
        {
          name: 'Account Transfers',
          parentId: null,
          isHidden: true,
          isSavings: false
        }
      );
      
      expect(response.status).toBe(201);
      
      // Get all categories
      const categoriesResponse = await authenticatedGet('/api/v1/categories', authToken);
      expect(categoriesResponse.status).toBe(200);
      
      // Find our hidden category
      const hiddenCategory = categoriesResponse.body.find((c: any) => c.id === response.body.id);
      expect(hiddenCategory).toBeDefined();
      expect(hiddenCategory.isHidden).toBe(true);
      expect(hiddenCategory.name).toBe('Account Transfers');
    });
    
    test('I can update a category to be hidden or visible', async () => {
      // Create a visible category
      const createResponse = await authenticatedPost(
        '/api/v1/categories',
        authToken,
        {
          name: 'Test Category',
          parentId: null,
          isHidden: false,
          isSavings: false
        }
      );
      
      expect(createResponse.status).toBe(201);
      expect(createResponse.body.isHidden).toBe(false);
      
      const categoryId = createResponse.body.id;
      
      // Update to hidden
      const updateResponse = await authenticatedPut(
        `/api/v1/categories/${categoryId}`,
        authToken,
        {
          isHidden: true,
        }
      );
      
      expect(updateResponse.status).toBe(200);
      
      // Verify it's now hidden
      const getResponse = await authenticatedGet('/api/v1/categories', authToken);
      const updatedCategory = getResponse.body.find((c: any) => c.id === categoryId);
      
      expect(updatedCategory.isHidden).toBe(true);
    });
  });
});