import type { Category } from '../shared/types';
import { DataService } from './dataService';

export interface SavingsMigrationResult {
  migratedCount: number;
  totalCount: number;
}

export interface SavingsMigrationStatus {
  totalCategories: number;
  categoriesWithOldField: number;
  categoriesWithNewField: number;
  migrationNeeded: boolean;
  migrationComplete: boolean;
}

export interface IsIncomeMigrationStatus {
  totalCategories: number;
  categoriesWithIsIncomeProperty: number;
  categoriesMissingIsIncomeProperty: number;
  incomeCategories: number;
  expenseCategories: number;
  migrationNeeded: boolean;
  migrationComplete: boolean;
}

// Records that still carry legacy fields (`isSavings`) removed from the
// current Category type. Used only by the one-shot migration paths.
type LegacyCategory = Category & { isSavings?: boolean };

// Owns the migration operations that previously reached into CategoryService
// via `(categoryService as any).dataService` casts. The DataService contract
// already exposes getCategories/saveCategories — injecting it directly keeps
// these operations typed without piercing the CategoryService encapsulation.
export class AdminService {
  constructor(private readonly dataService: DataService) {}

  async migrateSavingsToRollover(familyId: string): Promise<SavingsMigrationResult> {
    const categories = (await this.dataService.getCategories(familyId)) as LegacyCategory[];
    let migratedCount = 0;

    const migrated = categories.map((category): Category => {
      if ('isSavings' in category && category.isSavings !== undefined) {
        const { isSavings, ...rest } = category;
        migratedCount++;
        return { ...rest, isRollover: Boolean(isSavings) } as Category;
      }
      return category;
    });

    if (migratedCount > 0) {
      await this.dataService.saveCategories(migrated, familyId);
    }

    return { migratedCount, totalCount: categories.length };
  }

  async getSavingsMigrationStatus(familyId: string): Promise<SavingsMigrationStatus> {
    const categories = (await this.dataService.getCategories(familyId)) as LegacyCategory[];
    const oldFieldCount = categories.filter(c => 'isSavings' in c).length;
    const newFieldCount = categories.filter(c => 'isRollover' in c).length;
    return {
      totalCategories: categories.length,
      categoriesWithOldField: oldFieldCount,
      categoriesWithNewField: newFieldCount,
      migrationNeeded: oldFieldCount > 0,
      migrationComplete: oldFieldCount === 0 && newFieldCount > 0,
    };
  }

  async getIsIncomeMigrationStatus(familyId: string): Promise<IsIncomeMigrationStatus> {
    const categories = await this.dataService.getCategories(familyId);
    let withProp = 0;
    let missing = 0;
    let income = 0;
    let expense = 0;

    for (const c of categories) {
      const hasProp = 'isIncome' in c && (c as Category).isIncome !== undefined;
      if (hasProp) {
        withProp++;
        if (c.isIncome) income++;
        else expense++;
      } else {
        missing++;
      }
    }

    return {
      totalCategories: categories.length,
      categoriesWithIsIncomeProperty: withProp,
      categoriesMissingIsIncomeProperty: missing,
      incomeCategories: income,
      expenseCategories: expense,
      migrationNeeded: missing > 0,
      migrationComplete: missing === 0 && withProp > 0,
    };
  }
}
