import type { AxiosInstance } from 'axios';
import type {
  ChatRequest,
  ChatResponse,
  GitHubIssueDraft,
  ClassifyTransactionsResponse,
  SuggestRulesResponse,
} from '../../../../shared/types';

export function createChatbotApi(client: AxiosInstance) {
  return {
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
  };
}
