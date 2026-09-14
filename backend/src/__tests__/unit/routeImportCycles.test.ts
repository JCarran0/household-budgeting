/**
 * Services must not import route modules — TD-031
 *
 * REQ-P011 wants a chat action to validate with the same Zod schema its HTTP
 * route parses, so tightening one tightens both. The obvious implementation
 * imports the schema FROM the route module, and that closes a cycle:
 *
 *   services/index -> chatActions/index -> routes/X -> services/index
 *
 * A cycle here does not warn and does not fail to compile. The schema resolves
 * to `undefined` at module-eval time, `schema.parse(req.body)` throws, and
 * EVERY request to that route starts returning 400 — surfacing as a TypeError
 * somewhere downstream that names nothing about the cause. Observed
 * 2026-09-13: exporting createRuleSchema from routes/autoCategorize.ts took out
 * 29 auto-categorization tests at once.
 *
 * The fix is a neutral module under validators/ that both sides import. This
 * test is what keeps it that way, because the broken version looks completely
 * reasonable in review — it is one import line, and it is the line the
 * requirement seems to ask for.
 *
 * app.ts is exempt: mounting routers is what it is for, and it is a leaf.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC = join(__dirname, '..', '..');

/** Files allowed to import a route module. */
const ALLOWED = ['app.ts'];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules' || entry === 'routes') continue;
      sourceFiles(full, out);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('no non-route module imports a route module (TD-031)', () => {
  it('finds no offenders outside the allowlist', () => {
    const ROUTE_IMPORT = /from\s+['"][^'"]*\/routes\/[^'"]+['"]/;
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file);
      if (ALLOWED.includes(rel)) continue;
      for (const [i, line] of readFileSync(file, 'utf8').split('\n').entries()) {
        if (ROUTE_IMPORT.test(line)) offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('would actually catch one — the pattern matches a real import line', () => {
    // Without this, a typo in the regex above turns the test into a no-op that
    // reports clean forever.
    const ROUTE_IMPORT = /from\s+['"][^'"]*\/routes\/[^'"]+['"]/;
    expect(ROUTE_IMPORT.test("import { updateTaskSchema } from '../../routes/tasks';")).toBe(true);
    expect(ROUTE_IMPORT.test("import { updateTaskSchema } from '../../validators/taskValidators';")).toBe(false);
  });
});
