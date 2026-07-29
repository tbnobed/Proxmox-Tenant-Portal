/* ProxHub service worker — enables Chrome PWA installability.
   Network-first strategy; never caches API, WebSocket, or auth traffic. */
const CACHE_NAME = "proxhub-static-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin GET requests; never touch API or dynamic routes.
  if (
    req.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api")
  ) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Cache successful static asset responses as an offline fallback.
        if (res.ok && (req.destination !== "" || url.pathname === "/")) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || Response.error())),
  );
});
