/**
 * AgentLearningsStore unit tests
 *
 * AI-AGENT-LEARNINGS-BRD Phase 1. The properties that matter are the ones that
 * decide whether the collection stays readable and safe:
 *   - dedup, or it becomes forty copies of one complaint (REQ-L020–L024)
 *   - rejected gaps stay rejected; shipped gaps recurring are loud
 *   - rate caps bound agent-initiated writes (SEC-L005)
 *   - recording can never fail a user's turn (SEC-L008)
 */

import {
  AgentLearningsStore,
  fingerprintOf,
  isCapabilityKey,
  MAX_PER_CONVERSATION,
  type AgentLearning,
} from '../../services/agentLearningsStore';
import { InMemoryDataService } from '../../services/dataService';

const FAMILY_ID = 'fam-1';

describe('AgentLearningsStore', () => {
  let dataService: InMemoryDataService;
  let store: AgentLearningsStore;

  beforeEach(() => {
    dataService = new InMemoryDataService();
    store = new AgentLearningsStore(dataService);
  });

  function gap(overrides: Partial<Parameters<AgentLearningsStore['recordCapabilityGap']>[0]> = {}) {
    return store.recordCapabilityGap({
      familyId: FAMILY_ID,
      conversationId: 'conv-1',
      capabilityKey: 'tasks.read',
      title: 'Cannot read the family task list',
      detail: 'User asked what is due this weekend; no task tool exists.',
      traceId: 'trace_1',
      ...overrides,
    });
  }

  describe('recording', () => {
    it('records a gap as open, agent-sourced, with one occurrence', async () => {
      const outcome = await gap();

      expect(outcome).toMatchObject({ recorded: true, deduped: false });
      expect(outcome.recorded && outcome.learning).toMatchObject({
        kind: 'capability_gap',
        status: 'open',
        source: 'agent',
        capabilityKey: 'tasks.read',
        occurrenceCount: 1,
        traceIds: ['trace_1'],
      });
    });

    it('scopes by family', async () => {
      await gap();

      expect(await store.list('fam-2')).toHaveLength(0);
    });

    it('never throws when storage fails (SEC-L008)', async () => {
      jest.spyOn(dataService, 'saveData').mockRejectedValueOnce(new Error('disk full'));

      await expect(gap()).resolves.toEqual({ recorded: false, reason: 'error' });
    });
  });

  describe('deduplication (REQ-L020–L021)', () => {
    it('folds a repeat into the existing record instead of duplicating', async () => {
      await gap({ traceId: 'trace_1' });
      const second = await gap({ conversationId: 'conv-2', traceId: 'trace_2' });

      expect(second).toMatchObject({ recorded: true, deduped: true });
      const all = await store.list(FAMILY_ID);
      expect(all).toHaveLength(1);
      expect(all[0].occurrenceCount).toBe(2);
      expect(all[0].traceIds).toEqual(['trace_1', 'trace_2']);
    });

    it('treats differently-worded reports of the same gap as one', async () => {
      await gap({ title: 'Cannot read the family task list' });
      await gap({ conversationId: 'conv-2', title: 'cannot read the Family Task List!!' });

      expect(await store.list(FAMILY_ID)).toHaveLength(1);
    });

    it('keeps distinct capability areas separate even with the same title', async () => {
      await gap({ capabilityKey: 'tasks.read' });
      await gap({ conversationId: 'conv-2', capabilityKey: 'trips.read' });

      expect(await store.list(FAMILY_ID)).toHaveLength(2);
    });

    it('does not let a dedupe consume rate-limit quota', async () => {
      // Fill the conversation quota with distinct gaps, then repeat the first.
      await gap({ title: 'Cannot read tasks' });
      await gap({ title: 'Cannot read trips', capabilityKey: 'trips.read' });

      const repeat = await gap({ title: 'Cannot read tasks' });

      // A genuinely recurring gap must keep counting, or occurrenceCount stops
      // being a demand signal exactly when demand is highest.
      expect(repeat).toMatchObject({ recorded: true, deduped: true });
    });
  });

  describe('status-aware suppression (REQ-L022–L023)', () => {
    it('silently drops a gap whose fingerprint was rejected', async () => {
      const first = await gap();
      const id = first.recorded ? first.learning.id : '';
      await store.setStatus(FAMILY_ID, id, 'rejected', 'Not worth building.');

      const repeat = await gap({ conversationId: 'conv-2' });

      expect(repeat).toEqual({ recorded: false, reason: 'suppressed' });
      expect(await store.listOpen(FAMILY_ID)).toHaveLength(0);
    });

    it('creates a NEW record when a shipped gap recurs — that is a regression', async () => {
      const first = await gap();
      const id = first.recorded ? first.learning.id : '';
      await store.setStatus(FAMILY_ID, id, 'shipped', 'Task read tools landed.');

      const repeat = await gap({ conversationId: 'conv-2' });

      expect(repeat).toMatchObject({ recorded: true, deduped: false });
      expect(await store.listOpen(FAMILY_ID)).toHaveLength(1);
    });

    it('does not fold into an accepted record — it is already queued for work', async () => {
      const first = await gap();
      const id = first.recorded ? first.learning.id : '';
      await store.setStatus(FAMILY_ID, id, 'accepted', 'Scheduled for phase 2.');

      const repeat = await gap({ conversationId: 'conv-2' });

      expect(repeat).toMatchObject({ recorded: true, deduped: false });
    });
  });

  describe('rate limits (SEC-L005)', () => {
    it('caps new records per conversation', async () => {
      for (let i = 0; i < MAX_PER_CONVERSATION; i++) {
        await gap({ title: `Gap number ${String.fromCharCode(97 + i)}`, capabilityKey: 'other' });
      }

      const overflow = await gap({ title: 'One gap too many', capabilityKey: 'reports.read' });

      expect(overflow).toEqual({ recorded: false, reason: 'rate_limited' });
    });

    it('a new conversation gets its own allowance', async () => {
      for (let i = 0; i < MAX_PER_CONVERSATION; i++) {
        await gap({ title: `Gap number ${String.fromCharCode(97 + i)}`, capabilityKey: 'other' });
      }

      const fresh = await gap({ conversationId: 'conv-2', title: 'Different gap', capabilityKey: 'reports.read' });

      expect(fresh).toMatchObject({ recorded: true });
    });
  });

  describe('disposition (REQ-L040–L041)', () => {
    it('requires a resolution note', async () => {
      const first = await gap();
      const id = first.recorded ? first.learning.id : '';

      await expect(store.setStatus(FAMILY_ID, id, 'rejected', '   ')).rejects.toThrow(/resolution note/i);
    });

    it('returns null for an unknown id', async () => {
      expect(await store.setStatus(FAMILY_ID, 'nope', 'accepted', 'note')).toBeNull();
    });

    it('listOpen orders by occurrence count — the only demand signal available', async () => {
      await gap({ title: 'Rare gap', capabilityKey: 'reports.read' });
      await gap({ title: 'Common gap', capabilityKey: 'tasks.read' });
      await gap({ conversationId: 'c2', title: 'Common gap', capabilityKey: 'tasks.read' });
      await gap({ conversationId: 'c3', title: 'Common gap', capabilityKey: 'tasks.read' });

      const open = await store.listOpen(FAMILY_ID);
      expect(open[0]).toMatchObject({ title: 'Common gap', occurrenceCount: 3 });
    });
  });

  describe('retention (REQ-L032)', () => {
    it('keeps open and accepted items but ages out resolved ones', async () => {
      const old = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
      const seeded: AgentLearning[] = [
        {
          id: 'l-open', familyId: FAMILY_ID, kind: 'capability_gap', status: 'open', source: 'agent',
          capabilityKey: 'other', title: 'kept', detail: '', userNote: null,
          fingerprint: 'aaa', occurrenceCount: 1, firstSeenAt: old, lastSeenAt: old,
          conversationId: 'c', traceIds: [], evidenceBundleId: null, reportedByUserId: null,
          resolution: null, resolvedAt: null,
        },
        {
          id: 'l-shipped', familyId: FAMILY_ID, kind: 'capability_gap', status: 'shipped', source: 'agent',
          capabilityKey: 'other', title: 'aged out', detail: '', userNote: null,
          fingerprint: 'bbb', occurrenceCount: 1, firstSeenAt: old, lastSeenAt: old,
          conversationId: 'c', traceIds: [], evidenceBundleId: null, reportedByUserId: null,
          resolution: 'done', resolvedAt: old,
        },
      ];
      await dataService.saveData(`agent_learnings_${FAMILY_ID}`, seeded);

      await gap({ title: 'triggers a write', capabilityKey: 'trips.read' });

      const ids = (await store.list(FAMILY_ID)).map(l => l.id);
      expect(ids).toContain('l-open');
      expect(ids).not.toContain('l-shipped');
    });
  });

  describe('capability keys (REQ-L004)', () => {
    it('accepts enumerated keys and rejects anything else', () => {
      expect(isCapabilityKey('tasks.read')).toBe(true);
      expect(isCapabilityKey('tasks.explode')).toBe(false);
      expect(isCapabilityKey(42)).toBe(false);
    });

    it('fingerprints ignore casing, punctuation and digits', () => {
      expect(fingerprintOf('capability_gap', 'tasks.read', 'Cannot read 5 tasks!'))
        .toBe(fingerprintOf('capability_gap', 'tasks.read', 'cannot read tasks'));
    });
  });
});
