/**
 * Service Singletons
 *
 * Ensures all parts of the app use the same service instances
 */

import { config } from '../config';
import { AuthService } from './authService';
import { DataService, UnifiedDataService, InMemoryDataService } from './dataService';
import { PlaidService } from './plaidService';
import { PlaidWebhookService } from './plaidWebhookService';
import { AccountService } from './accountService';
import { TransactionService } from './transactionService';
import { CategoryService, CategoryDependencyChecker } from './categoryService';
import { BudgetService } from './budgetService';
import { ReportService } from './reportService';
import { AutoCategorizeService } from './autoCategorizeService';
import { AutoCatSuggestionService } from './autoCatSuggestionService';
import { ImportService } from './importService';
import { ActualsOverrideService } from './actualsOverrideService';
import { TripService, getTripService } from './tripService';
import { ProjectService, getProjectService } from './projectService';
import { WishlistService, getWishlistService } from './wishlistService';
import { ImageStore } from './imageStore';
import { StorageFactory, InMemoryBinaryStore } from './storage';
import { ReadOnlyDataServiceImpl } from './readOnlyDataService';
import { ChatbotDataService } from './chatbotDataService';
import { ChatbotCostTracker } from './chatbotCostTracker';
import { ChatbotService } from './chatbotService';
import { AgentTraceStore } from './agentTraceStore';
import { AgentLearningsStore } from './agentLearningsStore';
import { ActionActivityStore } from './actionActivityStore';
import { LedgerStore } from './ledgerStore';
import { LedgerService } from './ledgerService';
import { LedgerReminderJob } from './ledgerReminderJob';
import { libraryDocKey, libraryDocumentSchema } from '../validators/libraryValidators';
import { ProposalStore } from './chatActions/proposalStore';
import { ActionUndoService } from './actionUndoService';
import { CategorizationService } from './categorizationService';
import { CategorizationRunStore } from './categorizationRunStore';
import { ManualAccountService } from './manualAccountService';
import { AmazonReceiptService } from './amazonReceiptService';
import { FamilyService } from './familyService';
import { AccountOwnerMappingService } from './accountOwnerMappingService';
import { TaskService } from './taskService';
import { TaskTemplateService } from './taskTemplateService';
import { PushNotificationService } from './pushNotificationService';
import { AdminService } from './adminService';
import { StatementService } from './statementService';
import { BusinessSettingsService } from './businessSettingsService';
// Bootstrap chat action registry — must be imported before any chat request
// is processed. Side-effect: registers all V1 actions and logs the list.
import './chatActions';

// Create data service based on environment
// Uses StorageFactory to automatically switch between filesystem and S3
const dataService: DataService = config.server.nodeEnv === 'test'
  ? new InMemoryDataService()
  : new UnifiedDataService();

// Create singleton instances
export const authService = new AuthService(dataService);
export const plaidService = new PlaidService();
export const accountService = new AccountService(dataService, plaidService);
export const transactionService = new TransactionService(dataService, plaidService, accountService);
export const plaidWebhookService = new PlaidWebhookService(dataService, transactionService);
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

export const autoCatSuggestionService = new AutoCatSuggestionService(
  dataService,
  autoCategorizeService,
);

// Create importService with all required dependencies, then wire it back into
// categoryService via the typed setter (no `as any` needed).
export const importService = ImportService.getInstance(dataService, categoryService, transactionService, autoCategorizeService);
categoryService.setImportService(importService);
export const actualsOverrideService = new ActualsOverrideService(dataService);
export const manualAccountService = new ManualAccountService(dataService);
export const reportService = new ReportService(dataService, actualsOverrideService);
export const tripService = getTripService(dataService, transactionService);
export const projectService = getProjectService(dataService, transactionService);
// Binary image storage — deliberately NOT part of dataService, so nothing built
// on ReadOnlyDataService (the chatbot) can reach image bytes.
export const imageStore = new ImageStore(
  config.server.nodeEnv === 'test' ? new InMemoryBinaryStore() : StorageFactory.getBinaryStore()
);
export const wishlistService = getWishlistService(dataService, categoryService, imageStore);
// Household Ledger (HOUSEHOLD-LEDGER-BRD). Writes are human-gated: this service
// backs the Household page and the confirmed chat cards, never a model tool.
export const ledgerStore = new LedgerStore(dataService);
export const ledgerService = new LedgerService(ledgerStore, async (familyId, docId) => {
  const parsed = libraryDocumentSchema.safeParse(await dataService.getData(libraryDocKey(familyId, docId)));
  if (!parsed.success) return null;
  const { title, source } = parsed.data;
  return { title, sourceUrl: source.kind === 'drive' ? source.url : null };
});

