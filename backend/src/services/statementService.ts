/**
 * Statement Service — Phase 5.2
 *
 * Generates, persists, and retrieves immutable client royalty statements.
 *
 * Responsibilities:
 *  1. Load active transactions for the requested month via transactionReader
 *     (excludes removed transactions — CLAUDE.md rule).
 *  2. Load the business category tree and partition transactions by
 *     resolveStatementRole / billableSubTypeOf.
 *  3. Determine the next payment number (max stored + 1, first default = 68).
 *  4. Delegate math to the pure computeStatement (shared/utils/businessStatementCalc.ts).
 *  5. Assign id + createdAt and persist to statements_{familyId} under withLock (D8).
 *
 * Immutability: once a statement is stored it is never updated or deleted (REQ-025).
 * Re-tagging source transactions has no effect on stored statement line items.
 *
 * Isolation: each familyId has its own storage key — business statements are
 * invisible to any other workspace.
 *
 * V1 commission rate: 0.05 (5%). Named constant so it is easy to make
 * workspace-configurable in a later phase.
 */

import { v4 as uuidv4 } from 'uuid';
import { DataService } from './dataService';
import { Repository } from './repository';
import { getActiveTransactions } from './transactionReader';
import { CategoryService } from './categoryService';
import {
  resolveStatementRole,
  billableSubTypeOf,
  BILLABLE_SUBTYPES,
} from '../constants/categoryTemplates';
import {
  computeStatement,
  type TrustInflowTxn,
  type BillableBySubtype,
} from '../shared/utils/businessStatementCalc';
import type { BusinessStatement, StatementHeader } from '../shared/types';
import { NotFoundError } from '../errors';
import { childLogger } from '../utils/logger';

const log = childLogger('statementService');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default first payment number.
 * Payment 068 is the first statement generated outside Google Sheets,
 * matching the real history. The service auto-increments from there.
 */
export const DEFAULT_FIRST_PAYMENT_NUMBER = 68;

/** V1 flat commission rate (5%). */
export const DEFAULT_COMMISSION_RATE = 0.05;

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface GenerateStatementOptions {
  /**
   * Override the auto-incremented payment number.
   * Useful for correcting the counter if a statement was voided externally.
   * If omitted, uses max(persisted) + 1 (or DEFAULT_FIRST_PAYMENT_NUMBER).
   */
  paymentNumber?: number;
  /**
   * Override the payment date. Defaults to today (ISO YYYY-MM-DD, caller-supplied
   * to keep the service pure — no Date.now() calls inside).
   */
  paymentDate?: string;
  /**
   * Commission rate override. Defaults to DEFAULT_COMMISSION_RATE.
   * Snapshotted into the statement so the rate is immutably recorded.
   */
  commissionRate?: number;
  /**
   * Header snapshot (business + client identity). If not supplied, a minimal
   * placeholder is used — callers should provide real values in production.
   */
  clientHeader?: StatementHeader;
}

// Minimal stored-transaction shape we need for statement partitioning.
interface PartitionableTxn {
  id: string;
  categoryId: string | null;
  amount: number;  // positive = debit, negative = credit in StoredTransaction
  date: string;    // YYYY-MM-DD
  status: string;
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

export class StatementService {
  private readonly repository: Repository<BusinessStatement>;

  constructor(
    private readonly dataService: DataService,
    private readonly categoryService: CategoryService,
  ) {
    this.repository = new Repository<BusinessStatement>(dataService, 'statements');
  }

