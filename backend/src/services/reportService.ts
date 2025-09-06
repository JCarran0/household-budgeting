/**
 * Reporting Service
 * 
 * Generates financial reports and analytics
 */

import { DataService } from './dataService';
import { StoredTransaction } from './transactionService';
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';

// Report types
export interface SpendingTrend {
  month: string;
  categoryId: string;
  categoryName: string;
  amount: number;
  transactionCount: number;
}

export interface CategoryBreakdown {
  categoryId: string;
  categoryName: string;
  amount: number;
  percentage: number;
  transactionCount: number;
  subcategories?: CategoryBreakdown[];
}

export interface CashFlowSummary {
  month: string;
  income: number;
  expenses: number;
  netFlow: number;
  savingsRate: number;
}

export interface CashFlowProjection {
  month: string;
  projectedIncome: number;
  projectedExpenses: number;
  projectedNetFlow: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface YearToDateSummary {
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  averageMonthlyIncome: number;
  averageMonthlyExpenses: number;
  savingsRate: number;
  topCategories: Array<{
    categoryId: string;
    categoryName: string;
    amount: number;
    percentage: number;
  }>;
}

// Result types
export interface SpendingTrendsResult {
  success: boolean;
  trends?: SpendingTrend[];
  error?: string;
}

export interface CategoryBreakdownResult {
  success: boolean;
  breakdown?: CategoryBreakdown[];
  total?: number;
  error?: string;
}

export interface CashFlowResult {
  success: boolean;
  summary?: CashFlowSummary[];
  error?: string;
}

export interface ProjectionResult {
  success: boolean;
  projections?: CashFlowProjection[];
  error?: string;
}

export interface YTDResult {
  success: boolean;
  summary?: YearToDateSummary;
  error?: string;
}

export class ReportService {
  constructor(private dataService: DataService) {}

  /**
   * Get spending trends by category over time
   */
  async getSpendingTrends(
    userId: string,
    startMonth: string,
    endMonth: string,
    categoryIds?: string[]
  ): Promise<SpendingTrendsResult> {
    try {
      const transactions = await this.dataService.getData<StoredTransaction[]>(
        `transactions_${userId}`
      ) || [];
      
      const categories = await this.dataService.getCategories(userId);

      const categoryMap = new Map(categories.map(c => [c.id, c.name]));
      // Create a set of hidden category IDs for efficient lookup
      const hiddenCategoryIds = new Set(categories.filter(c => c.isHidden).map(c => c.id));
      const trends: SpendingTrend[] = [];

      // Generate month list
      const months = this.getMonthRange(startMonth, endMonth);

      for (const month of months) {
        const monthStart = startOfMonth(new Date(month + '-01')).toISOString().split('T')[0];
        const monthEnd = endOfMonth(new Date(month + '-01')).toISOString().split('T')[0];

        // Filter transactions for this month (excluding hidden categories)
        const monthTransactions = transactions.filter(t => 
          t.date >= monthStart && 
          t.date <= monthEnd && 
          !t.isHidden &&
          !t.pending &&
          t.amount > 0 && // Expenses only
          (!t.categoryId || !hiddenCategoryIds.has(t.categoryId)) // Exclude hidden categories
        );

        // Group by category
        const categorySpending = new Map<string, { amount: number; count: number }>();

        for (const txn of monthTransactions) {
          const categoryId = txn.categoryId || 'uncategorized';
          
          // Skip if filtering by categories and not in list
          if (categoryIds && categoryIds.length > 0 && !categoryIds.includes(categoryId)) {
            continue;
          }

          const current = categorySpending.get(categoryId) || { amount: 0, count: 0 };
          categorySpending.set(categoryId, {
            amount: current.amount + txn.amount,
            count: current.count + 1
          });
        }

        // Create trend entries
        for (const [categoryId, data] of categorySpending) {
          trends.push({
            month,
            categoryId,
            categoryName: categoryMap.get(categoryId) || 'Uncategorized',
            amount: data.amount,
            transactionCount: data.count
          });
        }
      }

      return { success: true, trends };
    } catch (error) {
      console.error('Error getting spending trends:', error);
      return { success: false, error: 'Failed to get spending trends' };
    }
  }

