import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type { FeedbackSubmission, FeedbackResponse } from '../../../../shared/types';

export function createFeedbackApi(client: AxiosInstance) {
  return {
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
  };
}
