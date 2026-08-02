#!/usr/bin/env ts-node

/**
 * Plaid Item Diagnostic (read-only)
 *
 * One-shot triage tool for "this institution stopped syncing" reports. Answers
 * the question the PM2 logs would answer, without needing shell access to prod:
 * is the Item errored, is consent expiring, which products are actually granted,
 * and what does transactions_sync return for the cursor we have stored?
 *
 * READ-ONLY. It never writes to disk and never advances the stored cursor —
 * transactions_sync is called with the stored cursor and the result discarded,
 * so the next real sync behaves exactly as it would have.
 *
 * Requires local .env to point at the same PLAID_ENV / credentials as prod, and
 * PLAID_ENCRYPTION_SECRET to match, or the stored token will not decrypt.
 *
 * Usage:
 *   npx ts-node src/scripts/diagnose-plaid-item.ts --institution="Capital One"
 *   npx ts-node src/scripts/diagnose-plaid-item.ts --item-id="L93jVJjEeAHP..."
 *   npx ts-node src/scripts/diagnose-plaid-item.ts --all
 *
 * The one non-read-only flag, opt-in and never implied by the others:
 *   --refresh   POST /transactions/refresh for the matched item(s), then re-poll.
 *               Forces an on-demand extraction when Plaid has silently stopped
 *               updating an Item. May be billable depending on your Plaid plan,
 *               so it is deliberately separate from the diagnostic path.
 */

import * as dotenv from 'dotenv';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

dotenv.config();

import { FilesystemAdapter } from '../services/storage/filesystemAdapter';
import { encryptionService } from '../utils/encryption';

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

