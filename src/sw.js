// ── Softshape Service Worker ─────────────────────────────────────────────────
// Caching strategy:
//   - Precache: static assets (JS, CSS, HTML, icons, fonts) via Workbox
//   - Runtime cache for API GET requests: NetworkFirst (falls back to cache)
//   - Runtime cache for static assets: StaleWhileRevalidate
//   - Non-GET API requests (POST/PATCH/DELETE): always pass through (no caching)
//   - Offline fallback: serve cached index.html for navigation requests

import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// Precache all assets injected by Vite
precacheAndRoute(self.__WB_MANIFEST || []);

// ── Navigation fallback (SPA) ────────────────────────────────────────────────
// Serve cached index.html for navigation requests when offline
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'softshape-pages',
    networkTimeoutSeconds: 3,
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 24 * 60 * 60 }),
    ],
  })
);

// ── API GET requests: NetworkFirst with cache fallback ──────────────────────
// Cache menu, tables, transactions for offline use
registerRoute(
  ({ url, request }) =>
    url.pathname.startsWith('/api/') &&
    !url.pathname.startsWith('/api/auth/') &&
    request.method === 'GET',
  new NetworkFirst({
    cacheName: 'softshape-api',
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 24 * 60 * 60, // 24 hours
      }),
    ],
  })
);

// ── Non-GET API requests: NetworkOnly (never cache mutations) ───────────────
registerRoute(
  ({ url, request }) =>
    url.pathname.startsWith('/api/') &&
    request.method !== 'GET',
  new NetworkOnly()
);

// ── Static assets: StaleWhileRevalidate ─────────────────────────────────────
registerRoute(
  ({ request }) =>
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font',
  new StaleWhileRevalidate({
    cacheName: 'softshape-assets',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
      }),
    ],
  })
);

// ── Google Fonts: cache for offline ─────────────────────────────────────────
registerRoute(
  ({ url }) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
  new StaleWhileRevalidate({
    cacheName: 'softshape-fonts',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      }),
    ],
  })
);

// ── Message handler: skip waiting for immediate activation ──────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Activate: claim clients immediately ─────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Clean up any old caches from previous SW versions
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name.startsWith('softshape-'))
            .map((name) => caches.delete(name))
        )
      ),
    ])
  );
});
