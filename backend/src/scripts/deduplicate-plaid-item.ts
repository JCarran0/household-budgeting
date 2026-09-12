#!/usr/bin/env ts-node

/**
 * Retire a duplicate Plaid Item and fold its unique rows back into the original.
 *
 * When "Sign in to Bank" runs Plaid Link in *create* mode instead of update
 * mode, the institution is linked a second time: a new Item, new account_ids,
 * new transaction_ids for the entire history. The app's id-based dedupe has
 * nothing to match on, so every transaction it already had arrives again as
 * brand new and uncategorized. This happened to Bank of America on 2026-09-12
 * (892 rows imported, 887 of them twins of rows already stored).
 *
 * The original Item keeps the user's work — categories, splits, notes, tags —
 * so the original always wins. This script deletes the redundant copies and
 * carries across only what the duplicate Item genuinely added.
 *
 * What it does:
 *   1. Pairs each account on the retiring Item with the surviving account for
 *      the same real-world account (institutionId + mask + type + subtype +
 *      officialName). Aborts on any ambiguity rather than guessing.
 *   2. Matches the retiring Item's transactions one-for-one against surviving
 *      rows on date + amount + name. Matching is a *multiset* pairing, so a
 *      genuine pair of identical same-day charges stays a pair — the family
 *      data has real triples (four $818.39 flights on 2026-01-12) that a
 *      naive "collapse by key" would eat.
 *   3. Refuses to delete any row carrying user work. A freshly imported row
 *      should have none; if one does, the assumption behind this script is
 *      wrong and it stops instead of destroying edits.
 *   4. Adopts the rows with no twin onto the surviving account. Where an
 *      adopted row is the posted version of a stale `pending` row already
 *      stored (same account, same amount, within --pending-window days), it
 *      updates that row in place so its category and notes survive and no
 *      duplicate is created.
 *   5. Deletes the retiring accounts and, with --remove-item, releases the
 *      Item at Plaid so it stops being billable and stops syncing.
 *
 * DRY RUN BY DEFAULT — writes nothing without --apply. With --apply it backs
 * up accounts_ and transactions_ to timestamped keys first.
 *
 * Usage:
 *   AWS_PROFILE=budget-app-prod npx ts-node src/scripts/deduplicate-plaid-item.ts \
 *     --institution="Bank of America"
 *       ... with no --retire-item, prints the duplicate Items it can see and exits.
 *
 *   ... --retire-item=RpZrPQQYKKto...   the Item to retire (required to plan)
 *   ... --apply                          actually write (backs up first)
 *   ... --remove-item                    also call /item/remove at Plaid
 *   ... --pending-window=5               days a pending row may lag its posted twin
 *   ... --local                          read/write local backend/data instead of prod S3
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

dotenv.config();

import { FilesystemAdapter } from '../services/storage/filesystemAdapter';
import { S3Adapter } from '../services/storage/s3Adapter';
import { encryptionService } from '../utils/encryption';

const c = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

interface StoredAccount {
  id: string;
  plaidItemId: string;
  plaidAccountId: string;
  plaidAccessToken: string;
  institutionId?: string | null;
  institutionName: string;
  accountName: string;
  officialName?: string | null;
  mask: string | null;
  type?: string;
  subtype?: string;
  status?: string;
  createdAt?: Date | string;
}

interface StoredTransaction {
  id: string;
  accountId: string;
  plaidTransactionId?: string | null;
  plaidAccountId?: string | null;
  amount: number;
  date: string;
  name: string;
  merchantName?: string | null;
  userDescription?: string | null;
  status?: string;
  pending?: boolean;
  categoryId?: string | null;
  notes?: string | null;
  tags?: string[];
  isHidden?: boolean;
  isFlagged?: boolean;
  isSplit?: boolean;
  parentTransactionId?: string | null;
  splitTransactionIds?: string[];
  updatedAt?: Date | string;
  [key: string]: unknown;
}

interface Storage {
  read<T>(key: string): Promise<T | null>;
  write<T>(key: string, data: T): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

const APPLY = process.argv.includes('--apply');
const LOCAL = process.argv.includes('--local');
const REMOVE_ITEM = process.argv.includes('--remove-item');

function parseArg(name: string): string | undefined {
  const p = `--${name}=`;
  const hit = process.argv.find(a => a.startsWith(p));
  return hit ? hit.slice(p.length).replace(/^["']|["']$/g, '') : undefined;
}

const PENDING_WINDOW = Number(parseArg('pending-window') ?? 5);

function buildStorage(): Storage {
  if (LOCAL) return new FilesystemAdapter() as unknown as Storage;
  const bucket = process.env.PRODUCTION_S3_BUCKET_NAME;
  const region = process.env.AWS_REGION || 'us-east-1';
  const prefix = process.env.PRODUCTION_S3_PREFIX || 'data/';
  if (!bucket) throw new Error('PRODUCTION_S3_BUCKET_NAME is required (or pass --local)');
  return new S3Adapter(bucket, region, prefix) as unknown as Storage;
}

function buildPlaid(): PlaidApi {
  const env = process.env.PLAID_ENV || 'sandbox';
  const basePath = PlaidEnvironments[env];
  if (!basePath) throw new Error(`Unknown PLAID_ENV: ${env}`);
  return new PlaidApi(
    new Configuration({
      basePath,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
          'PLAID-SECRET': process.env.PLAID_SECRET,
        },
      },
    })
  );
}

/**
 * Stored accounts carry the app's simplified type, not Plaid's raw one. Kept in
 * step with `plaidService.mapAccountType` and with the reconciler, which learned
 * this the hard way on 2026-09-08.
 */
