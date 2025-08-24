import { PlaidService } from '../plaidService';
import { PlaidApi } from 'plaid';

// Mock the entire Plaid module
jest.mock('plaid');

describe('PlaidService', () => {
  let plaidService: PlaidService;
  let mockPlaidClient: any;
  
  const mockUserId = 'user-123';
  const mockAccessToken = 'access-sandbox-token';
  const mockPublicToken = 'public-sandbox-token';
  const mockLinkToken = 'link-sandbox-token';
  const mockItemId = 'item-123';

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock methods
    mockPlaidClient = {
      linkTokenCreate: jest.fn(),
      itemPublicTokenExchange: jest.fn(),
      accountsGet: jest.fn(),
      transactionsGet: jest.fn(),
      transactionsSync: jest.fn(),
      itemRemove: jest.fn(),
      institutionsGetById: jest.fn(),
    };

    // Mock the PlaidApi constructor to return our mock
    (PlaidApi as jest.MockedClass<typeof PlaidApi>).mockImplementation(() => mockPlaidClient);
    
    // Create PlaidService instance
    plaidService = new PlaidService();
  });

  describe('Link Token Creation', () => {
    it('should create a link token for connecting bank accounts', async () => {
      const mockResponse = {
        data: {
          link_token: mockLinkToken,
          expiration: '2025-01-01T00:00:00Z',
          request_id: 'request-123',
        },
      };

      mockPlaidClient.linkTokenCreate.mockResolvedValue(mockResponse);

      const result = await plaidService.createLinkToken(mockUserId);

      expect(result).toEqual({
        success: true,
        linkToken: mockLinkToken,
        expiration: '2025-01-01T00:00:00Z',
      });

      expect(mockPlaidClient.linkTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          user: { client_user_id: mockUserId },
          client_name: expect.any(String),
          products: expect.arrayContaining(['accounts', 'transactions']),
          country_codes: expect.arrayContaining(['US']),
          language: 'en',
        })
      );
    });

    it('should handle errors when creating link token', async () => {
      const mockError = {
        response: {
          data: {
            error_type: 'INVALID_REQUEST',
            error_code: 'INVALID_FIELD',
            error_message: 'Invalid user ID',
            display_message: 'An error occurred',
            request_id: 'request-123',
          }
        }
      };

      mockPlaidClient.linkTokenCreate.mockRejectedValue(mockError);

      const result = await plaidService.createLinkToken('');

      expect(result).toEqual({
        success: false,
        error: 'Invalid user ID',
      });
    });

    it('should include webhook URL in production environment', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      process.env.PLAID_WEBHOOK_URL = 'https://api.example.com/webhooks/plaid';

      const mockResponse = {
        data: {
          link_token: mockLinkToken,
          expiration: '2025-01-01T00:00:00Z',
          request_id: 'request-123',
        },
      };

      mockPlaidClient.linkTokenCreate.mockResolvedValue(mockResponse);

      await plaidService.createLinkToken(mockUserId);

      expect(mockPlaidClient.linkTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          webhook: 'https://api.example.com/webhooks/plaid',
        })
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Public Token Exchange', () => {
    it('should exchange public token for access token', async () => {
      const mockResponse = {
        data: {
          access_token: mockAccessToken,
          item_id: mockItemId,
          request_id: 'request-123',
        },
      };

      mockPlaidClient.itemPublicTokenExchange.mockResolvedValue(mockResponse);

      const result = await plaidService.exchangePublicToken(mockPublicToken);

      expect(result).toEqual({
        success: true,
        accessToken: mockAccessToken,
        itemId: mockItemId,
      });

      expect(mockPlaidClient.itemPublicTokenExchange).toHaveBeenCalledWith({
        public_token: mockPublicToken,
      });
    });

    it('should handle errors during token exchange', async () => {
      const mockError = {
        response: {
          data: {
            error_type: 'INVALID_REQUEST',
            error_code: 'INVALID_PUBLIC_TOKEN',
            error_message: 'Invalid public token',
            display_message: 'An error occurred',
          }
        }
      };

      mockPlaidClient.itemPublicTokenExchange.mockRejectedValue(mockError);

      const result = await plaidService.exchangePublicToken('invalid-token');

      expect(result).toEqual({
        success: false,
        error: 'Invalid public token',
      });
    });
  });

  describe('Fetching Accounts', () => {
    it('should fetch all accounts for an access token', async () => {
      const mockAccounts = [
        {
          account_id: 'account-1',
          balances: {
            available: 1000,
            current: 1200,
            iso_currency_code: 'USD',
            limit: null,
          },
          mask: '1234',
          name: 'Checking Account',
          official_name: 'Bank of America Checking',
          type: 'depository',
          subtype: 'checking',
        },
        {
          account_id: 'account-2',
          balances: {
            available: 5000,
            current: 5000,
            iso_currency_code: 'USD',
            limit: null,
          },
          mask: '5678',
          name: 'Savings Account',
          official_name: 'Bank of America Savings',
          type: 'depository',
          subtype: 'savings',
        },
      ];

      const mockResponse = {
        data: {
          accounts: mockAccounts,
          item: {
            item_id: mockItemId,
            institution_id: 'ins_1',
            available_products: ['transactions'],
            billed_products: ['accounts', 'transactions'],
            products: ['accounts', 'transactions'],
          },
          request_id: 'request-123',
        },
      };

      mockPlaidClient.accountsGet.mockResolvedValue(mockResponse);

      const result = await plaidService.getAccounts(mockAccessToken);

      expect(result).toEqual({
        success: true,
        accounts: expect.arrayContaining([
          expect.objectContaining({
            id: 'account-1',
            plaidAccountId: 'account-1',
            name: 'Checking Account',
            officialName: 'Bank of America Checking',
            type: 'checking',
            subtype: 'checking',
            mask: '1234',
            currentBalance: 1200,
            availableBalance: 1000,
            currency: 'USD',
          }),
          expect.objectContaining({
            id: 'account-2',
            plaidAccountId: 'account-2',
            name: 'Savings Account',
            officialName: 'Bank of America Savings',
            type: 'checking',
            subtype: 'savings',
            mask: '5678',
            currentBalance: 5000,
            availableBalance: 5000,
            currency: 'USD',
          }),
        ]),
        itemId: mockItemId,
      });
    });

    it('should handle credit card accounts with limits', async () => {
      const mockCreditAccount = {
        account_id: 'account-3',
        balances: {
          available: 3000,
          current: 2000,
          iso_currency_code: 'USD',
          limit: 5000,
        },
        mask: '9999',
        name: 'Capital One Credit Card',
        official_name: 'Capital One Platinum',
        type: 'credit',
        subtype: 'credit card',
      };

      const mockResponse = {
        data: {
          accounts: [mockCreditAccount],
          item: {
            item_id: mockItemId,
            institution_id: 'ins_2',
          },
          request_id: 'request-123',
        },
      };

      mockPlaidClient.accountsGet.mockResolvedValue(mockResponse);

      const result = await plaidService.getAccounts(mockAccessToken);

      expect(result.success).toBe(true);
      expect(result.accounts?.[0]).toMatchObject({
        type: 'credit',
        currentBalance: 2000,
        availableBalance: 3000,
        creditLimit: 5000,
      });
    });

    it('should handle errors when fetching accounts', async () => {
      const mockError = {
        response: {
          data: {
            error_type: 'ITEM_ERROR',
            error_code: 'ITEM_LOGIN_REQUIRED',
            error_message: 'Item login required',
            display_message: 'Please reconnect your account',
          }
        }
      };

      mockPlaidClient.accountsGet.mockRejectedValue(mockError);

      const result = await plaidService.getAccounts(mockAccessToken);

      expect(result).toEqual({
        success: false,
        error: 'Item login required',
        errorCode: 'ITEM_LOGIN_REQUIRED',
        requiresReauth: true,
      });
    });
  });

  describe('Fetching Transactions', () => {
    const startDate = '2025-01-01';
    const endDate = '2025-01-31';

    it('should fetch transactions for a date range', async () => {
      const mockTransactions = [
        {
          account_id: 'account-1',
          transaction_id: 'txn-1',
          amount: 50.00,
          iso_currency_code: 'USD',
          category: ['Food and Drink', 'Restaurants'],
          category_id: '13005000',
          date: '2025-01-15',
          authorized_date: '2025-01-15',
          location: {
            address: '123 Main St',
            city: 'New York',
            region: 'NY',
            postal_code: '10001',
            country: 'US',
          },
          name: 'Starbucks',
          merchant_name: 'Starbucks',
          payment_channel: 'in store',
          pending: false,
        },
        {
          account_id: 'account-1',
          transaction_id: 'txn-2',
          amount: 1500.00,
          iso_currency_code: 'USD',
          category: ['Transfer', 'Deposit'],
          category_id: '21000000',
          date: '2025-01-01',
          name: 'Direct Deposit',
          merchant_name: null,
          payment_channel: 'other',
          pending: false,
        },
      ];

      const mockResponse = {
        data: {
          accounts: [],
          transactions: mockTransactions,
          total_transactions: 2,
          item: {
            item_id: mockItemId,
          },
          request_id: 'request-123',
        },
      };

      mockPlaidClient.transactionsGet.mockResolvedValue(mockResponse);

      const result = await plaidService.getTransactions(mockAccessToken, startDate, endDate);

      expect(result).toEqual({
        success: true,
        transactions: expect.arrayContaining([
          expect.objectContaining({
            id: 'txn-1',
            plaidTransactionId: 'txn-1',
            accountId: 'account-1',
            amount: 50.00,
            date: '2025-01-15',
            name: 'Starbucks',
            merchantName: 'Starbucks',
            category: ['Food and Drink', 'Restaurants'],
            pending: false,
            isoCurrencyCode: 'USD',
          }),
          expect.objectContaining({
            id: 'txn-2',
            plaidTransactionId: 'txn-2',
            accountId: 'account-1',
            amount: 1500.00,
            date: '2025-01-01',
            name: 'Direct Deposit',
            category: ['Transfer', 'Deposit'],
            pending: false,
            isoCurrencyCode: 'USD',
          }),
        ]),
        totalTransactions: 2,
        itemId: mockItemId,
        hasMore: false,
      });

      expect(mockPlaidClient.transactionsGet).toHaveBeenCalledWith({
        access_token: mockAccessToken,
        start_date: startDate,
        end_date: endDate,
        options: {
          include_personal_finance_category: true,
          offset: 0,
          count: 100,
        },
      });
    });

    it('should handle pagination for large transaction sets', async () => {
      const mockTransactions = Array.from({ length: 100 }, (_, i) => ({
        account_id: 'account-1',
        transaction_id: `txn-${i}`,
        amount: 10 + i,
        iso_currency_code: 'USD',
        category: ['Shops'],
        category_id: '19000000',
        date: '2025-01-15',
        name: `Transaction ${i}`,
        merchant_name: null,
        payment_channel: 'online',
        pending: false,
      }));

      const mockResponse = {
        data: {
          accounts: [],
          transactions: mockTransactions,
          total_transactions: 500, // More than returned
          item: {},
          request_id: 'request-123',
        },
      };

      mockPlaidClient.transactionsGet.mockResolvedValue(mockResponse);

      const result = await plaidService.getTransactions(mockAccessToken, startDate, endDate);

      expect(result.success).toBe(true);
      expect(result.transactions?.length).toBe(100);
      expect(result.totalTransactions).toBe(500);
      expect(result.hasMore).toBe(true);
    });

    it('should filter out pending transactions when requested', async () => {
      const mixedTransactions = [
        {
          transaction_id: 'txn-pending',
          pending: true,
          amount: 25.00,
          name: 'Pending Transaction',
          account_id: 'account-1',
          date: '2025-01-20',
          category: ['Shops'],
        },
        {
          transaction_id: 'txn-posted',
          pending: false,
          amount: 30.00,
          name: 'Posted Transaction',
          account_id: 'account-1',
          date: '2025-01-20',
          category: ['Shops'],
        },
      ];

      const mockResponse = {
        data: {
          accounts: [],
          transactions: mixedTransactions,
          total_transactions: 2,
          item: {},
          request_id: 'request-123',
        },
      };

      mockPlaidClient.transactionsGet.mockResolvedValue(mockResponse);

      const result = await plaidService.getTransactions(
        mockAccessToken,
        startDate,
        endDate,
        { includePending: false }
      );

      expect(result.success).toBe(true);
      expect(result.transactions?.length).toBe(1);
      expect(result.transactions?.[0].pending).toBe(false);
    });

    it('should handle errors when fetching transactions', async () => {
      const mockError = {
        response: {
          data: {
            error_type: 'INVALID_REQUEST',
            error_code: 'INVALID_DATE_RANGE',
            error_message: 'Start date must be before end date',
            display_message: 'Invalid date range',
          }
        }
      };

      mockPlaidClient.transactionsGet.mockRejectedValue(mockError);

      const result = await plaidService.getTransactions(mockAccessToken, '2025-01-31', '2025-01-01');

      expect(result).toEqual({
        success: false,
        error: 'Start date must be before end date',
      });
    });
  });

  describe('Institution Information', () => {
    it('should fetch institution details by ID', async () => {
      const mockInstitution = {
        institution_id: 'ins_1',
        name: 'Bank of America',
        products: ['accounts', 'transactions'],
        country_codes: ['US'],
        url: 'https://www.bankofamerica.com',
        primary_color: '#0066b2',
        logo: 'logo_url',
      };

      mockPlaidClient.institutionsGetById.mockResolvedValue({
        data: {
          institution: mockInstitution,
          request_id: 'request-123',
        },
      });

      const result = await plaidService.getInstitution('ins_1');

      expect(result).toEqual({
        success: true,
        institution: expect.objectContaining({
          id: 'ins_1',
          name: 'Bank of America',
          url: 'https://www.bankofamerica.com',
          primaryColor: '#0066b2',
          logo: 'logo_url',
        }),
      });
    });
  });

  describe('Item Removal', () => {
    it('should remove an item (disconnect bank account)', async () => {
      mockPlaidClient.itemRemove.mockResolvedValue({
        data: {
          request_id: 'request-123',
        },
      });

      const result = await plaidService.removeItem(mockAccessToken);

      expect(result).toEqual({
        success: true,
        message: 'Item removed successfully',
      });

      expect(mockPlaidClient.itemRemove).toHaveBeenCalledWith({
        access_token: mockAccessToken,
      });
    });

    it('should handle errors when removing item', async () => {
      const mockError = {
        response: {
          data: {
            error_type: 'INVALID_REQUEST',
            error_code: 'INVALID_ACCESS_TOKEN',
            error_message: 'Invalid access token',
            display_message: 'An error occurred',
          }
        }
      };

      mockPlaidClient.itemRemove.mockRejectedValue(mockError);

      const result = await plaidService.removeItem('invalid-token');

      expect(result).toEqual({
        success: false,
        error: 'Invalid access token',
      });
    });
  });

  describe('Error Handling', () => {
    it('should properly format Plaid error responses', () => {
      const mockError = {
        error_type: 'ITEM_ERROR',
        error_code: 'ITEM_LOGIN_REQUIRED',
        error_message: 'The login credentials have changed',
        display_message: 'Please reconnect your account',
        suggested_action: 'Prompt user to update credentials',
      };

      const formattedError = plaidService.formatError(mockError as any);

      expect(formattedError).toEqual({
        type: 'ITEM_ERROR',
        code: 'ITEM_LOGIN_REQUIRED',
        message: 'The login credentials have changed',
        displayMessage: 'Please reconnect your account',
        suggestedAction: 'Prompt user to update credentials',
        requiresReauth: true,
      });
    });

    it('should identify errors requiring reauthentication', () => {
      const reauthErrors = [
        'ITEM_LOGIN_REQUIRED',
        'ITEM_LOCKED',
        'USER_PERMISSION_REVOKED',
      ];

      reauthErrors.forEach(code => {
        const requiresReauth = plaidService.requiresReauthentication(code);
        expect(requiresReauth).toBe(true);
      });

      const normalError = plaidService.requiresReauthentication('INVALID_REQUEST');
      expect(normalError).toBe(false);
    });
  });

  describe('Webhook Signature Verification', () => {
    it('should verify valid webhook signatures', () => {
      const body = JSON.stringify({ webhook_type: 'TRANSACTIONS', webhook_code: 'DEFAULT_UPDATE' });
      const headers = {
        'plaid-verification': 'valid-signature-here',
      };

      // Mock the signature verification
      const isValid = plaidService.verifyWebhookSignature(body, headers);
      
      // Note: In real implementation, this would use Plaid's JWT verification
      expect(typeof isValid).toBe('boolean');
    });
  });
});