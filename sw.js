/* Weaver service worker — offline shell, silent resilience, NEVER re-throws */
const CACHE = "weaver-v2";
const SHELL = [
  "index.html",
  "style.css",
  "manifest.json", // Note: changed from .webmanifest to match your index.html link
  "assets/logo.png",
  "js/ui/theme.js",
  "js/utils/format.js",
  "js/utils/debounce.js",
  "js/storage/storage.js",
  "js/api/prices.js",
  "js/ui/ui.js",
  "js/features/portfolio.js",
  "js/features/watchlist.js",
  "js/ui/dashboard.js",
  "js/features/explorer.js",
  "js/features/alerts.js",
  "js/features/news.js",
  "js/features/market.js",
  "js/features/ai.js",
  "js/features/learn.js",
  "js/features/web3.js",
  "js/features/misc.js",
  "js/features/whales.js",
  "js/features/unlocks.js",
  "js/features/smart.js",
  "js/features/optimizer.js",
  "js/features/trader.js",
  "js/features/sync.js",
  "js/features/gems.js",
  "js/features/shield.js",
  "js/features/sectors.js",
  "js/features/telegram.js",
  "js/features/timemachine.js",
  "js/features/walletsync.js",
  "js/api/snapshot.js",
  "js/app.js",
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
