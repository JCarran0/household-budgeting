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

  describe('Security headers (TD-004)', () => {
    it('emits a strict default-src none CSP on JSON responses', async () => {
      const response = await request(app).get('/health').expect(200);
      const csp = response.headers['content-security-policy'];
      expect(csp).toBeDefined();
      expect(csp).toMatch(/default-src 'none'/);
      expect(csp).toMatch(/frame-ancestors 'none'/);
      expect(csp).toMatch(/base-uri 'none'/);
    });

    it('keeps the nosniff and frame-deny headers', async () => {
      const response = await request(app).get('/health').expect(200);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    });

    it('keeps HSTS turned on', async () => {
      const response = await request(app).get('/health').expect(200);
      expect(response.headers['strict-transport-security']).toMatch(
        /max-age=31536000/,
      );
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