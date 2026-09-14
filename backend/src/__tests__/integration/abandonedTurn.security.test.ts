/**
 * An abandoned turn must not be able to write — SEC-A007, SEC-015
 *
 * THE INCIDENT (2026-09-14, production)
 * A turn on Opus blew the 60-second request timeout. The user got "that took
 * too long", switched models, re-asked, and got a perfectly good action card.
 * Eighty-seven seconds after it had been abandoned, the ORIGINAL turn finished,
 * called propose_action, and issued a proposal into the same conversation.
 * SEC-A007 did exactly what it promises — one active card per conversation — so
 * issuing it burned the card the user was about to confirm. Confirm came back
 * "This proposal was already confirmed or superseded." No client ever saw the
 * zombie's card; no trace was recorded for it; its tokens were never billed.
 *
 * The race was a bare `Promise.race` with no handle on the loop it was racing.
 * Losing the race told the user something had gone wrong and told the loop
 * nothing at all.
 *
 * These tests assert cancellation from the outside — the proposal store is
 * empty afterwards — because "the abort was wired up" is not the property that
 * matters. The property that matters is that nothing was written.
 */

import { randomUUID } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { dataService, chatbotService } from '../../services';
import type { ChatRequest } from '../../shared/types';
import type { StoredProposal } from '../../services/chatActions/proposalStore';

const FAMILY = 'fam-abandoned';
const USER = 'user-abandoned';

function usage() {
  return {
    input_tokens: 100,
    output_tokens: 50,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    cache_creation: null,
    inference_geo: null,
    server_tool_use: null,
    service_tier: null,
  };
}

/** The message the zombie turn comes back with, one tick too late. */
function proposeActionMessage(): Anthropic.Message {
  return {
    id: 'msg_zombie',
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'tool_use',
        id: 'toolu_zombie',
        name: 'propose_action',
        input: {
          actionId: 'create_task',
          params: { title: 'Written by a turn nobody was waiting for' },
          displaySummary: 'Create a task',
          displayFields: [
            { key: 'title', label: 'Title', value: 'Written by a turn nobody was waiting for' },
          ],
          reasoning: 'test',
        },
      },
    ],
    model: 'claude-opus-5',
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: usage(),
  } as unknown as Anthropic.Message;
}

function chatRequest(): ChatRequest {
  return {
    message: 'file a bug about the merchant names',
    conversationId: randomUUID(),
    conversationHistory: [],
    pageContext: { path: '/', pageName: 'Dashboard', params: {}, description: 'Home' },
    model: 'opus',
  } as ChatRequest;
}

async function storedProposals(): Promise<StoredProposal[]> {
  return (await dataService.getData<StoredProposal[]>(`ai_proposals_${FAMILY}`)) ?? [];
}

beforeEach(() => {
  if ('clear' in dataService) {
    (dataService as unknown as { clear: () => void }).clear();
  }
  jest.restoreAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('a turn that loses the race is cancelled, not merely ignored', () => {
  it('cannot issue a proposal after the deadline, even when Claude answers', async () => {
    const client = (chatbotService as unknown as { client: Anthropic }).client;

    // The exact shape of the production bug, and the reason this mock IGNORES
    // the abort signal: the API call is still outstanding when the deadline
    // fires and then RESOLVES SUCCESSFULLY with a propose_action, long after.
    // A mock that resolved *because* of the abort would pass against the old
    // code too — it would simply never resolve — and prove nothing.
    const spy = jest
      .spyOn(client.messages, 'create')
      .mockImplementation((() => new Promise(resolve => {
        setTimeout(() => resolve(proposeActionMessage()), 200_000);
      })) as never);

    const pending = chatbotService.chat(FAMILY, chatRequest(), USER);
    await jest.advanceTimersByTimeAsync(130_000);
    const response = await pending;

    expect(response.type).toBe('message');
    expect(response.message.content).toContain('took too long');

    // Let the zombie finish and try to write. This is the assertion that fails
    // against the pre-fix service: it wrote one proposal here.
    await jest.advanceTimersByTimeAsync(120_000);
    expect(await storedProposals()).toHaveLength(0);

    spy.mockRestore();
  });

  it('stops calling Claude once the deadline has passed', async () => {
    const client = (chatbotService as unknown as { client: Anthropic }).client;

    // A tool_use response that would normally drive another iteration.
    const keepGoing = {
      id: 'msg_loop',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'toolu_1', name: 'get_accounts', input: {} }],
      model: 'claude-opus-5',
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: usage(),
    } as unknown as Anthropic.Message;

    const spy = jest
      .spyOn(client.messages, 'create')
      .mockImplementation((() => new Promise(resolve => {
        setTimeout(() => resolve(keepGoing), 200_000);
      })) as never);

    const pending = chatbotService.chat(FAMILY, chatRequest(), USER);
    await jest.advanceTimersByTimeAsync(130_000);
    await pending;
    // Well past the point where the abandoned loop would have run its tool,
    // appended the results and asked Claude again.
    await jest.advanceTimersByTimeAsync(200_000);

    // One call, not an eleventh-iteration bill nobody is reading.
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });

  it('passes the abort signal to Anthropic so an abandoned turn stops billing', async () => {
    const client = (chatbotService as unknown as { client: Anthropic }).client;
    let seen: AbortSignal | undefined;

    const spy = jest
      .spyOn(client.messages, 'create')
      .mockImplementation(((_params: unknown, opts: { signal?: AbortSignal }) => {
        seen = opts?.signal;
        return new Promise(resolve => {
          opts?.signal?.addEventListener('abort', () => resolve(proposeActionMessage()));
        });
      }) as never);

    const pending = chatbotService.chat(FAMILY, chatRequest(), USER);
    await jest.advanceTimersByTimeAsync(130_000);
    await pending;

    expect(seen).toBeInstanceOf(AbortSignal);
    expect(seen?.aborted).toBe(true);

    spy.mockRestore();
  });
});

describe('the deadline still exists', () => {
  it('gives a slow model longer than a fast one, and still cuts it off', async () => {
    const client = (chatbotService as unknown as { client: Anthropic }).client;
    const spy = jest
      .spyOn(client.messages, 'create')
      .mockImplementation((() => new Promise(() => { /* never answers */ })) as never);

    // Haiku's ceiling is 60s: a turn still running at 70s is over.
    const haiku = chatbotService.chat(FAMILY, { ...chatRequest(), model: 'haiku' }, USER);
    await jest.advanceTimersByTimeAsync(70_000);
    expect((await haiku).message.content).toContain('took too long');

    // Opus at the same 70s is still working — the old single ceiling is what
    // made abandoned turns an everyday event.
    const opus = chatbotService.chat(FAMILY, chatRequest(), USER);
    let settled = false;
    void opus.then(() => { settled = true; });
    await jest.advanceTimersByTimeAsync(70_000);
    expect(settled).toBe(false);

    await jest.advanceTimersByTimeAsync(60_000);
    await opus;

    spy.mockRestore();
  });
});
