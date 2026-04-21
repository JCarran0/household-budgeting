import { Image, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { ResponsiveModal } from '../../ResponsiveModal';
import type { MantineRadius } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';

interface PlacePhotoThumbProps {
  photoName: string;
  attribution: string | null;
  /** Width in px. Also sets the height if `height` is not provided (square). */
  size: number;
  /** Optional non-square height in px. Defaults to `size`. */
  height?: number;
  alt: string;
  radius?: MantineRadius;
}

const HERO_MAX_WIDTH_PX = 1600;

/**
 * Renders a Google Places v1 photo thumbnail with hover attribution and a
 * click-to-enlarge hero modal. Returns null when the API key is absent so
 * callers can fall back to an icon.
 */
export function PlacePhotoThumb({
  photoName,
  attribution,
  size,
  height,
  alt,
  radius = 'sm',
}: PlacePhotoThumbProps) {
  const key = import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string | undefined;
  const [opened, { open, close }] = useDisclosure(false);
  if (!key) return null;

  const tileHeight = height ?? size;
  // maxWidthPx is doubled for retina; Google redirects to a CDN image. Using
  // width (not height) as the fetch dimension matches Google's Place Photos
  // API contract — the service returns a photo constrained to maxWidthPx and
  // lets the caller crop via CSS fit=cover.
  const thumbSrc = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${size * 2}&key=${key}`;
  const heroSrc = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${HERO_MAX_WIDTH_PX}&key=${key}`;
  const attributionText = attribution ? `Photo: ${attribution}` : 'Photo via Google';

  return (
    <>
      <Tooltip label={attributionText} withArrow>
        <UnstyledButton
          onClick={open}
          aria-label={`View ${alt} photo full size`}
          style={{ display: 'inline-block', borderRadius: 'var(--mantine-radius-sm)' }}
        >
          <Image src={thumbSrc} alt={alt} w={size} h={tileHeight} radius={radius} fit="cover" />
        </UnstyledButton>
      </Tooltip>
      <ResponsiveModal opened={opened} onClose={close} size="xl" centered title={alt}>
        <Stack gap="xs">
          <Image
            src={heroSrc}
            alt={alt}
            fit="contain"
            style={{ maxHeight: '80vh', width: '100%' }}
          />
          <Text size="xs" c="dimmed" ta="right">
            {attributionText}
          </Text>
        </Stack>
      </ResponsiveModal>
    </>
  );
}
