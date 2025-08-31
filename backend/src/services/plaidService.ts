import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
  LinkTokenCreateRequest,
  ItemPublicTokenExchangeRequest,
  AccountsGetRequest,
  TransactionsGetRequest,
  Transaction as PlaidTransaction,
  PlaidError,
  ItemRemoveRequest,
  InstitutionsGetByIdRequest,
} from 'plaid';

// Types for our application
export interface LinkTokenResult {
  success: boolean;
  linkToken?: string;
  expiration?: string;
  error?: string;
}

export interface TokenExchangeResult {
  success: boolean;
  accessToken?: string;
  itemId?: string;
  error?: string;
}

export interface Account {
  id: string;
  plaidAccountId: string;
  name: string;
  officialName: string | null;
  type: string;
  subtype: string | null;
  mask: string | null;
  currentBalance: number | null;
  availableBalance: number | null;
  creditLimit?: number | null;
  currency: string | null;
}

export interface AccountsResult {
  success: boolean;
  accounts?: Account[];
  itemId?: string;
  error?: string;
  errorCode?: string;
  requiresReauth?: boolean;
}

export interface Transaction {
  id: string;
  plaidTransactionId: string;
  accountId: string;
  amount: number;
  date: string;
  name: string;
  merchantName: string | null;
  category: string[] | null;
  categoryId: string | null;
  pending: boolean;
  isoCurrencyCode: string | null;
  location?: {
    address: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    country: string | null;
  };
}

export interface TransactionsResult {
  success: boolean;
  transactions?: Transaction[];
  totalTransactions?: number;
  itemId?: string;
  hasMore?: boolean;
  error?: string;
}

export interface Institution {
  id: string;
  name: string;
  url: string | null;
  primaryColor: string | null;
  logo: string | null;
  products: Products[];
}

export interface InstitutionResult {
  success: boolean;
  institution?: Institution;
  error?: string;
}

export interface RemoveItemResult {
  success: boolean;
  message?: string;
  error?: string;
}

export interface TransactionOptions {
  includePending?: boolean;
  offset?: number;
  count?: number;
}

export interface FormattedError {
  type: string;
  code: string;
  message: string;
  displayMessage: string | null;
  suggestedAction: string | null;
  requiresReauth: boolean;
}

export class PlaidService {
  private client: PlaidApi;
  private clientName: string;
  private redirectUri?: string;

