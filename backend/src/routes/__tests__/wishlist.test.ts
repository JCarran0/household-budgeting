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
import { BASE_PNG, GPS_MARKER, jpegWithGps } from '../../__tests__/helpers/imageFixtures';

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
  // URLs
  // ---------------------------------------------------------------------------

  it('POST / defaults urls to [] when omitted', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'No Links',
        estimatedAmount: 50,
        estimatedMonth: '2026-09',
        categoryId: spendingCategoryId,
      });

    expect(res.status).toBe(201);
    expect(res.body.urls).toEqual([]);
  });

  it('POST / persists http and https links', async () => {
    const urls = ['https://example.com/sofa', 'http://reviews.example.org/a?b=c'];
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Linked Couch',
        estimatedAmount: 900,
        estimatedMonth: '2026-10',
        categoryId: spendingCategoryId,
        urls,
      });

    expect(res.status).toBe(201);
    expect(res.body.urls).toEqual(urls);

    const list = await request(app).get(BASE).set('Authorization', `Bearer ${token}`);
    expect(list.body[0].urls).toEqual(urls);
  });

  // SECURITY: `z.string().url()` would ACCEPT every one of these — it parses any
  // scheme. These values land in an href, so the protocol allowlist in
  // wishlistValidators.ts is what stops a stored `javascript:` link.
  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'ftp://example.com/file',
    'not-a-url',
  ])('POST / rejects non-http(s) link %s → 400', async (badUrl) => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Sneaky',
        estimatedAmount: 10,
        estimatedMonth: '2026-09',
        categoryId: spendingCategoryId,
        urls: [badUrl],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request data');
  });

  it('POST / rejects more than 5 links → 400', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Too Many',
        estimatedAmount: 10,
        estimatedMonth: '2026-09',
        categoryId: spendingCategoryId,
        urls: Array.from({ length: 6 }, (_, i) => `https://example.com/${i}`),
      });

    expect(res.status).toBe(400);
  });

  it('PUT /:id replaces links wholesale and [] clears them', async () => {
    const created = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Replaceable',
        estimatedAmount: 10,
        estimatedMonth: '2026-09',
        categoryId: spendingCategoryId,
        urls: ['https://example.com/one', 'https://example.com/two'],
      });
    const id: string = created.body.id;

    const replaced = await request(app)
      .put(`${BASE}/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ urls: ['https://example.com/three'] });
    expect(replaced.status).toBe(200);
    expect(replaced.body.urls).toEqual(['https://example.com/three']);

    const cleared = await request(app)
      .put(`${BASE}/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ urls: [] });
    expect(cleared.status).toBe(200);
    expect(cleared.body.urls).toEqual([]);
  });

  it('PUT /:id leaves links untouched when urls is omitted', async () => {
    const created = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Keep Links',
        estimatedAmount: 10,
        estimatedMonth: '2026-09',
        categoryId: spendingCategoryId,
        urls: ['https://example.com/keep'],
      });

    const res = await request(app)
      .put(`${BASE}/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'AGREED' });

    expect(res.status).toBe(200);
    expect(res.body.urls).toEqual(['https://example.com/keep']);
  });

  // ---------------------------------------------------------------------------
  // Notes
  // ---------------------------------------------------------------------------

  it('POST / defaults notes to an empty string when omitted', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'No Note',
        estimatedAmount: 25,
        estimatedMonth: '2026-09',
        categoryId: spendingCategoryId,
      });

    expect(res.status).toBe(201);
    expect(res.body.notes).toBe('');
  });

  it('POST / persists a note and returns it on list', async () => {
    const notes = 'Only the 65in model; wait for a sale under $800.';
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'TV',
        estimatedAmount: 800,
        estimatedMonth: '2026-11',
        categoryId: spendingCategoryId,
        notes,
      });

    expect(res.status).toBe(201);
    expect(res.body.notes).toBe(notes);

    const list = await request(app).get(BASE).set('Authorization', `Bearer ${token}`);
    expect(list.body[0].notes).toBe(notes);
  });

  it('POST / rejects a note longer than 1000 characters → 400', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Wordy',
        estimatedAmount: 10,
        estimatedMonth: '2026-09',
        categoryId: spendingCategoryId,
        notes: 'x'.repeat(1001),
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request data');
  });

  it('PUT /:id replaces the note wholesale and an empty string clears it', async () => {
    const created = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Noted',
        estimatedAmount: 10,
        estimatedMonth: '2026-09',
        categoryId: spendingCategoryId,
        notes: 'first thought',
      });
    const id: string = created.body.id;

    const replaced = await request(app)
      .put(`${BASE}/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'second thought' });
    expect(replaced.status).toBe(200);
    expect(replaced.body.notes).toBe('second thought');

    const cleared = await request(app)
      .put(`${BASE}/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: '' });
    expect(cleared.status).toBe(200);
    expect(cleared.body.notes).toBe('');
  });

  it('PUT /:id leaves the note untouched when notes is omitted', async () => {
    const created = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Keep Note',
        estimatedAmount: 10,
        estimatedMonth: '2026-09',
        categoryId: spendingCategoryId,
        notes: 'keep me',
      });

    const res = await request(app)
      .put(`${BASE}/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'AGREED' });

    expect(res.status).toBe(200);
    expect(res.body.notes).toBe('keep me');
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

  // ---------------------------------------------------------------------------
  // Images (WISHLIST-BRD.md §3.7)
  // ---------------------------------------------------------------------------

  describe('images', () => {
    const IMAGES_BASE = '/api/v1/images';

    async function createItem(): Promise<string> {
      const res = await request(app)
        .post(BASE)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Lamp', estimatedAmount: 60, estimatedMonth: '2026-12', categoryId: spendingCategoryId });
      return res.body.id;
    }

    function upload(itemId: string, body: Buffer, contentType: string, authToken = token) {
      return request(app)
        .post(`${BASE}/${itemId}/images`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('image', body, { filename: 'photo', contentType });
    }

    it('POST /:id/images returns 401 when unauthenticated', async () => {
      const res = await request(app).post(`${BASE}/some-id/images`);
      expect(res.status).toBe(401);
    });

    it('GET /images/:id returns 401 when unauthenticated', async () => {
      const res = await request(app).get(`${IMAGES_BASE}/00000000-0000-4000-8000-000000000000`);
      expect(res.status).toBe(401);
    });

    it('uploads, lists and serves an image with its metadata stripped', async () => {
      const itemId = await createItem();

      const up = await upload(itemId, jpegWithGps(), 'image/jpeg');
      expect(up.status).toBe(201);
      expect(up.body.images).toHaveLength(1);
      const imageId: string = up.body.images[0].id;

      const list = await request(app).get(BASE).set('Authorization', `Bearer ${token}`);
      expect(list.body[0].images[0].id).toBe(imageId);

      const img = await request(app)
        .get(`${IMAGES_BASE}/${imageId}`)
        .set('Authorization', `Bearer ${token}`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expect(img.status).toBe(200);
      expect(img.headers['content-type']).toBe('image/jpeg');
      expect(img.headers['cache-control']).toContain('private');
      expect(img.headers['x-content-type-options']).toBe('nosniff');
      const body = img.body as Buffer;
      expect(body.length).toBe(up.body.images[0].size);
      expect(body.includes(Buffer.from(GPS_MARKER))).toBe(false);
    });

    it('another family cannot read the image (404, not 403)', async () => {
      const itemId = await createItem();
      const imageId: string = (await upload(itemId, jpegWithGps(), 'image/jpeg')).body.images[0].id;

      const other = await registerUser(
        `wl${Math.random().toString(36).substring(2, 10)}`,
        'super-secure-passphrase-for-wishlist-tests',
      );
      const res = await request(app)
        .get(`${IMAGES_BASE}/${imageId}`)
        .set('Authorization', `Bearer ${other.token}`);
      expect(res.status).toBe(404);
    });

    it('another family cannot attach to the item', async () => {
      const itemId = await createItem();
      const other = await registerUser(
        `wl${Math.random().toString(36).substring(2, 10)}`,
        'super-secure-passphrase-for-wishlist-tests',
      );
      const res = await upload(itemId, jpegWithGps(), 'image/jpeg', other.token);
      expect(res.status).toBe(404);
    });

    it('GET /images/:id with a non-UUID id is a 404', async () => {
      const res = await request(app)
        .get(`${IMAGES_BASE}/..%2F..%2Fusers`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    it('rejects a second image while the v1 cap is 1', async () => {
      const itemId = await createItem();
      await upload(itemId, jpegWithGps(), 'image/jpeg');
      const res = await upload(itemId, jpegWithGps(), 'image/jpeg');
      expect(res.status).toBe(400);
    });

    it('rejects content that does not match the declared type', async () => {
      const itemId = await createItem();
      const res = await upload(itemId, BASE_PNG, 'image/jpeg');
      expect(res.status).toBe(400);
    });

    it('rejects a non-image type', async () => {
      const itemId = await createItem();
      const res = await upload(itemId, Buffer.from('<svg/>'), 'image/svg+xml');
      expect(res.status).toBe(400);
    });

    it('rejects a file over 5 MB', async () => {
      const itemId = await createItem();
      const big = Buffer.concat([jpegWithGps(), Buffer.alloc(5 * 1024 * 1024)]);
      const res = await upload(itemId, big, 'image/jpeg');
      expect(res.status).toBe(400);
    });

    it('rejects a request with no file', async () => {
      const itemId = await createItem();
      const res = await request(app)
        .post(`${BASE}/${itemId}/images`)
        .set('Authorization', `Bearer ${token}`)
        .field('note', 'no file');
      expect(res.status).toBe(400);
    });

    it('PUT /:id cannot set images through the JSON body', async () => {
      const itemId = await createItem();
      const res = await request(app)
        .put(`${BASE}/${itemId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Lamp 2',
          images: [{ id: '00000000-0000-4000-8000-000000000000', mimeType: 'image/png', size: 1, uploadedAt: 'x' }],
        });
      expect(res.status).toBe(200);
      expect(res.body.images).toEqual([]);
    });

    it('DELETE /:id/images/:imageId detaches the image and it is no longer served', async () => {
      const itemId = await createItem();
      const imageId: string = (await upload(itemId, jpegWithGps(), 'image/jpeg')).body.images[0].id;

      const del = await request(app)
        .delete(`${BASE}/${itemId}/images/${imageId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(del.status).toBe(200);
      expect(del.body.images).toEqual([]);

      const img = await request(app).get(`${IMAGES_BASE}/${imageId}`).set('Authorization', `Bearer ${token}`);
      expect(img.status).toBe(404);
    });

    it('deleting the item stops its image being served', async () => {
      const itemId = await createItem();
      const imageId: string = (await upload(itemId, jpegWithGps(), 'image/jpeg')).body.images[0].id;

      await request(app).delete(`${BASE}/${itemId}`).set('Authorization', `Bearer ${token}`);
      const img = await request(app).get(`${IMAGES_BASE}/${imageId}`).set('Authorization', `Bearer ${token}`);
      expect(img.status).toBe(404);
    });
  });
});
