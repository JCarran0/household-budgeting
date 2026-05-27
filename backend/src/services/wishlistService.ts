/**
 * Wishlist Service
 *
 * Manages family-shared wishlist items — planned purchases that either family
 * member can propose, status-toggle, and delete. No integration with budgets,
 * BvA, or transactions (WISHLIST-BRD.md §6).
 */

import { v4 as uuidv4 } from 'uuid';
import {
  StoredWishlistItem,
  CreateWishlistItemDto,
  UpdateWishlistItemDto,
} from '../shared/types';
import { DataService } from './dataService';
import { CategoryService } from './categoryService';
import {
  isBudgetableCategory,
  isIncomeCategoryHierarchical,
  createCategoryLookup,
} from '../shared/utils/categoryHelpers';
import { NotFoundError, ValidationError } from '../errors';

export class WishlistService {
  constructor(
    private dataService: DataService,
    private categoryService: CategoryService
  ) {}

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async loadItems(familyId: string): Promise<StoredWishlistItem[]> {
    return (
      (await this.dataService.getData<StoredWishlistItem[]>(`wishlist_${familyId}`)) ?? []
    );
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

    const remaining = items.filter((item) => item.id !== id);
    await this.saveItems(remaining, familyId);
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------

let wishlistServiceInstance: WishlistService | null = null;

export function getWishlistService(
  dataService: DataService,
  categoryService: CategoryService
): WishlistService {
  if (!wishlistServiceInstance) {
    wishlistServiceInstance = new WishlistService(dataService, categoryService);
  }
  return wishlistServiceInstance;
}
