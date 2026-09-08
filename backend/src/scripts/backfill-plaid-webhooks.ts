#!/usr/bin/env ts-node

/**
 * Point existing Plaid Items at our webhook URL (TD-021 step 2).
 *
 * An Item's webhook is set when its link token is created. Every Item linked
 * before `PLAID_WEBHOOK_URL` existed therefore carries none and will never
 * receive one — confirmed in August 2026 as `last_webhook: none` on all nine.
 * Setting the env var fixes only Items linked *after* the deploy, so without
 * this script the fix silently does nothing for the accounts that actually
 * exist. `/item/webhook/update` is the supported way to change it in place.
 *
 * DRY RUN BY DEFAULT — writes nothing without --apply.
 *
 * Usage:
 *   AWS_PROFILE=budget-app-prod npx ts-node src/scripts/backfill-plaid-webhooks.ts
 *   ... --apply                 actually update
 *   ... --local                 read local backend/data instead of prod S3
 *   ... --url=https://...       override PLAID_WEBHOOK_URL
 */

import * as dotenv from 'dotenv';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

dotenv.config();

import { FilesystemAdapter } from '../services/storage/filesystemAdapter';
import { S3Adapter } from '../services/storage/s3Adapter';
import { encryptionService } from '../utils/encryption';

const c = {
  reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', dim: '\x1b[2m', bold: '\x1b[1m',
};

const APPLY = process.argv.includes('--apply');
const LOCAL = process.argv.includes('--local');

function parseArg(name: string): string | undefined {
  const p = `--${name}=`;
  const hit = process.argv.find(a => a.startsWith(p));
  return hit ? hit.slice(p.length).replace(/^["']|["']$/g, '') : undefined;
}

interface Storage {
  read<T>(key: string): Promise<T | null>;
  list(prefix: string): Promise<string[]>;
}

interface StoredAccount {
  plaidItemId: string;
  plaidAccessToken: string;
  institutionName: string;
  accountName: string;
  mask: string | null;
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

async function main(): Promise<void> {
  const webhookUrl = parseArg('url') || process.env.PLAID_WEBHOOK_URL;
  if (!webhookUrl) throw new Error('PLAID_WEBHOOK_URL is not set (or pass --url=...)');
  if (!/^https:\/\//.test(webhookUrl)) {
    throw new Error(`Webhook URL must be https, got: ${webhookUrl}`);
  }

  const storage = buildStorage();
  const plaid = buildPlaid();

  console.log(
    `${c.dim}mode=${APPLY ? 'APPLY' : 'DRY RUN'} source=${LOCAL ? 'local' : 'prod S3'} ` +
    `plaid_env=${process.env.PLAID_ENV || 'sandbox'}${c.reset}`
  );
  console.log(`${c.dim}target=${webhookUrl}${c.reset}\n`);

  const keys = (await storage.list('accounts_')).filter(k => k.includes('accounts_'));

  // One access token per Item — several accounts share it, and calling
  // /item/webhook/update once per account would be redundant API traffic
  // against a rate-limited endpoint.
  const items = new Map<string, { token: string; label: string; count: number }>();
  for (const key of keys) {
    const accounts = (await storage.read<StoredAccount[]>(key)) ?? [];
    for (const a of accounts) {
      if (!a.plaidItemId || !a.plaidAccessToken) continue;
      const existing = items.get(a.plaidItemId);
      if (existing) { existing.count += 1; continue; }
      items.set(a.plaidItemId, {
        token: a.plaidAccessToken,
        label: `${a.institutionName} — ${a.accountName}${a.mask ? ` ••${a.mask}` : ''}`,
        count: 1,
      });
    }
  }

  if (items.size === 0) {
    console.log(`${c.yellow}No Items found.${c.reset}`);
    return;
  }

  console.log(`${c.bold}${items.size} Item(s)${c.reset}\n`);

  let updated = 0;
  let failed = 0;

  for (const [itemId, info] of items) {
    const shortId = `…${itemId.slice(-8)}`;
    let accessToken: string;
    try {
      accessToken = encryptionService.decrypt(info.token);
    } catch {
      console.log(`  ${c.red}✗${c.reset} ${shortId}  ${info.label}  ${c.red}token decrypt failed${c.reset}`);
      failed += 1;
      continue;
    }

    if (!APPLY) {
      console.log(`  ${c.dim}would update${c.reset} ${shortId}  ${info.label} ${c.dim}(${info.count} account${info.count === 1 ? '' : 's'})${c.reset}`);
      continue;
    }

    try {
      await plaid.itemWebhookUpdate({ access_token: accessToken, webhook: webhookUrl });
      console.log(`  ${c.green}✓${c.reset} ${shortId}  ${info.label}`);
      updated += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  ${c.red}✗${c.reset} ${shortId}  ${info.label}  ${c.red}${message}${c.reset}`);
      failed += 1;
    }
  }

  console.log();
  if (!APPLY) {
    console.log(`${c.yellow}Dry run — nothing changed. Re-run with --apply.${c.reset}`);
  } else {
    console.log(`${c.green}${c.bold}Done.${c.reset} updated=${updated} failed=${failed}`);
    console.log(`${c.dim}Plaid fires a WEBHOOK_UPDATE_ACKNOWLEDGED to the new URL on success.${c.reset}`);
  }
}

// Only run when invoked directly, so the helpers stay importable.
if (require.main === module) {
  main().catch(e => {
    console.error(`${c.red}backfill failed:${c.reset}`, e);
    process.exit(1);
  });
}
