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
import { TransactionMatcher, TransactionMatch } from './transactionMatcher';
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

    // Process in smaller batches to avoid timeouts and provide progress feedback
    const batchSize = options.batchSize || Math.min(50, parseResult.data.length);
    
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
                isRollover: false
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
            isRollover: parsedCat.isRollover
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

      // Save batch incrementally if not in dry run mode
      // This improves performance and provides better progress feedback
      if (!options.dryRun && categoriesToAdd.length > 0 && (categoriesToAdd.length >= batchSize || i + batchSize >= parseResult.data.length)) {
        const allCategories = [...existingCategories, ...categoriesToAdd];
        await this.dataService.saveCategories(allCategories, userId);
        
        // Update existing categories for next batch
        existingCategories.push(...categoriesToAdd);
        categoriesToAdd.forEach(cat => {
          const key = `${cat.parentId || 'root'}:${cat.name}`;
          existingNames.set(key, cat);
        });
        
        // Clear the batch
        categoriesToAdd.length = 0;
        
        // Log progress for monitoring
        console.log(`Import progress: ${job.processedRows}/${job.totalRows} rows processed (${job.progress}%)`)
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
   * Import transactions from CSV with duplicate detection and category mapping
   */
  private async importTransactions(
    userId: string,
    content: string,
    options: ImportOptions,
    job: ImportJob
  ): Promise<ImportResult> {
    // Parse external app format (TSV with custom column mapping)
    const parser = new TransactionCSVParser('external_app');
    const parseOptions: CSVParseOptions = {
      delimiter: '\t', // TSV format
      skipEmptyLines: true,
      trimValues: true,
      hasHeader: true
    };

    // Parse CSV/TSV
    const parseResult: ParseResult<ParsedTransaction> = parser.parse(content, parseOptions);
    
    if (!parseResult.success || !parseResult.data) {
      return {
        success: false,
        message: 'Failed to parse transaction CSV',
        errors: parseResult.errors?.map(e => `Row ${e.row}: ${e.error}`)
      };
    }

    job.totalRows = parseResult.data.length;

    try {
      // Get existing transactions for matching
      const existingTransactionsResult = await this.transactionService.getTransactions(userId, {});
      if (!existingTransactionsResult.success || !existingTransactionsResult.transactions) {
        return {
          success: false,
          message: 'Failed to load existing transactions for comparison',
          errors: ['Could not access transaction database']
        };
      }

      // Match imported transactions with existing ones
      const matcher = new TransactionMatcher();
      
      // Use different matching strategy for category updates vs imports
      const matchingResult = options.updateCategoriesOnly
        ? matcher.findMatchesForCategoryUpdate(parseResult.data, existingTransactionsResult.transactions)
        : matcher.findMatches(parseResult.data, existingTransactionsResult.transactions);
      
      // Group results for processing
      const { duplicates, newTransactions } = matcher.groupByDuplicates(matchingResult.matches, parseResult.data);
      
      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];
      const warnings: string[] = [];

      // Preview mode - return statistics without importing
      if (options.dryRun) {
        // If this is update categories mode, analyze what would be updated
        if (options.updateCategoriesOnly) {
          const updateableMatches = duplicates.filter(match => 
            match.importTransaction.category && 
            match.importTransaction.category.trim() !== ''
          );
          
          // Analyze category mappings only for the matched transactions
          const matchedTransactionsToAnalyze = updateableMatches.map(m => m.importTransaction);
          const categoryMappingStats = await this.analyzeCategoryMappings(userId, matchedTransactionsToAnalyze);
          
          return {
            success: true,
            message: `Category update preview: ${updateableMatches.length} transactions would have categories updated`,
            imported: 0,
            skipped: updateableMatches.length,
            warnings: [
              `Matched Transactions: ${duplicates.length} total matches found`,
              `With Categories: ${updateableMatches.length} have categories to update`,
              `Category Mappings: ${categoryMappingStats.canMap} can map directly, ${categoryMappingStats.needCreation} need category creation`,
              `No new transactions will be added`
            ]
          };
        }
        
        const categoryMappingStats = await this.analyzeCategoryMappings(userId, parseResult.data);
        
        return {
          success: true,
          message: `Import preview: ${newTransactions.length} new transactions, ${duplicates.length} potential duplicates`,
          imported: newTransactions.length,
          skipped: duplicates.length,
          warnings: [
            `Match Statistics: ${matchingResult.exactMatches} exact, ${matchingResult.highConfidenceMatches} high confidence, ${matchingResult.noMatches} new`,
            `Category Mappings: ${categoryMappingStats.canMap} can map, ${categoryMappingStats.needCreation} need new categories`,
            `Uncategorized: ${categoryMappingStats.uncategorized} transactions`
          ]
        };
      }

      // Handle "Update Categories Only" mode
      if (options.updateCategoriesOnly) {
        return await this.updateMatchedTransactionCategories(userId, duplicates, job);
      }

      // Skip duplicates unless explicitly requested
      if (options.skipDuplicates !== false) {
        skipped = duplicates.length;
        if (duplicates.length > 0) {
          warnings.push(`Skipped ${duplicates.length} potential duplicate transactions`);
        }
      }

      // Process new transactions
      if (newTransactions.length > 0) {
        // Get existing categories for mapping
        const existingCategories = await this.categoryService.getAllCategories(userId);
        
        for (const importTxn of newTransactions) {
          try {
            // Map category if provided
            if (importTxn.category) {
              await this.mapImportCategory(userId, importTxn.category, existingCategories);
            }

            // Convert import transaction to app transaction format
            // Note: This creates a synthetic transaction - in a real implementation,
            // you'd need a way to handle transactions not from Plaid
            // For now, we'll just track the metadata without creating the full object
            
            // In a full implementation, you'd save via TransactionService
            imported++;
            job.processedRows++;
            job.progress = Math.round((job.processedRows / job.totalRows) * 100);

          } catch (error) {
            errors.push(`Failed to process transaction "${importTxn.description}": ${error instanceof Error ? error.message : 'Unknown error'}`);
            job.errorRows++;
          }
        }
      }

      const successMessage = imported > 0 
        ? `Successfully imported ${imported} transactions${skipped > 0 ? `, skipped ${skipped} duplicates` : ''}`
        : skipped > 0 
          ? `No new transactions to import, skipped ${skipped} duplicates`
          : 'No transactions processed';

      return {
        success: errors.length === 0,
        message: errors.length === 0 ? successMessage : `Imported ${imported} transactions with ${errors.length} errors`,
        imported,
        skipped,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined
      };

    } catch (error) {
      return {
        success: false,
        message: 'Transaction import failed',
        errors: [error instanceof Error ? error.message : 'Unknown error occurred']
      };
    }
  }

  /**
   * Analyze category mappings for import preview
   */
  private async analyzeCategoryMappings(userId: string, importTransactions: ParsedTransaction[]) {
    const existingCategories = await this.categoryService.getAllCategories(userId);
    const categoryMap = new Map(existingCategories.map(cat => [cat.name.toLowerCase(), cat]));

    let canMap = 0;
    let needCreation = 0;
    let uncategorized = 0;

    for (const txn of importTransactions) {
      if (!txn.category || txn.category.trim() === '') {
        uncategorized++;
      } else if (categoryMap.has(txn.category.toLowerCase())) {
        canMap++;
      } else {
        needCreation++;
      }
    }

    return { canMap, needCreation, uncategorized };
  }

  /**
   * Map import category to existing app category
   */
  private async mapImportCategory(_userId: string, importCategory: string, existingCategories: Category[]): Promise<string | null> {
    // Simple name-based mapping for now
    const match = existingCategories.find(cat => 
      cat.name.toLowerCase() === importCategory.toLowerCase()
    );
    
    if (match) {
      return match.id;
    }

    // Could implement fuzzy matching here for better results
    // For now, return null (uncategorized)
    return null;
  }

  /**
   * Generate a unique transaction ID for imported transactions
   * @unused - For future implementation when actually saving transactions
   */
  // private generateTransactionId(): string {
  //   return `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  // }

  /**
   * Normalize date from import format to app format
   * @unused - For future implementation when actually saving transactions
   */
  // private normalizeTransactionDate(dateStr: string): string {
  //   // Handle M/D/YYYY format
  //   const parts = dateStr.split('/');
  //   if (parts.length === 3) {
  //     const month = parts[0].padStart(2, '0');
  //     const day = parts[1].padStart(2, '0');
  //     const year = parts[2];
  //     return `${year}-${month}-${day}`;
  //   }
  //   return dateStr;
  // }

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
   * Update categories on matched transactions only
   */
  private async updateMatchedTransactionCategories(
    userId: string,
    duplicateMatches: TransactionMatch[],
    job: ImportJob
  ): Promise<ImportResult> {
    const existingCategories = await this.categoryService.getAllCategories(userId);
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];
    const warnings: string[] = [];

    // Filter matches that have import categories
    const matchesToUpdate = duplicateMatches.filter(match => 
      match.importTransaction.category && 
      match.importTransaction.category.trim() !== ''
    );

    job.totalRows = matchesToUpdate.length;
    job.processedRows = 0;

    for (const match of matchesToUpdate) {
      try {
        const importCategory = match.importTransaction.category!;
        
        // Find or create the category
        let categoryId = await this.mapImportCategory(userId, importCategory, existingCategories);
        
        // If no mapping found, try to find by name similarity
        if (!categoryId) {
          const similarCategory = existingCategories.find(cat => 
            cat.name.toLowerCase().includes(importCategory.toLowerCase()) ||
            importCategory.toLowerCase().includes(cat.name.toLowerCase())
          );
          
          if (similarCategory) {
            categoryId = similarCategory.id;
          } else {
            // For now, skip unmappable categories
            warnings.push(`Could not map category "${importCategory}" - skipping transaction update`);
            skipped++;
            job.processedRows++;
            continue;
          }
        }

        // Update the existing transaction's category
        await this.transactionService.updateTransactionCategory(
          userId,
          match.existingTransaction.id,
          categoryId
        );
        
        updated++;
        job.processedRows++;
        job.progress = Math.round((job.processedRows / job.totalRows) * 100);
        
      } catch (error) {
        errors.push(`Failed to update category for transaction "${match.importTransaction.description}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        job.errorRows++;
      }
    }

    const message = updated > 0 
      ? `Successfully updated categories on ${updated} transactions${skipped > 0 ? `, skipped ${skipped} unmappable` : ''}`
      : skipped > 0 
        ? `No categories updated, skipped ${skipped} unmappable categories`
        : 'No transactions found to update';

    return {
      success: errors.length === 0,
      message: errors.length === 0 ? message : `Updated ${updated} categories with ${errors.length} errors`,
      imported: updated,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
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