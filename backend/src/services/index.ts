/**
 * Service Singletons
 * 
 * Ensures all parts of the app use the same service instances
 */

import { AuthService } from './authService';
import { DataService, JSONDataService, InMemoryDataService } from './dataService';
import { PlaidService } from './plaidService';
import { AccountService } from './accountService';
import { TransactionService } from './transactionService';
import { CategoryService } from './categoryService';
import { BudgetService } from './budgetService';
import { ReportService } from './reportService';

// Create data service based on environment
const dataService: DataService = process.env.NODE_ENV === 'test' 
  ? new InMemoryDataService()
  : new JSONDataService();

// Create singleton instances
export const authService = new AuthService(dataService);
export const plaidService = new PlaidService();
export const accountService = new AccountService(dataService, plaidService);
export const transactionService = new TransactionService(dataService, plaidService);
export const categoryService = new CategoryService(dataService);
export const budgetService = new BudgetService(dataService);
export const reportService = new ReportService(dataService);

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