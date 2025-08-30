import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatDistanceToNow } from 'date-fns';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  CreditCard, 
  Loader2, 
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Activity,
  Plus
} from 'lucide-react';
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
        <Loader2 className="h-8 w-8 animate-spin text-pastel-blue" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Dashboard</h1>
          <p className="mt-1 text-sm text-text-muted">
            Track your finances and monitor spending
          </p>
        </div>
        {accounts && accounts.length === 0 && (
          <Link
            to="/accounts"
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 text-sm font-medium rounded-xl text-gray-900 bg-pastel-blue hover:bg-pastel-blue-dark shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105"
          >
            <Plus className="h-4 w-4 mr-2" />
            Connect Account
          </Link>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Balance Card */}
        <div className="bg-bg-secondary rounded-2xl p-6 border border-border shadow-xl shadow-black/10">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-pastel-yellow/20 rounded-xl">
              <Wallet className="h-6 w-6 text-pastel-yellow" />
            </div>
            <span className="text-xs font-medium text-pastel-yellow">Total</span>
          </div>
          <div className="mt-4">
            <p className="text-2xl font-bold text-text-primary">
              ${totalBalance.toFixed(2)}
            </p>
            <p className="text-xs text-text-muted mt-1">Total Balance</p>
          </div>
        </div>

        {/* Available Balance Card */}
        <div className="bg-bg-secondary rounded-2xl p-6 border border-border shadow-xl shadow-black/10">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-pastel-blue/20 rounded-xl">
              <CreditCard className="h-6 w-6 text-pastel-blue" />
            </div>
            <span className="text-xs font-medium text-pastel-blue">Available</span>
          </div>
          <div className="mt-4">
            <p className="text-2xl font-bold text-text-primary">
              ${totalAvailable.toFixed(2)}
            </p>
            <p className="text-xs text-text-muted mt-1">Available to Spend</p>
          </div>
        </div>

        {/* Monthly Spending Card */}
        <div className="bg-bg-secondary rounded-2xl p-6 border border-border shadow-xl shadow-black/10">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-pastel-pink/20 rounded-xl">
              <TrendingDown className="h-6 w-6 text-pastel-pink" />
            </div>
            <div className="flex items-center text-xs font-medium text-pastel-pink">
              <ArrowDownRight className="h-3 w-3 mr-1" />
              12%
            </div>
          </div>
          <div className="mt-4">
            <p className="text-2xl font-bold text-text-primary">
              ${monthlySpending.toFixed(2)}
            </p>
            <p className="text-xs text-text-muted mt-1">Monthly Spending</p>
          </div>
        </div>

        {/* Monthly Income Card */}
        <div className="bg-bg-secondary rounded-2xl p-6 border border-border shadow-xl shadow-black/10">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-green-500/20 rounded-xl">
              <TrendingUp className="h-6 w-6 text-green-500" />
            </div>
            <div className="flex items-center text-xs font-medium text-green-500">
              <ArrowUpRight className="h-3 w-3 mr-1" />
              8%
            </div>
          </div>
          <div className="mt-4">
            <p className="text-2xl font-bold text-text-primary">
              ${monthlyIncome.toFixed(2)}
            </p>
            <p className="text-xs text-text-muted mt-1">Monthly Income</p>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Connected Accounts */}
        <div className="bg-bg-secondary rounded-2xl border border-border shadow-xl shadow-black/10">
          <div className="p-6 border-b border-border">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">
                Connected Accounts
              </h2>
              <Link
                to="/accounts"
                className="text-sm text-pastel-blue hover:text-pastel-blue-dark transition-colors"
              >
                View all →
              </Link>
            </div>
          </div>
          <div className="p-6">
            {accounts && accounts.length > 0 ? (
              <div className="space-y-4">
                {accounts.slice(0, 3).map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between p-4 rounded-xl bg-bg-elevated hover:bg-bg-elevated/80 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-pastel-blue/20 rounded-lg">
                        <CreditCard className="h-5 w-5 text-pastel-blue" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-text-primary">
                          {account.name}
                        </p>
                        <p className="text-xs text-text-muted">
                          {account.institutionName} • ••{account.mask}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-text-primary">
                        ${account.currentBalance?.toFixed(2) || '0.00'}
                      </p>
                      <p className="text-xs text-text-muted uppercase">
                        {account.type}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="mx-auto w-16 h-16 bg-bg-elevated rounded-full flex items-center justify-center mb-4">
                  <CreditCard className="h-8 w-8 text-text-muted" />
                </div>
                <p className="text-sm text-text-muted mb-4">No accounts connected</p>
                <Link
                  to="/accounts"
                  className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-xl text-gray-900 bg-pastel-blue hover:bg-pastel-blue-dark transition-all duration-200"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Connect Your First Account
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="bg-bg-secondary rounded-2xl border border-border shadow-xl shadow-black/10">
          <div className="p-6 border-b border-border">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">
                Recent Activity
              </h2>
              <Link
                to="/transactions"
                className="text-sm text-pastel-blue hover:text-pastel-blue-dark transition-colors"
              >
                View all →
              </Link>
            </div>
          </div>
          <div className="p-6">
            {recentTransactions.length > 0 ? (
              <div className="space-y-3">
                {recentTransactions.slice(0, 5).map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-bg-elevated transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-lg ${
                        transaction.amount < 0 
                          ? 'bg-pastel-pink/20' 
                          : 'bg-green-500/20'
                      }`}>
                        {transaction.amount < 0 ? (
                          <ArrowDownRight className="h-4 w-4 text-pastel-pink" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4 text-green-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">
                          {transaction.merchantName || transaction.name}
                        </p>
                        <p className="text-xs text-text-muted">
                          {formatDistanceToNow(new Date(transaction.date), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <p className={`text-sm font-semibold ${
                      transaction.amount < 0 
                        ? 'text-pastel-pink' 
                        : 'text-green-500'
                    }`}>
                      {transaction.amount < 0 ? '-' : '+'}$
                      {Math.abs(transaction.amount).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="mx-auto w-16 h-16 bg-bg-elevated rounded-full flex items-center justify-center mb-4">
                  <Activity className="h-8 w-8 text-text-muted" />
                </div>
                <p className="text-sm text-text-muted">No recent transactions</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}