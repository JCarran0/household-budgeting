/**
 * Reporting Service
 * 
 * Generates financial reports and analytics
 */

import { DataService } from './dataService';
import { ActualsOverrideService } from './actualsOverrideService';
import { StoredTransaction } from './transactionService';
import { MonthlyBudget } from '../shared/types';
import { format, subMonths, addMonths } from 'date-fns';
import { calculateIncome, calculateSavings, calculateSpending } from '../shared/utils/transactionCalculations';
import { etDateString, etMonthString, firstDayOfMonth, lastDayOfMonth } from '../shared/utils/easternTime';
import { Repository } from './repository';
import { getMonthRange, calculateStdDev, getEffectivelyHiddenCategoryIds } from './reportHelpers';
import { excludeRemoved } from './transactionReader';
import { buildIncomeBreakdown } from './reports/breakdowns/income';
import { buildCategoryBreakdown } from './reports/breakdowns/category';
import { buildSavingsBreakdown } from './reports/breakdowns/savings';
import { buildCashFlowOutlook } from './reports/cashflowProjections';

import { childLogger } from '../utils/logger';

const log = childLogger('reportService');

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
  expenses: number;   // spending only (excludes savings)
  savings: number;    // savings category transactions
  netCashflow: number;    // Net Cashflow = income − spending − savings (per SAVINGS-CATEGORY-BRD §2.6)
}

export interface CashFlowProjection {
  month: string;
  projectedIncome: number;
  projectedExpenses: number;
  /** Pre-Savings Net = projected income − projected spending. Projection does not model savings, so this is pre-savings, not Net Cashflow. Per SAVINGS-CATEGORY-BRD §2.6. */
  projectedPreSavingsNet: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface CashFlowOutlookProjection {
  month: string;
  budgetedCashflow: number | null;
  isBudgetExtrapolated: boolean;
  priorYearCashflow: number | null;
  averageCashflow: number;
}

export interface CashFlowOutlookResult {
  success: boolean;
  projections?: CashFlowOutlookProjection[];
  hasPriorYearData?: boolean;
  error?: string;
}

export interface YearToDateSummary {
  totalIncome: number;
  totalExpenses: number;
  /** Pre-Savings Net = totalIncome − totalExpenses (where totalExpenses is Spending; savings is excluded upstream by calculateSpending). Per SAVINGS-CATEGORY-BRD §2.6. */
  preSavingsNet: number;
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
  private transactionRepo: Repository<StoredTransaction>;

  constructor(
    private dataService: DataService,
    private actualsOverrideService?: ActualsOverrideService
  ) {
    this.transactionRepo = new Repository<StoredTransaction>(dataService, 'transactions');
  }

  /** Get all active transactions for a family, excluding removed pending holds */
  private async getActiveTransactions(familyId: string): Promise<StoredTransaction[]> {
    const all = await this.transactionRepo.getAll(familyId);
    return excludeRemoved(all);
  }

