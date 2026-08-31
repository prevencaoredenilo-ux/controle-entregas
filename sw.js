const CACHE = 'orbita-v2-cache-2';
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './db.js', './helpers.js', './views.js', './manifest.webmanifest',
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
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const clone = res.clone();
      caches.open(CACHE).then((cache) => cache.put(req, clone));
      return res;
    }).catch(() => cached))
  );
});
