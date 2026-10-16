/**
 * AI categorization run report (AI-CATEGORIZATION-BRD §12.4.1 / §12.4.5).
 *
 * Locks: the reason for every suggestion is visible on its row; a failed row
 * shows why it failed; the optional "Why?" note appears only on a row the user
 * changed and travels with that row's outcome; every row in a bucket reports
 * an outcome, skipped rows included.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import type { ClassificationBucket, ClassifiedTransaction, ClassifyTransactionsResponse } from '../../../../shared/types';

vi.mock('../../hooks/useCategoryOptions', () => ({
  useCategoryOptions: () => ({
    options: [
      { value: 'cat-dining', label: 'Dining' },
      { value: 'cat-groceries', label: 'Groceries' },
    ],
    categories: [],
    isLoading: false,
    error: null,
  }),
}));

import { BucketReviewStep } from './BucketReviewStep';
import { bucketOutcomes, countChanged, unsureReasons, LOW_CONFIDENCE_REASON } from './categorizationRunReport';

function row(overrides: Partial<ClassifiedTransaction> = {}): ClassifiedTransaction {
  return {
    id: 't1',
    date: '2026-10-10',
    name: 'CHIPOTLE 1234',
    merchantName: 'Chipotle',
    amount: 14.5,
    suggestedCategoryId: 'cat-dining',
    confidence: 'high',
    reasoning: 'Chipotle appears in your examples under Dining.',
    selectedCategoryId: 'cat-dining',
    failureReason: null,
    ...overrides,
  };
}

function bucket(transactions: ClassifiedTransaction[], categoryId = 'cat-dining'): ClassificationBucket {
  return { categoryId, categoryName: 'Dining', confidence: 'high', transactions, totalAmount: 0 };
}

function renderStep(b: ClassificationBucket, onApply = vi.fn()) {
  render(
    <MantineProvider>
      <BucketReviewStep bucket={b} bucketIndex={0} totalBuckets={1} onApply={onApply} onSkip={vi.fn()} isApplying={false} />
    </MantineProvider>,
  );
  return onApply;
}

// jsdom has no layout; Mantine's combobox scrolls the active option into view.
Element.prototype.scrollIntoView = vi.fn();

describe('BucketReviewStep run report', () => {
  it('shows the AI reason on each row', () => {
    renderStep(bucket([row()]));
    expect(screen.getByText('Chipotle appears in your examples under Dining.')).toBeInTheDocument();
  });

  it('shows why a row could not be classified', () => {
    renderStep(bucket([
      row({ suggestedCategoryId: '', selectedCategoryId: '', reasoning: '', failureReason: 'The AI skipped this transaction.' }),
    ], ''));
    expect(screen.getByText('The AI skipped this transaction.')).toBeInTheDocument();
  });

  it('offers a note only after the user changes the category, and sends it with the row', async () => {
    const user = userEvent.setup();
    const onApply = renderStep(bucket([row()]));
    expect(screen.queryByPlaceholderText('Why? (optional)')).not.toBeInTheDocument();

    await user.click(screen.getByDisplayValue('Dining'));
    // The dropdown is still mid-transition (display: none) in jsdom, hence hidden.
    await user.click(await screen.findByRole('option', { name: 'Groceries', hidden: true }));
    await user.type(screen.getByPlaceholderText('Why? (optional)'), 'Picked up for the party');
    await user.click(screen.getByRole('button', { name: /Apply 1 categorization/ }));

    expect(onApply).toHaveBeenCalledWith([
      { transactionId: 't1', categoryId: 'cat-groceries', note: 'Picked up for the party' },
    ]);
  });
});

describe('run report helpers', () => {
  const b = bucket([row({ id: 't1' }), row({ id: 't2' }), row({ id: 't3' })]);
  const applied = [
    { transactionId: 't1', categoryId: 'cat-dining' },
    { transactionId: 't2', categoryId: 'cat-groceries', note: 'party' },
  ];

  it('reports an outcome for every row in the bucket, null for skipped', () => {
    expect(bucketOutcomes(b, applied)).toEqual([
      { transactionId: 't1', categoryId: 'cat-dining' },
      { transactionId: 't2', categoryId: 'cat-groceries', note: 'party' },
      { transactionId: 't3', categoryId: null },
    ]);
  });

  it('counts rows applied to a category other than the suggestion', () => {
    expect(countChanged(b, applied)).toBe(1);
  });

  it('groups Unsure rows by why they are there', () => {
    const result = {
      unsureBucket: bucket([
        row({ id: 'a', confidence: 'low' }),
        row({ id: 'b', failureReason: 'The AI skipped this transaction.' }),
        row({ id: 'c', failureReason: 'The AI skipped this transaction.' }),
      ], ''),
    } as unknown as ClassifyTransactionsResponse;

    expect([...unsureReasons(result)]).toEqual([
      [LOW_CONFIDENCE_REASON, 1],
      ['The AI skipped this transaction.', 2],
    ]);
  });
});
