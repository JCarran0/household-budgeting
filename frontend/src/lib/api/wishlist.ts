import type { AxiosInstance } from 'axios';
import type {
  StoredWishlistItem,
  CreateWishlistItemDto,
  UpdateWishlistItemDto,
} from '../../../../shared/types';

export function createWishlistApi(client: AxiosInstance) {
  return {
    async createWishlistItem(data: CreateWishlistItemDto): Promise<StoredWishlistItem> {
      const { data: item } = await client.post<StoredWishlistItem>('/wishlist', data);
      return item;
    },

    async getWishlistItems(): Promise<StoredWishlistItem[]> {
      const { data } = await client.get<StoredWishlistItem[]>('/wishlist');
      return data;
    },

    async updateWishlistItem(
      id: string,
      updates: UpdateWishlistItemDto,
    ): Promise<StoredWishlistItem> {
      const { data } = await client.put<StoredWishlistItem>(`/wishlist/${id}`, updates);
      return data;
    },

    async deleteWishlistItem(id: string): Promise<void> {
      await client.delete(`/wishlist/${id}`);
    },

    /** Attach one image. Pass the output of `prepareImageForUpload`, not the raw file. */
    async addWishlistImage(id: string, image: Blob): Promise<StoredWishlistItem> {
      const form = new FormData();
      form.append('image', image, 'photo');
      const { data } = await client.post<StoredWishlistItem>(`/wishlist/${id}/images`, form, {
        // Clear the client's JSON default so the browser sets multipart with
        // its boundary; leaving it makes axios serialise the FormData as JSON.
        headers: { 'Content-Type': undefined },
      });
      return data;
    },

    async removeWishlistImage(id: string, imageId: string): Promise<StoredWishlistItem> {
      const { data } = await client.delete<StoredWishlistItem>(`/wishlist/${id}/images/${imageId}`);
      return data;
    },
  };
}
