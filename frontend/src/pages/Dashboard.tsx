import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatDistanceToNow } from 'date-fns';
import { DollarSign, TrendingUp, TrendingDown, CreditCard, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Dashboard() {
  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: api.getAccounts,
  });

  const { data: transactionData, isLoading: transactionsLoading } = useQuery({
    queryKey: ['transactions', 'recent'],
    queryFn: () => api.getTransactions({ limit: 10 }),
  });

  const isLoading = accountsLoading || transactionsLoading;

  const totalBalance = accounts?.reduce(
    (sum, account) => sum + (account.currentBalance || 0),
    0
  ) || 0;

  const totalAvailable = accounts?.reduce(
    (sum, account) => sum + (account.availableBalance || account.currentBalance || 0),
    0
  ) || 0;

  const recentTransactions = transactionData?.transactions || [];

  const monthlySpending = recentTransactions
    .filter(t => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const monthlyIncome = recentTransactions
    .filter(t => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);

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
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        {accounts && accounts.length === 0 && (
          <Link
            to="/accounts"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Connect Account
          </Link>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <DollarSign className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Balance</dt>
                  <dd className="text-lg font-semibold text-gray-900">
                    ${totalBalance.toFixed(2)}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CreditCard className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Available</dt>
                  <dd className="text-lg font-semibold text-gray-900">
                    ${totalAvailable.toFixed(2)}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <TrendingDown className="h-6 w-6 text-red-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Monthly Spending</dt>
                  <dd className="text-lg font-semibold text-red-600">
                    -${monthlySpending.toFixed(2)}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <TrendingUp className="h-6 w-6 text-green-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Monthly Income</dt>
                  <dd className="text-lg font-semibold text-green-600">
                    +${monthlyIncome.toFixed(2)}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Accounts List */}
      {accounts && accounts.length > 0 && (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <div className="px-4 py-5 sm:px-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">Connected Accounts</h3>
          </div>
          <ul className="divide-y divide-gray-200">
            {accounts.map((account) => (
              <li key={account.id}>
                <div className="px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <p className="text-sm font-medium text-gray-900">{account.name}</p>
                      <p className="ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                        {account.type}
                      </p>
                    </div>
                    <div className="ml-2 flex items-center text-sm text-gray-500">
                      <p className="text-sm font-medium text-gray-900">
                        ${account.currentBalance.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 sm:flex sm:justify-between">
                    <div className="sm:flex">
                      <p className="flex items-center text-sm text-gray-500">
                        {account.institution} - ****{account.mask}
                      </p>
                    </div>
                    <div className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0">
                      <p>
                        Last synced:{' '}
                        {account.lastSynced
                          ? formatDistanceToNow(new Date(account.lastSynced), { addSuffix: true })
                          : 'Never'}
                      </p>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent Transactions */}
      {recentTransactions.length > 0 && (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
            <h3 className="text-lg leading-6 font-medium text-gray-900">Recent Transactions</h3>
            <Link
              to="/transactions"
              className="text-sm font-medium text-blue-600 hover:text-blue-500"
            >
              View all →
            </Link>
          </div>
          <ul className="divide-y divide-gray-200">
            {recentTransactions.map((transaction) => (
              <li key={transaction.id}>
                <div className="px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {transaction.merchantName || transaction.name}
                    </p>
                    <div className="ml-2 flex-shrink-0 flex">
                      <p
                        className={`px-2 inline-flex text-sm leading-5 font-semibold ${
                          transaction.amount < 0
                            ? 'text-red-600'
                            : 'text-green-600'
                        }`}
                      >
                        {transaction.amount < 0 ? '-' : '+'}$
                        {Math.abs(transaction.amount).toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 sm:flex sm:justify-between">
                    <div className="sm:flex">
                      <p className="flex items-center text-sm text-gray-500">
                        {new Date(transaction.date).toLocaleDateString()}
                      </p>
                      {transaction.category && transaction.category.length > 0 && (
                        <p className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0 sm:ml-6">
                          {transaction.category.join(' > ')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Empty State */}
      {(!accounts || accounts.length === 0) && (
        <div className="text-center py-12">
          <CreditCard className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No accounts connected</h3>
          <p className="mt-1 text-sm text-gray-500">
            Get started by connecting your bank accounts.
          </p>
          <div className="mt-6">
            <Link
              to="/accounts"
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Connect Account
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}