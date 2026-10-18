/**
 * LedgerStore — HOUSEHOLD-LEDGER-BRD §3, REQ-H015, REQ-H040
 *
 * A corrupt ledger must fail loudly (an empty one reads as "nothing is due"),
 * an invalid write must land nothing, free text is redacted before it is
 * stored, and one person's reminder preferences never touch the other's.
 */

import { InMemoryDataService } from '../../services/dataService';
import { LedgerCorruptError, LedgerStore } from '../../services/ledgerStore';
import { ledgerKey } from '../../validators/ledgerValidators';
import { docFact, handledFact, userFact } from '../helpers/ledgerFixtures';

const FAMILY = '64a86709-6660-4393-b86c-e77c32dcff63';
const OTHER = '11111111-2222-3333-4444-555555555555';
const deadline = { kind: 'deadline', due: { date: '2026-11-05' } } as const;

describe('LedgerStore', () => {
  let data: InMemoryDataService;
  let store: LedgerStore;

  beforeEach(() => {
    data = new InMemoryDataService();
    store = new LedgerStore(data);
  });

  it('reads an absent ledger as empty and scopes facts to their family', async () => {
    expect((await store.read(FAMILY)).facts).toEqual([]);
    await store.addFact(FAMILY, docFact('opt-out', deadline));
    expect((await store.read(FAMILY)).facts.map(f => f.id)).toEqual(['rivian-care:opt-out']);
    expect((await store.read(OTHER)).facts).toEqual([]);
  });

  it('refuses a malformed family id', async () => {
    await expect(store.read('../x')).rejects.toThrow('invalid familyId');
    await expect(store.read('')).rejects.toThrow('invalid familyId');
  });

  it('throws on a corrupt file rather than reading it as empty', async () => {
    await data.saveData(ledgerKey(FAMILY), { formatVersion: 1, facts: [{ id: 'nope' }] });
    await expect(store.read(FAMILY)).rejects.toBeInstanceOf(LedgerCorruptError);
  });

  it('writes nothing when the result would be invalid', async () => {
    await store.addFact(FAMILY, docFact('opt-out', deadline));
    const orphan = handledFact(docFact('missing', deadline), '2026-11-05');
    await expect(store.addFact(FAMILY, orphan)).rejects.toThrow(/handles unknown fact/);
    await expect(store.addFact(FAMILY, docFact('opt-out', deadline))).rejects.toThrow(/already exists/);
    expect((await store.read(FAMILY)).facts).toHaveLength(1);
  });

  it('redacts identifiers typed into free text', async () => {
    const saved = await store.addFact(
      FAMILY,
      userFact({ kind: 'note' }, { title: 'Autopay set up', detail: 'Paying from bank account #: 123456789012' }),
    );
    expect(saved.detail).not.toContain('123456789012');
    expect(saved.detail).toContain('[REDACTED:bank_account');
  });

  it('serializes concurrent writes so neither is lost', async () => {
    await Promise.all([
      store.addFact(FAMILY, docFact('a', deadline)),
      store.addFact(FAMILY, docFact('b', deadline)),
      store.addFact(FAMILY, docFact('c', deadline)),
    ]);
    expect((await store.read(FAMILY)).facts.map(f => f.id).sort()).toEqual([
      'rivian-care:a',
      'rivian-care:b',
      'rivian-care:c',
    ]);
  });

  it('keeps each person’s snoozes and mutes separate', async () => {
    await store.updateUserPrefs(FAMILY, 'u1', p => ({ ...p, mutedSubjects: ['2026 Rivian R2'] }));
    await store.updateUserPrefs(FAMILY, 'u2', p => ({
      ...p,
      snoozes: [{ occurrenceKey: 'rivian-care:opt-out@2026-11-05', until: '2026-10-20' }],
    }));
    expect(await store.userPrefs(FAMILY, 'u1')).toEqual({ snoozes: [], mutedSubjects: ['2026 Rivian R2'] });
    expect((await store.userPrefs(FAMILY, 'u2')).mutedSubjects).toEqual([]);
    expect(await store.userPrefs(OTHER, 'u1')).toEqual({ snoozes: [], mutedSubjects: [] });
  });
});
