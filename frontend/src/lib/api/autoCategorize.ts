import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type {
  AutoCategorizeRule,
  AutoCatSuggestionsResponse,
} from '../../../../shared/types';

/** Mirrors the suggestionMeta zod object on the backend create/update routes. */
export interface AutoCatRuleSuggestionMeta {
  clusterSize: number;
  topCategoryCount: number;
  agreementPct: number;
  pendingMatchCount: number;
  appliedToTxnCount?: number;
  /** Telemetry distinguishing the three suggestion outcomes. */
  outcome?: 'created' | 'appended' | 'replaced';
  /** Legacy mirror of `outcome === 'replaced'`; retained for log continuity. */
  replacedExisting?: boolean;
  /** Set when outcome === 'appended' — id of the rule we patterned into. */
  addedToExistingRuleId?: string;
}

export function createAutoCategorizeApi(client: AxiosInstance) {
  return {
    async getAutoCategorizeRules(): Promise<AutoCategorizeRule[]> {
      const { data } = await client.get<{ success: boolean; rules: AutoCategorizeRule[] }>(
        '/autocategorize/rules'
      );
      return data.rules;
    },

    async getAutoCatSuggestions(): Promise<AutoCatSuggestionsResponse> {
      const { data } = await client.get<AutoCatSuggestionsResponse>(
        '/categories/auto-cat/suggestions'
      );
      return data;
    },

    async createAutoCategorizeRule(rule: {
      description: string;
      patterns: string[];
      categoryId: string;
      categoryName?: string;
      userDescription?: string;
      isActive?: boolean;
      /** Telemetry tag — pass 'suggestion' when created from a suggestion card. */
      source?: 'manual' | 'suggestion';
      /** Cluster context piped through for the rule_created log. */
      suggestionMeta?: AutoCatRuleSuggestionMeta;
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
        source?: 'manual' | 'suggestion';
        suggestionMeta?: AutoCatRuleSuggestionMeta;
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
