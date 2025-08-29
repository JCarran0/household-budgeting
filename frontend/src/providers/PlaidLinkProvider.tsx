import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import type { PlaidLinkOnSuccess, PlaidLinkOnExit } from 'react-plaid-link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface PlaidLinkContextType {
  openPlaid: () => void;
  isLoading: boolean;
  error: string | null;
}

const PlaidLinkContext = createContext<PlaidLinkContextType | undefined>(undefined);

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
      console.log('Plaid Link is ready');
      onReady(open);
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
    console.log('Plaid Link success, exchanging token...');
    console.log('Institution:', metadata.institution);
    setIsLoading(true);
    connectAccountMutation.mutate({
      publicToken: public_token,
      institutionId: metadata.institution?.institution_id || '',
      institutionName: metadata.institution?.name || '',
    });
  }, [connectAccountMutation]);

  const handleExit = useCallback<PlaidLinkOnExit>((error, metadata) => {
    if (error) {
      console.error('Plaid Link exit with error:', error);
      setError(error.error_message || 'Plaid Link error');
    }
    console.log('Plaid Link exit, metadata:', metadata);
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
    console.log('Open Plaid requested');
    
    if (openRef.current) {
      // Plaid is already initialized and ready, just open it
      console.log('Opening existing Plaid Link modal...');
      openRef.current();
      return;
    }

    if (!token) {
      // Fetch token which will trigger PlaidLinkComponent to render
      console.log('Fetching link token...');
      setIsLoading(true);
      setError(null);
      
      try {
        const result = await api.createLinkToken();
        console.log('Link token received');
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

export function usePlaid() {
  const context = useContext(PlaidLinkContext);
  if (context === undefined) {
    throw new Error('usePlaid must be used within a PlaidLinkProvider');
  }
  return context;
}