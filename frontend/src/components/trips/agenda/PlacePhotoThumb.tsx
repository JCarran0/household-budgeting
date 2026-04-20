import { Image, Modal, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import type { MantineRadius } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';

interface PlacePhotoThumbProps {
  photoName: string;
  attribution: string | null;
  size: number;
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
  alt,
  radius = 'sm',
}: PlacePhotoThumbProps) {
  const key = import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string | undefined;
  const [opened, { open, close }] = useDisclosure(false);
  if (!key) return null;

  // maxWidthPx is doubled for retina; Google redirects to a CDN image.
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
          <Image src={thumbSrc} alt={alt} w={size} h={size} radius={radius} fit="cover" />
        </UnstyledButton>
      </Tooltip>
      <Modal opened={opened} onClose={close} size="xl" centered title={alt}>
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
      </Modal>
    </>
  );
}
