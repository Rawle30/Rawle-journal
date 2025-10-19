// service-worker.js
const CACHE_NAME = 'trading-journal-cache-v2';
const APP_SHELL = [
  './',
  './index.html',
  './preview.html',
  './offline.html',
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

/* ---------------- INSTALL ---------------- */
self.addEventListener('install', event => {
  self.skipWaiting(); // activate new SW immediately
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(err => console.error('⚠️ Cache addAll failed:', err))
  );
});

/* ---------------- ACTIVATE ---------------- */
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log(`🧹 Removing old cache: ${k}`);
          return caches.delete(k);
        })
      );
      await self.clients.claim(); // take control of open pages
    })()
  );
});

/* ---------------- FETCH ---------------- */
self.addEventListener('fetch', event => {
  const req = event.request;

  // Skip non-GET requests
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Prefer network for API/finance requests
  if (/alphavantage|yahoo|coinbase|finance/i.test(url.hostname)) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Cache-first for app shell & static assets
  event.respondWith(cacheFirst(req));
});

/* ---------------- STRATEGIES ---------------- */
async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;

  try {
    const res = await fetch(req);
    const cache = await caches.open(CACHE_NAME);
    cache.put(req, res.clone());
    return res;
  } catch {
    if (req.destination === 'document') return caches.match('./offline.html');
    throw new Error('Offline and not cached');
  }
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    const cache = await caches.open(CACHE_NAME);
    cache.put(req, res.clone());
    return res;
  } catch {
    return caches.match(req) || new Response('Offline', { status: 503 });
  }
}

/* ---------------- AUTO-UPDATE CLIENTS ---------------- */
self.addEventListener('message', evt => {
  if (evt.data === 'skipWaiting') self.skipWaiting();
});