interface StoredAccountShape {
  id: string;
  plaidItemId: string;
  plaidAccountId: string;
  plaidAccessToken: string;
  institutionName: string;
  accountName: string;
  mask: string | null;
  status: string;
  lastSynced: string | null;
  plaidCursor?: string | null;
}

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find(a => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length).replace(/^["']|["']$/g, '') : undefined;
}

function buildPlaidClient(): PlaidApi {
  const env = process.env.PLAID_ENV || 'sandbox';
  const basePath = PlaidEnvironments[env];
  if (!basePath) {
    throw new Error(`Unknown PLAID_ENV: ${env}`);
  }
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

/** Pull the Plaid error body out of an axios-shaped rejection without using `any`. */
function extractPlaidError(error: unknown): Record<string, unknown> | null {
  if (
    error &&
    typeof error === 'object' &&
    'response' in error &&
    error.response &&
    typeof error.response === 'object' &&
    'data' in error.response &&
    error.response.data &&
    typeof error.response.data === 'object'
  ) {
    return error.response.data as Record<string, unknown>;
  }
  return null;
}

function describeError(error: unknown): string {
  const body = extractPlaidError(error);
  if (body) {
    return `${String(body.error_code)} / ${String(body.error_type)} — ${String(body.error_message)}`;
  }
  return error instanceof Error ? error.message : String(error);
}

async function loadAccounts(): Promise<StoredAccountShape[]> {
  const storage = new FilesystemAdapter();
  const accountKeys = await storage.list('accounts_');

  const all: StoredAccountShape[] = [];
  for (const key of accountKeys) {
    const rows = await storage.read<StoredAccountShape[]>(key);
    if (Array.isArray(rows)) {
      all.push(...rows);
    }
  }
  return all;
}

async function diagnoseItem(
  client: PlaidApi,
  plaidItemId: string,
  accounts: StoredAccountShape[]
): Promise<void> {
  const institution = accounts[0].institutionName;
  console.log(`\n${colors.bold}${colors.cyan}=== ${institution} (item ${plaidItemId}) ===${colors.reset}`);

  console.log(`${colors.dim}Stored accounts:${colors.reset}`);
  for (const a of accounts) {
    console.log(
      `  ${a.accountName} ${a.mask ?? '----'}  status=${a.status}  lastSynced=${a.lastSynced ?? 'never'}  cursor=${a.plaidCursor ? 'present' : 'NONE'}`
    );
  }

  let accessToken: string;
  try {
    accessToken = encryptionService.decrypt(accounts[0].plaidAccessToken);
  } catch (error) {
    console.log(`${colors.red}Could not decrypt access token: ${describeError(error)}${colors.reset}`);
    console.log(`${colors.dim}PLAID_ENCRYPTION_SECRET likely differs from the one that encrypted it.${colors.reset}`);
    return;
  }

  // 1. Item health: the authoritative view of error state + consent expiry.
  try {
    const { data } = await client.itemGet({ access_token: accessToken });
    const item = data.item;
    console.log(`\n${colors.bold}/item/get${colors.reset}`);
    console.log(`  institution_id:          ${item.institution_id}`);
    console.log(`  available_products:      ${JSON.stringify(item.available_products)}`);
    console.log(`  billed_products:         ${JSON.stringify(item.billed_products)}`);
    console.log(`  products:                ${JSON.stringify(item.products ?? [])}`);
    console.log(`  consented_products:      ${JSON.stringify(item.consented_products ?? [])}`);

    const consent = item.consent_expiration_time;
    if (consent) {
      const expiry = new Date(consent);
      const days = Math.round((expiry.getTime() - Date.now()) / 86400000);
      const tone = days <= 0 ? colors.red : days < 30 ? colors.yellow : colors.green;
      console.log(`  consent_expiration_time: ${tone}${consent} (${days} days)${colors.reset}`);
    } else {
      console.log(`  consent_expiration_time: ${colors.dim}null${colors.reset}`);
    }

    if (item.error) {
      console.log(`  ${colors.red}error: ${item.error.error_code} — ${item.error.error_message}${colors.reset}`);
    } else {
      console.log(`  ${colors.green}error: none${colors.reset}`);
    }

    // The smoking gun for "balances fine, transactions stale": Plaid tracks the
    // last time it successfully pulled *transactions* separately from the Item's
    // overall health. A stale last_successful_update with no Item error means
    // Plaid's own connection to the institution stopped producing transactions.
    const status = data.status;
    if (status) {
      const tx = status.transactions;
      console.log(`\n${colors.bold}item.status.transactions${colors.reset}`);
      if (tx) {
        const ok = tx.last_successful_update;
        const failed = tx.last_failed_update;
        if (ok) {
          const ageDays = Math.round((Date.now() - new Date(ok).getTime()) / 86400000);
          const tone = ageDays > 3 ? colors.red : colors.green;
          console.log(`  last_successful_update: ${tone}${ok} (${ageDays}d ago)${colors.reset}`);
        } else {
          console.log(`  last_successful_update: ${colors.dim}null${colors.reset}`);
        }
        console.log(`  last_failed_update:     ${failed ?? 'null'}`);
      } else {
        console.log(`  ${colors.dim}no transactions status reported${colors.reset}`);
      }
      if (status.last_webhook) {
        console.log(
          `  last_webhook:           ${status.last_webhook.sent_at ?? '?'} (${status.last_webhook.code_sent ?? '?'})`
        );
      } else {
        console.log(`  last_webhook:           ${colors.dim}none${colors.reset}`);
      }
    }
  } catch (error) {
    console.log(`  ${colors.red}/item/get failed: ${describeError(error)}${colors.reset}`);
  }

  // 2. Balances: does the accounts endpoint still work for this item?
  try {
    const { data } = await client.accountsGet({ access_token: accessToken });
    console.log(`\n${colors.bold}/accounts/get${colors.reset}  ${colors.green}ok${colors.reset} — ${data.accounts.length} accounts returned`);
  } catch (error) {
    console.log(`\n${colors.bold}/accounts/get${colors.reset}  ${colors.red}FAILED${colors.reset} — ${describeError(error)}`);
  }

  // 3. The actual question: what does transactions_sync return for our cursor?
  //    Single page only; the result is discarded and the cursor is NOT persisted.
  const cursor = accounts[0].plaidCursor ?? undefined;
  try {
    const { data } = await client.transactionsSync({
      access_token: accessToken,
      count: 500,
      ...(cursor ? { cursor } : {}),
    });
    console.log(`\n${colors.bold}/transactions/sync${colors.reset}  ${colors.green}ok${colors.reset}`);
    console.log(`  added:      ${data.added.length}`);
    console.log(`  modified:   ${data.modified.length}`);
    console.log(`  removed:    ${data.removed.length}`);
    console.log(`  has_more:   ${data.has_more}`);
    console.log(`  cursor_moved: ${data.next_cursor !== cursor}`);

    const dates = data.added.map(t => t.date).sort();
    if (dates.length) {
      console.log(`  added date range: ${dates[0]} .. ${dates[dates.length - 1]}`);
    }
  } catch (error) {
    console.log(`\n${colors.bold}/transactions/sync${colors.reset}  ${colors.red}FAILED${colors.reset} — ${describeError(error)}`);
    const body = extractPlaidError(error);
    if (body?.error_code === 'ACCESS_NOT_GRANTED') {
      console.log(
        `  ${colors.yellow}Transactions permission was withdrawn at the institution while balance access remains.${colors.reset}`
      );
      console.log(`  ${colors.yellow}Fix: reconnect via Plaid Link update mode and re-grant transactions.${colors.reset}`);
    }
  }

  // 4. Cursor-independent probe. /transactions/sync is a delta against our stored
  //    cursor; /transactions/get asks "what does Plaid hold right now?" regardless
  //    of cursor. Disagreement between the two means our cursor is the problem;
  //    agreement means Plaid genuinely has no newer data from the institution.
  const end = new Date();
  const start = new Date(end.getTime() - 60 * 86400000);
  const iso = (d: Date): string => d.toISOString().slice(0, 10);
  try {
    const { data } = await client.transactionsGet({
      access_token: accessToken,
      start_date: iso(start),
      end_date: iso(end),
      options: { count: 500, offset: 0 },
    });
    console.log(`\n${colors.bold}/transactions/get${colors.reset} (${iso(start)} .. ${iso(end)})  ${colors.green}ok${colors.reset}`);
    console.log(`  total_transactions: ${data.total_transactions}`);
    const dates = data.transactions.map(t => t.date).sort();
    if (dates.length) {
      console.log(`  date range held by Plaid: ${dates[0]} .. ${colors.bold}${dates[dates.length - 1]}${colors.reset}`);
    } else {
      console.log(`  ${colors.yellow}Plaid holds no transactions at all in this window.${colors.reset}`);
    }
  } catch (error) {
    console.log(`\n${colors.bold}/transactions/get${colors.reset}  ${colors.red}FAILED${colors.reset} — ${describeError(error)}`);
  }

  if (!process.argv.includes('--refresh')) {
    return;
  }

  // 5. Opt-in remediation. /transactions/refresh is asynchronous: it returns
  //    immediately and Plaid extracts in the background, so poll item status
  //    until last_successful_update moves rather than reading the response.
  console.log(`\n${colors.bold}${colors.yellow}/transactions/refresh${colors.reset} (on-demand extraction requested)`);
  try {
    await client.transactionsRefresh({ access_token: accessToken });
    console.log(`  ${colors.green}accepted${colors.reset} — polling for completion`);
  } catch (error) {
    console.log(`  ${colors.red}FAILED${colors.reset} — ${describeError(error)}`);
    return;
  }

  let moved = false;
  for (let attempt = 1; attempt <= 10; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 6000));
    try {
      const { data } = await client.itemGet({ access_token: accessToken });
      const ok = data.status?.transactions?.last_successful_update ?? null;
      const failed = data.status?.transactions?.last_failed_update ?? null;
      const ageDays = ok ? Math.round((Date.now() - new Date(ok).getTime()) / 86400000) : null;
      console.log(`  [${attempt * 6}s] last_successful_update=${ok} (${ageDays}d) last_failed_update=${failed}`);

      if (ok && ageDays !== null && ageDays < 1) {
        console.log(`  ${colors.green}refresh completed${colors.reset}`);
        moved = true;
        break;
      }
      if (data.item.error) {
        console.log(`  ${colors.red}item error surfaced: ${data.item.error.error_code} — ${data.item.error.error_message}${colors.reset}`);
        moved = true;
        break;
      }
    } catch (error) {
      console.log(`  poll failed: ${describeError(error)}`);
    }
  }

  if (!moved) {
    console.log(`  ${colors.yellow}last_successful_update never advanced within the poll window.${colors.reset}`);
  }

  // Re-read what Plaid holds now. This is still read-only — the app's stored
  // cursor is untouched, so the next in-app sync will pick up any new data.
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 60 * 86400000);
    const { data } = await client.transactionsGet({
      access_token: accessToken,
      start_date: iso(start),
      end_date: iso(end),
      options: { count: 500, offset: 0 },
    });
    const dates = data.transactions.map(t => t.date).sort();
    console.log(`\n${colors.bold}post-refresh /transactions/get${colors.reset}`);
    console.log(`  total_transactions: ${data.total_transactions}`);
    console.log(`  latest date held:   ${colors.bold}${dates.length ? dates[dates.length - 1] : 'none'}${colors.reset}`);
  } catch (error) {
    console.log(`  post-refresh check failed: ${describeError(error)}`);
  }
}

