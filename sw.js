// The app shell is taken from the network first, so updates show up at once; the saved copy is used only offline.
// Artwork is cached after the first view.
const VERSION = 'note-v34';
const CACHE = 'shell-' + VERSION;
const IMG = 'nota-img-v1';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest', 'fonts/bowlby-note.woff2', 'fonts/unbounded-cyr.woff2', 'fonts/unbounded-lat.woff2'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const old = (await caches.keys()).filter((k) => k !== CACHE && k !== IMG);
    await Promise.all(old.map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
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
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const res = await Promise.race([fetch(r, { cache: 'no-cache' }), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 3000))]);
        if (res.ok) c.put(r, res.clone());
        return res;
      } catch {
        return (await c.match(r, { ignoreSearch: true })) || (r.mode === 'navigate' ? c.match('./') : Response.error());
      }
    })());
    return;
  }
  if (r.destination === 'image') {
    e.respondWith(caches.open(IMG).then(async (c) => {
      const hit = await c.match(r);
      if (hit) return hit;
      const res = await fetch(r);
      if (res.ok || res.type === 'opaque') { c.put(r, res.clone()); if (Math.random() < 0.05) e.waitUntil(trim()); }
      return res;
    }));
  }
});
