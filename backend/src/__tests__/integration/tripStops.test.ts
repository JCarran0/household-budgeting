/**
 * Integration tests for the nested stop endpoints under /trips/:tripId/stops.
 * Covers create / update / delete / reorder across all stop types plus the
 * Stay no-overlap rule (REQ-014).
 */

import request from 'supertest';
import app from '../../app';
import { dataService, authService } from '../../services';
import { registerUser } from '../helpers/apiHelper';
import type { VerifiedLocation } from '../../shared/types';

const LOC_HOTEL_A: VerifiedLocation = {
  kind: 'verified',
  label: 'Hotel A',
  address: '123 Main St, Barcelona, Spain',
  lat: 41.3851,
  lng: 2.1734,
  placeId: 'ChIJA',
};

const LOC_HOTEL_B: VerifiedLocation = {
  kind: 'verified',
  label: 'Hotel B',
  address: '456 Elm St, Madrid, Spain',
  lat: 40.4168,
  lng: -3.7038,
  placeId: 'ChIJB',
};

async function createTrip(token: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/trips')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Test Trip',
      startDate: '2026-05-01',
      endDate: '2026-05-07',
    })
    .expect(201);
  return res.body.id as string;
}

describe('Trip Stops Integration Tests', () => {
  let token: string;

  beforeEach(async () => {
    if ('clear' in dataService) {
      (dataService as unknown as { clear: () => void }).clear();
    }
    authService.resetRateLimiting();

    const rand = Math.random().toString(36).substring(2, 8);
    const user = await registerUser(`stop${rand}`, 'test-password-for-stop-tests');
    token = user.token;
  });

  // -------------------------------------------------------------------------
  // Create stops
  // -------------------------------------------------------------------------

  describe('POST /api/v1/trips/:tripId/stops', () => {
    it('creates a Stay with verified location', async () => {
      const tripId = await createTrip(token);

      const res = await request(app)
        .post(`/api/v1/trips/${tripId}/stops`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'stay',
          date: '2026-05-01',
          endDate: '2026-05-03',
          name: 'Hotel Arts',
          location: LOC_HOTEL_A,
        })
        .expect(201);

      expect(res.body).toMatchObject({
        type: 'stay',
        date: '2026-05-01',
        endDate: '2026-05-03',
        name: 'Hotel Arts',
        notes: '',
        time: null,
      });
      expect(res.body.id).toBeDefined();
      expect(res.body.sortOrder).toBe(0);
    });

    it('creates an Eat stop with optional free-text location', async () => {
      const tripId = await createTrip(token);
      const res = await request(app)
        .post(`/api/v1/trips/${tripId}/stops`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'eat',
          date: '2026-05-02',
          time: '19:30',
          name: 'Tapas dinner',
          location: { kind: 'freeText', label: 'That place by the cathedral' },
        })
        .expect(201);

      expect(res.body.type).toBe('eat');
      expect(res.body.time).toBe('19:30');
      expect(res.body.location).toMatchObject({ kind: 'freeText' });
    });

    it('creates a Play stop with duration', async () => {
      const tripId = await createTrip(token);
      const res = await request(app)
        .post(`/api/v1/trips/${tripId}/stops`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'play',
          date: '2026-05-02',
          name: 'Sagrada Família',
          durationMinutes: 90,
        })
        .expect(201);

      expect(res.body.type).toBe('play');
      expect(res.body.durationMinutes).toBe(90);
      expect(res.body.location).toBeNull();
    });

    it('creates a Transit stop', async () => {
      const tripId = await createTrip(token);
      const res = await request(app)
        .post(`/api/v1/trips/${tripId}/stops`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'transit',
          date: '2026-05-04',
          mode: 'train',
          durationMinutes: 150,
        })
        .expect(201);

      expect(res.body.type).toBe('transit');
      expect(res.body.mode).toBe('train');
    });

    it('allows a stop date outside the trip nominal range (REQ-012)', async () => {
      const tripId = await createTrip(token);
      await request(app)
        .post(`/api/v1/trips/${tripId}/stops`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'transit',
          date: '2026-04-29', // before trip.startDate (2026-05-01)
          mode: 'flight',
        })
        .expect(201);
    });

    it('rejects a stay whose endDate is before its date', async () => {
      const tripId = await createTrip(token);
      await request(app)
        .post(`/api/v1/trips/${tripId}/stops`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'stay',
          date: '2026-05-03',
          endDate: '2026-05-01',
          name: 'Bad',
          location: LOC_HOTEL_A,
        })
        .expect(400);
    });

    it('rejects a stay with a freeText location (REQ-009)', async () => {
      const tripId = await createTrip(token);
      await request(app)
        .post(`/api/v1/trips/${tripId}/stops`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'stay',
          date: '2026-05-01',
          endDate: '2026-05-02',
          name: 'Bad',
          location: { kind: 'freeText', label: 'Grandma\'s house' },
        })
        .expect(400);
    });

    it('returns 404 when the trip does not exist', async () => {
      await request(app)
        .post('/api/v1/trips/does-not-exist/stops')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'eat',
          date: '2026-05-01',
          name: 'Test',
        })
        .expect(404);
    });
  });

  // -------------------------------------------------------------------------
  // Stay overlap validation (REQ-014)
  // -------------------------------------------------------------------------

  describe('Stay overlap validation', () => {
    it('accepts two stays that are adjacent (no overlap)', async () => {
      const tripId = await createTrip(token);
      await request(app)
        .post(`/api/v1/trips/${tripId}/stops`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'stay',
          date: '2026-05-01',
          endDate: '2026-05-03',
          name: 'Hotel A',
          location: LOC_HOTEL_A,
        })
        .expect(201);

      // Adjacent: A's last night is 05-03, B starts 05-04 — no overlap.
      await request(app)
        .post(`/api/v1/trips/${tripId}/stops`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'stay',
          date: '2026-05-04',
          endDate: '2026-05-06',
          name: 'Hotel B',
          location: LOC_HOTEL_B,
        })
        .expect(201);
    });

    it('rejects two stays whose nights overlap and names the conflict', async () => {
      const tripId = await createTrip(token);
      await request(app)
        .post(`/api/v1/trips/${tripId}/stops`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'stay',
          date: '2026-05-01',
          endDate: '2026-05-05',
          name: 'Hotel Arts Barcelona',
          location: LOC_HOTEL_A,
        })
        .expect(201);

      const res = await request(app)
        .post(`/api/v1/trips/${tripId}/stops`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'stay',
          date: '2026-05-03',
          endDate: '2026-05-06',
          name: 'Hotel B',
          location: LOC_HOTEL_B,
        })
        .expect(409);

      expect(res.body.errorCode).toBe('STAY_OVERLAP');
      expect(res.body.error).toContain('Hotel Arts Barcelona');
      expect(res.body.conflictsWith.name).toBe('Hotel Arts Barcelona');
    });

    it('rejects updating a stay into an overlap', async () => {
      const tripId = await createTrip(token);

      const aRes = await request(app)
        .post(`/api/v1/trips/${tripId}/stops`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'stay',
          date: '2026-05-01',
          endDate: '2026-05-03',
          name: 'A',
          location: LOC_HOTEL_A,
        })
        .expect(201);

      const bRes = await request(app)
        .post(`/api/v1/trips/${tripId}/stops`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'stay',
          date: '2026-05-04',
          endDate: '2026-05-07',
          name: 'B',
          location: LOC_HOTEL_B,
        })
        .expect(201);

      // Shift B back into A's range.
      const res = await request(app)
        .patch(`/api/v1/trips/${tripId}/stops/${bRes.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'stay', date: '2026-05-03' })
        .expect(409);

      expect(res.body.errorCode).toBe('STAY_OVERLAP');
      expect(res.body.conflictsWith.id).toBe(aRes.body.id);
    });

    it('allows updating a stay without overlap complaint against itself', async () => {
      const tripId = await createTrip(token);
      const aRes = await request(app)
        .post(`/api/v1/trips/${tripId}/stops`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'stay',
          date: '2026-05-01',
          endDate: '2026-05-03',
          name: 'A',
          location: LOC_HOTEL_A,
        })
        .expect(201);

      await request(app)
        .patch(`/api/v1/trips/${tripId}/stops/${aRes.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'stay', endDate: '2026-05-04' })
        .expect(200);
    });
  });

  // -------------------------------------------------------------------------
  // Update / delete
  // -------------------------------------------------------------------------

  describe('PATCH / DELETE stops', () => {
    it('updates a stop and bumps updatedAt', async () => {
      const tripId = await createTrip(token);
      const create = await request(app)
        .post(`/api/v1/trips/${tripId}/stops`)
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'eat', date: '2026-05-02', name: 'Pizza' })
        .expect(201);

      const originalUpdatedAt = create.body.updatedAt as string;
      // Guarantee a different timestamp (ISO precision is ms)
      await new Promise((r) => setTimeout(r, 10));

      const update = await request(app)
        .patch(`/api/v1/trips/${tripId}/stops/${create.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'eat', name: 'Pasta' })
        .expect(200);

      expect(update.body.name).toBe('Pasta');
      expect(update.body.updatedAt > originalUpdatedAt).toBe(true);
    });

    it('rejects an update whose type does not match the existing stop', async () => {
      const tripId = await createTrip(token);
      const create = await request(app)
        .post(`/api/v1/trips/${tripId}/stops`)
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'eat', date: '2026-05-02', name: 'Pizza' })
        .expect(201);

      await request(app)
        .patch(`/api/v1/trips/${tripId}/stops/${create.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'play', name: 'Wrong type' })
        .expect(400);
    });

    it('deletes a stop', async () => {
      const tripId = await createTrip(token);
      const create = await request(app)
        .post(`/api/v1/trips/${tripId}/stops`)
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'eat', date: '2026-05-02', name: 'Pizza' })
        .expect(201);

      await request(app)
        .delete(`/api/v1/trips/${tripId}/stops/${create.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      // Confirm the trip no longer has that stop.
      const trip = await request(app)
        .get(`/api/v1/trips/${tripId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(trip.body.stops).toHaveLength(0);
    });

    it('returns 404 when deleting a nonexistent stop', async () => {
      const tripId = await createTrip(token);
      await request(app)
        .delete(`/api/v1/trips/${tripId}/stops/fake-id`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  // -------------------------------------------------------------------------
  // Reorder
  // -------------------------------------------------------------------------

  describe('POST /api/v1/trips/:tripId/stops/reorder', () => {
    it('updates sortOrder on listed stops only', async () => {
      const tripId = await createTrip(token);
      const a = await request(app)
        .post(`/api/v1/trips/${tripId}/stops`)
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'eat', date: '2026-05-02', name: 'A', sortOrder: 0 })
        .expect(201);
      const b = await request(app)
        .post(`/api/v1/trips/${tripId}/stops`)
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'eat', date: '2026-05-02', name: 'B', sortOrder: 1 })
        .expect(201);
      const c = await request(app)
        .post(`/api/v1/trips/${tripId}/stops`)
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'eat', date: '2026-05-02', name: 'C', sortOrder: 2 })
        .expect(201);

      const res = await request(app)
        .post(`/api/v1/trips/${tripId}/stops/reorder`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          updates: [
            { id: a.body.id, sortOrder: 2 },
            { id: c.body.id, sortOrder: 0 },
          ],
        })
        .expect(200);

      const stops = res.body.stops as Array<{ id: string; sortOrder: number }>;
      const byId = (id: string) => stops.find((s) => s.id === id)?.sortOrder;
      expect(byId(a.body.id)).toBe(2);
      expect(byId(b.body.id)).toBe(1); // unchanged
      expect(byId(c.body.id)).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Authentication
  // -------------------------------------------------------------------------

  describe('Authentication', () => {
    it('returns 401 without a token', async () => {
      const tripId = await createTrip(token);
      await request(app)
        .post(`/api/v1/trips/${tripId}/stops`)
        .send({ type: 'eat', date: '2026-05-02', name: 'No auth' })
        .expect(401);
    });
  });
});
