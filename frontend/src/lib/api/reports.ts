import type { AxiosInstance } from 'axios';

export function createReportsApi(client: AxiosInstance) {
  return {
    async getSpendingTrends(
      startMonth: string,
      endMonth: string,
      categoryIds?: string[]
    ): Promise<{
      trends: Array<{
        month: string;
        categoryId: string;
        categoryName: string;
        amount: number;
        transactionCount: number;
      }>;
    }> {
      const { data } = await client.get('/reports/spending-trends', {
        params: { startMonth, endMonth, categoryIds },
      });
      return data;
    },

    async getCategoryBreakdown(
      startDate: string,
      endDate: string,
      includeSubcategories = true
    ): Promise<{
      breakdown: Array<{
        categoryId: string;
        categoryName: string;
        amount: number;
        percentage: number;
        transactionCount: number;
        subcategories?: Array<{
          categoryId: string;
          categoryName: string;
          amount: number;
          percentage: number;
          transactionCount: number;
        }>;
      }>;
      total: number;
    }> {
      const { data } = await client.get('/reports/category-breakdown', {
        params: { startDate, endDate, includeSubcategories },
      });
      return data;
    },

    async getIncomeCategoryBreakdown(
      startDate: string,
      endDate: string,
      includeSubcategories = true
    ): Promise<{
      breakdown: Array<{
        categoryId: string;
        categoryName: string;
        amount: number;
        percentage: number;
        transactionCount: number;
        subcategories?: Array<{
          categoryId: string;
          categoryName: string;
          amount: number;
          percentage: number;
          transactionCount: number;
        }>;
      }>;
      total: number;
    }> {
      const { data } = await client.get('/reports/income-breakdown', {
        params: { startDate, endDate, includeSubcategories },
      });
      return data;
    },

    async getSavingsCategoryBreakdown(
      startDate: string,
      endDate: string
    ): Promise<{
      breakdown: Array<{
        categoryId: string;
        categoryName: string;
        amount: number;
        percentage: number;
        transactionCount: number;
      }>;
      total: number;
    }> {
      const { data } = await client.get('/reports/savings-breakdown', {
        params: { startDate, endDate },
      });
      return data;
    },

    async getCashFlow(
      startMonth: string,
      endMonth: string
    ): Promise<{
      summary: Array<{
        month: string;
        income: number;
        expenses: number;
        netFlow: number;
        savingsRate: number;
      }>;
    }> {
      const { data } = await client.get('/reports/cash-flow', {
        params: { startMonth, endMonth },
      });
      return data;
    },

    async getProjections(monthsToProject = 6): Promise<{
      projections: Array<{
        month: string;
        budgetedCashflow: number | null;
        isBudgetExtrapolated: boolean;
        priorYearCashflow: number | null;
        averageCashflow: number;
      }>;
      hasPriorYearData: boolean;
    }> {
      const { data } = await client.get('/reports/projections', {
        params: { monthsToProject },
      });
      return data;
    },

    async getYearToDate(): Promise<{
      summary: {
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
      };
    }> {
      const { data } = await client.get('/reports/year-to-date');
      return data;
    },
  };
}
