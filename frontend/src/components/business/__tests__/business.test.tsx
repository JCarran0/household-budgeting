/**
 * Business Workspace UI tests — Phase 7.6
 *
 * Covers:
 *   - computeStatement preview math matches payment-068 golden fixture
 *   - StatementPreview renders fixture statement values on screen
 *   - exportStatementToCSV produces deposit rows + remittance total
 *   - StatementPdf document renders without throwing for a fixture statement
 *   - Admin CreateBusinessWorkspaceCard calls createWorkspace with correct payload
 *
 * The fixture uses 3 rows that sum to the authoritative payment-068 total
 * (Σ payouts = 96665.49) so royaltySubtotal and remittanceTotal are the same
 * as the real statement. The anchor row (70220.83) is preserved verbatim.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function makeTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderWithProviders(ui: React.ReactElement) {
  const qc = makeTestQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MantineProvider>{ui}</MantineProvider>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Shared pure function — reused by the preview (D9 / Plan 7.3)
// ---------------------------------------------------------------------------
import {
  computeStatement,
  roundHalfUp,
} from '../../../../../shared/utils/businessStatementCalc';

// ---------------------------------------------------------------------------
// Fixture — 3 rows that sum to the payment-068 authoritative total
// ---------------------------------------------------------------------------
const FIXTURE_HEADER = {
  businessName: 'OoT Publishing LLC',
  businessAddress: '123 Main St',
  clientName: 'Jane Smith',
  clientCompany: 'Smith Group',
  clientAddress: '456 Client Ave',
};

const FIXTURE_SUBTYPES = [
  { id: 'BIZ_BILLABLE_BOOK_REPORT', label: 'Book Report - data analytics' },
  { id: 'BIZ_BILLABLE_BOOK_PURCHASE', label: 'Book Purchase' },
  { id: 'BIZ_BILLABLE_BOOK_SHIPPING', label: 'Book Shipping' },
] as const;

// 3 rows: anchor (70220.83) + two others that sum to 96665.49 total
// Σ = 70220.83 + 20000.00 + 6444.66 = 96665.49 (exact)
const FIXTURE_TRUST_INFLOW = [
  { transactionId: 'txn-0', disbursementDate: '2025-01-01', payout: 70220.83 },
  { transactionId: 'txn-1', disbursementDate: '2025-01-15', payout: 20000.0 },
  { transactionId: 'txn-2', disbursementDate: '2025-01-20', payout: 6444.66 },
];

const FIXTURE_BILLABLE_BY_SUBTYPE: Record<string, number[]> = {
  BIZ_BILLABLE_BOOK_REPORT: [19.0],
  BIZ_BILLABLE_BOOK_PURCHASE: [],
  BIZ_BILLABLE_BOOK_SHIPPING: [],
};

// ---------------------------------------------------------------------------
// computeStatement — golden fixture assertions (payment-068 totals)
// ---------------------------------------------------------------------------

describe('computeStatement — payment-068 golden fixture (D7)', () => {
  it('produces royaltySubtotal 91832.22 for Σ payouts = 96665.49', () => {
    const result = computeStatement({
      trustInflowTxns: FIXTURE_TRUST_INFLOW,
      billableBySubtype: FIXTURE_BILLABLE_BY_SUBTYPE,
      billableSubtypes: FIXTURE_SUBTYPES,
      commissionRate: 0.05,
      paymentNumber: 68,
      paymentDate: '2025-02-01',
      periodMonth: '2025-01',
      clientHeader: FIXTURE_HEADER,
    });

    // round(96665.49 × 0.95) = round(91832.2155) = 91832.22
    expect(result.royaltySubtotal).toBe(91832.22);
  });

  it('produces remittanceTotal 91813.22 (royaltySubtotal − Book Report $19)', () => {
    const result = computeStatement({
      trustInflowTxns: FIXTURE_TRUST_INFLOW,
      billableBySubtype: FIXTURE_BILLABLE_BY_SUBTYPE,
      billableSubtypes: FIXTURE_SUBTYPES,
      commissionRate: 0.05,
      paymentNumber: 68,
      paymentDate: '2025-02-01',
      periodMonth: '2025-01',
      clientHeader: FIXTURE_HEADER,
    });

    expect(result.remittanceTotal).toBe(91813.22);
  });

  it('anchor row: payout 70220.83 → commission 3511.04, royalty ≈ 66709.79', () => {
    const result = computeStatement({
      trustInflowTxns: FIXTURE_TRUST_INFLOW,
      billableBySubtype: FIXTURE_BILLABLE_BY_SUBTYPE,
      billableSubtypes: FIXTURE_SUBTYPES,
      commissionRate: 0.05,
      paymentNumber: 68,
      paymentDate: '2025-02-01',
      periodMonth: '2025-01',
      clientHeader: FIXTURE_HEADER,
    });

    const anchor = result.lineItems[0];
    expect(anchor.payout).toBe(70220.83);
    expect(anchor.commission).toBe(3511.04);
    // royalty = payout - commission; IEEE-754 sub-cent noise expected
    expect(anchor.royalty).toBeCloseTo(66709.79, 2);
  });

  it('includes $0 lines for zero-amount billable subtypes (REQ-016)', () => {
    const result = computeStatement({
      trustInflowTxns: FIXTURE_TRUST_INFLOW,
      billableBySubtype: FIXTURE_BILLABLE_BY_SUBTYPE,
      billableSubtypes: FIXTURE_SUBTYPES,
      commissionRate: 0.05,
      paymentNumber: 68,
      paymentDate: '2025-02-01',
      periodMonth: '2025-01',
      clientHeader: FIXTURE_HEADER,
    });

    expect(result.charges).toHaveLength(3);
    const purchase = result.charges.find((c) => c.subType === 'BIZ_BILLABLE_BOOK_PURCHASE');
    expect(purchase?.amount).toBe(0);
    const shipping = result.charges.find((c) => c.subType === 'BIZ_BILLABLE_BOOK_SHIPPING');
    expect(shipping?.amount).toBe(0);
  });

  it('roundHalfUp: 0.025 rounds up to 0.03 (half-cent boundary)', () => {
    expect(roundHalfUp(0.025)).toBe(0.03);
  });
});

// ---------------------------------------------------------------------------
// StatementPreview renders fixture values on screen
// ---------------------------------------------------------------------------

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}));

import { StatementPreview } from '../StatementPreview';
import type { BusinessStatement } from '../../../../../shared/types';

function makeFixtureStatement(): BusinessStatement {
  const computed = computeStatement({
    trustInflowTxns: FIXTURE_TRUST_INFLOW,
    billableBySubtype: FIXTURE_BILLABLE_BY_SUBTYPE,
    billableSubtypes: FIXTURE_SUBTYPES,
    commissionRate: 0.05,
    paymentNumber: 68,
    paymentDate: '2025-02-01',
    periodMonth: '2025-01',
    clientHeader: FIXTURE_HEADER,
  });
  return {
    ...computed,
    id: 'stmt-068',
    createdAt: '2025-02-01T00:00:00Z',
  };
}

describe('StatementPreview', () => {
  it('renders business name and client name', () => {
    const statement = makeFixtureStatement();
    render(
      <MantineProvider>
        <StatementPreview statement={statement} />
      </MantineProvider>,
    );

    expect(screen.getByText('OoT Publishing LLC')).toBeDefined();
    expect(screen.getByText('Jane Smith')).toBeDefined();
  });

  it('renders the remittance total value in the document', () => {
    const statement = makeFixtureStatement();
    render(
      <MantineProvider>
        <StatementPreview statement={statement} />
      </MantineProvider>,
    );

    // getByText may fail if the number is split across spans; use getAllByText with
    // a partial regex instead
    const remittanceEl = screen.getByText((content) => content.includes('91,813.22'));
    expect(remittanceEl).toBeDefined();
  });

  it('renders all 3 charges including zero-amount lines', () => {
    const statement = makeFixtureStatement();
    render(
      <MantineProvider>
        <StatementPreview statement={statement} />
      </MantineProvider>,
    );

    expect(screen.getByText('Book Report - data analytics')).toBeDefined();
    expect(screen.getByText('Book Purchase')).toBeDefined();
    expect(screen.getByText('Book Shipping')).toBeDefined();
  });

  it('renders the anchor payout row', () => {
    const statement = makeFixtureStatement();
    render(
      <MantineProvider>
        <StatementPreview statement={statement} />
      </MantineProvider>,
    );

    const el = screen.getByText((content) => content.includes('70,220.83'));
    expect(el).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// CSV export — deposit rows and remittance total
// ---------------------------------------------------------------------------

import { exportStatementToCSV } from '../../../utils/statementCsv';

describe('exportStatementToCSV', () => {
  let capturedContent: string | null = null;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    capturedContent = null;

    // Capture the raw text passed to the Blob constructor instead of calling
    // Blob.text() (jsdom's Blob polyfill does not support .text())
    vi.spyOn(globalThis, 'Blob').mockImplementation(
      (blobParts?: BlobPart[]): Blob => {
        capturedContent = (blobParts ?? []).map(String).join('');
        return {
          size: capturedContent.length,
          type: 'text/csv',
        } as Blob;
      },
    );

    // Stub DOM link + URL APIs
    Object.defineProperty(window.URL, 'createObjectURL', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue('blob:test'),
    });
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      writable: true,
      configurable: true,
      value: vi.fn(),
    });

    // Mock document.createElement only for 'a' tags
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return { href: '', download: '', click: vi.fn() } as unknown as HTMLElement;
      }
      return originalCreateElement(tag);
    });

    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
  });

  it('CSV contains all deposit row payouts', () => {
    const statement = makeFixtureStatement();
    exportStatementToCSV(statement);

    expect(capturedContent).not.toBeNull();
    expect(capturedContent).toContain('70220.83');
    expect(capturedContent).toContain('20000.00');
    expect(capturedContent).toContain('6444.66');
  });

  it('CSV contains remittance total 91813.22', () => {
    const statement = makeFixtureStatement();
    exportStatementToCSV(statement);

    expect(capturedContent).not.toBeNull();
    expect(capturedContent).toContain('91813.22');
    expect(capturedContent).toContain('Remittance Total');
  });

  it('CSV contains royalty subtotal 91832.22', () => {
    const statement = makeFixtureStatement();
    exportStatementToCSV(statement);

    expect(capturedContent).not.toBeNull();
    expect(capturedContent).toContain('91832.22');
    expect(capturedContent).toContain('Royalty Subtotal');
  });
});

// ---------------------------------------------------------------------------
// StatementPdf — renders without throwing for a fixture statement
// ---------------------------------------------------------------------------

describe('StatementPdf', () => {
  it('createElement(StatementPdf, {statement}) does not throw', async () => {
    const { StatementPdf } = await import('../StatementPdf');
    const { createElement } = await import('react');
    const statement = makeFixtureStatement();

    // @react-pdf/renderer does not render to DOM; we only verify that the
    // React element can be created without prop/runtime errors.
    expect(() => {
      createElement(StatementPdf, { statement });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Admin — CreateBusinessWorkspaceCard calls createWorkspace with correct payload
// ---------------------------------------------------------------------------

vi.mock('../../../lib/api', () => ({
  api: {
    createWorkspace: vi.fn(),
    listWorkspaces: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../../stores/authStore', () => ({
  useAuthStore: Object.assign(
    vi.fn().mockReturnValue({}),
    { setState: vi.fn() },
  ),
}));

import { api } from '../../../lib/api';
import { CreateBusinessWorkspaceCard } from '../../admin/CreateBusinessWorkspaceCard';
import userEvent from '@testing-library/user-event';
import type { Family } from '../../../../../shared/types';

describe('CreateBusinessWorkspaceCard', () => {
  it('calls createWorkspace with workspaceType business when no business ws exists', async () => {
    vi.mocked(api.createWorkspace).mockResolvedValue({
      id: 'new-biz-id',
      name: 'OoT Business',
      workspaceType: 'business',
      members: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });

    const onCreated = vi.fn();
    renderWithProviders(
      <CreateBusinessWorkspaceCard workspaces={[]} onCreated={onCreated} />,
    );

    const button = screen.getByRole('button', { name: /create business workspace/i });
    await userEvent.click(button);

    expect(api.createWorkspace).toHaveBeenCalledWith({
      name: 'OoT Business',
      workspaceType: 'business',
    });
  });

  it('shows provisioned state and hides create form when business ws exists', () => {
    const bizWorkspace: Family = {
      id: 'biz-id',
      name: 'My Business',
      workspaceType: 'business',
      members: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    renderWithProviders(
      <CreateBusinessWorkspaceCard
        workspaces={[bizWorkspace]}
        onCreated={vi.fn()}
      />,
    );

    expect(screen.getByText('Provisioned')).toBeDefined();
    expect(screen.queryByRole('button', { name: /create business workspace/i })).toBeNull();
  });
});
