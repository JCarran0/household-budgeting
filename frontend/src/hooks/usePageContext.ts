import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { format, parse } from 'date-fns';

export interface PageContext {
  path: string;
  pageName: string;
  params: Record<string, string>;
  description: string;
}

const PAGE_NAMES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/accounts': 'Accounts',
  '/transactions': 'Transactions',
  '/categories': 'Categories',
  '/budgets': 'Budget',
  '/reports': 'Reports',
  '/trips': 'Trips',
  '/admin': 'Admin',
};

function formatMonth(monthStr: string): string {
  try {
    const date = parse(monthStr, 'yyyy-MM', new Date());
    return format(date, 'MMMM yyyy');
  } catch {
    return monthStr;
  }
}

const TIME_RANGE_LABELS: Record<string, string> = {
  // Reports time ranges
  thisMonth: 'this month',
  lastMonth: 'last month',
  thisYear: 'this year',
  yearToDate: 'year to date',
  last3: 'last 3 months',
  last6: 'last 6 months',
  last12: 'last 12 months',
  // Transaction date filters
  'this-month': 'this month',
  'last-month': 'last month',
  ytd: 'year to date',
  all: 'all time',
  custom: 'custom date range',
};

function buildDescription(path: string, pageName: string, params: Record<string, string>): string {
  const parts = [pageName, 'page'];

  if (path === '/budgets') {
    if (params.month) parts.push(`viewing ${formatMonth(params.month)}`);
    // Default tab is now 'bva-ii' — suppress the ambient mention and any
    // lingering references to the retired-in-UI 'budget' tab.
    if (params.view && params.view !== 'bva-ii' && params.view !== 'budget') {
      parts.push(`${params.view} view`);
    }
  } else if (path === '/reports') {
    if (params.type) parts.push(`showing ${params.type}`);
    if (params.timeRange) {
      const label = TIME_RANGE_LABELS[params.timeRange] || params.timeRange;
      parts.push(`for ${label}`);
    }
    if (params.tab && params.tab !== 'cashflow') parts.push(`${params.tab} tab`);
  } else if (path === '/transactions') {
    if (params.search) parts.push(`searching "${params.search}"`);
    if (params.categoryIds) parts.push('filtered by category');
    if (params.tags) parts.push(`tagged ${params.tags}`);
    if (params.txnType) parts.push(`${params.txnType} only`);
    if (params.uncategorized === 'true') parts.push('uncategorized only');
    if (params.dateFilter === 'custom' && params.startDate && params.endDate) {
      parts.push(`${params.startDate} to ${params.endDate}`);
    } else if (params.dateFilter) {
      const label = TIME_RANGE_LABELS[params.dateFilter] || params.dateFilter;
      parts.push(`for ${label}`);
    }
    if (params.accountId) parts.push('filtered by account');
  }

  return parts.join(', ');
}

export function usePageContext(): PageContext {
  const location = useLocation();

  return useMemo(() => {
    const path = location.pathname;
    const pageName = PAGE_NAMES[path] || path.replace('/', '').replace(/-/g, ' ');
    const params: Record<string, string> = {};
    const searchParams = new URLSearchParams(location.search);
    searchParams.forEach((value, key) => {
      params[key] = value;
    });

    return {
      path,
      pageName,
      params,
      description: buildDescription(path, pageName, params),
    };
  }, [location.pathname, location.search]);
}
