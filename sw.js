importScripts('precache.js');

const SHELL = 'taptalk-' + self.CACHE_VERSION;
const SYMBOLS = 'taptalk-symbols'; // kept across updates
const NETWORK_WAIT_MS = 3000;

// The app's own files must all arrive for a new version to take over
// (cache: 'reload' skips stale copies in the browser's HTTP cache). Pictures
// are fetched one by one and a failure is simply retried next time, so a
// flaky connection can't leave the device stuck on an old version.
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await shell.addAll(self.PRECACHE.map((url) => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

async function fillSymbols() {
  const cache = await caches.open(SYMBOLS);
  for (const url of self.PRECACHE_SYMBOLS || []) {
    if (await cache.match(url)) continue;
    try {
      const res = await fetch(url);
      if (res.ok) await cache.put(url, res);
    } catch { /* offline or flaky: try again on the next update */ }
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== SHELL && key !== SYMBOLS) await caches.delete(key); // incl. old downloaded voices
    }
    await self.clients.claim();
  })());
  // In the background: requests wait while activation is in progress, so the
  // pictures must not hold it up.
  fillSymbols();
});

// Pictures never change once published, so they come from the cache first.
async function cacheFirst(req, toned) {
  const hit = await caches.match(req, { ignoreSearch: !toned });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    const copy = res.clone();
    caches.open(SYMBOLS).then((c) => c.put(req, copy));
  }
  return res;
}

// The app itself (page, code, styles) comes fresh from the network when
// online, so fixes arrive straight away; the cached copy is used offline or
// when the network is too slow to wait for.
async function networkFirst(req) {
  const fromNetwork = fetch(req, { cache: 'no-cache' }).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(SHELL).then((c) => c.put(req, copy));
    }
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_WAIT_MS, null));
  try {
    const res = await Promise.race([fromNetwork, timeout]);
    if (res) return res;
  } catch { /* offline: fall through to the cache */ }
  const hit = await caches.match(req, { ignoreSearch: true })
    || (req.mode === 'navigate' && await caches.match('index.html'));
  return hit || fromNetwork;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // ARASAAC pictures re-drawn in another skin tone come from their server.
  const toned = url.origin === 'https://api.arasaac.org' && url.pathname.startsWith('/v1/pictograms/') && url.searchParams.has('skin');
  if (toned) { event.respondWith(cacheFirst(req, true)); return; }
  if (url.origin !== location.origin) return;
  event.respondWith(url.pathname.includes('/symbols/') ? cacheFirst(req, false) : networkFirst(req));
});
