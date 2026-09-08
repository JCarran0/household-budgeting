/**
 * Act on verified Plaid webhooks (TD-021 step 4).
 *
 * Before this, syncs happened only when a user clicked. Nothing told the app new
 * transactions existed, no consent-expiry warning ever arrived, and Item errors
 * surfaced only when someone happened to sync. A 19-day outage went unnoticed
 * that way in July 2026, and the September Bank of America incident was again
 * found by eye.
 *
 * ## Verification is the caller's job
 *
 * Everything here assumes the payload is already proven to come from Plaid. The
 * route verifies before dispatching; see `plaidWebhookVerification.ts`. Nothing
 * in this file re-checks, so it must never be reachable from an unverified path.
 *
 * ## Why resolution scans
 *
 * A webhook carries an `item_id` and no user context, but every account is
 * stored under `accounts_{familyId}`. There is no Item → family index, so this
 * scans the account keys. That is O(families) reads per webhook, which is
 * nothing at two users and would need an index at a scale this app will not
 * reach. Stated rather than hidden, so the tradeoff is visible if that changes.
 */

import { childLogger } from '../utils/logger';
import type { StoredAccount } from './accountService';
import type { TransactionService } from './transactionService';

const log = childLogger('plaidWebhookService');

/** The subset of the payload we act on. Plaid sends more; we ignore the rest. */
export interface PlaidWebhookPayload {
  webhook_type?: string;
  webhook_code?: string;
  item_id?: string;
  error?: { error_code?: string; error_message?: string } | null;
  consent_expiration_time?: string | null;
  new_transactions?: number;
  environment?: string;
}

export type WebhookOutcome =
  | { handled: true; action: 'synced'; added: number; modified: number; removed: number; warning?: string }
  | { handled: true; action: 'consent_expiring'; expiresAt: string | null }
  | { handled: true; action: 'reauth_required' }
  | { handled: true; action: 'logged'; detail: string }
  | { handled: false; reason: 'no_item_id' | 'unknown_item' | 'ignored' };

interface DataLike {
  listKeys(prefix: string): Promise<string[]>;
  getData<T>(key: string): Promise<T | null>;
  saveData<T>(key: string, data: T): Promise<void>;
}

export class PlaidWebhookService {
  constructor(
    private readonly dataService: DataLike,
    private readonly transactionService: Pick<TransactionService, 'syncTransactions'>,
  ) {}

  /** Find which family owns an Item, and that Item's accounts. */
  async resolveItem(
    plaidItemId: string,
  ): Promise<{ familyId: string; accounts: StoredAccount[] } | null> {
    const keys = await this.dataService.listKeys('accounts_');
    for (const key of keys) {
      const accounts = (await this.dataService.getData<StoredAccount[]>(key)) ?? [];
      const matching = accounts.filter(a => a.plaidItemId === plaidItemId);
      if (matching.length > 0) {
        return { familyId: key.replace(/^accounts_/, ''), accounts: matching };
      }
    }
    return null;
  }

  async handle(payload: PlaidWebhookPayload): Promise<WebhookOutcome> {
    const itemId = payload.item_id;
    if (!itemId) return { handled: false, reason: 'no_item_id' };

    const resolved = await this.resolveItem(itemId);
    if (!resolved) {
      // Not an error: Plaid may still send for an Item the user disconnected.
      log.warn({ plaidItemId: itemId, webhookCode: payload.webhook_code }, 'webhook for unknown item');
      return { handled: false, reason: 'unknown_item' };
    }

    const { familyId, accounts } = resolved;
    const code = payload.webhook_code;

    switch (code) {
      // SYNC_UPDATES_AVAILABLE is the one that matters for /transactions/sync.
      // The three legacy codes are handled identically rather than ignored:
      // syncing is idempotent, and silently dropping an update we were told
      // about is the failure mode this whole item exists to remove.
      case 'SYNC_UPDATES_AVAILABLE':
      case 'DEFAULT_UPDATE':
      case 'INITIAL_UPDATE':
      case 'HISTORICAL_UPDATE': {
        const result = await this.transactionService.syncTransactions(familyId, accounts);
        log.info(
          { plaidItemId: itemId, familyId, webhookCode: code, added: result.added, modified: result.modified },
          'synced from webhook',
        );
        return {
          handled: true,
          action: 'synced',
          added: result.added ?? 0,
          modified: result.modified ?? 0,
          removed: result.removed ?? 0,
          warning: result.warning,
        };
      }

      case 'PENDING_EXPIRATION': {
        // Persist onto the Item's accounts so the existing consent warning in
        // `accountHealth.hasExpiringConsent` surfaces it. No new UI needed —
        // step 1 of TD-021 already built the surface, it just never had a
        // signal that did not depend on someone opening the page.
        const expiresAt = payload.consent_expiration_time ?? null;
        await this.patchItemAccounts(familyId, itemId, a => {
          a.consentExpirationTime = expiresAt;
        });
        log.warn({ plaidItemId: itemId, familyId, expiresAt }, 'consent expiring');
        return { handled: true, action: 'consent_expiring', expiresAt };
      }

      case 'ERROR': {
        const errorCode = payload.error?.error_code;
        // Only ITEM_LOGIN_REQUIRED is actually fixable by re-authenticating.
        // Marking every Item error as requires_reauth would tell the user to do
        // something that cannot help, which is the TD-022 mistake.
        if (errorCode === 'ITEM_LOGIN_REQUIRED') {
          await this.patchItemAccounts(familyId, itemId, a => {
            a.status = 'requires_reauth';
          });
          log.warn({ plaidItemId: itemId, familyId }, 'item requires reauth');
          return { handled: true, action: 'reauth_required' };
        }
        await this.patchItemAccounts(familyId, itemId, a => {
          a.status = 'error';
        });
        log.error({ plaidItemId: itemId, familyId, errorCode }, 'item error from webhook');
        return { handled: true, action: 'logged', detail: errorCode ?? 'unknown_error' };
      }

      case 'USER_PERMISSION_REVOKED':
      case 'PENDING_DISCONNECT': {
        await this.patchItemAccounts(familyId, itemId, a => {
          a.status = 'requires_reauth';
        });
        log.warn({ plaidItemId: itemId, familyId, webhookCode: code }, 'item disconnecting');
        return { handled: true, action: 'reauth_required' };
      }

      default:
        // Acknowledged but not acted on. Logged so an unhandled code that starts
        // arriving is visible rather than silently dropped.
        log.info(
          { plaidItemId: itemId, webhookType: payload.webhook_type, webhookCode: code },
          'unhandled webhook code',
        );
        return { handled: false, reason: 'ignored' };
    }
  }

  /** Apply a mutation to every stored account on one Item. */
  private async patchItemAccounts(
    familyId: string,
    plaidItemId: string,
    mutate: (account: StoredAccount) => void,
  ): Promise<void> {
    const key = `accounts_${familyId}`;
    const accounts = (await this.dataService.getData<StoredAccount[]>(key)) ?? [];
    let touched = false;
    for (const account of accounts) {
      if (account.plaidItemId === plaidItemId) {
        mutate(account);
        account.updatedAt = new Date();
        touched = true;
      }
    }
    if (touched) await this.dataService.saveData(key, accounts);
  }
}
