/**
 * Common types for CSV import functionality
 */

export interface CSVParseOptions {
  delimiter?: string;
  hasHeader?: boolean;
  skipEmptyLines?: boolean;
  trimValues?: boolean;
  encoding?: BufferEncoding;
  maxRows?: number;
}

export interface ParseError {
  row: number;
  column?: string;
  error: string;
}

export interface ParseResult<T> {
  success: boolean;
  data?: T[];
  errors?: ParseError[];
  totalRows?: number;
  parsedRows?: number;
  skippedRows?: number;
}

export interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
  required?: boolean;
  transform?: (value: string) => any;
  validate?: (value: any) => boolean | string;
}

export interface ImportOptions {
  skipDuplicates?: boolean;
  batchSize?: number;
  dryRun?: boolean;
  columnMapping?: Record<string, string>;
}

export interface ImportResult {
  success: boolean;
  message: string;
  imported?: number;
  skipped?: number;
  errors?: string[];
  warnings?: string[];
}

export interface ImportJob {
  id: string;
  userId: string;
  type: ImportType;
  status: ImportStatus;
  progress: number;
  totalRows: number;
  processedRows: number;
  successRows: number;
  errorRows: number;
  errors: ParseError[];
  result?: ImportResult;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  metadata?: Record<string, any>;
}

export type ImportType = 'categories' | 'transactions' | 'mappings';
export type ImportStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface CSVParser<T> {
  parse(content: string, options?: CSVParseOptions): ParseResult<T>;
  validateRow(row: Record<string, string>, rowNumber: number): T | ParseError;
  getRequiredColumns(): string[];
  getOptionalColumns(): string[];
}