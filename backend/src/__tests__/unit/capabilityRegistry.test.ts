/**
 * Capability registry invariants
 *
 * AI-CAPABILITY-PLATFORM-BRD REQ-P010, P016–P019.
 *
 * The registry exists because a read tool used to live in two unrelated places
 * — a definition in chatbotPrompt.ts and a `case` in a dispatch switch — and the
 * two could drift. That drift is how get_budgets came to advertise "actuals" it
 * never returned, which is the defect behind the fabricated-budget incident
 * (BRD §15.1). These tests assert the two halves stay welded together.
 */

import {
  READ_CAPABILITIES,
  buildChatbotTools,
  getReadCapability,
} from '../../services/capabilities/readCapabilities';
// propose_action's actionId enum is read from the chat action registry, so the
// registrations must have run before buildChatbotTools() is called (REQ-P010).
import '../../services/chatActions';

describe('registry integrity (REQ-P010)', () => {
  it('every read capability pairs a definition with an executor', () => {
    for (const c of READ_CAPABILITIES) {
      expect(c.definition.name).toBe(c.name);
      expect(typeof c.execute).toBe('function');
    }
  });

  it('every tool the model can see has an executor — no orphan definitions', () => {
    const platform = ['propose_action', 'record_learning'];
    for (const tool of buildChatbotTools()) {
      if (platform.includes(tool.name)) continue;
      expect(getReadCapability(tool.name)).toBeDefined();
    }
  });

  it('every registered capability reaches the model — no orphan executors', () => {
    const exposed = new Set(buildChatbotTools().map(t => t.name));
    for (const c of READ_CAPABILITIES) expect(exposed.has(c.name)).toBe(true);
  });

  it('has no duplicate tool names', () => {
    const names = buildChatbotTools().map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('declares every capability as T0 with a data class', () => {
    for (const c of READ_CAPABILITIES) {
      expect(c.tier).toBe('T0');
      expect(c.dataClass).toBeTruthy();
      expect(c.domain).toBeTruthy();
    }
  });
});

describe('tool descriptions (REQ-P019)', () => {
  it('every tool carries a non-trivial description', () => {
    for (const tool of buildChatbotTools()) {
      expect((tool.description ?? '').length).toBeGreaterThan(40);
    }
  });

  it('get_budgets does not promise actuals it does not return', () => {
    // The exact regression from BRD §15.1: the description claimed "budget
    // amounts and actuals" while returning no actuals, giving the model licence
    // to supply a number the tool never produced.
    const desc = getReadCapability('get_budgets')?.definition.description ?? '';
    expect(desc).toMatch(/does NOT return actual spending/i);
    expect(desc).toMatch(/hasBudget/);
  });
});

describe('prompt caching (REQ-P017)', () => {
  it('puts the cache breakpoint on the final tool and nowhere else', () => {
    const tools = buildChatbotTools();
    const withCache = tools.filter(t => 'cache_control' in t && t.cache_control);

    expect(withCache).toHaveLength(1);
    expect(withCache[0].name).toBe(tools[tools.length - 1].name);
  });

  it('is order-stable across calls — a reshuffle would invalidate the cache', () => {
    expect(buildChatbotTools().map(t => t.name)).toEqual(buildChatbotTools().map(t => t.name));
  });

  it('ends with the platform tools, after the read capabilities', () => {
    const names = buildChatbotTools().map(t => t.name);
    expect(names.slice(-2)).toEqual(['record_learning', 'propose_action']);
  });
});

describe('workspace filtering (REQ-P016)', () => {
  it('exposes no tools at all when AI is disabled for the workspace', () => {
    // BRD §11: the Business Workspace holds trust-ledger money that is not the
    // family's and is excluded from AI entirely, reads included.
    // NOTE: this flag is not what enforces the Business Workspace exclusion.
    // That lives in refuseBusinessWorkspace (routes/chatbot.ts) and is covered
    // by businessWorkspaceAi.security.test.ts.
    expect(buildChatbotTools({ aiEnabled: false })).toEqual([]);
  });

  it('can restrict the surface to named domains', () => {
    const budgeting = buildChatbotTools({ domains: ['budgeting'] });
    expect(budgeting.length).toBeGreaterThan(0);

    const none = buildChatbotTools({ domains: ['tasks'] });
    // No task capabilities exist yet, so only the platform tools remain.
    expect(none.map(t => t.name)).toEqual(['record_learning', 'propose_action']);
  });
});
