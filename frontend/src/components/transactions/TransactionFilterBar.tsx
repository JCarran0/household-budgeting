import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import {
  Stack,
  Group,
  Text,
  TextInput,
  Select,
  MultiSelect,
  Button,
  Paper,
  NumberInput,
  Checkbox,
  Skeleton,
  Box,
  Grid,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import {
  IconSearch,
  IconCalendar,
  IconFilterOff,
  IconRefresh,
} from '@tabler/icons-react';
import { parseDateFromStorage } from '../../stores/filterStore';
import { formatCurrency } from '../../utils/formatters';

type DateFilterOption = 'this-month' | 'last-month' | 'ytd' | 'last3' | 'last6' | 'last12' | 'all' | 'custom' | string;

interface AccountOption {
  value: string;
  label: string;
}

interface TransactionFilterBarProps {
  // Search
  searchInput: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;

  // Date filter
  dateFilterOption: DateFilterOption;
  customDateRange: [Date | null, Date | null];
  onDateFilterChange: (value: DateFilterOption) => void;
  onCustomDateRangeChange: (range: [Date | null, Date | null]) => void;

  // Account filter
  selectedAccount: string;
  accountOptions: AccountOption[];
  onAccountChange: (value: string) => void;

  // Category filter
  selectedCategories: string[];
  categoryOptions: unknown[];
  onCategoryChange: (values: string[]) => void;

  // Tag filter
  selectedTags: string[];
  availableTags: string[];
  onTagChange: (values: string[]) => void;

  // Transaction type filter
  transactionType: string;
  onTransactionTypeChange: (value: 'all' | 'income' | 'expense' | 'transfer') => void;

  // Amount filter
  amountSearchMode: 'any' | 'less-than' | 'greater-than' | 'between';
  amountRange: { min: number | null; max: number | null };
  onAmountModeChange: (mode: 'any' | 'less-than' | 'greater-than' | 'between') => void;
  onAmountRangeChange: (range: { min: number | null; max: number | null }) => void;

  // Toggles
  includeHidden: boolean;
  onlyFlagged: boolean;
  onIncludeHiddenChange: (value: boolean) => void;
  onOnlyFlaggedChange: (value: boolean) => void;

  // Summary
  showSkeletons: boolean;
  paginatedCount: number;
  totalCount: number;
  currentPage: number;
  totalPages: number;
  filteredTotal: number;

  // Actions
  isFetching: boolean;
  onResetFilters: () => void;
  onRefetch: () => void;
}

export function TransactionFilterBar({
  searchInput,
  onSearchChange,
  dateFilterOption,
  customDateRange,
  onDateFilterChange,
  onCustomDateRangeChange,
  selectedAccount,
  accountOptions,
  onAccountChange,
  selectedCategories,
  categoryOptions,
  onCategoryChange,
  selectedTags,
  availableTags,
  onTagChange,
  transactionType,
  onTransactionTypeChange,
  amountSearchMode,
  amountRange,
  onAmountModeChange,
  onAmountRangeChange,
  includeHidden,
  onlyFlagged,
  onIncludeHiddenChange,
  onOnlyFlaggedChange,
  showSkeletons,
  paginatedCount,
  totalCount,
  currentPage,
  totalPages,
  filteredTotal,
  isFetching,
  onResetFilters,
  onRefetch,
}: TransactionFilterBarProps) {
  const categoryMultiSelectRef = useRef<HTMLDivElement>(null);
  const tagMultiSelectRef = useRef<HTMLDivElement>(null);

  // Add title attributes to MultiSelect pills so truncated text shows full name on hover
  useEffect(() => {
    for (const ref of [categoryMultiSelectRef, tagMultiSelectRef]) {
      if (!ref.current) continue;
      ref.current.querySelectorAll<HTMLElement>('.mantine-Pill-label').forEach((label) => {
        label.title = label.textContent || '';
      });
    }
  }, [selectedCategories, selectedTags]);

  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const [tempCustomDateRange, setTempCustomDateRange] = useState<[string | null, string | null]>([null, null]);

  // Initialize temp date range when custom picker opens
  useEffect(() => {
    if (showCustomDatePicker) {
      setTempCustomDateRange([
        customDateRange[0] ? format(customDateRange[0], 'yyyy-MM-dd') : null,
        customDateRange[1] ? format(customDateRange[1], 'yyyy-MM-dd') : null,
      ]);
    }
  }, [showCustomDatePicker, customDateRange]);

  const handleDateSelectChange = (value: string | null) => {
    if (value === 'custom') {
      onDateFilterChange('custom');
      setShowCustomDatePicker(true);
    } else if (value) {
      onDateFilterChange(value as DateFilterOption);
      setShowCustomDatePicker(false);
    }
  };

  const handleAmountModeChange = (value: string | null) => {
    const mode = (value || 'any') as 'any' | 'less-than' | 'greater-than' | 'between';
    onAmountModeChange(mode);
    onAmountRangeChange({ min: null, max: null });
  };

  const handleResetFilters = () => {
    onResetFilters();
    notifications.show({
      title: 'Filters Reset',
      message: 'All filters have been reset to defaults',
      color: 'blue',
    });
  };

  return (
    <Paper p="md" withBorder>
      <Stack gap="md">
        {/* Row 1: Search - full width */}
        <TextInput
          placeholder="Search transactions..."
          leftSection={<IconSearch size={16} />}
          value={searchInput}
          onChange={onSearchChange}
        />

        {/* Row 2: Date Range, Account, Categories, Tags, Transaction Type, Amount */}
        <Grid>
          <Grid.Col span={{ base: 12, sm: 6, md: 4, lg: 2 }}>
            <Select
              placeholder="All Time"
              value={dateFilterOption}
              onChange={handleDateSelectChange}
              data={[
                { value: 'all', label: 'All Time' },
                { value: 'this-month', label: 'This Month' },
                { value: 'last-month', label: 'Last Month' },
                { value: 'last3', label: 'Last 3 Months' },
                { value: 'last6', label: 'Last 6 Months' },
                { value: 'last12', label: 'Last 12 Months' },
                { value: 'ytd', label: 'Year to Date' },
                { value: 'custom', label: 'Custom Range' },
              ]}
            />
          </Grid.Col>

          <Grid.Col span={{ base: 12, sm: 6, md: 4, lg: 2 }}>
            <Select
              placeholder="All Accounts"
              data={accountOptions}
              value={selectedAccount}
              onChange={(value) => onAccountChange(value || 'all')}
              clearable={false}
            />
          </Grid.Col>

          <Grid.Col span={{ base: 12, sm: 6, md: 4, lg: 2 }}>
            <div ref={categoryMultiSelectRef}>
              <MultiSelect
                placeholder="All Categories"
                data={categoryOptions as { value: string; label: string }[]}
                value={selectedCategories}
                onChange={onCategoryChange}
                clearable
                searchable
              />
            </div>
          </Grid.Col>

          <Grid.Col span={{ base: 12, sm: 6, md: 4, lg: 2 }}>
            <div ref={tagMultiSelectRef}>
              <MultiSelect
                placeholder="All Tags"
                data={availableTags}
                value={selectedTags}
                onChange={onTagChange}
                clearable
                searchable
              />
            </div>
          </Grid.Col>

          <Grid.Col span={{ base: 12, sm: 6, md: 4, lg: 2 }}>
            <Select
              placeholder="All Types"
              value={transactionType}
              onChange={(value) => onTransactionTypeChange((value || 'all') as 'all' | 'income' | 'expense' | 'transfer')}
              data={[
                { value: 'all', label: 'All Types' },
                { value: 'income', label: 'Income' },
                { value: 'expense', label: 'Expenses' },
                { value: 'transfer', label: 'Transfers' },
              ]}
              clearable={false}
            />
          </Grid.Col>

          <Grid.Col span={{ base: 12, sm: 6, md: 4, lg: 2 }}>
            <Select
              placeholder="Any Amount"
              value={amountSearchMode}
              onChange={handleAmountModeChange}
              data={[
                { value: 'any', label: 'Any Amount' },
                { value: 'less-than', label: 'Less than' },
                { value: 'greater-than', label: 'Greater than' },
                { value: 'between', label: 'Between' },
              ]}
              clearable={false}
            />
          </Grid.Col>
        </Grid>

        {/* Row 3 (conditional): Custom date picker OR Amount inputs */}
        {(dateFilterOption === 'custom' || showCustomDatePicker) && (
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
                        onCustomDateRangeChange([startDate, endDate]);
                        onDateFilterChange('custom');
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
        )}

        {amountSearchMode === 'less-than' && (
          <NumberInput
            label="Less than"
            placeholder="0.00"
            prefix="$"
            value={amountRange.max ?? undefined}
            onChange={(value) => onAmountRangeChange({ min: null, max: value !== undefined && value !== '' ? Number(value) : null })}
            decimalScale={2}
            fixedDecimalScale
            w={200}
          />
        )}

        {amountSearchMode === 'greater-than' && (
          <NumberInput
            label="Greater than"
            placeholder="0.00"
            prefix="$"
            value={amountRange.min ?? undefined}
            onChange={(value) => onAmountRangeChange({ min: value !== undefined && value !== '' ? Number(value) : null, max: null })}
            decimalScale={2}
            fixedDecimalScale
            w={200}
          />
        )}

        {amountSearchMode === 'between' && (
          <Group grow>
            <NumberInput
              label="Min Amount"
              placeholder="0.00"
              prefix="$"
              value={amountRange.min ?? undefined}
              onChange={(value) => onAmountRangeChange({ ...amountRange, min: value !== undefined && value !== '' ? Number(value) : null })}
              decimalScale={2}
              fixedDecimalScale
            />
            <NumberInput
              label="Max Amount"
              placeholder="0.00"
              prefix="$"
              value={amountRange.max ?? undefined}
              onChange={(value) => onAmountRangeChange({ ...amountRange, max: value !== undefined && value !== '' ? Number(value) : null })}
              decimalScale={2}
              fixedDecimalScale
            />
          </Group>
        )}

        {/* Row 4: Checkboxes */}
        <Group gap="lg">
          <Checkbox
            label="Include hidden transactions"
            checked={includeHidden}
            onChange={(e) => onIncludeHiddenChange(e.currentTarget.checked)}
          />
          <Checkbox
            label="Only flagged"
            checked={onlyFlagged}
            onChange={(e) => onOnlyFlaggedChange(e.currentTarget.checked)}
          />
        </Group>

        {/* Row 5: Summary and actions */}
        <Group justify="space-between">
          {showSkeletons ? (
            <Skeleton height={16} width={200} />
          ) : (
            <Stack gap={4}>
              <Text size="sm" c="dimmed">
                Showing {paginatedCount} of {totalCount} transactions (Page {currentPage}/{totalPages})
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
              onClick={handleResetFilters}
            >
              Reset Filters
            </Button>
            <Button
              variant="subtle"
              size="sm"
              onClick={onRefetch}
              loading={isFetching}
              leftSection={!isFetching && <IconRefresh size={14} />}
            >
              {isFetching ? 'Refreshing...' : 'Refresh'}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Paper>
  );
}
