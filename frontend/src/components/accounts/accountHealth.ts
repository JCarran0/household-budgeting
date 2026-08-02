import type { ExtendedPlaidAccount } from '../../lib/api';

/**
 * Account connection health derived from Plaid's own Item status.
 *
 * The failure this exists to catch: an Item reports healthy, `/accounts/get`
 * keeps returning fresh balances, our sync keeps succeeding — and transaction
 * extraction has been dead for weeks. Nothing in the app noticed for 19 days
 * (see TD-020/TD-021). `lastSynced` cannot detect it, because it only records
 * that *we* called Plaid. `lastTransactionUpdate` is Plaid's record of when the
 * *institution* last delivered, which is the number that actually goes stale.
 *
 * Pure functions, no rendering — so the thresholds are unit-testable without
 * mounting a component.
 */

/**
 * Days without a successful transaction pull before we warn.
 *
 * Institutions normally deliver at least every day or two. Five days tolerates
 * an ordinary weekend plus a holiday without crying wolf, while still catching
 * a real stall inside a week rather than inside three.
 */
export const STALE_TRANSACTIONS_DAYS = 5;

/**
 * Days before consent expiry when we start prompting.
 *
 * Plaid's PENDING_EXPIRATION webhook fires at 7 days; we are not receiving
 * webhooks at all, so this polls wider to leave room for a manual sync to be
 * the thing that surfaces it.
 */
export const CONSENT_WARNING_DAYS = 14;

const MS_PER_DAY = 86_400_000;

export function daysSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  return (now.getTime() - then.getTime()) / MS_PER_DAY;
}

export function daysUntil(iso: string | null | undefined, now: Date = new Date()): number | null {
  const since = daysSince(iso, now);
  return since === null ? null : -since;
}

/**
 * True when Plaid has not successfully pulled transactions recently.
 *
 * Returns false when the field is absent rather than guessing — accounts synced
 * before this field existed have no value yet, and a warning on every card
 * would train the user to ignore it.
 */
export function hasStaleTransactions(
  account: Pick<ExtendedPlaidAccount, 'lastTransactionUpdate'>,
  now: Date = new Date(),
): boolean {
  const age = daysSince(account.lastTransactionUpdate, now);
  return age !== null && age >= STALE_TRANSACTIONS_DAYS;
}

/** True when bank access lapses soon enough that the user should re-link now. */
export function hasExpiringConsent(
  account: Pick<ExtendedPlaidAccount, 'consentExpirationTime'>,
  now: Date = new Date(),
): boolean {
  const remaining = daysUntil(account.consentExpirationTime, now);
  return remaining !== null && remaining <= CONSENT_WARNING_DAYS;
}
