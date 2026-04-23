import request from 'supertest';
import app from '../../app';
import { categoryService, dataService, authService } from '../../services';
import { registerUser } from '../helpers/apiHelper';

describe('CSV Category Import', () => {
  let authToken: string;
  let familyId: string;

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
    familyId = user.familyId;
  });

  describe('CSV Import Validation', () => {
    it('should reject CSV without required headers', async () => {
      // The required column is "Child" (category name). A CSV without it
      // fails the header validation, and importService wraps the parse failure.
      const csvContent = `Name,Type,Description
Groceries,expense,Food and household items`;

      const response = await request(app)
        .post('/api/v1/categories/import-csv')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ csvContent });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      // The ImportService wraps parse failures under a single message
      expect(response.body.message).toBeTruthy();
    });

    it('should reject empty CSV content', async () => {
      const response = await request(app)
        .post('/api/v1/categories/import-csv')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ csvContent: '' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('CSV content is required');
    });

    it('should succeed but import 0 categories when CSV has only headers', async () => {
      // Headers-only CSV parses successfully but produces no data rows.
      // The ImportService returns success with importedCount=0.
      const csvContent = `Parent,Child,Type,Hidden,Rollover,Description`;

      const response = await request(app)
        .post('/api/v1/categories/import-csv')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ csvContent });

      expect(response.status).toBe(200);
      expect(response.body.importedCount).toBe(0);
    });
  });

  describe('Successful CSV Import', () => {
    it('should import categories with parent-child relationships', async () => {
      // Column 5 is "Rollover" (renamed from "Savings" in earlier format)
      const csvContent = `Parent,Child,Type,Hidden,Rollover,Description
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
      const categories = await categoryService.getAllCategories(familyId);

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
      expect(emergencyFund?.isRollover).toBe(true);
    });

    it('should auto-create parent categories when they do not exist', async () => {
      const csvContent = `Parent,Child,Type,Hidden,Rollover,Description
Travel,Flights,,No,No,Air travel expenses
Travel,Hotels,,No,No,Accommodation expenses`;

      const response = await request(app)
        .post('/api/v1/categories/import-csv')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ csvContent });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.importedCount).toBe(3); // 1 parent + 2 children

      const categories = await categoryService.getAllCategories(familyId);
      const travel = categories.find(c => c.name === 'Travel' && !c.parentId);

      expect(travel).toBeDefined();
      expect(travel?.isCustom).toBe(true);
    });

    it('should handle boolean values correctly', async () => {
      const csvContent = `Parent,Child,Type,Hidden,Rollover,Description
,Hidden Category,,yes,no,This should be hidden
,Rollover Category,,no,true,This is a rollover category
,Normal Category,,false,false,Regular category`;

      const response = await request(app)
        .post('/api/v1/categories/import-csv')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ csvContent });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const categories = await categoryService.getAllCategories(familyId);

      const hidden = categories.find(c => c.name === 'Hidden Category');
      const rollover = categories.find(c => c.name === 'Rollover Category');
      const normal = categories.find(c => c.name === 'Normal Category');

      expect(hidden?.isHidden).toBe(true);
      expect(hidden?.isRollover).toBe(false);

      expect(rollover?.isHidden).toBe(false);
      expect(rollover?.isRollover).toBe(true);

      expect(normal?.isHidden).toBe(false);
      expect(normal?.isRollover).toBe(false);
    });

    it('should skip duplicate categories and report them in errors', async () => {
      // First import
      await request(app)
        .post('/api/v1/categories/import-csv')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          csvContent: `Parent,Child,Type,Hidden,Rollover,Description
,Test Category,,No,No,First import`
        });

      // Try to import the same category again alongside a new one
      const response = await request(app)
        .post('/api/v1/categories/import-csv')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          csvContent: `Parent,Child,Type,Hidden,Rollover,Description
,Test Category,,No,No,Duplicate import
,New Category,,No,No,This should work`
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.importedCount).toBe(1); // Only new category
    });

    it('should handle CSV with quoted values and commas', async () => {
      const csvContent = `Parent,Child,Type,Hidden,Rollover,Description
"Utilities","Electric, Gas & Water",,No,No,"Monthly utility bills, including electricity, gas, and water"
"Utilities","Internet & Phone",,No,No,"Internet, phone, and communication services"`;

      const response = await request(app)
        .post('/api/v1/categories/import-csv')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ csvContent });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const categories = await categoryService.getAllCategories(familyId);
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
          csvContent: `Parent,Child,Type,Hidden,Rollover,Description
,Test,,No,No,Test`
        });

      expect(response.status).toBe(401);
    });

    it('should handle malformed CSV gracefully', async () => {
      // An unclosed quote causes subsequent rows to be absorbed into the quoted
      // field, which may result in 0 importable rows (not an error — just skips
      // the malformed section). The response should be a 200 (not a 500).
      const csvContent = `Parent,Child,Type,Hidden,Rollover,Description
Entertainment,Movies,No,No,"Missing closing quote
Entertainment,Games,,No,No,Valid row`;

      const response = await request(app)
        .post('/api/v1/categories/import-csv')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ csvContent });

      // Malformed CSV may succeed with 0 rows or fail with a 400 — either is acceptable.
      // What must NOT happen is a 500 Internal Server Error.
      expect(response.status).not.toBe(500);
    });
  });
});
