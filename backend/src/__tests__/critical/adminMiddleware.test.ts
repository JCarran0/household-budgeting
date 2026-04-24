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

  it('auto-promotes a user listed in ADMIN_USERNAMES and persists isAdmin to storage', async () => {
    const username = `seeded${Math.random().toString(36).slice(2, 8)}`;
    const user = await registerUser(username, 'secure-test-passphrase-long-enough');

    // Before the env var is set the user is rejected.
    await request(app)
      .get(MIGRATION_STATUS_ENDPOINT)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(403);

    // Seed the env var with the same username (case-insensitive).
    process.env.ADMIN_USERNAMES = `other,${username.toUpperCase()},extra`;

    const response = await request(app)
      .get(MIGRATION_STATUS_ENDPOINT)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    expect(response.body).toHaveProperty('totalCategories');

    // The bootstrap path must persist isAdmin so later calls don't depend on
    // the env var staying set.
    const persisted = await dataService.getUser(user.userId);
    expect(persisted?.isAdmin).toBe(true);

    // Clearing the env var must NOT revoke the now-persisted flag.
    delete process.env.ADMIN_USERNAMES;
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
