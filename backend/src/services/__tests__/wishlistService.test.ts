import { WishlistService } from '../wishlistService';
import { InMemoryDataService } from '../dataService';
import { ValidationError, NotFoundError } from '../../errors';
import type { Category } from '../../shared/types';

// ---------------------------------------------------------------------------
// Minimal CategoryService stub
// ---------------------------------------------------------------------------

function makeCategoryService(categories: Category[]) {
  return {
    getAllCategories: async (_familyId: string) => categories,
  } as unknown as import('../categoryService').CategoryService;
}

// ---------------------------------------------------------------------------
// Category fixtures
// ---------------------------------------------------------------------------

const SPENDING_CAT: Category = {
  id: 'FOOD_AND_DRINK',
  name: 'Food & Drink',
  parentId: null,
  isCustom: false,
  isHidden: false,
  isRollover: false,
  isIncome: false,
  isSavings: false,
};

const INCOME_CAT: Category = {
  id: 'INCOME_WAGES',
  name: 'Wages',
  parentId: null,
  isCustom: false,
  isHidden: false,
  isRollover: false,
  isIncome: true,
  isSavings: false,
};

const SAVINGS_CAT: Category = {
  id: 'CUSTOM_SAVINGS',
  name: 'Savings',
  parentId: null,
  isCustom: true,
  isHidden: false,
  isRollover: false,
  isIncome: false,
  isSavings: true,
};

const TRANSFER_CAT: Category = {
  id: 'TRANSFER_IN',
  name: 'Transfer In',
  parentId: null,
  isCustom: false,
  isHidden: false,
  isRollover: false,
  isIncome: false,
  isSavings: false,
};

const ALL_CATEGORIES = [SPENDING_CAT, INCOME_CAT, SAVINGS_CAT, TRANSFER_CAT];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeService(categories: Category[] = ALL_CATEGORIES) {
  const ds = new InMemoryDataService();
  const cs = makeCategoryService(categories);
  return new WishlistService(ds, cs);
}

