/**
 * Critical Path Tests: Plaid account_id change (TD-020)
 *
 * When an institution reissues a card, Plaid can retire the old account_id and
 * mint a new one inside the same Item. Every transaction on the new account is
 * unplaceable against our stored accounts.
 *
 * The dangerous part is not the drop — we genuinely cannot file a transaction
 * against an account we do not have — it is advancing the cursor afterwards.
 * Plaid's cursor is a delivery receipt: once advanced, those rows are never
 * sent again, so a silent drop plus a cursor bump is permanent data loss.
 *
 * These tests pin the fail-closed guarantee: on an unrecognised account_id the
 * cursor must NOT move, and the caller must be told.
 */

import { v4 as uuidv4 } from 'uuid';
import { authService, dataService, transactionService, plaidService, accountService } from '../../services';
import { InMemoryDataService } from '../../services/dataService';
import { StoredAccount } from '../../services/accountService';
import { Transaction as PlaidTransaction } from '../../services/plaidService';
import { encryptionService } from '../../utils/encryption';

const KNOWN_ACCOUNT = 'plaid-account-known';
const REISSUED_ACCOUNT = 'plaid-account-reissued';
const ITEM_ID = 'item-reissue-test';
const EXISTING_CURSOR = 'cursor-before-sync';

function plaidTxn(id: string, accountId: string, amount: number, date: string): PlaidTransaction {
  return {
    id,
    plaidTransactionId: id,
    accountId,
    amount,
    date,
    name: `txn ${id}`,
    merchantName: null,
    category: [],
    categoryId: null,
    pending: false,
    isoCurrencyCode: 'USD',
    accountOwner: null,
    originalDescription: null,
    location: undefined,
  };
}

