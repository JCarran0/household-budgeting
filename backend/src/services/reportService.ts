/**
 * Reporting Service
 * 
 * Generates financial reports and analytics
 */

import { DataService } from './dataService';
import { StoredTransaction } from './transactionService';
import { Category } from '../../../shared/types';
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import { calculateIncome, calculateExpenses, calculateNetCashFlow, calculateSavingsRate } from '../../../shared/utils/transactionCalculations';

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
      // Create a set of hidden category IDs including subcategories of hidden parents
      const hiddenCategoryIds = this.getEffectivelyHiddenCategoryIds(categories);
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
      // Create a set of hidden category IDs including subcategories of hidden parents
      const hiddenCategoryIds = this.getEffectivelyHiddenCategoryIds(categories);

      // Find the Income parent category (Plaid PFC standard category)
      const incomeParentCategory = categories.find(c => 
        !c.parentId && 
        (c.name.toLowerCase().includes('income') || c.id.includes('INCOME') || c.id === 'INCOME')
      );
      
      if (!incomeParentCategory) {
        // If no Income parent category found, return empty result
        return { success: true, breakdown: [], total: 0 };
      }
      
      // Get all income category IDs (parent + children)
      const incomeSubcategories = categories.filter(c => c.parentId === incomeParentCategory.id);
      const incomeCategoryIds = new Set([
        incomeParentCategory.id,
        ...incomeSubcategories.map(c => c.id)
      ]);

      // Filter transactions for income (negative amounts from income categories only, excluding hidden categories)
      const filteredTransactions = transactions.filter(t => 
        t.date >= startDate && 
        t.date <= endDate && 
        !t.isHidden &&
        !t.pending &&
        t.amount < 0 && // Income only (negative amounts)
        t.categoryId && incomeCategoryIds.has(t.categoryId) && // Only income category transactions
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
        // Process only the Income parent category
        const parent = incomeParentCategory;
        const subcategories = incomeSubcategories;
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
   * Get category breakdown for a period (excludes savings subcategories)
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
      // Create a set of hidden category IDs including subcategories of hidden parents
      const hiddenCategoryIds = this.getEffectivelyHiddenCategoryIds(categories);
      // Also exclude savings subcategories from spending breakdown
      const savingsSubcategoryIds = this.getSavingsSubcategoryIds(categories);

      // Filter transactions (excluding hidden categories and savings subcategories)
      const filteredTransactions = transactions.filter(t => 
        t.date >= startDate && 
        t.date <= endDate && 
        !t.isHidden &&
        !t.pending &&
        t.amount > 0 && // Expenses only
        (!t.categoryId || !hiddenCategoryIds.has(t.categoryId)) && // Exclude hidden categories
        (!t.categoryId || !savingsSubcategoryIds.has(t.categoryId)) // Exclude savings subcategories
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
   * Get savings category breakdown for a period (only savings subcategories)
   */
  async getSavingsCategoryBreakdown(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<CategoryBreakdownResult> {
    try {
      const transactions = await this.dataService.getData<StoredTransaction[]>(
        `transactions_${userId}`
      ) || [];
      
      const categories = await this.dataService.getCategories(userId);
      // Get savings subcategories
      const savingsSubcategoryIds = this.getSavingsSubcategoryIds(categories);

      // Filter transactions for savings subcategories only
      const filteredTransactions = transactions.filter(t => 
        t.date >= startDate && 
        t.date <= endDate && 
        !t.isHidden &&
        !t.pending &&
        t.amount > 0 && // Expenses only (savings contributions are positive)
        t.categoryId && savingsSubcategoryIds.has(t.categoryId) // Only savings subcategories
      );

      // Calculate total
      const total = filteredTransactions.reduce((sum, t) => sum + t.amount, 0);

      // Group by category
      const categorySpending = new Map<string, { amount: number; count: number }>();

      for (const txn of filteredTransactions) {
        const categoryId = txn.categoryId!; // We know it exists from filter
        const current = categorySpending.get(categoryId) || { amount: 0, count: 0 };
        categorySpending.set(categoryId, {
          amount: current.amount + txn.amount,
          count: current.count + 1
        });
      }

      // Build flat breakdown (savings are all subcategories)
      const breakdown: CategoryBreakdown[] = [];
      for (const [categoryId, data] of categorySpending) {
        const category = categories.find(c => c.id === categoryId);
        breakdown.push({
          categoryId,
          categoryName: category?.name || 'Unknown Savings',
          amount: data.amount,
          percentage: total > 0 ? (data.amount / total) * 100 : 0,
          transactionCount: data.count
        });
      }

      // Sort by amount descending
      breakdown.sort((a, b) => b.amount - a.amount);

      return { success: true, breakdown, total };
    } catch (error) {
      console.error('Error getting savings breakdown:', error);
      return { success: false, error: 'Failed to get savings breakdown' };
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
      // Create a set of hidden category IDs including subcategories of hidden parents
      const hiddenCategoryIds = this.getEffectivelyHiddenCategoryIds(categories);

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

        // Calculate using shared utilities (excludes transfers)
        const income = calculateIncome(monthTransactions);
        const expenses = calculateExpenses(monthTransactions);
        const netFlow = calculateNetCashFlow(monthTransactions);
        const savingsRate = calculateSavingsRate(monthTransactions);

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
      // Create a set of hidden category IDs including subcategories of hidden parents
      const hiddenCategoryIds = this.getEffectivelyHiddenCategoryIds(categories);

      const ytdTransactions = transactions.filter(t => 
        t.date >= startDate && 
        t.date <= endDate && 
        !t.isHidden &&
        !t.pending &&
        (!t.categoryId || !hiddenCategoryIds.has(t.categoryId)) // Exclude hidden categories
      );

      // Calculate using shared utilities (excludes transfers)
      const totalIncome = calculateIncome(ytdTransactions);
      const totalExpenses = calculateExpenses(ytdTransactions);
      const netIncome = calculateNetCashFlow(ytdTransactions);
      
      // Calculate months with complete data
      let monthsWithData = 0;
      let averageMonthlyIncome = 0;
      let averageMonthlyExpenses = 0;

      if (ytdTransactions.length > 0) {
        // Group transactions by month to identify which months have data
        const monthsWithTransactions = new Set<string>();
        const monthlyTotals = new Map<string, { income: number; expenses: number }>();
        
        for (const txn of ytdTransactions) {
          const monthKey = txn.date.substring(0, 7); // YYYY-MM format
          monthsWithTransactions.add(monthKey);
          
          const current = monthlyTotals.get(monthKey) || { income: 0, expenses: 0 };
          if (txn.amount < 0) {
            current.income += Math.abs(txn.amount);
          } else {
            current.expenses += txn.amount;
          }
          monthlyTotals.set(monthKey, current);
        }
        
        // Determine which months are complete
        const currentDate = new Date();
        const currentMonth = format(currentDate, 'yyyy-MM');
        
        // Count complete months (exclude current month as it's partial)
        let completeMonthsIncome = 0;
        let completeMonthsExpenses = 0;
        
        for (const [month, totals] of monthlyTotals) {
          if (month < currentMonth) {
            // This is a complete month
            monthsWithData++;
            completeMonthsIncome += totals.income;
            completeMonthsExpenses += totals.expenses;
          }
          // Current month data is included in totals but not in averages
        }
        
        // Calculate averages based on complete months only
        if (monthsWithData > 0) {
          averageMonthlyIncome = completeMonthsIncome / monthsWithData;
          averageMonthlyExpenses = completeMonthsExpenses / monthsWithData;
        } else {
          // No complete months - don't show averages
          averageMonthlyIncome = 0;
          averageMonthlyExpenses = 0;
        }
      }
      const savingsRate = totalIncome > 0 ? (netIncome / totalIncome) * 100 : 0;

      // Get top spending categories
      const categorySpending = new Map<string, number>();
      
      for (const txn of ytdTransactions.filter(t => t.amount > 0)) {
        const categoryId = txn.categoryId || 'uncategorized';
        const current = categorySpending.get(categoryId) || 0;
        categorySpending.set(categoryId, current + txn.amount);
      }

      const topCategories = Array.from(categorySpending.entries())
        .filter(([categoryId]) => !hiddenCategoryIds.has(categoryId)) // Exclude hidden categories
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

  /**
   * Helper: Get all category IDs that should be considered hidden
   * Includes both directly hidden categories and subcategories of hidden parents
   */
  private getEffectivelyHiddenCategoryIds(categories: Category[]): Set<string> {
    const hiddenIds = new Set<string>();
    
    // First, add directly hidden categories
    categories.filter(c => c.isHidden).forEach(c => hiddenIds.add(c.id));
    
    // Then, add subcategories of hidden parents
    categories.forEach(category => {
      if (category.parentId && hiddenIds.has(category.parentId)) {
        hiddenIds.add(category.id);
      }
    });
    
    return hiddenIds;
  }

  /**
   * Helper: Get all savings subcategory IDs
   */
  private getSavingsSubcategoryIds(categories: Category[]): Set<string> {
    const savingsSubcategoryIds = new Set<string>();
    
    // Find all subcategories of the CUSTOM_SAVINGS parent category
    categories.forEach(category => {
      if (category.parentId === 'CUSTOM_SAVINGS') {
        savingsSubcategoryIds.add(category.id);
      }
    });
    
    return savingsSubcategoryIds;
  }
}