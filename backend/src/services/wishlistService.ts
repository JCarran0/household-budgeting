/**
 * Wishlist Service
 *
 * Manages family-shared wishlist items — planned purchases that either family
 * member can propose, status-toggle, and delete. No integration with budgets,
 * BvA, or transactions (WISHLIST-BRD.md §6).
 *
 * Images: an item owns its attached images (WISHLIST-BRD.md §3.7). The bytes
 * live in `imageStore`; this service keeps the item's `images` refs and the
 * object store in step — every path that drops a ref also deletes the object.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  StoredWishlistItem,
  CreateWishlistItemDto,
  UpdateWishlistItemDto,
  WISHLIST_IMAGE_LIMITS,
} from '../shared/types';
import { DataService } from './dataService';
import { Repository } from './repository';
import { CategoryService } from './categoryService';
import {
  isBudgetableCategory,
  isIncomeCategoryHierarchical,
  createCategoryLookup,
} from '../shared/utils/categoryHelpers';
import { NotFoundError, ValidationError } from '../errors';
import { ImageStore, ImageUpload } from './imageStore';
import { childLogger } from '../utils/logger';

const log = childLogger('wishlistService');

export class WishlistService {
  /**
   * Backing repository for `wishlist_{familyId}`, used for load/save and for
   * `withLock`. TD-011: every read-modify-write runs under the per-family
   * mutex, or two concurrent writers each save their own copy and one edit is
   * lost.
   *
   * The FIRST read of the collection in each mutating method must happen
   * inside the lock. `getData` memoizes per request (TD-011 part 1b), so a
   * read taken before acquiring the lock is replayed from the memo inside it
   * — stale by exactly the write the lock was waiting on.
   */
  private readonly wishlist: Repository<StoredWishlistItem>;

  constructor(
    dataService: DataService,
    private categoryService: CategoryService,
    private imageStore: ImageStore
  ) {
    this.wishlist = new Repository<StoredWishlistItem>(dataService, 'wishlist');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async loadItems(familyId: string): Promise<StoredWishlistItem[]> {
    const items = await this.wishlist.getAll(familyId);
    // Items stored before links/notes/images existed have no value for those
    // fields; normalize on read so every consumer can treat them as present.
    return items.map((item) => ({
      ...item,
      urls: item.urls ?? [],
      notes: item.notes ?? '',
      images: item.images ?? [],
    }));
  }

  private async saveItems(items: StoredWishlistItem[], familyId: string): Promise<void> {
    await this.wishlist.saveAll(familyId, items);
  }

  /**
   * Validate that categoryId references a spending category (not income, not
   * savings, not transfer). Throws ValidationError for any ineligible category.
   * Decision D3: authoritative server-side; frontend filter is UX convenience only.
   */
  private async assertCategoryIsSpending(
    categoryId: string,
    familyId: string
  ): Promise<void> {
    const categories = await this.categoryService.getAllCategories(familyId);
    const category = categories.find((c) => c.id === categoryId);

    if (!category) {
      throw new ValidationError(`Category '${categoryId}' does not exist for this family`);
    }

    if (!isBudgetableCategory(categoryId, categories)) {
      throw new ValidationError('Category must be budgetable (transfers are not allowed)');
    }

    const lookup = createCategoryLookup(categories);
    if (isIncomeCategoryHierarchical(categoryId, lookup)) {
      throw new ValidationError('Category must not be an income category');
    }

    if (category.isSavings) {
      throw new ValidationError('Category must not be a savings category');
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Create a new wishlist item.
   * Validates category eligibility before persisting.
   */
  async createItem(
    data: CreateWishlistItemDto,
    familyId: string,
    userId: string
  ): Promise<StoredWishlistItem> {
    await this.assertCategoryIsSpending(data.categoryId, familyId);

    const now = new Date().toISOString();
    const item: StoredWishlistItem = {
      id: uuidv4(),
      name: data.name,
      estimatedAmount: data.estimatedAmount,
      estimatedMonth: data.estimatedMonth,
      categoryId: data.categoryId,
      status: data.status ?? 'PENDING',
      urls: data.urls ?? [],
      notes: data.notes ?? '',
      // Images are attached afterwards via addImage, never through the DTO.
      images: [],
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    await this.wishlist.withLock(familyId, async () => {
      const items = await this.loadItems(familyId);
      items.push(item);
      await this.saveItems(items, familyId);
    });

    return item;
  }

  /**
   * Return all wishlist items for a family. Sort is a UI concern (D10).
   */
  async listItems(familyId: string): Promise<StoredWishlistItem[]> {
    return this.loadItems(familyId);
  }

  /**
   * Update fields on an existing item. Partial — any omitted field is unchanged.
   * Validates category eligibility if categoryId is being changed.
   */
  async updateItem(
    id: string,
    data: UpdateWishlistItemDto,
    familyId: string
  ): Promise<StoredWishlistItem> {
    return this.wishlist.withLock(familyId, async () => {
      const items = await this.loadItems(familyId);
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) {
        throw new NotFoundError(`Wishlist item '${id}' not found`);
      }

      if (data.categoryId !== undefined) {
        await this.assertCategoryIsSpending(data.categoryId, familyId);
      }

      const existing = items[index];
      const updated: StoredWishlistItem = {
        ...existing,
        ...(data.name !== undefined && { name: data.name }),
        ...(data.estimatedAmount !== undefined && { estimatedAmount: data.estimatedAmount }),
        ...(data.estimatedMonth !== undefined && { estimatedMonth: data.estimatedMonth }),
        ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
        ...(data.status !== undefined && { status: data.status }),
        // Full replacement — an explicit [] clears the links.
        ...(data.urls !== undefined && { urls: data.urls }),
        // Likewise an explicit '' clears the note.
        ...(data.notes !== undefined && { notes: data.notes }),
        updatedAt: new Date().toISOString(),
      };

      items[index] = updated;
      await this.saveItems(items, familyId);

      return updated;
    });
  }

  /**
   * Hard-delete a wishlist item. Throws NotFoundError if the id is unknown.
   */
  async deleteItem(id: string, familyId: string): Promise<void> {
    const removed = await this.wishlist.withLock(familyId, async () => {
      const items = await this.loadItems(familyId);
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) {
        throw new NotFoundError(`Wishlist item '${id}' not found`);
      }
      await this.saveItems(items.filter((item) => item.id !== id), familyId);
      return items[index];
    });
    // Object storage is not part of the collection; no need to hold the lock.
    await this.deleteImageObjects(familyId, removed.images ?? []);
  }

  /**
   * Attach an uploaded image to an item. Validation, metadata stripping and
   * storage happen in `imageStore.put`.
   *
   * The whole cycle, upload included, holds the family lock. The upload is
   * the slow step (a few hundred ms), and releasing the lock across it would
   * mean re-reading afterwards — which the per-request memo turns into a replay
   * of the stale pre-upload list. For a two-person household the wait is
   * nothing. If the save fails, the just-stored object is deleted so nothing
   * is left unowned.
   *
   * @throws NotFoundError if the item does not exist
   * @throws ValidationError if the item is at WISHLIST_IMAGE_LIMITS.maxCount
   *   or the upload is rejected
   */
  async addImage(id: string, upload: ImageUpload, familyId: string): Promise<StoredWishlistItem> {
    return this.wishlist.withLock(familyId, async () => {
      const items = await this.loadItems(familyId);
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) throw new NotFoundError(`Wishlist item '${id}' not found`);
      const existing = items[index].images ?? [];
      if (existing.length >= WISHLIST_IMAGE_LIMITS.maxCount) {
        throw new ValidationError('This item already has a photo. Remove it before adding another.');
      }

      const ref = await this.imageStore.put(familyId, upload, { type: 'wishlist', id });
      try {
        const updated: StoredWishlistItem = {
          ...items[index],
          images: [...existing, ref],
          updatedAt: new Date().toISOString(),
        };
        items[index] = updated;
        await this.saveItems(items, familyId);
        return updated;
      } catch (error) {
        await this.deleteImageObjects(familyId, [ref]);
        throw error;
      }
    });
  }

  /**
   * Detach an image and delete its object. The ref is removed first: if the
   * object delete then fails, the result is an unreferenced object (logged,
   * findable by its owner metadata) rather than a ref pointing at nothing.
   *
   * @throws NotFoundError if the item or the image is not found
   */
  async removeImage(id: string, imageId: string, familyId: string): Promise<StoredWishlistItem> {
    const { updated, image } = await this.wishlist.withLock(familyId, async () => {
      const items = await this.loadItems(familyId);
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) throw new NotFoundError(`Wishlist item '${id}' not found`);

      const images = items[index].images ?? [];
      const found = images.find((img) => img.id === imageId);
      if (!found) throw new NotFoundError(`Image '${imageId}' not found on this item`);

      const next: StoredWishlistItem = {
        ...items[index],
        images: images.filter((img) => img.id !== imageId),
        updatedAt: new Date().toISOString(),
      };
      items[index] = next;
      await this.saveItems(items, familyId);
      return { updated: next, image: found };
    });
    await this.deleteImageObjects(familyId, [image]);
    return updated;
  }

  /**
   * Best-effort: the refs are already gone (or were never saved), so a failed
   * delete leaves an orphan, not a broken item. Logged so it can be swept.
   */
  private async deleteImageObjects(familyId: string, images: { id: string }[]): Promise<void> {
    for (const image of images) {
      try {
        await this.imageStore.delete(familyId, image.id);
      } catch (err) {
        log.error({ err, familyId, imageId: image.id }, 'failed to delete wishlist image object');
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------

let wishlistServiceInstance: WishlistService | null = null;

export function getWishlistService(
  dataService: DataService,
  categoryService: CategoryService,
  imageStore: ImageStore
): WishlistService {
  if (!wishlistServiceInstance) {
    wishlistServiceInstance = new WishlistService(dataService, categoryService, imageStore);
  }
  return wishlistServiceInstance;
}
