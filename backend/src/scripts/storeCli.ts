/**
 * Shared plumbing for the maintainer scripts that stage locally and push to
 * production (`npm run library`, `npm run ledger`). Each script keeps its own
 * validation; this module holds only argument parsing, the production store,
 * and the personal-workspace check both features depend on.
 */

import * as fs from 'fs';
import { S3Adapter } from '../services/storage/s3Adapter';
import type { StorageAdapter } from '../services/storage/types';
import type { Family } from '../shared/types';

export type Args = Record<string, string | true>;

export function parseArgs(argv: string[]): { command: string | undefined; args: Args } {
  const [command, ...rest] = argv;
  const args: Args = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) continue;
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      args[a.slice(2)] = next;
      i++;
    } else {
      args[a.slice(2)] = true;
    }
  }
  return { command, args };
}

export function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

export function requireArg(args: Args, name: string): string {
  const v = args[name];
  if (typeof v !== 'string' || v.length === 0) fail(`--${name} is required`);
  return v;
}

export function readJsonFile(path: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (err) {
    fail(`could not read JSON from ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function formatIssues(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): string {
  return issues.map(i => `  - ${i.path.map(String).join('.') || '(root)'}: ${i.message}`).join('\n');
}

export function prodStore(): StorageAdapter {
  const bucket = process.env.PRODUCTION_S3_BUCKET_NAME;
  if (!bucket) fail('PRODUCTION_S3_BUCKET_NAME is not set (see docs/AWS-LOCAL-SETUP.md)');
  return new S3Adapter(bucket, process.env.AWS_REGION, process.env.PRODUCTION_S3_PREFIX || 'data/');
}

/** Library and ledger belong to personal families only — business is excluded from AI entirely. */
export async function requirePersonalFamily(store: StorageAdapter, familyId: string, feature: string): Promise<Family> {
  const blob = await store.read<{ families?: Family[] }>('families');
  const family = blob?.families?.find(f => f.id === familyId);
  if (!family) fail(`family ${familyId} not found`);
  if (family.workspaceType === 'business') fail(`family ${familyId} is a business workspace; the ${feature} is not available there`);
  return family;
}
