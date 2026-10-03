/*
 * FastWork Mobile — service worker.
 *
 * Caches only the app shell (HTML/JS/CSS/icons) so the app opens offline.
 * Backend requests (API_URL, usually another origin) are never intercepted, so
 * data always comes from the live FastAPI service.
 *
 * The cached index.html keeps a fixed name so a navigation request can always
 * fall back to it after the first successful load.
 */

const CACHE_NAME = 'fastwork-shell-v5';

// Resolve relative to sw registration location so it works on subpaths (e.g. /ProjekAyah/)
const getBaseScope = () => {
  const swUrl = new URL(self.location.href);
  return swUrl.pathname.substring(0, swUrl.pathname.lastIndexOf('/') + 1);
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const basePath = getBaseScope();
      const shellUrls = [
        basePath,
        `${basePath}index.html`,
        `${basePath}manifest.webmanifest`,
        `${basePath}favicon.svg`,
        `${basePath}icons/icon-192.png`,
        `${basePath}icons/icon-512.png`,
      ];
      const cache = await caches.open(CACHE_NAME);
      // One by one: a single 404 must not abort the whole install.
      await Promise.all(shellUrls.map((url) => cache.add(url).catch(() => undefined)));
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
        if (event.source && typeof event.source.postMessage === 'function') {
          event.source.postMessage({ type: 'CACHE_CLEARED' });
        }
      })(),
    );
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only same-origin GETs are cacheable; the API lives on another origin.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js') return;

  // Navigations: network first, cached shell as the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const basePath = getBaseScope();
        const indexPath = `${basePath}index.html`;
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(indexPath, fresh.clone()).catch(() => undefined);
          return fresh;
        } catch {
          const cached = (await caches.match(indexPath)) || (await caches.match(basePath));
          return cached || Response.error();
        }
      })(),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })(),
  );
});
