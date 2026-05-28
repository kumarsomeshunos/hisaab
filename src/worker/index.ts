// Minimal custom SW entry — Workbox is injected by next-pwa separately.
// This file only handles the Background Sync event, which Workbox doesn't wire.
declare const self: ServiceWorkerGlobalScope;

self.addEventListener("sync", (event: SyncEvent) => {
  if (event.tag === "dutch-sync") {
    event.waitUntil(
      self.clients
        .matchAll({ includeUncontrolled: true, type: "window" })
        .then((clients) => {
          clients.forEach((c) => c.postMessage({ type: "sync-requested" }));
        })
    );
  }
});
