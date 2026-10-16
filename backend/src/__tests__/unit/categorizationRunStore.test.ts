import { CategorizationRunStore, sanitizeNote, MAX_NOTE_LENGTH } from '../../services/categorizationRunStore';
import type { DataService } from '../../services/dataService';
import type { ClassificationRun } from '../../shared/types';

function memoryDataService(): DataService {
  const data = new Map<string, unknown>();
  return {
    getData: async (key: string) => (data.has(key) ? structuredClone(data.get(key)) : null),
    saveData: async (key: string, value: unknown) => { data.set(key, structuredClone(value)); },
  } as unknown as DataService;
}

function run(id: string, createdAt: string): ClassificationRun {
  return {
    id, familyId: 'fam', createdAt, model: 'm', effort: 'medium', costUsd: 0, durationMs: 0,
    rows: [{
      transactionId: 't1', name: 'X', merchantName: null, amount: 1, date: '2026-10-01',
      plaidCategory: null, suggestedCategoryId: 'cat-a', confidence: 'high', reasoning: 'r',
      failureReason: null, outcome: null,
    }],
  };
}

describe('CategorizationRunStore', () => {
  it('prunes runs older than 12 months when a new run is written', async () => {
    const store = new CategorizationRunStore(memoryDataService());
    const old = new Date(Date.now() - 400 * 86_400_000).toISOString();
    await store.createRun(run('old', old));
    await store.createRun(run('new', new Date().toISOString()));

    expect((await store.listRuns('fam')).map(r => r.id)).toEqual(['new']);
  });

  it('keeps runs separate per family', async () => {
    const store = new CategorizationRunStore(memoryDataService());
    await store.createRun(run('r1', new Date().toISOString()));

    expect(await store.listRuns('other-family')).toEqual([]);
    const res = await store.recordOutcomes('other-family', 'r1', [{ transactionId: 't1', categoryId: null }]);
    expect(res).toEqual({ ok: false, reason: 'run_not_found' });
  });

  it('replaces an earlier outcome for the same row', async () => {
    const store = new CategorizationRunStore(memoryDataService());
    await store.createRun(run('r1', new Date().toISOString()));
    await store.recordOutcomes('fam', 'r1', [{ transactionId: 't1', categoryId: null }]);
    await store.recordOutcomes('fam', 'r1', [{ transactionId: 't1', categoryId: 'cat-a' }]);

    expect((await store.getRun('fam', 'r1'))?.rows[0].outcome?.kind).toBe('accepted');
  });
});

describe('sanitizeNote', () => {
  it('redacts credentials before truncating, so a cut token cannot survive', () => {
    const note = `${'x'.repeat(MAX_NOTE_LENGTH - 15)} password: hunter2hunter2`;
    const out = sanitizeNote(note)!;
    expect(out).not.toContain('hunter2');
    expect(out.length).toBeLessThanOrEqual(MAX_NOTE_LENGTH);
  });

  it('treats blank notes as no note', () => {
    expect(sanitizeNote('   ')).toBeNull();
    expect(sanitizeNote(undefined)).toBeNull();
  });
});
