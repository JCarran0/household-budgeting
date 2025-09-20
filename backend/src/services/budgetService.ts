import { v4 as uuidv4 } from 'uuid';
import { MonthlyBudget, Category, BudgetType } from '../shared/types';
import { DataService } from './dataService';
import {
  createCategoryLookup,
  getBudgetType,
  isBudgetableCategory
} from '../shared/utils/categoryHelpers';

// Stored budget structure with user isolation
export interface StoredBudget extends MonthlyBudget {
  userId: string; // User who owns this budget
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBudgetDto {
  categoryId: string;
  month: string; // YYYY-MM format
  amount: number;
}

export interface BudgetComparison {
  categoryId: string;
  month: string;
  budgeted: number;
  actual: number;
  remaining: number;
  percentUsed: number;
  isOverBudget: boolean;
  budgetType: 'income' | 'expense';
  isIncomeCategory: boolean; // Convenience flag for UI logic
}

export class BudgetService {
  constructor(
    private dataService: DataService,
    private getCategoriesCallback?: (userId: string) => Promise<Category[]>
  ) {}

  private validateMonth(month: string): void {
    const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
    if (!monthRegex.test(month)) {
      throw new Error('Invalid month format. Use YYYY-MM');
    }
  }

  private validateAmount(amount: number): void {
    if (amount <= 0) {
      throw new Error('Budget amount must be positive');
    }
  }

  async getAllBudgets(userId: string): Promise<StoredBudget[]> {
    const budgets = await this.dataService.getData<StoredBudget[]>(
      `budgets_${userId}`
    ) || [];
    
    // Return all budgets for this user
    return budgets;
  }

  async getBudget(categoryId: string, month: string, userId: string): Promise<StoredBudget | null> {
    const budgets = await this.getAllBudgets(userId);
    return budgets.find(b => b.categoryId === categoryId && b.month === month) || null;
  }

  async createOrUpdateBudget(data: CreateBudgetDto, userId: string): Promise<StoredBudget> {
    this.validateMonth(data.month);
    this.validateAmount(data.amount);

    const budgets = await this.getAllBudgets(userId);
    
    // Check if budget already exists for this category and month
    const existingIndex = budgets.findIndex(
      b => b.categoryId === data.categoryId && b.month === data.month
    );

    const now = new Date();
    
    if (existingIndex !== -1) {
      // Update existing budget
      budgets[existingIndex] = {
        ...budgets[existingIndex],
        amount: data.amount,
        updatedAt: now
      };
      await this.dataService.saveData(`budgets_${userId}`, budgets);
      return budgets[existingIndex];
    } else {
      // Create new budget
      const newBudget: StoredBudget = {
        id: uuidv4(),
        userId,
        categoryId: data.categoryId,
        month: data.month,
        amount: data.amount,
        createdAt: now,
        updatedAt: now
      };
      budgets.push(newBudget);
      await this.dataService.saveData(`budgets_${userId}`, budgets);
      return newBudget;
    }
  }

  async deleteBudget(id: string, userId: string): Promise<void> {
    const budgets = await this.getAllBudgets(userId);
    const filteredBudgets = budgets.filter(b => b.id !== id);
    await this.dataService.saveData(`budgets_${userId}`, filteredBudgets);
  }

  async getMonthlyBudgets(month: string, userId: string): Promise<StoredBudget[]> {
    this.validateMonth(month);
    const budgets = await this.getAllBudgets(userId);
    return budgets.filter(b => b.month === month);
  }

  async getTotalMonthlyBudget(month: string, userId: string): Promise<number> {
    const monthlyBudgets = await this.getMonthlyBudgets(month, userId);
    return monthlyBudgets.reduce((total, budget) => total + budget.amount, 0);
  }

  async copyBudgets(fromMonth: string, toMonth: string, userId: string): Promise<StoredBudget[]> {
    this.validateMonth(fromMonth);
    this.validateMonth(toMonth);

    const sourceBudgets = await this.getMonthlyBudgets(fromMonth, userId);
    const copiedBudgets: StoredBudget[] = [];

    for (const sourceBudget of sourceBudgets) {
      const copiedBudget = await this.createOrUpdateBudget({
        categoryId: sourceBudget.categoryId,
        month: toMonth,
        amount: sourceBudget.amount
      }, userId);
      copiedBudgets.push(copiedBudget);
    }

    return copiedBudgets;
  }

