import type { AxiosInstance } from 'axios';
import type {
  ChatMessage,
  ChatModel,
  ChatResponse,
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

/**
 * The server's failure body, when it sent one. Narrowed rather than cast: an
 * error page or a proxy's HTML would otherwise be surfaced to the user as if it
 * were a considered response.
 */
function isActionConfirmFailure(
  body: unknown,
): body is Extract<ActionConfirmResponse, { success: false }> {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return b.success === false && typeof b.error === 'string' && typeof b.errorCode === 'string';
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
      /** The rows the user checked. One entry for an ordinary single-action card. */
      rows: Array<{ rowId: string; params: Record<string, unknown> }>;
    }): Promise<ActionConfirmResponse> {
      try {
        const { data } = await client.post<ActionConfirmResponse>(
          '/chatbot/actions/confirm',
          params,
        );
        return data;
      } catch (err) {
        // Every failure mode here is reported in the RESPONSE BODY — which row
        // failed, how many of a batch were applied, the human-readable nonce
        // error. Letting axios's rejection through would replace all of that
        // with "Request failed with status code 500", which is precisely the
        // situation where the user most needs to know what landed.
        const body = (err as { response?: { data?: unknown } }).response?.data;
        if (isActionConfirmFailure(body)) return body;
        throw err;
      }
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
