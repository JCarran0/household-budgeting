/**
 * adminMiddleware integration tests.
 *
 * Exercises the admin gate on `/api/v1/admin/*` through a real HTTP round-trip
 * so the authMiddleware → adminMiddleware chain is validated end-to-end.
 */

import request from 'supertest';
import app from '../../app';
import { dataService } from '../../services';
import { registerUser } from '../helpers/apiHelper';

const MIGRATION_STATUS_ENDPOINT = '/api/v1/admin/migration-status';

beforeEach(() => {
  if ('clear' in dataService) {
    (dataService as unknown as { clear: () => void }).clear();
  }
  // Tests mutate ADMIN_USERNAMES — reset between cases so ordering doesn't
  // leak bootstrap state into a later negative test.
  delete process.env.ADMIN_USERNAMES;
});

describe('adminMiddleware', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const response = await request(app).get(MIGRATION_STATUS_ENDPOINT).expect(401);
    expect(response.body).toMatchObject({ success: false, error: expect.any(String) });
  });

  it('rejects an authenticated non-admin with 403', async () => {
    const user = await registerUser(
      `nonadmin${Math.random().toString(36).slice(2, 8)}`,
      'secure-test-passphrase-long-enough',
    );

    const response = await request(app)
      .get(MIGRATION_STATUS_ENDPOINT)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(403);

    expect(response.body).toMatchObject({
      success: false,
      error: 'Admin privileges required',
    });
  });

  it('allows a user whose stored User.isAdmin === true', async () => {
    const user = await registerUser(
      `admin${Math.random().toString(36).slice(2, 8)}`,
      'secure-test-passphrase-long-enough',
    );

    // Seed the stored flag directly — simulates prior bootstrap.
    await dataService.updateUser(user.userId, { isAdmin: true });

    const response = await request(app)
      .get(MIGRATION_STATUS_ENDPOINT)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    // Endpoint responds with the migration-status shape (AdminService payload),
    // not the middleware's own response.
    expect(response.body).toHaveProperty('totalCategories');
    expect(response.body).toHaveProperty('migrationNeeded');
  });

  // Inverted on 2026-09-08 (SA-10). This used to assert that ADMIN_USERNAMES
  // auto-promoted a matching user. That behaviour is removed: combined with open
  // registration it let anyone claim an unregistered allowlisted username and
  // become admin. The escalation path staying gone is what needs pinning now.
  it('never promotes from ADMIN_USERNAMES, even for an exact case-insensitive match', async () => {
    const username = `seeded${Math.random().toString(36).slice(2, 8)}`;
    const user = await registerUser(username, 'secure-test-passphrase-long-enough');

    process.env.ADMIN_USERNAMES = `other,${username.toUpperCase()},extra`;

    await request(app)
      .get(MIGRATION_STATUS_ENDPOINT)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(403);

    // And nothing was written to storage as a side effect of the attempt.
    const persisted = await dataService.getUser(user.userId);
    expect(persisted?.isAdmin).toBeFalsy();
  });

  it('allows a user whose isAdmin flag is already persisted in storage', async () => {
    // The supported grant path after SA-10: an explicit act on an existing
    // account. This is how the production admin retains access.
    const username = `realadmin${Math.random().toString(36).slice(2, 8)}`;
    const user = await registerUser(username, 'secure-test-passphrase-long-enough');

    await request(app)
      .get(MIGRATION_STATUS_ENDPOINT)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(403);

    await dataService.updateUser(user.userId, { isAdmin: true });

    await request(app)
      .get(MIGRATION_STATUS_ENDPOINT)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
  });

  it('does not promote a user whose username is absent from ADMIN_USERNAMES', async () => {
    const user = await registerUser(
      `notonlist${Math.random().toString(36).slice(2, 8)}`,
      'secure-test-passphrase-long-enough',
    );
    process.env.ADMIN_USERNAMES = 'someone-else,another';

    const response = await request(app)
      .get(MIGRATION_STATUS_ENDPOINT)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(403);

    expect(response.body).toMatchObject({ success: false });

    const persisted = await dataService.getUser(user.userId);
    expect(persisted?.isAdmin).toBeUndefined();
  });
});
