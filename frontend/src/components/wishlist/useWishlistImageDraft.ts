import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { prepareImageForUpload, ImagePreparationError } from '../../lib/prepareImageForUpload';
import type { ImageRef } from '../../../../shared/types';
import { WISHLIST_IMAGE_LIMITS } from '../../../../shared/types';

/**
 * Pending photo changes in the wishlist modal. Like every other field, they
 * apply on Save and are discarded on Cancel; nothing is uploaded on pick.
 *
 * Images are not part of the item's JSON body — the server only changes them
 * through the image routes — so `apply` runs after the item itself is saved
 * (on create, that is also the first moment an item id exists).
 */
export interface WishlistImageDraft {
  /** Stored images still attached once the draft is applied. */
  kept: ImageRef[];
  /** Local preview of a picked, already-resized photo. */
  pendingPreviewUrl: string | null;
  canAdd: boolean;
  isPreparing: boolean;
  error: string | null;
  pick: (file: File | null) => Promise<void>;
  remove: (imageId: string) => void;
  clearPending: () => void;
  /** Remove marked images, then upload the pending one. Throws on failure. */
  apply: (itemId: string) => Promise<void>;
}

export function useWishlistImageDraft(opened: boolean, stored: ImageRef[]): WishlistImageDraft {
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [pending, setPending] = useState<Blob | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh draft every time the modal opens.
  useEffect(() => {
    if (opened) {
      setRemovedIds([]);
      setPending(null);
      setError(null);
    }
  }, [opened]);

  useEffect(() => {
    if (!pending) {
      setPendingPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pending);
    setPendingPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pending]);

  const kept = stored.filter((img) => !removedIds.includes(img.id));
  const canAdd = kept.length + (pending ? 1 : 0) < WISHLIST_IMAGE_LIMITS.maxCount;

  const pick = useCallback(async (file: File | null) => {
    if (!file) return;
    setError(null);
    setIsPreparing(true);
    try {
      setPending(await prepareImageForUpload(file));
    } catch (e) {
      setError(e instanceof ImagePreparationError ? e.message : 'Could not process this image');
    } finally {
      setIsPreparing(false);
    }
  }, []);

  const remove = useCallback((imageId: string) => {
    setRemovedIds((ids) => [...ids, imageId]);
  }, []);

  const clearPending = useCallback(() => setPending(null), []);

  const apply = useCallback(
    async (itemId: string) => {
      for (const imageId of removedIds) {
        await api.removeWishlistImage(itemId, imageId);
      }
      if (pending) {
        await api.addWishlistImage(itemId, pending);
      }
    },
    [removedIds, pending],
  );

  return { kept, pendingPreviewUrl, canAdd, isPreparing, error, pick, remove, clearPending, apply };
}
