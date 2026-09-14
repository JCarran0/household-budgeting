/**
 * Credential redaction in free text — SEC-L004 / SEC-P041 (TD-029)
 *
 * A learning's title and detail are model-authored free text with no keys, so
 * agentTraceStore's key-name matcher runs over them and changes nothing. This
 * covers the value-shape pass that actually fires, and — just as importantly —
 * what it deliberately leaves alone. A redactor that eats ordinary prose gets
 * ignored by the maintainer it was written for.
 */

import { redactSecretsInText } from '../../utils/redaction';

describe('redactSecretsInText removes credential-shaped values', () => {
  it.each([
    ['a Plaid access token', 'token is access-production-8d1f2a3b4c5d6e7f8a9b'],
    ['a Plaid link token', 'use link-sandbox-8d1f2a3b4c5d6e7f8a9b0c'],
    ['an Anthropic key', 'key sk-ant-api03-AAAAbbbbCCCCddddEEEE1234'],
    ['a JWT', 'bearer eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0NTY.SflKxwRJSMeKKF2QT4'],
    ['a 32-byte hex key', `key ${'a1b2c3d4'.repeat(8)} here`],
  ])('redacts %s', (_label, text) => {
    const out = redactSecretsInText(text);
    expect(out).toContain('[redacted]');
    // The literal must be gone, not merely accompanied by a marker.
    const secret = text.split(' ').find(w => w.length > 20)!;
    expect(out).not.toContain(secret);
  });

  it('keeps the label on an inline credential so the reader knows what went', () => {
    const out = redactSecretsInText('The user set password: hunter2 and it failed');
    expect(out).toContain('password: [redacted]');
    expect(out).not.toContain('hunter2');
  });

  it('redacts every occurrence, not just the first', () => {
    const out = redactSecretsInText(
      'access-production-1111111111111111 then access-production-2222222222222222',
    );
    expect(out).not.toMatch(/access-production-\d/);
  });
});

describe('what it deliberately leaves alone', () => {
  it.each([
    'The user asked about spending at Corner Market in September',
    'query_transactions returned 42 rows and the total was $1,204.18',
    'There is no tool for reading trip stop photos',
    // A category id — uppercase, underscored, and nothing like a credential.
    'categoryId HOME_IMPROVEMENT had no budget set',
  ])('leaves ordinary prose unchanged: %s', text => {
    expect(redactSecretsInText(text)).toBe(text);
  });

  it('does not fire on a short hex string', () => {
    // Not the encryption key's shape. Firing here would redact colour codes,
    // short ids and half the diagnostic content of a detail field.
    const text = 'the colour was a1b2c3 and the id was deadbeef';
    expect(redactSecretsInText(text)).toBe(text);
  });
});
