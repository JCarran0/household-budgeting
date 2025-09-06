/**
 * Service Singletons
 * 
 * Ensures all parts of the app use the same service instances
 */

import { AuthService } from './authService';
import { DataService, UnifiedDataService, InMemoryDataService } from './dataService';
import { PlaidService } from './plaidService';
import { AccountService } from './accountService';
import { TransactionService } from './transactionService';
import { CategoryService } from './categoryService';
import { BudgetService } from './budgetService';
import { ReportService } from './reportService';
import { AutoCategorizeService } from './autoCategorizeService';

// Create data service based on environment
// Uses StorageFactory to automatically switch between filesystem and S3
const dataService: DataService = process.env.NODE_ENV === 'test' 
  ? new InMemoryDataService()
  : new UnifiedDataService();

// Create singleton instances
export const authService = new AuthService(dataService);
export const plaidService = new PlaidService();
export const accountService = new AccountService(dataService, plaidService);
export const transactionService = new TransactionService(dataService, plaidService);
export const budgetService = new BudgetService(dataService);
// Create categoryService first without autoCategorizeService
export const categoryService = new CategoryService(dataService, budgetService, undefined, transactionService);
// Then create autoCategorizeService with categoryService
export const autoCategorizeService = new AutoCategorizeService(dataService, categoryService);
// Now update categoryService with autoCategorizeService reference
(categoryService as any).autoCategorizeService = autoCategorizeService;
export const reportService = new ReportService(dataService);

// Export dataService for other services that need it
export { dataService };

// Export types
export { 
  AuthService, 
  PlaidService, 
  DataService, 
  AccountService, 
  TransactionService,
  CategoryService,
  BudgetService,
  ReportService
};