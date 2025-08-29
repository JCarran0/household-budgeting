import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { PlaidButton } from '../components/PlaidButton';
import { formatDistanceToNow } from 'date-fns';
import { RefreshCw, Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';

export function Accounts() {
  const queryClient = useQueryClient();
  const [syncingAccount, setSyncingAccount] = useState<string | null>(null);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: api.getAccounts,
  });

  const syncMutation = useMutation({
    mutationFn: (accountId: string) => api.syncTransactions(accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setSyncingAccount(null);
    },
    onError: () => {
      setSyncingAccount(null);
    },
  });

  const handleSync = (accountId: string) => {
    setSyncingAccount(accountId);
    syncMutation.mutate(accountId);
  };

  const handleSyncAll = () => {
    setSyncingAccount('all');
    syncMutation.mutate(undefined as any);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Connected Accounts</h1>
        {accounts && accounts.length > 0 && (
          <div className="flex space-x-3">
            <button
              onClick={handleSyncAll}
              disabled={syncingAccount !== null}
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncingAccount === 'all' ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sync All
                </>
              )}
            </button>
            <PlaidButton />
          </div>
        )}
      </div>

      {accounts && accounts.length > 0 ? (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {accounts.map((account) => (
              <li key={account.id}>
                <div className="px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center">
                        <p className="text-lg font-medium text-gray-900">{account.name}</p>
                        <span className="ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                          {account.type}
                        </span>
                        {account.subtype && (
                          <span className="ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                            {account.subtype}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 sm:flex sm:justify-between">
                        <div className="sm:flex">
                          <p className="flex items-center text-sm text-gray-500">
                            {account.institution}
                          </p>
                          {account.mask && (
                            <p className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0 sm:ml-6">
                              ****{account.mask}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="ml-5 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-lg font-semibold text-gray-900">
                          ${account.currentBalance.toFixed(2)}
                        </p>
                        {account.availableBalance !== null && account.availableBalance !== account.currentBalance && (
                          <p className="text-sm text-gray-500">
                            Available: ${account.availableBalance.toFixed(2)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                      Last synced:{' '}
                      {account.lastSynced
                        ? formatDistanceToNow(new Date(account.lastSynced), { addSuffix: true })
                        : 'Never'}
                    </p>
                    <button
                      onClick={() => handleSync(account.id)}
                      disabled={syncingAccount !== null}
                      className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {syncingAccount === account.id ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Syncing...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Sync
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No accounts connected</h3>
          <p className="mt-1 text-sm text-gray-500">
            Connect your bank accounts to start tracking your finances.
          </p>
          <div className="mt-6">
            <PlaidButton />
          </div>
        </div>
      )}
    </div>
  );
}