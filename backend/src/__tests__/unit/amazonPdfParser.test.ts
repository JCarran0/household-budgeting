/**
 * Unit tests for the pure helpers in `amazonPdfParser`.
 *
 * `parseFile` is exercised via integration (it calls Claude); here we cover
 * the defensive passes Claude's output flows through: per-row salvage, card
 * sanitization (SEC-006), and the cross-reference date override.
 */

import {
  salvagePartialOutput,
  sanitizeCharges,
  crossReference,
} from '../../services/amazon/amazonPdfParser';
import type {
  ParsedAmazonOrder,
  ParsedAmazonCharge,
} from '../../shared/types';

describe('salvagePartialOutput', () => {
  it('returns null when pdfType is missing or unknown', () => {
    expect(salvagePartialOutput({})).toBeNull();
    expect(salvagePartialOutput({ pdfType: 'receipts' })).toBeNull();
  });

  it('keeps valid orders and drops invalid ones', () => {
    const raw = {
      pdfType: 'orders',
      orders: [
        // valid
        {
          orderNumber: '111-1234567-1234567',
          orderDate: '2026-04-10',
          totalAmount: 42.5,
          items: [{ name: 'Widget', estimatedPrice: 42.5, quantity: 1 }],
        },
        // invalid: order number contains a space
        {
          orderNumber: 'bad order number',
          orderDate: '2026-04-10',
          totalAmount: 10,
          items: [],
        },
        // invalid: missing totalAmount
        {
          orderNumber: '222-7654321-7654321',
          orderDate: '2026-04-10',
          items: [],
        },
      ],
    };
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = salvagePartialOutput(raw);
    warnSpy.mockRestore();
    expect(result).not.toBeNull();
    expect(result!.pdfType).toBe('orders');
    expect(result!.orders).toHaveLength(1);
    expect(result!.orders![0].orderNumber).toBe('111-1234567-1234567');
  });

  it('returns null when orders array has zero salvageable rows', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = salvagePartialOutput({
      pdfType: 'orders',
      orders: [{ orderNumber: 'no spaces please', orderDate: 'bad', totalAmount: -1, items: [] }],
    });
    warnSpy.mockRestore();
    expect(result).toBeNull();
  });

  it('salvages valid charges and drops the invalid ones', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = salvagePartialOutput({
      pdfType: 'transactions',
      charges: [
        {
          orderNumber: '111-1234567-1234567',
          chargeDate: '2026-04-11',
          amount: 42.5,
          cardLastFour: '1234',
          merchantLabel: 'AMAZON.COM',
        },
        // invalid: cardLastFour has 3 digits
        {
          orderNumber: '222-7654321-7654321',
          chargeDate: '2026-04-11',
          amount: 10,
          cardLastFour: '12',
          merchantLabel: 'AMAZON.COM',
        },
      ],
    });
    warnSpy.mockRestore();
    expect(result).not.toBeNull();
    expect(result!.charges).toHaveLength(1);
  });
});

describe('sanitizeCharges (SEC-006)', () => {
  function baseCharge(overrides: Partial<ParsedAmazonCharge> = {}): ParsedAmazonCharge {
    return {
      orderNumber: '111-1234567-1234567',
      chargeDate: '2026-04-11',
      amount: 10,
      cardLastFour: '1234',
      merchantLabel: 'AMAZON.COM',
      ...overrides,
    };
  }

  it('passes through already-compliant last-4 values', () => {
    const [charge] = sanitizeCharges([baseCharge({ cardLastFour: '4242' })]);
    expect(charge.cardLastFour).toBe('4242');
  });

  it('extracts the last 4 digits when Claude returned a full number', () => {
    const [charge] = sanitizeCharges([baseCharge({ cardLastFour: '4111111111111234' })]);
    expect(charge.cardLastFour).toBe('1234');
  });

  it('strips non-digit characters from the tail (slice then strip)', () => {
    // Order matters: the impl slices the last 4 chars first, then strips
    // non-digits. For "12345678abcd" → last 4 is "abcd" → digits "".
    const [charge] = sanitizeCharges([baseCharge({ cardLastFour: '12345678abcd' })]);
    expect(charge.cardLastFour).toBe('');
    // When the tail has digits mixed with separators, only those digits survive.
    const [charge2] = sanitizeCharges([baseCharge({ cardLastFour: 'x-5-6-7-8' })]);
    expect(charge2.cardLastFour).toBe('78');
  });
});

describe('crossReference', () => {
  function makeOrder(n: string, date: string): ParsedAmazonOrder {
    return {
      orderNumber: n,
      orderDate: date,
      totalAmount: 10,
      items: [{ name: 'X', estimatedPrice: 10, quantity: 1 }],
    };
  }
  function makeCharge(n: string, date: string): ParsedAmazonCharge {
    return {
      orderNumber: n,
      chargeDate: date,
      amount: 10,
      cardLastFour: '1234',
      merchantLabel: 'AMAZON.COM',
    };
  }

  it('overwrites orderDate with chargeDate when an order+charge pair exists', () => {
    const orders = [makeOrder('A', '2026-04-10'), makeOrder('B', '2026-04-12')];
    const charges = [makeCharge('A', '2026-04-11')];

    crossReference(orders, charges);

    expect(orders[0].orderDate).toBe('2026-04-11');
    expect(orders[1].orderDate).toBe('2026-04-12'); // untouched
  });

  it('is a no-op when there are no overlapping order numbers', () => {
    const orders = [makeOrder('A', '2026-04-10')];
    const charges = [makeCharge('Z', '2026-04-11')];
    crossReference(orders, charges);
    expect(orders[0].orderDate).toBe('2026-04-10');
  });
});
