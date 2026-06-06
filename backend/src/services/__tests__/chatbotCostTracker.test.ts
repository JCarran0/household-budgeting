/**
 * ChatbotCostTracker Tests — PR6 Task 2 (REQ-007 / D11)
 *
 * Verifies that the chatbot cost cap is scoped per workspace after the D11
 * isolation fix. Key invariants:
 *
 *  1. Key format  — storage key includes familyId: `chatbot_costs_{fid}_{YYYY-MM}`
 *  2. Isolation   — exhausting workspace A's cap does NOT affect workspace B
 *  3. Family cap  — family workspace's own budget still blocks at the limit
 *  4. checkBudget — returns allowed=false once totalEstimatedCost >= monthlyLimit
 *  5. recordUsage — accumulates cost under the correct familyId key
 *  6. getUsage    — reflects the familyId-scoped accumulated spend
 *  7. Fresh start — missing file → fresh $0 counter (graceful, no error)
 */

import { ChatbotCostTracker } from '../chatbotCostTracker';
import { InMemoryDataService } from '../dataService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTHLY_LIMIT = 20.00;
const PERSONAL_FAMILY = 'family-personal-cost-test';
const BUSINESS_FAMILY = 'family-business-cost-test';

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Build the expected storage key for a workspace + current month. */
function expectedKey(familyId: string): string {
  return `chatbot_costs_${familyId}_${currentMonth()}`;
}

function makeTracker(ds: InMemoryDataService): ChatbotCostTracker {
  return new ChatbotCostTracker(ds, MONTHLY_LIMIT);
}

// ---------------------------------------------------------------------------
// 1. Storage key format
// ---------------------------------------------------------------------------

