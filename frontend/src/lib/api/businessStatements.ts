/**
 * Business Statements API module — Phase 7.2
 *
 * Covers POST /business/statements (generate), GET /business/statements (list),
 * GET /business/statements/:id (single). Only reachable when the active workspace
 * is of type 'business'.
 *
 * Response envelope: the backend wraps payloads in `{ success, statement }` /
 * `{ success, statements }` (the app-wide convention — see workspaces/accounts
 * api modules). These functions UNWRAP that envelope and return the inner
 * BusinessStatement(s), so callers get a clean domain object.
 */
import type { AxiosInstance } from 'axios';
import type { BusinessStatement } from '../../../../shared/types';

export interface GenerateStatementPayload {
  periodMonth: string;       // YYYY-MM
  paymentNumber?: number;    // optional override; server derives if absent
  paymentDate?: string;      // optional YYYY-MM-DD override
}

function isBusinessStatement(data: unknown): data is BusinessStatement {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    'paymentNumber' in data &&
    'remittanceTotal' in data
  );
}

/** `{ success, statement }` envelope guard. */
function isStatementResponse(data: unknown): data is { statement: BusinessStatement } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'statement' in data &&
    isBusinessStatement((data as { statement: unknown }).statement)
  );
}

/** `{ success, statements }` envelope guard. */
function isStatementListResponse(data: unknown): data is { statements: BusinessStatement[] } {
  if (typeof data !== 'object' || data === null || !('statements' in data)) return false;
  const list = (data as { statements: unknown }).statements;
  return Array.isArray(list) && (list.length === 0 || isBusinessStatement(list[0]));
}

export function createBusinessStatementsApi(client: AxiosInstance) {
  return {
    /**
     * Generate a new statement for the given period.
     * POST /business/statements → { success, statement }
     */
    async generateStatement(payload: GenerateStatementPayload): Promise<BusinessStatement> {
      const { data } = await client.post<unknown>('/business/statements', payload);
      if (!isStatementResponse(data)) {
        throw new Error('Invalid response from POST /business/statements');
      }
      return data.statement;
    },

    /**
     * List all persisted statements, newest first.
     * GET /business/statements → { success, statements }
     */
    async getStatements(): Promise<BusinessStatement[]> {
      const { data } = await client.get<unknown>('/business/statements');
      if (!isStatementListResponse(data)) {
        throw new Error('Invalid response from GET /business/statements');
      }
      return data.statements;
    },

    /**
     * Fetch a single statement by ID.
     * GET /business/statements/:id → { success, statement }
     */
    async getStatement(id: string): Promise<BusinessStatement> {
      const { data } = await client.get<unknown>(`/business/statements/${id}`);
      if (!isStatementResponse(data)) {
        throw new Error(`Invalid response from GET /business/statements/${id}`);
      }
      return data.statement;
    },
  };
}
