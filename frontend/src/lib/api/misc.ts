import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type {
  FeedbackSubmission,
  FeedbackResponse,
  StoredTrip,
  TripSummary,
  CreateTripDto,
  UpdateTripDto,
  ChatRequest,
  ChatResponse,
  GitHubIssueDraft,
  ClassifyTransactionsResponse,
  SuggestRulesResponse,
  ManualAccount,
  CreateManualAccountDto,
  UpdateManualAccountDto,
  AutoCategorizeRule,
} from '../../../../shared/types';

export interface VersionResponse {
  current: string;
  environment: string;
  deployedAt: string;
  commitHash: string;
  unreleased: string;
}

export interface ChangelogResponse {
  success: boolean;
  content: string;
  error?: string;
}

export interface ActualsOverride {
  id: string;
  userId: string;
  month: string; // YYYY-MM format
  totalIncome: number;
  totalExpenses: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateActualsOverrideDto {
  month: string; // YYYY-MM format
  totalIncome: number;
  totalExpenses: number;
  notes?: string;
}

export function createMiscApi(client: AxiosInstance) {
  return {
    // Version endpoint
    async getVersion(): Promise<VersionResponse> {
      const { data } = await client.get<VersionResponse>('/version');
      return data;
    },

    // Changelog endpoint
    async getChangelog(): Promise<ChangelogResponse> {
      const { data } = await client.get<ChangelogResponse>('/changelog');
      return data;
    },

    // Feedback methods
    async submitFeedback(feedback: FeedbackSubmission): Promise<FeedbackResponse> {
      try {
        const { data } = await client.post<FeedbackResponse>('/feedback/submit', feedback);
        return data;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.data) {
          return {
            success: false,
            error: error.response.data.error || 'Failed to submit feedback',
          };
        }
        throw error;
      }
    },

    // Actuals Override methods
    async getActualsOverrides(): Promise<ActualsOverride[]> {
      try {
        const { data } = await client.get('/actuals-overrides');
        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch actuals overrides');
        }
        return data.overrides || [];
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.data) {
          throw new Error(error.response.data.error || 'Failed to fetch actuals overrides');
        }
        throw error;
      }
    },

    async getActualsOverride(month: string): Promise<ActualsOverride | null> {
      try {
        const { data } = await client.get(`/actuals-overrides/${month}`);
        if (!data.success) {
          if (data.error === 'Override not found') {
            return null;
          }
          throw new Error(data.error || 'Failed to fetch actuals override');
        }
        return data.override;
      } catch (error) {
        if (axios.isAxiosError(error)) {
          if (error.response?.status === 404) {
            return null;
          }
          if (error.response?.data) {
            throw new Error(error.response.data.error || 'Failed to fetch actuals override');
          }
        }
        throw error;
      }
    },

    async createOrUpdateActualsOverride(override: CreateActualsOverrideDto): Promise<ActualsOverride> {
      try {
        const { data } = await client.post('/actuals-overrides', override);
        if (!data.success) {
          throw new Error(data.error || 'Failed to save actuals override');
        }
        return data.override;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.data) {
          throw new Error(error.response.data.error || 'Failed to save actuals override');
        }
        throw error;
      }
    },

    async deleteActualsOverride(overrideId: string): Promise<void> {
      try {
        const { data } = await client.delete(`/actuals-overrides/${overrideId}`);
        if (!data.success) {
          throw new Error(data.error || 'Failed to delete actuals override');
        }
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.data) {
          throw new Error(error.response.data.error || 'Failed to delete actuals override');
        }
        throw error;
      }
    },

    // Trip methods
    async createTrip(tripData: CreateTripDto): Promise<StoredTrip> {
      const { data: trip } = await client.post<StoredTrip>('/trips', tripData);
      return trip;
    },

    async getTrips(year?: number): Promise<StoredTrip[]> {
      const { data } = await client.get<StoredTrip[]>('/trips', {
        params: year !== undefined ? { year } : undefined,
      });
      return data;
    },

    async getTrip(id: string): Promise<StoredTrip> {
      const { data } = await client.get<StoredTrip>(`/trips/${id}`);
      return data;
    },

    async getTripSummary(id: string): Promise<TripSummary> {
      const { data } = await client.get<TripSummary>(`/trips/${id}/summary`);
      return data;
    },

    async getTripsSummaries(year?: number): Promise<TripSummary[]> {
      const { data } = await client.get<TripSummary[]>('/trips/summaries', {
        params: year !== undefined ? { year } : undefined,
      });
      return data;
    },

    async updateTrip(id: string, updates: UpdateTripDto): Promise<StoredTrip> {
      const { data } = await client.put<StoredTrip>(`/trips/${id}`, updates);
      return data;
    },

    async deleteTrip(id: string): Promise<void> {
      await client.delete(`/trips/${id}`);
    },

    // Chatbot
    async sendChatMessage(request: ChatRequest): Promise<ChatResponse> {
      const { data } = await client.post<{ success: boolean } & ChatResponse>('/chatbot/message', request);
      return data;
    },

    async getChatUsage(): Promise<{ monthlySpend: number; monthlyLimit: number; remainingBudget: number }> {
      const { data } = await client.get<{
        success: boolean;
        monthlySpend: number;
        monthlyLimit: number;
        remainingBudget: number;
      }>('/chatbot/usage');
      return data;
    },

    async confirmGitHubIssue(draft: GitHubIssueDraft): Promise<{ issueUrl: string }> {
      const { data } = await client.post<{ success: boolean; issueUrl: string }>(
        '/chatbot/confirm-issue',
        { draft }
      );
      return data;
    },

    // AI Categorization
    async classifyTransactions(transactionIds?: string[]): Promise<ClassifyTransactionsResponse> {
      const { data } = await client.post<{ success: boolean } & ClassifyTransactionsResponse>(
        '/chatbot/classify-transactions',
        { transactionIds }
      );
      return data;
    },

    async suggestCategorizeRules(
      categorizations: { transactionId: string; categoryId: string }[]
    ): Promise<SuggestRulesResponse> {
      const { data } = await client.post<{ success: boolean } & SuggestRulesResponse>(
        '/chatbot/suggest-rules',
        { categorizations }
      );
      return data;
    },

    // Manual Accounts
    async getManualAccounts(): Promise<ManualAccount[]> {
      const { data } = await client.get<ManualAccount[]>('/manual-accounts');
      return data;
    },

    async createManualAccount(dto: CreateManualAccountDto): Promise<ManualAccount> {
      const { data } = await client.post<ManualAccount>('/manual-accounts', dto);
      return data;
    },

    async updateManualAccount(id: string, dto: UpdateManualAccountDto): Promise<ManualAccount> {
      const { data } = await client.put<ManualAccount>(`/manual-accounts/${id}`, dto);
      return data;
    },

    async deleteManualAccount(id: string): Promise<void> {
      await client.delete(`/manual-accounts/${id}`);
    },

    // Theme Preferences
    async getThemePreferences(): Promise<Record<string, unknown> | null> {
      const { data } = await client.get<{
        success: boolean;
        preferences: Record<string, unknown> | null;
      }>('/themes/preferences');
      return data.preferences;
    },

    async saveThemePreferences(overrides: Record<string, unknown>): Promise<void> {
      await client.put('/themes/preferences', overrides);
    },

    async resetThemePreferences(): Promise<void> {
      await client.delete('/themes/preferences');
    },

    // Auto-categorization endpoints
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
