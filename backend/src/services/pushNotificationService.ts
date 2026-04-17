/**
 * Push Notification Service
 *
 * Manages Web Push subscriptions per user and sends push notifications
 * via the web-push library (VAPID protocol).
 *
 * Design decisions:
 * - Subscriptions stored per-user via getData/saveData with key `push_subscriptions_<userId>`
 * - Multiple devices supported — array keyed by endpoint (deduped)
 * - On HTTP 410 Gone or 404 from the push service, stale subscriptions are auto-removed
 * - If VAPID keys are missing or placeholder, sending is skipped with a warning (dev-safe)
 */

import webpush, { PushSubscription as WebPushSubscription } from 'web-push';
import { DataService } from './dataService';
import { config } from '../config';
import type { NotificationPayload, PushSubscriptionRecord } from '../shared/types';

// PushSubscription as sent from the browser (matches the Web Push spec JSON shape)
export interface PushSubscriptionJSON {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  expirationTime?: number | null;
}

const SUBSCRIPTIONS_KEY_PREFIX = 'push_subscriptions_';

// Sentinel values used as placeholders in .env before real keys are generated
const PLACEHOLDER_PREFIX = 'placeholder_';

function isPlaceholder(value: string): boolean {
  return !value || value.startsWith(PLACEHOLDER_PREFIX);
}

export class PushNotificationService {
  private static instance: PushNotificationService;
  private vapidConfigured = false;

  private constructor(private readonly dataService: DataService) {
    this.initVapid();
  }

