import type { AxiosInstance } from 'axios';
import type {
  StoredTrip,
  TripSummary,
  CreateTripDto,
  UpdateTripDto,
  Stop,
  CreateStopDto,
  UpdateStopDto,
  ReorderStopsDto,
} from '../../../../shared/types';

export function createTripsApi(client: AxiosInstance) {
  return {
    async createTrip(tripData: CreateTripDto): Promise<StoredTrip> {
      const { data: trip } = await client.post<StoredTrip>('/trips', tripData);
      return trip;
    },

    async getTrips(year?: number): Promise<StoredTrip[]> {
      const { data } = await client.get<StoredTrip[]>('/trips', {
        params: year !== undefined ? { year } : undefined,
      });
      return data;
    },

    async getTrip(id: string): Promise<StoredTrip> {
      const { data } = await client.get<StoredTrip>(`/trips/${id}`);
      return data;
    },

    async getTripSummary(id: string): Promise<TripSummary> {
      const { data } = await client.get<TripSummary>(`/trips/${id}/summary`);
      return data;
    },

    async getTripsSummaries(year?: number): Promise<TripSummary[]> {
      const { data } = await client.get<TripSummary[]>('/trips/summaries', {
        params: year !== undefined ? { year } : undefined,
      });
      return data;
    },

    async updateTrip(id: string, updates: UpdateTripDto): Promise<StoredTrip> {
      const { data } = await client.put<StoredTrip>(`/trips/${id}`, updates);
      return data;
    },

    async deleteTrip(id: string): Promise<void> {
      await client.delete(`/trips/${id}`);
    },

    // -----------------------------------------------------------------------
    // Stops (itineraries)
    // -----------------------------------------------------------------------

    async createStop(tripId: string, stop: CreateStopDto): Promise<Stop> {
      const { data } = await client.post<Stop>(`/trips/${tripId}/stops`, stop);
      return data;
    },

    async updateStop(tripId: string, stopId: string, updates: UpdateStopDto): Promise<Stop> {
      const { data } = await client.patch<Stop>(`/trips/${tripId}/stops/${stopId}`, updates);
      return data;
    },

    async deleteStop(tripId: string, stopId: string): Promise<void> {
      await client.delete(`/trips/${tripId}/stops/${stopId}`);
    },

    async reorderStops(tripId: string, updates: ReorderStopsDto): Promise<Stop[]> {
      const { data } = await client.post<{ stops: Stop[] }>(
        `/trips/${tripId}/stops/reorder`,
        updates,
      );
      return data.stops;
    },
  };
}
