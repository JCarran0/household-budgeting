import { Image, Tooltip } from '@mantine/core';
import type { MantineRadius } from '@mantine/core';

interface PlacePhotoThumbProps {
  photoName: string;
  attribution: string | null;
  size: number;
  alt: string;
  radius?: MantineRadius;
}

/**
 * Renders a Google Places v1 photo thumbnail with hover attribution. Returns
 * null when the API key is absent so callers can fall back to an icon.
 */
export function PlacePhotoThumb({
  photoName,
  attribution,
  size,
  alt,
  radius = 'sm',
}: PlacePhotoThumbProps) {
  const key = import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string | undefined;
  if (!key) return null;

  // maxWidthPx is doubled for retina; Google redirects to a CDN image.
  const src = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${size * 2}&key=${key}`;
  const tooltip = attribution ? `Photo: ${attribution}` : 'Photo via Google';

  return (
    <Tooltip label={tooltip} withArrow>
      <Image src={src} alt={alt} w={size} h={size} radius={radius} fit="cover" />
    </Tooltip>
  );
}
