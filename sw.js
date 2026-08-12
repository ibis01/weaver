/* Weaver service worker — offline shell, silent resilience, NEVER re-throws */
const CACHE = "weaver-v2";
const SHELL = ["index.html", "style.css", "manifest.webmanifest"];

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
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => clients.claim()),
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
