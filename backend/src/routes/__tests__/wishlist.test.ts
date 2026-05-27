/**
 * Wishlist Route Integration Tests
 *
 * Spins up the Express app with InMemoryDataService (NODE_ENV=test).
 * Creates a real user and uses their JWT for authenticated requests.
 * Seeds categories via the categories API before testing wishlist endpoints.
 */

import request from 'supertest';
import app from '../../app';
import { registerUser } from '../../../src/__tests__/helpers/apiHelper';

const BASE = '/api/v1/wishlist';
const CATEGORIES_BASE = '/api/v1/categories';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createSpendingCategory(token: string, name: string): Promise<string> {
  const res = await request(app)
    .post(CATEGORIES_BASE)
    .set('Authorization', `Bearer ${token}`)
    .send({ name, parentId: null, isHidden: false, isRollover: false, isSavings: false });
  if (res.status !== 201) throw new Error(`Failed to create spending category: ${JSON.stringify(res.body)}`);
  return res.body.id;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Wishlist Routes', () => {
  let token: string;
  let spendingCategoryId: string;

  beforeEach(async () => {
    // Register a fresh user for each test to get clean data isolation
    const username = `wl${Math.random().toString(36).substring(2, 10)}`;
    const user = await registerUser(username, 'super-secure-passphrase-for-wishlist-tests');
    token = user.token;

    // Create a spending category
    spendingCategoryId = await createSpendingCategory(token, 'Home Goods');
  });

  // ---------------------------------------------------------------------------
  // Authentication guard
  // ---------------------------------------------------------------------------

  it('POST / returns 401 when unauthenticated', async () => {
    const res = await request(app).post(BASE).send({});
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('GET / returns 401 when unauthenticated', async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('PUT /:id returns 401 when unauthenticated', async () => {
    const res = await request(app).put(`${BASE}/some-id`).send({ status: 'AGREED' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('DELETE /:id returns 401 when unauthenticated', async () => {
    const res = await request(app).delete(`${BASE}/some-id`);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // POST / happy path
  // ---------------------------------------------------------------------------

  it('POST / happy path → 201 with server-assigned fields', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'New Couch',
        estimatedAmount: 1200,
        estimatedMonth: '2026-09',
        categoryId: spendingCategoryId,
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'New Couch',
      estimatedAmount: 1200,
      estimatedMonth: '2026-09',
      categoryId: spendingCategoryId,
      status: 'PENDING',
    });
    expect(res.body.id).toEqual(expect.any(String));
    expect(res.body.createdAt).toEqual(expect.any(String));
    expect(res.body.updatedAt).toEqual(expect.any(String));
    expect(res.body.createdBy).toEqual(expect.any(String));
  });

  // ---------------------------------------------------------------------------
  // POST / validation errors
  // ---------------------------------------------------------------------------

  it('POST / with savings category → 400', async () => {
    // Create a savings category via the API
    const savRes = await request(app)
      .post(CATEGORIES_BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'My Savings', parentId: null, isHidden: false, isRollover: false, isSavings: true });
    expect(savRes.status).toBe(201);
    const savingsCategoryId: string = savRes.body.id;

    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Savings item',
        estimatedAmount: 500,
        estimatedMonth: '2026-09',
        categoryId: savingsCategoryId,
      });

    expect(res.status).toBe(400);
  });

  it('POST / with bad month format → 400 (Zod)', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Bad month',
        estimatedAmount: 100,
        estimatedMonth: '2026-9', // missing leading zero
        categoryId: spendingCategoryId,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request data');
  });

  it('POST / with negative amount → 400 (Zod)', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Negative',
        estimatedAmount: -50,
        estimatedMonth: '2026-09',
        categoryId: spendingCategoryId,
      });

    expect(res.status).toBe(400);
  });

  // ---------------------------------------------------------------------------
  // GET /
  // ---------------------------------------------------------------------------

  it('GET / returns the created item', async () => {
    await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Lamp', estimatedAmount: 80, estimatedMonth: '2026-06', categoryId: spendingCategoryId });

    const res = await request(app)
      .get(BASE)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe('Lamp');
  });

  // ---------------------------------------------------------------------------
  // PUT /:id
  // ---------------------------------------------------------------------------

  it('PUT /:id updates status only → 200', async () => {
    const created = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Chair', estimatedAmount: 300, estimatedMonth: '2026-07', categoryId: spendingCategoryId });
    expect(created.status).toBe(201);
    const id: string = created.body.id;

    const updated = await request(app)
      .put(`${BASE}/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'AGREED' });

    expect(updated.status).toBe(200);
    expect(updated.body.status).toBe('AGREED');
    expect(updated.body.name).toBe('Chair'); // unchanged
  });

  it('PUT /:id with empty body → 400 (refine check)', async () => {
    const created = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Desk', estimatedAmount: 400, estimatedMonth: '2026-08', categoryId: spendingCategoryId });
    expect(created.status).toBe(201);

    const res = await request(app)
      .put(`${BASE}/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('PUT /:id on missing id → 404', async () => {
    const res = await request(app)
      .put(`${BASE}/does-not-exist`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'AGREED' });

    expect(res.status).toBe(404);
  });

  // ---------------------------------------------------------------------------
  // DELETE /:id
  // ---------------------------------------------------------------------------

  it('DELETE existing id → 204, subsequent GET excludes it', async () => {
    const created = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bookshelf', estimatedAmount: 250, estimatedMonth: '2026-10', categoryId: spendingCategoryId });
    expect(created.status).toBe(201);
    const id: string = created.body.id;

    const del = await request(app)
      .delete(`${BASE}/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);

    const list = await request(app)
      .get(BASE)
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.find((item: { id: string }) => item.id === id)).toBeUndefined();
  });

  it('DELETE missing id → 404', async () => {
    const res = await request(app)
      .delete(`${BASE}/ghost-id`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
