const CACHE_PREFIX = 'orbita-v13-32-safe-';
const CACHE = `${CACHE_PREFIX}1`;
const ASSETS = [
  './', './index.html', './styles.css?v=13.34', './app.js?v=13.34', './db.js?v=13.34', './helpers.js?v=13.34', './views.js?v=13.34', './excel-report.js?v=13.34', './manifest.webmanifest?v=13.34',
 
  './icons/icon-192.png', './icons/icon-512.png', './assets/delivery-courier-mascot.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('orbita-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname.endsWith('.json') || url.pathname.includes('supabase')) return;
  if (req.mode === 'navigate') { event.respondWith(fetch(req).catch(() => caches.match('./index.html'))); return; }
  event.respondWith(
    fetch(req).then((res) => {
      const clone = res.clone();
      caches.open(CACHE).then((cache) => cache.put(req, clone));
      return res;
    }).catch(() => caches.match(req))
  );
});
