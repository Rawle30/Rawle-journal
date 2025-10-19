const CACHE_NAME = 'trading-journal-cache-v1';

const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './js/main.js',
  './js/data.js',
  './js/storage.js',
  './js/api.js',
  './js/charts.js',
  './js/ui.js',
  './js/alerts.js'
];

// ✅ Install: cache essential files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(urlsToCache).catch(err => {
        console.error('⚠️ Cache addAll failed:', err);
      })
    )
  );
});

// ✅ Activate: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log(`🧹 Removing old cache: ${key}`);
            return caches.delete(key);
          }
        })
      )
    )
  );
});

// ✅ Fetch: serve cached content or fallback
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response =>
      response || fetch(event.request).catch(() => {
        // Optional: fallback for offline navigation
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      })
    )
  );
});
