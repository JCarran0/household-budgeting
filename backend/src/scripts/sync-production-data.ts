#!/usr/bin/env ts-node

/**
 * Production Data Sync Utility
 *
 * This script allows developers to sync production data from S3 to their local
 * filesystem for debugging production issues. It includes safety checks, backup
 * functionality, and data anonymization options.
 *
 * Usage:
 *   npm run sync:production              - Interactive sync with prompts
 *   npm run sync:production:dry-run      - Preview what would be synced
 *   npm run sync:production:user -- --user-id="user123"  - Sync specific user
 *   npm run sync:production -- --anonymize  - Sync with PII anonymization
 */

import * as readline from 'readline';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { S3Adapter } from '../services/storage/s3Adapter';
import { FilesystemAdapter } from '../services/storage/filesystemAdapter';

// Load environment variables
dotenv.config();

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m'
};

interface SyncOptions {
  dryRun: boolean;
  userId?: string;
  anonymize: boolean;
  backup: boolean;
  force: boolean;
  debug: boolean;
}

interface SyncStats {
  totalFiles: number;
  downloadedFiles: number;
  skippedFiles: number;
  errors: number;
  totalSize: number;
}

class ProductionDataSync {
  private s3Adapter: S3Adapter;
  private localAdapter: FilesystemAdapter;
  private options: SyncOptions;
  private backupDir: string;

  constructor(options: SyncOptions) {
    this.options = options;

    // Initialize S3 adapter for production data
    const productionBucket = process.env.PRODUCTION_S3_BUCKET_NAME;
    const region = process.env.AWS_REGION || 'us-east-1';
    const prefix = process.env.PRODUCTION_S3_PREFIX || 'data/';

    if (!productionBucket) {
      throw new Error('PRODUCTION_S3_BUCKET_NAME environment variable is required');
    }

    this.s3Adapter = new S3Adapter(productionBucket, region, prefix);

    // Initialize local filesystem adapter
    const localDataDir = process.env.DATA_DIR || './data';
    this.localAdapter = new FilesystemAdapter(localDataDir);

    // Set backup directory
    this.backupDir = path.join(localDataDir, '..', 'data-backups', `backup-${Date.now()}`);
  }

  async run(): Promise<void> {
    try {
      console.log(colors.cyan + colors.bold + '=========================================');
      console.log('  Production Data Sync Utility');
      console.log('=========================================' + colors.reset);
      console.log('');

      // Display configuration
      this.displayConfiguration();

      // Validate AWS credentials
      await this.validateAWSAccess();

      // Get available data from production
      const availableData = await this.getAvailableData();

      if (availableData.length === 0) {
        console.log(colors.yellow + 'No data found in production S3 bucket.' + colors.reset);
        return;
      }

      // Display available data
      this.displayAvailableData(availableData);

      // Confirm operation if not in force mode
      if (!this.options.force && !this.options.dryRun) {
        const confirmed = await this.confirmSync();
        if (!confirmed) {
          console.log(colors.yellow + 'Sync cancelled by user.' + colors.reset);
          return;
        }
      }

      // Create backup if requested
      if (this.options.backup && !this.options.dryRun) {
        await this.createBackup();
      }

      // Perform the sync
      const stats = await this.performSync(availableData);

      // Display results
      this.displayResults(stats);

    } catch (error) {
      console.error(colors.red + 'Sync failed:' + colors.reset, error);
      process.exit(1);
    }
  }

  private displayConfiguration(): void {
    console.log(colors.blue + 'Configuration:' + colors.reset);
    console.log(`  Mode: ${this.options.dryRun ? 'DRY RUN (preview only)' : 'LIVE SYNC'}`);
    console.log(`  Production Bucket: ${process.env.PRODUCTION_S3_BUCKET_NAME}`);
    console.log(`  Local Data Dir: ${process.env.DATA_DIR || './data'}`);
    console.log(`  AWS Region: ${process.env.AWS_REGION || 'us-east-1'}`);

    if (this.options.userId) {
      console.log(`  Filter User: ${this.options.userId}`);
    }

    if (this.options.anonymize) {
      console.log(colors.yellow + '  Anonymization: ENABLED' + colors.reset);
    }

    if (this.options.backup) {
      console.log(`  Backup: ${this.backupDir}`);
    }

    console.log('');
  }