  async getBudgetVsActual(
    categoryId: string,
    month: string,
    actualAmount: number,
    userId: string
  ): Promise<BudgetComparison | null> {
    // Check if category is budgetable (excludes only transfers)
    if (this.getCategoriesCallback) {
      const categories = await this.getCategoriesCallback(userId);
      if (!isBudgetableCategory(categoryId, categories)) {
        return null;
      }
      
      const budgetType = getBudgetType(categoryId, categories);
      const isIncomeCategory = budgetType === 'income';
      
      const budget = await this.getBudget(categoryId, month, userId);
      const budgeted = budget?.amount || 0;
      
      // For income categories, we want to handle inverse logic:
      // - remaining = actual - budgeted (positive remaining = good for income)
      // - isOverBudget = actual < budgeted (under target is "bad" for income)
      let remaining: number;
      let isOverBudget: boolean;
      
      if (isIncomeCategory) {
        // Income: exceeding budget is good, falling short is bad
        remaining = actualAmount - budgeted; // positive = over target (good)
        isOverBudget = actualAmount < budgeted; // under target is "over budget" semantically
      } else {
        // Expense: normal logic - under budget is good, over is bad
        remaining = budgeted - actualAmount; // positive = under budget (good)
        isOverBudget = actualAmount > budgeted || (budgeted === 0 && actualAmount > 0);
      }
      
      const percentUsed = budgeted > 0 ? (Math.abs(actualAmount) / budgeted) * 100 : 0;

      return {
        categoryId,
        month,
        budgeted,
        actual: actualAmount,
        remaining,
        percentUsed: Math.round(percentUsed),
        isOverBudget,
        budgetType,
        isIncomeCategory
      };
    }
    
    // Fallback for when no categories callback is available
    // Default to expense logic
    const budget = await this.getBudget(categoryId, month, userId);
    const budgeted = budget?.amount || 0;
    const remaining = budgeted - actualAmount;
    const percentUsed = budgeted > 0 ? (actualAmount / budgeted) * 100 : 0;

    return {
      categoryId,
      month,
      budgeted,
      actual: actualAmount,
      remaining,
      percentUsed: Math.round(percentUsed),
      isOverBudget: actualAmount > budgeted || (budgeted === 0 && actualAmount > 0),
      budgetType: 'expense' as BudgetType,
      isIncomeCategory: false
    };
  }

  async getMonthlyBudgetVsActual(
    month: string,
    actuals: Map<string, number>,
    userId: string,
    hiddenCategoryIds?: Set<string>
  ): Promise<BudgetComparison[]> {
    const budgets = await this.getMonthlyBudgets(month, userId);
    const comparisons: BudgetComparison[] = [];

    // Get categories for budget type detection and hierarchy traversal
    let categoryLookup: Map<string, Category> | null = null;
    if (this.getCategoriesCallback) {
      const categories = await this.getCategoriesCallback(userId);
      categoryLookup = createCategoryLookup(categories);
    }

    // Process budgeted categories (including both income and expense categories, excluding only hidden)
    for (const budget of budgets) {
      // Skip non-budgetable categories (transfers)
      const isBudgetable = categoryLookup 
        ? isBudgetableCategory(budget.categoryId, categoryLookup.get(budget.categoryId) ? Array.from(categoryLookup.values()) : [])
        : !budget.categoryId.startsWith('TRANSFER_');
      
      if (!isBudgetable) {
        continue;
      }
      
      // Skip hidden categories if hiddenCategoryIds set is provided
      if (hiddenCategoryIds && hiddenCategoryIds.has(budget.categoryId)) {
        continue;
      }
      
      const actual = actuals.get(budget.categoryId) || 0;
      const comparison = await this.getBudgetVsActual(budget.categoryId, month, actual, userId);
      if (comparison) {
        comparisons.push(comparison);
      }
    }

    // Process unbudgeted categories with actuals (including both income and expense, excluding only transfers and hidden)
    for (const [categoryId, actual] of actuals) {
      // Skip non-budgetable categories (transfers)
      const isBudgetable = categoryLookup 
        ? isBudgetableCategory(categoryId, Array.from(categoryLookup.values()))
        : !categoryId.startsWith('TRANSFER_');
        
      if (!isBudgetable) {
        continue;
      }
      
      // Skip hidden categories if hiddenCategoryIds set is provided
      if (hiddenCategoryIds && hiddenCategoryIds.has(categoryId)) {
        continue;
      }
      
      const hasBudget = budgets.some(b => b.categoryId === categoryId);
      if (!hasBudget) {
        const comparison = await this.getBudgetVsActual(categoryId, month, actual, userId);
        if (comparison) {
          comparisons.push(comparison);
        }
      }
    }

    return comparisons;
  }

