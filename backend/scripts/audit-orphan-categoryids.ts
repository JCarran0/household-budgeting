#!/usr/bin/env tsx
/**
 * Audit orphan transaction.categoryId values across all families.
 *
 * "Orphan" = a transaction whose categoryId is non-null and not present in
 * the family's categories file. The trio (calculateIncome/Spending/Savings)
 * tolerates unknown ids while the modal's id-list filter does not — so
 * orphans show up as a cell-vs-modal mismatch in Reports.
 *
 * Read-only. Goes through the configured StorageAdapter so it works against
 * BOTH local filesystem (dev) and S3 (prod). Selection follows env vars
 * exactly like the running app:
 *
 *   # Local filesystem (default)
 *   npx tsx backend/scripts/audit-orphan-categoryids.ts
 *
 *   # Production S3 — uses the same PRODUCTION_S3_BUCKET_NAME /
 *   # PRODUCTION_S3_PREFIX / AWS_REGION env vars that `npm run sync:production`
 *   # already relies on. Read-only; no writes.
 *   npx tsx backend/scripts/audit-orphan-categoryids.ts --prod
 *
 * Writes a machine-readable dump to backend/tmp/orphan-categoryids.json for
 * a follow-up cleanup pass. The dump is always local — it's a working file,
 * not a backup.
 */

import * as fs from 'fs';
import * as path from 'path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.join(__dirname, '..', '.env') });

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
  console.log(`[PROD] bucket=${bucket} prefix=${process.env.S3_PREFIX} region=${process.env.AWS_REGION}\n`);
}

import { UnifiedDataService } from '../src/services/dataService';

interface StoredTx {
  id: string;
  amount: number;
  date: string;
  name?: string;
  categoryId: string | null;
  status?: string;
}

interface StoredCategory {
  id: string;
}

interface OrphanGroup {
  familyId: string;
  categoryId: string;
  count: number;
  sumAmount: number;
  minDate: string;
  maxDate: string;
  samples: { id: string; date: string; amount: number; name: string }[];
}

const TMP_DIR = path.join(__dirname, '..', 'tmp');
const OUT_PATH = path.join(TMP_DIR, 'orphan-categoryids.json');

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function main(): Promise<void> {
  const dataService = new UnifiedDataService();
  const txKeys = await dataService.listKeys('transactions_');
  const familyIds = txKeys
    .filter(k => !k.includes('/') && !k.startsWith('backup_'))
    .map(k => k.replace(/^transactions_/, ''));

  console.log(`Scanning ${familyIds.length} family transaction key(s)...\n`);

  const allGroups: OrphanGroup[] = [];

  for (const familyId of familyIds) {
    const cats = await dataService.getCategories(familyId);
    if (!cats || cats.length === 0) {
      console.log(`[skip] ${familyId} — no categories`);
      continue;
    }
    const categoryIds = new Set((cats as StoredCategory[]).map(c => c.id));

    const txs = await dataService.getData<StoredTx[]>(`transactions_${familyId}`);
    if (!Array.isArray(txs)) {
      console.log(`[skip] ${familyId} — unexpected transactions shape`);
      continue;
    }

    const groups = new Map<string, OrphanGroup>();

    for (const t of txs) {
      if (t.status === 'removed') continue;
      if (!t.categoryId) continue;
      if (categoryIds.has(t.categoryId)) continue;

      const cid = t.categoryId;
      let g = groups.get(cid);
      if (!g) {
        g = {
          familyId,
          categoryId: cid,
          count: 0,
          sumAmount: 0,
          minDate: t.date,
          maxDate: t.date,
          samples: [],
        };
        groups.set(cid, g);
      }
      g.count += 1;
      g.sumAmount += t.amount;
      if (t.date < g.minDate) g.minDate = t.date;
      if (t.date > g.maxDate) g.maxDate = t.date;
      if (g.samples.length < 3) {
        g.samples.push({ id: t.id, date: t.date, amount: t.amount, name: t.name ?? '' });
      }
    }

    if (groups.size === 0) {
      console.log(`[ok]   ${familyId} — no orphans (${txs.length} txs scanned)`);
      continue;
    }

    const familyGroups = Array.from(groups.values()).sort((a, b) => b.count - a.count);
    const totalCount = familyGroups.reduce((s, g) => s + g.count, 0);
    const totalAmount = familyGroups.reduce((s, g) => s + g.sumAmount, 0);

    console.log(
      `\n[ORPHANS] ${familyId} — ${familyGroups.length} unknown id(s), ` +
      `${totalCount} tx, $${fmt(totalAmount)}`,
    );
    for (const g of familyGroups) {
      console.log(
        `   ${g.categoryId}  count=${g.count}  sum=$${fmt(g.sumAmount)}  ` +
        `range=${g.minDate}..${g.maxDate}`,
      );
      for (const s of g.samples) {
        const nm = s.name.length > 40 ? s.name.slice(0, 37) + '...' : s.name;
        console.log(`      • ${s.date}  $${fmt(s.amount).padStart(10)}  ${nm}  (id=${s.id})`);
      }
    }

    allGroups.push(...familyGroups);
  }

  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(allGroups, null, 2));

  const grandCount = allGroups.reduce((s, g) => s + g.count, 0);
  const grandSum = allGroups.reduce((s, g) => s + g.sumAmount, 0);
  console.log(
    `\nTotal: ${allGroups.length} unknown id(s) across ${familyIds.length} families, ` +
    `${grandCount} tx, $${fmt(grandSum)}`,
  );
  console.log(`Wrote ${path.relative(process.cwd(), OUT_PATH)}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
