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
      // Exclude the current (partial) month to avoid an incomplete-income "spending gap".
      const yearStart = startOfYear(now);
      const rangeEnd = endOfMonth(subMonths(now, 1));
      return {
        startDate: format(yearStart, 'yyyy-MM-dd'),
        endDate: format(rangeEnd, 'yyyy-MM-dd'),
        startMonth: format(yearStart, 'yyyy-MM'),
        endMonth: format(rangeEnd, 'yyyy-MM')
      };
    }
    case 'last3':
    case 'last6':
    case 'last12': {
      // N complete months ending with the prior month (exclusive of current).
      const months = parseInt(option.replace('last', ''));
      const rangeEnd = endOfMonth(subMonths(now, 1));
      const rangeStart = startOfMonth(subMonths(now, months));
      return {
        startDate: format(rangeStart, 'yyyy-MM-dd'),
        endDate: format(rangeEnd, 'yyyy-MM-dd'),
        startMonth: format(rangeStart, 'yyyy-MM'),
        endMonth: format(rangeEnd, 'yyyy-MM')
      };
    }
    default: {
      // Default to last 6 complete months for backwards compatibility
      const rangeEnd = endOfMonth(subMonths(now, 1));
      const rangeStart = startOfMonth(subMonths(now, 6));
      return {
        startDate: format(rangeStart, 'yyyy-MM-dd'),
        endDate: format(rangeEnd, 'yyyy-MM-dd'),
        startMonth: format(rangeStart, 'yyyy-MM'),
        endMonth: format(rangeEnd, 'yyyy-MM')
      };
    }
  }
}