describe('storage key format', () => {
  it('stores cost data under chatbot_costs_{familyId}_{YYYY-MM}', async () => {
    const ds = new InMemoryDataService();
    const tracker = makeTracker(ds);

    await tracker.recordUsage(PERSONAL_FAMILY, 'haiku', 100_000, 10_000);

    // The data must be stored under the per-workspace key, NOT the old global key
    const perWorkspaceKey = expectedKey(PERSONAL_FAMILY);
    const stored = await ds.getData(perWorkspaceKey);
    expect(stored).not.toBeNull();

    // The old global key (chatbot_costs_{YYYY-MM}) must NOT be written
    const oldGlobalKey = `chatbot_costs_${currentMonth()}`;
    const oldStored = await ds.getData(oldGlobalKey);
    expect(oldStored).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. Per-workspace isolation: exhausting workspace A does not affect workspace B
// ---------------------------------------------------------------------------

describe('per-workspace isolation (REQ-007 / D11)', () => {
  it('business workspace cap exhaustion does not consume the personal workspace budget', async () => {
    const ds = new InMemoryDataService();
    const tracker = makeTracker(ds);

    // Exhaust the business cap by injecting max cost directly
    const bizKey = expectedKey(BUSINESS_FAMILY);
    await ds.saveData(bizKey, {
      month: currentMonth(),
      totalInputTokens: 10_000_000,
      totalOutputTokens: 1_000_000,
      totalEstimatedCost: MONTHLY_LIMIT, // at the cap
      requests: [],
    });

    // Business workspace: blocked
    const bizResult = await tracker.checkBudget(BUSINESS_FAMILY);
    expect(bizResult.allowed).toBe(false);
    expect(bizResult.monthlySpend).toBe(MONTHLY_LIMIT);

    // Personal workspace: still allowed — zero spend, independent bucket
    const personalResult = await tracker.checkBudget(PERSONAL_FAMILY);
    expect(personalResult.allowed).toBe(true);
    expect(personalResult.monthlySpend).toBe(0);
  });

  it('personal workspace cap exhaustion does not consume the business workspace budget', async () => {
    const ds = new InMemoryDataService();
    const tracker = makeTracker(ds);

    // Exhaust the personal cap
    const personalKey = expectedKey(PERSONAL_FAMILY);
    await ds.saveData(personalKey, {
      month: currentMonth(),
      totalInputTokens: 10_000_000,
      totalOutputTokens: 1_000_000,
      totalEstimatedCost: MONTHLY_LIMIT,
      requests: [],
    });

    const personalResult = await tracker.checkBudget(PERSONAL_FAMILY);
    expect(personalResult.allowed).toBe(false);

    const bizResult = await tracker.checkBudget(BUSINESS_FAMILY);
    expect(bizResult.allowed).toBe(true);
    expect(bizResult.monthlySpend).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Family workspace cap still blocks at the limit (regression guard)
// ---------------------------------------------------------------------------

describe('family workspace cap still enforced (regression guard)', () => {
  it('checkBudget returns allowed=false when family spend >= monthlyLimit', async () => {
    const ds = new InMemoryDataService();
    const tracker = makeTracker(ds);

    // Pre-seed the family cost data right at the cap
    const key = expectedKey(PERSONAL_FAMILY);
    await ds.saveData(key, {
      month: currentMonth(),
      totalInputTokens: 10_000_000,
      totalOutputTokens: 1_000_000,
      totalEstimatedCost: MONTHLY_LIMIT,
      requests: [],
    });

    const result = await tracker.checkBudget(PERSONAL_FAMILY);

    expect(result.allowed).toBe(false);
    expect(result.monthlySpend).toBe(MONTHLY_LIMIT);
    expect(result.remainingBudget).toBe(0);
    expect(result.monthlyLimit).toBe(MONTHLY_LIMIT);
  });

  it('checkBudget returns allowed=true below the limit', async () => {
    const ds = new InMemoryDataService();
    const tracker = makeTracker(ds);

    await tracker.recordUsage(PERSONAL_FAMILY, 'haiku', 100_000, 10_000);

    const result = await tracker.checkBudget(PERSONAL_FAMILY);
    expect(result.allowed).toBe(true);
    expect(result.monthlySpend).toBeGreaterThan(0);
    expect(result.monthlySpend).toBeLessThan(MONTHLY_LIMIT);
  });
});

// ---------------------------------------------------------------------------
// 4. recordUsage accumulates under the correct familyId key
// ---------------------------------------------------------------------------

describe('recordUsage — accumulates per workspace', () => {
  it('two calls for the same workspace add up; different workspace stays separate', async () => {
    const ds = new InMemoryDataService();
    const tracker = makeTracker(ds);

    // Two haiku calls for the personal workspace.
    // Haiku: $1/M input, $5/M output.
    // 1M input, 0 output = $1.00 each → $2.00 total (avoids floating-point edge cases)
    await tracker.recordUsage(PERSONAL_FAMILY, 'haiku', 1_000_000, 0);
    await tracker.recordUsage(PERSONAL_FAMILY, 'haiku', 1_000_000, 0);

    // One haiku call for the business workspace (500k input = $0.50)
    await tracker.recordUsage(BUSINESS_FAMILY, 'haiku', 500_000, 0);

    const personalUsage = await tracker.getUsage(PERSONAL_FAMILY);
    const bizUsage = await tracker.getUsage(BUSINESS_FAMILY);

    // Personal should show $2.00; business should show $0.50 (independent buckets)
    expect(personalUsage.monthlySpend).toBeCloseTo(2.00, 2);
    expect(bizUsage.monthlySpend).toBeCloseTo(0.50, 2);
  });
});

// ---------------------------------------------------------------------------
// 5. getUsage reflects the familyId-scoped spend
// ---------------------------------------------------------------------------

describe('getUsage — workspace-scoped', () => {
  it('returns $0 for a workspace that has never had any usage', async () => {
    const ds = new InMemoryDataService();
    const tracker = makeTracker(ds);

    const usage = await tracker.getUsage(PERSONAL_FAMILY);

    expect(usage.monthlySpend).toBe(0);
    expect(usage.monthlyLimit).toBe(MONTHLY_LIMIT);
    expect(usage.remainingBudget).toBe(MONTHLY_LIMIT);
  });

  it('returns the correct remaining budget after partial spend', async () => {
    const ds = new InMemoryDataService();
    const tracker = makeTracker(ds);

    // Haiku: $1/M input, $5/M output → 1M input = $1.00
    await tracker.recordUsage(PERSONAL_FAMILY, 'haiku', 1_000_000, 0);

    const usage = await tracker.getUsage(PERSONAL_FAMILY);

    expect(usage.monthlySpend).toBeCloseTo(1.00, 2);
    expect(usage.remainingBudget).toBeCloseTo(MONTHLY_LIMIT - 1.00, 2);
  });
});

// ---------------------------------------------------------------------------
// 6. Graceful fresh start — missing data file → $0 counter
// ---------------------------------------------------------------------------

describe('graceful missing data file', () => {
  it('checkBudget returns allowed=true when no cost file exists yet', async () => {
    const ds = new InMemoryDataService();
    const tracker = makeTracker(ds);

    // No data has been seeded — tracker must gracefully return $0
    const result = await tracker.checkBudget(PERSONAL_FAMILY);

    expect(result.allowed).toBe(true);
    expect(result.monthlySpend).toBe(0);
    expect(result.monthlyLimit).toBe(MONTHLY_LIMIT);
  });

  it('recordUsage creates the data file when it does not exist yet', async () => {
    const ds = new InMemoryDataService();
    const tracker = makeTracker(ds);

    // No pre-existing data — first usage call should create the file
    const result = await tracker.recordUsage(PERSONAL_FAMILY, 'haiku', 100_000, 0);

    expect(result.estimatedCost).toBeGreaterThan(0);
    expect(result.capExceeded).toBe(false);

    // Verify the file was actually created under the correct key
    const key = expectedKey(PERSONAL_FAMILY);
    const stored = await ds.getData(key);
    expect(stored).not.toBeNull();
  });
});
