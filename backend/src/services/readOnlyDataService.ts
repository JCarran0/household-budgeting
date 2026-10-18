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
import { libraryFamilyPrefix } from '../validators/libraryValidators';

/**
 * Family ids are UUIDs. Requiring "no underscore" is what makes the library
 * prefix unambiguous: `library_{A}_` can only be a prefix of another family's
 * key if that family's id starts with `{A}_`, which this rules out.
 */
const FAMILY_ID_SHAPE = /^[A-Za-z0-9-]{1,64}$/;

export interface ReadOnlyDataService {
  getData<T>(key: string): Promise<T | null>;
  getCategories(familyId: string): Promise<Category[]>;
  /**
   * Keys of ONE family's library documents (FAMILY-LIBRARY-BRD SEC-F004).
   *
   * Deliberately not a general `listKeys(prefix)`: the chatbot gets exactly one
   * listing, already scoped to a family, so no read can enumerate another
   * household's keys or the `library_evals_` answer keys. Throws, rather than
   * listing the bucket, when the family id is missing or malformed.
   */
  listLibraryKeys(familyId: string): Promise<string[]>;
}

export class ReadOnlyDataServiceImpl implements ReadOnlyDataService {
  constructor(private readonly dataService: DataService) {}

  getData<T>(key: string): Promise<T | null> {
    return this.dataService.getData<T>(key);
  }

  getCategories(familyId: string): Promise<Category[]> {
    return this.dataService.getCategories(familyId);
  }

  async listLibraryKeys(familyId: string): Promise<string[]> {
    if (typeof familyId !== 'string' || !FAMILY_ID_SHAPE.test(familyId)) {
      throw new Error('listLibraryKeys requires a well-formed familyId');
    }
    const prefix = libraryFamilyPrefix(familyId);
    const keys = await this.dataService.listKeys(prefix);
    // Adapters already filter by prefix; re-checking costs nothing and keeps
    // the guarantee independent of any one adapter's implementation.
    return keys.filter(k => k.startsWith(prefix));
  }
}
