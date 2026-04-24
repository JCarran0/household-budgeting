import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BvaIISectionTable, type FilteredParent } from './BvaIISectionTable';
import type { Category } from '../../../../../shared/types';
import type { BvaIIChildRow, BvaIIParentRow } from '../../../../../shared/utils/bvaIIDataComposition';

// TransactionPreviewTrigger (rendered inside BvaIISectionTable) mounts
// TransactionPreviewModal, which calls useNavigate() + useQueryClient(). A
// MemoryRouter + QueryClientProvider satisfy those even though the modal
// never opens in these tests.
function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <MantineProvider>{ui}</MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function makeChild(overrides: Partial<BvaIIChildRow> & { categoryId: string; categoryName: string }): BvaIIChildRow {
  return {
    categoryId: overrides.categoryId,
    categoryName: overrides.categoryName,
    actual: overrides.actual ?? 0,
    budgeted: overrides.budgeted ?? 0,
    rollover: overrides.rollover ?? null,
    available: overrides.available ?? 0,
    isRollover: overrides.isRollover ?? false,
  };
}

function makeParent(overrides: Partial<BvaIIParentRow> & { parentId: string; parentName: string }): BvaIIParentRow {
  return {
    parentId: overrides.parentId,
    parentName: overrides.parentName,
    section: overrides.section ?? 'spending',
    actual: overrides.actual ?? 0,
    budgeted: overrides.budgeted ?? 0,
    rollover: overrides.rollover ?? null,
    available: overrides.available ?? 0,
    children: overrides.children ?? [],
  };
}

function baseProps(overrides: Partial<React.ComponentProps<typeof BvaIISectionTable>> = {}) {
  return {
    section: 'spending' as const,
    parents: [] as FilteredParent[],
    categories: [] as Category[],
    monthDateRange: { startDate: '2026-04-01', endDate: '2026-04-30' },
    rolloverOn: false,
    showDismissed: false,
    dismissedIds: new Set<string>(),
    onDismiss: vi.fn(),
    onRestore: vi.fn(),
    isExpanded: () => false,
    onToggleExpanded: vi.fn(),
    onEditBudget: vi.fn(),
    ...overrides,
  };
}

