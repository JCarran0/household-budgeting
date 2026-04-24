import type { QueryClient } from '@tanstack/react-query';
import type { Transaction } from '../../../shared/types';

// TD-013 (Sprint 2): single source of truth for keeping transaction-related
// caches coherent after a mutation. The prior approach — broadly invalidating
// `['transactions']` after every single-row edit — triggers a refetch on the
// page the user is currently editing, which shows as list flicker. Using
// `setQueriesData` to optimistically patch the cached rows in place avoids
// that refetch entirely. The server round-trip is already complete by the
// time these helpers run, so the "optimistic" value IS the server value for
// the fields we patch (category, tags, description, isHidden, isFlagged).

interface TransactionListSnapshot {
  transactions: Transaction[];
  total: number;
  totalCount?: number;
}

function isTransactionListSnapshot(data: unknown): data is TransactionListSnapshot {
  return (
    typeof data === 'object' &&
    data !== null &&
    Array.isArray((data as { transactions?: unknown }).transactions)
  );
}

type TransactionPatch = Partial<Transaction>;
type TransactionPatcher = (transaction: Transaction) => Transaction;

function toPatcher(patch: TransactionPatch | TransactionPatcher): TransactionPatcher {
  return typeof patch === 'function' ? patch : (t) => ({ ...t, ...patch });
}

function applyPatchToSnapshot(
  snapshot: TransactionListSnapshot,
  idSet: Set<string>,
  patcher: TransactionPatcher,
): TransactionListSnapshot | null {
  let changed = false;
  const next = snapshot.transactions.map((t) => {
    if (!idSet.has(t.id)) return t;
    changed = true;
    return patcher(t);
  });
  if (!changed) return null;
  return { ...snapshot, transactions: next };
}

/**
 * Patch the given transactions across every cached list that contains them.
 *
 * Matches queries shaped like `{ transactions: Transaction[] }` under either
 * the `['transactions', ...]` root (Dashboard, Budgets, EnhancedTransactions,
 * MantineTransactions) or the `['bva', ...]` root (Budget vs. Actuals reads
 * transactions through a separate queryKey for caching independence).
 *
 * Queries with different payload shapes (e.g. the uncategorized count) are
 * left untouched because `isTransactionListSnapshot` returns false for them.
 */
export function patchTransactionsInCache(
  queryClient: QueryClient,
  ids: string[],
  patch: TransactionPatch | TransactionPatcher,
): void {
  if (ids.length === 0) return;
  const idSet = new Set(ids);
  const patcher = toPatcher(patch);

  const roots: Array<readonly [string]> = [['transactions'], ['bva']];
  for (const root of roots) {
    queryClient.setQueriesData<TransactionListSnapshot>({ queryKey: root }, (old) => {
      if (!isTransactionListSnapshot(old)) return old;
      return applyPatchToSnapshot(old, idSet, patcher) ?? old;
    });
  }
}

/**
 * Invalidate the lightweight transaction-derived counts. Call this whenever a
 * mutation may flip whether a transaction is uncategorized or Amazon-eligible
 * (i.e. any category change). Cheap compared to refetching full lists.
 */
export function invalidateTransactionCounts(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ['transactions', 'uncategorized', 'count'] });
  queryClient.invalidateQueries({ queryKey: ['amazon-receipts', 'eligible-count'] });
}
