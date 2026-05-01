#!/usr/bin/env tsx
/**
 * Set every orphan transaction.categoryId to null (Uncategorized) so the user
 * can manually re-categorize via the UI.
 *
 * Goes through the configured StorageAdapter, so it works against BOTH local
 * filesystem (dev) and S3 (prod). The pre-write backup is also written through
 * the adapter (key prefix `backups/<timestamp>/transactions_<familyId>`) so
 * production runs land their backup safely in S3 alongside the source data.
 *
 * Usage:
 *   # Local filesystem (default)
 *   npx tsx backend/scripts/cleanup-orphan-categoryids.ts --dry-run
 *   npx tsx backend/scripts/cleanup-orphan-categoryids.ts
 *
 *   # Production S3 — uses the same PRODUCTION_S3_BUCKET_NAME /
 *   # PRODUCTION_S3_PREFIX / AWS_REGION env vars that `npm run sync:production`
 *   # already relies on. Always run --dry-run --prod first.
 *   npx tsx backend/scripts/cleanup-orphan-categoryids.ts --prod --dry-run
 *   npx tsx backend/scripts/cleanup-orphan-categoryids.ts --prod
 *
 * After applying against prod, SSH the EC2 box and `pm2 restart all` so the
 * backend re-reads the cleaned data (per AI-DEPLOYMENTS.md).
 */

import * as path from 'path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.join(__dirname, '..', '.env') });

const DRY_RUN = process.argv.includes('--dry-run');
const USE_PROD = process.argv.includes('--prod');
if (USE_PROD) {
  const bucket = process.env.PRODUCTION_S3_BUCKET_NAME;
  if (!bucket) {
    console.error('--prod requires PRODUCTION_S3_BUCKET_NAME in env (see backend/.env)');
    process.exit(1);
  }
  process.env.STORAGE_TYPE = 's3';
  process.env.S3_BUCKET_NAME = bucket;
  process.env.S3_PREFIX = process.env.PRODUCTION_S3_PREFIX || 'data/';
  console.log(
    `[PROD] bucket=${bucket} prefix=${process.env.S3_PREFIX} region=${process.env.AWS_REGION} ` +
    `mode=${DRY_RUN ? 'DRY RUN' : 'APPLY'}\n`,
  );
}

import { UnifiedDataService } from '../src/services/dataService';

interface StoredTx {
  id: string;
  amount: number;
  date: string;
  categoryId: string | null;
  status?: string;
  updatedAt?: string;
  [k: string]: unknown;
}

interface StoredCategory {
  id: string;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main(): Promise<void> {
  const dataService = new UnifiedDataService();
  const txKeys = await dataService.listKeys('transactions_');
  const familyIds = txKeys
    .filter(k => !k.includes('/') && !k.startsWith('backup_'))
    .map(k => k.replace(/^transactions_/, ''));

  const ts = timestamp();
  let touchedFiles = 0;
  let totalTouchedTx = 0;

  console.log(
    `${DRY_RUN ? '[DRY RUN] ' : ''}Scanning ${familyIds.length} family key(s)...\n`,
  );

  for (const familyId of familyIds) {
    const cats = await dataService.getCategories(familyId);
    if (!cats || cats.length === 0) {
      console.log(`[skip] ${familyId} — no categories`);
      continue;
    }
    const categoryIds = new Set((cats as StoredCategory[]).map(c => c.id));

    const original = await dataService.getData<StoredTx[]>(`transactions_${familyId}`);
    if (!Array.isArray(original)) {
      console.log(`[skip] ${familyId} — unexpected transactions shape`);
      continue;
    }

    // Deep clone so the backup retains the original document untouched.
    const updated: StoredTx[] = JSON.parse(JSON.stringify(original));
    const orphansByCid = new Map<string, number>();
    const nowIso = new Date().toISOString();
    let changed = 0;

    for (const t of updated) {
      if (t.status === 'removed') continue;
      const cid = t.categoryId;
      if (!cid) continue;
      if (categoryIds.has(cid)) continue;

      orphansByCid.set(cid, (orphansByCid.get(cid) ?? 0) + 1);
      t.categoryId = null;
      t.updatedAt = nowIso;
      changed += 1;
    }

    if (changed === 0) {
      console.log(`[ok]   ${familyId} — no orphans`);
      continue;
    }

    console.log(
      `[${DRY_RUN ? 'would-fix' : 'fixed'}] ${familyId} — ${changed} tx ` +
      `across ${orphansByCid.size} unknown id(s):`,
    );
    for (const [cid, n] of Array.from(orphansByCid.entries()).sort(
      (a, b) => b[1] - a[1],
    )) {
      console.log(`   ${cid} -> null (${n} tx)`);
    }

    if (!DRY_RUN) {
      const backupKey = `backups/${ts}/transactions_${familyId}`;
      await dataService.saveData(backupKey, original);
      await dataService.saveData(`transactions_${familyId}`, updated);
      console.log(`   backup -> ${backupKey}`);
    }

    touchedFiles += 1;
    totalTouchedTx += changed;
  }

  console.log(
    `\n${DRY_RUN ? '[DRY RUN] Would update' : 'Updated'} ` +
    `${totalTouchedTx} tx across ${touchedFiles} file(s).`,
  );
  if (!DRY_RUN && touchedFiles > 0) {
    console.log(`Backup prefix: backups/${ts}/`);
    console.log('Restart the backend (PM2 in prod, npm run dev:restart in dev) to refresh caches.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
