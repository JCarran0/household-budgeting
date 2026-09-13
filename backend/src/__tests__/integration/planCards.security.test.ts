/**
 * Plan Card Confirmation — REQ-P021–P024, SEC-P013
 *
 * A plan card trades per-action scrutiny for one click. These tests cover the
 * ways that trade can go wrong on the server: a click that executes more than
 * the user checked, a batch that half-applies because validation ran lazily,
 * and a row whose identity is taken from the request instead of the proposal.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import app from '../../app';
import { dataService, authService } from '../../services';
import { registerUser } from '../helpers/apiHelper';
import { issueProposal } from '../../services/chatActions';
import type { ProposalRow } from '../../shared/types';

async function createUser(prefix: string) {
  const rand = Math.random().toString(36).substring(2, 8);
  return registerUser(`${prefix}${rand}`, 'secure-test-passphrase-long-enough');
}

function taskRow(index: number, title: string): ProposalRow {
  return {
    rowId: `row-${index}`,
    actionId: 'create_task',
    label: 'Create a task',
    params: { title },
    displaySummary: `Create task: ${title}`,
    displayFields: [{ key: 'title', label: 'Title', value: title, editable: true, type: 'text' }],
  };
}

function issuePlan(user: { userId: string; familyId: string }, rows: ProposalRow[]) {
  return issueProposal({
    userId: user.userId,
    familyId: user.familyId,
    conversationId: randomUUID(),
    traceId: 'trace_plan_test',
    proposalInput: { rows, reasoning: 'Test plan' },
  });
}

async function listTaskTitles(token: string): Promise<string[]> {
  const res = await request(app)
    .get('/api/v1/tasks')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  return (res.body as Array<{ title: string }>).map(t => t.title).sort();
}

beforeEach(() => {
  if ('clear' in dataService) {
    (dataService as unknown as { clear: () => void }).clear();
  }
  authService.resetRateLimiting();
});

describe('P.1 — Confirm executes exactly the checked rows (REQ-P021)', () => {
  it('applies every row when all are checked', async () => {
    const user = await createUser('plan');
    const rows = [taskRow(0, 'Alpha'), taskRow(1, 'Beta'), taskRow(2, 'Gamma')];
    const proposal = issuePlan(user, rows);

    const res = await request(app)
      .post('/api/v1/chatbot/actions/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        proposalId: proposal.proposalId,
        rows: rows.map(r => ({ rowId: r.rowId, params: r.params })),
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.results).toHaveLength(3);
    expect(await listTaskTitles(user.token)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('does NOT apply a row the user unchecked', async () => {
    const user = await createUser('plan');
    const rows = [taskRow(0, 'Keep'), taskRow(1, 'Drop'), taskRow(2, 'Keep2')];
    const proposal = issuePlan(user, rows);

    await request(app)
      .post('/api/v1/chatbot/actions/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        proposalId: proposal.proposalId,
        rows: [
          { rowId: 'row-0', params: { title: 'Keep' } },
          { rowId: 'row-2', params: { title: 'Keep2' } },
        ],
      })
      .expect(200);

    const titles = await listTaskTitles(user.token);
    expect(titles).toEqual(['Keep', 'Keep2']);
    expect(titles).not.toContain('Drop');
  });

  it('rejects a rowId that is not in the proposal — the request cannot invent work', async () => {
    const user = await createUser('plan');
    const proposal = issuePlan(user, [taskRow(0, 'Alpha')]);

    const res = await request(app)
      .post('/api/v1/chatbot/actions/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        proposalId: proposal.proposalId,
        rows: [{ rowId: 'row-99', params: { title: 'Not on the card' } }],
      })
      .expect(400);

    expect(res.body.errorCode).toBe('validation_failed');
    expect(await listTaskTitles(user.token)).toEqual([]);
  });

  it('rejects a duplicated rowId — one reviewed row must not execute twice', async () => {
    const user = await createUser('plan');
    const proposal = issuePlan(user, [taskRow(0, 'Alpha')]);

    const res = await request(app)
      .post('/api/v1/chatbot/actions/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        proposalId: proposal.proposalId,
        rows: [
          { rowId: 'row-0', params: { title: 'Alpha' } },
          { rowId: 'row-0', params: { title: 'Alpha' } },
        ],
      })
      .expect(400);

    expect(res.body.errorCode).toBe('validation_failed');
    expect(res.body.failedRowId).toBe('row-0');
    expect(await listTaskTitles(user.token)).toEqual([]);
  });

  it('rejects an empty selection rather than treating it as "confirm everything"', async () => {
    const user = await createUser('plan');
    const proposal = issuePlan(user, [taskRow(0, 'Alpha'), taskRow(1, 'Beta')]);

    await request(app)
      .post('/api/v1/chatbot/actions/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ proposalId: proposal.proposalId, rows: [] })
      .expect(400);

    expect(await listTaskTitles(user.token)).toEqual([]);
  });
});

describe('P.2 — Every row re-validated before any row executes (REQ-P023, REQ-P024)', () => {
  it('an invalid LAST row prevents the valid FIRST row from being written', async () => {
    const user = await createUser('plan');
    const rows = [taskRow(0, 'Valid first'), taskRow(1, 'Valid second')];
    const proposal = issuePlan(user, rows);

    const res = await request(app)
      .post('/api/v1/chatbot/actions/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        proposalId: proposal.proposalId,
        rows: [
          { rowId: 'row-0', params: { title: 'Valid first' } },
          { rowId: 'row-1', params: { title: '' } }, // fails Zod
        ],
      })
      .expect(400);

    expect(res.body.errorCode).toBe('validation_failed');
    expect(res.body.failedRowId).toBe('row-1');

    // The load-bearing assertion: nothing was half-applied.
    expect(await listTaskTitles(user.token)).toEqual([]);
  });

  it('validates edited params as edited, not as proposed (SEC-A004)', async () => {
    const user = await createUser('plan');
    const proposal = issuePlan(user, [taskRow(0, 'As proposed')]);

    await request(app)
      .post('/api/v1/chatbot/actions/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        proposalId: proposal.proposalId,
        rows: [{ rowId: 'row-0', params: { title: 'As edited' } }],
      })
      .expect(200);

    expect(await listTaskTitles(user.token)).toEqual(['As edited']);
  });
});

describe('P.3 — The nonce still governs the whole batch (SEC-A005)', () => {
  it('a second confirm of the same plan is rejected as replay', async () => {
    const user = await createUser('plan');
    const rows = [taskRow(0, 'Alpha'), taskRow(1, 'Beta')];
    const proposal = issuePlan(user, rows);
    const body = {
      proposalId: proposal.proposalId,
      rows: rows.map(r => ({ rowId: r.rowId, params: r.params })),
    };

    await request(app)
      .post('/api/v1/chatbot/actions/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send(body)
      .expect(200);

    const replay = await request(app)
      .post('/api/v1/chatbot/actions/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send(body)
      .expect(409);

    expect(replay.body.errorCode).toBe('nonce_already_used');
    expect(await listTaskTitles(user.token)).toEqual(['Alpha', 'Beta']);
  });

  it('a rejected batch still burns the nonce — retry needs a fresh proposal', async () => {
    const user = await createUser('plan');
    const proposal = issuePlan(user, [taskRow(0, 'Alpha')]);

    await request(app)
      .post('/api/v1/chatbot/actions/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ proposalId: proposal.proposalId, rows: [{ rowId: 'row-0', params: { title: '' } }] })
      .expect(400);

    const retry = await request(app)
      .post('/api/v1/chatbot/actions/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ proposalId: proposal.proposalId, rows: [{ rowId: 'row-0', params: { title: 'Alpha' } }] })
      .expect(409);

    expect(retry.body.errorCode).toBe('nonce_already_used');
  });

  it('another user cannot confirm rows from this plan (404, no existence leak)', async () => {
    const owner = await createUser('planowner');
    const attacker = await createUser('planattacker');
    const proposal = issuePlan(owner, [taskRow(0, 'Alpha')]);

    const res = await request(app)
      .post('/api/v1/chatbot/actions/confirm')
      .set('Authorization', `Bearer ${attacker.token}`)
      .send({ proposalId: proposal.proposalId, rows: [{ rowId: 'row-0', params: { title: 'Alpha' } }] })
      .expect(404);

    expect(res.body.errorCode).toBe('nonce_not_found');
    expect(await listTaskTitles(owner.token)).toEqual([]);
    expect(await listTaskTitles(attacker.token)).toEqual([]);
  });
});

describe('P.4 — Single-row shorthand (migration compatibility)', () => {
  it('confirmedParams still works for a one-row proposal', async () => {
    const user = await createUser('plan');
    const proposal = issuePlan(user, [taskRow(0, 'Legacy shape')]);

    const res = await request(app)
      .post('/api/v1/chatbot/actions/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ proposalId: proposal.proposalId, confirmedParams: { title: 'Legacy shape' } })
      .expect(200);

    expect(res.body.resource).toBeDefined();
    expect(await listTaskTitles(user.token)).toEqual(['Legacy shape']);
  });

  it('confirmedParams is REFUSED on a multi-row plan — "which row?" has no safe default', async () => {
    const user = await createUser('plan');
    const proposal = issuePlan(user, [taskRow(0, 'Alpha'), taskRow(1, 'Beta')]);

    const res = await request(app)
      .post('/api/v1/chatbot/actions/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ proposalId: proposal.proposalId, confirmedParams: { title: 'Alpha' } })
      .expect(400);

    expect(res.body.errorCode).toBe('validation_failed');
    expect(await listTaskTitles(user.token)).toEqual([]);
  });

  it('a body with neither rows nor confirmedParams is rejected at the schema', async () => {
    const user = await createUser('plan');
    const proposal = issuePlan(user, [taskRow(0, 'Alpha')]);

    await request(app)
      .post('/api/v1/chatbot/actions/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ proposalId: proposal.proposalId })
      .expect(400);

    expect(await listTaskTitles(user.token)).toEqual([]);
  });
});
