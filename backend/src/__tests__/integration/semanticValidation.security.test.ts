/**
 * SEC-P030 — model-supplied identifiers are resolved against live data.
 *
 * Zod proves a value is well-formed. It does not prove the record exists, that
 * it belongs to this family, or that the person named is still a member. This
 * codebase already demonstrates the failure mode with categories: stored
 * categoryIds go orphaned and produce cell-vs-modal mismatches, which is the
 * same shape of bug one layer down.
 *
 * The other half of what these tests cover is WHERE validation runs. REQ-P023
 * requires all-or-nothing validation across a batch: if row 3 names a task that
 * does not exist, rows 1 and 2 must not have written. That holds only because
 * the confirm route resolves every row in its own pass, after parsing and
 * before executing. A check inside `execute` would pass the unit test for the
 * check and still leave the batch half-applied — so the batch-level assertions
 * below are the ones that actually protect the invariant.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import app from '../../app';
import { dataService, authService, taskService, transactionService, categoryService } from '../../services';
import { registerUser } from '../helpers/apiHelper';
import { issueProposal, buildProposalRows } from '../../services/chatActions';
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
    traceId: 'trace_semantic_test',
    proposalInput: { rows, reasoning: 'Test plan' },
  });
}

function createRow(index: number, title: string): ProposalRow {
  return {
    rowId: `row-${index}`,
    actionId: 'create_task',
    label: 'Create a task',
    params: { title },
    displaySummary: `Create task: ${title}`,
    displayFields: [{ key: 'title', label: 'Title', value: title, editable: true, type: 'text' }],
  };
}

function updateRow(index: number, params: Record<string, unknown>): ProposalRow {
  return {
    rowId: `row-${index}`,
    actionId: 'update_task',
    label: 'Update a task',
    params,
    displaySummary: 'Update task',
    displayFields: Object.entries(params).map(([key, value]) => ({
      key,
      label: key,
      value: String(value),
      editable: false,
      type: 'text' as const,
    })),
  };
}

function completeRow(index: number, taskId: string): ProposalRow {
  return {
    rowId: `row-${index}`,
    actionId: 'complete_task',
    label: 'Mark a task complete',
    params: { taskId },
    displaySummary: 'Complete task',
    displayFields: [{ key: 'taskId', label: 'Task', value: taskId, editable: false, type: 'text' }],
  };
}

function confirm(token: string, proposalId: string, rows: ProposalRow[]) {
  return request(app)
    .post('/api/v1/chatbot/actions/confirm')
    .set('Authorization', `Bearer ${token}`)
    .send({ proposalId, rows: rows.map(r => ({ rowId: r.rowId, params: r.params })) });
}

beforeEach(() => {
  if ('clear' in dataService) {
    (dataService as unknown as { clear: () => void }).clear();
  }
  authService.resetRateLimiting();
});

describe('SEC-P030 — identifiers must resolve', () => {
  it('rejects a well-formed taskId that names no task', async () => {
    const user = await createUser('sem');
    const rows = [updateRow(0, { taskId: randomUUID(), title: 'Renamed' })];
    const proposal = issuePlan(user, rows);

    const res = await confirm(user.token, proposal.proposalId, rows).expect(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errorCode).toBe('validation_failed');
    expect(res.body.error).toMatch(/no longer exists/i);
  });

  it('rejects an assignee who is not a member of the household', async () => {
    const user = await createUser('sem');
    const task = await taskService.createTask({ title: 'Real task' }, user.userId, user.familyId);

    const rows = [updateRow(0, { taskId: task.id, assigneeId: 'not-a-member' })];
    const proposal = issuePlan(user, rows);

    const res = await confirm(user.token, proposal.proposalId, rows).expect(400);
    expect(res.body.error).toMatch(/not a member/i);

    const after = await taskService.getTask(task.id, user.familyId);
    expect(after?.assigneeId).toBeNull();
  });

  it('accepts an assignee who IS a member — the guard is not blanket-deny', async () => {
    // Without this, the test above would pass against a validateSemantics that
    // rejects every assignee, which proves nothing about resolution.
    const user = await createUser('sem');
    const task = await taskService.createTask({ title: 'Real task' }, user.userId, user.familyId);

    const rows = [updateRow(0, { taskId: task.id, assigneeId: user.userId })];
    const proposal = issuePlan(user, rows);

    await confirm(user.token, proposal.proposalId, rows).expect(200);
    const after = await taskService.getTask(task.id, user.familyId);
    expect(after?.assigneeId).toBe(user.userId);
  });

  it('refuses a task belonging to a different family, and says no more than that', async () => {
    const owner = await createUser('semowner');
    const attacker = await createUser('semother');
    const secret = await taskService.createTask(
      { title: 'Confidential household matter' },
      owner.userId,
      owner.familyId,
    );

    const rows = [updateRow(0, { taskId: secret.id, title: 'Hijacked' })];
    const proposal = issuePlan(attacker, rows);

    const res = await confirm(attacker.token, proposal.proposalId, rows).expect(400);

    // Cross-family ids must be indistinguishable from missing ones. Echoing the
    // real title back would confirm the record exists and leak its contents in
    // the error message.
    expect(res.body.error).not.toMatch(/Confidential/i);
    expect(res.body.error).toMatch(/no longer exists/i);

    const untouched = await taskService.getTask(secret.id, owner.familyId);
    expect(untouched?.title).toBe('Confidential household matter');
  });

  it('refuses to complete an already-complete task', async () => {
    const user = await createUser('sem');
    const task = await taskService.createTask({ title: 'Done already' }, user.userId, user.familyId);
    await taskService.updateTaskStatus(task.id, 'done', user.userId, user.familyId);
    const before = await taskService.getTask(task.id, user.familyId);

    const rows = [completeRow(0, task.id)];
    const proposal = issuePlan(user, rows);
    const res = await confirm(user.token, proposal.proposalId, rows).expect(400);
    expect(res.body.error).toMatch(/already complete/i);

    // Re-completing would append a transition and re-stamp completedAt, moving
    // the task in the leaderboard's eyes for something that already happened.
    const after = await taskService.getTask(task.id, user.familyId);
    expect(after?.transitions.length).toBe(before?.transitions.length);
    expect(after?.completedAt).toBe(before?.completedAt);
  });
});

describe('REQ-P023 — a semantically invalid row writes nothing, not "nothing after it"', () => {
  it('applies no row when a LATER row fails to resolve', async () => {
    // The ordering that matters. Row 0 is valid and comes first; if validation
    // ran inside execute, it would already have written by the time row 1 was
    // found to be bogus.
    const user = await createUser('sem');
    const rows = [createRow(0, 'Should not exist'), updateRow(1, { taskId: randomUUID(), title: 'Bogus' })];
    const proposal = issuePlan(user, rows);

    const res = await confirm(user.token, proposal.proposalId, rows).expect(400);
    expect(res.body.failedRowId).toBe('row-1');

    const tasks = await taskService.getAllTasks(user.familyId);
    expect(tasks.map(t => t.title)).not.toContain('Should not exist');
    expect(tasks).toHaveLength(0);
  });

  it('applies every row when all of them resolve', async () => {
    // The positive control for the test above: same shape, all valid, all applied.
    const user = await createUser('sem');
    const existing = await taskService.createTask({ title: 'Existing' }, user.userId, user.familyId);

    const rows = [createRow(0, 'Fresh'), updateRow(1, { taskId: existing.id, title: 'Renamed' })];
    const proposal = issuePlan(user, rows);

    const res = await confirm(user.token, proposal.proposalId, rows).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.results).toHaveLength(2);

    const titles = (await taskService.getAllTasks(user.familyId)).map(t => t.title).sort();
    expect(titles).toEqual(['Fresh', 'Renamed']);
  });

  it('names the failing row so the card can point at it', async () => {
    const user = await createUser('sem');
    const good = await taskService.createTask({ title: 'Good' }, user.userId, user.familyId);
    const rows = [
      updateRow(0, { taskId: good.id, title: 'A' }),
      completeRow(1, randomUUID()),
    ];
    const proposal = issuePlan(user, rows);

    const res = await confirm(user.token, proposal.proposalId, rows).expect(400);
    expect(res.body.failedRowId).toBe('row-1');
    // And row 0 did not write, despite being valid and first.
    expect((await taskService.getTask(good.id, user.familyId))?.title).toBe('Good');
  });
});

describe('SEC-P011 — an update shows what it replaces', () => {
  // Goes through buildProposalRows deliberately: that is the function the chat
  // loop calls on model output, and the only place describeCurrent runs.
  // Constructing ProposalRows directly would test the fixture, not the feature.
  it('populates currentValues for a real update', async () => {
    const user = await createUser('sem');
    const task = await taskService.createTask(
      { title: 'Original title', dueDate: '2026-01-01' },
      user.userId,
      user.familyId,
    );

    const built = await buildProposalRows(
      {
        actionId: 'update_task',
        params: { taskId: task.id, title: 'New title', dueDate: '2026-02-02' },
        displaySummary: 'Update task',
        displayFields: [
          { key: 'taskId', label: 'Task', value: task.id, editable: false, type: 'text' },
          { key: 'title', label: 'Title', value: 'New title', editable: true, type: 'text' },
          { key: 'dueDate', label: 'Due date', value: '2026-02-02', editable: true, type: 'date' },
        ],
        reasoning: 'Test',
      },
      { userId: user.userId, familyId: user.familyId },
    );

    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const current = new Map((built.rows[0].currentValues ?? []).map(f => [f.key, f.value]));
    expect(current.get('title')).toBe('Original title');
    expect(current.get('dueDate')).toBe('2026-01-01');
    // taskId is an identifier, not a value being replaced — a "before: <uuid>"
    // row is noise on a card whose whole job is legibility.
    expect(current.has('taskId')).toBe(false);
  });

  it('renders a blank current value as explicit rather than as nothing', async () => {
    // An empty string in a DisplayField renders as absence, which reads as
    // "this field is not part of the change" rather than "it is currently blank".
    const user = await createUser('sem');
    const task = await taskService.createTask({ title: 'No due date' }, user.userId, user.familyId);

    const built = await buildProposalRows(
      {
        actionId: 'update_task',
        params: { taskId: task.id, dueDate: '2026-03-03', description: 'Added' },
        displaySummary: 'Update task',
        displayFields: [
          { key: 'taskId', label: 'Task', value: task.id, editable: false, type: 'text' },
          { key: 'dueDate', label: 'Due date', value: '2026-03-03', editable: true, type: 'date' },
          { key: 'description', label: 'Description', value: 'Added', editable: true, type: 'textarea' },
        ],
        reasoning: 'Test',
      },
      { userId: user.userId, familyId: user.familyId },
    );

    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const current = new Map((built.rows[0].currentValues ?? []).map(f => [f.key, f.value]));
    expect(current.get('dueDate')).toBe('(no due date)');
    expect(current.get('description')).toBe('(none)');
    for (const value of current.values()) expect(value.trim()).not.toBe('');
  });

  it('shows the task title and current status before completing it', async () => {
    // Disambiguation, not decoration: "mark the trash task done" is ambiguous
    // when two trash tasks exist, and this is what lets the user tell on the
    // card whether the row picked the right one.
    const user = await createUser('sem');
    const task = await taskService.createTask({ title: 'Take out trash' }, user.userId, user.familyId);

    const built = await buildProposalRows(
      {
        actionId: 'complete_task',
        params: { taskId: task.id },
        displaySummary: 'Complete task',
        displayFields: [
          { key: 'taskId', label: 'Task', value: task.id, editable: false, type: 'text' },
        ],
        reasoning: 'Test',
      },
      { userId: user.userId, familyId: user.familyId },
    );

    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const current = new Map((built.rows[0].currentValues ?? []).map(f => [f.key, f.value]));
    expect(current.get('taskId')).toBe('Take out trash');
    expect(current.get('status')).toBe('todo');
  });

  it('degrades to no comparison rather than failing the proposal', async () => {
    // A describeCurrent that throws must not take down the card: the row still
    // shows what it will write, it just cannot show what it replaces. The
    // semantic-validation pass is what actually rejects the bad id later.
    const user = await createUser('sem');

    const built = await buildProposalRows(
      {
        actionId: 'complete_task',
        params: { taskId: randomUUID() },
        displaySummary: 'Complete task',
        displayFields: [
          { key: 'taskId', label: 'Task', value: 'gone', editable: false, type: 'text' },
        ],
        reasoning: 'Test',
      },
      { userId: user.userId, familyId: user.familyId },
    );

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.rows[0].currentValues).toBeUndefined();
  });
});

describe('SEC-P030 — the orphaned categoryId case this requirement was written for', () => {
  // Stored categoryId values in this app are ALREADY known to go orphaned
  // relative to the categories file; it produces cell-vs-modal mismatches and
  // has its own cleanup scripts. A model-supplied categoryId passes
  // z.string().min(1) whether or not it names anything. Writing one would put
  // the transaction in a state the UI cannot render, silently, in bulk, across
  // a card approved with one click.

  async function seedTransaction(user: { userId: string; familyId: string }) {
    await dataService.saveData(`transactions_${user.familyId}`, [
      {
        id: 'txn-1',
        accountId: 'acct-1',
        plaidTransactionId: 'plaid-1',
        date: '2026-05-01',
        name: 'HARDWARE STORE 123',
        merchantName: 'Hardware Store',
        userDescription: null,
        amount: 42.5,
        categoryId: null,
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

  function categoryRow(index: number, transactionId: string, categoryId: string | null): ProposalRow {
    return {
      rowId: `row-${index}`,
      actionId: 'set_transaction_category',
      label: 'Set a transaction category',
      params: { transactionId, categoryId },
      displaySummary: 'Categorize transaction',
      displayFields: [
        { key: 'transactionId', label: 'Transaction', value: transactionId, editable: false, type: 'text' },
        { key: 'categoryId', label: 'Category', value: String(categoryId), editable: false, type: 'text' },
      ],
    };
  }

  it('refuses a categoryId that matches no category', async () => {
    const user = await createUser('orph');
    await seedTransaction(user);

    const rows = [categoryRow(0, 'txn-1', 'CATEGORY_THAT_NEVER_EXISTED')];
    const proposal = issuePlan(user, rows);

    const res = await confirm(user.token, proposal.proposalId, rows).expect(400);
    expect(res.body.error).toMatch(/No category matches/i);

    const after = await transactionService.getTransactions(user.familyId, { includeHidden: true });
    expect(after.transactions?.[0].categoryId).toBeNull();
  });

  it('accepts a categoryId that does resolve — the guard is not blanket-deny', async () => {
    const user = await createUser('orph');
    await seedTransaction(user);
    await dataService.saveCategories(
      [{
        id: 'HOME_IMPROVEMENT',
        name: 'Home Improvement',
        parentId: null,
        isCustom: false,
        isHidden: false,
        isRollover: false,
        isIncome: false,
        isSavings: false,
      }],
      user.familyId,
    );
    const real = await categoryService.getCategoryById('HOME_IMPROVEMENT', user.familyId);
    expect(real).not.toBeNull();

    const rows = [categoryRow(0, 'txn-1', real!.id)];
    const proposal = issuePlan(user, rows);

    await confirm(user.token, proposal.proposalId, rows).expect(200);
    const after = await transactionService.getTransactions(user.familyId, { includeHidden: true });
    expect(after.transactions?.[0].categoryId).toBe(real!.id);
  });

  it('accepts an explicit null — uncategorizing is a real intent, not a missing value', async () => {
    const user = await createUser('orph');
    await seedTransaction(user);

    const rows = [categoryRow(0, 'txn-1', null)];
    const proposal = issuePlan(user, rows);
    await confirm(user.token, proposal.proposalId, rows).expect(200);
  });

  it('refuses a transaction removed by the bank', async () => {
    // Plaid leaves replaced pending holds in storage as status:'removed'. They
    // are invisible everywhere in the UI, so editing one is a change the user
    // can never see, find, or undo.
    const user = await createUser('orph');
    await dataService.saveData(`transactions_${user.familyId}`, [
      {
        id: 'txn-ghost',
        accountId: 'acct-1',
        plaidTransactionId: 'plaid-ghost',
        date: '2026-05-01',
        name: 'GHOST HOLD',
        merchantName: 'Ghost',
        userDescription: null,
        amount: 10,
        categoryId: null,
        tags: [],
        status: 'removed',
        pending: false,
        isHidden: false,
        isFlagged: false,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const rows = [categoryRow(0, 'txn-ghost', null)];
    const proposal = issuePlan(user, rows);
    const res = await confirm(user.token, proposal.proposalId, rows).expect(400);
    expect(res.body.error).toMatch(/could not be found/i);
  });

  it('refuses a transaction belonging to another family without confirming it exists', async () => {
    const owner = await createUser('orphowner');
    const attacker = await createUser('orphother');
    await seedTransaction(owner);

    const rows = [categoryRow(0, 'txn-1', null)];
    const proposal = issuePlan(attacker, rows);
    const res = await confirm(attacker.token, proposal.proposalId, rows).expect(400);
    expect(res.body.error).toMatch(/could not be found/i);
    expect(res.body.error).not.toMatch(/Hardware/i);
  });

  it('shows the current category on the card before replacing it (SEC-P011)', async () => {
    const user = await createUser('orph');
    await seedTransaction(user);

    const built = await buildProposalRows(
      {
        actionId: 'set_transaction_category',
        params: { transactionId: 'txn-1', categoryId: null },
        displaySummary: 'Categorize transaction',
        displayFields: [
          { key: 'transactionId', label: 'Transaction', value: 'txn-1', editable: false, type: 'text' },
          { key: 'categoryId', label: 'Category', value: 'null', editable: false, type: 'text' },
        ],
        reasoning: 'Test',
      },
      { userId: user.userId, familyId: user.familyId },
    );

    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const current = new Map((built.rows[0].currentValues ?? []).map(f => [f.key, f.value]));
    // The merchant, so the user can tell WHICH transaction this row is.
    expect(current.get('transactionId')).toBe('Hardware Store');
    // And an uncategorized transaction says so rather than rendering blank.
    expect(current.get('categoryId')).toBe('(uncategorized)');
  });
});
