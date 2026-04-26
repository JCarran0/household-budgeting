import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { IncomeVsSpendingCard } from './IncomeVsSpendingCard';

function renderCard(monthlySpending: number, monthlyIncome: number, spendingVsIncomeProgress: number) {
  return render(
    <MemoryRouter>
      <MantineProvider>
        <IncomeVsSpendingCard
          monthlySpending={monthlySpending}
          monthlyIncome={monthlyIncome}
          spendingVsIncomeProgress={spendingVsIncomeProgress}
        />
      </MantineProvider>
    </MemoryRouter>,
  );
}

describe('IncomeVsSpendingCard — badge text and color thresholds', () => {
  it('shows "Overspending" badge when progress > 100', () => {
    renderCard(1500, 1000, 150);
    expect(screen.getByText('Overspending')).toBeInTheDocument();
  });

  it('shows "High Spending" badge when progress > 80 and ≤ 100', () => {
    renderCard(900, 1000, 90);
    expect(screen.getByText('High Spending')).toBeInTheDocument();
  });

  it('shows "Within Income" badge when progress ≤ 80', () => {
    renderCard(600, 1000, 60);
    expect(screen.getByText('Within Income')).toBeInTheDocument();
  });

  it('shows "Within Income" badge at exactly 80 (boundary is exclusive > 80)', () => {
    renderCard(800, 1000, 80);
    expect(screen.getByText('Within Income')).toBeInTheDocument();
  });

  it('renders "Create a budget" link pointing to /budgets', () => {
    renderCard(600, 1000, 60);
    const link = screen.getByRole('link', { name: /create a budget/i });
    expect(link).toHaveAttribute('href', '/budgets');
  });
});
