/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, StaleWhileRevalidate } from "workbox-strategies";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { ExpirationPlugin } from "workbox-expiration";

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
// L'app s'ouvre même hors ligne.
if (!import.meta.env.DEV) registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html")));

// Polices de la charte (Satoshi, General Sans) servies par Fontshare : gardées en cache pour le hors-ligne.
registerRoute(
  ({ url }) => url.hostname === "api.fontshare.com",
  new StaleWhileRevalidate({ cacheName: "fontshare-css", plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })] }),
);
registerRoute(
  ({ url }) => url.hostname === "cdn.fontshare.com",
  new CacheFirst({
    cacheName: "fontshare-fonts",
    plugins: [new CacheableResponsePlugin({ statuses: [0, 200] }), new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 365 * 86400 })],
  }),
);

self.addEventListener("install", () => void self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

type Payload = {
  title: string;
  body: string;
  tag?: string;
  url: string;
  taskId?: string;
  actionToken?: string;
  actionUrl?: string;
};

self.addEventListener("push", (event) => {
  let data: Payload;
  try {
    data = event.data?.json() as Payload;
  } catch {
    data = { title: "FolioWork", body: event.data?.text() ?? "", url: "/" };
  }
  const canAct = !!(data.taskId && data.actionToken && data.actionUrl);
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: "/icon-192.png",
      badge: "/badge-96.png",
      data,
      requireInteraction: canAct,
      // @ts-expect-error : `actions` est géré par Chrome/Edge/Android, ignoré ailleurs.
      actions: canAct
        ? [
            { action: "done", title: "Terminé" },
            { action: "snooze", title: "+15 min" },
          ]
        : [],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  const data = (event.notification.data ?? {}) as Payload;
  event.notification.close();

  if ((event.action === "done" || event.action === "snooze") && data.actionUrl) {
    event.waitUntil(
      fetch(data.actionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: data.taskId, token: data.actionToken, action: event.action }),
      }).catch(() => undefined),
    );
    return;
  }

  event.waitUntil(
    (async () => {
      const target = new URL(data.url || "/", self.location.origin).href;
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if (data.taskId) client.postMessage({ type: "open-task", taskId: data.taskId });
          else await (client as WindowClient).navigate(target).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
