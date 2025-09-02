import fs from 'fs-extra';
import path from 'path';
import { StorageAdapter } from './types';

/**
 * Filesystem storage adapter for local development
 * Stores data as JSON files in a local directory
 */
export class FilesystemAdapter implements StorageAdapter {
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

  async read<T = any>(key: string): Promise<T | null> {
    try {
      const filePath = this.getFilePath(key);
      if (await fs.pathExists(filePath)) {
        const data = await fs.readJson(filePath);
        return data as T;
      }
      return null;
    } catch (error) {
      console.error(`Error reading data for key ${key}:`, error);
      return null;
    }
  }

  async write<T = any>(key: string, data: T): Promise<void> {
    try {
      const filePath = this.getFilePath(key);
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeJson(filePath, data, { spaces: 2 });
    } catch (error) {
      console.error(`Error writing data for key ${key}:`, error);
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
      console.error(`Error deleting data for key ${key}:`, error);
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
      console.error(`Error listing files with prefix ${prefix}:`, error);
      return [];
    }
  }
}