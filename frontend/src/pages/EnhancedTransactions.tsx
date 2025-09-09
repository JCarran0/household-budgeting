import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type ExtendedPlaidAccount } from '../lib/api';
import { format, startOfMonth, endOfMonth, startOfYear, subMonths } from 'date-fns';
import type { Transaction } from '../../../shared/types';
import { useTransactionFilters } from '../hooks/usePersistedFilters';
import { formatCurrency } from '../utils/formatters';
import { parseDateFromStorage } from '../stores/filterStore';
import { 
  isIncomeCategoryHierarchical, 
  isTransferCategory, 
  createCategoryLookup 
} from '../../../shared/utils/categoryHelpers';
import {
  Container,
  Stack,
  Group,
  Title,
  Text,
  TextInput,
  Select,
  MultiSelect,
  Button,
  Badge,
  Center,
  Paper,
  Table,
  ScrollArea,
  ThemeIcon,
  ActionIcon,
  Tooltip,
  Grid,
  NumberInput,
  Checkbox,
  Menu,
  rem,
  SegmentedControl,
  Skeleton,
  LoadingOverlay,
  Pagination,
  Alert,
  Slider,
  Box,
  Loader,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import {
  IconSearch,
  IconCalendar,
  IconArrowUpRight,
  IconArrowDownRight,
  IconEdit,
  IconCategory,
  IconEyeOff,
  IconScissors,
  IconDots,
  IconRefresh,
  IconBuilding,
  IconFilterOff,
  IconAlertCircle,
  IconDatabaseImport,
  IconDownload,
} from '@tabler/icons-react';
import { TransactionEditModal } from '../components/transactions/TransactionEditModal';
import { TransactionImport } from '../components/transactions/TransactionImport';
import { TransactionSplitModal } from '../components/transactions/TransactionSplitModal';
import { BulkEditBar } from '../components/transactions/BulkEditBar';
import { BulkEditModal, type BulkEditUpdates } from '../components/transactions/BulkEditModal';

type DateFilterOption = 'this-month' | 'ytd' | 'custom' | string; // string for specific month like '2025-01'

// Add CSS for spinning animation
const spinAnimation = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

const TRANSACTIONS_PER_PAGE = 50;

export function EnhancedTransactions() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [selectedCategoryValue, setSelectedCategoryValue] = useState<string | null>(null);
  const [isTransactionImportOpen, setIsTransactionImportOpen] = useState(false);
  
  // Use persisted filters from localStorage
  const {
    searchInput,
    selectedAccount,
    selectedCategories,
    selectedTags,
    dateFilterOption,
    customDateRange,
    includeHidden,
    onlyUncategorized,
    amountRange,
    amountSearchMode,
    exactAmount,
    amountTolerance,
    setSearchInput,
    setSelectedAccount,
    setSelectedCategories,
    setSelectedTags,
    setDateFilterOption,
    setCustomDateRange,
    setIncludeHidden,
    setOnlyUncategorized,
    setAmountRange,
    setAmountSearchMode,
    setExactAmount,
    setAmountTolerance,
    transactionType,
    setTransactionType,
    resetFilters,
    debouncedSearchTerm,
  } = useTransactionFilters();
  
  const [hasInitialized, setHasInitialized] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [splittingTransaction, setSplittingTransaction] = useState<Transaction | null>(null);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  
  // Local state for temporary date selection (not persisted until applied)
  // DatePickerInput expects string values, not Date objects
  const [tempCustomDateRange, setTempCustomDateRange] = useState<[string | null, string | null]>([null, null]);
  
  // Initialize temp date range when custom picker opens
  useEffect(() => {
    if (showCustomDatePicker) {
      // Convert Date objects to strings for DatePickerInput
      setTempCustomDateRange([
        customDateRange[0] ? format(customDateRange[0], 'yyyy-MM-dd') : null,
        customDateRange[1] ? format(customDateRange[1], 'yyyy-MM-dd') : null
      ]);
    }
  }, [showCustomDatePicker, customDateRange]);
  
  // Bulk selection state
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [bulkEditMode, setBulkEditMode] = useState<'category' | 'description' | 'hidden' | null>(null);
  
  const queryClient = useQueryClient();
  
  // Helper function to convert reports time range to transaction date filter
  const convertTimeRangeToDateFilter = (timeRangeFilter: string): DateFilterOption => {
    switch(timeRangeFilter) {
      case 'thisMonth':
        return 'this-month';
      case 'lastMonth':
        return format(subMonths(new Date(), 1), 'yyyy-MM');
      case 'yearToDate':
        return 'ytd';
      case 'thisYear':
        return format(new Date(), 'yyyy'); // Current year
      case 'last3':
      case 'last6':  
      case 'last12':
        // For these cases, we'll use custom date range since transaction filters don't have exact equivalents
        return 'custom';
      default:
        return 'ytd'; // Default fallback
    }
  };

  // Handle URL parameters from reports page navigation
  useEffect(() => {
    if (!hasInitialized) {
      const categoryIds = searchParams.get('categoryIds');
      const onlyUncategorizedParam = searchParams.get('onlyUncategorized');
      const startDate = searchParams.get('startDate');
      const endDate = searchParams.get('endDate');
      const timeRangeFilter = searchParams.get('timeRangeFilter');

      // Apply filters from URL parameters
      if (categoryIds) {
        const categoryIdArray = categoryIds.split(',');
        setSelectedCategories(categoryIdArray);
        setOnlyUncategorized(false);
      }
      
      if (onlyUncategorizedParam === 'true') {
        setOnlyUncategorized(true);
        setSelectedCategories([]);
      }
      
      // Handle date filtering based on timeRangeFilter or explicit dates
      if (timeRangeFilter) {
        const dateFilterValue = convertTimeRangeToDateFilter(timeRangeFilter);
        setDateFilterOption(dateFilterValue);
        
        // For cases that need custom date range, set the explicit dates
        if (dateFilterValue === 'custom' && startDate && endDate) {
          const startDateObj = new Date(startDate);
          const endDateObj = new Date(endDate);
          setCustomDateRange([startDateObj, endDateObj]);
        }
      } else if (startDate && endDate) {
        // Fallback to custom date range if no timeRangeFilter but dates are provided
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(endDate);
        setCustomDateRange([startDateObj, endDateObj]);
        setDateFilterOption('custom');
      }
      
      setHasInitialized(true);
      
      // Show notification when filters are applied from reports
      if (categoryIds || onlyUncategorizedParam === 'true' || timeRangeFilter || (startDate && endDate)) {
        const filterTypes = [];
        if (categoryIds) filterTypes.push('category');
        if (onlyUncategorizedParam === 'true') filterTypes.push('uncategorized transactions');
        if (timeRangeFilter || (startDate && endDate)) filterTypes.push('date range');
        
        notifications.show({
          title: 'Filters Applied',
          message: `Applied ${filterTypes.join(', ')} filters from reports`,
          color: 'blue',
        });
      }
    }
  }, [searchParams, hasInitialized, setSelectedCategories, setOnlyUncategorized, setCustomDateRange, setDateFilterOption]);
  
  // Update category mutation
  const updateCategoryMutation = useMutation({
    mutationFn: ({ transactionId, categoryId }: { transactionId: string; categoryId: string | null }) =>
      api.updateTransactionCategory(transactionId, categoryId),
    onSuccess: async () => {
      notifications.show({
        title: 'Category Updated',
        message: 'Transaction category has been updated',
        color: 'green',
      });
      // Invalidate all transactions queries regardless of params
      await queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === 'transactions'
      });
      // Force refetch immediately
      await refetch();
      setEditingCategoryId(null);
      setSelectedCategoryValue(null);
    },
    onError: () => {
      notifications.show({
        title: 'Error',
        message: 'Failed to update category',
        color: 'red',
      });
      setEditingCategoryId(null);
      setSelectedCategoryValue(null);
    },
  });
  
  // Callback for search input change
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.currentTarget.value);
  }, [setSearchInput]);
  
  // Calculate date range based on selected filter option
  const dateRange = useMemo<[Date | null, Date | null]>(() => {
    const now = new Date();
    
    if (dateFilterOption === 'this-month') {
      return [startOfMonth(now), endOfMonth(now)] as [Date, Date];
    } else if (dateFilterOption === 'ytd') {
      return [startOfYear(now), endOfMonth(now)] as [Date, Date];
    } else if (dateFilterOption === 'custom') {
      return customDateRange;
    } else if (dateFilterOption.match(/^\d{4}-\d{2}$/)) {
      // Specific month selected (e.g., '2025-01')
      const [year, month] = dateFilterOption.split('-').map(Number);
      const monthDate = new Date(year, month - 1, 1);
      return [startOfMonth(monthDate), endOfMonth(monthDate)] as [Date, Date];
    }
    return [startOfMonth(now), endOfMonth(now)] as [Date, Date];
  }, [dateFilterOption, customDateRange]);
  
  // Generate month options for current year
  const monthOptions = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const months = [];
    
    for (let i = 0; i < currentMonth; i++) {
      const monthDate = new Date(currentYear, i, 1);
      const value = format(monthDate, 'yyyy-MM');
      const label = format(monthDate, 'MMMM');
      months.push({ value, label });
    }
    
    return months.reverse(); // Most recent first
  }, []);

  // Fetch accounts
  const { data: accounts } = useQuery<ExtendedPlaidAccount[]>({
    queryKey: ['accounts'],
    queryFn: api.getAccounts,
  });

  // Fetch categories
  const { data: categories } = useQuery({
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
      transactionType: transactionType === 'all' ? undefined : transactionType,
    };
    
    // Add amount search params based on mode
    if (amountSearchMode === 'exact' && exactAmount !== null) {
      params.exactAmount = exactAmount;
      params.amountTolerance = amountTolerance;
    } else if (amountSearchMode === 'range') {
      params.minAmount = amountRange.min || undefined;
      params.maxAmount = amountRange.max || undefined;
    }
    
    // Remove undefined values
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
    amountRange,
    amountSearchMode,
    exactAmount,
    amountTolerance,
    transactionType,
  ]);

  // Fetch transactions with filters
  const { data: transactionData, isFetching, refetch, status } = useQuery({
    queryKey: ['transactions', queryParams],
    queryFn: () => api.getTransactions(queryParams),
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 minutes - prevent aggressive refetching on every filter change
    gcTime: 10 * 60 * 1000,   // 10 minutes - cache persists (was cacheTime in v4)
    retry: 1,
  });
  
  // Only show skeletons when we're in a true loading state with no data
  // Since status is always 'success' when returning, this should never show skeletons
  const showSkeletons = status === 'pending' && !transactionData;
  
  // Initialization is now handled by URL parameter processing above
  // URL parameters take precedence over persisted filters when navigating from reports
  
  // Create account lookup map for tooltips
  const accountLookup = useMemo(() => {
    const map = new Map<string, { name: string; institution: string; mask: string | null; nickname: string | null }>();
    accounts?.forEach(acc => {
      map.set(acc.id, {
        name: acc.officialName || acc.accountName || acc.name,
        institution: acc.institutionName || acc.institution,
        mask: acc.mask,
        nickname: acc.nickname || null
      });
    });
    return map;
  }, [accounts]);

  // Sync transactions mutation
  const syncMutation = useMutation({
    mutationFn: () => api.syncTransactions(selectedAccount === 'all' ? undefined : selectedAccount),
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

  // Category options for filter
  const categoryOptions = [
    // Add uncategorized option at the top
    { value: 'uncategorized', label: 'Uncategorized' },
    // Existing category options
    ...(categories?.map(cat => {
      const parentCategory = cat.parentId
        ? categories.find(p => p.id === cat.parentId)
        : null;
      const baseLabel = parentCategory 
        ? `${parentCategory.name} → ${cat.name}` 
        : cat.name;
      // Add indicator for hidden categories with visual icon
      const label = cat.isHidden 
        ? `👁️‍🗨️ ${baseLabel} (Excluded from budgets)`
        : baseLabel;
      return {
        value: cat.id,
        label: label,
      };
    }).sort((a, b) => a.label.localeCompare(b.label)) || [])
  ];
  

  // Account options for filter
  const accountOptions = [
    { value: 'all', label: 'All Accounts' },
    ...(accounts?.map(acc => ({
      value: acc.id,
      label: `${acc.nickname || acc.officialName || acc.accountName} (${acc.institutionName})`,
    })) || []),
  ];

  const handleEditClick = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setIsEditModalOpen(true);
  };

  const handleEditModalClose = () => {
    setIsEditModalOpen(false);
    setEditingTransaction(null);
  };

  const handleSplitClick = (transaction: Transaction) => {
    setSplittingTransaction(transaction);
    setIsSplitModalOpen(true);
  };

  const handleSplitModalClose = () => {
    setIsSplitModalOpen(false);
    setSplittingTransaction(null);
  };
  
  // Bulk selection handlers
  const handleSelectAll = () => {
    if (selectedTransactionIds.size === paginatedTransactions.length) {
      // Deselect all
      setSelectedTransactionIds(new Set());
    } else {
      // Select all on current page
      const newSelection = new Set(paginatedTransactions.map(t => t.id));
      setSelectedTransactionIds(newSelection);
    }
  };

  const handleSelectTransaction = (
    transactionId: string, 
    index: number, 
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const shiftKey = event.nativeEvent instanceof MouseEvent && event.nativeEvent.shiftKey;
    const ctrlKey = event.nativeEvent instanceof MouseEvent && (event.nativeEvent.ctrlKey || event.nativeEvent.metaKey);
    
    if (shiftKey && lastClickedId !== null) {
      // Find the index of the last clicked transaction
      const lastIndex = paginatedTransactions.findIndex(t => t.id === lastClickedId);
      if (lastIndex !== -1) {
        // Select range
        const startIndex = Math.min(lastIndex, index);
        const endIndex = Math.max(lastIndex, index);
        const newSelection = new Set(selectedTransactionIds);
        
        for (let i = startIndex; i <= endIndex; i++) {
          newSelection.add(paginatedTransactions[i].id);
        }
        
        setSelectedTransactionIds(newSelection);
      }
    } else if (ctrlKey) {
      // Toggle single selection
      const newSelection = new Set(selectedTransactionIds);
      if (newSelection.has(transactionId)) {
        newSelection.delete(transactionId);
      } else {
        newSelection.add(transactionId);
      }
      setSelectedTransactionIds(newSelection);
    } else {
      // Regular click - toggle single selection
      const newSelection = new Set(selectedTransactionIds);
      if (newSelection.has(transactionId)) {
        newSelection.delete(transactionId);
      } else {
        newSelection.add(transactionId);
      }
      setSelectedTransactionIds(newSelection);
    }
    
    setLastClickedId(transactionId);
  };

  // Bulk edit handlers
  const handleBulkEditCategory = () => {
    setBulkEditMode('category');
  };
  
  const handleBulkEditDescription = () => {
    setBulkEditMode('description');
  };
  
  const handleBulkEditHidden = () => {
    setBulkEditMode('hidden');
  };
  
  const handleClearSelection = () => {
    setSelectedTransactionIds(new Set());
    setLastClickedId(null);
  };
  
  const handleBulkEditConfirm = async (updates: BulkEditUpdates) => {
    const selectedIds = Array.from(selectedTransactionIds);
    
    const notificationId = notifications.show({
      title: 'Processing',
      message: `Updating ${selectedIds.length} transactions...`,
      color: 'blue',
      loading: true,
      autoClose: false,
    });
    
    try {
      // Build the updates object based on the mode
      const apiUpdates: { categoryId?: string | null; userDescription?: string | null; isHidden?: boolean } = {};
      
      if (updates.categoryId !== undefined) {
        apiUpdates.categoryId = updates.categoryId;
      }
      
      if (updates.descriptionMode === 'replace' && updates.userDescription !== undefined) {
        apiUpdates.userDescription = updates.userDescription;
      } else if (updates.descriptionMode === 'clear') {
        apiUpdates.userDescription = null;
      }
      
      if (updates.isHidden !== undefined) {
        apiUpdates.isHidden = updates.isHidden;
      }
      
      // Only make the API call if there are actual updates
      if (Object.keys(apiUpdates).length > 0) {
        const result = await api.bulkUpdateTransactions(selectedIds, apiUpdates);
        
        notifications.update({
          id: notificationId,
          title: 'Success',
          message: `Updated ${result.updated} transactions${result.failed > 0 ? ` (${result.failed} failed)` : ''}`,
          color: result.failed > 0 ? 'yellow' : 'green',
          loading: false,
          autoClose: 5000,
        });
        
        if (result.errors && result.errors.length > 0) {
          console.error('Bulk update errors:', result.errors);
        }
      } else {
        notifications.update({
          id: notificationId,
          title: 'No Changes',
          message: 'No updates were made',
          color: 'gray',
          loading: false,
          autoClose: 3000,
        });
      }
      
      setSelectedTransactionIds(new Set());
      setBulkEditMode(null);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    } catch (error) {
      console.error('Bulk update failed:', error);
      notifications.update({
        id: notificationId,
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to update transactions',
        color: 'red',
        loading: false,
        autoClose: 5000,
      });
    }
  };

  const handleCategoryClick = (transactionId: string, currentCategoryId: string | null) => {
    setEditingCategoryId(transactionId);
    setSelectedCategoryValue(currentCategoryId || 'uncategorized');
  };
  
  const handleCategorySelect = (transactionId: string, value: string | null) => {
    const categoryId = value === 'uncategorized' ? null : value;
    updateCategoryMutation.mutate({ transactionId, categoryId });
  };
  
  const handleCategoryCancel = () => {
    setEditingCategoryId(null);
    setSelectedCategoryValue(null);
  };

  const getCategoryDisplay = (transaction: Transaction) => {
    if (!transaction.categoryId || !categories) return null;
    const category = categories.find(c => c.id === transaction.categoryId);
    if (!category) return null;
    
    const parentCategory = category.parentId
      ? categories.find(p => p.id === category.parentId)
      : null;
    
    return parentCategory 
      ? `${parentCategory.name} → ${category.name}`
      : category.name;
  };

  const exportToTSV = () => {
    if (!transactionData?.transactions || transactionData.transactions.length === 0) {
      notifications.show({
        title: 'No Data',
        message: 'No transactions to export',
        color: 'yellow',
      });
      return;
    }

    // CSV headers
    const headers = [
      'Date',
      'Description',
      'Amount',
      'Category',
      'Type',
      'Category Hidden',
      'Category Rollover',
      'Account',
      'Institution',
      'Merchant',
      'Tags',
      'Notes',
      'Transaction Hidden'
    ];

    // Helper function to escape TSV values
    const escapeTSV = (value: string | null | undefined): string => {
      if (value == null) return '';
      const str = String(value);
      // Replace tabs and newlines with spaces for TSV format
      return str.replace(/\t/g, ' ').replace(/\n/g, ' ').replace(/\r/g, '');
    };

    // Get account info for each transaction
    const getAccountInfo = (accountId: string) => {
      const account = accounts?.find(a => a.id === accountId);
      return {
        accountName: account?.nickname || account?.officialName || account?.accountName || account?.name || 'Unknown',
        institution: account?.institutionName || account?.institution || 'Unknown'
      };
    };

    // Create category lookup for efficient hierarchical checks
    const categoryLookup = categories ? createCategoryLookup(categories) : new Map();

    // Build TSV rows from all transactions (not just current page)
    const rows = transactionData.transactions.map(transaction => {
      const { accountName, institution } = getAccountInfo(transaction.accountId);
      const categoryDisplay = getCategoryDisplay(transaction) || 'Uncategorized';
      const description = transaction.userDescription || transaction.name;
      const tags = transaction.tags?.join('; ') || '';
      const transactionHidden = transaction.isHidden ? 'Yes' : 'No';
      
      // Find the category for property lookups
      const category = transaction.categoryId && categories 
        ? categories.find(c => c.id === transaction.categoryId)
        : null;
      
      // Determine category type
      const categoryType = !transaction.categoryId ? 'Uncategorized' :
        isIncomeCategoryHierarchical(transaction.categoryId, categoryLookup) ? 'Income' :
        isTransferCategory(transaction.categoryId) ? 'Transfer' : 'Expense';
      
      // Get category properties
      const categoryHidden = category?.isHidden ? 'Yes' : 'No';
      const categoryRollover = category?.isRollover ? 'Yes' : 'No';
      
      return [
        escapeTSV(transaction.date),
        escapeTSV(description),
        escapeTSV(formatCurrency(transaction.amount, true).replace('$', '')),
        escapeTSV(categoryDisplay),
        escapeTSV(categoryType),
        escapeTSV(categoryHidden),
        escapeTSV(categoryRollover),
        escapeTSV(accountName),
        escapeTSV(institution),
        escapeTSV(transaction.merchantName),
        escapeTSV(tags),
        escapeTSV(transaction.notes),
        escapeTSV(transactionHidden)
      ].join('\t');
    });

    // Combine headers and rows into TSV content
    const tsvContent = [headers.join('\t'), ...rows].join('\n');

    // Create blob and download
    const blob = new Blob([tsvContent], { type: 'text/tab-separated-values;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Generate filename with current date
    const today = format(new Date(), 'yyyy-MM-dd');
    link.download = `transactions-export-${today}.tsv`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    notifications.show({
      title: 'Export Complete',
      message: `Exported ${transactionData.transactions.length} transactions to TSV`,
      color: 'green',
    });
  };

  const transactions = transactionData?.transactions || [];
  
  // Calculate filtered total
  const filteredTotal = useMemo(() => {
    return transactions.reduce((sum, t) => sum + t.amount, 0);
  }, [transactions]);
  
  // Paginate transactions
  const totalPages = Math.ceil(transactions.length / TRANSACTIONS_PER_PAGE);
  const paginatedTransactions = transactions.slice(
    (currentPage - 1) * TRANSACTIONS_PER_PAGE,
    currentPage * TRANSACTIONS_PER_PAGE
  );
  
  // Calculate selected transaction amount
  const selectedAmount = useMemo(() => {
    let total = 0;
    for (const id of selectedTransactionIds) {
      const transaction = transactions.find(t => t.id === id);
      if (transaction) {
        total += transaction.amount;
      }
    }
    return total;
  }, [selectedTransactionIds, transactions]);
  
  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [queryParams]);

  return (
    <>
      <style>{spinAnimation}</style>
      <Container size="xl" py="xl">
        <Stack gap="lg">
        <Group justify="space-between">
          <Group gap="xs">
            <Title order={2}>Transactions</Title>
            {isFetching && transactions.length > 0 && (
              <ThemeIcon variant="subtle" size="sm" radius="xl">
                <IconRefresh size={14} style={{ animation: 'spin 1s linear infinite' }} />
              </ThemeIcon>
            )}
          </Group>
          <Group>
            <Button
              leftSection={<IconDatabaseImport size={16} />}
              onClick={() => setIsTransactionImportOpen(true)}
              variant="light"
            >
              Import CSV
            </Button>
            <Button
              leftSection={<IconDownload size={16} />}
              onClick={exportToTSV}
              variant="light"
              disabled={!transactionData?.transactions || transactionData.transactions.length === 0}
            >
              Export TSV
            </Button>
            <Button
              leftSection={<IconRefresh size={16} />}
              onClick={() => syncMutation.mutate()}
              loading={syncMutation.isPending}
            >
              Sync Transactions
            </Button>
          </Group>
        </Group>

        {/* Bulk Edit Bar */}
        <BulkEditBar
          selectedCount={selectedTransactionIds.size}
          selectedAmount={selectedAmount}
          onEditCategory={handleBulkEditCategory}
          onEditDescription={handleBulkEditDescription}
          onEditHidden={handleBulkEditHidden}
          onClearSelection={handleClearSelection}
        />

        {/* Uncategorized Transactions Alert */}
        {uncategorizedData && uncategorizedData.count > 0 && (
          <Alert
            icon={<IconAlertCircle size={20} />}
            title="Uncategorized Transactions"
            color={uncategorizedData.count > 10 ? 'red' : 'orange'}
            variant="filled"
            styles={{
              root: { cursor: 'pointer' },
            }}
            onClick={() => {
              // Set filter to show only uncategorized transactions
              setOnlyUncategorized(true);
              // Reset other filters that might conflict
              setSelectedCategories([]);
            }}
          >
            <Group justify="space-between">
              <Text size="sm">
                You have {uncategorizedData.count} uncategorized transaction{uncategorizedData.count !== 1 ? 's' : ''} 
                {' '}({Math.round((uncategorizedData.count / uncategorizedData.total) * 100)}% of total).
                Click here to filter to uncategorized transactions only.
              </Text>
              <Button
                size="xs"
                variant="white"
                color={uncategorizedData.count > 10 ? 'red' : 'orange'}
                leftSection={<IconCategory size={14} />}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate('/categories');
                }}
              >
                Manage Categories
              </Button>
            </Group>
          </Alert>
        )}

        {/* Filters */}
        <Paper p="md" withBorder>
          <Stack gap="md">
            {/* Date Filter */}
            <Stack gap="xs">
              <Text size="sm" fw={500}>Date Range</Text>
              <Group gap="xs">
                <SegmentedControl
                  value={dateFilterOption === 'custom' || monthOptions.some(m => m.value === dateFilterOption) ? 'custom' : dateFilterOption}
                  onChange={(value) => {
                    if (value === 'custom') {
                      setDateFilterOption('custom');
                      setShowCustomDatePicker(true);
                    } else {
                      setDateFilterOption(value as DateFilterOption);
                      setShowCustomDatePicker(false);
                    }
                  }}
                  data={[
                    { label: 'This Month', value: 'this-month' },
                    { label: 'Year to Date', value: 'ytd' },
                    { label: 'Custom', value: 'custom' },
                  ]}
                />
                
                {monthOptions.length > 0 && (
                  <Select
                    placeholder="Select month"
                    data={monthOptions}
                    value={monthOptions.some(m => m.value === dateFilterOption) ? dateFilterOption : null}
                    onChange={(value) => {
                      if (value) {
                        setDateFilterOption(value);
                        setShowCustomDatePicker(false);
                      }
                    }}
                    clearable
                    searchable
                    size="sm"
                    w={150}
                  />
                )}
                
                {(dateFilterOption === 'custom' || showCustomDatePicker) && (
                  <Button
                    variant="light"
                    size="sm"
                    onClick={() => setShowCustomDatePicker(!showCustomDatePicker)}
                    leftSection={<IconCalendar size={14} />}
                  >
                    {customDateRange[0] && customDateRange[1]
                      ? `${format(customDateRange[0], 'MMM d')} - ${format(customDateRange[1], 'MMM d, yyyy')}`
                      : 'Select dates'}
                  </Button>
                )}
              </Group>
              
              <Box
                style={{
                  overflow: showCustomDatePicker ? 'visible' : 'hidden',
                  transition: 'max-height 200ms ease-out, opacity 200ms ease-out',
                  maxHeight: showCustomDatePicker ? '300px' : '0px',
                  opacity: showCustomDatePicker ? 1 : 0,
                }}
              >
                <Stack 
                  gap="xs" 
                  mt="xs"
                  style={{
                    visibility: showCustomDatePicker ? 'visible' : 'hidden',
                    pointerEvents: showCustomDatePicker ? 'auto' : 'none',
                  }}
                >
                  <DatePickerInput
                    type="range"
                    placeholder="Select custom date range"
                    value={tempCustomDateRange}
                    onChange={(value) => {
                      setTempCustomDateRange(value as [string | null, string | null]);
                    }}
                    leftSection={<IconCalendar size={16} />}
                    clearable
                    popoverProps={{ withinPortal: true, zIndex: 1000 }}
                  />
                  <Group gap="xs" justify="flex-end">
                    <Button
                      size="xs"
                      variant="subtle"
                      onClick={() => {
                        setShowCustomDatePicker(false);
                        setTempCustomDateRange([null, null]);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="xs"
                      onClick={() => {
                        if (tempCustomDateRange[0] && tempCustomDateRange[1]) {
                          const startDate = parseDateFromStorage(tempCustomDateRange[0]);
                          const endDate = parseDateFromStorage(tempCustomDateRange[1]);
                          
                          if (startDate && endDate) {
                            setCustomDateRange([startDate, endDate]);
                            setDateFilterOption('custom');
                          }
                        }
                        setShowCustomDatePicker(false);
                      }}
                      disabled={!tempCustomDateRange[0] || !tempCustomDateRange[1]}
                    >
                      Apply
                    </Button>
                  </Group>
                </Stack>
              </Box>
            </Stack>
            
            <Grid>
              <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                <TextInput
                  placeholder="Search transactions..."
                  leftSection={<IconSearch size={16} />}
                  value={searchInput}
                  onChange={handleSearchChange}
                />
              </Grid.Col>
              
              <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                <Select
                  placeholder="Select account"
                  data={accountOptions}
                  value={selectedAccount}
                  onChange={(value) => setSelectedAccount(value || 'all')}
                  clearable={false}
                />
              </Grid.Col>
              
              <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                <MultiSelect
                  placeholder="Filter by categories"
                  data={categoryOptions}
                  value={selectedCategories}
                  onChange={setSelectedCategories}
                  clearable
                  searchable
                />
              </Grid.Col>
              
              <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                <MultiSelect
                  placeholder="Filter by tags"
                  data={availableTags}
                  value={selectedTags}
                  onChange={setSelectedTags}
                  clearable
                  searchable
                />
              </Grid.Col>
            </Grid>

            {/* Transaction Type Filter */}
            <Stack gap="xs">
              <Text size="sm" fw={500}>Transaction Type</Text>
              <SegmentedControl
                value={transactionType}
                onChange={(value) => setTransactionType(value as 'all' | 'income' | 'expense' | 'transfer')}
                data={[
                  { label: 'All Transactions', value: 'all' },
                  { label: 'Income', value: 'income' },
                  { label: 'Expenses', value: 'expense' },
                  { label: 'Transfers', value: 'transfer' },
                ]}
              />
            </Stack>

            <Grid>
              <Grid.Col span={{ base: 12 }}>
                <Stack gap="sm">
                  <SegmentedControl
                    value={amountSearchMode}
                    onChange={(value) => setAmountSearchMode(value as 'range' | 'exact')}
                    data={[
                      { label: 'Amount Range', value: 'range' },
                      { label: 'Exact Amount', value: 'exact' },
                    ]}
                  />
                  
                  {amountSearchMode === 'range' ? (
                    <Group grow>
                      <NumberInput
                        label="Min Amount"
                        placeholder="0.00"
                        prefix="$"
                        value={amountRange.min || undefined}
                        onChange={(value) => setAmountRange({ ...amountRange, min: value !== undefined ? Number(value) : null })}
                        min={0}
                        decimalScale={2}
                        fixedDecimalScale
                      />
                      <NumberInput
                        label="Max Amount"
                        placeholder="999.99"
                        prefix="$"
                        value={amountRange.max || undefined}
                        onChange={(value) => setAmountRange({ ...amountRange, max: value !== undefined ? Number(value) : null })}
                        min={0}
                        decimalScale={2}
                        fixedDecimalScale
                      />
                    </Group>
                  ) : (
                    <Stack gap="xs">
                      <Group grow>
                        <NumberInput
                          label="Exact Amount"
                          placeholder="Enter amount to search for"
                          prefix="$"
                          value={exactAmount || undefined}
                          onChange={(value) => setExactAmount(value !== undefined ? Number(value) : null)}
                          min={0}
                          decimalScale={2}
                          fixedDecimalScale
                        />
                      </Group>
                      
                      <Box>
                        <Text size="sm" mb={4}>Tolerance: ±{formatCurrency(amountTolerance, true)}</Text>
                        <Slider
                          value={amountTolerance}
                          onChange={setAmountTolerance}
                          min={0}
                          max={5}
                          step={0.10}
                          marks={[
                            { value: 0, label: '$0' },
                            { value: 1, label: '$1' },
                            { value: 2.5, label: '$2.50' },
                            { value: 5, label: '$5' },
                          ]}
                          mb="sm"
                        />
                      </Box>
                      
                      <Group gap="xs" mt="xs">
                        <Text size="xs" c="dimmed">Quick amounts:</Text>
                        {[10, 20, 50, 100, 200].map((amount) => (
                          <Button
                            key={amount}
                            size="xs"
                            variant="light"
                            onClick={() => setExactAmount(amount)}
                          >
                            ${amount}
                          </Button>
                        ))}
                      </Group>
                    </Stack>
                  )}
                </Stack>
              </Grid.Col>
              
              <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                <Stack gap="xs" mt="md">
                  <Checkbox
                    label="Include hidden transactions"
                    checked={includeHidden}
                    onChange={(e) => setIncludeHidden(e.currentTarget.checked)}
                  />
                  <Checkbox
                    label="Only uncategorized"
                    checked={onlyUncategorized}
                    onChange={(e) => setOnlyUncategorized(e.currentTarget.checked)}
                  />
                </Stack>
              </Grid.Col>
            </Grid>

            <Group justify="space-between">
              {showSkeletons ? (
                <Skeleton height={16} width={200} />
              ) : (
                <Stack gap={4}>
                  <Text size="sm" c="dimmed">
                    Showing {paginatedTransactions.length} of {transactions.length} transactions (Page {currentPage}/{totalPages})
                  </Text>
                  <Text size="sm" fw={500} c={filteredTotal >= 0 ? 'red' : 'green'}>
                    Filtered Total: {filteredTotal >= 0 ? '-' : '+'}{formatCurrency(Math.abs(filteredTotal))}
                  </Text>
                </Stack>
              )}
              <Group gap="xs">
                <Button 
                  variant="subtle" 
                  size="sm" 
                  leftSection={<IconFilterOff size={14} />}
                  onClick={() => {
                    resetFilters();
                    notifications.show({
                      title: 'Filters Reset',
                      message: 'All filters have been reset to defaults',
                      color: 'blue',
                    });
                  }}
                >
                  Reset Filters
                </Button>
                <Button 
                  variant="subtle" 
                  size="sm" 
                  onClick={() => refetch()}
                  loading={isFetching}
                  leftSection={!isFetching && <IconRefresh size={14} />}
                >
                  {isFetching ? 'Refreshing...' : 'Refresh'}
                </Button>
              </Group>
            </Group>
          </Stack>
        </Paper>

        {/* Transactions Table */}
        <Paper withBorder style={{ position: 'relative' }}>
          <LoadingOverlay visible={isFetching && transactions.length > 0} loaderProps={{ size: 'md' }} />
          <ScrollArea>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ width: 40 }}>
                    <Checkbox
                      checked={selectedTransactionIds.size > 0 && selectedTransactionIds.size === paginatedTransactions.length}
                      indeterminate={selectedTransactionIds.size > 0 && selectedTransactionIds.size < paginatedTransactions.length}
                      onChange={handleSelectAll}
                    />
                  </Table.Th>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Description</Table.Th>
                  <Table.Th>Category</Table.Th>
                  <Table.Th>Tags</Table.Th>
                  <Table.Th>Account</Table.Th>
                  <Table.Th>Amount</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {showSkeletons ? (
                  // Show skeleton rows only on true initial load
                  [...Array(8)].map((_, index) => (
                    <Table.Tr key={`skeleton-${index}`}>
                      <Table.Td><Skeleton height={20} width={20} /></Table.Td>
                      <Table.Td><Skeleton height={20} width={80} /></Table.Td>
                      <Table.Td><Skeleton height={20} /></Table.Td>
                      <Table.Td><Skeleton height={20} width={120} /></Table.Td>
                      <Table.Td><Skeleton height={20} width={80} /></Table.Td>
                      <Table.Td><Skeleton height={20} width={40} /></Table.Td>
                      <Table.Td><Skeleton height={20} width={80} /></Table.Td>
                      <Table.Td><Skeleton height={20} width={60} /></Table.Td>
                    </Table.Tr>
                  ))
                ) : paginatedTransactions.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={8}>
                      <Center py="xl">
                        <Text c="dimmed">No transactions found</Text>
                      </Center>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  paginatedTransactions.map((transaction, index) => (
                <Table.Tr key={transaction.id}>
                  <Table.Td>
                    <Checkbox
                      checked={selectedTransactionIds.has(transaction.id)}
                      onChange={(event) => handleSelectTransaction(transaction.id, index, event)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{transaction.date}</Text>
                  </Table.Td>
                  
                  <Table.Td>
                    <Stack gap={2}>
                      {transaction.userDescription ? (
                        <Tooltip
                          label={`Original: ${transaction.name}`}
                          openDelay={1000}
                          closeDelay={200}
                          disabled={!transaction.userDescription}
                        >
                          <Text fw={500}>{transaction.userDescription}</Text>
                        </Tooltip>
                      ) : (
                        <Text fw={500}>{transaction.merchantName || transaction.name}</Text>
                      )}
                      {transaction.notes && (
                        <Text size="xs" c="dimmed">{transaction.notes}</Text>
                      )}
                    </Stack>
                  </Table.Td>
                  
                  <Table.Td>
                    {editingCategoryId === transaction.id ? (
                      <Select
                        data={categoryOptions}
                        value={selectedCategoryValue}
                        onChange={(value) => {
                          // Update state
                          setSelectedCategoryValue(value);
                          // Immediately trigger the update with the new value
                          if (value !== null) {
                            handleCategorySelect(transaction.id, value);
                          }
                        }}
                        onBlur={handleCategoryCancel}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            handleCategoryCancel();
                          }
                        }}
                        placeholder="Select category"
                        searchable
                        clearable={false}
                        size="sm"
                        autoFocus
                        styles={{
                          input: { minWidth: 200 },
                        }}
                        leftSection={updateCategoryMutation.isPending ? <Loader size={14} /> : <IconCategory size={14} />}
                        disabled={updateCategoryMutation.isPending}
                      />
                    ) : (
                      <div
                        onClick={() => handleCategoryClick(transaction.id, transaction.categoryId)}
                        style={{ cursor: 'pointer' }}
                      >
                        {getCategoryDisplay(transaction) ? (
                          <Tooltip
                            label={getCategoryDisplay(transaction)}
                            openDelay={1000}
                            closeDelay={200}
                          >
                            <Badge 
                              variant="light" 
                              leftSection={<IconCategory size={12} />}
                              maw={200}
                              style={{ overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
                            >
                              {getCategoryDisplay(transaction)}
                            </Badge>
                          </Tooltip>
                        ) : (
                          <Badge 
                            variant="default" 
                            color="gray"
                            style={{ cursor: 'pointer' }}
                          >
                            Uncategorized
                          </Badge>
                        )}
                      </div>
                    )}
                  </Table.Td>
                  
                  <Table.Td>
                    <Group gap={4}>
                      {transaction.tags?.map(tag => (
                        <Badge key={tag} size="sm" variant="dot">
                          {tag}
                        </Badge>
                      ))}
                    </Group>
                  </Table.Td>
                  
                  <Table.Td>
                    {(() => {
                      const accountInfo = accountLookup.get(transaction.accountId);
                      return accountInfo ? (
                        <Tooltip
                          label={`${accountInfo.nickname || accountInfo.name} - ${accountInfo.institution}${accountInfo.mask ? ` ••${accountInfo.mask}` : ''}`}
                          openDelay={1000}
                          closeDelay={200}
                        >
                          <ThemeIcon variant="light" size="md">
                            <IconBuilding size={16} />
                          </ThemeIcon>
                        </Tooltip>
                      ) : (
                        <Badge variant="outline">
                          {transaction.accountName || 'Unknown'}
                        </Badge>
                      );
                    })()}
                  </Table.Td>
                  
                  <Table.Td>
                    <Tooltip
                      label={formatCurrency(Math.abs(transaction.amount), true)}
                      openDelay={1000}
                      closeDelay={200}
                    >
                      <Group gap={4}>
                        <ThemeIcon
                          size="sm"
                          variant="light"
                          color={transaction.amount > 0 ? 'red' : 'green'}
                        >
                          {transaction.amount > 0 ? (
                            <IconArrowDownRight size={14} />
                          ) : (
                            <IconArrowUpRight size={14} />
                          )}
                        </ThemeIcon>
                        <Text fw={500} c={transaction.amount > 0 ? 'red' : 'green'}>
                          {formatCurrency(Math.abs(transaction.amount))}
                        </Text>
                      </Group>
                    </Tooltip>
                  </Table.Td>
                  
                  <Table.Td>
                    <Group gap={4}>
                      {transaction.isHidden && (
                        <Tooltip label="Hidden from budgets" openDelay={1000} closeDelay={200}>
                          <ThemeIcon size="xs" variant="light" color="gray">
                            <IconEyeOff size={12} />
                          </ThemeIcon>
                        </Tooltip>
                      )}
                      {transaction.isSplit && (
                        <Tooltip label="Split transaction" openDelay={1000} closeDelay={200}>
                          <ThemeIcon size="xs" variant="light" color="blue">
                            <IconScissors size={12} />
                          </ThemeIcon>
                        </Tooltip>
                      )}
                      <Menu shadow="md" width={200}>
                        <Menu.Target>
                          <ActionIcon variant="subtle">
                            <IconDots size={16} />
                          </ActionIcon>
                        </Menu.Target>

                        <Menu.Dropdown>
                          <Menu.Item
                            leftSection={<IconEdit style={{ width: rem(14), height: rem(14) }} />}
                            onClick={() => handleEditClick(transaction)}
                          >
                            Edit
                          </Menu.Item>
                          
                          <Menu.Item
                            leftSection={<IconScissors style={{ width: rem(14), height: rem(14) }} />}
                            disabled={transaction.isSplit}
                            onClick={() => handleSplitClick(transaction)}
                          >
                            Split Transaction
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Group>
                  </Table.Td>
                </Table.Tr>
                  ))
                )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <Group justify="center" mt="md">
            <Pagination 
              value={currentPage} 
              onChange={setCurrentPage} 
              total={totalPages}
              siblings={1}
              boundaries={1}
            />
            <Text size="sm" c="dimmed">
              Page {currentPage} of {totalPages} ({transactions.length} total transactions)
            </Text>
          </Group>
        )}
        </Paper>
      </Stack>

      {/* Edit Modal */}
      <TransactionEditModal
        opened={isEditModalOpen}
        onClose={handleEditModalClose}
        transaction={editingTransaction}
      />

      {/* Split Modal */}
      <TransactionSplitModal
        opened={isSplitModalOpen}
        onClose={handleSplitModalClose}
        transaction={splittingTransaction}
      />
      
      {/* Bulk Edit Modal */}
      <BulkEditModal
        opened={bulkEditMode !== null}
        onClose={() => setBulkEditMode(null)}
        mode={bulkEditMode || 'category'}
        selectedCount={selectedTransactionIds.size}
        categories={categoryOptions}
        onConfirm={handleBulkEditConfirm}
      />

      {/* Transaction Import Modal */}
      <TransactionImport
        opened={isTransactionImportOpen}
        onClose={() => setIsTransactionImportOpen(false)}
      />
    </Container>
    </>
  );
}