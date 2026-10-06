import fs from 'fs-extra';
import path from 'path';
import { StorageAdapter, BinaryObjectStore, BinaryObject } from './types';
import { childLogger } from '../../utils/logger';

const log = childLogger('filesystemAdapter');

/**
 * Filesystem storage adapter for local development
 * Stores data as JSON files in a local directory
 */
export class FilesystemAdapter implements StorageAdapter, BinaryObjectStore {
  private dataDir: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir || process.env.DATA_DIR || path.join(__dirname, '../../../data');
    this.ensureDataDir();
  }

  private async ensureDataDir(): Promise<void> {
    await fs.ensureDir(this.dataDir);
  }

  private getFilePath(key: string): string {
    // Ensure .json extension
    const fileName = key.endsWith('.json') ? key : `${key}.json`;
    return path.join(this.dataDir, fileName);
  }

  /**
   * An error is not an absence — see the header comment in s3Adapter.
   *
   * A missing file is null, because that is what missing means. A file that
   * exists but cannot be read — truncated JSON from an interrupted write, a
   * permissions problem — is NOT null: answering null there tells the caller
   * the household has no data, and the next read-modify-write makes it true.
   */
  async read<T = any>(key: string): Promise<T | null> {
    const filePath = this.getFilePath(key);
    if (!(await fs.pathExists(filePath))) return null;

    try {
      return (await fs.readJson(filePath)) as T;
    } catch (error) {
      log.error({ err: error, key }, 'error reading data');
      throw error;
    }
  }

  async write<T = any>(key: string, data: T): Promise<void> {
    try {
      const filePath = this.getFilePath(key);
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeJson(filePath, data, { spaces: 2 });
    } catch (error) {
      log.error({ err: error, key }, 'error writing data');
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const filePath = this.getFilePath(key);
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
      }
    } catch (error) {
      log.error({ err: error, key }, 'error deleting data');
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.getFilePath(key);
    return await fs.pathExists(filePath);
  }

  async list(prefix: string): Promise<string[]> {
    try {
      const files = await fs.readdir(this.dataDir);
      
      // Filter files that match the prefix
      const matchingFiles = files.filter(file => {
        if (prefix === '') return file.endsWith('.json');
        return file.startsWith(prefix) && file.endsWith('.json');
      });

      // Remove .json extension from results
      return matchingFiles.map(file => file.replace(/\.json$/, ''));
    } catch (error) {
      log.error({ err: error, prefix }, 'error listing files');
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Binary objects — local dev only. The body is the file at the verbatim key;
  // content type and metadata live in a sidecar, since a filesystem has no
  // place for them. Keys sit in subdirectories, which `list` (a top-level
  // readdir) never descends into.
  // ---------------------------------------------------------------------------

  private getObjectPaths(key: string): { body: string; meta: string } {
    const body = path.resolve(this.dataDir, key);
    // Defense in depth: imageStore only builds keys from validated UUIDs, but
    // this adapter must never be the thing that writes outside dataDir.
    if (!body.startsWith(path.resolve(this.dataDir) + path.sep)) {
      throw new Error(`Object key escapes data directory: ${key}`);
    }
    return { body, meta: `${body}.meta.json` };
  }

  async putObject(
    key: string,
    body: Buffer,
    options: { contentType: string; metadata: Record<string, string> }
  ): Promise<void> {
    const paths = this.getObjectPaths(key);
    await fs.ensureDir(path.dirname(paths.body));
    await fs.writeFile(paths.body, body);
    await fs.writeJson(paths.meta, options);
  }

  async getObject(key: string): Promise<BinaryObject | null> {
    const paths = this.getObjectPaths(key);
    if (!(await fs.pathExists(paths.body))) return null;
    const [body, meta] = await Promise.all([
      fs.readFile(paths.body),
      fs.readJson(paths.meta) as Promise<{ contentType: string; metadata: Record<string, string> }>,
    ]);
    return { body, contentType: meta.contentType, metadata: meta.metadata };
  }

  async deleteObject(key: string): Promise<void> {
    const paths = this.getObjectPaths(key);
    await fs.remove(paths.body);
    await fs.remove(paths.meta);
  }
}
