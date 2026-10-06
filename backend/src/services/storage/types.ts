/**
 * Storage adapter interface for flexible data storage
 * Allows switching between filesystem (local dev) and S3 (production)
 */
export interface StorageAdapter {
  /**
   * Read data from storage
   * @param key - The storage key (file path or S3 key)
   * @returns The parsed JSON data or null if not found
   */
  read<T = any>(key: string): Promise<T | null>;

  /**
   * Write data to storage
   * @param key - The storage key (file path or S3 key)
   * @param data - The data to store (will be JSON stringified)
   */
  write<T = any>(key: string, data: T): Promise<void>;

  /**
   * Delete data from storage
   * @param key - The storage key (file path or S3 key)
   */
  delete(key: string): Promise<void>;

  /**
   * Check if a key exists in storage
   * @param key - The storage key to check
   */
  exists(key: string): Promise<boolean>;

  /**
   * List all keys matching a prefix
   * @param prefix - The prefix to match (e.g., "budgets_")
   */
  list(prefix: string): Promise<string[]>;
}

/**
 * A stored binary object (an image, today) with the content type it was
 * written with and the owner metadata recorded alongside it.
 */
export interface BinaryObject {
  body: Buffer;
  contentType: string;
  metadata: Record<string, string>;
}

/**
 * Raw binary storage, alongside the JSON documents of `StorageAdapter`.
 *
 * Kept as a separate interface on purpose: `StorageAdapter` is what
 * `DataService` (and through it, `ReadOnlyDataService` and the chatbot) is
 * built on. Binary objects are reached only through `imageStore`, so adding
 * them gives the AI no new read path.
 *
 * Keys are used verbatim — no `.json` suffix — under the same prefix as the
 * JSON documents, so bucket versioning, IAM scope and the off-bucket snapshot
 * (which syncs the whole prefix) cover them with no infrastructure change.
 * `StorageAdapter.list` filters to `.json`, so these never appear in it.
 */
export interface BinaryObjectStore {
  putObject(
    key: string,
    body: Buffer,
    options: { contentType: string; metadata: Record<string, string> }
  ): Promise<void>;
  /** Null only when the object genuinely does not exist; other failures throw. */
  getObject(key: string): Promise<BinaryObject | null>;
  /** Deleting an absent object is not an error. */
  deleteObject(key: string): Promise<void>;
}

export interface StorageConfig {
  type: 'filesystem' | 's3';
  // Filesystem specific
  dataDir?: string;
  // S3 specific
  bucketName?: string;
  region?: string;
  prefix?: string;
}