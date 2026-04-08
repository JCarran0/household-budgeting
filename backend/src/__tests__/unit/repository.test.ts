/**
 * Tests for the generic Repository base class
 *
 * Uses InMemoryDataService to exercise real storage behavior without mocking.
 */

import { InMemoryDataService } from '../../services/dataService';
import { Repository } from '../../services/repository';

interface TestEntity {
  id: string;
  name: string;
  value: number;
}

describe('Repository', () => {
  let dataService: InMemoryDataService;
  let repo: Repository<TestEntity>;

  beforeEach(() => {
    dataService = new InMemoryDataService();
    repo = new Repository<TestEntity>(dataService, 'items');
  });

  // -------------------------------------------------------------------------
  // Key generation
  // -------------------------------------------------------------------------

  describe('key()', () => {
    it('produces {entityName}_{userId}', () => {
      // Access protected method via subclass for white-box testing
      class ExposedRepo extends Repository<TestEntity> {
        public expose(userId: string): string {
          return this.key(userId);
        }
      }
      const exposed = new ExposedRepo(dataService, 'things');
      expect(exposed.expose('user-1')).toBe('things_user-1');
    });

    it('different entity names produce different keys', () => {
      class ExposedRepo extends Repository<TestEntity> {
        public expose(userId: string): string {
          return this.key(userId);
        }
      }
      const repoA = new ExposedRepo(dataService, 'alpha');
      const repoB = new ExposedRepo(dataService, 'beta');
      expect(repoA.expose('user-1')).not.toBe(repoB.expose('user-1'));
    });

    it('different user IDs produce different keys', () => {
      class ExposedRepo extends Repository<TestEntity> {
        public expose(userId: string): string {
          return this.key(userId);
        }
      }
      const exposed = new ExposedRepo(dataService, 'items');
      expect(exposed.expose('user-1')).not.toBe(exposed.expose('user-2'));
    });
  });

  // -------------------------------------------------------------------------
  // getAll
  // -------------------------------------------------------------------------

  describe('getAll()', () => {
    it('returns empty array when no data is stored', async () => {
      const result = await repo.getAll('user-1');
      expect(result).toEqual([]);
    });

    it('returns stored data when present', async () => {
      const items: TestEntity[] = [
        { id: 'a', name: 'Alice', value: 1 },
        { id: 'b', name: 'Bob', value: 2 },
      ];
      await repo.saveAll('user-1', items);

      const result = await repo.getAll('user-1');
      expect(result).toEqual(items);
    });

    it('returns data for the correct user (user isolation)', async () => {
      const user1Items: TestEntity[] = [{ id: 'a', name: 'Alice', value: 1 }];
      const user2Items: TestEntity[] = [{ id: 'b', name: 'Bob', value: 2 }];

      await repo.saveAll('user-1', user1Items);
      await repo.saveAll('user-2', user2Items);

      expect(await repo.getAll('user-1')).toEqual(user1Items);
      expect(await repo.getAll('user-2')).toEqual(user2Items);
    });
  });

  // -------------------------------------------------------------------------
  // saveAll
  // -------------------------------------------------------------------------

  describe('saveAll()', () => {
    it('saves data that can be retrieved with getAll', async () => {
      const items: TestEntity[] = [{ id: 'a', name: 'Alice', value: 1 }];
      await repo.saveAll('user-1', items);
      expect(await repo.getAll('user-1')).toEqual(items);
    });

    it('overwrites previous data completely', async () => {
      await repo.saveAll('user-1', [{ id: 'a', name: 'Alice', value: 1 }]);
      const updated: TestEntity[] = [{ id: 'b', name: 'Bob', value: 99 }];
      await repo.saveAll('user-1', updated);

      const result = await repo.getAll('user-1');
      expect(result).toEqual(updated);
      expect(result).toHaveLength(1);
    });

    it('saving an empty array results in getAll returning []', async () => {
      await repo.saveAll('user-1', [{ id: 'a', name: 'Alice', value: 1 }]);
      await repo.saveAll('user-1', []);
      expect(await repo.getAll('user-1')).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // findBy
  // -------------------------------------------------------------------------

  describe('findBy()', () => {
    const items: TestEntity[] = [
      { id: 'a', name: 'Alice', value: 10 },
      { id: 'b', name: 'Bob', value: 20 },
      { id: 'c', name: 'Carol', value: 30 },
    ];

    beforeEach(async () => {
      await repo.saveAll('user-1', items);
    });

    it('finds an entity by a string field value', async () => {
      const result = await repo.findBy('user-1', 'name', 'Bob');
      expect(result).toEqual({ id: 'b', name: 'Bob', value: 20 });
    });

    it('finds an entity by a numeric field value', async () => {
      const result = await repo.findBy('user-1', 'value', 30);
      expect(result).toEqual({ id: 'c', name: 'Carol', value: 30 });
    });

    it('returns undefined when no entity matches', async () => {
      const result = await repo.findBy('user-1', 'name', 'Zara');
      expect(result).toBeUndefined();
    });

    it('returns undefined when collection is empty', async () => {
      const result = await repo.findBy('user-2', 'name', 'Alice');
      expect(result).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------

  describe('findById()', () => {
    const items: TestEntity[] = [
      { id: 'x1', name: 'Xavier', value: 5 },
      { id: 'x2', name: 'Xena', value: 15 },
    ];

    beforeEach(async () => {
      await repo.saveAll('user-1', items);
    });

    it('finds an entity by id field', async () => {
      const result = await repo.findById('user-1', 'x2');
      expect(result).toEqual({ id: 'x2', name: 'Xena', value: 15 });
    });

    it('returns undefined when the id does not exist', async () => {
      const result = await repo.findById('user-1', 'missing-id');
      expect(result).toBeUndefined();
    });

    it('returns undefined when the collection is empty', async () => {
      const result = await repo.findById('user-2', 'x1');
      expect(result).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // deleteAll
  // -------------------------------------------------------------------------

  describe('deleteAll()', () => {
    it('removes all data for a user', async () => {
      await repo.saveAll('user-1', [{ id: 'a', name: 'Alice', value: 1 }]);
      await repo.deleteAll('user-1');
      expect(await repo.getAll('user-1')).toEqual([]);
    });

    it('getAll returns empty array after deleteAll', async () => {
      await repo.saveAll('user-1', [
        { id: 'a', name: 'Alice', value: 1 },
        { id: 'b', name: 'Bob', value: 2 },
      ]);
      await repo.deleteAll('user-1');
      const result = await repo.getAll('user-1');
      expect(result).toEqual([]);
    });

    it('does not affect other users data', async () => {
      const user2Items: TestEntity[] = [{ id: 'b', name: 'Bob', value: 2 }];
      await repo.saveAll('user-1', [{ id: 'a', name: 'Alice', value: 1 }]);
      await repo.saveAll('user-2', user2Items);

      await repo.deleteAll('user-1');

      expect(await repo.getAll('user-2')).toEqual(user2Items);
    });
  });

  // -------------------------------------------------------------------------
  // User isolation (cross-cutting)
  // -------------------------------------------------------------------------

  describe('User isolation', () => {
    it('data saved for user A is not visible to user B', async () => {
      await repo.saveAll('user-A', [{ id: 'a', name: 'Alice', value: 1 }]);
      expect(await repo.getAll('user-B')).toEqual([]);
    });

    it('saving for user A does not affect user B', async () => {
      const user2Items: TestEntity[] = [{ id: 'b', name: 'Bob', value: 2 }];
      await repo.saveAll('user-B', user2Items);
      await repo.saveAll('user-A', [{ id: 'a', name: 'Alice', value: 1 }]);

      expect(await repo.getAll('user-B')).toEqual(user2Items);
    });

    it('deleting for user A does not affect user B', async () => {
      const user2Items: TestEntity[] = [{ id: 'b', name: 'Bob', value: 2 }];
      await repo.saveAll('user-A', [{ id: 'a', name: 'Alice', value: 1 }]);
      await repo.saveAll('user-B', user2Items);

      await repo.deleteAll('user-A');

      expect(await repo.getAll('user-B')).toEqual(user2Items);
    });

    it('different entity names for same user are isolated', async () => {
      const transactionRepo = new Repository<TestEntity>(dataService, 'transactions');
      const budgetRepo = new Repository<TestEntity>(dataService, 'budgets');

      await transactionRepo.saveAll('user-1', [{ id: 't1', name: 'Tx', value: 50 }]);
      await budgetRepo.saveAll('user-1', [{ id: 'bg1', name: 'Budget', value: 200 }]);

      expect(await transactionRepo.getAll('user-1')).toHaveLength(1);
      expect(await budgetRepo.getAll('user-1')).toHaveLength(1);
      expect(await transactionRepo.getAll('user-1')).not.toEqual(await budgetRepo.getAll('user-1'));
    });
  });
});
