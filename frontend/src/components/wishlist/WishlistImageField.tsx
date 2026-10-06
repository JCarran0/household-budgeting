import { Stack, Group, Text, Button, FileButton, CloseButton, Image, Box } from '@mantine/core';
import { IconPhotoPlus } from '@tabler/icons-react';
import { StoredImage } from '../common/StoredImage';
import type { WishlistImageDraft } from './useWishlistImageDraft';

const PREVIEW_MAX_HEIGHT = 240;

function RemovableImage({ children, label, onRemove }: { children: React.ReactNode; label: string; onRemove: () => void }) {
  return (
    <Box pos="relative">
      {children}
      <CloseButton
        pos="absolute"
        top={6}
        right={6}
        variant="filled"
        radius="xl"
        size="sm"
        aria-label={label}
        onClick={onRemove}
      />
    </Box>
  );
}

/**
 * Photo section of the wishlist modal. v1 holds at most one image
 * (WISHLIST_IMAGE_LIMITS); there is deliberately no "replace" — remove, then
 * add — so a failed upload can never silently cost the existing photo.
 */
export function WishlistImageField({ draft, itemName }: { draft: WishlistImageDraft; itemName: string }) {
  const alt = itemName.trim() || 'Wishlist item photo';

  return (
    <Stack gap={4}>
      <Text size="sm" fw={500}>
        Photo
      </Text>

      {draft.kept.map((img) => (
        <RemovableImage key={img.id} label="Remove photo" onRemove={() => draft.remove(img.id)}>
          <StoredImage imageId={img.id} alt={alt} maxHeight={PREVIEW_MAX_HEIGHT} fit="contain" />
        </RemovableImage>
      ))}

      {draft.pendingPreviewUrl && (
        <RemovableImage label="Remove photo" onRemove={draft.clearPending}>
          <Image src={draft.pendingPreviewUrl} alt={alt} mah={PREVIEW_MAX_HEIGHT} fit="contain" radius="sm" />
        </RemovableImage>
      )}

      {draft.canAdd && (
        <Group>
          {/* accept="image/*" lets the phone offer its camera; iOS hands over HEIC as JPEG. */}
          <FileButton onChange={draft.pick} accept="image/*">
            {(props) => (
              <Button
                {...props}
                variant="light"
                size="xs"
                leftSection={<IconPhotoPlus size={14} />}
                loading={draft.isPreparing}
              >
                Add photo
              </Button>
            )}
          </FileButton>
          <Text size="xs" c="dimmed">
            Optional
          </Text>
        </Group>
      )}

      {draft.error && (
        <Text size="xs" c="red">
          {draft.error}
        </Text>
      )}
    </Stack>
  );
}
