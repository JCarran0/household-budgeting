import { createApiClient } from './api/client';
import { createAuthApi } from './api/auth';
import { createAccountsApi } from './api/accounts';
import { createTransactionsApi } from './api/transactions';
import { createCategoriesApi } from './api/categories';
import { createBudgetsApi } from './api/budgets';
import { createReportsApi } from './api/reports';
import { createAdminApi } from './api/admin';
import { createMiscApi } from './api/misc';
import { createTripsApi } from './api/trips';
import { createProjectsApi } from './api/projects';
import { createChatbotApi } from './api/chatbot';
import { createFeedbackApi } from './api/feedback';
import { createActualsOverridesApi } from './api/actualsOverrides';
import { createManualAccountsApi } from './api/manualAccounts';
import { createThemesApi } from './api/themes';
import { createAutoCategorizeApi } from './api/autoCategorize';
import { createAmazonReceiptsApi } from './api/amazonReceipts';
import { createFamilyApi } from './api/family';
import { createTasksApi } from './api/tasks';
import { createTaskTemplatesApi } from './api/taskTemplates';

// Re-export all types so existing imports don't break
export type { ExtendedPlaidAccount } from './api/accounts';
export type {
  CategoryWithChildren,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './api/categories';
export type {
  CreateBudgetDto,
  BudgetComparison,
  MonthlyBudgetResponse,
  BudgetComparisonResponse,
  BudgetHistoryResponse,
} from './api/budgets';
export type { VersionResponse, ChangelogResponse } from './api/misc';
export type { ActualsOverride, CreateActualsOverrideDto } from './api/actualsOverrides';

const client = createApiClient();

export const api = {
  ...createAuthApi(client),
  ...createAccountsApi(client),
  ...createTransactionsApi(client),
  ...createCategoriesApi(client),
  ...createBudgetsApi(client),
  ...createReportsApi(client),
  ...createAdminApi(client),
  ...createTripsApi(client),
  ...createProjectsApi(client),
  ...createChatbotApi(client),
  ...createFeedbackApi(client),
  ...createActualsOverridesApi(client),
  ...createManualAccountsApi(client),
  ...createThemesApi(client),
  ...createAutoCategorizeApi(client),
  ...createAmazonReceiptsApi(client),
  ...createFamilyApi(client),
  ...createTasksApi(client),
  ...createTaskTemplatesApi(client),
  ...createMiscApi(client),
};