  /**
   * Get income category breakdown for a period
   */
  async getIncomeCategoryBreakdown(
    userId: string,
    startDate: string,
    endDate: string,
    includeSubcategories: boolean = true
  ): Promise<CategoryBreakdownResult> {
    try {
      const transactions = await this.dataService.getData<StoredTransaction[]>(
        `transactions_${userId}`
      ) || [];
      
      const categories = await this.dataService.getCategories(userId);
      // Create a set of hidden category IDs for efficient lookup
      const hiddenCategoryIds = new Set(categories.filter(c => c.isHidden).map(c => c.id));

      // Filter transactions for income (negative amounts, excluding hidden categories)
      const filteredTransactions = transactions.filter(t => 
        t.date >= startDate && 
        t.date <= endDate && 
        !t.isHidden &&
        !t.pending &&
        t.amount < 0 && // Income only (negative amounts)
        (!t.categoryId || !hiddenCategoryIds.has(t.categoryId)) // Exclude hidden categories
      );

      // Calculate total income (absolute value)
      const total = filteredTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);

      // Group by category
      const categoryIncome = new Map<string, { amount: number; count: number }>();

      for (const txn of filteredTransactions) {
        const categoryId = txn.categoryId || 'uncategorized';
        const current = categoryIncome.get(categoryId) || { amount: 0, count: 0 };
        categoryIncome.set(categoryId, {
          amount: current.amount + Math.abs(txn.amount), // Use absolute value for income
          count: current.count + 1
        });
      }

      // Build hierarchy if needed
      const breakdown: CategoryBreakdown[] = [];
      
      if (includeSubcategories) {
        // Group by parent categories
        const parentCategories = categories.filter(c => !c.parentId);
        
        for (const parent of parentCategories) {
          const subcategories = categories.filter(c => c.parentId === parent.id);
          const subcategoryBreakdown: CategoryBreakdown[] = [];
          let parentAmount = 0;
          let parentCount = 0;

          // Add parent's own income if any
          const parentIncome = categoryIncome.get(parent.id);
          if (parentIncome) {
            parentAmount += parentIncome.amount;
            parentCount += parentIncome.count;
          }

          // Add subcategories
          for (const sub of subcategories) {
            const subIncome = categoryIncome.get(sub.id);
            if (subIncome) {
              parentAmount += subIncome.amount;
              parentCount += subIncome.count;
              subcategoryBreakdown.push({
                categoryId: sub.id,
                categoryName: sub.name,
                amount: subIncome.amount,
                percentage: total > 0 ? (subIncome.amount / total) * 100 : 0,
                transactionCount: subIncome.count
              });
            }
          }

          if (parentAmount > 0) {
            breakdown.push({
              categoryId: parent.id,
              categoryName: parent.name,
              amount: parentAmount,
              percentage: total > 0 ? (parentAmount / total) * 100 : 0,
              transactionCount: parentCount,
              subcategories: subcategoryBreakdown.length > 0 ? subcategoryBreakdown : undefined
            });
          }
        }

        // Add uncategorized income if any
        const uncategorized = categoryIncome.get('uncategorized');
        if (uncategorized) {
          breakdown.push({
            categoryId: 'uncategorized',
            categoryName: 'Uncategorized',
            amount: uncategorized.amount,
            percentage: total > 0 ? (uncategorized.amount / total) * 100 : 0,
            transactionCount: uncategorized.count
          });
        }
      } else {
        // Flat list
        for (const [categoryId, data] of categoryIncome) {
          const category = categories.find(c => c.id === categoryId);
          breakdown.push({
            categoryId,
            categoryName: category?.name || 'Uncategorized',
            amount: data.amount,
            percentage: total > 0 ? (data.amount / total) * 100 : 0,
            transactionCount: data.count
          });
        }
      }

      // Sort by amount descending
      breakdown.sort((a, b) => b.amount - a.amount);

      return { success: true, breakdown, total };
    } catch (error) {
      console.error('Error getting income breakdown:', error);
      return { success: false, error: 'Failed to get income breakdown' };
    }
  }

