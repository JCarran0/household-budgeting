import { useEffect, useCallback, useState, useMemo } from 'react';
import { useDebouncedValue } from '@mantine/hooks';
import { startOfMonth } from 'date-fns';
import { 
  useFilterStore, 
  parseDateFromStorage, 
  formatDateForStorage 
} from '../stores/filterStore';

type DateFilterOption = 'this-month' | 'last-month' | 'ytd' | 'last3' | 'last6' | 'last12' | 'all' | 'custom' | string;

interface TransactionFilterState {
  searchInput: string;
  selectedAccount: string;
  selectedCategories: string[];
  selectedTags: string[];
  dateFilterOption: DateFilterOption;
  customDateRange: [Date | null, Date | null];
  includeHidden: boolean;
  onlyUncategorized: boolean;
  onlyFlagged: boolean;
  amountRange: { min: number | null; max: number | null };
  amountSearchMode: 'any' | 'less-than' | 'greater-than' | 'between';
  transactionType: 'all' | 'income' | 'expense' | 'transfer';
}

interface TransactionFilterActions {
  setSearchInput: (value: string) => void;
  setSelectedAccount: (value: string) => void;
  setSelectedCategories: (value: string[]) => void;
  setSelectedTags: (value: string[]) => void;
  setDateFilterOption: (value: DateFilterOption) => void;
  setCustomDateRange: (value: [Date | null, Date | null]) => void;
  setIncludeHidden: (value: boolean) => void;
  setOnlyUncategorized: (value: boolean) => void;
  setOnlyFlagged: (value: boolean) => void;
  setAmountRange: (value: { min: number | null; max: number | null }) => void;
  setAmountSearchMode: (value: 'any' | 'less-than' | 'greater-than' | 'between') => void;
  setTransactionType: (value: 'all' | 'income' | 'expense' | 'transfer') => void;
  resetFilters: () => void;
  debouncedSearchTerm: string;
}

export function useTransactionFilters(): TransactionFilterState & TransactionFilterActions {
  // Subscribe to the specific parts of the store we need
  const transactionFilters = useFilterStore((state) => state.transactions);
  const setTransactionFilters = useFilterStore((state) => state.setTransactionFilters);
  const resetTransactionFilters = useFilterStore((state) => state.resetTransactionFilters);
  
  // Get values directly from store for reactivity
  const searchInput = transactionFilters?.searchInput || '';
  const selectedAccount = transactionFilters?.selectedAccount || 'all';
  const selectedCategories = transactionFilters?.selectedCategories || [];
  const selectedTags = transactionFilters?.selectedTags || [];
  const dateFilterOption = (transactionFilters?.dateFilterOption || 'all') as DateFilterOption;
  const customDateRange = useMemo<[Date | null, Date | null]>(() => {
    const [start, end] = transactionFilters?.customDateRange || [null, null];
    return [parseDateFromStorage(start), parseDateFromStorage(end)];
  }, [transactionFilters?.customDateRange]);
  const includeHidden = transactionFilters?.includeHidden || false;
  const onlyUncategorized = transactionFilters?.onlyUncategorized || false;
  const onlyFlagged = transactionFilters?.onlyFlagged || false;
  const amountRange = transactionFilters?.amountRange || { min: null, max: null };
  const amountSearchMode = (transactionFilters?.amountSearchMode || 'any') as 'any' | 'less-than' | 'greater-than' | 'between';
  const transactionType = (transactionFilters?.transactionType || 'all') as 'all' | 'income' | 'expense' | 'transfer';
  
  const [debouncedSearchTerm] = useDebouncedValue(searchInput, 300);
  
  // Create setters that update the store
  const setSearchInput = useCallback((value: string) => {
    setTransactionFilters({ searchInput: value });
  }, [setTransactionFilters]);
  
  const setSelectedAccount = useCallback((value: string) => {
    setTransactionFilters({ selectedAccount: value });
  }, [setTransactionFilters]);
  
  const setSelectedCategories = useCallback((value: string[]) => {
    setTransactionFilters({ selectedCategories: value });
  }, [setTransactionFilters]);
  
  const setSelectedTags = useCallback((value: string[]) => {
    setTransactionFilters({ selectedTags: value });
  }, [setTransactionFilters]);
  
  const setDateFilterOption = useCallback((value: DateFilterOption) => {
    setTransactionFilters({ dateFilterOption: value });
  }, [setTransactionFilters]);
  
  const setCustomDateRange = useCallback((value: [Date | null, Date | null]) => {
    const [start, end] = value;
    setTransactionFilters({ 
      customDateRange: [formatDateForStorage(start), formatDateForStorage(end)]
    });
  }, [setTransactionFilters]);
  
  const setIncludeHidden = useCallback((value: boolean) => {
    setTransactionFilters({ includeHidden: value });
  }, [setTransactionFilters]);
  
  const setOnlyUncategorized = useCallback((value: boolean) => {
    setTransactionFilters({ onlyUncategorized: value });
  }, [setTransactionFilters]);

  const setOnlyFlagged = useCallback((value: boolean) => {
    setTransactionFilters({ onlyFlagged: value });
  }, [setTransactionFilters]);

  const setAmountRange = useCallback((value: { min: number | null; max: number | null }) => {
    setTransactionFilters({ amountRange: value });
  }, [setTransactionFilters]);
  
  const setAmountSearchMode = useCallback((value: 'any' | 'less-than' | 'greater-than' | 'between') => {
    setTransactionFilters({ amountSearchMode: value });
  }, [setTransactionFilters]);

  const setTransactionType = useCallback((value: 'all' | 'income' | 'expense' | 'transfer') => {
    setTransactionFilters({ transactionType: value });
  }, [setTransactionFilters]);
  
  const resetFilters = useCallback(() => {
    resetTransactionFilters();
  }, [resetTransactionFilters]);
  
  return {
    searchInput,
    selectedAccount,
    selectedCategories,
    selectedTags,
    dateFilterOption,
    customDateRange,
    includeHidden,
    onlyUncategorized,
    onlyFlagged,
    amountRange,
    amountSearchMode,
    transactionType,
    setSearchInput,
    setSelectedAccount,
    setSelectedCategories,
    setSelectedTags,
    setDateFilterOption,
    setCustomDateRange,
    setIncludeHidden,
    setOnlyUncategorized,
    setOnlyFlagged,
    setAmountRange,
    setAmountSearchMode,
    setTransactionType,
    resetFilters,
    debouncedSearchTerm,
  };
}

