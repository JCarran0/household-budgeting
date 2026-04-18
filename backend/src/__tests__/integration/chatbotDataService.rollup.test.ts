/**
 * ChatbotDataService rollup integration test
 *
 * Verifies that the chatbot's data tools (get_spending_by_category and
 * get_budget_summary) return rollup-aware results per CATEGORY-HIERARCHY-BUDGETING-BRD
 * REQ-002 / REQ-017. Exercises the BRD's Travel reproduction case end-to-end through
 * ChatbotDataService → ReadOnlyDataService → InMemoryDataService.
 *
 * Also covers Bug Fix from review pass: getBudgetSummary's savings asymmetry —
 * when a savings parent has both budget and actual, those should land in the
 * savings buckets, not inflate totalBudgetedExpense.
 */

import { ChatbotDataService } from '../../services/chatbotDataService';
import { ReadOnlyDataServiceImpl } from '../../services/readOnlyDataService';
import { InMemoryDataService } from '../../services/dataService';
import type { Category } from '../../shared/types';

describe('ChatbotDataService — rollup semantics (BRD REQ-002, REQ-017)', () => {
  const FAMILY_ID = 'fam-test';

  let dataService: InMemoryDataService;
  let chatbotData: ChatbotDataService;

  const seedCategories: Category[] = [
    { id: 'TRAVEL', name: 'Travel', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
    { id: 'TRAVEL_FLIGHTS', name: 'Flights', parentId: 'TRAVEL', isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
    { id: 'TRAVEL_LODGING', name: 'Lodging', parentId: 'TRAVEL', isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
    { id: 'TRAVEL_OTHER', name: 'Other', parentId: 'TRAVEL', isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
    { id: 'INCOME', name: 'Income', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: true, isSavings: false },
    { id: 'INCOME_BASE', name: 'Base', parentId: 'INCOME', isCustom: false, isHidden: false, isRollover: false, isIncome: true, isSavings: false },
    { id: 'RETIREMENT', name: 'Retirement', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: true },
    { id: 'RETIREMENT_401K', name: '401k', parentId: 'RETIREMENT', isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: true },
  ];

  beforeEach(async () => {
    dataService = new InMemoryDataService();
    chatbotData = new ChatbotDataService(new ReadOnlyDataServiceImpl(dataService));
    await dataService.saveCategories(seedCategories, FAMILY_ID);
  });

  describe('getSpendingByCategory', () => {
    test('BRD Travel scenario: returns one rolled-up parent row carrying child spending', async () => {
      // Travel budgeted $5000 on parent (no child budgets); spending entirely on children.
      // Per the BRD bug repro: Flights/Lodging/Other should NOT appear as separate rows.
      const today = '2026-04-15';
      await dataService.saveData(`transactions_${FAMILY_ID}`, [
        { id: 't1', userId: 'u1', accountId: 'a1', plaidAccountId: 'p1', amount: 2000, date: today, name: 'United', categoryId: 'TRAVEL_FLIGHTS', status: 'posted', pending: false, isHidden: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [], createdAt: today, updatedAt: today },
        { id: 't2', userId: 'u1', accountId: 'a1', plaidAccountId: 'p1', amount: 2200, date: today, name: 'Marriott', categoryId: 'TRAVEL_LODGING', status: 'posted', pending: false, isHidden: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [], createdAt: today, updatedAt: today },
        { id: 't3', userId: 'u1', accountId: 'a1', plaidAccountId: 'p1', amount: 600, date: today, name: 'Misc', categoryId: 'TRAVEL_OTHER', status: 'posted', pending: false, isHidden: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [], createdAt: today, updatedAt: today },
      ]);

      const result = await chatbotData.getSpendingByCategory(FAMILY_ID, '2026-04-01', '2026-04-30');

      // ONE row, representing the Travel tree
      const travelRows = result.filter(r => r.categoryId === 'TRAVEL');
      expect(travelRows).toHaveLength(1);
      expect(travelRows[0].amount).toBe(4800);
      expect(travelRows[0].aggregation_level).toBe('parent_rollup');
      expect(travelRows[0].transactionCount).toBe(3); // counts across parent + children

      // Children are NOT separate rows under the rollup
      expect(result.find(r => r.categoryId === 'TRAVEL_FLIGHTS')).toBeUndefined();
      expect(result.find(r => r.categoryId === 'TRAVEL_LODGING')).toBeUndefined();
      expect(result.find(r => r.categoryId === 'TRAVEL_OTHER')).toBeUndefined();
    });

    test('savings transactions are excluded from spending output', async () => {
      const today = '2026-04-15';
      await dataService.saveData(`transactions_${FAMILY_ID}`, [
        { id: 't1', userId: 'u1', accountId: 'a1', plaidAccountId: 'p1', amount: 1000, date: today, name: 'Vanguard', categoryId: 'RETIREMENT_401K', status: 'posted', pending: false, isHidden: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [], createdAt: today, updatedAt: today },
        { id: 't2', userId: 'u1', accountId: 'a1', plaidAccountId: 'p1', amount: 50, date: today, name: 'Coffee', categoryId: 'TRAVEL_OTHER', status: 'posted', pending: false, isHidden: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [], createdAt: today, updatedAt: today },
      ]);

      const result = await chatbotData.getSpendingByCategory(FAMILY_ID, '2026-04-01', '2026-04-30');
      expect(result.find(r => r.categoryId === 'RETIREMENT')).toBeUndefined();
      expect(result.find(r => r.categoryId === 'TRAVEL')?.amount).toBe(50);
    });
  });

  describe('getBudgetSummary', () => {
    test('BRD Travel scenario: rollup-aware budget total — parent budget covers tree', async () => {
      // Travel $5000 on parent only, no child budgets. Spending across children.
      await dataService.saveData(`budgets_${FAMILY_ID}`, [
        { id: 'b1', userId: 'u1', categoryId: 'TRAVEL', month: '2026-04', amount: 5000, createdAt: '2026-04-01', updatedAt: '2026-04-01' },
      ]);
      const today = '2026-04-15';
      await dataService.saveData(`transactions_${FAMILY_ID}`, [
        { id: 't1', userId: 'u1', accountId: 'a1', plaidAccountId: 'p1', amount: 4800, date: today, name: 'Trip', categoryId: 'TRAVEL_FLIGHTS', status: 'posted', pending: false, isHidden: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [], createdAt: today, updatedAt: today },
      ]);

      const result = await chatbotData.getBudgetSummary(FAMILY_ID, '2026-04');

      expect(result.totalBudgetedExpense).toBe(5000);  // parent budget
      expect(result.totalActualExpense).toBe(4800);    // child spending rolled up
      expect(result.expenseVariance).toBe(200);         // 5000 - 4800
    });

    test('both-level budgets: total uses max rule, not additive', async () => {
      // Utilities pattern: $228 parent + child budgets summing to $386.
      await dataService.saveCategories([
        ...seedCategories,
        { id: 'UTIL', name: 'Utilities', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
        { id: 'UTIL_ELEC', name: 'Electric', parentId: 'UTIL', isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
        { id: 'UTIL_WATER', name: 'Water', parentId: 'UTIL', isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
      ], FAMILY_ID);
      await dataService.saveData(`budgets_${FAMILY_ID}`, [
        { id: 'b1', userId: 'u1', categoryId: 'UTIL', month: '2026-04', amount: 228, createdAt: '2026-04-01', updatedAt: '2026-04-01' },
        { id: 'b2', userId: 'u1', categoryId: 'UTIL_ELEC', month: '2026-04', amount: 324, createdAt: '2026-04-01', updatedAt: '2026-04-01' },
        { id: 'b3', userId: 'u1', categoryId: 'UTIL_WATER', month: '2026-04', amount: 62, createdAt: '2026-04-01', updatedAt: '2026-04-01' },
      ]);

      const result = await chatbotData.getBudgetSummary(FAMILY_ID, '2026-04');
      // max(228, 324+62) = 386, NOT 228+324+62 = 614
      expect(result.totalBudgetedExpense).toBe(386);
    });

    test('savings asymmetry fix: savings budget appears in savings bucket, not expense', async () => {
      // The bug: pre-fix, a $500 RETIREMENT budget went into totalBudgetedExpense
      // while the actual $500 contribution was excluded from totalActualExpense.
      // Variance was therefore inflated. After the fix, both flow into savings.
      await dataService.saveData(`budgets_${FAMILY_ID}`, [
        { id: 'b1', userId: 'u1', categoryId: 'RETIREMENT', month: '2026-04', amount: 500, createdAt: '2026-04-01', updatedAt: '2026-04-01' },
        { id: 'b2', userId: 'u1', categoryId: 'TRAVEL', month: '2026-04', amount: 200, createdAt: '2026-04-01', updatedAt: '2026-04-01' },
      ]);
      const today = '2026-04-15';
      await dataService.saveData(`transactions_${FAMILY_ID}`, [
        { id: 't1', userId: 'u1', accountId: 'a1', plaidAccountId: 'p1', amount: 500, date: today, name: 'Vanguard', categoryId: 'RETIREMENT_401K', status: 'posted', pending: false, isHidden: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [], createdAt: today, updatedAt: today },
        { id: 't2', userId: 'u1', accountId: 'a1', plaidAccountId: 'p1', amount: 150, date: today, name: 'Hotel', categoryId: 'TRAVEL_LODGING', status: 'posted', pending: false, isHidden: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [], createdAt: today, updatedAt: today },
      ]);

      const result = await chatbotData.getBudgetSummary(FAMILY_ID, '2026-04');

      // Symmetric savings handling
      expect(result.totalBudgetedSavings).toBe(500);
      expect(result.totalActualSavings).toBe(500);

      // Spending bucket only contains the Travel data
      expect(result.totalBudgetedExpense).toBe(200);
      expect(result.totalActualExpense).toBe(150);
      expect(result.expenseVariance).toBe(50); // 200 - 150 (correct, not -300 like pre-fix)
    });

    test('income parents use rollup max rule too', async () => {
      // Income $80k parent + Base $70k child → max gives $80k, NOT additive $150k.
      await dataService.saveData(`budgets_${FAMILY_ID}`, [
        { id: 'b1', userId: 'u1', categoryId: 'INCOME', month: '2026-04', amount: 80000, createdAt: '2026-04-01', updatedAt: '2026-04-01' },
        { id: 'b2', userId: 'u1', categoryId: 'INCOME_BASE', month: '2026-04', amount: 70000, createdAt: '2026-04-01', updatedAt: '2026-04-01' },
      ]);

      const result = await chatbotData.getBudgetSummary(FAMILY_ID, '2026-04');
      expect(result.totalBudgetedIncome).toBe(80000);
    });
  });
});
