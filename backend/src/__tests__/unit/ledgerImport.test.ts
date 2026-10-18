/**
 * Household Ledger import — plan L3, re-import semantics
 *
 * A proposal that is not provably in the stored document must not become a
 * fact, and a re-import must never detach a handled mark or resurrect history.
 */

import { buildDocumentFacts, mergeDocumentFacts, type LedgerExtraction } from '../../services/ledgerImport';
import { LIBRARY_FORMAT_VERSION, type LibraryDocument } from '../../validators/libraryValidators';
import { handledFact, userFact } from '../helpers/ledgerFixtures';

const doc: LibraryDocument = {
  formatVersion: LIBRARY_FORMAT_VERSION,
  docId: 'rivian-care',
  title: 'Rivian Care',
  domain: 'vehicle',
  kind: 'vehicle_service_contract',
  subject: '2026 Rivian R2',
  summary: 'Vehicle service contract covering repairs, cancellation and refund terms for the vehicle.',
  source: { kind: 'file', filename: 'care.pdf', sha256: 'a'.repeat(64) },
  pageCount: 2,
  ingestedAt: '2026-10-17T12:00:00Z',
  redactions: {},
  body:
    '<!-- page 1 -->\nContract Purchase Date: 10/17/2026\nExpiration Date: 10/17/2032\n' +
    '<!-- page 2 -->\nYou may cancel within 60 days of the Contract Purchase Date for a full refund.\n',
};

const refund = {
  slug: 'full-refund',
  title: 'Full refund if cancelled',
  schedule: { kind: 'deadline', due: { anchor: '2026-10-17', offset: { days: 60 } } },
  quotes: [
    { page: 2, text: 'cancel within 60 days of the Contract Purchase Date for a full refund' },
    { page: 1, text: 'Contract Purchase Date: 10/17/2026' },
  ],
  foundBy: ['sonnet', 'fable'],
} satisfies LedgerExtraction['facts'][number];

const expiry = {
  slug: 'expires',
  title: 'Contract expires',
  schedule: { kind: 'expiration', due: { date: '2032-10-17' } },
  quotes: [{ page: 1, text: 'Expiration Date: 10/17/2032' }],
  foundBy: ['sonnet'],
} satisfies LedgerExtraction['facts'][number];

const NOW = '2026-10-17T12:00:00Z';
const build = (facts: LedgerExtraction['facts'], today = '2026-10-17') =>
  buildDocumentFacts({ docId: 'rivian-care', facts }, doc, NOW, today);

describe('buildDocumentFacts', () => {
  it('builds verified facts with the document subject and an id tied to the document', () => {
    const [b] = build([refund]);
    expect(b.problems).toEqual([]);
    expect(b.fact.id).toBe('rivian-care:full-refund');
    expect(b.fact.subject).toBe('2026 Rivian R2');
    expect(b.fact.createdBy).toBe('import');
  });

  it('reports a fabricated quote, an unprinted anchor and a duplicate slug', () => {
    const fabricated = { ...refund, quotes: [{ page: 2, text: 'cancel within 90 days for a full refund of everything' }] };
    const results = build([fabricated, expiry, { ...expiry }]);
    expect(results[0].problems).toEqual(
      expect.arrayContaining([
        'quote 1: not found verbatim on page 2',
        'date 2026-10-17 is not printed in any quote — quote the line that states it',
      ]),
    );
    expect(results[1].problems).toEqual([]);
    expect(results[2].problems).toContain('duplicate slug expires');
  });
});

describe('mergeDocumentFacts', () => {
  it('adds, keeps createdAt/trackFrom on update, withdraws what disappeared, and leaves user facts alone', () => {
    const first = build([refund, expiry]).map(b => b.fact);
    const mine = userFact({ kind: 'note' });
    const handled = handledFact(first[0], '2026-12-16');
    const ledger = [...first, mine, handled];

    const changed = build([{ ...refund, title: 'Full refund if cancelled in time' }], '2026-11-01').map(b => b.fact);
    const result = mergeDocumentFacts(ledger, 'rivian-care', changed, '2026-11-01T00:00:00Z');

    expect(result.updated).toEqual(['rivian-care:full-refund']);
    expect(result.withdrawn).toEqual(['rivian-care:expires']);
    const updated = result.facts.find(f => f.id === 'rivian-care:full-refund')!;
    expect(updated.trackFrom).toBe('2026-10-17');
    expect(updated.createdAt).toBe(NOW);
    expect(updated.title).toBe('Full refund if cancelled in time');
    expect(result.facts.find(f => f.id === 'rivian-care:expires')!.status).toBe('withdrawn');
    expect(result.facts).toContain(mine);
    expect(result.facts).toContain(handled);
  });

  it('reports an identical re-import as unchanged and reactivates a withdrawn fact', () => {
    const facts = build([refund]).map(b => b.fact);
    expect(mergeDocumentFacts(facts, 'rivian-care', build([refund], '2027-01-01').map(b => b.fact), NOW).unchanged).toEqual([
      'rivian-care:full-refund',
    ]);
    const withdrawn = [{ ...facts[0], status: 'withdrawn' as const }];
    const back = mergeDocumentFacts(withdrawn, 'rivian-care', facts, NOW);
    expect(back.updated).toEqual(['rivian-care:full-refund']);
    expect(back.facts[0].status).toBe('active');
  });
});
