import { elideSharedPrefix } from '../../scripts/reconcile-plaid-account-change';

/**
 * The sample re-key table is the operator's only visual confirmation before an
 * irreversible re-key of financial history. On 2026-09-07 it was useless: ids
 * were truncated to 10 characters while Plaid's ids for the Item shared a
 * 17-character prefix, so every row rendered identically and unrelated
 * transactions appeared to chain together.
 */
describe('elideSharedPrefix — reconciler id display', () => {
  // Shape taken from the 2026-09-07 Bank of America data.
  const SHARED = 'aBcDeFgHiJkLmNoPq'; // 17 chars
  const ids = [`${SHARED}11111`, `${SHARED}22222`, `${SHARED}33333`];

  it('renders ids that share a long prefix distinguishably', () => {
    const short = elideSharedPrefix(ids);
    const rendered = ids.map(short);
    expect(new Set(rendered).size).toBe(ids.length);
  });

  it('reproduces the bug it fixes: a fixed 10-char slice does not', () => {
    const naive = ids.map(id => id.slice(0, 10));
    expect(new Set(naive).size).toBe(1);
  });

  it('always leaves at least 4 distinguishing characters', () => {
    // Ids differing only in the final character — the worst case.
    const tight = ['prefix-shared-aaaa1', 'prefix-shared-aaaa2'];
    const rendered = tight.map(elideSharedPrefix(tight));
    rendered.forEach(r => expect(r.replace(/^…/, '').length).toBeGreaterThanOrEqual(4));
    expect(new Set(rendered).size).toBe(2);
  });

  it('leaves ids alone when they share no meaningful prefix', () => {
    const distinct = ['alpha-transaction', 'bravo-transaction'];
    expect(distinct.map(elideSharedPrefix(distinct))).toEqual(distinct);
  });

  it('leaves a single id untouched — nothing to compare it against', () => {
    expect([ids[0]].map(elideSharedPrefix([ids[0]]))).toEqual([ids[0]]);
  });

  it('ignores empty ids rather than collapsing the shared prefix to nothing', () => {
    const withEmpty = [`${SHARED}11111`, '', `${SHARED}22222`];
    const rendered = withEmpty.filter(Boolean).map(elideSharedPrefix(withEmpty));
    expect(new Set(rendered).size).toBe(2);
    rendered.forEach(r => expect(r.startsWith('…')).toBe(true));
  });
});
