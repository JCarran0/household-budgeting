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
  };
}
