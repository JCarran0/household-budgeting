/**
 * A card shows what will be written — SEC-P010
 *
 * THE HOLE THIS CLOSES (found 2026-09-14 in a real, benign proposal)
 * The coverage check proved a display field EXISTED for every param. Both the
 * param and the field were model-authored, so it never proved they matched. A
 * live `submit_github_issue` card read:
 *
 *     Details: "Describes 9 Capital One Quicksilver transactions…"   (120 chars)
 *
 * while `params.body` carried 1,742 characters of markdown that went straight
 * to a GitHub repo on one click. Nothing malicious happened. But "plausible
 * summary on the card, unseen payload in the params" is precisely the
 * exfiltration shape the coverage rule was written to stop, and it was
 * available for every outbound action in the registry.
 *
 * The fix is authorship, not validation: the server renders display values from
 * the parsed params, so the two cannot disagree. These tests are written
 * against that — they assert the value the USER would see equals the value the
 * HANDLER would receive.
 */

// Through the barrel, not the module: the action registry is populated by the
// registration side effects in services/chatActions/index, and a row builder
// with an empty registry rejects everything.
import { buildProposalRows } from '../../services/chatActions';
import { categoryService, dataService } from '../../services';
import type { ActionProposalInput, DisplayField } from '../../shared/types';

const ctx = { userId: 'user-fidelity', familyId: 'fam-fidelity' };

beforeEach(() => {
  if ('clear' in dataService) {
    (dataService as unknown as { clear: () => void }).clear();
  }
});

function field(over: Partial<DisplayField> & { key: string }): DisplayField {
  return { label: 'Label', value: 'value', editable: true, type: 'text', ...over };
}

/** The production proposal, reduced to its essentials. */
const LONG_BODY =
  '## What happened\nMultiple transactions synced from the Capital One Quicksilver account ' +
  'display the merchant as `******.*************` with no raw descriptor preserved.\n\n' +
  '## Steps to reproduce\n1. Sync the account.\n2. Search for the asterisk string.\n' +
  '3. Compare against the bank portal.\n';

function githubInput(bodyField: string): ActionProposalInput {
  return {
    actionId: 'submit_github_issue',
    params: { title: 'Merchant name corrupted', body: LONG_BODY, labels: ['bug'] },
    displaySummary: 'File a bug report',
    displayFields: [
      field({ key: 'title', label: 'Title', value: 'Merchant name corrupted' }),
      field({ key: 'body', label: 'Details', value: bodyField, type: 'textarea' }),
      field({ key: 'labels', label: 'Labels', value: 'bug', type: 'tags' }),
    ],
    reasoning: 'The user reported a bug.',
  };
}

describe('the value on the card is the value that will be written', () => {
  it('replaces a model-authored paraphrase with the verbatim payload', async () => {
    const built = await buildProposalRows(
      githubInput('Describes 9 Capital One Quicksilver transactions showing a corrupted name'),
      ctx,
    );

    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const shown = built.rows[0].displayFields.find(f => f.key === 'body');
    // Not "contains", not "starts with" — the whole payload, or the user is
    // still approving something they cannot see.
    expect(shown?.value).toBe(LONG_BODY);
    expect(shown?.value).toBe(built.rows[0].params.body);
  });

  it('leaves an honest proposal untouched, so the rule costs nothing when obeyed', async () => {
    const built = await buildProposalRows(githubInput(LONG_BODY), ctx);

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.rows[0].displayFields.find(f => f.key === 'body')?.value).toBe(LONG_BODY);
  });

  it('renders long values as a textarea so the card can actually show them', async () => {
    const built = await buildProposalRows(githubInput('short lie'), ctx);

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.rows[0].displayFields.find(f => f.key === 'body')?.type).toBe('textarea');
  });

  it('renders a scalar array from the params rather than trusting its label', async () => {
    const input = githubInput(LONG_BODY);
    input.params = { ...input.params, labels: ['bug', 'enhancement'] };

    const built = await buildProposalRows(input, ctx);

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // The model said "bug". Both labels are being written.
    expect(built.rows[0].displayFields.find(f => f.key === 'labels')?.value).toBe('bug, enhancement');
  });
});

