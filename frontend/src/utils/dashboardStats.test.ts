import { describe, it, expect } from 'vitest';
import { buildDashboardStats } from './dashboardStats';
import type { BuildDashboardStatsParams, ProjectedTotals } from './dashboardStats';
import type { YearEndForecast, YearForecastCell } from '../../../shared/utils/cashflowForecast';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeActualCell(monthIndex: number): YearForecastCell {
  return {
    monthKey: `2026-${String(monthIndex + 1).padStart(2, '0')}`,
    monthIndex,
    monthLabel: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][monthIndex],
    mode: 'actual',
    income: 5000,
    spending: 3000,
    savings: 500,
    netCashflow: 1500,
  };
}

function makeBudgetedCell(monthIndex: number): YearForecastCell {
  return {
    monthKey: `2026-${String(monthIndex + 1).padStart(2, '0')}`,
    monthIndex,
    monthLabel: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][monthIndex],
    mode: 'budgeted',
    income: 5000,
    spending: 3000,
    savings: 500,
    netCashflow: 1500,
  };
}

function makeForecast(overrides?: Partial<YearEndForecast>): YearEndForecast {
  const cells: YearForecastCell[] = [
    ...Array.from({ length: 4 }, (_, i) => makeActualCell(i)),      // Jan–Apr actual
    ...Array.from({ length: 8 }, (_, i) => makeBudgetedCell(i + 4)), // May–Dec budgeted
  ];
  return {
    year: 2026,
    currentMonthKey: '2026-04',
    cells,
    totals: { income: 60000, spending: 36000, savings: 6000, netCashflow: 18000 },
    ytd: { income: 20000, spending: 12000, savings: 2000, netCashflow: 6000 },
    future: { income: 40000, spending: 24000, savings: 4000, netCashflow: 12000 },
    ...overrides,
  };
}

function makeProjectedTotals(overrides?: Partial<ProjectedTotals>): ProjectedTotals {
  const forecast = makeForecast();
  return {
    forecast,
    futureMonths: forecast.cells.filter(c => c.mode === 'budgeted').length,
    hasBudget: true,
    ...overrides,
  };
}

function makeBaseParams(overrides?: Partial<BuildDashboardStatsParams>): BuildDashboardStatsParams {
  return {
    totalBalance: 50000,
    linkedBalance: 45000,
    manualBalance: 5000,
    totalAvailable: 40000,
    monthlySpending: 3000,
    monthlyIncome: 5000,
    monthlySavings: 500,
    actualTotals: { income: 5000, expense: 3500, transfer: 0, total: 1500 },
    projectedTotals: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildDashboardStats — 5-stat default (no projection)', () => {
  it('returns exactly 5 stats when projectedTotals is null', () => {
    const stats = buildDashboardStats(makeBaseParams({ projectedTotals: null }));
    expect(stats).toHaveLength(5);
  });

  it('stat titles are in the correct order', () => {
    const stats = buildDashboardStats(makeBaseParams({ projectedTotals: null }));
    expect(stats.map(s => s.title)).toEqual([
      'Net Worth',
      'Financial Assets',
      'Monthly Spending',
      'Monthly Savings',
      'Monthly Income',
    ]);
  });

  it('net worth is red when totalBalance is negative', () => {
    const stats = buildDashboardStats(makeBaseParams({ totalBalance: -1000 }));
    const netWorth = stats.find(s => s.title === 'Net Worth')!;
    expect(netWorth.color).toBe('red');
  });

  it('net worth is yellow when totalBalance is zero or positive', () => {
    const stats = buildDashboardStats(makeBaseParams({ totalBalance: 0 }));
    expect(stats.find(s => s.title === 'Net Worth')!.color).toBe('yellow');

    const stats2 = buildDashboardStats(makeBaseParams({ totalBalance: 10000 }));
    expect(stats2.find(s => s.title === 'Net Worth')!.color).toBe('yellow');
  });
});

