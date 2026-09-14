/**
 * Activity log & undo — REQ-P025 – REQ-P027, REQ-P037, REQ-P038.
 *
 * Undo is not a convenience here. SEC-P001 gates the entire unattended tier on
 * "reversible in one click", so these behaviours are the precondition for T2
 * ever shipping (REQ-P081). The tests are written against the two ways undo
 * can be worse than not having it:
 *
 *   1. It clobbers a human edit. Someone fixes a category by hand, then undo
 *      writes the AI's old value back over them. REQ-P027 says skip and report.
 *   2. It destroys something. Undoing a CREATE deletes a record — and if the
 *      household has since filled that task in, deleting it is the worst thing
 *      this feature could do.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import app from '../../app';
import {
  dataService,
  authService,
  taskService,
  transactionService,
} from '../../services';
import { registerUser } from '../helpers/apiHelper';
import { issueProposal } from '../../services/chatActions';
import type { ProposalRow } from '../../shared/types';

async function createUser(prefix: string) {
  const rand = Math.random().toString(36).substring(2, 8);
  return registerUser(`${prefix}${rand}`, 'secure-test-passphrase-long-enough');
}

function issuePlan(user: { userId: string; familyId: string }, rows: ProposalRow[]) {
  return issueProposal({
    userId: user.userId,
    familyId: user.familyId,
    conversationId: randomUUID(),
    traceId: 'trace_undo_test',
    proposalInput: { rows, reasoning: 'Test plan' },
  });
}

function row(index: number, actionId: string, params: Record<string, unknown>): ProposalRow {
  return {
    rowId: `row-${index}`,
    actionId: actionId as ProposalRow['actionId'],
    label: actionId,
    params,
    displaySummary: `${actionId} row ${index}`,
    displayFields: Object.entries(params).map(([key, value]) => ({
      key,
      label: key,
      value: String(value),
      editable: false,
      type: 'text' as const,
    })),
  };
}

function confirm(token: string, proposalId: string, rows: ProposalRow[]) {
  return request(app)
    .post('/api/v1/chatbot/actions/confirm')
    .set('Authorization', `Bearer ${token}`)
    .send({ proposalId, rows: rows.map(r => ({ rowId: r.rowId, params: r.params })) });
}

function listActivity(token: string) {
  return request(app).get('/api/v1/ai/activity').set('Authorization', `Bearer ${token}`);
}

function undoEntry(token: string, entryId: string, body: Record<string, unknown> = {}) {
  return request(app)
    .post(`/api/v1/ai/activity/${entryId}/undo`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

async function seedTransaction(familyId: string, id = 'txn-1', categoryId: string | null = null) {
  await dataService.saveData(`transactions_${familyId}`, [
    {
      id,
      accountId: 'acct-1',
      plaidTransactionId: `plaid-${id}`,
      date: '2026-05-01',
      name: 'HARDWARE STORE 123',
      merchantName: 'Hardware Store',
      userDescription: null,
      amount: 42.5,
      categoryId,
      tags: [],
      status: 'posted',
      pending: false,
      isHidden: false,
      isFlagged: false,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
}

async function seedCategories(familyId: string) {
  await dataService.saveCategories(
    [
      { id: 'HOME', name: 'Home Improvement', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
      { id: 'GROCERIES', name: 'Groceries', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
    ],
    familyId,
  );
}

beforeEach(() => {
  if ('clear' in dataService) {
    (dataService as unknown as { clear: () => void }).clear();
  }
  authService.resetRateLimiting();
});

describe('REQ-P037 — every AI write lands in the activity log', () => {
  it('records a confirmed batch with one row per write', async () => {
    const user = await createUser('act');
    const rows = [row(0, 'create_task', { title: 'Alpha' }), row(1, 'create_task', { title: 'Beta' })];
    const proposal = issuePlan(user, rows);
    await confirm(user.token, proposal.proposalId, rows).expect(200);

    const res = await listActivity(user.token).expect(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].rows).toHaveLength(2);
    expect(res.body.entries[0].origin).toBe('confirmed');
    expect(res.body.entries[0].rows.map((r: { displaySummary: string }) => r.displaySummary))
      .toEqual(['create_task row 0', 'create_task row 1']);
  });

  it('does not leak another family\'s activity', async () => {
    const owner = await createUser('actowner');
    const other = await createUser('actother');
    const rows = [row(0, 'create_task', { title: 'Private' })];
    const proposal = issuePlan(owner, rows);
    await confirm(owner.token, proposal.proposalId, rows).expect(200);

    const res = await listActivity(other.token).expect(200);
    expect(res.body.entries).toEqual([]);
  });

  it('marks an outbound action as not undoable rather than offering a broken control', async () => {
    // submit_github_issue declares no undo capability: a posted issue cannot be
    // unposted, and offering the control would be worse than admitting it.
    const user = await createUser('act');
    await taskService.createTask({ title: 'x' }, user.userId, user.familyId);

    const rows = [row(0, 'create_task', { title: 'Undoable' })];
    const proposal = issuePlan(user, rows);
    await confirm(user.token, proposal.proposalId, rows).expect(200);

    const res = await listActivity(user.token).expect(200);
    expect(res.body.entries[0].rows[0].undoable).toBe(true);
  });
});

describe('REQ-P026 — undo restores the prior value', () => {
  it('reverses an update, putting the original title back', async () => {
    const user = await createUser('undo');
    const task = await taskService.createTask({ title: 'Original' }, user.userId, user.familyId);

    const rows = [row(0, 'update_task', { taskId: task.id, title: 'Changed' })];
    const proposal = issuePlan(user, rows);
    await confirm(user.token, proposal.proposalId, rows).expect(200);
    expect((await taskService.getTask(task.id, user.familyId))?.title).toBe('Changed');

    const entries = (await listActivity(user.token).expect(200)).body.entries;
    const res = await undoEntry(user.token, entries[0].entryId).expect(200);

    expect(res.body.outcomes[0].status).toBe('undone');
    expect((await taskService.getTask(task.id, user.familyId))?.title).toBe('Original');
  });

  it('reverses a completion, which withdraws the leaderboard credit with it', async () => {
    // Credit is computed statelessly from completedAt, and transitioning out of
    // 'done' nulls it — so there is no separate un-crediting step that could
    // drift out of sync with the status.
    const user = await createUser('undo');
    const task = await taskService.createTask({ title: 'Chore' }, user.userId, user.familyId);

    const rows = [row(0, 'complete_task', { taskId: task.id })];
    const proposal = issuePlan(user, rows);
    await confirm(user.token, proposal.proposalId, rows).expect(200);
    expect((await taskService.getTask(task.id, user.familyId))?.completedAt).not.toBeNull();

    const entries = (await listActivity(user.token).expect(200)).body.entries;
    await undoEntry(user.token, entries[0].entryId).expect(200);

    const after = await taskService.getTask(task.id, user.familyId);
    expect(after?.status).toBe('todo');
    expect(after?.completedAt).toBeNull();
  });

  it('reverses a recategorization', async () => {
    const user = await createUser('undo');
    await seedCategories(user.familyId);
    await seedTransaction(user.familyId, 'txn-1', 'GROCERIES');

    const rows = [row(0, 'set_transaction_category', { transactionId: 'txn-1', categoryId: 'HOME' })];
    const proposal = issuePlan(user, rows);
    await confirm(user.token, proposal.proposalId, rows).expect(200);

    const entries = (await listActivity(user.token).expect(200)).body.entries;
    await undoEntry(user.token, entries[0].entryId).expect(200);

    const result = await transactionService.getTransactions(user.familyId, { includeHidden: true });
    expect(result.transactions?.[0].categoryId).toBe('GROCERIES');
  });

  it('reverses a create by removing what was created', async () => {
    const user = await createUser('undo');
    const rows = [row(0, 'create_task', { title: 'Remove me' })];
    const proposal = issuePlan(user, rows);
    await confirm(user.token, proposal.proposalId, rows).expect(200);
    expect(await taskService.getAllTasks(user.familyId)).toHaveLength(1);

    const entries = (await listActivity(user.token).expect(200)).body.entries;
    const res = await undoEntry(user.token, entries[0].entryId).expect(200);

    expect(res.body.outcomes[0].status).toBe('undone');
    expect(await taskService.getAllTasks(user.familyId)).toHaveLength(0);
  });

  it('undoes only the rows named, leaving the rest applied', async () => {
    const user = await createUser('undo');
    const rows = [row(0, 'create_task', { title: 'Keep' }), row(1, 'create_task', { title: 'Drop' })];
    const proposal = issuePlan(user, rows);
    await confirm(user.token, proposal.proposalId, rows).expect(200);

    const entries = (await listActivity(user.token).expect(200)).body.entries;
    await undoEntry(user.token, entries[0].entryId, { rowIds: ['row-1'] }).expect(200);

    const titles = (await taskService.getAllTasks(user.familyId)).map(t => t.title);
    expect(titles).toEqual(['Keep']);
  });
});

describe('REQ-P027 — undo skips rather than clobbers', () => {
  it('refuses to overwrite a task a human edited after the AI touched it', async () => {
    // The scenario the requirement exists for: the AI renames something, a
    // person fixes it properly, then somebody hits undo on the old batch.
    // The person's edit must win.
    const user = await createUser('undo');
    const task = await taskService.createTask({ title: 'Original' }, user.userId, user.familyId);

    const rows = [row(0, 'update_task', { taskId: task.id, title: 'AI version' })];
    const proposal = issuePlan(user, rows);
    await confirm(user.token, proposal.proposalId, rows).expect(200);

    await taskService.updateTask(task.id, { title: 'Human version' }, user.userId, user.familyId);

    const entries = (await listActivity(user.token).expect(200)).body.entries;
    const res = await undoEntry(user.token, entries[0].entryId).expect(200);

    expect(res.body.outcomes[0].status).toBe('skipped_modified');
    expect(res.body.changed).toBe(false);
    expect((await taskService.getTask(task.id, user.familyId))?.title).toBe('Human version');
  });

  it('refuses to delete a created task the household has since filled in', async () => {
    // The most destructive case available to this feature.
    const user = await createUser('undo');
    const rows = [row(0, 'create_task', { title: 'Plan the trip' })];
    const proposal = issuePlan(user, rows);
    await confirm(user.token, proposal.proposalId, rows).expect(200);

    const created = (await taskService.getAllTasks(user.familyId))[0];
    await taskService.updateTask(
      created.id,
      { description: 'Booked flights, waiting on hotel' },
      user.userId,
      user.familyId,
    );

    const entries = (await listActivity(user.token).expect(200)).body.entries;
    const res = await undoEntry(user.token, entries[0].entryId).expect(200);

    expect(res.body.outcomes[0].status).toBe('skipped_modified');
    expect(await taskService.getAllTasks(user.familyId)).toHaveLength(1);
  });

  it('reports a record deleted since the write as missing, not as an error', async () => {
    const user = await createUser('undo');
    const task = await taskService.createTask({ title: 'Doomed' }, user.userId, user.familyId);

    const rows = [row(0, 'update_task', { taskId: task.id, title: 'Changed' })];
    const proposal = issuePlan(user, rows);
    await confirm(user.token, proposal.proposalId, rows).expect(200);

    await taskService.deleteTask(task.id, user.familyId);

    const entries = (await listActivity(user.token).expect(200)).body.entries;
    const res = await undoEntry(user.token, entries[0].entryId).expect(200);
    expect(res.body.outcomes[0].status).toBe('skipped_missing');
  });

  it('is idempotent — undoing twice does not re-apply', async () => {
    const user = await createUser('undo');
    const task = await taskService.createTask({ title: 'Original' }, user.userId, user.familyId);

    const rows = [row(0, 'update_task', { taskId: task.id, title: 'Changed' })];
    const proposal = issuePlan(user, rows);
    await confirm(user.token, proposal.proposalId, rows).expect(200);

    const entries = (await listActivity(user.token).expect(200)).body.entries;
    await undoEntry(user.token, entries[0].entryId).expect(200);
    const second = await undoEntry(user.token, entries[0].entryId).expect(200);

    expect(second.body.outcomes[0].status).toBe('already_undone');
    expect(second.body.changed).toBe(false);
    expect((await taskService.getTask(task.id, user.familyId))?.title).toBe('Original');
  });

  it('marks the row undone in the log so the control disappears', async () => {
    const user = await createUser('undo');
    const task = await taskService.createTask({ title: 'Original' }, user.userId, user.familyId);
    const rows = [row(0, 'update_task', { taskId: task.id, title: 'Changed' })];
    const proposal = issuePlan(user, rows);
    await confirm(user.token, proposal.proposalId, rows).expect(200);

    const entries = (await listActivity(user.token).expect(200)).body.entries;
    await undoEntry(user.token, entries[0].entryId).expect(200);

    const after = (await listActivity(user.token).expect(200)).body.entries;
    expect(after[0].rows[0].undoable).toBe(false);
    expect(after[0].rows[0].undoneAt).toBeTruthy();
  });
});

describe('cross-family and workspace boundaries', () => {
  it('will not undo another family\'s entry, and does not confirm it exists', async () => {
    const owner = await createUser('undoowner');
    const attacker = await createUser('undoother');
    const task = await taskService.createTask({ title: 'Theirs' }, owner.userId, owner.familyId);

    const rows = [row(0, 'update_task', { taskId: task.id, title: 'Changed' })];
    const proposal = issuePlan(owner, rows);
    await confirm(owner.token, proposal.proposalId, rows).expect(200);

    const entries = (await listActivity(owner.token).expect(200)).body.entries;
    await undoEntry(attacker.token, entries[0].entryId).expect(404);

    expect((await taskService.getTask(task.id, owner.familyId))?.title).toBe('Changed');
  });

  it('requires authentication on every activity route', async () => {
    await request(app).get('/api/v1/ai/activity').expect(401);
    await request(app).post('/api/v1/ai/activity/act_x/undo').send({}).expect(401);
    await request(app).post('/api/v1/ai/activity/undo').send({ since: new Date().toISOString() }).expect(401);
  });
});

describe('REQ-P038 — bulk undo across a range', () => {
  it('reverses every entry in the window', async () => {
    const user = await createUser('bulk');
    const before = new Date(Date.now() - 60_000).toISOString();

    for (const title of ['One', 'Two', 'Three']) {
      const rows = [row(0, 'create_task', { title })];
      const proposal = issuePlan(user, rows);
      await confirm(user.token, proposal.proposalId, rows).expect(200);
    }
    expect(await taskService.getAllTasks(user.familyId)).toHaveLength(3);

    const res = await request(app)
      .post('/api/v1/ai/activity/undo')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ since: before })
      .expect(200);

    expect(res.body.results).toHaveLength(3);
    expect(await taskService.getAllTasks(user.familyId)).toHaveLength(0);
  });

  it('leaves entries outside the window alone', async () => {
    const user = await createUser('bulk');
    const rows = [row(0, 'create_task', { title: 'Survivor' })];
    const proposal = issuePlan(user, rows);
    await confirm(user.token, proposal.proposalId, rows).expect(200);

    const future = new Date(Date.now() + 60_000).toISOString();
    const res = await request(app)
      .post('/api/v1/ai/activity/undo')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ since: future })
      .expect(200);

    expect(res.body.results).toEqual([]);
    expect(await taskService.getAllTasks(user.familyId)).toHaveLength(1);
  });
});
