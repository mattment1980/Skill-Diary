// Service Worker: App-Dateien für Offline-Nutzung zwischenspeichern und
// Cross-Origin-Isolation setzen. Speichert KEINE Spieler- oder Feedbackdaten.
// Aufräumen löscht nur eigene Caches (sd-*); das Sprachmodell liegt in "transformers-cache" und bleibt erhalten.
importScripts('js/version.js');

const VERSION = `sd-v${self.APP_VERSION}`;
const SHELL = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'lib/msal-browser.min.js',
  'js/main.js', 'js/version.js',
  'js/core/config.js', 'js/core/state.js', 'js/core/format.js', 'js/core/stats.js', 'js/core/data.js',
  'js/services/auth.js', 'js/services/onedrive.js', 'js/services/ai.js', 'js/services/speech.js', 'js/services/anon.js',
  'js/ui/dom.js', 'js/ui/charts.js', 'js/ui/shell.js',
  'js/views/capture.js', 'js/views/review.js', 'js/views/stats.js', 'js/views/settings.js',
  'js/export/charts.js', 'js/export/report.js', 'lib/jszip.min.js', 'template/Auswertung-Vorlage.pptx',
  'assets/logo.png', 'assets/bg.webp', 'assets/leo.webp', 'assets/leo-head.webp', 'assets/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('sd-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Seitenaufrufe bekommen Cross-Origin-Isolation (COOP/COEP), damit das Sprachmodell mehrere
// Prozessorkerne nutzen darf. GitHub Pages kann diese Header nicht selbst setzen.
function isolate(res) {
  if (!res || res.type === 'opaque' || res.status === 0) return res;
  const h = new Headers(res.headers);
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Cross-Origin-Embedder-Policy', 'credentialless');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

// Netz zuerst, am HTTP-Cache vorbei (immer aktuelle Version); Cache nur als Rückfall ohne Verbindung.
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
