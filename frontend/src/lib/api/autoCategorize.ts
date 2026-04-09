import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type { AutoCategorizeRule } from '../../../../shared/types';

export function createAutoCategorizeApi(client: AxiosInstance) {
  return {
    async getAutoCategorizeRules(): Promise<AutoCategorizeRule[]> {
      const { data } = await client.get<{ success: boolean; rules: AutoCategorizeRule[] }>(
        '/autocategorize/rules'
      );
      return data.rules;
    },

    async createAutoCategorizeRule(rule: {
      description: string;
      patterns: string[];
      categoryId: string;
      categoryName?: string;
      userDescription?: string;
      isActive?: boolean;
    }): Promise<AutoCategorizeRule> {
      const { data } = await client.post<{ success: boolean; rule: AutoCategorizeRule }>(
        '/autocategorize/rules',
        rule
      );
      return data.rule;
    },

    async updateAutoCategorizeRule(
      ruleId: string,
      updates: {
        description?: string;
        patterns?: string[];
        categoryId?: string;
        categoryName?: string;
        userDescription?: string;
        isActive?: boolean;
      }
    ): Promise<void> {
      try {
        const response = await client.put(`/autocategorize/rules/${ruleId}`, updates);
        if (!response.data.success) {
          throw new Error(response.data.error || 'Failed to update rule');
        }
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.data?.error) {
          throw new Error(error.response.data.error);
        }
        throw error;
      }
    },

    async deleteAutoCategorizeRule(ruleId: string): Promise<void> {
      const response = await client.delete(`/autocategorize/rules/${ruleId}`);
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to delete rule');
      }
    },

    async moveAutoCategorizeRuleUp(ruleId: string): Promise<void> {
      const response = await client.put(`/autocategorize/rules/${ruleId}/move-up`);
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to move rule');
      }
    },

    async moveAutoCategorizeRuleDown(ruleId: string): Promise<void> {
      const response = await client.put(`/autocategorize/rules/${ruleId}/move-down`);
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to move rule');
      }
    },

    async previewAutoCategorization(forceRecategorize: boolean = false): Promise<{
      wouldCategorize: number;
      wouldRecategorize: number;
      total: number;
      changes: Array<{
        transactionId: string;
        date: string;
        description: string;
        amount: number;
        oldCategoryId: string | null;
        oldCategoryName: string | null;
        newCategoryId: string;
        newCategoryName: string;
      }>;
    }> {
      const { data } = await client.post<{
        success: boolean;
        wouldCategorize: number;
        wouldRecategorize: number;
        total: number;
        changes: Array<{
          transactionId: string;
          date: string;
          description: string;
          amount: number;
          oldCategoryId: string | null;
          oldCategoryName: string | null;
          newCategoryId: string;
          newCategoryName: string;
        }>;
        message: string;
      }>('/autocategorize/preview', { forceRecategorize });
      return {
        wouldCategorize: data.wouldCategorize,
        wouldRecategorize: data.wouldRecategorize,
        total: data.total,
        changes: data.changes,
      };
    },

    async applyAutoCategorizeRules(
      forceRecategorize: boolean = false,
      transactionIds?: string[]
    ): Promise<{
      categorized: number;
      recategorized: number;
      total: number;
    }> {
      const { data } = await client.post<{
        success: boolean;
        categorized: number;
        recategorized: number;
        total: number;
        message: string;
      }>('/autocategorize/apply', { forceRecategorize, transactionIds });
      return {
        categorized: data.categorized,
        recategorized: data.recategorized,
        total: data.total,
      };
    },
  };
}
