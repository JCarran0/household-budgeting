import request from 'supertest';
import app from '../../app';
import { categoryService, dataService, authService } from '../../services';
import { registerUser } from '../helpers/apiHelper';

describe('CSV Category Import', () => {
  let authToken: string;
  let userId: string;

  beforeEach(async () => {
    // Clear all test data
    if ('clear' in dataService) {
      (dataService as any).clear();
    }
    // Reset rate limiting between tests
    authService.resetRateLimiting();
    
    // Create a test user and get auth token
    const rand = Math.random().toString(36).substring(2, 8);
    const username = `csv${rand}`;
    const user = await registerUser(username, 'test password for csv import testing 123');
    authToken = user.token;
    userId = user.userId;
  });

  describe('CSV Import Validation', () => {
    it('should reject CSV without required headers', async () => {
      const csvContent = `Name,Type,Description
Groceries,expense,Food and household items`;

      const response = await request(app)
        .post('/api/v1/categories/import-csv')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ csvContent });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Missing required headers');
    });

    it('should reject empty CSV content', async () => {
      const response = await request(app)
        .post('/api/v1/categories/import-csv')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ csvContent: '' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('CSV content is required');
    });

    it('should reject CSV with only headers', async () => {
      const csvContent = `Parent,Child,Type,Hidden,Savings,Description`;

      const response = await request(app)
        .post('/api/v1/categories/import-csv')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ csvContent });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('CSV file must have a header row and at least one data row');
    });
  });

  describe('Successful CSV Import', () => {
    it('should import categories with parent-child relationships', async () => {
      const csvContent = `Parent,Child,Type,Hidden,Savings,Description
Entertainment,Movies,,No,No,Cinema and streaming services
Entertainment,Games,,No,No,Video games and gaming
Savings,Emergency Fund,,No,Yes,Emergency savings fund
,Groceries,,No,No,Food and household items`;

      const response = await request(app)
        .post('/api/v1/categories/import-csv')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ csvContent });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.importedCount).toBe(6); // 2 parents + 4 children

      // Verify categories were created
      const categories = await categoryService.getAllCategories(userId);
      
      // Check that parent categories were created
      const entertainment = categories.find(c => c.name === 'Entertainment' && !c.parentId);
      const savings = categories.find(c => c.name === 'Savings' && !c.parentId);
      const groceries = categories.find(c => c.name === 'Groceries' && !c.parentId);
      
      expect(entertainment).toBeDefined();
      expect(savings).toBeDefined();
      expect(groceries).toBeDefined();

      // Check child categories
      const movies = categories.find(c => c.name === 'Movies' && c.parentId === entertainment?.id);
      const games = categories.find(c => c.name === 'Games' && c.parentId === entertainment?.id);
      const emergencyFund = categories.find(c => c.name === 'Emergency Fund' && c.parentId === savings?.id);

      expect(movies).toBeDefined();
      expect(movies?.description).toBe('Cinema and streaming services');
      expect(games).toBeDefined();
      expect(emergencyFund).toBeDefined();
      expect(emergencyFund?.isSavings).toBe(true);
    });

    it('should auto-create parent categories when they do not exist', async () => {
      const csvContent = `Parent,Child,Type,Hidden,Savings,Description
Travel,Flights,,No,No,Air travel expenses
Travel,Hotels,,No,No,Accommodation expenses`;

      const response = await request(app)
        .post('/api/v1/categories/import-csv')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ csvContent });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.importedCount).toBe(3); // 1 parent + 2 children

      const categories = await categoryService.getAllCategories(userId);
      const travel = categories.find(c => c.name === 'Travel' && !c.parentId);
      
      expect(travel).toBeDefined();
      expect(travel?.isCustom).toBe(true);
    });

    it('should handle boolean values correctly', async () => {
      const csvContent = `Parent,Child,Type,Hidden,Savings,Description
,Hidden Category,,yes,no,This should be hidden
,Savings Category,,no,true,This is for savings
,Normal Category,,false,false,Regular category`;

      const response = await request(app)
        .post('/api/v1/categories/import-csv')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ csvContent });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const categories = await categoryService.getAllCategories(userId);
      
      const hidden = categories.find(c => c.name === 'Hidden Category');
      const savings = categories.find(c => c.name === 'Savings Category');
      const normal = categories.find(c => c.name === 'Normal Category');

      expect(hidden?.isHidden).toBe(true);
      expect(hidden?.isSavings).toBe(false);
      
      expect(savings?.isHidden).toBe(false);
      expect(savings?.isSavings).toBe(true);
      
      expect(normal?.isHidden).toBe(false);
      expect(normal?.isSavings).toBe(false);
    });

    it('should skip duplicate categories and report errors', async () => {
      // First import
      await request(app)
        .post('/api/v1/categories/import-csv')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          csvContent: `Parent,Child,Type,Hidden,Savings,Description
,Test Category,,No,No,First import`
        });

      // Try to import the same category again
      const response = await request(app)
        .post('/api/v1/categories/import-csv')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          csvContent: `Parent,Child,Type,Hidden,Savings,Description
,Test Category,,No,No,Duplicate import
,New Category,,No,No,This should work`
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.importedCount).toBe(1); // Only new category
      expect(response.body.errors).toContain('Category "Test Category" already exists');
    });

    it('should handle CSV with quoted values and commas', async () => {
      const csvContent = `Parent,Child,Type,Hidden,Savings,Description
"Utilities","Electric, Gas & Water",,No,No,"Monthly utility bills, including electricity, gas, and water"
"Utilities","Internet & Phone",,No,No,"Internet, phone, and communication services"`;

      const response = await request(app)
        .post('/api/v1/categories/import-csv')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ csvContent });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      const categories = await categoryService.getAllCategories(userId);
      const utilities = categories.find(c => c.name === 'Utilities' && !c.parentId);
      const electricGasWater = categories.find(c => c.name === 'Electric, Gas & Water');
      
      expect(utilities).toBeDefined();
      expect(electricGasWater).toBeDefined();
      expect(electricGasWater?.description).toContain('electricity, gas, and water');
    });
  });

  describe('Error Handling', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/categories/import-csv')
        .send({
          csvContent: `Parent,Child,Type,Hidden,Savings,Description
,Test,,No,No,Test`
        });

      expect(response.status).toBe(401);
    });

    it('should handle malformed CSV gracefully', async () => {
      const csvContent = `Parent,Child,Type,Hidden,Savings,Description
Entertainment,Movies,No,No,"Missing closing quote
Entertainment,Games,,No,No,Valid row`;

      const response = await request(app)
        .post('/api/v1/categories/import-csv')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ csvContent });

      // Should still import valid rows
      expect(response.status).toBe(200);
      expect(response.body.importedCount).toBeGreaterThan(0);
    });
  });
});