  async getCategoryBudgetHistory(
    categoryId: string,
    startMonth: string,
    endMonth: string,
    userId: string
  ): Promise<StoredBudget[]> {
    this.validateMonth(startMonth);
    this.validateMonth(endMonth);

    const budgets = await this.getAllBudgets(userId);
    return budgets
      .filter(b => 
        b.categoryId === categoryId &&
        b.month >= startMonth &&
        b.month <= endMonth
      )
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  async getAverageBudget(
    categoryId: string,
    startMonth: string,
    endMonth: string,
    userId: string
  ): Promise<number> {
    const history = await this.getCategoryBudgetHistory(categoryId, startMonth, endMonth, userId);
    
    if (history.length === 0) {
      return 0;
    }

    const total = history.reduce((sum, budget) => sum + budget.amount, 0);
    return Math.round(total / history.length);
  }

  async calculateRollover(
    categoryId: string,
    month: string,
    actualAmount: number,
    userId: string
  ): Promise<number> {
    const budget = await this.getBudget(categoryId, month, userId);
    
    if (!budget) {
      return 0;
    }

    const unused = budget.amount - actualAmount;
    return Math.max(0, unused); // Only positive rollover
  }

  async applyRollover(
    categoryId: string,
    month: string,
    rolloverAmount: number,
    userId: string
  ): Promise<StoredBudget> {
    const budget = await this.getBudget(categoryId, month, userId);
    
    if (!budget) {
      throw new Error('Budget not found for applying rollover');
    }

    return this.createOrUpdateBudget({
      categoryId,
      month,
      amount: budget.amount + rolloverAmount
    }, userId);
  }

  async getBudgetsByCategory(categoryId: string, userId: string): Promise<StoredBudget[]> {
    const budgets = await this.getAllBudgets(userId);
    return budgets
      .filter(b => b.categoryId === categoryId)
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  async deleteBudgetsByCategory(categoryId: string, userId: string): Promise<void> {
    const budgets = await this.getAllBudgets(userId);
    const filteredBudgets = budgets.filter(b => b.categoryId !== categoryId);
    await this.dataService.saveData(`budgets_${userId}`, filteredBudgets);
  }

  async hasBudgetsForCategory(categoryId: string, userId: string): Promise<boolean> {
    const budgets = await this.getAllBudgets(userId);
    return budgets.some(b => b.categoryId === categoryId);
  }

  async getDistinctBudgetMonths(userId: string): Promise<{ month: string; count: number }[]> {
    const budgets = await this.getAllBudgets(userId);
    
    // Group budgets by month and count them
    const monthMap = new Map<string, number>();
    budgets.forEach(budget => {
      const count = monthMap.get(budget.month) || 0;
      monthMap.set(budget.month, count + 1);
    });
    
    // Convert to array and sort by month descending (most recent first)
    const months = Array.from(monthMap.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => b.month.localeCompare(a.month));
    
    return months;
  }
}

// Export singleton instance
let budgetServiceInstance: BudgetService | null = null;

export function getBudgetService(
  dataService?: DataService, 
  getCategoriesCallback?: (userId: string) => Promise<Category[]>
): BudgetService {
  if (!budgetServiceInstance) {
    if (!dataService) {
      throw new Error('DataService must be provided when creating BudgetService instance');
    }
    budgetServiceInstance = new BudgetService(dataService, getCategoriesCallback);
  }
  return budgetServiceInstance;
}