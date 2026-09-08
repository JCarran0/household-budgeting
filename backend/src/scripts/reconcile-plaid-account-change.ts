#!/usr/bin/env ts-node

/**
 * Reconcile a Plaid account_id change within an existing Item.
 *
 * When an institution reissues a card, Plaid may retire the old account_id and
 * mint a new one inside the same Item. Every transaction under the new id gets a
 * new transaction_id, so the app — which dedupes on plaidTransactionId — sees
 * months of already-known history as brand new. Worse, transactions whose
 * account_id is unknown are silently dropped by applyPlaidSyncDelta while the
 * cursor still advances, so a plain sync loses them permanently.
 *
 * Plaid's own remedy for this is `persistent_account_id`, a stable identifier
 * that survives reissues — but not every institution populates it (Capital One
 * does not), so the old and new ids cannot be linked automatically. This script
 * bridges them by content instead.
 *
 * What it does:
 *   1. Pairs each stale stored account (its plaidAccountId no longer exists at
 *      Plaid) with the new live account, requiring an unambiguous match on
 *      type + subtype + official_name.
 *   2. Re-keys stored transactions to the new plaidTransactionId / plaidAccountId
 *      by matching on date + amount, so the app's existing id-based dedupe stays
 *      correct from then on.
 *   3. Inserts only the rows Plaid has that we genuinely lack.
 *   4. Repoints the stored account and persists the cursor.
 *
 * Idempotent and safe to re-run: already re-keyed rows match by id and are left
 * alone, so if Plaid later backfills deeper history, re-running reconciles the
 * newly-arrived rows without touching anything settled.
 *
 * DRY RUN BY DEFAULT — writes nothing without --apply.
 *
 * Usage:
 *   AWS_PROFILE=budget-app-prod npx ts-node src/scripts/reconcile-plaid-account-change.ts \
 *     --institution="Capital One"
 *   ... --apply                        actually write (backs up touched keys first)
 *   ... --insert-unmatched-historic    also insert pre-gap rows with no local match
 *   ... --local                        read/write local backend/data instead of prod S3
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import type { AccountBase, Transaction as PlaidTxn } from 'plaid';

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
  institutionName: string;
  accountName: string;
  officialName?: string | null;
  nickname?: string | null;
  mask: string | null;
  type?: string;
  subtype?: string;
  status?: string;
  persistentAccountId?: string | null;
  plaidCursor?: string | null;
  updatedAt?: Date | string;
}

interface StoredTransaction {
  id: string;
  userId: string;
  accountId: string;
  plaidTransactionId?: string | null;
  plaidAccountId?: string | null;
  amount: number;
  date: string;
  name: string;
  merchantName?: string | null;
  status?: string;
  pending?: boolean;
  categoryId?: string | null;
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
const INSERT_HISTORIC = process.argv.includes('--insert-unmatched-historic');

function parseArg(name: string): string | undefined {
  const p = `--${name}=`;
  const hit = process.argv.find(a => a.startsWith(p));
  return hit ? hit.slice(p.length).replace(/^["']|["']$/g, '') : undefined;
}

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

/** date + amount is the only pairing that survives Plaid re-enriching names. */
function matchKey(date: string, amount: number): string {
  return `${date}|${amount.toFixed(2)}`;
}

/**
 * Stored accounts carry the app's *simplified* type, not Plaid's raw one:
 * `plaidService.mapAccountType` collapses `depository` to `checking` before
 * anything is persisted. Comparing a stored type against a raw `AccountBase.type`
 * therefore never matches for any depository account, which made every pairing
 * attempt abort with "0 candidates". Normalise both sides through the same map.
 * Keep this in step with `plaidService.mapAccountType`.
 */
function simplifyType(type?: string | null): string {
  if (!type) return 'unknown';
  switch (type) {
    case 'depository':
      return 'checking';
    case 'credit':
      return 'credit';
    case 'loan':
      return 'loan';
    case 'investment':
      return 'investment';
    default:
      return type;
  }
}

function accountIdentity(a: { type?: string | null; subtype?: string | null; officialName?: string | null }): string {
  return `${simplifyType(a.type)}|${a.subtype ?? ''}|${a.officialName ?? ''}`.toLowerCase();
}

