import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type ExtendedPlaidAccount } from '../lib/api';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths } from 'date-fns';
import type { Transaction, Category } from '../../../shared/types';
import { useDebouncedValue } from '@mantine/hooks';
import {
  Container,
  Stack,
  Group,
  Title,
  Text,
  Card,
  TextInput,
  Select,
  MultiSelect,
  Button,
  Badge,
  Loader,
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
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import {
  IconSearch,
  IconFilter,
  IconCalendar,
  IconArrowUpRight,
  IconArrowDownRight,
  IconEdit,
  IconTag,
  IconCategory,
  IconEye,
  IconEyeOff,
  IconScissors,
  IconDots,
  IconRefresh,
  IconBuilding,
  IconCoin,
} from '@tabler/icons-react';
import { TransactionEditModal } from '../components/transactions/TransactionEditModal';
import { TransactionSplitModal } from '../components/transactions/TransactionSplitModal';

type DateFilterOption = 'this-month' | 'ytd' | 'custom' | string; // string for specific month like '2025-01'

export function EnhancedTransactions() {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearchTerm] = useDebouncedValue(searchInput, 300);
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dateFilterOption, setDateFilterOption] = useState<DateFilterOption>('ytd'); // Start with YTD as default
  const [customDateRange, setCustomDateRange] = useState<[Date | null, Date | null]>([null, null]);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [onlyUncategorized, setOnlyUncategorized] = useState(false);
  const [amountRange, setAmountRange] = useState({ min: null as number | null, max: null as number | null });
  const [hasInitialized, setHasInitialized] = useState(false);
  
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [splittingTransaction, setSplittingTransaction] = useState<Transaction | null>(null);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  
  const queryClient = useQueryClient();
  
  // Callback for search input change
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.currentTarget.value);
  }, []);
  
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

  // Build query parameters
  const queryParams = useMemo(() => {
    const params: any = {
      accountId: selectedAccount === 'all' ? undefined : selectedAccount,
      startDate: dateRange[0] ? format(dateRange[0], 'yyyy-MM-dd') : undefined,
      endDate: dateRange[1] ? format(dateRange[1], 'yyyy-MM-dd') : undefined,
      categoryIds: selectedCategories.length > 0 ? selectedCategories : undefined,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
      searchQuery: debouncedSearchTerm || undefined,
      includeHidden,
      onlyUncategorized,
      minAmount: amountRange.min || undefined,
      maxAmount: amountRange.max || undefined,
    };
    
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
  ]);

  // Fetch transactions with filters
  const { data: transactionData, isLoading, refetch } = useQuery({
    queryKey: ['transactions', queryParams],
    queryFn: () => api.getTransactions(queryParams),
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
    staleTime: 1000, // Keep data fresh for 1 second to prevent refetching
  });
  
  // Smart default selection: Set date filter to most recent month with transactions
  useEffect(() => {
    if (!hasInitialized && transactionData?.transactions && transactionData.transactions.length > 0) {
      const now = new Date();
      const currentMonth = format(now, 'yyyy-MM');
      
      // Check if current month has transactions
      const currentMonthTransactions = transactionData.transactions.filter(
        t => t.date.startsWith(currentMonth)
      );
      
      if (currentMonthTransactions.length > 0) {
        // Current month has transactions, use it
        setDateFilterOption('this-month');
      } else {
        // Find the most recent month with transactions
        const transactionMonths = new Set(
          transactionData.transactions.map(t => t.date.substring(0, 7))
        );
        const sortedMonths = Array.from(transactionMonths).sort().reverse();
        
        if (sortedMonths.length > 0) {
          const mostRecentMonth = sortedMonths[0];
          // Check if it's in the current year
          if (mostRecentMonth.startsWith(String(now.getFullYear()))) {
            // Set to the specific month
            setDateFilterOption(mostRecentMonth);
          } else {
            // Different year, keep YTD
            setDateFilterOption('ytd');
          }
        }
      }
      setHasInitialized(true);
    }
  }, [transactionData, hasInitialized]);
  
  // Create account lookup map for tooltips
  const accountLookup = useMemo(() => {
    const map = new Map<string, { name: string; institution: string; mask: string | null }>();
    accounts?.forEach(acc => {
      map.set(acc.id, {
        name: acc.officialName || acc.accountName || acc.name,
        institution: acc.institutionName || acc.institution,
        mask: acc.mask
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
    ?.filter(cat => !cat.isHidden)
    .map(cat => {
      const parentCategory = cat.parentId
        ? categories.find(p => p.id === cat.parentId)
        : null;
      return {
        value: cat.id,
        label: parentCategory 
          ? `${parentCategory.name} → ${cat.name}` 
          : cat.name,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label)) || [];

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

  if (isLoading) {
    return (
      <Center h={400}>
        <Loader size="lg" />
      </Center>
    );
  }

  const transactions = transactionData?.transactions || [];
  const totalTransactions = transactionData?.total ?? transactions.length;

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={2}>Transactions</Title>
          <Button
            leftSection={<IconRefresh size={16} />}
            onClick={() => syncMutation.mutate()}
            loading={syncMutation.isPending}
          >
            Sync Transactions
          </Button>
        </Group>

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
                    setCustomDateRange(value);
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
              <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                <NumberInput
                  label="Min Amount"
                  placeholder="0.00"
                  prefix="$"
                  value={amountRange.min}
                  onChange={(value) => setAmountRange({ ...amountRange, min: Number(value) })}
                  min={0}
                />
              </Grid.Col>
              
              <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                <NumberInput
                  label="Max Amount"
                  placeholder="999.99"
                  prefix="$"
                  value={amountRange.max}
                  onChange={(value) => setAmountRange({ ...amountRange, max: Number(value) })}
                  min={0}
                />
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
              <Text size="sm" c="dimmed">
                Showing {transactions.length} of {totalTransactions} transactions
              </Text>
              <Button variant="subtle" size="sm" onClick={() => refetch()}>
                Refresh
              </Button>
            </Group>
          </Stack>
        </Paper>

        {/* Transactions Table */}
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
                <Table.Th width={60}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {transactions.map((transaction) => (
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
                          style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}
                        >
                          {getCategoryDisplay(transaction)}
                        </Badge>
                      </Tooltip>
                    ) : (
                      <Badge variant="default" color="gray">
                        Uncategorized
                      </Badge>
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
                          label={`${accountInfo.name} - ${accountInfo.institution}${accountInfo.mask ? ` ••${accountInfo.mask}` : ''}`}
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
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>

        {transactions.length === 0 && (
          <Center py="xl">
            <Text c="dimmed">No transactions found matching your filters</Text>
          </Center>
        )}
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
  );
}