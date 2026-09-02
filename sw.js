const CACHE = 'orbita-v2-cache-27';
const ASSETS = [
  './', './index.html', './styles.css?v=5.3', './app.js?v=5.3', './db.js?v=5.3', './helpers.js?v=5.3', './views.js?v=5.3', './excel-report.js?v=5.3', './manifest.webmanifest?v=5.3',
  './assets/brand/nilo-logo.png', './assets/brand/mascote.png', './assets/brand/triela-logo.png',
  './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode === 'navigate') { event.respondWith(fetch(req).catch(() => caches.match('./index.html'))); return; }
  event.respondWith(
    fetch(req).then((res) => {
      const clone = res.clone();
      caches.open(CACHE).then((cache) => cache.put(req, clone));
      return res;
    }).catch(() => caches.match(req))
  );
});
