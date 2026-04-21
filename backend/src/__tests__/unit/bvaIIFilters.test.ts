import { classifyAvailable } from '../../shared/utils/bvaIIFilters';

describe('classifyAvailable — BRD Revision 2 filters', () => {
  test('filter=all always includes, never de-emphasizes', () => {
    const result = classifyAvailable({
      section: 'spending',
      parent: { budgeted: 100, available: 0 },
      children: [{ categoryId: 'C1', budgeted: 50, available: 0 }],
      filter: 'all',
    });
    expect(result).toEqual({ include: true, deEmphasizedChildIds: new Set() });
  });

  test('under: matches rows with Available > 0', () => {
    const result = classifyAvailable({
      section: 'spending',
      parent: { budgeted: 100, available: 40 },
      children: [],
      filter: 'under',
    });
    expect(result.include).toBe(true);
  });

  test('over: matches rows with Available < 0', () => {
    const result = classifyAvailable({
      section: 'spending',
      parent: { budgeted: 100, available: -20 },
      children: [],
      filter: 'over',
    });
    expect(result.include).toBe(true);
  });

  test('over: Available = 0 does not match (neutral is not unfavorable)', () => {
    const result = classifyAvailable({
      section: 'spending',
      parent: { budgeted: 100, available: 0 },
      children: [],
      filter: 'over',
    });
    expect(result.include).toBe(false);
  });

  test('spending serious: requires Available < −2 × Budgeted', () => {
    const exactlyAtThreshold = classifyAvailable({
      section: 'spending',
      parent: { budgeted: 100, available: -200 }, // exactly −2 × 100 — not strictly less
      children: [],
      filter: 'serious',
    });
    expect(exactlyAtThreshold.include).toBe(false);

    const serious = classifyAvailable({
      section: 'spending',
      parent: { budgeted: 100, available: -201 },
      children: [],
      filter: 'serious',
    });
    expect(serious.include).toBe(true);
  });

  test('spending serious: budgeted=0 never matches', () => {
    const result = classifyAvailable({
      section: 'spending',
      parent: { budgeted: 0, available: -500 },
      children: [],
      filter: 'serious',
    });
    expect(result.include).toBe(false);
  });

  test('income serious: requires Available < −(2/3) × Budgeted', () => {
    // budget 500. threshold: Available < -333.33. Try −334 → serious.
    const serious = classifyAvailable({
      section: 'income',
      parent: { budgeted: 500, available: -334 },
      children: [],
      filter: 'serious',
    });
    expect(serious.include).toBe(true);

    const notSerious = classifyAvailable({
      section: 'income',
      parent: { budgeted: 500, available: -300 },
      children: [],
      filter: 'serious',
    });
    expect(notSerious.include).toBe(false);
  });

  test('savings serious: same threshold as income', () => {
    const serious = classifyAvailable({
      section: 'savings',
      parent: { budgeted: 600, available: -401 },
      children: [],
      filter: 'serious',
    });
    expect(serious.include).toBe(true);
  });

  test('child match: parent included, non-matching siblings de-emphasized', () => {
    const result = classifyAvailable({
      section: 'spending',
      parent: { budgeted: 200, available: 10 },
      children: [
        { categoryId: 'OVER', budgeted: 50, available: -30 },
        { categoryId: 'UNDER', budgeted: 50, available: 40 },
      ],
      filter: 'over',
    });
    expect(result.include).toBe(true);
    expect(result.deEmphasizedChildIds).toEqual(new Set(['UNDER']));
  });

  test('no child match + parent no match: excluded', () => {
    const result = classifyAvailable({
      section: 'spending',
      parent: { budgeted: 100, available: 50 }, // favorable
      children: [
        { categoryId: 'C1', budgeted: 50, available: 10 },
        { categoryId: 'C2', budgeted: 50, available: 20 },
      ],
      filter: 'over',
    });
    expect(result.include).toBe(false);
  });

  test('parent matches with no child match: included, no de-emphasis set', () => {
    const result = classifyAvailable({
      section: 'spending',
      parent: { budgeted: 100, available: -30 },
      children: [], // no children
      filter: 'over',
    });
    expect(result.include).toBe(true);
    expect(result.deEmphasizedChildIds.size).toBe(0);
  });

  test('under filter with income: positive Available means over-earned = favorable', () => {
    const result = classifyAvailable({
      section: 'income',
      parent: { budgeted: 5000, available: 300 },
      children: [],
      filter: 'under',
    });
    expect(result.include).toBe(true);
  });

  test('over filter with income: negative Available means short of target = unfavorable', () => {
    const result = classifyAvailable({
      section: 'income',
      parent: { budgeted: 5000, available: -500 },
      children: [],
      filter: 'over',
    });
    expect(result.include).toBe(true);
  });
});
