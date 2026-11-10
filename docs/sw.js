// Simit MartÄ±sÄ± service worker: oyunu Ã§evrimdÄ±ÅŸÄ± da aÃ§Ä±labilir yapar.
const VERSION = 'simit-martisi-v2.51.1';
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
const CORE = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'js/i18n.js', 'js/main.js', 'js/scene.js', 'js/models.js', 'js/fx.js', 'js/audio.js', 'js/util.js', 'js/weather.js', 'js/board.js', 'js/net.js', 'js/cities.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(CORE);
    try { await c.add(new Request(THREE_URL, { mode: 'cors' })); } catch (err) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // sÃ¼rÃ¼m sabit CDN dosyasÄ±: Ã¶nce Ã¶nbellek
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const cp = res.clone(); caches.open(VERSION).then(c => c.put(req, cp)); return res; })));
    return;
  }
  // yazÄ± tipleri: Ã¶nbellekten ver, arkada tazele
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(res => { c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  // kendi dosyalarÄ±mÄ±z: Ã¶nce aÄŸ (yeni sÃ¼rÃ¼m hemen gelsin), aÄŸ yoksa Ã¶nbellek
  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req.mode === 'navigate' ? req.url : req, { cache: 'no-cache' }) /* HTTP Ã¶nbelleÄŸini (Pages: 10 dk) doÄŸrula: yeni sÃ¼rÃ¼m ilk aÃ§Ä±lÄ±ÅŸta gelsin */.then(res => {
      if (res.ok) { const cp = res.clone(); caches.open(VERSION).then(c => c.put(req, cp)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
  }
});
