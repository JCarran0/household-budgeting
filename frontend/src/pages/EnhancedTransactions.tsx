import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { useTransactionFilters } from '../hooks/usePersistedFilters';
import { useCategoryOptions } from '../hooks/useCategoryOptions';
import { useTransactionData } from '../hooks/useTransactionData';
import { useTransactionBulkOps } from '../hooks/useTransactionBulkOps';
import { exportTransactionsToTSV } from '../utils/transactionExport';
import type { Transaction } from '../../../shared/types';
import {
  Container,
  Stack,
  Group,
  Button,
  Alert,
  Text,
} from '@mantine/core';
import {
  IconCategory,
  IconAlertCircle,
} from '@tabler/icons-react';
import { TransactionEditModal } from '../components/transactions/TransactionEditModal';
import { TransactionImport } from '../components/transactions/TransactionImport';
import { TransactionSplitModal } from '../components/transactions/TransactionSplitModal';
import { BulkEditBar } from '../components/transactions/BulkEditBar';
import { BulkEditModal } from '../components/transactions/BulkEditModal';
import { CategorizationFlowModal } from '../components/transactions/CategorizationFlowModal';
import { AmazonReceiptFlowModal } from '../components/transactions/AmazonReceiptFlowModal';
import { TransactionToolbar } from '../components/transactions/TransactionToolbar';
import { TransactionFilterBar } from '../components/transactions/TransactionFilterBar';
import { TransactionTable } from '../components/transactions/TransactionTable';

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
  const [isAmazonReceiptsOpen, setIsAmazonReceiptsOpen] = useState(false);

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
  }, [searchParams, hasInitialized, resetFilters, setSelectedCategories, setSelectedTags, setOnlyUncategorized, setCustomDateRange, setDateFilterOption]);

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

  // Data fetching hook
  const {
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
  } = useTransactionData({
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
  });

  const transactions = useMemo(() => transactionData?.transactions || [], [transactionData?.transactions]);

  // Count Amazon transactions for the receipt matching button
  const amazonTransactionCount = useMemo(() => {
    const patterns = ['amazon', 'amzn', 'kindle svcs'];
    return transactions.filter(t => {
      const name = (t.name || '').toLowerCase();
      const merchant = (t.merchantName || '').toLowerCase();
      return patterns.some(p => name.includes(p) || merchant.includes(p));
    }).length;
  }, [transactions]);

  // Paginate transactions
  const totalPages = Math.ceil(transactions.length / TRANSACTIONS_PER_PAGE);
  const paginatedTransactions = transactions.slice(
    (currentPage - 1) * TRANSACTIONS_PER_PAGE,
    currentPage * TRANSACTIONS_PER_PAGE,
  );

  // Bulk operations hook
  const {
    selectedTransactionIds,
    selectedAmount,
    bulkEditMode,
    setBulkEditMode,
    handleSelectAll,
    handleSelectTransaction,
    handleBulkEditCategory,
    handleBulkEditDescription,
    handleBulkEditHidden,
    handleBulkEditTags,
    handleBulkEditFlagged,
    handleClearSelection,
    handleBulkEditConfirm,
  } = useTransactionBulkOps(paginatedTransactions, transactions);

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

  // Calculate filtered total
  const filteredTotal = useMemo(() => {
    return transactions.reduce((sum, t) => sum + t.amount, 0);
  }, [transactions]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [queryParams]);

  // Callback for search input change
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.currentTarget.value);
  }, [setSearchInput]);

  const exportToTSV = useCallback(() => {
    exportTransactionsToTSV(transactionData?.transactions || [], accounts, categories);
  }, [transactionData, accounts, categories]);

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
            amazonTransactionCount={amazonTransactionCount}
            onSync={() => syncMutation.mutate()}
            onOpenCategorization={() => setIsCategorizationOpen(true)}
            onOpenAmazonReceipts={() => setIsAmazonReceiptsOpen(true)}
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
        <AmazonReceiptFlowModal
          opened={isAmazonReceiptsOpen}
          onClose={() => setIsAmazonReceiptsOpen(false)}
        />
      </Container>
    </>
  );
}
