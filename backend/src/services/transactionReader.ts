/**
 * Transaction Reader — Canonical filter for active (non-removed) transactions.
 *
 * Plaid sync marks replaced pending holds as status:'removed', but they remain
 * in storage for audit purposes. Every read-path that displays, reports on, or
 * categorizes transactions must exclude them.
 *
 * WHO SHOULD USE THIS:
 *   - transactionFilterEngine  (excludeRemoved)
 *   - chatbotDataService       (getActiveTransactions)
 *   - autoCategorizeService    (getActiveTransactions / excludeRemoved)
 *   - reportService            (excludeRemoved)
 *
 * WHO SHOULD NOT:
 *   - Mutation paths that load-modify-save the full array: transactionService
 *     mutations, admin routes, tripService, projectService. These need access
 *     to removed records so they aren't silently dropped on save.
 */

/** Minimal read interface satisfied by both DataService and ReadOnlyDataService. */
export interface TransactionDataReader {
  getData<T>(key: string): Promise<T | null>;
}

/**
 * Filter out removed transactions from an already-loaded array.
 * Use when you already have the array in memory (e.g., transactionFilterEngine,
 * reportService via Repository, or mutation paths that need both filtered and
 * unfiltered sets).
 */
export function excludeRemoved<T extends { status: string }>(transactions: T[]): T[] {
  return transactions.filter(t => t.status !== 'removed');
}

/**
 * Load all active (non-removed) transactions for a family from storage.
 * Encapsulates key naming, null coercion, and the removed filter.
 * Use when loading transactions fresh from storage for read-only purposes.
 */
export async function getActiveTransactions<T extends { status: string }>(
  dataReader: TransactionDataReader,
  familyId: string,
): Promise<T[]> {
  const all = await dataReader.getData<T[]>(`transactions_${familyId}`);
  return excludeRemoved(all ?? []);
}
