#!/usr/bin/env ts-node

/**
 * Family Library — stage and push documents (FAMILY-LIBRARY-BRD §3.1)
 *
 * The deterministic half of `/import-document`. The skill (a model) extracts
 * text and authors metadata; this script does everything that must not depend
 * on a model's judgment: redaction, counting, schema validation, duplicate
 * detection, and the production write.
 *
 * Usage (from backend/):
 *   npm run library -- families
 *   npm run library -- prepare --family <id> --meta <meta.json> --body <body.md> [--force]
 *   npm run library -- evals   --family <id> --doc <docId> --file <evals.json>
 *   npm run library -- list    --family <id> [--prod]
 *   npm run library -- push    --family <id> --doc <docId>
 *
 * `prepare` and `evals` write to LOCAL data only. `push` is the one production
 * write, and is meant to be run by the maintainer, not by the agent
 * (REQ-F004). It re-validates before writing, so a hand-edited local file
 * cannot reach production in a shape the app would reject.
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { FilesystemAdapter } from '../services/storage/filesystemAdapter';
import type { StorageAdapter } from '../services/storage/types';
import type { Family } from '../shared/types';
import { type Args, fail, formatIssues, parseArgs, prodStore, readJsonFile, requireArg, requirePersonalFamily as requirePersonal } from './storeCli';
import { redactDocumentText } from '../utils/documentRedaction';
import {
  LIBRARY_FORMAT_VERSION,
  libraryDocKey,
  libraryDocumentMetaSchema,
  libraryDocumentSchema,
  libraryEvalKey,
  libraryEvalSetSchema,
  libraryFamilyPrefix,
  pageMarkers,
  type LibraryDocument,
  type LibrarySource,
} from '../validators/libraryValidators';

dotenv.config();

const requirePersonalFamily = (store: StorageAdapter, familyId: string): Promise<Family> =>
  requirePersonal(store, familyId, 'library');

async function readDocs(store: StorageAdapter, familyId: string): Promise<LibraryDocument[]> {
  const keys = await store.list(libraryFamilyPrefix(familyId));
  const docs: LibraryDocument[] = [];
  for (const key of keys) {
    const parsed = libraryDocumentSchema.safeParse(await store.read(key));
    if (!parsed.success) {
      console.warn(`! ${key} does not validate and is skipped:\n${formatIssues(parsed.error.issues)}`);
      continue;
    }
    docs.push(parsed.data);
  }
  return docs;
}

/**
 * An `amends` reference to a document the store does not have would tell the
 * assistant to prefer this doc over nothing — or, worse, over a doc pushed
 * later under that id. Referenced docs must exist first.
 */
async function requireAmendedDocs(store: StorageAdapter, familyId: string, amends: string[] | undefined, where: string): Promise<void> {
  if (!amends) return;
  const ids = new Set((await readDocs(store, familyId)).map(d => d.docId));
  const missing = amends.filter(id => !ids.has(id));
  if (missing.length > 0) fail(`amends ${missing.join(', ')}, which ${missing.length === 1 ? 'is' : 'are'} not in the ${where} library yet — import ${missing.length === 1 ? 'it' : 'them'} first`);
}

function sameSource(a: LibrarySource, b: LibrarySource): boolean {
  if (a.kind === 'drive' && b.kind === 'drive') return a.fileId === b.fileId;
  if (a.kind === 'file' && b.kind === 'file') return a.sha256 === b.sha256;
  return false;
}

function sourceUnchanged(a: LibrarySource, b: LibrarySource): boolean {
  if (a.kind === 'drive' && b.kind === 'drive') return a.fileId === b.fileId && a.modifiedTime === b.modifiedTime;
  if (a.kind === 'file' && b.kind === 'file') return a.sha256 === b.sha256;
  return false;
}

