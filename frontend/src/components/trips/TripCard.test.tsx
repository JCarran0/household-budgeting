import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { TripCard } from './TripCard';
import { formatTripDateRange } from './tripCardHelpers';
import type { StayStop, TripSummary } from '../../../../shared/types';

function renderCard(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <MantineProvider>{ui}</MantineProvider>
    </MemoryRouter>,
  );
}

function makeTrip(overrides: Partial<TripSummary> = {}): TripSummary {
  return {
    id: 'trip-1',
    name: 'Costa Rica',
    tag: 'costa-rica-2026',
    startDate: '2026-03-01',
    endDate: '2026-03-10',
    totalBudget: 2000,
    categoryBudgets: [],
    rating: null,
    notes: '',
    stops: [],
    photoAlbumUrl: null,
    coverStopId: null,
    status: 'upcoming',
    totalSpent: 500,
    categorySpending: [],
    ...overrides,
  };
}

function makeStayWithPhoto(overrides: Partial<StayStop> = {}): StayStop {
  return {
    id: 'stop-1',
    type: 'stay',
    date: '2026-03-01',
    endDate: '2026-03-05',
    name: 'Arenal Lodge',
    time: null,
    notes: '',
    sortOrder: 0,
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
    location: {
      kind: 'verified',
      label: 'Arenal Lodge',
      address: 'La Fortuna, CR',
      lat: 10,
      lng: -84,
      placeId: 'p1',
      photoName: 'places/abc/photos/xyz',
      photoAttribution: 'Jane Photographer',
    },
    ...overrides,
  };
}

describe('formatTripDateRange', () => {
  it('collapses same-year range to single year suffix', () => {
    expect(formatTripDateRange('2026-03-01', '2026-03-10')).toBe(
      'Mar 1 – Mar 10, 2026',
    );
  });

  it('keeps both years when the range crosses a year boundary', () => {
    expect(formatTripDateRange('2026-12-28', '2027-01-04')).toBe(
      'Dec 28, 2026 – Jan 4, 2027',
    );
  });

  it('falls back to raw strings when input is malformed', () => {
    // The try/catch path — date-fns throws on an invalid Date.
    // Passing junk still produces something rather than crashing the row.
    const result = formatTripDateRange('not-a-date', '2026-03-10');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('TripCard', () => {
  it('renders name, status badge, and date range in list-row mode when no stop has a photo', () => {
    renderCard(
      <TripCard trip={makeTrip()} onEdit={() => {}} onDelete={() => {}} />,
    );
    expect(screen.getByText('Costa Rica')).toBeInTheDocument();
    expect(screen.getByText('upcoming')).toBeInTheDocument();
    expect(screen.getByText('Mar 1 – Mar 10, 2026')).toBeInTheDocument();
  });

  it('shows spent / budget when totalBudget is set', () => {
    renderCard(
      <TripCard
        trip={makeTrip({ totalSpent: 500, totalBudget: 2000 })}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText('$500 / $2,000')).toBeInTheDocument();
  });

  it('shows spent only when totalBudget is null', () => {
    renderCard(
      <TripCard
        trip={makeTrip({ totalSpent: 500, totalBudget: null })}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText('$500')).toBeInTheDocument();
    expect(screen.queryByText(/\//)).not.toBeInTheDocument();
  });

  it('renders over-budget spend label in red', () => {
    renderCard(
      <TripCard
        trip={makeTrip({ totalSpent: 2500, totalBudget: 2000 })}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    // Mantine's `c="red"` renders inline via --mantine-color-red-* — asserting on
    // presence rather than the exact CSS var keeps the test decoupled from theme.
    const label = screen.getByText('$2,500 / $2,000');
    expect(label).toBeInTheDocument();
    // Mantine's c="red" surfaces as a CSS var in inline style.
    const style = label.getAttribute('style') ?? '';
    expect(style.toLowerCase()).toContain('red');
  });

  it('fires onEdit/onDelete without navigating when action buttons are clicked', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    renderCard(
      <TripCard trip={makeTrip()} onEdit={onEdit} onDelete={onDelete} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /edit trip/i }));
    fireEvent.click(screen.getByRole('button', { name: /delete trip/i }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
    // stopNav must pass the full TripSummary, not the event.
    expect(onEdit.mock.calls[0][0]).toMatchObject({ id: 'trip-1' });
    expect(onDelete.mock.calls[0][0]).toMatchObject({ id: 'trip-1' });
  });

  it('switches to cover-banner render when a stop has a verified photo', () => {
    // When the Google Places key is absent (it is, in tests), TripCoverBanner
    // renders null — so we assert the *list-row* ornaments are gone rather than
    // the banner itself. The `IconMapPin` ThemeIcon is unique to the list row.
    const tripWithPhoto = makeTrip({
      stops: [makeStayWithPhoto()],
    });
    const { container } = renderCard(
      <TripCard trip={tripWithPhoto} onEdit={() => {}} onDelete={() => {}} />,
    );
    // In list-row mode the title appears once. In banner mode the title lives
    // inside TripCoverBanner (which returns null without the API key) so the
    // only text remnant is the budget row. Assert the row-specific badge is
    // absent.
    expect(screen.queryByText('upcoming')).not.toBeInTheDocument();
    // The Paper still renders with overflow:hidden as a Link — sanity check.
    expect(container.querySelector('a')).toHaveAttribute('href', '/trips/trip-1');
  });
});
