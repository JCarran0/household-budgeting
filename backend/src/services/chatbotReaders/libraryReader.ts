/**
 * Family Library Reads for AI Tools (T0) — FAMILY-LIBRARY-BRD §3.3 / §3.4.
 *
 * The assistant's view of the family's imported documents: a catalog
 * (list_documents) and page-ranged text (read_document).
 *
 * RULES THIS FILE EXISTS TO HOLD:
 *
 * 1. Family-scoped by construction (SEC-F004). Keys come only from
 *    `listLibraryKeys(familyId)`, and a requested docId must be a slug before it
 *    becomes a key, so no input can steer a read to another family's documents
 *    or to the `library_evals_` answer keys.
 *
 * 2. Validate on read, fail closed. Every entry is parsed with the same schema
 *    the import script enforces. An entry that does not parse — or whose docId
 *    disagrees with its key — is reported as unreadable, never passed through.
 *    The model will quote whatever it is given verbatim (REQ-F041), so a
 *    malformed body is worse than a missing one.
 *
 * 3. Three absences stay distinct (the SEC-P033 rule from the planning reads):
 *    `not_found` (no such document), `unreadable` (it exists but failed
 *    validation), and a page range that ran past the end. Collapsing them would
 *    let the assistant say "the documents don't say" about a document it never
 *    actually read.
 *
 * 4. Amendments are surfaced in both directions (REQ-F033). A reader of the
 *    original lease must learn that a later document amends it, or it will cite
 *    the superseded figure with full confidence.
 */

import {
  libraryDocIdSchema,
  libraryDocumentSchema,
  libraryFamilyPrefix,
  type LibraryDocument,
} from '../../validators/libraryValidators';

export interface LibraryDataReader {
  getData<T>(key: string): Promise<T | null>;
  listLibraryKeys(familyId: string): Promise<string[]>;
}

/**
 * Most text one read_document call returns. The largest document in the first
 * corpus (the 44-page solar lease) is ~101k chars, so it takes two calls; the
 * rest fit in one. Sized against the model's context and per-turn cost, not
 * against any one document.
 */
export const LIBRARY_READ_MAX_CHARS = 60_000;

const PAGE_SPLIT = /<!-- page (\d+) -->/;

export interface LibraryCatalogEntry {
  docId: string;
  title: string;
  domain: LibraryDocument['domain'];
  kind: string;
  subject: string | null;
  summary: string;
  effectiveDate: string | null;
  pageCount: number;
  /** When this text was imported — part of every citation (REQ-F040). */
  ingestedAt: string;
  /** Where to open the original. Drive URL, or null for a local-file import. */
  sourceUrl: string | null;
  sourceFilename: string | null;
  /** Values withheld at import, by type (REQ-F012). Empty object = none. */
  redactions: LibraryDocument['redactions'];
  /** Documents this one amends; it governs where they conflict. */
  amends: string[];
  /** Documents that amend THIS one; they govern where they conflict. */
  amendedBy: string[];
}

export interface ListDocumentsResult {
  count: number;
  documents: LibraryCatalogEntry[];
  /** Entries present in storage that failed validation and are not shown. */
  unreadableDocIds: string[];
}

export interface ReadDocumentInput {
  docId: string;
  startPage?: number;
  endPage?: number;
}

export type ReadDocumentResult =
  | { status: 'not_found'; docId: string; availableDocIds: string[] }
  | { status: 'unreadable'; docId: string }
  | {
      status: 'ok';
      document: LibraryCatalogEntry;
      /** Pages actually included in `text`, inclusive. */
      pagesReturned: { start: number; end: number } | null;
      /** True when the requested range did not fit; continue at nextStartPage. */
      truncated: boolean;
      nextStartPage: number | null;
      /** Set when startPage was past the last page. Not the same as an empty document. */
      rangeError: string | null;
      /** Document text with its `<!-- page N -->` markers, for citation. */
      text: string;
    };

interface LoadedLibrary {
  docs: LibraryDocument[];
  unreadableDocIds: string[];
}

function docIdFromKey(key: string, familyId: string): string {
  return key.slice(libraryFamilyPrefix(familyId).length);
}

