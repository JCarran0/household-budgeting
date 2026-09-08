/**
 * Re-auth account adoption (TD-020).
 *
 * A Plaid Link re-auth can re-provision an Item, minting new `account_id`s for
 * accounts that never changed — that is what happened on 2026-09-07, where both
 * Bank of America masks stayed identical, so it was not a card reissue.
 *
 * The invariant these tests defend is *asymmetric*, and getting it backwards
 * corrupts financial history:
 *
 *   - An account that appeared with no stale counterpart is safe to adopt.
 *     Nothing is stored under that id, so nothing can be duplicated.
 *
 *   - A stale account that was replaced must NOT be repointed. Dedupe is
 *     strictly by `plaidTransactionId` and the replacement's rows all carry new
 *     ids, so repointing makes the held backlog placeable and re-inserts months
 *     of history alongside the originals. Detection is the whole job here;
 *     repair belongs to the reconciler.
 */

import {
  pairItemAccounts,
  type PairableStoredAccount,
  type PairableLiveAccount,
} from '../../services/accountPairing';

const stored = (o: Partial<PairableStoredAccount> = {}): PairableStoredAccount => ({
  id: 'acct-1',
  plaidAccountId: 'old-id',
  accountName: 'Checking',
  officialName: 'Adv Plus Banking',
  type: 'checking',
  subtype: 'checking',
  mask: '4404',
  persistentAccountId: null,
  ...o,
});

const live = (o: Partial<PairableLiveAccount> = {}): PairableLiveAccount => ({
  plaidAccountId: 'new-id',
  name: 'Checking',
  officialName: 'Adv Plus Banking',
  type: 'checking',
  subtype: 'checking',
  mask: '4404',
  persistentAccountId: null,
  ...o,
});

describe('pairItemAccounts — re-auth account changes (TD-020)', () => {
  it('does nothing when the Item is unchanged', () => {
    const s = stored({ plaidAccountId: 'a1' });
    const out = pairItemAccounts([s], [live({ plaidAccountId: 'a1' })]);

    expect(out.stale).toHaveLength(0);
    expect(out.appeared).toHaveLength(0);
    expect(out.pairs).toHaveLength(0);
    expect(out.adoptable).toHaveLength(0);
  });

  it('adopts an account that appeared with no stale counterpart', () => {
    const existing = stored({ plaidAccountId: 'a1' });
    const added = live({ plaidAccountId: 'a2', name: 'New Card', officialName: 'Travel Rewards', type: 'credit' });

    const out = pairItemAccounts([existing], [live({ plaidAccountId: 'a1' }), added]);

    expect(out.adoptable.map(a => a.plaidAccountId)).toEqual(['a2']);
    expect(out.pairs).toHaveLength(0);
    expect(out.stale).toHaveLength(0);
  });

  it('pairs a replaced account instead of offering it for adoption', () => {
    // The 2026-09-07 shape: same mask, same official name, brand new account_id.
    const out = pairItemAccounts(
      [stored({ plaidAccountId: 'old-id' })],
      [live({ plaidAccountId: 'brand-new-id' })],
    );

    expect(out.pairs).toHaveLength(1);
    expect(out.pairs[0].live.plaidAccountId).toBe('brand-new-id');
    expect(out.pairs[0].matchedVia).toBe('identity');
    // The critical assertion: a replacement is never adoptable. Adopting it
    // would repoint without re-keying and duplicate the stored history.
    expect(out.adoptable).toHaveLength(0);
  });

  it('prefers persistent_account_id over the name/type heuristic', () => {
    const s = stored({ plaidAccountId: 'old', persistentAccountId: 'PERSIST-1' });
    // Decoy matches on identity; the real replacement matches on persistent id.
    const decoy = live({ plaidAccountId: 'decoy', persistentAccountId: 'PERSIST-9' });
    const real = live({ plaidAccountId: 'real', officialName: 'Renamed By Bank', persistentAccountId: 'PERSIST-1' });

    const out = pairItemAccounts([s], [decoy, real]);

    expect(out.pairs).toHaveLength(1);
    expect(out.pairs[0].live.plaidAccountId).toBe('real');
    expect(out.pairs[0].matchedVia).toBe('persistent_account_id');
  });

  it('refuses to guess when two candidates look identical', () => {
    const s = stored({ plaidAccountId: 'old' });
    const twin1 = live({ plaidAccountId: 'new-1' });
    const twin2 = live({ plaidAccountId: 'new-2' });

    const out = pairItemAccounts([s], [twin1, twin2]);

    expect(out.pairs).toHaveLength(0);
    expect(out.unpaired.map(a => a.id)).toEqual(['acct-1']);
    // Ambiguity must not silently become adoption.
    expect(out.adoptable).toHaveLength(2);
  });

  it('reports a vanished account with no replacement rather than dropping it', () => {
    const out = pairItemAccounts([stored({ plaidAccountId: 'gone' })], []);

    expect(out.unpaired).toHaveLength(1);
    expect(out.pairs).toHaveLength(0);
  });

  it('does not let one replacement be claimed by two stale accounts', () => {
    const s1 = stored({ id: 'acct-1', plaidAccountId: 'old-1' });
    const s2 = stored({ id: 'acct-2', plaidAccountId: 'old-2' });
    const only = live({ plaidAccountId: 'new-1' });

    const out = pairItemAccounts([s1, s2], [only]);

    expect(out.pairs).toHaveLength(1);
    expect(out.unpaired).toHaveLength(1);
    expect(out.pairs[0].stored.id).not.toBe(out.unpaired[0].id);
  });

  it('handles the full 2026-09-07 shape: two accounts replaced at once', () => {
    const checking = stored({ id: 'chk', plaidAccountId: 'old-chk', mask: '4404' });
    const card = stored({
      id: 'crd', plaidAccountId: 'old-crd', accountName: 'Credit Card',
      officialName: 'Customized Cash Rewards Visa Signature', type: 'credit',
      subtype: 'credit card', mask: '9670',
    });
    const newChecking = live({ plaidAccountId: 'new-chk', mask: '4404' });
    const newCard = live({
      plaidAccountId: 'new-crd', name: 'Credit Card',
      officialName: 'Customized Cash Rewards Visa Signature', type: 'credit',
      subtype: 'credit card', mask: '9670',
    });

    const out = pairItemAccounts([checking, card], [newChecking, newCard]);

    expect(out.pairs).toHaveLength(2);
    expect(out.adoptable).toHaveLength(0);
    expect(out.unpaired).toHaveLength(0);
    // Each stale account paired with the replacement carrying its own mask.
    for (const p of out.pairs) {
      expect(p.live.mask).toBe(p.stored.mask);
    }
  });
});
