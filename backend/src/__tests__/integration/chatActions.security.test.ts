/**
 * Chat Action Security Tests — Phase 10.1–10.5, 10.8–10.10
 *
 * Risk-based tests for the security invariants that would cause real harm
 * if broken:
 *
 * 10.1 — LLM cannot execute actions without user confirmation
 * 10.2 — Cross-user confirmation attack is blocked (404, not 403)
 * 10.3 — Confirmation replay is blocked (409)
 * 10.4 — Supersession invalidates prior nonce
 * 10.5 — Zod validation on confirm rejects tampered params
 * 10.6 — MIME spoofing rejected at the route level
 * 10.7 — Attachment content is not logged (only metadata)
 * 10.8 — Action handler cannot be called with spoofed userId
 * 10.9 — Prompt injection via attachment does not cause autonomous execution
 * 10.10 — Cost cap enforcement on attachment requests
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import Anthropic from '@anthropic-ai/sdk';
import app from '../../app';
import { dataService, authService, chatbotService } from '../../services';
import { registerUser } from '../helpers/apiHelper';
import {
  issueProposal,
  consumeProposal,
  getChatAction,
  listChatActionIds,
} from '../../services/chatActions';

// ============================================================================
// Helpers
// ============================================================================

async function createUser(prefix: string) {
  const rand = Math.random().toString(36).substring(2, 8);
  return registerUser(`${prefix}${rand}`, 'secure-test-passphrase-long-enough');
}

function makeValidTaskParams(): Record<string, unknown> {
  return { title: 'Pay PTA donation' };
}

// ============================================================================
// Test setup
// ============================================================================

beforeEach(() => {
  if ('clear' in dataService) {
    (dataService as unknown as { clear: () => void }).clear();
  }
  authService.resetRateLimiting();
});

// ============================================================================
// 10.1 — LLM cannot execute an action without user confirmation
// Tests the propose_action interception and registry enforcement
// ============================================================================

describe('10.1 — Action proposal intercepted, never executed by LLM', () => {
  it('registry is populated at startup with create_task', () => {
    const ids = listChatActionIds();
    expect(ids).toContain('create_task');
  });

  it('issueProposal returns a proposal with a nonce (not executed)', async () => {
    const user = await createUser('proposal');
    const convId = randomUUID();

    const proposal = issueProposal({
      userId: user.userId,
      familyId: user.familyId,
      conversationId: convId,
      proposalInput: {
        actionId: 'create_task',
        params: makeValidTaskParams(),
        displaySummary: 'Create task: PTA donation',
        displayFields: [],
        reasoning: 'Test',
      },
    });

    // Proposal issued successfully
    expect(proposal.proposalId).toBeTruthy();
    expect(proposal.actionId).toBe('create_task');
    expect(proposal.expiresAt).toBeTruthy();

    // No task created yet — only a nonce issued
    const tasks = await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(tasks.body).toHaveLength(0);
  });

  it('getChatAction returns null for unknown actionId (SEC-A003)', () => {
    expect(getChatAction('delete_account')).toBeNull();
    expect(getChatAction('disconnect_plaid')).toBeNull();
    expect(getChatAction('__proto__')).toBeNull();
    expect(getChatAction('')).toBeNull();
  });
});

// ============================================================================
// 10.2 — Cross-user confirmation attack returns 404 (no existence leak)
// ============================================================================

describe('10.2 — Cross-user nonce confirmation is blocked', () => {
  it('user B confirming user A nonce returns 404, not 403', async () => {
    const userA = await createUser('userA');
    const userB = await createUser('userB');
    const convId = randomUUID();

    const proposal = issueProposal({
      userId: userA.userId,
      familyId: userA.familyId,
      conversationId: convId,
      proposalInput: {
        actionId: 'create_task',
        params: makeValidTaskParams(),
        displaySummary: 'Create task: PTA donation',
        displayFields: [],
        reasoning: 'Test',
      },
    });

    // User B tries to confirm User A's nonce
    const res = await request(app)
      .post('/api/v1/chatbot/actions/confirm')
      .set('Authorization', `Bearer ${userB.token}`)
      .send({
        proposalId: proposal.proposalId,
        confirmedParams: makeValidTaskParams(),
      });

    // Must be 404 — NOT 403 — to avoid leaking nonce existence
    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('nonce_not_found');

    // No task created for either user
    const tasksA = await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', `Bearer ${userA.token}`)
      .expect(200);
    expect(tasksA.body).toHaveLength(0);
  });

  it('consumeProposal ownership check uses userId, not familyId', () => {
    const convId = randomUUID();

    const proposal = issueProposal({
      userId: 'user-a',
      familyId: 'shared-family',
      conversationId: convId,
      proposalInput: {
        actionId: 'create_task',
        params: makeValidTaskParams(),
        displaySummary: 'Test',
        displayFields: [],
        reasoning: 'Test',
      },
    });

    // Same family, different user — should fail
    const result = consumeProposal({
      nonce: proposal.proposalId,
      userId: 'user-b',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe('nonce_not_found');
    }
  });
});

// ============================================================================
// 10.3 — Confirmation replay is blocked (single-use nonce)
// ============================================================================

describe('10.3 — Replay attack on confirm endpoint is blocked', () => {
  it('second confirmation of same nonce returns 409', async () => {
    const user = await createUser('replay');
    const convId = randomUUID();

    const proposal = issueProposal({
      userId: user.userId,
      familyId: user.familyId,
      conversationId: convId,
      proposalInput: {
        actionId: 'create_task',
        params: makeValidTaskParams(),
        displaySummary: 'Create task: PTA donation',
        displayFields: [],
        reasoning: 'Test',
      },
    });

    // First confirmation — should succeed
    const first = await request(app)
      .post('/api/v1/chatbot/actions/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        proposalId: proposal.proposalId,
        confirmedParams: makeValidTaskParams(),
      });
    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);

    // Second confirmation — same nonce — should be rejected
    const second = await request(app)
      .post('/api/v1/chatbot/actions/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        proposalId: proposal.proposalId,
        confirmedParams: makeValidTaskParams(),
      });
    expect(second.status).toBe(409);
    expect(second.body.errorCode).toBe('nonce_already_used');

    // Exactly one task created, not two
    const tasks = await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(tasks.body).toHaveLength(1);
  });
});

// ============================================================================
// 10.4 — Supersession invalidates prior nonce
// ============================================================================

describe('10.4 — Supersession: new proposal invalidates prior nonce', () => {
  it('confirming superseded nonce returns 409; confirming new nonce succeeds', async () => {
    const user = await createUser('supersede');
    const convId = randomUUID();

    // Issue proposal A
    const proposalA = issueProposal({
      userId: user.userId,
      familyId: user.familyId,
      conversationId: convId,
      proposalInput: {
        actionId: 'create_task',
        params: { title: 'Task A' },
        displaySummary: 'Create task: Task A',
        displayFields: [],
        reasoning: 'Test',
      },
    });

    // Issue proposal B for the same conversation — supersedes A
    const proposalB = issueProposal({
      userId: user.userId,
      familyId: user.familyId,
      conversationId: convId,
      proposalInput: {
        actionId: 'create_task',
        params: { title: 'Task B (refined)' },
        displaySummary: 'Create task: Task B (refined)',
        displayFields: [],
        reasoning: 'User refined it',
      },
    });

    // Confirming A should fail — it was superseded
    const confirmA = await request(app)
      .post('/api/v1/chatbot/actions/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        proposalId: proposalA.proposalId,
        confirmedParams: { title: 'Task A' },
      });
    expect(confirmA.status).toBe(409);
    expect(confirmA.body.errorCode).toBe('nonce_already_used');

    // Confirming B should succeed
    const confirmB = await request(app)
      .post('/api/v1/chatbot/actions/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        proposalId: proposalB.proposalId,
        confirmedParams: { title: 'Task B (refined)' },
      });
    expect(confirmB.status).toBe(200);
    expect(confirmB.body.success).toBe(true);
    expect(confirmB.body.resource.label).toBe('Task B (refined)');

    // Only one task created — the refined one
    const tasks = await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(tasks.body).toHaveLength(1);
    expect(tasks.body[0].title).toBe('Task B (refined)');
  });

  it('supersession is atomic — prior nonce is invalidated in same issueProposal call', () => {
    const convId = randomUUID();

    const proposalA = issueProposal({
      userId: 'user-x',
      familyId: 'fam-x',
      conversationId: convId,
      proposalInput: {
        actionId: 'create_task',
        params: { title: 'Task A' },
        displaySummary: 'A',
        displayFields: [],
        reasoning: 'Test',
      },
    });

    // Immediately issue B
    issueProposal({
      userId: 'user-x',
      familyId: 'fam-x',
      conversationId: convId,
      proposalInput: {
        actionId: 'create_task',
        params: { title: 'Task B' },
        displaySummary: 'B',
        displayFields: [],
        reasoning: 'Test',
      },
    });

    // A is already marked used after B is issued
    const resultA = consumeProposal({ nonce: proposalA.proposalId, userId: 'user-x' });
    expect(resultA.ok).toBe(false);
    if (!resultA.ok) {
      expect(resultA.errorCode).toBe('nonce_already_used');
    }
  });
});

// ============================================================================
// 10.5 — Zod validation rejects tampered params on confirm
// ============================================================================

describe('10.5 — Zod re-validation on confirm rejects tampered params', () => {
  it('confirm with invalid params returns 400 validation_failed', async () => {
    const user = await createUser('tamper');
    const convId = randomUUID();

    const proposal = issueProposal({
      userId: user.userId,
      familyId: user.familyId,
      conversationId: convId,
      proposalInput: {
        actionId: 'create_task',
        params: makeValidTaskParams(),
        displaySummary: 'Create task: test',
        displayFields: [],
        reasoning: 'Test',
      },
    });

    // Tampered params: empty title, invalid dueDate, assigneeId as number
    const res = await request(app)
      .post('/api/v1/chatbot/actions/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        proposalId: proposal.proposalId,
        confirmedParams: {
          title: '',             // invalid: min 1
          dueDate: 'not-a-date', // invalid: must match YYYY-MM-DD
          assigneeId: 12345,     // invalid: must be string or null
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('validation_failed');

    // No task created
    const tasks = await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(tasks.body).toHaveLength(0);
  });

  it('confirm with missing required title returns 400', async () => {
    const user = await createUser('notitle');
    const convId = randomUUID();

    const proposal = issueProposal({
      userId: user.userId,
      familyId: user.familyId,
      conversationId: convId,
      proposalInput: {
        actionId: 'create_task',
        params: makeValidTaskParams(),
        displaySummary: 'Create task: test',
        displayFields: [],
        reasoning: 'Test',
      },
    });

    const res = await request(app)
      .post('/api/v1/chatbot/actions/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        proposalId: proposal.proposalId,
        confirmedParams: {
          // title is missing
          scope: 'family',
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('validation_failed');
  });
});

// ============================================================================
// 10.8 — Action handler uses context from JWT, not from params
// ============================================================================

describe('10.8 — Action handler cannot be called with spoofed userId', () => {
  it('execute() uses userId and familyId from context, not from params', async () => {
    const actionDef = getChatAction('create_task');
    expect(actionDef).not.toBeNull();

    if (!actionDef) return;

    const user = await createUser('handler');

    // Call execute directly with an explicit context — any spoofing would
    // have to come through ctx, which is populated exclusively from the JWT
    // in the route handler. This test verifies the handler honors ctx.
    const resource = await actionDef.execute(
      { title: 'Handler test task' },
      { userId: user.userId, familyId: user.familyId },
    );

    expect(resource.type).toBe('task');
    expect(resource.id).toBeTruthy();
    expect(resource.label).toBe('Handler test task');

    // Task was created for the correct user
    const tasks = await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(tasks.body).toHaveLength(1);
    expect(tasks.body[0].createdBy).toBe(user.userId);
  });

  it('confirm endpoint extracts userId from JWT, not request body', async () => {
    const user = await createUser('jwtctx');
    const convId = randomUUID();

    const proposal = issueProposal({
      userId: user.userId,
      familyId: user.familyId,
      conversationId: convId,
      proposalInput: {
        actionId: 'create_task',
        params: makeValidTaskParams(),
        displaySummary: 'Test',
        displayFields: [],
        reasoning: 'Test',
      },
    });

    // If the route ever accepted userId from the body, an attacker could supply
    // another userId here and hijack their resources. Verify the actual task
    // is created under the JWT user, not some spoofed value.
    const res = await request(app)
      .post('/api/v1/chatbot/actions/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        proposalId: proposal.proposalId,
        confirmedParams: {
          ...makeValidTaskParams(),
          userId: 'attacker-id',      // Should be silently ignored by schema
          familyId: 'attacker-family', // Same — extra fields stripped by Zod
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Task created under the legitimate user
    const tasks = await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(tasks.body).toHaveLength(1);
    expect(tasks.body[0].createdBy).toBe(user.userId);
  });

  it('unauthenticated confirm request is rejected', async () => {
    const fakeNonce = randomUUID();
    const res = await request(app)
      .post('/api/v1/chatbot/actions/confirm')
      .send({
        proposalId: fakeNonce,
        confirmedParams: makeValidTaskParams(),
      });
    expect(res.status).toBe(401);
  });

  it('confirm with invalid UUID proposalId returns 400 (schema guard)', async () => {
    const user = await createUser('baduuid');
    const res = await request(app)
      .post('/api/v1/chatbot/actions/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        proposalId: 'not-a-uuid',
        confirmedParams: makeValidTaskParams(),
      });
    expect(res.status).toBe(400);
  });
});

// ============================================================================
// Helpers for attachment-aware tests (10.6, 10.7, 10.9, 10.10)
// ============================================================================

/**
 * Build a minimal valid chat form-data body for multipart requests.
 * Does NOT include an attachment — callers attach via .attach().
 */
