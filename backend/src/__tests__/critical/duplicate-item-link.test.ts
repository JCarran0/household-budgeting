/**
 * Duplicate-Item link refusal (TD-028).
 *
 * On 2026-09-12 a "Sign in to Bank" click ran Plaid Link in create mode, so
 * Bank of America was linked a *second* time: a new Item, new `account_id`s, and
 * new `transaction_id`s for the whole history. Dedupe in `transactionService` is
 * strictly by `plaidTransactionId`, so it had nothing to match on — 892 rows
 * re-imported, 887 of them twins of rows already stored, and the dashboard
 * double-counted both balances.
 *
 * `connectAccount` is the last line of defence: it is the only place that sees
 * "this institution is already connected" before anything is written. The
 * invariant is that a masked account already live under a different Item cannot
 * be stored again, and that the Item exchanged for the refused link is released
 * rather than left orphaned at Plaid.
 *
 * The null-mask carve-out is deliberate, not an oversight. Venmo and some
 * investment profiles report no mask, so two genuinely different accounts at one
 * institution are indistinguishable — this family already holds two such Venmo
 * profiles on separate Items. Blocking on a null mask would refuse a legitimate
 * link; the collision check only fires where there is something to collide on.
 */

import { AccountService } from '../../services/accountService';

type StoredAccount = Record<string, unknown>;

const existingBofA = (o: StoredAccount = {}): StoredAccount => ({
  id: 'stored-1',
  plaidItemId: 'item-original',
  plaidAccountId: 'old-acct',
  institutionId: 'ins_127989',
  institutionName: 'Bank of America',
  accountName: 'Checking',
  type: 'checking',
  subtype: 'checking',
  mask: '4404',
  status: 'active',
  ...o,
});

const livePlaidAccount = (o: Record<string, unknown> = {}) => ({
  plaidAccountId: 'new-acct',
  name: 'Checking',
  officialName: 'Adv Plus Banking',
  type: 'checking',
  subtype: 'checking',
  mask: '4404',
  currentBalance: 100,
  availableBalance: 100,
  creditLimit: null,
  currency: 'USD',
  ...o,
});

function build(stored: StoredAccount[], live: Array<Record<string, unknown>>) {
  const saved: StoredAccount[] = [];
  const dataService = {
    getData: jest.fn().mockResolvedValue(stored),
    saveData: jest.fn().mockImplementation(async (_key: string, value: StoredAccount[]) => {
      saved.splice(0, saved.length, ...value);
    }),
  };
  const plaidService = {
    exchangePublicToken: jest.fn().mockResolvedValue({
      success: true,
      accessToken: 'access-new',
      itemId: 'item-new',
    }),
    getAccounts: jest.fn().mockResolvedValue({ success: true, accounts: live }),
    removeItem: jest.fn().mockResolvedValue({ success: true }),
  };

  // The service encrypts tokens through a module-level helper; the constructor
  // only needs these two collaborators to exercise the guard.
  const service = new AccountService(
    dataService as never,
    plaidService as never
  );
  return { service, dataService, plaidService, saved };
}

describe('connectAccount — duplicate Item refusal (TD-028)', () => {
  it('refuses when a masked account is already live under another Item', async () => {
    const { service, plaidService, dataService } = build(
      [existingBofA()],
      [livePlaidAccount()]
    );

    const result = await service.connectAccount(
      'fam-1',
      'public-token',
      'ins_127989',
      'Bank of America'
    );

    expect(result.success).toBe(false);
    // The route answers 409 on this code. Without it the refusal is a 500 and
    // the user reads "Connection Error" instead of what to do about it.
    expect(result.code).toBe('DUPLICATE_INSTITUTION');
    expect(result.error).toContain('already connected');
    expect(result.error).toContain('Sign in to Bank');
    // Nothing may be written — a partial store is the duplicate we are preventing.
    expect(dataService.saveData).not.toHaveBeenCalled();
    // And the Item we exchanged must not be left live at Plaid.
    expect(plaidService.removeItem).toHaveBeenCalledWith('access-new');
  });

  it('refuses the whole link when only one of several accounts collides', async () => {
    const { service, dataService } = build(
      [existingBofA()],
      [livePlaidAccount(), livePlaidAccount({ plaidAccountId: 'brand-new', mask: '9999' })]
    );

    const result = await service.connectAccount(
      'fam-1',
      'public-token',
      'ins_127989',
      'Bank of America'
    );

    expect(result.success).toBe(false);
    expect(dataService.saveData).not.toHaveBeenCalled();
  });

  it('allows a genuinely new institution through', async () => {
    const { service, plaidService } = build(
      [existingBofA()],
      [livePlaidAccount({ mask: '1111' })]
    );

    const result = await service.connectAccount(
      'fam-1',
      'public-token',
      'ins_000001',
      'KeyBank'
    );

    expect(result.success).toBe(true);
    expect(plaidService.removeItem).not.toHaveBeenCalled();
  });

  it('allows a second account at the same institution with a different mask', async () => {
    const { service } = build([existingBofA()], [livePlaidAccount({ mask: '9670', subtype: 'credit card', type: 'credit' })]);

    const result = await service.connectAccount('fam-1', 'public-token', 'ins_127989', 'Bank of America');

    expect(result.success).toBe(true);
  });

  it('does not block on a null mask, where two accounts cannot be told apart', async () => {
    // Two Venmo profiles on separate Items is a real, legitimate state.
    const { service } = build(
      [existingBofA({ institutionId: 'ins_venmo', institutionName: 'Venmo', mask: null, accountName: 'Personal Profile' })],
      [livePlaidAccount({ mask: null, name: 'Personal Profile' })]
    );

    const result = await service.connectAccount('fam-1', 'public-token', 'ins_venmo', 'Venmo');

    expect(result.success).toBe(true);
  });

  it('ignores disconnected accounts, so a removed account can be re-added', async () => {
    const { service } = build([existingBofA({ status: 'inactive' })], [livePlaidAccount()]);

    const result = await service.connectAccount('fam-1', 'public-token', 'ins_127989', 'Bank of America');

    expect(result.success).toBe(true);
  });
});
