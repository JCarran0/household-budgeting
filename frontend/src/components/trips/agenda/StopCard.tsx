import { ActionIcon, Group, Image, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { useDisclosure, useHover, useMediaQuery } from '@mantine/hooks';
import {
  IconEdit,
  IconTrash,
  IconGripVertical,
} from '@tabler/icons-react';
import type { HTMLAttributes, KeyboardEvent, MouseEvent } from 'react';
import type { Stop, StopLocation, TransitMode } from '../../../../../shared/types';
import { ResponsiveModal } from '../../ResponsiveModal';
import { stopIcon } from './stopIcons';

interface StopPhotoInfo {
  photoName: string;
  photoAttribution?: string;
  alt: string;
}

/**
 * Return the photo metadata for a stop whose location has one, or null.
 * Transit stops never render a photo — endpoints belong to the bracketing
 * stays, not the transit card. Stay stops fall back to the icon too: the
 * Stay banner (StayBanner.tsx) is where the stay's thumbnail renders.
 */
function stopPhotoInfo(stop: Stop): StopPhotoInfo | null {
  if (stop.type === 'transit' || stop.type === 'stay') return null;
  const loc = stop.location;
  if (!loc || loc.kind !== 'verified' || !loc.photoName) return null;
  return {
    photoName: loc.photoName,
    ...(loc.photoAttribution ? { photoAttribution: loc.photoAttribution } : {}),
    alt: stop.name,
  };
}

const MODE_LABEL: Record<TransitMode, string> = {
  drive: 'Drive',
  flight: 'Flight',
  train: 'Train',
  walk: 'Walk',
  shuttle: 'Shuttle',
  other: 'Transit',
};

const TILE_WIDTH = 96;
const TILE_HEIGHT = 72;
const HERO_MAX_WIDTH_PX = 1600;

interface StopCardProps {
  stop: Stop;
  onEdit?: (stop: Stop) => void;
  onDelete?: (stop: Stop) => void;
  /** Drag handle props from @hello-pangea/dnd, when the card is reorderable. */
  dragHandleProps?: HTMLAttributes<HTMLDivElement> | null;
  /** Whether to show the drag handle (only untimed stops are draggable). */
  showDragHandle?: boolean;
}

function locationLabel(loc: StopLocation | null): string | null {
  if (!loc) return null;
  return loc.label;
}

function primaryText(stop: Stop): string {
  if (stop.type === 'transit') {
    return MODE_LABEL[stop.mode];
  }
  return stop.name;
}

function secondaryText(stop: Stop): string | null {
  if (stop.type === 'transit') {
    const from = locationLabel(stop.fromLocation);
    const to = locationLabel(stop.toLocation);
    if (from && to) return `${from} → ${to}`;
    if (to) return `→ ${to}`;
    if (from) return `from ${from}`;
    return null;
  }
  if (stop.type === 'stay') {
    return locationLabel(stop.location);
  }
  return locationLabel(stop.location);
}

export function StopCard({
  stop,
  onEdit,
  onDelete,
  dragHandleProps,
  showDragHandle,
}: StopCardProps) {
  const Icon = stopIcon(stop);
  const photo = stopPhotoInfo(stop);
  const time = stop.time;
  const secondary = secondaryText(stop);
  const { hovered, ref } = useHover<HTMLDivElement>();
  // Touch devices can't hover — keep the drag handle visible always so the
  // reorder affordance stays reachable. On pointer devices, reveal on hover.
  const isTouch = useMediaQuery('(hover: none)');
  const handleVisible = Boolean(showDragHandle) && (isTouch || hovered);
  const [heroOpened, { open: openHero, close: closeHero }] = useDisclosure(false);

  const apiKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string | undefined;
  const photoSrc =
    photo && apiKey
      ? `https://places.googleapis.com/v1/${photo.photoName}/media?maxWidthPx=${TILE_WIDTH * 2}&key=${apiKey}`
      : null;
  const heroSrc =
    photo && apiKey
      ? `https://places.googleapis.com/v1/${photo.photoName}/media?maxWidthPx=${HERO_MAX_WIDTH_PX}&key=${apiKey}`
      : null;
  const attributionText = photo?.photoAttribution
    ? `Photo: ${photo.photoAttribution}`
    : 'Photo via Google';

  const handleTileClick = () => {
    if (photoSrc) openHero();
  };
  const handleTileKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!photoSrc) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openHero();
    }
  };
  // Keep a tap on the drag grip from also opening the hero modal. Drag
  // gestures (pointerdown) won't fire click, but a non-drag tap on the grip
  // would bubble to the tile without this stop.
  const handleGripClick = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
  };

  return (
    <Paper
      ref={ref}
      withBorder
      radius="md"
      p={0}
      data-stop-id={stop.id}
      style={{ overflow: 'hidden', position: 'relative' }}
    >
      {/* Flush-left photo / icon tile, absolutely positioned so its size is
          completely decoupled from the content column — flex min-width/height
          quirks can't make it grow to match long notes. Tile width stays 96px;
          height stretches to the full card so the gutter is always filled —
          photos use object-fit: cover to crop cleanly when notes push the card
          taller than TILE_HEIGHT. */}
      <div
        {...(photoSrc
          ? {
              role: 'button',
              tabIndex: 0,
              'aria-label': `View ${photo?.alt ?? 'stop'} photo full size`,
              onClick: handleTileClick,
              onKeyDown: handleTileKeyDown,
            }
          : {})}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: TILE_WIDTH,
          height: '100%',
          overflow: 'hidden',
          backgroundColor: photo ? 'transparent' : 'var(--mantine-color-blue-light)',
          cursor: photoSrc ? 'pointer' : 'default',
        }}
      >
        {photoSrc ? (
          <Tooltip label={attributionText} withArrow>
            <img
              src={photoSrc}
              alt={photo?.alt ?? ''}
              style={{
                display: 'block',
                width: TILE_WIDTH,
                height: '100%',
                objectFit: 'cover',
              }}
            />
          </Tooltip>
        ) : (
          <div
            style={{
              width: '100%',
              height: TILE_HEIGHT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--mantine-color-blue-filled)',
            }}
          >
            <Icon size={24} />
          </div>
        )}

        {showDragHandle && (
          <div
            {...(dragHandleProps ?? {})}
            onClick={handleGripClick}
            aria-label="Reorder stop"
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2px 3px',
              borderRadius: 4,
              background: 'rgba(0, 0, 0, 0.5)',
              color: 'white',
              cursor: 'grab',
              touchAction: 'none',
              opacity: handleVisible ? 1 : 0,
              pointerEvents: handleVisible ? 'auto' : 'none',
              transition: 'opacity 120ms ease',
              zIndex: 2,
            }}
          >
            <IconGripVertical size={14} />
          </div>
        )}
      </div>

      {/* Content — left padding = tile width + small gap so content clears the
          absolutely-positioned tile. */}
      <Group
        gap="sm"
        wrap="nowrap"
        align="flex-start"
        style={{
          paddingLeft: TILE_WIDTH + 12,
          paddingRight: 'var(--mantine-spacing-sm)',
          paddingTop: 'var(--mantine-spacing-xs)',
          paddingBottom: 'var(--mantine-spacing-xs)',
          minHeight: TILE_HEIGHT,
        }}
      >
        <div style={{ width: 56, flexShrink: 0, paddingTop: 2 }}>
          <Text size="sm" c={time ? undefined : 'dimmed'} fw={time ? 500 : 400}>
            {time ?? '—'}
          </Text>
        </div>

        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={500} truncate>
            {primaryText(stop)}
          </Text>
          {secondary && (
            <Text size="xs" c="dimmed" truncate>
              {secondary}
            </Text>
          )}
          {stop.notes && (
            <Text size="xs" c="dimmed" lineClamp={2} style={{ fontStyle: 'italic' }}>
              {stop.notes}
            </Text>
          )}
        </Stack>

        <Group gap={4} wrap="nowrap" style={{ alignSelf: 'center' }}>
          {onEdit && (
            <Tooltip label="Edit stop">
              <ActionIcon
                size="sm"
                variant="subtle"
                color="blue"
                onClick={() => onEdit(stop)}
                aria-label="Edit stop"
              >
                <IconEdit size={14} />
              </ActionIcon>
            </Tooltip>
          )}
          {onDelete && (
            <Tooltip label="Delete stop">
              <ActionIcon
                size="sm"
                variant="subtle"
                color="red"
                onClick={() => onDelete(stop)}
                aria-label="Delete stop"
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>

      {heroSrc && (
        <ResponsiveModal
          opened={heroOpened}
          onClose={closeHero}
          size="xl"
          centered
          title={photo?.alt ?? ''}
        >
          <Stack gap="xs">
            <Image
              src={heroSrc}
              alt={photo?.alt ?? ''}
              fit="contain"
              style={{ maxHeight: '80vh', width: '100%' }}
            />
            <Text size="xs" c="dimmed" ta="right">
              {attributionText}
            </Text>
          </Stack>
        </ResponsiveModal>
      )}
    </Paper>
  );
}
