import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  AutoCatSuggestion,
  AutoCatSuggestionsResponse,
} from '../../../../shared/types';
import { SuggestedRulesSection } from './SuggestedRulesSection';

const mockGetSuggestions = vi.fn<() => Promise<AutoCatSuggestionsResponse>>();
const mockGetRules = vi.fn();
const mockCreateRule = vi.fn();
const mockApply = vi.fn();
const mockUpdateRule = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    getAutoCatSuggestions: () => mockGetSuggestions(),
    getAutoCategorizeRules: () => mockGetRules(),
    createAutoCategorizeRule: (...args: unknown[]) => mockCreateRule(...args),
    applyAutoCategorizeRules: (...args: unknown[]) => mockApply(...args),
    updateAutoCategorizeRule: (...args: unknown[]) => mockUpdateRule(...args),
  },
}));

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <ModalsProvider>
          <Notifications />
          <SuggestedRulesSection />
        </ModalsProvider>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

function makeSuggestion(overrides: Partial<AutoCatSuggestion> & { normalizedKey: string }): AutoCatSuggestion {
  return {
    displayLabel: overrides.normalizedKey,
    topCategoryId: 'CAT_1',
    topCategoryName: 'Restaurants',
    agreementPct: 100,
    clusterSize: 3,
    topCategoryCount: 3,
    pendingMatchCount: 1,
    sampleCategorizedTxnIds: [],
    pendingTxnIds: [],
    sampleCategorizedTxns: [],
    pendingTxns: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no rules cached so collision check returns no match
  mockGetRules.mockResolvedValue([]);
  mockCreateRule.mockResolvedValue({ id: 'r-new' });
  mockApply.mockResolvedValue({ categorized: 1, recategorized: 0, total: 1 });
  mockUpdateRule.mockResolvedValue(undefined);
  // Reset localStorage between tests
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('SuggestedRulesSection', () => {
  it('renders nothing when the suggestions list is empty', async () => {
    mockGetSuggestions.mockResolvedValue({
      suggestions: [],
      truncated: false,
      totalSuggestions: 0,
    });
    const { container } = renderSection();
    // Wait until the loader text is gone, then assert no chrome remains.
    await waitFor(() => {
      expect(screen.queryByText(/looking for suggested rules/i)).not.toBeInTheDocument();
    });
    expect(
      container.querySelector('[aria-label="Refresh suggestions"]'),
    ).toBeNull();
    expect(
      screen.queryByRole('heading', { name: /suggested rules/i }),
    ).not.toBeInTheDocument();
  });

  it('renders one card per suggestion and hides dismissed entries on click', async () => {
    mockGetSuggestions.mockResolvedValue({
      suggestions: [
        makeSuggestion({ normalizedKey: 'lola pizza' }),
        makeSuggestion({ normalizedKey: 'starbucks' }),
        makeSuggestion({ normalizedKey: 'whole foods' }),
      ],
      truncated: false,
      totalSuggestions: 3,
    });
    renderSection();

    await waitFor(() => {
      expect(screen.getByText(/suggested rules \(3\)/i)).toBeInTheDocument();
    });
    expect(screen.getByText('lola pizza')).toBeInTheDocument();
    expect(screen.getByText('starbucks')).toBeInTheDocument();
    expect(screen.getByText('whole foods')).toBeInTheDocument();

    // Dismiss "starbucks"
    const starbucksCard = screen.getByText('starbucks').closest('[class*="Card"]') as HTMLElement;
    fireEvent.click(within(starbucksCard).getByRole('button', { name: /dismiss suggestion/i }));

    await waitFor(() => {
      expect(screen.queryByText('starbucks')).not.toBeInTheDocument();
    });
    expect(screen.getByText(/suggested rules \(2\)/i)).toBeInTheDocument();
  });

  it('shows "Show N more" when more than 10 visible suggestions exist', async () => {
    const suggestions: AutoCatSuggestion[] = [];
    for (let i = 0; i < 12; i++) {
      suggestions.push(makeSuggestion({ normalizedKey: `merchant ${i}` }));
    }
    mockGetSuggestions.mockResolvedValue({
      suggestions,
      truncated: false,
      totalSuggestions: 12,
    });
    renderSection();

    await waitFor(() => {
      expect(screen.getByText(/suggested rules \(12\)/i)).toBeInTheDocument();
    });

    // First 10 visible
    expect(screen.getByText('merchant 0')).toBeInTheDocument();
    expect(screen.getByText('merchant 9')).toBeInTheDocument();
    expect(screen.queryByText('merchant 10')).not.toBeInTheDocument();

    // "Show 2 more" expands
    fireEvent.click(screen.getByRole('button', { name: /show 2 more/i }));
    expect(screen.getByText('merchant 10')).toBeInTheDocument();
    expect(screen.getByText('merchant 11')).toBeInTheDocument();
  });
});
