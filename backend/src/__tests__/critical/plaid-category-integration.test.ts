/**
 * Plaid Category Integration Tests
 * 
 * Critical tests for Plaid Personal Finance Categories (PFC) integration
 * Testing the automatic categorization of transactions using SNAKE_CASE IDs
 */

import { v4 as uuidv4 } from 'uuid';
import { dataService, categoryService, transactionService } from '../../services';
import { PLAID_CATEGORIES, isPlaidCategory } from '../../constants/plaidCategories';
import { StoredTransaction } from '../../services/transactionService';
import { Transaction as PlaidTransaction } from '../../services/plaidService';

describe('Plaid Category Integration', () => {
  const testUserId = uuidv4();
  
  beforeEach(async () => {
    // Clear all test data
    if ('clear' in dataService) {
      (dataService as any).clear();
    }
  });

  describe('Category Initialization with Plaid Taxonomy', () => {
    test('should initialize 121 categories (120 Plaid + 1 custom savings)', async () => {
      // Initialize categories for user
      await categoryService.initializeDefaultCategories(testUserId);
      
      // Get all categories
      const categories = await categoryService.getAllCategories(testUserId);
      
      // Should have exactly 121 categories
      expect(categories.length).toBe(121);
      
      // Count by type
      const plaidCategories = categories.filter(c => !c.isCustom);
      const customCategories = categories.filter(c => c.isCustom);
      
      expect(plaidCategories.length).toBe(120);
      expect(customCategories.length).toBe(1);
      expect(customCategories[0].id).toBe('CUSTOM_SAVINGS');
    });

    test('should create correct parent-child relationships', async () => {
      await categoryService.initializeDefaultCategories(testUserId);
      const categories = await categoryService.getAllCategories(testUserId);
      
      // Check FOOD_AND_DRINK hierarchy
      const foodParent = categories.find(c => c.id === 'FOOD_AND_DRINK');
      expect(foodParent).toBeDefined();
      expect(foodParent?.parentId).toBeNull();
      expect(foodParent?.name).toBe('Food and Drink');
      
      const coffeeSubcategory = categories.find(c => c.id === 'FOOD_AND_DRINK_COFFEE');
      expect(coffeeSubcategory).toBeDefined();
      expect(coffeeSubcategory?.parentId).toBe('FOOD_AND_DRINK');
      expect(coffeeSubcategory?.name).toBe('Coffee');
      expect(coffeeSubcategory?.description).toBe('Purchases at coffee shops or cafes');
    });

    test('should mark TRANSFER categories as hidden by default', async () => {
      await categoryService.initializeDefaultCategories(testUserId);
      const categories = await categoryService.getAllCategories(testUserId);
      
      const transferIn = categories.find(c => c.id === 'TRANSFER_IN');
      const transferOut = categories.find(c => c.id === 'TRANSFER_OUT');
      
      expect(transferIn?.isHidden).toBe(true);
      expect(transferOut?.isHidden).toBe(true);
      
      // Other categories should not be hidden
      const income = categories.find(c => c.id === 'INCOME');
      expect(income?.isHidden).toBe(false);
    });

    test('should not reinitialize if categories already exist', async () => {
      // First initialization
      await categoryService.initializeDefaultCategories(testUserId);
      const firstCount = (await categoryService.getAllCategories(testUserId)).length;
      
      // Try to initialize again
      await categoryService.initializeDefaultCategories(testUserId);
      const secondCount = (await categoryService.getAllCategories(testUserId)).length;
      
      // Should still have same number of categories
      expect(secondCount).toBe(firstCount);
    });
  });

  describe('Transaction Auto-Categorization', () => {
    beforeEach(async () => {
      // Initialize Plaid categories
      await categoryService.initializeDefaultCategories(testUserId);
    });

    test('should automatically assign Plaid detailed category to new transactions', async () => {
      // Create a mock Plaid transaction with category data
      const plaidTransaction: PlaidTransaction = {
        id: 'test_txn_1',
        plaidTransactionId: 'test_txn_1',
        accountId: 'test_account_1',
        amount: 5.25,
        date: '2025-01-06',
        name: 'Starbucks',
        merchantName: 'Starbucks',
        category: ['FOOD_AND_DRINK', 'FOOD_AND_DRINK_COFFEE'],
        categoryId: 'old_category_id',
        pending: false,
        isoCurrencyCode: 'USD',
        location: undefined
      };

      // Process the transaction (simulating what happens during sync)
      const transaction = (transactionService as any).createTransaction(
        testUserId,
        'account_123',
        plaidTransaction
      ) as StoredTransaction;

      // Should use the detailed category ID directly
      expect(transaction.categoryId).toBe('FOOD_AND_DRINK_COFFEE');
      expect(transaction.category).toEqual(['FOOD_AND_DRINK', 'FOOD_AND_DRINK_COFFEE']);
    });

    test('should use primary category if no detailed category exists', async () => {
      const plaidTransaction: PlaidTransaction = {
        id: 'test_txn_2',
        plaidTransactionId: 'test_txn_2',
        accountId: 'test_account_1',
        amount: 100,
        date: '2025-01-06',
        name: 'Generic Income',
        merchantName: null,
        category: ['INCOME'], // Only primary, no detailed
        categoryId: null,
        pending: false,
        isoCurrencyCode: 'USD',
        location: undefined
      };

      const transaction = (transactionService as any).createTransaction(
        testUserId,
        'account_123',
        plaidTransaction
      ) as StoredTransaction;

      // Should use the primary category ID
      expect(transaction.categoryId).toBe('INCOME');
    });

    test('should handle transactions with no category', async () => {
      const plaidTransaction: PlaidTransaction = {
        id: 'test_txn_3',
        plaidTransactionId: 'test_txn_3',
        accountId: 'test_account_1',
        amount: 50,
        date: '2025-01-06',
        name: 'Unknown Transaction',
        merchantName: null,
        category: null,
        categoryId: null,
        pending: false,
        isoCurrencyCode: 'USD',
        location: undefined
      };

      const transaction = (transactionService as any).createTransaction(
        testUserId,
        'account_123',
        plaidTransaction
      ) as StoredTransaction;

      // Should have null categoryId
      expect(transaction.categoryId).toBeNull();
    });
  });

  describe('Custom Category ID Generation', () => {
    test('should generate SNAKE_CASE IDs with CUSTOM_ prefix', async () => {
      await categoryService.initializeDefaultCategories(testUserId);
      
      const testCases = [
        { name: 'Wine Budget', expectedId: 'CUSTOM_WINE_BUDGET' },
        { name: 'Date Nights', expectedId: 'CUSTOM_DATE_NIGHTS' },
        { name: "Jared's Fun Money", expectedId: 'CUSTOM_JARED_S_FUN_MONEY' },
        { name: 'Emergency Fund 💰', expectedId: 'CUSTOM_EMERGENCY_FUND' },
        { name: '401k Match!!!', expectedId: 'CUSTOM_401K_MATCH' }
      ];

      for (const testCase of testCases) {
        const category = await categoryService.createCategory({
          name: testCase.name,
          parentId: null,
          isHidden: false,
          isRollover: false
        }, testUserId);

        expect(category.id).toBe(testCase.expectedId);
        expect(category.isCustom).toBe(true);
        expect(category.name).toBe(testCase.name);
      }
    });

    test('should handle ID collisions by appending numbers', async () => {
      await categoryService.initializeDefaultCategories(testUserId);
      
      // Create first "Wine Budget"
      const category1 = await categoryService.createCategory({
        name: 'Wine Budget',
        parentId: null,
        isHidden: false,
        isRollover: false
      }, testUserId);
      
      expect(category1.id).toBe('CUSTOM_WINE_BUDGET');
      
      // Create second "Wine Budget" (different name but same normalized form)
      const category2 = await categoryService.createCategory({
        name: 'Wine   Budget', // Extra spaces
        parentId: null,
        isHidden: false,
        isRollover: false
      }, testUserId);
      
      expect(category2.id).toBe('CUSTOM_WINE_BUDGET_2');
      
      // Create third one
      const category3 = await categoryService.createCategory({
        name: 'WINE BUDGET!', // Different case and punctuation
        parentId: null,
        isHidden: false,
        isRollover: false
      }, testUserId);
      
      expect(category3.id).toBe('CUSTOM_WINE_BUDGET_3');
    });

    test('should not allow custom categories to use Plaid IDs', async () => {
      await categoryService.initializeDefaultCategories(testUserId);
      
      // Even if user tries to name their category exactly like a Plaid category
      const category = await categoryService.createCategory({
        name: 'FOOD_AND_DRINK_COFFEE', // Trying to use Plaid ID as name
        parentId: null,
        isHidden: false,
        isRollover: false
      }, testUserId);
      
      // Should get CUSTOM_ prefix
      expect(category.id).toBe('CUSTOM_FOOD_AND_DRINK_COFFEE');
      expect(category.isCustom).toBe(true);
      
      // Verify it doesn't conflict with existing Plaid category
      const plaidCategory = await categoryService.getCategoryById('FOOD_AND_DRINK_COFFEE', testUserId);
      expect(plaidCategory?.isCustom).toBe(false);
    });
  });

  describe('Transaction Category Update with Plaid Changes', () => {
    let existingTransaction: StoredTransaction;
    
    beforeEach(async () => {
      await categoryService.initializeDefaultCategories(testUserId);
      
      // Create an existing transaction with a Plaid category
      existingTransaction = {
        id: uuidv4(),
        userId: testUserId,
        accountId: 'account_123',
        plaidTransactionId: 'update_test_1',
        plaidAccountId: 'plaid_account_1',
        amount: 10,
        date: '2025-01-06',
        name: 'Transaction',
        userDescription: null,
        merchantName: 'Merchant',
        category: ['FOOD_AND_DRINK', 'FOOD_AND_DRINK_RESTAURANT'],
        plaidCategoryId: 'old_id',
        categoryId: 'FOOD_AND_DRINK_RESTAURANT',
        status: 'posted',
        pending: false,
        isoCurrencyCode: 'USD',
        tags: [],
        notes: null,
        isHidden: false,
        isSplit: false,
        parentTransactionId: null,
        splitTransactionIds: [],
        location: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await dataService.saveData(`transactions_${testUserId}`, [existingTransaction]);
    });

    test('should update categoryId when Plaid changes category', async () => {
      const updatedPlaidData: PlaidTransaction = {
        id: 'update_test_1',
        plaidTransactionId: 'update_test_1',
        accountId: 'plaid_account_1',
        amount: 10,
        date: '2025-01-06',
        name: 'Transaction',
        merchantName: 'Merchant',
        category: ['FOOD_AND_DRINK', 'FOOD_AND_DRINK_COFFEE'], // Changed from RESTAURANT to COFFEE
        categoryId: 'new_id',
        pending: false,
        isoCurrencyCode: 'USD',
        location: undefined
      };

      const updated = (transactionService as any).updateTransaction(
        existingTransaction,
        updatedPlaidData
      );

      expect(updated).toBe(true);
      expect(existingTransaction.category).toEqual(['FOOD_AND_DRINK', 'FOOD_AND_DRINK_COFFEE']);
      expect(existingTransaction.categoryId).toBe('FOOD_AND_DRINK_COFFEE');
    });

    test('should preserve user override when Plaid changes category', async () => {
      // User manually set a custom category
      existingTransaction.categoryId = 'CUSTOM_MY_DINING';
      await dataService.saveData(`transactions_${testUserId}`, [existingTransaction]);

      const updatedPlaidData: PlaidTransaction = {
        id: 'update_test_1',
        plaidTransactionId: 'update_test_1',
        accountId: 'plaid_account_1',
        amount: 10,
        date: '2025-01-06',
        name: 'Transaction',
        merchantName: 'Merchant',
        category: ['FOOD_AND_DRINK', 'FOOD_AND_DRINK_COFFEE'], // Plaid changes category
        categoryId: 'new_id',
        pending: false,
        isoCurrencyCode: 'USD',
        location: undefined
      };

      const updated = (transactionService as any).updateTransaction(
        existingTransaction,
        updatedPlaidData
      );

      expect(updated).toBe(true);
      // Plaid category should update
      expect(existingTransaction.category).toEqual(['FOOD_AND_DRINK', 'FOOD_AND_DRINK_COFFEE']);
      // But user's custom categoryId should be preserved
      expect(existingTransaction.categoryId).toBe('CUSTOM_MY_DINING');
    });
  });

  describe('Category Validation', () => {
    test('should correctly identify Plaid vs custom categories', () => {
      // Plaid categories
      expect(isPlaidCategory('FOOD_AND_DRINK')).toBe(true);
      expect(isPlaidCategory('FOOD_AND_DRINK_COFFEE')).toBe(true);
      expect(isPlaidCategory('INCOME_WAGES')).toBe(true);
      
      // Custom categories
      expect(isPlaidCategory('CUSTOM_SAVINGS')).toBe(false);
      expect(isPlaidCategory('CUSTOM_WINE_BUDGET')).toBe(false);
      expect(isPlaidCategory('RANDOM_ID')).toBe(false);
    });

    test('should have unique IDs for all Plaid categories', () => {
      const allIds: string[] = [];
      
      // Collect all primary and subcategory IDs
      Object.entries(PLAID_CATEGORIES).forEach(([primaryId, primary]) => {
        allIds.push(primaryId);
        Object.keys(primary.subcategories).forEach(subcategoryId => {
          allIds.push(subcategoryId);
        });
      });
      
      // Check for uniqueness
      const uniqueIds = new Set(allIds);
      expect(allIds.length).toBe(uniqueIds.size);
      expect(allIds.length).toBe(120); // 16 primary + 104 subcategories
    });
  });
});