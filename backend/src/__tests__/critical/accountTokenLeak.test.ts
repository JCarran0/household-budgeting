/**
 * SA-19 regression — Plaid credentials must never cross the wire.
 *
 * `routes/accounts.ts` used to spread `...account` straight into the response,
 * so every account listing shipped the encrypted `plaidAccessToken` (plus the
 * sync cursor and Plaid item/account IDs) to the browser, where it landed in
 * React Query caches and devtools.
 *
 * The ciphertext is strong, so this was never directly exploitable — the point
 * is that it collapsed two independent defenses into one. Anyone who obtained
 * PLAID_ENCRYPTION_SECRET by any route (env leak, a deploy tarball per SA-25, a
 * laptop) plus a captured API response would hold a live Plaid access token.
 *
 * These tests assert on the *serialized JSON*, not on the mapper's return type,
 * because TypeScript's structural typing would happily let an extra field ride
 * along at runtime. The wire is the boundary that matters.
 */

import { toClientAccount, type StoredAccount } from '../../services/accountService';

const SENTINEL_TOKEN = 'access-sandbox-LIVE-PLAID-TOKEN-DO-NOT-LEAK';

const storedAccount: StoredAccount = {
  id: 'acct-1',
  userId: 'user-1',
  plaidItemId: 'item-abc',
  plaidAccountId: 'plaid-acct-abc',
  plaidAccessToken: SENTINEL_TOKEN,
  institutionId: 'ins_1',
  institutionName: 'Big Bank',
  accountName: 'Everyday Checking',
  officialName: 'BIG BANK EVERYDAY CHECKING',
  nickname: null,
  type: 'checking',
  subtype: 'checking',
  mask: '4321',
  currentBalance: 1234.56,
  availableBalance: 1200,
  creditLimit: null,
  currency: 'USD',
  status: 'active',
  lastSynced: null,
  plaidCursor: 'cursor-xyz-irreversible',
  lastTransactionUpdate: null,
  consentExpirationTime: null,
  persistentAccountId: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
};

describe('toClientAccount — Plaid field stripping (SA-19)', () => {
  it('omits the access token, cursor, and Plaid identifiers', () => {
    const client = toClientAccount(storedAccount);
    const keys = Object.keys(client);

    expect(keys).not.toContain('plaidAccessToken');
    expect(keys).not.toContain('plaidCursor');
    expect(keys).not.toContain('plaidItemId');
    expect(keys).not.toContain('plaidAccountId');
  });

  it('leaves no trace of the token anywhere in the serialized payload', () => {
    // Guards against a nested or renamed copy sneaking through — a key-name
    // check alone would miss `{ meta: { token } }`.
    const serialized = JSON.stringify(toClientAccount(storedAccount));

    expect(serialized).not.toContain(SENTINEL_TOKEN);
    expect(serialized).not.toContain('cursor-xyz-irreversible');
  });

  it('preserves every field the UI actually renders', () => {
    const client = toClientAccount(storedAccount);

    expect(client).toMatchObject({
      id: 'acct-1',
      institutionName: 'Big Bank',
      accountName: 'Everyday Checking',
      nickname: null,
      type: 'checking',
      mask: '4321',
      currentBalance: 1234.56,
      availableBalance: 1200,
      status: 'active',
    });
  });

  it('does not mutate the stored account it was handed', () => {
    // The mapper runs against objects that may still be written back to
    // storage; stripping in place would destroy the real token.
    toClientAccount(storedAccount);

    expect(storedAccount.plaidAccessToken).toBe(SENTINEL_TOKEN);
    expect(storedAccount.plaidCursor).toBe('cursor-xyz-irreversible');
  });

  it('strips the same fields when the account is spread into a larger shape', () => {
    // Mirrors what GET /accounts does: spread the mapper output, then add the
    // `institution` alias. A regression that spread the raw account instead
    // would reintroduce the leak here.
    const mapped = {
      ...toClientAccount(storedAccount),
      institution: storedAccount.institutionName,
    };

    expect(JSON.stringify(mapped)).not.toContain(SENTINEL_TOKEN);
    expect(mapped.institution).toBe('Big Bank');
  });
});
