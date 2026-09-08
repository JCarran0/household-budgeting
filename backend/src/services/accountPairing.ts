/**
 * Pair stored accounts against an Item's live Plaid accounts (TD-020).
 *
 * When an institution re-provisions an Item — a card reissue, or, as on
 * 2026-09-07, a Plaid Link re-auth that mints fresh `account_id`s for accounts
 * whose masks never changed — stored accounts point at ids Plaid no longer
 * knows. Every transaction under the new id is unplaceable, so the sync holds
 * its cursor and stops (`transactionService.syncTransactions`).
 *
 * This module answers only the classification question: which stored accounts
 * went stale, which live accounts are new, and which of those are the *same*
 * account under a new id. It deliberately does not repair anything.
 *
 * ## Why detection does not imply repointing
 *
 * Repointing a stale account to its replacement looks like the obvious fix and
 * is actively harmful. `applyPlaidSyncDelta` dedupes strictly on
 * `plaidTransactionId`, and a re-provisioned account's rows all carry *new*
 * transaction ids. Repointing alone makes the whole backlog placeable, so
 * months of already-stored history are inserted a second time under new ids
 * while the originals remain. Safely adopting a replacement requires re-keying
 * the existing rows by content first, which is what
 * `scripts/reconcile-plaid-account-change.ts` does under a dry-run/apply gate.
 *
 * Adopting an account that appeared with *no* stale counterpart is a different
 * and safe case: nothing is stored under it, so there is no history to
 * duplicate. That is the one adoption this module green-lights.
 */

/** Minimal shape of a stored account needed for pairing. */
export interface PairableStoredAccount {
  id: string;
  plaidAccountId: string;
  accountName: string;
  officialName?: string | null;
  type?: string | null;
  subtype?: string | null;
  mask: string | null;
  persistentAccountId?: string | null;
}

/** Minimal shape of a live Plaid account needed for pairing. */
export interface PairableLiveAccount {
  plaidAccountId: string;
  name: string;
  officialName: string | null;
  type: string;
  subtype: string | null;
  mask: string | null;
  persistentAccountId?: string | null;
}

export type MatchedVia = 'persistent_account_id' | 'identity';

export interface AccountPairing<
  S extends PairableStoredAccount = PairableStoredAccount,
  L extends PairableLiveAccount = PairableLiveAccount,
> {
  stored: S;
  live: L;
  matchedVia: MatchedVia;
}

/**
 * Generic over the caller's concrete types so classification does not strip
 * fields the caller still needs — adopting an account requires balances, which
 * are none of this module's business.
 */
export interface PairingOutcome<
  S extends PairableStoredAccount = PairableStoredAccount,
  L extends PairableLiveAccount = PairableLiveAccount,
> {
  /** Stored accounts whose `plaidAccountId` no longer exists at Plaid. */
  stale: S[];
  /** Live accounts we have never stored. */
  appeared: L[];
  /** Stale accounts confidently matched to a replacement. Awaiting re-key. */
  pairs: AccountPairing<S, L>[];
  /**
   * Live accounts that are genuinely new — no stale account claims them. Safe
   * to adopt: there is no stored history under them to duplicate.
   */
  adoptable: L[];
  /**
   * Stale accounts with no confident match: zero candidates, or more than one.
   * Never guessed at — a wrong pairing silently mis-files financial history.
   */
  unpaired: S[];
}

/**
 * Both sides of this comparison must be the app's *simplified* account type.
 *
 * `plaidService.getAccounts` already runs live accounts through
 * `mapAccountType` (which collapses `depository` to `checking`) before they
 * reach this module, and stored accounts were normalised the same way when
 * they were saved — so the two are directly comparable here.
 *
 * That is worth stating explicitly because the equivalent comparison in
 * `reconcile-plaid-account-change.ts` is *not* safe by default: that script
 * calls `accountsGet` directly and sees Plaid's raw `depository`, so it must
 * normalise before comparing. Comparing a normalised value against a raw one
 * matches nothing for any depository account, which is exactly how the
 * reconciler failed on 2026-09-07.
 */
function identity(a: {
  type?: string | null;
  subtype?: string | null;
  officialName?: string | null;
}): string {
  return `${a.type ?? ''}|${a.subtype ?? ''}|${a.officialName ?? ''}`.toLowerCase();
}

/**
 * Classify an Item's stored accounts against its live Plaid accounts.
 *
 * Matching is deliberately conservative. `persistent_account_id` wins when both
 * sides carry one, because Plaid maintains it precisely to survive this event.
 * Otherwise we fall back to type + subtype + official name, and refuse anything
 * that is not a unique match — an unpaired account is reported, never guessed.
 */
export function pairItemAccounts<
  S extends PairableStoredAccount,
  L extends PairableLiveAccount,
>(stored: S[], live: L[]): PairingOutcome<S, L> {
  const liveIds = new Set(live.map(a => a.plaidAccountId));
  const storedIds = new Set(stored.map(a => a.plaidAccountId));

  const stale = stored.filter(a => !liveIds.has(a.plaidAccountId));
  const appeared = live.filter(a => !storedIds.has(a.plaidAccountId));

  const pairs: AccountPairing<S, L>[] = [];
  const unpaired: S[] = [];
  const claimed = new Set<string>();

  for (const s of stale) {
    const available = appeared.filter(a => !claimed.has(a.plaidAccountId));

    let candidates: L[] = [];
    let matchedVia: MatchedVia = 'identity';

    if (s.persistentAccountId) {
      const byPersistent = available.filter(
        a => a.persistentAccountId && a.persistentAccountId === s.persistentAccountId
      );
      if (byPersistent.length === 1) {
        candidates = byPersistent;
        matchedVia = 'persistent_account_id';
      }
    }

    if (candidates.length === 0) {
      const want = identity(s);
      candidates = available.filter(a => identity(a) === want);
    }

    if (candidates.length === 1) {
      claimed.add(candidates[0].plaidAccountId);
      pairs.push({ stored: s, live: candidates[0], matchedVia });
    } else {
      unpaired.push(s);
    }
  }

  // Whatever no stale account claimed is genuinely new, and safe to adopt.
  const adoptable = appeared.filter(a => !claimed.has(a.plaidAccountId));

  return { stale, appeared, pairs, adoptable, unpaired };
}
