/**
 * Logger redaction tests (TD-017).
 *
 * The shipped `logger` singleton is `silent` in test mode (so `npm test` output
 * stays clean). To assert redaction behavior we build a parallel pino instance
 * with the same redaction config but a captured destination stream. If the
 * shipped redaction list ever drifts from REDACT_PATHS, this suite catches it.
 */

import pino from 'pino';
import { Writable } from 'stream';
import { REDACT_PATHS } from '../../utils/logger';

interface CapturedLine {
  level: number;
  msg?: string;
  [key: string]: unknown;
}

function buildCapturedLogger(): { log: pino.Logger; lines: CapturedLine[] } {
  const lines: CapturedLine[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(JSON.parse(chunk.toString()));
      cb();
    },
  });
  const log = pino(
    {
      level: 'trace',
      redact: { paths: [...REDACT_PATHS], censor: '[Redacted]' },
    },
    stream,
  );
  return { log, lines };
}

describe('logger redaction', () => {
  it('redacts top-level secret-shaped fields', () => {
    const { log, lines } = buildCapturedLogger();

    log.info({
      accessToken: 'super-secret-plaid-token',
      password: 'hunter2',
      resetToken: 'reset-abc-123',
      jwt: 'eyJhbGciOi...',
      privateKey: '-----BEGIN PRIVATE KEY-----',
    });

    expect(lines).toHaveLength(1);
    expect(lines[0].accessToken).toBe('[Redacted]');
    expect(lines[0].password).toBe('[Redacted]');
    expect(lines[0].resetToken).toBe('[Redacted]');
    expect(lines[0].jwt).toBe('[Redacted]');
    expect(lines[0].privateKey).toBe('[Redacted]');
  });

  it('redacts nested secret-shaped fields one level deep', () => {
    const { log, lines } = buildCapturedLogger();

    log.info({
      account: {
        accountName: 'Chase Checking',
        plaidAccessToken: 'access-prod-xxxxx',
        accountNumber: '1234567890',
      },
    });

    expect(lines[0].account).toMatchObject({
      accountName: '[Redacted]',
      plaidAccessToken: '[Redacted]',
      accountNumber: '[Redacted]',
    });
  });

  it('redacts the TD-017 leak: account.accountName on decryption failure', () => {
    // The exact shape that transactionService.ts:163 used to log.
    const { log, lines } = buildCapturedLogger();

    log.warn({
      itemAccounts: [
        { accountName: 'Wells Fargo Savings', plaidAccessToken: 'tok-1' },
        { accountName: 'Vanguard 401k', plaidAccessToken: 'tok-2' },
      ],
    }, 'Skipping accounts - token needs reconnection');

    // Each element in the array gets redacted via the *.field paths.
    const accounts = lines[0].itemAccounts as Array<Record<string, unknown>>;
    expect(accounts[0].accountName).toBe('[Redacted]');
    expect(accounts[0].plaidAccessToken).toBe('[Redacted]');
    expect(accounts[1].accountName).toBe('[Redacted]');
  });

  it('redacts user email in nested objects (admin migration logs)', () => {
    const { log, lines } = buildCapturedLogger();

    log.info({
      user: { id: 'u_123', email: 'jared@example.com', isAdmin: true },
    });

    const user = lines[0].user as Record<string, unknown>;
    expect(user.email).toBe('[Redacted]');
    expect(user.id).toBe('u_123'); // non-PII fields untouched
    expect(user.isAdmin).toBe(true);
  });

  it('does not redact non-secret fields like familyId, transactionId, amount', () => {
    const { log, lines } = buildCapturedLogger();

    log.info({
      familyId: 'fam_abc',
      transactionId: 'txn_xyz',
      amount: 42.5,
      cursor: 'cursor-after-initial',
    });

    expect(lines[0].familyId).toBe('fam_abc');
    expect(lines[0].transactionId).toBe('txn_xyz');
    expect(lines[0].amount).toBe(42.5);
    expect(lines[0].cursor).toBe('cursor-after-initial');
  });

  it('preserves the message string verbatim', () => {
    const { log, lines } = buildCapturedLogger();
    log.info({ accessToken: 'x' }, 'sync started for item');
    expect(lines[0].msg).toBe('sync started for item');
  });

  it('child loggers inherit redaction', () => {
    const { log, lines } = buildCapturedLogger();
    const child = log.child({ module: 'plaidService' });
    child.info({ accessToken: 'should-be-redacted' });

    expect(lines[0].accessToken).toBe('[Redacted]');
    expect(lines[0].module).toBe('plaidService');
  });

  it('respects log level (debug/trace dropped at info level)', () => {
    const lines: CapturedLine[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        lines.push(JSON.parse(chunk.toString()));
        cb();
      },
    });
    const log = pino({ level: 'info', redact: { paths: [...REDACT_PATHS] } }, stream);

    log.trace('trace dropped');
    log.debug('debug dropped');
    log.info('info kept');
    log.warn('warn kept');
    log.error('error kept');

    expect(lines.map((l) => l.msg)).toEqual(['info kept', 'warn kept', 'error kept']);
  });
});
