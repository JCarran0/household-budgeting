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

  it('redacts a routing number whose label carries a parenthetical, as payment instructions print them', () => {
    const { text, counts } = redactDocumentText('Routing # (Domestic Wires): 026009593\nRouting # (ACH/EFT): 072000805');
    expect(text).toBe(
      'Routing # (Domestic Wires): [REDACTED:routing_number …9593]\nRouting # (ACH/EFT): [REDACTED:routing_number …0805]'
    );
    expect(counts).toEqual({ routing_number: 2 });
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

describe('redactDocumentText removes loan numbers and dates of birth by label', () => {
  it('redacts a labeled mortgage loan number, keeping the last 4', () => {
    const { text, counts } = redactDocumentText('KEY BANK N.A. ISAOA\nLOAN NUMBER: 6025201234');
    expect(text).toBe('KEY BANK N.A. ISAOA\nLOAN NUMBER: [REDACTED:loan_number …1234]');
    expect(counts).toEqual({ loan_number: 1 });
  });

  it('leaves an empty loan field and the words after a loan number alone', () => {
    expect(redactDocumentText('TESLA LEASE TRUST<br>LOAN # |').counts).toEqual({});
    expect(redactDocumentText('Loan # 88412 for the vehicle').text).toBe('Loan # [REDACTED:loan_number …8412] for the vehicle');
  });

  it('redacts a labeled date of birth and keeps none of it', () => {
    const { text, counts } = redactDocumentText('Driver DOB: 03/11/1983, licensed 2001');
    expect(text).toBe('Driver DOB: [REDACTED:date_of_birth], licensed 2001');
    expect(redactDocumentText('Date of Birth March 11, 1983').text).toBe('Date of Birth [REDACTED:date_of_birth]');
    expect(counts).toEqual({ date_of_birth: 1 });
  });

  it('redacts dates in a table column headed "Date of Birth" and nowhere else', () => {
    const table = [
      '| Drivers | Date of Birth | Licensed Since |',
      '|---|---|---|',
      '| 1. ALEX | 03-11-1983 | 09-07-2001 |',
      '| 2. SAM | 03-15-1986 | 09-07-2004 |',
      '',
      '| Policy Period | 09-07-2026 |',
    ].join('\n');
    const { text, counts } = redactDocumentText(table);
    expect(text).toContain('| 1. ALEX | [REDACTED:date_of_birth] | 09-07-2001 |');
    expect(text).toContain('| 2. SAM | [REDACTED:date_of_birth] | 09-07-2004 |');
    expect(text).toContain('| Policy Period | 09-07-2026 |');
    expect(counts).toEqual({ date_of_birth: 2 });
  });

  it('keeps an unlabeled date, which is a deadline far more often than a birthday', () => {
    expect(redactDocumentText('Policy period FROM: 03-29-26 To: 03-29-27').counts).toEqual({});
  });
});
