/**
 * Family Auth & Management Integration Tests
 *
 * Tests for Phase 5-7 family features: registration with families,
 * join codes, family management API, and membership verification.
 */

import request from 'supertest';
import app from '../../app';
import {
  registerUser,
  registerUserWithJoinCode,
  loginUser,
  authenticatedGet,
  authenticatedPost,
  authenticatedPut,
  authenticatedDelete,
} from '../helpers/apiHelper';
import { authService, dataService, familyService } from '../../services';

describe('Family Auth & Management', () => {
  beforeEach(async () => {
    if ('clear' in dataService) {
      (dataService as unknown as { clear: () => void }).clear();
    }
    authService.resetRateLimiting();
    familyService.resetInvitations();
  });

  const rand = () => Math.random().toString(36).substring(2, 8);

  describe('Registration creates a family', () => {
    test('new user gets a family with themselves as the only member', async () => {
      const r = rand();
      const user = await registerUser(`usr${r}`, 'my secure passphrase here');

      expect(user.familyId).toBeDefined();

      const family = await familyService.getFamily(user.familyId);
      expect(family).not.toBeNull();
      expect(family!.members).toHaveLength(1);
      expect(family!.members[0].userId).toBe(user.userId);
    });

    test('login returns familyId in response', async () => {
      const r = rand();
      await registerUser(`usr${r}`, 'my secure passphrase here');
      const user = await loginUser(`usr${r}`, 'my secure passphrase here');

      expect(user.familyId).toBeDefined();
      expect(user.familyId).toHaveLength(36); // UUID
    });
  });

  describe('Registration with join code', () => {
    test('user joins existing family when registering with a valid code', async () => {
      const r = rand();
      const user1 = await registerUser(`u1${r}`, 'user one secure passphrase');

      // Generate invitation
      const invitation = familyService.createInvitation(user1.familyId, user1.userId);

      // Register with join code
      const user2 = await registerUserWithJoinCode(
        `u2${r}`,
        'user two secure passphrase',
        invitation.code,
        'User Two',
      );

      // Both should be in the same family
      expect(user2.familyId).toBe(user1.familyId);

      const family = await familyService.getFamily(user1.familyId);
      expect(family!.members).toHaveLength(2);
      expect(family!.members.map(m => m.userId)).toContain(user1.userId);
      expect(family!.members.map(m => m.userId)).toContain(user2.userId);
    });

    test('registration fails with invalid join code', async () => {
      const r = rand();
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          username: `usr${r}`,
          password: 'my secure passphrase here',
          displayName: 'Test',
          joinCode: 'BADCODE1',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid invitation code');
    });

    test('join code is single-use', async () => {
      const r = rand();
      const user1 = await registerUser(`u1${r}`, 'user one secure passphrase');
      const invitation = familyService.createInvitation(user1.familyId, user1.userId);

      // First use succeeds
      await registerUserWithJoinCode(
        `u2${r}`,
        'user two secure passphrase',
        invitation.code,
      );

      // Second use fails
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          username: `u3${r}`,
          password: 'user three secure pass',
          displayName: `u3${r}`,
          joinCode: invitation.code,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('already been used');
    });
  });

  describe('Family management API', () => {
    test('GET /family returns current family with members', async () => {
      const r = rand();
      const user = await registerUser(`usr${r}`, 'my secure passphrase here', 'TestUser');

      const response = await authenticatedGet('/api/v1/family', user.token);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.family.id).toBe(user.familyId);
      expect(response.body.family.members).toHaveLength(1);
      expect(response.body.family.members[0].displayName).toBe('TestUser');
    });

    test('PUT /family/name updates family name', async () => {
      const r = rand();
      const user = await registerUser(`usr${r}`, 'my secure passphrase here');

      const response = await authenticatedPut('/api/v1/family/name', user.token, {
        name: 'The Smith Family',
      });

      expect(response.status).toBe(200);
      expect(response.body.family.name).toBe('The Smith Family');
    });

    test('POST /family/invite generates an invitation code', async () => {
      const r = rand();
      const user = await registerUser(`usr${r}`, 'my secure passphrase here');

      const response = await authenticatedPost('/api/v1/family/invite', user.token);

      expect(response.status).toBe(201);
      expect(response.body.invitation.code).toHaveLength(8);
      expect(response.body.invitation.expiresAt).toBeDefined();
    });

    test('cannot remove the last family member', async () => {
      const r = rand();
      const user = await registerUser(`usr${r}`, 'my secure passphrase here');

      const response = await authenticatedDelete(
        `/api/v1/family/members/${user.userId}`,
        user.token,
      );

      expect(response.status).toBe(500);
      expect(response.body).toBeDefined();
    });

    test('can remove a non-last family member', async () => {
      const r = rand();
      const user1 = await registerUser(`u1${r}`, 'user one secure passphrase');
      const invitation = familyService.createInvitation(user1.familyId, user1.userId);
      const user2 = await registerUserWithJoinCode(
        `u2${r}`,
        'user two secure passphrase',
        invitation.code,
      );

      // Remove user2
      const response = await authenticatedDelete(
        `/api/v1/family/members/${user2.userId}`,
        user1.token,
      );

      expect(response.status).toBe(200);
      expect(response.body.family.members).toHaveLength(1);
      expect(response.body.family.members[0].userId).toBe(user1.userId);
    });
  });

  describe('Profile API', () => {
    test('PUT /auth/profile updates display name', async () => {
      const r = rand();
      const user = await registerUser(`usr${r}`, 'my secure passphrase here', 'OldName');

      const response = await authenticatedPut('/api/v1/auth/profile', user.token, {
        displayName: 'NewName',
      });

      expect(response.status).toBe(200);
      expect(response.body.user.displayName).toBe('NewName');

      // Verify it also updated in family members
      const family = await familyService.getFamily(user.familyId);
      expect(family!.members[0].displayName).toBe('NewName');
    });
  });
});
