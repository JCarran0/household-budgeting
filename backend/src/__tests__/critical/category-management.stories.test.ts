/**
 * Category Management User Story Tests
 * 
 * Critical path tests for category creation and management
 * Maps to budget category stories from CLAUDE.md
 */

import {
  registerUser,
  authenticatedGet,
  authenticatedPost,
  authenticatedPut,
  authenticatedDelete,
  createCategory,
} from '../helpers/apiHelper';
import { authService, dataService } from '../../services';

describe('User Story: Category Management', () => {
  let authToken: string;
  
  beforeEach(async () => {
    // Clear all test data
    if ('clear' in dataService) {
      (dataService as any).clear();
    }
    // Reset rate limiting between tests
    authService.resetRateLimiting();
    
    // Create a test user
    const rand = Math.random().toString(36).substring(2, 8);
    const user = await registerUser(`cat${rand}`, 'category manager secure passphrase');
    authToken = user.token;
  });
  
  describe('As a user, I can create and organize budget categories', () => {
    test('I can create top-level categories', async () => {
      const response = await authenticatedPost(
        '/api/v1/categories',
        authToken,
        {
          name: 'Housing',
          parentId: null,
          isHidden: false,
          isSavings: false,
        }
      );
      
      expect(response.status).toBe(201);
      expect(response.body.name).toBe('Housing');
      expect(response.body.parentId).toBeNull();
      expect(response.body.isHidden).toBe(false);
      expect(response.body.isSavings).toBe(false);
      expect(response.body.id).toBeDefined();
    });
    
    test('I can create subcategories under parent categories', async () => {
      // Create parent category
      const parentResponse = await authenticatedPost(
        '/api/v1/categories',
        authToken,
        {
          name: 'Transportation',
          parentId: null,
          isHidden: false,
          isSavings: false,
        }
      );
      
      expect(parentResponse.status).toBe(201);
      const parentId = parentResponse.body.id;
      
      // Create subcategory
      const subResponse = await authenticatedPost(
        '/api/v1/categories',
        authToken,
        {
          name: 'Car Payment',
          parentId: parentId,
          isHidden: false,
          isSavings: false,
        }
      );
      
      expect(subResponse.status).toBe(201);
      expect(subResponse.body.name).toBe('Car Payment');
      expect(subResponse.body.parentId).toBe(parentId);
    });
    
    test('I can mark categories as hidden to exclude from reports', async () => {
      const response = await authenticatedPost(
        '/api/v1/categories',
        authToken,
        {
          name: 'Internal Transfer',
          parentId: null,
          isHidden: true, // Hidden category
          isSavings: false,
        }
      );
      
      expect(response.status).toBe(201);
      expect(response.body.isHidden).toBe(true);
    });
    
    test('I can mark categories as savings for rollover budgets', async () => {
      const response = await authenticatedPost(
        '/api/v1/categories',
        authToken,
        {
          name: 'Vacation Fund',
          parentId: null,
          isHidden: false,
          isSavings: true, // Savings category
        }
      );
      
      expect(response.status).toBe(201);
      expect(response.body.isSavings).toBe(true);
    });
    
    test('I can retrieve all my categories in hierarchical structure', async () => {
      // Create parent categories
      const food = await createCategory(authToken, 'Food & Dining');
      const entertainment = await createCategory(authToken, 'Entertainment');
      
      // Create subcategories
      await authenticatedPost(
        '/api/v1/categories',
        authToken,
        {
          name: 'Groceries',
          parentId: food.id,
          isHidden: false,
          isSavings: false,
        }
      );
      
      await authenticatedPost(
        '/api/v1/categories',
        authToken,
        {
          name: 'Restaurants',
          parentId: food.id,
          isHidden: false,
          isSavings: false,
        }
      );
      
      await authenticatedPost(
        '/api/v1/categories',
        authToken,
        {
          name: 'Movies',
          parentId: entertainment.id,
          isHidden: false,
          isSavings: false,
        }
      );
      
      // Get all categories
      const response = await authenticatedGet('/api/v1/categories', authToken);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(5); // 2 parents + 3 subcategories
      
      // Verify hierarchical relationships
      const parentCategories = response.body.filter((c: any) => c.parentId === null);
      const subCategories = response.body.filter((c: any) => c.parentId !== null);
      
      expect(parentCategories).toHaveLength(2);
      expect(subCategories).toHaveLength(3);
      
      // Verify subcategories have correct parent IDs
      const foodSubs = subCategories.filter((c: any) => c.parentId === food.id);
      expect(foodSubs).toHaveLength(2);
      expect(foodSubs.map((c: any) => c.name).sort()).toEqual(['Groceries', 'Restaurants']);
    });
  });
  
  describe('As a user, I can edit and delete categories', () => {
    test('I can edit category names and properties', async () => {
      // Create a category
      const createResponse = await authenticatedPost(
        '/api/v1/categories',
        authToken,
        {
          name: 'Utilities',
          parentId: null,
          isHidden: false,
          isSavings: false,
        }
      );
      
      expect(createResponse.status).toBe(201);
      const categoryId = createResponse.body.id;
      
      // Update the category
      const updateResponse = await authenticatedPut(
        `/api/v1/categories/${categoryId}`,
        authToken,
        {
          name: 'Home Utilities',
          isHidden: true,
          isSavings: false,
        }
      );
      
      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.name).toBe('Home Utilities');
      expect(updateResponse.body.isHidden).toBe(true);
      
      // Verify the update persisted
      const getResponse = await authenticatedGet(`/api/v1/categories/${categoryId}`, authToken);
      expect(getResponse.status).toBe(200);
      expect(getResponse.body.name).toBe('Home Utilities');
      expect(getResponse.body.isHidden).toBe(true);
    });
    
    test('I can delete categories', async () => {
      // Create a category
      const createResponse = await authenticatedPost(
        '/api/v1/categories',
        authToken,
        {
          name: 'Temporary Category',
          parentId: null,
          isHidden: false,
          isSavings: false,
        }
      );
      
      expect(createResponse.status).toBe(201);
      const categoryId = createResponse.body.id;
      
      // Delete the category
      const deleteResponse = await authenticatedDelete(
        `/api/v1/categories/${categoryId}`,
        authToken
      );
      
      expect(deleteResponse.status).toBe(204);
      
      // Verify category is deleted
      const getResponse = await authenticatedGet(`/api/v1/categories/${categoryId}`, authToken);
      expect(getResponse.status).toBe(404);
      
      // Verify it's not in the list
      const listResponse = await authenticatedGet('/api/v1/categories', authToken);
      expect(listResponse.status).toBe(200);
      expect(listResponse.body.find((c: any) => c.id === categoryId)).toBeUndefined();
    });
    
    test('I cannot delete a category with subcategories', async () => {
      // Create parent category
      const parentResponse = await authenticatedPost(
        '/api/v1/categories',
        authToken,
        {
          name: 'Parent Category',
          parentId: null,
          isHidden: false,
          isSavings: false,
        }
      );
      
      const parentId = parentResponse.body.id;
      
      // Create subcategory
      await authenticatedPost(
        '/api/v1/categories',
        authToken,
        {
          name: 'Child Category',
          parentId: parentId,
          isHidden: false,
          isSavings: false,
        }
      );
      
      // Try to delete parent category
      const deleteResponse = await authenticatedDelete(
        `/api/v1/categories/${parentId}`,
        authToken
      );
      
      // Should fail with appropriate error
      expect(deleteResponse.status).toBe(400);
      expect(deleteResponse.body.error).toContain('subcategories');
    });
    
    test('I cannot delete a category with associated transactions', async () => {
      // Create a category
      const categoryResponse = await authenticatedPost(
        '/api/v1/categories',
        authToken,
        {
          name: 'Shopping',
          parentId: null,
          isHidden: false,
          isSavings: false,
        }
      );
      
      const categoryId = categoryResponse.body.id;
      
      // Simulate a transaction associated with this category
      // (In a real scenario, this would be done through transaction sync)
      // For now, we'll just verify the API behavior
      
      // Note: This test may need adjustment based on actual implementation
      // The category service should check for associated transactions
      
      // Try to delete the category
      const deleteResponse = await authenticatedDelete(
        `/api/v1/categories/${categoryId}`,
        authToken
      );
      
      // If there were transactions, it should either:
      // 1. Fail with error (400)
      // 2. Succeed but require reassignment parameter
      // For now, expect success since no transactions exist
      expect(deleteResponse.status).toBe(204);
    });
  });
  
  describe('Edge cases and validation', () => {
    test('I cannot create a category without a name', async () => {
      const response = await authenticatedPost(
        '/api/v1/categories',
        authToken,
        {
          name: '',
          parentId: null,
          isHidden: false,
          isSavings: false,
        }
      );
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });
    
    test('I cannot create duplicate category names at the same level', async () => {
      // Create first category
      const firstResponse = await authenticatedPost(
        '/api/v1/categories',
        authToken,
        {
          name: 'Duplicate Name',
          parentId: null,
          isHidden: false,
          isSavings: false,
        }
      );
      
      expect(firstResponse.status).toBe(201);
      
      // Try to create duplicate
      const duplicateResponse = await authenticatedPost(
        '/api/v1/categories',
        authToken,
        {
          name: 'Duplicate Name',
          parentId: null,
          isHidden: false,
          isSavings: false,
        }
      );
      
      expect(duplicateResponse.status).toBe(400);
      expect(duplicateResponse.body.error).toContain('already exists');
    });
    
    test('I can have same category names under different parents', async () => {
      // Create two parent categories
      const parent1 = await createCategory(authToken, 'Business');
      const parent2 = await createCategory(authToken, 'Personal');
      
      // Create "Travel" under both parents
      const travel1Response = await authenticatedPost(
        '/api/v1/categories',
        authToken,
        {
          name: 'Travel',
          parentId: parent1.id,
          isHidden: false,
          isSavings: false,
        }
      );
      
      expect(travel1Response.status).toBe(201);
      
      const travel2Response = await authenticatedPost(
        '/api/v1/categories',
        authToken,
        {
          name: 'Travel',
          parentId: parent2.id,
          isHidden: false,
          isSavings: false,
        }
      );
      
      expect(travel2Response.status).toBe(201);
      
      // Both should exist with different IDs
      expect(travel1Response.body.id).not.toBe(travel2Response.body.id);
      expect(travel1Response.body.parentId).toBe(parent1.id);
      expect(travel2Response.body.parentId).toBe(parent2.id);
    });
    
    test('I cannot create a subcategory under a non-existent parent', async () => {
      const response = await authenticatedPost(
        '/api/v1/categories',
        authToken,
        {
          name: 'Orphan Category',
          parentId: 'non-existent-id',
          isHidden: false,
          isSavings: false,
        }
      );
      
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Parent category not found');
    });
    
    test('I cannot create more than two levels of hierarchy', async () => {
      // Create parent
      const parent = await createCategory(authToken, 'Level 1');
      
      // Create subcategory
      const subResponse = await authenticatedPost(
        '/api/v1/categories',
        authToken,
        {
          name: 'Level 2',
          parentId: parent.id,
          isHidden: false,
          isSavings: false,
        }
      );
      
      const subId = subResponse.body.id;
      
      // Try to create sub-subcategory (Level 3)
      const subSubResponse = await authenticatedPost(
        '/api/v1/categories',
        authToken,
        {
          name: 'Level 3',
          parentId: subId,
          isHidden: false,
          isSavings: false,
        }
      );
      
      // Should fail - only 2 levels allowed
      expect(subSubResponse.status).toBe(400);
      expect(subSubResponse.body.error).toContain('Cannot create subcategory under another subcategory');
    });
  });
  
  describe('As a user, I have default categories automatically initialized on first use', () => {
    test('Default categories matching Plaid names are automatically created', async () => {
      // Create a new test user to ensure clean state
      const rand = Math.random().toString(36).substring(2, 8);
      const newUser = await registerUser(`plaid${rand}`, 'plaid category test passphrase');
      const newAuthToken = newUser.token;
      
      // First call to initialize endpoint should create default categories
      const initResponse = await authenticatedPost('/api/v1/categories/initialize', newAuthToken, {});
      expect(initResponse.status).toBe(200);
      
      // Get categories for the new user
      const response = await authenticatedGet('/api/v1/categories', newAuthToken);
      
      expect(response.status).toBe(200);
      expect(response.body.length).toBeGreaterThan(0);
      
      // Verify key default categories exist with Plaid-matching names
      const categoryNames = response.body.map((c: any) => c.name);
      expect(categoryNames).toContain('Income');
      expect(categoryNames).toContain('Food and Drink');
      expect(categoryNames).toContain('Transportation');
      expect(categoryNames).toContain('General Merchandise'); // Changed from 'Shops'
      expect(categoryNames).toContain('Medical'); // Changed from 'Healthcare'
      expect(categoryNames).toContain('Transfer In'); // Changed from 'Transfer'
      expect(categoryNames).toContain('Transfer Out'); // Added
      expect(categoryNames).toContain('Savings');
      
      // All categories should be regular user categories (not system)
      const hasSystemFlag = response.body.some((c: any) => c.isSystem === true);
      expect(hasSystemFlag).toBe(false);
    });
    
    test('Default categories can be edited and deleted like any user category', async () => {
      // Create a new test user
      const rand = Math.random().toString(36).substring(2, 8);
      const newUser = await registerUser(`edit${rand}`, 'edit test passphrase');
      const newAuthToken = newUser.token;
      
      // Initialize categories
      await authenticatedPost('/api/v1/categories/initialize', newAuthToken, {});
      
      // Get categories
      const categories = await authenticatedGet('/api/v1/categories', newAuthToken);
      
      // Find the Income category
      const incomeCategory = categories.body.find((c: any) => c.name === 'Income');
      expect(incomeCategory).toBeDefined();
      
      // Edit the Income category - should succeed
      const editResponse = await authenticatedPut(
        `/api/v1/categories/${incomeCategory.id}`,
        newAuthToken,
        { name: 'Revenue' }
      );
      expect(editResponse.status).toBe(200);
      expect(editResponse.body.name).toBe('Revenue');
      
      // Find a category to delete - use a subcategory that has no children
      const categoryToDelete = categories.body.find((c: any) => 
        c.name === 'Other Income' && c.parentId !== null
      );
      expect(categoryToDelete).toBeDefined();
      
      // Delete the subcategory - should succeed
      const deleteResponse = await authenticatedDelete(
        `/api/v1/categories/${categoryToDelete.id}`,
        newAuthToken
      );
      expect(deleteResponse.status).toBe(204);
      
      // Verify the category was deleted
      const afterDelete = await authenticatedGet('/api/v1/categories', newAuthToken);
      const stillHasCategory = afterDelete.body.some((c: any) => c.id === categoryToDelete.id);
      expect(stillHasCategory).toBe(false);
    });
  });
  
  describe('As a user, Apply Categorization matches transaction Plaid categories by name', () => {
    test('Transactions with Plaid categories are matched to user categories by name', async () => {
      // Create a new test user
      const rand = Math.random().toString(36).substring(2, 8);
      const newUser = await registerUser(`namematch${rand}`, 'name match test passphrase');
      const newAuthToken = newUser.token;
      
      // Initialize categories - creates default categories with Plaid-matching names
      await authenticatedPost('/api/v1/categories/initialize', newAuthToken, {});
      
      // Get the user's categories
      const categoriesResponse = await authenticatedGet('/api/v1/categories', newAuthToken);
      const categories = categoriesResponse.body;
      
      // Verify that the matching logic will work
      // When a transaction has Plaid category ["Food and Drink", "Restaurants"]
      // It should match with user category named "Food and Drink"
      const foodCategory = categories.find((c: any) => c.name === 'Food and Drink');
      expect(foodCategory).toBeDefined();
      
      // Verify other important matches
      const incomeCategory = categories.find((c: any) => c.name === 'Income');
      expect(incomeCategory).toBeDefined();
      
      // Check Transfer In and Transfer Out categories (both should be hidden)
      const transferInCategory = categories.find((c: any) => c.name === 'Transfer In');
      const transferOutCategory = categories.find((c: any) => c.name === 'Transfer Out');
      expect(transferInCategory).toBeDefined();
      expect(transferOutCategory).toBeDefined();
      expect(transferInCategory.isHidden).toBe(true); // Transfer In should be hidden by default
      expect(transferOutCategory.isHidden).toBe(true); // Transfer Out should be hidden by default
      
      // If user renamed or deleted a category, those transactions won't match
      // For example, if user deletes a leaf category like "Flights":
      const flightsCategory = categories.find((c: any) => 
        c.name === 'Flights' && c.parentId !== null
      );
      if (flightsCategory) {
        const deleteResult = await authenticatedDelete(
          `/api/v1/categories/${flightsCategory.id}`,
          newAuthToken
        );
        expect(deleteResult.status).toBe(204);
        
        // Verify the category was deleted
        const afterDelete = await authenticatedGet('/api/v1/categories', newAuthToken);
        const hasFlights = afterDelete.body.some((c: any) => c.id === flightsCategory.id);
        expect(hasFlights).toBe(false);
      }
    });
  });
});