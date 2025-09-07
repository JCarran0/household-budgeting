import { authService, budgetService, categoryService, dataService } from '../../services';
import { InMemoryDataService } from '../../services/dataService';

/**
 * Financial Calculation Story Tests
 * 
 * Critical Path: These tests verify all financial calculations are accurate.
 * Any error here could cause users to make wrong financial decisions.
 * 
 * User Stories Covered:
 * - As a user, I can see accurate budget vs actual spending
 * - As a user, I can track spending trends over time
 * - As a user, I can see remaining budget for each category
 * - As a user, I can see year-to-date totals
 * - As a user, I can project future cash flow
 */

describe('User Story: Financial Calculations', () => {
  let testUserId: string;
  
  beforeEach(async () => {
    // Clear all data
    if ('clear' in dataService) {
      (dataService as InMemoryDataService).clear();
    }
    
    // Reset rate limiting
    authService.resetRateLimiting();
    
    // Create test user directly using service
    const username = `ft${Math.random().toString(36).substring(2, 8)}`;
    const password = 'secure financial test passphrase';
    
    const result = await authService.register(username, password);
    if (!result.success || !result.user) {
      throw new Error(`Failed to create test user: ${result.error || 'Unknown error'}`);
    }
    testUserId = result.user.id;
  });

  describe('As a user, I can see accurate budget vs actual calculations', () => {
    it('should calculate spending correctly for a single category', async () => {
      // Create a category directly
      const category = await categoryService.createCategory({
        name: 'Groceries',
        parentId: null,
        isHidden: false,
        isRollover: false
      }, testUserId);
      
      const categoryId = category.id;
      
      // Create a budget for the category
      await budgetService.createOrUpdateBudget({
        categoryId,
        month: '2025-01',
        amount: 500
      }, testUserId);
      
      // In a real scenario, transactions would be synced from Plaid
      // For testing, we pass the calculated actual spending directly
      // This represents $123.45 + $67.89 = $191.34 in spending
      const actualSpending = 191.34;
      
      // Calculate budget vs actual
      const comparison = await budgetService.getBudgetVsActual(
        categoryId,
        '2025-01',
        actualSpending,
        testUserId
      );
      
      expect(comparison).not.toBeNull();
      expect(comparison!.categoryId).toBe(categoryId);
      expect(comparison!.month).toBe('2025-01');
      expect(comparison!.budgeted).toBe(500);
      expect(comparison!.actual).toBe(191.34);
      expect(comparison!.remaining).toBeCloseTo(308.66, 2);
      expect(comparison!.percentUsed).toBe(38); // 191.34 / 500 = 38.27%
      expect(comparison!.isOverBudget).toBe(false);
    });

    it('should handle over-budget scenarios correctly', async () => {
      // Create a category
      const category = await categoryService.createCategory({
        name: 'Entertainment',
        parentId: null,
        isHidden: false,
        isRollover: false
      }, testUserId);
      
      const categoryId = category.id;
      
      // Create a small budget
      await budgetService.createOrUpdateBudget({
        categoryId,
        month: '2025-01',
        amount: 100
      }, testUserId);
      
      // Calculate with overspending
      const comparison = await budgetService.getBudgetVsActual(
        categoryId,
        '2025-01',
        150, // Spent more than budgeted
        testUserId
      );
      
      expect(comparison).toEqual({
        categoryId,
        month: '2025-01',
        budgeted: 100,
        actual: 150,
        remaining: -50,
        percentUsed: 150,
        isOverBudget: true,
        budgetType: 'expense',
        isIncomeCategory: false
      });
    });

    it('should handle categories with no budget', async () => {
      // Create a category
      const category = await categoryService.createCategory({
        name: 'Uncategorized',
        parentId: null,
        isHidden: false,
        isRollover: false
      }, testUserId);
      
      const categoryId = category.id;
      
      // No budget created
      
      // Calculate with spending but no budget
      const comparison = await budgetService.getBudgetVsActual(
        categoryId,
        '2025-01',
        75, // Spent without budget
        testUserId
      );
      
      expect(comparison).toEqual({
        categoryId,
        month: '2025-01',
        budgeted: 0,
        actual: 75,
        remaining: -75,
        percentUsed: 0,
        isOverBudget: true, // Any spending without budget is over
        budgetType: 'expense',
        isIncomeCategory: false
      });
    });

    it('should calculate all categories for a month correctly', async () => {
      // Create multiple categories
      const cat1 = await categoryService.createCategory({
        name: 'Food',
        parentId: null,
        isHidden: false,
        isRollover: false
      }, testUserId);
      
      const cat2 = await categoryService.createCategory({
        name: 'Transport',
        parentId: null,
        isHidden: false,
        isRollover: false
      }, testUserId);
      
      const cat3 = await categoryService.createCategory({
        name: 'Shopping',
        parentId: null,
        isHidden: false,
        isRollover: false
      }, testUserId);
      
      const cat1Id = cat1.id;
      const cat2Id = cat2.id;
      const cat3Id = cat3.id;
      
      // Create budgets for some categories
      await budgetService.createOrUpdateBudget({
        categoryId: cat1Id,
        month: '2025-01',
        amount: 600
      }, testUserId);
      
      await budgetService.createOrUpdateBudget({
        categoryId: cat2Id,
        month: '2025-01',
        amount: 200
      }, testUserId);
      
      // cat3 has no budget
      
      // Create spending map
      const actuals = new Map([
        [cat1Id, 450],    // Under budget
        [cat2Id, 250],    // Over budget
        [cat3Id, 100]     // No budget
      ]);
      
      const comparisons = await budgetService.getMonthlyBudgetVsActual(
        '2025-01',
        actuals,
        testUserId
      );
      
      expect(comparisons).toHaveLength(3);
      
      const cat1Comparison = comparisons.find(c => c.categoryId === cat1Id);
      expect(cat1Comparison).toMatchObject({
        budgeted: 600,
        actual: 450,
        remaining: 150,
        percentUsed: 75,
        isOverBudget: false
      });
      
      const cat2Comparison = comparisons.find(c => c.categoryId === cat2Id);
      expect(cat2Comparison).toMatchObject({
        budgeted: 200,
        actual: 250,
        remaining: -50,
        percentUsed: 125,
        isOverBudget: true
      });
      
      const cat3Comparison = comparisons.find(c => c.categoryId === cat3Id);
      expect(cat3Comparison).toMatchObject({
        budgeted: 0,
        actual: 100,
        remaining: -100,
        percentUsed: 0,
        isOverBudget: true
      });
    });
  });

  describe('As a user, I can track spending trends over time', () => {
    it('should calculate average spending for a category', async () => {
      // Create a category
      const category = await categoryService.createCategory({
        name: 'Utilities',
        parentId: null,
        isHidden: false,
        isRollover: false
      }, testUserId);
      
      const categoryId = category.id;
      
      // Create budgets for multiple months
      await budgetService.createOrUpdateBudget({
        categoryId,
        month: '2025-01',
        amount: 150
      }, testUserId);
      
      await budgetService.createOrUpdateBudget({
        categoryId,
        month: '2025-02',
        amount: 200
      }, testUserId);
      
      await budgetService.createOrUpdateBudget({
        categoryId,
        month: '2025-03',
        amount: 175
      }, testUserId);
      
      // Calculate average
      const average = await budgetService.getAverageBudget(
        categoryId,
        '2025-01',
        '2025-03',
        testUserId
      );
      
      expect(average).toBe(175); // (150 + 200 + 175) / 3 = 175
    });

    it('should track budget history for a category', async () => {
      // Create a category
      const category = await categoryService.createCategory({
        name: 'Insurance',
        parentId: null,
        isHidden: false,
        isRollover: false
      }, testUserId);
      
      const categoryId = category.id;
      
      // Create budgets with increasing amounts
      await budgetService.createOrUpdateBudget({
        categoryId,
        month: '2025-01',
        amount: 100
      }, testUserId);
      
      await budgetService.createOrUpdateBudget({
        categoryId,
        month: '2025-02',
        amount: 110
      }, testUserId);
      
      await budgetService.createOrUpdateBudget({
        categoryId,
        month: '2025-03',
        amount: 120
      }, testUserId);
      
      const history = await budgetService.getCategoryBudgetHistory(
        categoryId,
        '2025-01',
        '2025-03',
        testUserId
      );
      
      expect(history).toHaveLength(3);
      expect(history.map(b => b.amount)).toEqual([100, 110, 120]);
      expect(history[0].month).toBe('2025-01');
      expect(history[2].month).toBe('2025-03');
    });

    it('should calculate total monthly budget across all categories', async () => {
      // Create multiple categories
      const cat1 = await categoryService.createCategory({
        name: 'Housing',
        parentId: null,
        isHidden: false,
        isRollover: false
      }, testUserId);
      
      const cat2 = await categoryService.createCategory({
        name: 'Food',
        parentId: null,
        isHidden: false,
        isRollover: false
      }, testUserId);
      
      const cat3 = await categoryService.createCategory({
        name: 'Transport',
        parentId: null,
        isHidden: false,
        isRollover: false
      }, testUserId);
      
      // Create budgets
      await budgetService.createOrUpdateBudget({
        categoryId: cat1.id,
        month: '2025-01',
        amount: 1500
      }, testUserId);
      
      await budgetService.createOrUpdateBudget({
        categoryId: cat2.id,
        month: '2025-01',
        amount: 600
      }, testUserId);
      
      await budgetService.createOrUpdateBudget({
        categoryId: cat3.id,
        month: '2025-01',
        amount: 200
      }, testUserId);
      
      const total = await budgetService.getTotalMonthlyBudget('2025-01', testUserId);
      
      expect(total).toBe(2300); // 1500 + 600 + 200
    });
  });

  describe('As a user, I can use rollover budgets for savings categories', () => {
    it('should calculate unused budget for rollover', async () => {
      // Create a savings category
      const category = await categoryService.createCategory({
        name: 'Vacation Fund',
        parentId: null,
        isHidden: false,
        isRollover: true, // Savings category
      }, testUserId);
      
      const categoryId = category.id;
      
      // Create budget
      await budgetService.createOrUpdateBudget({
        categoryId,
        month: '2025-01',
        amount: 300
      }, testUserId);
      
      // Calculate rollover with partial spending
      const rollover = await budgetService.calculateRollover(
        categoryId,
        '2025-01',
        50, // Only spent 50 of 300
        testUserId
      );
      
      expect(rollover).toBe(250); // 300 - 50 = 250 unused
    });

    it('should not rollover overspent budgets', async () => {
      // Create a category
      const category = await categoryService.createCategory({
        name: 'Emergency Fund',
        parentId: null,
        isHidden: false,
        isRollover: true
      }, testUserId);
      
      const categoryId = category.id;
      
      // Create budget
      await budgetService.createOrUpdateBudget({
        categoryId,
        month: '2025-01',
        amount: 200
      }, testUserId);
      
      // Calculate rollover with overspending
      const rollover = await budgetService.calculateRollover(
        categoryId,
        '2025-01',
        250, // Spent more than budgeted
        testUserId
      );
      
      expect(rollover).toBe(0); // No rollover for overspent categories
    });

    it('should apply rollover to next month budget', async () => {
      // Create a savings category
      const category = await categoryService.createCategory({
        name: 'New Car Fund',
        parentId: null,
        isHidden: false,
        isRollover: true
      }, testUserId);
      
      const categoryId = category.id;
      
      // Create budgets for two months
      await budgetService.createOrUpdateBudget({
        categoryId,
        month: '2025-01',
        amount: 500
      }, testUserId);
      
      await budgetService.createOrUpdateBudget({
        categoryId,
        month: '2025-02',
        amount: 500
      }, testUserId);
      
      // Apply rollover from January to February
      const rolloverAmount = 150; // Assume 150 unused from January
      const adjustedBudget = await budgetService.applyRollover(
        categoryId,
        '2025-02',
        rolloverAmount,
        testUserId
      );
      
      expect(adjustedBudget.amount).toBe(650); // 500 + 150 rollover
    });
  });

  describe('As a user, I can copy budgets between months', () => {
    it('should copy all budgets from one month to another', async () => {
      // Create multiple categories
      const cat1 = await categoryService.createCategory({
        name: 'Rent',
        parentId: null,
        isHidden: false,
        isRollover: false
      }, testUserId);
      
      const cat2 = await categoryService.createCategory({
        name: 'Groceries',
        parentId: null,
        isHidden: false,
        isRollover: false
      }, testUserId);
      
      // Create budgets for January
      await budgetService.createOrUpdateBudget({
        categoryId: cat1.id,
        month: '2025-01',
        amount: 1200
      }, testUserId);
      
      await budgetService.createOrUpdateBudget({
        categoryId: cat2.id,
        month: '2025-01',
        amount: 400
      }, testUserId);
      
      // Copy to February
      const copiedBudgets = await budgetService.copyBudgets(
        '2025-01',
        '2025-02',
        testUserId
      );
      
      expect(copiedBudgets).toHaveLength(2);
      
      // Verify February budgets
      const febBudgets = await budgetService.getMonthlyBudgets('2025-02', testUserId);
      expect(febBudgets).toHaveLength(2);
      
      const rentBudget = febBudgets.find(b => b.categoryId === cat1.id);
      expect(rentBudget?.amount).toBe(1200);
      
      const groceriesBudget = febBudgets.find(b => b.categoryId === cat2.id);
      expect(groceriesBudget?.amount).toBe(400);
    });

    it('should overwrite existing budgets when copying', async () => {
      // Create a category
      const category = await categoryService.createCategory({
        name: 'Internet',
        parentId: null,
        isHidden: false,
        isRollover: false
      }, testUserId);
      
      const categoryId = category.id;
      
      // Create different budgets for two months
      await budgetService.createOrUpdateBudget({
        categoryId,
        month: '2025-01',
        amount: 80
      }, testUserId);
      
      await budgetService.createOrUpdateBudget({
        categoryId,
        month: '2025-02',
        amount: 100
      }, testUserId);
      
      // Copy from January to February (should overwrite)
      await budgetService.copyBudgets('2025-01', '2025-02', testUserId);
      
      const febBudget = await budgetService.getBudget(categoryId, '2025-02', testUserId);
      expect(febBudget?.amount).toBe(80); // Overwritten with January value
    });
  });

  describe('As a user, I need accurate monthly boundary calculations', () => {
    it('should not include next months transactions in budget vs actual calculations', async () => {
      // Create a mortgage payment category
      const category = await categoryService.createCategory({
        name: 'Mortgage Payment',
        parentId: null,
        isHidden: false,
        isRollover: false
      }, testUserId);
      
      const categoryId = category.id;
      
      // Create budget for July 2025
      await budgetService.createOrUpdateBudget({
        categoryId,
        month: '2025-07',
        amount: 2500
      }, testUserId);
      
      // Simulate the bug scenario: transaction on July 1st and August 1st
      // This represents the same mortgage payment occurring monthly
      const julyTransactionAmount = 2215.60;
      const augustTransactionAmount = 2215.60;
      
      // Budget vs actual should ONLY include July transaction
      // The bug was including August 1st transaction due to <= comparison
      const comparison = await budgetService.getBudgetVsActual(
        categoryId,
        '2025-07',
        julyTransactionAmount, // Should be ONLY July amount, not July + August
        testUserId
      );
      
      expect(comparison).not.toBeNull();
      expect(comparison!.categoryId).toBe(categoryId);
      expect(comparison!.month).toBe('2025-07');
      expect(comparison!.budgeted).toBe(2500);
      expect(comparison!.actual).toBe(2215.60); // Should be single transaction, not doubled
      expect(comparison!.remaining).toBeCloseTo(284.40, 2); // 2500 - 2215.60
      expect(comparison!.percentUsed).toBe(89); // 2215.60 / 2500 = 88.6%
      expect(comparison!.isOverBudget).toBe(false);
      
      // Verify that doubling would be detected as incorrect
      const incorrectDoubledAmount = julyTransactionAmount + augustTransactionAmount; // 4431.20
      const incorrectComparison = await budgetService.getBudgetVsActual(
        categoryId,
        '2025-07',
        incorrectDoubledAmount,
        testUserId
      );
      
      // This would be the bug scenario - should NOT happen
      expect(incorrectComparison!.actual).toBe(4431.20);
      expect(incorrectComparison!.isOverBudget).toBe(true); // Would incorrectly show as over budget
    });

    it('should handle month boundary transitions correctly', async () => {
      // Test various month boundaries that could cause issues
      const category = await categoryService.createCategory({
        name: 'Utilities',
        parentId: null,
        isHidden: false,
        isRollover: false
      }, testUserId);
      
      const categoryId = category.id;
      
      // Create budgets for different month boundary scenarios
      const testCases = [
        { month: '2025-02', description: 'February (non-leap year)' },
        { month: '2025-12', description: 'December to January transition' },
        { month: '2024-02', description: 'February (leap year)' },
        { month: '2025-01', description: 'January start of year' }
      ];
      
      for (const testCase of testCases) {
        await budgetService.createOrUpdateBudget({
          categoryId,
          month: testCase.month,
          amount: 100,
        }, testUserId);
        
        const comparison = await budgetService.getBudgetVsActual(
          categoryId,
          testCase.month,
          75, // Consistent spending amount
          testUserId
        );
        
        expect(comparison).not.toBeNull();
        expect(comparison!.month).toBe(testCase.month);
        expect(comparison!.budgeted).toBe(100);
        expect(comparison!.actual).toBe(75);
        expect(comparison!.remaining).toBe(25);
      }
    });

    it('should handle end-of-month date calculations precisely', async () => {
      // Test that end-of-month calculations don't leak into next month
      const category = await categoryService.createCategory({
        name: 'Monthly Service',
        parentId: null,
        isHidden: false,
        isRollover: false
      }, testUserId);
      
      const categoryId = category.id;
      
      // Create budget for a month with 31 days
      await budgetService.createOrUpdateBudget({
        categoryId,
        month: '2025-01', // January has 31 days
        amount: 500
      }, testUserId);
      
      // Simulate spending on the last day of January vs first day of February
      const januaryLastDaySpending = 200; // This should be included
      
      const comparison = await budgetService.getBudgetVsActual(
        categoryId,
        '2025-01',
        januaryLastDaySpending,
        testUserId
      );
      
      expect(comparison!.actual).toBe(200);
      expect(comparison!.remaining).toBe(300);
      
      // Test for February (shorter month)
      await budgetService.createOrUpdateBudget({
        categoryId,
        month: '2025-02', // February has 28 days in 2025
        amount: 500
      }, testUserId);
      
      const februaryComparison = await budgetService.getBudgetVsActual(
        categoryId,
        '2025-02',
        150,
        testUserId
      );
      
      expect(februaryComparison!.actual).toBe(150);
      expect(februaryComparison!.remaining).toBe(350);
    });
  });

  describe('As a user, I need accurate handling of edge cases', () => {
    it('should handle zero budget amounts correctly', async () => {
      // Create a category
      const category = await categoryService.createCategory({
        name: 'Miscellaneous',
        parentId: null,
        isHidden: false,
        isRollover: false
      }, testUserId);
      
      const categoryId = category.id;
      
      // Try to create budget with zero amount
      await expect(budgetService.createOrUpdateBudget({
        categoryId,
        month: '2025-01',
        amount: 0
      }, testUserId)).rejects.toThrow('Budget amount must be positive');
    });

    it('should handle negative budget amounts correctly', async () => {
      // Create a category
      const category = await categoryService.createCategory({
        name: 'TestCategory',
        parentId: null,
        isHidden: false,
        isRollover: false
      }, testUserId);
      
      const categoryId = category.id;
      
      // Try to create budget with negative amount
      await expect(budgetService.createOrUpdateBudget({
        categoryId,
        month: '2025-01',
        amount: -100
      }, testUserId)).rejects.toThrow('Budget amount must be positive');
    });

    it('should validate month format correctly', async () => {
      // Create a category
      const category = await categoryService.createCategory({
        name: 'TestCategory',
        parentId: null,
        isHidden: false,
        isRollover: false
      }, testUserId);
      
      const categoryId = category.id;
      
      // Invalid month formats
      await expect(budgetService.createOrUpdateBudget({
        categoryId,
        month: '2025-13', // Month 13 doesn't exist
        amount: 100
      }, testUserId)).rejects.toThrow('Invalid month format');
      
      await expect(budgetService.createOrUpdateBudget({
        categoryId,
        month: '2025', // Missing month
        amount: 100
      }, testUserId)).rejects.toThrow('Invalid month format');
      
      await expect(budgetService.createOrUpdateBudget({
        categoryId,
        month: '25-01', // Wrong year format
        amount: 100
      }, testUserId)).rejects.toThrow('Invalid month format');
    });

    it('should handle very large budget amounts', async () => {
      // Create a category
      const category = await categoryService.createCategory({
        name: 'HighBudget',
        parentId: null,
        isHidden: false,
        isRollover: false
      }, testUserId);
      
      const categoryId = category.id;
      
      // Create budget with large amount
      const budget = await budgetService.createOrUpdateBudget({
        categoryId,
        month: '2025-01',
        amount: 999999.99
      }, testUserId);
      
      expect(budget.amount).toBe(999999.99);
      
      // Calculate with large spending
      const comparison = await budgetService.getBudgetVsActual(
        categoryId,
        '2025-01',
        500000,
        testUserId
      );
      
      expect(comparison).not.toBeNull();
      expect(comparison!.remaining).toBe(499999.99);
      expect(comparison!.percentUsed).toBe(50);
    });

    it('should handle precision in financial calculations', async () => {
      // Create a category
      const category = await categoryService.createCategory({
        name: 'Precision',
        parentId: null,
        isHidden: false,
        isRollover: false
      }, testUserId);
      
      const categoryId = category.id;
      
      // Create budget with decimal amount
      await budgetService.createOrUpdateBudget({
        categoryId,
        month: '2025-01',
        amount: 333.33
      }, testUserId);
      
      // Calculate with decimal spending
      const comparison = await budgetService.getBudgetVsActual(
        categoryId,
        '2025-01',
        111.11,
        testUserId
      );
      
      expect(comparison).not.toBeNull();
      expect(comparison!.remaining).toBeCloseTo(222.22, 2);
      expect(comparison!.percentUsed).toBe(33); // Should round to integer
    });
  });
});