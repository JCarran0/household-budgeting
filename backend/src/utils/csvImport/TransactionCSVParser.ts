import { BaseCSVParser } from './BaseCSVParser';
import { ParseError } from './types';

export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  category?: string;
  accountName?: string;
  merchantName?: string;
  notes?: string;
  institution?: string; // Added for external import support
}

/**
 * CSV parser for transaction imports from bank exports
 * Supports various bank CSV formats through configurable column mappings
 */
export class TransactionCSVParser extends BaseCSVParser<ParsedTransaction> {
  private bankFormat: BankFormat;

  constructor(bankFormat: BankFormat = 'generic') {
    super();
    this.bankFormat = bankFormat;
    // Re-initialize mappings based on bank format
    this.initializeColumnMappings();
  }

  protected initializeColumnMappings(): void {
    // Get mappings based on bank format
    const mappings = this.getBankMappings(this.bankFormat);
    
    // Date column
    this.columnMappings.set('date', {
      sourceColumn: mappings.date,
      targetField: 'date',
      required: true,
      transform: (value: string) => {
        const date = this.parseDate(value);
        return date ? date.toISOString().split('T')[0] : value;
      },
      validate: (value: string) => {
        if (!value) return 'Date is required';
        const date = this.parseDate(value);
        if (!date) return 'Invalid date format';
        return true;
      }
    });

    // Description column
    this.columnMappings.set('description', {
      sourceColumn: mappings.description,
      targetField: 'description',
      required: true,
      validate: (value: string) => {
        if (!value || !value.trim()) return 'Description is required';
        return true;
      }
    });

    // Amount column
    this.columnMappings.set('amount', {
      sourceColumn: mappings.amount,
      targetField: 'amount',
      required: true,
      transform: (value: string) => {
        const amount = this.parseNumber(value);
        if (amount === null) return 0;
        
        // For external app imports, preserve sign (negative = expense, positive = income/transfer)
        // For bank exports, standardize to positive = debit
        if (this.bankFormat === 'external_app') {
          return amount; // Keep original sign
        } else {
          return Math.abs(amount); // Standardize to positive
        }
      },
      validate: (value: any) => {
        // If it's already a number (from transform), check if it's valid
        if (typeof value === 'number') {
          return !isNaN(value) && isFinite(value) ? true : 'Invalid amount';
        }
        // If it's still a string, parse it
        const num = this.parseNumber(value);
        if (num === null) return 'Invalid amount';
        return true;
      }
    });

    // Optional columns
    if (mappings.category) {
      this.columnMappings.set('category', {
        sourceColumn: mappings.category,
        targetField: 'category',
        required: false
      });
    }

    if (mappings.accountName) {
      this.columnMappings.set('accountName', {
        sourceColumn: mappings.accountName,
        targetField: 'accountName',
        required: false
      });
    }

    if (mappings.merchantName) {
      this.columnMappings.set('merchantName', {
        sourceColumn: mappings.merchantName,
        targetField: 'merchantName',
        required: false
      });
    }

    if (mappings.notes) {
      this.columnMappings.set('notes', {
        sourceColumn: mappings.notes,
        targetField: 'notes',
        required: false
      });
    }

    // Institution column (for external app imports)
    if (mappings.accountName && this.bankFormat === 'external_app') {
      this.columnMappings.set('institution', {
        sourceColumn: mappings.accountName,
        targetField: 'institution',
        required: false
      });
    }
  }

  protected validateRow(row: Record<string, string>, rowNumber: number): ParsedTransaction | ParseError {
    try {
      // Validate and extract required fields
      const date = this.applyMapping(row, 'date');
      const dateValidation = this.validateValue(date, 'date');
      if (dateValidation !== true) {
        return {
          row: rowNumber,
          column: this.columnMappings.get('date')?.sourceColumn,
          error: typeof dateValidation === 'string' ? dateValidation : 'Invalid date'
        };
      }

      const description = this.applyMapping(row, 'description');
      const descValidation = this.validateValue(description, 'description');
      if (descValidation !== true) {
        return {
          row: rowNumber,
          column: this.columnMappings.get('description')?.sourceColumn,
          error: typeof descValidation === 'string' ? descValidation : 'Invalid description'
        };
      }

      const amount = this.applyMapping(row, 'amount');
      const amountValidation = this.validateValue(amount, 'amount');
      if (amountValidation !== true) {
        return {
          row: rowNumber,
          column: this.columnMappings.get('amount')?.sourceColumn,
          error: typeof amountValidation === 'string' ? amountValidation : 'Invalid amount'
        };
      }

      // Extract optional fields
      const category = this.applyMapping(row, 'category');
      const accountName = this.applyMapping(row, 'accountName');
      const merchantName = this.applyMapping(row, 'merchantName');
      const notes = this.applyMapping(row, 'notes');
      const institution = this.applyMapping(row, 'institution');

      return {
        date,
        description,
        amount,
        category,
        accountName,
        merchantName,
        notes,
        institution
      };
    } catch (error) {
      return {
        row: rowNumber,
        error: error instanceof Error ? error.message : 'Failed to parse row'
      };
    }
  }

  /**
   * Get column mappings for different bank formats
   */
  private getBankMappings(format: BankFormat): BankColumnMapping {
    const mappings: Record<BankFormat, BankColumnMapping> = {
      generic: {
        date: 'Date',
        description: 'Description',
        amount: 'Amount',
        category: 'Category',
        merchantName: 'Merchant',
        notes: 'Notes'
      },
      external_app: {
        date: 'Date',
        description: 'Description',
        amount: 'Amount',
        category: 'Category',
        accountName: 'Institution'
      },
      chase: {
        date: 'Transaction Date',
        description: 'Description',
        amount: 'Amount',
        category: 'Category',
        accountName: 'Card'
      },
      bofa: {
        date: 'Date',
        description: 'Description',
        amount: 'Amount',
        accountName: 'Account'
      },
      wells_fargo: {
        date: 'Date',
        description: 'Description',
        amount: 'Amount'
      },
      capital_one: {
        date: 'Transaction Date',
        description: 'Description',
        amount: 'Debit',
        category: 'Category'
      }
    };

    return mappings[format] || mappings.generic;
  }

  /**
   * Get sample CSV for this parser type
   */
  public static getSampleCSV(): string {
    return `Date,Description,Amount,Category,Merchant,Notes
2025-01-15,Coffee Shop,-4.50,Dining,Starbucks,Morning coffee
2025-01-14,Grocery Store,-125.00,Groceries,Whole Foods,Weekly shopping
2025-01-13,Paycheck,2500.00,Income,Employer,Bi-weekly salary
2025-01-12,Electric Bill,-85.00,Utilities,City Power,January bill`;
  }

  /**
   * Get list of supported bank formats
   */
  public static getSupportedFormats(): BankFormat[] {
    return ['generic', 'external_app', 'chase', 'bofa', 'wells_fargo', 'capital_one'];
  }
}

type BankFormat = 'generic' | 'external_app' | 'chase' | 'bofa' | 'wells_fargo' | 'capital_one';

interface BankColumnMapping {
  date: string;
  description: string;
  amount: string;
  category?: string;
  accountName?: string;
  merchantName?: string;
  notes?: string;
}