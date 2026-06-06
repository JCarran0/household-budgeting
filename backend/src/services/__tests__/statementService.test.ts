/**
 * Statement Service Tests — Phase 5.4
 *
 * Money math is the highest-risk surface in this feature. Tests are organized
 * by risk level:
 *
 *   1. Rounding — pins the half-up behaviour for edge values
 *   2. Per-row golden fixture — verified anchor from the real payment-068 statement (D7)
 *   3. Synthetic fixture — hand-computable to prove totals end-to-end
 *   4. Zero-charge lines — REQ-016: all BILLABLE_SUBTYPES appear even at $0
 *   5. Exclusions — overhead / commission / remittance excluded (REQ-018)
 *   6. Immutability — re-tagging source transactions does NOT change a stored statement
 *   7. Payment numbering — auto-increment; first default = 68; override accepted
 *   8. Isolation — business statements invisible to another familyId
 *
 * The full 16-row payment-068 golden fixture is asserted from the authoritative
 * CSV export: payout sum 96665.49, royaltySubtotal 91832.22, remittanceTotal
 * 91813.22 (16 deposits, one billable charge of $19.00).
 */

import { StatementService, DEFAULT_FIRST_PAYMENT_NUMBER } from '../statementService';
import { InMemoryDataService } from '../dataService';
import { CategoryService } from '../categoryService';
import { roundHalfUp } from '../../shared/utils/businessStatementCalc';
import {
  BUSINESS_CATEGORY_SEED,
  STATEMENT_ROLES,
  BILLABLE_SUBTYPES,
} from '../../constants/categoryTemplates';
import type { Category } from '../../shared/types';

// ---------------------------------------------------------------------------
// Test fixtures and helpers
// ---------------------------------------------------------------------------

const BIZ_FAMILY = 'biz-fam-test';
const OTHER_FAMILY = 'other-fam-test';

const TODAY = '2026-01-31';
const PERIOD_MONTH = '2026-01';

/** Build a minimal stored-transaction-shaped object for test storage. */
function makeTxn(overrides: {
  id: string;
  categoryId: string | null;
  amount: number;
  date?: string;
  status?: string;
}) {
  return {
    id: overrides.id,
    categoryId: overrides.categoryId,
    amount: overrides.amount,
    date: overrides.date ?? `${PERIOD_MONTH}-15`,
    status: overrides.status ?? 'posted',
  };
}

/** Return a CategoryService stub that always serves the business seed. */
function makeCategoryService(_ds: InMemoryDataService): CategoryService {
  return {
    getAllCategories: async (_familyId: string): Promise<Category[]> =>
      BUSINESS_CATEGORY_SEED as unknown as Category[],
  } as unknown as CategoryService;
}

/** Seed transactions into an InMemoryDataService for a given familyId. */
async function seedTransactions(
  ds: InMemoryDataService,
  familyId: string,
  txns: ReturnType<typeof makeTxn>[],
): Promise<void> {
  await ds.saveData(`transactions_${familyId}`, txns);
}

// ---------------------------------------------------------------------------
// 1. Rounding — roundHalfUp
// ---------------------------------------------------------------------------

describe('roundHalfUp', () => {
  it('rounds down when sub-cent fraction < 0.5', () => {
    // 70220.83 × 0.05 = 3511.0415 → floor after +0.5 sentinel → 3511.04
    expect(roundHalfUp(70220.83 * 0.05)).toBe(3511.04);
  });

  it('rounds up when sub-cent fraction === 0.5 (half-up)', () => {
    // 0.50 × 0.05 = 0.025 → floor(0.025*100 + 0.5) / 100 = floor(3.0)/100 = 0.03
    expect(roundHalfUp(0.5 * 0.05)).toBe(0.03);
  });

  it('rounds up when sub-cent fraction > 0.5', () => {
    // e.g. 0.015 → floor(1.5 + 0.5)/100 = floor(2.0)/100 = 0.02
    expect(roundHalfUp(0.015)).toBe(0.02);
  });

  it('is exact for whole cent values', () => {
    expect(roundHalfUp(100.00)).toBe(100.00);
    expect(roundHalfUp(0.01)).toBe(0.01);
  });
});

