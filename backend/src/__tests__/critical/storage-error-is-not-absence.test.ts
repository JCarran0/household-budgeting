/**
 * An error is not an absence — storage read semantics
 *
 * THE FAILURE THIS PREVENTS
 * Every read in the storage layer used to answer a failure exactly the way it
 * answers a missing object: `read` returned null, `exists` returned false,
 * `list` returned []. Callers then did the reasonable thing with "there is
 * nothing there" — `?? []` — and the read-modify-write paths wrote that empty
 * list back.
 *
 * So a throttle, an expired credential or an IAM propagation delay did not
 * present as an outage. It presented as an empty household: no users, so login
 * failed as "invalid credentials"; no families; and the next write made it
 * permanent. The sharpest edge was `ensureInitialData`, called unawaited from
 * the UnifiedDataService constructor, which wrote `{ users: [] }` over the
 * roster whenever HeadObject failed — on every boot, every deploy, every PM2
 * restart.
 *
 * These tests are about data loss and auth, which is why they live in
 * critical/. They assert the distinction directly: missing is empty, broken
 * throws, and nothing writes on the way up.
 */

import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { FilesystemAdapter } from '../../services/storage/filesystemAdapter';
import { S3Adapter } from '../../services/storage/s3Adapter';
import { UnifiedDataService } from '../../services/dataService';
import type { StorageAdapter } from '../../services/storage/types';

/** The two failures that mean "it isn't there" — and nothing else does. */
function notFound(name: 'NoSuchKey' | 'NotFound'): Error {
  return Object.assign(new Error(name), { name });
}

function accessDenied(): Error {
  return Object.assign(new Error('Access Denied'), {
    name: 'AccessDenied',
    $metadata: { httpStatusCode: 403 },
  });
}

function withSend(send: jest.Mock): S3Adapter {
  const adapter = new S3Adapter('test-bucket', 'us-east-1', 'data/');
  (adapter as unknown as { s3Client: { send: jest.Mock } }).s3Client = { send };
  return adapter;
}

describe('S3Adapter distinguishes missing from broken', () => {
  it('reads a missing object as null', async () => {
    const adapter = withSend(jest.fn().mockRejectedValue(notFound('NoSuchKey')));
    await expect(adapter.read('users')).resolves.toBeNull();
  });

  it('THROWS on a read that failed for any other reason', async () => {
    const adapter = withSend(jest.fn().mockRejectedValue(accessDenied()));
    // Before: resolved to null, and the caller read that as "no data".
    await expect(adapter.read('users')).rejects.toThrow(/Access Denied/);
  });

  it('reports a missing object as not existing', async () => {
    const adapter = withSend(jest.fn().mockRejectedValue(notFound('NotFound')));
    await expect(adapter.exists('users')).resolves.toBe(false);
  });

  it('THROWS rather than reporting "does not exist" when the check itself failed', async () => {
    const adapter = withSend(jest.fn().mockRejectedValue(accessDenied()));
    await expect(adapter.exists('users')).rejects.toThrow(/Access Denied/);
  });

  it('THROWS on a failed listing instead of reporting an empty bucket', async () => {
    const adapter = withSend(jest.fn().mockRejectedValue(accessDenied()));
    await expect(adapter.list('accounts_')).rejects.toThrow(/Access Denied/);
  });
});

/** A storage layer where every read fails — i.e. S3 is having a bad minute. */
function brokenStorage(): StorageAdapter & { writes: Array<[string, unknown]> } {
  const writes: Array<[string, unknown]> = [];
  return {
    writes,
    read: async () => { throw accessDenied(); },
    exists: async () => { throw accessDenied(); },
    list: async () => { throw accessDenied(); },
    write: async (key: string, data: unknown) => { writes.push([key, data]); },
    delete: async () => {},
  };
}

describe('UnifiedDataService does not turn a storage failure into an empty household', () => {
  it('writes NOTHING when constructed', async () => {
    const storage = brokenStorage();

    new UnifiedDataService(storage);
    // The old ensureInitialData was async and unawaited, so give it every
    // chance to have run before asserting it did not.
    await new Promise(resolve => setImmediate(resolve));

    expect(storage.writes).toEqual([]);
  });

  it('fails a user lookup loudly instead of answering "no such user"', async () => {
    const data = new UnifiedDataService(brokenStorage());

    // Returning null here is what made a flaky bucket look like a wrong password.
    await expect(data.getUserByUsername('jared')).rejects.toThrow(/Access Denied/);
  });

  it('refuses to persist an empty roster when the read behind it failed', async () => {
    const storage = brokenStorage();
    const data = new UnifiedDataService(storage);

    await expect(
      data.createUser({
        id: 'u1',
        username: 'jared',
        displayName: 'Jared',
        passwordHash: 'hash',
        familyId: 'fam-1',
        createdAt: new Date(),
      } as Parameters<UnifiedDataService['createUser']>[0]),
    ).rejects.toThrow(/Access Denied/);

    // The read-modify-write is the mechanism that made this permanent.
    expect(storage.writes).toEqual([]);
  });

  it('still treats a genuinely missing file as an empty list', async () => {
    const storage: StorageAdapter = {
      read: async () => null,
      exists: async () => false,
      list: async () => [],
      write: async () => {},
      delete: async () => {},
    };

    await expect(new UnifiedDataService(storage).getFamilies()).resolves.toEqual([]);
  });
});

describe('the filesystem adapter draws the same line', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-semantics-'));
  });

  afterEach(async () => {
    await fs.remove(dir);
  });

  it('reads a missing file as null', async () => {
    await expect(new FilesystemAdapter(dir).read('users')).resolves.toBeNull();
  });

  it('THROWS on a file it cannot parse, rather than reporting no data', async () => {
    // What a write interrupted by a crash or a full disk leaves behind. Reading
    // this as "no users" is how a truncated file becomes an empty one.
    await fs.writeFile(path.join(dir, 'users.json'), '{"users": [{"id": "u1"');

    await expect(new FilesystemAdapter(dir).read('users')).rejects.toThrow();
  });

  it('round-trips ordinary data unchanged', async () => {
    const adapter = new FilesystemAdapter(dir);
    await adapter.write('users', { users: [{ id: 'u1' }] });

    await expect(adapter.read('users')).resolves.toEqual({ users: [{ id: 'u1' }] });
  });
});
