/**
 * Capability tiers, data classes, and execution grants
 *
 * AI-CAPABILITY-PLATFORM-BRD §3–§4. The whole point of putting tier and
 * dataClass on the registration is that the twentieth action faces the same
 * gates as the first without anyone remembering what the gates were — so the
 * gates themselves need tests, not just the actions that pass them.
 */

import { z } from 'zod';
import '../../services/chatActions'; // side-effect: registers the real actions
import {
  registerChatAction,
  getChatAction,
  executeChatAction,
  listT2ActionIds,
  listChatActionIds,
} from '../../services/chatActions/registry';
import {
  mintConfirmationGrant,
  mintStandingConsentGrant,
} from '../../services/chatActions/executionGrant';
import { T2_PERMITTED_DATA_CLASSES, isT2Eligible } from '../../services/chatActions/tiers';
import type { ActionResource, ChatActionId } from '../../shared/types';

const resource: ActionResource = { type: 'task', id: 'id', url: '/tasks', label: 'x' };

/** Registration is global and permanent, so fixtures need unique ids. */
let n = 0;
function uniqueId(): ChatActionId {
  n += 1;
  return `__test_action_${n}__` as ChatActionId;
}

function register(overrides: Record<string, unknown> = {}) {
  const actionId = uniqueId();
  registerChatAction({
    actionId,
    label: 'Test action',
    tier: 'T1',
    dataClass: 'content',
    paramsSchema: z.object({}),
    execute: async () => resource,
    ...overrides,
  } as Parameters<typeof registerChatAction>[0]);
  return actionId;
}

describe('registration validation (REQ-P014)', () => {
  it('rejects a missing tier', () => {
    expect(() => register({ tier: undefined })).toThrow(/must declare tier/i);
  });

  it('rejects an unrecognized tier', () => {
    expect(() => register({ tier: 'T9' })).toThrow(/must declare tier/i);
  });

  it('rejects T0 — the read tier does not belong in the action registry', () => {
    expect(() => register({ tier: 'T0' })).toThrow(/must declare tier/i);
  });

  it('rejects a missing or invalid dataClass', () => {
    expect(() => register({ dataClass: undefined })).toThrow(/dataClass/i);
    expect(() => register({ dataClass: 'vibes' })).toThrow(/dataClass/i);
  });

  it('rejects a duplicate actionId', () => {
    const id = register();
    expect(() => register({ actionId: id })).toThrow(/duplicate/i);
  });

  describe('T2 is gated on data class (SEC-P003)', () => {
    it.each(['financial', 'content', 'external'] as const)(
      'refuses T2 with dataClass %s',
      dataClass => {
        expect(() => register({ tier: 'T2', dataClass })).toThrow(/metadata \(SEC-P003\)/);
      },
    );

    it('permits T2 with metadata', () => {
      expect(() => register({ tier: 'T2', dataClass: 'metadata' })).not.toThrow();
    });

    it('metadata is the only permitted class — widening this is the high-risk edit', () => {
      expect([...T2_PERMITTED_DATA_CLASSES]).toEqual(['metadata']);
      expect(isT2Eligible('financial')).toBe(false);
    });
  });
});

describe('execution grants (REQ-P002)', () => {
  it('refuses to execute without a grant', async () => {
    const id = register();
    const def = getChatAction(id)!;

    await expect(executeChatAction(def, {}, undefined as never)).rejects.toThrow(/no valid execution grant/i);
    await expect(
      executeChatAction(def, {}, { actionId: id, userId: 'u', familyId: 'f', basis: 'user_confirmation', proposalId: 'p' } as never),
    ).rejects.toThrow(/no valid execution grant/i);
  });

  it('refuses a grant minted for a different action', async () => {
    const a = register();
    const b = register();
    const grant = mintConfirmationGrant({ actionId: a, userId: 'u', familyId: 'f', proposalId: 'p' });

    await expect(executeChatAction(getChatAction(b)!, {}, grant)).rejects.toThrow(/grant mismatch/i);
  });

  it('refuses to run a T1 action on standing consent — the click is the authorization', async () => {
    const id = register({ tier: 'T1' });
    const grant = mintStandingConsentGrant({ actionId: id, userId: 'u', familyId: 'f' });

    await expect(executeChatAction(getChatAction(id)!, {}, grant)).rejects.toThrow(/requires a consumed user confirmation/i);
  });

  it('executes with a valid confirmation grant, passing identity from the grant', async () => {
    let seen: { userId: string; familyId: string } | null = null;
    const id = register({
      execute: async (_p: unknown, ctx: { userId: string; familyId: string }) => {
        seen = ctx;
        return resource;
      },
    });
    const grant = mintConfirmationGrant({ actionId: id, userId: 'user-1', familyId: 'fam-1', proposalId: 'p1' });

    await expect(executeChatAction(getChatAction(id)!, {}, grant)).resolves.toEqual(resource);
    expect(seen).toEqual({ userId: 'user-1', familyId: 'fam-1' });
  });
});

describe('the shipped action set (REQ-P015)', () => {
  it('no action is registered for unattended execution', () => {
    // Deliberately a fixed expectation. Promoting an action to T2 must require
    // editing this line, so the promotion is visible in review rather than
    // arriving as a one-word diff in a handler file.
    const real = listT2ActionIds().filter(id => !String(id).startsWith('__test_action_'));
    expect(real).toEqual([]);
  });

  it('every shipped action declares a tier and data class', () => {
    // This list is deliberately exhaustive rather than a shape check: adding an
    // action should require editing a test, so a new write capability cannot
    // arrive unnoticed in review.
    const shipped = listChatActionIds().filter(id => !String(id).startsWith('__test_action_'));
    expect(shipped.sort()).toEqual([
      'complete_task',
      'create_task',
      'submit_github_issue',
      'update_task',
    ]);

    expect(getChatAction('create_task')).toMatchObject({ tier: 'T1', dataClass: 'content' });
    expect(getChatAction('update_task')).toMatchObject({ tier: 'T1', dataClass: 'content' });
    expect(getChatAction('complete_task')).toMatchObject({ tier: 'T1', dataClass: 'content' });
    // Leaves the system entirely — permanently ineligible for T2.
    expect(getChatAction('submit_github_issue')).toMatchObject({ tier: 'T1', dataClass: 'external' });
  });

  it('keeps complete_task out of the unattended tier, permanently', () => {
    // BRD §9.2 names this one explicitly. Completion credits a shared,
    // competitive leaderboard, so an unattended completion awards points in a
    // record the other household member can see. SEC-P001's one-click
    // reversibility does not rescue it: by the time anyone undoes it, a person
    // has already seen the standing change.
    expect(getChatAction('complete_task')?.tier).toBe('T1');
    expect(listT2ActionIds()).not.toContain('complete_task');
  });

  it('every action that accepts an identifier resolves it before executing', () => {
    // SEC-P030. An action taking a model-supplied id with no validateSemantics
    // hook would reach its handler with nothing but a well-formed string, and
    // "well-formed" is not "refers to a record in this family".
    for (const id of ['update_task', 'complete_task'] as const) {
      expect(typeof getChatAction(id)?.validateSemantics).toBe('function');
    }
  });

  it('every update action can describe what it overwrites', () => {
    // SEC-P011. A create has nothing to replace and correctly omits this; an
    // update that omitted it would show the user only the destination.
    for (const id of ['update_task', 'complete_task'] as const) {
      expect(typeof getChatAction(id)?.describeCurrent).toBe('function');
    }
    expect(getChatAction('create_task')?.describeCurrent).toBeUndefined();
  });
});
