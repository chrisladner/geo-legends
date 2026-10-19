/* Geo Legends – Offline-Cache.
   App-Dateien: sofort aus dem Cache, im Hintergrund aktualisiert (neue Version ab dem nächsten Öffnen).
   Schrift von Google Fonts: einmal laden, dann aus dem Cache. */
const VERSION = 'gl-v1';
const FONT_CACHE = 'gl-fonts';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './maps.js',
  './data.js',
  './app.js',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== FONT_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    const network = fetch(req).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
      }
      return res;
    });
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then(hit => hit || network.catch(() => caches.match('./index.html')))
    );
    event.waitUntil(network.then(() => {}, () => {}));
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(async cache => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
        return res;
      })
    );
  }
});
