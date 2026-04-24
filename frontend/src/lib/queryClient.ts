import { QueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { getApiErrorMessage, getApiErrorStatus } from './api/errors';

// Create a single query client instance to be shared across the app.
//
// Defaults are tuned for a long-lived 2-user app where one user mutates state
// on one device while another has an idle tab open. See
// docs/features/STALE-DATA-MITIGATION-BRD.md.
//
// staleTime: 30s is the "hot" baseline (transactions, tasks, balances). Cooler
// data (theme, profile, category options, changelog) sets longer staleTime at
// the call site to opt out of focus-refetch noise.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds — hot default
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: (failureCount, error: unknown) => {
        // Don't retry on 4xx errors except 429 (rate limit)
        const status = getApiErrorStatus(error);
        if (status && status >= 400 && status < 500 && status !== 429) {
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
        // Don't show notification for auth errors (handled by auth logic)
        if (getApiErrorStatus(error) === 401) {
          return;
        }

        notifications.show({
          title: 'Operation Failed',
          message: getApiErrorMessage(error),
          color: 'red',
        });
      },
    },
  },
});

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    const stale = queryClient.getQueryCache().findAll({ stale: true });
    if (stale.length > 0) {
      console.debug(
        `[react-query] focus refetch: ${stale.length} stale ${stale.length === 1 ? 'query' : 'queries'}`,
        stale.map((q) => q.queryKey),
      );
    }
  });
}