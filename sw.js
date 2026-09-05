const CACHE_PREFIX = 'orbita-v514-fim-ciclo-inteligente-';
const CACHE = `${CACHE_PREFIX}1`;
const ASSETS = [
  './', './index.html', './styles.css?v=5.14', './app.js?v=5.14', './db.js?v=5.14', './helpers.js?v=5.14', './views.js?v=5.14', './excel-report.js?v=5.14', './manifest.webmanifest?v=5.14',
  './assets/brand/nilo-logo.png', './assets/brand/mascote.png', './assets/brand/triela-logo.png',
  './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('orbita-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
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