describe('BvaIISectionTable', () => {
  it('renders the section title from SECTION_LABEL', () => {
    const parent = makeParent({ parentId: 'food', parentName: 'Food' });
    renderWithProviders(
      <BvaIISectionTable
        {...baseProps({ parents: [{ parent, deEmphasizedChildIds: new Set() }] })}
      />,
    );
    expect(screen.getByText('Spending')).toBeInTheDocument();
  });

  it('returns null when there are no visible parents', () => {
    renderWithProviders(
      <BvaIISectionTable {...baseProps({ parents: [] })} />,
    );
    // Short-circuit to null: no section title, no table.
    expect(screen.queryByText('Spending')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('filters dismissed parents when showDismissed is false', () => {
    const dismissedParent = makeParent({ parentId: 'travel', parentName: 'Travel' });
    const visibleParent = makeParent({ parentId: 'food', parentName: 'Food' });
    renderWithProviders(
      <BvaIISectionTable
        {...baseProps({
          parents: [
            { parent: dismissedParent, deEmphasizedChildIds: new Set() },
            { parent: visibleParent, deEmphasizedChildIds: new Set() },
          ],
          dismissedIds: new Set(['travel']),
          showDismissed: false,
        })}
      />,
    );
    expect(screen.queryByText('Travel')).not.toBeInTheDocument();
    expect(screen.getByText('Food')).toBeInTheDocument();
  });

  it('shows dismissed parents with strike-through when showDismissed is true', () => {
    const dismissedParent = makeParent({ parentId: 'travel', parentName: 'Travel' });
    renderWithProviders(
      <BvaIISectionTable
        {...baseProps({
          parents: [{ parent: dismissedParent, deEmphasizedChildIds: new Set() }],
          dismissedIds: new Set(['travel']),
          showDismissed: true,
        })}
      />,
    );
    const label = screen.getByText('Travel');
    expect(label).toBeInTheDocument();
    // Mantine's `td` prop → CSS text-decoration. Check via computed style.
    expect(label).toHaveStyle({ textDecoration: 'line-through' });
  });

  it('fires onToggleExpanded when the chevron is clicked (has children)', () => {
    const onToggle = vi.fn();
    const parent = makeParent({
      parentId: 'food',
      parentName: 'Food',
      children: [makeChild({ categoryId: 'groceries', categoryName: 'Groceries' })],
    });
    renderWithProviders(
      <BvaIISectionTable
        {...baseProps({
          parents: [{ parent, deEmphasizedChildIds: new Set() }],
          onToggleExpanded: onToggle,
          isExpanded: () => false,
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /expand/i }));
    expect(onToggle).toHaveBeenCalledWith('food', false);
  });

  it('toggles via Enter key on the parent row (keyboard accessibility)', () => {
    const onToggle = vi.fn();
    const parent = makeParent({
      parentId: 'food',
      parentName: 'Food',
      children: [makeChild({ categoryId: 'groceries', categoryName: 'Groceries' })],
    });
    renderWithProviders(
      <BvaIISectionTable
        {...baseProps({
          parents: [{ parent, deEmphasizedChildIds: new Set() }],
          onToggleExpanded: onToggle,
        })}
      />,
    );
    const row = screen.getByRole('button', { name: /Food, collapsed/i });
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onToggle).toHaveBeenCalledWith('food', false);
  });

  it('does NOT render a chevron for parents without children', () => {
    const parent = makeParent({ parentId: 'misc', parentName: 'Miscellaneous', children: [] });
    renderWithProviders(
      <BvaIISectionTable
        {...baseProps({ parents: [{ parent, deEmphasizedChildIds: new Set() }] })}
      />,
    );
    // No button with expand/collapse label means no chevron.
    expect(screen.queryByRole('button', { name: /expand|collapse/i })).not.toBeInTheDocument();
    // The row itself also isn't a toggleable button — empty-children parents
    // don't get the role/tabIndex/aria-expanded treatment.
    const row = screen.getByText('Miscellaneous').closest('tr')!;
    expect(row.getAttribute('role')).not.toBe('button');
    expect(row.getAttribute('aria-expanded')).toBeNull();
  });

  it('renders children in |available|-descending order when expanded', () => {
    const parent = makeParent({
      parentId: 'food',
      parentName: 'Food',
      children: [
        makeChild({ categoryId: 'snacks', categoryName: 'Snacks', available: -50 }),
        makeChild({ categoryId: 'groceries', categoryName: 'Groceries', available: 200 }),
        makeChild({ categoryId: 'dining', categoryName: 'Dining', available: 100 }),
      ],
    });
    renderWithProviders(
      <BvaIISectionTable
        {...baseProps({
          parents: [{ parent, deEmphasizedChildIds: new Set() }],
          isExpanded: () => true,
        })}
      />,
    );
    const childCells = screen.getAllByText(/↳/);
    // Expected order by |available|: groceries (200), dining (100), snacks (50).
    expect(childCells.map(c => c.textContent)).toEqual([
      '↳ Groceries',
      '↳ Dining',
      '↳ Snacks',
    ]);
  });

  it('applies opacity 0.5 to de-emphasized child rows', () => {
    const parent = makeParent({
      parentId: 'food',
      parentName: 'Food',
      children: [
        makeChild({ categoryId: 'groceries', categoryName: 'Groceries' }),
        makeChild({ categoryId: 'dining', categoryName: 'Dining' }),
      ],
    });
    renderWithProviders(
      <BvaIISectionTable
        {...baseProps({
          parents: [{ parent, deEmphasizedChildIds: new Set(['dining']) }],
          isExpanded: () => true,
        })}
      />,
    );
    const diningRow = screen.getByText('↳ Dining').closest('tr')!;
    const groceriesRow = screen.getByText('↳ Groceries').closest('tr')!;
    expect(diningRow).toHaveStyle({ opacity: '0.5' });
    expect(groceriesRow).toHaveStyle({ opacity: '1' });
  });

  it('hides the Edit icon for non-budgetable (transfer) categories', () => {
    // TRANSFER_IN-prefixed ids return false from isBudgetableCategory.
    const parent = makeParent({ parentId: 'TRANSFER_IN_BANK', parentName: 'Bank Transfer' });
    renderWithProviders(
      <BvaIISectionTable
        {...baseProps({ parents: [{ parent, deEmphasizedChildIds: new Set() }] })}
      />,
    );
    const row = screen.getByText('Bank Transfer').closest('tr')!;
    expect(within(row).queryByRole('button', { name: /edit budget/i })).not.toBeInTheDocument();
  });

  it('shows the Edit icon for budgetable categories and fires onEditBudget without toggling expand', () => {
    const onEdit = vi.fn();
    const onToggle = vi.fn();
    const parent = makeParent({
      parentId: 'food',
      parentName: 'Food',
      children: [makeChild({ categoryId: 'groceries', categoryName: 'Groceries' })],
    });
    renderWithProviders(
      <BvaIISectionTable
        {...baseProps({
          parents: [{ parent, deEmphasizedChildIds: new Set() }],
          onEditBudget: onEdit,
          onToggleExpanded: onToggle,
        })}
      />,
    );
    const row = screen.getByText('Food').closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: /edit budget/i }));
    expect(onEdit).toHaveBeenCalledWith('food');
    // Edit click must not bubble into expand-toggle.
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('fires onDismiss when the X icon is clicked on a non-dismissed row', () => {
    const onDismiss = vi.fn();
    const onRestore = vi.fn();
    const parent = makeParent({ parentId: 'food', parentName: 'Food' });

    renderWithProviders(
      <BvaIISectionTable
        {...baseProps({
          parents: [{ parent, deEmphasizedChildIds: new Set() }],
          onDismiss,
          onRestore,
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /dismiss row/i }));
    expect(onDismiss).toHaveBeenCalledWith('food');
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('fires onRestore (not onDismiss) when the X icon is clicked on a dismissed row', () => {
    const onDismiss = vi.fn();
    const onRestore = vi.fn();
    const parent = makeParent({ parentId: 'food', parentName: 'Food' });

    renderWithProviders(
      <BvaIISectionTable
        {...baseProps({
          parents: [{ parent, deEmphasizedChildIds: new Set() }],
          dismissedIds: new Set(['food']),
          showDismissed: true,
          onDismiss,
          onRestore,
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /restore row/i }));
    expect(onRestore).toHaveBeenCalledWith('food');
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('renders rollover cell as em-dash for null (regardless of toggle)', () => {
    const parent = makeParent({ parentId: 'food', parentName: 'Food', rollover: null });
    const { container } = renderWithProviders(
      <BvaIISectionTable
        {...baseProps({
          parents: [{ parent, deEmphasizedChildIds: new Set() }],
          rolloverOn: true,
        })}
      />,
    );
    // The rollover column is the 4th <td> in the parent row. The full em-dash is the content.
    const parentRow = container.querySelector('tbody > tr')!;
    const cells = parentRow.querySelectorAll('td');
    expect(cells[3].textContent).toBe('—');
  });

  it('renders rollover value dimmed when rolloverOn is false (not green/red)', () => {
    const parent = makeParent({
      parentId: 'food',
      parentName: 'Food',
      rollover: 50, // positive, would be green if toggle were on
    });
    const { container } = renderWithProviders(
      <BvaIISectionTable
        {...baseProps({
          parents: [{ parent, deEmphasizedChildIds: new Set() }],
          rolloverOn: false,
        })}
      />,
    );
    const parentRow = container.querySelector('tbody > tr')!;
    const rolloverCell = parentRow.querySelectorAll('td')[3];
    const text = rolloverCell.querySelector('.mantine-Text-root');
    // Mantine applies `c="dimmed"` → --mantine-color-dimmed CSS variable in the style attribute.
    expect(text?.getAttribute('style') ?? '').toContain('dimmed');
    expect(rolloverCell.textContent).toBe('+$50');
  });
});
