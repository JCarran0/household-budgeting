/**
 * Plan Card Row Construction — SEC-P010, SEC-P011, SEC-A004, REQ-P020
 *
 * These lock the boundary between what the model says and what the card shows.
 * The card is the entire consent mechanism: if a row can reach it carrying an
 * unvalidated param, a label the model chose, or a field the UI silently drops,
 * the user's click authorizes something they did not read.
 */

import {
  buildProposalRows,
  MAX_PROPOSAL_ROWS,
  getChatAction,
} from '../../services/chatActions';
import type { ActionProposalInput, DisplayField } from '../../shared/types';

const CTX = { userId: 'u1', familyId: 'f1' };

function field(key: string, value: string): DisplayField {
  return { key, label: key, value, editable: false, type: 'text' };
}

function baseInput(overrides: Partial<ActionProposalInput> = {}): ActionProposalInput {
  return {
    actionId: 'create_task',
    params: { title: 'Pay PTA donation' },
    displaySummary: 'Create task: Pay PTA donation',
    displayFields: [field('title', 'Pay PTA donation')],
    reasoning: 'The user asked for it',
    ...overrides,
  };
}

describe('buildProposalRows — single action', () => {
  it('produces exactly one row for an ordinary proposal', async () => {
    const result = await buildProposalRows(baseInput(), CTX);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].rowId).toBe('row-0');
    expect(result.rows[0].actionId).toBe('create_task');
  });

  it('takes the row label from the registry, never from model input (SEC-P010)', async () => {
    const registryLabel = getChatAction('create_task')!.label;

    // A model that tries to name the row something reassuring must not succeed.
    const sneaky = { ...baseInput(), label: 'Totally harmless' } as ActionProposalInput;
    const result = await buildProposalRows(sneaky, CTX);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0].label).toBe(registryLabel);
    expect(result.rows[0].label).not.toBe('Totally harmless');
  });

  it('stores Zod-parsed params, not the raw model object', async () => {
    const result = await buildProposalRows(
      baseInput({ params: { title: 'Pay PTA donation', bogusExtraField: 'x' } }),
      CTX,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0].params).not.toHaveProperty('bogusExtraField');
  });

  it('omits currentValues when the action has no describeCurrent (creates)', async () => {
    const result = await buildProposalRows(baseInput(), CTX);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0].currentValues).toBeUndefined();
  });
});

