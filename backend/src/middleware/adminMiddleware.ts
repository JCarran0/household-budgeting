import { Request, Response, NextFunction } from 'express';
import { dataService } from '../services';
import { childLogger } from '../utils/logger';

const log = childLogger('adminMiddleware');

// Case-insensitive allowlist of usernames that auto-promote to admin on first
// hit. Empty array when the env var is unset — then adminMiddleware only
// recognizes users who already have User.isAdmin === true in storage.
function readAdminUsernames(): string[] {
  const raw = process.env.ADMIN_USERNAMES;
  if (!raw) return [];
  return raw
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length > 0);
}

// Gates the admin router. Must be mounted AFTER authMiddleware so req.user is
// populated. Behavior:
//   - If the stored User.isAdmin === true  → allow
//   - Else if username is in ADMIN_USERNAMES → persist isAdmin=true, allow
//   - Else → 403
// The env-var path is a one-time bootstrap: the first successful admin request
// by a seeded user persists the flag, so subsequent calls don't depend on the
// env being set. Fail-closed when neither condition holds.
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

    const allowlist = readAdminUsernames();
    if (allowlist.includes(user.username.toLowerCase())) {
      await dataService.updateUser(user.id, { isAdmin: true });
      next();
      return;
    }

    res.status(403).json({ success: false, error: 'Admin privileges required' });
  } catch (error) {
    log.error({ err: error }, 'authorization check failed');
    res.status(500).json({ success: false, error: 'Authorization check failed' });
  }
}
