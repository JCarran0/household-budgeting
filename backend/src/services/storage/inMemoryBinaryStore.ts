import { BinaryObjectStore, BinaryObject } from './types';

/** Test double for `BinaryObjectStore` — used when NODE_ENV=test. */
export class InMemoryBinaryStore implements BinaryObjectStore {
  private objects = new Map<string, BinaryObject>();

  async putObject(
    key: string,
    body: Buffer,
    options: { contentType: string; metadata: Record<string, string> }
  ): Promise<void> {
    this.objects.set(key, { body: Buffer.from(body), ...options });
  }

  async getObject(key: string): Promise<BinaryObject | null> {
    return this.objects.get(key) ?? null;
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }

  /** Test helper: every stored key. */
  keys(): string[] {
    return [...this.objects.keys()];
  }
}
