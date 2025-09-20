/**
 * Test for Year-to-Date calculation logic
 * Ensures YTD averages only include months with complete data
 */

import { ReportService } from '../../services/reportService';
import { DataService } from '../../services/dataService';
import { StoredTransaction } from '../../services/transactionService';
import { Category } from '../../shared/types';

describe('YTD Calculation - Complete Month Logic', () => {
  let reportService: ReportService;
  let mockDataService: DataService;
  const userId = 'test-user-123';

  beforeEach(() => {
    mockDataService = {
      getData: jest.fn(),
      getCategories: jest.fn(),
      setData: jest.fn(),
      deleteData: jest.fn(),
      getUserData: jest.fn(),
      getSystemData: jest.fn(),
      setUserData: jest.fn(),
      deleteUserData: jest.fn(),
    } as unknown as DataService;
    reportService = new ReportService(mockDataService);
  });

  const createTransaction = (date: string, amount: number): StoredTransaction => ({
    id: `internal-${date}-${amount}`,
    userId,
    accountId: 'test-account',
    plaidTransactionId: `txn-${date}-${amount}`,
    plaidAccountId: 'plaid-account-123',
    amount,
    date,
    name: 'Test Transaction',
    userDescription: null,
    merchantName: null,
    category: null,
    plaidCategoryId: null,
    categoryId: null,
    status: 'posted',
    pending: false,
    isoCurrencyCode: 'USD',
    tags: [],
    notes: null,
    isHidden: false,
    isSplit: false,
    parentTransactionId: null,
    splitTransactionIds: [],
    createdAt: new Date(date),
    updatedAt: new Date(date),
    location: null,
    accountOwner: 'Test User',
    checkNumber: null,
    personalFinanceCategory: null,
    personalFinanceCategoryDetailed: null,
    isRemoved: false,
  } as StoredTransaction);

  const mockCategories: Category[] = [];

  describe('YTD average calculations', () => {
    it('should exclude current partial month from averages', async () => {
      // Setup: Transactions from January to current month (September)
      const currentDate = new Date('2025-09-07T12:00:00'); // September 7th
      jest.useFakeTimers().setSystemTime(currentDate);

      const transactions: StoredTransaction[] = [
        // January - full month
        createTransaction('2025-01-15', 1000),
        createTransaction('2025-01-20', 500),
        // February - full month
        createTransaction('2025-02-10', 800),
        createTransaction('2025-02-25', 700),
        // March - full month
        createTransaction('2025-03-05', 900),
        createTransaction('2025-03-30', 600),
        // Skip April and May (no transactions)
        // June - full month
        createTransaction('2025-06-15', 1100),
        createTransaction('2025-06-28', 400),
        // July - full month
        createTransaction('2025-07-10', 1200),
        createTransaction('2025-07-25', 300),
        // August - full month
        createTransaction('2025-08-05', 1000),
        createTransaction('2025-08-30', 500),
        // September - partial month (only 7 days)
        createTransaction('2025-09-02', 200),
        createTransaction('2025-09-05', 100),
      ];

      (mockDataService.getData as jest.Mock).mockResolvedValue(transactions);
      (mockDataService.getCategories as jest.Mock).mockResolvedValue(mockCategories);

      const result = await reportService.getYearToDateSummary(userId);

      expect(result.success).toBe(true);
      expect(result.summary).toBeDefined();
      
      if (result.summary) {
        const totalExpenses = 9300; // Sum of all expenses
        const completeMonths = 6; // Jan, Feb, Mar, Jun, Jul, Aug (months with data, excluding partial September)
        const expectedAverage = totalExpenses - 300; // Exclude September transactions
        
        expect(result.summary.totalExpenses).toBe(totalExpenses);
        // Average should only include complete months (Jan-Aug)
        expect(result.summary.averageMonthlyExpenses).toBe(expectedAverage / completeMonths);
      }

      jest.useRealTimers();
    });

    it('should handle case with only partial current month data', async () => {
      // Setup: Only transactions in current month
      const currentDate = new Date('2025-09-15');
      jest.useFakeTimers().setSystemTime(currentDate);

      const transactions: StoredTransaction[] = [
        createTransaction('2025-09-02', 500),
        createTransaction('2025-09-10', 300),
      ];

      (mockDataService.getData as jest.Mock).mockResolvedValue(transactions);
      (mockDataService.getCategories as jest.Mock).mockResolvedValue(mockCategories);

      const result = await reportService.getYearToDateSummary(userId);

      expect(result.success).toBe(true);
      expect(result.summary).toBeDefined();
      
      if (result.summary) {
        expect(result.summary.totalExpenses).toBe(800);
        // Should be 0 since we have no complete months
        expect(result.summary.averageMonthlyExpenses).toBe(0);
        expect(result.summary.averageMonthlyIncome).toBe(0);
      }

      jest.useRealTimers();
    });

    it('should handle mid-year start with complete months', async () => {
      // Setup: Transactions starting from July
      const currentDate = new Date('2025-09-20');
      jest.useFakeTimers().setSystemTime(currentDate);

      const transactions: StoredTransaction[] = [
        // July - full month
        createTransaction('2025-07-05', 1000),
        createTransaction('2025-07-25', 500),
        // August - full month
        createTransaction('2025-08-10', 800),
        createTransaction('2025-08-28', 700),
        // September - partial month
        createTransaction('2025-09-05', 400),
        createTransaction('2025-09-15', 300),
      ];

      (mockDataService.getData as jest.Mock).mockResolvedValue(transactions);
      (mockDataService.getCategories as jest.Mock).mockResolvedValue(mockCategories);

      const result = await reportService.getYearToDateSummary(userId);

      expect(result.success).toBe(true);
      expect(result.summary).toBeDefined();
      
      if (result.summary) {
        const totalExpenses = 3700; // All transactions
        const completeMonthsExpenses = 3000; // July + August only
        const completeMonths = 2; // July and August
        
        expect(result.summary.totalExpenses).toBe(totalExpenses);
        // Average should only include July and August
        expect(result.summary.averageMonthlyExpenses).toBe(completeMonthsExpenses / completeMonths);
      }

      jest.useRealTimers();
    });

    it('should handle no transactions', async () => {
      const currentDate = new Date('2025-09-20');
      jest.useFakeTimers().setSystemTime(currentDate);

      (mockDataService.getData as jest.Mock).mockResolvedValue([]);
      (mockDataService.getCategories as jest.Mock).mockResolvedValue(mockCategories);

      const result = await reportService.getYearToDateSummary(userId);

      expect(result.success).toBe(true);
      expect(result.summary).toBeDefined();
      
      if (result.summary) {
        expect(result.summary.totalExpenses).toBe(0);
        expect(result.summary.totalIncome).toBe(0);
        expect(result.summary.averageMonthlyExpenses).toBe(0);
        expect(result.summary.averageMonthlyIncome).toBe(0);
      }

      jest.useRealTimers();
    });

    it('should handle income transactions correctly', async () => {
      const currentDate = new Date('2025-09-10');
      jest.useFakeTimers().setSystemTime(currentDate);

      const transactions: StoredTransaction[] = [
        // July - full month
        createTransaction('2025-07-05', -5000), // Income (negative)
        createTransaction('2025-07-15', 1000),  // Expense
        // August - full month
        createTransaction('2025-08-05', -4500), // Income
        createTransaction('2025-08-15', 1200),  // Expense
        // September - partial
        createTransaction('2025-09-05', -1000), // Income
        createTransaction('2025-09-08', 300),   // Expense
      ];

      (mockDataService.getData as jest.Mock).mockResolvedValue(transactions);
      (mockDataService.getCategories as jest.Mock).mockResolvedValue(mockCategories);

      const result = await reportService.getYearToDateSummary(userId);

      expect(result.success).toBe(true);
      expect(result.summary).toBeDefined();
      
      if (result.summary) {
        const totalIncome = 10500; // 5000 + 4500 + 1000
        const totalExpenses = 2500; // 1000 + 1200 + 300
        const completeMonthsIncome = 9500; // 5000 + 4500 (excluding September)
        const completeMonthsExpenses = 2200; // 1000 + 1200 (excluding September)
        const completeMonths = 2; // July and August
        
        expect(result.summary.totalIncome).toBe(totalIncome);
        expect(result.summary.totalExpenses).toBe(totalExpenses);
        expect(result.summary.averageMonthlyIncome).toBe(completeMonthsIncome / completeMonths);
        expect(result.summary.averageMonthlyExpenses).toBe(completeMonthsExpenses / completeMonths);
      }

      jest.useRealTimers();
    });

    it('should handle end of month correctly', async () => {
      // Test on the last day of a month - current month should still be excluded
      const currentDate = new Date('2025-08-31');
      jest.useFakeTimers().setSystemTime(currentDate);

      const transactions: StoredTransaction[] = [
        // July - full month
        createTransaction('2025-07-15', 1000),
        // August - current month (should be excluded even on last day)
        createTransaction('2025-08-15', 800),
        createTransaction('2025-08-30', 200),
      ];

      (mockDataService.getData as jest.Mock).mockResolvedValue(transactions);
      (mockDataService.getCategories as jest.Mock).mockResolvedValue(mockCategories);

      const result = await reportService.getYearToDateSummary(userId);

      expect(result.success).toBe(true);
      expect(result.summary).toBeDefined();
      
      if (result.summary) {
        const totalExpenses = 2000; // All transactions
        const completeMonthsExpenses = 1000; // July only
        const completeMonths = 1; // Only July is complete
        
        expect(result.summary.totalExpenses).toBe(totalExpenses);
        expect(result.summary.averageMonthlyExpenses).toBe(completeMonthsExpenses / completeMonths);
      }

      jest.useRealTimers();
    });

    it('should handle beginning of new month correctly', async () => {
      // Test on the first day of a month - previous month should now be included
      const currentDate = new Date('2025-09-01');
      jest.useFakeTimers().setSystemTime(currentDate);

      const transactions: StoredTransaction[] = [
        // July - full month
        createTransaction('2025-07-15', 1000),
        // August - now a complete month
        createTransaction('2025-08-15', 800),
        createTransaction('2025-08-30', 200),
      ];

      (mockDataService.getData as jest.Mock).mockResolvedValue(transactions);
      (mockDataService.getCategories as jest.Mock).mockResolvedValue(mockCategories);

      const result = await reportService.getYearToDateSummary(userId);

      expect(result.success).toBe(true);
      expect(result.summary).toBeDefined();
      
      if (result.summary) {
        const totalExpenses = 2000; // All transactions
        const completeMonths = 2; // July and August are both complete
        
        expect(result.summary.totalExpenses).toBe(totalExpenses);
        expect(result.summary.averageMonthlyExpenses).toBe(totalExpenses / completeMonths);
      }

      jest.useRealTimers();
    });
  });
});