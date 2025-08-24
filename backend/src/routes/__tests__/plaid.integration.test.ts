/**
 * Plaid Route Integration Tests
 * 
 * Basic smoke tests to ensure routes are properly configured.
 * For actual Plaid API testing, use test-plaid-direct.js
 */

import request from 'supertest';
import app from '../../app';

describe('Plaid Routes - Basic Integration', () => {
  describe('Route Configuration', () => {
    it('should require authentication for link token endpoint', async () => {
      const response = await request(app)
        .post('/api/v1/plaid/link-token')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String),
      });
    });

    it('should require authentication for accounts endpoint', async () => {
      const response = await request(app)
        .get('/api/v1/plaid/accounts')
        .query({ itemId: 'test-item' })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String),
      });
    });

    it('should require authentication for transactions endpoint', async () => {
      const response = await request(app)
        .get('/api/v1/plaid/transactions')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String),
      });
    });

    it('should require authentication for exchange endpoint', async () => {
      const response = await request(app)
        .post('/api/v1/plaid/exchange-token')
        .send({})
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String),
      });
    });
  });
});

/**
 * MANUAL TEST CHECKLIST
 * =====================
 * 
 * 1. [ ] Start backend: npm run dev
 * 2. [ ] Open Plaid Link in frontend
 * 3. [ ] Use sandbox credentials:
 *        - Username: user_good
 *        - Password: pass_good
 * 4. [ ] Select Chase bank
 * 5. [ ] Verify account appears in UI
 * 6. [ ] Check transactions sync from Jan 1, 2025
 * 7. [ ] Verify balance calculations are correct
 * 8. [ ] Test disconnect account flow
 * 
 * SANDBOX TEST ACCOUNTS
 * =====================
 * user_good / pass_good - Success flow
 * user_custom - Custom account selection
 * 
 * See: https://plaid.com/docs/sandbox/test-credentials/
 */