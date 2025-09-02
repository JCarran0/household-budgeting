import { QueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';

// Create a single query client instance to be shared across the app
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
      retry: (failureCount, error: unknown) => {
        // Don't retry on 4xx errors except 429 (rate limit)
        const err = error as { response?: { status?: number } };
        if (err?.response?.status && err.response.status >= 400 && err.response.status < 500 && err.response.status !== 429) {
          return false;
        }
        // Retry up to 2 times for other errors
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: false, // Don't retry mutations by default
      onError: (error: unknown) => {
        // Global mutation error handler
        const err = error as { response?: { status?: number; data?: { error?: string } }; message?: string };
        const message = err?.response?.data?.error || err?.message || 'An unexpected error occurred';
        
        // Don't show notification for auth errors (handled by auth logic)
        if (err?.response?.status === 401) {
          return;
        }

        notifications.show({
          title: 'Operation Failed',
          message,
          color: 'red',
        });
      },
    },
  },
});