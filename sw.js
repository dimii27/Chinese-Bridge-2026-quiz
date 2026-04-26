const CACHE_NAME = 'bridge-srs-v32';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/questions_data.js',
  '/manifest.json'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(
        names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // EXPLICITLY IGNORE FIREBASE AND OTHER CROSS-ORIGIN API CALLS
  if (event.request.url.includes('googleapis.com') || 
      event.request.url.includes('firebase') || 
      event.request.url.includes('gstatic.com')) {
    return;
  }

  // Network-first for other assets
  event.respondWith(
    fetch(event.request)
      .then(response => {
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