function simplifyType(type?: string | null): string {
  if (!type) return 'unknown';
  switch (type) {
    case 'depository':
      return 'checking';
    default:
      return type;
  }
}

/** Identity of the real-world account, independent of which Item linked it. */
export function accountIdentity(a: {
  institutionId?: string | null;
  mask?: string | null;
  type?: string | null;
  subtype?: string | null;
  officialName?: string | null;
}): string {
  return [
    a.institutionId ?? '',
    a.mask ?? '',
    simplifyType(a.type),
    a.subtype ?? '',
    a.officialName ?? '',
  ]
    .join('|')
    .toLowerCase();
}

/** date + amount + name — what survives a re-import under new ids. */
export function twinKey(t: { date: string; amount: number; name?: string | null }): string {
  return `${t.date}|${t.amount.toFixed(2)}|${(t.name ?? '').trim().toLowerCase()}`;
}

const USER_WORK_FIELDS = [
  'categoryId',
  'notes',
  'userDescription',
  'isSplit',
  'parentTransactionId',
  'isFlagged',
  'isHidden',
] as const;

/**
 * Which user edits, if any, a row carries. A row imported minutes ago should
 * carry none; anything here means the row is not the disposable copy this
 * script assumes it is.
 */
export function userWorkOn(t: StoredTransaction): string[] {
  const found: string[] = [];
  for (const f of USER_WORK_FIELDS) {
    const v = t[f];
    if (v === null || v === undefined || v === false || v === '') continue;
    found.push(f);
  }
  if (t.tags?.length) found.push('tags');
  if (t.splitTransactionIds?.length) found.push('splitTransactionIds');
  return found;
}

