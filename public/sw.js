/**
 * Sevadal Attendance — Service Worker v3
 *
 * Strategies:
 *  - Static assets (JS/CSS/fonts/images): stale-while-revalidate
 *  - Member pages (dashboard/attendance/profile/news): network-first + offline cache
 *  - API GET (member-specific data): stale-while-revalidate
 *  - POST/mutations: network-only (never cache)
 *  - Push notifications: display + navigate on click
 */

const CACHE_NAME    = "sevadal-v3";
const OFFLINE_CACHE = "sevadal-offline-v3";
const DATA_CACHE    = "sevadal-data-v3";

const PRECACHE = ["/offline.html", "/icon-192.png", "/manifest.json"];

// Pages to cache for offline member use
const MEMBER_OFFLINE_PATHS = [
  "/dashboard",
  "/attendance",
  "/profile",
  "/news",
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE)
      .then(c => c.addAll(PRECACHE).catch(() => {})) // swallow any 404s in precache
      .then(() => self.skipWaiting())                 // activate immediately, don't wait for tabs to close
  );
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  // Delete old caches, then claim all clients.
  // DO NOT call c.navigate() here — it force-reloads all tabs on every SW
  // activation, killing in-flight promises (including push subscribe).
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => !["sevadal-v3", "sevadal-offline-v3", "sevadal-data-v3"].includes(k))
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim()) // take control of all open tabs immediately
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // Static assets — stale-while-revalidate (instant load)
  if (url.pathname.match(/\.(js|css|woff2?|ttf|otf|png|jpg|jpeg|webp|svg|ico)$/)) {
    event.respondWith(swrAsset(request));
    return;
  }

  // Member data API — stale-while-revalidate with DATA_CACHE
  if (url.pathname.startsWith("/api/member-") || url.pathname.startsWith("/api/news")) {
    event.respondWith(swrData(request));
    return;
  }

  // Member-facing page navigations — network-first + cache for offline
  if (request.mode === "navigate") {
    const isMemberPage = MEMBER_OFFLINE_PATHS.some(
      p => url.pathname === p || url.pathname.startsWith(p + "?")
    );
    if (isMemberPage) {
      event.respondWith(networkFirstCache(request));
    } else {
      event.respondWith(
        fetch(request).catch(() =>
          caches.match("/offline.html").then(r => r ?? new Response("Offline", { status: 503 }))
        )
      );
    }
    return;
  }
});

async function swrAsset(req) {
  const cache  = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const fresh  = fetch(req)
    .then(res => { if (res.ok) cache.put(req, res.clone()); return res; })
    .catch(() => null);
  return cached ?? await fresh;
}

async function swrData(req) {
  const cache  = await caches.open(DATA_CACHE);
  const cached = await cache.match(req);
  if (cached) {
    // Update in background
    fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); }).catch(() => {});
    return cached;
  }
  const res = await fetch(req).catch(() => null);
  if (res?.ok) cache.put(req, res.clone());
  return res ?? new Response(
    JSON.stringify({ error: "offline" }),
    { status: 503, headers: { "Content-Type": "application/json" } }
  );
}

async function networkFirstCache(req) {
  const cache = await caches.open(OFFLINE_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    return cached ?? cache.match("/offline.html")
      .then(r => r ?? new Response("Offline", { status: 503 }));
  }
}

// ── Push Notifications ────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {
    title: "Sevadal",
    body:  "New notification",
    icon:  "/icon-192.png",
    badge: "/icon-192.png",
    url:   "/",
  };
  if (event.data) {
    try { Object.assign(data, event.data.json()); } catch {}
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:             data.body,
      icon:             data.icon  || "/icon-192.png",
      badge:            data.badge || "/icon-192.png",
      tag:              data.tag   || "sevadal-notif",
      data:             { url: data.url || "/" },
      vibrate:          [200, 100, 200],
      requireInteraction: false,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
      for (const c of clients) {
        if (c.url === targetUrl && "focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

// ── Push Subscription Change ──────────────────────────────────────────────────
// Fires when browser rotates push subscription (e.g. key expiry).
// Re-subscribes and updates server silently.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.registration.pushManager.subscribe(event.oldSubscription.options)
      .then(sub => fetch("/api/push-subscribe", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action:   "subscribe",
          endpoint: sub.endpoint,
          p256dh:   btoa(String.fromCharCode(...new Uint8Array(sub.getKey("p256dh"))))
                      .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"),
          auth:     btoa(String.fromCharCode(...new Uint8Array(sub.getKey("auth"))))
                      .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"),
        }),
      }))
  );
});