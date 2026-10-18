/**
 * Household Ledger schema — HOUSEHOLD-LEDGER-BRD §3, SEC-H001/H002
 *
 * The gates that do not depend on a person: who may close or correct a fact,
 * that every rule is one code can compute, that links resolve, and that a
 * document fact's quotes and dates really are in the stored document.
 */

import {
  LEDGER_FORMAT_VERSION,
  ledgerFactSchema,
  ledgerFileSchema,
  ledgerKey,
  ledgerPrefsKey,
  ledgerSentKey,
  printedForms,
  verifyDocumentFact,
} from '../../validators/ledgerValidators';
import { LIBRARY_FORMAT_VERSION, type LibraryDocument } from '../../validators/libraryValidators';
import type { LedgerFact } from '../../shared/types';
import { docFact, handledFact, userFact } from '../helpers/ledgerFixtures';

const messages = (fact: LedgerFact): string[] => {
  const r = ledgerFactSchema.safeParse(fact);
  return r.success ? [] : r.error.issues.map(i => i.message);
};
const fileMessages = (facts: LedgerFact[]): string[] => {
  const r = ledgerFileSchema.safeParse({ formatVersion: LEDGER_FORMAT_VERSION, facts });
  return r.success ? [] : r.error.issues.map(i => i.message);
};

const deadline = { kind: 'deadline', due: { date: '2026-11-05' } } as const;

describe('ledgerFactSchema', () => {
  it('accepts a document fact, a user fact and a handled mark', () => {
    const doc = docFact('opt-out', deadline);
    expect(messages(doc)).toEqual([]);
    expect(messages(userFact({ kind: 'note' }))).toEqual([]);
    expect(messages(handledFact(doc, '2026-11-05'))).toEqual([]);
  });

  it('ties a fact id to its source', () => {
    expect(messages(docFact('x', deadline, { id: 'other-doc:x' }))).toContain('a document fact id must start with its docId');
    expect(messages(userFact(deadline, { id: 'rivian-care:x' }))).toContain('only document facts use a {docId}: id');
    expect(messages(userFact(deadline, { id: 'f_not-a-uuid' }))).toContain('must be {docId}:{slug} or f_{uuid}');
  });

  it('lets only people close or correct a fact', () => {
    const target = docFact('opt-out', deadline);
    expect(messages(docFact('y', deadline, { handles: { factId: target.id, occurrenceDate: '2026-11-05' } }))).toContain(
      'a document fact cannot handle a deadline',
    );
    expect(messages(docFact('y', deadline, { overrides: target.id }))).toContain('only a user fact can correct another fact');
    expect(messages({ ...handledFact(target, '2026-11-05'), overrides: target.id })).toContain(
      'only a user fact can correct another fact',
    );
    const { handles: _omit, ...noHandles } = handledFact(target, '2026-11-05');
    void _omit;
    expect(messages(noHandles)).toContain('an app fact must say what it handled');
  });

  it('refuses a rule code cannot compute', () => {
    expect(messages(docFact('a', { kind: 'deadline', due: { date: '2026-02-30' } }))).toContain(
      'must be a calendar date (YYYY-MM-DD)',
    );
    expect(messages(docFact('b', { kind: 'recurring', first: { date: '2026-01-01' }, every: {} }))).toContain(
      'recurring interval must be positive',
    );
    expect(messages(docFact('c', { kind: 'recurring', first: { date: '2026-01-01' }, every: { months: -1 } }))).toContain(
      'recurring interval must be positive',
    );
    expect(
      messages(docFact('d', { kind: 'window', opens: { date: '2026-12-01' }, closes: { date: '2026-11-01' } })),
    ).toContain('window closes before it opens');
    expect(messages(docFact('e', { kind: 'note' }, { leadDays: [7] }))).toContain('an undated note has no warnings');
  });

  it('rejects fields it does not know', () => {
    expect(messages({ ...docFact('a', deadline), dueDate: '2026-11-05' } as LedgerFact)).not.toEqual([]);
  });
});

describe('ledgerFileSchema', () => {
  it('rejects duplicate ids and links to facts that do not exist', () => {
    const a = docFact('a', deadline);
    expect(fileMessages([a, a])).toContain('duplicate id rivian-care:a');
    expect(fileMessages([handledFact(a, '2026-11-05')])).toContain('handles unknown fact rivian-care:a');
    expect(fileMessages([userFact(deadline, { overrides: a.id })])).toContain('overrides unknown fact rivian-care:a');
  });

  it('rejects an override cycle', () => {
    const x = userFact(deadline);
    const y = userFact(deadline, { overrides: x.id });
    const cycle = fileMessages([{ ...x, overrides: y.id }, y]);
    expect(cycle.some(m => m.startsWith('override cycle'))).toBe(true);
  });

  it('keys the three ledger files per family', () => {
    expect([ledgerKey('fam'), ledgerPrefsKey('fam'), ledgerSentKey('fam')]).toEqual([
      'ledger_fam',
      'ledger_prefs_fam',
      'ledger_sent_fam',
    ]);
  });
});

describe('verifyDocumentFact', () => {
  const doc: LibraryDocument = {
    formatVersion: LIBRARY_FORMAT_VERSION,
    docId: 'rivian-care',
    title: 'Rivian Care',
    domain: 'vehicle',
    kind: 'vehicle_service_contract',
    summary: 'Vehicle service contract covering repairs, cancellation and refund terms for the vehicle.',
    source: { kind: 'file', filename: 'care.pdf', sha256: 'a'.repeat(64) },
    pageCount: 2,
    ingestedAt: '2026-10-17T12:00:00Z',
    redactions: {},
    body:
      '<!-- page 1 -->\nContract Purchase Date: Oct 17, 2026\n' +
      '<!-- page 2 -->\nYou may cancel within 60 days of the\nContract Purchase Date for a full refund.\n',
  };
  const fact = (quotes: Array<{ page: number; text: string }>, anchor = '2026-10-17') =>
    docFact('refund', { kind: 'deadline', due: { anchor, offset: { days: 60 } } }, {
      source: { kind: 'document', docId: 'rivian-care', quotes },
    });

  it('verifies quotes across line wrapping and finds the anchor date in a supporting quote', () => {
    expect(
      verifyDocumentFact(
        fact([
          { page: 2, text: 'cancel within 60 days of the Contract Purchase Date for a full refund' },
          { page: 1, text: 'Contract Purchase Date: Oct 17, 2026' },
        ]),
        doc,
      ),
    ).toEqual([]);
  });

  it('reports a quote that is not on the cited page, or a page that does not exist', () => {
    const problems = verifyDocumentFact(
      fact([
        { page: 1, text: 'cancel within 60 days of the Contract Purchase Date' },
        { page: 9, text: 'Contract Purchase Date: Oct 17, 2026' },
      ]),
      doc,
    );
    expect(problems).toContain('quote 1: not found verbatim on page 1');
    expect(problems).toContain('quote 2: page 9 does not exist (document has 2)');
  });

  it('reports an anchor date the quotes do not print', () => {
    const problems = verifyDocumentFact(
      fact([{ page: 2, text: 'cancel within 60 days of the Contract Purchase Date for a full refund' }]),
      doc,
    );
    expect(problems).toEqual(['date 2026-10-17 is not printed in any quote — quote the line that states it']);
  });

  it('knows the usual printed forms of a date', () => {
    expect(printedForms('2026-10-06')).toEqual(
      expect.arrayContaining(['10/6/2026', '10/06/2026', 'Oct 06, 2026', 'October 6, 2026', '10/06/26']),
    );
  });
});
