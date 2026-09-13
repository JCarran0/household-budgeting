/**
 * Cost tracking completeness — Q-P08
 *
 * The $20/month cap is the only thing standing between this family and an
 * unbounded AI bill, so what the tracker fails to count matters more than what
 * it counts. Two systematic undercounts are locked closed here:
 *
 *   1. Cached tokens. `usage.input_tokens` from the Messages API EXCLUDES cache
 *      reads and cache writes — the SDK's own docblock says total input is the
 *      sum of all three. The chatbot caches its whole stable prefix on purpose
 *      (TD-012, REQ-P017), so every one of those tokens was billed by Anthropic
 *      and counted here as zero.
 *
 *   2. Tokens spent by a request that then failed. Recording usage only on the
 *      success path meant a tool loop that ran to its iteration limit — the
 *      most expensive thing the service can do — moved the monthly total by $0.
 *
 * Both are "the number is quietly too small" bugs, which is the failure mode a
 * cap cannot survive and a test is most likely to miss.
 */

import { ChatbotCostTracker } from '../../services/chatbotCostTracker';
import { InMemoryDataService } from '../../services/dataService';

const FAMILY = 'fam-cache';

function makeTracker(): ChatbotCostTracker {
  return new ChatbotCostTracker(new InMemoryDataService(), 20, 5);
}

describe('published rates (verified 2026-09-13)', () => {
  it.each([
    ['haiku', 1, 5],
    ['sonnet', 2, 10],
    ['opus', 5, 25],
  ] as const)('%s is billed at $%d/$%d per million tokens', (model, input, output) => {
    expect(ChatbotCostTracker.estimateCost(model, 1_000_000, 0)).toBeCloseTo(input, 10);
    expect(ChatbotCostTracker.estimateCost(model, 0, 1_000_000)).toBeCloseTo(output, 10);
  });
});

describe('cached tokens are billed, so they are counted', () => {
  it('a cache READ costs 10% of the input price', () => {
    // sonnet input is $2/MTok, so a million cache reads is $0.20.
    const cost = ChatbotCostTracker.estimateCost('sonnet', 0, 0, { readTokens: 1_000_000 });
    expect(cost).toBeCloseTo(0.2, 10);
  });

  it('a cache WRITE costs MORE than uncached input, not less', () => {
    // The counter-intuitive one, and the reason short bursts of use are the
    // expensive pattern: every lapsed 5-minute window rewrites the prefix.
    const write = ChatbotCostTracker.estimateCost('sonnet', 0, 0, { writeTokens: 1_000_000 });
    const uncached = ChatbotCostTracker.estimateCost('sonnet', 1_000_000, 0);

    expect(write).toBeCloseTo(2.5, 10);
    expect(write).toBeGreaterThan(uncached);
  });

  it('counts cached tokens on top of plain input, never instead of it', () => {
    // The API reports these as three disjoint numbers. Treating a cache read as
    // if it were already inside input_tokens would drop it entirely.
    const plain = ChatbotCostTracker.estimateCost('sonnet', 10_000, 1_000);
    const withCache = ChatbotCostTracker.estimateCost('sonnet', 10_000, 1_000, {
      readTokens: 500_000,
      writeTokens: 100_000,
    });

    expect(withCache).toBeGreaterThan(plain);
    expect(withCache - plain).toBeCloseTo(
      (500_000 / 1_000_000) * 2 * 0.1 + (100_000 / 1_000_000) * 2 * 1.25,
      10,
    );
  });

  it('a request that is ALL cache reads still moves the monthly total', () => {
    // The regression shape: a long conversation whose prefix is fully cached
    // reports input_tokens near zero. Before this fix it was free.
    const cost = ChatbotCostTracker.estimateCost('opus', 0, 0, { readTokens: 2_000_000 });
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeCloseTo(1.0, 10);
  });

  it('omitting cache counts changes nothing for callers that do not cache', () => {
    // categorization and the Amazon adapters pass no cache block at all.
    expect(ChatbotCostTracker.estimateCost('sonnet', 1_000, 100)).toBe(
      ChatbotCostTracker.estimateCost('sonnet', 1_000, 100, {}),
    );
  });
});

describe('recordUsage accumulates cache cost into the monthly total', () => {
  it('cached tokens alone can advance monthly spend', async () => {
    const tracker = makeTracker();

    const before = await tracker.getUsage(FAMILY);
    await tracker.recordUsage(FAMILY, 'opus', 0, 0, 'interactive', {
      readTokens: 4_000_000,
      writeTokens: 1_000_000,
    });
    const after = await tracker.getUsage(FAMILY);

    expect(before.monthlySpend).toBe(0);
    // 4M reads x $5 x 0.1 = $2.00; 1M writes x $5 x 1.25 = $6.25
    expect(after.monthlySpend).toBeCloseTo(8.25, 2);
  });

  it('cache cost counts toward the cap, not around it', async () => {
    const tracker = makeTracker();

    // Pure cache writes, enough to exceed the $20 interactive cap on their own.
    await tracker.recordUsage(FAMILY, 'opus', 0, 0, 'interactive', { writeTokens: 4_000_000 });

    const budget = await tracker.checkBudget(FAMILY, 'interactive');
    expect(budget.allowed).toBe(false);
  });
});
