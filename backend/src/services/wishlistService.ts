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
  constructor(
    private dataService: DataService,
    private categoryService: CategoryService,
    private imageStore: ImageStore
  ) {}

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async loadItems(familyId: string): Promise<StoredWishlistItem[]> {
    const items =
      (await this.dataService.getData<StoredWishlistItem[]>(`wishlist_${familyId}`)) ?? [];
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
    await this.dataService.saveData(`wishlist_${familyId}`, items);
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

    const items = await this.loadItems(familyId);
    items.push(item);
    await this.saveItems(items, familyId);

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
  }

  /**
   * Hard-delete a wishlist item. Throws NotFoundError if the id is unknown.
   */
  async deleteItem(id: string, familyId: string): Promise<void> {
    const items = await this.loadItems(familyId);
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new NotFoundError(`Wishlist item '${id}' not found`);
    }

    const removed = items[index];
    const remaining = items.filter((item) => item.id !== id);
    await this.saveItems(remaining, familyId);
    await this.deleteImageObjects(familyId, removed.images ?? []);
  }

  /**
   * Attach an uploaded image to an item. Validation, metadata stripping and
   * storage happen in `imageStore.put`.
   *
   * The item is re-read after the upload is stored: the upload is the slow
   * step, and applying the new ref to a list loaded before it would overwrite
   * any edit that landed meanwhile. If the item vanished or filled up in that
   * window, or the save fails, the just-stored object is deleted so nothing is
   * left unowned.
   *
   * @throws NotFoundError if the item does not exist
   * @throws ValidationError if the item is at WISHLIST_IMAGE_LIMITS.maxCount
   *   or the upload is rejected
   */
  async addImage(id: string, upload: ImageUpload, familyId: string): Promise<StoredWishlistItem> {
    this.assertImageCapacity(await this.findItem(id, familyId));

    const ref = await this.imageStore.put(familyId, upload, { type: 'wishlist', id });

    try {
      const items = await this.loadItems(familyId);
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) throw new NotFoundError(`Wishlist item '${id}' not found`);
      this.assertImageCapacity(items[index]);

      const updated: StoredWishlistItem = {
        ...items[index],
        images: [...(items[index].images ?? []), ref],
        updatedAt: new Date().toISOString(),
      };
      items[index] = updated;
      await this.saveItems(items, familyId);
      return updated;
    } catch (error) {
      await this.deleteImageObjects(familyId, [ref]);
      throw error;
    }
  }

  /**
   * Detach an image and delete its object. The ref is removed first: if the
   * object delete then fails, the result is an unreferenced object (logged,
   * findable by its owner metadata) rather than a ref pointing at nothing.
   *
   * @throws NotFoundError if the item or the image is not found
   */
  async removeImage(id: string, imageId: string, familyId: string): Promise<StoredWishlistItem> {
    const items = await this.loadItems(familyId);
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) throw new NotFoundError(`Wishlist item '${id}' not found`);

    const images = items[index].images ?? [];
    const image = images.find((img) => img.id === imageId);
    if (!image) throw new NotFoundError(`Image '${imageId}' not found on this item`);

    const updated: StoredWishlistItem = {
      ...items[index],
      images: images.filter((img) => img.id !== imageId),
      updatedAt: new Date().toISOString(),
    };
    items[index] = updated;
    await this.saveItems(items, familyId);
    await this.deleteImageObjects(familyId, [image]);
    return updated;
  }

  private async findItem(id: string, familyId: string): Promise<StoredWishlistItem> {
    const item = (await this.loadItems(familyId)).find((i) => i.id === id);
    if (!item) throw new NotFoundError(`Wishlist item '${id}' not found`);
    return item;
  }

  private assertImageCapacity(item: StoredWishlistItem): void {
    if ((item.images ?? []).length >= WISHLIST_IMAGE_LIMITS.maxCount) {
      throw new ValidationError('This item already has a photo. Remove it before adding another.');
    }
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
