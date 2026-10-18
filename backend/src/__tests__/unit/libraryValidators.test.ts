/**
 * Family Library document format — BRD §4
 *
 * The schema is the contract the `/import-document` skill cannot drift from,
 * so these tests pin the rules that keep citations honest: page markers,
 * redaction counts that match the body, and scope enforced by the domain enum.
 */

import {
  LIBRARY_FORMAT_VERSION,
  libraryDocKey,
  libraryDocumentMetaSchema,
  libraryDocumentSchema,
  libraryEvalKey,
  libraryFamilyPrefix,
  type LibraryDocument,
} from '../../validators/libraryValidators';

const FAMILY = '64a86709-6660-4393-b86c-e77c32dcff63';

function doc(overrides: Partial<LibraryDocument> = {}): LibraryDocument {
  return {
    formatVersion: LIBRARY_FORMAT_VERSION,
    docId: 'solar-lease',
    title: 'Solar Lease Agreement',
    domain: 'home',
    kind: 'solar_lease',
    subject: 'Rooftop solar system',
    summary: 'Twenty-year residential solar lease with an annual payment escalator and production guarantee.',
    source: {
      kind: 'drive',
      fileId: '1AbCdEfGhIjKlMnOp',
      url: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view',
      modifiedTime: '2023-04-02T18:11:00Z',
    },
    pageCount: 2,
    ingestedAt: '2026-10-17T15:00:00Z',
    redactions: { bank_account: 1 },
    body: '<!-- page 1 -->\nTerms.\n<!-- page 2 -->\nBank account #: [REDACTED:bank_account …4821]\n',
    ...overrides,
  };
}

describe('libraryDocumentSchema', () => {
  it('accepts a well-formed document', () => {
    expect(libraryDocumentSchema.safeParse(doc()).success).toBe(true);
  });

  it('rejects a skipped page marker', () => {
    const r = libraryDocumentSchema.safeParse(
      doc({ pageCount: 3, body: '<!-- page 1 -->\na\n<!-- page 3 -->\n[REDACTED:bank_account …4821]' })
    );
    expect(r.success).toBe(false);
  });

  it('rejects redaction counts that disagree with the body', () => {
    expect(libraryDocumentSchema.safeParse(doc({ redactions: {} })).success).toBe(false);
    expect(libraryDocumentSchema.safeParse(doc({ redactions: { bank_account: 1, ssn: 1 } })).success).toBe(false);
  });

  it('rejects an out-of-scope domain', () => {
    expect(libraryDocumentSchema.safeParse({ ...doc(), domain: 'estate' }).success).toBe(false);
    expect(libraryDocumentSchema.safeParse({ ...doc(), domain: 'tax' }).success).toBe(false);
  });

  it('rejects a non-Google source URL', () => {
    const r = libraryDocumentSchema.safeParse(
      doc({ source: { kind: 'drive', fileId: '1AbCdEfGhIjKlMnOp', url: 'https://evil.example/x', modifiedTime: '2023-04-02T18:11:00Z' } })
    );
    expect(r.success).toBe(false);
  });
});

describe('libraryDocumentMetaSchema', () => {
  it('refuses fields the script derives, so the model cannot supply them', () => {
    const { formatVersion: _v, pageCount: _p, ingestedAt: _i, redactions, body: _b, ...meta } = doc();
    expect(libraryDocumentMetaSchema.safeParse(meta).success).toBe(true);
    expect(libraryDocumentMetaSchema.safeParse({ ...meta, redactions }).success).toBe(false);
  });

  it('refuses a file source that carries a path', () => {
    const { formatVersion: _v, pageCount: _p, ingestedAt: _i, redactions: _r, body: _b, ...meta } = doc();
    const r = libraryDocumentMetaSchema.safeParse({
      ...meta,
      source: { kind: 'file', filename: '/Users/x/Downloads/r2.pdf', sha256: 'a'.repeat(64) },
    });
    expect(r.success).toBe(false);
  });
});

describe('amends', () => {
  it('accepts a document that amends another', () => {
    const r = libraryDocumentSchema.safeParse(doc({ docId: 'solar-cap-package', amends: ['solar-lease'] }));
    expect(r.success).toBe(true);
  });

  it('rejects a document that amends itself, in both schemas', () => {
    expect(libraryDocumentSchema.safeParse(doc({ amends: ['solar-lease'] })).success).toBe(false);
    const { formatVersion: _v, pageCount: _p, ingestedAt: _i, redactions: _r, body: _b, ...meta } = doc();
    expect(libraryDocumentMetaSchema.safeParse({ ...meta, amends: ['solar-lease'] }).success).toBe(false);
  });

  it('rejects an empty or malformed amends list', () => {
    expect(libraryDocumentSchema.safeParse(doc({ docId: 'x-cap', amends: [] })).success).toBe(false);
    expect(libraryDocumentSchema.safeParse(doc({ docId: 'x-cap', amends: ['Solar Lease'] })).success).toBe(false);
  });
});

describe('library storage keys', () => {
  it('keeps eval answers out of a family document listing', () => {
    expect(libraryEvalKey(FAMILY, 'solar-lease').startsWith(libraryFamilyPrefix(FAMILY))).toBe(false);
    expect(libraryDocKey(FAMILY, 'solar-lease').startsWith(libraryFamilyPrefix(FAMILY))).toBe(true);
  });
});
