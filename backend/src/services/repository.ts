import { DataService } from './dataService';

/**
 * Generic repository for user-scoped entity collections stored via DataService.
 *
 * Encapsulates the key naming convention (`{entityName}_{userId}`) and the
 * common load/save/find patterns repeated across services.
 */
export class Repository<T> {
  constructor(
    protected readonly dataService: DataService,
    protected readonly entityName: string
  ) {}

  /** Build the storage key for a given user */
  protected key(userId: string): string {
    return `${this.entityName}_${userId}`;
  }

  /** Load all entities for a user (returns empty array if none stored) */
  async getAll(userId: string): Promise<T[]> {
    return (await this.dataService.getData<T[]>(this.key(userId))) ?? [];
  }

  /** Replace the full entity collection for a user */
  async saveAll(userId: string, items: T[]): Promise<void> {
    await this.dataService.saveData(this.key(userId), items);
  }

  /** Find a single entity by a field value */
  async findBy<K extends keyof T>(
    userId: string,
    field: K,
    value: T[K]
  ): Promise<T | undefined> {
    const all = await this.getAll(userId);
    return all.find(item => item[field] === value);
  }

  /** Find a single entity by id (convenience wrapper) */
  async findById(userId: string, id: string): Promise<T | undefined> {
    return this.findBy(userId, 'id' as keyof T, id as T[keyof T]);
  }

  /** Delete all entities for a user */
  async deleteAll(userId: string): Promise<void> {
    await this.dataService.deleteData(this.key(userId));
  }
}
