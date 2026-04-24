import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Center,
  Container,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import {
  IconAlertCircle,
  IconMapPin,
  IconPlus,
  IconSearch,
} from '@tabler/icons-react';
import { api } from '../lib/api';
import { TripCard } from '../components/trips/TripCard';
import { TripFormModal } from '../components/trips/TripFormModal';
import { DeleteTripModal } from '../components/trips/DeleteTripModal';
import type { TripSummary } from '../../../shared/types';

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

  const {
    data: trips,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['trips', 'summaries', null],
    queryFn: () => api.getTripsSummaries(),
    staleTime: 1000 * 60 * 2, // warm — list view
  });

  const yearOptions = useMemo(() => {
    if (!trips || trips.length === 0) return [];
    const years = Array.from(
      new Set(trips.map((t) => new Date(t.startDate).getFullYear())),
    ).sort((a, b) => b - a);
    return years.map((y) => ({ value: String(y), label: String(y) }));
  }, [trips]);

  const filteredTrips = useMemo(() => {
    if (!trips) return [];

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

        {isLoading && (
          <Center py="xl">
            <Loader />
          </Center>
        )}

        {error && !isLoading && (
          <Alert
            icon={<IconAlertCircle size="1rem" />}
            title="Failed to load trips"
            color="red"
          >
            Unable to fetch trip data. Please refresh and try again.
          </Alert>
        )}

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

        {!isLoading && !error && filteredTrips.length > 0 && (
          <Stack gap="sm">
            {filteredTrips.map((trip) => (
              <TripCard
                key={trip.id}
                trip={trip}
                onEdit={handleOpenEdit}
                onDelete={handleOpenDelete}
              />
            ))}
          </Stack>
        )}
      </Stack>

      <TripFormModal
        opened={formModalOpened}
        onClose={handleFormClose}
        trip={editingTrip}
      />

      <DeleteTripModal
        opened={deleteModalOpened}
        onClose={handleDeleteClose}
        trip={deletingTrip}
      />
    </Container>
  );
}
