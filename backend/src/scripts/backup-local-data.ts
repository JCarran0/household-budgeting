#!/usr/bin/env ts-node

/**
 * Local Data Backup Utility
 *
 * This script creates backups of local development data and provides restore
 * functionality. Useful before syncing production data or making destructive
 * changes to local data.
 *
 * Usage:
 *   npm run backup:local                 - Create a backup
 *   npm run backup:restore               - Restore latest backup
 *   npm run backup:restore -- --backup-dir="path"  - Restore specific backup
 *   npm run backup:list                  - List available backups
 *   npm run backup:cleanup               - Remove old backups
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import * as dotenv from 'dotenv';
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
  bold: '\x1b[1m'
};

interface BackupOptions {
  backupDir?: string;
  force: boolean;
  description?: string;
  debug: boolean;
}

interface BackupInfo {
  path: string;
  timestamp: Date;
  description?: string;
  fileCount: number;
  size: number;
}

class LocalDataBackup {
  private localAdapter: FilesystemAdapter;
  private backupsDir: string;
  private dataDir: string;
  private options: BackupOptions;

  constructor(options: BackupOptions) {
    this.options = options;
    this.dataDir = process.env.DATA_DIR || './data';
    this.backupsDir = path.join(this.dataDir, '..', 'data-backups');
    this.localAdapter = new FilesystemAdapter(this.dataDir);

    // Ensure backups directory exists
    if (!fs.existsSync(this.backupsDir)) {
      fs.mkdirSync(this.backupsDir, { recursive: true });
    }
  }

  async createBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupName = `backup-${timestamp}`;
    const backupPath = path.join(this.backupsDir, backupName);

    console.log(colors.cyan + colors.bold + '=========================================');
    console.log('  Local Data Backup Utility');
    console.log('=========================================' + colors.reset);
    console.log('');

    console.log(colors.blue + 'Creating backup...' + colors.reset);
    console.log(`  Source: ${this.dataDir}`);
    console.log(`  Backup: ${backupPath}`);

    if (this.options.description) {
      console.log(`  Description: ${this.options.description}`);
    }

    console.log('');

    try {
      // Create backup directory
      fs.mkdirSync(backupPath, { recursive: true });

      // Get list of local files
      const localFiles = await this.localAdapter.list('');

      if (localFiles.length === 0) {
        console.log(colors.yellow + 'No local data files found to backup.' + colors.reset);
        fs.rmdirSync(backupPath);
        return '';
      }

      let totalSize = 0;
      let fileCount = 0;

      // Copy each file to backup
      for (const file of localFiles) {
        try {
          const data = await this.localAdapter.read(file);
          if (data) {
            const backupFilePath = path.join(backupPath, `${file}.json`);
            const dataString = JSON.stringify(data, null, 2);

            // Create subdirectories if needed
            const backupFileDir = path.dirname(backupFilePath);
            if (!fs.existsSync(backupFileDir)) {
              fs.mkdirSync(backupFileDir, { recursive: true });
            }

            fs.writeFileSync(backupFilePath, dataString);
            totalSize += dataString.length;
            fileCount++;

            if (this.options.debug) {
              console.log(`  ✓ ${file}`);
            }
          }
        } catch (error) {
          console.error(colors.red + `  ✗ Failed to backup ${file}:` + colors.reset, error);
        }
      }

      // Create backup metadata
      const metadata = {
        timestamp: new Date().toISOString(),
        description: this.options.description,
        fileCount,
        totalSize,
        dataDir: this.dataDir,
        files: localFiles
      };

      fs.writeFileSync(
        path.join(backupPath, 'backup-metadata.json'),
        JSON.stringify(metadata, null, 2)
      );

      console.log(colors.green + `✓ Backup created successfully!` + colors.reset);
      console.log(`  Files backed up: ${fileCount}`);
      console.log(`  Total size: ${(totalSize / 1024).toFixed(2)} KB`);
      console.log(`  Backup location: ${backupPath}`);

      return backupPath;

    } catch (error) {
      console.error(colors.red + '✗ Backup failed:' + colors.reset, error);

      // Clean up partial backup
      if (fs.existsSync(backupPath)) {
        fs.rmSync(backupPath, { recursive: true, force: true });
      }

      throw error;
    }
  }

  async restoreBackup(backupPath?: string): Promise<void> {
    console.log(colors.cyan + colors.bold + '=========================================');
    console.log('  Local Data Restore Utility');
    console.log('=========================================' + colors.reset);
    console.log('');

    // If no backup path specified, use the latest
    if (!backupPath) {
      const backups = this.listBackups();
      if (backups.length === 0) {
        console.log(colors.yellow + 'No backups found to restore.' + colors.reset);
        return;
      }

      backupPath = backups[0].path; // Most recent backup
      console.log(colors.blue + `Using latest backup: ${path.basename(backupPath)}` + colors.reset);
    }

    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup directory not found: ${backupPath}`);
    }

    // Load backup metadata
    const metadataPath = path.join(backupPath, 'backup-metadata.json');
    let metadata: any = {};

    if (fs.existsSync(metadataPath)) {
      metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      console.log(colors.blue + 'Backup information:' + colors.reset);
      console.log(`  Created: ${new Date(metadata.timestamp).toLocaleString()}`);
      console.log(`  Files: ${metadata.fileCount || 'Unknown'}`);
      console.log(`  Size: ${metadata.totalSize ? (metadata.totalSize / 1024).toFixed(2) + ' KB' : 'Unknown'}`);

      if (metadata.description) {
        console.log(`  Description: ${metadata.description}`);
      }
    } else {
      console.log(colors.yellow + 'Warning: No backup metadata found.' + colors.reset);
    }

    console.log('');

    // Confirm restore if not in force mode
    if (!this.options.force) {
      const confirmed = await this.confirmRestore();
      if (!confirmed) {
        console.log(colors.yellow + 'Restore cancelled by user.' + colors.reset);
        return;
      }
    }

    console.log(colors.blue + 'Restoring data...' + colors.reset);

    try {
      // Clear existing data directory
      if (fs.existsSync(this.dataDir)) {
        fs.rmSync(this.dataDir, { recursive: true, force: true });
      }
      fs.mkdirSync(this.dataDir, { recursive: true });

      // Restore files from backup
      const backupFiles = this.getBackupFiles(backupPath);
      let restoredCount = 0;

      for (const backupFile of backupFiles) {
        try {
          // Skip metadata file
          if (backupFile.name === 'backup-metadata.json') {
            continue;
          }

          const data = JSON.parse(fs.readFileSync(backupFile.path, 'utf8'));
          const originalFileName = backupFile.name.replace(/\.json$/, '');

          await this.localAdapter.write(originalFileName, data);
          restoredCount++;

          if (this.options.debug) {
            console.log(`  ✓ ${originalFileName}`);
          }

        } catch (error) {
          console.error(colors.red + `  ✗ Failed to restore ${backupFile.name}:` + colors.reset, error);
        }
      }

      console.log(colors.green + `✓ Restore completed successfully!` + colors.reset);
      console.log(`  Files restored: ${restoredCount}`);

    } catch (error) {
      console.error(colors.red + '✗ Restore failed:' + colors.reset, error);
      throw error;
    }
  }

  listBackups(): BackupInfo[] {
    if (!fs.existsSync(this.backupsDir)) {
      return [];
    }

    const backupDirs = fs.readdirSync(this.backupsDir)
      .filter(name => fs.statSync(path.join(this.backupsDir, name)).isDirectory())
      .filter(name => name.startsWith('backup-'));

    const backups: BackupInfo[] = [];

    for (const backupDir of backupDirs) {
      const backupPath = path.join(this.backupsDir, backupDir);
      const metadataPath = path.join(backupPath, 'backup-metadata.json');

      let metadata: any = {};
      if (fs.existsSync(metadataPath)) {
        try {
          metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        } catch (error) {
          console.warn(`Warning: Could not read metadata for backup ${backupDir}`);
        }
      }

      // Get backup info from directory
      const stats = fs.statSync(backupPath);
      const backupFiles = this.getBackupFiles(backupPath);
      const totalSize = backupFiles.reduce((size, file) => {
        try {
          return size + fs.statSync(file.path).size;
        } catch {
          return size;
        }
      }, 0);

      backups.push({
        path: backupPath,
        timestamp: metadata.timestamp ? new Date(metadata.timestamp) : stats.mtime,
        description: metadata.description,
        fileCount: metadata.fileCount || backupFiles.length - 1, // -1 for metadata file
        size: metadata.totalSize || totalSize
      });
    }

    // Sort by timestamp, newest first
    return backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  displayBackups(): void {
    console.log(colors.cyan + colors.bold + '=========================================');
    console.log('  Available Backups');
    console.log('=========================================' + colors.reset);
    console.log('');

    const backups = this.listBackups();

    if (backups.length === 0) {
      console.log(colors.yellow + 'No backups found.' + colors.reset);
      console.log('Create a backup with: npm run backup:local');
      return;
    }

    backups.forEach((backup, index) => {
      const name = path.basename(backup.path);
      const isLatest = index === 0;
      const age = this.getRelativeTime(backup.timestamp);

      console.log(colors.blue + (isLatest ? '✓ ' : '  ') + name + colors.reset +
                  (isLatest ? colors.green + ' (latest)' + colors.reset : ''));
      console.log(`    Created: ${backup.timestamp.toLocaleString()} (${age})`);
      console.log(`    Files: ${backup.fileCount}, Size: ${(backup.size / 1024).toFixed(2)} KB`);

      if (backup.description) {
        console.log(`    Description: ${backup.description}`);
      }

      console.log(`    Path: ${backup.path}`);
      console.log('');
    });
  }

  async cleanupOldBackups(keepCount: number = 5): Promise<void> {
    console.log(colors.cyan + colors.bold + '=========================================');
    console.log('  Backup Cleanup');
    console.log('=========================================' + colors.reset);
    console.log('');

    const backups = this.listBackups();

    if (backups.length <= keepCount) {
      console.log(colors.green + `Only ${backups.length} backups found, keeping all.` + colors.reset);
      return;
    }

    const toDelete = backups.slice(keepCount);

    console.log(colors.blue + `Found ${backups.length} backups, keeping newest ${keepCount}.` + colors.reset);
    console.log(colors.yellow + `Will delete ${toDelete.length} old backups:` + colors.reset);

    toDelete.forEach(backup => {
      const name = path.basename(backup.path);
      const age = this.getRelativeTime(backup.timestamp);
      console.log(`  • ${name} (${age})`);
    });

    console.log('');

    if (!this.options.force) {
      const confirmed = await this.confirmCleanup();
      if (!confirmed) {
        console.log(colors.yellow + 'Cleanup cancelled by user.' + colors.reset);
        return;
      }
    }

    let deletedCount = 0;
    for (const backup of toDelete) {
      try {
        fs.rmSync(backup.path, { recursive: true, force: true });
        deletedCount++;

        if (this.options.debug) {
          console.log(`  ✓ Deleted ${path.basename(backup.path)}`);
        }

      } catch (error) {
        console.error(colors.red + `  ✗ Failed to delete ${path.basename(backup.path)}:` + colors.reset, error);
      }
    }

    console.log(colors.green + `✓ Deleted ${deletedCount} old backups.` + colors.reset);
  }

  private getBackupFiles(backupPath: string): Array<{ name: string; path: string }> {
    if (!fs.existsSync(backupPath)) {
      return [];
    }

    const files: Array<{ name: string; path: string }> = [];

    function scanDirectory(dir: string, relativePath: string = '') {
      const items = fs.readdirSync(dir);

      for (const item of items) {
        const fullPath = path.join(dir, item);
        const relativeItemPath = path.join(relativePath, item);

        if (fs.statSync(fullPath).isDirectory()) {
          scanDirectory(fullPath, relativeItemPath);
        } else {
          files.push({
            name: item,
            path: fullPath
          });
        }
      }
    }

    scanDirectory(backupPath);
    return files;
  }

  private async confirmRestore(): Promise<boolean> {
    console.log(colors.red + colors.bold + 'WARNING:' + colors.reset + colors.red +
      ' This will replace all your current local data!' + colors.reset);
    console.log('');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question('Do you want to continue with the restore? (yes/no): ', (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
      });
    });
  }

  private async confirmCleanup(): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question('Do you want to delete these old backups? (yes/no): ', (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
      });
    });
  }

  private getRelativeTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 60) {
      return `${minutes} minutes ago`;
    } else if (hours < 24) {
      return `${hours} hours ago`;
    } else {
      return `${days} days ago`;
    }
  }
}

// Parse command line arguments
function parseArgs(): { action: string; options: BackupOptions } {
  const args = process.argv.slice(2);

  // Determine action from npm script name or arguments
  const scriptName = process.env.npm_lifecycle_event;
  let action = 'create';

  if (scriptName?.includes('restore')) {
    action = 'restore';
  } else if (scriptName?.includes('list')) {
    action = 'list';
  } else if (scriptName?.includes('cleanup')) {
    action = 'cleanup';
  }

  // Override with explicit action arguments
  if (args.includes('--restore')) action = 'restore';
  if (args.includes('--list')) action = 'list';
  if (args.includes('--cleanup')) action = 'cleanup';

  const options: BackupOptions = {
    backupDir: args.find(arg => arg.startsWith('--backup-dir='))?.split('=')[1],
    force: args.includes('--force'),
    description: args.find(arg => arg.startsWith('--description='))?.split('=')[1],
    debug: args.includes('--debug') || process.env.DEBUG === 'true'
  };

  return { action, options };
}

// Main execution
async function main() {
  const { action, options } = parseArgs();

  try {
    const backup = new LocalDataBackup(options);

    switch (action) {
      case 'create':
        await backup.createBackup();
        break;

      case 'restore':
        await backup.restoreBackup(options.backupDir);
        break;

      case 'list':
        backup.displayBackups();
        break;

      case 'cleanup':
        await backup.cleanupOldBackups();
        break;

      default:
        console.error(colors.red + `Unknown action: ${action}` + colors.reset);
        process.exit(1);
    }

  } catch (error) {
    console.error(colors.red + 'Operation failed:' + colors.reset, error);
    process.exit(1);
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  main();
}

export { LocalDataBackup, BackupOptions };