async function main(): Promise<void> {
  const institutionFilter = parseArg('institution');
  const itemFilter = parseArg('item-id');
  const all = process.argv.includes('--all');

  if (!institutionFilter && !itemFilter && !all) {
    console.log('Specify --institution="Name", --item-id="..." or --all');
    process.exit(1);
  }

  console.log(`${colors.dim}PLAID_ENV=${process.env.PLAID_ENV}${colors.reset}`);

  const accounts = await loadAccounts();
  if (!accounts.length) {
    console.log(`${colors.red}No accounts found in local data. Run npm run sync:production first.${colors.reset}`);
    process.exit(1);
  }

  // Dedupe by item — one Item can back several accounts, and cursor/token are per-Item.
  const byItem = new Map<string, StoredAccountShape[]>();
  for (const a of accounts) {
    if (!a.plaidItemId || !a.plaidAccessToken) continue;
    if (itemFilter && !a.plaidItemId.startsWith(itemFilter)) continue;
    if (
      institutionFilter &&
      !a.institutionName.toLowerCase().includes(institutionFilter.toLowerCase())
    ) {
      continue;
    }
    const group = byItem.get(a.plaidItemId) || [];
    group.push(a);
    byItem.set(a.plaidItemId, group);
  }

  if (!byItem.size) {
    console.log(`${colors.red}No matching items.${colors.reset}`);
    process.exit(1);
  }

  const client = buildPlaidClient();
  for (const [plaidItemId, itemAccounts] of byItem) {
    await diagnoseItem(client, plaidItemId, itemAccounts);
  }
  console.log('');
}

main().catch(error => {
  console.error(`${colors.red}Diagnostic failed:${colors.reset}`, error);
  process.exit(1);
});
