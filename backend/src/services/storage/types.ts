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

export interface StorageConfig {
  type: 'filesystem' | 's3';
  // Filesystem specific
  dataDir?: string;
  // S3 specific
  bucketName?: string;
  region?: string;
  prefix?: string;
}