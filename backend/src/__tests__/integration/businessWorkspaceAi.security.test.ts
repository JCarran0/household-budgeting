/**
 * Business Workspace AI exclusion — REQ-P016, AI-CAPABILITY-PLATFORM-BRD §3.3, §11
 *
 * The Business Workspace holds Amazon royalties held in trust for a client.
 * That money is not the family's, so the BRD excludes the workspace from AI
 * entirely — reads included, not just writes. This is a fiduciary boundary,
 * not a privacy preference.
 *
 * The exclusion previously existed only as an optional `aiEnabled` flag that no
 * caller passed and a hidden button on the frontend. Neither is a control: the
 * JWT carries the active familyId, so a token minted in the business workspace
 * could reach every chatbot route and read trust-ledger transactions. These
 * tests cover the route guard that actually refuses it.
 */

import request from 'supertest';
import app from '../../app';
import { dataService, authService, familyService } from '../../services';
import { registerUser } from '../helpers/apiHelper';

async function createUser(prefix: string) {
  const rand = Math.random().toString(36).substring(2, 8);
  return registerUser(`${prefix}${rand}`, 'secure-test-passphrase-long-enough');
}

/**
 * Create a business workspace and return a JWT scoped to it.
 *
 * Goes through familyService rather than POST /workspaces, which is admin-only
 * (D10) — the thing under test is what a business-scoped token can reach, not
 * who may create the workspace.
 */
async function businessToken(userId: string, personalToken: string): Promise<string> {
  const family = await familyService.createWorkspace(userId, 'Trust Ledger', 'business');
  expect(family.workspaceType).toBe('business');
  const familyId = family.id;

  const switched = await request(app)
    .post('/api/v1/auth/switch-workspace')
    .set('Authorization', `Bearer ${personalToken}`)
    .send({ familyId })
    .expect(200);

  const token = switched.body.accessToken ?? switched.body.data?.accessToken ?? switched.body.token;
  expect(typeof token).toBe('string');
  return token as string;
}

beforeEach(() => {
  if ('clear' in dataService) {
    (dataService as unknown as { clear: () => void }).clear();
  }
  authService.resetRateLimiting();
});

describe('AI routes are refused in the business workspace (REQ-P016)', () => {
  it('POST /chatbot/message is refused — reads are excluded, not just writes', async () => {
    const user = await createUser('bizai');
    const token = await businessToken(user.userId, user.token);

    const res = await request(app)
      .post('/api/v1/chatbot/message')
      .set('Authorization', `Bearer ${token}`)
      .send({
        message: 'where did our money go last quarter?',
        conversationId: '11111111-1111-4111-8111-111111111111',
        conversationHistory: [],
        model: 'haiku',
      })
      .expect(403);

    expect(res.body.code).toBe('AI_NOT_AVAILABLE_IN_WORKSPACE');
  });

  it('POST /chatbot/actions/confirm is refused', async () => {
    const user = await createUser('bizai');
    const token = await businessToken(user.userId, user.token);

    await request(app)
      .post('/api/v1/chatbot/actions/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({
        proposalId: '22222222-2222-4222-8222-222222222222',
        rows: [{ rowId: 'row-0', params: { title: 'x' } }],
      })
      .expect(403);
  });

  it('POST /chatbot/classify-transactions is refused', async () => {
    const user = await createUser('bizai');
    const token = await businessToken(user.userId, user.token);

    await request(app)
      .post('/api/v1/chatbot/classify-transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(403);
  });

  it('GET /chatbot/usage is refused', async () => {
    const user = await createUser('bizai');
    const token = await businessToken(user.userId, user.token);

    await request(app)
      .get('/api/v1/chatbot/usage')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });
});

describe('the personal workspace is unaffected (guard is not blanket-deny)', () => {
  it('GET /chatbot/usage still works on a personal token', async () => {
    // The negative assertions above are only meaningful if the guard is
    // actually discriminating. This is the control.
    const user = await createUser('personalai');

    await request(app)
      .get('/api/v1/chatbot/usage')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
  });
});
