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
  const openRef = useRef<(() => void) | null>(null);

  // Connect account mutation
  const connectAccountMutation = useMutation({
    mutationFn: api.connectAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setIsLoading(false);
      // Reset token after successful connection
      setToken(null);
      openRef.current = null;
    },
    onError: (error) => {
      console.error('Failed to connect account:', error);
      setIsLoading(false);
      setError(error instanceof Error ? error.message : 'Failed to connect account');
    },
  });

  const handleSuccess = useCallback<PlaidLinkOnSuccess>((public_token, metadata) => {
    setIsLoading(true);
    connectAccountMutation.mutate({
      publicToken: public_token,
      institutionId: metadata.institution?.institution_id || '',
      institutionName: metadata.institution?.name || '',
    });
  }, [connectAccountMutation]);

  const handleExit = useCallback<PlaidLinkOnExit>((error) => {
    if (error) {
      console.error('Plaid Link exit with error:', error);
      setError(error.error_message || 'Plaid Link error');
    }
    setIsLoading(false);
    // Clear token on exit to allow retry
    setToken(null);
    openRef.current = null;
  }, []);

  const handleReady = useCallback((open: (() => void) | null) => {
    openRef.current = open;
    setIsLoading(false);
  }, []);

  const openPlaid = useCallback(async () => {
    if (openRef.current) {
      // Plaid is already initialized and ready, just open it
      openRef.current();
      return;
    }

    if (!token) {
      // Fetch token which will trigger PlaidLinkComponent to render
      setIsLoading(true);
      setError(null);
      
      try {
        const result = await api.createLinkToken();
        setToken(result.link_token);
        // PlaidLinkComponent will render and auto-open when ready
      } catch (err) {
        console.error('Failed to fetch link token:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch link token');
        setIsLoading(false);
      }
    }
  }, [token]);

  return (
    <PlaidLinkContext.Provider value={{ openPlaid, isLoading, error }}>
      {children}
      {/* Only render PlaidLinkComponent when we have a valid token */}
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