describe('User Story: my bank replaces a card mid-Item', () => {
  let familyId: string;
  let account: StoredAccount;

  beforeEach(async () => {
    if ('clear' in dataService) {
      (dataService as InMemoryDataService).clear();
    }
    authService.resetRateLimiting();
    jest.restoreAllMocks();

    const username = `reissue${Math.random().toString(36).substring(2, 8)}`;
    const result = await authService.register(username, 'secure passphrase for reissue tests', username);
    if (!result.success || !result.user) throw new Error('failed to create test user');
    familyId = result.user.id;

    account = {
      id: uuidv4(),
      userId: familyId,
      plaidItemId: ITEM_ID,
      plaidAccountId: KNOWN_ACCOUNT,
      plaidAccessToken: encryptionService.encrypt('test-access-token'),
      institutionId: 'ins_test',
      institutionName: 'Capital One',
      accountName: 'Quicksilver',
      officialName: 'Quicksilver',
      nickname: null,
      type: 'credit',
      subtype: 'credit card',
      mask: '7008',
      currentBalance: 100,
      availableBalance: null,
      creditLimit: null,
      currency: 'USD',
      status: 'active',
      lastSynced: new Date(),
      plaidCursor: EXISTING_CURSOR,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await dataService.saveData(`accounts_${familyId}`, [account]);
  });

  async function storedCursor(): Promise<string | null | undefined> {
    const accounts = await dataService.getData<StoredAccount[]>(`accounts_${familyId}`);
    return accounts?.find(a => a.id === account.id)?.plaidCursor;
  }

  test('holds the cursor when the delta references an unknown account_id', async () => {
    jest.spyOn(plaidService, 'syncTransactions').mockResolvedValueOnce({
      success: true,
      added: [plaidTxn('new-1', REISSUED_ACCOUNT, 25, '2026-07-20')],
      modified: [],
      removed: [],
      nextCursor: 'cursor-AFTER-sync',
    });

    const result = await transactionService.syncTransactions(familyId, [account], undefined);

    expect(result.success).toBe(true);
    // The guarantee: Plaid will re-send this delta next time.
    expect(await storedCursor()).toBe(EXISTING_CURSOR);
  });

  test('reports the condition instead of failing silently', async () => {
    jest.spyOn(plaidService, 'syncTransactions').mockResolvedValueOnce({
      success: true,
      added: [
        plaidTxn('new-1', REISSUED_ACCOUNT, 25, '2026-07-20'),
        plaidTxn('new-2', REISSUED_ACCOUNT, 40, '2026-07-21'),
      ],
      modified: [],
      removed: [],
      nextCursor: 'cursor-AFTER-sync',
    });

    const result = await transactionService.syncTransactions(familyId, [account], undefined);

    expect(result.reconciliationNeeded).toHaveLength(1);
    expect(result.reconciliationNeeded![0]).toMatchObject({
      plaidItemId: ITEM_ID,
      institutionName: 'Capital One',
      droppedRows: 2,
    });
    expect(result.warning).toMatch(/Capital One/);
    expect(result.warning).toMatch(/nothing has been lost/i);
  });

  test('counts modified rows for unknown accounts too', async () => {
    // `modified` has its own unknown-account branch; it must not be forgotten,
    // since advancing past a modify loses the update just the same.
    jest.spyOn(plaidService, 'syncTransactions').mockResolvedValueOnce({
      success: true,
      added: [],
      modified: [plaidTxn('mod-1', REISSUED_ACCOUNT, 10, '2026-07-22')],
      removed: [],
      nextCursor: 'cursor-AFTER-sync',
    });

    const result = await transactionService.syncTransactions(familyId, [account], undefined);

    expect(result.reconciliationNeeded![0].droppedRows).toBe(1);
    expect(await storedCursor()).toBe(EXISTING_CURSOR);
  });

  test('a normal delta still advances the cursor — fail-closed must not stall healthy syncs', async () => {
    jest.spyOn(plaidService, 'syncTransactions').mockResolvedValueOnce({
      success: true,
      added: [plaidTxn('ok-1', KNOWN_ACCOUNT, 12, '2026-07-20')],
      modified: [],
      removed: [],
      nextCursor: 'cursor-AFTER-sync',
    });

    const result = await transactionService.syncTransactions(familyId, [account], undefined);

    expect(result.added).toBe(1);
    expect(result.reconciliationNeeded).toBeUndefined();
    expect(result.warning).toBeUndefined();
    expect(await storedCursor()).toBe('cursor-AFTER-sync');
  });

  test('known-account rows in a mixed delta are still stored', async () => {
    // Partial application is intentional: rows we can file are filed, and the
    // held cursor simply re-delivers them next time (writes are idempotent by
    // plaidTransactionId).
    jest.spyOn(plaidService, 'syncTransactions').mockResolvedValueOnce({
      success: true,
      added: [
        plaidTxn('ok-1', KNOWN_ACCOUNT, 12, '2026-07-20'),
        plaidTxn('new-1', REISSUED_ACCOUNT, 25, '2026-07-20'),
      ],
      modified: [],
      removed: [],
      nextCursor: 'cursor-AFTER-sync',
    });

    const result = await transactionService.syncTransactions(familyId, [account], undefined);

    expect(result.added).toBe(1);
    expect(result.reconciliationNeeded![0].droppedRows).toBe(1);
    expect(await storedCursor()).toBe(EXISTING_CURSOR);
  });

  test('re-running the same delta does not duplicate the rows it could store', async () => {
    const delta = {
      success: true as const,
      added: [
        plaidTxn('ok-1', KNOWN_ACCOUNT, 12, '2026-07-20'),
        plaidTxn('new-1', REISSUED_ACCOUNT, 25, '2026-07-20'),
      ],
      modified: [],
      removed: [],
      nextCursor: 'cursor-AFTER-sync',
    };
    jest.spyOn(plaidService, 'syncTransactions').mockResolvedValue(delta);

    await transactionService.syncTransactions(familyId, [account], undefined);
    const second = await transactionService.syncTransactions(familyId, [account], undefined);

    // Second pass re-receives the same delta (cursor never moved) and must
    // recognise the already-stored row rather than inserting it again.
    expect(second.added).toBe(0);
    const stored = await transactionService.getTransactions(familyId, {});
    expect(stored.transactions?.filter(t => t.plaidTransactionId === 'ok-1')).toHaveLength(1);
  });

  test('accountService is never asked to move the cursor while reconciliation is pending', async () => {
    const setCursor = jest.spyOn(accountService, 'setItemCursor');
    jest.spyOn(plaidService, 'syncTransactions').mockResolvedValueOnce({
      success: true,
      added: [plaidTxn('new-1', REISSUED_ACCOUNT, 25, '2026-07-20')],
      modified: [],
      removed: [],
      nextCursor: 'cursor-AFTER-sync',
    });

    await transactionService.syncTransactions(familyId, [account], undefined);

    expect(setCursor).not.toHaveBeenCalled();
  });
});
