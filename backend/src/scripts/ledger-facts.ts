#!/usr/bin/env ts-node

/**
 * Household Ledger — stage and push document facts (HOUSEHOLD-LEDGER-BRD §3.2)
 *
 * The deterministic half of fact extraction. Models propose facts for a
 * library document (an extraction file); this script verifies every quote
 * verbatim against the stored body, computes every date, shows the maintainer
 * a review list with single-model facts flagged, and writes nothing that does
 * not verify.
 *
 * Usage (from backend/):
 *   npm run ledger -- stage --family <id> --file <extraction.json>
 *   npm run ledger -- list  --family <id> [--prod] [--today YYYY-MM-DD]
 *   npm run ledger -- push  --family <id> --doc <docId>
 *
 * `stage` writes LOCAL data only and is all-or-nothing: one fact that fails
 * verification stages none, so a document's facts are never half-imported.
 * `push` is the one production write and is run by the maintainer, not the
 * agent. It re-verifies against the PRODUCTION copy of the document, so a fact
 * cannot reach production quoting text production does not hold.
 */

import * as dotenv from 'dotenv';
import { FilesystemAdapter } from '../services/storage/filesystemAdapter';
import type { StorageAdapter } from '../services/storage/types';
import type { LedgerFact, LedgerFile, LedgerSchedule } from '../shared/types';
import { etDateString } from '../shared/utils/easternTime';
import { computeHeadsUp, resolveDate } from '../shared/utils/ledgerDates';
import { buildDocumentFacts, ledgerExtractionSchema, mergeDocumentFacts } from '../services/ledgerImport';
import { redactFactText } from '../services/ledgerStore';
import { LEDGER_FORMAT_VERSION, ledgerFileSchema, ledgerKey, verifyDocumentFact } from '../validators/ledgerValidators';
import { libraryDocKey, libraryDocumentSchema, type LibraryDocument } from '../validators/libraryValidators';
import { type Args, fail, formatIssues, parseArgs, prodStore, readJsonFile, requireArg, requirePersonalFamily } from './storeCli';

dotenv.config();

async function readLedger(store: StorageAdapter, familyId: string): Promise<LedgerFile> {
  const raw = await store.read<unknown>(ledgerKey(familyId));
  if (raw === null) return { formatVersion: LEDGER_FORMAT_VERSION, facts: [] };
  const parsed = ledgerFileSchema.safeParse(raw);
  if (!parsed.success) fail(`ledger for ${familyId} does not validate; refusing to touch it:\n${formatIssues(parsed.error.issues)}`);
  return parsed.data;
}

async function writeLedger(store: StorageAdapter, familyId: string, facts: LedgerFact[]): Promise<void> {
  const parsed = ledgerFileSchema.safeParse({ formatVersion: LEDGER_FORMAT_VERSION, facts: facts.map(redactFactText) });
  if (!parsed.success) fail(`resulting ledger is invalid; nothing written:\n${formatIssues(parsed.error.issues)}`);
  await store.write(ledgerKey(familyId), parsed.data);
}

async function readDoc(store: StorageAdapter, familyId: string, docId: string, where: string): Promise<LibraryDocument> {
  const parsed = libraryDocumentSchema.safeParse(await store.read(libraryDocKey(familyId, docId)));
  if (!parsed.success) fail(`no valid ${where} library document "${docId}"`);
  return parsed.data;
}

function describeSchedule(s: LedgerSchedule): string {
  const show = (spec: Parameters<typeof resolveDate>[0]): string =>
    'date' in spec ? spec.date : `${resolveDate(spec)} (= ${spec.anchor} ${JSON.stringify(spec.offset)})`;
  switch (s.kind) {
    case 'note': return 'note (undated)';
    case 'deadline': return `deadline ${show(s.due)}`;
    case 'expiration': return `expires ${show(s.due)}`;
    case 'window': return `window ${show(s.opens)} → ${show(s.closes)}`;
    case 'recurring': return `every ${JSON.stringify(s.every)} from ${show(s.first)}${s.until ? ` until ${show(s.until)}` : ''}`;
  }
}

