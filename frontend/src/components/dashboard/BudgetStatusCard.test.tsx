import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { BudgetStatusCard } from './BudgetStatusCard';

function renderCard(monthlySpending: number, totalBudget: number, budgetProgress: number) {
  return render(
    <MemoryRouter>
      <MantineProvider>
        <BudgetStatusCard
          monthlySpending={monthlySpending}
          totalBudget={totalBudget}
          budgetProgress={budgetProgress}
        />
      </MantineProvider>
    </MemoryRouter>,
  );
}

describe('BudgetStatusCard — badge text and color thresholds', () => {
  it('shows "Over Budget" badge when progress > 100', () => {
    renderCard(1500, 1000, 150);
    expect(screen.getByText('Over Budget')).toBeInTheDocument();
  });

  it('shows "Near Limit" badge when progress > 80 and ≤ 100', () => {
    renderCard(900, 1000, 90);
    expect(screen.getByText('Near Limit')).toBeInTheDocument();
  });

  it('shows "On Track" badge when progress ≤ 80', () => {
    renderCard(600, 1000, 60);
    expect(screen.getByText('On Track')).toBeInTheDocument();
  });

  it('shows "On Track" badge at exactly 80 (boundary is exclusive > 80)', () => {
    renderCard(800, 1000, 80);
    expect(screen.getByText('On Track')).toBeInTheDocument();
  });

  it('card links to /budgets?view=bva', () => {
    renderCard(600, 1000, 60);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/budgets?view=bva');
  });

  it('renders "Monthly Budget Status" heading', () => {
    renderCard(600, 1000, 60);
    expect(screen.getByText('Monthly Budget Status')).toBeInTheDocument();
  });
});
