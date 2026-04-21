import {
  ActionIcon,
  Group,
  Image,
  Modal,
  Paper,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconBed, IconEdit } from '@tabler/icons-react';
import type { KeyboardEvent, MouseEvent } from 'react';
import type { StayStop } from '../../../../../shared/types';

interface StayBannerProps {
  stay: StayStop;
  /** Total nights the stay covers (inclusive). */
  totalNights: number;
  onEdit?: (stay: StayStop) => void;
}

const BANNER_HEIGHT = 96;
const HERO_MAX_WIDTH_PX = 1600;
const GRADIENT =
  'linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.1) 45%, rgba(0,0,0,0.72) 100%)';

/**
 * Rendered once per unique Stay, positioned above the first day the Stay
 * covers. Days within the Stay do not repeat the banner (REQ-023).
 *
 * Photo variant: full-bleed background with gradient overlay + white text,
 * matching the TripCoverBanner's visual language. Stays are "chapters" of
 * the trip, so they earn banner treatment (Eat/Play don't — density matters).
 */
export function StayBanner({ stay, totalNights, onEdit }: StayBannerProps) {
  const nightsLabel = totalNights === 1 ? '1 night' : `${totalNights} nights`;
  const apiKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string | undefined;
  const photoName = stay.location.photoName;
  const attribution = stay.location.photoAttribution ?? null;
  const [heroOpened, { open: openHero, close: closeHero }] = useDisclosure(false);

  if (photoName && apiKey) {
    const bgSrc = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=1200&key=${apiKey}`;
    const heroSrc = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${HERO_MAX_WIDTH_PX}&key=${apiKey}`;
    const attributionText = attribution ? `Photo: ${attribution}` : 'Photo via Google';

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openHero();
      }
    };
    const handleEditClick = (e: MouseEvent) => {
      // Keep the hero modal from also opening when tapping Edit.
      e.stopPropagation();
      onEdit?.(stay);
    };

    return (
      <>
        <div
          data-stop-id={stay.id}
          role="button"
          tabIndex={0}
          aria-label={`View ${stay.name} photo full size`}
          onClick={openHero}
          onKeyDown={handleKeyDown}
          style={{
            position: 'relative',
            height: BANNER_HEIGHT,
            borderRadius: 'var(--mantine-radius-md)',
            overflow: 'hidden',
            backgroundImage: `url(${bgSrc})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundColor: 'var(--mantine-color-dark-6)',
            border: '1px solid var(--mantine-color-blue-outline)',
            cursor: 'pointer',
          }}
        >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: GRADIENT,
            pointerEvents: 'none',
          }}
        />

        {onEdit && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              padding: '2px 4px',
              background: 'rgba(0, 0, 0, 0.4)',
              borderRadius: 999,
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              zIndex: 2,
            }}
          >
            <Tooltip label="Edit stay">
              <ActionIcon
                variant="transparent"
                c="white"
                onClick={handleEditClick}
                aria-label="Edit stay"
              >
                <IconEdit size={16} />
              </ActionIcon>
            </Tooltip>
          </div>
        )}

        <Stack
          gap={2}
          style={{
            position: 'absolute',
            left: 14,
            right: onEdit ? 56 : 14,
            bottom: 12,
            color: 'white',
          }}
        >
          <Group gap={6} wrap="nowrap">
            <IconBed size={16} style={{ flexShrink: 0 }} />
            <Text
              fw={600}
              truncate
              style={{
                color: 'white',
                textShadow: '0 2px 8px rgba(0, 0, 0, 0.55)',
              }}
            >
              {stay.name}
            </Text>
          </Group>
          <Text
            size="xs"
            truncate
            style={{
              color: 'white',
              opacity: 0.95,
              textShadow: '0 1px 5px rgba(0, 0, 0, 0.6)',
            }}
          >
            {stay.location.label} · {nightsLabel}
          </Text>
        </Stack>

        <Text
          style={{
            position: 'absolute',
            right: 8,
            bottom: 6,
            padding: '1px 6px',
            background: 'rgba(0, 0, 0, 0.5)',
            color: 'white',
            borderRadius: 3,
            fontSize: 9.5,
            lineHeight: 1.4,
            opacity: 0.8,
            maxWidth: '50%',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            pointerEvents: 'none',
          }}
        >
          {attributionText}
        </Text>
        </div>

        <Modal
          opened={heroOpened}
          onClose={closeHero}
          size="xl"
          centered
          title={stay.name}
        >
          <Stack gap="xs">
            <Image
              src={heroSrc}
              alt={stay.name}
              fit="contain"
              style={{ maxHeight: '80vh', width: '100%' }}
            />
            <Text size="xs" c="dimmed" ta="right">
              {attributionText}
            </Text>
          </Stack>
        </Modal>
      </>
    );
  }

  // No-photo fallback — keep the flat tinted-Paper pattern. Rare case since
  // Stays must have a verified location; a Place may simply lack a photo.
  return (
    <Paper
      radius="md"
      p="sm"
      withBorder
      data-stop-id={stay.id}
      style={{
        background: 'var(--mantine-color-blue-light)',
        borderColor: 'var(--mantine-color-blue-outline)',
      }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <IconBed
            size={20}
            color="var(--mantine-color-blue-filled)"
            style={{ flexShrink: 0 }}
          />
          <Stack gap={0} style={{ minWidth: 0 }}>
            <Text fw={600} truncate>
              {stay.name}
            </Text>
            <Text size="xs" c="dimmed" truncate>
              {stay.location.label} · {nightsLabel}
            </Text>
          </Stack>
        </Group>
        {onEdit && (
          <Tooltip label="Edit stay">
            <ActionIcon
              variant="subtle"
              color="blue"
              onClick={() => onEdit(stay)}
              aria-label="Edit stay"
            >
              <IconEdit size={16} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    </Paper>
  );
}