// ---------------------------------------------------------------------------
// 2. Per-row golden fixture (D7) — verified from the real payment-068 statement
// ---------------------------------------------------------------------------

describe('per-row golden fixture (D7)', () => {
  it('computes commission=3511.04 and royalty=66709.79 for payout 70220.83 at 5%', () => {
    // Golden fixture from the real payment-068 statement (D7).
    // commission uses roundHalfUp so it is exact to the cent.
    // royalty = payout - commission is a simple subtraction; IEEE-754
    // arithmetic gives 66709.79000000001 which is < 1e-8 off from the
    // expected value, so we use toBeCloseTo with 6 decimal places.
    const commission = roundHalfUp(70220.83 * 0.05);
    const royalty = 70220.83 - commission;
    expect(commission).toBe(3511.04);
    expect(royalty).toBeCloseTo(66709.79, 6);
  });

  // Full 16-row payment-068 golden fixture, from the authoritative CSV export
  // (`Jun 5, 2026 - Sheet1.csv`). These are the exact Amazon Payout amounts.
  // The 16 displayed royalties sum to 91832.23, but the AUTHORITATIVE subtotal
  // is round(96665.49 × 0.95) = 91832.22 (BRD REQ-015 / D7) — the one-cent gap
  // is the reproduced legacy quirk. Remittance = 91832.22 - 19.00 = 91813.22.
  const PAYMENT_068_PAYOUTS = [
    70220.83, 326.02, 4180.21, 4.46, 129.21, 265.62, 6.04, 529.72,
    362.26, 107.65, 12795.64, 318.08, 2390.04, 7.0, 41.57, 4981.14,
  ];

  it('reproduces payment-068 exactly: subtotal 91832.22, remittance 91813.22', async () => {
    const ds = new InMemoryDataService();
    const service = new StatementService(ds, makeCategoryService(ds));

    const deposits = PAYMENT_068_PAYOUTS.map((payout, i) =>
      // Deposits are stored as credits (negative amount); payout = Math.abs.
      makeTxn({
        id: `kdp-${i}`,
        categoryId: STATEMENT_ROLES.trustInflow,
        amount: -payout,
        date: '2026-05-29',
      }),
    );
    const bookReport = makeTxn({
      id: 'book-report-068',
      categoryId: 'BIZ_BILLABLE_BOOK_REPORT',
      amount: 19.0,
      date: '2026-05-29',
    });
    await seedTransactions(ds, BIZ_FAMILY, [...deposits, bookReport]);

    const stmt = await service.generateStatement(BIZ_FAMILY, '2026-05', '2026-06-05');

    // 16 deposit rows
    expect(stmt.lineItems).toHaveLength(16);

    // Anchor row (D7): payout 70220.83 → commission 3511.04, royalty 66709.79
    const anchor = stmt.lineItems.find((li) => li.payout === 70220.83);
    expect(anchor?.commission).toBe(3511.04);
    expect(anchor?.royalty).toBeCloseTo(66709.79, 6);

    // The displayed per-row royalties sum to 91832.23 — the legacy quirk we
    // deliberately do NOT use for the subtotal.
    const sumDisplayedRoyalties = stmt.lineItems.reduce((s, li) => s + li.royalty, 0);
    expect(sumDisplayedRoyalties).toBeCloseTo(91832.23, 2);

    // AUTHORITATIVE subtotal: round(96665.49 × 0.95) = 91832.22
    expect(stmt.royaltySubtotal).toBe(91832.22);

    // Charges: Book Report 19.00, the other two subtypes present at $0
    const bookReportCharge = stmt.charges.find((c) => c.subType === 'BIZ_BILLABLE_BOOK_REPORT');
    expect(bookReportCharge?.amount).toBe(19.0);
    expect(stmt.charges).toHaveLength(BILLABLE_SUBTYPES.length);

    // Remittance = 91832.22 - 19.00 = 91813.22 (matches the client's statement)
    expect(stmt.remittanceTotal).toBe(91813.22);
  });
});

