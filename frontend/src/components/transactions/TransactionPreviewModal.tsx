import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  Modal, 
  Text, 
  Table, 
  Group, 
  Button, 
  Stack, 
  Skeleton, 
  Center, 
  ScrollArea,
  Divider,
  Alert,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import { 
  IconEye, 
  IconCalendar, 
  IconAlertCircle,
  IconArrowRight,
  IconArrowUpRight,
  IconArrowDownRight,
} from '@tabler/icons-react';
import { format } from 'date-fns';
import { api } from '../../lib/api';
import type { Transaction } from '../../../../shared/types';

interface TransactionPreviewModalProps {
  opened: boolean;
  onClose: () => void;
  categoryId: string | null; // null for "Uncategorized"
  categoryName: string;
  dateRange: { startDate: string; endDate: string };
  limit?: number; // default 25
  timeRangeFilter?: string; // Reports page time range filter (e.g., 'thisMonth', 'yearToDate')
}

export function TransactionPreviewModal({
  opened,
  onClose,
  categoryId,
  categoryName,
  dateRange,
  limit = 25,
  timeRangeFilter,
}: TransactionPreviewModalProps) {
  const navigate = useNavigate();

  // Fetch transaction preview data
  const { data: transactionData, isLoading, error } = useQuery({
    queryKey: ['transaction-preview', categoryId, dateRange.startDate, dateRange.endDate, limit],
    queryFn: () => api.getTransactions({
      categoryIds: categoryId ? [categoryId] : undefined,
      onlyUncategorized: categoryId === null,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      limit: limit,
      offset: 0,
    }),
    enabled: opened && categoryId !== undefined, // Only fetch when modal is open and categoryId is defined
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const transactions = useMemo(() => 
    transactionData?.transactions || [], 
    [transactionData]
  );
  
  const totalCount = useMemo(() => 
    transactionData?.total || 0, 
    [transactionData]
  );

  // Calculate total amount for displayed transactions
  const displayedTotal = useMemo(() => {
    return transactions.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  }, [transactions]);

  // Navigate to transactions page with filters applied
  const navigateToTransactionsWithFilter = () => {
    const params = new URLSearchParams();
    if (categoryId) {
      params.set('categoryIds', categoryId);
    } else {
      params.set('onlyUncategorized', 'true');
    }
    params.set('startDate', dateRange.startDate);
    params.set('endDate', dateRange.endDate);
    
    // Include the time range filter from reports page if provided
    if (timeRangeFilter) {
      params.set('timeRangeFilter', timeRangeFilter);
    }
    
    navigate(`/transactions?${params.toString()}`);
    onClose();
  };

  // Format date for display
  const formatDisplayDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM dd');
    } catch {
      return dateString;
    }
  };

  // Format date range for header
  const formatDateRange = () => {
    try {
      const start = new Date(dateRange.startDate);
      const end = new Date(dateRange.endDate);
      
      if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
        // Same month
        return format(start, 'MMMM yyyy');
      } else if (start.getFullYear() === end.getFullYear()) {
        // Same year, different months
        return `${format(start, 'MMM')} - ${format(end, 'MMM yyyy')}`;
      } else {
        // Different years
        return `${format(start, 'MMM yyyy')} - ${format(end, 'MMM yyyy')}`;
      }
    } catch {
      return `${dateRange.startDate} - ${dateRange.endDate}`;
    }
  };

  // Truncate description with tooltip
  const TruncatedDescription = ({ transaction }: { transaction: Transaction }) => {
    const description = transaction.userDescription || transaction.merchantName || transaction.name;
    const maxLength = 40;
    
    if (description.length <= maxLength) {
      return <Text size="sm">{description}</Text>;
    }

    return (
      <Tooltip label={description} multiline maw={300}>
        <Text size="sm" truncate maw={250}>
          {description}
        </Text>
      </Tooltip>
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      title={
        <Group gap="xs">
          <ThemeIcon variant="light" size="sm">
            <IconEye size={14} />
          </ThemeIcon>
          <Text fw={600}>Transaction Preview</Text>
        </Group>
      }
      scrollAreaComponent={ScrollArea.Autosize}
    >
      <Stack gap="md">
        {/* Header with category name and date range */}
        <Group justify="space-between">
          <div>
            <Text size="lg" fw={600}>{categoryName}</Text>
            <Group gap="xs" c="dimmed">
              <IconCalendar size={14} />
              <Text size="sm">{formatDateRange()}</Text>
            </Group>
          </div>
        </Group>

        <Divider />

        {/* Loading state */}
        {isLoading && (
          <Stack gap="xs">
            <Skeleton height={30} />
            {[...Array(5)].map((_, index) => (
              <Group key={index} justify="space-between">
                <Skeleton height={20} width="40%" />
                <Skeleton height={20} width="60%" />
                <Skeleton height={20} width="20%" />
              </Group>
            ))}
          </Stack>
        )}

        {/* Error state */}
        {error && (
          <Alert
            icon={<IconAlertCircle size="1rem" />}
            title="Failed to load transactions"
            color="red"
          >
            <Text size="sm">Unable to fetch transaction data. Please try again.</Text>
            <Button
              size="xs"
              variant="light"
              mt="sm"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </Alert>
        )}

        {/* Data loaded successfully */}
        {!isLoading && !error && (
          <>
            {/* Summary */}
            {transactions.length > 0 && (
              <Group justify="space-between" p="xs" style={{ backgroundColor: 'var(--mantine-color-gray-1)', borderRadius: 'var(--mantine-radius-sm)' }}>
                <Text size="sm" c="dimmed">
                  Showing {transactions.length} of {totalCount} transactions
                </Text>
                <Text size="sm" fw={600}>
                  Total: ${displayedTotal.toFixed(2)}
                </Text>
              </Group>
            )}

            {/* Transactions table */}
            {transactions.length === 0 ? (
              <Center py="xl">
                <Stack align="center" gap="sm">
                  <ThemeIcon size="xl" variant="light" color="gray">
                    <IconAlertCircle size={24} />
                  </ThemeIcon>
                  <Text c="dimmed" size="lg">No transactions found</Text>
                  <Text c="dimmed" size="sm" ta="center">
                    No transactions match the selected category and date range.
                  </Text>
                </Stack>
              </Center>
            ) : (
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Date</Table.Th>
                    <Table.Th>Description</Table.Th>
                    <Table.Th>Amount</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {transactions.map((transaction) => (
                    <Table.Tr key={transaction.id}>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {formatDisplayDate(transaction.date)}
                        </Text>
                      </Table.Td>
                      
                      <Table.Td>
                        <TruncatedDescription transaction={transaction} />
                        {transaction.notes && (
                          <Text size="xs" c="dimmed" mt={2}>
                            {transaction.notes}
                          </Text>
                        )}
                      </Table.Td>
                      
                      <Table.Td>
                        <Group gap={4}>
                          <ThemeIcon
                            size="sm"
                            variant="light"
                            color={transaction.amount > 0 ? 'red' : 'green'}
                          >
                            {transaction.amount > 0 ? (
                              <IconArrowDownRight size={12} />
                            ) : (
                              <IconArrowUpRight size={12} />
                            )}
                          </ThemeIcon>
                          <Text 
                            size="sm" 
                            fw={500} 
                            c={transaction.amount > 0 ? 'red' : 'green'}
                          >
                            ${Math.abs(transaction.amount).toFixed(2)}
                          </Text>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}

            {/* Footer button */}
            {transactions.length > 0 && (
              <>
                <Divider />
                <Group justify="center">
                  <Button
                    variant="light"
                    leftSection={<IconArrowRight size={16} />}
                    onClick={navigateToTransactionsWithFilter}
                    size="md"
                  >
                    View Transactions
                  </Button>
                </Group>
              </>
            )}
          </>
        )}
      </Stack>
    </Modal>
  );
}