  private async validateAWSAccess(): Promise<void> {
    try {
      console.log(colors.blue + 'Validating AWS access...' + colors.reset);

      // Try to list objects to validate credentials
      const testList = await this.s3Adapter.list('');

      console.log(colors.green + '✓ AWS access validated' + colors.reset);

      if (this.options.debug) {
        console.log(`  Found ${testList.length} data files in production`);
      }

    } catch (error) {
      console.error(colors.red + '✗ AWS access validation failed' + colors.reset);
      console.error('  Please check your AWS credentials and permissions.');
      console.error('  See docs/AWS-LOCAL-SETUP.md for setup instructions.');
      throw error;
    }
  }

  private async getAvailableData(): Promise<string[]> {
    console.log(colors.blue + 'Scanning production data...' + colors.reset);

    const allFiles = await this.s3Adapter.list('');

    // Filter by user if specified
    if (this.options.userId) {
      return allFiles.filter(file =>
        file.includes(`_${this.options.userId}`) ||
        file.includes(`/${this.options.userId}/`)
      );
    }

    return allFiles;
  }

  private displayAvailableData(files: string[]): void {
    console.log(colors.blue + `Available data files (${files.length} total):` + colors.reset);

    // Group files by type for better display
    const fileGroups: Record<string, string[]> = {};

    files.forEach(file => {
      const type = this.getFileType(file);
      if (!fileGroups[type]) {
        fileGroups[type] = [];
      }
      fileGroups[type].push(file);
    });

    Object.entries(fileGroups).forEach(([type, typeFiles]) => {
      console.log(`  ${colors.cyan}${type}${colors.reset}: ${typeFiles.length} files`);

      if (this.options.debug) {
        typeFiles.slice(0, 3).forEach(file => {
          console.log(`    - ${file}`);
        });
        if (typeFiles.length > 3) {
          console.log(`    ... and ${typeFiles.length - 3} more`);
        }
      }
    });

    console.log('');
  }

  private getFileType(filename: string): string {
    if (filename.includes('users_')) return 'Users';
    if (filename.includes('accounts_')) return 'Accounts';
    if (filename.includes('transactions_')) return 'Transactions';
    if (filename.includes('categories_')) return 'Categories';
    if (filename.includes('budgets_')) return 'Budgets';
    if (filename.includes('autoCategorizeRules_')) return 'Auto-categorization Rules';
    return 'Other';
  }

