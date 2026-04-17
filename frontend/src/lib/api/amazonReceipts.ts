import type { AxiosInstance } from 'axios';
import type {
  AmazonReceiptUploadResponse,
  AmazonReceiptMatchResponse,
  AmazonCategorizationResponse,
  AmazonApplyAction,
  AmazonApplyResponse,
  AmazonReceiptSession,
  AmazonResolveAmbiguousRequest,
  RuleSuggestion,
} from '../../../../shared/types';

export function createAmazonReceiptsApi(client: AxiosInstance) {
  return {
    /**
     * Upload 1–2 Amazon PDFs for parsing via Claude vision.
     * Uses FormData for multipart upload (only endpoint that does so).
     */
    async uploadAmazonReceipts(files: File[]): Promise<AmazonReceiptUploadResponse> {
      const formData = new FormData();
      for (const file of files) {
        formData.append('pdfs', file);
      }
      const { data } = await client.post<{ success: boolean } & AmazonReceiptUploadResponse>(
        '/amazon-receipts/upload',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return data;
    },

    /** Match parsed orders against bank transactions. */
    async matchAmazonOrders(sessionId: string): Promise<AmazonReceiptMatchResponse> {
      const { data } = await client.post<{ success: boolean } & AmazonReceiptMatchResponse>(
        `/amazon-receipts/${sessionId}/match`,
        {},
      );
      return data;
    },

    /** Manually resolve ambiguous matches. */
    async resolveAmbiguousMatches(
      sessionId: string,
      resolutions: AmazonResolveAmbiguousRequest['resolutions'],
    ): Promise<void> {
      await client.post(`/amazon-receipts/${sessionId}/resolve-ambiguous`, { resolutions });
    },

    /** Get category and split recommendations for matched orders. */
    async categorizeAmazonMatches(
      sessionId: string,
      matchIds: string[],
    ): Promise<AmazonCategorizationResponse> {
      const { data } = await client.post<{ success: boolean } & AmazonCategorizationResponse>(
        `/amazon-receipts/${sessionId}/categorize`,
        { matchIds },
      );
      return data;
    },

    /** Apply approved categorizations and splits. */
    async applyAmazonActions(
      sessionId: string,
      actions: AmazonApplyAction[],
    ): Promise<AmazonApplyResponse> {
      const { data } = await client.post<{ success: boolean } & AmazonApplyResponse>(
        `/amazon-receipts/${sessionId}/apply`,
        { actions },
      );
      return data;
    },

    /** Get auto-categorization rule suggestions. */
    async suggestAmazonRules(
      sessionId: string,
    ): Promise<{ suggestions: RuleSuggestion[] }> {
      const { data } = await client.post<{ success: boolean; suggestions: RuleSuggestion[] }>(
        `/amazon-receipts/${sessionId}/suggest-rules`,
        {},
      );
      return data;
    },

    /** Count Amazon-merchant transactions available for receipt matching. */
    async getAmazonEligibleCount(): Promise<{ count: number }> {
      const { data } = await client.get<{ success: boolean; count: number }>(
        '/amazon-receipts/eligible-count',
      );
      return { count: data.count };
    },

    /** List user's receipt matching sessions. */
    async getAmazonReceiptSessions(): Promise<AmazonReceiptSession[]> {
      const { data } = await client.get<{ success: boolean; sessions: AmazonReceiptSession[] }>(
        '/amazon-receipts/sessions',
      );
      return data.sessions;
    },

    /** Delete a session. */
    async deleteAmazonReceiptSession(sessionId: string): Promise<void> {
      await client.delete(`/amazon-receipts/${sessionId}`);
    },

    /** Delete all sessions (clears dedup history, allows reprocessing). */
    async deleteAllAmazonReceiptSessions(): Promise<{ deleted: number }> {
      const { data } = await client.delete<{ success: boolean; deleted: number }>(
        '/amazon-receipts/sessions/all',
      );
      return data;
    },
  };
}