// ---------------------------------------------------------------------------
// 3. Synthetic fixture — hand-computable end-to-end totals
// ---------------------------------------------------------------------------

describe('StatementService — synthetic fixture (end-to-end)', () => {
  // Payouts: 100.00, 250.50, 19.99
  // Per-row display commissions (round-half-up @ 5%):
  //   100.00 × 0.05 = 5.00    → displayed commission 5.00,  displayed royalty 95.00
  //   250.50 × 0.05 = 12.525  → commission 12.53,           displayed royalty 237.97
  //   19.99  × 0.05 = 0.9995  → commission 1.00,            displayed royalty 18.99
  //   (Note: naive Σ of displayed royalties = 95.00+237.97+18.99 = 351.96)
  //
  // Authoritative royaltySubtotal (REQ-015 / D7 corrected rule):
  //   payoutSum = 100.00 + 250.50 + 19.99 = 370.49
  //   royaltySubtotal = roundHalfUp(370.49 × 0.95) = roundHalfUp(351.9655) = 351.97
  //   ← 1 cent HIGHER than the naive Σ; this is the expected/correct value.
  //
  // charges: BOOK_REPORT=19.00, BOOK_PURCHASE=0, BOOK_SHIPPING=0
  // remittanceTotal = 351.97 - 19.00 = 332.97

  let ds: InMemoryDataService;
  let service: StatementService;

  beforeEach(async () => {
    ds = new InMemoryDataService();
    service = new StatementService(ds, makeCategoryService(ds));

    await seedTransactions(ds, BIZ_FAMILY, [
      makeTxn({ id: 'trust-1', categoryId: STATEMENT_ROLES.trustInflow, amount: -100.00 }),
      makeTxn({ id: 'trust-2', categoryId: STATEMENT_ROLES.trustInflow, amount: -250.50 }),
      makeTxn({ id: 'trust-3', categoryId: STATEMENT_ROLES.trustInflow, amount: -19.99 }),
      makeTxn({ id: 'book-report-1', categoryId: 'BIZ_BILLABLE_BOOK_REPORT', amount: 19.00 }),
      // Exclusions — must NOT affect statement totals
      makeTxn({ id: 'overhead-1', categoryId: STATEMENT_ROLES.overhead, amount: 5.00 }),
      makeTxn({ id: 'commission-1', categoryId: STATEMENT_ROLES.commission, amount: -5.00 }),
      makeTxn({ id: 'remittance-1', categoryId: STATEMENT_ROLES.remittance, amount: 332.96 }),
    ]);
  });

  it('computes correct per-row commissions, royalties, and subtotals', async () => {
    const stmt = await service.generateStatement(BIZ_FAMILY, PERIOD_MONTH, TODAY);

    // Three trust-inflow rows
    expect(stmt.lineItems).toHaveLength(3);

    const row100 = stmt.lineItems.find((li) => li.payout === 100.00);
    expect(row100?.commission).toBe(5.00);
    expect(row100?.royalty).toBe(95.00);

    const row250 = stmt.lineItems.find((li) => li.payout === 250.50);
    expect(row250?.commission).toBe(12.53); // 250.50 × 0.05 = 12.525 → round-half-up → 12.53
    expect(row250?.royalty).toBe(237.97);

    const row19 = stmt.lineItems.find((li) => li.payout === 19.99);
    expect(row19?.commission).toBe(1.00); // 19.99 × 0.05 = 0.9995 → round-half-up → 1.00
    expect(row19?.royalty).toBe(18.99);
  });

  it('computes royaltySubtotal via full-precision aggregate (not sum of rounded rows)', async () => {
    const stmt = await service.generateStatement(BIZ_FAMILY, PERIOD_MONTH, TODAY);
    // royaltySubtotal = roundHalfUp(370.49 × 0.95) = roundHalfUp(351.9655) = 351.97
    // This is 1 cent HIGHER than the naive Σ(round(royalty_i)) = 351.96,
    // matching the legacy Google-Sheet behaviour (REQ-015 / D7).
    expect(stmt.royaltySubtotal).toBe(351.97);
  });

  it('produces remittanceTotal = royaltySubtotal - Σ charges', async () => {
    const stmt = await service.generateStatement(BIZ_FAMILY, PERIOD_MONTH, TODAY);
    // 351.97 - 19.00 = 332.97 (remittanceTotal is rounded to exact cents)
    expect(stmt.remittanceTotal).toBe(332.97);
  });

  it('snapshots commissionRate in the statement', async () => {
    const stmt = await service.generateStatement(BIZ_FAMILY, PERIOD_MONTH, TODAY);
    expect(stmt.commissionRate).toBe(0.05);
  });
});

