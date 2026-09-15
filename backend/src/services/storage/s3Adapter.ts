import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
import { StorageAdapter } from './types';
import { childLogger } from '../../utils/logger';

const log = childLogger('s3Adapter');

/**
 * S3 storage adapter for production
 * Stores data as JSON objects in an S3 bucket
 *
 * AN ERROR IS NOT AN ABSENCE.
 *
 * Every read here used to answer a failure the same way it answers a missing
 * object: `read` returned null, `exists` returned false. Callers then did what
 * callers reasonably do with "there is nothing there" — `?? []`, and on the
 * read-modify-write paths, wrote that empty list back.
 *
 * So a throttle, an expired credential, an IAM propagation delay or a network
 * blip did not surface as an outage. It surfaced as an empty household: no
 * users (login fails as "invalid credentials"), no families, no transactions —
 * and the next write persisted whichever of those we happened to believe.
 * `ensureInitialData` was the sharpest edge of the same rule, overwriting the
 * user roster with `{ users: [] }` at boot whenever HeadObject failed for any
 * reason; it has been deleted rather than guarded.
 *
 * Only the errors that genuinely mean "no such object" are absence now.
 * Everything else throws, and an unreachable bucket looks like an unreachable
 * bucket. `write` and `delete` already worked this way — the asymmetry was
 * always in the reads.
 */

/**
 * The S3 vocabulary for "it isn't there", which is the only kind of empty.
 *
 * This rule DEPENDS on the caller holding `s3:ListBucket`: without it, S3
 * answers GetObject for a missing key with 403 AccessDenied rather than 404, to
 * avoid disclosing whether the key exists — and every first write of a new key
 * would then throw here instead of finding an empty slot. The instance role
 * grants it (terraform/s3-data.tf), which is what makes a 404 mean what it
 * says. If that grant is ever narrowed, this function is the thing that breaks.
 */
function isGenuinelyMissing(error: unknown): boolean {
  const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    err?.name === 'NoSuchKey' ||
    err?.name === 'NotFound' ||
    err?.$metadata?.httpStatusCode === 404
  );
}
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
    } catch (error: unknown) {
      if (isGenuinelyMissing(error)) return null;
      log.error({ err: error, key }, 'error reading data from s3');
      throw error;
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
      log.error({ err: error, key }, 'error writing data to s3');
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
      log.error({ err: error, key }, 'error deleting data from s3');
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
    } catch (error: unknown) {
      if (isGenuinelyMissing(error)) return false;
      log.error({ err: error, key }, 'error checking existence in s3');
      throw error;
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
      // Same rule: a listing that failed is not a listing that found nothing.
      // Callers use this to discover which families exist and which accounts a
      // webhook belongs to — an empty answer there is a silent miss.
      log.error({ err: error, prefix }, 'error listing objects in s3');
      throw error;
    }
  }
}