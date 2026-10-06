import { WishlistService } from '../wishlistService';
import { InMemoryDataService } from '../dataService';
import { ImageStore } from '../imageStore';
import { InMemoryBinaryStore } from '../storage';
import { BASE_PNG, GPS_MARKER, jpegWithGps } from '../../__tests__/helpers/imageFixtures';
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
  return makeServiceWithStores(categories).svc;
}

function makeServiceWithStores(categories: Category[] = ALL_CATEGORIES) {
  const ds = new InMemoryDataService();
  const cs = makeCategoryService(categories);
  const blobs = new InMemoryBinaryStore();
  const images = new ImageStore(blobs);
  return { svc: new WishlistService(ds, cs, images), ds, blobs, images };
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

  describe('images', () => {
    const PHOTO = { buffer: jpegWithGps(), mimeType: 'image/jpeg' };

    async function makeItem(svc: WishlistService, familyId = FAMILY_A) {
      return svc.createItem(
        { name: 'Sofa', estimatedAmount: 900, estimatedMonth: '2026-11', categoryId: SPENDING_CAT.id },
        familyId,
        USER_1,
      );
    }

    it('new items and items stored before the field existed both read as images: []', async () => {
      const { svc, ds } = makeServiceWithStores();
      const created = await makeItem(svc);
      expect(created.images).toEqual([]);

      const legacy = { ...created, id: 'legacy' } as Record<string, unknown>;
      delete legacy.images;
      await ds.saveData(`wishlist_${FAMILY_A}`, [legacy]);
      const [read] = await svc.listItems(FAMILY_A);
      expect(read.images).toEqual([]);
    });

    it('attaches a stripped image and stores it under images/{familyId}/{imageId}', async () => {
      const { svc, blobs, images } = makeServiceWithStores();
      const item = await makeItem(svc);

      const updated = await svc.addImage(item.id, PHOTO, FAMILY_A);

      expect(updated.images).toHaveLength(1);
      const ref = updated.images![0];
      expect(ref.mimeType).toBe('image/jpeg');
      expect(blobs.keys()).toEqual([`images/${FAMILY_A}/${ref.id}`]);

      const stored = await images.get(FAMILY_A, ref.id);
      expect(stored!.body.includes(Buffer.from(GPS_MARKER))).toBe(false);
      expect(ref.size).toBe(stored!.body.length);
      // Persisted, not just returned.
      expect((await svc.listItems(FAMILY_A))[0].images).toEqual([ref]);
    });

    it('records the owner on the stored object for a future orphan sweep', async () => {
      const { svc, blobs } = makeServiceWithStores();
      const item = await makeItem(svc);
      const ref = (await svc.addImage(item.id, PHOTO, FAMILY_A)).images![0];

      const object = await blobs.getObject(`images/${FAMILY_A}/${ref.id}`);
      expect(object!.metadata).toEqual({
        'family-id': FAMILY_A,
        'owner-type': 'wishlist',
        'owner-id': item.id,
      });
    });

    it('refuses a second image while the v1 cap is 1, storing nothing', async () => {
      const { svc, blobs } = makeServiceWithStores();
      const item = await makeItem(svc);
      await svc.addImage(item.id, PHOTO, FAMILY_A);

      await expect(svc.addImage(item.id, PHOTO, FAMILY_A)).rejects.toBeInstanceOf(ValidationError);
      expect(blobs.keys()).toHaveLength(1);
    });

    it('rejects content that does not match the declared type, storing nothing', async () => {
      const { svc, blobs } = makeServiceWithStores();
      const item = await makeItem(svc);

      await expect(
        svc.addImage(item.id, { buffer: BASE_PNG, mimeType: 'image/jpeg' }, FAMILY_A),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(blobs.keys()).toHaveLength(0);
    });

    it('rejects an unsupported type such as SVG', async () => {
      const { svc } = makeServiceWithStores();
      const item = await makeItem(svc);
      await expect(
        svc.addImage(item.id, { buffer: Buffer.from('<svg/>'), mimeType: 'image/svg+xml' }, FAMILY_A),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws NotFoundError for an item in another family, storing nothing', async () => {
      const { svc, blobs } = makeServiceWithStores();
      const item = await makeItem(svc, FAMILY_A);

      await expect(svc.addImage(item.id, PHOTO, FAMILY_B)).rejects.toBeInstanceOf(NotFoundError);
      expect(blobs.keys()).toHaveLength(0);
    });

    it('deletes the stored object if the item vanished while the upload was in flight', async () => {
      const { svc, blobs, images } = makeServiceWithStores();
      const item = await makeItem(svc);
      const realPut = images.put.bind(images);
      jest.spyOn(images, 'put').mockImplementation(async (...args) => {
        const ref = await realPut(...args);
        await svc.deleteItem(item.id, FAMILY_A);
        return ref;
      });

      await expect(svc.addImage(item.id, PHOTO, FAMILY_A)).rejects.toBeInstanceOf(NotFoundError);
      expect(blobs.keys()).toHaveLength(0);
    });

    it('keeps an edit that landed while the upload was in flight', async () => {
      const { svc, images } = makeServiceWithStores();
      const item = await makeItem(svc);
      const realPut = images.put.bind(images);
      jest.spyOn(images, 'put').mockImplementation(async (...args) => {
        const ref = await realPut(...args);
        await svc.updateItem(item.id, { notes: 'edited meanwhile' }, FAMILY_A);
        return ref;
      });

      const updated = await svc.addImage(item.id, PHOTO, FAMILY_A);
      expect(updated.notes).toBe('edited meanwhile');
      expect(updated.images).toHaveLength(1);
    });

    it('updateItem leaves images untouched', async () => {
      const { svc } = makeServiceWithStores();
      const item = await makeItem(svc);
      const withImage = await svc.addImage(item.id, PHOTO, FAMILY_A);

      const updated = await svc.updateItem(item.id, { name: 'Couch' }, FAMILY_A);
      expect(updated.images).toEqual(withImage.images);
    });

    it('removeImage detaches the ref and deletes the object', async () => {
      const { svc, blobs } = makeServiceWithStores();
      const item = await makeItem(svc);
      const ref = (await svc.addImage(item.id, PHOTO, FAMILY_A)).images![0];

      const updated = await svc.removeImage(item.id, ref.id, FAMILY_A);

      expect(updated.images).toEqual([]);
      expect((await svc.listItems(FAMILY_A))[0].images).toEqual([]);
      expect(blobs.keys()).toHaveLength(0);
    });

    it('removeImage throws NotFoundError for an image the item does not have', async () => {
      const { svc } = makeServiceWithStores();
      const item = await makeItem(svc);
      await expect(
        svc.removeImage(item.id, '00000000-0000-4000-8000-000000000000', FAMILY_A),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('removeImage still detaches the ref when the object delete fails', async () => {
      const { svc, images } = makeServiceWithStores();
      const item = await makeItem(svc);
      const ref = (await svc.addImage(item.id, PHOTO, FAMILY_A)).images![0];
      jest.spyOn(images, 'delete').mockRejectedValue(new Error('S3 down'));

      const updated = await svc.removeImage(item.id, ref.id, FAMILY_A);
      expect(updated.images).toEqual([]);
    });

    it('deleteItem deletes the item\'s image objects', async () => {
      const { svc, blobs } = makeServiceWithStores();
      const item = await makeItem(svc);
      await svc.addImage(item.id, PHOTO, FAMILY_A);

      await svc.deleteItem(item.id, FAMILY_A);
      expect(blobs.keys()).toHaveLength(0);
    });
  });
});
