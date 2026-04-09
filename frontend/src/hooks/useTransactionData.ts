import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type ExtendedPlaidAccount } from '../lib/api';
import { format, startOfMonth, endOfMonth, startOfYear, subMonths } from 'date-fns';
import type { Category } from '../../../shared/types';
import { notifications } from '@mantine/notifications';

type DateFilterOption = 'this-month' | 'last-month' | 'ytd' | 'last3' | 'last6' | 'last12' | 'all' | 'custom' | string;

interface TransactionFilters {
  selectedAccount: string;
  dateFilterOption: DateFilterOption;
  customDateRange: [Date | null, Date | null];
  selectedCategories: string[];
  selectedTags: string[];
  debouncedSearchTerm: string;
  includeHidden: boolean;
  onlyUncategorized: boolean;
  onlyFlagged: boolean;
  amountRange: { min: number | null; max: number | null };
  amountSearchMode: string;
  transactionType: string;
}

interface AccountLookupEntry {
  name: string;
  institution: string;
  mask: string | null;
  nickname: string | null;
}

export function useTransactionData(filters: TransactionFilters) {
  const {
    selectedAccount,
    dateFilterOption,
    customDateRange,
    selectedCategories,
    selectedTags,
    debouncedSearchTerm,
    includeHidden,
    onlyUncategorized,
    onlyFlagged,
    amountRange,
    amountSearchMode,
    transactionType,
  } = filters;

  const queryClient = useQueryClient();

  // Calculate date range based on selected filter option
  const dateRange = useMemo<[Date | null, Date | null]>(() => {
    const now = new Date();

    if (dateFilterOption === 'this-month') {
      return [startOfMonth(now), endOfMonth(now)] as [Date, Date];
    } else if (dateFilterOption === 'last-month') {
      const lastMonth = subMonths(now, 1);
      return [startOfMonth(lastMonth), endOfMonth(lastMonth)] as [Date, Date];
    } else if (dateFilterOption === 'ytd') {
      return [startOfYear(now), endOfMonth(now)] as [Date, Date];
    } else if (dateFilterOption === 'last3') {
      return [subMonths(now, 3), now] as [Date, Date];
    } else if (dateFilterOption === 'last6') {
      return [subMonths(now, 6), now] as [Date, Date];
    } else if (dateFilterOption === 'last12') {
      return [subMonths(now, 12), now] as [Date, Date];
    } else if (dateFilterOption === 'all') {
      return [null, null];
    } else if (dateFilterOption === 'custom') {
      return customDateRange;
    }
    return [startOfMonth(now), endOfMonth(now)] as [Date, Date];
  }, [dateFilterOption, customDateRange]);

  // Fetch accounts
  const { data: accounts } = useQuery<ExtendedPlaidAccount[]>({
    queryKey: ['accounts'],
    queryFn: api.getAccounts,
  });

  // Fetch categories
  const { data: categories } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: api.getCategories,
  });

  // Fetch uncategorized count
  const { data: uncategorizedData } = useQuery({
    queryKey: ['transactions', 'uncategorized', 'count'],
    queryFn: api.getUncategorizedCount,
  });

  // Build query parameters
  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = {
      accountId: selectedAccount === 'all' ? undefined : selectedAccount,
      startDate: dateRange[0] ? format(dateRange[0], 'yyyy-MM-dd') : undefined,
      endDate: dateRange[1] ? format(dateRange[1], 'yyyy-MM-dd') : undefined,
      categoryIds: selectedCategories.length > 0 ? selectedCategories : undefined,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
      searchQuery: debouncedSearchTerm || undefined,
      includeHidden,
      onlyUncategorized,
      onlyFlagged: onlyFlagged || undefined,
      transactionType: transactionType === 'all' ? undefined : transactionType,
    };

    if (amountSearchMode !== 'any') {
      params.minAmount = amountRange.min ?? undefined;
      params.maxAmount = amountRange.max ?? undefined;
    }

    Object.keys(params).forEach(key => {
      if (params[key] === undefined) {
        delete params[key];
      }
    });

    return params;
  }, [
    selectedAccount,
    dateRange,
    selectedCategories,
    selectedTags,
    debouncedSearchTerm,
    includeHidden,
    onlyUncategorized,
    onlyFlagged,
    amountRange,
    amountSearchMode,
    transactionType,
  ]);

  // Fetch transactions with filters
  const { data: transactionData, isFetching, refetch, status } = useQuery({
    queryKey: ['transactions', queryParams],
    queryFn: () => api.getTransactions(queryParams),
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });

  const showSkeletons = status === 'pending' && !transactionData;

  // Create account lookup map for tooltips
  const accountLookup = useMemo(() => {
    const map = new Map<string, AccountLookupEntry>();
    accounts?.forEach(acc => {
      map.set(acc.id, {
        name: acc.officialName || acc.accountName || acc.name,
        institution: acc.institutionName || acc.institution,
        mask: acc.mask,
        nickname: acc.nickname || null,
      });
    });
    return map;
  }, [accounts]);

  // Sync transactions mutation
  const syncMutation = useMutation({
    mutationFn: () => selectedAccount === 'all'
      ? api.syncTransactions()
      : api.syncAccountTransactions(selectedAccount),
    onSuccess: (data) => {
      notifications.show({
        title: 'Sync Complete',
        message: `Added ${data.added}, modified ${data.modified}, removed ${data.removed} transactions`,
        color: 'green',
      });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transactions', 'uncategorized', 'count'] });
    },
    onError: () => {
      notifications.show({
        title: 'Sync Failed',
        message: 'Failed to sync transactions. Please try again.',
        color: 'red',
      });
    },
  });

  // Extract unique tags from all transactions
  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    transactionData?.transactions?.forEach(t => {
      t.tags?.forEach(tag => tags.add(tag));
    });
    return Array.from(tags);
  }, [transactionData]);

  return {
    transactionData,
    isFetching,
    refetch,
    showSkeletons,
    accounts,
    categories,
    uncategorizedData,
    accountLookup,
    syncMutation,
    availableTags,
    queryParams,
  };
}
