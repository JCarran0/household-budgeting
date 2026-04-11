/**
 * Family Data Sharing & Isolation Tests
 *
 * Tests that family members share data (categories, budgets, etc.)
 * while different families remain fully isolated. Also verifies
 * that removing a member doesn't delete family data.
 */

import {
  registerUser,
  registerUserWithJoinCode,
  authenticatedGet,
  authenticatedPost,
  authenticatedDelete,
  createCategory,
  createBudget,
} from '../helpers/apiHelper';
import { authService, dataService, familyService } from '../../services';

describe('Family Data Sharing & Isolation', () => {
  beforeEach(async () => {
    if ('clear' in dataService) {
      (dataService as unknown as { clear: () => void }).clear();
    }
    authService.resetRateLimiting();
    familyService.resetInvitations();
  });

  const rand = () => Math.random().toString(36).substring(2, 8);

  async function createFamilyPair() {
    const r = rand();
    const user1 = await registerUser(`u1${r}`, 'user one secure passphrase', 'User One');
    const invitation = familyService.createInvitation(user1.familyId, user1.userId);
    const user2 = await registerUserWithJoinCode(
      `u2${r}`,
      'user two secure passphrase',
      invitation.code,
      'User Two',
    );
    return { user1, user2 };
  }

  describe('Same-family members share data', () => {
    test('categories created by one member are visible to the other', async () => {
      const { user1, user2 } = await createFamilyPair();

      // User1 creates a category
      await createCategory(user1.token, 'Shared Groceries');

      // User2 should see it
      const response = await authenticatedGet('/api/v1/categories', user2.token);
      const names = response.body.map((c: { name: string }) => c.name);
      expect(names).toContain('Shared Groceries');
    });

    test('budgets created by one member are visible to the other', async () => {
      const { user1, user2 } = await createFamilyPair();

      const cat = await createCategory(user1.token, 'Family Food');
      await createBudget(user1.token, cat.id, '2026-04', 600);

      // User2 sees the budget
      const response = await authenticatedGet('/api/v1/budgets/month/2026-04', user2.token);
      expect(response.status).toBe(200);
      expect(response.body.budgets).toHaveLength(1);
      expect(response.body.budgets[0].amount).toBe(600);
    });

    test('auto-categorize rules are shared within the family', async () => {
      const { user1, user2 } = await createFamilyPair();

      const cat = await createCategory(user1.token, 'Coffee');
      await authenticatedPost('/api/v1/autocategorize/rules', user1.token, {
        description: 'Starbucks rule',
        patterns: ['starbucks'],
        categoryId: cat.id,
        isActive: true,
      });

      // User2 sees the rule
      const response = await authenticatedGet('/api/v1/autocategorize/rules', user2.token);
      expect(response.status).toBe(200);
      expect(response.body.rules).toHaveLength(1);
      expect(response.body.rules[0].description).toBe('Starbucks rule');
    });
  });

  describe('Different families are isolated', () => {
    test('categories from one family are not visible to another family', async () => {
      const { user1 } = await createFamilyPair();
      const r = rand();
      const outsider = await registerUser(`out${r}`, 'outsider secure passphrase');

      // User1 creates a category in their family
      await createCategory(user1.token, 'Family A Category');

      // Outsider creates a category in their own family
      await createCategory(outsider.token, 'Family B Category');

      // Outsider should NOT see Family A's category
      const response = await authenticatedGet('/api/v1/categories', outsider.token);
      const names = response.body.map((c: { name: string }) => c.name);
      expect(names).not.toContain('Family A Category');
      expect(names).toContain('Family B Category');
    });
  });

  describe('Removing a member does not delete family data', () => {
    test('family data persists after a member is removed', async () => {
      const { user1, user2 } = await createFamilyPair();

      // Create data as user2
      await createCategory(user2.token, 'Category By Removed User');
      const cat = await createCategory(user2.token, 'Budget Category');
      await createBudget(user2.token, cat.id, '2026-04', 300);

      // Remove user2 from family
      await authenticatedDelete(`/api/v1/family/members/${user2.userId}`, user1.token);

      // User1 should still see all data
      const categoriesRes = await authenticatedGet('/api/v1/categories', user1.token);
      const names = categoriesRes.body.map((c: { name: string }) => c.name);
      expect(names).toContain('Category By Removed User');
      expect(names).toContain('Budget Category');

      const budgetsRes = await authenticatedGet('/api/v1/budgets/month/2026-04', user1.token);
      expect(budgetsRes.body.budgets).toHaveLength(1);
      expect(budgetsRes.body.budgets[0].amount).toBe(300);
    });
  });

  describe('Account owner mappings API', () => {
    test('CRUD operations work for family-scoped mappings', async () => {
      const r = rand();
      const user = await registerUser(`usr${r}`, 'my secure passphrase here');

      // Create
      const createRes = await authenticatedPost('/api/v1/account-owners', user.token, {
        cardIdentifier: '1234',
        displayName: 'Test User',
      });
      expect(createRes.status).toBe(201);
      const mappingId = createRes.body.mapping.id;

      // Read
      const listRes = await authenticatedGet('/api/v1/account-owners', user.token);
      expect(listRes.body.mappings).toHaveLength(1);
      expect(listRes.body.mappings[0].cardIdentifier).toBe('1234');

      // Update
      const updateRes = await authenticatedPost('/api/v1/account-owners', user.token, {
        cardIdentifier: '5678',
        displayName: 'Another User',
      });
      expect(updateRes.status).toBe(201);

      // Delete
      const deleteRes = await authenticatedDelete(`/api/v1/account-owners/${mappingId}`, user.token);
      expect(deleteRes.status).toBe(200);

      // Verify deletion
      const afterDelete = await authenticatedGet('/api/v1/account-owners', user.token);
      expect(afterDelete.body.mappings).toHaveLength(1); // Only the second one remains
    });
  });
});
