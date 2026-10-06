import { useEffect } from 'react';
import {
  Stack,
  Group,
  Button,
  TextInput,
  NumberInput,
  Select,
  SegmentedControl,
  Textarea,
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
import { WishlistUrlsInput } from './WishlistUrlsInput';
import { WishlistImageField } from './WishlistImageField';
import { useWishlistImageDraft } from './useWishlistImageDraft';
import { validateUrl } from './wishlistUrls';
import { isBudgetableCategory, isIncomeCategoryHierarchical, createCategoryLookup } from '../../../../shared/utils/categoryHelpers';
import type { StoredWishlistItem, CreateWishlistItemDto, UpdateWishlistItemDto } from '../../../../shared/types';
import { WISHLIST_NOTES_MAX_LENGTH } from '../../../../shared/types';

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
  urls: string[];
  notes: string;
}

/** Drop the blank rows the editor keeps around; those are UI state, not data. */
function cleanUrls(urls: string[]): string[] {
  return urls.map((u) => u.trim()).filter((u) => u.length > 0);
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
  const imageDraft = useWishlistImageDraft(opened, item?.images ?? []);

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
      urls: [],
      notes: '',
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
      urls: (v) => {
        const firstError = cleanUrls(v).map(validateUrl).find((e) => e !== null);
        return firstError ?? null;
      },
      notes: (v) =>
        v.length > WISHLIST_NOTES_MAX_LENGTH
          ? `Note must be ${WISHLIST_NOTES_MAX_LENGTH} characters or fewer`
          : null,
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
          urls: item.urls ?? [],
          notes: item.notes ?? '',
        });
      } else {
        form.reset();
      }
    }
  // Reset/set on open; form ref is stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, item]);

  /**
   * Photo changes apply after the item saves. If they fail, the item is still
   * saved, so the modal closes either way (retrying a create would duplicate
   * the item) and the photo failure is reported on its own.
   */
  async function applyImages(itemId: string): Promise<string | null> {
    try {
      await imageDraft.apply(itemId);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'An error occurred.';
    }
  }

  function finishSave(imageError: string | null, title: string, message: string) {
    queryClient.invalidateQueries({ queryKey: ['wishlist'] });
    if (imageError) {
      notifications.show({
        title: 'Item saved, but the photo was not',
        message: imageError,
        color: 'red',
      });
    } else {
      notifications.show({ title, message, color: 'green' });
    }
    onClose();
  }

  const createMutation = useMutation({
    mutationFn: async (data: CreateWishlistItemDto) => {
      const created = await api.createWishlistItem(data);
      return applyImages(created.id);
    },
    onSuccess: (imageError) => finishSave(imageError, 'Item added', 'Wishlist item created.'),
    onError: (err: Error) => {
      notifications.show({
        title: 'Failed to create item',
        message: err.message || 'An error occurred.',
        color: 'red',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateWishlistItemDto }) => {
      await api.updateWishlistItem(id, data);
      return applyImages(id);
    },
    onSuccess: (imageError) => finishSave(imageError, 'Item updated', 'Wishlist item saved.'),
    onError: (err: Error) => {
      notifications.show({
        title: 'Failed to update item',
        message: err.message || 'An error occurred.',
        color: 'red',
      });
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending || imageDraft.isPreparing;

  const handleSubmit = (values: FormValues) => {
    const monthStr = toYearMonth(values.estimatedMonth);
    if (!monthStr) {
      form.setFieldError('estimatedMonth', 'Invalid month');
      return;
    }

    const amount = Number(values.estimatedAmount);
    const urls = cleanUrls(values.urls);
    // Trimmed so a note of only whitespace clears rather than stores blanks.
    const notes = values.notes.trim();

    if (isEdit && item) {
      updateMutation.mutate({
        id: item.id,
        data: {
          name: values.name.trim(),
          estimatedAmount: amount,
          estimatedMonth: monthStr,
          categoryId: values.categoryId,
          status: values.status,
          urls,
          notes,
        },
      });
    } else {
      createMutation.mutate({
        name: values.name.trim(),
        estimatedAmount: amount,
        estimatedMonth: monthStr,
        categoryId: values.categoryId,
        status: values.status,
        urls,
        notes,
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

          <WishlistImageField draft={imageDraft} itemName={form.values.name} />

          <WishlistUrlsInput
            value={form.values.urls}
            onChange={(next) => form.setFieldValue('urls', next)}
          />

          <Textarea
            label="Note"
            placeholder="Why we want this, which model, sizing…"
            description="Optional"
            autosize
            minRows={2}
            maxRows={6}
            maxLength={WISHLIST_NOTES_MAX_LENGTH}
            {...form.getInputProps('notes')}
          />

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
