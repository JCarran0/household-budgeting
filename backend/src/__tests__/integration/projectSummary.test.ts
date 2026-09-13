/**
 * Project summary integration tests — spending attribution end to end.
 *
 * Covers the wiring that unit tests cannot reach:
 *   - Hidden transactions are excluded from project totals (BRD §5.6)
 *   - Split parents drop out while their tag-inheriting children count
 *   - lineItemSpending / unattributedSpent are computed and returned
 *
 * The hidden-transaction case is the regression guard for the bug where
 * getProjectSummary passed includeHidden: true, making Projects the only
 * consumer that counted rows every other consumer filters out.
 */

import request from 'supertest';
import app from '../../app';
import { dataService, authService } from '../../services';
import { StoredTransaction } from '../../services/transactionService';
import { registerUser } from '../helpers/apiHelper';
import type { ProjectSummary } from '../../shared/types';

async function seedTransaction(
  familyId: string,
  overrides: Partial<StoredTransaction>
): Promise<StoredTransaction> {
  const existing =
    (await dataService.getData<StoredTransaction[]>(`transactions_${familyId}`)) ?? [];

  const txn: StoredTransaction = {
    id: `txn-${Math.random().toString(36).substring(2, 10)}`,
    userId: familyId,
    accountId: 'test-account',
    plaidTransactionId: null,
    plaidAccountId: 'test',
    amount: 50,
    date: '2026-05-05',
    name: 'Test Transaction',
    userDescription: null,
    merchantName: null,
    category: null,
    plaidCategoryId: null,
    categoryId: null,
    status: 'posted',
    pending: false,
    isoCurrencyCode: 'USD',
    tags: [],
    notes: null,
    isHidden: false,
    isFlagged: false,
    isSplit: false,
    parentTransactionId: null,
    splitTransactionIds: [],
    accountOwner: null,
    originalDescription: null,
    location: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };

  existing.push(txn);
  await dataService.saveData(`transactions_${familyId}`, existing);
  return txn;
}

