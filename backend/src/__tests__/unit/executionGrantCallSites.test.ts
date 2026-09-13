/**
 * Execution grant call sites — REQ-P002
 *
 * executionGrant.ts is honest that JavaScript has no module-private
 * constructor: any file in this codebase could mint a grant it did not earn, or
 * call a handler directly and skip the platform entirely. The docblock there
 * claims that what makes REQ-P002 enforceable is "an explicit, greppable,
 * obviously-wrong line of code" plus this test.
 *
 * This test is that claim. It scans the production source for the two bypasses
 * and fails if either appears outside the one file allowed to do it. Without
 * it, the property held only because nobody had written the bypass yet — and
 * "nobody has done it yet" is not a control.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC = join(__dirname, '..', '..');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      sourceFiles(full, out);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

function findOffenders(pattern: RegExp, allowed: string[]): string[] {
  const offenders: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const rel = relative(SRC, file);
    if (allowed.includes(rel)) continue;
    const contents = readFileSync(file, 'utf8');
    for (const [i, line] of contents.split('\n').entries()) {
      if (pattern.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
    }
  }
  return offenders;
}

describe('REQ-P002 — the platform is the only way to run a handler', () => {
  it('finds the scan targets, so the assertions below cannot pass vacuously', () => {
    // Guard against the scan silently matching nothing (moved files, renamed
    // symbols). The legitimate call sites MUST be found.
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(50);

    const registry = readFileSync(join(SRC, 'services/chatActions/registry.ts'), 'utf8');
    expect(registry).toMatch(/def\.execute\(/);

    const store = readFileSync(join(SRC, 'services/chatActions/proposalStore.ts'), 'utf8');
    expect(store).toMatch(/mintConfirmationGrant\(/);
  });

  it('no production code calls an action handler directly — only executeChatAction may', () => {
    // registry.ts holds the single permitted `def.execute(...)`, inside
    // executeChatAction and after the grant checks.
    const offenders = findOffenders(/\.execute\(\s*params/, ['services/chatActions/registry.ts']);
    expect(offenders).toEqual([]);
  });

  it('no production code mints a confirmation grant except proposalStore', () => {
    // Minting a confirmation grant IS asserting "a human clicked Confirm on a
    // nonce". Only the code that consumed the nonce is entitled to say that.
    const offenders = findOffenders(
      /mintConfirmationGrant\(/,
      ['services/chatActions/proposalStore.ts', 'services/chatActions/executionGrant.ts'],
    );
    expect(offenders).toEqual([]);
  });

  it('no production code mints a standing-consent grant — T2 has not shipped', () => {
    // When the Phase 5 scheduler lands, this test should be updated to name it,
    // which forces the addition to be deliberate rather than incidental.
    const offenders = findOffenders(
      /mintStandingConsentGrant\(/,
      ['services/chatActions/executionGrant.ts'],
    );
    expect(offenders).toEqual([]);
  });
});
