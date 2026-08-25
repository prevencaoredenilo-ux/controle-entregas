const CACHE_NAME = 'controle-entregas-v28-tipo-entrega-visivel';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=14.8.0',
  './nilo-layout-v15.css?v=15.0.0',
  './ui-stable-v19.css?v=19.0.0',
  './app.js?v=14.8.0',
  './public-sync.js?v=15.2.0',
  './route-view-stable-v19.js?v=19.0.0',
  './manifest.webmanifest',
  './route-planner-stable-v24.js?v=24.0.0',
  './nilo-contrast-v28.css?v=28.0.0',
  './operational-fixes-v28.js?v=28.0.0',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.4'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then(response => {
    if(response && response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));}
    return response;
  }).catch(async()=>{
    const cached=await caches.match(event.request);
    if(cached)return cached;
    if(event.request.mode==='navigate')return caches.match('./index.html');
    return Response.error();
  }));
});