/**
 * Render transaction ids so they can actually be told apart.
 *
 * Plaid's ids for a single Item share a long constant prefix — 17 characters in
 * the 2026-09-07 Bank of America data. Truncating to a fixed 10 characters, as
 * this script used to, rendered every id identically, so unrelated rows appeared
 * to chain into one another and the sample table silently stopped being a check
 * on anything. This is the operator's only visual confirmation before an
 * irreversible re-key, so it has to show the part that differs.
 *
 * Elide the prefix the given ids actually share rather than assuming a width:
 * the shared length varies by institution, and a hardcoded guess would reproduce
 * the same bug against a different bank.
 */
export function elideSharedPrefix(ids: string[]): (id: string) => string {
  const usable = ids.filter(Boolean);
  let shared = 0;
  if (usable.length > 1) {
    const [first] = usable;
    outer: for (; shared < first.length; shared++) {
      for (const id of usable) {
        if (id[shared] !== first[shared]) break outer;
      }
    }
    // Never elide so much that nothing distinguishing is left, and don't bother
    // for a prefix too short to be worth hiding.
    const shortest = Math.min(...usable.map(id => id.length));
    if (shared > shortest - 4) shared = Math.max(0, shortest - 4);
    if (shared < 6) shared = 0;
  }
  return (id: string) => (shared > 0 ? `…${id.slice(shared)}` : id);
}

