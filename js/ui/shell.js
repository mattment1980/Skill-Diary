// Rahmen der App: Kopfzeile, aktive Ansicht, Ladefenster, Navigation; außerdem die Anmeldeseite.
import { S } from '../core/state.js';
import { flushPending, syncConfig } from '../core/data.js';
import { appFolderUrl, uploadFile } from '../services/onedrive.js';
import { CONFIG, settings } from '../core/config.js';
import { login } from '../services/auth.js';
import { h, $, toast, withBusy, setRenderer } from './dom.js';
import { captureView } from '../views/capture.js';
import { reviewView } from '../views/review.js';
import { statsView } from '../views/stats.js';
import { settingsView, showModelStatus } from '../views/settings.js';

function render() {
  const app = $('#app');
  const views = { capture: captureView, review: reviewView, stats: statsView, settings: settingsView };
  const tab = (id, label, icon) => h('button', { class: `tab ${S.tab === id || (id === 'capture' && S.tab === 'review') ? 'on' : ''}`, onclick: () => { S.tab = id === 'capture' && S.review ? 'review' : id; render(); } },
    h('span', { class: 'tab-icon' }, icon), label);
  const scroll = window.scrollY;
  app.replaceChildren(...[
    h('header', { class: 'top' },
      h('img', { src: 'assets/logo.png', alt: '', class: 'logo' }),
      h('div', { class: 'title' }, h('b', {}, 'Skill Diary'), h('small', {}, S.tab === 'review' ? 'Einträge prüfen' : 'Spieler-Feedback')),
      S.pending.length ? h('button', { class: 'pending', onclick: () => withBusy('Trage nach …', flushPending) }, `${S.pending.length} ausstehend ↻`) : null),
    S.tab === 'capture' && h('div', { class: 'hero' },
      h('img', { src: 'assets/leo-head.webp', alt: 'Leo', class: 'leo-head' }),
      h('div', { class: 'bubble' }, S.draft.text ? 'Gut mitgeschrieben! Dann ab zur Zuordnung.' : 'Na Coach, wer ist dir heute aufgefallen?')),
    S.noDb && setupCard(),
    views[S.tab](),
    S.busy && h('div', { class: 'busy' }, h('div', { class: 'spinner' }), h('span', { class: 'busy-msg' }, S.busy)),
    h('nav', { class: 'tabs' }, tab('capture', 'Erfassen', '✎'), tab('stats', 'Auswertung', '▤'), tab('settings', 'Einstellungen', '⚙')),
  ].filter(Boolean));
  if (S.tab !== 'capture') window.scrollTo(0, scroll);
  if (S.tab === 'settings') showModelStatus();
}

/** Gewählte Excel-Datei als Datenbank in den App-Ordner hochladen (Umzug ohne Ordnersuche). */
async function importWorkbook(file) {
  if (!file) return;
  if (!/\.xlsx$/i.test(file.name)) return toast('Bitte eine .xlsx-Datei wählen.', 'error');
  await withBusy('Übernehme Datenbank …', async () => {
    await uploadFile(settings.folder, CONFIG.workbookName, file);
    await syncConfig();
    if (!S.noDb) toast('Datenbank übernommen ✓ – die alte Datei kannst du jetzt löschen oder umbenennen.', 'ok');
  });
}

/** Hinweis, wenn im App-Ordner noch keine Datenbank liegt (Umzug oder Neueinrichtung). */
function setupCard() {
  return h('div', { class: 'card setup' },
    h('h3', {}, 'Datenbank nicht gefunden'),
    h('p', {}, 'Die App greift nur noch auf ihren eigenen Ordner zu: ', h('b', {}, 'OneDrive › Apps (deutsch: Anwendungen) › Skill Diary'), '.'),
    h('p', { class: 'hint' }, 'Am einfachsten: deine bisherige Skill-Diary.xlsx auswählen (z. B. in OneDrive), die App legt sie selbst in ihren Ordner.'),
    h('label', { class: 'btn primary block file-btn' }, 'Bestehende Datenbank auswählen',
      h('input', { type: 'file', accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', onchange: e => importWorkbook(e.target.files[0]) })),
    h('p', { class: 'hint' }, 'Oder selbst verschieben: „Datenbank“ nach OneDrive › Anwendungen › Skill Diary, dann „Erneut prüfen“.'),
    h('div', { class: 'actions' },
      h('button', { class: 'btn ghost', onclick: () => withBusy('Öffne Ordner …', async () => { window.open(await appFolderUrl(), '_blank', 'noopener'); }) }, 'Ordner öffnen'),
      h('button', { class: 'btn ghost', onclick: () => withBusy('Prüfe …', () => syncConfig()) }, 'Erneut prüfen')),
    h('button', { class: 'btn ghost block', onclick: () => {
      if (confirm('Wirklich eine neue, leere Datenbank anlegen? Nur wählen, wenn du keine bestehende Datenbank übernehmen willst.')) withBusy('Lege an …', () => syncConfig({ create: true }));
    } }, 'Stattdessen leere Datenbank anlegen'));
}

export function loginView() {
  $('#app').replaceChildren(h('section', { class: 'login' },
    h('img', { src: 'assets/logo.png', alt: '', class: 'logo big' }),
    h('h1', {}, 'Skill Diary'),
    h('img', { src: 'assets/leo.webp', alt: 'Leo', class: 'leo' }),
    h('button', { class: 'btn primary block', onclick: login }, 'Mit Microsoft anmelden'),
    h('p', { class: 'hint' }, 'Deine Daten liegen ausschließlich in deinem OneDrive.')));
}

setRenderer(render);
