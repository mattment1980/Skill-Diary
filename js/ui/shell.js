// Rahmen der App: Kopfzeile, aktive Ansicht, Ladefenster, Navigation; außerdem die Anmeldeseite.
import { S } from '../core/state.js';
import { flushPending } from '../core/data.js';
import { login } from '../services/auth.js';
import { h, $, withBusy, setRenderer } from './dom.js';
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
    views[S.tab](),
    S.busy && h('div', { class: 'busy' }, h('div', { class: 'spinner' }), h('span', { class: 'busy-msg' }, S.busy)),
    h('nav', { class: 'tabs' }, tab('capture', 'Erfassen', '✎'), tab('stats', 'Auswertung', '▤'), tab('settings', 'Einstellungen', '⚙')),
  ].filter(Boolean));
  if (S.tab !== 'capture') window.scrollTo(0, scroll);
  if (S.tab === 'settings') showModelStatus();
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