async function main(): Promise<void> {
  const institution = parseArg('institution');
  if (!institution) {
    console.log('Required: --institution="Name"');
    process.exit(1);
  }

  console.log(`${c.dim}mode=${APPLY ? 'APPLY' : 'DRY RUN'} source=${LOCAL ? 'local' : 'prod S3'} plaid_env=${process.env.PLAID_ENV}${c.reset}\n`);

  const storage = buildStorage();
  const plaid = buildPlaid();

  // Locate the family whose accounts include this institution.
  const acctKeys = await storage.list('accounts_');
  let accounts: StoredAccount[] = [];
  let familyId = '';
  for (const key of acctKeys) {
    const rows = (await storage.read<StoredAccount[]>(key)) || [];
    if (rows.some(a => a.institutionName.toLowerCase().includes(institution.toLowerCase()))) {
      accounts = rows;
      familyId = key.replace('accounts_', '');
      break;
    }
  }
  if (!accounts.length) throw new Error(`no accounts found for institution "${institution}"`);

  const target = accounts.filter(a => a.institutionName.toLowerCase().includes(institution.toLowerCase()));
  const accessToken = encryptionService.decrypt(target[0].plaidAccessToken);

  // --- Pair stale stored accounts with newly-appeared live accounts ---
  const { data: live } = await plaid.accountsGet({ access_token: accessToken });
  const liveById = new Map<string, AccountBase>(live.accounts.map(a => [a.account_id, a]));
  const storedIds = new Set(target.map(a => a.plaidAccountId));

  const stale = target.filter(a => !liveById.has(a.plaidAccountId));
  const appeared = live.accounts.filter(a => !storedIds.has(a.account_id));

  console.log(`${c.bold}Account pairing${c.reset}`);
  if (!stale.length && !appeared.length) {
    console.log(`  ${c.green}No account_id change detected — nothing to reconcile.${c.reset}`);
    return;
  }
  console.log(`  stale stored accounts: ${stale.length}`);
  console.log(`  new live accounts:     ${appeared.length}`);

  const pairs: Array<{ stored: StoredAccount; live: AccountBase }> = [];
  const claimed = new Set<string>();
  for (const s of stale) {
    // Plaid's own stable identifier wins when the institution supplies it on
    // both sides — it is designed to survive exactly this event, so it beats
    // any inference from type/name.
    let candidates: AccountBase[] = [];
    let via = 'identity';
    if (s.persistentAccountId) {
      candidates = appeared.filter(
        a => !claimed.has(a.account_id) && a.persistent_account_id === s.persistentAccountId
      );
      if (candidates.length === 1) via = 'persistent_account_id';
      else candidates = [];
    }

    if (!candidates.length) {
      const identity = accountIdentity({ type: s.type, subtype: s.subtype, officialName: s.officialName });
      candidates = appeared.filter(
        a =>
          !claimed.has(a.account_id) &&
          accountIdentity({ type: a.type, subtype: a.subtype, officialName: a.official_name }) === identity
      );
    }

    if (candidates.length !== 1) {
      // A bare count gives an operator nothing to act on. Print both sides so
      // the mismatching field is visible without instrumenting the script.
      console.log(
        `  ${c.red}ambiguous pairing for ${s.accountName} ••${s.mask}: ${candidates.length} candidates — aborting${c.reset}`
      );
      console.log(
        `    ${c.dim}stored identity: ${accountIdentity({ type: s.type, subtype: s.subtype, officialName: s.officialName })}` +
          ` (persistent=${s.persistentAccountId ?? 'none'})${c.reset}`
      );
      for (const a of appeared) {
        console.log(
          `    ${c.dim}live   identity: ${accountIdentity({ type: a.type, subtype: a.subtype, officialName: a.official_name })}` +
            ` (persistent=${a.persistent_account_id ?? 'none'}, ••${a.mask})${c.reset}`
        );
      }
      process.exit(1);
    }
    claimed.add(candidates[0].account_id);
    pairs.push({ stored: s, live: candidates[0] });
    console.log(
      `  ${c.green}pair${c.reset} ${s.accountName} ••${s.mask} → ${candidates[0].name} ••${candidates[0].mask}` +
        `  ${c.dim}(via ${via}; ${s.type}/${s.subtype}, official="${s.officialName}")${c.reset}`
    );
  }

  // --- Pull the pending delta (read-only; cursor is not persisted here) ---
  const cursor = target[0].plaidCursor ?? undefined;
  const added: PlaidTxn[] = [];
  const modified: PlaidTxn[] = [];
  let next = cursor ?? '';
  let hasMore = true;
  while (hasMore) {
    const req: Record<string, unknown> = { access_token: accessToken, count: 500 };
    if (next) req.cursor = next;
    const { data } = await plaid.transactionsSync(req as never);
    added.push(...data.added);
    modified.push(...data.modified);
    next = data.next_cursor;
    hasMore = data.has_more;
  }
  console.log(`\n${c.bold}Pending delta${c.reset}  added=${added.length} modified=${modified.length}`);

  const transactions = (await storage.read<StoredTransaction[]>(`transactions_${familyId}`)) || [];
  const knownPlaidTxnIds = new Set(
    transactions.map(t => t.plaidTransactionId).filter((v): v is string => Boolean(v))
  );

  const rekeys: Array<{ stored: StoredTransaction; from: string | null | undefined; to: string; newAcct: string }> = [];
  const inserts: Array<{ txn: PlaidTxn; accountId: string }> = [];
  const historicUnmatched: PlaidTxn[] = [];

  for (const { stored: oldAcct, live: newAcct } of pairs) {
    const ours = transactions.filter(t => t.accountId === oldAcct.id);
    const lastOurDate = ours.map(t => t.date).sort().pop() ?? '0000-00-00';
    const theirs = added.filter(t => t.account_id === newAcct.account_id);

    // Bag of our rows keyed by date+amount so each is consumed at most once.
    const bag = new Map<string, StoredTransaction[]>();
    for (const t of ours) {
      // Rows already carrying a current-generation id need no re-keying.
      const k = matchKey(t.date, t.amount);
      const list = bag.get(k) || [];
      list.push(t);
      bag.set(k, list);
    }

    // Pass 1 — exact date + amount.
    const leftover: PlaidTxn[] = [];
    for (const p of theirs) {
      if (knownPlaidTxnIds.has(p.transaction_id)) continue; // already reconciled

      const k = matchKey(p.date, p.amount);
      const list = bag.get(k);
      const mate = list && list.length ? list.shift() : undefined;

      if (mate) {
        rekeys.push({ stored: mate, from: mate.plaidTransactionId, to: p.transaction_id, newAcct: newAcct.account_id });
      } else {
        leftover.push(p);
      }
    }

    // Pass 2 — same amount, date within a couple of days. Re-extraction can
    // shift a posted date by a day, which would otherwise look like a new
    // transaction and duplicate a row we already hold. The window stays small
    // and the amount must be exact, so recurring monthly charges of identical
    // value (subscriptions) cannot be mismatched across periods; ambiguous
    // candidates are left unmatched rather than guessed at.
    const DAY = 86400000;
    const remaining = (): StoredTransaction[] => [...bag.values()].flat();
    for (const p of leftover) {
      const pool = remaining().filter(
        t =>
          Math.abs(t.amount - p.amount) < 0.005 &&
          Math.abs(new Date(t.date).getTime() - new Date(p.date).getTime()) <= 2 * DAY
      );
      if (pool.length === 1) {
        const mate = pool[0];
        const k = matchKey(mate.date, mate.amount);
        const list = bag.get(k) || [];
        bag.set(k, list.filter(t => t.id !== mate.id));
        rekeys.push({ stored: mate, from: mate.plaidTransactionId, to: p.transaction_id, newAcct: newAcct.account_id });
        console.log(
          `  ${c.dim}date-shift match: ours ${mate.date} → Plaid ${p.date}  ${p.amount}  ${(p.name || '').slice(0, 28)}${c.reset}`
        );
      } else if (p.date > lastOurDate) {
        inserts.push({ txn: p, accountId: oldAcct.id });
      } else {
        historicUnmatched.push(p);
      }
    }
  }

  // Applying the plan advances the cursor, which consumes `modified` too. Any
  // modified row we cannot place would be silently lost, so account for each
  // one explicitly rather than letting it fall off the end.
  const rekeyedIds = new Set(rekeys.map(r => r.to));
  const insertedIds = new Set(inserts.map(i => i.txn.transaction_id));
  const modifiedOrphans = modified.filter(
    m => !knownPlaidTxnIds.has(m.transaction_id) && !rekeyedIds.has(m.transaction_id) && !insertedIds.has(m.transaction_id)
  );

  // --- Report ---
  console.log(`\n${c.bold}Plan${c.reset}`);
  console.log(
    `  modified rows in delta:     ${modified.length}  ` +
      `${modifiedOrphans.length ? c.yellow + `(${modifiedOrphans.length} unplaceable)` : c.dim + '(all placed)'}${c.reset}`
  );
  if (modifiedOrphans.length) {
    modifiedOrphans.slice(0, 6).forEach(m =>
      console.log(`    ${c.yellow}orphan${c.reset} ${m.date}  ${String(m.amount).padStart(9)}  ${(m.name || '').slice(0, 34)}`)
    );
  }
  console.log(`  accounts to repoint:        ${pairs.length}`);
  console.log(`  transactions to re-key:     ${rekeys.length}  ${c.dim}(keeps categories, notes, splits)${c.reset}`);
  console.log(`  new transactions to insert: ${inserts.length}`);
  console.log(
    `  historic rows with no local match: ${historicUnmatched.length}  ` +
      `${INSERT_HISTORIC ? c.yellow + '(WILL insert)' : c.dim + '(will skip — pass --insert-unmatched-historic to add)'}${c.reset}`
  );

  if (inserts.length) {
    const d = inserts.map(i => i.txn.date).sort();
    console.log(`\n  ${c.bold}inserts${c.reset} ${d[0]} .. ${d[d.length - 1]}`);
    inserts.slice(0, 8).forEach(i =>
      console.log(`    ${i.txn.date}  ${String(i.txn.amount).padStart(9)}  ${(i.txn.name || '').slice(0, 40)}`)
    );
    if (inserts.length > 8) console.log(`    ${c.dim}... ${inserts.length - 8} more${c.reset}`);
  }

  if (historicUnmatched.length) {
    console.log(`\n  ${c.bold}historic unmatched${c.reset} ${c.dim}(review these by eye)${c.reset}`);
    historicUnmatched.slice(0, 12).forEach(t =>
      console.log(`    ${t.date}  ${String(t.amount).padStart(9)}  ${(t.name || '').slice(0, 40)}`)
    );
  }

  if (rekeys.length) {
    const sample = rekeys.slice(0, 5);
    // Compute the shared prefix over exactly the ids being printed, so what the
    // operator sees is guaranteed to distinguish the rows in front of them.
    const shortId = elideSharedPrefix(sample.flatMap(r => [String(r.from), r.to]));
    console.log(`\n  ${c.bold}sample re-keys${c.reset}`);
    sample.forEach(r =>
      console.log(
        `    ${r.stored.date}  ${String(r.stored.amount).padStart(9)}  ${(r.stored.name || '').slice(0, 28).padEnd(30)}` +
          ` ${c.dim}${shortId(String(r.from))} → ${shortId(r.to)}${c.reset}`
      )
    );
    if (rekeys.length > sample.length) {
      console.log(`    ${c.dim}... ${rekeys.length - sample.length} more${c.reset}`);
    }
  }

  const planPath = path.join(process.cwd(), `reconcile-plan-${familyId.slice(0, 8)}.json`);
  fs.writeFileSync(
    planPath,
    JSON.stringify(
      {
        familyId,
        pairs: pairs.map(p => ({
          storedAccountId: p.stored.id,
          from: { plaidAccountId: p.stored.plaidAccountId, mask: p.stored.mask, name: p.stored.accountName },
          to: { plaidAccountId: p.live.account_id, mask: p.live.mask, name: p.live.name },
        })),
        rekeys: rekeys.map(r => ({ id: r.stored.id, date: r.stored.date, amount: r.stored.amount, from: r.from, to: r.to })),
        inserts: inserts.map(i => ({ date: i.txn.date, amount: i.txn.amount, name: i.txn.name })),
        historicUnmatched: historicUnmatched.map(t => ({ date: t.date, amount: t.amount, name: t.name })),
        nextCursor: next,
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

  for (const { stored, live: l } of pairs) {
    stored.plaidAccountId = l.account_id;
    stored.mask = l.mask ?? stored.mask;
    stored.accountName = l.name || stored.accountName;
    stored.officialName = l.official_name ?? stored.officialName;
    stored.status = 'active';
    stored.updatedAt = new Date();
  }

  for (const r of rekeys) {
    r.stored.plaidTransactionId = r.to;
    r.stored.plaidAccountId = r.newAcct;
    r.stored.updatedAt = new Date();
  }

  const toInsert = INSERT_HISTORIC
    ? inserts.concat(historicUnmatched.map(t => ({ txn: t, accountId: pairs[0].stored.id })))
    : inserts;

  for (const { txn, accountId } of toInsert) {
    transactions.push({
      id: uuidv4(),
      userId: familyId,
      accountId,
      plaidTransactionId: txn.transaction_id,
      plaidAccountId: txn.account_id,
      amount: txn.amount,
      date: txn.date,
      name: txn.name,
      userDescription: null,
      merchantName: txn.merchant_name ?? null,
      category: txn.category ?? [],
      plaidCategoryId: txn.category_id ?? null,
      categoryId: null,
      status: txn.pending ? 'pending' : 'posted',
      pending: txn.pending,
      isoCurrencyCode: txn.iso_currency_code ?? null,
      accountOwner: txn.account_owner ?? null,
      originalDescription: null,
      tags: [],
      notes: null,
      isHidden: false,
      isFlagged: false,
      isSplit: false,
      parentTransactionId: null,
      splitTransactionIds: [],
      location: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as StoredTransaction);
  }

  // Cursor lives on every account of the Item.
  for (const a of target) a.plaidCursor = next;

  await storage.write(`transactions_${familyId}`, transactions);
  await storage.write(`accounts_${familyId}`, accounts);

  console.log(`${c.green}${c.bold}Applied.${c.reset} repointed=${pairs.length} rekeyed=${rekeys.length} inserted=${toInsert.length}`);
  console.log(`${c.dim}cursor advanced; next in-app sync will be a normal no-op delta.${c.reset}`);
}

// Only run when invoked directly, so the pure helpers above can be unit-tested
// without executing a script that mutates production financial records.
if (require.main === module) {
  main().catch(e => {
    console.error(`${c.red}reconcile failed:${c.reset}`, e);
    process.exit(1);
  });
}
