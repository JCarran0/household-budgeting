import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { Search, Filter, Calendar, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import type { Transaction } from '../../../shared/types';

export function Transactions() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    return {
      startDate: format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd'),
      endDate: format(endOfMonth(now), 'yyyy-MM-dd'),
    };
  });
  const [showFilters, setShowFilters] = useState(false);
  const [amountFilter, setAmountFilter] = useState({ min: '', max: '' });

  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: api.getAccounts,
  });

  const { data: transactionData, isLoading } = useQuery({
    queryKey: ['transactions', selectedAccount, dateRange],
    queryFn: () =>
      api.getTransactions({
        accountId: selectedAccount === 'all' ? undefined : selectedAccount,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      }),
  });

  const filteredTransactions = useMemo(() => {
    if (!transactionData?.transactions) return [];
    
    return transactionData.transactions.filter((transaction) => {
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        if (
          !transaction.name.toLowerCase().includes(search) &&
          !transaction.merchantName?.toLowerCase().includes(search) &&
          !transaction.category?.some(cat => cat.toLowerCase().includes(search))
        ) {
          return false;
        }
      }

      // Amount filter
      const amount = Math.abs(transaction.amount);
      if (amountFilter.min && amount < parseFloat(amountFilter.min)) return false;
      if (amountFilter.max && amount > parseFloat(amountFilter.max)) return false;

      return true;
    });
  }, [transactionData?.transactions, searchTerm, amountFilter]);

  const groupedTransactions = useMemo(() => {
    const groups: Record<string, Transaction[]> = {};
    
    filteredTransactions.forEach((transaction) => {
      const date = format(new Date(transaction.date), 'yyyy-MM-dd');
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(transaction);
    });
    
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [filteredTransactions]);

  const totalSpent = filteredTransactions
    .filter(t => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const totalEarned = filteredTransactions
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
        <div className="mt-2 flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Search transactions..."
              />
            </div>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
            {showFilters ? (
              <ChevronUp className="h-4 w-4 ml-2" />
            ) : (
              <ChevronDown className="h-4 w-4 ml-2" />
            )}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white shadow rounded-lg p-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="account" className="block text-sm font-medium text-gray-700">
                Account
              </label>
              <select
                id="account"
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
              >
                <option value="all">All Accounts</option>
                {accounts?.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">
                Start Date
              </label>
              <input
                type="date"
                id="startDate"
                value={dateRange.startDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                className="mt-1 block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
              />
            </div>

            <div>
              <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">
                End Date
              </label>
              <input
                type="date"
                id="endDate"
                value={dateRange.endDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                className="mt-1 block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="minAmount" className="block text-sm font-medium text-gray-700">
                  Min Amount
                </label>
                <input
                  type="number"
                  id="minAmount"
                  value={amountFilter.min}
                  onChange={(e) => setAmountFilter(prev => ({ ...prev, min: e.target.value }))}
                  className="mt-1 block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                  placeholder="0"
                />
              </div>
              <div>
                <label htmlFor="maxAmount" className="block text-sm font-medium text-gray-700">
                  Max Amount
                </label>
                <input
                  type="number"
                  id="maxAmount"
                  value={amountFilter.max}
                  onChange={(e) => setAmountFilter(prev => ({ ...prev, max: e.target.value }))}
                  className="mt-1 block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                  placeholder="1000"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {filteredTransactions.length} Transactions
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {format(new Date(dateRange.startDate), 'MMM d, yyyy')} -{' '}
                {format(new Date(dateRange.endDate), 'MMM d, yyyy')}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Total Spent</p>
              <p className="text-lg font-semibold text-red-600">-${totalSpent.toFixed(2)}</p>
              <p className="text-sm text-gray-500 mt-1">Total Earned</p>
              <p className="text-lg font-semibold text-green-600">+${totalEarned.toFixed(2)}</p>
            </div>
          </div>
        </div>

        <div className="overflow-hidden">
          {groupedTransactions.length > 0 ? (
            <div className="divide-y divide-gray-200">
              {groupedTransactions.map(([date, transactions]) => (
                <div key={date}>
                  <div className="bg-gray-50 px-4 py-2">
                    <p className="text-sm font-medium text-gray-900">
                      {format(new Date(date), 'EEEE, MMMM d, yyyy')}
                    </p>
                  </div>
                  <ul className="divide-y divide-gray-200">
                    {transactions.map((transaction) => (
                      <li key={transaction.id} className="px-4 py-4 hover:bg-gray-50">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {transaction.merchantName || transaction.name}
                            </p>
                            <p className="text-sm text-gray-500">
                              {transaction.category?.join(' > ') || 'Uncategorized'}
                            </p>
                            {transaction.pending && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                                Pending
                              </span>
                            )}
                          </div>
                          <div className="ml-4">
                            <p
                              className={`text-sm font-semibold ${
                                transaction.amount < 0 ? 'text-red-600' : 'text-green-600'
                              }`}
                            >
                              {transaction.amount < 0 ? '-' : '+'}$
                              {Math.abs(transaction.amount).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-sm text-gray-500">No transactions found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}