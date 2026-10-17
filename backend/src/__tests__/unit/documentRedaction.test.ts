/**
 * Family Library redaction — BRD D-F04 / REQ-F010–F013
 *
 * Covers what is removed, what is deliberately KEPT (the kept identifiers are
 * the ones the library is for), and that markers are typed and counted.
 */

import { redactDocumentText } from '../../utils/documentRedaction';

describe('redactDocumentText removes financial identifiers with typed markers', () => {
  it('redacts a delimited SSN and keeps no digits of it', () => {
    const { text, counts } = redactDocumentText('Lessee SSN 123-45-6789 on file');
    expect(text).toBe('Lessee SSN [REDACTED:ssn] on file');
    expect(text).not.toContain('6789');
    expect(counts).toEqual({ ssn: 1 });
  });

  it('redacts an undelimited SSN only when labeled', () => {
    expect(redactDocumentText('Social Security Number: 123456789').text).toBe(
      'Social Security Number: [REDACTED:ssn]'
    );
    // A bare 9-digit number is a contract id as often as an SSN.
    expect(redactDocumentText('Contract 123456789').counts).toEqual({});
  });

  it('redacts a Luhn-valid card number, keeping the last 4', () => {
    const { text, counts } = redactDocumentText('Card: 4111 1111 1111 1111 exp 04/29');
    expect(text).toBe('Card: [REDACTED:card_number …1111] exp 04/29');
    expect(counts).toEqual({ card_number: 1 });
  });

  it('leaves a 16-digit number that fails Luhn alone', () => {
    expect(redactDocumentText('Order 1234567812345678').counts).toEqual({});
  });

  it('redacts a labeled routing number and a bank account on the same line', () => {
    const { text, counts } = redactDocumentText(
      'ACH from checking — Routing Number: 021000021, Account Number: 4429 8821 4821'
    );
    expect(text).toBe(
      'ACH from checking — Routing Number: [REDACTED:routing_number …0021], Account Number: [REDACTED:bank_account …4821]'
    );
    expect(counts).toEqual({ routing_number: 1, bank_account: 1 });
  });

  it('composes the credential pass under a typed marker', () => {
    const { text, counts } = redactDocumentText('portal password: hunter2');
    expect(text).toBe('portal password: [REDACTED:credential]');
    expect(counts).toEqual({ credential: 1 });
  });
});

describe('redactDocumentText keeps identifiers the library exists to answer', () => {
  it.each([
    ['a VIN', 'VIN 7PDSGABA8TN012345'],
    ['a customer account number with no bank context', 'Customer Account Number: 88231907'],
    ['a policy number', 'Policy No. PA-4410-2291-07'],
    ['a phone number', 'Call 800-555-0142 for service'],
    ['a dollar figure', 'Early termination fee: $12,450.00'],
    ['a page marker', '<!-- page 12 -->'],
  ])('keeps %s', (_label, input) => {
    const { text, counts } = redactDocumentText(input);
    expect(text).toBe(input);
    expect(counts).toEqual({});
  });

  it('is deterministic and does not re-redact its own markers', () => {
    const once = redactDocumentText('Bank account #: 4429882148 and SSN 123-45-6789');
    const twice = redactDocumentText(once.text);
    expect(twice.text).toBe(once.text);
    expect(twice.counts).toEqual({});
  });
});
