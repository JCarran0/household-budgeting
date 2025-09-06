/**
 * Category Deletion Protection Tests
 * 
 * Tests the protection mechanism that prevents deletion of categories
 * that are referenced by budgets, auto-categorization rules, or transactions.
 */

import { DataService, InMemoryDataService } from '../../services/dataService';
import { CategoryService } from '../../services/categoryService';
import { BudgetService } from '../../services/budgetService';
import { AutoCategorizeService } from '../../services/autoCategorizeService';
import { TransactionService } from '../../services/transactionService';
import { PlaidService } from '../../services/plaidService';

describe('Category Deletion Protection', () => {
  let dataService: DataService;
  let categoryService: CategoryService;
  let budgetService: BudgetService;
  let autoCategorizeService: AutoCategorizeService;
  let transactionService: TransactionService;
  let plaidService: PlaidService;
  
  const testUserId = 'test-user-123';
  
  beforeEach(() => {
    // Create fresh service instances for each test
    dataService = new InMemoryDataService();
    budgetService = new BudgetService(dataService);
    autoCategorizeService = new AutoCategorizeService(dataService);
    plaidService = new PlaidService();
    transactionService = new TransactionService(dataService, plaidService);
    categoryService = new CategoryService(dataService, budgetService, autoCategorizeService, transactionService);
  });
  
  describe('Deletion with no references', () => {
    it('should allow deletion of a category with no references', async () => {
      // Create a category
      const category = await categoryService.createCategory({
        name: 'Test Category',
        parentId: null,
        isHidden: false,
        isSavings: false
      }, testUserId);
      
      // Should be able to delete it
      await expect(categoryService.deleteCategory(category.id, testUserId))
        .resolves
        .not.toThrow();
      
      // Verify category is deleted
      const categories = await categoryService.getAllCategories(testUserId);
      expect(categories.find(c => c.id === category.id)).toBeUndefined();
    });
  });
  
  describe('Deletion blocked by subcategories', () => {
    it('should prevent deletion of a category with subcategories', async () => {
      // Create parent category
      const parent = await categoryService.createCategory({
        name: 'Parent Category',
        parentId: null,
        isHidden: false,
        isSavings: false
      }, testUserId);
      
      // Create subcategory
      await categoryService.createCategory({
        name: 'Subcategory',
        parentId: parent.id,
        isHidden: false,
        isSavings: false
      }, testUserId);
      
      // Should not be able to delete parent
      await expect(categoryService.deleteCategory(parent.id, testUserId))
        .rejects
        .toThrow('Cannot delete category with subcategories');
    });
  });
  
  describe('Deletion blocked by budgets', () => {
    it('should prevent deletion of a category with active budgets', async () => {
      // Create a category
      const category = await categoryService.createCategory({
        name: 'Budget Category',
        parentId: null,
        isHidden: false,
        isSavings: false
      }, testUserId);
      
      // Create a budget for this category
      await budgetService.createOrUpdateBudget({
        categoryId: category.id,
        month: '2025-01',
        amount: 500
      }, testUserId);
      
      // Should not be able to delete category
      await expect(categoryService.deleteCategory(category.id, testUserId))
        .rejects
        .toThrow('Cannot delete category with active budgets. Please delete the budgets first.');
    });
    
    it('should allow deletion after removing budgets', async () => {
      // Create a category
      const category = await categoryService.createCategory({
        name: 'Budget Category',
        parentId: null,
        isHidden: false,
        isSavings: false
      }, testUserId);
      
      // Create a budget for this category
      const budget = await budgetService.createOrUpdateBudget({
        categoryId: category.id,
        month: '2025-01',
        amount: 500
      }, testUserId);
      
      // Delete the budget
      await budgetService.deleteBudget(budget.id, testUserId);
      
      // Now should be able to delete category
      await expect(categoryService.deleteCategory(category.id, testUserId))
        .resolves
        .not.toThrow();
    });
  });
  
  describe('Deletion blocked by auto-categorization rules', () => {
    it('should prevent deletion of a category used in auto-categorization rules', async () => {
      // Create a category
      const category = await categoryService.createCategory({
        name: 'Rule Category',
        parentId: null,
        isHidden: false,
        isSavings: false
      }, testUserId);
      
      // Create an auto-categorization rule for this category
      await autoCategorizeService.createRule(testUserId, {
        description: 'Test Rule',
        patterns: ['coffee', 'starbucks'],
        categoryId: category.id,
        categoryName: category.name
      });
      
      // Should not be able to delete category
      await expect(categoryService.deleteCategory(category.id, testUserId))
        .rejects
        .toThrow('Cannot delete category used in auto-categorization rules. Please update or delete the rules first.');
    });
    
    it('should allow deletion after removing rules', async () => {
      // Create a category
      const category = await categoryService.createCategory({
        name: 'Rule Category',
        parentId: null,
        isHidden: false,
        isSavings: false
      }, testUserId);
      
      // Create an auto-categorization rule for this category
      const ruleResult = await autoCategorizeService.createRule(testUserId, {
        description: 'Test Rule',
        patterns: ['coffee'],
        categoryId: category.id,
        categoryName: category.name
      });
      
      // Delete the rule
      if (ruleResult.success && ruleResult.rule) {
        await autoCategorizeService.deleteRule(testUserId, ruleResult.rule.id);
      }
      
      // Now should be able to delete category
      await expect(categoryService.deleteCategory(category.id, testUserId))
        .resolves
        .not.toThrow();
    });
  });
  
  describe('Deletion blocked by transactions', () => {
    it('should prevent deletion of a category with associated transactions', async () => {
      // Create a category
      const category = await categoryService.createCategory({
        name: 'Transaction Category',
        parentId: null,
        isHidden: false,
        isSavings: false
      }, testUserId);
      
      // Create a transaction with this category
      const transactions = [{
        id: 'txn-1',
        userId: testUserId,
        accountId: 'account-1',
        plaidTransactionId: 'plaid-txn-1',
        amount: 50.00,
        isoCurrencyCode: 'USD',
        unofficialCurrencyCode: null,
        date: new Date('2025-01-15'),
        datetime: null,
        authorizedDate: null,
        authorizedDatetime: null,
        name: 'Test Transaction',
        merchantName: 'Test Merchant',
        category: ['FOOD_AND_DRINK', 'COFFEE'],
        plaidCategoryId: null,
        categoryId: category.id, // Assign to our test category
        status: 'posted' as const,
        pending: false,
        paymentChannel: 'in store',
        accountOwner: null,
        transactionCode: null,
        location: undefined,
        paymentMeta: undefined,
        personalFinanceCategory: undefined,
        personalFinanceCategoryIconUrl: null,
        checkNumber: null,
        transactionType: null,
        logo_url: null,
        website: null,
        userDescription: null,
        isHidden: false,
        parentTransactionId: null,
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date()
      }];
      
      // Save transactions directly to data service
      await dataService.saveData(`transactions_${testUserId}`, transactions);
      
      // Should not be able to delete category
      await expect(categoryService.deleteCategory(category.id, testUserId))
        .rejects
        .toThrow('Cannot delete category with associated transactions. Please recategorize the transactions first.');
    });
    
    it('should allow deletion after recategorizing transactions', async () => {
      // Create two categories
      const category1 = await categoryService.createCategory({
        name: 'Category 1',
        parentId: null,
        isHidden: false,
        isSavings: false
      }, testUserId);
      
      const category2 = await categoryService.createCategory({
        name: 'Category 2',
        parentId: null,
        isHidden: false,
        isSavings: false
      }, testUserId);
      
      // Create a transaction with category1
      const transactions = [{
        id: 'txn-1',
        userId: testUserId,
        accountId: 'account-1',
        plaidTransactionId: 'plaid-txn-1',
        amount: 50.00,
        isoCurrencyCode: 'USD',
        unofficialCurrencyCode: null,
        date: new Date('2025-01-15'),
        datetime: null,
        authorizedDate: null,
        authorizedDatetime: null,
        name: 'Test Transaction',
        merchantName: 'Test Merchant',
        category: ['FOOD_AND_DRINK', 'COFFEE'],
        plaidCategoryId: null,
        categoryId: category1.id,
        status: 'posted' as const,
        pending: false,
        paymentChannel: 'in store',
        accountOwner: null,
        transactionCode: null,
        location: undefined,
        paymentMeta: undefined,
        personalFinanceCategory: undefined,
        personalFinanceCategoryIconUrl: null,
        checkNumber: null,
        transactionType: null,
        logo_url: null,
        website: null,
        userDescription: null,
        isHidden: false,
        parentTransactionId: null,
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date()
      }];
      
      await dataService.saveData(`transactions_${testUserId}`, transactions);
      
      // Recategorize to category2 by updating the transaction directly
      const txns = await dataService.getData<any[]>(`transactions_${testUserId}`) || [];
      txns[0].categoryId = category2.id;
      await dataService.saveData(`transactions_${testUserId}`, txns);
      
      // Now should be able to delete category1
      await expect(categoryService.deleteCategory(category1.id, testUserId))
        .resolves
        .not.toThrow();
    });
  });
  
  describe('Multiple blocking conditions', () => {
    it('should check all conditions and report the first blocking issue', async () => {
      // Create a category
      const category = await categoryService.createCategory({
        name: 'Multi-Block Category',
        parentId: null,
        isHidden: false,
        isSavings: false
      }, testUserId);
      
      // Create subcategory (first blocker)
      await categoryService.createCategory({
        name: 'Subcategory',
        parentId: category.id,
        isHidden: false,
        isSavings: false
      }, testUserId);
      
      // Create budget (second blocker)
      await budgetService.createOrUpdateBudget({
        categoryId: category.id,
        month: '2025-01',
        amount: 500
      }, testUserId);
      
      // Create rule (third blocker)
      await autoCategorizeService.createRule(testUserId, {
        description: 'Test Rule',
        patterns: ['test'],
        categoryId: category.id,
        categoryName: category.name
      });
      
      // Should fail with subcategory error (first check)
      await expect(categoryService.deleteCategory(category.id, testUserId))
        .rejects
        .toThrow('Cannot delete category with subcategories');
    });
  });
  
  describe('User isolation', () => {
    it('should only check references for the specific user', async () => {
      const user1 = 'user-1';
      const user2 = 'user-2';
      
      // User 1 creates a category
      const category1 = await categoryService.createCategory({
        name: 'User1 Category',
        parentId: null,
        isHidden: false,
        isSavings: false
      }, user1);
      
      // User 2 creates a category with the same name
      const category2 = await categoryService.createCategory({
        name: 'User2 Category',
        parentId: null,
        isHidden: false,
        isSavings: false
      }, user2);
      
      // User 2 creates a budget for their category
      await budgetService.createOrUpdateBudget({
        categoryId: category2.id,
        month: '2025-01',
        amount: 500
      }, user2);
      
      // User 1 should be able to delete their category
      // (not blocked by User 2's budget)
      await expect(categoryService.deleteCategory(category1.id, user1))
        .resolves
        .not.toThrow();
      
      // User 2 should not be able to delete their category
      // (blocked by their own budget)
      await expect(categoryService.deleteCategory(category2.id, user2))
        .rejects
        .toThrow('Cannot delete category with active budgets');
    });
  });
});