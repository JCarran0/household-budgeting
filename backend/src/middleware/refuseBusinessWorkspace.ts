/**
 * REQ-P016 / AI-CAPABILITY-PLATFORM-BRD §3.3, §11 — the Business Workspace is
 * excluded from AI entirely, reads included.
 *
 * It holds Amazon royalties held in trust for a client. That money is not the
 * family's, and a chatbot that can read it is a fiduciary problem rather than a
 * privacy preference. BUSINESS-WORKSPACE-BRD already excluded payment
 * automation on those grounds; this extends the same reasoning to AI access.
 *
 * Enforced at the route rather than by hiding a button: the JWT carries the
 * active familyId, so a token minted in the business workspace must be refused
 * no matter what the client renders. Mirrors requireBusinessWorkspace in
 * routes/businessStatements.ts, inverted.
 *
 * SHARED DELIBERATELY: every AI route must sit behind the SAME guard. When
 * this lived inside routes/chatbot.ts, a second AI router — the activity log
 * and undo endpoints — could have been written without it and nothing would
 * have caught the omission. businessWorkspaceAi.security.test.ts enumerates the
 * routes that must 403 and is the backstop.
 */

import type { Request, Response, NextFunction } from 'express';
import { familyService } from '../services';
import { childLogger } from '../utils/logger';

const log = childLogger('aiWorkspaceGuard');

export async function refuseBusinessWorkspace(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const family = await familyService.getFamily(familyId);
    if (family?.workspaceType === 'business') {
      log.warn({ familyId }, 'AI request refused in business workspace (REQ-P016)');
      res.status(403).json({
        success: false,
        error: 'Helper Bot is not available in the business workspace.',
        code: 'AI_NOT_AVAILABLE_IN_WORKSPACE',
      });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}
