import { Link } from 'react-router-dom';
import {
  ActionIcon,
  Badge,
  Group,
  Paper,
  Rating,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import {
  IconCalendar,
  IconEdit,
  IconMapPin,
  IconTrash,
} from '@tabler/icons-react';
import { TripCoverBanner } from './TripCoverBanner';
import { formatTripDateRange, STATUS_BADGE_COLOR } from './tripCardHelpers';
import { formatCurrency } from '../../utils/formatters';
import type { TripSummary } from '../../../../shared/types';
import { getStopPhoto, resolveCoverStop } from '../../../../shared/utils/tripHelpers';

export interface TripCardProps {
  trip: TripSummary;
  onEdit: (trip: TripSummary) => void;
  onDelete: (trip: TripSummary) => void;
}

export function TripCard({ trip, onEdit, onDelete }: TripCardProps) {
  const budgetLabel = trip.totalBudget !== null
    ? `${formatCurrency(trip.totalSpent)} / ${formatCurrency(trip.totalBudget)}`
    : formatCurrency(trip.totalSpent);

  const overBudget =
    trip.totalBudget !== null && trip.totalSpent > trip.totalBudget;

  const stopNav = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };

  const coverStop = resolveCoverStop(trip);
  const coverPhoto = coverStop ? getStopPhoto(coverStop) : null;

  if (coverPhoto) {
    return (
      <Paper
        component={Link}
        to={`/trips/${trip.id}`}
        withBorder
        radius="md"
        p={0}
        style={{
          display: 'block',
          textDecoration: 'none',
          color: 'inherit',
          overflow: 'hidden',
        }}
      >
        <TripCoverBanner
          photoName={coverPhoto.photoName}
          attribution={coverPhoto.attribution}
          title={trip.name}
          dateRange={formatTripDateRange(trip.startDate, trip.endDate)}
          statusLabel={trip.status}
          statusColor={STATUS_BADGE_COLOR[trip.status]}
          compact
          actions={
            <Group gap={2} wrap="nowrap">
              <ActionIcon
                variant="transparent"
                c="white"
                onClick={stopNav(() => onEdit(trip))}
                aria-label="Edit trip"
              >
                <IconEdit size={16} />
              </ActionIcon>
              <ActionIcon
                variant="transparent"
                c="white"
                onClick={stopNav(() => onDelete(trip))}
                aria-label="Delete trip"
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          }
        />
        <Group justify="space-between" wrap="nowrap" px="md" py="xs">
          <Text size="sm" fw={600} c={overBudget ? 'red' : undefined}>
            {budgetLabel}
          </Text>
          {trip.rating !== null && (
            <Rating value={trip.rating} readOnly size="xs" fractions={1} />
          )}
        </Group>
      </Paper>
    );
  }

  return (
    <Paper
      component={Link}
      to={`/trips/${trip.id}`}
      withBorder
      radius="md"
      p="md"
      style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
    >
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
                {formatTripDateRange(trip.startDate, trip.endDate)}
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

          <Tooltip label="Edit trip">
            <ActionIcon
              variant="subtle"
              color="blue"
              onClick={stopNav(() => onEdit(trip))}
              aria-label="Edit trip"
            >
              <IconEdit size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Delete trip">
            <ActionIcon
              variant="subtle"
              color="red"
              onClick={stopNav(() => onDelete(trip))}
              aria-label="Delete trip"
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
    </Paper>
  );
}
