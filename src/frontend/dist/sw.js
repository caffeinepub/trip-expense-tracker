// Service Worker for Trip Expense Tracker PWA
const CACHE_NAME = 'trip-splitter-v8';
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/assets/generated/icon-192.dim_192x192.png',
  '/assets/generated/icon-512.dim_512x512.png'
];

// Static asset extensions that are safe to cache-first
const STATIC_EXTENSIONS = /\.(js|css|woff2?|ttf|eot|otf|png|jpg|jpeg|svg|ico|webp|gif)(\?.*)?$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // For static assets (JS, CSS, fonts, images): cache-first
  // This makes the app load instantly after the first visit
  if (STATIC_EXTENSIONS.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        // Not in cache yet -- fetch from network and cache it
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => caches.match('/'));
      })
    );
    return;
  }

  // For the HTML shell and manifest: stale-while-revalidate
  // Show cached version immediately, update cache in background
  if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/manifest.json') {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cached) => {
          const networkFetch = fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached);

          // Return cached immediately if available, otherwise wait for network
          return cached || networkFetch;
        });
      })
    );
    return;
  }

  // For all other requests (API/canister calls): network-first
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          return cached || caches.match('/').then((fallback) => {
            return fallback || new Response('Offline', { status: 503 });
          });
        });
      })
  );
});
