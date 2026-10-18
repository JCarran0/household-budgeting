/**
 * Household Ledger — document fact import (HOUSEHOLD-LEDGER-BRD §3.2, plan L3)
 *
 * The deterministic half of fact extraction. Models read a library document
 * and propose facts (an extraction file); this module turns a proposal into
 * ledger facts, verifies each one against the stored document, and merges a
 * document's facts into a ledger. It never decides what a contract says — it
 * decides whether a proposal is provably grounded in the stored text.
 *
 * Re-import semantics (BRD open question, settled here):
 *   - fact ids are `{docId}:{slug}`, so a re-import updates a fact in place and
 *     any handled mark or correction pointing at it stays attached
 *   - a fact that keeps its id keeps its createdAt and trackFrom; a re-import
 *     must not resurrect occurrences the household already left behind
 *   - a fact the new extraction no longer contains is `withdrawn`, never
 *     deleted, so the marks that reference it still validate
 *   - only this document's facts are touched; user and app facts never are
 */

import { z } from 'zod';
import type { LedgerFact } from '../shared/types';
import { libraryDocIdSchema, type LibraryDocument } from '../validators/libraryValidators';
import {
  ledgerFactSchema,
  ledgerQuoteSchema,
  ledgerScheduleSchema,
  verifyDocumentFact,
} from '../validators/ledgerValidators';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** What extraction produces for one document. Authored by models; untrusted. */
export const ledgerExtractionSchema = z
  .object({
    docId: libraryDocIdSchema,
    facts: z
      .array(
        z
          .object({
            slug: z.string().min(2).max(60).regex(SLUG, 'must be a lowercase-kebab slug'),
            /** Defaults to the document's subject. */
            subject: z.string().trim().min(2).max(120).optional(),
            title: z.string().trim().min(3).max(160),
            detail: z.string().max(2000).optional(),
            amount: z.string().trim().min(1).max(60).optional(),
            schedule: ledgerScheduleSchema,
            leadDays: z.array(z.number().int().min(0).max(730)).min(1).max(4).optional(),
            quotes: z.array(ledgerQuoteSchema).min(1).max(4),
            /** Which extractors proposed this fact. One name means single-model: review it harder (REQ-H011). */
            foundBy: z.array(z.string().min(1).max(40)).min(1).max(4),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export type LedgerExtraction = z.infer<typeof ledgerExtractionSchema>;

export interface BuiltFact {
  fact: LedgerFact;
  foundBy: string[];
  problems: string[];
}

/**
 * Turn an extraction into candidate facts and verify every one. A fact with
 * problems must not be written; the caller decides whether that blocks the rest.
 */
export function buildDocumentFacts(
  extraction: LedgerExtraction,
  doc: LibraryDocument,
  nowIso: string,
  today: string,
): BuiltFact[] {
  const seen = new Set<string>();
  return extraction.facts.map(item => {
    const fact: LedgerFact = {
      id: `${doc.docId}:${item.slug}`,
      subject: item.subject ?? doc.subject ?? doc.title,
      title: item.title,
      ...(item.detail !== undefined ? { detail: item.detail } : {}),
      ...(item.amount !== undefined ? { amount: item.amount } : {}),
      schedule: item.schedule,
      ...(item.leadDays !== undefined ? { leadDays: item.leadDays } : {}),
      source: { kind: 'document', docId: doc.docId, quotes: item.quotes },
      trackFrom: today,
      status: 'active',
      createdAt: nowIso,
      createdBy: 'import',
    };
    const problems: string[] = [];
    if (extraction.docId !== doc.docId) problems.push(`extraction is for ${extraction.docId}, not ${doc.docId}`);
    if (seen.has(fact.id)) problems.push(`duplicate slug ${item.slug}`);
    seen.add(fact.id);
    const shape = ledgerFactSchema.safeParse(fact);
    if (!shape.success) problems.push(...shape.error.issues.map(i => `${i.path.join('.') || 'fact'}: ${i.message}`));
    else problems.push(...verifyDocumentFact(fact, doc));
    return { fact, foundBy: item.foundBy, problems };
  });
}

function sameContent(a: LedgerFact, b: LedgerFact): boolean {
  const strip = ({ createdAt: _c, updatedAt: _u, trackFrom: _t, ...rest }: LedgerFact): Omit<LedgerFact, 'createdAt' | 'updatedAt' | 'trackFrom'> => {
    void _c; void _u; void _t;
    return rest;
  };
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}

export interface MergeResult {
  facts: LedgerFact[];
  added: string[];
  updated: string[];
  unchanged: string[];
  withdrawn: string[];
}

/** Replace one document's facts in a ledger, per the re-import semantics above. */
export function mergeDocumentFacts(
  existing: LedgerFact[],
  docId: string,
  incoming: LedgerFact[],
  nowIso: string,
): MergeResult {
  const isThisDoc = (f: LedgerFact): boolean => f.source.kind === 'document' && f.source.docId === docId;
  const byId = new Map(incoming.map(f => [f.id, f]));
  const result: MergeResult = { facts: [], added: [], updated: [], unchanged: [], withdrawn: [] };
  const kept = new Set<string>();

  for (const f of existing) {
    if (!isThisDoc(f)) {
      result.facts.push(f);
      continue;
    }
    const next = byId.get(f.id);
    if (!next) {
      if (f.status === 'active') {
        result.withdrawn.push(f.id);
        result.facts.push({ ...f, status: 'withdrawn', updatedAt: nowIso });
      } else {
        result.facts.push(f);
      }
      continue;
    }
    kept.add(f.id);
    const merged: LedgerFact = { ...next, createdAt: f.createdAt, trackFrom: f.trackFrom };
    if (sameContent(merged, f)) {
      result.unchanged.push(f.id);
      result.facts.push(f);
    } else {
      result.updated.push(f.id);
      result.facts.push({ ...merged, updatedAt: nowIso });
    }
  }
  for (const f of incoming) {
    if (kept.has(f.id)) continue;
    result.added.push(f.id);
    result.facts.push(f);
  }
  return result;
}
