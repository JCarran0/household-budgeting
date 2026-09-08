import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
  verifyPlaidWebhook,
  VerificationKeyCache,
  MAX_WEBHOOK_AGE_SECONDS,
  type PlaidJwk,
} from '../../services/plaidWebhookVerification';

const KID = 'test-key-1';
const NOW_MS = 1_757_000_000_000;

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = { ...(publicKey.export({ format: 'jwk' }) as PlaidJwk), kid: KID };

const otherPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

const sha256 = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');
const fetchKey = async (keyId: string) => (keyId === KID ? jwk : null);
const now = () => NOW_MS;

function sign(body: Buffer, opts: { iat?: number; key?: crypto.KeyObject; kid?: string } = {}) {
  return jwt.sign(
    { iat: opts.iat ?? Math.floor(NOW_MS / 1000), request_body_sha256: sha256(body) },
    opts.key ?? privateKey,
    { algorithm: 'ES256', header: { alg: 'ES256', kid: opts.kid ?? KID } },
  );
}

const BODY = Buffer.from(JSON.stringify({ webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE' }));

/**
 * TD-021 step 3. The previous implementation read the header, ignored it, and
 * returned true. A receiver route wired to that would have accepted forged
 * webhooks from anyone on the internet, so these cases are the reason the route
 * was allowed to exist at all.
 */
describe('Plaid webhook verification', () => {
  it('accepts a correctly signed, fresh webhook', async () => {
    const res = await verifyPlaidWebhook(sign(BODY), BODY, fetchKey, now);
    expect(res).toEqual({ valid: true });
  });

  it('rejects a missing header rather than defaulting open', async () => {
    expect(await verifyPlaidWebhook(undefined, BODY, fetchKey, now))
      .toEqual({ valid: false, reason: 'missing_header' });
  });

  it('rejects garbage that is not a JWT', async () => {
    expect(await verifyPlaidWebhook('not-a-token', BODY, fetchKey, now))
      .toEqual({ valid: false, reason: 'malformed_token' });
  });

  // The two algorithm-confusion forgeries. Both are accepted by a verifier that
  // trusts the token's own `alg`.
  it('rejects alg=none', async () => {
    const forged = jwt.sign(
      { iat: Math.floor(NOW_MS / 1000), request_body_sha256: sha256(BODY) },
      '',
      { algorithm: 'none', header: { alg: 'none', kid: KID } },
    );
    expect(await verifyPlaidWebhook(forged, BODY, fetchKey, now))
      .toEqual({ valid: false, reason: 'unsupported_algorithm' });
  });

  it('rejects HS256 signed with the public key as the HMAC secret', async () => {
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const forged = jwt.sign(
      { iat: Math.floor(NOW_MS / 1000), request_body_sha256: sha256(BODY) },
      pem,
      { algorithm: 'HS256', header: { alg: 'HS256', kid: KID } },
    );
    expect(await verifyPlaidWebhook(forged, BODY, fetchKey, now))
      .toEqual({ valid: false, reason: 'unsupported_algorithm' });
  });

  it('rejects a signature from a key Plaid does not publish', async () => {
    const forged = sign(BODY, { key: otherPair.privateKey });
    expect(await verifyPlaidWebhook(forged, BODY, fetchKey, now))
      .toEqual({ valid: false, reason: 'bad_signature' });
  });

  it('rejects an unknown kid', async () => {
    expect(await verifyPlaidWebhook(sign(BODY, { kid: 'nope' }), BODY, fetchKey, now))
      .toEqual({ valid: false, reason: 'unknown_key' });
  });

  it('rejects a replay older than the tolerance', async () => {
    const stale = sign(BODY, { iat: Math.floor(NOW_MS / 1000) - MAX_WEBHOOK_AGE_SECONDS - 1 });
    expect(await verifyPlaidWebhook(stale, BODY, fetchKey, now))
      .toEqual({ valid: false, reason: 'stale' });
  });

  it('still accepts one just inside the tolerance', async () => {
    const edge = sign(BODY, { iat: Math.floor(NOW_MS / 1000) - MAX_WEBHOOK_AGE_SECONDS + 1 });
    expect(await verifyPlaidWebhook(edge, BODY, fetchKey, now)).toEqual({ valid: true });
  });

  // The envelope-reuse forgery: a genuine, freshly-signed token wrapped around
  // a different payload.
  it('rejects a valid token paired with a different body', async () => {
    const token = sign(BODY);
    const tampered = Buffer.from(JSON.stringify({ webhook_type: 'ITEM', webhook_code: 'ERROR' }));
    expect(await verifyPlaidWebhook(token, tampered, fetchKey, now))
      .toEqual({ valid: false, reason: 'body_mismatch' });
  });

  it('rejects a single flipped byte in the body', async () => {
    const token = sign(BODY);
    const tampered = Buffer.from(BODY);
    tampered[tampered.length - 2] ^= 0x01;
    expect(await verifyPlaidWebhook(token, tampered, fetchKey, now))
      .toEqual({ valid: false, reason: 'body_mismatch' });
  });

  it('rejects when the raw body was never captured', async () => {
    expect(await verifyPlaidWebhook(sign(BODY), undefined, fetchKey, now))
      .toEqual({ valid: false, reason: 'body_mismatch' });
  });

  it('rejects a token carrying no body hash at all', async () => {
    const noHash = jwt.sign({ iat: Math.floor(NOW_MS / 1000) }, privateKey, {
      algorithm: 'ES256', header: { alg: 'ES256', kid: KID },
    });
    expect(await verifyPlaidWebhook(noHash, BODY, fetchKey, now))
      .toEqual({ valid: false, reason: 'body_mismatch' });
  });
});

describe('VerificationKeyCache', () => {
  it('returns a cached key and expires it after the TTL', () => {
    let t = 1000;
    const cache = new VerificationKeyCache(500, 32, () => t);
    cache.set(KID, jwk);
    expect(cache.get(KID)).toBe(jwk);
    t += 501;
    // Plaid rotates keys; a permanently cached one would reject valid webhooks.
    expect(cache.get(KID)).toBeUndefined();
  });

  it('bounds its size by evicting the oldest entry', () => {
    const cache = new VerificationKeyCache(60_000, 2, () => 0);
    cache.set('a', jwk); cache.set('b', jwk); cache.set('c', jwk);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(jwk);
    expect(cache.get('c')).toBe(jwk);
  });
});
