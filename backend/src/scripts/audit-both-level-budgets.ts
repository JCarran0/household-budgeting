#!/usr/bin/env ts-node

/**
 * Both-Level Budget Audit
 *
 * Scans local budget data for trees where the parent category and at least one
 * child category both have budgets in the same month. These are the trees whose
 * displayed effective totals will change when the rollup rule switches from
 * additive (current shipped behavior in BudgetComparison.tsx) to max
 * (canonical rule per CATEGORY-HIERARCHY-BUDGETING-BRD.md REQ-002).
 *
 * Per the plan, this script blocks Phase 2: review the report and confirm intent
 * for each affected tree before the widget refactor ships.
 *
 * Usage:
 *   cd backend && npx ts-node src/scripts/audit-both-level-budgets.ts
 *
 * To audit production data, sync first:
 *   cd backend && AWS_PROFILE=budget-app-prod npm run sync:production
 *   then re-run this script.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import type { Category, MonthlyBudget } from '../shared/types';

dotenv.config();

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

interface BothLevelTree {
  familyId: string;
  month: string;
  parentId: string;
  parentName: string;
  parentBudget: number;
  childBudgets: { categoryId: string; categoryName: string; amount: number }[];
  childBudgetSum: number;
  additiveTotal: number;
  maxTotal: number;
  difference: number;
}

function readJson<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function discoverFamilies(dataDir: string): string[] {
  const files = fs.readdirSync(dataDir);
  const familyIds = new Set<string>();
  const re = /^budgets_(.+)\.json$/;
  for (const file of files) {
    const match = file.match(re);
    if (match) familyIds.add(match[1]);
  }
  return Array.from(familyIds).sort();
}

function auditFamily(dataDir: string, familyId: string): BothLevelTree[] {
  const budgets = readJson<MonthlyBudget[]>(path.join(dataDir, `budgets_${familyId}.json`));
  // Categories are wrapped: { categories: Category[] }. Budgets are stored as a raw array.
  const categoriesFile = readJson<{ categories: Category[] } | Category[]>(
    path.join(dataDir, `categories_${familyId}.json`)
  );
  const categories: Category[] | null = Array.isArray(categoriesFile)
    ? categoriesFile
    : (categoriesFile?.categories ?? null);
  if (!budgets || !categories) return [];

  const categoryById = new Map(categories.map(c => [c.id, c]));
  const isParent = (id: string): boolean => {
    const cat = categoryById.get(id);
    return !!cat && cat.parentId == null;
  };

  // Group budgets by month, then bucket by parent tree.
  // Tree-of-budget is determined by category.parentId (or category.id if it's a parent).
  type ParentBucket = {
    parentId: string;
    directBudget: number; // budget recorded directly on the parent category
    childBudgets: { categoryId: string; amount: number }[];
  };
  const byMonth = new Map<string, Map<string, ParentBucket>>();

  for (const budget of budgets) {
    const cat = categoryById.get(budget.categoryId);
    if (!cat) continue; // orphan; skip
    const parentId = cat.parentId ?? cat.id;
    if (!isParent(parentId)) continue; // shouldn't happen but defensive

    const monthBuckets = byMonth.get(budget.month) ?? new Map<string, ParentBucket>();
    if (!byMonth.has(budget.month)) byMonth.set(budget.month, monthBuckets);

    const bucket = monthBuckets.get(parentId) ?? { parentId, directBudget: 0, childBudgets: [] };
    if (!monthBuckets.has(parentId)) monthBuckets.set(parentId, bucket);

    if (budget.categoryId === parentId) {
      bucket.directBudget += budget.amount;
    } else {
      bucket.childBudgets.push({ categoryId: budget.categoryId, amount: budget.amount });
    }
  }

  // Find both-level cases.
  const findings: BothLevelTree[] = [];
  const sortedMonths = Array.from(byMonth.keys()).sort();
  for (const month of sortedMonths) {
    const buckets = byMonth.get(month)!;
    for (const bucket of buckets.values()) {
      if (bucket.directBudget > 0 && bucket.childBudgets.length > 0) {
        const parentName = categoryById.get(bucket.parentId)?.name ?? bucket.parentId;
        const childBudgets = bucket.childBudgets.map(cb => ({
          categoryId: cb.categoryId,
          categoryName: categoryById.get(cb.categoryId)?.name ?? cb.categoryId,
          amount: cb.amount,
        }));
        const childBudgetSum = childBudgets.reduce((s, c) => s + c.amount, 0);
        const additiveTotal = bucket.directBudget + childBudgetSum;
        const maxTotal = Math.max(bucket.directBudget, childBudgetSum);
        findings.push({
          familyId,
          month,
          parentId: bucket.parentId,
          parentName,
          parentBudget: bucket.directBudget,
          childBudgets,
          childBudgetSum,
          additiveTotal,
          maxTotal,
          difference: additiveTotal - maxTotal,
        });
      }
    }
  }
  return findings;
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function printFinding(f: BothLevelTree): void {
  console.log(`${colors.bold}${f.month}${colors.reset}  ${colors.cyan}${f.parentName}${colors.reset} ${colors.dim}(${f.parentId})${colors.reset}`);
  console.log(`  Parent direct budget:  ${fmtMoney(f.parentBudget)}`);
  console.log(`  Child budgets (sum=${fmtMoney(f.childBudgetSum)}):`);
  for (const cb of f.childBudgets) {
    console.log(`    - ${cb.categoryName} ${colors.dim}(${cb.categoryId})${colors.reset}: ${fmtMoney(cb.amount)}`);
  }
  const change = f.maxTotal - f.additiveTotal;
  const arrow = change < 0 ? `${colors.yellow}↓${colors.reset}` : '=';
  console.log(`  Current (additive):    ${fmtMoney(f.additiveTotal)}`);
  console.log(`  New (max rule):        ${fmtMoney(f.maxTotal)}  ${arrow} ${colors.yellow}${fmtMoney(change)}${colors.reset}`);
  console.log('');
}

function main(): void {
  const dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.resolve(__dirname, '../../data');

  console.log(`${colors.bold}Both-Level Budget Audit${colors.reset}`);
  console.log(`Data directory: ${dataDir}`);
  console.log('');

  if (!fs.existsSync(dataDir)) {
    console.error(`${colors.red}Data directory does not exist: ${dataDir}${colors.reset}`);
    process.exit(1);
  }

  const familyIds = discoverFamilies(dataDir);
  if (familyIds.length === 0) {
    console.log(`${colors.yellow}No budget files found in ${dataDir}.${colors.reset}`);
    return;
  }

  let totalFindings = 0;
  for (const familyId of familyIds) {
    const findings = auditFamily(dataDir, familyId);
    console.log(`${colors.bold}Family ${familyId}${colors.reset} — ${findings.length} both-level tree(s)`);
    if (findings.length === 0) {
      console.log(`  ${colors.green}No trees with both parent and child budgets in the same month.${colors.reset}`);
      console.log('');
      continue;
    }
    console.log('');
    for (const f of findings) printFinding(f);
    totalFindings += findings.length;
  }

  console.log(`${colors.bold}Summary:${colors.reset} ${totalFindings} affected tree(s) across ${familyIds.length} family/families.`);
  if (totalFindings > 0) {
    console.log('');
    console.log(`Review each row. For each, decide whether the original intent was:`);
    console.log(`  ${colors.cyan}max${colors.reset}  — parent budget is the umbrella; children are subdivisions ${colors.dim}(matches BRD REQ-002)${colors.reset}`);
    console.log(`  ${colors.yellow}additive${colors.reset} — parent and children were intentionally separate allocations ${colors.dim}(rare; would require revising the BRD)${colors.reset}`);
    console.log('');
    console.log(`If any row is genuinely additive, return to docs/features/CATEGORY-HIERARCHY-BUDGETING-BRD.md before proceeding to plan Phase 2.`);
  }
}

main();
