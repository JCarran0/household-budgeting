#!/usr/bin/env tsx
/**
 * READ-ONLY diagnostic: is the descriptor masking present in Plaid's own
 * response, or is our ingestion introducing it?
 *
 * Calls /transactions/get directly and prints the raw response fields verbatim
 * with no mapping applied, then compares Plaid's `name` against the one we
 * stored, keyed on transaction_id. Writes nothing, anywhere.
 *
 * Usage:
 *   npx tsx src/scripts/probe-plaid-descriptors.ts --account=<storedAccountId>
 *   ... --since=2026-06-01
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

// dotenv does not overwrite variables already present in the environment, so
// anything exported on the command line wins over backend/.env. That is what
// lets this run against production values pulled from SSM without editing .env:
//
//   PLAID_ENCRYPTION_SECRET=$(aws ssm get-parameter ...) npx tsx <this script>
//
// The local .env carries a different PLAID_ENCRYPTION_SECRET than production,
// and the stored access tokens were encrypted with production's — so without
// the override every decrypt fails with "unable to authenticate data".
dotenv.config({ path: path.join(__dirname, '../../.env') });

const DATA = path.join(__dirname, '../../data');

function arg(name: string, fallback: string): string {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
}

const ACCOUNT_ID = arg('account', '4efb43e4-3fed-4f0e-a59c-c266c620f4fc');
const START = arg('since', '2026-06-01');
const END = arg('until', new Date().toISOString().slice(0, 10));

/**
 * Loaded lazily: a static `import` is hoisted above `dotenv.config()`, so the
 * encryption module would read its secret from an environment that does not
 * exist yet and derive the wrong key.
 */
function decryptToken(encrypted: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { encryptionService } = require('../utils/encryption');
  return encryptionService.decrypt(encrypted) as string;
}

async function main() {
  // Pin the family explicitly. The same account id appears in several local
  // accounts files because sync-production-data.ts leaves sanitized copies
  // behind (fabricated institution names, randomized masks) — searching for the
  // id picks one of those and probes the wrong item.
  const familyId = arg('family', '64a86709-6660-4393-b86c-e77c32dcff63');
  const accounts = JSON.parse(
    fs.readFileSync(path.join(DATA, `accounts_${familyId}.json`), 'utf8'),
  );
  const acct = accounts.find((a: { id: string }) => a.id === ACCOUNT_ID);

  const client = new PlaidApi(new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV || 'production'],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
      },
    },
  }));

  console.log(`Plaid env   : ${process.env.PLAID_ENV}`);
  console.log(`plaid SDK   : ${require('plaid/package.json').version}`);
  console.log(`institution : ${acct.institutionName} / ${acct.nickname ?? acct.accountName}`);
  console.log(`window      : ${START} .. ${END}\n`);

  const res = await client.transactionsGet({
    access_token: decryptToken(acct.plaidAccessToken),
    start_date: START,
    end_date: END,
    options: {
      account_ids: [acct.plaidAccountId],
      count: 500,
      offset: 0,
      // The documented escape hatch: "the string returned by the financial
      // institution", included only when the client asks for it. Our sync path
      // never sets this, which is why original_description is null on every
      // stored row.
      include_original_description: true,
    },
  });

  const txns = res.data.transactions;
  console.log(`returned ${txns.length} of ${res.data.total_transactions}; request_id=${res.data.request_id}\n`);

  const masked = txns.filter(t => /\*\*\*/.test(t.name || ''));
  console.log(`=== RAW PLAID ROWS WHOSE name CONTAINS '***': ${masked.length} ===\n`);
  for (const t of masked.slice(0, 8)) {
    console.log(JSON.stringify({
      date: t.date,
      amount: t.amount,
      name: t.name,
      merchant_name: t.merchant_name,
      original_description: (t as unknown as { original_description?: string }).original_description ?? null,
      counterparties: (t as unknown as { counterparties?: unknown }).counterparties ?? null,
      website: (t as unknown as { website?: string }).website ?? null,
      payment_channel: t.payment_channel,
      transaction_id: t.transaction_id,
    }, null, 2));
  }

  console.log(`\n=== ALL ${masked.length} MASKED ROWS: does enrichment rescue them? ===`);
  let noMerchant = 0;
  for (const t of masked) {
    if (!t.merchant_name) noMerchant++;
    console.log(
      `${t.date}  ${String(t.amount).padStart(8)}  ${(t.name || '').padEnd(26)} merchant_name=${JSON.stringify(t.merchant_name)}`,
    );
  }
  console.log(`\n${noMerchant} of ${masked.length} masked rows have NO merchant_name.`);

  const stored = JSON.parse(fs.readFileSync(path.join(DATA, `transactions_${familyId}.json`), 'utf8'));
  const byPlaidId = new Map<string, { name?: string }>(
    stored.map((t: { plaidTransactionId: string }) => [t.plaidTransactionId, t]),
  );

  let compared = 0;
  let divergent = 0;
  for (const t of txns) {
    const ours = byPlaidId.get(t.transaction_id);
    if (!ours) continue;
    compared++;
    if ((ours.name || '') !== (t.name || '')) {
      divergent++;
      console.log(
        `DIVERGENT ${t.transaction_id}  ${t.date}  ${String(t.amount).padStart(8)}  ` +
        `plaid=${JSON.stringify(t.name)}  ours=${JSON.stringify(ours.name)}`,
      );
    }
  }
  console.log(`\n=== plaid.name vs stored.name: ${compared} compared, ${divergent} divergent ===`);

  // Would the preservation guard have caught every one of them, without
  // blocking any legitimate update?
  const { isDescriptorDegradation } = require('../services/descriptorPreservation');
  let blocked = 0;
  let allowed = 0;
  let missed = 0;
  for (const t of txns) {
    const ours = byPlaidId.get(t.transaction_id);
    if (!ours) continue;
    if ((ours.name || '') === (t.name || '')) continue;
    if (isDescriptorDegradation(ours.name, t.name)) {
      blocked++;
    } else {
      allowed++;
      if (/\*{3,}/.test(t.name || '')) missed++;
    }
  }
  console.log(`guard: would block ${blocked} of ${divergent} divergent updates, allow ${allowed}`);
  console.log(`guard: masked replacements that would still get through: ${missed}`);
  if (compared > 0 && divergent === 0) {
    console.log('Every stored name is byte-identical to what Plaid returned.');
  }
}

main().catch((e: { response?: { data?: unknown }; message?: string }) => {
  console.error('FAILED:', e?.response?.data ?? e?.message);
  process.exit(1);
});