const FAMILY_A = 'family-a';
const FAMILY_B = 'family-b';
const USER_1 = 'user-1';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WishlistService', () => {
  describe('createItem', () => {
    it('creates an item with PENDING default status and populated metadata', async () => {
      const svc = makeService();
      const item = await svc.createItem(
        { name: 'New TV', estimatedAmount: 800, estimatedMonth: '2026-07', categoryId: SPENDING_CAT.id },
        FAMILY_A,
        USER_1,
      );

      expect(item.id).toEqual(expect.any(String));
      expect(item.name).toBe('New TV');
      expect(item.estimatedAmount).toBe(800);
      expect(item.estimatedMonth).toBe('2026-07');
      expect(item.categoryId).toBe(SPENDING_CAT.id);
      expect(item.status).toBe('PENDING');
      expect(item.createdBy).toBe(USER_1);
      expect(item.createdAt).toEqual(expect.any(String));
      expect(item.updatedAt).toEqual(expect.any(String));
    });

    it('respects an explicit status of AGREED', async () => {
      const svc = makeService();
      const item = await svc.createItem(
        { name: 'Couch', estimatedAmount: 1200, estimatedMonth: '2026-08', categoryId: SPENDING_CAT.id, status: 'AGREED' },
        FAMILY_A,
        USER_1,
      );
      expect(item.status).toBe('AGREED');
    });

    it('throws ValidationError for an income category', async () => {
      const svc = makeService();
      await expect(
        svc.createItem(
          { name: 'Bad', estimatedAmount: 100, estimatedMonth: '2026-07', categoryId: INCOME_CAT.id },
          FAMILY_A,
          USER_1,
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError for a savings category (isSavings=true)', async () => {
      const svc = makeService();
      await expect(
        svc.createItem(
          { name: 'Bad', estimatedAmount: 100, estimatedMonth: '2026-07', categoryId: SAVINGS_CAT.id },
          FAMILY_A,
          USER_1,
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError for a transfer category', async () => {
      const svc = makeService();
      await expect(
        svc.createItem(
          { name: 'Bad', estimatedAmount: 100, estimatedMonth: '2026-07', categoryId: TRANSFER_CAT.id },
          FAMILY_A,
          USER_1,
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError for an unknown categoryId', async () => {
      const svc = makeService();
      await expect(
        svc.createItem(
          { name: 'Bad', estimatedAmount: 100, estimatedMonth: '2026-07', categoryId: 'DOES_NOT_EXIST' },
          FAMILY_A,
          USER_1,
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('listItems', () => {
    it('returns all items for the family', async () => {
      const svc = makeService();
      await svc.createItem({ name: 'A', estimatedAmount: 100, estimatedMonth: '2026-06', categoryId: SPENDING_CAT.id }, FAMILY_A, USER_1);
      await svc.createItem({ name: 'B', estimatedAmount: 200, estimatedMonth: '2026-07', categoryId: SPENDING_CAT.id }, FAMILY_A, USER_1);

      const items = await svc.listItems(FAMILY_A);
      expect(items).toHaveLength(2);
      expect(items.map((i) => i.name)).toEqual(expect.arrayContaining(['A', 'B']));
    });

    it('isolates data by familyId', async () => {
      const svc = makeService();
      await svc.createItem({ name: 'Family A item', estimatedAmount: 100, estimatedMonth: '2026-06', categoryId: SPENDING_CAT.id }, FAMILY_A, USER_1);
      await svc.createItem({ name: 'Family B item', estimatedAmount: 200, estimatedMonth: '2026-07', categoryId: SPENDING_CAT.id }, FAMILY_B, USER_1);

      const aItems = await svc.listItems(FAMILY_A);
      const bItems = await svc.listItems(FAMILY_B);

      expect(aItems).toHaveLength(1);
      expect(aItems[0].name).toBe('Family A item');
      expect(bItems).toHaveLength(1);
      expect(bItems[0].name).toBe('Family B item');
    });
  });

  describe('updateItem', () => {
    it('updates name individually', async () => {
      const svc = makeService();
      const created = await svc.createItem(
        { name: 'Old Name', estimatedAmount: 100, estimatedMonth: '2026-06', categoryId: SPENDING_CAT.id },
        FAMILY_A, USER_1,
      );
      const updated = await svc.updateItem(created.id, { name: 'New Name' }, FAMILY_A);
      expect(updated.name).toBe('New Name');
      expect(updated.estimatedAmount).toBe(100); // unchanged
    });

    it('updates estimatedAmount individually', async () => {
      const svc = makeService();
      const created = await svc.createItem(
        { name: 'TV', estimatedAmount: 500, estimatedMonth: '2026-06', categoryId: SPENDING_CAT.id },
        FAMILY_A, USER_1,
      );
      const updated = await svc.updateItem(created.id, { estimatedAmount: 750 }, FAMILY_A);
      expect(updated.estimatedAmount).toBe(750);
    });

    it('updates estimatedMonth individually', async () => {
      const svc = makeService();
      const created = await svc.createItem(
        { name: 'TV', estimatedAmount: 500, estimatedMonth: '2026-06', categoryId: SPENDING_CAT.id },
        FAMILY_A, USER_1,
      );
      const updated = await svc.updateItem(created.id, { estimatedMonth: '2026-12' }, FAMILY_A);
      expect(updated.estimatedMonth).toBe('2026-12');
    });

    it('updates status individually', async () => {
      const svc = makeService();
      const created = await svc.createItem(
        { name: 'TV', estimatedAmount: 500, estimatedMonth: '2026-06', categoryId: SPENDING_CAT.id },
        FAMILY_A, USER_1,
      );
      const updated = await svc.updateItem(created.id, { status: 'AGREED' }, FAMILY_A);
      expect(updated.status).toBe('AGREED');
    });

    it('throws ValidationError when updating to an ineligible category', async () => {
      const svc = makeService();
      const created = await svc.createItem(
        { name: 'TV', estimatedAmount: 500, estimatedMonth: '2026-06', categoryId: SPENDING_CAT.id },
        FAMILY_A, USER_1,
      );
      await expect(
        svc.updateItem(created.id, { categoryId: INCOME_CAT.id }, FAMILY_A),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws NotFoundError when id is unknown', async () => {
      const svc = makeService();
      await expect(
        svc.updateItem('does-not-exist', { status: 'AGREED' }, FAMILY_A),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('deleteItem', () => {
    it('removes the item from the store', async () => {
      const svc = makeService();
      const item = await svc.createItem(
        { name: 'Delete me', estimatedAmount: 100, estimatedMonth: '2026-06', categoryId: SPENDING_CAT.id },
        FAMILY_A, USER_1,
      );
      await svc.deleteItem(item.id, FAMILY_A);
      const remaining = await svc.listItems(FAMILY_A);
      expect(remaining).toHaveLength(0);
    });

    it('throws NotFoundError when id is unknown', async () => {
      const svc = makeService();
      await expect(svc.deleteItem('ghost-id', FAMILY_A)).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
