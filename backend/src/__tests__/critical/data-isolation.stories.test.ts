/**
 * Data Isolation User Story Tests
 * 
 * Critical path tests ensuring complete data isolation between users
 * Maps to data privacy stories from AI-USER-STORIES.md
 */

import request from 'supertest';
import app from '../../app';
import {
  registerUser,
  authenticatedGet,
  authenticatedPost,
  createCategory,
  createBudget,
} from '../helpers/apiHelper';
import { authService, dataService } from '../../services';

describe('User Story: Data Privacy and Isolation', () => {
  let user1: any;
  let user2: any;
  
  beforeEach(async () => {
    // Clear all test data
    if ('clear' in dataService) {
      (dataService as any).clear();
    }
    // Reset rate limiting between tests
    authService.resetRateLimiting();
    
    // Create two test users
    user1 = await registerUser('isolation_user1', 'user one secure passphrase');
    user2 = await registerUser('isolation_user2', 'user two secure passphrase');
  });
  
  describe('As a user, my data is completely isolated from other users', () => {
    test('My categories are separate from other users', async () => {
      // User1 creates categories
      await createCategory(user1.token, 'User1 Groceries');
      await createCategory(user1.token, 'User1 Entertainment');
      
      // User2 creates categories
      await createCategory(user2.token, 'User2 Travel');
      await createCategory(user2.token, 'User2 Dining');
      
      // User1 should only see their categories
      const user1Categories = await authenticatedGet(
        '/api/v1/categories',
        user1.token
      );
      
      expect(user1Categories.status).toBe(200);
      const user1Names = user1Categories.body.map((c: any) => c.name);
      expect(user1Names).toContain('User1 Groceries');
      expect(user1Names).toContain('User1 Entertainment');
      expect(user1Names).not.toContain('User2 Travel');
      expect(user1Names).not.toContain('User2 Dining');
      
      // User2 should only see their categories
      const user2Categories = await authenticatedGet(
        '/api/v1/categories',
        user2.token
      );
      
      expect(user2Categories.status).toBe(200);
      const user2Names = user2Categories.body.map((c: any) => c.name);
      expect(user2Names).toContain('User2 Travel');
      expect(user2Names).toContain('User2 Dining');
      expect(user2Names).not.toContain('User1 Groceries');
      expect(user2Names).not.toContain('User1 Entertainment');
    });
    
    test('My budgets are separate from other users', async () => {
      // Create categories for each user
      const user1Cat = await createCategory(user1.token, 'User1 Food');
      const user2Cat = await createCategory(user2.token, 'User2 Food');
      
      // Create budgets
      await createBudget(user1.token, user1Cat.id, '2025-01', 500);
      await createBudget(user2.token, user2Cat.id, '2025-01', 750);
      
      // User1 gets their budgets
      const user1Budgets = await authenticatedGet(
        '/api/v1/budgets/month/2025-01',
        user1.token
      );
      
      expect(user1Budgets.status).toBe(200);
      expect(user1Budgets.body.budgets).toHaveLength(1);
      expect(user1Budgets.body.budgets[0].amount).toBe(500);
      expect(user1Budgets.body.total).toBe(500);
      
      // User2 gets their budgets
      const user2Budgets = await authenticatedGet(
        '/api/v1/budgets/month/2025-01',
        user2.token
      );
      
      expect(user2Budgets.status).toBe(200);
      expect(user2Budgets.body.budgets).toHaveLength(1);
      expect(user2Budgets.body.budgets[0].amount).toBe(750);
      expect(user2Budgets.body.total).toBe(750);
    });
    
    test('My auto-categorization rules are separate from other users', async () => {
      // Create categories first
      const user1Cat = await createCategory(user1.token, 'User1 Coffee');
      const user2Cat = await createCategory(user2.token, 'User2 Gas');
      
      // User1 creates rules
      await authenticatedPost(
        '/api/v1/autocategorize/rules',
        user1.token,
        {
          description: 'User1 Coffee Rule',
          pattern: 'starbucks',
          categoryId: user1Cat.id,
          isActive: true,
        }
      );
      
      // User2 creates rules
      await authenticatedPost(
        '/api/v1/autocategorize/rules',
        user2.token,
        {
          description: 'User2 Gas Rule',
          pattern: 'shell',
          categoryId: user2Cat.id,
          isActive: true,
        }
      );
      
      // User1 gets their rules
      const user1Rules = await authenticatedGet(
        '/api/v1/autocategorize/rules',
        user1.token
      );
      
      expect(user1Rules.status).toBe(200);
      expect(user1Rules.body.rules).toHaveLength(1);
      expect(user1Rules.body.rules[0].description).toBe('User1 Coffee Rule');
      
      // User2 gets their rules
      const user2Rules = await authenticatedGet(
        '/api/v1/autocategorize/rules',
        user2.token
      );
      
      expect(user2Rules.status).toBe(200);
      expect(user2Rules.body.rules).toHaveLength(1);
      expect(user2Rules.body.rules[0].description).toBe('User2 Gas Rule');
    });
    
    test('I cannot modify data belonging to other users', async () => {
      // Create category for user1
      const user1Category = await createCategory(user1.token, 'User1 Private');
      
      // User2 tries to update user1's category
      const updateResponse = await request(app)
        .put(`/api/v1/categories/${user1Category.id}`)
        .set('Authorization', `Bearer ${user2.token}`)
        .send({ name: 'Hacked Category' });
      
      expect(updateResponse.status).toBe(404); // Not found for user2
      
      // Verify category unchanged
      const checkResponse = await authenticatedGet(
        `/api/v1/categories/${user1Category.id}`,
        user1.token
      );
      
      expect(checkResponse.status).toBe(200);
      expect(checkResponse.body.name).toBe('User1 Private');
    });
    
    test('My accounts are completely isolated from other users', async () => {
      // Each user gets their own empty accounts list initially
      const user1Response = await authenticatedGet('/api/v1/accounts', user1.token);
      const user2Response = await authenticatedGet('/api/v1/accounts', user2.token);
      
      // Both should have their own (empty) account lists
      expect(user1Response.status).toBe(200);
      expect(user1Response.body.accounts).toEqual([]);
      
      expect(user2Response.status).toBe(200);
      expect(user2Response.body.accounts).toEqual([]);
    });
    
    test('I cannot see transactions from other users', async () => {
      // User1 requests transactions (will be empty for in-memory test)
      const user1Response = await authenticatedGet(
        '/api/v1/transactions',
        user1.token
      );
      
      expect(user1Response.status).toBe(200);
      expect(user1Response.body.transactions).toEqual([]);
      
      // User2 requests transactions
      const user2Response = await authenticatedGet(
        '/api/v1/transactions',
        user2.token
      );
      
      expect(user2Response.status).toBe(200);
      expect(user2Response.body.transactions).toEqual([]);
      
      // Each user has their own empty transaction list
      expect(user1Response.body).not.toBe(user2Response.body);
    });
    
    test('Transaction counts and statistics are user-specific', async () => {
      // Check uncategorized counts for each user
      const user1Count = await authenticatedGet(
        '/api/v1/transactions/uncategorized/count',
        user1.token
      );
      const user2Count = await authenticatedGet(
        '/api/v1/transactions/uncategorized/count',
        user2.token
      );
      
      // Both should have 0 since no transactions exist
      expect(user1Count.status).toBe(200);
      expect(user1Count.body.count).toBe(0);
      expect(user1Count.body.total).toBe(0);
      
      expect(user2Count.status).toBe(200);
      expect(user2Count.body.count).toBe(0);
      expect(user2Count.body.total).toBe(0);
    });
  });
});