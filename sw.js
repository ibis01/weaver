/* Weaver service worker — offline shell, silent resilience, NEVER re-throws.
 *
 * v4 changelog:
 *   - index.html, /dist/bundle.js, and /dist/bundle.min.js now use a
 *     "fresh-required" path: cache: "reload" on every navigation,
 *     no SW-cache write for those URLs, fallback to cache only when
 *     the network itself fails.
 *   - Everything else (CSS, logo, manifest) stays cache-first with
 *     background revalidation — they rarely change and offline is
 *     the important property for them.
 *   - Why: v3 called fetch(e.request) for the entry point, which
 *     respects the browser HTTP cache. If that cache held a stale
 *     index.html from a prior deploy, the SW treated the stale copy
 *     as "the network" and wrote it back into the SW cache. The
 *     5-second timeout then aborted slow fetches and served the
 *     same stale copy. Net effect: after a deploy, the browser kept
 *     loading the old bundle URL until the user manually unregistered
 *     the SW. That is what v4 fixes.
 */

const CACHE = "weaver-v4";
const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.json",
  "./assets/logo.png",
];

// URLs whose content must never be served from a stale cache.
// A stale copy of any of these ships stale code to the user, which
// is the exact failure mode this file exists to prevent.
function isFreshRequired(pathname) {
  if (typeof pathname !== "string") return false;
  if (pathname.endsWith("/")) return true;
  if (pathname.endsWith("/index.html")) return true;
  if (pathname.endsWith("/dist/bundle.js")) return true;
  if (pathname.endsWith("/dist/bundle.min.js")) return true;
  return false;
}

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
      // Delete every cache that is not the current one. This is what
      // makes the version bump from weaver-v3 to weaver-v4 land as a
      // single atomic replacement.
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== CACHE).map((n) => caches.delete(n)),
      );
      await clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  // ── Fresh-required: entry point and current code bundle ─────
  if (isFreshRequired(url.pathname)) {
    e.respondWith(
      (async () => {
        // A hung network fetch must not hang the page. Bounded at
        // 8s; on expiry the cache fallback below runs. This is the
        // behaviour the v3 SW had (5s) and that v4 dropped.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
          // cache: "reload" bypasses the browser HTTP cache. Without
          // this, fetch() can return a disk-cached copy of index.html
          // and the SW would treat it as if it had come from the
          // server.
          const req = new Request(e.request, {
            cache: "reload",
            signal: controller.signal,
          });
          const res = await fetch(req);
          clearTimeout(timer);
          return res;
        } catch (err) {
          clearTimeout(timer);
          // Network is genuinely down. Fall back to cache, ignoring
          // the ?v= query so a bump does not orphan the last good copy.
          const cache = await caches.open(CACHE);
          const hit = await cache.match(e.request, { ignoreSearch: true });
          if (hit) return hit;
          if (e.request.mode === "navigate") {
            const shell =
              (await cache.match("./index.html")) ||
              (await cache.match("/index.html"));
            if (shell) return shell;
          }
          return new Response("offline", { status: 503 });
        }
      })(),
    );
    return;
  }

  // ── Everything else: cache-first, background revalidate ─────
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(e.request);
      if (hit) {
        // Fire-and-forget refresh; does not block the response.
        e.waitUntil(
          fetch(e.request)
            .then((net) => {
              if (net && net.ok) cache.put(e.request, net.clone());
            })
            .catch(() => {}),
        );
        return hit;
      }
      try {
        const net = await fetch(e.request);
        if (net && net.ok) cache.put(e.request, net.clone());
        return net;
      } catch (err) {
        if (e.request.mode === "navigate") {
          const shell =
            (await cache.match("./index.html")) ||
            (await cache.match("/index.html"));
          if (shell) return shell;
        }
        return new Response("", { status: 504 });
      }
    })(),
  );
});