  private async confirmSync(): Promise<boolean> {
    console.log(colors.red + colors.bold + 'WARNING:' + colors.reset + colors.red +
      ' This will replace your local data with production data!' + colors.reset);
    console.log(colors.red + 'Your current local data will be lost unless backed up.' + colors.reset);
    console.log('');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question('Do you want to continue? (yes/no): ', (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
      });
    });
  }

  private async createBackup(): Promise<void> {
    console.log(colors.blue + 'Creating backup of local data...' + colors.reset);

    try {
      // Ensure backup directory exists
      fs.mkdirSync(this.backupDir, { recursive: true });

      // Get list of local files
      const localFiles = await this.localAdapter.list('');

      for (const file of localFiles) {
        const data = await this.localAdapter.read(file);
        if (data) {
          const backupPath = path.join(this.backupDir, `${file}.json`);
          fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));
        }
      }

      console.log(colors.green + `✓ Backup created: ${this.backupDir}` + colors.reset);
      console.log('');

    } catch (error) {
      console.error(colors.red + '✗ Backup failed:' + colors.reset, error);
      throw error;
    }
  }

  private async performSync(files: string[]): Promise<SyncStats> {
    const stats: SyncStats = {
      totalFiles: files.length,
      downloadedFiles: 0,
      skippedFiles: 0,
      errors: 0,
      totalSize: 0
    };

    console.log(colors.blue + `${this.options.dryRun ? 'Previewing' : 'Syncing'} ${files.length} files...` + colors.reset);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const progress = `(${i + 1}/${files.length})`;

      try {
        if (this.options.debug) {
          console.log(`  ${progress} ${file}`);
        } else {
          // Show progress without debug details
          process.stdout.write(`\r  Progress: ${i + 1}/${files.length} files`);
        }

        if (this.options.dryRun) {
          // Just check if file exists in production
          const exists = await this.s3Adapter.exists(file);
          if (exists) {
            stats.downloadedFiles++;
          } else {
            stats.skippedFiles++;
          }
        } else {
          // Actually download and save the file
          const data = await this.s3Adapter.read(file);

          if (data) {
            // Apply anonymization if requested
            const processedData = this.options.anonymize ?
              this.anonymizeData(file, data) : data;

            await this.localAdapter.write(file, processedData);
            stats.downloadedFiles++;
            stats.totalSize += JSON.stringify(data).length;
          } else {
            stats.skippedFiles++;
          }
        }

      } catch (error) {
        stats.errors++;
        if (this.options.debug) {
          console.error(`    Error processing ${file}:`, error);
        }
      }
    }

    if (!this.options.debug) {
      console.log(''); // New line after progress
    }

    return stats;
  }

  private anonymizeData(filename: string, data: any): any {
    if (!this.options.anonymize) {
      return data;
    }

    // Clone the data to avoid modifying the original
    const anonymized = JSON.parse(JSON.stringify(data));

    // Anonymize based on file type
    if (filename.includes('users_')) {
      return this.anonymizeUsers(anonymized);
    } else if (filename.includes('accounts_')) {
      return this.anonymizeAccounts(anonymized);
    } else if (filename.includes('transactions_')) {
      return this.anonymizeTransactions(anonymized);
    }

    return anonymized;
  }

  private anonymizeUsers(users: any[]): any[] {
    if (!Array.isArray(users)) return users;

    return users.map((user, index) => ({
      ...user,
      username: `user${index + 1}`,
      // Keep password hash for authentication testing
    }));
  }

  private anonymizeAccounts(accounts: any[]): any[] {
    if (!Array.isArray(accounts)) return accounts;

    return accounts.map((account, index) => ({
      ...account,
      name: `Account ${index + 1}`,
      officialName: `Official Account ${index + 1}`,
      mask: `****${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
      // Keep account type and institution for debugging
    }));
  }

  private anonymizeTransactions(transactions: any[]): any[] {
    if (!Array.isArray(transactions)) return transactions;

    const merchants = ['Store A', 'Restaurant B', 'Service C', 'Shop D', 'Company E'];

    return transactions.map(transaction => ({
      ...transaction,
      description: merchants[Math.floor(Math.random() * merchants.length)],
      merchantName: merchants[Math.floor(Math.random() * merchants.length)],
      // Keep amount, date, and category for debugging
    }));
  }

  private displayResults(stats: SyncStats): void {
    console.log('');
    console.log(colors.green + colors.bold + 'Sync Results:' + colors.reset);
    console.log(`  Total files: ${stats.totalFiles}`);
    console.log(`  ${this.options.dryRun ? 'Would download' : 'Downloaded'}: ${colors.green}${stats.downloadedFiles}${colors.reset}`);
    console.log(`  Skipped: ${colors.yellow}${stats.skippedFiles}${colors.reset}`);
    console.log(`  Errors: ${colors.red}${stats.errors}${colors.reset}`);

    if (!this.options.dryRun && stats.totalSize > 0) {
      const sizeMB = (stats.totalSize / (1024 * 1024)).toFixed(2);
      console.log(`  Total size: ${sizeMB} MB`);
    }

    console.log('');

    if (this.options.dryRun) {
      console.log(colors.cyan + 'This was a dry run. No files were actually downloaded.' + colors.reset);
      console.log(colors.cyan + 'Run without --dry-run to perform the actual sync.' + colors.reset);
    } else if (stats.downloadedFiles > 0) {
      console.log(colors.green + 'Production data sync completed successfully!' + colors.reset);

      if (this.options.backup) {
        console.log('');
        console.log(colors.blue + 'Your original data was backed up to:' + colors.reset);
        console.log(`  ${this.backupDir}`);
        console.log('');
        console.log(colors.blue + 'To restore your original data later:' + colors.reset);
        console.log(`  npm run backup:restore -- --backup-dir="${this.backupDir}"`);
      }

      console.log('');
      console.log(colors.yellow + 'Security reminder:' + colors.reset);
      console.log('  • This data contains real production information');
      console.log('  • Delete it when debugging is complete');
      console.log('  • Never commit this data to version control');
    }
  }
}

// Parse command line arguments
function parseArgs(): SyncOptions {
  const args = process.argv.slice(2);

  return {
    dryRun: args.includes('--dry-run'),
    userId: args.find(arg => arg.startsWith('--user-id='))?.split('=')[1],
    anonymize: args.includes('--anonymize'),
    backup: !args.includes('--no-backup'),
    force: args.includes('--force'),
    debug: args.includes('--debug') || process.env.DEBUG === 'true'
  };
}

// Main execution
async function main() {
  const options = parseArgs();

  try {
    const sync = new ProductionDataSync(options);
    await sync.run();
  } catch (error) {
    console.error(colors.red + 'Fatal error:' + colors.reset, error);
    process.exit(1);
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  main();
}

export { ProductionDataSync, SyncOptions };