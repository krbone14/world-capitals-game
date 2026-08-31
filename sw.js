// Service worker: offline support for the PWA.
//
// Two caching postures, by what the resource is:
//   - the flags under assets/flags/ : cache-first, warmed in the background
//     after activation rather than during install. A flag never changes under
//     the same path, so revalidating 195 images on every visit buys nothing;
//     and warming them at install time would make a player wait, or pay mobile
//     data, before the game would start;
//   - everything else same-origin   : network-first, so an update lands
//     immediately and the cache is only the offline fallback. React ships from
//     assets/vendor/, so this covers all of the app.
//
// Nothing here is cross-origin any more: the flags used to come from
// flagcdn.com and now ship with the game (tools/build-flags.mjs), which is what
// lets the Android package work offline without a service worker at all.
const CACHE = 'worldcapitals-v2';

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './assets/dc-runtime.js',
  './assets/vendor/react.production.min.js',
  './assets/vendor/react-dom.production.min.js',
  './assets/data/countries.js',
  './assets/data/regions.js',
  './assets/data/facts.js',
  './assets/geo/africa.js',
  './assets/geo/europe.js',
  './assets/geo/asia.js',
  './assets/geo/north-america.js',
  './assets/geo/south-america.js',
  './assets/geo/oceania.js',
  './assets/geo/world.js',
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

const FLAGS = './assets/flags/';

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(PRECACHE);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
    // Warm the flags in the background: the page is already usable, this only
    // decides whether flag mode works the next time the player is offline.
    warmFlags();
  })());
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  // Flag images never change: cache-first.
  if (url.pathname.includes('/assets/flags/')) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res && res.ok) c.put(e.request, res.clone());
      return res;
    })());
    return;
  }

  // Everything else: network-first with cache fallback.
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
});

// Flag codes are read out of the generated country data rather than duplicated
// here, so adding a country never means remembering to edit this file too.
async function warmFlags() {
  try {
    const cache = await caches.open(CACHE);
    const res = (await cache.match('./assets/data/countries.js')) || (await fetch('./assets/data/countries.js'));
    const sandbox = { window: {} };
    new Function('window', await res.text()).call(sandbox, sandbox.window);
    const countries = sandbox.window.WORLD_DATA.countries;
    for (const id of Object.keys(countries)) {
      const url = FLAGS + countries[id].i2 + '.png';
      if (await cache.match(url)) continue;
      try {
        const flag = await fetch(url);
        if (flag && flag.ok) await cache.put(url, flag);
      } catch (err) { /* offline: the fetch handler still caches flags on sight */ }
    }
  } catch (err) { /* best effort: the fetch handler still caches flags on sight */ }
}
