import request from 'supertest';
import app from '../../app';
import { dataService, authService } from '../../services';
import { registerUser } from '../helpers/apiHelper';

describe('Actuals Override Integration Tests', () => {
  let authToken: string;
  let userId: string;

  beforeEach(async () => {
    // Clear all test data
    if ('clear' in dataService) {
      (dataService as any).clear();
    }
    // Reset rate limiting between tests
    authService.resetRateLimiting();

    // Create test user and get auth token
    const rand = Math.random().toString(36).substring(2, 8);
    const username = `actuals${rand}`;
    const user = await registerUser(username, 'test-password-for-actuals-override-tests');
    authToken = user.token;
    userId = user.userId;
  });

  describe('POST /api/actuals-overrides', () => {
    it('should create a new actuals override', async () => {
      const overrideData = {
        month: '2025-01',
        totalIncome: 5000,
        totalExpenses: 3000,
        notes: 'January historical data'
      };

      const response = await request(app)
        .post('/api/v1/actuals-overrides')
        .set('Authorization', `Bearer ${authToken}`)
        .send(overrideData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.override).toMatchObject({
        month: '2025-01',
        totalIncome: 5000,
        totalExpenses: 3000,
        notes: 'January historical data',
        userId
      });
      expect(response.body.override.id).toBeDefined();
      expect(response.body.override.createdAt).toBeDefined();
      expect(response.body.override.updatedAt).toBeDefined();
    });

    it('should update existing override for the same month', async () => {
      // Create initial override
      const initialData = {
        month: '2025-02',
        totalIncome: 4000,
        totalExpenses: 2500
      };

      const firstResponse = await request(app)
        .post('/api/v1/actuals-overrides')
        .set('Authorization', `Bearer ${authToken}`)
        .send(initialData)
        .expect(201);

      const firstId = firstResponse.body.override.id;

      // Update with new data for same month
      const updatedData = {
        month: '2025-02',
        totalIncome: 4500,
        totalExpenses: 2800,
        notes: 'Updated February data'
      };

      const secondResponse = await request(app)
        .post('/api/v1/actuals-overrides')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updatedData)
        .expect(201);

      expect(secondResponse.body.override.id).toBe(firstId);
      expect(secondResponse.body.override.totalIncome).toBe(4500);
      expect(secondResponse.body.override.totalExpenses).toBe(2800);
      expect(secondResponse.body.override.notes).toBe('Updated February data');
    });

    it('should validate month format', async () => {
      const invalidData = {
        month: '2025/01', // Invalid format
        totalIncome: 5000,
        totalExpenses: 3000
      };

      await request(app)
        .post('/api/v1/actuals-overrides')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);
    });

    it('should validate required fields', async () => {
      const invalidData = {
        month: '2025-01'
        // Missing totalIncome and totalExpenses
      };

      await request(app)
        .post('/api/v1/actuals-overrides')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);
    });

    it('should require authentication', async () => {
      const overrideData = {
        month: '2025-01',
        totalIncome: 5000,
        totalExpenses: 3000
      };

      await request(app)
        .post('/api/v1/actuals-overrides')
        .send(overrideData)
        .expect(401);
    });

    it('should validate negative values', async () => {
      const invalidData = {
        month: '2025-01',
        totalIncome: -1000, // Negative income
        totalExpenses: 3000
      };

      await request(app)
        .post('/api/v1/actuals-overrides')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);
    });
  });

  describe('GET /api/actuals-overrides', () => {
    beforeEach(async () => {
      // Create test overrides
      await request(app)
        .post('/api/v1/actuals-overrides')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          month: '2025-01',
          totalIncome: 5000,
          totalExpenses: 3000
        });

      await request(app)
        .post('/api/v1/actuals-overrides')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          month: '2025-02',
          totalIncome: 5500,
          totalExpenses: 3200
        });
    });

    it('should get all actuals overrides for user', async () => {
      const response = await request(app)
        .get('/api/v1/actuals-overrides')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.overrides).toHaveLength(2);
      expect(response.body.overrides[0].month).toBe('2025-02');
      expect(response.body.overrides[1].month).toBe('2025-01');
    });

    it('should return empty array when no overrides exist', async () => {
      // Clear overrides
      await dataService.saveData(`actuals_overrides_${userId}`, []);

      const response = await request(app)
        .get('/api/v1/actuals-overrides')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.overrides).toEqual([]);
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/v1/actuals-overrides')
        .expect(401);
    });
  });

  describe('GET /api/actuals-overrides/:month', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/v1/actuals-overrides')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          month: '2025-03',
          totalIncome: 6000,
          totalExpenses: 3500,
          notes: 'March data'
        });
    });

    it('should get override for specific month', async () => {
      const response = await request(app)
        .get('/api/v1/actuals-overrides/2025-03')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.override.month).toBe('2025-03');
      expect(response.body.override.totalIncome).toBe(6000);
      expect(response.body.override.totalExpenses).toBe(3500);
      expect(response.body.override.notes).toBe('March data');
    });

    it('should return 404 for non-existent month', async () => {
      await request(app)
        .get('/api/v1/actuals-overrides/2025-12')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/v1/actuals-overrides/2025-03')
        .expect(401);
    });
  });

  describe('DELETE /api/actuals-overrides/:id', () => {
    let overrideId: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/v1/actuals-overrides')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          month: '2025-04',
          totalIncome: 5200,
          totalExpenses: 3100
        });

      overrideId = response.body.override.id;
    });

    it('should delete an actuals override', async () => {
      const response = await request(app)
        .delete(`/api/v1/actuals-overrides/${overrideId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify it's deleted
      await request(app)
        .get('/api/v1/actuals-overrides/2025-04')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should return 404 for non-existent override', async () => {
      await request(app)
        .delete('/api/v1/actuals-overrides/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should require authentication', async () => {
      await request(app)
        .delete(`/api/v1/actuals-overrides/${overrideId}`)
        .expect(401);
    });
  });

  describe('GET /api/actuals-overrides/range/:startMonth/:endMonth', () => {
    beforeEach(async () => {
      // Create overrides for multiple months
      const months = ['2025-01', '2025-02', '2025-03', '2025-04'];
      for (const month of months) {
        await request(app)
          .post('/api/v1/actuals-overrides')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            month,
            totalIncome: 5000,
            totalExpenses: 3000
          });
      }
    });

    it('should get overrides within date range', async () => {
      const response = await request(app)
        .get('/api/v1/actuals-overrides/range/2025-02/2025-03')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.overrides).toHaveLength(2);
      expect(response.body.overrides[0].month).toBe('2025-02');
      expect(response.body.overrides[1].month).toBe('2025-03');
    });

    it('should return empty array when no overrides in range', async () => {
      const response = await request(app)
        .get('/api/v1/actuals-overrides/range/2025-10/2025-12')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.overrides).toEqual([]);
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/v1/actuals-overrides/range/2025-01/2025-03')
        .expect(401);
    });
  });

  describe('User Isolation', () => {
    let secondAuthToken: string;

    beforeEach(async () => {
      // Create second test user (first user already created in parent beforeEach)
      const rand = Math.random().toString(36).substring(2, 8);
      const username = `actuals2${rand}`;
      const user = await registerUser(username, 'test-password-for-second-actuals-user');
      secondAuthToken = user.token;
    });

    it('should not allow users to see other users overrides', async () => {
      // Create override for first user
      await request(app)
        .post('/api/v1/actuals-overrides')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          month: '2025-05',
          totalIncome: 7000,
          totalExpenses: 4000
        });

      // Second user should not see first user's override
      const response = await request(app)
        .get('/api/v1/actuals-overrides')
        .set('Authorization', `Bearer ${secondAuthToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.overrides).toEqual([]);
    });

    it('should not allow users to delete other users overrides', async () => {
      // Create override for first user
      const firstUserResponse = await request(app)
        .post('/api/v1/actuals-overrides')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          month: '2025-06',
          totalIncome: 7500,
          totalExpenses: 4200
        });

      const overrideId = firstUserResponse.body.override.id;

      // Second user tries to delete first user's override
      await request(app)
        .delete(`/api/v1/actuals-overrides/${overrideId}`)
        .set('Authorization', `Bearer ${secondAuthToken}`)
        .expect(404);

      // First user's override should still exist
      const verifyResponse = await request(app)
        .get('/api/v1/actuals-overrides/2025-06')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(verifyResponse.body.success).toBe(true);
      expect(verifyResponse.body.override.id).toBe(overrideId);
    });
  });

  describe('Regression Tests', () => {
    it('should preserve exact month when creating override (Bug #1)', async () => {
      // Test that creating an override for January saves as January, not November
      const overrideData = {
        month: '2025-01',
        totalIncome: 5000,
        totalExpenses: 3000,
        notes: 'Testing January preservation'
      };

      const createResponse = await request(app)
        .post('/api/v1/actuals-overrides')
        .set('Authorization', `Bearer ${authToken}`)
        .send(overrideData)
        .expect(201);

      // Verify the returned override has the correct month
      expect(createResponse.body.override.month).toBe('2025-01');

      // Verify fetching by month returns the correct override
      const getResponse = await request(app)
        .get('/api/v1/actuals-overrides/2025-01')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(getResponse.body.override.month).toBe('2025-01');
      expect(getResponse.body.override.totalIncome).toBe(5000);
      expect(getResponse.body.override.totalExpenses).toBe(3000);
    });

    it('should preserve month when editing override (Bug #2)', async () => {
      // Create override for November
      const initialData = {
        month: '2025-11',
        totalIncome: 4000,
        totalExpenses: 2000,
        notes: 'November data'
      };

      const createResponse = await request(app)
        .post('/api/v1/actuals-overrides')
        .set('Authorization', `Bearer ${authToken}`)
        .send(initialData)
        .expect(201);

      expect(createResponse.body.override.month).toBe('2025-11');
      const overrideId = createResponse.body.override.id;

      // Edit the override (change amounts, not month)
      const updatedData = {
        month: '2025-11', // Same month
        totalIncome: 4500,
        totalExpenses: 2200,
        notes: 'Updated November data'
      };

      const updateResponse = await request(app)
        .post('/api/v1/actuals-overrides')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updatedData)
        .expect(201);

      // Verify month is still November, not October
      expect(updateResponse.body.override.id).toBe(overrideId);
      expect(updateResponse.body.override.month).toBe('2025-11');
      expect(updateResponse.body.override.totalIncome).toBe(4500);
      expect(updateResponse.body.override.totalExpenses).toBe(2200);

      // Double-check by fetching
      const getResponse = await request(app)
        .get('/api/v1/actuals-overrides/2025-11')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(getResponse.body.override.month).toBe('2025-11');
    });

    it('should return proper JSON response when deleting (Bug #3)', async () => {
      // Create an override to delete
      const createResponse = await request(app)
        .post('/api/v1/actuals-overrides')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          month: '2025-07',
          totalIncome: 3000,
          totalExpenses: 1500
        })
        .expect(201);

      const overrideId = createResponse.body.override.id;

      // Delete should return 200 with JSON body, not 204
      const deleteResponse = await request(app)
        .delete(`/api/v1/actuals-overrides/${overrideId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify response has proper structure
      expect(deleteResponse.body).toHaveProperty('success');
      expect(deleteResponse.body.success).toBe(true);
      expect(typeof deleteResponse.body.success).toBe('boolean');
    });
  });
});
