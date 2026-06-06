/**
 * businessStatements API module — envelope contract test.
 *
 * The backend wraps statement payloads in `{ success, statement }` /
 * `{ success, statements }`. These tests feed that exact shape through a fake
 * axios client and assert the module UNWRAPS to the inner BusinessStatement(s).
 * This guards against the frontend/backend contract drift that mocked
 * component tests don't catch.
 */
import { describe, it, expect } from 'vitest';
import type { AxiosInstance } from 'axios';
import { createBusinessStatementsApi } from '../businessStatements';
import type { BusinessStatement } from '../../../../../shared/types';

const sampleStatement: BusinessStatement = {
  id: 's1',
  paymentNumber: 68,
  paymentDate: '2026-06-05',
  periodMonth: '2026-05',
  commissionRate: 0.05,
  lineItems: [],
  royaltySubtotal: 91832.22,
  charges: [],
  remittanceTotal: 91813.22,
  clientHeader: {
    businessName: '',
    businessAddress: '',
    clientName: '',
    clientCompany: '',
    clientAddress: '',
  },
  createdAt: '2026-06-05T00:00:00Z',
};

/** Minimal fake AxiosInstance returning the given `data` for get/post. */
function fakeClient(getData: unknown, postData: unknown): AxiosInstance {
  return {
    get: async () => ({ data: getData }),
    post: async () => ({ data: postData }),
  } as unknown as AxiosInstance;
}

describe('createBusinessStatementsApi — envelope unwrapping', () => {
  it('generateStatement unwraps { success, statement }', async () => {
    const api = createBusinessStatementsApi(
      fakeClient(null, { success: true, statement: sampleStatement }),
    );
    const result = await api.generateStatement({ periodMonth: '2026-05' });
    expect(result.id).toBe('s1');
    expect(result.remittanceTotal).toBe(91813.22);
  });

  it('getStatements unwraps { success, statements }', async () => {
    const api = createBusinessStatementsApi(
      fakeClient({ success: true, statements: [sampleStatement] }, null),
    );
    const result = await api.getStatements();
    expect(result).toHaveLength(1);
    expect(result[0].paymentNumber).toBe(68);
  });

  it('getStatement unwraps { success, statement }', async () => {
    const api = createBusinessStatementsApi(
      fakeClient({ success: true, statement: sampleStatement }, null),
    );
    const result = await api.getStatement('s1');
    expect(result.id).toBe('s1');
  });

  it('throws if the backend returns a raw (unwrapped) statement', async () => {
    // Locks in that the module expects the envelope, not a bare object.
    const api = createBusinessStatementsApi(fakeClient(null, sampleStatement));
    await expect(api.generateStatement({ periodMonth: '2026-05' })).rejects.toThrow(
      'Invalid response',
    );
  });
});
