const CACHE = 'orbita-v2-cache-61';
const ASSETS = [
  './', './index.html', './styles.css?v=6.1', './app.js?v=6.1', './db.js?v=6.1', './helpers.js?v=6.1', './views.js?v=6.1', './excel-report.js?v=6.1', './manifest.webmanifest?v=6.1',
  './assets/brand/nilo-logo.png', './assets/brand/mascote.png', './assets/brand/triela-logo.png',
  './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('orbita-v2-cache-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') { event.respondWith(fetch(req)); return; }
  if (req.mode === 'navigate') { event.respondWith(fetch(req).catch(() => caches.match('./index.html'))); return; }
  event.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, clone)).catch(() => {});
      }
      return res;
    }).catch(async () => (await caches.match(req)) || Response.error())
  );
});
