/**
 * Business workspace reuse — Phase 4 (PR3)
 *
 * Phase 4 of the Business Workspace plan is "almost entirely reuse": the
 * existing transaction storage, the canonical active-transaction reader, and
 * the statement-role resolution helpers must all work when scoped to a
 * business `familyId`. This test exercises that whole chain end to end and
 * doubles as a dry run of the PR4 statement partitioning:
 *
 *   store transactions under transactions_{businessFamilyId}
 *     → getActiveTransactions (excludes removed)
 *       → resolveStatementRole / billableSubTypeOf bucket each one
 *
 * It also asserts isolation: a different familyId sees none of these rows.
 */

import {
  BUSINESS_CATEGORY_SEED,
  STATEMENT_ROLES,
  resolveStatementRole,
  billableSubTypeOf,
  type StatementRole,
} from '../../constants/categoryTemplates';
import { getActiveTransactions, type TransactionDataReader } from '../transactionReader';

/** Minimal transaction shape the reader + role partitioning need. */
interface TestTxn {
  id: string;
  status: string;
  amount: number;
  categoryId: string | null;
  name: string;
}

/** Tiny in-memory reader backed by a Map — implements TransactionDataReader. */
class InMemoryReader implements TransactionDataReader {
  private store = new Map<string, unknown>();
  set(key: string, value: unknown): void {
    this.store.set(key, value);
  }
  async getData<T>(key: string): Promise<T | null> {
    return (this.store.get(key) as T) ?? null;
  }
}

const BUSINESS_FAMILY = 'biz-fam-1';
const PERSONAL_FAMILY = 'personal-fam-1';

function makeTxn(partial: Partial<TestTxn> & Pick<TestTxn, 'id' | 'categoryId'>): TestTxn {
  return {
    status: 'posted',
    amount: 0,
    name: partial.id,
    ...partial,
  };
}

/**
 * Mirror of what the PR4 statement service will do: bucket transactions by
 * statement role, splitting billables by sub-type. Uncategorized and
 * non-business-role transactions are dropped.
 */
function partitionByRole(txns: TestTxn[]) {
  const buckets: Record<StatementRole, TestTxn[]> & {
    billableBySubtype: Record<string, TestTxn[]>;
  } = {
    trustInflow: [],
    remittance: [],
    billableRoot: [],
    overhead: [],
    commission: [],
    billableBySubtype: {},
  };

  for (const t of txns) {
    if (!t.categoryId) continue; // uncategorized excluded (BRD)
    const role = resolveStatementRole(t.categoryId, BUSINESS_CATEGORY_SEED);
    if (role === null) continue;
    buckets[role].push(t);
    if (role === 'billableRoot') {
      const sub = billableSubTypeOf(t.categoryId, BUSINESS_CATEGORY_SEED);
      if (sub) {
        (buckets.billableBySubtype[sub] ??= []).push(t);
      }
    }
  }
  return buckets;
}

describe('Business workspace reuse (Phase 4 / PR3)', () => {
  const reader = new InMemoryReader();

  const trustDeposit = makeTxn({
    id: 'amzn-kdp-1',
    name: 'ORIG CO NAME:Amazon.com Ser',
    amount: 70220.83,
    categoryId: STATEMENT_ROLES.trustInflow,
  });
  const bookReport = makeTxn({
    id: 'book-report-1',
    amount: 19.0,
    categoryId: 'BIZ_BILLABLE_BOOK_REPORT',
  });
  const overhead = makeTxn({
    id: 'bank-fee-1',
    amount: 2.5,
    categoryId: STATEMENT_ROLES.overhead,
  });
  const remittance = makeTxn({
    id: 'ach-out-1',
    amount: 91813.22,
    categoryId: STATEMENT_ROLES.remittance,
  });
  const commission = makeTxn({
    id: 'commission-1',
    amount: 4833.27,
    categoryId: STATEMENT_ROLES.commission,
  });
  const removedDeposit = makeTxn({
    id: 'amzn-removed',
    status: 'removed',
    amount: 100.0,
    categoryId: STATEMENT_ROLES.trustInflow,
  });
  const uncategorized = makeTxn({ id: 'mystery-1', amount: 5, categoryId: null });

  beforeEach(() => {
    reader.set(`transactions_${BUSINESS_FAMILY}`, [
      trustDeposit,
      bookReport,
      overhead,
      remittance,
      commission,
      removedDeposit,
      uncategorized,
    ]);
    // Personal workspace deliberately has its own (different) rows.
    reader.set(`transactions_${PERSONAL_FAMILY}`, [
      makeTxn({ id: 'groceries-1', amount: 80, categoryId: 'CUSTOM_GROCERIES' }),
    ]);
  });

  it('reads only the business workspace rows, excluding removed ones', async () => {
    const active = await getActiveTransactions<TestTxn>(reader, BUSINESS_FAMILY);
    const ids = active.map(t => t.id);

    expect(ids).toContain('amzn-kdp-1');
    expect(ids).not.toContain('amzn-removed'); // status: 'removed' filtered out
    expect(active).toHaveLength(6);
  });

  it('partitions business transactions into the correct statement roles', async () => {
    const active = await getActiveTransactions<TestTxn>(reader, BUSINESS_FAMILY);
    const buckets = partitionByRole(active);

    expect(buckets.trustInflow.map(t => t.id)).toEqual(['amzn-kdp-1']);
    expect(buckets.remittance.map(t => t.id)).toEqual(['ach-out-1']);
    expect(buckets.overhead.map(t => t.id)).toEqual(['bank-fee-1']);
    expect(buckets.commission.map(t => t.id)).toEqual(['commission-1']);
    expect(buckets.billableRoot.map(t => t.id)).toEqual(['book-report-1']);
    expect(buckets.billableBySubtype['BIZ_BILLABLE_BOOK_REPORT'].map(t => t.id)).toEqual([
      'book-report-1',
    ]);
  });

  it('excludes uncategorized transactions from every role bucket', async () => {
    const active = await getActiveTransactions<TestTxn>(reader, BUSINESS_FAMILY);
    const buckets = partitionByRole(active);

    const allBucketed = [
      ...buckets.trustInflow,
      ...buckets.remittance,
      ...buckets.overhead,
      ...buckets.commission,
      ...buckets.billableRoot,
    ].map(t => t.id);

    expect(allBucketed).not.toContain('mystery-1');
  });

  it('isolates business rows from another workspace (familyId scoping)', async () => {
    const personal = await getActiveTransactions<TestTxn>(reader, PERSONAL_FAMILY);
    expect(personal.map(t => t.id)).toEqual(['groceries-1']);
    expect(personal.map(t => t.id)).not.toContain('amzn-kdp-1');

    // A workspace with no stored transactions returns an empty array, not null.
    const empty = await getActiveTransactions<TestTxn>(reader, 'never-seen-fam');
    expect(empty).toEqual([]);
  });
});
