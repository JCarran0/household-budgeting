/**
 * Plaid Link mode routing (TD-028).
 *
 * A Link token is bound to one mode when it is minted: create-mode adds a new
 * Item, update-mode re-authenticates one existing Item. Plaid Link looks
 * identical to the user in both, so if the provider opens the wrong one there is
 * no cue anywhere — the user sees their bank login, signs in, and the app links
 * an institution it already had.
 *
 * That is what happened on 2026-09-12: `openPlaidUpdate` reused whatever Link
 * instance was already loaded, a create-mode token left ready by the "Connect
 * Account" button won the click, and Bank of America was linked a second time.
 * 892 transactions re-imported, 887 of them duplicates.
 *
 * These tests pin the routing rule: an instance is reused only when it was
 * minted for exactly what is being asked for now.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlaidLinkProvider } from './PlaidLinkProvider';
import { PlaidLinkContext } from '../contexts/PlaidLinkContext';
import { api } from '../lib/api';

// The real hook loads Plaid's script. Stand in for it with something that
// reports ready immediately and records the token it was handed, which is the
// only thing these tests need to distinguish the two modes.
const openSpy = vi.fn();
let lastToken: string | null = null;
let lastOnSuccess: ((publicToken: string, metadata: unknown) => void) | null = null;

vi.mock('react-plaid-link', () => ({
  usePlaidLink: ({ token, onSuccess }: { token: string; onSuccess: (p: string, m: unknown) => void }) => {
    lastToken = token;
    lastOnSuccess = onSuccess;
    return { open: openSpy, ready: true };
  },
}));

vi.mock('../lib/api', () => ({
  api: {
    createLinkToken: vi.fn(),
    createUpdateLinkToken: vi.fn(),
    connectAccount: vi.fn(),
    completeReauth: vi.fn(),
  },
}));

type Ctx = { openPlaid: () => void; openPlaidUpdate: (id: string) => void };
let ctx: Ctx;

function Grab() {
  const value = PlaidLinkContext;
  return (
    <value.Consumer>
      {(v) => {
        ctx = v as Ctx;
        return null;
      }}
    </value.Consumer>
  );
}

function renderProvider() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlaidLinkProvider>
        <Grab />
      </PlaidLinkProvider>
    </QueryClientProvider>
  );
}

const mockedApi = api as unknown as {
  createLinkToken: ReturnType<typeof vi.fn>;
  createUpdateLinkToken: ReturnType<typeof vi.fn>;
  connectAccount: ReturnType<typeof vi.fn>;
};

describe('PlaidLinkProvider — mode routing (TD-028)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastToken = null;
    lastOnSuccess = null;
    mockedApi.createLinkToken.mockResolvedValue({ link_token: 'create-token' });
    mockedApi.createUpdateLinkToken.mockResolvedValue({ link_token: 'update-token' });
  });

  it('does not reuse a create-mode instance for a re-auth', async () => {
    renderProvider();

    // "Connect Account" — leaves a create-mode instance loaded and ready.
    await act(async () => {
      await ctx.openPlaid();
    });
    await waitFor(() => expect(lastToken).toBe('create-token'));

    // "Sign in to Bank" on an existing account must mint its own update token
    // rather than opening the create-mode instance still sitting there.
    await act(async () => {
      await ctx.openPlaidUpdate('acct-1');
    });

    await waitFor(() => expect(lastToken).toBe('update-token'));
    expect(mockedApi.createUpdateLinkToken).toHaveBeenCalledWith('acct-1');
  });

  it('does not reuse an update-mode instance for a different account', async () => {
    renderProvider();

    await act(async () => {
      await ctx.openPlaidUpdate('acct-1');
    });
    await waitFor(() => expect(lastToken).toBe('update-token'));

    mockedApi.createUpdateLinkToken.mockResolvedValue({ link_token: 'update-token-2' });
    await act(async () => {
      await ctx.openPlaidUpdate('acct-2');
    });

    await waitFor(() => expect(lastToken).toBe('update-token-2'));
    expect(mockedApi.createUpdateLinkToken).toHaveBeenLastCalledWith('acct-2');
  });

  it('does not reuse an update-mode instance for a new connection', async () => {
    renderProvider();

    await act(async () => {
      await ctx.openPlaidUpdate('acct-1');
    });
    await waitFor(() => expect(lastToken).toBe('update-token'));

    await act(async () => {
      await ctx.openPlaid();
    });

    await waitFor(() => expect(lastToken).toBe('create-token'));
    expect(mockedApi.createLinkToken).toHaveBeenCalled();
  });

  it('drops the loaded instance when the mutation fails', async () => {
    // A failed connect used to leave the create-mode instance loaded and ready.
    // That stale instance is what the next "Sign in to Bank" click inherited —
    // the enabling half of the 2026-09-12 duplicate link.
    mockedApi.connectAccount.mockRejectedValue(new Error('already connected'));
    renderProvider();

    await act(async () => {
      await ctx.openPlaid();
    });
    await waitFor(() => expect(lastToken).toBe('create-token'));

    await act(async () => {
      lastOnSuccess?.('public-token', { institution: { institution_id: 'ins_1', name: 'Bank' } });
    });
    await waitFor(() => expect(mockedApi.connectAccount).toHaveBeenCalled());

    // The next open must mint a fresh token rather than reopening the dead one.
    mockedApi.createLinkToken.mockClear();
    await act(async () => {
      await ctx.openPlaid();
    });
    expect(mockedApi.createLinkToken).toHaveBeenCalled();
  });

  it('reuses the loaded instance when the same account is re-opened', async () => {
    renderProvider();

    await act(async () => {
      await ctx.openPlaidUpdate('acct-1');
    });
    await waitFor(() => expect(lastToken).toBe('update-token'));
    expect(mockedApi.createUpdateLinkToken).toHaveBeenCalledTimes(1);

    await act(async () => {
      await ctx.openPlaidUpdate('acct-1');
    });

    // No second token fetch — this is the case the reuse shortcut exists for.
    expect(mockedApi.createUpdateLinkToken).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalled();
  });
});
