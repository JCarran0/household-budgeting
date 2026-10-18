import type { AxiosInstance } from 'axios';
import type { LedgerFact, LedgerFactInput, LedgerUserPrefs, LedgerView, Task } from '../../../../shared/types';

/** Household Ledger (HOUSEHOLD-LEDGER-BRD §3.3). Ids, sources and timestamps are always assigned by the server. */
export function createLedgerApi(client: AxiosInstance) {
  const fact = (id: string): string => `/ledger/facts/${encodeURIComponent(id)}`;
  return {
    async getLedger(): Promise<LedgerView> {
      const { data } = await client.get<LedgerView>('/ledger');
      return data;
    },
    async createLedgerFact(input: LedgerFactInput): Promise<LedgerFact> {
      const { data } = await client.post<LedgerFact>('/ledger/facts', input);
      return data;
    },
    async updateLedgerFact(id: string, input: LedgerFactInput): Promise<LedgerFact> {
      const { data } = await client.put<LedgerFact>(fact(id), input);
      return data;
    },
    async deleteLedgerFact(id: string): Promise<void> {
      await client.delete(fact(id));
    },
    async correctLedgerFact(id: string, input: LedgerFactInput): Promise<LedgerFact> {
      const { data } = await client.post<LedgerFact>(`${fact(id)}/correct`, input);
      return data;
    },
    async markLedgerHandled(id: string, occurrenceDate: string, note?: string): Promise<LedgerFact> {
      const { data } = await client.post<LedgerFact>(`${fact(id)}/handled`, { occurrenceDate, ...(note ? { note } : {}) });
      return data;
    },
    async unmarkLedgerHandled(markId: string): Promise<void> {
      await client.delete(`/ledger/handled/${encodeURIComponent(markId)}`);
    },
    async makeLedgerTask(id: string, occurrenceDate: string): Promise<Task> {
      const { data } = await client.post<Task>(`${fact(id)}/task`, { occurrenceDate });
      return data;
    },
    async snoozeLedgerItem(occurrenceKey: string, until: string): Promise<LedgerUserPrefs> {
      const { data } = await client.post<LedgerUserPrefs>('/ledger/snoozes', { occurrenceKey, until });
      return data;
    },
    async unsnoozeLedgerItem(occurrenceKey: string): Promise<LedgerUserPrefs> {
      const { data } = await client.delete<LedgerUserPrefs>('/ledger/snoozes', { data: { occurrenceKey } });
      return data;
    },
    async muteLedgerSubject(subject: string, muted: boolean): Promise<LedgerUserPrefs> {
      const { data } = await client.put<LedgerUserPrefs>('/ledger/mutes', { subject, muted });
      return data;
    },
  };
}
