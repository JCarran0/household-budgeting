/**
 * Financial-class write actions — the guards (plan task 3.4)
 *
 * These three actions can never be promoted to the unattended tier, so the
 * protection that matters is what happens at confirm time. Three properties:
 *
 * 1. A SPLIT PARENT IS NOT A VISIBILITY TARGET. splitTransaction hides the
 *    parent on purpose so its children count in its place. Unhiding it
 *    double-counts the money — silently, plausibly, and in a way that shows up
 *    as a wrong total rather than as an error.
 * 2. A budget that did not exist is REMOVED on undo, not zeroed. "Not budgeted"
 *    and "budgeted at $0" are different facts, and BvA renders them
 *    differently.
 * 3. A rule is forward-acting. Creating one must not recategorize anything that
 *    already exists, and the log entry must not read as though it did.
 *
 * There is deliberately no split_transaction action. This app has no unsplit
 * anywhere — service or UI — so a split would be a model-reachable write that
 * neither undo nor the user can reverse.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import app from '../../app';
import {
  dataService,
  authService,
  transactionService,
  categoryService,
  budgetService,
  autoCategorizeService,
} from '../../services';
import { registerUser } from '../helpers/apiHelper';
import {listChatActionIds } from '../../services/chatActions';
import { proposalStore } from '../../services';
import type { ProposalRow } from '../../shared/types';

async function createUser(prefix: string) {
  const rand = Math.random().toString(36).substring(2, 8);
  return registerUser(`${prefix}${rand}`, 'secure-test-passphrase-long-enough');
}

function issuePlan(user: { userId: string; familyId: string }, rows: ProposalRow[]) {
  return proposalStore.issue({
    userId: user.userId,
    familyId: user.familyId,
    conversationId: randomUUID(),
    traceId: 'trace_financial_test',
    proposalInput: { rows, reasoning: 'Test plan' },
  });
}

function row(
  index: number,
  actionId: ProposalRow['actionId'],
  params: Record<string, unknown>,
): ProposalRow {
  return {
    rowId: `row-${index}`,
    actionId,
    label: 'Test row',
    params,
    displaySummary: `${actionId} row`,
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

async function seedCategory(familyId: string) {
  await dataService.saveCategories(
    [{
      id: 'GROCERIES',
      name: 'Groceries',
      parentId: null,
      isCustom: false,
      isHidden: false,
      isRollover: false,
      isIncome: false,
      isSavings: false,
    }],
    familyId,
  );
  return (await categoryService.getCategoryById('GROCERIES', familyId))!;
}

async function seedTransaction(familyId: string, id = 'txn-1') {
  await dataService.saveData(`transactions_${familyId}`, [
    {
      id,
      userId: familyId,
      accountId: 'acc-1',
      plaidTransactionId: `plaid-${id}`,
      plaidAccountId: 'plaid-acc-1',
      amount: 120.5,
      date: '2026-09-01',
      name: 'Corner Market',
      userDescription: null,
      merchantName: 'Corner Market',
      category: [],
      plaidCategoryId: null,
      categoryId: null,
      status: 'posted',
      pending: false,
      isoCurrencyCode: 'USD',
      accountOwner: null,
      originalDescription: null,
      tags: [],
      notes: null,
      isHidden: false,
      isFlagged: false,
      isSplit: false,
      parentTransactionId: null,
      splitTransactionIds: [],
      location: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
}

beforeEach(() => {
  if ('clear' in dataService) {
    (dataService as unknown as { clear: () => void }).clear();
  }
  authService.resetRateLimiting();
});

describe('split_transaction is not a registered action', () => {
  it('is absent from the registry entirely', () => {
    // Not "disabled" or "gated" — absent. This app has no unsplit, so a split
    // would be a model-reachable write nothing in the product can reverse.
    expect(listChatActionIds()).not.toContain('split_transaction');
  });
});

describe('set_transaction_hidden', () => {
  it('refuses to unhide a split parent, because that double-counts the money', async () => {
    const user = await createUser('hid');
    await seedTransaction(user.familyId);
    const split = await transactionService.splitTransaction(user.familyId, 'txn-1', [
      { amount: 100 },
      { amount: 20.5 },
    ]);
    expect(split.success).toBe(true);

    const rows = [row(0, 'set_transaction_hidden', { transactionId: 'txn-1', isHidden: false })];
    const proposal = await issuePlan(user, rows);

    const res = await confirm(user.token, proposal.proposalId, rows).expect(400);
    expect(res.body.errorCode).toBe('validation_failed');
    expect(res.body.error).toMatch(/counted twice/i);

    const after = await transactionService.getTransactions(user.familyId, { includeHidden: true });
    // The parent stays hidden — the invariant the split relies on.
    expect(after.transactions?.find(t => t.id === 'txn-1')?.isHidden).toBe(true);
  });

  it('hides an ordinary transaction — the guard is not blanket-deny', async () => {
    const user = await createUser('hid');
    await seedTransaction(user.familyId);

    const rows = [row(0, 'set_transaction_hidden', { transactionId: 'txn-1', isHidden: true })];
    const proposal = await issuePlan(user, rows);
    await confirm(user.token, proposal.proposalId, rows).expect(200);

    const after = await transactionService.getTransactions(user.familyId, { includeHidden: true });
    expect(after.transactions?.find(t => t.id === 'txn-1')?.isHidden).toBe(true);
  });

  it('refuses a no-op rather than logging a change that changed nothing', async () => {
    const user = await createUser('hid');
    await seedTransaction(user.familyId);

    const rows = [row(0, 'set_transaction_hidden', { transactionId: 'txn-1', isHidden: false })];
    const proposal = await issuePlan(user, rows);

    const res = await confirm(user.token, proposal.proposalId, rows).expect(400);
    expect(res.body.error).toMatch(/already visible/i);
  });
});

describe('set_budget_amount', () => {
  it('undo REMOVES a budget it created rather than zeroing it', async () => {
    // "Not budgeted" and "budgeted at $0" render differently in BvA, so an
    // undo that leaves a zero behind has not put things back.
    const user = await createUser('bud');
    const category = await seedCategory(user.familyId);

    const rows = [
      row(0, 'set_budget_amount', { categoryId: category.id, month: '2026-10', amount: 800 }),
    ];
    const proposal = await issuePlan(user, rows);
    await confirm(user.token, proposal.proposalId, rows).expect(200);
    expect((await budgetService.getBudget(category.id, '2026-10', user.familyId))?.amount).toBe(800);

    const entries = await request(app)
      .get('/api/v1/ai/activity')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    await request(app)
      .post(`/api/v1/ai/activity/${entries.body.entries[0].entryId}/undo`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({})
      .expect(200);

    expect(await budgetService.getBudget(category.id, '2026-10', user.familyId)).toBeNull();
  });

  it('undo restores the PRIOR amount when one existed', async () => {
    const user = await createUser('bud');
    const category = await seedCategory(user.familyId);
    await budgetService.createOrUpdateBudget(
      { categoryId: category.id, month: '2026-10', amount: 500 },
      user.familyId,
    );

    const rows = [
      row(0, 'set_budget_amount', { categoryId: category.id, month: '2026-10', amount: 800 }),
    ];
    const proposal = await issuePlan(user, rows);
    await confirm(user.token, proposal.proposalId, rows).expect(200);

    const entries = await request(app)
      .get('/api/v1/ai/activity')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    await request(app)
      .post(`/api/v1/ai/activity/${entries.body.entries[0].entryId}/undo`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({})
      .expect(200);

    expect((await budgetService.getBudget(category.id, '2026-10', user.familyId))?.amount).toBe(500);
  });

  it('refuses an income category rather than budgeting against income', async () => {
    const user = await createUser('bud');
    await dataService.saveCategories(
      [{
        id: 'SALARY',
        name: 'Salary',
        parentId: null,
        isCustom: false,
        isHidden: false,
        isRollover: false,
        isIncome: true,
        isSavings: false,
      }],
      user.familyId,
    );

    const rows = [row(0, 'set_budget_amount', { categoryId: 'SALARY', month: '2026-10', amount: 800 })];
    const proposal = await issuePlan(user, rows);

    const res = await confirm(user.token, proposal.proposalId, rows).expect(400);
    expect(res.body.error).toMatch(/income category/i);
  });
});

describe('create_auto_categorize_rule', () => {
  it('recategorizes nothing that already exists, and says so in the log', async () => {
    const user = await createUser('rule');
    const category = await seedCategory(user.familyId);
    await seedTransaction(user.familyId);

    const rows = [
      row(0, 'create_auto_categorize_rule', {
        description: 'Corner Market → Groceries',
        patterns: ['Corner Market'],
        categoryId: category.id,
      }),
    ];
    const proposal = await issuePlan(user, rows);
    const res = await confirm(user.token, proposal.proposalId, rows).expect(200);

    // The existing matching transaction is untouched — rules are forward-acting.
    const after = await transactionService.getTransactions(user.familyId, { includeHidden: true });
    expect(after.transactions?.find(t => t.id === 'txn-1')?.categoryId).toBeNull();
    // And the activity log says so, so nobody goes looking for changes that
    // were never made.
    expect(res.body.resource.label).toMatch(/from now on/i);
  });

  it('resolves categoryName server-side rather than trusting the model', async () => {
    const user = await createUser('rule');
    const category = await seedCategory(user.familyId);

    const rows = [
      row(0, 'create_auto_categorize_rule', {
        description: 'Corner Market',
        patterns: ['Corner Market'],
        categoryId: category.id,
        // A wrong display name would mislabel every future match.
        categoryName: 'Entertainment',
      }),
    ];
    const proposal = await issuePlan(user, rows);
    await confirm(user.token, proposal.proposalId, rows).expect(200);

    const rules = await autoCategorizeService.getRules(user.familyId);
    expect(rules[0].categoryName).toBe('Groceries');
  });

  it('names the rule already claiming a pattern instead of failing mid-batch', async () => {
    const user = await createUser('rule');
    const category = await seedCategory(user.familyId);
    await autoCategorizeService.createRule(user.familyId, {
      description: 'Existing grocery rule',
      patterns: ['Corner Market'],
      categoryId: category.id,
    });

    const rows = [
      row(0, 'create_auto_categorize_rule', {
        description: 'Duplicate',
        patterns: ['corner market'],
        categoryId: category.id,
      }),
    ];
    const proposal = await issuePlan(user, rows);

    const res = await confirm(user.token, proposal.proposalId, rows).expect(400);
    expect(res.body.errorCode).toBe('validation_failed');
    expect(res.body.error).toContain('Existing grocery rule');
    expect(await autoCategorizeService.getRules(user.familyId)).toHaveLength(1);
  });

  it('undo deletes the rule it created', async () => {
    const user = await createUser('rule');
    const category = await seedCategory(user.familyId);

    const rows = [
      row(0, 'create_auto_categorize_rule', {
        description: 'Corner Market',
        patterns: ['Corner Market'],
        categoryId: category.id,
      }),
    ];
    const proposal = await issuePlan(user, rows);
    await confirm(user.token, proposal.proposalId, rows).expect(200);
    expect(await autoCategorizeService.getRules(user.familyId)).toHaveLength(1);

    const entries = await request(app)
      .get('/api/v1/ai/activity')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    await request(app)
      .post(`/api/v1/ai/activity/${entries.body.entries[0].entryId}/undo`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({})
      .expect(200);

    expect(await autoCategorizeService.getRules(user.familyId)).toHaveLength(0);
  });
});
