import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type ExtendedPlaidAccount } from '../lib/api';
import { format, startOfMonth, endOfMonth, startOfYear } from 'date-fns';
import type { Transaction } from '../../../shared/types';
import { useTransactionFilters } from '../hooks/usePersistedFilters';
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
  Collapse,
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
  IconEye,
  IconEyeOff,
  IconScissors,
  IconDots,
  IconRefresh,
  IconBuilding,
  IconFilterOff,
  IconAlertCircle,
} from '@tabler/icons-react';
import { TransactionEditModal } from '../components/transactions/TransactionEditModal';
import { TransactionSplitModal } from '../components/transactions/TransactionSplitModal';

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
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [selectedCategoryValue, setSelectedCategoryValue] = useState<string | null>(null);
  
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
  
  const queryClient = useQueryClient();
  
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
      return [startOfMonth(now), endOfMonth(now)];
    } else if (dateFilterOption === 'ytd') {
      return [startOfYear(now), endOfMonth(now)];
    } else if (dateFilterOption === 'custom') {
      return customDateRange;
    } else if (dateFilterOption.match(/^\d{4}-\d{2}$/)) {
      // Specific month selected (e.g., '2025-01')
      const [year, month] = dateFilterOption.split('-').map(Number);
      const monthDate = new Date(year, month - 1, 1);
      return [startOfMonth(monthDate), endOfMonth(monthDate)];
    }
    return [startOfMonth(now), endOfMonth(now)];
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
  ]);

  // Fetch transactions with filters
  const { data: transactionData, isFetching, refetch, status } = useQuery({
    queryKey: ['transactions', queryParams],
    queryFn: () => api.getTransactions(queryParams),
    refetchOnWindowFocus: false,
    staleTime: 0, // Always consider data stale so it refetches on invalidation
    gcTime: 10 * 60 * 1000,    // 10 minutes - cache persists (was cacheTime in v4)
    retry: 1,
  });
  
  // Only show skeletons when we're in a true loading state with no data
  // Since status is always 'success' when returning, this should never show skeletons
  const showSkeletons = status === 'pending' && !transactionData;
  
  // Removed smart default selection to respect user's persisted filter choice
  // The persisted filters from localStorage should take precedence
  useEffect(() => {
    if (!hasInitialized && transactionData?.transactions) {
      // Just mark as initialized without changing the user's filter
      setHasInitialized(true);
    }
  }, [transactionData, hasInitialized]);
  
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
  const categoryOptions = categories
    ?.map(cat => {
      const parentCategory = cat.parentId
        ? categories.find(p => p.id === cat.parentId)
        : null;
      const baseLabel = parentCategory 
        ? `${parentCategory.name} → ${cat.name}` 
        : cat.name;
      // Add indicator for hidden categories
      const label = cat.isHidden 
        ? `${baseLabel} (Excluded from budgets)`
        : baseLabel;
      return {
        value: cat.id,
        label: label,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label)) || [];
  
  // Category options for inline editing (includes Uncategorized option)
  const inlineCategoryOptions = [
    { value: 'uncategorized', label: 'Uncategorized' },
    ...categoryOptions
  ];

  // Account options for filter
  const accountOptions = [
    { value: 'all', label: 'All Accounts' },
    ...(accounts?.map(acc => ({
      value: acc.id,
      label: `${acc.officialName || acc.accountName} (${acc.institutionName})`,
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

  const transactions = transactionData?.transactions || [];
  
  // Paginate transactions
  const totalPages = Math.ceil(transactions.length / TRANSACTIONS_PER_PAGE);
  const paginatedTransactions = transactions.slice(
    (currentPage - 1) * TRANSACTIONS_PER_PAGE,
    currentPage * TRANSACTIONS_PER_PAGE
  );
  
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
          <Button
            leftSection={<IconRefresh size={16} />}
            onClick={() => syncMutation.mutate()}
            loading={syncMutation.isPending}
          >
            Sync Transactions
          </Button>
        </Group>

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
                    if (value !== 'custom') {
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
                    {dateRange[0] && dateRange[1]
                      ? `${format(dateRange[0], 'MMM d')} - ${format(dateRange[1], 'MMM d, yyyy')}`
                      : 'Select dates'}
                  </Button>
                )}
              </Group>
              
              <Collapse in={showCustomDatePicker}>
                <DatePickerInput
                  type="range"
                  placeholder="Select custom date range"
                  value={customDateRange}
                  onChange={(value) => {
                    setCustomDateRange(value as [Date | null, Date | null]);
                    setDateFilterOption('custom');
                  }}
                  leftSection={<IconCalendar size={16} />}
                  mt="xs"
                />
              </Collapse>
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
                        <Text size="sm" mb={4}>Tolerance: ±${amountTolerance.toFixed(2)}</Text>
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
                <Text size="sm" c="dimmed">
                  Showing {paginatedTransactions.length} of {transactions.length} transactions (Page {currentPage}/{totalPages})
                </Text>
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
                    <Table.Td colSpan={7}>
                      <Center py="xl">
                        <Text c="dimmed">No transactions found</Text>
                      </Center>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  paginatedTransactions.map((transaction) => (
                <Table.Tr key={transaction.id}>
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
                        data={inlineCategoryOptions}
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
                      label={`$${Math.abs(transaction.amount).toFixed(2)}`}
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
                            <IconArrowUpRight size={14} />
                          ) : (
                            <IconArrowDownRight size={14} />
                          )}
                        </ThemeIcon>
                        <Text fw={500} c={transaction.amount > 0 ? 'red' : 'green'}>
                          ${Math.round(Math.abs(transaction.amount))}
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
                          
                          <Menu.Item
                            leftSection={
                              transaction.isHidden ? (
                                <IconEye style={{ width: rem(14), height: rem(14) }} />
                              ) : (
                                <IconEyeOff style={{ width: rem(14), height: rem(14) }} />
                              )
                            }
                          >
                            {transaction.isHidden ? 'Show' : 'Hide'} from Budget
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
    </Container>
    </>
  );
}