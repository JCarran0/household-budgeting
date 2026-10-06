import type { AxiosInstance } from 'axios';

/**
 * Stored images (backend `imageStore`). Read-only and owner-agnostic: an owner
 * record carries an `ImageRef.id`, and the bytes come from here. Uploads go
 * through each owner's API (e.g. `addWishlistImage`).
 */
export function createImagesApi(client: AxiosInstance) {
  return {
    /**
     * Fetched as a Blob through the authenticated client, because the API
     * authenticates with a Bearer header that a plain `<img src>` cannot send.
     * Render it via `useStoredImageUrl`, which owns the object-URL lifecycle.
     */
    async getImageBlob(imageId: string): Promise<Blob> {
      const { data } = await client.get<Blob>(`/images/${encodeURIComponent(imageId)}`, {
        responseType: 'blob',
      });
      return data;
    },
  };
}