interface BudgetFilterState {
  selectedDate: Date;
  activeTab: string;
}

interface BudgetFilterActions {
  setSelectedDate: (date: Date) => void;
  setActiveTab: (tab: string) => void;
  resetFilters: () => void;
}

export function useBudgetFilters(): BudgetFilterState & BudgetFilterActions {
  // Subscribe to the specific parts of the store we need
  const budgetFilters = useFilterStore((state) => state.budgets);
  const setBudgetFilters = useFilterStore((state) => state.setBudgetFilters);
  const resetBudgetFilters = useFilterStore((state) => state.resetBudgetFilters);
  
  // Get the current values directly from the store
  const selectedDate = useMemo(() => {
    // Handle empty string or invalid date
    const dateString = budgetFilters?.selectedDate;
    if (!dateString || dateString === '') {
      return startOfMonth(new Date());
    }
    const stored = parseDateFromStorage(dateString);
    return stored || startOfMonth(new Date());
  }, [budgetFilters?.selectedDate]);
  
  const activeTab = budgetFilters?.activeTab || 'budget';
  
  const setSelectedDate = useCallback((date: Date) => {
    const dateString = formatDateForStorage(date);
    setBudgetFilters({ selectedDate: dateString || '' });
  }, [setBudgetFilters]);
  
  const setActiveTab = useCallback((tab: string) => {
    setBudgetFilters({ activeTab: tab });
  }, [setBudgetFilters]);
  
  const resetFilters = useCallback(() => {
    resetBudgetFilters();
  }, [resetBudgetFilters]);
  
  return {
    selectedDate,
    activeTab,
    setSelectedDate,
    setActiveTab,
    resetFilters,
  };
}

interface DashboardFilterState {
  dateRange: string;
}

interface DashboardFilterActions {
  setDateRange: (range: string) => void;
  resetFilters: () => void;
}

export function useDashboardFilters(): DashboardFilterState & DashboardFilterActions {
  const store = useFilterStore();
  const storedFilters = store.dashboard;
  
  const [dateRange, setDateRangeLocal] = useState(storedFilters.dateRange);
  
  const setDateRange = useCallback((range: string) => {
    setDateRangeLocal(range);
    store.setDashboardFilters({ dateRange: range });
  }, [store]);
  
  const resetFilters = useCallback(() => {
    store.resetDashboardFilters();
    const defaults = store.dashboard;
    setDateRangeLocal(defaults.dateRange);
  }, [store]);
  
  return {
    dateRange,
    setDateRange,
    resetFilters,
  };
}

interface ReportsFilterState {
  timeRange: string;
}

interface ReportsFilterActions {
  setTimeRange: (range: string) => void;
  resetFilters: () => void;
}

export function useReportsFilters(): ReportsFilterState & ReportsFilterActions {
  // Subscribe to the specific parts of the store we need
  const reportsFilters = useFilterStore((state) => state.reports);
  const setReportsFilters = useFilterStore((state) => state.setReportsFilters);
  const resetReportsFilters = useFilterStore((state) => state.resetReportsFilters);
  
  // Get the current value directly from the store
  const timeRange = reportsFilters?.timeRange || 'yearToDate';
  
  const setTimeRange = useCallback((range: string) => {
    setReportsFilters({ timeRange: range });
  }, [setReportsFilters]);
  
  const resetFilters = useCallback(() => {
    resetReportsFilters();
  }, [resetReportsFilters]);
  
  return {
    timeRange,
    setTimeRange,
    resetFilters,
  };
}

// Hook to clear all filters on logout
export function useClearFiltersOnLogout() {
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      // If auth token is removed (logout), optionally clear filters
      if (e.key === 'token' && e.newValue === null) {
        // Uncomment the line below to clear filters on logout
        // useFilterStore.getState().clearUserFilters();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);
}