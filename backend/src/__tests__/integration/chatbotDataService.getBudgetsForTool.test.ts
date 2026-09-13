/**
 * ChatbotDataService — getBudgetsForTool
 *
 * Regression coverage for the budget confabulation incident documented in
 * AI-CAPABILITY-PLATFORM-BRD §15.1: asked about a category with no budget set,
 * the assistant stated a plausible dollar figure that existed nowhere in the data.
 *
 * The two tool-design defects that made that likely:
 *   1. Results carried categoryId but no name, forcing a join against
 *      get_categories (SEC-P032).
 *   2. A category with no budget row was simply absent from the result, so
 *      "no budget is set" was indistinguishable from "the lookup found nothing"
 *      (SEC-P033).
 *
 * These tests assert the model is handed an unambiguous answer in both cases.
 */

import { ChatbotDataService } from '../../services/chatbotDataService';
import { ReadOnlyDataServiceImpl } from '../../services/readOnlyDataService';
import { InMemoryDataService } from '../../services/dataService';
import type { Category } from '../../shared/types';

describe('ChatbotDataService — getBudgetsForTool (BRD §15.1, SEC-P032/P033)', () => {
  const FAMILY_ID = 'fam-test';
  const MONTH = '2026-09';

  let dataService: InMemoryDataService;
  let chatbotData: ChatbotDataService;

  const cat = (id: string, name: string, parentId: string | null): Category => ({
    id, name, parentId,
    isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false,
  });

  const seedCategories: Category[] = [
    cat('AUTO', 'Auto & Transport', null),
    cat('AUTO_MAINTENANCE', 'Maintenance', 'AUTO'),
    cat('AUTO_GAS', 'Gas', 'AUTO'),
    cat('FOOD', 'Food & Drink', null),
    cat('FOOD_GROCERIES', 'Groceries', 'FOOD'),
  ];

  beforeEach(async () => {
    dataService = new InMemoryDataService();
    chatbotData = new ChatbotDataService(new ReadOnlyDataServiceImpl(dataService));
    await dataService.saveCategories(seedCategories, FAMILY_ID);
    // Groceries is budgeted; Maintenance deliberately is NOT — the incident shape.
    await dataService.saveData(`budgets_${FAMILY_ID}`, [
      { id: 'b1', userId: 'u1', categoryId: 'FOOD_GROCERIES', month: MONTH, amount: 900, createdAt: MONTH, updatedAt: MONTH },
    ]);
  });

  describe('explicit absence (SEC-P033)', () => {
    test('incident repro: an unbudgeted category returns hasBudget=false, not an empty result', async () => {
      const result = await chatbotData.getBudgetsForTool(FAMILY_ID, MONTH, 'maintenance');

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0]).toMatchObject({
        categoryId: 'AUTO_MAINTENANCE',
        hasBudget: false,
        budgetedAmount: 0,
      });
      // The distinction that matters: the category was found, and it has no budget.
      // An empty `lines` array would be indistinguishable from a failed lookup.
      expect(result.categoriesWithoutBudget).toBe(1);
    });

    test('a budgeted category returns hasBudget=true with its amount', async () => {
      const result = await chatbotData.getBudgetsForTool(FAMILY_ID, MONTH, 'groceries');

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0]).toMatchObject({ hasBudget: true, budgetedAmount: 900 });
      expect(result.categoriesWithoutBudget).toBe(0);
    });

    test('a query matching nothing returns no lines — distinct from an unbudgeted match', async () => {
      const result = await chatbotData.getBudgetsForTool(FAMILY_ID, MONTH, 'subaru');

      expect(result.lines).toHaveLength(0);
      expect(result.categoriesWithoutBudget).toBe(0);
    });

    test('unfiltered results report how many categories were omitted for having no budget', async () => {
      const result = await chatbotData.getBudgetsForTool(FAMILY_ID, MONTH);

      expect(result.lines.map(l => l.categoryId)).toEqual(['FOOD_GROCERIES']);
      // 4 visible categories carry no budget — the model is told the list is partial.
      expect(result.categoriesWithoutBudget).toBe(4);
      expect(result.query).toBeNull();
    });
  });

  describe('resolved names (SEC-P032)', () => {
    test('every line carries name and full path so no join against get_categories is needed', async () => {
      const result = await chatbotData.getBudgetsForTool(FAMILY_ID, MONTH, 'maintenance');

      expect(result.lines[0].categoryName).toBe('Maintenance');
      expect(result.lines[0].categoryPath).toBe('Auto & Transport > Maintenance');
    });

    test('a top-level category path is just its own name', async () => {
      const result = await chatbotData.getBudgetsForTool(FAMILY_ID, MONTH, 'food & drink');

      const food = result.lines.find(l => l.categoryId === 'FOOD');
      expect(food?.categoryPath).toBe('Food & Drink');
    });
  });

  describe('query matching', () => {
    test('matches on parent path, returning the whole subtree', async () => {
      const result = await chatbotData.getBudgetsForTool(FAMILY_ID, MONTH, 'auto & transport');

      expect(result.lines.map(l => l.categoryId).sort()).toEqual(
        ['AUTO', 'AUTO_GAS', 'AUTO_MAINTENANCE'],
      );
      expect(result.lines.every(l => l.hasBudget === false)).toBe(true);
    });

    test('is case-insensitive and trims surrounding whitespace', async () => {
      const result = await chatbotData.getBudgetsForTool(FAMILY_ID, MONTH, '  GROCERIES  ');

      expect(result.lines).toHaveLength(1);
      expect(result.query).toBe('GROCERIES');
    });

    test('hidden categories are excluded from both lines and the omitted count', async () => {
      await dataService.saveCategories(
        [...seedCategories, { ...cat('AUTO_PARKING', 'Parking', 'AUTO'), isHidden: true }],
        FAMILY_ID,
      );

      const result = await chatbotData.getBudgetsForTool(FAMILY_ID, MONTH, 'auto & transport');

      expect(result.lines.map(l => l.categoryId)).not.toContain('AUTO_PARKING');
      expect(result.categoriesWithoutBudget).toBe(3);
    });
  });

  describe('month scoping', () => {
    test('a budget set in another month does not leak into this month', async () => {
      const result = await chatbotData.getBudgetsForTool(FAMILY_ID, '2026-10', 'groceries');

      expect(result.lines[0]).toMatchObject({ hasBudget: false, budgetedAmount: 0 });
    });
  });
});
