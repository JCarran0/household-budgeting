import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

/**
 * The distinct set of transaction tags in use, for tag autocomplete.
 *
 * Backed by `GET /transactions/tags`. This replaces two client-side
 * approximations that both under-reported: one capped at 1000 transactions,
 * the other scoped to the currently filtered page. That under-reporting matters
 * now that project line items are matched by tag — a tag missing from the
 * suggestions invites a typo, and a typo silently orphans the spend.
 */
export function useTransactionTags(options?: { enabled?: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ['transaction-tags'],
    queryFn: () => api.getDistinctTags(),
    staleTime: 5 * 60 * 1000,
    enabled: options?.enabled ?? true,
  });

  return { tags: data ?? [], isLoading };
}
