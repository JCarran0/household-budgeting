/**
 * Unit tests for the shared trip/itinerary helpers.
 *
 * Stay dates are night-based — a Stay with date=2026-05-01 and endDate=2026-05-03
 * covers the nights of May 1, May 2, May 3 (checkout morning = May 4).
 */

import {
  stayCoversDate,
  stayOverlapsStay,
  validateNoStayOverlap,
  computeAgendaDayRange,
  enumerateDateRange,
  groupStopsByDay,
  findActiveStay,
  isTransitBaseChange,
} from '../../shared/utils/tripHelpers';
import type {
  StayStop,
  EatStop,
  TransitStop,
  VerifiedLocation,
} from '../../shared/types';

const LOC: VerifiedLocation = {
  kind: 'verified',
  label: 'Loc',
  address: 'Addr',
  lat: 0,
  lng: 0,
  placeId: 'p',
};

function makeStay(overrides: Partial<StayStop>): StayStop {
  return {
    id: 'stay-' + Math.random(),
    type: 'stay',
    date: '2026-05-01',
    endDate: '2026-05-03',
    name: 'Stay',
    location: LOC,
    time: null,
    notes: '',
    sortOrder: 0,
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
    ...overrides,
  } as StayStop;
}

function makeEat(overrides: Partial<EatStop>): EatStop {
  return {
    id: 'eat-' + Math.random(),
    type: 'eat',
    date: '2026-05-02',
    time: null,
    name: 'Eat',
    location: null,
    notes: '',
    sortOrder: 0,
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
    ...overrides,
  } as EatStop;
}

function makeTransit(overrides: Partial<TransitStop>): TransitStop {
  return {
    id: 'transit-' + Math.random(),
    type: 'transit',
    date: '2026-05-02',
    time: null,
    mode: 'drive',
    fromLocation: null,
    toLocation: null,
    durationMinutes: null,
    notes: '',
    sortOrder: 0,
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
    ...overrides,
  } as TransitStop;
}

describe('stayCoversDate', () => {
  const stay = makeStay({ date: '2026-05-01', endDate: '2026-05-03' });

  it('covers first night', () => expect(stayCoversDate(stay, '2026-05-01')).toBe(true));
  it('covers last night', () => expect(stayCoversDate(stay, '2026-05-03')).toBe(true));
  it('covers middle night', () => expect(stayCoversDate(stay, '2026-05-02')).toBe(true));
  it('does not cover checkout morning', () =>
    expect(stayCoversDate(stay, '2026-05-04')).toBe(false));
  it('does not cover night before first', () =>
    expect(stayCoversDate(stay, '2026-04-30')).toBe(false));
});

describe('stayOverlapsStay', () => {
  it('adjacent stays do not overlap', () => {
    const a = makeStay({ date: '2026-05-01', endDate: '2026-05-03' });
    const b = makeStay({ date: '2026-05-04', endDate: '2026-05-06' });
    expect(stayOverlapsStay(a, b)).toBe(false);
  });

  it('single shared night is an overlap', () => {
    const a = makeStay({ date: '2026-05-01', endDate: '2026-05-03' });
    const b = makeStay({ date: '2026-05-03', endDate: '2026-05-05' });
    expect(stayOverlapsStay(a, b)).toBe(true);
  });

  it('fully contained stays overlap', () => {
    const a = makeStay({ date: '2026-05-01', endDate: '2026-05-10' });
    const b = makeStay({ date: '2026-05-05', endDate: '2026-05-07' });
    expect(stayOverlapsStay(a, b)).toBe(true);
  });
});

describe('validateNoStayOverlap', () => {
  it('passes when there are no existing stays', () => {
    const candidate = makeStay({});
    expect(validateNoStayOverlap([], candidate).ok).toBe(true);
  });

  it('reports the specific conflict stay', () => {
    const a = makeStay({ id: 'a', name: 'Hotel A', date: '2026-05-01', endDate: '2026-05-05' });
    const candidate = makeStay({ id: 'new', date: '2026-05-03', endDate: '2026-05-07' });
    const result = validateNoStayOverlap([a], candidate);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.conflictsWith.id).toBe('a');
  });

  it('ignores the stop being updated (excludeStopId)', () => {
    const a = makeStay({ id: 'a', date: '2026-05-01', endDate: '2026-05-05' });
    const modified = makeStay({ id: 'a', date: '2026-05-02', endDate: '2026-05-06' });
    const result = validateNoStayOverlap([a], modified, 'a');
    expect(result.ok).toBe(true);
  });
});

