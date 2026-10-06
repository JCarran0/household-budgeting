import { Image, Skeleton, Center } from '@mantine/core';
import { IconPhotoOff } from '@tabler/icons-react';
import { useStoredImageUrl } from '../../hooks/useStoredImageUrl';

interface StoredImageProps {
  imageId: string;
  alt: string;
  /** Fixed box for thumbnails; omit both for a fluid image. */
  width?: number;
  height?: number;
  /** Cap for fluid images. */
  maxHeight?: number;
  fit?: 'cover' | 'contain';
  radius?: 'xs' | 'sm' | 'md';
}

/**
 * Renders a stored image (`ImageRef.id`) from the authenticated image route.
 * Owner-agnostic: wishlist today, other features later.
 */
export function StoredImage({
  imageId,
  alt,
  width,
  height,
  maxHeight,
  fit = 'cover',
  radius = 'sm',
}: StoredImageProps) {
  const { url, isError } = useStoredImageUrl(imageId);

  if (isError) {
    return (
      <Center w={width} h={height ?? maxHeight} bg="var(--mantine-color-default-hover)" style={{ borderRadius: 4 }}>
        <IconPhotoOff size={16} color="var(--mantine-color-dimmed)" aria-label="Image unavailable" />
      </Center>
    );
  }

  if (!url) {
    return <Skeleton w={width ?? '100%'} h={height ?? maxHeight ?? 120} radius={radius} />;
  }

  return (
    <Image
      src={url}
      alt={alt}
      w={width}
      h={height}
      mah={maxHeight}
      fit={fit}
      radius={radius}
    />
  );
}
