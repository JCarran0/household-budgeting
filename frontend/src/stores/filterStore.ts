import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type DateFilterOption = 'this-month' | 'ytd' | 'custom' | string; // string for specific month like '2025-01'

interface TransactionFilters {
  searchInput: string;
  selectedAccount: string;
  selectedCategories: string[];
  selectedTags: string[];
  dateFilterOption: DateFilterOption;
  customDateRange: [string | null, string | null]; // Store as ISO strings for serialization
  includeHidden: boolean;
  onlyUncategorized: boolean;
  amountRange: { min: number | null; max: number | null };
  amountSearchMode: 'range' | 'exact';
  exactAmount: number | null;
  amountTolerance: number;
  transactionType: 'all' | 'income' | 'expense';
}

interface BudgetFilters {
  selectedDate: string; // Store as ISO string for serialization
  activeTab: string;
}

interface DashboardFilters {
  // Add dashboard-specific filters here as needed
  dateRange: string; // e.g., 'last30days', 'last90days', 'ytd'
}

interface ReportsFilters {
  timeRange: string; // Number of months to show (e.g., '3', '6', '12')
}

interface FilterStore {
  transactions: TransactionFilters;
  budgets: BudgetFilters;
  dashboard: DashboardFilters;
  reports: ReportsFilters;
  
  // Update methods
  setTransactionFilters: (filters: Partial<TransactionFilters>) => void;
  setBudgetFilters: (filters: Partial<BudgetFilters>) => void;
  setDashboardFilters: (filters: Partial<DashboardFilters>) => void;
  setReportsFilters: (filters: Partial<ReportsFilters>) => void;
  
  // Reset methods
  resetTransactionFilters: () => void;
  resetBudgetFilters: () => void;
  resetDashboardFilters: () => void;
  resetReportsFilters: () => void;
  resetAllFilters: () => void;
  
  // Clear filters on logout
  clearUserFilters: () => void;
}

// Default values for each filter set
const defaultTransactionFilters: TransactionFilters = {
  searchInput: '',
  selectedAccount: 'all',
  selectedCategories: [],
  selectedTags: [],
  dateFilterOption: 'ytd',
  customDateRange: [null, null],
  includeHidden: false,
  onlyUncategorized: false,
  amountRange: { min: null, max: null },
  amountSearchMode: 'range',
  exactAmount: null,
  amountTolerance: 0.50,
  transactionType: 'all',
};

const defaultBudgetFilters: BudgetFilters = {
  selectedDate: new Date().toISOString(), // Will be parsed as start of month in the hook
  activeTab: 'budget',
};

const defaultDashboardFilters: DashboardFilters = {
  dateRange: 'last30days',
};

const defaultReportsFilters: ReportsFilters = {
  timeRange: 'thisMonth', // Default to This Month
};

// Helper to validate and migrate stored data
const validateStoredFilters = (stored: unknown): Partial<FilterStore> => {
  if (typeof stored !== 'object' || stored === null) {
    return {};
  }
  
  const storedData = stored as Record<string, unknown>;
  const validated: Partial<FilterStore> = {};
  
  // Validate transaction filters
  if (storedData?.transactions && typeof storedData.transactions === 'object') {
    const t = storedData.transactions as Record<string, unknown>;
    validated.transactions = {
      searchInput: typeof t.searchInput === 'string' ? t.searchInput : defaultTransactionFilters.searchInput,
      selectedAccount: typeof t.selectedAccount === 'string' ? t.selectedAccount : defaultTransactionFilters.selectedAccount,
      selectedCategories: Array.isArray(t.selectedCategories) ? t.selectedCategories : defaultTransactionFilters.selectedCategories,
      selectedTags: Array.isArray(t.selectedTags) ? t.selectedTags : defaultTransactionFilters.selectedTags,
      dateFilterOption: typeof t.dateFilterOption === 'string' ? t.dateFilterOption : defaultTransactionFilters.dateFilterOption,
      customDateRange: Array.isArray(t.customDateRange) && t.customDateRange.length === 2 
        ? [t.customDateRange[0], t.customDateRange[1]] as [string | null, string | null]
        : defaultTransactionFilters.customDateRange,
      includeHidden: typeof t.includeHidden === 'boolean' ? t.includeHidden : defaultTransactionFilters.includeHidden,
      onlyUncategorized: typeof t.onlyUncategorized === 'boolean' ? t.onlyUncategorized : defaultTransactionFilters.onlyUncategorized,
      amountRange: t.amountRange && typeof t.amountRange === 'object' 
        ? {
            min: typeof (t.amountRange as Record<string, unknown>).min === 'number' || (t.amountRange as Record<string, unknown>).min === null ? (t.amountRange as Record<string, unknown>).min as number | null : null,
            max: typeof (t.amountRange as Record<string, unknown>).max === 'number' || (t.amountRange as Record<string, unknown>).max === null ? (t.amountRange as Record<string, unknown>).max as number | null : null,
          }
        : defaultTransactionFilters.amountRange,
      amountSearchMode: (t.amountSearchMode === 'range' || t.amountSearchMode === 'exact') ? t.amountSearchMode : defaultTransactionFilters.amountSearchMode,
      exactAmount: typeof t.exactAmount === 'number' || t.exactAmount === null ? t.exactAmount : defaultTransactionFilters.exactAmount,
      amountTolerance: typeof t.amountTolerance === 'number' ? t.amountTolerance : defaultTransactionFilters.amountTolerance,
      transactionType: (t.transactionType === 'all' || t.transactionType === 'income' || t.transactionType === 'expense') ? t.transactionType : defaultTransactionFilters.transactionType,
    };
  }
  
  // Validate budget filters
  if (storedData?.budgets && typeof storedData.budgets === 'object') {
    const b = storedData.budgets as Record<string, unknown>;
    validated.budgets = {
      selectedDate: typeof b.selectedDate === 'string' ? b.selectedDate : defaultBudgetFilters.selectedDate,
      activeTab: typeof b.activeTab === 'string' ? b.activeTab : defaultBudgetFilters.activeTab,
    };
  }
  
  // Validate dashboard filters
  if (storedData?.dashboard && typeof storedData.dashboard === 'object') {
    const d = storedData.dashboard as Record<string, unknown>;
    validated.dashboard = {
      dateRange: typeof d.dateRange === 'string' ? d.dateRange : defaultDashboardFilters.dateRange,
    };
  }
  
  // Validate reports filters
  if (storedData?.reports && typeof storedData.reports === 'object') {
    const r = storedData.reports as Record<string, unknown>;
    let timeRange = defaultReportsFilters.timeRange;
    
    if (typeof r.timeRange === 'string') {
      // Handle migration from old numeric values to new string values
      if (r.timeRange === '3') {
        timeRange = 'last3';
      } else if (r.timeRange === '6') {
        timeRange = 'last6';
      } else if (r.timeRange === '12') {
        timeRange = 'last12';
      } else {
        // Keep the value if it's already in new format
        timeRange = r.timeRange;
      }
    }
    
    validated.reports = {
      timeRange: timeRange,
    };
  }
  
  return validated;
};

