/**
 * Descriptor preservation for Plaid sync.
 *
 * Some institutions mask card descriptors before handing them to Plaid. Capital
 * One does this today: it keeps the descriptor up to the first space and
 * replaces the alphanumerics after it with `*`, leaving punctuation in place, so
 * `AMAZON MKTPL*<order ref>` arrives as `AMAZON ***************` and the
 * space-free `Amazon.com*<order ref>` form collapses to `******.*************`
 * with no merchant enrichment behind it.
 *
 * The masking is applied at read time to the *whole history*, not just to new
 * activity: Plaid returns masked text today for transactions it delivered clean
 * months ago. `updateTransaction` used to assign `plaidTxn.name` over
 * `existing.name` whenever the two differed, so a relink, a reconcile, or Plaid
 * pushing those rows through `/transactions/sync` as `modified` would have
 * replaced good descriptors with asterisks permanently — the original text is
 * not stored anywhere else.
 *
 * These predicates make the stored descriptor monotonic in information: a
 * replacement that says strictly less than what we already hold is refused.
 *
 * See issue #19.
 */

/**
 * A run of three or more asterisks. This is the signal that separates *masking*
 * from Plaid's ordinary enrichment, which also shortens names but does it by
 * cleaning them (`SQ *COFFEE SHOP 1234` → `Coffee Shop`) rather than by blanking
 * characters out. Without this check the guard would freeze bad descriptors in
 * place and block legitimate improvements.
 *
 * A single `*` is deliberately not enough: it is ordinary in card descriptors
 * (`Fine*Woodworking`, `UEP*ICHIDDO RAMEN`).
 */
const MASK_RUN = /\*{3,}/;

/** How much identifying content a descriptor carries. */
function informationScore(text: string): number {
  return (text.match(/[a-z0-9]/gi) ?? []).length;
}

/**
 * Would replacing `existing` with `incoming` lose information?
 *
 * True only when the incoming descriptor shows a mask run *and* carries strictly
 * fewer alphanumeric characters than the one already stored. Both conditions
 * matter: the mask run identifies this as blanking rather than cleaning, and the
 * character count is what establishes the replacement actually says less.
 *
 * An equal count passes. `Market Basket` → `MARKET BASKET ********` is the real
 * case: uglier, but the merchant is still named and nothing identifying is lost,
 * so it is not this guard's business to block it.
 */
export function isDescriptorDegradation(
  existing: string | null | undefined,
  incoming: string | null | undefined,
): boolean {
  const before = existing ?? '';
  const after = incoming ?? '';
  if (!before.trim()) return false;
  if (!MASK_RUN.test(after)) return false;
  return informationScore(after) < informationScore(before);
}

/**
 * Would replacing `existing` with `incoming` erase a merchant we already have?
 *
 * When a descriptor is fully masked, Plaid's enrichment has nothing to work from
 * and returns `merchant_name: null`. The old code assigned that null straight
 * over a previously-resolved merchant, so a row that once read "Amazon" lost it.
 * Going from a known merchant to no merchant is never an improvement.
 */
export function isMerchantNameErasure(
  existing: string | null | undefined,
  incoming: string | null | undefined,
): boolean {
  return Boolean((existing ?? '').trim()) && !(incoming ?? '').trim();
}
