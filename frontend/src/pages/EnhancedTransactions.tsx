import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type ExtendedPlaidAccount } from '../lib/api';
import { format, startOfMonth, endOfMonth, startOfYear, subMonths } from 'date-fns';
import type { Transaction } from '../../../shared/types';
import { useTransactionFilters } from '../hooks/usePersistedFilters';
import { formatCurrency } from '../utils/formatters';
import { useCategoryOptions } from '../hooks/useCategoryOptions';
import {
  Container,
  Stack,
  Group,
  Button,
  Alert,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCategory,
  IconAlertCircle,
} from '@tabler/icons-react';
import { TransactionEditModal } from '../components/transactions/TransactionEditModal';
import { TransactionImport } from '../components/transactions/TransactionImport';
import { TransactionSplitModal } from '../components/transactions/TransactionSplitModal';
import { BulkEditBar } from '../components/transactions/BulkEditBar';
import { BulkEditModal, type BulkEditUpdates } from '../components/transactions/BulkEditModal';
import { CategorizationFlowModal } from '../components/transactions/CategorizationFlowModal';
import { TransactionToolbar } from '../components/transactions/TransactionToolbar';
import { TransactionFilterBar } from '../components/transactions/TransactionFilterBar';
import { TransactionTable } from '../components/transactions/TransactionTable';
import {
  isIncomeCategoryHierarchical,
  isTransferCategory,
  createCategoryLookup,
} from '../../../shared/utils/categoryHelpers';

