import { v4 as uuidv4 } from 'uuid';
import { MonthlyBudget } from '../../../shared/types';
import { DataService } from './dataService';

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
}

export class BudgetService {
  constructor(private dataService: DataService) {}

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

  async getAllBudgets(userId?: string): Promise<MonthlyBudget[]> {
    return this.dataService.getBudgets(userId);
  }

  async getBudget(categoryId: string, month: string, userId?: string): Promise<MonthlyBudget | null> {
    const budgets = await this.dataService.getBudgets(userId);
    return budgets.find(b => b.categoryId === categoryId && b.month === month) || null;
  }

  async createOrUpdateBudget(data: CreateBudgetDto, userId?: string): Promise<MonthlyBudget> {
    this.validateMonth(data.month);
    this.validateAmount(data.amount);

    const budgets = await this.dataService.getBudgets(userId);
    
    // Check if budget already exists for this category and month
    const existingIndex = budgets.findIndex(
      b => b.categoryId === data.categoryId && b.month === data.month
    );

    if (existingIndex !== -1) {
      // Update existing budget
      budgets[existingIndex] = {
        ...budgets[existingIndex],
        amount: data.amount
      };
      await this.dataService.saveBudgets(budgets, userId);
      return budgets[existingIndex];
    } else {
      // Create new budget
      const newBudget: MonthlyBudget = {
        id: uuidv4(),
        categoryId: data.categoryId,
        month: data.month,
        amount: data.amount
      };
      budgets.push(newBudget);
      await this.dataService.saveBudgets(budgets, userId);
      return newBudget;
    }
  }

  async deleteBudget(id: string, userId?: string): Promise<void> {
    const budgets = await this.dataService.getBudgets(userId);
    const filteredBudgets = budgets.filter(b => b.id !== id);
    await this.dataService.saveBudgets(filteredBudgets, userId);
  }

  async getMonthlyBudgets(month: string, userId?: string): Promise<MonthlyBudget[]> {
    this.validateMonth(month);
    const budgets = await this.dataService.getBudgets(userId);
    return budgets.filter(b => b.month === month);
  }

  async getTotalMonthlyBudget(month: string, userId?: string): Promise<number> {
    const monthlyBudgets = await this.getMonthlyBudgets(month, userId);
    return monthlyBudgets.reduce((total, budget) => total + budget.amount, 0);
  }

  async copyBudgets(fromMonth: string, toMonth: string, userId?: string): Promise<MonthlyBudget[]> {
    this.validateMonth(fromMonth);
    this.validateMonth(toMonth);

    const sourceBudgets = await this.getMonthlyBudgets(fromMonth, userId);
    const copiedBudgets: MonthlyBudget[] = [];

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
    userId?: string
  ): Promise<BudgetComparison> {
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
      isOverBudget: actualAmount > budgeted || (budgeted === 0 && actualAmount > 0)
    };
  }

  async getMonthlyBudgetVsActual(
    month: string,
    actuals: Map<string, number>,
    userId?: string
  ): Promise<BudgetComparison[]> {
    const budgets = await this.getMonthlyBudgets(month, userId);
    const comparisons: BudgetComparison[] = [];

    // Process budgeted categories
    for (const budget of budgets) {
      const actual = actuals.get(budget.categoryId) || 0;
      const comparison = await this.getBudgetVsActual(budget.categoryId, month, actual, userId);
      comparisons.push(comparison);
    }

    // Process unbudgeted categories with actuals
    for (const [categoryId, actual] of actuals) {
      const hasBudget = budgets.some(b => b.categoryId === categoryId);
      if (!hasBudget) {
        const comparison = await this.getBudgetVsActual(categoryId, month, actual, userId);
        comparisons.push(comparison);
      }
    }

    return comparisons;
  }

  async getCategoryBudgetHistory(
    categoryId: string,
    startMonth: string,
    endMonth: string,
    userId?: string
  ): Promise<MonthlyBudget[]> {
    this.validateMonth(startMonth);
    this.validateMonth(endMonth);

    const budgets = await this.dataService.getBudgets(userId);
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
    userId?: string
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
    userId?: string
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
    userId?: string
  ): Promise<MonthlyBudget> {
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

  async getBudgetsByCategory(categoryId: string, userId?: string): Promise<MonthlyBudget[]> {
    const budgets = await this.dataService.getBudgets(userId);
    return budgets
      .filter(b => b.categoryId === categoryId)
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  async deleteBudgetsByCategory(categoryId: string, userId?: string): Promise<void> {
    const budgets = await this.dataService.getBudgets(userId);
    const filteredBudgets = budgets.filter(b => b.categoryId !== categoryId);
    await this.dataService.saveBudgets(filteredBudgets, userId);
  }
}

// Export singleton instance
let budgetServiceInstance: BudgetService | null = null;

export function getBudgetService(dataService?: DataService): BudgetService {
  if (!budgetServiceInstance) {
    if (!dataService) {
      throw new Error('DataService must be provided when creating BudgetService instance');
    }
    budgetServiceInstance = new BudgetService(dataService);
  }
  return budgetServiceInstance;
}