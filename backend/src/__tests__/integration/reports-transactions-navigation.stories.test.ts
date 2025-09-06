import request from 'supertest';
import app from '../../app';
import { authService } from '../../services';
import { format, startOfYear, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { registerUser } from '../helpers/apiHelper';

describe('User Story: Reports to Transactions Navigation with Filter Synchronization', () => {
  let authToken: string;
  let testCategoryId: string;
  
  beforeEach(async () => {
    // Clear any existing data
    if ('clear' in authService) {
      (authService as any).clear();
    }
    
    // Create test user using helper (short username for validation)
    const username = `nav${Math.random().toString(36).substring(2, 8)}`;
    const user = await registerUser(username, 'this is my secure navigation filters test passphrase');
    authToken = user.token;
    
    // Initialize categories
    await request(app)
      .post('/api/v1/categories/initialize')
      .set('Authorization', `Bearer ${authToken}`);
    
    // Get a test category ID
    const categoriesResponse = await request(app)
      .get('/api/v1/categories')
      .set('Authorization', `Bearer ${authToken}`);
    
    const categories = categoriesResponse.body;
    testCategoryId = categories.find((c: any) => c.name === 'Groceries')?.id || categories[0]?.id;
    expect(testCategoryId).toBeDefined();
  });
  
  describe('As a user, I can navigate from Reports to Transactions with preserved filters', () => {
    
    it('should accept "Year to Date" filter parameters when navigating from reports', async () => {
      // Simulate reports page request with "Year to Date" filter
      const yearStart = startOfYear(new Date());
      const currentDate = new Date();
      const yearToDateStart = format(yearStart, 'yyyy-MM-dd');
      const yearToDateEnd = format(currentDate, 'yyyy-MM-dd');
      
      // Test the transaction preview API call (simulates modal opening)
      const previewResponse = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          categoryIds: testCategoryId,
          startDate: yearToDateStart,
          endDate: yearToDateEnd,
          limit: 25,
          offset: 0
        });
      
      expect(previewResponse.status).toBe(200);
      expect(previewResponse.body.success).toBe(true);
      expect(previewResponse.body.transactions).toBeDefined();
      expect(Array.isArray(previewResponse.body.transactions)).toBe(true);
      
      // Test transactions page navigation with timeRangeFilter parameter
      const transactionsResponse = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          categoryIds: testCategoryId,
          startDate: yearToDateStart,
          endDate: yearToDateEnd,
          // Frontend includes timeRangeFilter for state management (not processed by backend)
          timeRangeFilter: 'yearToDate'
        });
      
      expect(transactionsResponse.status).toBe(200);
      expect(transactionsResponse.body.success).toBe(true);
      expect(transactionsResponse.body.transactions).toBeDefined();
      expect(Array.isArray(transactionsResponse.body.transactions)).toBe(true);
    });
    
    it('should accept "This Month" filter parameters when navigating from reports', async () => {
      // Simulate "This Month" filter from reports
      const currentMonth = new Date();
      const thisMonthStart = startOfMonth(currentMonth);
      const thisMonthEnd = endOfMonth(currentMonth);
      const thisMonthStartStr = format(thisMonthStart, 'yyyy-MM-dd');
      const thisMonthEndStr = format(thisMonthEnd, 'yyyy-MM-dd');
      
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          categoryIds: testCategoryId,
          startDate: thisMonthStartStr,
          endDate: thisMonthEndStr,
          timeRangeFilter: 'thisMonth'
        });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.transactions).toBeDefined();
      expect(Array.isArray(response.body.transactions)).toBe(true);
      
      // Verify the API accepts the date range parameters correctly
      expect(response.body.total).toBeDefined();
      expect(typeof response.body.total).toBe('number');
    });
    
    it('should accept uncategorized filter for uncategorized transactions', async () => {
      // Test uncategorized filter navigation
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          onlyUncategorized: 'true',
          startDate: format(new Date(), 'yyyy-MM-dd'),
          endDate: format(new Date(), 'yyyy-MM-dd'),
          timeRangeFilter: 'thisMonth'
        });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.transactions).toBeDefined();
      expect(Array.isArray(response.body.transactions)).toBe(true);
    });
    
    it('should handle custom date ranges from reports with last3/last6/last12 filters', async () => {
      // Test "last3" months filter (simulating reports page "Last 3 Months")
      const currentDate = new Date();
      const last3MonthsStart = format(subMonths(currentDate, 3), 'yyyy-MM-dd');
      const last3MonthsEnd = format(currentDate, 'yyyy-MM-dd');
      
      const last3Response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          categoryIds: testCategoryId,
          startDate: last3MonthsStart,
          endDate: last3MonthsEnd,
          timeRangeFilter: 'last3'
        });
      
      expect(last3Response.status).toBe(200);
      expect(last3Response.body.success).toBe(true);
      expect(last3Response.body.transactions).toBeDefined();
      expect(Array.isArray(last3Response.body.transactions)).toBe(true);
      
      // Test "last6" months filter
      const last6MonthsStart = format(subMonths(currentDate, 6), 'yyyy-MM-dd');
      const last6MonthsEnd = format(currentDate, 'yyyy-MM-dd');
      
      const last6Response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          categoryIds: testCategoryId,
          startDate: last6MonthsStart,
          endDate: last6MonthsEnd,
          timeRangeFilter: 'last6'
        });
      
      expect(last6Response.status).toBe(200);
      expect(last6Response.body.success).toBe(true);
      expect(last6Response.body.transactions).toBeDefined();
      expect(Array.isArray(last6Response.body.transactions)).toBe(true);
    });
    
    it('should handle multiple category filters from reports breakdown', async () => {
      // Get another test category
      const categoriesResponse = await request(app)
        .get('/api/v1/categories')
        .set('Authorization', `Bearer ${authToken}`);
      
      const categories = categoriesResponse.body;
      const secondCategoryId = categories.find((c: any) => c.name === 'Transportation' || c.id !== testCategoryId)?.id;
      
      if (secondCategoryId) {
        // Test multiple category filter (simulates reports drill-down with multiple selected categories)
        const response = await request(app)
          .get('/api/v1/transactions')
          .set('Authorization', `Bearer ${authToken}`)
          .query({
            categoryIds: `${testCategoryId},${secondCategoryId}`,
            startDate: format(new Date(), 'yyyy-MM-dd'),
            endDate: format(new Date(), 'yyyy-MM-dd'),
            timeRangeFilter: 'thisMonth'
          });
        
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.transactions).toBeDefined();
        expect(Array.isArray(response.body.transactions)).toBe(true);
      }
    });
  });
  
  describe('Filter parameter validation and edge cases', () => {
    
    it('should handle invalid category IDs gracefully', async () => {
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          categoryIds: 'INVALID_CATEGORY_ID',
          startDate: format(new Date(), 'yyyy-MM-dd'),
          endDate: format(new Date(), 'yyyy-MM-dd'),
          timeRangeFilter: 'thisMonth'
        });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.transactions).toBeDefined();
      expect(Array.isArray(response.body.transactions)).toBe(true);
      expect(response.body.total).toBe(0);
    });
    
    it('should handle invalid date ranges gracefully', async () => {
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          categoryIds: testCategoryId,
          startDate: 'invalid-date',
          endDate: 'invalid-date',
          timeRangeFilter: 'thisMonth'
        });
      
      // Should return error or handle gracefully
      expect([200, 400]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.transactions).toBeDefined();
        expect(Array.isArray(response.body.transactions)).toBe(true);
      }
    });
    
    it('should handle empty category filter with timeRangeFilter', async () => {
      // Test with no category filter but with timeRangeFilter (should return all transactions)
      const response = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          startDate: format(new Date(), 'yyyy-MM-dd'),
          endDate: format(new Date(), 'yyyy-MM-dd'),
          timeRangeFilter: 'thisMonth'
        });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.transactions).toBeDefined();
      expect(Array.isArray(response.body.transactions)).toBe(true);
    });
    
    it('should accept all supported timeRangeFilter values', async () => {
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
            categoryIds: testCategoryId,
            startDate: '2025-01-01',
            endDate: '2025-01-31',
            timeRangeFilter
          });
        
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        // Backend should accept timeRangeFilter parameter without error
        expect(response.body.transactions).toBeDefined();
        expect(Array.isArray(response.body.transactions)).toBe(true);
      }
    });
  });
});