  /**
   * Get spending trends by category over time
   */
  async getSpendingTrends(
    familyId: string,
    startMonth: string,
    endMonth: string,
    categoryIds?: string[]
  ): Promise<SpendingTrendsResult> {
    try {
      const transactions = await this.getActiveTransactions(familyId);

      const categories = await this.dataService.getCategories(familyId);

      const categoryMap = new Map(categories.map(c => [c.id, c.name]));
      // Create a set of hidden category IDs including subcategories of hidden parents
      const hiddenCategoryIds = getEffectivelyHiddenCategoryIds(categories);
      const trends: SpendingTrend[] = [];

      // Generate month list
      const months = getMonthRange(startMonth, endMonth);

      for (const month of months) {
        // Parse month properly
        const [year, monthNum] = month.split('-').map(Number);
        const monthStart = firstDayOfMonth(year, monthNum - 1);
        const monthEnd = lastDayOfMonth(year, monthNum - 1);

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
      log.error({ err: error }, 'error getting spending trends');
      return { success: false, error: 'Failed to get spending trends' };
    }
  }

  /**
   * Get income category breakdown for a period
   */
  async getIncomeCategoryBreakdown(
    familyId: string,
    startDate: string,
    endDate: string,
    includeSubcategories: boolean = true
  ): Promise<CategoryBreakdownResult> {
    try {
      const transactions = await this.getActiveTransactions(familyId);
      const categories = await this.dataService.getCategories(familyId);
      const { breakdown, total } = buildIncomeBreakdown(
        transactions, categories, startDate, endDate, includeSubcategories
      );
      return { success: true, breakdown, total };
    } catch (error) {
      log.error({ err: error }, 'error getting income breakdown');
      return { success: false, error: 'Failed to get income breakdown' };
    }
  }

  /**
   * Get category breakdown for a period (excludes savings subcategories)
   */
  async getCategoryBreakdown(
    familyId: string,
    startDate: string,
    endDate: string,
    includeSubcategories: boolean = true
  ): Promise<CategoryBreakdownResult> {
    try {
      const transactions = await this.getActiveTransactions(familyId);
      const categories = await this.dataService.getCategories(familyId);
      const { breakdown, total } = buildCategoryBreakdown(
        transactions, categories, startDate, endDate, includeSubcategories
      );
      return { success: true, breakdown, total };
    } catch (error) {
      log.error({ err: error }, 'error getting category breakdown');
      return { success: false, error: 'Failed to get category breakdown' };
    }
  }

  /**
   * Get savings category breakdown for a period (only savings subcategories)
   */
  async getSavingsCategoryBreakdown(
    familyId: string,
    startDate: string,
    endDate: string
  ): Promise<CategoryBreakdownResult> {
    try {
      const transactions = await this.getActiveTransactions(familyId);
      const categories = await this.dataService.getCategories(familyId);
      const { breakdown, total } = buildSavingsBreakdown(
        transactions, categories, startDate, endDate
      );
      return { success: true, breakdown, total };
    } catch (error) {
      log.error({ err: error }, 'error getting savings breakdown');
      return { success: false, error: 'Failed to get savings breakdown' };
    }
  }

  /**
   * Get cash flow summary
   */
  async getCashFlowSummary(
    familyId: string,
    startMonth: string,
    endMonth: string
  ): Promise<CashFlowResult> {
    try {
      const transactions = await this.getActiveTransactions(familyId);

      const categories = await this.dataService.getCategories(familyId);
      // Create a set of hidden category IDs including subcategories of hidden parents
      const hiddenCategoryIds = getEffectivelyHiddenCategoryIds(categories);

      const months = getMonthRange(startMonth, endMonth);
      const summary: CashFlowSummary[] = [];

      for (const month of months) {
        // Check if there's an override for this month
        let income: number;
        let expenses: number;
        let savings: number;

        if (this.actualsOverrideService) {
          const monthlyActuals = await this.actualsOverrideService.getMonthlyActuals(familyId, month);

          if (monthlyActuals.hasOverride) {
            // Use override values — override data doesn't have per-category breakdown
            income = monthlyActuals.totalIncome;
            expenses = monthlyActuals.totalExpenses;
            savings = 0;
          } else {
            // Calculate from transactions
            const [year, monthNum] = month.split('-').map(Number);
            const monthStart = firstDayOfMonth(year, monthNum - 1);
            const monthEnd = lastDayOfMonth(year, monthNum - 1);

            const monthTransactions = transactions.filter(t =>
              t.date >= monthStart &&
              t.date <= monthEnd &&
              !t.isHidden &&
              !t.pending &&
              (!t.categoryId || !hiddenCategoryIds.has(t.categoryId)) // Exclude hidden categories
            );

            // Calculate using shared utilities (excludes transfers; signed accumulation nets refunds)
            income = calculateIncome(monthTransactions, categories);
            savings = calculateSavings(monthTransactions, categories);
            expenses = calculateSpending(monthTransactions, categories);
          }
        } else {
          // Fallback: calculate from transactions (no override service available)
          const [year, monthNum] = month.split('-').map(Number);
          const monthStart = firstDayOfMonth(year, monthNum - 1);
          const monthEnd = lastDayOfMonth(year, monthNum - 1);

          const monthTransactions = transactions.filter(t =>
            t.date >= monthStart &&
            t.date <= monthEnd &&
            !t.isHidden &&
            !t.pending &&
            (!t.categoryId || !hiddenCategoryIds.has(t.categoryId)) // Exclude hidden categories
          );

          // Calculate using shared utilities (excludes transfers; signed accumulation nets refunds)
          income = calculateIncome(monthTransactions, categories);
          savings = calculateSavings(monthTransactions, categories);
          expenses = calculateSpending(monthTransactions, categories);
        }

        summary.push({
          month,
          income,
          expenses,
          savings,
          netCashflow: income - expenses - savings,
        });
      }

      return { success: true, summary };
    } catch (error) {
      log.error({ err: error }, 'error getting cash flow summary');
      return { success: false, error: 'Failed to get cash flow summary' };
    }
  }

  /**
   * Generate cash flow projections
   */
  async generateProjections(
    familyId: string,
    monthsToProject: number = 6
  ): Promise<ProjectionResult> {
    try {
      // Get historical data (last 6 months)
      const today = new Date();
      const sixMonthsAgo = format(subMonths(today, 6), 'yyyy-MM');
      const lastMonth = format(subMonths(today, 1), 'yyyy-MM');

      const historicalResult = await this.getCashFlowSummary(familyId, sixMonthsAgo, lastMonth);
      if (!historicalResult.success || !historicalResult.summary) {
        return { success: false, error: 'Failed to get historical data' };
      }

      const historical = historicalResult.summary;
      
      // Calculate averages and trends
      const avgIncome = historical.reduce((sum, m) => sum + m.income, 0) / historical.length;
      const avgExpenses = historical.reduce((sum, m) => sum + m.expenses, 0) / historical.length;
      
      // Calculate volatility for confidence
      const incomeStdDev = calculateStdDev(historical.map(m => m.income));
      const expenseStdDev = calculateStdDev(historical.map(m => m.expenses));
      
      // Generate projections
      const projections: CashFlowProjection[] = [];
      
      for (let i = 1; i <= monthsToProject; i++) {
        const projMonth = format(addMonths(today, i), 'yyyy-MM');
        
        // Simple projection using averages (could be enhanced with trends)
        const projectedIncome = avgIncome;
        const projectedExpenses = avgExpenses;
        const projectedPreSavingsNet = projectedIncome - projectedExpenses;
        
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
          projectedPreSavingsNet,
          confidence
        });
      }

      return { success: true, projections };
    } catch (error) {
      log.error({ err: error }, 'error generating projections');
      return { success: false, error: 'Failed to generate projections' };
    }
  }

