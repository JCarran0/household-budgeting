import { InfoWindow } from '@vis.gl/react-google-maps';
import { Button, Group, Stack, Text } from '@mantine/core';
import type { Stop } from '../../../../../shared/types';
import { PlacePhotoThumb } from '../agenda/PlacePhotoThumb';

export interface StopPopupProps {
  stop: Stop;
  dayNumber: number;
  position: { lat: number; lng: number };
  onClose: () => void;
  onViewInItinerary: () => void;
}

/**
 * Pull photo metadata off a Stay/Eat/Play stop for the popup header.
 * Transit stops don't render a popup photo — they have from/to locations
 * rather than a single identity.
 */
function popupPhoto(stop: Stop) {
  if (stop.type === 'transit') return null;
  const loc = stop.location;
  if (!loc || loc.kind !== 'verified' || !loc.photoName) return null;
  return {
    photoName: loc.photoName,
    photoAttribution: loc.photoAttribution ?? null,
    alt: stop.name,
  };
}

function typeIcon(type: Stop['type']): string {
  switch (type) {
    case 'stay':
      return '🛏';
    case 'eat':
      return '🍴';
    case 'play':
      return '🎭';
    case 'transit':
      return '✈';
  }
}

function stopTitle(stop: Stop): string {
  if (stop.type === 'transit') return stop.mode;
  return stop.name;
}

function truncate(s: string, max = 80): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

export function StopPopup({ stop, dayNumber, position, onClose, onViewInItinerary }: StopPopupProps) {
  const time = stop.time;
  const notes = stop.notes?.trim() ?? '';
  const photo = popupPhoto(stop);

  return (
    <InfoWindow position={position} onCloseClick={onClose}>
      <Stack gap={4} style={{ minWidth: 220, padding: 4 }}>
        {photo && (
          <PlacePhotoThumb
            photoName={photo.photoName}
            attribution={photo.photoAttribution}
            size={200}
            height={100}
            alt={photo.alt}
          />
        )}
        <Group gap={6} wrap="nowrap">
          <Text size="sm" fw={700} span aria-hidden="true">
            {typeIcon(stop.type)}
          </Text>
          <Text size="sm" fw={600} style={{ flex: 1 }} truncate>
            {stopTitle(stop)}
          </Text>
          <Text size="xs" c="dimmed">
            Day {dayNumber}
          </Text>
        </Group>
        <Text size="xs" c="dimmed">
          {time ?? '—'}
        </Text>
        {notes && (
          <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>
            {truncate(notes)}
          </Text>
        )}
        <Group justify="flex-end" mt={4}>
          <Button size="xs" variant="light" onClick={onViewInItinerary}>
            View in itinerary
          </Button>
        </Group>
      </Stack>
    </InfoWindow>
  );
}
