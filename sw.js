// Service Worker: speichert nur die App-Dateien zwischen (keine Spieler- oder Feedbackdaten).
// Beim Aufräumen nur eigene Caches (sd-*) löschen – das Sprachmodell liegt in "transformers-cache" und bleibt.
const VERSION = 'sd-v11';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/config.js', 'js/auth.js', 'js/onedrive.js',
  'js/anon.js', 'js/ai.js', 'js/speech.js', 'js/export.js', 'lib/msal-browser.min.js', 'manifest.webmanifest',
  'assets/logo.png', 'assets/bg.webp', 'assets/leo.webp', 'assets/leo-head.webp', 'assets/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('sd-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Netz zuerst, am HTTP-Cache vorbei (immer aktuelle Version), Cache als Rückfall ohne Verbindung. Nur eigene Dateien.
// Seitenaufrufe bekommen Cross-Origin-Isolation (COOP/COEP), damit das Sprachmodell mehrere
// Prozessorkerne nutzen darf. GitHub Pages kann diese Header nicht selbst setzen.
function isolate(res) {
  if (!res || res.type === 'opaque' || res.status === 0) return res;
  const h = new Headers(res.headers);
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Cross-Origin-Embedder-Policy', 'credentialless');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const nav = e.request.mode === 'navigate';
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(res => {
    const copy = res.clone();
    caches.open(VERSION).then(c => c.put(e.request, copy));
    return nav ? isolate(res) : res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => (nav ? isolate(r) : r))));
});
