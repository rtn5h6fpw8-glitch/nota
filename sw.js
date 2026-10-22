// App shell is served from cache and refreshed in the background; artwork is cached after the first view.
const CACHE = 'nota-v10';
const IMG = 'nota-img-v1';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'icon.svg', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== IMG).map((k) => caches.delete(k)))));
  self.clients.claim();
});
async function trim() {
  const c = await caches.open(IMG);
  const keys = await c.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - 600))) await c.delete(k);
}
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(r, { ignoreSearch: true });
      const net = fetch(r).then((res) => { if (res.ok) c.put(r, res.clone()); return res; });
      if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
      return net;
    }));
    return;
  }
  if (r.destination === 'image') {
    e.respondWith(caches.open(IMG).then(async (c) => {
      const hit = await c.match(r);
      if (hit) return hit;
      const res = await fetch(r);
      if (res.ok || res.type === 'opaque') { c.put(r, res.clone()); e.waitUntil(trim()); }
      return res;
    }));
  }
});