// ---------------------------------------------------------------------------
// 4. Zero-charge lines — REQ-016
// ---------------------------------------------------------------------------

describe('REQ-016 — all BILLABLE_SUBTYPES lines appear even at $0', () => {
  it('includes a charge line for every configured subtype, including $0 ones', async () => {
    const ds = new InMemoryDataService();
    const service = new StatementService(ds, makeCategoryService(ds));

    // Only one billable transaction (BOOK_REPORT); the other two subtypes should
    // appear with amount=0
    await seedTransactions(ds, BIZ_FAMILY, [
      makeTxn({ id: 'trust-1', categoryId: STATEMENT_ROLES.trustInflow, amount: -1000.00 }),
      makeTxn({ id: 'book-report-1', categoryId: 'BIZ_BILLABLE_BOOK_REPORT', amount: 19.00 }),
    ]);

    const stmt = await service.generateStatement(BIZ_FAMILY, PERIOD_MONTH, TODAY);

    expect(stmt.charges).toHaveLength(BILLABLE_SUBTYPES.length);

    const bookReport = stmt.charges.find((c) => c.subType === 'BIZ_BILLABLE_BOOK_REPORT');
    const bookPurchase = stmt.charges.find((c) => c.subType === 'BIZ_BILLABLE_BOOK_PURCHASE');
    const bookShipping = stmt.charges.find((c) => c.subType === 'BIZ_BILLABLE_BOOK_SHIPPING');

    expect(bookReport?.amount).toBe(19.00);
    expect(bookPurchase?.amount).toBe(0); // zero line still present
    expect(bookShipping?.amount).toBe(0); // zero line still present
  });
});

// ---------------------------------------------------------------------------
// 5. Exclusions — REQ-018
// ---------------------------------------------------------------------------

describe('REQ-018 — overhead, commission, remittance excluded from statement', () => {
  it('does not include overhead/commission/remittance transactions in lineItems or charges', async () => {
    const ds = new InMemoryDataService();
    const service = new StatementService(ds, makeCategoryService(ds));

    await seedTransactions(ds, BIZ_FAMILY, [
      makeTxn({ id: 'trust-1', categoryId: STATEMENT_ROLES.trustInflow, amount: -500.00 }),
      makeTxn({ id: 'overhead-1', categoryId: STATEMENT_ROLES.overhead, amount: 10.00 }),
      makeTxn({ id: 'commission-1', categoryId: STATEMENT_ROLES.commission, amount: -25.00 }),
      makeTxn({ id: 'remittance-1', categoryId: STATEMENT_ROLES.remittance, amount: 475.00 }),
    ]);

    const stmt = await service.generateStatement(BIZ_FAMILY, PERIOD_MONTH, TODAY);

    // Only the trust-inflow row appears in lineItems
    expect(stmt.lineItems).toHaveLength(1);
    expect(stmt.lineItems[0].transactionId).toBe('trust-1');

    // No overhead/commission/remittance amount leaked into any charge
    const allChargeAmounts = stmt.charges.reduce((sum, c) => sum + c.amount, 0);
    expect(allChargeAmounts).toBe(0); // no billable txns → all zero
  });
});