// SECURITY: chatbotDataService receives ONLY readOnlyDataService.
// It must NEVER receive the full dataService, plaidService, accountService,
// or any service with write methods. SEC-001/003/018 compliance.
const readOnlyDataService = new ReadOnlyDataServiceImpl(dataService);
export const chatbotDataService = new ChatbotDataService(readOnlyDataService);
const chatbotCostTracker = new ChatbotCostTracker(
  dataService,
  config.ai.chatbotMonthlyLimit,
  config.ai.backgroundMonthlyLimit,
);
// NOTE: like ChatbotCostTracker, AgentTraceStore receives the writable
// DataService because it must persist. It is a narrow appender over the
// `ai_traces_{familyId}` namespace, not a general write capability — the
// SEC-018 boundary around ChatbotDataService is unaffected.
export const agentTraceStore = new AgentTraceStore(dataService);
// Same narrow-appender rationale as AgentTraceStore. Note there is no read path
// from here into any tool — the agent writes learnings and can never read them
// back (SEC-L006).
export const agentLearningsStore = new AgentLearningsStore(dataService);
/**
 * REQ-P037 / REQ-P025. Narrow appenders over one key namespace each, like
 * agentTraceStore — not general write capability handed to the chatbot, and
 * deliberately not reachable from any tool or action.
 */
export const proposalStore = new ProposalStore(dataService);
export const actionActivityStore = new ActionActivityStore(dataService);
export const actionUndoService = new ActionUndoService(actionActivityStore);
export const chatbotService = new ChatbotService(
  chatbotDataService,
  chatbotCostTracker,
  config.ai.anthropicApiKey,
  agentTraceStore,
  agentLearningsStore,
  proposalStore,
);
// Like proposalStore: a narrow store over one key namespace, not reachable
// from the chatbot's ReadOnlyDataService (AI-CATEGORIZATION-BRD SEC-102).
export const categorizationRunStore = new CategorizationRunStore(dataService);
export const categorizationService = new CategorizationService(
  chatbotDataService,
  chatbotCostTracker,
  config.ai.anthropicApiKey,
  categorizationRunStore,
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
// Wire category seeder after categoryService is constructed (breaks the cycle:
// familyService.createWorkspace needs the seeder; categoryService needs dataService).
familyService.setCategorySeeder(categoryService);
export const accountOwnerMappingService = new AccountOwnerMappingService(dataService);
export const taskService = new TaskService(dataService, familyService);
export const taskTemplateService = new TaskTemplateService(dataService);
export const pushNotificationService = PushNotificationService.getInstance(dataService);
// Household Ledger reminders (plan L7). Started by index.ts, never in tests.
// REQ-H034: completing a task made from a Heads-up item marks the occurrence handled.
taskService.onTaskCompleted(async (task, userId, familyId) => {
  await ledgerService.markHandledFromTask(familyId, userId, task);
});
export const ledgerReminderJob = new LedgerReminderJob(dataService, ledgerStore, familyService, pushNotificationService);
export const adminService = new AdminService(dataService);

// statementService depends on categoryService — wire after both are initialized
export const statementService = new StatementService(dataService, categoryService);

// businessSettingsService — per-workspace header config (PR5 support)
export const businessSettingsService = new BusinessSettingsService(dataService);

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
  AutoCatSuggestionService,
  ImportService,
  ActualsOverrideService,
  TripService,
  ProjectService,
  WishlistService,
  ChatbotDataService,
  ChatbotService,
  CategorizationService,
  ManualAccountService,
  AmazonReceiptService,
  FamilyService,
  AccountOwnerMappingService,
  TaskService,
  TaskTemplateService,
  PushNotificationService,
  AdminService,
  StatementService,
  BusinessSettingsService,
};