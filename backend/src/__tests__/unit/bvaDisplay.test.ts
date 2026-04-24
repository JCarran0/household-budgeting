import {
  toneSignedDelta,
  toneSignedRollover,
  computeAvailable,
  getVarianceTone,
} from '../../shared/utils/bvaDisplay';

describe('toneSignedDelta — BRD Revision 2', () => {
  test('spending: underspent → positive (favorable)', () => {
    expect(toneSignedDelta('spending', 800, 1000)).toBe(200);
  });

  test('spending: overspent → negative (unfavorable)', () => {
    expect(toneSignedDelta('spending', 1200, 1000)).toBe(-200);
  });

  test('income: over-earned → positive (favorable)', () => {
    expect(toneSignedDelta('income', 5500, 5000)).toBe(500);
  });

  test('income: under-earned → negative (unfavorable)', () => {
    expect(toneSignedDelta('income', 4500, 5000)).toBe(-500);
  });

  test('savings: over-saved → positive (favorable)', () => {
    expect(toneSignedDelta('savings', 800, 500)).toBe(300);
  });

  test('savings: under-saved → negative (unfavorable)', () => {
    expect(toneSignedDelta('savings', 300, 500)).toBe(-200);
  });

  test('on plan → 0 across all sections', () => {
    expect(toneSignedDelta('spending', 500, 500)).toBe(0);
    expect(toneSignedDelta('income', 500, 500)).toBe(0);
    expect(toneSignedDelta('savings', 500, 500)).toBe(0);
  });
});

describe('toneSignedRollover — BRD Revision 2', () => {
  // rawRollover uses Σ(budget − actual) convention from computeRolloverBalance.
  test('spending: positive raw (underspent historically) → positive favorable', () => {
    expect(toneSignedRollover('spending', 200)).toBe(200);
  });

  test('spending: negative raw → negative unfavorable', () => {
    expect(toneSignedRollover('spending', -300)).toBe(-300);
  });

  test('income: positive raw (under-earned historically) → negative unfavorable', () => {
    // raw = budget − actual. Positive = under-earned, which is bad for income.
    expect(toneSignedRollover('income', 500)).toBe(-500);
  });

  test('income: negative raw (over-earned historically) → positive favorable', () => {
    expect(toneSignedRollover('income', -500)).toBe(500);
  });

  test('savings: behaves like income', () => {
    expect(toneSignedRollover('savings', 200)).toBe(-200);
    expect(toneSignedRollover('savings', -300)).toBe(300);
  });

  test('zero raw → zero across sections', () => {
    expect(toneSignedRollover('spending', 0)).toBe(0);
    expect(toneSignedRollover('income', 0)).toBe(0);
    expect(toneSignedRollover('savings', 0)).toBe(0);
  });
});

describe('computeAvailable — BRD Revision 2', () => {
  test('toggle off: Available equals toneSignedDelta only; rollover ignored', () => {
    const v = computeAvailable('spending', 800, 1000, 500, false);
    expect(v).toBe(200);
  });

  test('toggle on with rollover: Available = delta + rollover', () => {
    // Spending: delta = 200 favorable. Rollover = 500 favorable. Available = 700.
    const v = computeAvailable('spending', 800, 1000, 500, true);
    expect(v).toBe(700);
  });

  test('toggle on with null rollover (non-rollover category): Available = delta', () => {
    const v = computeAvailable('spending', 800, 1000, null, true);
    expect(v).toBe(200);
  });

  test('income favorable + rollover favorable: both tone-signed positive', () => {
    // delta = actual − budget = 500 favorable. Rollover already tone-signed = 300 favorable.
    const v = computeAvailable('income', 5500, 5000, 300, true);
    expect(v).toBe(800);
  });

  test('spending overspent with favorable rollover: rollover offsets', () => {
    // Overspent by 200 this month. Rollover = 500 favorable carry. Net Available = 300.
    const v = computeAvailable('spending', 1200, 1000, 500, true);
    expect(v).toBe(300);
  });

  test('income shortfall with historic excess: rollover carries through', () => {
    // Under-earned 200 this month. Historic surplus 1000 tone-signed.
    // Available = −200 + 1000 = 800 favorable.
    const v = computeAvailable('income', 4800, 5000, 1000, true);
    expect(v).toBe(800);
  });

  test('negative rollover with toggle off does NOT drag Available down', () => {
    const v = computeAvailable('spending', 800, 1000, -500, false);
    expect(v).toBe(200);
  });
});

describe('getVarianceTone — retained for legacy colour paths', () => {
  test('still returns favorable / unfavorable / neutral as before', () => {
    expect(getVarianceTone('spending', 800, 1000)).toBe('favorable');
    expect(getVarianceTone('spending', 1200, 1000)).toBe('unfavorable');
    expect(getVarianceTone('spending', 1000, 1000)).toBe('neutral');
  });
});
