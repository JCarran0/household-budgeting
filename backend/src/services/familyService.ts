import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { DataService, User } from './dataService';
import type { Family, FamilyMember, WorkspaceType } from '../shared/types';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors';

/**
 * Minimal interface for the category-seeding dependency.
 * FamilyService calls seedCategoriesForWorkspaceType when creating a business
 * workspace. We accept an interface (not the concrete class) to avoid a circular
 * import: CategoryService → FamilyService would create a cycle.
 */
export interface CategorySeeder {
  seedCategoriesForWorkspaceType(familyId: string, type: WorkspaceType): Promise<void>;
}

interface Invitation {
  code: string;
  familyId: string;
  createdBy: string;
  expiresAt: Date;
  used: boolean;
}

interface InvitationResult {
  code: string;
  expiresAt: string;
}

export class FamilyService {
  private dataService: DataService;
  private categorySeeder?: CategorySeeder;
  private invitations: Map<string, Invitation> = new Map();
  private readonly INVITATION_TTL = 48 * 60 * 60 * 1000; // 48 hours

  constructor(dataService: DataService, categorySeeder?: CategorySeeder) {
    this.dataService = dataService;
    this.categorySeeder = categorySeeder;
  }

  /**
   * Late-bind the CategorySeeder to break the FamilyService ↔ CategoryService
   * circular dependency (FamilyService.createWorkspace calls the seeder;
   * CategoryService is instantiated after FamilyService in services/index.ts).
   */
  setCategorySeeder(seeder: CategorySeeder): void {
    this.categorySeeder = seeder;
  }

  async getFamily(familyId: string): Promise<Family | null> {
    return this.dataService.getFamily(familyId);
  }

  async getFamilyMembers(familyId: string): Promise<FamilyMember[]> {
    const family = await this.dataService.getFamily(familyId);
    if (!family) {
      return [];
    }
    return family.members;
  }

  async updateFamilyName(familyId: string, name: string): Promise<Family> {
    const family = await this.dataService.getFamily(familyId);
    if (!family) {
      throw new Error('Family not found');
    }

    await this.dataService.updateFamily(familyId, { name });

    const updated = await this.dataService.getFamily(familyId);
    if (!updated) {
      throw new Error('Family not found after update');
    }
    return updated;
  }

  /**
   * Who is allowed to remove members (SA-15).
   *
   * `ownerId` is set at creation on every path. Families created before
   * 2026-09-08 predate the field; for those, fall back to the earliest-joined
   * member, who is the creator — both creation paths start the family with
   * `members: [creator]`. Ties are broken by array order for determinism, so
   * this never resolves to "whoever happens to be first today".
   */
  resolveOwnerId(family: Family): string | undefined {
    if (family.ownerId) return family.ownerId;
    if (family.members.length === 0) return undefined;
    return family.members.reduce((earliest, m) =>
      m.joinedAt < earliest.joinedAt ? m : earliest
    ).userId;
  }

  /**
   * @param actorUserId the user making the request. Required — the guards below
   *   are meaningless without it.
   *
   * Guarded here rather than in the route so the checks cannot be skipped by a
   * future caller. SA-12 records the cost of the opposite arrangement: a control
   * that depends on which door the request came through is one a new door
   * silently bypasses.
   */
  async removeMember(familyId: string, targetUserId: string, actorUserId: string): Promise<Family> {
    // These were plain Errors, which the handler maps to 500. A caller mistake
    // and an authorization denial are not server faults, and reporting them as
    // such hides the control from anything watching error rates.
    const family = await this.dataService.getFamily(familyId);
    if (!family) {
      throw new NotFoundError('Family not found');
    }

    // Cannot remove the last member
    if (family.members.length <= 1) {
      throw new ValidationError('Cannot remove the last member of a family');
    }

    // Verify target is actually a member
    const memberIndex = family.members.findIndex(m => m.userId === targetUserId);
    if (memberIndex === -1) {
      throw new ValidationError('User is not a member of this family');
    }

    // The actor must belong to the family they are acting on. familyId comes
    // from the caller's own token today, so this is belt-and-braces — but it is
    // the assumption every check below rests on, so it is asserted rather than
    // assumed.
    if (!family.members.some(m => m.userId === actorUserId)) {
      throw new ForbiddenError('Only a member of this family can remove members');
    }

    // Self-removal is rejected. It is indistinguishable from the destructive
    // case and strictly worse for the user: removing your own last workspace
    // blanks your familyId, and the next login provisions a brand-new empty
    // family, so it presents as total data loss rather than as leaving.
    if (targetUserId === actorUserId) {
      throw new ForbiddenError('You cannot remove yourself from a family');
    }

    // Only the owner may remove someone else. Without this, a single
    // compromised token — or one mis-aimed API call — orphans the other member
    // from every budget, transaction and linked account.
    const ownerId = this.resolveOwnerId(family);
    if (ownerId && actorUserId !== ownerId) {
      throw new ForbiddenError('Only the family owner can remove members');
    }

    // Remove from family members array
    const updatedMembers = family.members.filter(m => m.userId !== targetUserId);
    await this.dataService.updateFamily(familyId, {
      members: updatedMembers,
    });

    // Array-aware membership update (D3):
    // Remove this workspace from the target user's workspaceIds array.
    // If it was the active workspace, repoint to another membership.
    const targetUser = await this.dataService.getUser(targetUserId);
    if (targetUser) {
      const currentIds = targetUser.workspaceIds ?? [targetUser.familyId];
      const updatedIds = currentIds.filter(id => id !== familyId);

      let newFamilyId = targetUser.familyId;
      let newActiveId = targetUser.activeWorkspaceId ?? targetUser.familyId;

      if (updatedIds.length > 0) {
        // Repoint active workspace if we just removed it
        if (!updatedIds.includes(newActiveId)) {
          newActiveId = updatedIds[0];
          newFamilyId = newActiveId;
        }
      } else {
        // Last workspace removed — reset to empty (next login creates a new family)
        newFamilyId = '';
        newActiveId = '';
      }

      await this.dataService.updateUser(targetUserId, {
        familyId: newFamilyId,
        workspaceIds: updatedIds,
        activeWorkspaceId: newActiveId,
      } as Partial<User>);
    } else {
      // Fallback: clear familyId as before
      await this.dataService.updateUser(targetUserId, {
        familyId: '',
      } as Partial<User>);
    }

    const updated = await this.dataService.getFamily(familyId);
    if (!updated) {
      throw new Error('Family not found after update');
    }
    return updated;
  }

