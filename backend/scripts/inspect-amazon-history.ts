#!/usr/bin/env tsx
/**
 * Read the Amazon item history for one family (AI-AMAZON-RECEIPT-BRD REQ-A210).
 *
 * Prints how many item decisions are recorded and where they came from, and
 * the acceptance rate of the AI's suggestions (accepted unchanged vs changed),
 * overall and by confidence band. Rows imported from before v2.0 carry no
 * suggestion and are excluded from acceptance.
 *
 * Read-only by construction, like inspect-traces.ts: it holds only `read`
 * and `list`, never a DataService (whose constructor writes).
 *
 *   npx tsx backend/scripts/inspect-amazon-history.ts --list
 *   npx tsx backend/scripts/inspect-amazon-history.ts --family <id> --prod
 *   npx tsx backend/scripts/inspect-amazon-history.ts --family <id> --prod --since 30d --rows
 */

import * as path from 'path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.join(__dirname, '..', '.env') });

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const has = (name: string) => process.argv.includes(`--${name}`);

if (has('prod')) {
  const bucket = process.env.PRODUCTION_S3_BUCKET_NAME;
  if (!bucket) {
    console.error('--prod requires PRODUCTION_S3_BUCKET_NAME in env (see backend/.env)');
    process.exit(1);
  }
  process.env.STORAGE_TYPE = 's3';
  process.env.S3_BUCKET_NAME = bucket;
  process.env.S3_PREFIX = process.env.PRODUCTION_S3_PREFIX || 'data/';
  console.log(`[PROD] bucket=${bucket} prefix=${process.env.S3_PREFIX} region=${process.env.AWS_REGION}\n`);
}

import { StorageFactory } from '../src/services/storage/storageFactory';
import type { StorageAdapter } from '../src/services/storage/types';
import type { AmazonItemHistory, AmazonItemHistoryEntry } from '../src/shared/types';

const PREFIX = 'amazon_item_history_';

function readOnlyStorage(): Pick<StorageAdapter, 'read' | 'list'> {
  const adapter = StorageFactory.getAdapter();
  return { read: key => adapter.read(key), list: prefix => adapter.list(prefix) };
}

/** `--since 90m` / `--since 3h` / `--since 30d`, or an ISO timestamp. */
function parseSince(raw: string | undefined): number {
  if (!raw) return 0;
  const rel = /^(\d+)([mhd])$/.exec(raw);
  if (rel) {
    const unit = { m: 60_000, h: 3_600_000, d: 86_400_000 }[rel[2] as 'm' | 'h' | 'd'];
    return Date.now() - Number(rel[1]) * unit;
  }
  const abs = Date.parse(raw);
  if (Number.isNaN(abs)) {
    console.error(`Could not read --since "${raw}". Use 90m, 3h, 30d, or an ISO timestamp.`);
    process.exit(1);
  }
  return abs;
}

function acceptance(label: string, rows: AmazonItemHistoryEntry[]): void {
  const judged = rows.filter(r => r.suggestedCategoryId !== null);
  if (judged.length === 0) return;
  const accepted = judged.filter(r => r.suggestedCategoryId === r.appliedCategoryId).length;
  const pct = Math.round((accepted / judged.length) * 100);
  console.log(`  ${label.padEnd(16)} ${String(judged.length).padStart(4)} items · accepted ${accepted} (${pct}%) · changed ${judged.length - accepted}`);
}

async function main(): Promise<void> {
  const store = readOnlyStorage();

  if (has('list')) {
    const keys = await store.list(PREFIX);
    if (keys.length === 0) return console.log('No Amazon item history found. (Wrong storage target? Try --prod.)');
    for (const key of keys) {
      const familyId = key.replace(PREFIX, '').replace(/\.json$/, '');
      const h = await store.read<AmazonItemHistory>(`${PREFIX}${familyId}`);
      console.log(`  ${familyId}  ${String(h?.entries.length ?? 0).padStart(5)} items  imported ${h?.importedAt || 'not yet'}`);
    }
    return;
  }

  const familyId = flag('family');
  if (!familyId) {
    console.error('Pass --family <id>, or --list to see which families have history.');
    process.exit(1);
  }
  const history = await store.read<AmazonItemHistory>(`${PREFIX}${familyId}`);
  if (!history) return console.log('No history yet. It is created on the first categorization after v2.0.');

  const since = parseSince(flag('since'));
  const rows = history.entries.filter(e => Date.parse(e.recordedAt) >= since);
  const bySource = (s: AmazonItemHistoryEntry['source']) => rows.filter(r => r.source === s).length;

  console.log(`Imported ${history.importedAt || 'not yet'} · ${rows.length} items in range`);
  console.log(`  sources          categorize ${bySource('categorize')} · split ${bySource('split')} · import ${bySource('import')}\n`);
  console.log('Acceptance (rows recorded since v2.0, which carry the AI suggestion):');
  acceptance('all', rows);
  acceptance('high (>=0.85)', rows.filter(r => (r.suggestedConfidence ?? 0) >= 0.85));
  acceptance('medium', rows.filter(r => (r.suggestedConfidence ?? 0) >= 0.5 && (r.suggestedConfidence ?? 0) < 0.85));
  acceptance('low (<0.5)', rows.filter(r => r.suggestedConfidence !== null && r.suggestedConfidence < 0.5));

  if (has('rows')) {
    console.log('');
    for (const r of rows) {
      const verdict = r.suggestedCategoryId === null ? 'import ' : r.suggestedCategoryId === r.appliedCategoryId ? 'accept ' : 'changed';
      console.log(`  ${r.recordedAt.slice(0, 10)} ${verdict} ${r.itemName.slice(0, 50).padEnd(50)} suggested=${r.suggestedCategoryId ?? '-'} applied=${r.appliedCategoryId}`);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
