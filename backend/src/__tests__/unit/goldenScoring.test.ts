/**
 * Golden-set scoring — the deterministic half of REQ-F041 enforcement.
 * A false pass here means a rounded figure ships as "verified".
 */

import { citesPage, figuresIn, missingFigures } from '../../utils/goldenScoring';

describe('figuresIn', () => {
  it('extracts figures as printed, without a trailing sentence comma', () => {
    expect(figuresIn('$276.33 in year 2, then 16,244 kWh, 2.99%, account 21000677969.'))
      .toEqual(['$276.33', '2', '16,244', '2.99%', '21000677969']);
  });
});

describe('missingFigures', () => {
  it('accepts a figure quoted verbatim, with or without the dollar sign', () => {
    expect(missingFigures('$276.33', 'The year-2 payment is $276.33 (p. 5).')).toEqual([]);
    expect(missingFigures('$276.33', 'Year 2: 276.33 per month.')).toEqual([]);
  });

  it('rejects a rounded or re-formatted figure', () => {
    expect(missingFigures('$276.33', 'About $276 a month.')).toEqual(['$276.33']);
    expect(missingFigures('16,244 kWh', 'Roughly 16244 kWh.')).toEqual(['16,244']);
    expect(missingFigures('2.99%', 'It rises 3% a year.')).toEqual(['2.99%']);
  });

  it('treats parenthesised figures in the answer key as context, not required', () => {
    expect(missingFigures("$276.33 (CAP package, superseding the lease's $289.15).", 'Year 2 is $276.33.')).toEqual([]);
  });

  it('does not find a figure inside a longer number', () => {
    expect(missingFigures('60 days', 'within 600 days')).toEqual(['60']);
    expect(missingFigures('$50', 'a $500 deductible')).toEqual(['$50']);
  });
});

describe('citesPage', () => {
  it('matches single pages and ranges in common citation forms', () => {
    expect(citesPage('Source: Sunrun CAP, p. 5', 5)).toBe(true);
    expect(citesPage('(page 12)', 12)).toBe(true);
    expect(citesPage('pp. 4-6', 5)).toBe(true);
    expect(citesPage('pages 24–30', 30)).toBe(true);
    expect(citesPage('p. 7', 30)).toBe(false);
  });
});
