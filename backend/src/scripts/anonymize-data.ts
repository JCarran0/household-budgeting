#!/usr/bin/env ts-node

/**
 * Data Anonymizer
 *
 * Produces a shareable, anonymized copy of the JSON data store so a dev build
 * can be handed to other people without exposing real financial data, names,
 * or bank credentials.
 *
 * What it does:
 *   - Randomizes every monetary value (transaction amounts, balances, budgets,
 *     statement line items, etc.) within the original's order of magnitude,
 *     preserving sign so income/expense/chart semantics stay sane.
 *   - Mangles all "account numbers" and credentials: card/account masks,
 *     Plaid access tokens, Plaid item/account/transaction ids, sync cursors,
 *     and Amazon order numbers.
 *   - Replaces personally-identifying text (merchant names, descriptions,
 *     account/institution names, people, addresses, notes, task titles) with
 *     stable fakes — the SAME original always maps to the SAME fake, so the
 *     anonymized data still looks coherent (one merchant stays one merchant).
 *   - Resets every user's password to a single known dev password so testers
 *     can actually log in, and prints the resulting credentials.
 *
 * What it deliberately leaves intact (so the app keeps working):
 *   - All UUIDs / ids / foreign keys, dates, category ids & the categories file,
 *     enums/flags, and the trip/project `tag` linkage used by transactions.
 *
 * Usage:
 *   npm run anonymize:data                      # writes ./data-anonymized
 *   npm run anonymize:data -- --out ./somewhere
 *   npm run anonymize:data -- --in-place        # overwrite ./data (destructive)
 *   npm run anonymize:data -- --password hunter2 --seed 42
 *
 * Recommended flow:
 *   npm run sync:production         # pull prod data down
 *   npm run anonymize:data -- --in-place   # fake it in place; serve the dev share
 *
 * Real data is canonical in prod — `npm run sync:production` restores it, so the
 * in-place overwrite keeps no local backup.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import bcrypt from 'bcryptjs';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

interface Options {
  inDir: string;
  outDir: string;
  inPlace: boolean;
  force: boolean;
  password: string;
  seed: number;
}

function parseArgs(argv: string[]): Options {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i !== -1 ? argv[i + 1] : undefined;
  };
  const has = (flag: string) => argv.includes(flag);

  const inDir = path.resolve(get('--in') || process.env.DATA_DIR || './data');
  const inPlace = has('--in-place');
  const outDir = path.resolve(get('--out') || (inPlace ? inDir : `${inDir}-anonymized`));

  return {
    inDir,
    outDir,
    inPlace,
    force: has('--force'),
    password: get('--password') || 'demo1234',
    seed: get('--seed') ? Number(get('--seed')) : Math.floor(Math.random() * 2 ** 31),
  };
}

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — keeps runs reproducible with --seed, no deps
// ---------------------------------------------------------------------------

let _state = 0;
function seedRng(seed: number) {
  _state = seed >>> 0;
}
function rnd(): number {
  _state |= 0;
  _state = (_state + 0x6d2b79f5) | 0;
  let t = Math.imul(_state ^ (_state >>> 15), 1 | _state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;

// ---------------------------------------------------------------------------
// Fake value pools
// ---------------------------------------------------------------------------

const MERCHANTS = [
  'Brightside Coffee', 'Northgate Market', 'Cedar & Pine Co.', 'Lumen Electronics',
  'Riverbend Diner', 'Apex Hardware', 'Sunny Day Grocers', 'Quill & Co.',
  'Pinecrest Pharmacy', 'Harborview Cafe', 'Maple Street Bakery', 'Vector Software',
  'Blue Heron Bistro', 'Summit Outfitters', 'Twin Oaks Garden', 'Lighthouse Books',
  'Crescent Auto', 'Willow Creek Deli', 'Ironwood Furniture', 'Aurora Wellness',
  'Granite Peak Gear', 'Tideline Seafood', 'Copperfield Tools', 'Meadowlark Florals',
  'Stonebridge Cinema', 'Ember Grill House', 'Polaris Travel', 'Driftwood Surf Shop',
];
const COMPANIES = [
  'Acme Holdings LLC', 'Globex Corp', 'Initech Inc.', 'Umbrella Group',
  'Stark Solutions', 'Wayne Enterprises', 'Soylent Foods', 'Hooli Technologies',
  'Pied Piper LLC', 'Vandelay Industries',
];
const PEOPLE = [
  'Alex', 'Sam', 'Jordan', 'Casey', 'Riley', 'Taylor', 'Morgan', 'Jamie',
  'Avery', 'Quinn', 'Drew', 'Reese', 'Devon', 'Parker', 'Rowan', 'Skyler',
];
const BANKS = [
  'First National Bank', 'Evergreen Credit Union', 'Summit Savings Bank',
  'Harbor Trust', 'Cascade Financial', 'Liberty Bank', 'Meridian Credit Union',
];
const ACCOUNT_NAMES = [
  'Checking', 'Savings', 'Premier Checking', 'High-Yield Savings', 'Everyday Checking',
  'Rewards Card', 'Platinum Card', 'Money Market', 'Cash Account', 'Joint Checking',
];
const STREETS = [
  '120 Maple Ave', '47 Birch Lane', '883 Oak Street', '215 Cedar Court',
  '9 Elm Terrace', '604 Willow Way', '31 Pinecrest Rd', '772 Aspen Blvd',
];
const CITIES = ['Springfield', 'Riverton', 'Fairview', 'Lakewood', 'Georgetown', 'Madison', 'Clinton', 'Ashland'];
const STATES = ['NY', 'CA', 'TX', 'FL', 'WA', 'CO', 'IL', 'MA', 'OR', 'NC'];
const TASK_TITLES = [
  'Fix the sink', 'Mow the lawn', 'Pay the bill', 'Schedule appointment', 'Clean the garage',
  'Water the plants', 'Take out recycling', 'Plan weekend trip', 'Organize closet', 'Call the plumber',
];
const NOTES = ['Sample note', 'For reference', 'Follow up later', 'Estimated', 'Recurring', ''];

// ---------------------------------------------------------------------------
// Stable fakers — same original -> same fake (per pool)
// ---------------------------------------------------------------------------

const stableMaps: Record<string, Map<string, string>> = {};
function stableFake(pool: string, poolValues: string[], original: string): string {
  if (!stableMaps[pool]) stableMaps[pool] = new Map();
  const map = stableMaps[pool];
  if (map.has(original)) return map.get(original)!;
  const idx = map.size;
  const base = poolValues[idx % poolValues.length];
  // Disambiguate once we wrap past the pool length so fakes stay unique-ish
  const fake = idx < poolValues.length ? base : `${base} ${Math.floor(idx / poolValues.length) + 1}`;
  map.set(original, fake);
  return fake;
}

const randDigits = (len: number) => Array.from({ length: len }, () => randInt(0, 9)).join('');

const credMaps = new Map<string, string>();
function stableCredential(original: string): string {
  if (credMaps.has(original)) return credMaps.get(original)!;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const len = Math.max(8, original.length);
  let out = '';
  for (let i = 0; i < len; i++) out += chars[randInt(0, chars.length - 1)];
  credMaps.set(original, out);
  return out;
}

const orderMap = new Map<string, string>();
function stableOrderNumber(original: string): string {
  if (orderMap.has(original)) return orderMap.get(original)!;
  const fake = `${randDigits(3)}-${randDigits(7)}-${randDigits(7)}`;
  orderMap.set(original, fake);
  return fake;
}

// ---------------------------------------------------------------------------
// Money randomization — same order of magnitude, sign preserved
// ---------------------------------------------------------------------------

function randomizeMoney(value: number): number {
  if (value === 0) return 0;
  const sign = value < 0 ? -1 : 1;
  const mag = Math.abs(value);
  let lo: number, hi: number;
  if (mag < 50) { lo = 1; hi = 50; }
  else if (mag < 500) { lo = 10; hi = 500; }
  else if (mag < 5000) { lo = 100; hi = 5000; }
  else if (mag < 50000) { lo = 1000; hi = 50000; }
  else { lo = 50000; hi = 750000; }
  const raw = lo + rnd() * (hi - lo);
  // Keep whole-dollar values whole (budgets), otherwise round to cents
  const rounded = Number.isInteger(value) ? Math.round(raw) : Math.round(raw * 100) / 100;
  return sign * rounded;
}

// ---------------------------------------------------------------------------
// Field classification
// ---------------------------------------------------------------------------

const MONEY_FIELDS = new Set([
  'amount', 'currentBalance', 'availableBalance', 'creditLimit', 'limit',
  'totalAmount', 'estimatedPrice', 'estimatedAmount', 'estimatedCost', 'totalBudget',
  'payout', 'commission', 'royalty', 'totalIncome', 'totalExpenses',
]);

// Fixed-length numeric identifiers (last-4 style) — keep length, randomize digits
const MASK_FIELDS = new Set(['mask', 'cardIdentifier']);

// Opaque credentials / Plaid identifiers — stable per original to keep refs intact
const CREDENTIAL_FIELDS = new Set([
  'plaidAccessToken', 'plaidCursor', 'plaidItemId', 'plaidAccountId', 'plaidTransactionId',
]);

// Text fields -> (pool name, pool values)
const TEXT_FIELDS: Record<string, [string, string[]]> = {
  merchantName: ['merchant', MERCHANTS],
  name: ['merchant', MERCHANTS],
  originalDescription: ['merchant', MERCHANTS],
  description: ['merchant', MERCHANTS],
  institutionName: ['bank', BANKS],
  accountName: ['acctName', ACCOUNT_NAMES],
  officialName: ['acctName', ACCOUNT_NAMES],
  nickname: ['acctName', ACCOUNT_NAMES],
  accountOwner: ['person', PEOPLE],
  displayName: ['person', PEOPLE],
  clientName: ['person', PEOPLE],
  businessName: ['company', COMPANIES],
  clientCompany: ['company', COMPANIES],
  title: ['task', TASK_TITLES],
  userDescription: ['note', NOTES],
  notes: ['note', NOTES],
  address: ['street', STREETS],
  businessAddress: ['street', STREETS],
  clientAddress: ['street', STREETS],
  city: ['city', CITIES],
  region: ['state', STATES],
};

// Files copied verbatim (structural / internal / not value-bearing)
const SKIP_PREFIXES = ['categories', 'chatbot_costs', 'theme_preferences', 'push_preferences'];
const SKIP_FILES = new Set(['rate_limits.json']);
// Files whose contents are device secrets — emptied rather than copied
const EMPTY_PREFIXES = ['push_subscriptions'];

let DEV_PASSWORD_HASH = '';

function isSkipped(file: string): boolean {
  if (SKIP_FILES.has(file)) return true;
  return SKIP_PREFIXES.some((p) => file.startsWith(p));
}
function isEmptied(file: string): boolean {
  return EMPTY_PREFIXES.some((p) => file.startsWith(p));
}

// ---------------------------------------------------------------------------
// Recursive transform
// ---------------------------------------------------------------------------

function transformValue(key: string, value: unknown): unknown {
  // username gets a person-derived slug so logins stay human + unique
  if (key === 'username' && typeof value === 'string' && value) {
    return stableFake('username', PEOPLE.map((p) => p.toLowerCase()), value);
  }
  if (key === 'passwordHash' && typeof value === 'string') {
    return DEV_PASSWORD_HASH;
  }
  if (key === 'orderNumber' && typeof value === 'string' && value) {
    return stableOrderNumber(value);
  }
  if (MONEY_FIELDS.has(key) && typeof value === 'number') {
    return randomizeMoney(value);
  }
  if (MASK_FIELDS.has(key) && typeof value === 'string' && value) {
    return randDigits(value.length);
  }
  if (CREDENTIAL_FIELDS.has(key) && typeof value === 'string' && value) {
    return stableCredential(value);
  }
  if ((key === 'lat' || key === 'lon') && typeof value === 'number') {
    return null;
  }
  if (key === 'postalCode' && typeof value === 'string' && value) {
    return randDigits(5);
  }
  if (key === 'patterns' && Array.isArray(value)) {
    return value.map((v) => (typeof v === 'string' && v ? stableFake('merchant', MERCHANTS, v) : v));
  }
  if (TEXT_FIELDS[key] && typeof value === 'string' && value) {
    const [pool, values] = TEXT_FIELDS[key];
    return stableFake(pool, values, value);
  }
  return value;
}

function walk(key: string, node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => walk(key, item));
  }
  if (node !== null && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      // Recurse first so nested objects/arrays are processed, then apply the
      // scalar rule for this key.
      if (v !== null && typeof v === 'object') {
        out[k] = walk(k, v);
      } else {
        out[k] = transformValue(k, v);
      }
    }
    return out;
  }
  return transformValue(key, node);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  seedRng(opts.seed);
  DEV_PASSWORD_HASH = await bcrypt.hash(opts.password, 10);

  if (!fs.existsSync(opts.inDir)) {
    console.error(`Input data dir not found: ${opts.inDir}`);
    process.exit(1);
  }

  console.log('Data Anonymizer');
  console.log(`  Input : ${opts.inDir}`);
  console.log(`  Output: ${opts.outDir}${opts.inPlace ? '  (IN-PLACE)' : ''}`);
  console.log(`  Seed  : ${opts.seed}`);
  console.log('');

  if (opts.inPlace && !opts.force) {
    const ok = await confirm(
      'This OVERWRITES your data dir in place with anonymized values. ' +
        'Recover real data with `npm run sync:production`. Continue? (y/N) ',
    );
    if (!ok) {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  if (!opts.inPlace) {
    fs.mkdirSync(opts.outDir, { recursive: true });
  }

  const entries = fs.readdirSync(opts.inDir, { withFileTypes: true });
  const credentials: Array<{ username: string; displayName: string }> = [];

  let processed = 0;
  let copied = 0;
  let emptied = 0;
  let skippedDirs = 0;

  for (const entry of entries) {
    const name = entry.name;
    const srcPath = path.join(opts.inDir, name);
    const destPath = path.join(opts.outDir, name);

    if (entry.isDirectory()) {
      // e.g. backups/ — skip, not part of the shareable surface
      skippedDirs++;
      continue;
    }
    if (!name.endsWith('.json')) {
      // .bak / .corrupt etc. — do not carry junk into the share
      continue;
    }

    // Emptied secret files
    if (isEmptied(name)) {
      let raw: unknown;
      try {
        raw = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
      } catch {
        raw = [];
      }
      const empty = Array.isArray(raw) ? [] : {};
      fs.writeFileSync(destPath, JSON.stringify(empty, null, 2));
      emptied++;
      continue;
    }

    // Verbatim copies
    if (isSkipped(name)) {
      if (srcPath !== destPath) fs.copyFileSync(srcPath, destPath);
      copied++;
      continue;
    }

    // Parse + transform
    let data: unknown;
    try {
      data = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
    } catch (err) {
      console.warn(`  ! Skipping unparseable file: ${name}`);
      continue;
    }

    const anonymized = walk('', data);
    fs.writeFileSync(destPath, JSON.stringify(anonymized, null, 2));
    processed++;

    // Collect login creds from the users file
    if (name === 'users.json') {
      const usersWrap = anonymized as { users?: Array<{ username?: string; displayName?: string }> };
      for (const u of usersWrap.users || []) {
        if (u.username) credentials.push({ username: u.username, displayName: u.displayName || '' });
      }
    }
  }

  console.log('');
  console.log(`Done. ${processed} anonymized, ${copied} copied verbatim, ${emptied} emptied, ${skippedDirs} dirs skipped.`);
  console.log('');
  console.log(`All users share the dev password: "${opts.password}"`);
  if (credentials.length) {
    console.log('Login credentials:');
    for (const c of credentials) {
      console.log(`  - ${c.username}  (${c.displayName})  /  ${opts.password}`);
    }
  }
  if (!opts.inPlace) {
    console.log('');
    console.log('To run the app against this data:');
    console.log(`  DATA_DIR="${opts.outDir}" npm run dev`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
