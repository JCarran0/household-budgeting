import { v4 as uuidv4 } from 'uuid';
import { DataService } from './dataService';
import { CategoryService } from './categoryService';
import { TransactionService } from './transactionService';
import { AutoCategorizeService } from './autoCategorizeService';
import {
  ImportType,
  ImportOptions,
  ImportResult,
  ImportJob,
  ParseResult,
  CSVParseOptions
} from '../utils/csvImport/types';
import { CategoryCSVParser, ParsedCategory } from '../utils/csvImport/CategoryCSVParser';
import { TransactionCSVParser, ParsedTransaction } from '../utils/csvImport/TransactionCSVParser';
import { MappingCSVParser, ParsedMapping } from '../utils/csvImport/MappingCSVParser';
import { Category } from '../../../shared/types';

/**
 * Unified service for handling all CSV imports
 * Provides a consistent interface for different import types
 * Designed to be easily migrated to async/serverless processing
 */
export class ImportService {
  private static instance: ImportService;
  private activeJobs: Map<string, ImportJob> = new Map();

  private constructor(
    private dataService: DataService,
    private categoryService: CategoryService,
    private transactionService: TransactionService,
    private autoCategorizeService: AutoCategorizeService
  ) {
    // Services will be used for future import types
    // Reference services to prevent unused warnings
    void this.categoryService;
    void this.transactionService;
    void this.autoCategorizeService;
  }

  public static getInstance(
    dataService: DataService,
    categoryService: CategoryService,
    transactionService: TransactionService,
    autoCategorizeService: AutoCategorizeService
  ): ImportService {
    if (!ImportService.instance) {
      ImportService.instance = new ImportService(
        dataService,
        categoryService,
        transactionService,
        autoCategorizeService
      );
    }
    return ImportService.instance;
  }

  /**
   * Import CSV data based on type
   * This is the main entry point for all CSV imports
   */
  public async importCSV(
    userId: string,
    type: ImportType,
    content: string,
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    // Create import job for tracking (preparation for async)
    const job = this.createImportJob(userId, type);
    this.activeJobs.set(job.id, job);

    try {
      // Update job status
      job.status = 'processing';
      job.startedAt = new Date();

      // Route to appropriate processor
      let result: ImportResult;
      switch (type) {
        case 'categories':
          result = await this.importCategories(userId, content, options, job);
          break;
        case 'transactions':
          result = await this.importTransactions(userId, content, options, job);
          break;
        case 'mappings':
          result = await this.importMappings(userId, content, options, job);
          break;
        default:
          throw new Error(`Unsupported import type: ${type}`);
      }

      // Update job with result
      job.status = result.success ? 'completed' : 'failed';
      job.completedAt = new Date();
      job.result = result;
      job.successRows = result.imported || 0;
      job.errorRows = result.errors?.length || 0;

      // Store job for history (optional, for future implementation)
      await this.saveJobHistory(job);

      return result;
    } catch (error) {
      // Update job on error
      job.status = 'failed';
      job.completedAt = new Date();
      job.errors.push({
        row: 0,
        error: error instanceof Error ? error.message : 'Import failed'
      });

      return {
        success: false,
        message: 'Import failed',
        errors: [error instanceof Error ? error.message : 'Unknown error occurred']
      };
    } finally {
      // Clean up active job
      this.activeJobs.delete(job.id);
    }
  }

