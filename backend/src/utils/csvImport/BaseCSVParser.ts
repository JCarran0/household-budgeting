import { CSVParseOptions, ParseResult, ParseError, ColumnMapping } from './types';

/**
 * Base CSV parser with common functionality for all CSV import types
 */
export abstract class BaseCSVParser<T> {
  protected columnMappings: Map<string, ColumnMapping> = new Map();
  
  constructor() {
    this.initializeColumnMappings();
  }

  /**
   * Initialize column mappings for this parser type
   */
  protected abstract initializeColumnMappings(): void;

  /**
   * Validate and transform a row into the target type
   */
  protected abstract validateRow(row: Record<string, string>, rowNumber: number): T | ParseError;

  /**
   * Parse CSV content into structured data
   */
  public parse(content: string, options: CSVParseOptions = {}): ParseResult<T> {
    const {
      delimiter = ',',
      hasHeader = true,
      skipEmptyLines = true,
      trimValues = true,
      maxRows
    } = options;

    try {
      const lines = this.splitLines(content, skipEmptyLines);
      
      if (lines.length === 0) {
        return {
          success: false,
          errors: [{ row: 0, error: 'CSV file is empty' }]
        };
      }

      // Process header if present
      let headers: string[] = [];
      let dataStartIndex = 0;
      
      if (hasHeader) {
        const headerLine = lines[0];
        headers = this.parseCSVLine(headerLine, delimiter).map(h => 
          trimValues ? h.trim() : h
        );
        dataStartIndex = 1;

        // Validate required columns
        const validationResult = this.validateHeaders(headers);
        if (!validationResult.valid) {
          return {
            success: false,
            errors: [{ row: 0, error: validationResult.error! }]
          };
        }
      }

      // Parse data rows
      const data: T[] = [];
      const errors: ParseError[] = [];
      let parsedRows = 0;
      let skippedRows = 0;

      const endIndex = maxRows 
        ? Math.min(dataStartIndex + maxRows, lines.length)
        : lines.length;

      for (let i = dataStartIndex; i < endIndex; i++) {
        const line = lines[i];
        
        // Skip empty lines if configured
        if (skipEmptyLines && !line.trim()) {
          skippedRows++;
          continue;
        }

        const values = this.parseCSVLine(line, delimiter);
        
        // Create row object
        const row: Record<string, string> = {};
        headers.forEach((header, index) => {
          const value = values[index] || '';
          row[header] = trimValues ? value.trim() : value;
        });

        // Validate and transform row
        const result = this.validateRow(row, i + 1);
        
        if ('error' in (result as any)) {
          errors.push(result as ParseError);
        } else {
          data.push(result as T);
          parsedRows++;
        }
      }

      // Determine success based on error threshold
      const success = errors.length === 0 || (data.length > 0 && errors.length < data.length * 0.5);

      return {
        success,
        data: success ? data : undefined,
        errors: errors.length > 0 ? errors : undefined,
        totalRows: lines.length - (hasHeader ? 1 : 0),
        parsedRows,
        skippedRows
      };
    } catch (error) {
      return {
        success: false,
        errors: [{
          row: 0,
          error: error instanceof Error ? error.message : 'Failed to parse CSV'
        }]
      };
    }
  }

  /**
   * Parse a single CSV line, handling quoted values and escaped characters
   */
  protected parseCSVLine(line: string, delimiter: string = ','): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next character
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        // End of field
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add last field
    result.push(current);
    
    return result;
  }

  /**
   * Split content into lines, handling different line endings
   */
  protected splitLines(content: string, skipEmpty: boolean): string[] {
    // Normalize line endings
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');
    
    if (skipEmpty) {
      return lines.filter(line => line.trim().length > 0);
    }
    
    return lines;
  }

  /**
   * Validate that required columns are present in headers
   */
  protected validateHeaders(headers: string[]): { valid: boolean; error?: string } {
    const requiredColumns = this.getRequiredColumns();
    const headerSet = new Set(headers);
    
    const missing = requiredColumns.filter(col => !headerSet.has(col));
    
    if (missing.length > 0) {
      return {
        valid: false,
        error: `Missing required columns: ${missing.join(', ')}`
      };
    }
    
    return { valid: true };
  }

  /**
   * Get list of required columns for this parser
   */
  public getRequiredColumns(): string[] {
    return Array.from(this.columnMappings.values())
      .filter(mapping => mapping.required)
      .map(mapping => mapping.sourceColumn);
  }

  /**
   * Get list of optional columns for this parser
   */
  public getOptionalColumns(): string[] {
    return Array.from(this.columnMappings.values())
      .filter(mapping => !mapping.required)
      .map(mapping => mapping.sourceColumn);
  }

  /**
   * Apply column mapping and transformation to a value
   */
  protected applyMapping(
    row: Record<string, string>,
    columnName: string
  ): any {
    const mapping = this.columnMappings.get(columnName);
    if (!mapping) {
      return row[columnName];
    }

    const value = row[mapping.sourceColumn];
    
    // Apply transformation if defined
    if (mapping.transform) {
      return mapping.transform(value);
    }
    
    return value;
  }

  /**
   * Validate a value using column mapping rules
   */
  protected validateValue(
    value: any,
    columnName: string
  ): boolean | string {
    const mapping = this.columnMappings.get(columnName);
    if (!mapping || !mapping.validate) {
      return true;
    }
    
    return mapping.validate(value);
  }

  /**
   * Parse boolean values from common string representations
   */
  protected parseBoolean(value: string): boolean {
    const normalized = value.toLowerCase().trim();
    return ['yes', 'true', '1', 'y', 't'].includes(normalized);
  }

  /**
   * Parse date values with fallback formats
   */
  protected parseDate(value: string): Date | null {
    if (!value) return null;
    
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date;
    }
    
    // Try common date formats
    const formats = [
      /^(\d{4})-(\d{2})-(\d{2})$/,  // YYYY-MM-DD
      /^(\d{2})\/(\d{2})\/(\d{4})$/,  // MM/DD/YYYY
      /^(\d{2})-(\d{2})-(\d{4})$/,   // DD-MM-YYYY
    ];
    
    for (const format of formats) {
      const match = value.match(format);
      if (match) {
        // Parse based on format
        // This is simplified - in production, use a proper date library
        return new Date(value);
      }
    }
    
    return null;
  }

  /**
   * Parse numeric values with validation
   */
  protected parseNumber(value: string | undefined | null): number | null {
    if (!value || typeof value !== 'string') return null;
    
    // Remove common formatting characters
    const cleaned = value.replace(/[$,]/g, '').trim();
    const num = parseFloat(cleaned);
    
    return isNaN(num) ? null : num;
  }
}