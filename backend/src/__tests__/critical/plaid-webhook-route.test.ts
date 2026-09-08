import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../../app';
import { plaidService, plaidWebhookService } from '../../services';
import type { PlaidJwk } from '../../services/plaidWebhookVerification';

const WEBHOOK = '/api/v1/plaid/webhook';
const KID = 'route-test-key';

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = { ...(publicKey.export({ format: 'jwk' }) as PlaidJwk), kid: KID };

/** Stand in for Plaid's key endpoint; the network is never touched. */
function stubKeyLookup() {
  return jest
    .spyOn(plaidService as unknown as { getWebhookVerificationKey: (k: string) => Promise<PlaidJwk | null> },
           'getWebhookVerificationKey')
    .mockImplementation(async (keyId: string) => (keyId === KID ? jwk : null));
}

function signFor(body: string) {
  return jwt.sign(
    {
      iat: Math.floor(Date.now() / 1000),
      request_body_sha256: crypto.createHash('sha256').update(body).digest('hex'),
    },
    privateKey,
    { algorithm: 'ES256', header: { alg: 'ES256', kid: KID } },
  );
}

const PAYLOAD = { webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE', item_id: 'item-unknown' };

/**
 * TD-021. The route is public — Plaid holds no credentials of ours — so the JWT
 * signature is the only thing standing between the internet and a handler that
 * mutates account state and triggers syncs.
 */
describe('POST /plaid/webhook', () => {
  let keySpy: ReturnType<typeof stubKeyLookup>;
  let handleSpy: jest.SpyInstance;

  beforeEach(() => {
    keySpy = stubKeyLookup();
    handleSpy = jest.spyOn(plaidWebhookService, 'handle').mockResolvedValue({
      handled: false,
      reason: 'unknown_item',
    });
  });

  afterEach(() => {
    keySpy.mockRestore();
    handleSpy.mockRestore();
  });

  it('accepts a correctly signed webhook and dispatches it', async () => {
    const body = JSON.stringify(PAYLOAD);
    await request(app)
      .post(WEBHOOK)
      .set('Content-Type', 'application/json')
      .set('Plaid-Verification', signFor(body))
      .send(body)
      .expect(200);

    expect(handleSpy).toHaveBeenCalledTimes(1);
    expect(handleSpy.mock.calls[0][0]).toMatchObject({ webhook_code: 'SYNC_UPDATES_AVAILABLE' });
  });

  it('rejects an unsigned webhook and never reaches the handler', async () => {
    await request(app).post(WEBHOOK).send(PAYLOAD).expect(401);
    expect(handleSpy).not.toHaveBeenCalled();
  });

  it('rejects a forged alg=none token', async () => {
    const body = JSON.stringify(PAYLOAD);
    const forged = jwt.sign(
      {
        iat: Math.floor(Date.now() / 1000),
        request_body_sha256: crypto.createHash('sha256').update(body).digest('hex'),
      },
      '',
      { algorithm: 'none', header: { alg: 'none', kid: KID } },
    );
    await request(app)
      .post(WEBHOOK)
      .set('Content-Type', 'application/json')
      .set('Plaid-Verification', forged)
      .send(body)
      .expect(401);
    expect(handleSpy).not.toHaveBeenCalled();
  });

  it('rejects a valid signature over different content — the envelope reuse case', async () => {
    const signed = JSON.stringify(PAYLOAD);
    const token = signFor(signed);
    const swapped = JSON.stringify({ ...PAYLOAD, webhook_code: 'ERROR', item_id: 'attacker-chosen' });

    await request(app)
      .post(WEBHOOK)
      .set('Content-Type', 'application/json')
      .set('Plaid-Verification', token)
      .send(swapped)
      .expect(401);
    expect(handleSpy).not.toHaveBeenCalled();
  });

  it('does not disclose which check failed', async () => {
    const res = await request(app).post(WEBHOOK).send(PAYLOAD).expect(401);
    expect(JSON.stringify(res.body)).not.toMatch(/missing_header|signature|kid|stale/i);
  });

  it('still answers 200 when handling throws — a notification is not a request for work', async () => {
    handleSpy.mockRejectedValue(new Error('sync exploded'));
    const body = JSON.stringify(PAYLOAD);
    await request(app)
      .post(WEBHOOK)
      .set('Content-Type', 'application/json')
      .set('Plaid-Verification', signFor(body))
      .send(body)
      .expect(200);
  });
});
