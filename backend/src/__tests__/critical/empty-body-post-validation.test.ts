/**
 * Regression — a body-less POST must not be rejected as "Invalid request data".
 *
 * Express 5 (body-parser 2.x) leaves `req.body` as `undefined` when the request
 * carries no body at all, where Express 4 left `{}`. Several endpoints take only
 * optional fields and are called by the frontend with no body — `axios.post(url)`
 * sends nothing. Passing `undefined` to a Zod object schema fails, so the
 * account-level resync button returned 400 "Invalid request data" for every user.
 *
 * The assertion is deliberately "not 400 with that message": with no connected
 * account the route legitimately 404s, and reaching the 404 proves validation
 * accepted the empty body.
 */

import request from 'supertest';
import app from '../../app';
import { registerUser } from '../helpers/apiHelper';

describe('POST endpoints with all-optional bodies accept an empty body', () => {
  let authToken: string;

  beforeEach(async () => {
    const username = `body${Math.random().toString(36).substring(2, 8)}`;
    const user = await registerUser(username, 'this is my secure empty body validation passphrase');
    authToken = user.token;
  });

  it('POST /accounts/:accountId/sync-transactions does not 400 on a body-less request', async () => {
    const response = await request(app)
      .post('/api/v1/accounts/no-such-account/sync-transactions')
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).not.toBe(400);
    expect(response.body.error).not.toBe('Invalid request data');
  });

  it('POST /transactions/sync does not 400 on a body-less request', async () => {
    const response = await request(app)
      .post('/api/v1/transactions/sync')
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).not.toBe(400);
    expect(response.body.error).not.toBe('Invalid request data');
  });
});
