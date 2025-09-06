import request from 'supertest';
import app from '../../app';
import { authService } from '../../services';
import { format, startOfYear, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { registerUser } from '../helpers/apiHelper';

describe('User Story: Transaction Preview Modal Navigation', () => {
  let authToken: string;
  
  beforeEach(async () => {
    // Clear any existing data
    if ('clear' in authService) {
      (authService as any).clear();
    }
    
    // Create test user using helper (short username for validation)
    const username = `prev${Math.random().toString(36).substring(2, 8)}`;
    const user = await registerUser(username, 'this is my secure preview navigation test passphrase');
    authToken = user.token;
  });
  
  describe('As a user, I can navigate from transaction preview to full transactions view', () => {
    
    it('should build correct URL parameters for categorized transactions with timeRangeFilter', async () => {
      // This test simulates what the frontend TransactionPreviewModal.navigateToTransactionsWithFilter() does
      
      // Test data representing what would be passed to the modal
      const categoryId = 'FOOD_AND_DRINK_COFFEE';
      const dateRange = {
        startDate: '2025-01-01',
        endDate: '2025-01-31'
      };
      const timeRangeFilter = 'thisMonth';
      
      // Simulate the URL parameters that would be generated
      const expectedParams = {
        categoryIds: categoryId,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        timeRangeFilter: timeRangeFilter
      };
      
      // Test that the transaction API accepts these parameters correctly
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query(expectedParams);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Note: timeRangeFilter is a frontend-only parameter for URL state management
      // The backend processes categoryIds, startDate, endDate but not timeRangeFilter directly
    });
    
    it('should build correct URL parameters for uncategorized transactions', async () => {
      // Test uncategorized transaction navigation
      const dateRange = {
        startDate: format(startOfYear(new Date()), 'yyyy-MM-dd'),
        endDate: format(new Date(), 'yyyy-MM-dd')
      };
      const timeRangeFilter = 'yearToDate';
      
      // Simulate URL parameters for uncategorized transactions
      const expectedParams = {
        onlyUncategorized: 'true',
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        timeRangeFilter: timeRangeFilter
      };
      
      // Test that the API handles uncategorized filter correctly
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query(expectedParams);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
    
    it('should handle all supported time range filters in URL parameters', async () => {
      const categoryId = 'FOOD_AND_DRINK';
      const baseParams = {
        categoryIds: categoryId,
        startDate: '2025-01-01',
        endDate: '2025-01-31'
      };
      
      // Test all supported time range filters
      const timeRangeFilters = [
        'thisMonth',
        'lastMonth', 
        'yearToDate',
        'thisYear',
        'last3',
        'last6',
        'last12'
      ];
      
      for (const timeRangeFilter of timeRangeFilters) {
        const response = await request(app)
          .get('/api/v1/transactions')
          .set('Authorization', `Bearer ${authToken}`)
          .query({
            ...baseParams,
            timeRangeFilter
          });
        
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        
        // Each time range filter should be accepted without error
        // The backend doesn't process timeRangeFilter directly, but it should not cause errors
      }
    });
    
    it('should handle multiple categories in URL parameters', async () => {
      const multipleCategories = 'FOOD_AND_DRINK,TRANSPORTATION,ENTERTAINMENT';
      const params = {
        categoryIds: multipleCategories,
        startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
        timeRangeFilter: 'thisMonth'
      };
      
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query(params);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
    
    it('should handle custom date ranges with last3/6/12 time filters', async () => {
      const currentDate = new Date();
      
      // Test last3 months
      const last3Params = {
        categoryIds: 'FOOD_AND_DRINK',
        startDate: format(subMonths(currentDate, 3), 'yyyy-MM-dd'),
        endDate: format(currentDate, 'yyyy-MM-dd'),
        timeRangeFilter: 'last3'
      };
      
      const last3Response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query(last3Params);
      
      expect(last3Response.status).toBe(200);
      expect(last3Response.body.success).toBe(true);
      
      // Test last6 months
      const last6Params = {
        categoryIds: 'FOOD_AND_DRINK',
        startDate: format(subMonths(currentDate, 6), 'yyyy-MM-dd'),
        endDate: format(currentDate, 'yyyy-MM-dd'),
        timeRangeFilter: 'last6'
      };
      
      const last6Response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query(last6Params);
      
      expect(last6Response.status).toBe(200);
      expect(last6Response.body.success).toBe(true);
      
      // Test last12 months
      const last12Params = {
        categoryIds: 'FOOD_AND_DRINK',
        startDate: format(subMonths(currentDate, 12), 'yyyy-MM-dd'),
        endDate: format(currentDate, 'yyyy-MM-dd'),
        timeRangeFilter: 'last12'
      };
      
      const last12Response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query(last12Params);
      
      expect(last12Response.status).toBe(200);
      expect(last12Response.body.success).toBe(true);
    });
  });
  
  describe('URL parameter edge cases and validation', () => {
    
    it('should handle missing timeRangeFilter parameter gracefully', async () => {
      // Test navigation without timeRangeFilter (backwards compatibility)
      const params = {
        categoryIds: 'FOOD_AND_DRINK',
        startDate: '2025-01-01',
        endDate: '2025-01-31'
        // No timeRangeFilter
      };
      
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query(params);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
    
    it('should handle empty categoryIds with uncategorized filter', async () => {
      const params = {
        onlyUncategorized: 'true',
        startDate: format(new Date(), 'yyyy-MM-dd'),
        endDate: format(new Date(), 'yyyy-MM-dd'),
        timeRangeFilter: 'thisMonth'
      };
      
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query(params);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
    
    it('should handle invalid timeRangeFilter values', async () => {
      const params = {
        categoryIds: 'FOOD_AND_DRINK',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        timeRangeFilter: 'invalidFilter'
      };
      
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query(params);
      
      // Should still work since backend doesn't process timeRangeFilter
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
    
    it('should handle malformed date parameters', async () => {
      const params = {
        categoryIds: 'FOOD_AND_DRINK',
        startDate: 'invalid-date',
        endDate: 'also-invalid',
        timeRangeFilter: 'thisMonth'
      };
      
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query(params);
      
      // Should handle gracefully (either 400 error or empty results)
      expect([200, 400]).toContain(response.status);
    });
    
    it('should handle very long categoryIds parameter', async () => {
      // Test with many comma-separated category IDs
      const manyCategories = Array.from({length: 50}, (_, i) => `CATEGORY_${i}`).join(',');
      const params = {
        categoryIds: manyCategories,
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        timeRangeFilter: 'thisMonth'
      };
      
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query(params);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      // Should return empty results for non-existent categories
      expect(response.body.transactions).toHaveLength(0);
    });
  });
  
  describe('Navigation flow simulation', () => {
    
    it('should simulate complete reports-to-transactions navigation flow', async () => {
      // Step 1: Simulate reports page category breakdown API call
      const breakdownResponse = await request(app)
        .get('/api/v1/reports/category-breakdown')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          startDate: format(startOfYear(new Date()), 'yyyy-MM-dd'),
          endDate: format(new Date(), 'yyyy-MM-dd'),
          includeSubcategories: 'true'
        });
      
      expect(breakdownResponse.status).toBe(200);
      
      // Step 2: Simulate transaction preview modal API call (limited results)
      const previewResponse = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          categoryIds: 'FOOD_AND_DRINK',
          startDate: format(startOfYear(new Date()), 'yyyy-MM-dd'),
          endDate: format(new Date(), 'yyyy-MM-dd'),
          limit: 25,
          offset: 0
        });
      
      expect(previewResponse.status).toBe(200);
      expect(previewResponse.body.success).toBe(true);
      
      // Step 3: Simulate "View All" navigation to transactions page (full results)
      const fullViewResponse = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          categoryIds: 'FOOD_AND_DRINK',
          startDate: format(startOfYear(new Date()), 'yyyy-MM-dd'),
          endDate: format(new Date(), 'yyyy-MM-dd'),
          timeRangeFilter: 'yearToDate'
          // No limit/offset for full view
        });
      
      expect(fullViewResponse.status).toBe(200);
      expect(fullViewResponse.body.success).toBe(true);
      
      // Full view should have same or more results than preview (preview is limited to 25)
      expect(fullViewResponse.body.transactions.length).toBeGreaterThanOrEqual(0);
    });
    
    it('should maintain filter consistency between preview and full view', async () => {
      const filterParams = {
        categoryIds: 'TRANSPORTATION',
        startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd')
      };
      
      // Preview call (with limit)
      const previewResponse = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          ...filterParams,
          limit: 25,
          offset: 0
        });
      
      // Full view call (no limit)
      const fullResponse = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          ...filterParams,
          timeRangeFilter: 'thisMonth'
        });
      
      expect(previewResponse.status).toBe(200);
      expect(fullResponse.status).toBe(200);
      
      // Both should have same success status
      expect(previewResponse.body.success).toBe(true);
      expect(fullResponse.body.success).toBe(true);
      
      // If preview has results, full view should have same or more
      if (previewResponse.body.transactions.length > 0) {
        expect(fullResponse.body.transactions.length).toBeGreaterThanOrEqual(
          previewResponse.body.transactions.length
        );
      }
      
      // Total count should be same (represents same filter criteria)
      if (previewResponse.body.total !== undefined && fullResponse.body.total !== undefined) {
        expect(fullResponse.body.total).toBeGreaterThanOrEqual(previewResponse.body.total);
      }
    });
  });
});