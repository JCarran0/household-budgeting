import { format, subMonths, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';

export interface DateRange {
  startDate: string;
  endDate: string;
  startMonth: string;
  endMonth: string;
}

/** Convert a time range option string to concrete date boundaries. */
export function getDateRange(option: string): DateRange {
  const now = new Date();

  switch(option) {
    case 'thisMonth': {
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);
      return {
        startDate: format(monthStart, 'yyyy-MM-dd'),
        endDate: format(monthEnd, 'yyyy-MM-dd'),
        startMonth: format(monthStart, 'yyyy-MM'),
        endMonth: format(monthEnd, 'yyyy-MM')
      };
    }
    case 'lastMonth': {
      const lastMonth = subMonths(now, 1);
      const monthStart = startOfMonth(lastMonth);
      const monthEnd = endOfMonth(lastMonth);
      return {
        startDate: format(monthStart, 'yyyy-MM-dd'),
        endDate: format(monthEnd, 'yyyy-MM-dd'),
        startMonth: format(monthStart, 'yyyy-MM'),
        endMonth: format(monthEnd, 'yyyy-MM')
      };
    }
    case 'thisYear': {
      const yearStart = startOfYear(now);
      const yearEnd = endOfYear(now);
      return {
        startDate: format(yearStart, 'yyyy-MM-dd'),
        endDate: format(yearEnd, 'yyyy-MM-dd'),
        startMonth: format(yearStart, 'yyyy-MM'),
        endMonth: format(yearEnd, 'yyyy-MM')
      };
    }
    case 'yearToDate': {
      const yearStart = startOfYear(now);
      return {
        startDate: format(yearStart, 'yyyy-MM-dd'),
        endDate: format(now, 'yyyy-MM-dd'),
        startMonth: format(yearStart, 'yyyy-MM'),
        endMonth: format(now, 'yyyy-MM')
      };
    }
    case 'last3':
    case 'last6':
    case 'last12': {
      const months = parseInt(option.replace('last', ''));
      const startDate = subMonths(now, months);
      return {
        startDate: format(startDate, 'yyyy-MM-dd'),
        endDate: format(now, 'yyyy-MM-dd'),
        startMonth: format(startDate, 'yyyy-MM'),
        endMonth: format(now, 'yyyy-MM')
      };
    }
    default: {
      // Default to last 6 months for backwards compatibility
      const startDate = subMonths(now, 6);
      return {
        startDate: format(startDate, 'yyyy-MM-dd'),
        endDate: format(now, 'yyyy-MM-dd'),
        startMonth: format(startDate, 'yyyy-MM'),
        endMonth: format(now, 'yyyy-MM')
      };
    }
  }
}
