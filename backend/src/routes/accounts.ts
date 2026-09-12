/**
 * Account Management Routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { accountService, transactionService, pushNotificationService } from '../services';
import { toClientAccount } from '../services/accountService';
import { authMiddleware } from '../middleware/authMiddleware';
import { AuthorizationError } from '../errors';
import { z } from 'zod';

import { childLogger } from '../utils/logger';

const log = childLogger('accounts');

const router = Router();

// Extended Request with user
interface AuthRequest extends Request {
  user?: { userId: string; username: string; familyId: string; workspaceIds: string[] };
}

// Input validation schemas
const connectAccountSchema = z.object({
  publicToken: z.string().min(1),
  institutionId: z.string().min(1),
  institutionName: z.string().min(1),
});

const syncTransactionsSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * POST /api/v1/accounts/connect
 * Connect a new bank account after Plaid Link
 */
router.post('/connect', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

    const validation = connectAccountSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ 
        success: false, 
        error: 'Invalid request data',
        details: validation.error.format(),
      });
      return;
    }

    const { publicToken, institutionId, institutionName } = validation.data;

    const result = await accountService.connectAccount(
      req.user.familyId,
      publicToken,
      institutionId,
      institutionName
    );

    if (!result.success) {
      // A refused duplicate is a conflict the user can act on, not a server
      // fault — 500 here is what turned a specific, actionable message into
      // "Connection Error" in the UI.
      const status = result.code === 'DUPLICATE_INSTITUTION' ? 409 : 500;
      res.status(status).json({ success: false, error: result.error });
      return;
    }

    // Note: We don't sync transactions immediately after connection
    // because Plaid needs time (10-60 seconds) to prepare transaction data.
    // Users should manually sync transactions after connecting their account.

    res.json({
      success: true,
      account: result.account ? toClientAccount(result.account) : undefined,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/accounts
 * Get all user's connected accounts
 */
router.get('/', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

    const result = await accountService.getUserAccounts(req.user.familyId);

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    // Strip Plaid-internal fields (SA-19), then map institutionName to
    // institution to match the PlaidAccount interface.
    const mappedAccounts = result.accounts?.map(account => ({
      ...toClientAccount(account),
      institution: account.institutionName, // Map institutionName to institution
    })) || [];

    res.json({
      success: true,
      accounts: mappedAccounts,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/accounts/sync
 * Sync account balances from Plaid
 */
router.post('/sync', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

    const result = await accountService.syncAccountBalances(req.user.familyId);

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    // Fire sync failure notifications for any accounts that need re-auth (non-blocking)
    const { userId } = req.user;
    if (result.reauthRequiredAccounts && result.reauthRequiredAccounts.length > 0) {
      const reauthAccounts = result.reauthRequiredAccounts;
      void (async () => {
        try {
          const prefs = await pushNotificationService.getUserPreferences(userId);
          if (prefs.syncFailures) {
            for (const acct of reauthAccounts) {
              await pushNotificationService.sendNotification(userId, {
                type: 'sync_failure',
                title: 'Account needs attention',
                body: `Your ${acct.institutionName} account needs re-authentication`,
                url: '/accounts',
                tag: `sync-fail-${acct.id}`,
              });
            }
          }
        } catch (err) {
          log.error({ err: err }, '[notifications] Failed to send sync failure notifications');
        }
      })();
    }

    res.json({
      success: true,
      accountsUpdated: result.accountsUpdated,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/accounts/:accountId/sync-transactions
 * Sync transactions for specific account
 */
router.post('/:accountId/sync-transactions', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

    // Express 5 leaves req.body undefined when the client sends no body at all,
    // which this endpoint's callers do. `safeParse(undefined)` fails an object
    // schema, so normalise before validating.
    const validation = syncTransactionsSchema.safeParse(req.body ?? {});
    if (!validation.success) {
      res.status(400).json({ 
        success: false, 
        error: 'Invalid request data',
        details: validation.error.format(),
      });
      return;
    }

    const { accountId } = req.params;
    const { startDate = '2025-01-01' } = validation.data;

    // Get the account
    const account = await accountService.getAccount(req.user.familyId, accountId);
    if (!account) {
      res.status(404).json({ success: false, error: 'Account not found' });
      return;
    }

    // Plaid's transactions/sync cursor is per-Item, not per-account: the delta
    // contains rows for every account under this Item. Passing only the clicked
    // account would make its siblings' rows unplaceable, which trips the
    // fail-closed reconciliation hold in transactionService (TD-020) and stalls
    // the Item's cursor. Sync the whole Item and report the delta.
    const accountsResult = await accountService.getUserAccounts(req.user.familyId);
    const itemAccounts = (accountsResult.accounts ?? []).filter(
      a => a.plaidItemId === account.plaidItemId
    );

    // Sync transactions
    const result = await transactionService.syncTransactions(
      req.user.familyId,
      itemAccounts.length > 0 ? itemAccounts : [account],
      startDate
    );

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    res.json({
      success: true,
      added: result.added,
      modified: result.modified,
      removed: result.removed,
      warning: result.warning,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/accounts/:accountId/link-token
 * Create a link token for re-authentication (update mode)
 */
router.post('/:accountId/link-token', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

    const { accountId } = req.params;
    const result = await accountService.createUpdateLinkToken(req.user.familyId, accountId);

    if (!result.success) {
      res.status(result.error === 'Account not found' ? 404 : 500).json({
        success: false,
        error: result.error,
      });
      return;
    }

    res.json({
      success: true,
      link_token: result.linkToken,
      expiration: result.expiration,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/accounts/:accountId/reauth-complete
 * Mark account as active after successful re-authentication
 */
router.post('/:accountId/reauth-complete', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

    const { accountId } = req.params;
    const result = await accountService.markAccountActive(req.user.familyId, accountId);

    if (!result.success) {
      res.status(result.error === 'Account not found' ? 404 : 500).json({
        success: false,
        error: result.error,
      });
      return;
    }

    // Re-auth is where an Item's account_ids change (TD-020), so this is the
    // moment to look. Adopts genuinely new accounts; for a replaced account it
    // records the pairing without repointing — repointing before the stored
    // transactions are re-keyed would duplicate months of history.
    //
    // Best-effort: the re-auth itself succeeded, so a Plaid failure here must
    // not turn a working re-auth into an error the user cannot act on.
    const adoption = await accountService.adoptItemAccountChanges(
      req.user.familyId,
      accountId,
    );

    res.json({
      success: true,
      adopted: adoption.adopted,
      pendingReconciliation: adoption.pendingReconciliation,
      unpaired: adoption.unpaired,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/accounts/:accountId
 * Update account details (currently only nickname)
 */
router.put('/:accountId', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

    const { accountId } = req.params;
    
    // Validate input
    const updateSchema = z.object({
      nickname: z.string().max(50).nullable().optional(),
    });

    const validation = updateSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ 
        success: false, 
        error: 'Invalid request data',
        details: validation.error.format(),
      });
      return;
    }

    const { nickname } = validation.data;
    
    if (nickname !== undefined) {
      const result = await accountService.updateAccountNickname(req.user.familyId, accountId, nickname);
      
      if (!result.success) {
        res.status(result.error === 'Account not found' ? 404 : 400).json({ 
          success: false, 
          error: result.error 
        });
        return;
      }
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/accounts/:accountId
 * Disconnect a bank account
 */
router.delete('/:accountId', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

    const { accountId } = req.params;

    const result = await accountService.disconnectAccount(req.user.familyId, accountId);

    if (!result.success) {
      res.status(404).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;