// ---------------------------------------------------------------------------
// 6. Immutability — REQ-025
// ---------------------------------------------------------------------------

describe('REQ-025 — stored statement is immutable', () => {
  it('re-tagging a source transaction does NOT change the stored statement', async () => {
    const ds = new InMemoryDataService();
    const service = new StatementService(ds, makeCategoryService(ds));

    // Seed a trust-inflow transaction
    const txns = [
      makeTxn({ id: 'trust-1', categoryId: STATEMENT_ROLES.trustInflow, amount: -200.00 }),
    ];
    await seedTransactions(ds, BIZ_FAMILY, txns);

    // Generate the statement — captures the snapshot
    const original = await service.generateStatement(BIZ_FAMILY, PERIOD_MONTH, TODAY);
    expect(original.lineItems).toHaveLength(1);
    expect(original.lineItems[0].payout).toBe(200.00);

    // Simulate re-tagging: change categoryId to overhead (as if the user
    // mis-tagged the transaction after the statement was generated)
    const retaggerdTxns = txns.map((t) =>
      t.id === 'trust-1' ? { ...t, categoryId: STATEMENT_ROLES.overhead } : t,
    );
    await ds.saveData(`transactions_${BIZ_FAMILY}`, retaggerdTxns);

    // Re-read the STORED statement — it must be unchanged
    const stored = await service.getStatement(BIZ_FAMILY, original.id);
    expect(stored.lineItems).toHaveLength(1);
    expect(stored.lineItems[0].payout).toBe(200.00);
    expect(stored.royaltySubtotal).toBe(original.royaltySubtotal);
    expect(stored.remittanceTotal).toBe(original.remittanceTotal);
  });
});

// ---------------------------------------------------------------------------
// 7. Payment numbering
// ---------------------------------------------------------------------------

describe('payment numbering', () => {
  it('first statement defaults to DEFAULT_FIRST_PAYMENT_NUMBER (68)', async () => {
    const ds = new InMemoryDataService();
    const service = new StatementService(ds, makeCategoryService(ds));
    await seedTransactions(ds, BIZ_FAMILY, [
      makeTxn({ id: 't1', categoryId: STATEMENT_ROLES.trustInflow, amount: -100.00 }),
    ]);

    const stmt = await service.generateStatement(BIZ_FAMILY, PERIOD_MONTH, TODAY);
    expect(stmt.paymentNumber).toBe(DEFAULT_FIRST_PAYMENT_NUMBER);
  });

  it('second statement is first paymentNumber + 1', async () => {
    const ds = new InMemoryDataService();
    const service = new StatementService(ds, makeCategoryService(ds));

    await seedTransactions(ds, BIZ_FAMILY, [
      makeTxn({ id: 't1', categoryId: STATEMENT_ROLES.trustInflow, amount: -100.00, date: '2026-01-10' }),
    ]);

    const first = await service.generateStatement(BIZ_FAMILY, '2026-01', TODAY);
    const second = await service.generateStatement(BIZ_FAMILY, '2026-01', TODAY);

    expect(second.paymentNumber).toBe(first.paymentNumber + 1);
  });

  it('accepts an explicit paymentNumber override', async () => {
    const ds = new InMemoryDataService();
    const service = new StatementService(ds, makeCategoryService(ds));
    await seedTransactions(ds, BIZ_FAMILY, [
      makeTxn({ id: 't1', categoryId: STATEMENT_ROLES.trustInflow, amount: -100.00 }),
    ]);

    const stmt = await service.generateStatement(BIZ_FAMILY, PERIOD_MONTH, TODAY, {
      paymentNumber: 99,
    });
    expect(stmt.paymentNumber).toBe(99);
  });
});

