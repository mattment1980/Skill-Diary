// Service Worker: speichert nur die App-Dateien zwischen (keine Spieler- oder Feedbackdaten).
// Beim Aufräumen nur eigene Caches (sd-*) löschen – das Sprachmodell liegt in "transformers-cache" und bleibt.
const VERSION = 'sd-v9';
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
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(res => {
    const copy = res.clone();
    caches.open(VERSION).then(c => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
