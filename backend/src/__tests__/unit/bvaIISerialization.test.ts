import {
  parseTypes,
  serializeTypes,
  parseVariance,
  serializeVariance,
  parseDismissedIds,
  serializeDismissedIds,
  typesEqualAll,
} from '../../shared/utils/bvaIISerialization';

describe('parseTypes / serializeTypes — BvA II url type filter', () => {
  test('null / empty → all three selected (default)', () => {
    expect(parseTypes(null)).toEqual(new Set(['spending', 'income', 'savings']));
    expect(parseTypes('')).toEqual(new Set(['spending', 'income', 'savings']));
  });

  test('none sentinel → empty set (REQ-017 empty state persists across reload)', () => {
    expect(parseTypes('none')).toEqual(new Set());
  });

  test('csv subset parses', () => {
    expect(parseTypes('spending,income')).toEqual(new Set(['spending', 'income']));
  });

  test('unknown tokens are silently dropped (REQ-047)', () => {
    expect(parseTypes('spending,banana,savings')).toEqual(new Set(['spending', 'savings']));
  });

  test('all-unknown tokens fall back to all-selected default', () => {
    expect(parseTypes('foo,bar')).toEqual(new Set(['spending', 'income', 'savings']));
  });

  test('serialize: all three selected → null (clean URL, omit param)', () => {
    expect(serializeTypes(new Set(['spending', 'income', 'savings']))).toBeNull();
  });

  test('serialize: empty set → "none" sentinel', () => {
    expect(serializeTypes(new Set())).toBe('none');
  });

  test('serialize: subset → canonical csv order', () => {
    expect(serializeTypes(new Set(['savings', 'spending']))).toBe('spending,savings');
  });

  test('typesEqualAll returns true only for all three', () => {
    expect(typesEqualAll(new Set(['spending', 'income', 'savings']))).toBe(true);
    expect(typesEqualAll(new Set(['spending', 'income']))).toBe(false);
    expect(typesEqualAll(new Set())).toBe(false);
  });
});

describe('parseVariance / serializeVariance — BvA II url variance filter', () => {
  test('null / unknown → all (default)', () => {
    expect(parseVariance(null)).toBe('all');
    expect(parseVariance('bogus')).toBe('all');
  });

  test('valid values round-trip', () => {
    expect(parseVariance('under')).toBe('under');
    expect(parseVariance('over')).toBe('over');
    expect(parseVariance('serious')).toBe('serious');
  });

  test('serialize: all → null; others → self', () => {
    expect(serializeVariance('all')).toBeNull();
    expect(serializeVariance('under')).toBe('under');
    expect(serializeVariance('over')).toBe('over');
    expect(serializeVariance('serious')).toBe('serious');
  });
});

describe('parseDismissedIds / serializeDismissedIds — BvA II dismissed localStorage', () => {
  test('null / empty returns empty set', () => {
    expect(parseDismissedIds(null)).toEqual(new Set());
    expect(parseDismissedIds('')).toEqual(new Set());
  });

  test('round-trips a real payload', () => {
    const ids = new Set(['FOOD_AND_DRINK', 'ENTERTAINMENT']);
    const raw = serializeDismissedIds(ids);
    expect(parseDismissedIds(raw)).toEqual(ids);
  });

  test('corrupt JSON falls back to empty set rather than throwing', () => {
    expect(parseDismissedIds('this is not JSON')).toEqual(new Set());
    expect(parseDismissedIds('{"not":"an array"}')).toEqual(new Set());
  });

  test('non-array JSON falls back to empty set', () => {
    expect(parseDismissedIds('42')).toEqual(new Set());
    expect(parseDismissedIds('null')).toEqual(new Set());
    expect(parseDismissedIds('"hello"')).toEqual(new Set());
  });

  test('non-string entries in the array are silently dropped', () => {
    expect(parseDismissedIds('["ok", 42, null, "also-ok"]')).toEqual(new Set(['ok', 'also-ok']));
  });

  test('serialize: empty set → "[]"', () => {
    expect(serializeDismissedIds(new Set())).toBe('[]');
  });
});