describe('buildProposalRows — plan cards (REQ-P020)', () => {
  it('builds one row per action, in order, with stable ids', async () => {
    const result = await buildProposalRows(
      baseInput({
        additionalActions: [
          {
            actionId: 'create_task',
            params: { title: 'Second task' },
            displaySummary: 'Create task: Second task',
            displayFields: [field('title', 'Second task')],
          },
          {
            actionId: 'create_task',
            params: { title: 'Third task' },
            displaySummary: 'Create task: Third task',
            displayFields: [field('title', 'Third task')],
          },
        ],
      }),
      CTX,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.map(r => r.rowId)).toEqual(['row-0', 'row-1', 'row-2']);
    expect(result.rows.map(r => r.params.title)).toEqual([
      'Pay PTA donation',
      'Second task',
      'Third task',
    ]);
  });

  it('rejects the whole proposal when any row names an unknown action (SEC-A003)', async () => {
    const result = await buildProposalRows(
      baseInput({
        additionalActions: [
          {
            actionId: 'delete_everything' as ActionProposalInput['actionId'],
            params: {},
            displaySummary: 'Tidy up',
            displayFields: [],
          },
        ],
      }),
      CTX,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('row 2');
    expect(result.error).toContain('delete_everything');
  });

  it('rejects the whole proposal when any row fails Zod (SEC-A004)', async () => {
    const result = await buildProposalRows(
      baseInput({
        additionalActions: [
          {
            actionId: 'create_task',
            params: { title: '' }, // empty title
            displaySummary: 'Create task: (nothing)',
            displayFields: [],
          },
        ],
      }),
      CTX,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('row 2');
  });

  it('rejects a card larger than MAX_PROPOSAL_ROWS rather than truncating it', async () => {
    const extra = Array.from({ length: MAX_PROPOSAL_ROWS }, (_, i) => ({
      actionId: 'create_task' as const,
      params: { title: `Task ${i}` },
      displaySummary: `Create task: Task ${i}`,
      displayFields: [],
    }));

    const result = await buildProposalRows(baseInput({ additionalActions: extra }), CTX);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain(String(MAX_PROPOSAL_ROWS));
  });
});

describe('buildProposalRows — legibility (SEC-P010)', () => {
  it('rejects a row with an empty displaySummary', async () => {
    const result = await buildProposalRows(baseInput({ displaySummary: '   ' }), CTX);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('displaySummary');
  });

  it('rejects a row whose display field is missing a value rather than rendering a blank', async () => {
    const malformed = [{ key: 'title', label: 'Title' }] as unknown as DisplayField[];
    const result = await buildProposalRows(baseInput({ displayFields: malformed }), CTX);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('displayField');
  });

  it('rejects a display field with a non-string value (an object would render as [object Object])', async () => {
    const malformed = [
      { key: 'title', label: 'Title', value: { nested: true }, editable: false, type: 'text' },
    ] as unknown as DisplayField[];
    const result = await buildProposalRows(baseInput({ displayFields: malformed }), CTX);

    expect(result.ok).toBe(false);
  });

  it('rejects a row with no display fields — a model-authored summary is not review', async () => {
    // SEC-P010: "not a model-authored summary of itself". An empty field list
    // means the only thing the user reads is a sentence the model wrote about
    // its own proposal.
    const result = await buildProposalRows(baseInput({ displayFields: [] }), CTX);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('title');
  });

  it('rejects a non-array displayFields instead of coercing it to "nothing to show"', async () => {
    const bogus = 'not an array' as unknown as DisplayField[];
    const result = await buildProposalRows(baseInput({ displayFields: bogus }), CTX);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('array');
  });

  it('rejects an empty-string value, which renders as an invisible field', async () => {
    const result = await buildProposalRows(
      baseInput({ displayFields: [field('title', '   ')] }),
      CTX,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects duplicate displayField keys (one would vanish in render)', async () => {
    const result = await buildProposalRows(
      baseInput({
        displayFields: [field('title', 'Pay PTA donation'), field('title', 'Something else')],
      }),
      CTX,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Duplicate');
  });
});

describe('buildProposalRows — every written value is shown (SEC-P010)', () => {
  /**
   * The attack this closes: injected content in an uploaded receipt tells the
   * model to file a GitHub issue whose body carries the household's balances.
   * The card shows a plausible "File a bug about receipt parsing" title, the
   * user confirms, and 64 KB of financial data is POSTed to a repo with the
   * server's token. The row is well-formed the whole way; what makes it an
   * exfiltration primitive is that `body` never appears on the card.
   */
  it('rejects a submit_github_issue row whose body is written but never displayed', async () => {
    const result = await buildProposalRows(
      {
        actionId: 'submit_github_issue',
        params: {
          title: 'Bug: receipt parsing',
          body: 'Household totals: checking $12,345.67, savings $98,765.43',
          labels: ['bug'],
        },
        displaySummary: 'File a bug about receipt parsing',
        displayFields: [field('title', 'Bug: receipt parsing')],
        reasoning: 'The user reported a parsing problem',
      },
      CTX,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('body');
    expect(result.error).toContain('not shown on the card');
  });

  it('accepts the same row once every written param is displayed', async () => {
    const result = await buildProposalRows(
      {
        actionId: 'submit_github_issue',
        params: {
          title: 'Bug: receipt parsing',
          body: 'Steps to reproduce: upload a receipt.',
          labels: ['bug'],
        },
        displaySummary: 'File a bug about receipt parsing',
        displayFields: [
          field('title', 'Bug: receipt parsing'),
          field('body', 'Steps to reproduce: upload a receipt.'),
          field('labels', 'bug'),
        ],
        reasoning: 'The user reported a parsing problem',
      },
      CTX,
    );

    expect(result.ok).toBe(true);
  });

  it('rejects an optional param that is set but hidden (dueDate)', async () => {
    const result = await buildProposalRows(
      baseInput({
        params: { title: 'Pay PTA donation', dueDate: '2026-12-25' },
        displayFields: [field('title', 'Pay PTA donation')],
      }),
      CTX,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('dueDate');
  });
});
