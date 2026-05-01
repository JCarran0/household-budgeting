/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope;

// Precache all assets injected by vite-plugin-pwa (injectManifest mode)
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
clientsClaim();

const SHARE_CACHE_NAME = 'share-target-v1';

// ---------------------------------------------------------------------------
// Web Share Target — Android share sheet POSTs the chosen file(s) to
// /share-target. We stash the file in Cache Storage under a one-shot key,
// then 303 to /?share=<id> so the React app can pick it up and feed it to
// the chatbot's attachment slot.
// ---------------------------------------------------------------------------
self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.pathname !== '/share-target') return;

  event.respondWith((async () => {
    try {
      const formData = await event.request.formData();
      const file = formData
        .getAll('shared')
        .find((v): v is File => v instanceof File);
      if (!file) return Response.redirect('/', 303);

      const cache = await caches.open(SHARE_CACHE_NAME);
      const id = crypto.randomUUID();
      await cache.put(
        new Request(`/__share/${id}`),
        new Response(file, {
          headers: {
            'content-type': file.type || 'application/octet-stream',
            'x-share-filename': encodeURIComponent(file.name),
          },
        }),
      );
      return Response.redirect(`/?share=${id}`, 303);
    } catch {
      return Response.redirect('/', 303);
    }
  })());
});

// Handle SKIP_WAITING message sent by updateServiceWorker(true) in PWAUpdatePrompt
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

// ---------------------------------------------------------------------------
// Push event — show a notification when the server sends a push message
// ---------------------------------------------------------------------------

self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;

  const data = event.data.json() as {
    title: string;
    body: string;
    tag: string;
    url: string;
  };

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      tag: data.tag,
      data: { url: data.url },
    }),
  );
});

// ---------------------------------------------------------------------------
// Notification click — focus existing window or open a new one
// ---------------------------------------------------------------------------

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const targetUrl = (event.notification.data as { url: string }).url;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        const existing = clientList.find((c) => c.url === targetUrl);
        if (existing) {
          return existing.focus();
        }
        return self.clients.openWindow(targetUrl);
      }),
  );
});
