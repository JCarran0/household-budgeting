import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Transaction, Category } from '../../../../shared/types';
import { formatCurrency } from '../../utils/formatters';
import { useCategoryOptions } from '../../hooks/useCategoryOptions';
import { patchTransactionsInCache, invalidateTransactionCounts } from '../../lib/transactionCacheSync';
import {
  Group,
  Text,
  Badge,
  Center,
  Paper,
  Table,
  ScrollArea,
  ThemeIcon,
  Tooltip,
  Checkbox,
  Skeleton,
  LoadingOverlay,
  Pagination,
  Stack,
  Select,
  Loader,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconArrowUpRight,
  IconArrowDownRight,
  IconCategory,
  IconEyeOff,
  IconScissors,
  IconFlag,
} from '@tabler/icons-react';

interface AccountInfo {
  name: string;
  institution: string;
  mask: string | null;
  nickname: string | null;
}

interface TransactionTableProps {
  paginatedTransactions: Transaction[];
  transactions: Transaction[];
  showSkeletons: boolean;
  isFetching: boolean;
  selectedTransactionIds: Set<string>;
  accountLookup: Map<string, AccountInfo>;
  categories: Category[] | undefined;
  currentPage: number;
  totalPages: number;
  onSelectAll: () => void;
  onSelectTransaction: (transactionId: string, index: number, event: React.ChangeEvent<HTMLInputElement>) => void;
  onRowClick: (transaction: Transaction) => void;
  onPageChange: (page: number) => void;
}

export function TransactionTable({
  paginatedTransactions,
  transactions,
  showSkeletons,
  isFetching,
  selectedTransactionIds,
  accountLookup,
  categories,
  currentPage,
  totalPages,
  onSelectAll,
  onSelectTransaction,
  onRowClick,
  onPageChange,
}: TransactionTableProps) {
  const queryClient = useQueryClient();

  // Inline category editing state — local to this component
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [selectedCategoryValue, setSelectedCategoryValue] = useState<string | null>(null);

  // Flat category options for inline category Select
  const { options: flatCategoryOptions } = useCategoryOptions({
    categories,
    includeUncategorized: true,
  });

  // Update category mutation
  const updateCategoryMutation = useMutation({
    mutationFn: ({ transactionId, categoryId }: { transactionId: string; categoryId: string | null }) =>
      api.updateTransactionCategory(transactionId, categoryId),
    onSuccess: (_data, variables) => {
      notifications.show({
        title: 'Category Updated',
        message: 'Transaction category has been updated',
        color: 'green',
      });
      patchTransactionsInCache(queryClient, [variables.transactionId], { categoryId: variables.categoryId });
      invalidateTransactionCounts(queryClient);
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

  return (
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
                  onChange={onSelectAll}
                />
              </Table.Th>
              <Table.Th>Date</Table.Th>
              <Table.Th>Description</Table.Th>
              <Table.Th>Category</Table.Th>
              <Table.Th>Tags</Table.Th>
              <Table.Th>Account</Table.Th>
              <Table.Th>Amount</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {showSkeletons ? (
              [...Array(8)].map((_, index) => (
                <Table.Tr key={`skeleton-${index}`}>
                  <Table.Td><Skeleton height={20} width={20} /></Table.Td>
                  <Table.Td><Skeleton height={20} width={80} /></Table.Td>
                  <Table.Td><Skeleton height={20} /></Table.Td>
                  <Table.Td><Skeleton height={20} width={120} /></Table.Td>
                  <Table.Td><Skeleton height={20} width={80} /></Table.Td>
                  <Table.Td><Skeleton height={20} width={40} /></Table.Td>
                  <Table.Td><Skeleton height={20} width={80} /></Table.Td>
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
              paginatedTransactions.map((transaction, index) => (
                <Table.Tr
                  key={transaction.id}
                  onClick={() => onRowClick(transaction)}
                  style={{ cursor: 'pointer' }}
                >
                  <Table.Td onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedTransactionIds.has(transaction.id)}
                      onChange={(event) => onSelectTransaction(transaction.id, index, event)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{transaction.date}</Text>
                  </Table.Td>

                  <Table.Td>
                    <Stack gap={2}>
                      <Group gap="xs" wrap="nowrap">
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
                        {transaction.isFlagged && (
                          <Tooltip label="Flagged for discussion" openDelay={500} closeDelay={200}>
                            <IconFlag size={14} style={{ color: 'var(--mantine-color-orange-5)', flexShrink: 0 }} />
                          </Tooltip>
                        )}
                        {transaction.isHidden && (
                          <Tooltip label="Hidden from budgets" openDelay={500} closeDelay={200}>
                            <IconEyeOff size={14} style={{ color: 'var(--mantine-color-gray-5)', flexShrink: 0 }} />
                          </Tooltip>
                        )}
                        {transaction.isSplit && (
                          <Tooltip label="Split transaction" openDelay={500} closeDelay={200}>
                            <IconScissors size={14} style={{ color: 'var(--mantine-color-blue-5)', flexShrink: 0 }} />
                          </Tooltip>
                        )}
                      </Group>
                      {transaction.notes && (
                        <Text size="xs" c="dimmed">{transaction.notes}</Text>
                      )}
                    </Stack>
                  </Table.Td>

                  <Table.Td onClick={(e) => e.stopPropagation()}>
                    {editingCategoryId === transaction.id ? (
                      <Select
                        data={flatCategoryOptions}
                        value={selectedCategoryValue}
                        onChange={(value) => {
                          setSelectedCategoryValue(value);
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
                      if (!accountInfo) {
                        return (
                          <Text size="xs" c="dimmed">{transaction.accountName || 'Unknown'}</Text>
                        );
                      }
                      const displayName = accountInfo.nickname || accountInfo.name;
                      const shortLabel = accountInfo.mask
                        ? `${displayName} ••${accountInfo.mask}`
                        : displayName;
                      return (
                        <Tooltip
                          label={`${displayName} - ${accountInfo.institution}${accountInfo.mask ? ` ••${accountInfo.mask}` : ''}`}
                          openDelay={1000}
                          closeDelay={200}
                        >
                          <Text size="xs" c="dimmed" truncate maw={140}>
                            {shortLabel}
                          </Text>
                        </Tooltip>
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
            onChange={onPageChange}
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
  );
}
