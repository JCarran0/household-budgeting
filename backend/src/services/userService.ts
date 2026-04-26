/**
 * User Service
 *
 * Thin wrapper around DataService user operations that:
 *   - Applies Wrapped-specific defaults on read (timezone, wrappedEnabled).
 *   - Exposes timezone update and wrappedEnabled toggle (admin-gated).
 *   - Exposes listAllUsers for the scheduler.
 */

import { DataService, User } from './dataService';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors';

const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * Apply per-field defaults to a user loaded from storage so that
 * callers never need to handle the optional cases themselves.
 */
function applyDefaults(user: User): User & { timezone: string; wrappedEnabled: boolean } {
  return {
    ...user,
    timezone: user.timezone ?? DEFAULT_TIMEZONE,
    wrappedEnabled: user.wrappedEnabled ?? false,
  };
}

export class UserService {
  constructor(private readonly dataService: DataService) {}

  /**
   * Get a single user by ID with Wrapped defaults applied.
   * Returns null when the user does not exist.
   */
  async getUser(userId: string): Promise<(User & { timezone: string; wrappedEnabled: boolean }) | null> {
    const user = await this.dataService.getUser(userId);
    if (!user) return null;
    return applyDefaults(user);
  }

  /**
   * List all users with Wrapped defaults applied.
   * Used by the scheduler to fan out per-user fire checks.
   */
  async listAllUsers(): Promise<Array<User & { timezone: string; wrappedEnabled: boolean }>> {
    const users = await this.dataService.getAllUsers();
    return users.map(applyDefaults);
  }

  /**
   * Validate and persist a new IANA timezone for a user.
   *
   * Validation is via `Intl.supportedValuesOf('timeZone')` (Node 20+).
   * Throws `ValidationError` when the value is not a recognized IANA identifier.
   */
  async updateTimezone(userId: string, tz: string): Promise<void> {
    const supported: string[] = Intl.supportedValuesOf('timeZone');
    if (!supported.includes(tz)) {
      throw new ValidationError(`"${tz}" is not a valid IANA timezone identifier.`);
    }

    const updated = await this.dataService.updateUser(userId, { timezone: tz });
    if (!updated) {
      throw new NotFoundError(`User not found: ${userId}`);
    }
  }

  /**
   * Toggle `wrappedEnabled` on `targetUserId`.
   *
   * Requires that `actingUserId` is an admin (`User.isAdmin === true`).
   * Throws `ForbiddenError` when the acting user is not an admin.
   */
  async setWrappedEnabled(
    targetUserId: string,
    enabled: boolean,
    actingUserId: string,
  ): Promise<void> {
    const actingUser = await this.dataService.getUser(actingUserId);
    if (!actingUser || actingUser.isAdmin !== true) {
      throw new ForbiddenError('Admin privileges required to toggle wrappedEnabled.');
    }

    const updated = await this.dataService.updateUser(targetUserId, { wrappedEnabled: enabled });
    if (!updated) {
      throw new NotFoundError(`Target user not found: ${targetUserId}`);
    }
  }
}
