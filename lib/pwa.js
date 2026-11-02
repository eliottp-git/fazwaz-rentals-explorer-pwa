'use strict';
/**
 * Shared PWA helper for webapps behind the hub.
 *
 * mountPwa(app, { base, name, title, shortName, themeColor, backgroundColor, version, assets })
 *   name  = slug, used as cache prefix (e.g. 'usage-tracker')
 *   title = display name on the home screen / splash (e.g. 'GLM Usage Tracker')
 *   assets = paths relative to base to precache, e.g. ['/', '/style.css', '/app.js']
 *
 * Registers 3 routes on the Express app (all under `base`):
 *   GET <base>/manifest.webmanifest   installable manifest (start_url + scope = <base>/)
 *   GET <base>/sw.js                  service worker (no-store so updates are picked up)
 *   GET <base>/pwa-register.js        tiny script that registers sw.js
 *
 * The app still needs, in public/: icon-192.png, icon-512.png, and in index.html:
 *   <meta name="theme-color" content="...">
 *   <link rel="manifest" href="manifest.webmanifest">
 *   <link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">
 *   <script src="pwa-register.js" defer></script>
 *
 * Call it BEFORE express.static / catch-all routes. Bump `version` to force
 * clients to drop their old cache.
 */
function mountPwa(app, o) {
  const base = o.base;
  const name = o.name;
  const theme = o.themeColor || '#0a0c12';
  const bg = o.backgroundColor || theme;
  const cacheName = `${name}-${o.version || 'v1'}`;
  const assets = (o.assets || ['/', '/style.css', '/app.js']).map((a) => `${base}${a}`)
    .concat(`${base}/manifest.webmanifest`);

  app.get(`${base}/manifest.webmanifest`, (req, res) => {
    res.type('application/manifest+json').json({
      id: `${base}/`,
      name: o.title || name,
      short_name: o.shortName || o.title || name,
      start_url: `${base}/`,
      scope: `${base}/`,
      display: 'standalone',
      background_color: bg,
      theme_color: theme,
      icons: [
        { src: `${base}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: `${base}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      ],
    });
  });

  app.get(`${base}/pwa-register.js`, (req, res) => {
    res.type('application/javascript').set('Cache-Control', 'no-cache').send(
      "if ('serviceWorker' in navigator) { navigator.serviceWorker.register('sw.js').catch(() => {}); }\n");
  });

  app.get(`${base}/sw.js`, (req, res) => {
    res.type('application/javascript').set('Cache-Control', 'no-store').send(
`const BASE = ${JSON.stringify(base)};
const PREFIX = ${JSON.stringify(name + '-')};
const CACHE = ${JSON.stringify(cacheName)};
const ASSETS = ${JSON.stringify(assets)};

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(ASSETS.map((a) => c.add(a).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

/* only delete this app's old caches: several apps can share one origin */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* network-first (edits show on refresh), cache as offline fallback; API calls are never cached */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(BASE + '/')) return;
  if (url.pathname.startsWith(BASE + '/api/')) return;
  e.respondWith(
    fetch(req)
      .then((r) => {
        if (r.status === 200) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return r;
      })
      .catch(() => caches.match(req).then((hit) =>
        hit || (req.mode === 'navigate' ? caches.match(BASE + '/', { ignoreSearch: true }) : undefined)))
  );
});
`);
  });
}

module.exports = { mountPwa };
