/**
 * AgentTraceStore unit tests
 *
 * Covers AI-CAPABILITY-PLATFORM-BRD §10.1: the trace is the evidence that makes
 * a wrong answer diagnosable after the fact, so the properties worth testing are
 * (a) it captures what the model actually saw, (b) it never captures a secret,
 * and (c) it cannot grow without bound or fail the request that produced it.
 */

import {
  AgentTraceStore,
  buildToolCallEntry,
  redactSensitive,
  newTraceId,
  type AgentTrace,
} from '../../services/agentTraceStore';
import { InMemoryDataService } from '../../services/dataService';

const FAMILY_ID = 'fam-1';

function trace(overrides: Partial<AgentTrace> = {}): AgentTrace {
  return {
    traceId: newTraceId(),
    familyId: FAMILY_ID,
    userId: 'user-1',
    conversationId: 'conv-1',
    workloadClass: 'interactive',
    model: 'claude-sonnet-4-6',
    createdAt: new Date().toISOString(),
    latencyMs: 120,
    iterationCount: 1,
    finalStopReason: 'end_turn',
    iterations: [],
    toolCalls: [],
    totalInputTokens: 10,
    totalOutputTokens: 5,
    outcome: 'message',
    proposalIssued: false,
    proposalActionId: null,
    attachment: null,
    errorMessage: null,
    pinned: false,
    ...overrides,
  };
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

describe('AgentTraceStore', () => {
  let dataService: InMemoryDataService;
  let store: AgentTraceStore;

  beforeEach(() => {
    dataService = new InMemoryDataService();
    store = new AgentTraceStore(dataService);
  });

  describe('capture and retrieval', () => {
    it('records a trace and reads it back by id', async () => {
      const t = trace();
      await store.record(t);

      expect(await store.get(FAMILY_ID, t.traceId)).toMatchObject({ traceId: t.traceId });
    });

    it('scopes traces by family — one family cannot read another (SEC-P042)', async () => {
      const t = trace();
      await store.record(t);

      expect(await store.get('fam-2', t.traceId)).toBeNull();
      expect(await store.list('fam-2')).toHaveLength(0);
    });

    it('lists most recent first', async () => {
      await store.record(trace({ traceId: 'old', createdAt: daysAgo(3) }));
      await store.record(trace({ traceId: 'new', createdAt: daysAgo(1) }));

      expect((await store.list(FAMILY_ID)).map(t => t.traceId)).toEqual(['new', 'old']);
    });
  });

  describe('never fails the request that produced it', () => {
    it('swallows a storage failure instead of throwing', async () => {
      jest.spyOn(dataService, 'saveData').mockRejectedValueOnce(new Error('disk full'));

      await expect(store.record(trace())).resolves.toBeUndefined();
    });
  });

  describe('retention (REQ-P063)', () => {
    it('drops traces older than the 30-day window', async () => {
      await store.record(trace({ traceId: 'stale', createdAt: daysAgo(31) }));
      await store.record(trace({ traceId: 'fresh', createdAt: daysAgo(2) }));

      expect((await store.list(FAMILY_ID)).map(t => t.traceId)).toEqual(['fresh']);
    });

    it('keeps a pinned trace past the window, so evidence outlives an open learning', async () => {
      await store.record(trace({ traceId: 'pinned-old', createdAt: daysAgo(90), pinned: true }));
      await store.record(trace({ traceId: 'fresh', createdAt: daysAgo(1) }));

      expect((await store.list(FAMILY_ID)).map(t => t.traceId).sort()).toEqual(['fresh', 'pinned-old']);
    });

    it('pin() marks an existing trace and reports whether it was found', async () => {
      const t = trace({ createdAt: daysAgo(1) });
      await store.record(t);

      expect(await store.pin(FAMILY_ID, t.traceId)).toBe(true);
      expect(await store.pin(FAMILY_ID, 'nope')).toBe(false);
      expect((await store.get(FAMILY_ID, t.traceId))?.pinned).toBe(true);
    });

    it('caps total traces per family, evicting oldest unpinned first', async () => {
      // Seed just over the cap directly so the test does not do 1001 awaited writes.
      const seeded: AgentTrace[] = [
        trace({ traceId: 'pinned-oldest', createdAt: daysAgo(29), pinned: true }),
        ...Array.from({ length: 1000 }, (_, i) =>
          trace({ traceId: `t${i}`, createdAt: new Date(Date.now() - (1000 - i) * 1000).toISOString() }),
        ),
      ];
      await dataService.saveData(`ai_traces_${FAMILY_ID}`, seeded);

      await store.record(trace({ traceId: 'newest' }));
      const all = await store.list(FAMILY_ID, 2000);

      expect(all).toHaveLength(1000);
      // The pin survives; the oldest ordinary trace is what gets evicted.
      expect(all.map(t => t.traceId)).toContain('pinned-oldest');
      expect(all.map(t => t.traceId)).toContain('newest');
      expect(all.map(t => t.traceId)).not.toContain('t0');
    });
  });

  describe('redaction (SEC-P041)', () => {
    it('redacts credential-shaped keys at any depth', () => {
      const result = redactSensitive({
        safe: 'keep me',
        accessToken: 'plaid-secret',
        nested: { api_key: 'k', deeper: { Authorization: 'Bearer x', amount: 42 } },
      }) as Record<string, never>;

      expect(result).toEqual({
        safe: 'keep me',
        accessToken: '[redacted]',
        nested: { api_key: '[redacted]', deeper: { Authorization: '[redacted]', amount: 42 } },
      });
    });

    it('redacts inside arrays', () => {
      const result = redactSensitive([{ secret: 'x' }, { name: 'ok' }]);

      expect(result).toEqual([{ secret: '[redacted]' }, { name: 'ok' }]);
    });

    it('survives circular references without hanging', () => {
      const cyclic: Record<string, unknown> = { name: 'root' };
      cyclic.self = cyclic;

      expect(redactSensitive(cyclic)).toEqual({ name: 'root', self: '[circular]' });
    });

    it('leaves ordinary financial data intact — redaction must not eat the evidence', () => {
      const result = redactSensitive({ categoryId: 'AUTO_MAINTENANCE', budgetedAmount: 0, hasBudget: false });

      expect(result).toEqual({ categoryId: 'AUTO_MAINTENANCE', budgetedAmount: 0, hasBudget: false });
    });
  });

  describe('tool call entries (REQ-P061)', () => {
    it('stores the result verbatim, which is the whole point of the ledger', () => {
      const result = { lines: [{ categoryId: 'AUTO_MAINTENANCE', hasBudget: false, budgetedAmount: 0 }] };

      const entry = buildToolCallEntry({ sequence: 0, toolName: 'get_budgets', input: { month: '2026-09' }, result, latencyMs: 12 });

      expect(entry.result).toEqual(result);
      expect(entry.resultTruncated).toBe(false);
      expect(entry.input).toEqual({ month: '2026-09' });
    });

    it('marks an oversized result as truncated rather than silently shortening it', () => {
      const huge = { rows: Array.from({ length: 5000 }, (_, i) => ({ i, name: 'x'.repeat(40) })) };

      const entry = buildToolCallEntry({ sequence: 0, toolName: 'query_transactions', input: {}, result: huge, latencyMs: 5 });

      // A reader must be able to tell "this is what the model saw" from
      // "this is a fragment of it" — hence null plus an explicit flag.
      expect(entry.resultTruncated).toBe(true);
      expect(entry.result).toBeNull();
      expect(entry.resultBytes).toBeGreaterThan(64_000);
    });

    it('redacts the result before storing it', () => {
      const entry = buildToolCallEntry({
        sequence: 0,
        toolName: 'get_accounts',
        input: {},
        result: { accounts: [{ name: 'Checking', accessToken: 'should-never-persist' }] },
        latencyMs: 1,
      });

      expect(JSON.stringify(entry)).not.toContain('should-never-persist');
    });
  });
});
