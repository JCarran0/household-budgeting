import type { AxiosInstance } from 'axios';
import type { MonthlyBudget } from '../../../../shared/types';

export interface CreateBudgetDto {
  categoryId: string;
  month: string;
  amount: number;
}

interface BudgetTotals {
  income: number;
  expense: number;
  transfer: number;
  total: number;
}

export interface MonthlyBudgetResponse {
  month: string;
  budgets: MonthlyBudget[];
  total: number;  // Legacy field for backward compatibility
  totals: BudgetTotals;  // New detailed breakdown
}

export interface BudgetHistoryResponse {
  categoryId: string;
  startMonth: string;
  endMonth: string;
  history: MonthlyBudget[];
  average: number;
  count: number;
}

export function createBudgetsApi(client: AxiosInstance) {
  return {
    async getBudgets(): Promise<MonthlyBudget[]> {
      const { data } = await client.get<MonthlyBudget[]>('/budgets');
      return data;
    },

    async getAvailableBudgetMonths(): Promise<{ month: string; count: number }[]> {
      const { data } = await client.get<{ month: string; count: number }[]>('/budgets/available-months');
      return data;
    },

    async getMonthlyBudgets(month: string): Promise<MonthlyBudgetResponse> {
      const { data } = await client.get<MonthlyBudgetResponse>(`/budgets/month/${month}`);
      return data;
    },

    async getCategoryBudgets(categoryId: string): Promise<MonthlyBudget[]> {
      const { data } = await client.get<MonthlyBudget[]>(`/budgets/category/${categoryId}`);
      return data;
    },

    async getBudget(categoryId: string, month: string): Promise<MonthlyBudget> {
      const { data } = await client.get<MonthlyBudget>(`/budgets/category/${categoryId}/month/${month}`);
      return data;
    },

    async createOrUpdateBudget(budget: CreateBudgetDto): Promise<MonthlyBudget> {
      const { data } = await client.post<MonthlyBudget>('/budgets', budget);
      return data;
    },

    async getBudgetHistory(
      categoryId: string,
      startMonth: string,
      endMonth: string
    ): Promise<BudgetHistoryResponse> {
      const { data } = await client.get<BudgetHistoryResponse>(`/budgets/history/${categoryId}`, {
        params: { startMonth, endMonth },
      });
      return data;
    },

    async deleteBudget(id: string): Promise<void> {
      await client.delete(`/budgets/${id}`);
    },

    async deleteCategoryBudgets(categoryId: string): Promise<{ deleted: number }> {
      const { data } = await client.post<{ success: boolean; deleted: number }>(
        `/categories/${categoryId}/delete-budgets`
      );
      return { deleted: data.deleted };
    },

    async getYearlyBudgets(year: number): Promise<{
      year: number;
      budgets: MonthlyBudget[];
      count: number;
    }> {
      const { data } = await client.get(`/budgets/year/${year}`);
      return data;
    },

    async batchUpdateBudgets(updates: CreateBudgetDto[]): Promise<{
      message: string;
      budgets: MonthlyBudget[];
      count: number;
    }> {
      const { data } = await client.post('/budgets/batch', { updates });
      return data;
    },
  };
}
