#!/usr/bin/env tsx
/**
 * Read the AI categorization run record for one family (AI-CATEGORIZATION-BRD
 * REQ-135).
 *
 * Prints, per run: how many suggestions were accepted, changed or skipped
 * (overall and by confidence), why transactions failed, cost, and any notes
 * the user left on a correction. This is the measurement the v2.0 Plaid
 * evidence is judged by, so runs recorded before it ships are the baseline.
 *
 * A script, not a route, for the same reason as inspect-traces.ts: the run
 * store has no read path the chatbot could reach (SEC-102), and a maintainer
 * view for a two-person household doesn't need an authorization story.
 * Read-only by construction — it holds only `read` and `list`.
 *
 *   npx tsx backend/scripts/inspect-categorization-runs.ts --list
 *   npx tsx backend/scripts/inspect-categorization-runs.ts --family <id> --since 30d
 *   npx tsx backend/scripts/inspect-categorization-runs.ts --family <id> --prod
 *   npx tsx backend/scripts/inspect-categorization-runs.ts --family <id> --prod --rows
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
import type {
  ClassificationConfidence,
  ClassificationRun,
  ClassificationRunRow,
} from '../src/shared/types';

const RUN_PREFIX = 'ai_categorization_runs_';

/** See inspect-traces.ts: the adapter, never UnifiedDataService, whose constructor writes. */
function readOnlyStorage(): Pick<StorageAdapter, 'read' | 'list'> {
  const adapter = StorageFactory.getAdapter();
  return {
    read: key => adapter.read(key),
    list: prefix => adapter.list(prefix),
  };
}
type ReadOnlyStorage = ReturnType<typeof readOnlyStorage>;

/** `--since 90m` / `--since 3h` / `--since 30d`, or an ISO timestamp. */
function parseSince(raw: string | undefined): number {
  if (!raw) return 0;
  const rel = /^(\d+)([mhd])$/.exec(raw);
  if (rel) {
    const n = Number(rel[1]);
    const unit = { m: 60_000, h: 3_600_000, d: 86_400_000 }[rel[2] as 'm' | 'h' | 'd'];
    return Date.now() - n * unit;
  }
  const abs = Date.parse(raw);
  if (Number.isNaN(abs)) {
    console.error(`Could not read --since "${raw}". Use 90m, 3h, 30d, or an ISO timestamp.`);
    process.exit(1);
  }
  return abs;
}

function clock(iso: string): string {
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 16);
}

function pct(n: number, d: number): string {
  return d === 0 ? '  —' : `${Math.round((n / d) * 100)}%`.padStart(4);
}

/** accepted / changed / skipped / no outcome reported, over a set of rows. */
function tally(rows: ClassificationRunRow[]): string {
  const c = { accepted: 0, changed: 0, skipped: 0, unreported: 0 };
  for (const r of rows) c[r.outcome?.kind ?? 'unreported']++;
  const decided = c.accepted + c.changed;
  return (
    `${String(rows.length).padStart(3)} rows · accepted ${c.accepted} (${pct(c.accepted, decided)} of applied)` +
    ` · changed ${c.changed} · skipped ${c.skipped}` +
    (c.unreported ? ` · no outcome ${c.unreported}` : '')
  );
}

function printRun(run: ClassificationRun, showRows: boolean): void {
  console.log(
    `${clock(run.createdAt)}  run ${run.id.slice(0, 8)}  ${run.model} (${run.effort})` +
      `  $${run.costUsd.toFixed(4)}  ${(run.durationMs / 1000).toFixed(1)}s`,
  );
  console.log(`  all        ${tally(run.rows)}`);
  const levels: ClassificationConfidence[] = ['high', 'medium', 'low'];
  for (const level of levels) {
    const rows = run.rows.filter(r => r.confidence === level);
    if (rows.length) console.log(`  ${level.padEnd(10)} ${tally(rows)}`);
  }

  const failures = new Map<string, number>();
  for (const r of run.rows) {
    if (r.failureReason) failures.set(r.failureReason, (failures.get(r.failureReason) ?? 0) + 1);
  }
  for (const [reason, count] of failures) console.log(`  failed     ${count}× ${reason}`);

  for (const r of run.rows) {
    if (r.outcome?.note) console.log(`  note       ${r.merchantName || r.name}: "${r.outcome.note}"`);
  }

  if (showRows) {
    for (const r of run.rows) {
      const plaid = r.plaidCategory?.detailed ?? r.plaidCategory?.broad ?? '-';
      console.log(
        `    ${(r.outcome?.kind ?? 'none').padEnd(8)} ${(r.confidence ?? 'fail').padEnd(6)} ` +
          `${(r.merchantName || r.name).slice(0, 28).padEnd(28)} plaid=${plaid.padEnd(32)} ` +
          `suggested=${r.suggestedCategoryId ?? '-'} applied=${r.outcome?.categoryId ?? '-'}`,
      );
      if (r.reasoning) console.log(`             ${r.reasoning}`);
    }
  }
  console.log('');
}

async function listFamilies(store: ReadOnlyStorage): Promise<void> {
  const keys = await store.list(RUN_PREFIX);
  if (keys.length === 0) {
    console.log('No categorization runs found. (Wrong storage target? Try --prod.)');
    return;
  }
  console.log('Families with categorization runs:\n');
  for (const key of keys) {
    const familyId = key.replace(RUN_PREFIX, '').replace(/\.json$/, '');
    const runs = (await store.read<ClassificationRun[]>(`${RUN_PREFIX}${familyId}`)) ?? [];
    const newest = runs[runs.length - 1];
    console.log(`  ${familyId}  ${String(runs.length).padStart(4)} runs` + (newest ? `  newest ${clock(newest.createdAt)}` : ''));
  }
}

async function main(): Promise<void> {
  const store = readOnlyStorage();
  if (has('list')) return listFamilies(store);

  const familyId = flag('family');
  if (!familyId) {
    console.error('Pass --family <id>, or --list to see which families have runs.');
    process.exit(1);
  }
  const since = parseSince(flag('since'));
  const runs = ((await store.read<ClassificationRun[]>(`${RUN_PREFIX}${familyId}`)) ?? [])
    .filter(r => Date.parse(r.createdAt) >= since);
  if (runs.length === 0) {
    console.log('No runs in range.');
    return;
  }

  for (const run of runs) printRun(run, has('rows'));

  const allRows = runs.flatMap(r => r.rows);
  const cost = runs.reduce((sum, r) => sum + r.costUsd, 0);
  console.log(`TOTAL  ${runs.length} runs  $${cost.toFixed(4)}`);
  console.log(`  all        ${tally(allRows)}`);
  console.log(`  high       ${tally(allRows.filter(r => r.confidence === 'high'))}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
