import { classifyVariance, classifyTreeVariance } from '../../shared/utils/bvaIIFilters';
import type { TreeAggregation } from '../../shared/utils/budgetCalculations';

function baseTree(overrides: Partial<TreeAggregation>): TreeAggregation {
  return {
    parentId: 'P',
    parentName: 'Parent',
    isIncome: false,
    directBudget: 0,
    childBudgetSum: 0,
    effectiveBudget: 0,
    directActual: 0,
    childActualSum: 0,
    effectiveActual: 0,
    children: [],
    ...overrides,
  };
}

describe('classifyVariance — BvA II filter composition', () => {
  test('filter=all always includes, never expands, never de-emphasizes', () => {
    const result = classifyVariance({
      section: 'spending',
      parent: { actual: 100, budgeted: 100 },
      children: [{ categoryId: 'C1', actual: 50, budgeted: 50 }],
      filter: 'all',
    });
    expect(result).toEqual({
      include: true,
      autoExpand: false,
      deEmphasizedChildIds: new Set(),
    });
  });

  test('spending over: matches when actual > budgeted at parent level only', () => {
    const result = classifyVariance({
      section: 'spending',
      parent: { actual: 200, budgeted: 100 },
      children: [],
      filter: 'over',
    });
    expect(result.include).toBe(true);
    expect(result.autoExpand).toBe(false);
  });

  test('spending over: child match auto-expands parent; non-match sibling de-emphasized', () => {
    const result = classifyVariance({
      section: 'spending',
      parent: { actual: 90, budgeted: 100 },
      children: [
        { categoryId: 'OVER', actual: 80, budgeted: 50 },   // over
        { categoryId: 'UNDER', actual: 10, budgeted: 50 },  // under — de-emphasize
      ],
      filter: 'over',
    });
    expect(result.include).toBe(true);
    expect(result.autoExpand).toBe(true);
    expect(result.deEmphasizedChildIds).toEqual(new Set(['UNDER']));
  });

  test('spending serious: 200% threshold requires actual > 3× budgeted', () => {
    // Right at the threshold — 300 == 3*100 → NOT serious (strictly greater).
    const notSerious = classifyVariance({
      section: 'spending',
      parent: { actual: 300, budgeted: 100 },
      children: [],
      filter: 'serious',
    });
    expect(notSerious.include).toBe(false);

    const serious = classifyVariance({
      section: 'spending',
      parent: { actual: 301, budgeted: 100 },
      children: [],
      filter: 'serious',
    });
    expect(serious.include).toBe(true);
  });

  test('spending serious: budgeted=0 is NOT serious (division undefined)', () => {
    const result = classifyVariance({
      section: 'spending',
      parent: { actual: 500, budgeted: 0 },
      children: [],
      filter: 'serious',
    });
    expect(result.include).toBe(false);
  });

  test('income over: matches rows where actual < budgeted (falling short of target)', () => {
    // For income, "Over budget" means bad direction = actual < budgeted.
    const result = classifyVariance({
      section: 'income',
      parent: { actual: 3000, budgeted: 5000 },
      children: [],
      filter: 'over',
    });
    expect(result.include).toBe(true);
  });

  test('income under: matches rows where actual > budgeted (exceeding income target)', () => {
    const result = classifyVariance({
      section: 'income',
      parent: { actual: 7000, budgeted: 5000 },
      children: [],
      filter: 'under',
    });
    expect(result.include).toBe(true);
  });

  test('savings serious: actual < budgeted / 3', () => {
    // $500 budget, $160 actual → 160 < 500/3 = 166.67 → serious.
    const serious = classifyVariance({
      section: 'savings',
      parent: { actual: 160, budgeted: 500 },
      children: [],
      filter: 'serious',
    });
    expect(serious.include).toBe(true);

    // $500 budget, $170 actual → 170 > 166.67 → not quite serious.
    const notSerious = classifyVariance({
      section: 'savings',
      parent: { actual: 170, budgeted: 500 },
      children: [],
      filter: 'serious',
    });
    expect(notSerious.include).toBe(false);
  });

  test('no children match + parent does not match → excluded entirely', () => {
    const result = classifyVariance({
      section: 'spending',
      parent: { actual: 50, budgeted: 100 }, // under — not "over"
      children: [
        { categoryId: 'C1', actual: 20, budgeted: 50 },
        { categoryId: 'C2', actual: 30, budgeted: 50 },
      ],
      filter: 'over',
    });
    expect(result.include).toBe(false);
  });

  test('classifyTreeVariance adapts a TreeAggregation directly', () => {
    const tree = baseTree({
      effectiveActual: 200,
      effectiveBudget: 100,
      children: [
        { categoryId: 'C1', categoryName: 'Child', budgeted: 100, actual: 200 },
      ],
    });
    const result = classifyTreeVariance(tree, 'spending', 'over');
    expect(result.include).toBe(true);
    expect(result.autoExpand).toBe(true);
  });

  test('child match on spending over leaves sibling with equal actual/budgeted de-emphasized', () => {
    const result = classifyVariance({
      section: 'spending',
      parent: { actual: 150, budgeted: 200 },
      children: [
        { categoryId: 'OVER', actual: 120, budgeted: 100 },  // over
        { categoryId: 'EQUAL', actual: 30, budgeted: 30 },   // neutral — not "over"
      ],
      filter: 'over',
    });
    expect(result.include).toBe(true);
    expect(result.autoExpand).toBe(true);
    expect(result.deEmphasizedChildIds).toEqual(new Set(['EQUAL']));
  });
});
