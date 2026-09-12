import React, { useState, useCallback, useEffect, useRef } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import type { PlaidLinkOnSuccess, PlaidLinkOnExit } from 'react-plaid-link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api } from '../lib/api';
import { getApiErrorMessage } from '../lib/api/errors';
import { PlaidLinkContext } from '../contexts/PlaidLinkContext';

// Component that actually uses usePlaidLink - only rendered when token exists
function PlaidLinkComponent({ 
  token, 
  onSuccess, 
  onExit,
  onReady 
}: {
  token: string;
  onSuccess: PlaidLinkOnSuccess;
  onExit: PlaidLinkOnExit;
  onReady: (open: (() => void) | null) => void;
}) {
  const { open, ready } = usePlaidLink({
    token,
    onSuccess,
    onExit,
  });

  useEffect(() => {
    if (ready && open) {
      onReady(() => open);
      // Automatically open when ready
      open();
    }
  }, [ready, open, onReady]);

  return null;
}

/**
 * What the currently-loaded Link token was minted for.
 *
 * A Link token is bound to one mode at creation: a create-mode token adds a new
 * Item, an update-mode token re-authenticates one specific existing Item. The
 * two are not interchangeable, and Plaid Link looks identical to the user in
 * both — same bank login, no cue as to which one they are in.
 *
 * This is tracked in a ref rather than state because it must be authoritative at
 * the moment Plaid calls back, not at the moment React last rendered (TD-028).
 */
type LoadedLink = { mode: 'create' } | { mode: 'update'; accountId: string };

export function PlaidLinkProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openRef = useRef<(() => void) | null>(null);
  const loadedRef = useRef<LoadedLink | null>(null);

  /** Drop the loaded Link instance so the next open has to mint its own token. */
  const resetLink = useCallback(() => {
    setToken(null);
    openRef.current = null;
    loadedRef.current = null;
  }, []);

  // Connect account mutation (for new accounts)
  const connectAccountMutation = useMutation({
    mutationFn: api.connectAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setIsLoading(false);
      resetLink();
    },
    onError: (error) => {
      console.error('Failed to connect account:', error);
      setIsLoading(false);
      // `error.message` on an axios failure is "Request failed with status code
      // NNN" — the server's own explanation lives in the response body, which
      // is what the user needs to read.
      setError(getApiErrorMessage(error, 'Failed to connect account'));
      // Drop the Link instance. A failed mutation used to leave it loaded and
      // ready, which is how a create-mode instance outlived the click that
      // made it and captured the next "Sign in to Bank" (TD-028).
      resetLink();
    },
  });

  // Complete reauth mutation (for existing accounts)
  const completeReauthMutation = useMutation({
    mutationFn: api.completeReauth,
    onSuccess: (result) => {
      // A re-auth can re-provision the Item's accounts (TD-020). New accounts are
      // adopted silently-safely; replacements and disappearances can't be repaired
      // here, so say so rather than reporting a clean success.
      const nameList = (refs: { accountName: string; mask: string | null }[]) =>
        refs.map(r => (r.mask ? `${r.accountName} ••${r.mask}` : r.accountName)).join(', ');

      if (result.adopted.length > 0) {
        notifications.show({
          color: 'green',
          title: 'New accounts added',
          message: `Now tracking ${nameList(result.adopted)}.`,
        });
      }

      const needsHelp = [...result.pendingReconciliation, ...result.unpaired];
      if (needsHelp.length > 0) {
        notifications.show({
          color: 'yellow',
          autoClose: false,
          title: 'Reconnected, but one account needs attention',
          message:
            `Your bank issued a new ID for ${nameList(needsHelp)}. New transactions ` +
            `can't be filed against it yet — nothing is lost, and syncing again is safe. ` +
            `This one needs a maintainer to finish.`,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setIsLoading(false);
      resetLink();
    },
    onError: (error) => {
      console.error('Failed to complete re-authentication:', error);
      setIsLoading(false);
      setError(getApiErrorMessage(error, 'Failed to complete re-authentication'));
      resetLink();
    },
  });

  const handleSuccess = useCallback<PlaidLinkOnSuccess>((public_token, metadata) => {
    setIsLoading(true);
    // Branch on what the token was minted for, never on render state. Reading a
    // stale `null` here is what linked Bank of America a second time on
    // 2026-09-12 and re-imported 892 transactions (TD-028).
    const loaded = loadedRef.current;
    if (loaded?.mode === 'update') {
      // Update mode - just mark the account as active
      completeReauthMutation.mutate(loaded.accountId);
    } else {
      // New account mode
      connectAccountMutation.mutate({
        publicToken: public_token,
        institutionId: metadata.institution?.institution_id || '',
        institutionName: metadata.institution?.name || '',
      });
    }
  }, [connectAccountMutation, completeReauthMutation]);

  const handleExit = useCallback<PlaidLinkOnExit>((error) => {
    if (error) {
      console.error('Plaid Link exit with error:', error);
      setError(error.error_message || 'Plaid Link error');
    }
    setIsLoading(false);
    resetLink();
  }, [resetLink]);

  const handleReady = useCallback((open: (() => void) | null) => {
    openRef.current = open;
    setIsLoading(false);
  }, []);

  /**
   * Reuse the loaded Link instance only when it was minted for exactly what is
   * being asked for now.
   *
   * `openRef.current` survives from whenever a token last became ready until a
   * success, exit or error clears it — so it routinely outlives the click that
   * created it. Reusing it unconditionally meant whichever mode loaded first won
   * every subsequent click: a create-mode token left ready by the "Connect
   * Account" button turned the next "Sign in to Bank" into a second link of an
   * institution already connected.
   */
  const canReuse = useCallback((want: LoadedLink): boolean => {
    const loaded = loadedRef.current;
    if (!openRef.current || !loaded) return false;
    if (loaded.mode === 'create') return want.mode === 'create';
    return want.mode === 'update' && want.accountId === loaded.accountId;
  }, []);

  const openPlaid = useCallback(async () => {
    if (canReuse({ mode: 'create' })) {
      openRef.current?.();
      return;
    }

    setIsLoading(true);
    setError(null);
    resetLink();

    try {
      const result = await api.createLinkToken();
      loadedRef.current = { mode: 'create' };
      setToken(result.link_token);
    } catch (err) {
      console.error('Failed to fetch link token:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch link token');
      setIsLoading(false);
      loadedRef.current = null;
    }
  }, [canReuse, resetLink]);

  const openPlaidUpdate = useCallback(async (accountId: string) => {
    if (canReuse({ mode: 'update', accountId })) {
      openRef.current?.();
      return;
    }

    setIsLoading(true);
    setError(null);
    resetLink();

    try {
      const result = await api.createUpdateLinkToken(accountId);
      loadedRef.current = { mode: 'update', accountId };
      setToken(result.link_token);
    } catch (err) {
      console.error('Failed to fetch update link token:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch link token');
      setIsLoading(false);
      loadedRef.current = null;
    }
  }, [canReuse, resetLink]);

  return (
    <PlaidLinkContext.Provider value={{ openPlaid, openPlaidUpdate, isLoading, error }}>
      {children}
      {token && (
        // Keyed on the token so a new one always mounts a fresh Link instance
        // rather than re-using the previous mode's handlers.
        <PlaidLinkComponent
          key={token}
          token={token}
          onSuccess={handleSuccess}
          onExit={handleExit}
          onReady={handleReady}
        />
      )}
    </PlaidLinkContext.Provider>
  );
}

