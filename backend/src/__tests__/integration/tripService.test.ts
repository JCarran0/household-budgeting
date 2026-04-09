import request from 'supertest';
import app from '../../app';
import { dataService, authService } from '../../services';
import { StoredTransaction } from '../../services/transactionService';
import { registerUser } from '../helpers/apiHelper';

// ---------------------------------------------------------------------------
// Helper: seed a transaction directly into the dataService store
// ---------------------------------------------------------------------------

async function createTestTransaction(
  userId: string,
  overrides: Partial<StoredTransaction>
): Promise<StoredTransaction> {
  const existing =
    (await dataService.getData<StoredTransaction[]>(`transactions_${userId}`)) ?? [];

  const txn: StoredTransaction = {
    id: `txn-${Math.random().toString(36).substring(2, 8)}`,
    userId,
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
  await dataService.saveData(`transactions_${userId}`, existing);
  return txn;
}

// ---------------------------------------------------------------------------
// Helper: fetch a transaction from the dataService store by ID
// ---------------------------------------------------------------------------

async function getStoredTransaction(
  userId: string,
  txnId: string
): Promise<StoredTransaction | undefined> {
  const all =
    (await dataService.getData<StoredTransaction[]>(`transactions_${userId}`)) ?? [];
  return all.find((t) => t.id === txnId);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Trip Service Integration Tests', () => {
  let authToken: string;
  let userId: string;

  beforeEach(async () => {
    if ('clear' in dataService) {
      (dataService as unknown as { clear: () => void }).clear();
    }
    authService.resetRateLimiting();

    const rand = Math.random().toString(36).substring(2, 8);
    const username = `trip${rand}`;
    const user = await registerUser(username, 'test-password-for-trip-tests');
    authToken = user.token;
    userId = user.userId;
  });

  // -------------------------------------------------------------------------
  // Tag generation
  // -------------------------------------------------------------------------

  describe('POST /api/v1/trips — tag generation from name', () => {
    it('should generate tag trip:costa-rica:2026 for name "Costa Rica" with startDate 2026-05-01', async () => {
      const response = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Costa Rica',
          startDate: '2026-05-01',
          endDate: '2026-05-14',
        })
        .expect(201);

      expect(response.body.tag).toBe('trip:costa-rica:2026');
    });

    it('should generate tag trip:nyc-weekend:2026 for name "NYC Weekend"', async () => {
      const response = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'NYC Weekend',
          startDate: '2026-08-15',
          endDate: '2026-08-17',
        })
        .expect(201);

      expect(response.body.tag).toBe('trip:nyc-weekend:2026');
    });

    it('should collapse consecutive hyphens and strip special characters from the tag', async () => {
      const response = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Paris & Rome!!!',
          startDate: '2026-06-01',
          endDate: '2026-06-15',
        })
        .expect(201);

      // "paris & rome!!!" → "paris---rome---" → "paris-rome" after collapse/trim
      expect(response.body.tag).toBe('trip:paris-rome:2026');
    });
  });

  // -------------------------------------------------------------------------
  // Tag uniqueness
  // -------------------------------------------------------------------------

  describe('POST /api/v1/trips — tag uniqueness validation', () => {
    it('should reject a second trip that produces the same tag in the same year', async () => {
      await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Costa Rica',
          startDate: '2026-05-01',
          endDate: '2026-05-14',
        })
        .expect(201);

      // Same name + same year → same tag → conflict
      await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Costa Rica',
          startDate: '2026-09-01',
          endDate: '2026-09-10',
        })
        .expect(409);
    });

    it('should allow the same name in a different year', async () => {
      await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Costa Rica',
          startDate: '2025-05-01',
          endDate: '2025-05-14',
        })
        .expect(201);

      // Different year → different tag → no conflict
      const response = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Costa Rica',
          startDate: '2026-05-01',
          endDate: '2026-05-14',
        })
        .expect(201);

      expect(response.body.tag).toBe('trip:costa-rica:2026');
    });
  });

  // -------------------------------------------------------------------------
  // CRUD basics
  // -------------------------------------------------------------------------

  describe('CRUD basics', () => {
    describe('POST /api/v1/trips', () => {
      it('should create a trip and return all expected fields', async () => {
        const response = await request(app)
          .post('/api/v1/trips')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: 'Japan',
            startDate: '2026-10-01',
            endDate: '2026-10-15',
            totalBudget: 5000,
            categoryBudgets: [{ categoryId: 'FOOD_AND_DRINK', amount: 800 }],
            rating: 5,
            notes: 'Cherry blossom season',
          })
          .expect(201);

        expect(response.body).toMatchObject({
          name: 'Japan',
          tag: 'trip:japan:2026',
          startDate: '2026-10-01',
          endDate: '2026-10-15',
          totalBudget: 5000,
          categoryBudgets: [{ categoryId: 'FOOD_AND_DRINK', amount: 800 }],
          rating: 5,
          notes: 'Cherry blossom season',
          userId,
        });
        expect(response.body.id).toBeDefined();
        expect(response.body.createdAt).toBeDefined();
        expect(response.body.updatedAt).toBeDefined();
      });

      it('should default notes to empty string when not provided', async () => {
        const response = await request(app)
          .post('/api/v1/trips')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: 'Portugal',
            startDate: '2026-07-01',
            endDate: '2026-07-10',
          })
          .expect(201);

        expect(response.body.notes).toBe('');
        expect(response.body.totalBudget).toBeNull();
        expect(response.body.rating).toBeNull();
        expect(response.body.categoryBudgets).toEqual([]);
      });
    });

    describe('GET /api/v1/trips/:id', () => {
      it('should retrieve a trip by ID', async () => {
        const createResponse = await request(app)
          .post('/api/v1/trips')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: 'Iceland',
            startDate: '2026-03-01',
            endDate: '2026-03-08',
          })
          .expect(201);

        const tripId = createResponse.body.id as string;

        const getResponse = await request(app)
          .get(`/api/v1/trips/${tripId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(getResponse.body.id).toBe(tripId);
        expect(getResponse.body.name).toBe('Iceland');
      });

      it('should return 404 for a non-existent trip ID', async () => {
        await request(app)
          .get('/api/v1/trips/non-existent-id')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(404);
      });
    });

    describe('GET /api/v1/trips', () => {
      it('should list all trips sorted by startDate descending', async () => {
        await request(app)
          .post('/api/v1/trips')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'Early Trip', startDate: '2026-01-01', endDate: '2026-01-07' })
          .expect(201);

        await request(app)
          .post('/api/v1/trips')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'Late Trip', startDate: '2026-12-01', endDate: '2026-12-10' })
          .expect(201);

        await request(app)
          .post('/api/v1/trips')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'Mid Trip', startDate: '2026-06-01', endDate: '2026-06-07' })
          .expect(201);

        const response = await request(app)
          .get('/api/v1/trips')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const trips = response.body as Array<{ name: string; startDate: string }>;
        expect(trips).toHaveLength(3);
        expect(trips[0].name).toBe('Late Trip');
        expect(trips[1].name).toBe('Mid Trip');
        expect(trips[2].name).toBe('Early Trip');
      });

      it('should return an empty array when no trips exist', async () => {
        const response = await request(app)
          .get('/api/v1/trips')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body).toEqual([]);
      });
    });

    describe('PUT /api/v1/trips/:id', () => {
      it('should update trip name, budget, rating, and notes', async () => {
        const createResponse = await request(app)
          .post('/api/v1/trips')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: 'Thailand',
            startDate: '2026-11-01',
            endDate: '2026-11-14',
          })
          .expect(201);

        const tripId = createResponse.body.id as string;

        const updateResponse = await request(app)
          .put(`/api/v1/trips/${tripId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: 'Thailand Adventure',
            totalBudget: 3000,
            rating: 4,
            notes: 'Updated notes',
          })
          .expect(200);

        expect(updateResponse.body).toMatchObject({
          id: tripId,
          name: 'Thailand Adventure',
          totalBudget: 3000,
          rating: 4,
          notes: 'Updated notes',
        });
      });
    });

    describe('DELETE /api/v1/trips/:id', () => {
      it('should delete a trip and return 204', async () => {
        const createResponse = await request(app)
          .post('/api/v1/trips')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: 'Norway',
            startDate: '2026-09-01',
            endDate: '2026-09-10',
          })
          .expect(201);

        const tripId = createResponse.body.id as string;

        await request(app)
          .delete(`/api/v1/trips/${tripId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(204);

        // Confirm the trip is gone
        await request(app)
          .get(`/api/v1/trips/${tripId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(404);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Trip deletion strips tags from associated transactions
  // -------------------------------------------------------------------------

  describe('DELETE /api/v1/trips/:id — tag removal from transactions', () => {
    it('should strip the trip tag from all associated transactions when the trip is deleted', async () => {
      const createResponse = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Costa Rica',
          startDate: '2026-05-01',
          endDate: '2026-05-14',
        })
        .expect(201);

      const tripId = createResponse.body.id as string;
      const tripTag = createResponse.body.tag as string;
      expect(tripTag).toBe('trip:costa-rica:2026');

      // Seed two transactions tagged with the trip tag
      const txn1 = await createTestTransaction(userId, {
        tags: [tripTag, 'other-tag'],
        amount: 75,
      });
      const txn2 = await createTestTransaction(userId, {
        tags: [tripTag],
        amount: 120,
      });

      // Delete the trip
      await request(app)
        .delete(`/api/v1/trips/${tripId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      // The trip tag should be removed; other tags should remain
      const storedTxn1 = await getStoredTransaction(userId, txn1.id);
      const storedTxn2 = await getStoredTransaction(userId, txn2.id);

      expect(storedTxn1?.tags).not.toContain(tripTag);
      expect(storedTxn1?.tags).toContain('other-tag');
      expect(storedTxn2?.tags).not.toContain(tripTag);
      expect(storedTxn2?.tags).toHaveLength(0);
    });

    it('should not affect transactions that do not carry the trip tag', async () => {
      const createResponse = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Greece',
          startDate: '2026-07-01',
          endDate: '2026-07-14',
        })
        .expect(201);

      const tripId = createResponse.body.id as string;
      const tripTag = createResponse.body.tag as string;

      const unrelatedTxn = await createTestTransaction(userId, {
        tags: ['other-trip', 'food'],
        amount: 30,
      });

      await request(app)
        .delete(`/api/v1/trips/${tripId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      const storedTxn = await getStoredTransaction(userId, unrelatedTxn.id);
      expect(storedTxn?.tags).toEqual(['other-trip', 'food']);
      // Confirm the deleted tag is unrelated
      expect(tripTag).toBe('trip:greece:2026');
    });
  });

  // -------------------------------------------------------------------------
  // Trip rename updates tags on transactions
  // -------------------------------------------------------------------------

  describe('PUT /api/v1/trips/:id — tag rename on transactions', () => {
    it('should replace the old tag with the new tag on all tagged transactions when the trip name changes', async () => {
      const createResponse = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Portugal Trip',
          startDate: '2026-07-01',
          endDate: '2026-07-10',
        })
        .expect(201);

      const tripId = createResponse.body.id as string;
      const oldTag = createResponse.body.tag as string;
      expect(oldTag).toBe('trip:portugal-trip:2026');

      const txn = await createTestTransaction(userId, {
        tags: [oldTag, 'vacation'],
      });

      await request(app)
        .put(`/api/v1/trips/${tripId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Portugal Adventure' })
        .expect(200);

      const newTag = 'trip:portugal-adventure:2026';
      const storedTxn = await getStoredTransaction(userId, txn.id);

      expect(storedTxn?.tags).toContain(newTag);
      expect(storedTxn?.tags).not.toContain(oldTag);
      expect(storedTxn?.tags).toContain('vacation');
    });

    it('should not change tags when only non-name fields are updated', async () => {
      const createResponse = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Morocco',
          startDate: '2026-04-01',
          endDate: '2026-04-10',
        })
        .expect(201);

      const tripId = createResponse.body.id as string;
      const tag = createResponse.body.tag as string;

      const txn = await createTestTransaction(userId, { tags: [tag] });

      await request(app)
        .put(`/api/v1/trips/${tripId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ totalBudget: 2000, rating: 4 })
        .expect(200);

      const storedTxn = await getStoredTransaction(userId, txn.id);
      expect(storedTxn?.tags).toContain(tag);
      expect(storedTxn?.tags).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Trip summary — spending aggregation
  // -------------------------------------------------------------------------

  describe('GET /api/v1/trips/:id/summary — spending aggregation', () => {
    it('should sum totalSpent correctly across all tagged transactions', async () => {
      const createResponse = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Italy',
          startDate: '2026-09-01',
          endDate: '2026-09-14',
        })
        .expect(201);

      const tripId = createResponse.body.id as string;
      const tripTag = createResponse.body.tag as string;

      await createTestTransaction(userId, { tags: [tripTag], amount: 100, categoryId: 'FOOD_AND_DRINK' });
      await createTestTransaction(userId, { tags: [tripTag], amount: 250, categoryId: 'TRAVEL' });
      await createTestTransaction(userId, { tags: [tripTag], amount: 50,  categoryId: 'FOOD_AND_DRINK' });

      const response = await request(app)
        .get(`/api/v1/trips/${tripId}/summary`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.totalSpent).toBe(400);
    });

    it('should break down spending by category', async () => {
      const createResponse = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Spain',
          startDate: '2026-08-01',
          endDate: '2026-08-10',
        })
        .expect(201);

      const tripId = createResponse.body.id as string;
      const tripTag = createResponse.body.tag as string;

      await createTestTransaction(userId, { tags: [tripTag], amount: 80,  categoryId: 'FOOD_AND_DRINK' });
      await createTestTransaction(userId, { tags: [tripTag], amount: 60,  categoryId: 'FOOD_AND_DRINK' });
      await createTestTransaction(userId, { tags: [tripTag], amount: 200, categoryId: 'TRANSPORTATION' });

      const response = await request(app)
        .get(`/api/v1/trips/${tripId}/summary`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const categorySpending = response.body.categorySpending as Array<{
        categoryId: string;
        spent: number;
        budgeted: number | null;
      }>;

      const food = categorySpending.find((c) => c.categoryId === 'FOOD_AND_DRINK');
      const transport = categorySpending.find((c) => c.categoryId === 'TRANSPORTATION');

      expect(food?.spent).toBe(140);
      expect(transport?.spent).toBe(200);
    });

    it('should include transactions outside the trip date range if they carry the trip tag', async () => {
      const createResponse = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Scandinavia',
          startDate: '2026-05-01',
          endDate: '2026-05-14',
        })
        .expect(201);

      const tripId = createResponse.body.id as string;
      const tripTag = createResponse.body.tag as string;

      // Transaction dated well before the trip's startDate
      await createTestTransaction(userId, {
        tags: [tripTag],
        amount: 300,
        date: '2026-03-01',
      });

      const response = await request(app)
        .get(`/api/v1/trips/${tripId}/summary`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.totalSpent).toBe(300);
    });

    it('should return zero totalSpent when no transactions are tagged', async () => {
      const createResponse = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'New Zealand',
          startDate: '2026-12-01',
          endDate: '2026-12-14',
        })
        .expect(201);

      const tripId = createResponse.body.id as string;

      const response = await request(app)
        .get(`/api/v1/trips/${tripId}/summary`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.totalSpent).toBe(0);
      expect(response.body.categorySpending).toEqual([]);
    });

    it('should return 404 when the trip does not exist', async () => {
      await request(app)
        .get('/api/v1/trips/non-existent-id/summary')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  // -------------------------------------------------------------------------
  // Category budgets vs actual spending in summary
  // -------------------------------------------------------------------------

  describe('GET /api/v1/trips/:id/summary — category budget vs actual', () => {
    it('should include budgeted amounts alongside spent amounts per category', async () => {
      const createResponse = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Mexico',
          startDate: '2026-02-01',
          endDate: '2026-02-10',
          totalBudget: 500,
          categoryBudgets: [{ categoryId: 'FOOD_AND_DRINK', amount: 200 }],
        })
        .expect(201);

      const tripId = createResponse.body.id as string;
      const tripTag = createResponse.body.tag as string;

      await createTestTransaction(userId, {
        tags: [tripTag],
        amount: 150,
        categoryId: 'FOOD_AND_DRINK',
      });

      const response = await request(app)
        .get(`/api/v1/trips/${tripId}/summary`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const categorySpending = response.body.categorySpending as Array<{
        categoryId: string;
        spent: number;
        budgeted: number | null;
      }>;

      const food = categorySpending.find((c) => c.categoryId === 'FOOD_AND_DRINK');
      expect(food?.spent).toBe(150);
      expect(food?.budgeted).toBe(200);
    });

    it('should include category budgets with zero spending (budgeted but not yet spent)', async () => {
      const createResponse = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Colombia',
          startDate: '2026-03-01',
          endDate: '2026-03-10',
          totalBudget: 500,
          categoryBudgets: [
            { categoryId: 'FOOD_AND_DRINK', amount: 300 },
            { categoryId: 'ENTERTAINMENT', amount: 150 },
          ],
        })
        .expect(201);

      const tripId = createResponse.body.id as string;

      // No transactions added — category budgets should still appear
      const response = await request(app)
        .get(`/api/v1/trips/${tripId}/summary`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const categorySpending = response.body.categorySpending as Array<{
        categoryId: string;
        spent: number;
        budgeted: number | null;
      }>;

      const food = categorySpending.find((c) => c.categoryId === 'FOOD_AND_DRINK');
      const entertainment = categorySpending.find((c) => c.categoryId === 'ENTERTAINMENT');

      expect(food?.spent).toBe(0);
      expect(food?.budgeted).toBe(300);
      expect(entertainment?.spent).toBe(0);
      expect(entertainment?.budgeted).toBe(150);
    });

    it('should set budgeted to null for categories with spending but no budget', async () => {
      const createResponse = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Peru',
          startDate: '2026-04-01',
          endDate: '2026-04-14',
        })
        .expect(201);

      const tripId = createResponse.body.id as string;
      const tripTag = createResponse.body.tag as string;

      await createTestTransaction(userId, {
        tags: [tripTag],
        amount: 90,
        categoryId: 'FOOD_AND_DRINK',
      });

      const response = await request(app)
        .get(`/api/v1/trips/${tripId}/summary`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const categorySpending = response.body.categorySpending as Array<{
        categoryId: string;
        spent: number;
        budgeted: number | null;
      }>;

      const food = categorySpending.find((c) => c.categoryId === 'FOOD_AND_DRINK');
      expect(food?.budgeted).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Year filter on GET /trips
  // -------------------------------------------------------------------------

  describe('GET /api/v1/trips — year filter', () => {
    it('should return only trips whose startDate falls in the requested year', async () => {
      await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Old Trip', startDate: '2025-06-01', endDate: '2025-06-10' })
        .expect(201);

      await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'New Trip', startDate: '2026-03-01', endDate: '2026-03-10' })
        .expect(201);

      const response = await request(app)
        .get('/api/v1/trips?year=2026')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const trips = response.body as Array<{ name: string }>;
      expect(trips).toHaveLength(1);
      expect(trips[0].name).toBe('New Trip');
    });

    it('should return an empty array when no trips match the year filter', async () => {
      await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Some Trip', startDate: '2025-01-01', endDate: '2025-01-07' })
        .expect(201);

      const response = await request(app)
        .get('/api/v1/trips?year=2030')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/trips/summaries
  // -------------------------------------------------------------------------

  describe('GET /api/v1/trips/summaries', () => {
    it('should return summaries for all trips with totalSpent included', async () => {
      const createResponse = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Vietnam', startDate: '2026-01-15', endDate: '2026-01-28' })
        .expect(201);

      const tripTag = createResponse.body.tag as string;

      await createTestTransaction(userId, { tags: [tripTag], amount: 500 });

      const response = await request(app)
        .get('/api/v1/trips/summaries')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const summaries = response.body as Array<{ name: string; totalSpent: number }>;
      expect(summaries).toHaveLength(1);
      expect(summaries[0].name).toBe('Vietnam');
      expect(summaries[0].totalSpent).toBe(500);
    });

    it('should return an empty array when no trips exist', async () => {
      const response = await request(app)
        .get('/api/v1/trips/summaries')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should filter summaries by year when the year query param is provided', async () => {
      await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Old Adventure', startDate: '2025-08-01', endDate: '2025-08-10' })
        .expect(201);

      await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'New Adventure', startDate: '2026-08-01', endDate: '2026-08-10' })
        .expect(201);

      const response = await request(app)
        .get('/api/v1/trips/summaries?year=2026')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const summaries = response.body as Array<{ name: string }>;
      expect(summaries).toHaveLength(1);
      expect(summaries[0].name).toBe('New Adventure');
    });
  });

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------

  describe('Input validation', () => {
    describe('POST /api/v1/trips', () => {
      it('should return 400 when name is missing', async () => {
        await request(app)
          .post('/api/v1/trips')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ startDate: '2026-05-01', endDate: '2026-05-10' })
          .expect(400);
      });

      it('should return 400 when startDate is missing', async () => {
        await request(app)
          .post('/api/v1/trips')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'Missing Date', endDate: '2026-05-10' })
          .expect(400);
      });

      it('should return 400 when endDate is before startDate', async () => {
        await request(app)
          .post('/api/v1/trips')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: 'Bad Dates',
            startDate: '2026-05-10',
            endDate: '2026-05-01',
          })
          .expect(400);
      });

      it('should return 400 when startDate format is invalid', async () => {
        await request(app)
          .post('/api/v1/trips')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: 'Bad Format',
            startDate: '05/01/2026',
            endDate: '2026-05-10',
          })
          .expect(400);
      });
    });

    describe('PUT /api/v1/trips/:id', () => {
      it('should return 400 when rating is out of range (> 5)', async () => {
        const createResponse = await request(app)
          .post('/api/v1/trips')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'Valid Trip', startDate: '2026-05-01', endDate: '2026-05-10' })
          .expect(201);

        const tripId = createResponse.body.id as string;

        await request(app)
          .put(`/api/v1/trips/${tripId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ rating: 6 })
          .expect(400);
      });

      it('should return 400 when rating is below minimum (< 1)', async () => {
        const createResponse = await request(app)
          .post('/api/v1/trips')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'Valid Trip 2', startDate: '2026-05-01', endDate: '2026-05-10' })
          .expect(201);

        const tripId = createResponse.body.id as string;

        await request(app)
          .put(`/api/v1/trips/${tripId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ rating: 0 })
          .expect(400);
      });

      it('should return 400 when updated endDate is before updated startDate', async () => {
        const createResponse = await request(app)
          .post('/api/v1/trips')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'Date Check Trip', startDate: '2026-05-01', endDate: '2026-05-10' })
          .expect(201);

        const tripId = createResponse.body.id as string;

        await request(app)
          .put(`/api/v1/trips/${tripId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ startDate: '2026-05-10', endDate: '2026-05-01' })
          .expect(400);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Authentication guards
  // -------------------------------------------------------------------------

  describe('Authentication — all endpoints require a valid token', () => {
    it('POST /api/v1/trips should return 401 without auth', async () => {
      await request(app)
        .post('/api/v1/trips')
        .send({ name: 'Unauth', startDate: '2026-05-01', endDate: '2026-05-10' })
        .expect(401);
    });

    it('GET /api/v1/trips should return 401 without auth', async () => {
      await request(app).get('/api/v1/trips').expect(401);
    });

    it('GET /api/v1/trips/summaries should return 401 without auth', async () => {
      await request(app).get('/api/v1/trips/summaries').expect(401);
    });

    it('GET /api/v1/trips/:id should return 401 without auth', async () => {
      await request(app).get('/api/v1/trips/some-id').expect(401);
    });

    it('GET /api/v1/trips/:id/summary should return 401 without auth', async () => {
      await request(app).get('/api/v1/trips/some-id/summary').expect(401);
    });

    it('PUT /api/v1/trips/:id should return 401 without auth', async () => {
      await request(app)
        .put('/api/v1/trips/some-id')
        .send({ name: 'Updated' })
        .expect(401);
    });

    it('DELETE /api/v1/trips/:id should return 401 without auth', async () => {
      await request(app).delete('/api/v1/trips/some-id').expect(401);
    });
  });

  // -------------------------------------------------------------------------
  // User isolation
  // -------------------------------------------------------------------------

  describe('User isolation', () => {
    let secondAuthToken: string;

    beforeEach(async () => {
      const rand = Math.random().toString(36).substring(2, 8);
      const username = `trip2${rand}`;
      const user = await registerUser(username, 'test-password-for-second-trip-user');
      secondAuthToken = user.token;
    });

    it('should not expose one user\'s trips to another user', async () => {
      await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Private Trip', startDate: '2026-05-01', endDate: '2026-05-10' })
        .expect(201);

      const response = await request(app)
        .get('/api/v1/trips')
        .set('Authorization', `Bearer ${secondAuthToken}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should not allow a user to fetch another user\'s trip by ID', async () => {
      const createResponse = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Owned Trip', startDate: '2026-06-01', endDate: '2026-06-10' })
        .expect(201);

      const tripId = createResponse.body.id as string;

      await request(app)
        .get(`/api/v1/trips/${tripId}`)
        .set('Authorization', `Bearer ${secondAuthToken}`)
        .expect(404);
    });
  });
});
