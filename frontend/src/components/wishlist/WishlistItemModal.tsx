import { useEffect } from 'react';
import {
  Stack,
  Group,
  Button,
  TextInput,
  NumberInput,
  Select,
  SegmentedControl,
  Text,
  Alert,
} from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle } from '@tabler/icons-react';
import { ResponsiveModal } from '../ResponsiveModal';
import { api } from '../../lib/api';
import { useCategoryOptions } from '../../hooks/useCategoryOptions';
import { isBudgetableCategory, isIncomeCategoryHierarchical, createCategoryLookup } from '../../../../shared/utils/categoryHelpers';
import type { StoredWishlistItem, CreateWishlistItemDto, UpdateWishlistItemDto } from '../../../../shared/types';

interface WishlistItemModalProps {
  item?: StoredWishlistItem;
  opened: boolean;
  onClose: () => void;
}

interface FormValues {
  name: string;
  estimatedAmount: number | string;
  estimatedMonth: Date | string | null;
  categoryId: string;
  status: 'PENDING' | 'AGREED' | 'REJECTED';
}

/**
 * Extract YYYY-MM from a MonthPickerInput value (Date or ISO string).
 * MonthPickerInput returns strings like '2026-09-01' or Date objects.
 */
function toYearMonth(value: Date | string | null): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}` : null;
  }
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Convert a YYYY-MM string into a Date for MonthPickerInput's initial value.
 * Uses the first of the month to avoid timezone edge cases.
 */
function yearMonthToDate(ym: string): string {
  return `${ym}-01`;
}

export function WishlistItemModal({ item, opened, onClose }: WishlistItemModalProps) {
  const queryClient = useQueryClient();
  const isEdit = item !== undefined;

  // Only load categories when modal is open
  const { categories: allCategories, options: allOptions, isLoading: categoriesLoading } = useCategoryOptions({
    enabled: opened,
    hiddenMode: 'exclude',
  });

  // Filter to spending categories only (server is authoritative; this is UX convenience per D3)
  const spendingOptions = allCategories
    ? (() => {
        const lookup = createCategoryLookup(allCategories);
        const spendingIds = new Set(
          allCategories
            .filter(
              (c) =>
                !c.isIncome &&
                !c.isSavings &&
                isBudgetableCategory(c.id, allCategories) &&
                !isIncomeCategoryHierarchical(c.id, lookup),
            )
            .map((c) => c.id),
        );
        return allOptions.filter((opt) => spendingIds.has(opt.value));
      })()
    : [];

  const form = useForm<FormValues>({
    initialValues: {
      name: '',
      estimatedAmount: '',
      estimatedMonth: null,
      categoryId: '',
      status: 'PENDING',
    },
    validate: {
      name: (v) => (!v.trim() ? 'Name is required' : null),
      estimatedAmount: (v) => {
        const n = Number(v);
        if (!v && v !== 0) return 'Amount is required';
        if (isNaN(n) || n <= 0) return 'Amount must be positive';
        return null;
      },
      estimatedMonth: (v) => (!v ? 'Month is required' : null),
      categoryId: (v) => (!v ? 'Category is required' : null),
    },
  });

  // Sync form values when the item prop changes (edit mode) or modal opens (create mode)
  useEffect(() => {
    if (opened) {
      if (item) {
        form.setValues({
          name: item.name,
          estimatedAmount: item.estimatedAmount,
          estimatedMonth: yearMonthToDate(item.estimatedMonth),
          categoryId: item.categoryId,
          status: item.status,
        });
      } else {
        form.reset();
      }
    }
  // Reset/set on open; form ref is stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, item]);

  const createMutation = useMutation({
    mutationFn: (data: CreateWishlistItemDto) => api.createWishlistItem(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlist'] });
      notifications.show({ title: 'Item added', message: 'Wishlist item created.', color: 'green' });
      onClose();
    },
    onError: (err: Error) => {
      notifications.show({
        title: 'Failed to create item',
        message: err.message || 'An error occurred.',
        color: 'red',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateWishlistItemDto }) =>
      api.updateWishlistItem(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlist'] });
      notifications.show({ title: 'Item updated', message: 'Wishlist item saved.', color: 'green' });
      onClose();
    },
    onError: (err: Error) => {
      notifications.show({
        title: 'Failed to update item',
        message: err.message || 'An error occurred.',
        color: 'red',
      });
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (values: FormValues) => {
    const monthStr = toYearMonth(values.estimatedMonth);
    if (!monthStr) {
      form.setFieldError('estimatedMonth', 'Invalid month');
      return;
    }

    const amount = Number(values.estimatedAmount);

    if (isEdit && item) {
      updateMutation.mutate({
        id: item.id,
        data: {
          name: values.name.trim(),
          estimatedAmount: amount,
          estimatedMonth: monthStr,
          categoryId: values.categoryId,
          status: values.status,
        },
      });
    } else {
      createMutation.mutate({
        name: values.name.trim(),
        estimatedAmount: amount,
        estimatedMonth: monthStr,
        categoryId: values.categoryId,
        status: values.status,
      });
    }
  };

  const title = isEdit ? 'Edit Wishlist Item' : 'Add Wishlist Item';
  const submitLabel = isEdit ? 'Save Changes' : 'Add Item';

  return (
    <ResponsiveModal opened={opened} onClose={onClose} title={title} size="md">
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="sm">
          <TextInput
            label="Item Name"
            placeholder="e.g. New sofa"
            required
            {...form.getInputProps('name')}
          />

          <NumberInput
            label="Estimated Amount"
            placeholder="0.00"
            min={0.01}
            decimalScale={2}
            prefix="$"
            required
            {...form.getInputProps('estimatedAmount')}
          />

          <MonthPickerInput
            label="Estimated Month"
            placeholder="Pick a month"
            required
            {...form.getInputProps('estimatedMonth')}
          />

          {categoriesLoading ? (
            <Text size="sm" c="dimmed">Loading categories…</Text>
          ) : spendingOptions.length === 0 ? (
            <Alert icon={<IconAlertCircle size={16} />} color="yellow">
              No spending categories available. Create a spending category first.
            </Alert>
          ) : (
            <Select
              label="Category"
              placeholder="Select a spending category"
              data={spendingOptions}
              searchable
              required
              {...form.getInputProps('categoryId')}
            />
          )}

          <div>
            <Text size="sm" fw={500} mb={4}>Status</Text>
            <SegmentedControl
              data={[
                { label: 'Pending', value: 'PENDING' },
                { label: 'Agreed', value: 'AGREED' },
                { label: 'Rejected', value: 'REJECTED' },
              ]}
              {...form.getInputProps('status')}
              fullWidth
            />
          </div>

          <Group justify="flex-end" mt="sm">
            <Button variant="subtle" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={isPending}>
              {submitLabel}
            </Button>
          </Group>
        </Stack>
      </form>
    </ResponsiveModal>
  );
}
