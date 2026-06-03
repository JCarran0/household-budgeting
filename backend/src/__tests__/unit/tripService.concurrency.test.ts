/**
 * Concurrency regression for TD-011 — TripService read-modify-write race.
 *
 * The self-healing trip-photo feature (refreshTripPhotos) fired one updateStop
 * per stop simultaneously. Each mutation is a load → mutate → save of the whole
 * trips collection; without a per-family lock the concurrent cycles read the
 * same baseline and the last save clobbers the rest (lost updates), and on the
 * filesystem adapter the interleaved writes tore the JSON file outright.
 *
 * Plain InMemoryDataService resolves reads/writes too eagerly to reproduce the
 * interleave, so we delay *writes*: every reader then deterministically sees the
 * pre-write baseline. Without the lock this loses updates; with it the writes
 * serialize and every update survives. (Verified by temporarily removing the
 * lock — this test fails without it.)
 */

import { InMemoryDataService } from '../../services/dataService';
import { TransactionService } from '../../services/transactionService';
import { PlaidService } from '../../services/plaidService';
import { TripService } from '../../services/tripService';

/** Delays every write so concurrent RMW cycles read the same baseline. */
class SlowWriteDataService extends InMemoryDataService {
  async saveData<T>(key: string, data: T): Promise<void> {
    await new Promise((r) => setTimeout(r, 10));
    return super.saveData<T>(key, data);
  }
}

function makeTripService(): TripService {
  const dataService = new SlowWriteDataService();
  const transactionService = new TransactionService(dataService, new PlaidService());
  return new TripService(dataService, transactionService);
}

describe('TripService — concurrent stop writes (TD-011)', () => {
  const familyId = 'fam-concurrency';

  it('does not lose updates when many stops are PATCHed in parallel', async () => {
    const tripService = makeTripService();

    const trip = await tripService.createTrip(
      { name: 'Race Trip', startDate: '2026-05-01', endDate: '2026-05-07' },
      familyId,
    );

    // Eat stops carry no overlap rule, so several can share one trip.
    const count = 5;
    const stopIds: string[] = [];
    for (let i = 0; i < count; i++) {
      const stop = await tripService.createStop(trip.id, familyId, {
        type: 'eat',
        date: '2026-05-02',
        name: `Original ${i}`,
      });
      stopIds.push(stop.id);
    }

    // Fire every update at once — the access pattern refreshTripPhotos produced.
    await Promise.all(
      stopIds.map((id, i) =>
        tripService.updateStop(trip.id, id, familyId, { type: 'eat', name: `Updated ${i}` }),
      ),
    );

    const after = await tripService.getTrip(trip.id, familyId);
    expect(after?.stops).toHaveLength(count);

    const namesById = new Map(
      (after?.stops ?? []).map((s) => [s.id, (s as { name: string }).name]),
    );
    stopIds.forEach((id, i) => {
      expect(namesById.get(id)).toBe(`Updated ${i}`);
    });
  });
});