describe('buildDashboardStats — 7-stat with projection and budget', () => {
  it('returns 7 stats when projectedTotals is non-null', () => {
    const stats = buildDashboardStats(makeBaseParams({ projectedTotals: makeProjectedTotals() }));
    expect(stats).toHaveLength(7);
  });

  it('appends Projected Savings and Projected Net Cashflow as last two stats', () => {
    const stats = buildDashboardStats(makeBaseParams({ projectedTotals: makeProjectedTotals() }));
    expect(stats[5].title).toBe('Projected Savings');
    expect(stats[6].title).toBe('Projected Net Cashflow');
  });

  it('Projected Savings description shows ytd + future months when hasBudget is true', () => {
    const proj = makeProjectedTotals({ hasBudget: true });
    const ytdMonths = proj.forecast.cells.filter(c => c.mode === 'actual').length; // 4
    const stats = buildDashboardStats(makeBaseParams({ projectedTotals: proj }));
    const projSavings = stats.find(s => s.title === 'Projected Savings')!;
    expect(projSavings.description).toBe(`${ytdMonths}mo actual + ${proj.futureMonths}mo budgeted`);
  });

  it('Projected Savings description is "Based on YTD actuals only" when hasBudget is false', () => {
    const proj = makeProjectedTotals({ hasBudget: false });
    const stats = buildDashboardStats(makeBaseParams({ projectedTotals: proj }));
    const projSavings = stats.find(s => s.title === 'Projected Savings')!;
    expect(projSavings.description).toBe('Based on YTD actuals only');
  });

  it('Projected Savings formula omits budgeted block when hasBudget is false', () => {
    const proj = makeProjectedTotals({ hasBudget: false });
    const stats = buildDashboardStats(makeBaseParams({ projectedTotals: proj }));
    const projSavings = stats.find(s => s.title === 'Projected Savings')!;
    expect(projSavings.formula).toContain('No budgets set for remaining months');
    // The "Budgeted (" line should not appear
    expect(projSavings.formula).not.toContain('Budgeted (');
  });
});

describe('buildDashboardStats — color flips on negative projections', () => {
  it('Projected Net Cashflow color is red when netCashflow < 0', () => {
    const forecast = makeForecast({ totals: { income: 36000, spending: 40000, savings: 6000, netCashflow: -10000 } });
    const proj = makeProjectedTotals({ forecast });
    const stats = buildDashboardStats(makeBaseParams({ projectedTotals: proj }));
    const projNet = stats.find(s => s.title === 'Projected Net Cashflow')!;
    expect(projNet.color).toBe('red');
  });

  it('Projected Net Cashflow color is teal when netCashflow >= 0', () => {
    const forecast = makeForecast({ totals: { income: 60000, spending: 36000, savings: 6000, netCashflow: 18000 } });
    const proj = makeProjectedTotals({ forecast });
    const stats = buildDashboardStats(makeBaseParams({ projectedTotals: proj }));
    const projNet = stats.find(s => s.title === 'Projected Net Cashflow')!;
    expect(projNet.color).toBe('teal');
  });

  it('Projected Savings color is red when savings < 0', () => {
    const forecast = makeForecast({ totals: { income: 60000, spending: 36000, savings: -500, netCashflow: 18500 } });
    const proj = makeProjectedTotals({ forecast });
    const stats = buildDashboardStats(makeBaseParams({ projectedTotals: proj }));
    const projSavings = stats.find(s => s.title === 'Projected Savings')!;
    expect(projSavings.color).toBe('red');
  });

  it('Projected Savings color is teal when savings >= 0', () => {
    const forecast = makeForecast({ totals: { income: 60000, spending: 36000, savings: 0, netCashflow: 24000 } });
    const proj = makeProjectedTotals({ forecast });
    const stats = buildDashboardStats(makeBaseParams({ projectedTotals: proj }));
    const projSavings = stats.find(s => s.title === 'Projected Savings')!;
    expect(projSavings.color).toBe('teal');
  });
});
