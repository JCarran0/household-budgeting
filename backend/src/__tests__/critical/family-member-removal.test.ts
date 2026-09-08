import request from 'supertest';
import app from '../../app';
import { familyService, dataService } from '../../services';
import { registerUser, registerUserWithJoinCode } from '../helpers/apiHelper';
import type { Family } from '../../shared/types';

const PASSWORD = 'secure-test-passphrase-long-enough';
const rand = (p: string) => `${p}${Math.random().toString(36).slice(2, 8)}`;

/** Owner registers, then invites a second member into the same family. */
async function familyOfTwo() {
  const owner = await registerUser(rand('owner'), PASSWORD);
  const invite = await request(app)
    .post('/api/v1/family/invite')
    .set('Authorization', `Bearer ${owner.token}`)
    .expect(201);
  const code = invite.body.invitation.code;
  const member = await registerUserWithJoinCode(rand('member'), PASSWORD, code);
  return { owner, member };
}

const removeAs = (actorToken: string, targetUserId: string) =>
  request(app)
    .delete(`/api/v1/family/members/${targetUserId}`)
    .set('Authorization', `Bearer ${actorToken}`);

/**
 * SA-15. `DELETE /family/members/:id` took an arbitrary target with no check
 * that the caller was the owner, that the target wasn't the caller, or that the
 * target wasn't the last member. One compromised token or one mis-aimed call
 * orphaned the other member from every budget, transaction and linked account —
 * and because the next login provisions a fresh empty family, it presents to
 * them as total data loss rather than as an access change.
 */
describe('SA-15: removing a family member', () => {
  it('lets the owner remove another member', async () => {
    const { owner, member } = await familyOfTwo();
    await removeAs(owner.token, member.userId).expect(200);

    const family = await dataService.getFamily(owner.familyId);
    expect(family?.members.map(m => m.userId)).not.toContain(member.userId);
  });

  it('refuses a non-owner removing the owner — the orphaning scenario', async () => {
    const { owner, member } = await familyOfTwo();
    const res = await removeAs(member.token, owner.userId).expect(403);
    expect(res.body.error).toMatch(/owner/i);

    const family = await dataService.getFamily(owner.familyId);
    expect(family?.members.map(m => m.userId)).toContain(owner.userId);
  });

  it('refuses self-removal, by the owner and by a member alike', async () => {
    const { owner, member } = await familyOfTwo();
    await removeAs(owner.token, owner.userId).expect(403);
    await removeAs(member.token, member.userId).expect(403);

    const family = await dataService.getFamily(owner.familyId);
    expect(family?.members).toHaveLength(2);
  });

  it('leaves the target fully intact after a refused removal', async () => {
    const { owner, member } = await familyOfTwo();
    await removeAs(member.token, owner.userId).expect(403);

    // The orphaning happens in storage, not in the response — assert the user
    // record the exploit would have blanked.
    const stored = await dataService.getUser(owner.userId);
    expect(stored?.familyId).toBe(owner.familyId);
    expect(stored?.workspaceIds).toContain(owner.familyId);
  });

  it('refuses removing the last remaining member', async () => {
    // A solo user removing themselves trips both the last-member and the
    // self-removal guard. The last-member check runs first and is the more
    // useful message, so this is a 400 rather than the 403 self-removal gives
    // in a family of two. Asserted explicitly so the ordering is a decision on
    // record rather than an accident.
    const solo = await registerUser(rand('solo'), PASSWORD);
    const res = await removeAs(solo.token, solo.userId).expect(400);
    expect(res.body.error).toMatch(/last member/i);

    const family = await dataService.getFamily(solo.familyId);
    expect(family?.members).toHaveLength(1);
  });

  it('reports a non-member target as a client error, not a 500', async () => {
    const { owner } = await familyOfTwo();
    const outsider = await registerUser(rand('outsider'), PASSWORD);
    const res = await removeAs(owner.token, outsider.userId);
    expect(res.status).toBe(400);
  });
});

describe('SA-15: owner resolution for families created before ownerId existed', () => {
  const family = (overrides: Partial<Family>): Family => ({
    id: 'f1',
    name: 'Legacy',
    members: [
      { userId: 'second', displayName: 'Second', joinedAt: '2026-02-01T00:00:00.000Z' },
      { userId: 'founder', displayName: 'Founder', joinedAt: '2026-01-01T00:00:00.000Z' },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });

  it('prefers an explicit ownerId', () => {
    expect(familyService.resolveOwnerId(family({ ownerId: 'second' }))).toBe('second');
  });

  it('falls back to the earliest-joined member, not array order', () => {
    // 'second' is first in the array but joined later; the founder must win.
    expect(familyService.resolveOwnerId(family({}))).toBe('founder');
  });

  it('returns undefined for an empty family rather than guessing', () => {
    expect(familyService.resolveOwnerId(family({ members: [] }))).toBeUndefined();
  });
});
