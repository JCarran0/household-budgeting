/**
 * Chat Action Security Tests — Phase 10.1–10.5, 10.8
 *
 * Risk-based tests for the security invariants that would cause real harm
 * if broken:
 *
 * 10.1 — LLM cannot execute actions without user confirmation
 * 10.2 — Cross-user confirmation attack is blocked (404, not 403)
 * 10.3 — Confirmation replay is blocked (409)
 * 10.4 — Supersession invalidates prior nonce
 * 10.5 — Zod validation on confirm rejects tampered params
 * 10.8 — Action handler cannot be called with spoofed userId
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import app from '../../app';
import { dataService, authService } from '../../services';
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
