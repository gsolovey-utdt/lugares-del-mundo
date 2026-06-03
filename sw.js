// Service Worker — Comidas del Mundo
// Estrategia: cache-first para assets propios; ignora Supabase y CDNs externos.

const CACHE = "comidas-v1";

const PRECACHE = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./data/foods.js",
  "./data/image-map.json",
  "./vendor/jsvectormap/css/jsvectormap.min.css",
  "./vendor/jsvectormap/js/jsvectormap.min.js",
  "./vendor/jsvectormap/maps/world-merc.js",
  "./icons/icon.svg",
  "./manifest.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);

  // Dejar pasar Supabase (datos dinámicos) y CDNs externos
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      // Fetch en background para mantener cache fresco
      const fresh = fetch(e.request).then((res) => {
        if (res && res.ok) {
          caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => null);

      // Si está en cache, devolver inmediatamente; si no, esperar la red
      return cached || fresh;
    })
  );
});