  /**
   * Import categories from CSV
   */
  private async importCategories(
    userId: string,
    content: string,
    options: ImportOptions,
    job: ImportJob
  ): Promise<ImportResult> {
    const parser = new CategoryCSVParser();
    const parseOptions: CSVParseOptions = {
      skipEmptyLines: true,
      trimValues: true,
      hasHeader: true
    };

    // Parse CSV
    const parseResult: ParseResult<ParsedCategory> = parser.parse(content, parseOptions);
    
    if (!parseResult.success || !parseResult.data) {
      return {
        success: false,
        message: 'Failed to parse CSV',
        errors: parseResult.errors?.map(e => `Row ${e.row}: ${e.error}`)
      };
    }

    job.totalRows = parseResult.totalRows || 0;
    job.processedRows = 0;

    // Process categories
    const existingCategories = await this.dataService.getCategories(userId);
    const existingIds = existingCategories.map(c => c.id);
    const existingNames = new Map<string, Category>();
    
    existingCategories.forEach(cat => {
      const key = `${cat.parentId || 'root'}:${cat.name}`;
      existingNames.set(key, cat);
    });

    const categoriesToAdd: Category[] = [];
    const errors: string[] = [];
    const processedParents = new Set<string>();
    let imported = 0;
    let skipped = 0;

    // Process in batches if specified
    const batchSize = options.batchSize || parseResult.data.length;
    
    for (let i = 0; i < parseResult.data.length; i += batchSize) {
      const batch = parseResult.data.slice(i, Math.min(i + batchSize, parseResult.data.length));
      
      for (const parsedCat of batch) {
        try {
          // Check for parent category
          if (parsedCat.parent) {
            const parentKey = `root:${parsedCat.parent}`;
            let parentCategory = existingNames.get(parentKey);
            
            if (!parentCategory && !processedParents.has(parsedCat.parent)) {
              // Create parent if it doesn't exist
              // Generate ID similar to how CategoryService does it
              const baseName = parsedCat.parent.toUpperCase().replace(/[^A-Z0-9]/g, '_');
              let parentId = baseName;
              let counter = 1;
              const allIds = [...existingIds, ...categoriesToAdd.map(c => c.id)];
              while (allIds.includes(parentId)) {
                parentId = `${baseName}_${counter}`;
                counter++;
              }
              
              parentCategory = {
                id: parentId,
                name: parsedCat.parent,
                parentId: null,
                description: undefined,
                isCustom: true,
                isHidden: false,
                isSavings: false
              };
              
              categoriesToAdd.push(parentCategory!);
              existingNames.set(parentKey, parentCategory!);
              processedParents.add(parsedCat.parent);
              imported++;
            }
          }

          // Process child category
          const parentId = parsedCat.parent ? 
            existingNames.get(`root:${parsedCat.parent}`)?.id || null : 
            null;
          
          const childKey = `${parentId || 'root'}:${parsedCat.name}`;
          
          // Skip if duplicate (unless skipDuplicates is false)
          if (existingNames.has(childKey)) {
            if (options.skipDuplicates !== false) {
              skipped++;
              continue;
            }
          }

          // Create child category
          // Generate ID similar to how CategoryService does it
          const baseChildName = parsedCat.name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
          let childId = baseChildName;
          let childCounter = 1;
          const allChildIds = [...existingIds, ...categoriesToAdd.map(c => c.id)];
          while (allChildIds.includes(childId)) {
            childId = `${baseChildName}_${childCounter}`;
            childCounter++;
          }

          const childCategory: Category = {
            id: childId,
            name: parsedCat.name,
            parentId,
            description: parsedCat.description,
            isCustom: true,
            isHidden: parsedCat.isHidden,
            isSavings: parsedCat.isSavings
          };

          categoriesToAdd.push(childCategory);
          existingNames.set(childKey, childCategory);
          imported++;
          
        } catch (error) {
          errors.push(`Failed to process category "${parsedCat.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        job.processedRows++;
        job.progress = Math.round((job.processedRows / job.totalRows) * 100);
      }

      // Save batch if not in dry run mode
      if (!options.dryRun && categoriesToAdd.length > 0) {
        const allCategories = [...existingCategories, ...categoriesToAdd];
        await this.dataService.saveCategories(allCategories, userId);
      }
    }

    return {
      success: errors.length === 0,
      message: errors.length === 0 
        ? `Successfully imported ${imported} categories${skipped > 0 ? `, skipped ${skipped} duplicates` : ''}`
        : `Imported ${imported} categories with ${errors.length} errors`,
      imported,
      skipped,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Import transactions from CSV (placeholder for future implementation)
   */
  private async importTransactions(
    _userId: string,
    content: string,
    _options: ImportOptions,
    _job: ImportJob
  ): Promise<ImportResult> {
    const parser = new TransactionCSVParser();
    const parseOptions: CSVParseOptions = {
      skipEmptyLines: true,
      trimValues: true,
      hasHeader: true
    };

    // Parse CSV
    const parseResult: ParseResult<ParsedTransaction> = parser.parse(content, parseOptions);
    
    if (!parseResult.success || !parseResult.data) {
      return {
        success: false,
        message: 'Failed to parse transaction CSV',
        errors: parseResult.errors?.map(e => `Row ${e.row}: ${e.error}`)
      };
    }

    // TODO: Implement transaction import logic
    // This would involve:
    // 1. Mapping transactions to accounts
    // 2. Checking for duplicates
    // 3. Applying auto-categorization rules
    // 4. Saving transactions

    return {
      success: false,
      message: 'Transaction import not yet implemented',
      errors: ['This feature is coming soon']
    };
  }

  /**
   * Import category mappings from CSV (placeholder for future implementation)
   */
  private async importMappings(
    _userId: string,
    content: string,
    _options: ImportOptions,
    _job: ImportJob
  ): Promise<ImportResult> {
    const parser = new MappingCSVParser();
    const parseOptions: CSVParseOptions = {
      skipEmptyLines: true,
      trimValues: true,
      hasHeader: true
    };

    // Parse CSV
    const parseResult: ParseResult<ParsedMapping> = parser.parse(content, parseOptions);
    
    if (!parseResult.success || !parseResult.data) {
      return {
        success: false,
        message: 'Failed to parse mapping CSV',
        errors: parseResult.errors?.map(e => `Row ${e.row}: ${e.error}`)
      };
    }

    // TODO: Implement mapping import logic
    // This would involve:
    // 1. Validating target categories exist
    // 2. Creating auto-categorization rules
    // 3. Optionally applying to existing transactions

    return {
      success: false,
      message: 'Mapping import not yet implemented',
      errors: ['This feature is coming soon']
    };
  }

  /**
   * Create a new import job for tracking
   */
  private createImportJob(userId: string, type: ImportType): ImportJob {
    return {
      id: uuidv4(),
      userId,
      type,
      status: 'pending',
      progress: 0,
      totalRows: 0,
      processedRows: 0,
      successRows: 0,
      errorRows: 0,
      errors: [],
      createdAt: new Date()
    };
  }

  /**
   * Save job history for future reference
   * This would be used for async processing and audit trails
   */
  private async saveJobHistory(job: ImportJob): Promise<void> {
    // TODO: Implement job history storage
    // This could be stored in the database or S3
    // For now, just log it
    console.log(`Import job completed: ${job.id}`, {
      type: job.type,
      status: job.status,
      imported: job.result?.imported,
      errors: job.result?.errors?.length || 0
    });
  }

  /**
   * Get status of an import job (for future async processing)
   */
  public getJobStatus(jobId: string): ImportJob | null {
    return this.activeJobs.get(jobId) || null;
  }

  /**
   * Cancel an active import job (for future async processing)
   */
  public cancelJob(jobId: string): boolean {
    const job = this.activeJobs.get(jobId);
    if (job && job.status === 'processing') {
      job.status = 'cancelled';
      job.completedAt = new Date();
      this.activeJobs.delete(jobId);
      return true;
    }
    return false;
  }

  /**
   * Get parser information for a given import type
   */
  public static getParserInfo(type: ImportType): {
    sampleCSV: string;
    formatDescription: string;
    requiredColumns: string[];
    optionalColumns: string[];
  } {
    switch (type) {
      case 'categories':
        const catParser = new CategoryCSVParser();
        return {
          sampleCSV: CategoryCSVParser.getSampleCSV(),
          formatDescription: CategoryCSVParser.getFormatDescription(),
          requiredColumns: catParser.getRequiredColumns(),
          optionalColumns: catParser.getOptionalColumns()
        };
      case 'transactions':
        const txnParser = new TransactionCSVParser();
        return {
          sampleCSV: TransactionCSVParser.getSampleCSV(),
          formatDescription: 'Transaction import format',
          requiredColumns: txnParser.getRequiredColumns(),
          optionalColumns: txnParser.getOptionalColumns()
        };
      case 'mappings':
        const mapParser = new MappingCSVParser();
        return {
          sampleCSV: MappingCSVParser.getSampleCSV(),
          formatDescription: MappingCSVParser.getFormatDescription(),
          requiredColumns: mapParser.getRequiredColumns(),
          optionalColumns: mapParser.getOptionalColumns()
        };
      default:
        throw new Error(`Unsupported import type: ${type}`);
    }
  }
}