  /**
   * Generate and persist an immutable royalty statement for the given calendar
   * month. Reads active transactions from storage, partitions by statement role,
   * computes math via the pure computeStatement helper, then persists.
   *
   * @param familyId   - The business workspace's familyId
   * @param periodMonth - "YYYY-MM" string for the statement period
   * @param today       - Caller-supplied ISO date string (YYYY-MM-DD) used as
   *                      the default paymentDate; keeps the service date-pure.
   * @param opts        - Optional overrides for paymentNumber, paymentDate,
   *                      commissionRate, and clientHeader
   */
  async generateStatement(
    familyId: string,
    periodMonth: string,
    today: string,
    opts: GenerateStatementOptions = {},
  ): Promise<BusinessStatement> {
    const commissionRate = opts.commissionRate ?? DEFAULT_COMMISSION_RATE;
    const paymentDate = opts.paymentDate ?? today;

    // Load categories for this workspace (needed for role resolution)
    const allCategories = await this.categoryService.getAllCategories(familyId);

    // Load all active transactions for this family and filter to the period month
    const allActive = await getActiveTransactions<PartitionableTxn>(
      this.dataService,
      familyId,
    );
    const monthTxns = allActive.filter((t) => t.date.startsWith(periodMonth));

    // Partition transactions by statement role
    const trustInflowTxns: TrustInflowTxn[] = [];
    const billableBySubtype: BillableBySubtype = {};

    for (const txn of monthTxns) {
      if (!txn.categoryId) continue; // uncategorized excluded (BRD REQ-018 / REQ-009)

      const role = resolveStatementRole(txn.categoryId, allCategories);
      if (role === null) continue; // not a business role → skip

      if (role === 'trustInflow') {
        // Trust-inflow deposits: payout is the absolute value of the amount.
        // In StoredTransaction, a deposit arrives as negative amount (credit),
        // so we take Math.abs. This matches the businessWorkspaceReuse.test.ts
        // convention where amounts are stored as positive for test clarity.
        const payout = Math.abs(txn.amount);
        trustInflowTxns.push({
          transactionId: txn.id,
          disbursementDate: txn.date,
          payout,
        });
      } else if (role === 'billableRoot') {
        const sub = billableSubTypeOf(txn.categoryId, allCategories);
        if (sub) {
          (billableBySubtype[sub] ??= []).push(Math.abs(txn.amount));
        }
      }
      // overhead, commission, remittance: excluded from statement (REQ-018)
    }

    // Compute next payment number under the write lock
    return this.repository.withLock(familyId, async () => {
      const existing = await this.repository.getAll(familyId);

      let paymentNumber: number;
      if (opts.paymentNumber !== undefined) {
        paymentNumber = opts.paymentNumber;
      } else if (existing.length === 0) {
        paymentNumber = DEFAULT_FIRST_PAYMENT_NUMBER;
      } else {
        paymentNumber = Math.max(...existing.map((s) => s.paymentNumber)) + 1;
      }

      const clientHeader: StatementHeader = opts.clientHeader ?? {
        businessName: '',
        businessAddress: '',
        clientName: '',
        clientCompany: '',
        clientAddress: '',
      };

      const computed = computeStatement({
        trustInflowTxns,
        billableBySubtype,
        billableSubtypes: BILLABLE_SUBTYPES,
        commissionRate,
        paymentNumber,
        paymentDate,
        periodMonth,
        clientHeader,
      });

      const statement: BusinessStatement = {
        ...computed,
        id: uuidv4(),
        createdAt: new Date().toISOString(),
      };

      await this.repository.saveAll(familyId, [...existing, statement]);

      log.info(
        { familyId, paymentNumber, periodMonth, remittanceTotal: statement.remittanceTotal },
        'statement generated',
      );

      return statement;
    });
  }

  /**
   * List all statements for a workspace, descending by paymentNumber.
   */
  async listStatements(familyId: string): Promise<BusinessStatement[]> {
    const all = await this.repository.getAll(familyId);
    return [...all].sort((a, b) => b.paymentNumber - a.paymentNumber);
  }

  /**
   * Retrieve a single statement by id. Throws NotFoundError if not found.
   */
  async getStatement(familyId: string, id: string): Promise<BusinessStatement> {
    const statement = await this.repository.findById(familyId, id);
    if (!statement) {
      throw new NotFoundError(`Statement ${id} not found`);
    }
    return statement;
  }
}
