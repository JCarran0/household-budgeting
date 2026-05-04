/**
 * Integration tests for GET /api/v1/categories/auto-cat/suggestions.
 */

import request from 'supertest';
import app from '../../app';
import { authService, dataService } from '../../services';
import {
  registerUser,
  authenticatedGet,
  createCategory,
} from '../helpers/apiHelper';
import type { StoredTransaction } from '../../services/transactionService';

const SUGGESTIONS_PATH = '/api/v1/categories/auto-cat/suggestions';

function buildTx(overrides: Partial<StoredTransaction> & { id: string; userId: string; accountId: string }): StoredTransaction {
  return {
    plaidAccountId: 'pacc-1',
    plaidTransactionId: `p-${overrides.id}`,
    amount: 12.5,
    date: new Date().toISOString().slice(0, 10),
    name: 'raw',
    merchantName: null,
    userDescription: null,
    categoryId: null,
    category: null,
    plaidCategoryId: null,
    pending: false,
    status: 'posted',
    isoCurrencyCode: 'USD',
    accountOwner: null,
    originalDescription: null,
    location: null,
    tags: [],
    notes: null,
    isHidden: false,
    isFlagged: false,
    isSplit: false,
    parentTransactionId: null,
    splitTransactionIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as StoredTransaction;
}

describe('GET /api/v1/categories/auto-cat/suggestions', () => {
  beforeEach(() => {
    if ('clear' in dataService) {
      // Test-only helper — see InMemoryDataService.clear()
      (dataService as unknown as { clear: () => void }).clear();
    }
    authService.resetRateLimiting();
  });

  test('401 when unauthenticated', async () => {
    const res = await request(app).get(SUGGESTIONS_PATH);
    expect(res.status).toBe(401);
  });

  test('200 + empty list when no eligible clusters', async () => {
    const rand = Math.random().toString(36).substring(2, 8);
    const user = await registerUser(`sug${rand}`, 'sug auto cat secure passphrase');
    const res = await authenticatedGet(SUGGESTIONS_PATH, user.token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      suggestions: [],
      truncated: false,
      totalSuggestions: 0,
    });
  });

  test('200 + populated list for a clean cluster', async () => {
    const rand = Math.random().toString(36).substring(2, 8);
    const user = await registerUser(`sug${rand}`, 'sug auto cat secure passphrase');
    const restaurants = await createCategory(user.token, 'Restaurants');

    const txns: StoredTransaction[] = [
      buildTx({ id: 'a', userId: user.userId, accountId: 'acc1', merchantName: 'Lola Pizza', categoryId: restaurants.id }),
      buildTx({ id: 'b', userId: user.userId, accountId: 'acc1', merchantName: 'Lola Pizza', categoryId: restaurants.id }),
      buildTx({ id: 'c', userId: user.userId, accountId: 'acc1', merchantName: 'Lola Pizza', categoryId: restaurants.id }),
      buildTx({ id: 'd', userId: user.userId, accountId: 'acc1', merchantName: 'Lola Pizza', categoryId: null }),
    ];
    await dataService.saveData(`transactions_${user.familyId}`, txns);

    const res = await authenticatedGet(SUGGESTIONS_PATH, user.token);
    expect(res.status).toBe(200);
    expect(res.body.suggestions).toHaveLength(1);
    expect(res.body.suggestions[0]).toMatchObject({
      normalizedKey: 'lola pizza',
      displayLabel: 'Lola Pizza',
      topCategoryId: restaurants.id,
      topCategoryName: 'Restaurants',
      agreementPct: 100,
      clusterSize: 3,
      pendingMatchCount: 1,
    });
    expect(res.body.totalSuggestions).toBe(1);
    expect(res.body.truncated).toBe(false);
  });
});
