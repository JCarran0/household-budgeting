/**
 * Financial-identifier redaction for Family Library documents (BRD D-F04)
 *
 * `redaction.ts` removes CREDENTIALS by shape. A lease or warranty has a
 * different problem: it carries identifiers — SSNs, bank and card numbers —
 * that have no Q&A value and would otherwise be copied into model context and
 * trace logs on every turn that reads the document. This pass composes the
 * credential pass and adds those.
 *
 * Two rules that are the point of the module, not incidental to it:
 *
 *  1. Markers are TYPED: `[REDACTED:bank_account …4821]`, never `****`. The
 *     assistant must be able to say "the lease names the autopay account ending
 *     4821, withheld from the library — see p. 3" instead of claiming the doc is
 *     silent. And in this codebase bare asterisks already mean institution-side
 *     masking (descriptorPreservation.ts); a second meaning would be ambiguous.
 *
 *  2. No reversible mapping. The redacted value is not returned, logged, or
 *     stored anywhere. Drive is the faithful copy (REQ-F013).
 *
 * WHAT THIS CANNOT DO: a bank account number with no label near it has no
 * shape. "Account Number: 88231907" on a solar bill is the lessor's customer
 * number — useful, and kept — and is indistinguishable from a bank account
 * without context. Account numbers are therefore redacted only on lines that
 * talk about a bank. The skill's review step exists for the rest.
 */

import { redactSecretsInText } from './redaction';
import type { LibraryRedactionType } from '../validators/libraryValidators';

export type RedactionCounts = Partial<Record<LibraryRedactionType, number>>;

export interface DocumentRedactionResult {
  text: string;
  counts: RedactionCounts;
}

function marker(type: LibraryRedactionType, digits?: string): string {
  // SSN last-4 is itself an identity-verification secret, so it keeps none.
  if (!digits || type === 'ssn') return `[REDACTED:${type}]`;
  return `[REDACTED:${type} …${digits.slice(-4)}]`;
}

function digitsOf(s: string): string {
  return s.replace(/\D/g, '');
}

/** Luhn check — keeps a 16-digit order or serial number from reading as a card. */
function isLuhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

const SSN_DELIMITED = /\b(\d{3})([- ])(\d{2})\2(\d{4})\b/g;
const SSN_LABELED = /\b(SSN|SS#|Social Security(?:\s+(?:Number|No\.?|#))?)(\s*[:#]?\s*)(\d{9})\b/gi;
const CARD = /\b\d(?:[ -]?\d){12,18}\b/g;
const ROUTING_LABELED =
  // The optional parenthetical catches payment-instruction labels such as
  // "Routing # (Domestic Wires):" and "Routing # (ACH/EFT):".
  /\b(routing|ABA|RTN|transit)((?:\s+(?:number|no\.?|#))?(?:\s*\([^)\n]{1,40}\))?)(\s*[:#]?\s*)(\d{9})\b/gi;
const BANK_CONTEXT = /\b(bank|checking|savings|routing|ABA|ACH|direct debit|auto-?pay|EFT)\b/i;
const ACCOUNT_LABELED =
  /\b((?:bank\s+|checking\s+|savings\s+|deposit\s+)?account\s*(?:number|no\.?|#))(\s*[:#]?\s*)(\d(?:[ -]?\d){3,16})\b/gi;

/**
 * Redact credentials and financial identifiers from extracted document text.
 * Deterministic: the same input always yields the same text and counts.
 */
export function redactDocumentText(input: string): DocumentRedactionResult {
  const counts: RedactionCounts = {};
  const bump = (type: LibraryRedactionType): void => {
    counts[type] = (counts[type] ?? 0) + 1;
  };

  // Credentials first, re-labelled to the typed form the library uses.
  let text = redactSecretsInText(input).replace(/\[redacted\]/g, () => {
    bump('credential');
    return marker('credential');
  });

  text = text.replace(SSN_DELIMITED, () => {
    bump('ssn');
    return marker('ssn');
  });
  text = text.replace(SSN_LABELED, (_m, label: string, sep: string) => {
    bump('ssn');
    return `${label}${sep}${marker('ssn')}`;
  });

  text = text.replace(CARD, m => {
    const digits = digitsOf(m);
    if (digits.length < 13 || digits.length > 19 || !isLuhnValid(digits) || /^(\d)\1+$/.test(digits)) {
      return m;
    }
    bump('card_number');
    return marker('card_number', digits);
  });

  text = text.replace(ROUTING_LABELED, (_m, label: string, suffix: string | undefined, sep: string, num: string) => {
    bump('routing_number');
    return `${label}${suffix ?? ''}${sep}${marker('routing_number', num)}`;
  });

  // Account numbers only where the line is about a bank — see header.
  text = text
    .split('\n')
    .map(line => {
      if (!BANK_CONTEXT.test(line)) return line;
      return line.replace(ACCOUNT_LABELED, (_m, label: string, sep: string, num: string) => {
        bump('bank_account');
        return `${label}${sep}${marker('bank_account', digitsOf(num))}`;
      });
    })
    .join('\n');

  return { text, counts };
}
