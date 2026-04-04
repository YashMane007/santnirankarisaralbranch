/**
 * Sevadal Attendance — Service Worker
 *
 * Strategy:
 *  - App shell (HTML navigations): network-first with offline fallback
 *  - Static assets (JS/CSS/fonts): stale-while-revalidate
 *  - API / form POST: always network-only (never cache attendance actions)
 *
 * Auto-update: when a new SW is detected it immediately activates (skipWaiting),
 * then clients reload once. No user action needed.
 */

//YM
const CACHE_NAME = "sevadal-v1";
//  const VERSION = "v2.0";
//  const CACHE_NAME = `sevadal-${VERSION}`;
//  const CACHE_ASSETS = "sevadal-assets-v1";

// Static assets to pre-cache on install
const PRECACHE_URLS = [
  "/offline.html",
];
//  const PRECACHE_URLS = [
//    "/",
//    "/offline.html",
//    "/icon-192.png",
//    "/icon-512.png",
//    "/manifest.json",
//  ];
//YM

// ── Install: pre-cache offline page ──────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()) // activate immediately
  );
});

// ── Activate: clean up old caches ────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
  // Tell all open tabs to reload so they get the new SW immediately
  self.clients
    .matchAll({ includeUncontrolled: true, type: "window" })
    .then((clients) => {
      clients.forEach((client) => client.navigate(client.url));
    });
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept non-GET or same-origin API/form POSTs
  if (request.method !== "GET") return;
  if (!url.origin.includes(self.location.origin)) return;

  // Static assets: stale-while-revalidate
  if (
    url.pathname.match(/\.(js|css|woff2?|ttf|otf|png|jpg|webp|svg|ico)$/)
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const networkFetch = fetch(request).then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        });
        return cached ?? networkFetch;
      })
    );
    return;
  }

  // Navigations: network-first, offline fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/offline.html").then(
          (r) => r ?? new Response("Offline", { status: 503 })
        )
      )
    );
    return;
  }
});

//YM
// NEW: Smart caching strategies
//  async function cacheFirstStrategy(request, cacheName) {
//    const cache = await caches.open(cacheName);
//    const cached = await cache.match(request);
//    if (cached) {
//      // Return cached, update in background
//      fetch(request).then(response => {
//        if (response.ok) cache.put(request, response.clone());
//      }).catch(() => {});
//      return cached;
//    }
//    // Not cached, fetch and cache
//    const response = await fetch(request);
//    if (response.ok) cache.put(request, response.clone());
//    return response;
//  }

// // Static assets: cache-first (instant loading)
//  if (url.pathname.match(/\.(js|css|woff2?|ttf|otf|png|jpg|jpeg|webp|svg|ico|json)$/)) {
//    event.respondWith(cacheFirstStrategy(request, CACHE_ASSETS));
//    return;
//  }

// // Auto-cleanup old caches
//  const oldCaches = cacheNames.filter(
//    name => name.startsWith("sevadal-") && name !== CACHE_NAME && name !== CACHE_ASSETS
//  );
//  return Promise.all(oldCaches.map(cache => caches.delete(cache)));
//YM
