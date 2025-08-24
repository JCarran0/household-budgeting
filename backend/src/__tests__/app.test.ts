import request from 'supertest';
import app from '../app';

describe('App', () => {
  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        environment: 'test',
      });
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown endpoints', async () => {
      const response = await request(app)
        .get('/unknown-endpoint')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Endpoint not found',
        path: '/unknown-endpoint',
      });
    });
  });

  describe('Auth Routes', () => {
    it('should have auth endpoints available', async () => {
      // Test that register endpoint exists (will fail validation without body)
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should reject login without credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });
  });
});