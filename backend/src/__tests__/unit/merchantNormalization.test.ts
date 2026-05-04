/**
 * Tests for merchant key normalization (auto-cat suggestion clustering).
 */

import {
  normalizeMerchantKey,
  normalizeRulePattern,
} from '../../shared/utils/merchantNormalization';

describe('normalizeMerchantKey', () => {
  it('prefers merchantName over name when available', () => {
    expect(
      normalizeMerchantKey({
        merchantName: 'Lola Pizza',
        name: 'SQ *LOLA PIZZA BROOKLYN NY',
      }),
    ).toBe('lola pizza');
  });

  it('lowercases merchantName', () => {
    expect(normalizeMerchantKey({ merchantName: 'Starbucks' })).toBe('starbucks');
  });

  it('strips leading SQ * prefix from name when merchantName is missing', () => {
    expect(
      normalizeMerchantKey({ merchantName: null, name: 'SQ *LOLA PIZZA' }),
    ).toBe('lola pizza');
  });

  it('strips leading TST* prefix and trailing store-number from name', () => {
    expect(
      normalizeMerchantKey({ merchantName: null, name: 'TST* JOES BAR 4421' }),
    ).toBe('joes bar');
  });

  it('strips trailing #1234 store hash and trailing CITY STATE pattern', () => {
    expect(
      normalizeMerchantKey({
        merchantName: null,
        name: 'STARBUCKS #1234 BROOKLYN NY',
      }),
    ).toBe('starbucks');
  });

  it('strips trailing asterisk-bound code but preserves a lone trailing 2-char acronym', () => {
    expect(
      normalizeMerchantKey({ merchantName: null, name: 'AMZN Mktp US*RT4ABC' }),
    ).toBe('amzn mktp us');
  });

  it('returns null when merchantName is empty AND name is purely numeric', () => {
    expect(normalizeMerchantKey({ merchantName: null, name: '1234' })).toBeNull();
  });

  it('returns null when the result is shorter than 4 characters', () => {
    expect(normalizeMerchantKey({ merchantName: 'AB' })).toBeNull();
    expect(normalizeMerchantKey({ merchantName: null, name: 'AB' })).toBeNull();
  });

  it('returns null when both merchantName and name are empty', () => {
    expect(normalizeMerchantKey({ merchantName: '', name: '' })).toBeNull();
    expect(normalizeMerchantKey({ merchantName: null, name: null })).toBeNull();
    expect(normalizeMerchantKey({ merchantName: undefined })).toBeNull();
  });

  it('collapses internal whitespace', () => {
    expect(normalizeMerchantKey({ merchantName: '  Lola    Pizza  ' })).toBe(
      'lola pizza',
    );
  });

  it('strips multiple processor prefix variants', () => {
    expect(
      normalizeMerchantKey({ merchantName: null, name: 'PAYPAL *NETFLIX' }),
    ).toBe('netflix');
    expect(
      normalizeMerchantKey({ merchantName: null, name: 'PP*ETSY ORDER' }),
    ).toBe('etsy order');
  });

  it('does not strip trailing CAPS when there is no preceding CAPS city token', () => {
    // "JOES BAR" — last token "BAR" is 3-char CAPS but has no preceding CAPS-3+
    // followed by 2-char CAPS, so the city/state pattern does not apply.
    expect(normalizeMerchantKey({ merchantName: null, name: 'JOES BAR' })).toBe(
      'joes bar',
    );
  });

  it('preserves merchant tokens like "PIZZA" that are not state codes', () => {
    expect(
      normalizeMerchantKey({ merchantName: null, name: 'LOLA PIZZA' }),
    ).toBe('lola pizza');
  });
});

describe('normalizeRulePattern', () => {
  it('lowercases and collapses whitespace without aggressive strips', () => {
    // Rule patterns are user-typed; do NOT apply processor / store strips here.
    expect(normalizeRulePattern('SQ *LOLA')).toBe('sq *lola');
    expect(normalizeRulePattern('  Lola    Pizza  ')).toBe('lola pizza');
  });
});