/** Context for maintainer review: each marker, and every long digit run left behind. */
function printReview(body: string): void {
  const lines = body.split('\n');
  const clip = (s: string): string => (s.length > 140 ? `${s.slice(0, 137)}…` : s);
  const markerLines = lines.filter(l => l.includes('[REDACTED:'));
  if (markerLines.length > 0) {
    console.log('\nRedacted (in context):');
    for (const l of markerLines) console.log(`  ${clip(l.trim())}`);
  }
  // The redactor cannot see an unlabeled bank account. Long digit runs that
  // survived are listed so a human decides, rather than nobody.
  // Phone numbers, ZIP+4 and UUIDs (every DocuSign page header carries one) are
  // stripped first, and repeated lines collapsed: a review list that is mostly
  // noise trains the reviewer to skim past the line that matters.
  const NOT_AN_ACCOUNT =
    /\[REDACTED:[^\]]*\]|\b(?:1[ -])?(?:\(\d{3}\)\s?|\d{3}[-. ])\d{3}[-. ]\d{4}\b|\b\d{5}-\d{4}\b|\b[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}\b/gi;
  const residual = [...new Set(lines.filter(l => /\d(?:[ -]?\d){7,}/.test(l.replace(NOT_AN_ACCOUNT, ''))))];
  if (residual.length > 0) {
    console.log('\nKept, but contain 8+ digit runs — confirm none is a bank/card number:');
    for (const l of residual) console.log(`  ${clip(l.trim())}`);
  }
}

async function cmdFamilies(): Promise<void> {
  const blob = await new FilesystemAdapter().read<{ families?: Family[] }>('families');
  for (const f of blob?.families ?? []) {
    console.log(`${f.id}  ${f.workspaceType === 'business' ? '(business — excluded)' : '(personal)          '}  ${f.name}`);
  }
}

async function cmdPrepare(args: Args): Promise<void> {
  const familyId = requireArg(args, 'family');
  const local = new FilesystemAdapter();
  await requirePersonalFamily(local, familyId);

  const metaResult = libraryDocumentMetaSchema.safeParse(readJsonFile(requireArg(args, 'meta')));
  if (!metaResult.success) fail(`metadata is invalid:\n${formatIssues(metaResult.error.issues)}`);
  const meta = metaResult.data;

  await requireAmendedDocs(local, familyId, meta.amends, 'local');

  const existing = await readDocs(local, familyId);
  const duplicate = existing.find(d => d.docId !== meta.docId && sameSource(d.source, meta.source));
  if (duplicate) fail(`this source is already imported as "${duplicate.docId}" — re-import under that docId`);
  const prior = existing.find(d => d.docId === meta.docId);
  if (prior && !sameSource(prior.source, meta.source)) {
    fail(`docId "${meta.docId}" already belongs to a different source — choose another docId`);
  }
  if (prior && sourceUnchanged(prior.source, meta.source) && args.force !== true) {
    console.log(`= "${meta.docId}" is unchanged since ${prior.ingestedAt}; nothing written (--force to re-extract)`);
    return;
  }

  const raw = fs.readFileSync(requireArg(args, 'body'), 'utf8').replace(/\r\n/g, '\n').trim() + '\n';
  const { text, counts } = redactDocumentText(raw);

  const candidate: LibraryDocument = {
    ...meta,
    formatVersion: LIBRARY_FORMAT_VERSION,
    pageCount: pageMarkers(text).length,
    ingestedAt: new Date().toISOString(),
    redactions: counts,
    body: text,
  };
  const parsed = libraryDocumentSchema.safeParse(candidate);
  if (!parsed.success) fail(`document is invalid; nothing written:\n${formatIssues(parsed.error.issues)}`);

  await local.write(libraryDocKey(familyId, meta.docId), parsed.data);

  const countText = Object.entries(counts).map(([t, n]) => `${t}: ${n}`).join(', ') || 'none';
  console.log(`${prior ? '↻ updated' : '✓ staged'} ${meta.docId} locally`);
  console.log(`  ${parsed.data.title} — ${parsed.data.pageCount} pages, ${parsed.data.body.length.toLocaleString()} chars`);
  console.log(`  redactions: ${countText}`);
  printReview(parsed.data.body);
}

