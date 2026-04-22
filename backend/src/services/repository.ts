import { Mutex } from 'async-mutex';
import { DataService } from './dataService';

/**
 * Generic repository for family-scoped entity collections stored via DataService.
 *
 * Encapsulates the key naming convention (`{entityName}_{familyId}`) and the
 * common load/save/find patterns repeated across services.
 *
 * TD-011 part 1a — `withLock(familyId, fn)` serializes read-modify-write
 * cycles per family. Without it, two concurrent requests from the same family
 * (realistic in a 2-person household using web + mobile) can each load the
 * same collection, apply independent edits in memory, and overwrite each
 * other on save. Wrap any `getAll → mutate → saveAll` sequence in `withLock`
 * to guarantee the slower request sees the faster request's write.
 */
export class Repository<T> {
  private readonly mutexes = new Map<string, Mutex>();

  constructor(
    protected readonly dataService: DataService,
    protected readonly entityName: string
  ) {}

  /** Build the storage key for a given family */
  protected key(familyId: string): string {
    return `${this.entityName}_${familyId}`;
  }

  /** Load all entities for a family (returns empty array if none stored) */
  async getAll(familyId: string): Promise<T[]> {
    return (await this.dataService.getData<T[]>(this.key(familyId))) ?? [];
  }

  /** Replace the full entity collection for a family */
  async saveAll(familyId: string, items: T[]): Promise<void> {
    await this.dataService.saveData(this.key(familyId), items);
  }

  /** Find a single entity by a field value */
  async findBy<K extends keyof T>(
    familyId: string,
    field: K,
    value: T[K]
  ): Promise<T | undefined> {
    const all = await this.getAll(familyId);
    return all.find(item => item[field] === value);
  }

  /** Find a single entity by id (convenience wrapper) */
  async findById(familyId: string, id: string): Promise<T | undefined> {
    return this.findBy(familyId, 'id' as keyof T, id as T[keyof T]);
  }

  /** Delete all entities for a family */
  async deleteAll(familyId: string): Promise<void> {
    await this.dataService.deleteData(this.key(familyId));
  }

  /**
   * Run `fn` under a per-`familyId` mutex scoped to this repository.
   *
   * Use for any `getAll → mutate → saveAll` cycle that must be atomic with
   * respect to other writers of the same collection. The mutex is *not*
   * re-entrant; nested calls with the same `familyId` on the same repository
   * will deadlock.
   */
  async withLock<R>(familyId: string, fn: () => Promise<R>): Promise<R> {
    let mutex = this.mutexes.get(familyId);
    if (!mutex) {
      mutex = new Mutex();
      this.mutexes.set(familyId, mutex);
    }
    const release = await mutex.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}
