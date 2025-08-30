import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import type { Transaction, Category } from '../../../shared/types';
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
  IconSplit,
  IconDots,
  IconRefresh,
} from '@tabler/icons-react';
import { TransactionEditModal } from '../components/transactions/TransactionEditModal';

export function EnhancedTransactions() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>(() => {
    const now = new Date();
    return [startOfMonth(subMonths(now, 1)), endOfMonth(now)];
  });
  const [includeHidden, setIncludeHidden] = useState(false);
  const [includePending, setIncludePending] = useState(false);
  const [amountRange, setAmountRange] = useState({ min: null as number | null, max: null as number | null });
  
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  
  const queryClient = useQueryClient();

  // Fetch accounts
  const { data: accounts } = useQuery({
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
      searchQuery: searchTerm || undefined,
      includeHidden,
      includePending,
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
    searchTerm,
    includeHidden,
    includePending,
    amountRange,
  ]);

  // Fetch transactions with filters
  const { data: transactionData, isLoading, refetch } = useQuery({
    queryKey: ['transactions', queryParams],
    queryFn: () => api.getTransactions(queryParams),
  });

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
      label: `${acc.name} (${acc.institution})`,
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
            <Grid>
              <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                <TextInput
                  placeholder="Search transactions..."
                  leftSection={<IconSearch size={16} />}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.currentTarget.value)}
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
              <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
                <DatePickerInput
                  type="range"
                  label="Date Range"
                  placeholder="Select dates"
                  value={dateRange}
                  onChange={setDateRange}
                  leftSection={<IconCalendar size={16} />}
                />
              </Grid.Col>
              
              <Grid.Col span={{ base: 12, sm: 6, md: 2 }}>
                <NumberInput
                  label="Min Amount"
                  placeholder="0.00"
                  prefix="$"
                  value={amountRange.min}
                  onChange={(value) => setAmountRange({ ...amountRange, min: Number(value) })}
                  min={0}
                />
              </Grid.Col>
              
              <Grid.Col span={{ base: 12, sm: 6, md: 2 }}>
                <NumberInput
                  label="Max Amount"
                  placeholder="999.99"
                  prefix="$"
                  value={amountRange.max}
                  onChange={(value) => setAmountRange({ ...amountRange, max: Number(value) })}
                  min={0}
                />
              </Grid.Col>
              
              <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
                <Stack gap="xs" mt="md">
                  <Checkbox
                    label="Include hidden transactions"
                    checked={includeHidden}
                    onChange={(e) => setIncludeHidden(e.currentTarget.checked)}
                  />
                  <Checkbox
                    label="Include pending transactions"
                    checked={includePending}
                    onChange={(e) => setIncludePending(e.currentTarget.checked)}
                  />
                </Stack>
              </Grid.Col>
            </Grid>

            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Showing {transactions.length} of {transactionData?.total || 0} transactions
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
                <Table.Th>Status</Table.Th>
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
                      <Text fw={500}>{transaction.merchantName || transaction.name}</Text>
                      {transaction.notes && (
                        <Text size="xs" c="dimmed">{transaction.notes}</Text>
                      )}
                    </Stack>
                  </Table.Td>
                  
                  <Table.Td>
                    {getCategoryDisplay(transaction) ? (
                      <Badge variant="light" leftSection={<IconCategory size={12} />}>
                        {getCategoryDisplay(transaction)}
                      </Badge>
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
                    <Badge variant="outline">
                      {transaction.accountName}
                    </Badge>
                  </Table.Td>
                  
                  <Table.Td>
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
                        ${Math.abs(transaction.amount).toFixed(2)}
                      </Text>
                    </Group>
                  </Table.Td>
                  
                  <Table.Td>
                    <Group gap={4}>
                      {transaction.pending && (
                        <Badge size="xs" color="yellow">Pending</Badge>
                      )}
                      {transaction.isHidden && (
                        <Tooltip label="Hidden from budgets">
                          <ThemeIcon size="xs" variant="light" color="gray">
                            <IconEyeOff size={12} />
                          </ThemeIcon>
                        </Tooltip>
                      )}
                      {transaction.isSplit && (
                        <Tooltip label="Split transaction">
                          <ThemeIcon size="xs" variant="light" color="blue">
                            <IconSplit size={12} />
                          </ThemeIcon>
                        </Tooltip>
                      )}
                    </Group>
                  </Table.Td>
                  
                  <Table.Td>
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
                          leftSection={<IconSplit style={{ width: rem(14), height: rem(14) }} />}
                          disabled={transaction.isSplit}
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
    </Container>
  );
}