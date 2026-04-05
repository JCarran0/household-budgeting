import { useState, useMemo, useEffect } from 'react';
import {
  Container,
  Title,
  Stack,
  Group,
  Button,
  Select,
  TextInput,
  Accordion,
  Text,
  Badge,
  Loader,
  Center,
  Alert,
  ThemeIcon,
  ActionIcon,
  Tooltip,
  Modal,
  NumberInput,
  Textarea,
  Rating,
  Table,
  Paper,
  Code,
  Divider,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { useDisclosure, useClipboard } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import {
  IconPlus,
  IconSearch,
  IconAlertCircle,
  IconEdit,
  IconTrash,
  IconCheck,
  IconX,
  IconMapPin,
  IconCalendar,
  IconCopy,
} from '@tabler/icons-react';
import { format } from 'date-fns';
import { api } from '../lib/api';
import { useCategoryOptions } from '../hooks/useCategoryOptions';
import { formatCurrency } from '../utils/formatters';
import { TransactionPreviewModal } from '../components/transactions/TransactionPreviewModal';
import type { TripSummary, TripCategoryBudget, CreateTripDto, UpdateTripDto } from '../../../shared/types';
import { generateTripTag } from '../../../shared/utils/tripHelpers';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Wide date range used when drilling into trip transactions — the trip tag
 * is the primary filter; dates are intentionally unbounded so we don't miss
 * any transactions tagged to this trip outside the nominal trip dates. */
const WIDE_DATE_RANGE = { startDate: '2020-01-01', endDate: '2030-12-31' };

const STATUS_BADGE_COLOR: Record<TripSummary['status'], string> = {
  upcoming: 'blue',
  active: 'green',
  completed: 'gray',
};

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface TripFormValues {
  name: string;
  startDate: Date | null;
  endDate: Date | null;
  totalBudget: number | string;
  rating: number;
  notes: string;
  categoryBudgets: TripCategoryBudget[];
}

interface DrillDownState {
  categoryId: string | null;
  categoryName: string;
  tripTag: string;
}

// ---------------------------------------------------------------------------
// TripFormModal — create or edit a trip
// ---------------------------------------------------------------------------

interface TripFormModalProps {
  opened: boolean;
  onClose: () => void;
  trip: TripSummary | null; // null = create mode
}

function TripFormModal({ opened, onClose, trip }: TripFormModalProps) {
  const queryClient = useQueryClient();
  const isEdit = trip !== null;

  const { options: categoryOptions, isLoading: categoriesLoading } = useCategoryOptions({
    enabled: opened,
  });

  const form = useForm<TripFormValues>({
    initialValues: {
      name: '',
      startDate: null,
      endDate: null,
      totalBudget: '',
      rating: 0,
      notes: '',
      categoryBudgets: [],
    },
    validate: {
      name: (value) => (value.trim().length === 0 ? 'Name is required' : null),
      startDate: (value) => (value === null ? 'Start date is required' : null),
      endDate: (value, values) => {
        if (value === null) return 'End date is required';
        if (values.startDate && value < values.startDate) {
          return 'End date must be on or after start date';
        }
        return null;
      },
      totalBudget: (value, values) => {
        const categorySum = values.categoryBudgets
          .filter((cb) => cb.categoryId !== '' && cb.amount > 0)
          .reduce((sum, cb) => sum + cb.amount, 0);
        if (categorySum === 0) return null;
        if (value === '' || value === null) {
          return `Total budget is required when category budgets are set (${formatCurrency(categorySum)})`;
        }
        const total = Number(value);
        if (isNaN(total)) return null;
        if (categorySum > total) {
          return `Total budget must be at least ${formatCurrency(categorySum)} (sum of category budgets)`;
        }
        return null;
      },
    },
  });

  // Reset/populate form when modal opens
  useEffect(() => {
    if (!opened) return;
    if (isEdit && trip) {
      const [startYear, startMonth, startDay] = trip.startDate.split('-').map(Number);
      const [endYear, endMonth, endDay] = trip.endDate.split('-').map(Number);
      form.setValues({
        name: trip.name,
        startDate: new Date(startYear, startMonth - 1, startDay),
        endDate: new Date(endYear, endMonth - 1, endDay),
        totalBudget: trip.totalBudget ?? '',
        rating: trip.rating ?? 0,
        notes: trip.notes ?? '',
        categoryBudgets: trip.categoryBudgets ?? [],
      });
    } else {
      form.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, trip]);

  // Derived tag preview
  const tagPreview = useMemo(() => {
    const { name, startDate } = form.values;
    if (!name.trim() || !startDate) return null;
    return generateTripTag(name.trim(), format(startDate, 'yyyy-MM-dd'));
  }, [form.values]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateTripDto) => api.createTrip(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      notifications.show({
        title: 'Trip created',
        message: 'Your trip has been saved.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      onClose();
    },
    onError: () => {
      notifications.show({
        title: 'Failed to create trip',
        message: 'An error occurred. Please try again.',
        color: 'red',
        icon: <IconX size={16} />,
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTripDto }) =>
      api.updateTrip(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      notifications.show({
        title: 'Trip updated',
        message: 'Your changes have been saved.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      onClose();
    },
    onError: () => {
      notifications.show({
        title: 'Failed to update trip',
        message: 'An error occurred. Please try again.',
        color: 'red',
        icon: <IconX size={16} />,
      });
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (values: TripFormValues) => {
    if (!values.startDate || !values.endDate) return;

    const startDateStr = format(values.startDate, 'yyyy-MM-dd');
    const endDateStr = format(values.endDate, 'yyyy-MM-dd');
    const totalBudget =
      values.totalBudget === '' || values.totalBudget === null
        ? null
        : Number(values.totalBudget);
    const rating = values.rating === 0 ? null : values.rating;
    const categoryBudgets = values.categoryBudgets.filter(
      (cb) => cb.categoryId !== '' && cb.amount > 0,
    );

    if (isEdit && trip) {
      updateMutation.mutate({
        id: trip.id,
        data: {
          name: values.name.trim(),
          startDate: startDateStr,
          endDate: endDateStr,
          totalBudget,
          rating,
          notes: values.notes.trim(),
          categoryBudgets,
        },
      });
    } else {
      createMutation.mutate({
        name: values.name.trim(),
        startDate: startDateStr,
        endDate: endDateStr,
        totalBudget,
        rating,
        notes: values.notes.trim(),
        categoryBudgets,
      });
    }
  };

  const addCategoryBudget = () => {
    form.setFieldValue('categoryBudgets', [
      ...form.values.categoryBudgets,
      { categoryId: '', amount: 0 },
    ]);
  };

  const removeCategoryBudget = (index: number) => {
    form.setFieldValue(
      'categoryBudgets',
      form.values.categoryBudgets.filter((_, i) => i !== index),
    );
  };

  const updateCategoryBudget = (
    index: number,
    field: keyof TripCategoryBudget,
    value: string | number,
  ) => {
    const updated = form.values.categoryBudgets.map((cb, i) =>
      i === index ? { ...cb, [field]: value } : cb,
    );
    form.setFieldValue('categoryBudgets', updated);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEdit ? 'Edit Trip' : 'Create Trip'}
      size="lg"
    >
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="sm">
          {/* Name */}
          <TextInput
            label="Trip Name"
            placeholder="Costa Rica 2026"
            required
            {...form.getInputProps('name')}
          />

          {/* Tag preview */}
          {tagPreview && (
            <Text size="sm" c="dimmed">
              Tag: <Code>{tagPreview}</Code>
            </Text>
          )}

          {/* Dates */}
          <Group grow>
            <DatePickerInput
              label="Start Date"
              placeholder="Pick start date"
              required
              valueFormat="MMM D, YYYY"
              {...form.getInputProps('startDate')}
            />
            <DatePickerInput
              label="End Date"
              placeholder="Pick end date"
              required
              valueFormat="MMM D, YYYY"
              minDate={form.values.startDate ?? undefined}
              {...form.getInputProps('endDate')}
            />
          </Group>

          {/* Total budget */}
          <NumberInput
            label="Total Budget"
            placeholder="Optional"
            min={0}
            decimalScale={2}
            prefix="$"
            {...form.getInputProps('totalBudget')}
          />

          {/* Category budgets */}
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" fw={500}>
                Category Budgets
              </Text>
              <Button
                size="xs"
                variant="subtle"
                leftSection={<IconPlus size={12} />}
                onClick={addCategoryBudget}
                disabled={categoriesLoading}
              >
                Add Category
              </Button>
            </Group>

            {form.values.categoryBudgets.map((cb, index) => (
              <Group key={index} gap="xs">
                <Select
                  style={{ flex: 2 }}
                  placeholder="Select category"
                  data={categoryOptions}
                  value={cb.categoryId || null}
                  onChange={(val) =>
                    updateCategoryBudget(index, 'categoryId', val ?? '')
                  }
                  searchable
                  clearable
                />
                <NumberInput
                  style={{ flex: 1 }}
                  placeholder="Amount"
                  min={0}
                  decimalScale={2}
                  prefix="$"
                  value={cb.amount}
                  onChange={(val) =>
                    updateCategoryBudget(index, 'amount', Number(val) || 0)
                  }
                />
                <ActionIcon
                  color="red"
                  variant="subtle"
                  onClick={() => removeCategoryBudget(index)}
                  aria-label="Remove category budget"
                >
                  <IconX size={16} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>

          {/* Rating */}
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Rating
            </Text>
            <Rating
              value={form.values.rating}
              onChange={(val) => form.setFieldValue('rating', val)}
              fractions={1}
            />
          </Stack>

          {/* Notes */}
          <Textarea
            label="Notes"
            placeholder="Travel notes, memories, tips..."
            autosize
            minRows={2}
            maxRows={6}
            {...form.getInputProps('notes')}
          />

          {/* Actions */}
          <Group justify="flex-end" mt="sm">
            <Button variant="subtle" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={isPending}>
              {isEdit ? 'Save Changes' : 'Create Trip'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// DeleteTripModal — confirmation dialog
// ---------------------------------------------------------------------------

interface DeleteTripModalProps {
  opened: boolean;
  onClose: () => void;
  trip: TripSummary | null;
}

function DeleteTripModal({ opened, onClose, trip }: DeleteTripModalProps) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteTrip(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      notifications.show({
        title: 'Trip deleted',
        message: 'The trip has been removed.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      onClose();
    },
    onError: () => {
      notifications.show({
        title: 'Failed to delete trip',
        message: 'An error occurred. Please try again.',
        color: 'red',
        icon: <IconX size={16} />,
      });
    },
  });

  if (!trip) return null;

  return (
    <Modal opened={opened} onClose={onClose} title="Delete Trip" size="sm">
      <Stack gap="md">
        <Text>
          Are you sure you want to delete{' '}
          <Text component="span" fw={600}>
            {trip.name}
          </Text>
          ? This action cannot be undone.
        </Text>
        <Group justify="flex-end">
          <Button
            variant="subtle"
            onClick={onClose}
            disabled={deleteMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            color="red"
            loading={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate(trip.id)}
          >
            Delete
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// TripCard — single accordion item
// ---------------------------------------------------------------------------

interface TripCardProps {
  trip: TripSummary;
  onEdit: (trip: TripSummary) => void;
  onDelete: (trip: TripSummary) => void;
  onCategoryClick: (state: DrillDownState) => void;
}

function TripCard({ trip, onEdit, onDelete, onCategoryClick }: TripCardProps) {
  const formatDateRange = (start: string, end: string): string => {
    try {
      const [sy, sm, sd] = start.split('-').map(Number);
      const [ey, em, ed] = end.split('-').map(Number);
      const startDate = new Date(sy, sm - 1, sd);
      const endDate = new Date(ey, em - 1, ed);

      if (sy === ey) {
        // Same year — omit year on start side
        if (sm === em) {
          // Same month
          return `${format(startDate, 'MMM d')} – ${format(endDate, 'MMM d, yyyy')}`;
        }
        return `${format(startDate, 'MMM d')} – ${format(endDate, 'MMM d, yyyy')}`;
      }
      return `${format(startDate, 'MMM d, yyyy')} – ${format(endDate, 'MMM d, yyyy')}`;
    } catch {
      return `${start} – ${end}`;
    }
  };

  const clipboard = useClipboard({ timeout: 1500 });

  const budgetLabel = trip.totalBudget !== null
    ? `${formatCurrency(trip.totalSpent)} / ${formatCurrency(trip.totalBudget)}`
    : formatCurrency(trip.totalSpent);

  const overBudget =
    trip.totalBudget !== null && trip.totalSpent > trip.totalBudget;

  return (
    <Accordion.Item key={trip.id} value={trip.id}>
      {/* ---- Control (collapsed header) ---- */}
      <Accordion.Control>
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <ThemeIcon variant="light" size="md" color="blue">
              <IconMapPin size={16} />
            </ThemeIcon>
            <Stack gap={0} style={{ minWidth: 0 }}>
              <Group gap="xs" wrap="nowrap">
                <Text fw={600} truncate>
                  {trip.name}
                </Text>
                <Badge
                  size="xs"
                  color={STATUS_BADGE_COLOR[trip.status]}
                  variant="light"
                >
                  {trip.status}
                </Badge>
              </Group>
              <Group gap="xs" c="dimmed">
                <IconCalendar size={12} />
                <Text size="xs">
                  {formatDateRange(trip.startDate, trip.endDate)}
                </Text>
              </Group>
            </Stack>
          </Group>

          <Group gap="sm" wrap="nowrap">
            <Stack gap={0} align="flex-end">
              <Text
                size="sm"
                fw={600}
                c={overBudget ? 'red' : undefined}
              >
                {budgetLabel}
              </Text>
              {trip.rating !== null && (
                <Rating
                  value={trip.rating}
                  readOnly
                  size="xs"
                  fractions={1}
                />
              )}
            </Stack>
          </Group>
        </Group>
      </Accordion.Control>

      {/* ---- Panel (expanded detail) ---- */}
      <Accordion.Panel>
        <Stack gap="md">
          {/* Notes */}
          {trip.notes && (
            <Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }}>
              {trip.notes}
            </Text>
          )}

          {/* Category breakdown */}
          {trip.categorySpending.length > 0 ? (
            <Paper withBorder p="xs">
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Category</Table.Th>
                    <Table.Th ta="right">Spent</Table.Th>
                    <Table.Th ta="right">Budget</Table.Th>
                    <Table.Th ta="right">Variance</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {trip.categorySpending.map((row) => {
                    const variance =
                      row.budgeted !== null
                        ? row.budgeted - row.spent
                        : null;
                    return (
                      <Table.Tr
                        key={row.categoryId}
                        style={{ cursor: 'pointer' }}
                        onClick={() =>
                          onCategoryClick({
                            categoryId: row.categoryId === '__uncategorized__' ? null : row.categoryId,
                            categoryName: row.categoryName,
                            tripTag: trip.tag,
                          })
                        }
                      >
                        <Table.Td>
                          <Text size="sm">{row.categoryName}</Text>
                        </Table.Td>
                        <Table.Td ta="right">
                          <Text size="sm">{formatCurrency(row.spent, true)}</Text>
                        </Table.Td>
                        <Table.Td ta="right">
                          <Text size="sm" c="dimmed">
                            {row.budgeted !== null
                              ? formatCurrency(row.budgeted, true)
                              : '—'}
                          </Text>
                        </Table.Td>
                        <Table.Td ta="right">
                          {variance !== null ? (
                            <Text
                              size="sm"
                              c={variance < 0 ? 'red' : 'green'}
                            >
                              {variance < 0 ? '-' : '+'}
                              {formatCurrency(Math.abs(variance), true)}
                            </Text>
                          ) : (
                            <Text size="sm" c="dimmed">
                              —
                            </Text>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Paper>
          ) : (
            <Text size="sm" c="dimmed">
              No categorized spending found for this trip.
            </Text>
          )}

          <Divider />

          {/* Tag + Edit / Delete actions */}
          <Group gap="xs" justify="flex-end">
            <Tooltip label={clipboard.copied ? 'Copied!' : 'Click to copy tag'}>
              <Code
                style={{ cursor: 'pointer', userSelect: 'none', marginRight: 'auto' }}
                onClick={() => clipboard.copy(trip.tag)}
              >
                <Group gap={4} wrap="nowrap">
                  <IconCopy size={10} />
                  <Text size="xs" span>{trip.tag}</Text>
                </Group>
              </Code>
            </Tooltip>
            <Tooltip label="Edit trip">
              <ActionIcon
                variant="subtle"
                color="blue"
                onClick={() => onEdit(trip)}
                aria-label="Edit trip"
              >
                <IconEdit size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Delete trip">
              <ActionIcon
                variant="subtle"
                color="red"
                onClick={() => onDelete(trip)}
                aria-label="Delete trip"
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Stack>
      </Accordion.Panel>
    </Accordion.Item>
  );
}

// ---------------------------------------------------------------------------
// Trips — main page component
// ---------------------------------------------------------------------------

export function Trips() {
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');

  // Modal state — create/edit
  const [formModalOpened, { open: openFormModal, close: closeFormModal }] =
    useDisclosure(false);
  const [editingTrip, setEditingTrip] = useState<TripSummary | null>(null);

  // Modal state — delete confirmation
  const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] =
    useDisclosure(false);
  const [deletingTrip, setDeletingTrip] = useState<TripSummary | null>(null);

  // Modal state — transaction drill-down
  const [
    previewModalOpened,
    { open: openPreviewModal, close: closePreviewModal },
  ] = useDisclosure(false);
  const [drillDown, setDrillDown] = useState<DrillDownState | null>(null);

  // Fetch all trip summaries (unfiltered by year; we filter client-side)
  const {
    data: trips,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['trips', 'summaries', null],
    queryFn: () => api.getTripsSummaries(),
    staleTime: 1000 * 60 * 5,
  });

  // Derive unique years from trips for the year filter
  const yearOptions = useMemo(() => {
    if (!trips || trips.length === 0) return [];
    const years = Array.from(
      new Set(trips.map((t) => new Date(t.startDate).getFullYear())),
    ).sort((a, b) => b - a);
    return years.map((y) => ({ value: String(y), label: String(y) }));
  }, [trips]);

  // Client-side filtering: year + search
  const filteredTrips = useMemo(() => {
    if (!trips) return [];

    // Sort by most recent startDate first
    const sorted = [...trips].sort(
      (a, b) =>
        new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
    );

    return sorted.filter((trip) => {
      const yearMatch =
        selectedYear === null ||
        new Date(trip.startDate).getFullYear() === Number(selectedYear);

      const searchMatch =
        search.trim() === '' ||
        trip.name.toLowerCase().includes(search.trim().toLowerCase());

      return yearMatch && searchMatch;
    });
  }, [trips, selectedYear, search]);

  // Handlers for actions
  const handleOpenCreate = () => {
    setEditingTrip(null);
    openFormModal();
  };

  const handleOpenEdit = (trip: TripSummary) => {
    setEditingTrip(trip);
    openFormModal();
  };

  const handleOpenDelete = (trip: TripSummary) => {
    setDeletingTrip(trip);
    openDeleteModal();
  };

  const handleCategoryClick = (state: DrillDownState) => {
    setDrillDown(state);
    openPreviewModal();
  };

  const handleFormClose = () => {
    closeFormModal();
    // Delay clearing editingTrip so the modal closing animation doesn't flash
    setTimeout(() => setEditingTrip(null), 300);
  };

  const handleDeleteClose = () => {
    closeDeleteModal();
    setTimeout(() => setDeletingTrip(null), 300);
  };

  return (
    <Container size="lg" py="xl">
      <Stack gap="md">
        {/* Page header */}
        <Group justify="space-between">
          <Group gap="sm">
            <ThemeIcon variant="light" size="lg" color="blue">
              <IconMapPin size={20} />
            </ThemeIcon>
            <Title order={2}>Trips</Title>
          </Group>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={handleOpenCreate}
          >
            Create Trip
          </Button>
        </Group>

        {/* Filter bar */}
        <Group gap="sm">
          <Select
            label="Year"
            placeholder="All years"
            data={yearOptions}
            value={selectedYear}
            onChange={setSelectedYear}
            clearable
            w={140}
          />
          <TextInput
            label="Search"
            placeholder="Search trips..."
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
        </Group>

        {/* Loading state */}
        {isLoading && (
          <Center py="xl">
            <Loader />
          </Center>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <Alert
            icon={<IconAlertCircle size="1rem" />}
            title="Failed to load trips"
            color="red"
          >
            Unable to fetch trip data. Please refresh and try again.
          </Alert>
        )}

        {/* Empty state */}
        {!isLoading && !error && filteredTrips.length === 0 && (
          <Center py="xl">
            <Stack align="center" gap="sm">
              <ThemeIcon size="xl" variant="light" color="gray">
                <IconMapPin size={24} />
              </ThemeIcon>
              <Text c="dimmed" size="lg">
                {trips && trips.length > 0
                  ? 'No trips match your filters'
                  : 'No trips yet'}
              </Text>
              {(!trips || trips.length === 0) && (
                <Text c="dimmed" size="sm" ta="center">
                  Create your first trip to start tracking travel spending.
                </Text>
              )}
              {trips && trips.length > 0 && (
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => {
                    setSelectedYear(null);
                    setSearch('');
                  }}
                >
                  Clear filters
                </Button>
              )}
            </Stack>
          </Center>
        )}

        {/* Trip cards */}
        {!isLoading && !error && filteredTrips.length > 0 && (
          <Accordion variant="separated" radius="md">
            {filteredTrips.map((trip) => (
              <TripCard
                key={trip.id}
                trip={trip}
                onEdit={handleOpenEdit}
                onDelete={handleOpenDelete}
                onCategoryClick={handleCategoryClick}
              />
            ))}
          </Accordion>
        )}
      </Stack>

      {/* Create / Edit modal */}
      <TripFormModal
        opened={formModalOpened}
        onClose={handleFormClose}
        trip={editingTrip}
      />

      {/* Delete confirmation modal */}
      <DeleteTripModal
        opened={deleteModalOpened}
        onClose={handleDeleteClose}
        trip={deletingTrip}
      />

      {/* Transaction drill-down modal */}
      {drillDown && (
        <TransactionPreviewModal
          opened={previewModalOpened}
          onClose={closePreviewModal}
          categoryId={drillDown.categoryId}
          categoryName={drillDown.categoryName}
          dateRange={WIDE_DATE_RANGE}
          tags={[drillDown.tripTag]}
        />
      )}
    </Container>
  );
}
