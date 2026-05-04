import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { SuggestedRuleCard, type SuggestedRuleAction } from './SuggestedRuleCard';
import type {
  AutoCatSuggestion,
  AutoCategorizeRule,
} from '../../../../shared/types';

function makeSuggestion(overrides: Partial<AutoCatSuggestion> = {}): AutoCatSuggestion {
  return {
    normalizedKey: 'lola pizza',
    displayLabel: 'Lola Pizza',
    topCategoryId: 'CUSTOM_REST',
    topCategoryName: 'Restaurants',
    agreementPct: 87,
    clusterSize: 8,
    topCategoryCount: 7,
    pendingMatchCount: 3,
    sampleCategorizedTxnIds: ['c1', 'c2'],
    pendingTxnIds: ['p1', 'p2', 'p3'],
    sampleCategorizedTxns: [
      { id: 'c1', date: '2026-04-12', description: 'Lola Pizza', amount: -22.5 },
      { id: 'c2', date: '2026-04-15', description: 'Lola Pizza', amount: -19.99 },
    ],
    pendingTxns: [
      { id: 'p1', date: '2026-04-30', description: 'Lola Pizza', amount: -25 },
      { id: 'p2', date: '2026-05-01', description: 'Lola Pizza', amount: -18 },
      { id: 'p3', date: '2026-05-02', description: 'Lola Pizza', amount: -32 },
    ],
    ...overrides,
  };
}

function makeRule(overrides: Partial<AutoCategorizeRule> & { id: string }): AutoCategorizeRule {
  return {
    description: overrides.id,
    patterns: ['placeholder'],
    matchType: 'contains',
    categoryId: 'CUSTOM_OTHER',
    priority: 1,
    isActive: true,
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

function renderCard(props: {
  suggestion?: AutoCatSuggestion;
  existingRules?: AutoCategorizeRule[];
  onAction?: ReturnType<typeof vi.fn>;
  onDismiss?: ReturnType<typeof vi.fn>;
}) {
  const onAction = props.onAction ?? vi.fn();
  const onDismiss = props.onDismiss ?? vi.fn();
  const suggestion = props.suggestion ?? makeSuggestion();
  const existingRules = props.existingRules ?? [];
  render(
    <MantineProvider>
      <SuggestedRuleCard
        suggestion={suggestion}
        existingRules={existingRules}
        onAction={onAction}
        onDismiss={onDismiss}
      />
    </MantineProvider>,
  );
  return { onAction, onDismiss, suggestion };
}

describe('SuggestedRuleCard', () => {
  it('renders display label, agreement, cluster size, and pending count', () => {
    renderCard({});
    expect(screen.getAllByText('Lola Pizza').length).toBeGreaterThan(0);
    expect(
      screen.getByText(/87% of the time \(7 of 8 past matches/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/pending uncategorized transactions/i),
    ).toBeInTheDocument();
  });

  it('renders singular noun when pendingMatchCount is 1', () => {
    renderCard({ suggestion: makeSuggestion({ pendingMatchCount: 1 }) });
    expect(
      screen.getByText(/pending uncategorized transaction$/i),
    ).toBeInTheDocument();
  });

  it('calls onAction with kind="create" when "Create rule" is clicked', () => {
    const { onAction, suggestion } = renderCard({});
    fireEvent.click(screen.getByRole('button', { name: /create rule/i }));
    expect(onAction).toHaveBeenCalledWith(suggestion, { kind: 'create' } as SuggestedRuleAction);
  });

  it('calls onDismiss with the normalizedKey when dismiss is clicked', () => {
    const { onDismiss } = renderCard({});
    fireEvent.click(
      screen.getByRole('button', { name: /dismiss suggestion/i }),
    );
    expect(onDismiss).toHaveBeenCalledWith('lola pizza');
  });

  it('toggles preview button label on click', () => {
    renderCard({});
    expect(
      screen.getByRole('button', { name: /preview matches/i }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /preview matches/i }));
    expect(
      screen.getByRole('button', { name: /hide preview/i }),
    ).toBeInTheDocument();
  });

  it('exposes "Add to existing rule" menu listing rules; same-category first', async () => {
    const user = userEvent.setup();
    const rules = [
      makeRule({
        id: 'r-other',
        description: 'Coffee shops',
        categoryId: 'CUSTOM_COFFEE',
        categoryName: 'Coffee',
        priority: 1,
      }),
      makeRule({
        id: 'r-same',
        description: 'Best pizza',
        categoryId: 'CUSTOM_REST',
        categoryName: 'Restaurants',
        priority: 2,
      }),
    ];
    const { onAction, suggestion } = renderCard({ existingRules: rules });
    await user.click(screen.getByRole('button', { name: /more rule actions/i }));
    // Both rules listed
    await user.click(await screen.findByText('Best pizza'));
    expect(onAction).toHaveBeenCalledWith(
      suggestion,
      { kind: 'append', ruleId: 'r-same' } as SuggestedRuleAction,
    );
  });

  it('disables a rule entry when it is at the 10-pattern cap', async () => {
    const user = userEvent.setup();
    const rules = [
      makeRule({
        id: 'r-cap',
        description: 'Coffee shops',
        categoryId: 'CUSTOM_COFFEE',
        categoryName: 'Coffee',
        patterns: Array.from({ length: 10 }, (_, i) => `p${i}`),
      }),
    ];
    const { onAction } = renderCard({ existingRules: rules });
    await user.click(screen.getByRole('button', { name: /more rule actions/i }));
    const item = (await screen.findByText('Coffee shops')).closest(
      '[role="menuitem"]',
    ) as HTMLElement;
    expect(item).toHaveAttribute('data-disabled');
    await user.click(item);
    expect(onAction).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: 'append' }),
    );
  });
});
