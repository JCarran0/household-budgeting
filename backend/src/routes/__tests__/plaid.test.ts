import request from 'supertest';
import express from 'express';
import { PlaidService } from '../../services/plaidService';
import plaidRouter from '../plaid';
import { authMiddleware } from '../../middleware/authMiddleware';

// Mock dependencies
jest.mock('../../services/plaidService');
jest.mock('../../middleware/authMiddleware');

describe('Plaid Routes', () => {
  let app: express.Application;
  let mockPlaidService: jest.Mocked<PlaidService>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create Express app with plaid routes
    app = express();
    app.use(express.json());
    
    // Mock auth middleware to always pass
    (authMiddleware as jest.Mock).mockImplementation((_req: any, _res: any, next: any) => {
      _req.user = { userId: 'test-user-id', username: 'testuser' };
      next();
    });

    // Mock PlaidService
    mockPlaidService = new PlaidService() as jest.Mocked<PlaidService>;
    
    // Apply routes
    app.use('/api/v1/plaid', plaidRouter);
  });

  describe('POST /api/v1/plaid/link-token', () => {
    it('should create a link token for authenticated user', async () => {
      const mockLinkToken = 'link-sandbox-123456';
      const mockExpiration = '2025-01-15T12:00:00Z';
      
      mockPlaidService.createLinkToken = jest.fn().mockResolvedValue({
        success: true,
        linkToken: mockLinkToken,
        expiration: mockExpiration,
      });

      // Mock PlaidService constructor
      (PlaidService as jest.Mock).mockImplementation(() => mockPlaidService);

      const response = await request(app)
        .post('/api/v1/plaid/link-token')
        .expect(200);

      expect(response.body).toEqual({
        linkToken: mockLinkToken,
        expiration: mockExpiration,
      });

      expect(mockPlaidService.createLinkToken).toHaveBeenCalledWith('test-user-id');
    });

    it('should handle errors when creating link token', async () => {
      mockPlaidService.createLinkToken = jest.fn().mockResolvedValue({
        success: false,
        error: 'Invalid configuration',
      });

      (PlaidService as jest.Mock).mockImplementation(() => mockPlaidService);

      const response = await request(app)
        .post('/api/v1/plaid/link-token')
        .expect(500);

      expect(response.body).toEqual({
        error: 'Invalid configuration',
      });
    });

    it('should require authentication', async () => {
      // Mock auth middleware to fail
      (authMiddleware as jest.Mock).mockImplementation((_req: any, res: any) => {
        res.status(401).json({ error: 'Unauthorized' });
      });

      const response = await request(app)
        .post('/api/v1/plaid/link-token')
        .expect(401);

      expect(response.body).toEqual({
        error: 'Unauthorized',
      });
    });
  });

  describe('POST /api/v1/plaid/exchange-token', () => {
    it('should exchange public token for access token', async () => {
      const mockPublicToken = 'public-sandbox-123456';
      const mockAccessToken = 'access-sandbox-789012';
      const mockItemId = 'item-123';

      mockPlaidService.exchangePublicToken = jest.fn().mockResolvedValue({
        success: true,
        accessToken: mockAccessToken,
        itemId: mockItemId,
      });

      (PlaidService as jest.Mock).mockImplementation(() => mockPlaidService);

      const response = await request(app)
        .post('/api/v1/plaid/exchange-token')
        .send({ publicToken: mockPublicToken })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        itemId: mockItemId,
      });

      expect(mockPlaidService.exchangePublicToken).toHaveBeenCalledWith(mockPublicToken);
    });

    it('should validate public token is provided', async () => {
      const response = await request(app)
        .post('/api/v1/plaid/exchange-token')
        .send({})
        .expect(400);

      expect(response.body).toEqual({
        error: 'Public token is required',
      });
    });

    it('should handle errors during token exchange', async () => {
      mockPlaidService.exchangePublicToken = jest.fn().mockResolvedValue({
        success: false,
        error: 'Invalid public token',
      });

      (PlaidService as jest.Mock).mockImplementation(() => mockPlaidService);

      const response = await request(app)
        .post('/api/v1/plaid/exchange-token')
        .send({ publicToken: 'invalid-token' })
        .expect(500);

      expect(response.body).toEqual({
        error: 'Invalid public token',
      });
    });
  });

  describe('GET /api/v1/plaid/accounts', () => {
    it('should fetch accounts for authenticated user', async () => {
      const mockAccounts = [
        {
          id: 'account-1',
          plaidAccountId: 'account-1',
          name: 'Checking',
          type: 'checking',
          currentBalance: 1000,
        },
      ];

      mockPlaidService.getAccounts = jest.fn().mockResolvedValue({
        success: true,
        accounts: mockAccounts,
        itemId: 'item-123',
      });

      (PlaidService as jest.Mock).mockImplementation(() => mockPlaidService);

      // Note: In a real implementation, we'd fetch the access token from user data
      const response = await request(app)
        .get('/api/v1/plaid/accounts')
        .query({ itemId: 'item-123' })
        .expect(200);

      expect(response.body).toEqual({
        accounts: mockAccounts,
        itemId: 'item-123',
      });
    });

    it('should handle errors when fetching accounts', async () => {
      mockPlaidService.getAccounts = jest.fn().mockResolvedValue({
        success: false,
        error: 'Item login required',
        requiresReauth: true,
      });

      (PlaidService as jest.Mock).mockImplementation(() => mockPlaidService);

      const response = await request(app)
        .get('/api/v1/plaid/accounts')
        .query({ itemId: 'item-123' })
        .expect(401);

      expect(response.body).toEqual({
        error: 'Item login required',
        requiresReauth: true,
      });
    });
  });

  describe('GET /api/v1/plaid/transactions', () => {
    it('should fetch transactions for date range', async () => {
      const mockTransactions = [
        {
          id: 'txn-1',
          amount: 50.00,
          date: '2025-01-15',
          name: 'Coffee Shop',
        },
      ];

      mockPlaidService.getTransactions = jest.fn().mockResolvedValue({
        success: true,
        transactions: mockTransactions,
        totalTransactions: 1,
        hasMore: false,
      });

      (PlaidService as jest.Mock).mockImplementation(() => mockPlaidService);

      const response = await request(app)
        .get('/api/v1/plaid/transactions')
        .query({
          itemId: 'item-123',
          startDate: '2025-01-01',
          endDate: '2025-01-31',
        })
        .expect(200);

      expect(response.body).toEqual({
        transactions: mockTransactions,
        totalTransactions: 1,
        hasMore: false,
      });
    });

    it('should validate required query parameters', async () => {
      const response = await request(app)
        .get('/api/v1/plaid/transactions')
        .expect(400);

      expect(response.body).toEqual({
        error: 'itemId, startDate, and endDate are required',
      });
    });

    it('should handle transaction fetch errors', async () => {
      mockPlaidService.getTransactions = jest.fn().mockResolvedValue({
        success: false,
        error: 'Unable to fetch transactions',
      });

      (PlaidService as jest.Mock).mockImplementation(() => mockPlaidService);

      const response = await request(app)
        .get('/api/v1/plaid/transactions')
        .query({
          itemId: 'item-123',
          startDate: '2025-01-01',
          endDate: '2025-01-31',
        })
        .expect(500);

      expect(response.body).toEqual({
        error: 'Unable to fetch transactions',
      });
    });
  });

  describe('POST /api/v1/plaid/item/remove', () => {
    it('should remove an item (disconnect bank account)', async () => {
      mockPlaidService.removeItem = jest.fn().mockResolvedValue({
        success: true,
        message: 'Item removed successfully',
      });

      (PlaidService as jest.Mock).mockImplementation(() => mockPlaidService);

      const response = await request(app)
        .post('/api/v1/plaid/item/remove')
        .send({ itemId: 'item-123' })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Item removed successfully',
      });
    });

    it('should validate itemId is provided', async () => {
      const response = await request(app)
        .post('/api/v1/plaid/item/remove')
        .send({})
        .expect(400);

      expect(response.body).toEqual({
        error: 'itemId is required',
      });
    });

    it('should handle errors when removing item', async () => {
      mockPlaidService.removeItem = jest.fn().mockResolvedValue({
        success: false,
        error: 'Unable to remove item',
      });

      (PlaidService as jest.Mock).mockImplementation(() => mockPlaidService);

      const response = await request(app)
        .post('/api/v1/plaid/item/remove')
        .send({ itemId: 'item-123' })
        .expect(500);

      expect(response.body).toEqual({
        error: 'Unable to remove item',
      });
    });
  });
});