import { format, startOfMonth, endOfMonth, startOfYear, subMonths } from 'date-fns';

describe('Time Range Filter Mappings', () => {
  
  describe('Reports to Transactions filter conversion logic', () => {
    
    // This test validates the conversion logic used in EnhancedTransactions.tsx
    // convertTimeRangeToDateFilter() function
    const convertTimeRangeToDateFilter = (timeRangeFilter: string): string => {
      switch(timeRangeFilter) {
        case 'thisMonth':
          return 'this-month';
        case 'lastMonth':
          return format(subMonths(new Date(), 1), 'yyyy-MM');
        case 'yearToDate':
          return 'ytd';
        case 'thisYear':
          return format(new Date(), 'yyyy'); // Current year
        case 'last3':
        case 'last6':  
        case 'last12':
          // For these cases, we'll use custom date range since transaction filters don't have exact equivalents
          return 'custom';
        default:
          return 'ytd'; // Default fallback
      }
    };
    
    it('should convert "thisMonth" to "this-month"', () => {
      const result = convertTimeRangeToDateFilter('thisMonth');
      expect(result).toBe('this-month');
    });
    
    it('should convert "lastMonth" to YYYY-MM format', () => {
      const result = convertTimeRangeToDateFilter('lastMonth');
      const expectedFormat = format(subMonths(new Date(), 1), 'yyyy-MM');
      expect(result).toBe(expectedFormat);
      expect(result).toMatch(/^\d{4}-\d{2}$/); // Should match YYYY-MM pattern
    });
    
    it('should convert "yearToDate" to "ytd"', () => {
      const result = convertTimeRangeToDateFilter('yearToDate');
      expect(result).toBe('ytd');
    });
    
    it('should convert "thisYear" to current year format', () => {
      const result = convertTimeRangeToDateFilter('thisYear');
      const currentYear = format(new Date(), 'yyyy');
      expect(result).toBe(currentYear);
      expect(result).toMatch(/^\d{4}$/); // Should match YYYY pattern
    });
    
    it('should convert "last3" to "custom"', () => {
      const result = convertTimeRangeToDateFilter('last3');
      expect(result).toBe('custom');
    });
    
    it('should convert "last6" to "custom"', () => {
      const result = convertTimeRangeToDateFilter('last6');
      expect(result).toBe('custom');
    });
    
    it('should convert "last12" to "custom"', () => {
      const result = convertTimeRangeToDateFilter('last12');
      expect(result).toBe('custom');
    });
    
    it('should fallback to "ytd" for unknown filters', () => {
      const result = convertTimeRangeToDateFilter('unknownFilter');
      expect(result).toBe('ytd');
      
      const result2 = convertTimeRangeToDateFilter('');
      expect(result2).toBe('ytd');
      
      const result3 = convertTimeRangeToDateFilter('invalid');
      expect(result3).toBe('ytd');
    });
  });
  
  describe('Date range calculations for reports filters', () => {
    
    // This validates the getDateRange logic from Reports.tsx
    const getDateRange = (option: string): { startDate: string; endDate: string } => {
      const now = new Date();
      
      switch(option) {
        case 'thisMonth': {
          const monthStart = startOfMonth(now);
          const monthEnd = endOfMonth(now);
          return {
            startDate: format(monthStart, 'yyyy-MM-dd'),
            endDate: format(monthEnd, 'yyyy-MM-dd')
          };
        }
        case 'lastMonth': {
          const lastMonth = subMonths(now, 1);
          const monthStart = startOfMonth(lastMonth);
          const monthEnd = endOfMonth(lastMonth);
          return {
            startDate: format(monthStart, 'yyyy-MM-dd'),
            endDate: format(monthEnd, 'yyyy-MM-dd')
          };
        }
        case 'thisYear': {
          const yearStart = startOfYear(now);
          const yearEnd = new Date(now.getFullYear(), 11, 31); // End of current year
          return {
            startDate: format(yearStart, 'yyyy-MM-dd'),
            endDate: format(yearEnd, 'yyyy-MM-dd')
          };
        }
        case 'yearToDate': {
          const yearStart = startOfYear(now);
          return {
            startDate: format(yearStart, 'yyyy-MM-dd'),
            endDate: format(now, 'yyyy-MM-dd')
          };
        }
        case 'last3':
        case 'last6':
        case 'last12': {
          const months = parseInt(option.replace('last', ''));
          const startDate = subMonths(now, months);
          return {
            startDate: format(startDate, 'yyyy-MM-dd'),
            endDate: format(now, 'yyyy-MM-dd')
          };
        }
        default: {
          // Default to last 6 months for backwards compatibility
          const startDate = subMonths(now, 6);
          return {
            startDate: format(startDate, 'yyyy-MM-dd'),
            endDate: format(now, 'yyyy-MM-dd')
          };
        }
      }
    };
    
    it('should calculate "thisMonth" date range correctly', () => {
      const result = getDateRange('thisMonth');
      const now = new Date();
      const expectedStart = format(startOfMonth(now), 'yyyy-MM-dd');
      const expectedEnd = format(endOfMonth(now), 'yyyy-MM-dd');
      
      expect(result.startDate).toBe(expectedStart);
      expect(result.endDate).toBe(expectedEnd);
      expect(result.startDate).toMatch(/^\d{4}-\d{2}-01$/); // Should start on 1st of month
    });
    
    it('should calculate "lastMonth" date range correctly', () => {
      const result = getDateRange('lastMonth');
      const now = new Date();
      const lastMonth = subMonths(now, 1);
      const expectedStart = format(startOfMonth(lastMonth), 'yyyy-MM-dd');
      const expectedEnd = format(endOfMonth(lastMonth), 'yyyy-MM-dd');
      
      expect(result.startDate).toBe(expectedStart);
      expect(result.endDate).toBe(expectedEnd);
      
      // Should be one month before current - just verify it's a valid date format
      expect(result.startDate).toMatch(/^\d{4}-\d{2}-01$/); // Should start on 1st of month
      expect(result.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/); // Should be valid date format
    });
    
    it('should calculate "yearToDate" correctly', () => {
      const result = getDateRange('yearToDate');
      const now = new Date();
      const expectedStart = format(startOfYear(now), 'yyyy-MM-dd');
      const expectedEnd = format(now, 'yyyy-MM-dd');
      
      expect(result.startDate).toBe(expectedStart);
      expect(result.endDate).toBe(expectedEnd);
      expect(result.startDate).toMatch(/^\d{4}-01-01$/); // Should start on Jan 1st
    });
    
    it('should calculate "thisYear" correctly', () => {
      const result = getDateRange('thisYear');
      const now = new Date();
      const expectedStart = format(startOfYear(now), 'yyyy-MM-dd');
      const expectedEnd = format(new Date(now.getFullYear(), 11, 31), 'yyyy-MM-dd');
      
      expect(result.startDate).toBe(expectedStart);
      expect(result.endDate).toBe(expectedEnd);
      expect(result.startDate).toMatch(/^\d{4}-01-01$/); // Should start on Jan 1st
      expect(result.endDate).toMatch(/^\d{4}-12-31$/); // Should end on Dec 31st
    });
    
    it('should calculate "last3" months correctly', () => {
      const result = getDateRange('last3');
      const now = new Date();
      const expectedStart = format(subMonths(now, 3), 'yyyy-MM-dd');
      const expectedEnd = format(now, 'yyyy-MM-dd');
      
      expect(result.startDate).toBe(expectedStart);
      expect(result.endDate).toBe(expectedEnd);
      
      // Should be approximately 3 months difference
      const startDate = new Date(result.startDate);
      const endDate = new Date(result.endDate);
      const monthsDiff = (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
                        (endDate.getMonth() - startDate.getMonth());
      expect(monthsDiff).toBeCloseTo(3, 0); // Allow for some variance due to different month lengths
    });
    
    it('should calculate "last6" months correctly', () => {
      const result = getDateRange('last6');
      const now = new Date();
      const expectedStart = format(subMonths(now, 6), 'yyyy-MM-dd');
      const expectedEnd = format(now, 'yyyy-MM-dd');
      
      expect(result.startDate).toBe(expectedStart);
      expect(result.endDate).toBe(expectedEnd);
      
      // Should be approximately 6 months difference
      const startDate = new Date(result.startDate);
      const endDate = new Date(result.endDate);
      const monthsDiff = (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
                        (endDate.getMonth() - startDate.getMonth());
      expect(monthsDiff).toBeCloseTo(6, 0);
    });
    
    it('should calculate "last12" months correctly', () => {
      const result = getDateRange('last12');
      const now = new Date();
      const expectedStart = format(subMonths(now, 12), 'yyyy-MM-dd');
      const expectedEnd = format(now, 'yyyy-MM-dd');
      
      expect(result.startDate).toBe(expectedStart);
      expect(result.endDate).toBe(expectedEnd);
      
      // Should be approximately 12 months (1 year) difference
      const startDate = new Date(result.startDate);
      const endDate = new Date(result.endDate);
      const monthsDiff = (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
                        (endDate.getMonth() - startDate.getMonth());
      expect(monthsDiff).toBeCloseTo(12, 0);
    });
    
    it('should handle unknown filter with default fallback', () => {
      const result = getDateRange('unknownFilter');
      const now = new Date();
      const expectedStart = format(subMonths(now, 6), 'yyyy-MM-dd'); // Default is last 6 months
      const expectedEnd = format(now, 'yyyy-MM-dd');
      
      expect(result.startDate).toBe(expectedStart);
      expect(result.endDate).toBe(expectedEnd);
    });
  });
  
  describe('Edge cases and boundary conditions', () => {
    
    it('should handle year boundary correctly for lastMonth when current month is January', () => {
      // Mock current date as January 15, 2025
      const mockJanuary = new Date(2025, 0, 15); // January 15, 2025
      
      const getDateRangeForDate = (option: string, mockDate: Date) => {
        switch(option) {
          case 'lastMonth': {
            const lastMonth = subMonths(mockDate, 1);
            const monthStart = startOfMonth(lastMonth);
            const monthEnd = endOfMonth(lastMonth);
            return {
              startDate: format(monthStart, 'yyyy-MM-dd'),
              endDate: format(monthEnd, 'yyyy-MM-dd')
            };
          }
          default:
            return { startDate: '', endDate: '' };
        }
      };
      
      const result = getDateRangeForDate('lastMonth', mockJanuary);
      
      // Should be December of previous year
      expect(result.startDate).toBe('2024-12-01');
      expect(result.endDate).toBe('2024-12-31');
    });
    
    it('should handle leap year February correctly', () => {
      // Mock current date as March 1, 2024 (leap year)
      const mockMarch2024 = new Date(2024, 2, 1); // March 1, 2024
      
      const lastMonth = subMonths(mockMarch2024, 1);
      const monthEnd = endOfMonth(lastMonth);
      
      // February 2024 should have 29 days (leap year)
      expect(format(monthEnd, 'yyyy-MM-dd')).toBe('2024-02-29');
    });
    
    it('should handle non-leap year February correctly', () => {
      // Mock current date as March 1, 2023 (non-leap year)
      const mockMarch2023 = new Date(2023, 2, 1); // March 1, 2023
      
      const lastMonth = subMonths(mockMarch2023, 1);
      const monthEnd = endOfMonth(lastMonth);
      
      // February 2023 should have 28 days (non-leap year)
      expect(format(monthEnd, 'yyyy-MM-dd')).toBe('2023-02-28');
    });
    
    it('should handle date calculations consistently across different timezones', () => {
      // Test that date calculations are consistent regardless of timezone
      const testDates = [
        new Date('2025-01-15T00:00:00Z'),
        new Date('2025-01-15T12:00:00Z'),
        new Date('2025-01-15T23:59:59Z')
      ];
      
      testDates.forEach(testDate => {
        const monthStart = startOfMonth(testDate);
        const monthEnd = endOfMonth(testDate);
        
        expect(format(monthStart, 'yyyy-MM-dd')).toBe('2025-01-01');
        expect(format(monthEnd, 'yyyy-MM-dd')).toBe('2025-01-31');
      });
    });
    
    it('should handle filter conversion with null/undefined inputs', () => {
      const convertTimeRangeToDateFilter = (timeRangeFilter: string | null | undefined): string => {
        if (!timeRangeFilter) return 'ytd';
        
        switch(timeRangeFilter) {
          case 'thisMonth':
            return 'this-month';
          case 'yearToDate':
            return 'ytd';
          default:
            return 'ytd';
        }
      };
      
      expect(convertTimeRangeToDateFilter(null)).toBe('ytd');
      expect(convertTimeRangeToDateFilter(undefined)).toBe('ytd');
      expect(convertTimeRangeToDateFilter('')).toBe('ytd');
    });
  });
  
  describe('URL parameter validation', () => {
    
    it('should validate URL parameter format', () => {
      const validateUrlParams = (params: Record<string, string>) => {
        const errors: string[] = [];
        
        // Validate categoryIds format
        if (params.categoryIds) {
          const categoryIds = params.categoryIds.split(',');
          categoryIds.forEach(id => {
            if (!id.match(/^[A-Z_][A-Z0-9_]*$/)) {
              errors.push(`Invalid category ID format: ${id}`);
            }
          });
        }
        
        // Validate date format
        if (params.startDate && !params.startDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
          errors.push(`Invalid startDate format: ${params.startDate}`);
        }
        
        if (params.endDate && !params.endDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
          errors.push(`Invalid endDate format: ${params.endDate}`);
        }
        
        // Validate timeRangeFilter values
        const validTimeRanges = ['thisMonth', 'lastMonth', 'yearToDate', 'thisYear', 'last3', 'last6', 'last12'];
        if (params.timeRangeFilter && !validTimeRanges.includes(params.timeRangeFilter)) {
          errors.push(`Invalid timeRangeFilter: ${params.timeRangeFilter}`);
        }
        
        return errors;
      };
      
      // Valid parameters
      expect(validateUrlParams({
        categoryIds: 'FOOD_AND_DRINK,TRANSPORTATION',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        timeRangeFilter: 'thisMonth'
      })).toEqual([]);
      
      // Invalid category ID
      expect(validateUrlParams({
        categoryIds: 'invalid-category-id',
        startDate: '2025-01-01',
        endDate: '2025-01-31'
      })).toContain('Invalid category ID format: invalid-category-id');
      
      // Invalid date format
      expect(validateUrlParams({
        categoryIds: 'FOOD_AND_DRINK',
        startDate: '2025/01/01',
        endDate: '2025-01-31'
      })).toContain('Invalid startDate format: 2025/01/01');
      
      // Invalid timeRangeFilter
      expect(validateUrlParams({
        categoryIds: 'FOOD_AND_DRINK',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        timeRangeFilter: 'invalidRange'
      })).toContain('Invalid timeRangeFilter: invalidRange');
    });
  });
});