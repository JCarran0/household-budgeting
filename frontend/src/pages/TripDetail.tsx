import { useState, useMemo } from 'react';
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Center,
  Container,
  Divider,
  Group,
  Loader,
  Rating,
  Stack,
  Tabs,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
  ActionIcon,
  Code,
  Textarea,
} from '@mantine/core';
import { useDisclosure, useClipboard } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconAlertCircle,
  IconArrowLeft,
  IconCalendar,
  IconCopy,
  IconEdit,
  IconMapPin,
  IconPhoto,
  IconTrash,
} from '@tabler/icons-react';
import { format } from 'date-fns';
import { api } from '../lib/api';
import { TripFormModal, DeleteTripModal } from './Trips';
import { TripSpendingBreakdown } from '../components/trips/TripSpendingBreakdown';
import { TransactionPreviewModal } from '../components/transactions/TransactionPreviewModal';
import { Agenda } from '../components/trips/agenda/Agenda';
import { AddStopSheet } from '../components/trips/agenda/AddStopSheet';
import { ItineraryEmptyState } from '../components/trips/agenda/ItineraryEmptyState';
import { TripTemplateModal } from '../components/trips/agenda/TripTemplateModal';
import { TripMap } from '../components/trips/map/TripMap';
import { hasVerifiedCoords } from '../../../shared/utils/tripHelpers';
import type {
  TripDrillDownTarget,
} from '../components/trips/TripSpendingBreakdown';
import type { Stop, TransitMode, TripSummary } from '../../../shared/types';
import { formatCurrency } from '../utils/formatters';

type TabKey = 'itinerary' | 'map' | 'spending' | 'notes';
const VALID_TABS: TabKey[] = ['itinerary', 'map', 'spending', 'notes'];

const STATUS_BADGE_COLOR: Record<TripSummary['status'], string> = {
  upcoming: 'blue',
  active: 'green',
  completed: 'gray',
};

/** Wide range — same pattern as the accordion drilldown on /trips. */
const WIDE_DATE_RANGE = { startDate: '2020-01-01', endDate: '2030-12-31' };

function formatTripDateRange(start: string, end: string): string {
  try {
    const [sy, sm, sd] = start.split('-').map(Number);
    const [ey, em, ed] = end.split('-').map(Number);
    const startDate = new Date(sy, sm - 1, sd);
    const endDate = new Date(ey, em - 1, ed);
    if (sy === ey) {
      return `${format(startDate, 'MMM d')} – ${format(endDate, 'MMM d, yyyy')}`;
    }
    return `${format(startDate, 'MMM d, yyyy')} – ${format(endDate, 'MMM d, yyyy')}`;
  } catch {
    return `${start} – ${end}`;
  }
}