  /**
   * Generate cash flow outlook with budget comparison
   */
  async generateCashFlowProjections(
    familyId: string,
    monthsToProject: number = 6
  ): Promise<CashFlowOutlookResult> {
    try {
      const today = new Date();
      const categories = await this.dataService.getCategories(familyId);

      // Get last known budget for extrapolation (data-loading stays here — requires dataService)
      let lastKnownBudget: MonthlyBudget[] | null = null;
      for (let i = 0; i <= 12; i++) {
        const monthToCheck = format(subMonths(today, i), 'yyyy-MM');
        const budgetsKey = `budgets_${familyId}_${monthToCheck}`;
        const budgets = await this.dataService.getData<MonthlyBudget[]>(budgetsKey) || [];
        if (budgets.length > 0) {
          lastKnownBudget = budgets;
          break;
        }
      }

      // Calculate average cashflow from last 6 months
      const sixMonthsAgo = format(subMonths(today, 6), 'yyyy-MM');
      const lastMonth = format(subMonths(today, 1), 'yyyy-MM');

      const historicalResult = await this.getCashFlowSummary(familyId, sixMonthsAgo, lastMonth);
      if (!historicalResult.success || !historicalResult.summary) {
        return { success: false, error: 'Failed to get historical data for average calculation' };
      }

      // Check if we have any prior year data
      const oneYearAgo = format(subMonths(addMonths(today, 1), 12), 'yyyy-MM');
      const checkPriorYearEnd = format(subMonths(addMonths(today, monthsToProject), 12), 'yyyy-MM');

      const priorYearResult = await this.getCashFlowSummary(familyId, oneYearAgo, checkPriorYearEnd);
      const hasPriorYearData = priorYearResult.success &&
                               priorYearResult.summary !== undefined &&
                               priorYearResult.summary.some(m => m.income > 0 || m.expenses > 0);

      const projections = await buildCashFlowOutlook({
        categories,
        lastKnownBudget,
        historicalSummary: historicalResult.summary,
        priorYearSummary: priorYearResult.summary ?? [],
        hasPriorYearData: hasPriorYearData ?? false,
        monthsToProject,
        today,
        getMonthBudgets: async (month) => {
          const key = `budgets_${familyId}_${month}`;
          return await this.dataService.getData<MonthlyBudget[]>(key) ?? [];
        },
      });

      return { success: true, projections, hasPriorYearData };
    } catch (error) {
      log.error({ err: error }, 'error generating cash flow projections');
      return { success: false, error: 'Failed to generate cash flow projections' };
    }
  }

