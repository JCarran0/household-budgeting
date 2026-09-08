import request from 'supertest';
import app from '../../app';
import { dataService } from '../../services';
import { registerUser } from '../helpers/apiHelper';
import { decideRegistration } from '../../services/registrationPolicy';

const REGISTER = '/api/v1/auth/register';
const MIGRATION_STATUS_ENDPOINT = '/api/v1/admin/savings-migration-status';

const creds = (name: string) => ({
  username: name,
  password: 'secure-test-passphrase-long-enough',
  displayName: name,
});

const rand = (p: string) => `${p}${Math.random().toString(36).slice(2, 8)}`;

/**
 * SA-10. Open registration was individually defensible and so was the
 * ADMIN_USERNAMES bootstrap; together they were a privilege-escalation chain.
 * These tests cover both halves and the chain itself.
 *
 * The suite-wide setup sets ALLOW_OPEN_REGISTRATION=true so fixture-building
 * suites can register freely. Every test here that exercises the *closed* path
 * deletes it first — otherwise this file would assert nothing, which is the
 * SA-11 failure mode.
 */
describe('SA-10: registration is invitation-only', () => {
  const original = process.env.ALLOW_OPEN_REGISTRATION;

  afterEach(() => {
    if (original === undefined) delete process.env.ALLOW_OPEN_REGISTRATION;
    else process.env.ALLOW_OPEN_REGISTRATION = original;
  });

  describe('the policy decision itself', () => {
    beforeEach(() => { delete process.env.ALLOW_OPEN_REGISTRATION; });

    it('allows the very first user so a fresh install can bootstrap', () => {
      expect(decideRegistration(false, [])).toEqual({ allowed: true, reason: 'bootstrap' });
    });

    it('closes as soon as one user exists', () => {
      expect(decideRegistration(false, [{ id: 'u1' }])).toEqual({ allowed: false, reason: 'closed' });
    });

    it('always allows a valid join code', () => {
      expect(decideRegistration(true, [{ id: 'u1' }])).toEqual({ allowed: true, reason: 'join_code' });
    });

    it.each(['false', 'TRUE ', '1', 'yes', ''])(
      'treats ALLOW_OPEN_REGISTRATION=%p as opt-in only when it is exactly true',
      (value) => {
        process.env.ALLOW_OPEN_REGISTRATION = value;
        const expected = value.trim().toLowerCase() === 'true';
        expect(decideRegistration(false, [{ id: 'u1' }]).allowed).toBe(expected);
      },
    );
  });

  describe('through the route', () => {
    it('rejects an uninvited registration with 403 once users exist', async () => {
      await registerUser(rand('seed'), 'secure-test-passphrase-long-enough');
      expect((await dataService.getAllUsers()).length).toBeGreaterThan(0);

      delete process.env.ALLOW_OPEN_REGISTRATION;

      const res = await request(app).post(REGISTER).send(creds(rand('stranger'))).expect(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/invitation only/i);
    });

    it('does not create the user it rejected', async () => {
      await registerUser(rand('seed'), 'secure-test-passphrase-long-enough');
      delete process.env.ALLOW_OPEN_REGISTRATION;

      const username = rand('ghost');
      await request(app).post(REGISTER).send(creds(username)).expect(403);

      const users = await dataService.getAllUsers();
      expect(users.map(u => u.username.toLowerCase())).not.toContain(username.toLowerCase());
    });

    it('still reports an invalid join code as invalid rather than as closed', async () => {
      await registerUser(rand('seed'), 'secure-test-passphrase-long-enough');
      delete process.env.ALLOW_OPEN_REGISTRATION;

      const res = await request(app)
        .post(REGISTER)
        .send({ ...creds(rand('guessing')), joinCode: 'NOT-A-REAL-CODE' })
        .expect(400);
      expect(res.body.error).not.toMatch(/invitation only/i);
    });

    it('does not leak whether the username was already taken', async () => {
      const taken = rand('taken');
      await registerUser(taken, 'secure-test-passphrase-long-enough');
      delete process.env.ALLOW_OPEN_REGISTRATION;

      const existing = await request(app).post(REGISTER).send(creds(taken)).expect(403);
      const novel = await request(app).post(REGISTER).send(creds(rand('novel'))).expect(403);
      expect(existing.body.error).toBe(novel.body.error);
    });
  });

  describe('the escalation chain the audit described', () => {
    it('a stranger cannot claim an allowlisted username and reach admin', async () => {
      // Precondition from the audit: a username in ADMIN_USERNAMES that nobody
      // has registered — a typo, a rename, or an account planned but not made.
      const unclaimed = rand('ghostadmin');
      process.env.ADMIN_USERNAMES = unclaimed;

      await registerUser(rand('seed'), 'secure-test-passphrase-long-enough');
      delete process.env.ALLOW_OPEN_REGISTRATION;

      // Half 1: registration is closed, so the name cannot be claimed at all.
      await request(app).post(REGISTER).send(creds(unclaimed)).expect(403);

      // Half 2: even granted an account, the allowlist confers nothing.
      process.env.ALLOW_OPEN_REGISTRATION = 'true';
      const attacker = await registerUser(unclaimed, 'secure-test-passphrase-long-enough');
      await request(app)
        .get(MIGRATION_STATUS_ENDPOINT)
        .set('Authorization', `Bearer ${attacker.token}`)
        .expect(403);

      delete process.env.ADMIN_USERNAMES;
    });
  });
});
