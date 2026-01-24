import React, { useState, useCallback, useEffect, useRef } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import type { PlaidLinkOnSuccess, PlaidLinkOnExit } from 'react-plaid-link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
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

export function PlaidLinkProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updateAccountId, setUpdateAccountId] = useState<string | null>(null);
  const openRef = useRef<(() => void) | null>(null);

  // Connect account mutation (for new accounts)
  const connectAccountMutation = useMutation({
    mutationFn: api.connectAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setIsLoading(false);
      setToken(null);
      openRef.current = null;
    },
    onError: (error) => {
      console.error('Failed to connect account:', error);
      setIsLoading(false);
      setError(error instanceof Error ? error.message : 'Failed to connect account');
    },
  });

  // Complete reauth mutation (for existing accounts)
  const completeReauthMutation = useMutation({
    mutationFn: api.completeReauth,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setIsLoading(false);
      setToken(null);
      setUpdateAccountId(null);
      openRef.current = null;
    },
    onError: (error) => {
      console.error('Failed to complete re-authentication:', error);
      setIsLoading(false);
      setError(error instanceof Error ? error.message : 'Failed to complete re-authentication');
    },
  });

  const handleSuccess = useCallback<PlaidLinkOnSuccess>((public_token, metadata) => {
    setIsLoading(true);
    if (updateAccountId) {
      // Update mode - just mark the account as active
      completeReauthMutation.mutate(updateAccountId);
    } else {
      // New account mode
      connectAccountMutation.mutate({
        publicToken: public_token,
        institutionId: metadata.institution?.institution_id || '',
        institutionName: metadata.institution?.name || '',
      });
    }
  }, [connectAccountMutation, completeReauthMutation, updateAccountId]);

  const handleExit = useCallback<PlaidLinkOnExit>((error) => {
    if (error) {
      console.error('Plaid Link exit with error:', error);
      setError(error.error_message || 'Plaid Link error');
    }
    setIsLoading(false);
    setToken(null);
    setUpdateAccountId(null);
    openRef.current = null;
  }, []);

  const handleReady = useCallback((open: (() => void) | null) => {
    openRef.current = open;
    setIsLoading(false);
  }, []);

  const openPlaid = useCallback(async () => {
    if (openRef.current) {
      openRef.current();
      return;
    }

    if (!token) {
      setIsLoading(true);
      setError(null);
      setUpdateAccountId(null);

      try {
        const result = await api.createLinkToken();
        setToken(result.link_token);
      } catch (err) {
        console.error('Failed to fetch link token:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch link token');
        setIsLoading(false);
      }
    }
  }, [token]);

  const openPlaidUpdate = useCallback(async (accountId: string) => {
    if (openRef.current) {
      openRef.current();
      return;
    }

    setIsLoading(true);
    setError(null);
    setUpdateAccountId(accountId);

    try {
      const result = await api.createUpdateLinkToken(accountId);
      setToken(result.link_token);
    } catch (err) {
      console.error('Failed to fetch update link token:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch link token');
      setIsLoading(false);
      setUpdateAccountId(null);
    }
  }, []);

  return (
    <PlaidLinkContext.Provider value={{ openPlaid, openPlaidUpdate, isLoading, error }}>
      {children}
      {token && (
        <PlaidLinkComponent
          token={token}
          onSuccess={handleSuccess}
          onExit={handleExit}
          onReady={handleReady}
        />
      )}
    </PlaidLinkContext.Provider>
  );
}