function daysApart(a: string, b: string): number {
  const ms = Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`));
  return Math.round(ms / 86_400_000);
}

function printDuplicateItems(accounts: StoredAccount[]): void {
  const byIdentity = new Map<string, StoredAccount[]>();
  for (const a of accounts) {
    const k = accountIdentity(a);
    byIdentity.set(k, [...(byIdentity.get(k) ?? []), a]);
  }

  const collisions = [...byIdentity.values()].filter(
    rows => new Set(rows.map(r => r.plaidItemId)).size > 1
  );
  if (!collisions.length) {
    console.log(`  ${c.green}No duplicate Items found — every account is linked once.${c.reset}`);
    return;
  }

  const itemAges = new Map<string, string>();
  for (const rows of collisions) {
    for (const r of rows) {
      const created = String(r.createdAt ?? '').slice(0, 10);
      const prev = itemAges.get(r.plaidItemId);
      if (!prev || created < prev) itemAges.set(r.plaidItemId, created);
    }
  }

  console.log(`  ${c.yellow}${collisions.length} account(s) linked by more than one Item:${c.reset}`);
  for (const rows of collisions) {
    const [first] = rows;
    console.log(`\n    ${c.bold}${first.institutionName} ${first.accountName} ••${first.mask}${c.reset}`);
    for (const r of rows) {
      console.log(
        `      item=${r.plaidItemId.slice(0, 14)}…  acct=${r.plaidAccountId.slice(0, 14)}…  ` +
          `linked ${String(r.createdAt ?? '?').slice(0, 10)}`
      );
    }
  }

  const newest = [...itemAges.entries()].sort((a, b) => a[1].localeCompare(b[1])).pop();
  if (newest) {
    console.log(
      `\n  ${c.dim}Newest Item is ${newest[0]} (linked ${newest[1]}). If that is the redundant one:` +
        `\n    --retire-item=${newest[0]}${c.reset}`
    );
  }
}

async function main(): Promise<void> {
  const institution = parseArg('institution');
  const retireItem = parseArg('retire-item');
  if (!institution) {
    console.log('Required: --institution="Name"  [--retire-item=<plaidItemId>]');
    process.exit(1);
  }

  console.log(
    `${c.dim}mode=${APPLY ? 'APPLY' : 'DRY RUN'} source=${LOCAL ? 'local' : 'prod S3'} ` +
      `plaid_env=${process.env.PLAID_ENV}${c.reset}\n`
  );

  const storage = buildStorage();

  // Locate the family holding this institution. Unlike the reconciler, which
  // takes the first file that matches, this refuses to proceed when more than
  // one family has the institution — picking one silently would write the wrong
  // household's data.
  const acctKeys = await storage.list('accounts_');
  const matches: Array<{ familyId: string; accounts: StoredAccount[] }> = [];
  for (const key of acctKeys) {
    const rows = (await storage.read<StoredAccount[]>(key)) || [];
    if (rows.some(a => a.institutionName.toLowerCase().includes(institution.toLowerCase()))) {
      matches.push({ familyId: key.replace('accounts_', ''), accounts: rows });
    }
  }
  if (!matches.length) throw new Error(`no accounts found for institution "${institution}"`);
  if (matches.length > 1) {
    throw new Error(
      `"${institution}" appears in ${matches.length} families (${matches
        .map(m => m.familyId.slice(0, 8))
        .join(', ')}) — refusing to guess`
    );
  }
  const { familyId, accounts } = matches[0];
  console.log(`${c.bold}Family${c.reset} ${familyId}\n`);

  console.log(`${c.bold}Duplicate Item scan${c.reset}`);
  printDuplicateItems(accounts.filter(a => a.institutionName.toLowerCase().includes(institution.toLowerCase())));

  if (!retireItem) {
    console.log(`\n${c.yellow}No --retire-item given — scan only, nothing planned.${c.reset}`);
    return;
  }

  const retiring = accounts.filter(a => a.plaidItemId === retireItem);
  if (!retiring.length) throw new Error(`no stored accounts on item ${retireItem}`);
  const surviving = accounts.filter(a => a.plaidItemId !== retireItem);

  // --- Pair each retiring account with the account that will absorb it ---
  const pairs: Array<{ retire: StoredAccount; keep: StoredAccount }> = [];
  for (const r of retiring) {
    const identity = accountIdentity(r);
    const candidates = surviving.filter(s => accountIdentity(s) === identity);
    if (candidates.length !== 1) {
      console.log(
        `\n  ${c.red}ambiguous pairing for ${r.accountName} ••${r.mask}: ` +
          `${candidates.length} surviving candidates — aborting${c.reset}`
      );
      console.log(`    ${c.dim}retiring identity: ${identity}${c.reset}`);
      for (const s of surviving) {
        console.log(`    ${c.dim}surviving identity: ${accountIdentity(s)}${c.reset}`);
      }
      process.exit(1);
    }
    pairs.push({ retire: r, keep: candidates[0] });
    console.log(
      `\n  ${c.green}pair${c.reset} retiring ${r.accountName} ••${r.mask} ` +
        `${c.dim}(${r.plaidAccountId.slice(0, 14)}…)${c.reset} → keep ` +
        `${c.dim}(${candidates[0].plaidAccountId.slice(0, 14)}…, linked ${String(candidates[0].createdAt ?? '?').slice(0, 10)})${c.reset}`
    );
  }

  const retireAcctIds = new Set(pairs.map(p => p.retire.id));
  const keepByRetireId = new Map(pairs.map(p => [p.retire.id, p.keep]));

  const transactions = (await storage.read<StoredTransaction[]>(`transactions_${familyId}`)) || [];
  const retiringTxns = transactions.filter(t => retireAcctIds.has(t.accountId));
  const others = transactions.filter(t => !retireAcctIds.has(t.accountId));

  // --- One-for-one twin matching, per surviving account ---
  // Build a pool of surviving rows keyed by date+amount+name. Each retiring row
  // consumes at most one pool entry, so a real triple survives as a triple.
  const pool = new Map<string, StoredTransaction[]>();
  for (const t of others) {
    if (t.status === 'removed') continue;
    const k = `${t.accountId}|${twinKey(t)}`;
    pool.set(k, [...(pool.get(k) ?? []), t]);
  }

  const duplicates: StoredTransaction[] = [];
  const unique: StoredTransaction[] = [];
  for (const t of retiringTxns) {
    const keep = keepByRetireId.get(t.accountId);
    const k = `${keep?.id}|${twinKey(t)}`;
    const bucket = pool.get(k);
    if (bucket?.length) {
      bucket.shift();
      duplicates.push(t);
    } else {
      unique.push(t);
    }
  }

  // --- Safety: nothing with user work may be deleted ---
  const dirty = duplicates
    .map(t => ({ t, work: userWorkOn(t) }))
    .filter(d => d.work.length > 0);
  if (dirty.length) {
    console.log(
      `\n${c.red}${c.bold}ABORT:${c.reset} ${c.red}${dirty.length} row(s) slated for deletion carry user edits.${c.reset}`
    );
    console.log(`${c.dim}This script assumes the retiring Item's rows are untouched imports.${c.reset}`);
    for (const d of dirty.slice(0, 15)) {
      console.log(`    ${d.t.date} ${String(d.t.amount).padStart(9)}  ${(d.t.name || '').slice(0, 34).padEnd(36)} ${c.yellow}${d.work.join(',')}${c.reset}`);
    }
    process.exit(1);
  }

  // --- Adoption: fold unique rows onto the surviving account ---
  // A stale `pending` row is the posted row's earlier self. Updating it in place
  // keeps its category and notes and avoids leaving both versions on the books.
  const pendingPool = others.filter(t => t.status === 'pending');
  const claimedPending = new Set<string>();

  const merges: Array<{ into: StoredTransaction; from: StoredTransaction }> = [];
  const adoptions: StoredTransaction[] = [];

  for (const t of unique) {
    const keep = keepByRetireId.get(t.accountId);
    if (!keep) continue;
    const match = pendingPool.find(
      p =>
        !claimedPending.has(p.id) &&
        p.accountId === keep.id &&
        Math.abs(p.amount - t.amount) < 0.005 &&
        daysApart(p.date, t.date) <= PENDING_WINDOW
    );
    if (match) {
      claimedPending.add(match.id);
      merges.push({ into: match, from: t });
    } else {
      adoptions.push(t);
    }
  }

  // --- Report ---
  console.log(`\n${c.bold}Plan${c.reset}`);
  console.log(`  rows on retiring Item:        ${retiringTxns.length}`);
  console.log(`  ${c.red}delete as duplicates:         ${duplicates.length}${c.reset}`);
  console.log(`  ${c.green}merge into stale pending:     ${merges.length}${c.reset}`);
  console.log(`  ${c.green}adopt onto kept account:      ${adoptions.length}${c.reset}`);
  console.log(`  accounts removed:             ${pairs.length}`);

  if (merges.length) {
    console.log(`\n  ${c.bold}pending → posted merges${c.reset} ${c.dim}(review by eye — these change existing rows)${c.reset}`);
    for (const m of merges) {
      console.log(
        `    ${c.dim}was${c.reset} ${m.into.date} ${String(m.into.amount).padStart(9)} ${(m.into.name || '').slice(0, 30).padEnd(32)} ${c.dim}[${m.into.status}, cat=${m.into.categoryId ?? 'none'}]${c.reset}`
      );
      console.log(
        `    ${c.green}now${c.reset} ${m.from.date} ${String(m.from.amount).padStart(9)} ${(m.from.name || '').slice(0, 30).padEnd(32)} ${c.dim}[${m.from.status}]${c.reset}\n`
      );
    }
  }

  if (adoptions.length) {
    console.log(`  ${c.bold}adopted as new rows${c.reset}`);
    for (const a of adoptions) {
      console.log(`    ${a.date} ${String(a.amount).padStart(9)}  ${(a.name || '').slice(0, 44)}`);
    }
  }

  // Stale pendings left behind are not this script's business to resolve, but an
  // operator should know they exist — each one is invisible to every budget and
  // report in the app.
  const leftoverStale = pendingPool.filter(
    p => !claimedPending.has(p.id) && daysApart(p.date, new Date().toISOString().slice(0, 10)) > 7
  );
  if (leftoverStale.length) {
    console.log(`\n  ${c.yellow}${leftoverStale.length} stale pending row(s) remain (>7 days, excluded from all app math):${c.reset}`);
    for (const p of leftoverStale) {
      console.log(`    ${p.date} ${String(p.amount).padStart(9)}  ${(p.name || '').slice(0, 40).padEnd(42)} ${c.dim}cat=${p.categoryId ?? 'none'}${c.reset}`);
    }
  }

  const planPath = path.join(process.cwd(), `dedupe-plan-${familyId.slice(0, 8)}.json`);
  fs.writeFileSync(
    planPath,
    JSON.stringify(
      {
        familyId,
        retireItem,
        pairs: pairs.map(p => ({
          retire: { id: p.retire.id, plaidAccountId: p.retire.plaidAccountId, name: p.retire.accountName, mask: p.retire.mask },
          keep: { id: p.keep.id, plaidAccountId: p.keep.plaidAccountId, name: p.keep.accountName, mask: p.keep.mask },
        })),
        deletes: duplicates.map(t => ({ id: t.id, date: t.date, amount: t.amount, name: t.name })),
        merges: merges.map(m => ({
          intoId: m.into.id,
          was: { date: m.into.date, amount: m.into.amount, name: m.into.name, status: m.into.status, categoryId: m.into.categoryId },
          now: { date: m.from.date, amount: m.from.amount, name: m.from.name, status: m.from.status },
        })),
        adoptions: adoptions.map(t => ({ id: t.id, date: t.date, amount: t.amount, name: t.name })),
        leftoverStalePending: leftoverStale.map(t => ({ date: t.date, amount: t.amount, name: t.name, categoryId: t.categoryId })),
      },
      null,
      2
    )
  );
  console.log(`\n  ${c.dim}full plan written to ${planPath}${c.reset}`);

  if (!APPLY) {
    console.log(`\n${c.yellow}DRY RUN — nothing written. Re-run with --apply to execute.${c.reset}`);
    return;
  }

  // --- Apply ---
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await storage.write(`backup_accounts_${familyId}_${stamp}`, accounts);
  await storage.write(`backup_transactions_${familyId}_${stamp}`, transactions);
  console.log(`\n${c.dim}backed up accounts_ and transactions_ with suffix ${stamp}${c.reset}`);

  const deleteIds = new Set(duplicates.map(t => t.id));
  const mergedAwayIds = new Set(merges.map(m => m.from.id));

  for (const { into, from } of merges) {
    // Keep `into`'s own plaidTransactionId. The surviving Item is the one that
    // will keep syncing, so its id is what a future modification or removal
    // delta will arrive under; adopting the retiring Item's id would orphan the
    // row from the only Item still talking to Plaid.
    into.date = from.date;
    into.amount = from.amount;
    into.name = from.name;
    into.merchantName = from.merchantName ?? into.merchantName;
    into.status = from.status;
    into.pending = from.pending;
    into.updatedAt = new Date();
  }

  for (const t of adoptions) {
    const keep = keepByRetireId.get(t.accountId);
    if (!keep) continue;
    t.accountId = keep.id;
    t.plaidAccountId = keep.plaidAccountId;
    t.updatedAt = new Date();
  }

  const nextTransactions = transactions.filter(t => !deleteIds.has(t.id) && !mergedAwayIds.has(t.id));
  const nextAccounts = accounts.filter(a => !retireAcctIds.has(a.id));

  await storage.write(`transactions_${familyId}`, nextTransactions);
  await storage.write(`accounts_${familyId}`, nextAccounts);

  console.log(
    `${c.green}${c.bold}Applied.${c.reset} deleted=${duplicates.length} merged=${merges.length} ` +
      `adopted=${adoptions.length} accountsRemoved=${pairs.length}`
  );
  console.log(`${c.dim}transactions ${transactions.length} → ${nextTransactions.length}${c.reset}`);

  if (REMOVE_ITEM) {
    const plaid = buildPlaid();
    const token = encryptionService.decrypt(retiring[0].plaidAccessToken);
    await plaid.itemRemove({ access_token: token });
    console.log(`${c.green}Item ${retireItem} removed at Plaid.${c.reset}`);
  } else {
    console.log(
      `\n${c.yellow}Item ${retireItem} still exists at Plaid${c.reset} — it will keep syncing and ` +
        `re-importing. Re-run with --remove-item, or remove it from the Plaid dashboard.`
    );
  }
}

if (require.main === module) {
  main().catch(e => {
    console.error(`${c.red}dedupe failed:${c.reset}`, e);
    process.exit(1);
  });
}