export function TripDetail() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const clipboard = useClipboard({ timeout: 1500 });

  // Parse tab from URL; default to itinerary.
  // Note: the Map tab visibility guard below can force the tab back to
  // itinerary for trips without geocoded stops even if ?tab=map is requested.
  const rawTab = searchParams.get('tab');
  const requestedTab: TabKey = VALID_TABS.includes(rawTab as TabKey)
    ? (rawTab as TabKey)
    : 'itinerary';

  const handleTabChange = (next: string | null) => {
    if (!next || !VALID_TABS.includes(next as TabKey)) return;
    const params = new URLSearchParams(searchParams);
    if (next === 'itinerary') {
      params.delete('tab');
    } else {
      params.set('tab', next);
    }
    setSearchParams(params, { replace: true });
  };

  const { data: trip, isLoading, error } = useQuery({
    queryKey: ['trip', tripId],
    queryFn: () => api.getTripSummary(tripId!),
    enabled: !!tripId,
    staleTime: 1000 * 60 * 5,
  });

  const queryClient = useQueryClient();

  // Drill-down modal (transaction preview)
  const [previewOpened, { open: openPreview, close: closePreview }] = useDisclosure(false);
  const [drillDown, setDrillDown] = useState<TripDrillDownTarget | null>(null);

  // Edit / delete trip modals
  const [editOpened, { open: openEdit, close: closeEdit }] = useDisclosure(false);
  const [deleteOpened, { open: openDelete, close: closeDelete }] = useDisclosure(false);

  // Add / edit stop sheet state
  const [stopSheetOpened, { open: openStopSheet, close: closeStopSheet }] = useDisclosure(false);
  const [stopSheetConfig, setStopSheetConfig] = useState<{
    defaultDate: string;
    initialType?: Stop['type'];
    initialTransitMode?: TransitMode;
    defaultStayNights?: number;
    editingStop?: Stop | null;
  }>({ defaultDate: '' });

  const openAddStop = (defaultDate: string, initialType?: Stop['type']) => {
    setStopSheetConfig({ defaultDate, initialType, editingStop: null });
    openStopSheet();
  };
  const openEditStop = (stop: Stop) => {
    setStopSheetConfig({ defaultDate: stop.date, editingStop: stop });
    openStopSheet();
  };

  // Template modal
  const [templateOpened, { open: openTemplate, close: closeTemplate }] = useDisclosure(false);

  // Delete stop mutation — Phase 7 polish will replace the confirm with a richer modal.
  const deleteStopMutation = useMutation({
    mutationFn: (stopId: string) => api.deleteStop(tripId!, stopId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
      notifications.show({ title: 'Stop deleted', message: '', color: 'green' });
    },
    onError: () => {
      notifications.show({
        title: 'Failed to delete stop',
        message: 'Please try again.',
        color: 'red',
      });
    },
  });

  const confirmDeleteStop = (stop: Stop) => {
    const displayName =
      stop.type === 'transit'
        ? `${stop.mode[0].toUpperCase()}${stop.mode.slice(1)}${
            stop.toLocation?.label ? ` to ${stop.toLocation.label}` : ''
          }`
        : stop.name;
    const [y, m, d] = stop.date.split('-').map(Number);
    const dateLabel = format(new Date(y, m - 1, d), 'MMM d, yyyy');
    modals.openConfirmModal({
      title: 'Delete stop',
      children: (
        <Text size="sm">
          Delete <strong>{displayName}</strong> on {dateLabel}? This can't be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => deleteStopMutation.mutate(stop.id),
    });
  };

  const overBudget = useMemo(() => {
    if (!trip || trip.totalBudget === null) return false;
    return trip.totalSpent > trip.totalBudget;
  }, [trip]);

  // Map tab is visible only when at least one stop has verified coords.
  const hasGeocodedStop = useMemo(() => {
    if (!trip) return false;
    return trip.stops.some(hasVerifiedCoords);
  }, [trip]);

  // If the URL requested the map tab but the trip has no geocoded stops,
  // silently fall back to itinerary.
  const activeTab: TabKey =
    requestedTab === 'map' && !hasGeocodedStop ? 'itinerary' : requestedTab;

  if (isLoading) {
    return (
      <Container size="lg" py="xl">
        <Center py="xl">
          <Loader />
        </Center>
      </Container>
    );
  }

  if (error || !trip) {
    const isNotFound =
      error !== null &&
      typeof error === 'object' &&
      'response' in error &&
      (error as { response?: { status?: number } }).response?.status === 404;
    return (
      <Container size="lg" py="xl">
        <Stack gap="md">
          <Anchor component={Link} to="/trips" size="sm">
            <Group gap={4}>
              <IconArrowLeft size={14} />
              <span>Back to trips</span>
            </Group>
          </Anchor>
          <Alert
            icon={<IconAlertCircle size="1rem" />}
            title={isNotFound ? 'Trip not found' : 'Failed to load trip'}
            color={isNotFound ? 'gray' : 'red'}
          >
            {isNotFound
              ? 'This trip may have been deleted or you may not have access.'
              : 'Something went wrong. Please refresh and try again.'}
          </Alert>
        </Stack>
      </Container>
    );
  }

  const budgetLabel =
    trip.totalBudget !== null
      ? `${formatCurrency(trip.totalSpent)} / ${formatCurrency(trip.totalBudget)}`
      : formatCurrency(trip.totalSpent);

  return (
    <Container size="lg" py="xl">
      <Stack gap="md">
        {/* Back link */}
        <Anchor component={Link} to="/trips" size="sm" c="dimmed">
          <Group gap={4}>
            <IconArrowLeft size={14} />
            <span>Back to trips</span>
          </Group>
        </Anchor>

        {/* Header */}
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            <ThemeIcon variant="light" size="lg" color="blue">
              <IconMapPin size={20} />
            </ThemeIcon>
            <Stack gap={4} style={{ minWidth: 0 }}>
              <Group gap="sm" wrap="nowrap">
                <Title order={2} style={{ margin: 0 }}>
                  {trip.name}
                </Title>
                <Badge color={STATUS_BADGE_COLOR[trip.status]} variant="light">
                  {trip.status}
                </Badge>
              </Group>
              <Group gap="xs" c="dimmed" wrap="nowrap">
                <IconCalendar size={14} />
                <Text size="sm">
                  {formatTripDateRange(trip.startDate, trip.endDate)}
                </Text>
              </Group>
              {trip.rating !== null && (
                <Rating value={trip.rating} readOnly size="sm" fractions={1} />
              )}
            </Stack>
          </Group>

          <Stack gap={4} align="flex-end">
            <Text size="lg" fw={600} c={overBudget ? 'red' : undefined}>
              {budgetLabel}
            </Text>
            <Group gap="xs">
              <Tooltip label={clipboard.copied ? 'Copied!' : 'Copy tag'}>
                <Code
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => clipboard.copy(trip.tag)}
                >
                  <Group gap={4} wrap="nowrap">
                    <IconCopy size={10} />
                    <Text size="xs" span>
                      {trip.tag}
                    </Text>
                  </Group>
                </Code>
              </Tooltip>
              {trip.photoAlbumUrl && (
                <Tooltip label="Open photo album">
                  <Button
                    component="a"
                    href={trip.photoAlbumUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    leftSection={<IconPhoto size={14} />}
                    variant="light"
                    size="xs"
                  >
                    Open album
                  </Button>
                </Tooltip>
              )}
              <Tooltip label="Edit trip">
                <ActionIcon
                  variant="subtle"
                  color="blue"
                  onClick={openEdit}
                  aria-label="Edit trip"
                >
                  <IconEdit size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Delete trip">
                <ActionIcon
                  variant="subtle"
                  color="red"
                  onClick={openDelete}
                  aria-label="Delete trip"
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Stack>
        </Group>

        <Divider />

        {/* Tabs */}
        <Tabs value={activeTab} onChange={handleTabChange} keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab value="itinerary">Itinerary</Tabs.Tab>
            {hasGeocodedStop && <Tabs.Tab value="map">Map</Tabs.Tab>}
            <Tabs.Tab value="spending">Spending</Tabs.Tab>
            <Tabs.Tab value="notes">Notes</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="itinerary" pt="md">
            {trip.stops.length === 0 ? (
              <ItineraryEmptyState
                onAddStay={() => {
                  setStopSheetConfig({
                    defaultDate: trip.startDate,
                    initialType: 'stay',
                    editingStop: null,
                  });
                  openStopSheet();
                }}
                onFlyFirst={() => {
                  setStopSheetConfig({
                    defaultDate: trip.startDate,
                    initialType: 'transit',
                    initialTransitMode: 'flight',
                    editingStop: null,
                  });
                  openStopSheet();
                }}
                onUseTemplate={openTemplate}
              />
            ) : (
              <Agenda
                trip={trip}
                onAddStop={(date, initialType) => openAddStop(date, initialType)}
                onEditStop={openEditStop}
                onDeleteStop={confirmDeleteStop}
              />
            )}
          </Tabs.Panel>

          {hasGeocodedStop && (
            <Tabs.Panel value="map" pt="md">
              <TripMap trip={trip} stops={trip.stops} />
            </Tabs.Panel>
          )}

          <Tabs.Panel value="spending" pt="md">
            <TripSpendingBreakdown
              trip={trip}
              onCategoryClick={(target) => {
                setDrillDown(target);
                openPreview();
              }}
            />
          </Tabs.Panel>

          <Tabs.Panel value="notes" pt="md">
            {trip.notes ? (
              <Textarea
                value={trip.notes}
                readOnly
                autosize
                minRows={4}
                maxRows={20}
                styles={{ input: { fontStyle: 'italic' } }}
              />
            ) : (
              <Center py="xl">
                <Stack align="center" gap="xs">
                  <Text c="dimmed">No notes yet.</Text>
                  <Button variant="subtle" size="xs" onClick={openEdit}>
                    Add notes
                  </Button>
                </Stack>
              </Center>
            )}
          </Tabs.Panel>
        </Tabs>
      </Stack>

      {/* Edit / delete modals — reused from the Trips list */}
      <TripFormModal opened={editOpened} onClose={closeEdit} trip={trip} />
      <DeleteTripModal
        opened={deleteOpened}
        onClose={closeDelete}
        trip={trip}
        onDeleted={() => navigate('/trips')}
      />

      {/* Transaction drill-down modal */}
      {drillDown && (
        <TransactionPreviewModal
          opened={previewOpened}
          onClose={closePreview}
          categoryId={drillDown.categoryId}
          categoryName={drillDown.categoryName}
          dateRange={WIDE_DATE_RANGE}
          tags={[drillDown.tripTag]}
        />
      )}

      {/* Add / edit stop sheet */}
      {tripId && (
        <AddStopSheet
          opened={stopSheetOpened}
          onClose={closeStopSheet}
          tripId={tripId}
          defaultDate={stopSheetConfig.defaultDate || trip.startDate}
          initialType={stopSheetConfig.initialType}
          initialTransitMode={stopSheetConfig.initialTransitMode}
          defaultStayNights={stopSheetConfig.defaultStayNights}
          editingStop={stopSheetConfig.editingStop ?? null}
          tripStops={trip.stops}
        />
      )}

      {/* Template picker — pre-fills the Stay form with template defaults */}
      <TripTemplateModal
        opened={templateOpened}
        onClose={closeTemplate}
        tripStartDate={trip.startDate}
        tripEndDate={trip.endDate}
        onApply={(defaults) => {
          setStopSheetConfig({
            defaultDate: defaults.defaultDate,
            initialType: 'stay',
            defaultStayNights: defaults.defaultNights,
            editingStop: null,
          });
          openStopSheet();
        }}
      />
    </Container>
  );
}
