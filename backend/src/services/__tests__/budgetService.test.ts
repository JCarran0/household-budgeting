import { BudgetService } from '../budgetService';
import { InMemoryDataService } from '../dataService';

describe('BudgetService', () => {
  let budgetService: BudgetService;
  let dataService: InMemoryDataService;
  const testUserId = 'test-user-123';

  beforeEach(() => {
    dataService = new InMemoryDataService();
    budgetService = new BudgetService(dataService);
  });

  describe('Budget CRUD Operations', () => {
    it('should create a monthly budget for a category', async () => {
      const budgetData = {
        categoryId: 'cat-1',
        month: '2025-01',
        amount: 500
      };

      const budget = await budgetService.createOrUpdateBudget(budgetData, testUserId);

      expect(budget).toMatchObject({
        ...budgetData,
        id: expect.any(String),
        userId: testUserId
      });
    });

    it('should update an existing budget for the same category and month', async () => {
      const budgetData = {
        categoryId: 'cat-1',
        month: '2025-01',
        amount: 500
      };

      const firstBudget = await budgetService.createOrUpdateBudget(budgetData, testUserId);
      
      const updatedData = {
        ...budgetData,
        amount: 750
      };

      const updatedBudget = await budgetService.createOrUpdateBudget(updatedData, testUserId);

      expect(updatedBudget.id).toBe(firstBudget.id);
      expect(updatedBudget.amount).toBe(750);
    });

    it('should get budget by category and month', async () => {
      const budgetData = {
        categoryId: 'cat-1',
        month: '2025-01',
        amount: 500
      };

      await budgetService.createOrUpdateBudget(budgetData, testUserId);

      const budget = await budgetService.getBudget('cat-1', '2025-01', testUserId);

      expect(budget).toMatchObject(budgetData);
    });

    it('should return null when budget does not exist', async () => {
      const budget = await budgetService.getBudget('non-existent', '2025-01', testUserId);
      expect(budget).toBeNull();
    });

    it('should delete a budget', async () => {
      const budget = await budgetService.createOrUpdateBudget({
        categoryId: 'cat-1',
        month: '2025-01',
        amount: 500
      }, testUserId);

      await budgetService.deleteBudget(budget.id, testUserId);

      const deletedBudget = await budgetService.getBudget('cat-1', '2025-01', testUserId);
      expect(deletedBudget).toBeNull();
    });
  });

  describe('Monthly Budget Operations', () => {
    it('should get all budgets for a specific month', async () => {
      await budgetService.createOrUpdateBudget({
        categoryId: 'cat-1',
        month: '2025-01',
        amount: 500
      }, testUserId);

      await budgetService.createOrUpdateBudget({
        categoryId: 'cat-2',
        month: '2025-01',
        amount: 300
      }, testUserId);

      await budgetService.createOrUpdateBudget({
        categoryId: 'cat-3',
        month: '2025-02',
        amount: 400
      }, testUserId);

      const januaryBudgets = await budgetService.getMonthlyBudgets('2025-01', testUserId);

      expect(januaryBudgets).toHaveLength(2);
      expect(januaryBudgets.map(b => b.categoryId)).toEqual(['cat-1', 'cat-2']);
    });

    it('should calculate total budget for a month', async () => {
      await budgetService.createOrUpdateBudget({
        categoryId: 'cat-1',
        month: '2025-01',
        amount: 500
      }, testUserId);

      await budgetService.createOrUpdateBudget({
        categoryId: 'cat-2',
        month: '2025-01',
        amount: 300
      }, testUserId);

      await budgetService.createOrUpdateBudget({
        categoryId: 'cat-3',
        month: '2025-01',
        amount: 200
      }, testUserId);

      const total = await budgetService.getTotalMonthlyBudget('2025-01', testUserId);

      expect(total).toBe(1000);
    });

    it('should return 0 for month with no budgets', async () => {
      const total = await budgetService.getTotalMonthlyBudget('2025-01', testUserId);
      expect(total).toBe(0);
    });
  });

  describe('Budget Copying', () => {
    it('should copy budgets from one month to another', async () => {
      // Create budgets for January
      await budgetService.createOrUpdateBudget({
        categoryId: 'cat-1',
        month: '2025-01',
        amount: 500
      }, testUserId);

      await budgetService.createOrUpdateBudget({
        categoryId: 'cat-2',
        month: '2025-01',
        amount: 300
      }, testUserId);

      // Copy to February
      const copiedBudgets = await budgetService.copyBudgets('2025-01', '2025-02', testUserId);

      expect(copiedBudgets).toHaveLength(2);
      
      // Verify February budgets exist
      const februaryBudgets = await budgetService.getMonthlyBudgets('2025-02', testUserId);
      expect(februaryBudgets).toHaveLength(2);
      expect(februaryBudgets.map(b => b.amount)).toEqual([500, 300]);
    });

    it('should overwrite existing budgets when copying', async () => {
      // Create January budget
      await budgetService.createOrUpdateBudget({
        categoryId: 'cat-1',
        month: '2025-01',
        amount: 500
      }, testUserId);

      // Create February budget with different amount
      await budgetService.createOrUpdateBudget({
        categoryId: 'cat-1',
        month: '2025-02',
        amount: 200
      }, testUserId);

      // Copy from January to February (should overwrite)
      await budgetService.copyBudgets('2025-01', '2025-02', testUserId);

      const februaryBudget = await budgetService.getBudget('cat-1', '2025-02', testUserId);
      expect(februaryBudget?.amount).toBe(500);
    });

    it('should handle copying from empty month', async () => {
      const copiedBudgets = await budgetService.copyBudgets('2025-01', '2025-02', testUserId);
      expect(copiedBudgets).toHaveLength(0);
    });
  });

  describe('Budget vs Actual Calculations', () => {
    it('should calculate budget vs actual for a category', async () => {
      await budgetService.createOrUpdateBudget({
        categoryId: 'cat-1',
        month: '2025-01',
        amount: 500
      }, testUserId);

      const comparison = await budgetService.getBudgetVsActual('cat-1', '2025-01', 350, testUserId);

      expect(comparison).toEqual({
        categoryId: 'cat-1',
        month: '2025-01',
        budgeted: 500,
        actual: 350,
        remaining: 150,
        percentUsed: 70,
        isOverBudget: false
      });
    });

    it('should handle over-budget scenarios', async () => {
      await budgetService.createOrUpdateBudget({
        categoryId: 'cat-1',
        month: '2025-01',
        amount: 500
      }, testUserId);

      const comparison = await budgetService.getBudgetVsActual('cat-1', '2025-01', 600, testUserId);

      expect(comparison).toEqual({
        categoryId: 'cat-1',
        month: '2025-01',
        budgeted: 500,
        actual: 600,
        remaining: -100,
        percentUsed: 120,
        isOverBudget: true
      });
    });

    it('should handle no budget scenario', async () => {
      const comparison = await budgetService.getBudgetVsActual('cat-1', '2025-01', 350, testUserId);

      expect(comparison).toEqual({
        categoryId: 'cat-1',
        month: '2025-01',
        budgeted: 0,
        actual: 350,
        remaining: -350,
        percentUsed: 0,
        isOverBudget: true
      });
    });

    it('should calculate all budget vs actual for a month', async () => {
      // Create budgets
      await budgetService.createOrUpdateBudget({
        categoryId: 'cat-1',
        month: '2025-01',
        amount: 500
      }, testUserId);

      await budgetService.createOrUpdateBudget({
        categoryId: 'cat-2',
        month: '2025-01',
        amount: 300
      }, testUserId);

      // Provide actuals map
      const actuals = new Map([
        ['cat-1', 400],
        ['cat-2', 350],
        ['cat-3', 100] // No budget for this category
      ]);

      const comparisons = await budgetService.getMonthlyBudgetVsActual('2025-01', actuals, testUserId);

      expect(comparisons).toHaveLength(3);
      
      const cat1 = comparisons.find(c => c.categoryId === 'cat-1');
      expect(cat1).toMatchObject({
        budgeted: 500,
        actual: 400,
        remaining: 100,
        isOverBudget: false
      });

      const cat2 = comparisons.find(c => c.categoryId === 'cat-2');
      expect(cat2).toMatchObject({
        budgeted: 300,
        actual: 350,
        remaining: -50,
        isOverBudget: true
      });

      const cat3 = comparisons.find(c => c.categoryId === 'cat-3');
      expect(cat3).toMatchObject({
        budgeted: 0,
        actual: 100,
        remaining: -100,
        isOverBudget: true
      });
    });
  });

  describe('Budget Trends', () => {
    it('should get budget history for a category', async () => {
      await budgetService.createOrUpdateBudget({
        categoryId: 'cat-1',
        month: '2025-01',
        amount: 500
      }, testUserId);

      await budgetService.createOrUpdateBudget({
        categoryId: 'cat-1',
        month: '2025-02',
        amount: 550
      }, testUserId);

      await budgetService.createOrUpdateBudget({
        categoryId: 'cat-1',
        month: '2025-03',
        amount: 600
      }, testUserId);

      const history = await budgetService.getCategoryBudgetHistory('cat-1', '2025-01', '2025-03', testUserId);

      expect(history).toHaveLength(3);
      expect(history.map(b => b.amount)).toEqual([500, 550, 600]);
    });

    it('should calculate average budget for a category over time', async () => {
      await budgetService.createOrUpdateBudget({
        categoryId: 'cat-1',
        month: '2025-01',
        amount: 400
      }, testUserId);

      await budgetService.createOrUpdateBudget({
        categoryId: 'cat-1',
        month: '2025-02',
        amount: 500
      }, testUserId);

      await budgetService.createOrUpdateBudget({
        categoryId: 'cat-1',
        month: '2025-03',
        amount: 600
      }, testUserId);

      const average = await budgetService.getAverageBudget('cat-1', '2025-01', '2025-03', testUserId);

      expect(average).toBe(500);
    });

    it('should return 0 for average when no budgets exist', async () => {
      const average = await budgetService.getAverageBudget('cat-1', '2025-01', '2025-03', testUserId);
      expect(average).toBe(0);
    });
  });

  describe('Budget Validation', () => {
    it('should validate month format', async () => {
      await expect(budgetService.createOrUpdateBudget({
        categoryId: 'cat-1',
        month: '2025-13', // Invalid month
        amount: 500
      }, testUserId)).rejects.toThrow('Invalid month format');

      await expect(budgetService.createOrUpdateBudget({
        categoryId: 'cat-1',
        month: '2025', // Missing month
        amount: 500
      }, testUserId)).rejects.toThrow('Invalid month format');
    });

    it('should validate amount is positive', async () => {
      await expect(budgetService.createOrUpdateBudget({
        categoryId: 'cat-1',
        month: '2025-01',
        amount: -100
      }, testUserId)).rejects.toThrow('Budget amount must be positive');

      await expect(budgetService.createOrUpdateBudget({
        categoryId: 'cat-1',
        month: '2025-01',
        amount: 0
      }, testUserId)).rejects.toThrow('Budget amount must be positive');
    });
  });

  describe('Rollover Budgets', () => {
    it('should calculate unused budget from previous month', async () => {
      await budgetService.createOrUpdateBudget({
        categoryId: 'cat-1',
        month: '2025-01',
        amount: 500
      }, testUserId);

      const rollover = await budgetService.calculateRollover('cat-1', '2025-01', 400, testUserId);

      expect(rollover).toBe(100); // 500 - 400 = 100 unused
    });

    it('should return 0 rollover for overspent categories', async () => {
      await budgetService.createOrUpdateBudget({
        categoryId: 'cat-1',
        month: '2025-01',
        amount: 500
      }, testUserId);

      const rollover = await budgetService.calculateRollover('cat-1', '2025-01', 600, testUserId);

      expect(rollover).toBe(0); // Overspent, no rollover
    });

    it('should apply rollover to next month budget', async () => {
      await budgetService.createOrUpdateBudget({
        categoryId: 'cat-1',
        month: '2025-01',
        amount: 500
      }, testUserId);

      await budgetService.createOrUpdateBudget({
        categoryId: 'cat-1',
        month: '2025-02',
        amount: 500
      }, testUserId);

      const rollover = 100; // Assuming 100 unused from January
      const adjustedBudget = await budgetService.applyRollover('cat-1', '2025-02', rollover, testUserId);

      expect(adjustedBudget.amount).toBe(600); // 500 + 100 rollover
    });
  });
});