/** Split a validated body into its pages, in order. Markers are guaranteed 1..N. */
function splitPages(body: string): string[] {
  const parts = body.split(PAGE_SPLIT);
  // parts = [preamble, '1', text1, '2', text2, ...]
  const pages: string[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    pages.push(`<!-- page ${parts[i]} -->${parts[i + 1] ?? ''}`.trimEnd());
  }
  return pages;
}

export class ChatbotLibraryReader {
  constructor(private readonly data: LibraryDataReader) {}

  private async load(familyId: string): Promise<LoadedLibrary> {
    const keys = await this.data.listLibraryKeys(familyId);
    const docs: LibraryDocument[] = [];
    const unreadableDocIds: string[] = [];

    // A full read per document to build the catalog. Fine at family scale
    // (a handful of ~100KB objects); revisit with a catalog key if it grows.
    const raw = await Promise.all(keys.map(k => this.data.getData<unknown>(k)));
    keys.forEach((key, i) => {
      const expectedId = docIdFromKey(key, familyId);
      const parsed = libraryDocumentSchema.safeParse(raw[i]);
      if (parsed.success && parsed.data.docId === expectedId) {
        docs.push(parsed.data);
      } else {
        unreadableDocIds.push(expectedId);
      }
    });

    docs.sort((a, b) => a.title.localeCompare(b.title));
    return { docs, unreadableDocIds };
  }

  private toEntry(doc: LibraryDocument, all: LibraryDocument[]): LibraryCatalogEntry {
    return {
      docId: doc.docId,
      title: doc.title,
      domain: doc.domain,
      kind: doc.kind,
      subject: doc.subject ?? null,
      summary: doc.summary,
      effectiveDate: doc.effectiveDate ?? null,
      pageCount: doc.pageCount,
      ingestedAt: doc.ingestedAt,
      sourceUrl: doc.source.url ?? null,
      sourceFilename: doc.source.kind === 'file' ? doc.source.filename : null,
      redactions: doc.redactions,
      amends: doc.amends ?? [],
      amendedBy: all.filter(d => d.amends?.includes(doc.docId)).map(d => d.docId),
    };
  }

  async listDocuments(familyId: string): Promise<ListDocumentsResult> {
    const { docs, unreadableDocIds } = await this.load(familyId);
    return {
      count: docs.length,
      documents: docs.map(d => this.toEntry(d, docs)),
      unreadableDocIds,
    };
  }

  async readDocument(familyId: string, input: ReadDocumentInput): Promise<ReadDocumentResult> {
    const idCheck = libraryDocIdSchema.safeParse(input.docId);
    const { docs, unreadableDocIds } = await this.load(familyId);

    if (!idCheck.success) {
      return { status: 'not_found', docId: String(input.docId), availableDocIds: docs.map(d => d.docId) };
    }
    const docId = idCheck.data;
    if (unreadableDocIds.includes(docId)) return { status: 'unreadable', docId };

    const doc = docs.find(d => d.docId === docId);
    if (!doc) return { status: 'not_found', docId, availableDocIds: docs.map(d => d.docId) };

    const entry = this.toEntry(doc, docs);
    const pages = splitPages(doc.body);
    const start = Math.max(1, Math.floor(input.startPage ?? 1));
    const requestedEnd = Math.min(doc.pageCount, Math.floor(input.endPage ?? doc.pageCount));

    if (start > doc.pageCount) {
      return {
        status: 'ok', document: entry, pagesReturned: null, truncated: false, nextStartPage: null,
        rangeError: `startPage ${start} is past the last page (${doc.pageCount})`, text: '',
      };
    }

    const chunks: string[] = [];
    let size = 0;
    let end = start - 1;
    for (let p = start; p <= Math.max(start, requestedEnd); p++) {
      const page = pages[p - 1];
      // Always return at least one page, even an oversized one.
      if (chunks.length > 0 && size + page.length > LIBRARY_READ_MAX_CHARS) break;
      chunks.push(page);
      size += page.length;
      end = p;
    }

    const truncated = end < Math.max(start, requestedEnd);
    return {
      status: 'ok',
      document: entry,
      pagesReturned: { start, end },
      truncated,
      nextStartPage: truncated ? end + 1 : null,
      rangeError: null,
      text: chunks.join('\n\n'),
    };
  }
}