  constructor() {
    const configuration = new Configuration({
      basePath: this.getPlaidEnvironment(),
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
          'PLAID-SECRET': process.env.PLAID_SECRET,
        },
      },
    });

    this.client = new PlaidApi(configuration);
    this.clientName = process.env.APP_NAME || 'Personal Budgeting App';
    this.redirectUri = process.env.PLAID_REDIRECT_URI;
    
    // Log initialization (for debugging)
    console.log('PlaidService initialized with:', {
      environment: process.env.PLAID_ENV || 'sandbox',
      clientId: process.env.PLAID_CLIENT_ID?.substring(0, 10) + '...',
      hasSecret: !!process.env.PLAID_SECRET,
    });
  }

  private getPlaidEnvironment(): string {
    const env = process.env.PLAID_ENV || 'sandbox';
    switch (env) {
      case 'production':
        return PlaidEnvironments.production;
      case 'development':
        return PlaidEnvironments.development;
      case 'sandbox':
      default:
        return PlaidEnvironments.sandbox;
    }
  }

  /**
   * Create a link token for Plaid Link initialization
   */
  async createLinkToken(userId: string): Promise<LinkTokenResult> {
    try {
      const products = (process.env.PLAID_PRODUCTS || 'accounts,transactions')
        .split(',')
        .map(p => p.trim() as Products);

      const countryCodes = (process.env.PLAID_COUNTRY_CODES || 'US')
        .split(',')
        .map(c => c.trim() as CountryCode);

      const request: LinkTokenCreateRequest = {
        user: {
          client_user_id: userId,
        },
        client_name: this.clientName,
        products: products,
        country_codes: countryCodes,
        language: 'en',
        // Request 2 years of transaction history (730 days)
        // Default is only 90 days if not specified
        transactions: {
          days_requested: 730
        }
      };

      // Add redirect URI if configured
      if (this.redirectUri) {
        request.redirect_uri = this.redirectUri;
      }

      // Add webhook URL in production
      if (process.env.NODE_ENV === 'production' && process.env.PLAID_WEBHOOK_URL) {
        request.webhook = process.env.PLAID_WEBHOOK_URL;
      }

      const response = await this.client.linkTokenCreate(request);

      return {
        success: true,
        linkToken: response.data.link_token,
        expiration: response.data.expiration,
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Exchange a public token for an access token
   */
  async exchangePublicToken(publicToken: string): Promise<TokenExchangeResult> {
    try {
      const request: ItemPublicTokenExchangeRequest = {
        public_token: publicToken,
      };

      const response = await this.client.itemPublicTokenExchange(request);

      return {
        success: true,
        accessToken: response.data.access_token,
        itemId: response.data.item_id,
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get all accounts associated with an access token
   */
  async getAccounts(accessToken: string): Promise<AccountsResult> {
    try {
      const request: AccountsGetRequest = {
        access_token: accessToken,
      };

      const response = await this.client.accountsGet(request);
      
      const accounts: Account[] = response.data.accounts.map(account => ({
        id: account.account_id,
        plaidAccountId: account.account_id,
        name: account.name,
        officialName: account.official_name || null,
        type: this.mapAccountType(account.type),
        subtype: account.subtype || null,
        mask: account.mask || null,
        currentBalance: account.balances.current,
        availableBalance: account.balances.available,
        creditLimit: account.balances.limit || undefined,
        currency: account.balances.iso_currency_code,
      }));

      return {
        success: true,
        accounts,
        itemId: response.data.item.item_id,
      };
    } catch (error) {
      const result = this.handleError(error);
      
      // Check if error requires reauthentication
      if (result.error && this.isReauthError(error)) {
        return {
          ...result,
          requiresReauth: true,
          errorCode: this.getErrorCode(error),
        };
      }
      
      return result;
    }
  }

  /**
   * Get transactions for a date range with automatic pagination
   */
  async getTransactions(
    accessToken: string,
    startDate: string,
    endDate: string,
    options: TransactionOptions = {}
  ): Promise<TransactionsResult> {
    try {
      const allTransactions: Transaction[] = [];
      let offset = 0;
      const countPerPage = 500; // Plaid max is 500 per request
      let totalTransactions = 0;
      let itemId: string | undefined;

      // Keep fetching until we have all transactions
      while (true) {
        const request: TransactionsGetRequest = {
          access_token: accessToken,
          start_date: startDate,
          end_date: endDate,
          options: {
            include_personal_finance_category: true,
            offset: offset,
            count: countPerPage,
          },
        };

        console.log(`Fetching transactions: offset=${offset}, count=${countPerPage}, dates=${startDate} to ${endDate}`);
        const response = await this.client.transactionsGet(request);
        
        // Map and add transactions to our collection
        const batchTransactions = this.mapTransactions(response.data.transactions);
        allTransactions.push(...batchTransactions);
        
        // Update totals
        totalTransactions = response.data.total_transactions;
        itemId = response.data.item?.item_id;
        
        console.log(`Fetched ${batchTransactions.length} transactions (${allTransactions.length}/${totalTransactions} total)`);
        
        // Check if we have all transactions
        if (allTransactions.length >= totalTransactions) {
          break;
        }
        
        // Move to next page
        offset += countPerPage;
        
        // Safety check to prevent infinite loops
        if (offset > 10000) {
          console.warn('Stopping pagination at 10,000 transactions to prevent infinite loop');
          break;
        }
      }
      
      // Filter out pending transactions if requested
      let finalTransactions = allTransactions;
      if (options.includePending === false) {
        finalTransactions = allTransactions.filter(t => !t.pending);
      }

      return {
        success: true,
        transactions: finalTransactions,
        totalTransactions: totalTransactions,
        itemId: itemId,
        hasMore: false, // We fetched everything
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get institution information by ID
   */
  async getInstitution(institutionId: string): Promise<InstitutionResult> {
    try {
      const request: InstitutionsGetByIdRequest = {
        institution_id: institutionId,
        country_codes: [CountryCode.Us],
      };

      const response = await this.client.institutionsGetById(request);
      
      const institution: Institution = {
        id: response.data.institution.institution_id,
        name: response.data.institution.name,
        url: response.data.institution.url || null,
        primaryColor: response.data.institution.primary_color || null,
        logo: response.data.institution.logo || null,
        products: response.data.institution.products as Products[],
      };

      return {
        success: true,
        institution,
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Remove an item (disconnect bank account)
   */
  async removeItem(accessToken: string): Promise<RemoveItemResult> {
    try {
      const request: ItemRemoveRequest = {
        access_token: accessToken,
      };

      await this.client.itemRemove(request);

      return {
        success: true,
        message: 'Item removed successfully',
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Verify webhook signature (for security)
   */
  verifyWebhookSignature(_body: string, headers: Record<string, string | undefined>): boolean {
    // Note: Plaid webhook verification requires the JWT library
    // This is a placeholder - implement actual verification based on Plaid docs
    const signature = headers['plaid-verification'];
    if (!signature) {
      return false;
    }
    
    // In production, implement proper JWT verification
    // See: https://plaid.com/docs/api/webhooks/webhook-verification/
    return true;
  }

  /**
   * Format Plaid error for consistent error handling
   */
  formatError(error: PlaidError): FormattedError {
    return {
      type: error.error_type,
      code: error.error_code,
      message: error.error_message,
      displayMessage: error.display_message || null,
      suggestedAction: error.suggested_action || null,
      requiresReauth: this.requiresReauthentication(error.error_code),
    };
  }

  /**
   * Check if error code requires reauthentication
   */
  requiresReauthentication(errorCode: string): boolean {
    const reauthCodes = [
      'ITEM_LOGIN_REQUIRED',
      'ITEM_LOCKED',
      'USER_PERMISSION_REVOKED',
      'INVALID_CREDENTIALS',
      'ITEM_NOT_ACCESSIBLE',
    ];
    return reauthCodes.includes(errorCode);
  }

  /**
   * Map Plaid transactions to our application format
   */
  private mapTransactions(plaidTransactions: PlaidTransaction[]): Transaction[] {
    return plaidTransactions.map(txn => {
      // Use personal_finance_category if available (new), fall back to category (old)
      let category = txn.category || null;
      
      // Check if personal_finance_category exists (Plaid's new categorization)
      if ((txn as any).personal_finance_category) {
        const pfc = (txn as any).personal_finance_category;
        // Convert to old category format for compatibility
        // Primary category is what we want
        if (pfc.primary) {
          category = [pfc.primary];
          if (pfc.detailed) {
            category.push(pfc.detailed);
          }
        }
        console.log(`Transaction "${txn.name}" has PFC:`, pfc.primary);
      }
      
      return {
        id: txn.transaction_id,
        plaidTransactionId: txn.transaction_id,
        accountId: txn.account_id,
        amount: txn.amount,
        date: txn.date,
        name: txn.name,
        merchantName: txn.merchant_name || null,
        category: category,
        categoryId: txn.category_id || null,
        pending: txn.pending,
        isoCurrencyCode: txn.iso_currency_code || null,
        location: txn.location ? {
          address: txn.location.address || null,
          city: txn.location.city || null,
          region: txn.location.region || null,
          postalCode: txn.location.postal_code || null,
          country: txn.location.country || null,
        } : undefined,
      };
    });
  }

  /**
   * Map Plaid account type to simplified type
   */
  private mapAccountType(type: string | null): string {
    if (!type) return 'unknown';
    
    // Map to simplified types for our app
    switch (type) {
      case 'depository':
        return 'checking';
      case 'credit':
        return 'credit';
      case 'loan':
        return 'loan';
      case 'investment':
        return 'investment';
      default:
        return type;
    }
  }

  /**
   * Handle errors consistently
   */
  private handleError(error: unknown): { success: false; error: string } {
    console.error('Plaid API error:', error);
    
    // Type guard for axios errors with response data
    if (
      error && 
      typeof error === 'object' && 
      'response' in error && 
      error.response &&
      typeof error.response === 'object' &&
      'data' in error.response
    ) {
      const plaidError = error.response.data as PlaidError;
      return {
        success: false,
        error: plaidError.error_message || 'An error occurred',
      };
    }
    
    // Type guard for regular Error objects
    if (error instanceof Error) {
      return {
        success: false,
        error: error.message,
      };
    }
    
    return {
      success: false,
      error: 'An unexpected error occurred',
    };
  }

  /**
   * Check if error is a reauth error
   */
  private isReauthError(error: unknown): boolean {
    if (
      error && 
      typeof error === 'object' && 
      'response' in error && 
      error.response &&
      typeof error.response === 'object' &&
      'data' in error.response
    ) {
      const plaidError = error.response.data as PlaidError;
      return this.requiresReauthentication(plaidError.error_code);
    }
    return false;
  }

  /**
   * Get error code from error object
   */
  private getErrorCode(error: unknown): string | undefined {
    if (
      error && 
      typeof error === 'object' && 
      'response' in error && 
      error.response &&
      typeof error.response === 'object' &&
      'data' in error.response
    ) {
      const plaidError = error.response.data as PlaidError;
      return plaidError.error_code;
    }
    return undefined;
  }
}