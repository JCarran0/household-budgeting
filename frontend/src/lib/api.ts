import { createApiClient } from './api/client';
import { createAuthApi } from './api/auth';
import { createAccountsApi } from './api/accounts';
import { createTransactionsApi } from './api/transactions';
import { createCategoriesApi } from './api/categories';
import { createBudgetsApi } from './api/budgets';
import { createReportsApi } from './api/reports';
import { createAdminApi } from './api/admin';
import { createMiscApi } from './api/misc';

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
export type {
  VersionResponse,
  ChangelogResponse,
  ActualsOverride,
  CreateActualsOverrideDto,
} from './api/misc';

const client = createApiClient();

export const api = {
  ...createAuthApi(client),
  ...createAccountsApi(client),
  ...createTransactionsApi(client),
  ...createCategoriesApi(client),
  ...createBudgetsApi(client),
  ...createReportsApi(client),
  ...createAdminApi(client),
  ...createMiscApi(client),
};