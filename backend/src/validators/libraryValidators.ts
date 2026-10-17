/**
 * Family Library — Zod Validators (FAMILY-LIBRARY-BRD §4)
 *
 * The library document format is a contract between two writers and one reader:
 * the `/import-document` skill (a model), the `library-document` script that
 * stages and pushes what the skill produced, and the app, which reads it back
 * for the assistant. The skill's prose can drift; this schema cannot. The
 * script validates against it before anything is written locally and again
 * before anything is pushed, so the app never sees a document it would reject.
 *
 * Storage keys:
 *   library_{familyId}_{docId}        one document (this schema)
 *   library_evals_{familyId}_{docId}  that document's golden questions
 *
 * `library_evals_` deliberately does NOT start with `library_{familyId}_`, so a
 * prefix list of a family's documents can never pick up its eval answers.
 */

import { z } from 'zod';

export const LIBRARY_FORMAT_VERSION = 1;

/** Reasonable ceiling for one document's extracted text (~150 dense pages). */
export const LIBRARY_MAX_BODY_CHARS = 600_000;

/**
 * In-scope domains (BRD REQ-F020 / D-F05). Out-of-scope domains — tax, medical,
 * identity, estate — are absent rather than present-and-refused: a document of
 * those kinds has no value it can validate with (SEC-F005).
 */
export const LIBRARY_DOMAINS = ['vehicle', 'home', 'purchase', 'health_plan'] as const;
export type LibraryDomain = (typeof LIBRARY_DOMAINS)[number];

/** Redaction marker types emitted by `utils/documentRedaction.ts`. */
export const LIBRARY_REDACTION_TYPES = [
  'ssn',
  'card_number',
  'routing_number',
  'bank_account',
  'credential',
] as const;
export type LibraryRedactionType = (typeof LIBRARY_REDACTION_TYPES)[number];

const slug = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a lowercase-kebab slug');

export const libraryDocIdSchema = slug;

const isoDateTime = z.iso.datetime({ offset: true });

const driveSourceSchema = z.object({
  kind: z.literal('drive'),
  fileId: z.string().min(10).max(200).regex(/^[A-Za-z0-9_-]+$/),
  url: z
    .string()
    .url()
    .refine(u => /^https:\/\/(docs|drive)\.google\.com\//.test(u), 'must be a Google Docs/Drive URL'),
  /** Drive `modifiedTime` at ingest; a re-import compares against it (D-F03). */
  modifiedTime: isoDateTime,
});

const fileSourceSchema = z.object({
  kind: z.literal('file'),
  /** Original filename for display only — the path is never stored. */
  filename: z.string().min(1).max(200).regex(/^[^/\\]+$/, 'filename, not a path'),
  /** sha256 of the source bytes; a re-import compares against it. */
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

export const librarySourceSchema = z.discriminatedUnion('kind', [driveSourceSchema, fileSourceSchema]);
export type LibrarySource = z.infer<typeof librarySourceSchema>;

/**
 * What the skill authors. Everything the script derives — redaction, counts,
 * timestamps, format version — is deliberately NOT accepted from the model.
 */
export const libraryDocumentMetaSchema = z
  .object({
    docId: libraryDocIdSchema,
    title: z.string().min(3).max(160),
    domain: z.enum(LIBRARY_DOMAINS),
    /** Short slug within the domain, e.g. `solar_lease`, `extended_warranty`. */
    kind: z.string().min(2).max(48).regex(/^[a-z0-9_]+$/),
    /** What the document is about, e.g. "2026 Rivian R2". Groups docs per asset. */
    subject: z.string().min(2).max(120).optional(),
    /** One paragraph the assistant reads to decide whether to open the doc. */
    summary: z.string().min(40).max(1200),
    /** Signed/effective date of the document, if it has one. */
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    source: librarySourceSchema,
  })
  .strict();
export type LibraryDocumentMeta = z.infer<typeof libraryDocumentMetaSchema>;

const PAGE_MARKER = /<!-- page (\d+) -->/g;

/** Page numbers in marker order. Exported for the reader's page slicing. */
export function pageMarkers(body: string): number[] {
  return Array.from(body.matchAll(PAGE_MARKER), m => Number(m[1]));
}

export const libraryDocumentSchema = libraryDocumentMetaSchema
  .extend({
    formatVersion: z.literal(LIBRARY_FORMAT_VERSION),
    pageCount: z.number().int().min(1).max(1000),
    ingestedAt: isoDateTime,
    redactions: z.partialRecord(z.enum(LIBRARY_REDACTION_TYPES), z.number().int().min(1)),
    body: z.string().min(1).max(LIBRARY_MAX_BODY_CHARS),
  })
  .strict()
  .superRefine((doc, ctx) => {
    // Citations depend on page markers (REQ-F002), so they must be exactly
    // 1..pageCount, in order, each once. A gap means the extractor skipped a
    // page and an answer could cite a page number that points at the wrong text.
    const pages = pageMarkers(doc.body);
    const expected = Array.from({ length: doc.pageCount }, (_, i) => i + 1);
    if (pages.length !== expected.length || pages.some((p, i) => p !== expected[i])) {
      ctx.addIssue({
        code: 'custom',
        path: ['body'],
        message: `page markers must be 1..${doc.pageCount} in order; found [${pages.slice(0, 20).join(', ')}${pages.length > 20 ? ', …' : ''}]`,
      });
    }
    if (!doc.body.trimStart().startsWith('<!-- page 1 -->')) {
      ctx.addIssue({ code: 'custom', path: ['body'], message: 'body must begin with <!-- page 1 -->' });
    }
    // Recorded counts must match the markers actually present, so the catalog
    // can be trusted to say where withheld values live without reading the body.
    for (const type of LIBRARY_REDACTION_TYPES) {
      const present = (doc.body.match(new RegExp(`\\[REDACTED:${type}[\\] ]`, 'g')) ?? []).length;
      const recorded = doc.redactions[type] ?? 0;
      if (present !== recorded) {
        ctx.addIssue({
          code: 'custom',
          path: ['redactions', type],
          message: `recorded ${recorded} but body contains ${present}`,
        });
      }
    }
  });
export type LibraryDocument = z.infer<typeof libraryDocumentSchema>;

/**
 * Golden questions (REQ-F044). Answers are written by a human from the source,
 * never by the model that extracted it — otherwise the check is circular.
 */
export const libraryEvalSetSchema = z
  .object({
    formatVersion: z.literal(LIBRARY_FORMAT_VERSION),
    docId: libraryDocIdSchema,
    questions: z
      .array(
        z
          .object({
            question: z.string().min(8).max(400),
            /** answerable: the doc says. redacted: the doc says but the value was withheld. unanswerable: the library is silent. */
            expect: z.enum(['answerable', 'redacted', 'unanswerable']),
            expectedAnswer: z.string().min(1).max(600),
            sourcePage: z.number().int().min(1).optional(),
          })
          .strict()
      )
      .min(1)
      .max(20),
  })
  .strict();
export type LibraryEvalSet = z.infer<typeof libraryEvalSetSchema>;

export function libraryDocKey(familyId: string, docId: string): string {
  return `library_${familyId}_${docId}`;
}

export function libraryEvalKey(familyId: string, docId: string): string {
  return `library_evals_${familyId}_${docId}`;
}

/** Prefix that lists one family's documents and nothing else. */
export function libraryFamilyPrefix(familyId: string): string {
  return `library_${familyId}_`;
}