  /**
   * Get category breakdown for a period
   */
  async getCategoryBreakdown(
    userId: string,
    startDate: string,
    endDate: string,
    includeSubcategories: boolean = true
  ): Promise<CategoryBreakdownResult> {
    try {
      const transactions = await this.dataService.getData<StoredTransaction[]>(
        `transactions_${userId}`
      ) || [];
      
      const categories = await this.dataService.getCategories(userId);
      // Create a set of hidden category IDs for efficient lookup
      const hiddenCategoryIds = new Set(categories.filter(c => c.isHidden).map(c => c.id));

      // Filter transactions (excluding hidden categories)
      const filteredTransactions = transactions.filter(t => 
        t.date >= startDate && 
        t.date <= endDate && 
        !t.isHidden &&
        !t.pending &&
        t.amount > 0 && // Expenses only
        (!t.categoryId || !hiddenCategoryIds.has(t.categoryId)) // Exclude hidden categories
      );

      // Calculate total
      const total = filteredTransactions.reduce((sum, t) => sum + t.amount, 0);

      // Group by category
      const categorySpending = new Map<string, { amount: number; count: number }>();

      for (const txn of filteredTransactions) {
        const categoryId = txn.categoryId || 'uncategorized';
        const current = categorySpending.get(categoryId) || { amount: 0, count: 0 };
        categorySpending.set(categoryId, {
          amount: current.amount + txn.amount,
          count: current.count + 1
        });
      }

      // Build hierarchy if needed
      const breakdown: CategoryBreakdown[] = [];
      
      if (includeSubcategories) {
        // Group by parent categories
        const parentCategories = categories.filter(c => !c.parentId);
        
        for (const parent of parentCategories) {
          const subcategories = categories.filter(c => c.parentId === parent.id);
          const subcategoryBreakdown: CategoryBreakdown[] = [];
          let parentAmount = 0;
          let parentCount = 0;

          // Add parent's own spending if any
          const parentSpending = categorySpending.get(parent.id);
          if (parentSpending) {
            parentAmount += parentSpending.amount;
            parentCount += parentSpending.count;
          }

          // Add subcategories
          for (const sub of subcategories) {
            const subSpending = categorySpending.get(sub.id);
            if (subSpending) {
              parentAmount += subSpending.amount;
              parentCount += subSpending.count;
              subcategoryBreakdown.push({
                categoryId: sub.id,
                categoryName: sub.name,
                amount: subSpending.amount,
                percentage: total > 0 ? (subSpending.amount / total) * 100 : 0,
                transactionCount: subSpending.count
              });
            }
          }

          if (parentAmount > 0) {
            breakdown.push({
              categoryId: parent.id,
              categoryName: parent.name,
              amount: parentAmount,
              percentage: total > 0 ? (parentAmount / total) * 100 : 0,
              transactionCount: parentCount,
              subcategories: subcategoryBreakdown.length > 0 ? subcategoryBreakdown : undefined
            });
          }
        }

        // Add uncategorized if any
        const uncategorized = categorySpending.get('uncategorized');
        if (uncategorized) {
          breakdown.push({
            categoryId: 'uncategorized',
            categoryName: 'Uncategorized',
            amount: uncategorized.amount,
            percentage: total > 0 ? (uncategorized.amount / total) * 100 : 0,
            transactionCount: uncategorized.count
          });
        }
      } else {
        // Flat list
        for (const [categoryId, data] of categorySpending) {
          const category = categories.find(c => c.id === categoryId);
          breakdown.push({
            categoryId,
            categoryName: category?.name || 'Uncategorized',
            amount: data.amount,
            percentage: total > 0 ? (data.amount / total) * 100 : 0,
            transactionCount: data.count
          });
        }
      }

      // Sort by amount descending
      breakdown.sort((a, b) => b.amount - a.amount);

      return { success: true, breakdown, total };
    } catch (error) {
      console.error('Error getting category breakdown:', error);
      return { success: false, error: 'Failed to get category breakdown' };
    }
  }

  /**
   * Get cash flow summary
   */
  async getCashFlowSummary(
    userId: string,
    startMonth: string,
    endMonth: string
  ): Promise<CashFlowResult> {
    try {
      const transactions = await this.dataService.getData<StoredTransaction[]>(
        `transactions_${userId}`
      ) || [];
      
      const categories = await this.dataService.getCategories(userId);
      // Create a set of hidden category IDs for efficient lookup
      const hiddenCategoryIds = new Set(categories.filter(c => c.isHidden).map(c => c.id));

      const months = this.getMonthRange(startMonth, endMonth);
      const summary: CashFlowSummary[] = [];

      for (const month of months) {
        const monthStart = startOfMonth(new Date(month + '-01')).toISOString().split('T')[0];
        const monthEnd = endOfMonth(new Date(month + '-01')).toISOString().split('T')[0];

        const monthTransactions = transactions.filter(t => 
          t.date >= monthStart && 
          t.date <= monthEnd && 
          !t.isHidden &&
          !t.pending &&
          (!t.categoryId || !hiddenCategoryIds.has(t.categoryId)) // Exclude hidden categories
        );

        const income = monthTransactions
          .filter(t => t.amount < 0) // Negative amounts are income
          .reduce((sum, t) => sum + Math.abs(t.amount), 0);

        const expenses = monthTransactions
          .filter(t => t.amount > 0) // Positive amounts are expenses
          .reduce((sum, t) => sum + t.amount, 0);

        const netFlow = income - expenses;
        const savingsRate = income > 0 ? (netFlow / income) * 100 : 0;

        summary.push({
          month,
          income,
          expenses,
          netFlow,
          savingsRate
        });
      }

      return { success: true, summary };
    } catch (error) {
      console.error('Error getting cash flow summary:', error);
      return { success: false, error: 'Failed to get cash flow summary' };
    }
  }

