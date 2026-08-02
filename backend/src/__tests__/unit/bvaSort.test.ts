import {
  compareBvaRows,
  parseBvaSortDirection,
  parseBvaSortField,
  serializeBvaSortDirection,
  serializeBvaSortField,
  type BvaSortableRow,
} from '../../../../shared/utils/bvaSort';

function row(name: string, values: Partial<BvaSortableRow> = {}): BvaSortableRow {
  return {
    name,
    actual: values.actual ?? 0,
    budgeted: values.budgeted ?? 0,
    rollover: values.rollover ?? null,
    available: values.available ?? 0,
  };
}

const order = (rows: BvaSortableRow[], field: Parameters<typeof compareBvaRows>[2], dir: 'asc' | 'desc') =>
  [...rows].sort((a, b) => compareBvaRows(a, b, field, dir)).map(r => r.name);

describe('compareBvaRows', () => {
  it('sorts numeric fields descending by default', () => {
    const rows = [row('A', { actual: 10 }), row('B', { actual: 50 }), row('C', { actual: 30 })];
    expect(order(rows, 'actual', 'desc')).toEqual(['B', 'C', 'A']);
    expect(order(rows, 'actual', 'asc')).toEqual(['A', 'C', 'B']);
  });

  it('sorts Available by signed value, not magnitude', () => {
    const rows = [row('Over', { available: -500 }), row('Under', { available: 100 })];
    // Descending Available = most ahead of plan first.
    expect(order(rows, 'available', 'desc')).toEqual(['Under', 'Over']);
  });

  it('sorts "absoluteGap" by |Available| so the biggest gap leads either way', () => {
    const rows = [
      row('Small', { available: 20 }),
      row('BigOver', { available: -500 }),
      row('BigUnder', { available: 300 }),
    ];
    expect(order(rows, 'absoluteGap', 'desc')).toEqual(['BigOver', 'BigUnder', 'Small']);
  });

  it('sinks null rollover to the bottom in BOTH directions', () => {
    const rows = [
      row('NoCarry'),
      row('Deficit', { rollover: -40 }),
      row('Surplus', { rollover: 90 }),
    ];
    expect(order(rows, 'rollover', 'desc')).toEqual(['Surplus', 'Deficit', 'NoCarry']);
    expect(order(rows, 'rollover', 'asc')).toEqual(['Deficit', 'Surplus', 'NoCarry']);
  });

  it('sorts by name and honors direction', () => {
    const rows = [row('Zoo'), row('Apples'), row('Mango')];
    expect(order(rows, 'name', 'asc')).toEqual(['Apples', 'Mango', 'Zoo']);
    expect(order(rows, 'name', 'desc')).toEqual(['Zoo', 'Mango', 'Apples']);
  });

  it('breaks ties on name ascending regardless of direction', () => {
    const rows = [row('Beta', { actual: 5 }), row('Alpha', { actual: 5 })];
    expect(order(rows, 'actual', 'desc')).toEqual(['Alpha', 'Beta']);
    expect(order(rows, 'actual', 'asc')).toEqual(['Alpha', 'Beta']);
  });
});

describe('bva sort (de)serialization', () => {
  it('falls back to the default field on garbage', () => {
    expect(parseBvaSortField(null)).toBe('absoluteGap');
    expect(parseBvaSortField('nonsense')).toBe('absoluteGap');
    expect(parseBvaSortField('rollover')).toBe('rollover');
  });

  it('omits the default field from the URL', () => {
    expect(serializeBvaSortField('absoluteGap')).toBeNull();
    expect(serializeBvaSortField('budgeted')).toBe('budgeted');
  });

  it('treats anything but "asc" as descending', () => {
    expect(parseBvaSortDirection(null)).toBe('desc');
    expect(parseBvaSortDirection('nope')).toBe('desc');
    expect(parseBvaSortDirection('asc')).toBe('asc');
    expect(serializeBvaSortDirection('desc')).toBeNull();
    expect(serializeBvaSortDirection('asc')).toBe('asc');
  });
});
