/**
 * Learning evidence outlives its learning — REQ-P063, REQ-L002
 *
 * A capability gap is only actionable if the trace behind it still exists when
 * the maintainer reads it. Learnings are kept indefinitely while open; traces
 * are pruned at 30 days. Without a pin, every learning older than a month
 * becomes an unfalsifiable claim with no evidence — which defeats the entire
 * point of recording it.
 *
 * `AgentTrace.pinned` and `AgentTraceStore.pin()` existed and were unit-tested,
 * but NOTHING IN PRODUCTION EVER SET THE FLAG. The store tests passed against a
 * feature no code path reached. These tests assert the flag from the outside,
 * through a real chat request, which is the only place the bug was visible.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import Anthropic from '@anthropic-ai/sdk';
import app from '../../app';
import { dataService, authService, chatbotService, agentTraceStore } from '../../services';
import { registerUser } from '../helpers/apiHelper';

async function createUser(prefix: string) {
  const rand = Math.random().toString(36).substring(2, 8);
  return registerUser(`${prefix}${rand}`, 'secure-test-passphrase-long-enough');
}

function usage() {
  return {
    input_tokens: 100,
    output_tokens: 50,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    cache_creation: null,
    inference_geo: null,
    server_tool_use: null,
    service_tier: null,
  };
}

/** First turn: the model calls record_learning. Second: it answers normally. */
function recordLearningThenAnswer(calls: number): Anthropic.Message[] {
  const toolUses = Array.from({ length: calls }, (_, i) => ({
    type: 'tool_use',
    id: `toolu_${i}`,
    name: 'record_learning',
    input: {
      capabilityKey: i === 0 ? 'tasks.read' : 'trips.read',
      title: i === 0 ? 'Cannot read tasks' : 'Cannot read trips',
      detail: 'No tool exists for this.',
    },
  }));

  return [
    {
      id: 'msg_1', type: 'message', role: 'assistant',
      content: toolUses,
      model: 'claude-haiku-4-5-20251001',
      stop_reason: 'tool_use', stop_sequence: null, usage: usage(),
    } as unknown as Anthropic.Message,
    {
      id: 'msg_2', type: 'message', role: 'assistant',
      content: [{ type: 'text', text: "I can't reach that yet.", citations: null }],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: 'end_turn', stop_sequence: null, usage: usage(),
    } as unknown as Anthropic.Message,
  ];
}

function mockSequence(messages: Anthropic.Message[]): jest.SpyInstance {
  const client = (chatbotService as unknown as { client: Anthropic }).client;
  const spy = jest.spyOn(client.messages, 'create');
  for (const m of messages) spy.mockResolvedValueOnce(m as never);
  return spy;
}

async function sendMessage(token: string) {
  return request(app)
    .post('/api/v1/chatbot/message')
    .set('Authorization', `Bearer ${token}`)
    .send({
      message: 'what is on our task list?',
      conversationId: randomUUID(),
      conversationHistory: [],
      pageContext: { path: '/', pageName: 'Dashboard', params: {}, description: 'Home' },
      model: 'haiku',
    });
}

beforeEach(() => {
  if ('clear' in dataService) {
    (dataService as unknown as { clear: () => void }).clear();
  }
  authService.resetRateLimiting();
  jest.restoreAllMocks();
});

describe('REQ-P063 — a trace behind a learning is pinned', () => {
  it('pins the trace when the agent records a capability gap', async () => {
    const user = await createUser('evidence');
    const spy = mockSequence(recordLearningThenAnswer(1));

    try {
      const res = await sendMessage(user.token);
      expect(res.status).toBe(200);

      const traces = await agentTraceStore.list(user.familyId);
      expect(traces).toHaveLength(1);
      // The assertion the dead flag was hiding.
      expect(traces[0].pinned).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it('leaves an ordinary trace unpinned, so pinning still means something', async () => {
    // The control. If every trace were pinned, retention would be defeated and
    // the assertion above would be worthless.
    const user = await createUser('evidence');
    const plain = {
      id: 'msg_x', type: 'message', role: 'assistant',
      content: [{ type: 'text', text: 'Your groceries budget is $600.', citations: null }],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: 'end_turn', stop_sequence: null, usage: usage(),
    } as unknown as Anthropic.Message;
    const spy = mockSequence([plain]);

    try {
      expect((await sendMessage(user.token)).status).toBe(200);

      const traces = await agentTraceStore.list(user.familyId);
      expect(traces).toHaveLength(1);
      expect(traces[0].pinned).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('links the learning to the trace id that was pinned', async () => {
    // Pinning the wrong trace would be as useless as not pinning at all.
    const user = await createUser('evidence');
    const spy = mockSequence(recordLearningThenAnswer(1));

    try {
      expect((await sendMessage(user.token)).status).toBe(200);

      const traces = await agentTraceStore.list(user.familyId);
      const learnings = await (
        await import('../../services')
      ).agentLearningsStore.listOpen(user.familyId);

      expect(learnings).toHaveLength(1);
      expect(learnings[0].traceIds).toContain(traces[0].traceId);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('REQ-L002 — every learning recorded in a turn is surfaced', () => {
  it('returns a notice per learning, not just the first', async () => {
    const user = await createUser('evidence');
    const spy = mockSequence(recordLearningThenAnswer(2));

    try {
      const res = await sendMessage(user.token);
      expect(res.status).toBe(200);

      // MAX_PER_CONVERSATION is 2, so both are recorded and both must show.
      expect(res.body.message.learningNotices).toHaveLength(2);
      expect(res.body.message.learningNotices.map((n: { title: string }) => n.title)).toEqual([
        'Cannot read tasks',
        'Cannot read trips',
      ]);
    } finally {
      spy.mockRestore();
    }
  });
});