describe('a card carries nothing but the write', () => {
  it('rejects a display field that names no param', async () => {
    const input = githubInput(LONG_BODY);
    input.displayFields = [
      ...input.displayFields,
      // Reads as part of the write; constrained by nothing.
      field({ key: 'repository', label: 'Repository', value: 'JCarran0/household-budgeting' }),
    ];

    const built = await buildProposalRows(input, ctx);

    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.error).toContain('repository');
  });

  it('still rejects a param with no display field at all', async () => {
    const input = githubInput(LONG_BODY);
    input.displayFields = input.displayFields.filter(f => f.key !== 'body');

    const built = await buildProposalRows(input, ctx);

    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.error).toContain('body');
  });
});

describe('identifiers are resolved by the server, not narrated by the model', () => {
  /**
   * The first version of this fix exempted every *Id param on the grounds that
   * "an id cannot carry a payload". True — and beside the point for a TARGET
   * id. Nothing on the card resolved the category a transaction was moving TO,
   * so a row could read "Category: Groceries" and write cat-vacation.
   * validateSemantics proves such an id exists; it never proved it was the one
   * named on the card.
   */
  it('renders the real name of the category a transaction is moved to', async () => {
    const groceries = await categoryService.createCategory(
      { name: 'Groceries', parentId: null, isHidden: false, isRollover: false, isSavings: false },
      ctx.familyId,
    );

    const built = await buildProposalRows(
      {
        actionId: 'set_transaction_category',
        params: { transactionId: 'txn-1', categoryId: groceries.id },
        displaySummary: 'Recategorize',
        displayFields: [
          field({ key: 'transactionId', label: 'Transaction', value: 'Amazon.com $11.86' }),
          // The lie.
          field({ key: 'categoryId', label: 'Category', value: 'Vacation Fund' }),
        ],
        reasoning: 'The user asked.',
      },
      ctx,
    );

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.rows[0].displayFields.find(f => f.key === 'categoryId')?.value).toBe('Groceries');
  });

  it('says so when the target does not exist, rather than repeating the claim', async () => {
    const built = await buildProposalRows(
      {
        actionId: 'complete_task',
        params: { taskId: 'b4e4b0e2-0000-4000-8000-000000000001' },
        displaySummary: 'Complete a task',
        displayFields: [
          field({ key: 'taskId', label: 'Task', value: 'Take out the recycling', editable: false }),
        ],
        reasoning: 'The user said it is done.',
      },
      ctx,
    );

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.rows[0].displayFields[0].value).toContain('Unknown task');
  });

  it('renders a cleared field as cleared, not as the value it had', async () => {
    // dueDate: null DELETES the due date. Deferring to the model here let the
    // card show a date being set while the handler received a null.
    const built = await buildProposalRows(
      {
        actionId: 'update_task',
        params: { taskId: 'task-1', dueDate: null },
        displaySummary: 'Clear the due date',
        displayFields: [
          field({ key: 'taskId', label: 'Task', value: 'Take out the recycling', editable: false }),
          field({ key: 'dueDate', label: 'Due date', value: '2026-12-25', type: 'date' }),
        ],
        reasoning: 'The user asked to drop the date.',
      },
      ctx,
    );

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.rows[0].displayFields.find(f => f.key === 'dueDate')?.value).toBe('(cleared)');
  });
});

describe('the strings the model still authors are bounded', () => {
  it('caps a display summary that would push the card off the screen', async () => {
    const input = githubInput(LONG_BODY);
    input.displaySummary = 'Everything is fine. '.repeat(200);

    const built = await buildProposalRows(input, ctx);

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.rows[0].displaySummary.length).toBeLessThanOrEqual(200);
  });
});