// ---------------------------------------------------------------------------
// 8. Isolation — business statements invisible to another familyId
// ---------------------------------------------------------------------------

describe('familyId isolation', () => {
  it('statements stored under businessFamilyId are invisible to another familyId', async () => {
    const ds = new InMemoryDataService();
    const service = new StatementService(ds, makeCategoryService(ds));

    await seedTransactions(ds, BIZ_FAMILY, [
      makeTxn({ id: 't1', categoryId: STATEMENT_ROLES.trustInflow, amount: -500.00 }),
    ]);

    await service.generateStatement(BIZ_FAMILY, PERIOD_MONTH, TODAY);

    // Another workspace sees an empty list
    const othersStatements = await service.listStatements(OTHER_FAMILY);
    expect(othersStatements).toHaveLength(0);
  });

  it('getStatement for a different familyId returns NotFoundError', async () => {
    const ds = new InMemoryDataService();
    const service = new StatementService(ds, makeCategoryService(ds));

    await seedTransactions(ds, BIZ_FAMILY, [
      makeTxn({ id: 't1', categoryId: STATEMENT_ROLES.trustInflow, amount: -500.00 }),
    ]);

    const stmt = await service.generateStatement(BIZ_FAMILY, PERIOD_MONTH, TODAY);

    // Other family cannot retrieve the statement by id
    await expect(service.getStatement(OTHER_FAMILY, stmt.id)).rejects.toThrow(
      `Statement ${stmt.id} not found`,
    );
  });
});

// ---------------------------------------------------------------------------
// 9. List ordering
// ---------------------------------------------------------------------------

describe('listStatements ordering', () => {
  it('returns statements in descending paymentNumber order', async () => {
    const ds = new InMemoryDataService();
    const service = new StatementService(ds, makeCategoryService(ds));

    await seedTransactions(ds, BIZ_FAMILY, [
      makeTxn({ id: 't1', categoryId: STATEMENT_ROLES.trustInflow, amount: -100.00, date: '2026-01-10' }),
    ]);

    await service.generateStatement(BIZ_FAMILY, '2026-01', TODAY);
    await service.generateStatement(BIZ_FAMILY, '2026-01', TODAY);
    await service.generateStatement(BIZ_FAMILY, '2026-01', TODAY);

    const list = await service.listStatements(BIZ_FAMILY);
    expect(list).toHaveLength(3);
    expect(list[0].paymentNumber).toBeGreaterThan(list[1].paymentNumber);
    expect(list[1].paymentNumber).toBeGreaterThan(list[2].paymentNumber);
  });
});

// ---------------------------------------------------------------------------
// 10. No trust-inflow transactions in the period
// ---------------------------------------------------------------------------

describe('empty period', () => {
  it('generates a statement with no line items when no trust-inflow txns exist', async () => {
    const ds = new InMemoryDataService();
    const service = new StatementService(ds, makeCategoryService(ds));

    await seedTransactions(ds, BIZ_FAMILY, [
      // Transaction outside the period
      makeTxn({ id: 't1', categoryId: STATEMENT_ROLES.trustInflow, amount: -100.00, date: '2025-12-15' }),
    ]);

    const stmt = await service.generateStatement(BIZ_FAMILY, '2026-01', TODAY);
    expect(stmt.lineItems).toHaveLength(0);
    expect(stmt.royaltySubtotal).toBe(0);
    expect(stmt.remittanceTotal).toBe(0);
    // All charge lines still present at $0 (REQ-016)
    expect(stmt.charges).toHaveLength(BILLABLE_SUBTYPES.length);
  });
});
