import type { AxiosInstance } from 'axios';
import type { NotificationPreferences } from '../../../../shared/types';

// Standard browser type for serialized PushSubscription
export interface PushSubscriptionJSON {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface VapidPublicKeyResponse {
  success: boolean;
  publicKey: string;
}

interface SubscribeResponse {
  success: boolean;
}

interface PreferencesResponse {
  success: boolean;
  preferences: NotificationPreferences;
}

export function createNotificationsApi(client: AxiosInstance) {
  return {
    notifications: {
      async getVapidPublicKey(): Promise<{ publicKey: string }> {
        const { data } = await client.get<VapidPublicKeyResponse>('/notifications/vapid-public-key');
        return { publicKey: data.publicKey };
      },

      async subscribe(subscription: PushSubscriptionJSON): Promise<void> {
        await client.post<SubscribeResponse>('/notifications/subscribe', subscription);
      },

      async unsubscribe(endpoint: string): Promise<void> {
        await client.delete<SubscribeResponse>('/notifications/subscribe', {
          data: { endpoint },
        });
      },

      async getPreferences(): Promise<NotificationPreferences> {
        const { data } = await client.get<PreferencesResponse>('/notifications/preferences');
        return data.preferences;
      },

      async updatePreferences(prefs: NotificationPreferences): Promise<NotificationPreferences> {
        const { data } = await client.put<PreferencesResponse>('/notifications/preferences', prefs);
        return data.preferences;
      },
    },
  };
}