describe('Project summary — spending attribution', () => {
  let authToken: string;
  let familyId: string;
  let projectId: string;
  let projectTag: string;

  const fetchSummary = async (): Promise<ProjectSummary> => {
    const res = await request(app)
      .get(`/api/v1/projects/${projectId}/summary`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    return res.body as ProjectSummary;
  };

  beforeEach(async () => {
    if ('clear' in dataService) {
      (dataService as unknown as { clear: () => void }).clear();
    }
    authService.resetRateLimiting();

    const rand = Math.random().toString(36).substring(2, 8);
    const user = await registerUser(`psum${rand}`, 'test-password-for-project-tests');
    authToken = user.token;
    familyId = user.familyId;

    const res = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Basement Pantry',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        totalBudget: 1600,
        lineItems: [
          { name: 'Cement', estimatedCost: 1000, tag: 'cement' },
          { name: 'Framing studs', estimatedCost: 100, tag: 'framing-studs' },
        ],
      })
      .expect(201);

    projectId = res.body.id;
    projectTag = res.body.tag;
  });

  // -------------------------------------------------------------------------
  // Hidden transactions — the regression guard
  // -------------------------------------------------------------------------

  it('excludes hidden transactions from the project total', async () => {
    await seedTransaction(familyId, { tags: [projectTag], amount: 100 });
    await seedTransaction(familyId, { tags: [projectTag], amount: 250, isHidden: true });

    const summary = await fetchSummary();

    expect(summary.totalSpent).toBe(100);
  });

  it('excludes hidden transactions from line item actuals too', async () => {
    await seedTransaction(familyId, { tags: [projectTag, 'cement'], amount: 400 });
    await seedTransaction(familyId, {
      tags: [projectTag, 'cement'],
      amount: 600,
      isHidden: true,
    });

    const summary = await fetchSummary();
    const cement = summary.lineItemSpending.find((r) => r.tag === 'cement');

    expect(cement!.actual).toBe(400);
    expect(cement!.matchCount).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Splits — correct in both orders of operation
  // -------------------------------------------------------------------------

  it('counts split children once, not the hidden parent as well (tag then split)', async () => {
    // The order that used to break: tag the charge, then split it. The parent
    // keeps the project tag and is hidden; children inherit the tag.
    const parent = await seedTransaction(familyId, {
      tags: [projectTag, 'cement'],
      amount: 412,
    });

    await request(app)
      .post(`/api/v1/transactions/${parent.id}/split`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ splits: [{ amount: 180 }, { amount: 232 }] })
      .expect(200);

    const summary = await fetchSummary();

    // 412, not 824 — the hidden parent must not be counted alongside its children
    expect(summary.totalSpent).toBe(412);
    const cement = summary.lineItemSpending.find((r) => r.tag === 'cement');
    expect(cement!.actual).toBe(412);
    expect(cement!.matchCount).toBe(2);
  });

  it('attributes split children to different line items when retagged', async () => {
    const parent = await seedTransaction(familyId, { tags: [projectTag], amount: 300 });

    const splitRes = await request(app)
      .post(`/api/v1/transactions/${parent.id}/split`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ splits: [{ amount: 200 }, { amount: 100 }] })
      .expect(200);

    const children = splitRes.body.splitTransactions as StoredTransaction[];

    await request(app)
      .post(`/api/v1/transactions/${children[0].id}/tags`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ tags: [projectTag, 'cement'] })
      .expect(200);
    await request(app)
      .post(`/api/v1/transactions/${children[1].id}/tags`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ tags: [projectTag, 'framing-studs'] })
      .expect(200);

    const summary = await fetchSummary();

    expect(summary.totalSpent).toBe(300);
    expect(summary.lineItemSpending.find((r) => r.tag === 'cement')!.actual).toBe(200);
    expect(summary.lineItemSpending.find((r) => r.tag === 'framing-studs')!.actual).toBe(100);
    expect(summary.unattributedSpent).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Line item attribution surfaced through the API
  // -------------------------------------------------------------------------

  it('reports spend carrying no line item tag as unattributed', async () => {
    await seedTransaction(familyId, { tags: [projectTag, 'cement'], amount: 900 });
    await seedTransaction(familyId, { tags: [projectTag], amount: 250 });

    const summary = await fetchSummary();

    expect(summary.totalSpent).toBe(1150);
    expect(summary.lineItemSpending.find((r) => r.tag === 'cement')!.actual).toBe(900);
    expect(summary.unattributedSpent).toBe(250);
  });

  it('returns a zeroed row for a line item nothing is tagged to', async () => {
    await seedTransaction(familyId, { tags: [projectTag, 'cement'], amount: 900 });

    const summary = await fetchSummary();
    const studs = summary.lineItemSpending.find((r) => r.tag === 'framing-studs');

    expect(studs!.actual).toBe(0);
    expect(studs!.matchCount).toBe(0);
  });

  it('ignores a line item tag on a transaction outside the project', async () => {
    // The line item tag alone must not pull in spend — matching is scoped to
    // the project's own transactions, which is what makes flat, reusable tags
    // safe across projects (BRD §5.5.4).
    await seedTransaction(familyId, { tags: ['cement'], amount: 500 });

    const summary = await fetchSummary();

    expect(summary.totalSpent).toBe(0);
    expect(summary.lineItemSpending.find((r) => r.tag === 'cement')!.actual).toBe(0);
  });

  it('counts a transaction carrying two line item tags toward both', async () => {
    // Deliberately naive (BRD §5.5.5): the actuals overlap and must never be
    // summed. totalSpent stays honest at 412.
    await seedTransaction(familyId, {
      tags: [projectTag, 'cement', 'framing-studs'],
      amount: 412,
    });

    const summary = await fetchSummary();

    expect(summary.totalSpent).toBe(412);
    expect(summary.lineItemSpending.find((r) => r.tag === 'cement')!.actual).toBe(412);
    expect(summary.lineItemSpending.find((r) => r.tag === 'framing-studs')!.actual).toBe(412);
    expect(summary.unattributedSpent).toBe(0);
  });
});