function chatFormFields(): Record<string, string> {
  return {
    message: 'What is this?',
    conversationId: randomUUID(),
    conversationHistory: JSON.stringify([]),
    pageContext: JSON.stringify({
      path: '/test',
      pageName: 'Test',
      params: {},
      description: 'Test page',
    }),
    model: 'haiku',
  };
}

/**
 * A 16-byte JPEG header (magic bytes 0xFF 0xD8 0xFF followed by padding).
 * Passes magic-byte validation for image/jpeg.
 */
function makeJpegBuffer(): Buffer {
  const buf = Buffer.alloc(16, 0x00);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  return buf;
}

/**
 * A minimal 1×1 JPEG image (valid enough for magic-byte validation).
 * Magic bytes match image/jpeg; content type can be spoofed against this.
 */
function makeTextBuffer(): Buffer {
  // Plain ASCII text — magic bytes are 0x54 0x68 0x69 ('Thi'), not JPEG magic
  return Buffer.from('This is plain text content, not a JPEG image.');
}

/** Current month key as used by ChatbotCostTracker. */
function currentMonthKey(): string {
  const now = new Date();
  return `chatbot_costs_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Seed the cost tracker's monthly data to put monthly spend at or above the cap.
 * The singleton's monthlyLimit is 20 (from config default in test env).
 */
async function seedCostCapReached(): Promise<void> {
  const key = currentMonthKey();
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  await dataService.saveData(key, {
    month,
    totalInputTokens: 10_000_000,
    totalOutputTokens: 1_000_000,
    totalEstimatedCost: 20.00, // at the cap
    requests: [],
  });
}

/**
 * Mock the Anthropic `messages.create` method on the chatbotService singleton.
 * Returns a jest.SpyInstance for teardown.
 *
 * D-IMPL-7: The chatbotService singleton is constructed before tests run, so we
 * cannot intercept at the module level. Instead we spy on the private `client`
 * field via a typed `unknown` cast — this is the only place in the test suite
 * that uses this pattern. The cast is contained here and does not propagate `any`
 * into calling code.
 */
function spyOnAnthropicMessages(
  response: Anthropic.Message,
): jest.SpyInstance {
  const client = (chatbotService as unknown as { client: Anthropic }).client;
  return jest.spyOn(client.messages, 'create').mockResolvedValue(response);
}

/**
 * Build a minimal Anthropic Message that represents a plain end_turn response
 * (no tool calls). Used to satisfy the toolLoop without calling the real API.
 *
 * Cast to unknown first then to Anthropic.Message because the SDK's type
 * definitions include required fields (citations, cache_creation_input_tokens,
 * etc.) that are not read by the chatbot service code under test. The cast
 * scopes the type relaxation to this one mock-construction site.
 */
function makeEndTurnMessage(text: string): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text, citations: null }],
    model: 'claude-haiku-4-5-20251001',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      cache_creation: null,
      inference_geo: null,
      server_tool_use: null,
      service_tier: null,
    },
  } as unknown as Anthropic.Message;
}

/**
 * Build an Anthropic Message that simulates Claude calling propose_action.
 * Used for 10.9 to verify the structural barrier holds even when Claude proposes.
 */
function makeProposeActionMessage(title: string): Anthropic.Message {
  const toolUseId = 'toolu_test_01';
  return {
    id: 'msg_test_propose',
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: 'I noticed this contains a task request.',
        citations: null,
      },
      {
        type: 'tool_use',
        id: toolUseId,
        name: 'propose_action',
        input: {
          actionId: 'create_task',
          params: { title },
          displaySummary: `Create task: ${title}`,
          displayFields: [
            { key: 'title', label: 'Title', value: title, editable: true, type: 'text' },
          ],
          reasoning: 'The attachment content suggested this task.',
        },
      },
    ],
    model: 'claude-haiku-4-5-20251001',
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: {
      input_tokens: 200,
      output_tokens: 80,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      cache_creation: null,
      inference_geo: null,
      server_tool_use: null,
      service_tier: null,
    },
  } as unknown as Anthropic.Message;
}

// ============================================================================
// 10.6 — MIME spoofing rejected at route level
// ============================================================================

describe('10.6 — MIME spoofing: file content does not match declared Content-Type', () => {
  it('plain text buffer with Content-Type image/jpeg is rejected with 400 before Claude is called', async () => {
    const user = await createUser('mime6');
    const fields = chatFormFields();

    const createSpy = spyOnAnthropicMessages(makeEndTurnMessage('Hello'));

    try {
      const res = await request(app)
        .post('/api/v1/chatbot/message')
        .set('Authorization', `Bearer ${user.token}`)
        .field('message', fields.message)
        .field('conversationId', fields.conversationId)
        .field('conversationHistory', fields.conversationHistory)
        .field('pageContext', fields.pageContext)
        .field('model', fields.model)
        // Attach a plain-text buffer with a .jpg extension and image/jpeg content-type
        .attach('attachment', makeTextBuffer(), {
          filename: 'spoofed.jpg',
          contentType: 'image/jpeg',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/does not match declared type/i);

      // Claude must NOT have been called — the route rejected before reaching the service
      expect(createSpy).not.toHaveBeenCalled();
    } finally {
      createSpy.mockRestore();
    }
  });

  it('valid JPEG magic bytes with Content-Type image/jpeg is accepted (baseline)', async () => {
    const user = await createUser('mime6b');
    const fields = chatFormFields();

    const createSpy = spyOnAnthropicMessages(makeEndTurnMessage('Looks like a JPEG'));

    try {
      const res = await request(app)
        .post('/api/v1/chatbot/message')
        .set('Authorization', `Bearer ${user.token}`)
        .field('message', fields.message)
        .field('conversationId', fields.conversationId)
        .field('conversationHistory', fields.conversationHistory)
        .field('pageContext', fields.pageContext)
        .field('model', fields.model)
        .attach('attachment', makeJpegBuffer(), {
          filename: 'real.jpg',
          contentType: 'image/jpeg',
        });

      // Should proceed to Claude (200 from the service)
      expect(res.status).toBe(200);
      expect(createSpy).toHaveBeenCalledTimes(1);
    } finally {
      createSpy.mockRestore();
    }
  });
});

// ============================================================================
// 10.7 — Attachment content is not logged
// ============================================================================

describe('10.7 — Attachment content is not logged (only metadata)', () => {
  it('console.log calls contain MIME metadata but not raw buffer or base64 content', async () => {
    const user = await createUser('log7');
    const fields = chatFormFields();
    const jpegBuffer = makeJpegBuffer();
    const base64Content = jpegBuffer.toString('base64');

    const createSpy = spyOnAnthropicMessages(makeEndTurnMessage('I see an image.'));

    // Capture the log calls that happen during this request.
    // setup.ts replaces console.* with jest.fn() globally — we collect
    // calls to all three channels to be exhaustive.
    const logMock = console.log as jest.Mock;
    const warnMock = console.warn as jest.Mock;
    const errorMock = console.error as jest.Mock;
    logMock.mockClear();
    warnMock.mockClear();
    errorMock.mockClear();

    try {
      const res = await request(app)
        .post('/api/v1/chatbot/message')
        .set('Authorization', `Bearer ${user.token}`)
        .field('message', fields.message)
        .field('conversationId', fields.conversationId)
        .field('conversationHistory', fields.conversationHistory)
        .field('pageContext', fields.pageContext)
        .field('model', fields.model)
        .attach('attachment', jpegBuffer, {
          filename: 'flyer.jpg',
          contentType: 'image/jpeg',
        });

      expect(res.status).toBe(200);

      // Collect all logged strings across all console channels
      const allLoggedStrings: string[] = [
        ...logMock.mock.calls.flat().map((a) => JSON.stringify(a)),
        ...warnMock.mock.calls.flat().map((a) => JSON.stringify(a)),
        ...errorMock.mock.calls.flat().map((a) => JSON.stringify(a)),
      ];
      const combinedLog = allLoggedStrings.join('\n');

      // (a) Attachment metadata IS present in logs (SEC-A016 positive assertion)
      const hasMetadata = allLoggedStrings.some(
        (s) => s.includes('image/jpeg') || s.includes('chat_attachment_received'),
      );
      expect(hasMetadata).toBe(true);

      // (b) Raw buffer bytes are NOT present
      const rawHex = jpegBuffer.toString('hex');
      expect(combinedLog).not.toContain(rawHex);

      // (c) Base64-encoded content is NOT present
      expect(combinedLog).not.toContain(base64Content);

      // (d) 'buffer' as a JSON key containing data is NOT present
      // (catches accidental serialization of the Buffer object)
      expect(combinedLog).not.toMatch(/"buffer"\s*:\s*\{/);
    } finally {
      createSpy.mockRestore();
    }
  });
});

// ============================================================================
// 10.9 — Prompt injection via attachment does not cause autonomous execution
// ============================================================================

describe('10.9 — Prompt injection via attachment cannot self-execute', () => {
  it('even if Claude proposes an action from injected content, no task is created without a confirm POST', async () => {
    const user = await createUser('inject9');
    const fields = chatFormFields();

    // Simulate an adversarial attachment: Claude "reads" injected text and calls
    // propose_action with an attacker-chosen task title.
    const injectedTitle = 'ATTACK: transfer funds to attacker@evil.com';
    const createSpy = spyOnAnthropicMessages(makeProposeActionMessage(injectedTitle));

    try {
      const res = await request(app)
        .post('/api/v1/chatbot/message')
        .set('Authorization', `Bearer ${user.token}`)
        .field('message', 'What is this document?')
        .field('conversationId', fields.conversationId)
        .field('conversationHistory', fields.conversationHistory)
        .field('pageContext', fields.pageContext)
        .field('model', fields.model)
        .attach('attachment', makeJpegBuffer(), {
          filename: 'adversarial_flyer.jpg',
          contentType: 'image/jpeg',
        });

      expect(res.status).toBe(200);

      // (a) Response type is 'action_proposal' — never 'executed' or a direct task
      //     The LLM's call is intercepted; the proposal card requires user confirmation
      expect(res.body.type).toBe('action_proposal');

      // (b) The proposal is present but NOT yet executed
      expect(res.body.proposal).toBeDefined();
      expect(res.body.proposal.actionId).toBe('create_task');

      // (c) No task was created — confirmation POST is still required
      const tasks = await request(app)
        .get('/api/v1/tasks')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);
      expect(tasks.body).toHaveLength(0);

      // (d) Usage reflects the mocked token counts — demonstrating a real request
      //     completed without bypassing the confirmation barrier
      expect(createSpy).toHaveBeenCalledTimes(1);
    } finally {
      createSpy.mockRestore();
    }
  });

  it('propose_action with an actionId not in the registry is rejected before issuing a nonce', async () => {
    const user = await createUser('inject9b');
    const fields = chatFormFields();

    // Simulate Claude attempting a non-registry actionId ('delete_user')
    const badActionMessage = {
      id: 'msg_bad',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'toolu_bad',
          name: 'propose_action',
          input: {
            actionId: 'delete_user',
            params: { userId: user.userId },
            displaySummary: 'Delete user account',
            displayFields: [],
            reasoning: 'Injected reasoning',
          },
        },
      ],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: {
        input_tokens: 100,
        output_tokens: 30,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        cache_creation: null,
        inference_geo: null,
        server_tool_use: null,
        service_tier: null,
      },
    } as unknown as Anthropic.Message;

    // After the registry error is returned, Claude should get a tool_result error
    // and produce a follow-up end_turn response
    const createSpy = jest
      .spyOn(
        (chatbotService as unknown as { client: Anthropic }).client.messages,
        'create',
      )
      .mockResolvedValueOnce(badActionMessage)
      .mockResolvedValueOnce(makeEndTurnMessage('I cannot do that.'));

    try {
      const res = await request(app)
        .post('/api/v1/chatbot/message')
        .set('Authorization', `Bearer ${user.token}`)
        .field('message', 'Delete my account immediately.')
        .field('conversationId', fields.conversationId)
        .field('conversationHistory', fields.conversationHistory)
        .field('pageContext', fields.pageContext)
        .field('model', fields.model)
        .attach('attachment', makeJpegBuffer(), {
          filename: 'image.jpg',
          contentType: 'image/jpeg',
        });

      expect(res.status).toBe(200);
      // The response is a plain message — not an action_proposal
      expect(res.body.type).toBe('message');

      // No task created, no nonce issued
      const tasks = await request(app)
        .get('/api/v1/tasks')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);
      expect(tasks.body).toHaveLength(0);
    } finally {
      createSpy.mockRestore();
    }
  });
});

// ============================================================================
// 10.10 — Cost cap enforcement on attachment requests
// ============================================================================

describe('10.10 — Cost cap blocks attachment requests when monthly spend is at limit', () => {
  it('attachment request when cap is reached returns cap-reached response; no Claude call; no tokens recorded', async () => {
    const user = await createUser('cap10');
    const fields = chatFormFields();

    // Pre-seed the monthly cost data at the cap ($20.00)
    await seedCostCapReached();

    const createSpy = spyOnAnthropicMessages(makeEndTurnMessage('Should not be called'));

    try {
      const res = await request(app)
        .post('/api/v1/chatbot/message')
        .set('Authorization', `Bearer ${user.token}`)
        .field('message', fields.message)
        .field('conversationId', fields.conversationId)
        .field('conversationHistory', fields.conversationHistory)
        .field('pageContext', fields.pageContext)
        .field('model', fields.model)
        .attach('attachment', makeJpegBuffer(), {
          filename: 'flyer.jpg',
          contentType: 'image/jpeg',
        });

      // Route should return 200 with a cap-reached message (not 429 — cap is a
      // soft budget, not a hard rate limit; chatbotService returns a graceful msg)
      expect(res.status).toBe(200);
      expect(res.body.type).toBe('message');
      expect(res.body.usage.capExceeded).toBe(true);
      // Content should reference the cap being hit
      expect(res.body.message.content).toMatch(/budget cap|monthly.*cap|cap/i);

      // Claude was NOT called — cap check happened before the API call
      expect(createSpy).not.toHaveBeenCalled();
    } finally {
      createSpy.mockRestore();
    }
  });

  it('text-only request (no attachment) when cap is reached is also blocked — verifying uniform enforcement', async () => {
    const user = await createUser('cap10b');
    await seedCostCapReached();

    const createSpy = spyOnAnthropicMessages(makeEndTurnMessage('Should not be called'));

    try {
      const res = await request(app)
        .post('/api/v1/chatbot/message')
        .set('Authorization', `Bearer ${user.token}`)
        .set('Content-Type', 'application/json')
        .send({
          message: 'How much did I spend this month?',
          conversationId: randomUUID(),
          conversationHistory: [],
          pageContext: { path: '/test', pageName: 'Test', params: {}, description: 'Test' },
          model: 'haiku',
        });

      expect(res.status).toBe(200);
      expect(res.body.usage.capExceeded).toBe(true);
      expect(createSpy).not.toHaveBeenCalled();
    } finally {
      createSpy.mockRestore();
    }
  });

  it('already-issued action card remains confirmable even when cap is reached (SEC-A020)', async () => {
    const user = await createUser('cap10c');
    const convId = randomUUID();

    // Issue a proposal BEFORE the cap is seeded
    const proposal = issueProposal({
      userId: user.userId,
      familyId: user.familyId,
      conversationId: convId,
      proposalInput: {
        actionId: 'create_task',
        params: makeValidTaskParams(),
        displaySummary: 'Create task: PTA donation',
        displayFields: [],
        reasoning: 'Test',
      },
    });

    // Now hit the cap
    await seedCostCapReached();

    // Confirmation does NOT call the LLM — should still work
    const res = await request(app)
      .post('/api/v1/chatbot/actions/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        proposalId: proposal.proposalId,
        confirmedParams: makeValidTaskParams(),
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
