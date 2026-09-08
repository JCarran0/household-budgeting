import request from 'supertest';
import app from '../../app';

/**
 * Production reported version "1.0.0" for every release because
 * `require('../../package.json')` resolved, in the deployed tree, to a file at
 * the app root that no deploy writes. The health endpoint is the only automated
 * post-deploy check, so it could not distinguish a successful deploy from one
 * that installed nothing.
 */
describe('GET /health — version reporting', () => {
  it('reports the backend package version, not a stale root file', async () => {
    const expected = require('../../../package.json').version;
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toBe(expected);
    // The bug's signature: a version that never advances past the initial scaffold.
    expect(res.body.version).not.toBe('1.0.0');
  });
});
