#!/usr/bin/env ts-node

/**
 * One-time idempotent backfill of multi-workspace fields (workspaceIds,
 * activeWorkspaceId) and Family.workspaceType.
 *
 * Context: Phase 1.1 (D3) — existing users have `familyId` but lack the new
 * array-membership fields added for the Business Workspace feature. The auth
 * middleware performs a lazy backfill on each user's first authenticated
 * request after deploy, so running this script is optional — it merely
 * prevents any window of partially-migrated data.
 *
 * Safety:
 *   - Idempotent: only writes records that are missing the new fields.
 *     Re-running is a safe no-op.
 *   - Preserves all existing fields; only adds defaults.
 *   - workspaceIds defaults to [familyId]; activeWorkspaceId defaults to familyId.
 *   - Family.workspaceType defaults to 'personal'.
 */

import * as path from 'path';
import { config } from 'dotenv';

config({ path: path.join(__dirname, '..', '.env') });

import { dataService } from '../src/services';

async function main(): Promise<void> {
  console.log('Starting workspace backfill...');

  // --- Backfill users ---
  const users = await dataService.getAllUsers();
  console.log(`Found ${users.length} users.`);

  let usersUpdated = 0;
  for (const user of users) {
    if (user.workspaceIds && user.workspaceIds.length > 0) {
      // Already migrated
      continue;
    }
    if (!user.familyId) {
      // No familyId to backfill from — skip (will be handled on next login)
      continue;
    }

    await dataService.updateUser(user.id, {
      workspaceIds: [user.familyId],
      activeWorkspaceId: user.familyId,
    });
    usersUpdated++;
    console.log(`  Backfilled user: ${user.username} (${user.id}) → workspaceIds=[${user.familyId}]`);
  }
  console.log(`Users updated: ${usersUpdated}`);

  // --- Backfill families ---
  const families = await dataService.getFamilies();
  console.log(`Found ${families.length} families.`);

  let familiesUpdated = 0;
  for (const family of families) {
    if (family.workspaceType !== undefined) {
      // Already has type
      continue;
    }

    await dataService.updateFamily(family.id, {
      workspaceType: 'personal',
    });
    familiesUpdated++;
    console.log(`  Backfilled family: ${family.name} (${family.id}) → workspaceType=personal`);
  }
  console.log(`Families updated: ${familiesUpdated}`);

  console.log('Workspace backfill complete.');
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