  createInvitation(familyId: string, createdBy: string): InvitationResult {
    // Clean up expired invitations
    this.cleanupExpiredInvitations();

    // Generate 8-character alphanumeric code
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + this.INVITATION_TTL);

    this.invitations.set(code, {
      code,
      familyId,
      createdBy,
      expiresAt,
      used: false,
    });

    return {
      code,
      expiresAt: expiresAt.toISOString(),
    };
  }

  validateInvitation(code: string): { valid: boolean; familyId?: string; error?: string } {
    const invitation = this.invitations.get(code.toUpperCase());

    if (!invitation) {
      return { valid: false, error: 'Invalid invitation code' };
    }

    if (invitation.used) {
      return { valid: false, error: 'Invitation code has already been used' };
    }

    if (new Date() > invitation.expiresAt) {
      this.invitations.delete(code.toUpperCase());
      return { valid: false, error: 'Invitation code has expired' };
    }

    return { valid: true, familyId: invitation.familyId };
  }

  async consumeInvitation(code: string, userId: string, displayName: string): Promise<Family> {
    const upperCode = code.toUpperCase();
    const validation = this.validateInvitation(upperCode);

    if (!validation.valid || !validation.familyId) {
      throw new Error(validation.error || 'Invalid invitation code');
    }

    const family = await this.dataService.getFamily(validation.familyId);
    if (!family) {
      throw new Error('Family no longer exists');
    }

    // Mark invitation as used
    const invitation = this.invitations.get(upperCode);
    if (invitation) {
      invitation.used = true;
    }

    // Add user to family
    const newMember: FamilyMember = {
      userId,
      displayName,
      joinedAt: new Date().toISOString(),
    };

    await this.dataService.updateFamily(validation.familyId, {
      members: [...family.members, newMember],
    });

    // Array-aware membership update (D3):
    // Push this workspace into the user's workspaceIds without overwriting.
    // If user has no prior workspace, this is effectively a first-time join.
    const joiningUser = await this.dataService.getUser(userId);
    const currentIds = joiningUser?.workspaceIds && joiningUser.workspaceIds.length > 0
      ? joiningUser.workspaceIds
      : joiningUser?.familyId ? [joiningUser.familyId] : [];

    const newIds = currentIds.includes(validation.familyId)
      ? currentIds
      : [...currentIds, validation.familyId];

    // activeWorkspaceId: set to this workspace only if user had none before
    const isFirst = currentIds.length === 0;
    const updates: Partial<User> = {
      familyId: validation.familyId,
      workspaceIds: newIds,
      ...(isFirst ? { activeWorkspaceId: validation.familyId } : {}),
    };
    await this.dataService.updateUser(userId, updates);

    const updated = await this.dataService.getFamily(validation.familyId);
    if (!updated) {
      throw new Error('Family not found after update');
    }
    return updated;
  }

  /**
   * Create a new workspace (a new Family partition) and add the caller as its
   * sole member.  Pushes the new familyId into the user's workspaceIds without
   * replacing the existing memberships (D1/D2).
   *
   * If workspaceType === 'business', seeds the business category taxonomy via
   * the categorySeeder (Phase 3.2).
   */
  async createWorkspace(
    userId: string,
    name: string,
    workspaceType: WorkspaceType,
  ): Promise<Family> {
    const user = await this.dataService.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const now = new Date().toISOString();
    const familyId = uuidv4();

    const member: FamilyMember = {
      userId,
      displayName: user.displayName,
      joinedAt: now,
    };

    const family: Family = {
      id: familyId,
      name,
      members: [member],
      workspaceType,
      createdAt: now,
      updatedAt: now,
      ownerId: userId,
    };

    await this.dataService.createFamily(family);

    // Push new workspace into user's membership list without replacing
    const currentIds = user.workspaceIds && user.workspaceIds.length > 0
      ? user.workspaceIds
      : [user.familyId];

    await this.dataService.updateUser(userId, {
      workspaceIds: [...currentIds, familyId],
    });

    // Seed categories for business workspaces (REQ-008, Phase 3.2)
    if (workspaceType === 'business' && this.categorySeeder) {
      await this.categorySeeder.seedCategoriesForWorkspaceType(familyId, 'business');
    }

    return family;
  }

  /**
   * Mark an invitation code as used. Called after successful registration
   * with a join code, so the code cannot be reused.
   */
  markInvitationUsed(code: string): void {
    const invitation = this.invitations.get(code.toUpperCase());
    if (invitation) {
      invitation.used = true;
    }
  }

  /**
   * Reset all invitation state - FOR TESTING ONLY
   */
  resetInvitations(): void {
    if (process.env.NODE_ENV === 'test') {
      this.invitations.clear();
    }
  }

  private cleanupExpiredInvitations(): void {
    const now = new Date();
    for (const [code, invitation] of this.invitations) {
      if (now > invitation.expiresAt || invitation.used) {
        this.invitations.delete(code);
      }
    }
  }
}