describe('computeAgendaDayRange', () => {
  const trip = { startDate: '2026-05-01', endDate: '2026-05-07' };

  it('returns trip range when stops fit inside', () => {
    const stops = [makeEat({ date: '2026-05-03' })];
    expect(computeAgendaDayRange(stops, trip)).toEqual({
      start: '2026-05-01',
      end: '2026-05-07',
    });
  });

  it('extends start when a stop is earlier than trip.startDate', () => {
    const stops = [makeTransit({ date: '2026-04-29' })];
    expect(computeAgendaDayRange(stops, trip).start).toBe('2026-04-29');
  });

  it('extends end when a stay reaches past trip.endDate', () => {
    const stops = [makeStay({ date: '2026-05-05', endDate: '2026-05-10' })];
    expect(computeAgendaDayRange(stops, trip).end).toBe('2026-05-10');
  });
});

describe('enumerateDateRange', () => {
  it('enumerates inclusive range', () => {
    expect(enumerateDateRange('2026-05-01', '2026-05-03')).toEqual([
      '2026-05-01',
      '2026-05-02',
      '2026-05-03',
    ]);
  });

  it('handles single day', () => {
    expect(enumerateDateRange('2026-05-01', '2026-05-01')).toEqual(['2026-05-01']);
  });

  it('crosses month boundary', () => {
    expect(enumerateDateRange('2026-05-30', '2026-06-02')).toEqual([
      '2026-05-30',
      '2026-05-31',
      '2026-06-01',
      '2026-06-02',
    ]);
  });

  it('returns empty for reversed range', () => {
    expect(enumerateDateRange('2026-05-05', '2026-05-01')).toEqual([]);
  });
});

describe('groupStopsByDay', () => {
  it('buckets each stop on its date', () => {
    const eat = makeEat({ date: '2026-05-02', id: 'eat' });
    const transit = makeTransit({ date: '2026-05-04', id: 'transit' });
    const map = groupStopsByDay([eat, transit]);
    expect(map.get('2026-05-02')).toEqual([eat]);
    expect(map.get('2026-05-04')).toEqual([transit]);
  });

  it('buckets a Stay on every night it covers', () => {
    const stay = makeStay({ date: '2026-05-01', endDate: '2026-05-03', id: 's' });
    const map = groupStopsByDay([stay]);
    expect(map.get('2026-05-01')).toEqual([stay]);
    expect(map.get('2026-05-02')).toEqual([stay]);
    expect(map.get('2026-05-03')).toEqual([stay]);
    expect(map.has('2026-05-04')).toBe(false);
  });
});

describe('findActiveStay', () => {
  it('returns null when no stays cover the date', () => {
    expect(findActiveStay([makeEat({})], '2026-05-02')).toBeNull();
  });

  it('finds the covering stay', () => {
    const s = makeStay({ date: '2026-05-01', endDate: '2026-05-05' });
    expect(findActiveStay([s], '2026-05-03')?.id).toBe(s.id);
  });
});

describe('isTransitBaseChange', () => {
  it('inline day-trip when transit is fully inside a single stay', () => {
    const stay = makeStay({ date: '2026-05-01', endDate: '2026-05-05' });
    const transit = makeTransit({ date: '2026-05-03' });
    expect(isTransitBaseChange(transit, [stay])).toBe(false);
  });

  it('full-width connector at the seam between two stays', () => {
    // Stay A: 05-01..05-03. Stay B: 05-04..05-06. Transit on 05-04 is the move.
    const a = makeStay({ date: '2026-05-01', endDate: '2026-05-03', id: 'a' });
    const b = makeStay({ date: '2026-05-04', endDate: '2026-05-06', id: 'b' });
    const transit = makeTransit({ date: '2026-05-04' });
    expect(isTransitBaseChange(transit, [a, b])).toBe(true);
  });

  it('connector when departing from a stay into uncovered space', () => {
    const a = makeStay({ date: '2026-05-01', endDate: '2026-05-03' });
    const transit = makeTransit({ date: '2026-05-04' }); // day-after stay
    expect(isTransitBaseChange(transit, [a])).toBe(true);
  });

  it('inline when neither side is covered by a stay', () => {
    const transit = makeTransit({ date: '2026-05-10' });
    expect(isTransitBaseChange(transit, [])).toBe(false);
  });
});