  /**
   * Generate cash flow projections
   */
  async generateProjections(
    userId: string,
    monthsToProject: number = 6
  ): Promise<ProjectionResult> {
    try {
      // Get historical data (last 6 months)
      const today = new Date();
      const sixMonthsAgo = format(subMonths(today, 6), 'yyyy-MM');
      const lastMonth = format(subMonths(today, 1), 'yyyy-MM');

      const historicalResult = await this.getCashFlowSummary(userId, sixMonthsAgo, lastMonth);
      if (!historicalResult.success || !historicalResult.summary) {
        return { success: false, error: 'Failed to get historical data' };
      }

      const historical = historicalResult.summary;
      
      // Calculate averages and trends
      const avgIncome = historical.reduce((sum, m) => sum + m.income, 0) / historical.length;
      const avgExpenses = historical.reduce((sum, m) => sum + m.expenses, 0) / historical.length;
      
      // Calculate volatility for confidence
      const incomeStdDev = this.calculateStdDev(historical.map(m => m.income));
      const expenseStdDev = this.calculateStdDev(historical.map(m => m.expenses));
      
      // Generate projections
      const projections: CashFlowProjection[] = [];
      
      for (let i = 1; i <= monthsToProject; i++) {
        const projMonth = format(addMonths(today, i), 'yyyy-MM');
        
        // Simple projection using averages (could be enhanced with trends)
        const projectedIncome = avgIncome;
        const projectedExpenses = avgExpenses;
        const projectedNetFlow = projectedIncome - projectedExpenses;
        
        // Determine confidence based on volatility
        const volatility = (incomeStdDev / avgIncome + expenseStdDev / avgExpenses) / 2;
        let confidence: 'high' | 'medium' | 'low';
        if (volatility < 0.1) confidence = 'high';
        else if (volatility < 0.25) confidence = 'medium';
        else confidence = 'low';
        
        projections.push({
          month: projMonth,
          projectedIncome,
          projectedExpenses,
          projectedNetFlow,
          confidence
        });
      }

      return { success: true, projections };
    } catch (error) {
      console.error('Error generating projections:', error);
      return { success: false, error: 'Failed to generate projections' };
    }
  }

  /**
   * Get year-to-date summary
   */
  async getYearToDateSummary(userId: string): Promise<YTDResult> {
    try {
      const currentYear = new Date().getFullYear();
      const startDate = `${currentYear}-01-01`;
      const endDate = new Date().toISOString().split('T')[0];

      const transactions = await this.dataService.getData<StoredTransaction[]>(
        `transactions_${userId}`
      ) || [];
      
      const categories = await this.dataService.getCategories(userId);

      const ytdTransactions = transactions.filter(t => 
        t.date >= startDate && 
        t.date <= endDate && 
        !t.isHidden &&
        !t.pending
      );

      const totalIncome = ytdTransactions
        .filter(t => t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

      const totalExpenses = ytdTransactions
        .filter(t => t.amount > 0)
        .reduce((sum, t) => sum + t.amount, 0);

      const netIncome = totalIncome - totalExpenses;
      
      // Calculate months elapsed
      const monthsElapsed = new Date().getMonth() + 1;
      const averageMonthlyIncome = totalIncome / monthsElapsed;
      const averageMonthlyExpenses = totalExpenses / monthsElapsed;
      const savingsRate = totalIncome > 0 ? (netIncome / totalIncome) * 100 : 0;

      // Get top spending categories
      const categorySpending = new Map<string, number>();
      
      for (const txn of ytdTransactions.filter(t => t.amount > 0)) {
        const categoryId = txn.categoryId || 'uncategorized';
        const current = categorySpending.get(categoryId) || 0;
        categorySpending.set(categoryId, current + txn.amount);
      }

      const topCategories = Array.from(categorySpending.entries())
        .map(([categoryId, amount]) => {
          const category = categories.find(c => c.id === categoryId);
          return {
            categoryId,
            categoryName: category?.name || 'Uncategorized',
            amount,
            percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0
          };
        })
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5); // Top 5 categories

      return {
        success: true,
        summary: {
          totalIncome,
          totalExpenses,
          netIncome,
          averageMonthlyIncome,
          averageMonthlyExpenses,
          savingsRate,
          topCategories
        }
      };
    } catch (error) {
      console.error('Error getting YTD summary:', error);
      return { success: false, error: 'Failed to get YTD summary' };
    }
  }

  /**
   * Helper: Get month range
   */
  private getMonthRange(startMonth: string, endMonth: string): string[] {
    const months: string[] = [];
    let current = new Date(startMonth + '-01');
    const end = new Date(endMonth + '-01');

    while (current <= end) {
      months.push(format(current, 'yyyy-MM'));
      current = addMonths(current, 1);
    }

    return months;
  }

  /**
   * Helper: Calculate standard deviation
   */
  private calculateStdDev(values: number[]): number {
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - avg, 2));
    const avgSquaredDiff = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
    return Math.sqrt(avgSquaredDiff);
  }
}