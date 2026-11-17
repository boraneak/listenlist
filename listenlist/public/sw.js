// The app shell is precached; engine files are cached as they are requested.
// Voice models use their own Cache Storage cache and are not changed here.
const CACHE = 'listenlist-v3';
const STATIC_FILES = [
  '/manifest.webmanifest',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
];

async function precacheAppShell(cache) {
  const response = await fetch('/');
  if (!response.ok) throw new Error(`Could not cache the app shell (${response.status}).`);
  await cache.put('/', response.clone());

  const html = await response.text();
  const resources = new Set(
    [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
      .map(([, path]) => new URL(path, self.location.origin))
      .filter((url) => url.origin === self.location.origin && /\.(?:js|css)$/.test(url.pathname))
      .map((url) => url.href)
  );
  await Promise.all(
    [...resources].map(async (url) => {
      const asset = await fetch(url);
      if (!asset.ok) throw new Error(`Could not cache an app asset (${asset.status}): ${url}`);
      await cache.put(url, asset);
    })
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all([precacheAppShell(cache), cache.addAll(STATIC_FILES)]);
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('listenlist-v') && key !== CACHE && !key.startsWith('listenlist-voices')).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(req);
          if (response.ok) {
            try {
              const cache = await caches.open(CACHE);
              await cache.put('/', response.clone());
            } catch (error) {
              console.warn('Could not update the cached app shell.', error);
            }
          }
          return response;
        } catch {
          const cached = await caches.match('/');
          if (cached) return cached;
          return new Response('ListenList is offline and the app shell is not cached yet.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const response = await fetch(req);
      if (response.ok) {
        try {
          const cache = await caches.open(CACHE);
          await cache.put(req, response.clone());
        } catch (error) {
          console.warn('Could not cache an app resource.', req.url, error);
        }
      }
      return response;
    })()
  );
});