  /**
   * Get year-to-date summary
   */
  async getYearToDateSummary(familyId: string): Promise<YTDResult> {
    try {
      const currentMonth = etMonthString();
      const currentYear = Number(currentMonth.slice(0, 4));
      const startMonth = `${currentYear}-01`;

      // Use getCashFlowSummary which already handles overrides
      const cashFlowResult = await this.getCashFlowSummary(familyId, startMonth, currentMonth);
      if (!cashFlowResult.success || !cashFlowResult.summary) {
        return { success: false, error: 'Failed to get cash flow data for YTD summary' };
      }

      // Calculate totals from cash flow summary (which includes overrides)
      const totalIncome = cashFlowResult.summary.reduce((sum, month) => sum + month.income, 0);
      const totalExpenses = cashFlowResult.summary.reduce((sum, month) => sum + month.expenses, 0);
      // Pre-Savings Net (totalExpenses here is Spending, savings excluded upstream).
      const preSavingsNet = totalIncome - totalExpenses;

      // Calculate months with complete data from cash flow summary
      let monthsWithData = 0;
      let averageMonthlyIncome = 0;
      let averageMonthlyExpenses = 0;

      if (cashFlowResult.summary.length > 0) {
        // Count complete months (exclude current month as it's partial)
        let completeMonthsIncome = 0;
        let completeMonthsExpenses = 0;

        for (const monthData of cashFlowResult.summary) {
          if (monthData.month < currentMonth && (monthData.income > 0 || monthData.expenses > 0)) {
            // This is a complete month with actual data
            monthsWithData++;
            completeMonthsIncome += monthData.income;
            completeMonthsExpenses += monthData.expenses;
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
      const savingsRate = totalIncome > 0 ? (preSavingsNet / totalIncome) * 100 : 0;

      // Get top spending categories (still need raw transaction data for this)
      // Note: This part doesn't use overrides because overrides are totals, not category breakdowns
      const startDate = `${currentYear}-01-01`;
      const endDate = etDateString();

      const transactions = await this.getActiveTransactions(familyId);

      const categories = await this.dataService.getCategories(familyId);
      // Create a set of hidden category IDs including subcategories of hidden parents
      const hiddenCategoryIds = getEffectivelyHiddenCategoryIds(categories);

      const ytdTransactions = transactions.filter(t =>
        t.date >= startDate &&
        t.date <= endDate &&
        !t.isHidden &&
        !t.pending &&
        (!t.categoryId || !hiddenCategoryIds.has(t.categoryId)) // Exclude hidden categories
      );

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
          preSavingsNet,
          averageMonthlyIncome,
          averageMonthlyExpenses,
          savingsRate,
          topCategories
        }
      };
    } catch (error) {
      log.error({ err: error }, 'error getting YTD summary');
      return { success: false, error: 'Failed to get YTD summary' };
    }
  }

}