async function cmdStage(args: Args): Promise<void> {
  const familyId = requireArg(args, 'family');
  const local = new FilesystemAdapter();
  await requirePersonalFamily(local, familyId, 'ledger');

  const extraction = ledgerExtractionSchema.safeParse(readJsonFile(requireArg(args, 'file')));
  if (!extraction.success) fail(`extraction file is invalid:\n${formatIssues(extraction.error.issues)}`);
  const doc = await readDoc(local, familyId, extraction.data.docId, 'local');

  const built = buildDocumentFacts(extraction.data, doc, new Date().toISOString(), etDateString());
  console.log(`${doc.title} — ${built.length} proposed fact(s)\n`);
  for (const b of built) {
    const flag = b.problems.length > 0 ? '✗' : b.foundBy.length < 2 ? '⚠' : '✓';
    console.log(`${flag} ${b.fact.id}`);
    console.log(`    ${b.fact.title}${b.fact.amount ? ` — ${b.fact.amount}` : ''}`);
    if (b.problems.length === 0) console.log(`    ${describeSchedule(b.fact.schedule)}`);
    console.log(`    found by: ${b.foundBy.join(', ')}${b.foundBy.length < 2 ? '  ← SINGLE MODEL: check it against the page' : ''}`);
    if (b.fact.source.kind === 'document') {
      for (const q of b.fact.source.quotes) console.log(`    p.${q.page}: "${q.text}"`);
    }
    for (const p of b.problems) console.log(`    ! ${p}`);
  }

  const failed = built.filter(b => b.problems.length > 0);
  if (failed.length > 0) fail(`${failed.length} fact(s) failed verification; nothing staged`);

  const ledger = await readLedger(local, familyId);
  const merged = mergeDocumentFacts(ledger.facts, doc.docId, built.map(b => b.fact), new Date().toISOString());
  await writeLedger(local, familyId, merged.facts);
  console.log(
    `\n✓ staged locally: ${merged.added.length} added, ${merged.updated.length} updated, ` +
      `${merged.unchanged.length} unchanged, ${merged.withdrawn.length} withdrawn`,
  );
  for (const id of merged.withdrawn) console.log(`  withdrawn: ${id}`);
}

async function cmdList(args: Args): Promise<void> {
  const familyId = requireArg(args, 'family');
  const store = args.prod === true ? prodStore() : new FilesystemAdapter();
  const today = typeof args.today === 'string' ? args.today : etDateString();
  const { facts } = await readLedger(store, familyId);
  console.log(`${args.prod === true ? 'PRODUCTION' : 'local'} ledger — ${facts.length} fact(s)`);
  const bySubject = new Map<string, LedgerFact[]>();
  for (const f of facts) bySubject.set(f.subject, [...(bySubject.get(f.subject) ?? []), f]);
  for (const [subject, list] of bySubject) {
    console.log(`\n${subject}`);
    for (const f of list) {
      const status = f.status === 'withdrawn' ? ' [withdrawn]' : '';
      const link = f.handles ? `  handles ${f.handles.factId}@${f.handles.occurrenceDate}` : f.overrides ? `  overrides ${f.overrides}` : '';
      console.log(`  ${f.id}${status}  ${describeSchedule(f.schedule)}${link}`);
      console.log(`      ${f.title}`);
    }
  }
  const headsUp = computeHeadsUp(facts, today);
  console.log(`\nHeads-up on ${today}: ${headsUp.length === 0 ? 'nothing' : ''}`);
  for (const h of headsUp) console.log(`  [${h.phase}] ${h.dueDate} (${h.daysUntilDue}d)  ${h.subject} — ${h.title}`);
}

async function cmdPush(args: Args): Promise<void> {
  const familyId = requireArg(args, 'family');
  const docId = requireArg(args, 'doc');
  const local = new FilesystemAdapter();
  const prod = prodStore();
  await requirePersonalFamily(prod, familyId, 'ledger');

  const prodDoc = await readDoc(prod, familyId, docId, 'production');
  const localFacts = (await readLedger(local, familyId)).facts.filter(
    f => f.source.kind === 'document' && f.source.docId === docId && f.status === 'active',
  );
  if (localFacts.length === 0) fail(`no staged facts for "${docId}" — run stage first`);
  const unverified = localFacts.flatMap(f => verifyDocumentFact(f, prodDoc).map(p => `${f.id}: ${p}`));
  if (unverified.length > 0) fail(`facts do not verify against the production document; nothing pushed:\n  ${unverified.join('\n  ')}`);

  const ledger = await readLedger(prod, familyId);
  const merged = mergeDocumentFacts(ledger.facts, docId, localFacts, new Date().toISOString());
  await writeLedger(prod, familyId, merged.facts);
  console.log(
    `✓ pushed ${docId} facts to production: ${merged.added.length} added, ${merged.updated.length} updated, ` +
      `${merged.unchanged.length} unchanged, ${merged.withdrawn.length} withdrawn`,
  );
}

async function main(): Promise<void> {
  const { command, args } = parseArgs(process.argv.slice(2));
  switch (command) {
    case 'stage': return cmdStage(args);
    case 'list': return cmdList(args);
    case 'push': return cmdPush(args);
    default:
      fail('usage: npm run ledger -- <stage|list|push> [options] (see header of src/scripts/ledger-facts.ts)');
  }
}

main().catch(err => fail(err instanceof Error ? err.message : String(err)));
