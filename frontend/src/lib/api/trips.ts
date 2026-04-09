import type { AxiosInstance } from 'axios';
import type {
  StoredTrip,
  TripSummary,
  CreateTripDto,
  UpdateTripDto,
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
  };
}
