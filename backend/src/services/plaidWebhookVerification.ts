/**
 * Verify that a webhook actually came from Plaid (TD-021 step 3).
 *
 * The previous implementation was a stub that read the `Plaid-Verification`
 * header, ignored it, and `return true`d under a comment saying to implement
 * this properly. Exposing a receiver route wired to that would have accepted
 * forged webhooks from anyone on the internet — which is why TD-021 marks the
 * route and this verification as a single change that must ship together.
 *
 * Plaid signs each webhook with an ES256 JWT in the `Plaid-Verification` header
 * (https://plaid.com/docs/api/webhooks/webhook-verification/). Verification has
 * four parts, and all four matter:
 *
 *   1. The `alg` must be ES256, checked *before* verifying. Accepting whatever
 *      the token declares is the classic algorithm-confusion hole: a forger
 *      would send `alg: none`, or `alg: HS256` signed with the public key as an
 *      HMAC secret, and a naive verifier accepts both.
 *   2. The signature must verify against the key Plaid publishes for the token's
 *      `kid`, fetched from `/webhook_verification_key/get`.
 *   3. `iat` must be recent. Without this, a single valid webhook captured once
 *      can be replayed forever.
 *   4. `request_body_sha256` must equal the SHA-256 of the **raw** request body.
 *      This is what binds the signature to this payload; without it a valid
 *      envelope could be reused around attacker-chosen contents. It must hash
 *      the exact bytes received — `JSON.stringify(req.body)` is a re-encoding,
 *      not the original, and will not match.
 */

import crypto from 'crypto';
import jwt, { type JwtHeader } from 'jsonwebtoken';

/** Plaid's JWKs are EC P-256 public keys. */
export interface PlaidJwk {
  alg?: string;
  crv?: string;
  kid?: string;
  kty?: string;
  use?: string;
  x?: string;
  y?: string;
  [key: string]: unknown;
}

export type KeyFetcher = (keyId: string) => Promise<PlaidJwk | null>;

/** Plaid's documented tolerance. Older tokens are treated as replays. */
export const MAX_WEBHOOK_AGE_SECONDS = 5 * 60;

export type WebhookVerificationFailure =
  | 'missing_header'
  | 'malformed_token'
  | 'unsupported_algorithm'
  | 'unknown_key'
  | 'bad_signature'
  | 'stale'
  | 'body_mismatch';

export type WebhookVerificationResult =
  | { valid: true }
  | { valid: false; reason: WebhookVerificationFailure };

interface PlaidWebhookClaims {
  iat?: number;
  request_body_sha256?: string;
}

/** Constant-time compare of two hex digests of equal expected length. */
function digestsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  // timingSafeEqual throws on length mismatch, which would itself leak.
  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * @param token the raw `Plaid-Verification` header value.
 * @param rawBody the exact bytes of the request body, before any parsing.
 * @param fetchKey resolves a `kid` to Plaid's published JWK. Injected so the
 *   failure modes below can be tested without reaching the network.
 * @param now injectable clock, for the staleness cases.
 */
export async function verifyPlaidWebhook(
  token: string | undefined,
  rawBody: Buffer | undefined,
  fetchKey: KeyFetcher,
  now: () => number = Date.now,
): Promise<WebhookVerificationResult> {
  if (!token) return { valid: false, reason: 'missing_header' };
  if (!rawBody) return { valid: false, reason: 'body_mismatch' };

  let header: JwtHeader;
  try {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded) return { valid: false, reason: 'malformed_token' };
    header = decoded.header;
  } catch {
    return { valid: false, reason: 'malformed_token' };
  }

  // (1) Pin the algorithm from our side before the key is even fetched.
  if (header.alg !== 'ES256') return { valid: false, reason: 'unsupported_algorithm' };
  if (!header.kid) return { valid: false, reason: 'malformed_token' };

  const jwk = await fetchKey(header.kid);
  if (!jwk) return { valid: false, reason: 'unknown_key' };

  let publicKey: crypto.KeyObject;
  try {
    publicKey = crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: 'jwk' });
  } catch {
    return { valid: false, reason: 'unknown_key' };
  }

  // (2) Signature. `algorithms` is passed again here because jsonwebtoken would
  //     otherwise accept anything the token declares.
  let claims: PlaidWebhookClaims;
  try {
    claims = jwt.verify(token, publicKey, { algorithms: ['ES256'] }) as PlaidWebhookClaims;
  } catch {
    return { valid: false, reason: 'bad_signature' };
  }

  // (3) Replay window.
  if (typeof claims.iat !== 'number') return { valid: false, reason: 'stale' };
  const ageSeconds = now() / 1000 - claims.iat;
  if (ageSeconds > MAX_WEBHOOK_AGE_SECONDS) return { valid: false, reason: 'stale' };

  // (4) Bind the signature to this exact payload.
  if (typeof claims.request_body_sha256 !== 'string') {
    return { valid: false, reason: 'body_mismatch' };
  }
  const actual = crypto.createHash('sha256').update(rawBody).digest('hex');
  if (!digestsMatch(actual, claims.request_body_sha256)) {
    return { valid: false, reason: 'body_mismatch' };
  }

  return { valid: true };
}

/**
 * Small bounded cache for verification keys.
 *
 * Plaid rotates these, so an unbounded permanent cache would eventually serve a
 * retired key and reject valid webhooks. Bounded and TTL'd: a miss is one extra
 * API call, which is the cheap failure direction.
 */
export class VerificationKeyCache {
  private readonly entries = new Map<string, { jwk: PlaidJwk; expiresAt: number }>();

  constructor(
    private readonly ttlMs = 24 * 60 * 60 * 1000,
    private readonly maxEntries = 32,
    private readonly now: () => number = Date.now,
  ) {}

  get(keyId: string): PlaidJwk | undefined {
    const hit = this.entries.get(keyId);
    if (!hit) return undefined;
    if (hit.expiresAt <= this.now()) {
      this.entries.delete(keyId);
      return undefined;
    }
    return hit.jwk;
  }

  set(keyId: string, jwk: PlaidJwk): void {
    if (this.entries.size >= this.maxEntries) {
      // Evict oldest insertion — Map preserves insertion order.
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(keyId, { jwk, expiresAt: this.now() + this.ttlMs });
  }

  clear(): void {
    this.entries.clear();
  }
}
