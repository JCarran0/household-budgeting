import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
import { StorageAdapter } from './types';

/**
 * S3 storage adapter for production
 * Stores data as JSON objects in an S3 bucket
 */
export class S3Adapter implements StorageAdapter {
  private s3Client: S3Client;
  private bucketName: string;
  private prefix: string;

  constructor(bucketName?: string, region?: string, prefix?: string) {
    this.bucketName = bucketName || process.env.S3_BUCKET_NAME || 'budget-app-data';
    this.prefix = prefix || process.env.S3_PREFIX || 'data/';
    
    // Initialize S3 client
    // In production on EC2, this will use IAM role credentials automatically
    this.s3Client = new S3Client({
      region: region || process.env.AWS_REGION || 'us-east-1',
      // Credentials will be automatically loaded from IAM role in EC2
    });
  }

  private getS3Key(key: string): string {
    // Ensure .json extension and add prefix
    const fileName = key.endsWith('.json') ? key : `${key}.json`;
    return `${this.prefix}${fileName}`;
  }

  async read<T = any>(key: string): Promise<T | null> {
    try {
      const s3Key = this.getS3Key(key);
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });

      const response = await this.s3Client.send(command);
      
      if (response.Body) {
        const bodyString = await response.Body.transformToString();
        return JSON.parse(bodyString) as T;
      }
      
      return null;
    } catch (error: any) {
      // NoSuchKey error means file doesn't exist - return null
      if (error.name === 'NoSuchKey') {
        return null;
      }
      console.error(`Error reading data from S3 for key ${key}:`, error);
      return null;
    }
  }

  async write<T = any>(key: string, data: T): Promise<void> {
    try {
      const s3Key = this.getS3Key(key);
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        Body: JSON.stringify(data, null, 2),
        ContentType: 'application/json',
        // Add server-side encryption
        ServerSideEncryption: 'AES256',
      });

      await this.s3Client.send(command);
    } catch (error) {
      console.error(`Error writing data to S3 for key ${key}:`, error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const s3Key = this.getS3Key(key);
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });

      await this.s3Client.send(command);
    } catch (error) {
      console.error(`Error deleting data from S3 for key ${key}:`, error);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const s3Key = this.getS3Key(key);
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.name === 'NoSuchKey') {
        return false;
      }
      console.error(`Error checking existence in S3 for key ${key}:`, error);
      return false;
    }
  }

  async list(prefix: string): Promise<string[]> {
    try {
      const s3Prefix = `${this.prefix}${prefix}`;
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: s3Prefix,
        MaxKeys: 1000, // Adjust if needed
      });

      const response = await this.s3Client.send(command);
      
      if (!response.Contents) {
        return [];
      }

      // Extract keys and remove prefix and .json extension
      return response.Contents
        .map(obj => obj.Key || '')
        .filter(key => key.endsWith('.json'))
        .map(key => {
          // Remove prefix and .json extension
          const withoutPrefix = key.substring(this.prefix.length);
          return withoutPrefix.replace(/\.json$/, '');
        });
    } catch (error) {
      console.error(`Error listing objects in S3 with prefix ${prefix}:`, error);
      return [];
    }
  }
}