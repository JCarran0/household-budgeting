import { DataService } from './dataService';

/**
 * Generic repository for family-scoped entity collections stored via DataService.
 *
 * Encapsulates the key naming convention (`{entityName}_{familyId}`) and the
 * common load/save/find patterns repeated across services.
 */
export class Repository<T> {
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
}
