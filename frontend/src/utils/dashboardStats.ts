/**
 * Pure helper — builds the stat-card array for MantineDashboard.
 *
 * Accepts pre-computed values (calculated by useMemo in the page) so it has
 * no React/query dependencies and can be unit-tested without a DOM.
 */
import {
  IconCash,
  IconWallet,
  IconTrendingDown,
  IconTrendingUp,
  IconChartLine,
  IconBuildingBank,
  type Icon,
} from '@tabler/icons-react';
import { formatCurrency } from './formatters';
import type { YearEndForecast } from '../../../shared/utils/cashflowForecast';

export interface DashboardStat {
  title: string;
  value: string;
  exactValue: string;
  icon: Icon;
  color: string;
  description: string;
  formula: string;
}

export interface ProjectedTotals {
  forecast: YearEndForecast;
  futureMonths: number;
  hasBudget: boolean;
}

export interface BuildDashboardStatsParams {
  totalBalance: number;
  linkedBalance: number;
  manualBalance: number;
  totalAvailable: number;
  monthlySpending: number;
  monthlyIncome: number;
  monthlySavings: number;
  actualTotals: { income: number; expense: number; transfer: number; total: number };
  projectedTotals: ProjectedTotals | null;
}

export function buildDashboardStats(params: BuildDashboardStatsParams): DashboardStat[] {
  const {
    totalBalance,
    linkedBalance,
    manualBalance,
    totalAvailable,
    monthlySpending,
    monthlyIncome,
    monthlySavings,
    actualTotals,
    projectedTotals,
  } = params;

  const stats: DashboardStat[] = [
    {
      title: 'Net Worth',
      value: formatCurrency(totalBalance),
      exactValue: formatCurrency(totalBalance, true),
      icon: IconWallet,
      color: totalBalance >= 0 ? 'yellow' : 'red',
      description: 'Assets minus liabilities',
      formula: [
        'Assets − Liabilities, across linked + manual accounts.',
        `Linked (assets − loans/credit): ${formatCurrency(linkedBalance, true)}`,
        `Manual (assets − liabilities): ${formatCurrency(manualBalance, true)}`,
        `Total: ${formatCurrency(totalBalance, true)}`,
      ].join('\n'),
    },
    {
      title: 'Financial Assets',
      value: formatCurrency(totalAvailable),
      exactValue: formatCurrency(totalAvailable, true),
      icon: IconCash,
      color: 'green',
      description: 'Cash + investments in linked accounts',
      formula: [
        'Sum of available balance (or current if available is null) for asset',
        'accounts only — loans and credit cards are excluded.',
        '',
        'Currently includes linked accounts only. Manually-entered assets',
        '(including financial ones like a manual savings account) are not',
        'counted here, though they do count toward Net Worth.',
        '',
        `Total: ${formatCurrency(totalAvailable, true)}`,
      ].join('\n'),
    },
    {
      title: 'Monthly Spending',
      value: formatCurrency(monthlySpending),
      exactValue: formatCurrency(monthlySpending, true),
      icon: IconTrendingDown,
      color: 'red',
      description: 'This month',
      formula: [
        'Expenses − Savings contributions for the current month.',
        'Excludes transfers and hidden categories.',
        `Expenses: ${formatCurrency(actualTotals.expense, true)}`,
        `Savings:  ${formatCurrency(monthlySavings, true)}`,
        `Spending: ${formatCurrency(monthlySpending, true)}`,
      ].join('\n'),
    },
    {
      title: 'Monthly Savings',
      value: formatCurrency(monthlySavings),
      exactValue: formatCurrency(monthlySavings, true),
      icon: IconBuildingBank,
      color: 'teal',
      description: 'Savings this month',
      formula: [
        'Sum of transactions in categories flagged as Savings (isSavings),',
        'for the current month. Excludes transfers and hidden categories.',
        `Total: ${formatCurrency(monthlySavings, true)}`,
      ].join('\n'),
    },
    {
      title: 'Monthly Income',
      value: formatCurrency(monthlyIncome),
      exactValue: formatCurrency(monthlyIncome, true),
      icon: IconTrendingUp,
      color: 'blue',
      description: 'This month',
      formula: [
        'Sum of transactions in income categories for the current month.',
        'Excludes transfers and hidden categories.',
        `Total: ${formatCurrency(monthlyIncome, true)}`,
      ].join('\n'),
    },
  ];

  if (projectedTotals) {
    const { forecast, futureMonths, hasBudget } = projectedTotals;
    const totals = forecast.totals;
    const ytd = forecast.ytd;
    const future = forecast.future;
    const ytdMonths = forecast.cells.filter(c => c.mode === 'actual').length;

    stats.push(
      {
        title: 'Projected Savings',
        value: formatCurrency(totals.savings),
        exactValue: formatCurrency(totals.savings, true),
        icon: IconBuildingBank,
        color: totals.savings >= 0 ? 'teal' : 'red',
        description: hasBudget
          ? `${ytdMonths}mo actual + ${futureMonths}mo budgeted`
          : 'Based on YTD actuals only',
        formula: [
          'YTD actual savings + sum of budgeted savings for current and future months.',
          'Savings = transactions in categories flagged as Savings (isSavings).',
          'Excludes transfers and hidden categories.',
          'Refunds and reversals net within bucket (signed).',
          '',
          `YTD actuals (${ytdMonths} closed months):`,
          `  Savings: ${formatCurrency(ytd.savings, true)}`,
          '',
          hasBudget
            ? `Budgeted (${futureMonths} months — current + future, from yearly budgets):`
            : `No budgets set for remaining months — projection is YTD only.`,
          ...(hasBudget ? [
            `  Savings: ${formatCurrency(future.savings, true)}`,
          ] : []),
          '',
          `Projected: ${formatCurrency(totals.savings, true)}`,
        ].join('\n'),
      },
      {
        title: 'Projected Net Cashflow',
        value: formatCurrency(totals.netCashflow),
        exactValue: formatCurrency(totals.netCashflow, true),
        icon: IconChartLine,
        color: totals.netCashflow >= 0 ? 'teal' : 'red',
        description: hasBudget
          ? `${ytdMonths}mo actual + ${futureMonths}mo budgeted`
          : 'Based on YTD actuals only',
        formula: [
          'YTD actual + budgeted Net Cashflow for current and future months.',
          'Net Cashflow = Income − Spending − Savings.',
          'Spending excludes savings, transfers, and hidden categories.',
          'Refunds and reversals net within bucket (signed).',
          '',
          `YTD actuals (${ytdMonths} closed months):`,
          `  Income:   ${formatCurrency(ytd.income, true)}`,
          `  Spending: ${formatCurrency(ytd.spending, true)}`,
          `  Savings:  ${formatCurrency(ytd.savings, true)}`,
          `  Net:      ${formatCurrency(ytd.netCashflow, true)}`,
          '',
          hasBudget
            ? `Budgeted (${futureMonths} months — current + future, from yearly budgets):`
            : `No budgets set for remaining months — projection is YTD only.`,
          ...(hasBudget ? [
            `  Income:   ${formatCurrency(future.income, true)}`,
            `  Spending: ${formatCurrency(future.spending, true)}`,
            `  Savings:  ${formatCurrency(future.savings, true)}`,
            `  Net:      ${formatCurrency(future.netCashflow, true)}`,
          ] : []),
          '',
          `Projected: ${formatCurrency(totals.netCashflow, true)}`,
        ].join('\n'),
      },
    );
  }

  return stats;
}
