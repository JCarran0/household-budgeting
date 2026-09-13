/**
 * Unit tests for project line item attribution (PROJECTS-BRD.md §5.5.5).
 *
 * This is the calculation that turns "which tags are on this transaction" into
 * "what did each estimate actually cost", so the overlap and no-match cases are
 * the ones that matter — they are where a naive implementation quietly lies.
 */

import {
  computeLineItemSpending,
  slugifyLineItemTag,
} from '../../shared/utils/projectHelpers';

const items = [
  { id: 'li-cement', tag: 'cement' },
  { id: 'li-studs', tag: 'framing-studs' },
];

describe('computeLineItemSpending', () => {
  it('attributes a transaction to the line item whose tag it carries', () => {
    const { lineItemSpending, unattributedSpent } = computeLineItemSpending(items, [
      { amount: 412, tags: ['project:pantry:2026', 'cement'] },
    ]);

    expect(lineItemSpending[0]).toMatchObject({
      lineItemId: 'li-cement',
      actual: 412,
      matchCount: 1,
    });
    expect(lineItemSpending[1].actual).toBe(0);
    expect(lineItemSpending[1].matchCount).toBe(0);
    expect(unattributedSpent).toBe(0);
  });

  it('counts a multi-tagged transaction fully toward EVERY matching item', () => {
    // Deliberate per BRD §5.5.5: no apportioning. The consequence is that the
    // actuals column can exceed total spend, which is why it is never summed.
    const { lineItemSpending, unattributedSpent } = computeLineItemSpending(items, [
      { amount: 412, tags: ['cement', 'framing-studs'] },
    ]);

    expect(lineItemSpending[0].actual).toBe(412);
    expect(lineItemSpending[1].actual).toBe(412);
    expect(unattributedSpent).toBe(0);
  });

  it('reports spend carrying no line item tag as unattributed', () => {
    const { lineItemSpending, unattributedSpent } = computeLineItemSpending(items, [
      { amount: 100, tags: ['cement'] },
      { amount: 250, tags: ['project:pantry:2026'] },
      { amount: 75, tags: [] },
    ]);

    expect(lineItemSpending[0].actual).toBe(100);
    expect(unattributedSpent).toBe(325);
  });

  it('credits both items when two line items share a tag', () => {
    const shared = [
      { id: 'a', tag: 'tile' },
      { id: 'b', tag: 'tile' },
    ];
    const { lineItemSpending, unattributedSpent } = computeLineItemSpending(shared, [
      { amount: 60, tags: ['tile'] },
    ]);

    expect(lineItemSpending[0].actual).toBe(60);
    expect(lineItemSpending[1].actual).toBe(60);
    expect(unattributedSpent).toBe(0);
  });

  it('never matches on an empty tag — an untagged item must not sweep up everything', () => {
    const { lineItemSpending, unattributedSpent } = computeLineItemSpending(
      [{ id: 'blank', tag: '' }],
      [{ amount: 500, tags: ['project:pantry:2026'] }]
    );

    expect(lineItemSpending[0].actual).toBe(0);
    expect(lineItemSpending[0].matchCount).toBe(0);
    expect(unattributedSpent).toBe(500);
  });

  it('accumulates several transactions against one item and counts matches', () => {
    const { lineItemSpending } = computeLineItemSpending(items, [
      { amount: 300, tags: ['cement'] },
      { amount: 700, tags: ['cement'] },
    ]);

    expect(lineItemSpending[0].actual).toBe(1000);
    expect(lineItemSpending[0].matchCount).toBe(2);
  });

  it('nets a refund against the item it is tagged to', () => {
    // Signed accumulation, consistent with project totals.
    const { lineItemSpending } = computeLineItemSpending(items, [
      { amount: 300, tags: ['cement'] },
      { amount: -50, tags: ['cement'] },
    ]);

    expect(lineItemSpending[0].actual).toBe(250);
  });

  it('returns a zeroed row per item when there are no transactions', () => {
    const { lineItemSpending, unattributedSpent } = computeLineItemSpending(items, []);

    expect(lineItemSpending).toHaveLength(2);
    expect(lineItemSpending.every((r) => r.actual === 0 && r.matchCount === 0)).toBe(true);
    expect(unattributedSpent).toBe(0);
  });
});

describe('slugifyLineItemTag', () => {
  it('produces a usable tag for a short name', () => {
    expect(slugifyLineItemTag('Framing studs')).toBe('framing-studs');
  });

  it('produces an unusable tag for a long descriptive name', () => {
    // Documents exactly why name and tag are separate fields (BRD §5.5.3) —
    // this is real data from the Basement Pantry project.
    expect(
      slugifyLineItemTag('Actual Wall Cover (plywood, shiplap, bead board, etc.)')
    ).toBe('actual-wall-cover-plywood-shiplap-bead-board-etc');
  });

  it('strips colons so a line item tag cannot imitate a structured tag', () => {
    expect(slugifyLineItemTag('project:foo')).toBe('projectfoo');
  });
});
