// Service worker: offline support for the PWA.
// Same-origin requests are network-first (updates arrive immediately, cache is
// the offline fallback), flag images are cache-first (they never change).
const CACHE = 'africapitales-v1';

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './assets/africa-geo.js',
  './assets/dc-runtime.js',
  './assets/asset_3.woff2',
  './assets/asset_4.woff2',
  './assets/asset_5.woff2',
  './assets/asset_6.woff2',
  './assets/asset_7.woff2',
  './assets/asset_8.woff2',
  './assets/asset_9.woff2',
  './assets/asset_10.woff2',
  './assets/asset_11.woff2',
  './assets/asset_12.woff2',
  './assets/asset_13.woff2',
  './assets/asset_14.woff2',
  './assets/asset_15.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// All 54 flags, pre-cached so flag mode works offline too.
const FLAG_CODES = ['dz','eg','ly','ma','tn','sd','bj','bf','cv','ci','gm','gh','gn','gw','lr','ml','mr','ne','ng','sn','sl','tg','ao','cm','cf','td','cg','cd','gq','ga','st','bi','km','dj','er','et','ke','mg','mw','mu','rw','sc','so','za','ss','tz','ug','bw','sz','ls','mz','na','zm','zw'];
const FLAG_URLS = FLAG_CODES.map(c => 'https://flagcdn.com/w160/' + c + '.png');

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(PRECACHE);
    // Flags are cross-origin opaque responses (status 0): cache.add() rejects
    // those, so fetch + put manually, individually, so one failure doesn't
    // abort the whole install.
    await Promise.all(FLAG_URLS.map(async (u) => {
      try {
        const res = await fetch(u, { mode: 'no-cors' });
        await c.put(u, res);
      } catch (err) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Flags never change: cache-first.
  if (url.hostname === 'flagcdn.com') {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(e.request, { ignoreVary: true });
      if (hit) return hit;
      const res = await fetch(e.request);
      c.put(e.request, res.clone());
      return res;
    })());
    return;
  }

  // Same-origin: network-first with cache fallback.
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const res = await fetch(e.request);
        if (res && res.ok) c.put(e.request, res.clone());
        return res;
      } catch (err) {
        const hit = await c.match(e.request, { ignoreSearch: true });
        if (hit) return hit;
        if (e.request.mode === 'navigate') {
          const idx = await c.match('./index.html');
          if (idx) return idx;
        }
        throw err;
      }
    })());
  }
});
