#!/usr/bin/env ts-node

/**
 * One-time idempotent migration lifting project line items out of category
 * budgets and up to the project level (PROJECTS-BRD.md §5.5, v2.0).
 *
 * Before: Project.categoryBudgets[].lineItems[] — { id, name, estimatedCost, notes? }
 * After:  Project.lineItems[]                   — { id, name, estimatedCost, tag, notes? }
 *
 * The `tag` field is new and required. It is seeded with a slug of the item name;
 * long descriptive names produce long, unusable tags, which is exactly why name
 * and tag are separate fields. Review the printed table afterwards and shorten
 * any tag you would not want to type into a transaction — nothing matches until
 * the tag is actually applied to transactions, so a bad seed costs nothing but a
 * later edit.
 *
 * Safety:
 *   - Idempotent: a project that already has a top-level `lineItems` array is
 *     left untouched. Re-running is a no-op.
 *   - Never drops data: category budgets keep their categoryId and amount; only
 *     the nested lineItems array is removed after being lifted.
 *   - Order is preserved (category order, then item order within category).
 */

import * as path from 'path';
import { config } from 'dotenv';

config({ path: path.join(__dirname, '..', '.env') });

import { dataService } from '../src/services';
import { slugifyLineItemTag } from '../src/shared/utils/projectHelpers';

const PROJECTS_KEY_PREFIX = 'projects_';

/** Pre-migration shape: line items nested under a category budget. */
interface LegacyCategoryBudget {
  categoryId: string;
  amount: number;
  lineItems?: Array<{
    id?: string;
    name: string;
    estimatedCost: number;
    notes?: string;
  }>;
}

interface MigratableProject {
  id: string;
  name: string;
  categoryBudgets?: LegacyCategoryBudget[];
  lineItems?: Array<{ id: string; name: string; estimatedCost: number; tag: string; notes?: string }>;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const keys = await dataService.listKeys(PROJECTS_KEY_PREFIX);
  console.log(`Found ${keys.length} project blobs to inspect.${dryRun ? ' (dry run)' : ''}\n`);

  let familiesUpdated = 0;
  let projectsMigrated = 0;
  let itemsLifted = 0;

  for (const key of keys) {
    const projects = (await dataService.getData<MigratableProject[]>(key)) ?? [];
    let dirty = false;

    for (const project of projects) {
      // Already migrated — top-level lineItems present.
      if (Array.isArray(project.lineItems)) continue;

      const lifted: Array<{ id: string; name: string; estimatedCost: number; tag: string; notes?: string }> = [];

      for (const cb of project.categoryBudgets ?? []) {
        for (const item of cb.lineItems ?? []) {
          lifted.push({
            id: item.id ?? `${Date.now()}-${lifted.length}`,
            name: item.name,
            estimatedCost: item.estimatedCost,
            tag: slugifyLineItemTag(item.name),
            ...(item.notes !== undefined ? { notes: item.notes } : {}),
          });
        }
        delete cb.lineItems;
      }

      project.lineItems = lifted;
      dirty = true;
      projectsMigrated++;
      itemsLifted += lifted.length;

      if (lifted.length > 0) {
        console.log(`  ${project.name} — ${lifted.length} item(s) lifted:`);
        for (const li of lifted) {
          const flag = li.tag.length > 24 ? '  <-- shorten this tag' : '';
          console.log(`    ${li.name}\n      tag: ${li.tag}${flag}`);
        }
        console.log('');
      }
    }

    if (dirty) {
      familiesUpdated++;
      if (!dryRun) await dataService.saveData(key, projects);
    }
  }

  console.log(
    `${dryRun ? 'Would migrate' : 'Migrated'} ${projectsMigrated} project(s) ` +
      `(${itemsLifted} line item(s)) across ${familiesUpdated} family blob(s).`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
