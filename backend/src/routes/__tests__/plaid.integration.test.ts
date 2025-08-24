/**
 * Plaid Integration Tests - Using Sandbox Environment
 * 
 * These tests verify our Plaid integration works with the actual
 * Plaid sandbox API. They're more valuable than mocked unit tests.
 */

import request from 'supertest';
import app from '../../app';
import { AuthService } from '../../services/authService';
import { InMemoryDataService } from '../../services/dataService';

describe('Plaid Integration (Sandbox)', () => {
  let authToken: string;
  const dataService = new InMemoryDataService();
  const authService = new AuthService(dataService);

  beforeAll(async () => {
    // Create a test user and get auth token
    const result = await authService.register('plaidtest', 'TestPass123!');
    if (result.success && result.token) {
      authToken = result.token;
    }
  });

  describe('Critical Path: Link Token → Public Token → Access Token', () => {
    it('should create a real sandbox link token', async () => {
      const response = await request(app)
        .post('/api/v1/plaid/link-token')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        linkToken: expect.stringMatching(/^link-sandbox-/),
        expiration: expect.any(String),
      });

      console.log('✓ Link token created:', response.body.linkToken);
    });

    // Note: We can't test public token exchange without actual Plaid Link UI
    // This would be a manual test or E2E test with Playwright/Cypress
    it.skip('should exchange public token for access token', async () => {
      // This requires a public token from Plaid Link UI
      // Document this as a manual test case
    });
  });

  describe('Error Handling', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/plaid/link-token')
        .expect(401);

      expect(response.body).toMatchObject({
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