/**
 * Split cost caps by workload class
 *
 * AI-CAPABILITY-PLATFORM-BRD REQ-P050 – REQ-P055. The failure this prevents is
 * specific: a background sweep runs at 4am, spends the month's allowance, and
 * the chatbot is dead when someone sits down to ask a question. Independent
 * pools are the whole point, so isolation is what gets tested.
 */

import { ChatbotCostTracker } from '../../services/chatbotCostTracker';
import { InMemoryDataService } from '../../services/dataService';

const FAMILY = 'fam-1';
const INTERACTIVE_LIMIT = 20;
const BACKGROUND_LIMIT = 5;

/** ~$3 of sonnet output. Enough to move the needle without arithmetic noise. */
const CHUNKY_OUTPUT_TOKENS = 200_000;

describe('ChatbotCostTracker — split caps', () => {
  let dataService: InMemoryDataService;
  let tracker: ChatbotCostTracker;

  beforeEach(() => {
    dataService = new InMemoryDataService();
    tracker = new ChatbotCostTracker(dataService, INTERACTIVE_LIMIT, BACKGROUND_LIMIT);
  });

  /** Burn approximately `target` dollars in the given workload class. */
  async function burn(target: number, workload: 'interactive' | 'background') {
    const costPerCall = ChatbotCostTracker.estimateCost('sonnet', 0, CHUNKY_OUTPUT_TOKENS);
    const calls = Math.ceil(target / costPerCall);
    for (let i = 0; i < calls; i++) {
      await tracker.recordUsage(FAMILY, 'sonnet', 0, CHUNKY_OUTPUT_TOKENS, workload);
    }
  }

  describe('independent pools (REQ-P051)', () => {
    it('background spend does not reduce the interactive allowance', async () => {
      await burn(BACKGROUND_LIMIT + 1, 'background');

      const background = await tracker.checkBudget(FAMILY, 'background');
      const interactive = await tracker.checkBudget(FAMILY, 'interactive');

      // This is the starvation failure the split exists to prevent.
      expect(background.allowed).toBe(false);
      expect(interactive.allowed).toBe(true);
      expect(interactive.monthlySpend).toBe(0);
    });

    it('interactive spend does not reduce the background allowance', async () => {
      await burn(INTERACTIVE_LIMIT + 1, 'interactive');

      expect((await tracker.checkBudget(FAMILY, 'interactive')).allowed).toBe(false);
      expect((await tracker.checkBudget(FAMILY, 'background')).allowed).toBe(true);
    });

    it('reports the correct ceiling for each class', async () => {
      expect((await tracker.checkBudget(FAMILY, 'interactive')).monthlyLimit).toBe(INTERACTIVE_LIMIT);
      expect((await tracker.checkBudget(FAMILY, 'background')).monthlyLimit).toBe(BACKGROUND_LIMIT);
    });

    it('capExceeded is evaluated against the class that spent, not the larger pool', async () => {
      const result = await tracker.recordUsage(FAMILY, 'opus', 0, 300_000, 'background');

      // $7.50 of opus: over the $5 background cap, under the $20 interactive one.
      expect(result.monthlySpend).toBeGreaterThan(BACKGROUND_LIMIT);
      expect(result.capExceeded).toBe(true);
    });
  });

  describe('workspace scoping is preserved', () => {
    it('keeps families separate within a workload class', async () => {
      await burn(BACKGROUND_LIMIT + 1, 'background');

      expect((await tracker.checkBudget('fam-2', 'background')).allowed).toBe(true);
    });
  });

  describe('defaults', () => {
    it('defaults to interactive so existing call sites are unchanged', async () => {
      await tracker.recordUsage(FAMILY, 'sonnet', 0, CHUNKY_OUTPUT_TOKENS);

      expect((await tracker.getUsage(FAMILY, 'interactive')).monthlySpend).toBeGreaterThan(0);
      expect((await tracker.getUsage(FAMILY, 'background')).monthlySpend).toBe(0);
    });

    it('falls back to the interactive limit when no background limit is configured', async () => {
      const legacy = new ChatbotCostTracker(dataService, INTERACTIVE_LIMIT);

      expect((await legacy.checkBudget(FAMILY, 'background')).monthlyLimit).toBe(INTERACTIVE_LIMIT);
    });

    it('interactive keeps the original storage key so accrued spend is not reset', async () => {
      await tracker.recordUsage(FAMILY, 'sonnet', 0, CHUNKY_OUTPUT_TOKENS, 'interactive');
      const month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

      // Suffixing the interactive key would silently zero the running total on
      // deploy — a one-time reset already paid for once under D11.
      expect(await dataService.getData(`chatbot_costs_${FAMILY}_${month}`)).not.toBeNull();
      expect(await dataService.getData(`chatbot_costs_${FAMILY}_background_${month}`)).toBeNull();
    });
  });

  describe('pre-flight batch estimate (REQ-P055)', () => {
    it('permits a batch that fits in the remaining allowance', async () => {
      expect(await tracker.canAffordBatch(FAMILY, 1)).toMatchObject({ allowed: true });
    });

    it('refuses a batch that would overrun, rather than starting it partially', async () => {
      // A half-applied sweep is worse than one that never ran: the user is left
      // reconciling which rows the AI reached.
      expect(await tracker.canAffordBatch(FAMILY, BACKGROUND_LIMIT + 0.01)).toMatchObject({ allowed: false });
    });

    it('accounts for spend already incurred this month', async () => {
      await burn(BACKGROUND_LIMIT - 1, 'background');

      const result = await tracker.canAffordBatch(FAMILY, 2);
      expect(result.allowed).toBe(false);
      expect(result.remainingBudget).toBeLessThan(2);
    });
  });
});
