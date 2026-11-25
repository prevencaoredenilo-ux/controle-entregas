const CACHE_PREFIX = 'orbita-v13-66-3-safe-';
const CACHE = `${CACHE_PREFIX}4`;
const ASSETS = [
  './', './index.html', './styles.css?v=13.66.3', './app.js?v=13.66.3', './db.js?v=13.66.3', './helpers.js?v=13.66.3', './views.js?v=13.66.3', './receipt-capture.js?v=13.66.3', './excel-report.js?v=13.66.3', './manifest.webmanifest?v=13.66.3',
 
  './icons/icon-192.png', './icons/icon-512.png',
  './vendor/tesseract/tesseract.esm.min.js', './vendor/tesseract/worker.min.js',
  './vendor/tesseract/tesseract-core-lstm.wasm.js', './vendor/tesseract/tesseract-core-lstm.wasm',
  './vendor/tesseract/tesseract-core-simd-lstm.wasm.js', './vendor/tesseract/tesseract-core-simd-lstm.wasm',
  './vendor/tesseract/tesseract-core-simd.wasm.js', './vendor/tesseract/tesseract-core-simd.wasm',
  './vendor/tesseract/tesseract-core.wasm.js', './vendor/tesseract/tesseract-core.wasm',
  './vendor/tesseract/lang/por.traineddata', './vendor/jsqr/jsQR.js',
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
      if (res.ok && new URL(res.url).origin === self.location.origin) {
        const clone = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, clone));
      }
      return res;
    }).catch(() => caches.match(req))
  );
});