async function cmdEvals(args: Args): Promise<void> {
  const familyId = requireArg(args, 'family');
  const docId = requireArg(args, 'doc');
  const local = new FilesystemAdapter();
  await requirePersonalFamily(local, familyId);

  const doc = libraryDocumentSchema.safeParse(await local.read(libraryDocKey(familyId, docId)));
  if (!doc.success) fail(`no valid local document "${docId}" — run prepare first`);

  const input = readJsonFile(requireArg(args, 'file'));
  const parsed = libraryEvalSetSchema.safeParse({ formatVersion: LIBRARY_FORMAT_VERSION, docId, ...(input as object) });
  if (!parsed.success) fail(`eval set is invalid:\n${formatIssues(parsed.error.issues)}`);
  const outOfRange = parsed.data.questions.find(q => q.sourcePage !== undefined && q.sourcePage > doc.data.pageCount);
  if (outOfRange) fail(`sourcePage ${outOfRange.sourcePage} is beyond the document's ${doc.data.pageCount} pages`);

  await local.write(libraryEvalKey(familyId, docId), parsed.data);
  console.log(`✓ staged ${parsed.data.questions.length} golden question(s) for ${docId} locally`);
}

async function cmdList(args: Args): Promise<void> {
  const familyId = requireArg(args, 'family');
  const store = args.prod === true ? prodStore() : new FilesystemAdapter();
  const docs = await readDocs(store, familyId);
  console.log(`${args.prod === true ? 'PRODUCTION' : 'local'} library — ${docs.length} document(s)`);
  for (const d of docs) {
    const red = Object.entries(d.redactions).map(([t, n]) => `${t}:${n}`).join(' ');
    const amends = d.amends ? `  amends ${d.amends.join(',')}` : '';
    console.log(`  ${d.docId.padEnd(32)} ${d.domain}/${d.kind}  ${d.pageCount}p  ingested ${d.ingestedAt.slice(0, 10)}  ${red}${amends}`);
  }
}

async function cmdPush(args: Args): Promise<void> {
  const familyId = requireArg(args, 'family');
  const docId = requireArg(args, 'doc');
  const local = new FilesystemAdapter();
  const prod = prodStore();
  await requirePersonalFamily(prod, familyId);

  const doc = libraryDocumentSchema.safeParse(await local.read(libraryDocKey(familyId, docId)));
  if (!doc.success) fail(`local document "${docId}" is missing or invalid; nothing pushed`);

  await requireAmendedDocs(prod, familyId, doc.data.amends, 'production');

  const evalsRaw = await local.read(libraryEvalKey(familyId, docId));
  const evals = evalsRaw === null ? null : libraryEvalSetSchema.safeParse(evalsRaw);
  if (evals && !evals.success) fail(`local eval set for "${docId}" is invalid; nothing pushed`);

  await prod.write(libraryDocKey(familyId, docId), doc.data);
  if (evals?.success) await prod.write(libraryEvalKey(familyId, docId), evals.data);
  console.log(`✓ pushed ${docId} to production${evals?.success ? ` with ${evals.data.questions.length} golden question(s)` : ''}`);
}

async function main(): Promise<void> {
  const { command, args } = parseArgs(process.argv.slice(2));
  switch (command) {
    case 'families': return cmdFamilies();
    case 'prepare': return cmdPrepare(args);
    case 'evals': return cmdEvals(args);
    case 'list': return cmdList(args);
    case 'push': return cmdPush(args);
    default:
      fail('usage: npm run library -- <families|prepare|evals|list|push> [options] (see header of src/scripts/library-document.ts)');
  }
}

main().catch(err => fail(err instanceof Error ? err.message : String(err)));
