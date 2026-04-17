import type { AxiosInstance } from 'axios';
import type {
  ChatMessage,
  ChatModel,
  ChatResponse,
  GitHubIssueDraft,
  ClassifyTransactionsResponse,
  SuggestRulesResponse,
  ActionConfirmResponse,
  PageContext,
} from '../../../../shared/types';

export interface SendChatMessageParams {
  message: string;
  conversationId: string;
  conversationHistory: ChatMessage[];
  pageContext: PageContext;
  model: ChatModel;
  userDisplayName?: string;
  attachment?: File;
}

export function createChatbotApi(client: AxiosInstance) {
  return {
    async sendChatMessage(params: SendChatMessageParams): Promise<ChatResponse> {
      const { attachment, ...rest } = params;

      if (attachment) {
        // Multipart form-data path for attachment uploads.
        // IMPORTANT: Do NOT set Content-Type manually — browser sets the
        // multipart boundary automatically. Setting it manually breaks parsing.
        const form = new FormData();
        form.append('attachment', attachment);
        form.append('message', rest.message);
        form.append('conversationId', rest.conversationId);
        form.append('conversationHistory', JSON.stringify(rest.conversationHistory));
        form.append('pageContext', JSON.stringify(rest.pageContext));
        form.append('model', rest.model);
        if (rest.userDisplayName) {
          form.append('userDisplayName', rest.userDisplayName);
        }
        const { data } = await client.post<{ success: boolean } & ChatResponse>(
          '/chatbot/message',
          form,
          {
            headers: {
              // Clear the default Content-Type so Axios doesn't set application/json.
              // The browser will set multipart/form-data with the correct boundary.
              'Content-Type': undefined,
            },
          },
        );
        return data;
      }

      // Existing JSON path — text-only, unchanged.
      const { data } = await client.post<{ success: boolean } & ChatResponse>(
        '/chatbot/message',
        {
          message: rest.message,
          conversationId: rest.conversationId,
          conversationHistory: rest.conversationHistory,
          pageContext: rest.pageContext,
          model: rest.model,
          userDisplayName: rest.userDisplayName,
        },
      );
      return data;
    },

    async confirmChatAction(params: {
      proposalId: string;
      confirmedParams: Record<string, unknown>;
    }): Promise<ActionConfirmResponse> {
      const { data } = await client.post<ActionConfirmResponse>(
        '/chatbot/actions/confirm',
        params,
      );
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