type DateFilterOption = 'this-month' | 'last-month' | 'ytd' | 'last3' | 'last6' | 'last12' | 'all' | 'custom' | string;

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
  const [searchParams, setSearchParams] = useSearchParams();
  const [isTransactionImportOpen, setIsTransactionImportOpen] = useState(false);
  const [isCategorizationOpen, setIsCategorizationOpen] = useState(false);

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
    onlyFlagged,
    amountRange,
    amountSearchMode,
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

  // Bulk selection state
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [bulkEditMode, setBulkEditMode] = useState<'category' | 'description' | 'hidden' | 'flagged' | 'tags' | null>(null);

  const queryClient = useQueryClient();

  // Helper function to convert reports time range to transaction date filter
  const convertTimeRangeToDateFilter = (timeRangeFilter: string): DateFilterOption => {
    switch (timeRangeFilter) {
      case 'thisMonth':
        return 'this-month';
      case 'lastMonth':
        return 'last-month';
      case 'yearToDate':
        return 'ytd';
      case 'thisYear':
        return 'ytd';
      case 'last3':
        return 'last3';
      case 'last6':
        return 'last6';
      case 'last12':
        return 'last12';
      default:
        return 'ytd';
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
      const dateFilterParam = searchParams.get('dateFilter');
      const tags = searchParams.get('tags');

      // If navigating from another page with filters, reset existing filters first
      const hasInboundFilters = categoryIds || onlyUncategorizedParam || timeRangeFilter || dateFilterParam || (startDate && endDate) || tags;
      if (hasInboundFilters) {
        resetFilters();
      }

      if (tags) {
        setSelectedTags(tags.split(','));
      }

      if (categoryIds) {
        const categoryIdArray = categoryIds.split(',');
        setSelectedCategories(categoryIdArray);
        setOnlyUncategorized(false);
      }

      if (onlyUncategorizedParam === 'true') {
        setOnlyUncategorized(true);
        setSelectedCategories([]);
      }

      if (dateFilterParam) {
        setDateFilterOption(dateFilterParam as DateFilterOption);
        if (dateFilterParam === 'custom' && startDate && endDate) {
          setCustomDateRange([new Date(startDate), new Date(endDate)]);
        }
      } else if (timeRangeFilter) {
        const dateFilterValue = convertTimeRangeToDateFilter(timeRangeFilter);
        setDateFilterOption(dateFilterValue);
        if (dateFilterValue === 'custom' && startDate && endDate) {
          setCustomDateRange([new Date(startDate), new Date(endDate)]);
        }
      } else if (startDate && endDate) {
        setCustomDateRange([new Date(startDate), new Date(endDate)]);
        setDateFilterOption('custom');
      }

      setHasInitialized(true);
    }
  }, [searchParams, hasInitialized, setSelectedCategories, setSelectedTags, setOnlyUncategorized, setCustomDateRange, setDateFilterOption]);

  // Sync filter state to URL params so chatbot (and bookmarks) can read current context
  useEffect(() => {
    if (!hasInitialized) return;

    setSearchParams((prev) => {
      const keysToManage = ['search', 'accountId', 'categoryIds', 'tags', 'dateFilter', 'startDate', 'endDate', 'txnType', 'uncategorized', 'onlyFlagged'];
      keysToManage.forEach((k) => prev.delete(k));

      if (debouncedSearchTerm) prev.set('search', debouncedSearchTerm);
      if (selectedAccount && selectedAccount !== 'all') prev.set('accountId', selectedAccount);
      if (selectedCategories.length > 0) prev.set('categoryIds', selectedCategories.join(','));
      if (selectedTags.length > 0) prev.set('tags', selectedTags.join(','));
      if (dateFilterOption) prev.set('dateFilter', dateFilterOption);
      if (dateFilterOption === 'custom') {
        if (customDateRange[0]) prev.set('startDate', format(customDateRange[0], 'yyyy-MM-dd'));
        if (customDateRange[1]) prev.set('endDate', format(customDateRange[1], 'yyyy-MM-dd'));
      }
      if (transactionType && transactionType !== 'all') prev.set('txnType', transactionType);
      if (selectedCategories.length === 1 && selectedCategories.includes('uncategorized')) prev.set('uncategorized', 'true');
      if (onlyFlagged) prev.set('onlyFlagged', 'true');

      return prev;
    }, { replace: true });
  }, [hasInitialized, debouncedSearchTerm, selectedAccount, selectedCategories, selectedTags, dateFilterOption, customDateRange, transactionType, onlyUncategorized, onlyFlagged, setSearchParams]);

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
    const map = new Map<string, { name: string; institution: string; mask: string | null; nickname: string | null }>();
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

  // Helper function to build grouped category options with parent selection
  const buildGroupedCategoryOptions = useCallback(() => {
    if (!categories) return [];

    const grouped = [];
    grouped.push({ value: 'uncategorized', label: 'Uncategorized' });

    const parentCategories = categories.filter(c => !c.parentId);
    const childrenByParent = new Map<string, typeof categories>();

    categories.forEach(cat => {
      if (cat.parentId) {
        if (!childrenByParent.has(cat.parentId)) {
          childrenByParent.set(cat.parentId, []);
        }
        childrenByParent.get(cat.parentId)?.push(cat);
      }
    });

    parentCategories.forEach(parent => {
      const children = childrenByParent.get(parent.id) || [];
      if (children.length > 0) {
        children.sort((a: typeof categories[0], b: typeof categories[0]) => a.name.localeCompare(b.name));

        const parentLabel = parent.isHidden
          ? `👁️‍🗨️ ${parent.name} (Excluded from budgets)`
          : parent.name;

        grouped.push({
          group: parentLabel,
          items: [
            {
              value: `${parent.id}:all`,
              label: `All ${parent.name}`,
            },
            ...children.map((child: typeof categories[0]) => {
              const childLabel = child.isHidden
                ? `${parent.name} → 👁️‍🗨️ ${child.name} (Excluded from budgets)`
                : `${parent.name} → ${child.name}`;
              return {
                value: child.id,
                label: childLabel,
              };
            }),
          ],
        });
      } else {
        const parentLabel = parent.isHidden
          ? `👁️‍🗨️ ${parent.name} (Excluded from budgets)`
          : parent.name;
        grouped.push({ value: parent.id, label: parentLabel });
      }
    });

    return grouped;
  }, [categories]);

  // Handler for category selection changes with parent expansion
  const handleCategorySelectionChange = useCallback((values: string[]) => {
    const expandedValues: string[] = [];
    const parentSelectionsToExpand: string[] = [];

    values.forEach(value => {
      if (value.endsWith(':all')) {
        const parentId = value.replace(':all', '');
        parentSelectionsToExpand.push(parentId);
      } else {
        expandedValues.push(value);
      }
    });

    parentSelectionsToExpand.forEach(parentId => {
      expandedValues.push(parentId);
      if (categories) {
        categories
          .filter(c => c.parentId === parentId)
          .forEach(child => expandedValues.push(child.id));
      }
    });

    const uniqueValues = [...new Set(expandedValues)];
    setSelectedCategories(uniqueValues);
  }, [categories, setSelectedCategories]);

  // Grouped category options for MultiSelect filter only
  const categoryOptions = useMemo(() => {
    return buildGroupedCategoryOptions();
  }, [buildGroupedCategoryOptions]);

  // Flat category options for bulk edit modal
  const { options: flatCategoryOptions } = useCategoryOptions({
    categories,
    includeUncategorized: true,
  });

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
      setSelectedTransactionIds(new Set());
    } else {
      const newSelection = new Set(paginatedTransactions.map(t => t.id));
      setSelectedTransactionIds(newSelection);
    }
  };

  const handleSelectTransaction = (
    transactionId: string,
    index: number,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const shiftKey = event.nativeEvent instanceof MouseEvent && event.nativeEvent.shiftKey;
    const ctrlKey = event.nativeEvent instanceof MouseEvent && (event.nativeEvent.ctrlKey || event.nativeEvent.metaKey);

    if (shiftKey && lastClickedId !== null) {
      const lastIndex = paginatedTransactions.findIndex(t => t.id === lastClickedId);
      if (lastIndex !== -1) {
        const startIndex = Math.min(lastIndex, index);
        const endIndex = Math.max(lastIndex, index);
        const newSelection = new Set(selectedTransactionIds);

        for (let i = startIndex; i <= endIndex; i++) {
          newSelection.add(paginatedTransactions[i].id);
        }

        setSelectedTransactionIds(newSelection);
      }
    } else if (ctrlKey) {
      const newSelection = new Set(selectedTransactionIds);
      if (newSelection.has(transactionId)) {
        newSelection.delete(transactionId);
      } else {
        newSelection.add(transactionId);
      }
      setSelectedTransactionIds(newSelection);
    } else {
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
  const handleBulkEditCategory = () => setBulkEditMode('category');
  const handleBulkEditDescription = () => setBulkEditMode('description');
  const handleBulkEditHidden = () => setBulkEditMode('hidden');
  const handleBulkEditTags = () => setBulkEditMode('tags');
  const handleBulkEditFlagged = () => setBulkEditMode('flagged');

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
      const apiUpdates: {
        categoryId?: string | null;
        userDescription?: string | null;
        isHidden?: boolean;
        isFlagged?: boolean;
        tagsToAdd?: string[];
        tagsToRemove?: string[];
      } = {};

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

      if (updates.isFlagged !== undefined) {
        apiUpdates.isFlagged = updates.isFlagged;
      }

      if (updates.tagsToAdd && updates.tagsToAdd.length > 0) {
        apiUpdates.tagsToAdd = updates.tagsToAdd;
      }

      if (updates.tagsToRemove && updates.tagsToRemove.length > 0) {
        apiUpdates.tagsToRemove = updates.tagsToRemove;
      }

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

  const exportToTSV = () => {
    if (!transactionData?.transactions || transactionData.transactions.length === 0) {
      notifications.show({
        title: 'No Data',
        message: 'No transactions to export',
        color: 'yellow',
      });
      return;
    }

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
      'Transaction Hidden',
    ];

    const escapeTSV = (value: string | null | undefined): string => {
      if (value == null) return '';
      const str = String(value);
      return str.replace(/\t/g, ' ').replace(/\n/g, ' ').replace(/\r/g, '');
    };

    const getAccountInfo = (accountId: string) => {
      const account = accounts?.find(a => a.id === accountId);
      return {
        accountName: account?.nickname || account?.officialName || account?.accountName || account?.name || 'Unknown',
        institution: account?.institutionName || account?.institution || 'Unknown',
      };
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

    const categoryLookup = categories ? createCategoryLookup(categories) : new Map();

    const rows = transactionData.transactions.map(transaction => {
      const { accountName, institution } = getAccountInfo(transaction.accountId);
      const categoryDisplay = getCategoryDisplay(transaction) || 'Uncategorized';
      const description = transaction.userDescription || transaction.name;
      const tags = transaction.tags?.join('; ') || '';
      const transactionHidden = transaction.isHidden ? 'Yes' : 'No';

      const category = transaction.categoryId && categories
        ? categories.find(c => c.id === transaction.categoryId)
        : null;

      const categoryType = !transaction.categoryId ? 'Uncategorized' :
        isIncomeCategoryHierarchical(transaction.categoryId, categoryLookup) ? 'Income' :
        isTransferCategory(transaction.categoryId) ? 'Transfer' : 'Expense';

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
        escapeTSV(transactionHidden),
      ].join('\t');
    });

    const tsvContent = [headers.join('\t'), ...rows].join('\n');
    const blob = new Blob([tsvContent], { type: 'text/tab-separated-values;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
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
    currentPage * TRANSACTIONS_PER_PAGE,
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

  // Callback for search input change
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.currentTarget.value);
  }, [setSearchInput]);

  return (
    <>
      <style>{spinAnimation}</style>
      <Container size="xl" py="xl">
        <Stack gap="lg">
          <TransactionToolbar
            isFetching={isFetching}
            hasTransactions={transactions.length > 0}
            isSyncing={syncMutation.isPending}
            uncategorizedCount={uncategorizedData?.count ?? 0}
            onSync={() => syncMutation.mutate()}
            onOpenCategorization={() => setIsCategorizationOpen(true)}
            onOpenImport={() => setIsTransactionImportOpen(true)}
            onExportTSV={exportToTSV}
          />

          {/* Bulk Edit Bar */}
          <BulkEditBar
            selectedCount={selectedTransactionIds.size}
            selectedAmount={selectedAmount}
            onEditCategory={handleBulkEditCategory}
            onEditDescription={handleBulkEditDescription}
            onEditHidden={handleBulkEditHidden}
            onEditFlagged={handleBulkEditFlagged}
            onEditTags={handleBulkEditTags}
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
                setSelectedCategories(['uncategorized']);
              }}
            >
              <Group justify="space-between">
                <Text size="sm">
                  You have {uncategorizedData.count} uncategorized transaction{uncategorizedData.count !== 1 ? 's' : ''}{' '}
                  ({Math.round((uncategorizedData.count / uncategorizedData.total) * 100)}% of total).
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
          <TransactionFilterBar
            searchInput={searchInput}
            onSearchChange={handleSearchChange}
            dateFilterOption={dateFilterOption}
            customDateRange={customDateRange}
            onDateFilterChange={setDateFilterOption}
            onCustomDateRangeChange={setCustomDateRange}
            selectedAccount={selectedAccount}
            accountOptions={accountOptions}
            onAccountChange={(value) => setSelectedAccount(value || 'all')}
            selectedCategories={selectedCategories}
            categoryOptions={categoryOptions}
            onCategoryChange={handleCategorySelectionChange}
            selectedTags={selectedTags}
            availableTags={availableTags}
            onTagChange={setSelectedTags}
            transactionType={transactionType}
            onTransactionTypeChange={(value) => setTransactionType(value)}
            amountSearchMode={amountSearchMode}
            amountRange={amountRange}
            onAmountModeChange={setAmountSearchMode}
            onAmountRangeChange={setAmountRange}
            includeHidden={includeHidden}
            onlyFlagged={onlyFlagged}
            onIncludeHiddenChange={setIncludeHidden}
            onOnlyFlaggedChange={setOnlyFlagged}
            showSkeletons={showSkeletons}
            paginatedCount={paginatedTransactions.length}
            totalCount={transactions.length}
            currentPage={currentPage}
            totalPages={totalPages || 1}
            filteredTotal={filteredTotal}
            isFetching={isFetching}
            onResetFilters={resetFilters}
            onRefetch={() => void refetch()}
          />

          {/* Transactions Table */}
          <TransactionTable
            paginatedTransactions={paginatedTransactions}
            transactions={transactions}
            showSkeletons={showSkeletons}
            isFetching={isFetching}
            selectedTransactionIds={selectedTransactionIds}
            accountLookup={accountLookup}
            categories={categories}
            currentPage={currentPage}
            totalPages={totalPages}
            onSelectAll={handleSelectAll}
            onSelectTransaction={handleSelectTransaction}
            onEditClick={handleEditClick}
            onSplitClick={handleSplitClick}
            onPageChange={setCurrentPage}
          />
        </Stack>

        {/* Edit Modal */}
        <TransactionEditModal
          opened={isEditModalOpen}
          onClose={handleEditModalClose}
          transaction={editingTransaction}
          accountInfo={editingTransaction ? accountLookup.get(editingTransaction.accountId) : null}
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
          categories={flatCategoryOptions}
          existingTags={availableTags}
          onConfirm={handleBulkEditConfirm}
        />

        {/* Transaction Import Modal */}
        <TransactionImport
          opened={isTransactionImportOpen}
          onClose={() => setIsTransactionImportOpen(false)}
        />
        <CategorizationFlowModal
          opened={isCategorizationOpen}
          onClose={() => setIsCategorizationOpen(false)}
          uncategorizedCount={uncategorizedData?.count || 0}
        />
      </Container>
    </>
  );
}
