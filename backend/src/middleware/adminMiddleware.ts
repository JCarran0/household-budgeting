import { Request, Response, NextFunction } from 'express';
import { dataService } from '../services';
import { childLogger } from '../utils/logger';

const log = childLogger('adminMiddleware');

// Gates the admin router. Must be mounted AFTER authMiddleware so req.user is
// populated. Behavior:
//   - If the stored User.isAdmin === true  → allow
//   - Else → 403
//
// The ADMIN_USERNAMES auto-promotion path was removed on 2026-09-08 (SA-10).
// It promoted any user whose username appeared in that env var to admin on
// their first admin request and persisted the flag. TD-006 designed it assuming
// the named user already existed — but registration was open, so a username in
// the allowlist that had *not* been registered (a typo, a rename, a planned
// second account) was claimable by anyone, and the claimant became admin with
// access to cross-family data migrations.
//
// Registration is now invitation-only (see `services/registrationPolicy.ts`),
// which breaks that chain from the other end. This path is removed as well
// because defence in depth is the point: a single mistake in either control
// should not be sufficient. It is also no longer load-bearing — TD-006 always
// intended it as a one-time bootstrap ("the env can be unset without revoking
// access"), and the production admin has had `isAdmin: true` persisted in
// storage since that bootstrap ran.
//
// To grant admin now, set `isAdmin: true` on the stored user — an explicit,
// audited act on an account that already exists, rather than a side effect of
// choosing a username. Fail-closed when the flag is absent.
export const adminMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  void requireAdmin(req, res, next);
};

async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const user = await dataService.getUser(req.user.userId);
    if (!user) {
      res.status(401).json({ success: false, error: 'User not found' });
      return;
    }

    if (user.isAdmin === true) {
      next();
      return;
    }

    res.status(403).json({ success: false, error: 'Admin privileges required' });
  } catch (error) {
    log.error({ err: error }, 'authorization check failed');
    res.status(500).json({ success: false, error: 'Authorization check failed' });
  }
}
