const CACHE = 'inventario-tsc-v2';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/ui.js',
  './js/db.js',
  './js/excel.js',
  './js/compare.js',
  './js/calc.js',
  './js/views/bodega.js',
  './js/views/admin.js',
  './js/views/report.js',
  './js/app.js',
  './vendor/xlsx.full.min.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached =>
      cached || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match('./index.html'))
    )
  );
});
