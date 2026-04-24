const CACHE_NAME = 'bridge-srs-v22';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/questions_data.js',
  '/manifest.json'
];

self.addEventListener('install', event => {
  self.skipWaiting(); // Force activate immediately
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', event => {
  // Delete old caches
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(
        names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Network-first for other assets
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Only cache valid GET responses from the same origin
        const isSameOrigin = event.request.url.startsWith(self.location.origin);
        if (response.ok && event.request.method === 'GET' && isSameOrigin) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
