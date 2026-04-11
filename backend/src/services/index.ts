/**
 * Service Singletons
 *
 * Ensures all parts of the app use the same service instances
 */

import { config } from '../config';
import { AuthService } from './authService';
import { DataService, UnifiedDataService, InMemoryDataService } from './dataService';
import { PlaidService } from './plaidService';
import { AccountService } from './accountService';
import { TransactionService } from './transactionService';
import { CategoryService, CategoryDependencyChecker } from './categoryService';
import { BudgetService } from './budgetService';
import { ReportService } from './reportService';
import { AutoCategorizeService } from './autoCategorizeService';
import { ImportService } from './importService';
import { ActualsOverrideService } from './actualsOverrideService';
import { TripService, getTripService } from './tripService';
import { ProjectService, getProjectService } from './projectService';
import { ReadOnlyDataServiceImpl } from './readOnlyDataService';
import { ChatbotDataService } from './chatbotDataService';
import { ChatbotCostTracker } from './chatbotCostTracker';
import { ChatbotService } from './chatbotService';
import { CategorizationService } from './categorizationService';
import { ManualAccountService } from './manualAccountService';
import { AmazonReceiptService } from './amazonReceiptService';
import { FamilyService } from './familyService';
import { AccountOwnerMappingService } from './accountOwnerMappingService';

// Create data service based on environment
// Uses StorageFactory to automatically switch between filesystem and S3
const dataService: DataService = config.server.nodeEnv === 'test'
  ? new InMemoryDataService()
  : new UnifiedDataService();

// Create singleton instances
export const authService = new AuthService(dataService);
export const plaidService = new PlaidService();
export const accountService = new AccountService(dataService, plaidService);
export const transactionService = new TransactionService(dataService, plaidService);
export const budgetService = new BudgetService(dataService);

// Build the dependency checker before CategoryService is created. The checker
// delegates to autoCategorizeService via a closure so that the actual instance
// can be assigned after CategoryService is constructed, breaking the cycle.
let autoCategorizeServiceRef: AutoCategorizeService | undefined;
const categoryDependencyChecker: CategoryDependencyChecker = {
  hasBudgetsForCategory: (id, uid) => budgetService.hasBudgetsForCategory(id, uid),
  hasRulesForCategory: (id, uid) => {
    if (!autoCategorizeServiceRef) throw new Error('autoCategorizeService not yet initialized');
    return autoCategorizeServiceRef.hasRulesForCategory(id, uid);
  },
  hasTransactionsForCategory: (id, uid) => transactionService.hasTransactionsForCategory(id, uid),
  getBlockingTransactionDetails: (id, uid) => transactionService.getBlockingTransactionDetails(id, uid),
};

export const categoryService = new CategoryService(dataService, categoryDependencyChecker);

// Create autoCategorizeService with categoryService, then assign the ref so the
// dependency checker closure can resolve it.
export const autoCategorizeService = new AutoCategorizeService(dataService, categoryService);
autoCategorizeServiceRef = autoCategorizeService;

// Create importService with all required dependencies, then wire it back into
// categoryService via the typed setter (no `as any` needed).
export const importService = ImportService.getInstance(dataService, categoryService, transactionService, autoCategorizeService);
categoryService.setImportService(importService);
export const actualsOverrideService = new ActualsOverrideService(dataService);
export const manualAccountService = new ManualAccountService(dataService);
export const reportService = new ReportService(dataService, actualsOverrideService);
export const tripService = getTripService(dataService, transactionService);
export const projectService = getProjectService(dataService, transactionService);

// SECURITY: chatbotDataService receives ONLY readOnlyDataService.
// It must NEVER receive the full dataService, plaidService, accountService,
// or any service with write methods. SEC-001/003/018 compliance.
const readOnlyDataService = new ReadOnlyDataServiceImpl(dataService);
export const chatbotDataService = new ChatbotDataService(readOnlyDataService);
const chatbotCostTracker = new ChatbotCostTracker(
  dataService,
  config.ai.chatbotMonthlyLimit,
);
export const chatbotService = new ChatbotService(
  chatbotDataService,
  chatbotCostTracker,
  config.ai.githubIssuesPat,
  config.ai.anthropicApiKey,
);
export const categorizationService = new CategorizationService(
  chatbotDataService,
  chatbotCostTracker,
  config.ai.anthropicApiKey,
);

export const amazonReceiptService = new AmazonReceiptService(
  dataService,
  chatbotDataService,
  chatbotCostTracker,
  transactionService,
  autoCategorizeService,
  config.ai.anthropicApiKey,
);

export const familyService = new FamilyService(dataService);
export const accountOwnerMappingService = new AccountOwnerMappingService(dataService);

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
  ProjectService,
  ChatbotDataService,
  ChatbotService,
  CategorizationService,
  ManualAccountService,
  AmazonReceiptService,
  FamilyService,
  AccountOwnerMappingService,
};