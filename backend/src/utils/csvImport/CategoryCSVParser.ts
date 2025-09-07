import { BaseCSVParser } from './BaseCSVParser';
import { ParseError } from './types';

export interface ParsedCategory {
  parent: string | null;
  name: string;
  isHidden: boolean;
  isRollover: boolean;
  description?: string;
}

/**
 * CSV parser specifically for category imports
 * Handles the existing category CSV format while using the new base parser
 */
export class CategoryCSVParser extends BaseCSVParser<ParsedCategory> {
  protected initializeColumnMappings(): void {
    // Define column mappings for category CSV
    this.columnMappings.set('parent', {
      sourceColumn: 'Parent',
      targetField: 'parent',
      required: false,
      transform: (value: string) => value.trim() || null
    });

    this.columnMappings.set('name', {
      sourceColumn: 'Child',
      targetField: 'name',
      required: true,
      validate: (value: string) => {
        if (!value || !value.trim()) {
          return 'Category name is required';
        }
        if (value.trim().length > 100) {
          return 'Category name must be 100 characters or less';
        }
        return true;
      }
    });

    this.columnMappings.set('type', {
      sourceColumn: 'Type',
      targetField: 'type',
      required: false,
      // Type field is reserved for future use
      transform: (value: string) => value.trim().toLowerCase() || ''
    });

    this.columnMappings.set('isHidden', {
      sourceColumn: 'Hidden',
      targetField: 'isHidden',
      required: false,
      transform: (value: string) => this.parseBoolean(value)
    });

    this.columnMappings.set('isRollover', {
      sourceColumn: 'Rollover',
      targetField: 'isRollover',
      required: false,
      transform: (value: string) => this.parseBoolean(value)
    });

    this.columnMappings.set('description', {
      sourceColumn: 'Description',
      targetField: 'description',
      required: false,
      transform: (value: string) => {
        const trimmed = value.trim();
        return trimmed || undefined;
      },
      validate: (value: string) => {
        if (value && value.length > 500) {
          return 'Description must be 500 characters or less';
        }
        return true;
      }
    });
  }

  protected validateRow(row: Record<string, string>, rowNumber: number): ParsedCategory | ParseError {
    try {
      // Extract and validate parent
      const parent = this.applyMapping(row, 'parent');
      
      // Extract and validate name (required)
      const nameValue = row['Child']?.trim();
      const nameValidation = this.validateValue(nameValue, 'name');
      if (nameValidation !== true) {
        return {
          row: rowNumber,
          column: 'Child',
          error: typeof nameValidation === 'string' ? nameValidation : 'Invalid category name'
        };
      }

      // Extract other fields
      const isHidden = this.applyMapping(row, 'isHidden') || false;
      const isRollover = this.applyMapping(row, 'isRollover') || false;
      const description = this.applyMapping(row, 'description');

      // Validate description if present
      const descValidation = this.validateValue(description, 'description');
      if (descValidation !== true) {
        return {
          row: rowNumber,
          column: 'Description',
          error: typeof descValidation === 'string' ? descValidation : 'Invalid description'
        };
      }

      return {
        parent,
        name: nameValue,
        isHidden,
        isRollover,
        description
      };
    } catch (error) {
      return {
        row: rowNumber,
        error: error instanceof Error ? error.message : 'Failed to parse row'
      };
    }
  }

  /**
   * Get a sample CSV for this parser type
   */
  public static getSampleCSV(): string {
    return `Parent,Child,Type,Hidden,Rollover,Description
Entertainment,Movies,,No,No,Cinema and streaming services
Entertainment,Games,,No,No,Video games and gaming subscriptions
Rollover,Emergency Fund,,No,Yes,Emergency rollover fund
,Groceries,,No,No,Food and household items
Travel,Flights,,Yes,No,Air travel expenses`;
  }

  /**
   * Get format description for users
   */
  public static getFormatDescription(): string {
    return `Upload a CSV file with the following columns:
- Parent: Parent category name (optional, leave empty for top-level categories)
- Child: Category name (required)
- Type: Reserved for future use (optional)
- Hidden: Whether the category is hidden (Yes/No, optional, defaults to No)
- Rollover: Whether this is a rollover category (Yes/No, optional, defaults to No)
- Description: Category description (optional)

Note: If a parent category doesn't exist, it will be created automatically.`;
  }
}