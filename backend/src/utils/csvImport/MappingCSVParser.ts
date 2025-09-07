import { BaseCSVParser } from './BaseCSVParser';
import { ParseError } from './types';

export interface ParsedMapping {
  sourcePattern: string;
  targetCategory: string;
  matchType: 'exact' | 'contains' | 'regex';
  priority?: number;
  notes?: string;
}

/**
 * CSV parser for category mapping imports
 * Used to import rules for auto-categorizing transactions from other apps
 */
export class MappingCSVParser extends BaseCSVParser<ParsedMapping> {
  protected initializeColumnMappings(): void {
    // Source pattern (what to match in transaction descriptions)
    this.columnMappings.set('sourcePattern', {
      sourceColumn: 'Pattern',
      targetField: 'sourcePattern',
      required: true,
      validate: (value: string) => {
        if (!value || !value.trim()) {
          return 'Pattern is required';
        }
        if (value.length > 200) {
          return 'Pattern must be 200 characters or less';
        }
        return true;
      }
    });

    // Target category (our category to map to)
    this.columnMappings.set('targetCategory', {
      sourceColumn: 'Category',
      targetField: 'targetCategory',
      required: true,
      validate: (value: string) => {
        if (!value || !value.trim()) {
          return 'Category is required';
        }
        return true;
      }
    });

    // Match type
    this.columnMappings.set('matchType', {
      sourceColumn: 'Match Type',
      targetField: 'matchType',
      required: false,
      transform: (value: string) => {
        const normalized = value.toLowerCase().trim();
        if (['exact', 'contains', 'regex'].includes(normalized)) {
          return normalized as 'exact' | 'contains' | 'regex';
        }
        return 'contains'; // Default
      }
    });

    // Priority (for conflicting rules)
    this.columnMappings.set('priority', {
      sourceColumn: 'Priority',
      targetField: 'priority',
      required: false,
      transform: (value: string) => {
        const num = this.parseNumber(value);
        return num !== null ? Math.round(num) : 0;
      },
      validate: (value: any) => {
        if (value === undefined || value === null || value === '') {
          return true; // Optional
        }
        const num = this.parseNumber(value);
        if (num === null || num < 0 || num > 1000) {
          return 'Priority must be between 0 and 1000';
        }
        return true;
      }
    });

    // Notes
    this.columnMappings.set('notes', {
      sourceColumn: 'Notes',
      targetField: 'notes',
      required: false,
      transform: (value: string) => {
        const trimmed = value.trim();
        return trimmed || undefined;
      }
    });
  }

  protected validateRow(row: Record<string, string>, rowNumber: number): ParsedMapping | ParseError {
    try {
      // Validate source pattern
      const sourcePattern = this.applyMapping(row, 'sourcePattern');
      const patternValidation = this.validateValue(sourcePattern, 'sourcePattern');
      if (patternValidation !== true) {
        return {
          row: rowNumber,
          column: 'Pattern',
          error: typeof patternValidation === 'string' ? patternValidation : 'Invalid pattern'
        };
      }

      // Validate target category
      const targetCategory = this.applyMapping(row, 'targetCategory');
      const categoryValidation = this.validateValue(targetCategory, 'targetCategory');
      if (categoryValidation !== true) {
        return {
          row: rowNumber,
          column: 'Category',
          error: typeof categoryValidation === 'string' ? categoryValidation : 'Invalid category'
        };
      }

      // Get match type
      const matchType = this.applyMapping(row, 'matchType') || 'contains';

      // Validate regex pattern if match type is regex
      if (matchType === 'regex') {
        try {
          new RegExp(sourcePattern);
        } catch (e) {
          return {
            row: rowNumber,
            column: 'Pattern',
            error: 'Invalid regular expression'
          };
        }
      }

      // Get optional fields
      const priority = this.applyMapping(row, 'priority');
      const priorityValidation = this.validateValue(priority, 'priority');
      if (priorityValidation !== true) {
        return {
          row: rowNumber,
          column: 'Priority',
          error: typeof priorityValidation === 'string' ? priorityValidation : 'Invalid priority'
        };
      }

      const notes = this.applyMapping(row, 'notes');

      return {
        sourcePattern,
        targetCategory,
        matchType,
        priority: priority ?? 0,
        notes
      };
    } catch (error) {
      return {
        row: rowNumber,
        error: error instanceof Error ? error.message : 'Failed to parse row'
      };
    }
  }

  /**
   * Get sample CSV for this parser type
   */
  public static getSampleCSV(): string {
    return `Pattern,Category,Match Type,Priority,Notes
STARBUCKS,Dining,contains,10,Coffee shops
"WHOLE FOODS.*",Groceries,regex,10,Grocery stores
NETFLIX,Entertainment,contains,5,Streaming service
"UBER|LYFT",Transportation,regex,8,Rideshare services
Amazon Prime,Shopping,exact,5,Prime membership`;
  }

  /**
   * Get format description for users
   */
  public static getFormatDescription(): string {
    return `Upload a CSV file with the following columns:
- Pattern: Text pattern to match in transaction descriptions (required)
- Category: Target category to assign when pattern matches (required)
- Match Type: How to match - 'exact', 'contains', or 'regex' (optional, defaults to 'contains')
- Priority: Number 0-1000, higher priority rules apply first (optional, defaults to 0)
- Notes: Additional notes about the mapping rule (optional)

These mappings will be used to automatically categorize imported transactions.`;
  }
}