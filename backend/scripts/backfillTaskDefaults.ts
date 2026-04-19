#!/usr/bin/env ts-node

/**
 * One-time idempotent backfill of Task v2.0 fields (snoozedUntil, sortOrder).
 *
 * Context: v2.0 added two fields to Task. The taskService read path already
 * heals legacy records on load (and persists them on any subsequent write),
 * so running this script is optional — it just avoids leaving half-migrated
 * data hanging around until each task is next touched.
 *
 * Safety:
 *   - Idempotent: only writes families whose tasks contained at least one
 *     missing field. Re-running is a no-op.
 *   - Preserves all existing fields; only fills defaults.
 *   - sortOrder default uses createdAt-as-seconds, which preserves the
 *     existing creation order as the initial board order.
 */

import * as path from 'path';
import { config } from 'dotenv';

config({ path: path.join(__dirname, '..', '.env') });

import { dataService } from '../src/services';
import type { StoredTask } from '../src/shared/types';

const TASKS_KEY_PREFIX = 'tasks_';

async function main(): Promise<void> {
  const keys = await dataService.listKeys(TASKS_KEY_PREFIX);
  console.log(`Found ${keys.length} task blobs to inspect.`);

  let familiesUpdated = 0;
  let tasksBackfilled = 0;

  for (const key of keys) {
    const tasks = (await dataService.getData<StoredTask[]>(key)) ?? [];
    let dirty = false;

    for (const task of tasks) {
      if (task.snoozedUntil === undefined) {
        task.snoozedUntil = null;
        dirty = true;
        tasksBackfilled++;
      }
      if (typeof task.sortOrder !== 'number') {
        const created = Date.parse(task.createdAt);
        task.sortOrder = Number.isFinite(created) ? created / 1000 : 0;
        dirty = true;
        // Count a task only once regardless of how many fields were missing
        if (task.snoozedUntil !== null) tasksBackfilled++;
      }
    }

    if (dirty) {
      await dataService.saveData(key, tasks);
      familiesUpdated++;
      console.log(`  ✓ ${key} — ${tasks.length} tasks`);
    }
  }

  console.log(
    `\nDone. ${familiesUpdated} family blob(s) updated; ~${tasksBackfilled} task(s) backfilled.`
  );
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
