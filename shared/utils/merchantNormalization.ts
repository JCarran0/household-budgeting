/**
 * Merchant key normalization for auto-categorization rule suggestions.
 *
 * Two related but distinct normalizations:
 *   - normalizeMerchantKey: aggressive strip of payment-processor prefixes,
 *     store numbers, and trailing city/state tokens — applied to a transaction's
 *     merchantName / name to derive a stable cluster key.
 *   - normalizeRulePattern: gentle lowercase + collapse-whitespace only —
 *     applied to user-typed `patterns` on an auto-cat rule for collision
 *     detection. Rule patterns are not raw merchant strings, so the heavier
 *     strips would corrupt them.
 *
 * Pure functions, no React or DB dependencies.
 */

/** Leading payment-processor prefixes we strip from `name` (case-insensitive). */
export const PROCESSOR_PREFIX_REGEX =
  /^(?:sq\s*\*|tst\s*\*|tst\s+|paypal\s*\*|sp\s*\*|pp\s*\*|cke\s*\*)/i;

/** `#1234` style store numbers (anywhere in the string). */
export const STORE_HASH_REGEX = /#\d+/g;

/**
 * Whitespace-prefixed numeric run of length ≥3. Strips embedded "STORE 1234
 * LOCATION" style sequences and trailing store numbers alike.
 */
export const STORE_NUMBER_REGEX = /\s+\d{3,}/g;

/**
 * Trailing asterisk-bound code, e.g. Amazon's "*RT4ABC" suffix on
 * "AMZN Mktp US*RT4ABC". Pure CAPS+digits after the star.
 */
export const TRAILING_STAR_CODE_REGEX = /\*[A-Z0-9]+$/;

/**
 * Trailing "<CITY> <STATE>" pattern: a 3+ char CAPS word followed by a 2-char
 * CAPS state code at end of string. Matched (and stripped) only when this
 * full pattern holds — a lone 2-char trailing CAPS like "US" in "AMZN Mktp US"
 * is intentionally preserved, since without a preceding CAPS city it is more
 * likely part of the merchant name than a location suffix.
 */
export const TRAILING_CITY_STATE_REGEX = /\s+[A-Z]{3,}\s+[A-Z]{2}\s*$/;

const MIN_KEY_LENGTH = 4;
const PURELY_NUMERIC_REGEX = /^\d+$/;

interface NormalizableTransaction {
  merchantName: string | null | undefined;
  name?: string | null | undefined;
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function isValidKey(key: string): boolean {
  if (key.length < MIN_KEY_LENGTH) return false;
  if (PURELY_NUMERIC_REGEX.test(key)) return false;
  return true;
}

/**
 * Derive a normalized merchant key from a transaction's merchant/name fields.
 *
 * Returns null when the resulting key is too generic to base a rule on
 * (< 4 chars, purely numeric) or when both source fields are empty.
 *
 * Algorithm:
 *   1. If `merchantName` is non-empty: lowercase + collapse whitespace.
 *   2. Else fall back to `name` and apply (in order, before lowercasing):
 *      - Leading processor prefixes (SQ*, TST*, PAYPAL*, SP*, PP*, CKE*)
 *      - Trailing asterisk-bound code (e.g. "*RT4ABC")
 *      - Trailing "<CITY> <STATE>" pattern (3+CAPS + 2CAPS at end)
 *      - `#\d+` store hashes (anywhere)
 *      - ` \d{3,}` store numbers (anywhere)
 *      Then lowercase + collapse whitespace.
 *   3. Reject if the resulting string is < 4 chars or purely numeric.
 */
export function normalizeMerchantKey(
  tx: NormalizableTransaction,
): string | null {
  const merchant = (tx.merchantName ?? '').trim();
  if (merchant.length > 0) {
    const key = collapseWhitespace(merchant.toLowerCase());
    return isValidKey(key) ? key : null;
  }

  const raw = (tx.name ?? '').trim();
  if (raw.length === 0) return null;

  let stripped = raw;
  stripped = stripped.replace(PROCESSOR_PREFIX_REGEX, '');
  stripped = stripped.replace(TRAILING_STAR_CODE_REGEX, '');
  stripped = stripped.replace(TRAILING_CITY_STATE_REGEX, '');
  stripped = stripped.replace(STORE_HASH_REGEX, '');
  stripped = stripped.replace(STORE_NUMBER_REGEX, '');
  stripped = collapseWhitespace(stripped).toLowerCase();

  return isValidKey(stripped) ? stripped : null;
}

/**
 * Lighter normalization for user-typed auto-cat rule patterns. Used for
 * case-insensitive collision detection against suggestion keys; never as a
 * cluster key derivation.
 */
export function normalizeRulePattern(pattern: string): string {
  return collapseWhitespace(pattern.toLowerCase());
}
