import { StorageAdapter, StorageConfig } from './types';
import { FilesystemAdapter } from './filesystemAdapter';
import { S3Adapter } from './s3Adapter';

/**
 * Factory for creating storage adapters based on environment
 */
export class StorageFactory {
  private static instance: StorageAdapter | null = null;

  /**
   * Get or create a storage adapter based on environment
   * Uses filesystem for development, S3 for production
   */
  static getAdapter(config?: StorageConfig): StorageAdapter {
    // Return existing instance if available (singleton pattern)
    if (this.instance) {
      return this.instance;
    }

    // Determine storage type from config or environment
    const storageType = config?.type || process.env.STORAGE_TYPE || 
      (process.env.NODE_ENV === 'production' ? 's3' : 'filesystem');

    switch (storageType) {
      case 's3':
        console.log('Using S3 storage adapter');
        this.instance = new S3Adapter(
          config?.bucketName || process.env.S3_BUCKET_NAME,
          config?.region || process.env.AWS_REGION,
          config?.prefix || process.env.S3_PREFIX
        );
        break;
      
      case 'filesystem':
      default:
        console.log('Using filesystem storage adapter');
        this.instance = new FilesystemAdapter(
          config?.dataDir || process.env.DATA_DIR
        );
        break;
    }

    return this.instance;
  }

  /**
   * Reset the singleton instance (mainly for testing)
   */
  static reset(): void {
    this.instance = null;
  }
}