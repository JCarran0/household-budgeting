import { StorageAdapter, StorageConfig } from './types';
import { FilesystemAdapter } from './filesystemAdapter';
import { S3Adapter } from './s3Adapter';

/**
 * Factory for creating storage adapters based on environment
 */
export class StorageFactory {
  private static instance: StorageAdapter | null = null;

  /**
   * Get the storage configuration from environment variables
   * This is the single source of truth for storage configuration
   */
  private static getConfigFromEnv(): StorageConfig {
    const storageType = process.env.STORAGE_TYPE || 
      (process.env.NODE_ENV === 'production' ? 's3' : 'filesystem');

    if (storageType === 's3') {
      return {
        type: 's3',
        bucketName: process.env.S3_BUCKET_NAME,
        region: process.env.AWS_REGION,
        prefix: process.env.S3_PREFIX
      };
    } else {
      return {
        type: 'filesystem',
        dataDir: process.env.DATA_DIR || './data'
      };
    }
  }

  /**
   * Get or create a storage adapter based on environment
   * Uses filesystem for development, S3 for production
   * 
   * @param config - Optional config to override environment settings (mainly for testing)
   */
  static getAdapter(config?: StorageConfig): StorageAdapter {
    // Return existing instance if available (singleton pattern)
    if (this.instance) {
      return this.instance;
    }

    // Use provided config or get from environment
    const finalConfig = config || this.getConfigFromEnv();

    switch (finalConfig.type) {
      case 's3':
        console.log('Using S3 storage adapter with config:', {
          bucketName: finalConfig.bucketName,
          region: finalConfig.region,
          prefix: finalConfig.prefix
        });
        this.instance = new S3Adapter(
          finalConfig.bucketName,
          finalConfig.region,
          finalConfig.prefix
        );
        break;
      
      case 'filesystem':
      default:
        console.log('Using filesystem storage adapter with dataDir:', finalConfig.dataDir);
        this.instance = new FilesystemAdapter(finalConfig.dataDir);
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