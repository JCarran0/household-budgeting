import crypto from 'crypto';
import { DataService, User } from './dataService';
import type { Family, FamilyMember } from '../shared/types';

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
  private invitations: Map<string, Invitation> = new Map();
  private readonly INVITATION_TTL = 48 * 60 * 60 * 1000; // 48 hours

  constructor(dataService: DataService) {
    this.dataService = dataService;
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

  async removeMember(familyId: string, targetUserId: string): Promise<Family> {
    const family = await this.dataService.getFamily(familyId);
    if (!family) {
      throw new Error('Family not found');
    }

    // Cannot remove the last member
    if (family.members.length <= 1) {
      throw new Error('Cannot remove the last member of a family');
    }

    // Verify target is actually a member
    const memberIndex = family.members.findIndex(m => m.userId === targetUserId);
    if (memberIndex === -1) {
      throw new Error('User is not a member of this family');
    }

    // Remove from family members array
    const updatedMembers = family.members.filter(m => m.userId !== targetUserId);
    await this.dataService.updateFamily(familyId, {
      members: updatedMembers,
    });

    // Clear the user's familyId so their next login creates a new solo family
    await this.dataService.updateUser(targetUserId, {
      familyId: '',
    } as Partial<User>);

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

    // Update user's familyId
    await this.dataService.updateUser(userId, {
      familyId: validation.familyId,
    } as Partial<User>);

    const updated = await this.dataService.getFamily(validation.familyId);
    if (!updated) {
      throw new Error('Family not found after update');
    }
    return updated;
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
