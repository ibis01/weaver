/* Weaver service worker — offline shell, silent resilience, NEVER re-throws */
const CACHE = "weaver-v3";
const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.json",
  "./assets/logo.png",
  "./dist/bundle.min.js",
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .catch(() => {}),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      // 1. Delete caches with a different name (existing behavior).
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== CACHE).map((n) => caches.delete(n)),
      );

      // 2. Prune stale bundle entries from the current cache. Bundle
      // URLs carry a ?v= cache-buster, so each new deploy introduces
      // a new cache key for dist/bundle.min.js while the previous
      // version's entry lingers. Since SW activation only fires when
      // the SW file itself changes — i.e. on a deploy — any cached
      // bundle at this point is stale and will be re-fetched under
      // the current version on the next navigation.
      const cache = await caches.open(CACHE);
      const cached = await cache.keys();
      await Promise.all(
        cached.map((req) => {
          const url = new URL(req.url);
          if (url.pathname.endsWith("/dist/bundle.min.js")) {
            return cache.delete(req);
          }
        }),
      );

      await clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // hands off APIs
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const net = await fetch(e.request);
        if (net && net.ok) cache.put(e.request, net.clone());
        return net;
      } catch (err) {
        const hit = await cache.match(e.request);
        if (hit) return hit;
        if (e.request.mode === "navigate")
          return (
            (await cache.match("index.html")) ||
            new Response("offline", { status: 503 })
          );
        return new Response("", { status: 504 });
      }
    })(),
  );
});