export const useFilterStore = create<FilterStore>()(
  persist(
    (set) => ({
      transactions: defaultTransactionFilters,
      budgets: defaultBudgetFilters,
      dashboard: defaultDashboardFilters,
      reports: defaultReportsFilters,
      
      setTransactionFilters: (filters) =>
        set((state) => ({
          transactions: { ...state.transactions, ...filters },
        })),
      
      setBudgetFilters: (filters) =>
        set((state) => ({
          budgets: { ...state.budgets, ...filters },
        })),
      
      setDashboardFilters: (filters) =>
        set((state) => ({
          dashboard: { ...state.dashboard, ...filters },
        })),
      
      setReportsFilters: (filters) =>
        set((state) => ({
          reports: { ...state.reports, ...filters },
        })),
      
      resetTransactionFilters: () =>
        set({ transactions: defaultTransactionFilters }),
      
      resetBudgetFilters: () =>
        set({ budgets: defaultBudgetFilters }),
      
      resetDashboardFilters: () =>
        set({ dashboard: defaultDashboardFilters }),
      
      resetReportsFilters: () =>
        set({ reports: defaultReportsFilters }),
      
      resetAllFilters: () =>
        set({
          transactions: defaultTransactionFilters,
          budgets: defaultBudgetFilters,
          dashboard: defaultDashboardFilters,
          reports: defaultReportsFilters,
        }),
      
      clearUserFilters: () =>
        set({
          transactions: defaultTransactionFilters,
          budgets: defaultBudgetFilters,
          dashboard: defaultDashboardFilters,
          reports: defaultReportsFilters,
        }),
    }),
    {
      name: 'filter-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        transactions: state.transactions,
        budgets: state.budgets,
        dashboard: state.dashboard,
        reports: state.reports,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('Failed to load stored filters:', error);
          return;
        }
        
        // Validate and migrate stored data if needed
        if (state) {
          const validated = validateStoredFilters(state);
          Object.assign(state, validated);
        }
      },
      version: 1, // Increment this when breaking changes are made to the filter structure
    }
  )
);

// Export helper function to convert date strings back to Date objects
export const parseDateFromStorage = (dateString: string | null): Date | null => {
  if (!dateString) return null;
  try {
    // Handle ISO date strings by parsing them in local timezone
    // to avoid timezone conversion issues
    if (dateString.includes('T')) {
      // ISO format - parse and convert to local date
      const tempDate = new Date(dateString);
      // Create a new date using local timezone values
      return new Date(
        tempDate.getFullYear(),
        tempDate.getMonth(),
        tempDate.getDate()
      );
    } else if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // YYYY-MM-DD format - parse as local date
      const [year, month, day] = dateString.split('-').map(Number);
      return new Date(year, month - 1, day);
    } else {
      // Fallback to default parsing
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? null : date;
    }
  } catch {
    return null;
  }
};

// Export helper function to convert Date objects to strings for storage
export const formatDateForStorage = (date: Date | null): string | null => {
  if (!date) return null;
  try {
    return date.toISOString();
  } catch {
    return null;
  }
};