  static getInstance(dataService: DataService): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService(dataService);
    }
    return PushNotificationService.instance;
  }

  /**
   * Configure web-push with VAPID keys from config.
   * If keys are missing or placeholder, logs a warning and marks vapidConfigured=false
   * so send operations are safely skipped in development.
   */
  private initVapid(): void {
    const { publicKey, privateKey, subject } = config.vapid;

    if (isPlaceholder(publicKey) || isPlaceholder(privateKey) || !subject) {
      console.warn(
        '[PushNotificationService] VAPID keys are not configured. ' +
        'Push notifications will not be sent. ' +
        'Generate keys with: npx web-push generate-vapid-keys',
      );
      this.vapidConfigured = false;
      return;
    }

    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.vapidConfigured = true;
      console.log('[PushNotificationService] VAPID configured successfully.');
    } catch (error) {
      console.error('[PushNotificationService] Failed to configure VAPID:', error);
      this.vapidConfigured = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Subscription management
  // ---------------------------------------------------------------------------

  private subscriptionsKey(userId: string): string {
    return `${SUBSCRIPTIONS_KEY_PREFIX}${userId}`;
  }

  private async readSubscriptions(userId: string): Promise<PushSubscriptionRecord[]> {
    const stored = await this.dataService.getData<PushSubscriptionRecord[]>(
      this.subscriptionsKey(userId),
    );
    return stored ?? [];
  }

  private async writeSubscriptions(userId: string, subscriptions: PushSubscriptionRecord[]): Promise<void> {
    await this.dataService.saveData(this.subscriptionsKey(userId), subscriptions);
  }

  /**
   * Register (or update) a push subscription for a user device.
   * Deduplicates by endpoint — if the same endpoint is submitted again
   * (e.g., after a key rotation) the old record is replaced.
   */
  async registerSubscription(userId: string, subscription: PushSubscriptionJSON): Promise<void> {
    const subscriptions = await this.readSubscriptions(userId);

    const record: PushSubscriptionRecord = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      subscribedAt: new Date().toISOString(),
    };

    const existingIndex = subscriptions.findIndex((s) => s.endpoint === subscription.endpoint);
    if (existingIndex !== -1) {
      subscriptions[existingIndex] = record;
    } else {
      subscriptions.push(record);
    }

    await this.writeSubscriptions(userId, subscriptions);
    console.log(
      `[PushNotificationService] Subscription registered for user ${userId}. ` +
      `Total devices: ${subscriptions.length}`,
    );
  }

  /**
   * Remove a specific push subscription by endpoint.
   */
  async removeSubscription(userId: string, endpoint: string): Promise<void> {
    const subscriptions = await this.readSubscriptions(userId);
    const filtered = subscriptions.filter((s) => s.endpoint !== endpoint);

    if (filtered.length !== subscriptions.length) {
      await this.writeSubscriptions(userId, filtered);
      console.log(`[PushNotificationService] Subscription removed for user ${userId}.`);
    }
  }

  /**
   * Get all subscriptions for a user (for debugging / admin use).
   */
  async getSubscriptions(userId: string): Promise<PushSubscriptionRecord[]> {
    return this.readSubscriptions(userId);
  }

  // ---------------------------------------------------------------------------
  // Sending notifications
  // ---------------------------------------------------------------------------

  /**
   * Send a notification to all registered devices for a user.
   * Stale subscriptions (HTTP 410 Gone, 404 Not Found) are automatically removed.
   */
  async sendNotification(userId: string, payload: NotificationPayload): Promise<void> {
    if (!this.vapidConfigured) {
      console.warn('[PushNotificationService] Skipping send — VAPID not configured.');
      return;
    }

    const subscriptions = await this.readSubscriptions(userId);
    if (subscriptions.length === 0) {
      return;
    }

    const staleEndpoints: string[] = [];

    await Promise.all(
      subscriptions.map(async (record) => {
        const pushSubscription: WebPushSubscription = {
          endpoint: record.endpoint,
          keys: {
            p256dh: record.keys.p256dh,
            auth: record.keys.auth,
          },
        };

        try {
          await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
        } catch (error: unknown) {
          const statusCode = this.extractStatusCode(error);
          if (statusCode === 410 || statusCode === 404) {
            // Subscription is no longer valid — queue for removal
            staleEndpoints.push(record.endpoint);
            console.log(
              `[PushNotificationService] Removing stale subscription for user ${userId} ` +
              `(HTTP ${statusCode}): ${record.endpoint.slice(0, 60)}...`,
            );
          } else {
            console.error(
              `[PushNotificationService] Failed to send notification to user ${userId}:`,
              error,
            );
          }
        }
      }),
    );

    if (staleEndpoints.length > 0) {
      const updated = subscriptions.filter((s) => !staleEndpoints.includes(s.endpoint));
      await this.writeSubscriptions(userId, updated);
    }
  }

  /**
   * Send a notification to ALL users who have at least one subscription.
   */
  async sendNotificationToAll(payload: NotificationPayload): Promise<void> {
    if (!this.vapidConfigured) {
      console.warn('[PushNotificationService] Skipping broadcast — VAPID not configured.');
      return;
    }

    // Find all keys that match the subscriptions prefix
    const allKeys = await this.dataService.listKeys(SUBSCRIPTIONS_KEY_PREFIX);

    await Promise.all(
      allKeys.map(async (key) => {
        // Extract userId from key: "push_subscriptions_<userId>"
        const userId = key.slice(SUBSCRIPTIONS_KEY_PREFIX.length);
        if (userId) {
          await this.sendNotification(userId, payload);
        }
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // VAPID public key accessor (for the /vapid-public-key endpoint)
  // ---------------------------------------------------------------------------

  getVapidPublicKey(): string | null {
    const { publicKey } = config.vapid;
    if (isPlaceholder(publicKey)) {
      return null;
    }
    return publicKey;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Attempt to extract an HTTP status code from a web-push error.
   * web-push throws objects with a `statusCode` property on push service errors.
   */
  private extractStatusCode(error: unknown): number | null {
    if (
      error !== null &&
      typeof error === 'object' &&
      'statusCode' in error &&
      typeof (error as { statusCode: unknown }).statusCode === 'number'
    ) {
      return (error as { statusCode: number }).statusCode;
    }
    return null;
  }
}
