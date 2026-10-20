importScripts('precache.js');

const SHELL = 'taptalk-' + self.CACHE_VERSION;
const SYMBOLS = 'taptalk-symbols'; // kept across updates

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the browser's HTTP cache, so a new version never
  // picks up stale copies of files from the previous one.
  const fresh = self.PRECACHE.map((url) => new Request(url, { cache: 'reload' }));
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(fresh)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== SHELL && key !== SYMBOLS) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // ARASAAC pictures re-drawn in another skin tone come from their server.
  const toned = url.origin === 'https://api.arasaac.org' && url.pathname.startsWith('/v1/pictograms/') && url.searchParams.has('skin');
  if (url.origin !== location.origin && !toned) return;

  event.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: !toned });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && (toned || url.pathname.includes('/symbols/'))) {
        const copy = res.clone();
        caches.open(SYMBOLS).then((c) => c.put(req, copy));
      }
      return res;
    } catch (err) {
      if (req.mode === 'navigate') return caches.match('index.html');
      throw err;
    }
  })());
});
