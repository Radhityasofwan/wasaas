/// <reference lib="WebWorker" />

import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{
    url: string;
    revision: string | null;
  }>;
};

self.skipWaiting();
clientsClaim();
precacheAndRoute(self.__WB_MANIFEST || []);
cleanupOutdatedCaches();

self.addEventListener("push", (event: PushEvent) => {
  let payload: any = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = {};
  }

  const title = String(payload?.title || "Wasaas");
  const body = String(payload?.body || "Ada notifikasi baru.");
  const tag = String(payload?.tag || "wasaas-notification");
  const icon = String(payload?.icon || "/pwa-192.png");
  const badge = String(payload?.badge || "/pwa-192.png");
  const data = payload?.data || { url: "/dashboard" };

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon,
      badge,
      data,
      requireInteraction: false,
    })
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url = String((event.notification?.data && event.notification.data.url) || "/dashboard");

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        const windowClient = client as WindowClient;
        if ("focus" in windowClient) {
          await windowClient.focus();
          if ("navigate" in windowClient) {
            await windowClient.navigate(url);
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
