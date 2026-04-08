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
import { ImportService } from './importService';
import { ActualsOverrideService } from './actualsOverrideService';
import { TripService, getTripService } from './tripService';
import { ReadOnlyDataServiceImpl } from './readOnlyDataService';
import { ChatbotDataService } from './chatbotDataService';
import { ChatbotCostTracker } from './chatbotCostTracker';
import { ChatbotService } from './chatbotService';
import { CategorizationService } from './categorizationService';
import { ManualAccountService } from './manualAccountService';

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
// Create budgetService temporarily without categories callback
export const budgetService = new BudgetService(dataService);
// Create categoryService first without autoCategorizeService and importService
export const categoryService = new CategoryService(dataService, budgetService, undefined, transactionService, undefined);

// Update budgetService with categories callback
(budgetService as any).getCategoriesCallback = (userId: string) => categoryService.getAllCategories(userId);
// Then create autoCategorizeService with categoryService
export const autoCategorizeService = new AutoCategorizeService(dataService, categoryService);
// Create importService with all required dependencies
export const importService = ImportService.getInstance(dataService, categoryService, transactionService, autoCategorizeService);
// Now update categoryService with autoCategorizeService and importService references
(categoryService as any).autoCategorizeService = autoCategorizeService;
(categoryService as any).importService = importService;
export const actualsOverrideService = new ActualsOverrideService(dataService);
export const manualAccountService = new ManualAccountService(dataService);
export const reportService = new ReportService(dataService, actualsOverrideService);
export const tripService = getTripService(dataService, transactionService);

// SECURITY: chatbotDataService receives ONLY readOnlyDataService.
// It must NEVER receive the full dataService, plaidService, accountService,
// or any service with write methods. SEC-001/003/018 compliance.
const readOnlyDataService = new ReadOnlyDataServiceImpl(dataService);
export const chatbotDataService = new ChatbotDataService(readOnlyDataService);
const chatbotCostTracker = new ChatbotCostTracker(
  dataService,
  Number(process.env.CHATBOT_MONTHLY_LIMIT) || 20,
);
export const chatbotService = new ChatbotService(
  chatbotDataService,
  chatbotCostTracker,
  process.env.GITHUB_ISSUES_PAT || '',
  process.env.ANTHROPIC_API_KEY || '',
);
export const categorizationService = new CategorizationService(
  chatbotDataService,
  chatbotCostTracker,
  process.env.ANTHROPIC_API_KEY || '',
);

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
  ReportService,
  ImportService,
  ActualsOverrideService,
  TripService,
  ChatbotDataService,
  ChatbotService,
  CategorizationService,
  ManualAccountService,
};