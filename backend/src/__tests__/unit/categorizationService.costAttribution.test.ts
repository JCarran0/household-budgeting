/**
 * SA-03 regression — AI classification spend must be recorded against the
 * workspace that incurred it.
 *
 * `classifyTransactions` gates on `costTracker.checkBudget(familyId)`, but
 * `classifyBatch` used to record usage under the literal string `'system'`.
 * Because the check and the record touched different buckets, classification
 * spend never accumulated where the cap looked and the $20/mo ceiling could
 * never trip — silently, with `/usage` under-reporting to match.
 *
 * The failure mode leaves no trace at runtime, so it is pinned here.
 */

import { CategorizationService } from '../../services/categorizationService';
import type { ChatbotDataService } from '../../services/chatbotDataService';
import type { ChatbotCostTracker } from '../../services/chatbotCostTracker';
import type { Category, Transaction } from '../../shared/types';

const FAMILY_ID = 'family-abc';

const uncategorizedTxn: Transaction = {
  id: 'txn-1',
  name: 'BLUE BOTTLE COFFEE',
  merchantName: 'Blue Bottle',
  amount: 6.5,
  date: '2026-08-01',
  categoryId: null,
} as unknown as Transaction;

const categories: Category[] = [
  { id: 'cat-dining', name: 'Dining', parentId: null } as unknown as Category,
];

/**
 * Minimal Anthropic response carrying one tool_use block, matching the shape
 * `classifyBatch` destructures.
 */
function stubAnthropicResponse() {
  return {
    usage: { input_tokens: 1200, output_tokens: 300 },
    content: [
      {
        type: 'tool_use',
        name: 'classify_transactions',
        input: {
          classifications: [
            { transactionId: 'txn-1', categoryId: 'cat-dining', confidence: 'high' },
          ],
        },
      },
    ],
  };
}

function buildService() {
  const recordUsage = jest.fn().mockResolvedValue(undefined);
  const checkBudget = jest.fn().mockResolvedValue({
    allowed: true,
    monthlySpend: 0,
    monthlyLimit: 20,
    remainingBudget: 20,
  });

  const costTracker = { recordUsage, checkBudget } as unknown as ChatbotCostTracker;

  const chatbotDataService = {
    // Uncategorized fetch and the few-shot example fetch share this method;
    // returning the one txn for both is fine — it has no categoryId, so the
    // example builder filters it out and produces an empty example block.
    queryTransactions: jest.fn().mockResolvedValue([uncategorizedTxn]),
    getCategories: jest.fn().mockResolvedValue(categories),
    getAutoCategorizeRules: jest.fn().mockResolvedValue([]),
  } as unknown as ChatbotDataService;

  const service = new CategorizationService(chatbotDataService, costTracker, 'test-key');

  // Swap the SDK client for a stub so no network call is made.
  const create = jest.fn().mockResolvedValue(stubAnthropicResponse());
  (service as unknown as { client: { messages: { create: jest.Mock } } }).client = {
    messages: { create },
  };

  return { service, recordUsage, checkBudget, create };
}

describe('CategorizationService cost attribution (SA-03)', () => {
  it('records classification usage against the familyId, not a global bucket', async () => {
    const { service, recordUsage } = buildService();

    await service.classifyTransactions(FAMILY_ID);

    expect(recordUsage).toHaveBeenCalledTimes(1);
    const [recordedScope] = recordUsage.mock.calls[0];
    expect(recordedScope).toBe(FAMILY_ID);
    expect(recordedScope).not.toBe('system');
  });

  it('records against the same scope the cap check reads', async () => {
    const { service, recordUsage, checkBudget } = buildService();

    await service.classifyTransactions(FAMILY_ID);

    // The actual invariant: whatever scope gates spending must be the scope
    // that accumulates it. Divergence is what made the cap unenforceable.
    expect(recordUsage.mock.calls[0][0]).toBe(checkBudget.mock.calls[0][0]);
  });

  it('refuses to classify when the workspace cap is already reached', async () => {
    const { service, recordUsage, checkBudget, create } = buildService();
    (checkBudget as jest.Mock).mockResolvedValue({
      allowed: false,
      monthlySpend: 20,
      monthlyLimit: 20,
      remainingBudget: 0,
    });

    await expect(service.classifyTransactions(FAMILY_ID)).rejects.toThrow(/budget cap/i);

    // No Claude call, no spend — the gate must short-circuit before the API.
    expect(create).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });
});
