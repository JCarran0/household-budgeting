/**
 * ReadOnlyDataService — SEC-018 compliance
 *
 * TypeScript interface and wrapper that expose only read operations from
 * DataService. ChatbotDataService receives this instead of the full
 * DataService, providing compile-time enforcement of the read-only boundary.
 *
 * SECURITY: This interface must NEVER include saveData, deleteData,
 * saveCategories, createUser, updateUser, or any write operation.
 */

import { Category } from '../shared/types';
import { DataService } from './dataService';

export interface ReadOnlyDataService {
  getData<T>(key: string): Promise<T | null>;
  getCategories(userId: string): Promise<Category[]>;
}

export class ReadOnlyDataServiceImpl implements ReadOnlyDataService {
  constructor(private readonly dataService: DataService) {}

  getData<T>(key: string): Promise<T | null> {
    return this.dataService.getData<T>(key);
  }

  getCategories(userId: string): Promise<Category[]> {
    return this.dataService.getCategories(userId);
  }
}
