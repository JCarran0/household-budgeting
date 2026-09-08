import { PlaidWebhookService } from '../../services/plaidWebhookService';
import type { StoredAccount } from '../../services/accountService';

const ITEM = 'item-abc';
const FAMILY = 'fam-1';

const account = (over: Partial<StoredAccount> = {}): StoredAccount =>
  ({
    id: 'acct-1',
    plaidAccountId: 'plaid-acct-1',
    plaidItemId: ITEM,
    accountName: 'Checking',
    mask: '4404',
    status: 'active',
    updatedAt: new Date('2026-01-01'),
    ...over,
  }) as StoredAccount;

function harness(accounts: StoredAccount[] = [account()]) {
  const store = new Map<string, unknown>([[`accounts_${FAMILY}`, accounts]]);
  const data = {
    listKeys: jest.fn(async () => [...store.keys()]),
    getData: jest.fn(async (k: string) => (store.get(k) ?? null) as never),
    saveData: jest.fn(async (k: string, v: unknown) => { store.set(k, v); }),
  };
  const txns = {
    syncTransactions: jest.fn(
      async (_familyId: string, _accounts: StoredAccount[]) =>
        ({ added: 3, modified: 1, removed: 0, success: true }),
    ),
  };
  const svc = new PlaidWebhookService(data, txns as never);
  const current = () => store.get(`accounts_${FAMILY}`) as StoredAccount[];
  return { svc, data, txns, current };
}

describe('PlaidWebhookService dispatch', () => {
  it('resolves the owning family from item_id alone', async () => {
    const { svc } = harness();
    await expect(svc.resolveItem(ITEM)).resolves.toMatchObject({ familyId: FAMILY });
  });

  it('reports an unknown item rather than throwing — a disconnected Item can still emit', async () => {
    const { svc, txns } = harness();
    await expect(svc.handle({ item_id: 'gone', webhook_code: 'SYNC_UPDATES_AVAILABLE' }))
      .resolves.toEqual({ handled: false, reason: 'unknown_item' });
    expect(txns.syncTransactions).not.toHaveBeenCalled();
  });

  it('refuses a payload with no item_id', async () => {
    const { svc } = harness();
    await expect(svc.handle({ webhook_code: 'SYNC_UPDATES_AVAILABLE' }))
      .resolves.toEqual({ handled: false, reason: 'no_item_id' });
  });

  it.each(['SYNC_UPDATES_AVAILABLE', 'DEFAULT_UPDATE', 'INITIAL_UPDATE', 'HISTORICAL_UPDATE'])(
    'syncs on %s', async (webhook_code) => {
      const { svc, txns } = harness();
      const res = await svc.handle({ item_id: ITEM, webhook_code });
      expect(res).toMatchObject({ handled: true, action: 'synced', added: 3, modified: 1 });
      expect(txns.syncTransactions).toHaveBeenCalledWith(FAMILY, expect.any(Array));
    },
  );

  it('passes only the accounts on that Item to the sync', async () => {
    const { svc, txns } = harness([account(), account({ id: 'other', plaidItemId: 'item-zzz' })]);
    await svc.handle({ item_id: ITEM, webhook_code: 'SYNC_UPDATES_AVAILABLE' });
    const passed = txns.syncTransactions.mock.calls[0][1];
    expect(passed.map(a => a.id)).toEqual(['acct-1']);
  });

  it('records the consent expiry so the existing warning can surface it', async () => {
    const { svc, current } = harness();
    const res = await svc.handle({
      item_id: ITEM, webhook_code: 'PENDING_EXPIRATION',
      consent_expiration_time: '2026-10-01T00:00:00Z',
    });
    expect(res).toEqual({ handled: true, action: 'consent_expiring', expiresAt: '2026-10-01T00:00:00Z' });
    expect(current()[0].consentExpirationTime).toBe('2026-10-01T00:00:00Z');
  });

  it('marks requires_reauth only for ITEM_LOGIN_REQUIRED', async () => {
    const { svc, current } = harness();
    const res = await svc.handle({
      item_id: ITEM, webhook_code: 'ERROR', error: { error_code: 'ITEM_LOGIN_REQUIRED' },
    });
    expect(res).toEqual({ handled: true, action: 'reauth_required' });
    expect(current()[0].status).toBe('requires_reauth');
  });

  it('marks a non-login error as error, not requires_reauth', async () => {
    // Telling the user to sign in again when that cannot help is the TD-022 mistake.
    const { svc, current } = harness();
    const res = await svc.handle({
      item_id: ITEM, webhook_code: 'ERROR', error: { error_code: 'INSTITUTION_DOWN' },
    });
    expect(res).toMatchObject({ handled: true, action: 'logged', detail: 'INSTITUTION_DOWN' });
    expect(current()[0].status).toBe('error');
  });

  it.each(['USER_PERMISSION_REVOKED', 'PENDING_DISCONNECT'])(
    'treats %s as needing re-auth', async (webhook_code) => {
      const { svc, current } = harness();
      await expect(svc.handle({ item_id: ITEM, webhook_code }))
        .resolves.toEqual({ handled: true, action: 'reauth_required' });
      expect(current()[0].status).toBe('requires_reauth');
    },
  );

  it('acknowledges an unrecognised code without touching state', async () => {
    const { svc, data } = harness();
    await expect(svc.handle({ item_id: ITEM, webhook_code: 'SOMETHING_NEW' }))
      .resolves.toEqual({ handled: false, reason: 'ignored' });
    expect(data.saveData).not.toHaveBeenCalled();
  });

  it('leaves other Items untouched when patching', async () => {
    const other = account({ id: 'other', plaidItemId: 'item-zzz', status: 'active' });
    const { svc, current } = harness([account(), other]);
    await svc.handle({ item_id: ITEM, webhook_code: 'ERROR', error: { error_code: 'ITEM_LOGIN_REQUIRED' } });
    expect(current().find(a => a.id === 'other')?.status).toBe('active');
  });
});
