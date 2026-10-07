/**
 * Unit tests for descriptor preservation (issue #19).
 *
 * The fixtures are synthetic, but their shapes are taken from the real
 * regression: the left value is the kind of descriptor Plaid delivered when a
 * transaction was first ingested, the right is what the same transaction_id
 * returns once the institution began masking. Losing the left column would be
 * unrecoverable, so the guard is pinned rather than left to inspection.
 *
 * Character counts matter here — the masking is length-preserving — so keep any
 * added fixture internally consistent rather than approximating it.
 */

import {
  isDescriptorDegradation,
  isMerchantNameErasure,
} from '../../services/descriptorPreservation';

describe('isDescriptorDegradation', () => {
  // Each of these would have overwritten good history.
  const REGRESSIONS: Array<[string, string]> = [
    // No space in the descriptor, so masking leaves nothing at all.
    ['Example.com*AB1CD2EF3', '***********.********'],
    // Merchant token survives; the order reference does not.
    ['EXAMPLE MKTPL*1A2BC3D45', 'EXAMPLE ***************'],
    ['Nintendo CC0000000000', 'Nintendo ************'],
    ['Kindle Svcs*1A23B4C56', 'Kindle **************'],
    ['ACME UNIVERSE-5', 'ACME ********-*'],
  ];

  it.each(REGRESSIONS)('refuses %s -> %s', (before, after) => {
    expect(isDescriptorDegradation(before, after)).toBe(true);
  });

  // Plaid's enrichment also shortens names, but by cleaning rather than
  // blanking. Blocking that would freeze bad descriptors in place forever.
  it('allows a genuine cleanup that shortens the descriptor', () => {
    expect(isDescriptorDegradation('SQ *COFFEE SHOP 1234', 'Coffee Shop')).toBe(false);
    expect(isDescriptorDegradation('EXAMPLE MKTPL*1A2BC3D45', 'Example')).toBe(false);
  });

  it('allows an ordinary correction with no mask run', () => {
    expect(isDescriptorDegradation('WALMRT', 'Walmart')).toBe(false);
  });

  // A single asterisk is ordinary in card descriptors, so it must not by itself
  // mark a value as masked.
  it('does not treat a lone asterisk as masking', () => {
    expect(isDescriptorDegradation('Fine*Woodworking', 'UEP*ICHIDDO RAMEN')).toBe(false);
  });

  // Equal information: uglier, but the merchant is still named. Not this
  // guard's business.
  it('allows a masked variant that loses no alphanumeric content', () => {
    expect(isDescriptorDegradation('Some Grocer', 'SOME GROCER ********')).toBe(false);
  });

  it('allows the first write when nothing is stored yet', () => {
    expect(isDescriptorDegradation('', '***********.********')).toBe(false);
    expect(isDescriptorDegradation(null, '***********.********')).toBe(false);
    expect(isDescriptorDegradation(undefined, 'EXAMPLE ***************')).toBe(false);
  });

  // The guard must not latch: once a masked value is all we have, a later
  // unmasked one has to be able to replace it.
  it('allows recovery when the institution starts sending real text again', () => {
    expect(isDescriptorDegradation('***********.********', 'Example.com*AB1CD2EF3')).toBe(false);
    expect(
      isDescriptorDegradation('EXAMPLE ***************', 'EXAMPLE MKTPL*1A2BC3D45'),
    ).toBe(false);
  });
});

describe('isMerchantNameErasure', () => {
  it('refuses to drop a resolved merchant', () => {
    expect(isMerchantNameErasure('Example Merchant', null)).toBe(true);
    expect(isMerchantNameErasure('Example Merchant', '')).toBe(true);
    expect(isMerchantNameErasure('Example Merchant', '   ')).toBe(true);
  });

  it('allows a merchant correction', () => {
    expect(isMerchantNameErasure('Example Merchant', 'Example Merchant Digital')).toBe(false);
  });

  it('allows the first resolution, and a null-to-null no-op', () => {
    expect(isMerchantNameErasure(null, 'Example Merchant')).toBe(false);
    expect(isMerchantNameErasure(null, null)).toBe(false);
  });
});
