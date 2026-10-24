// Ansicht „Prüfen“: KI-Vorschläge kontrollieren/ändern und als Zeilen ins Excel speichern.
import { CONFIG, today } from '../core/config.js';
import { S, saveDraft, savePending, activePlayers, areas, skillsOf, areaOfSkill, emptyEntry } from '../core/state.js';
import { uid } from '../core/format.js';
import { flushPending } from '../core/data.js';
import { h, toast, withBusy, render, select, levelPicker, showSaved } from '../ui/dom.js';

export function reviewView() {
  const R = S.review;
  const k = R.kontext;
  const players = activePlayers();
  const card = (e) => h('div', { class: 'card entry' },
    h('div', { class: 'row' },
      select(e.player?.name || '', players.map(p => p.name), v => { e.player = players.find(p => p.name === v) || null; render(); }, 'Spieler wählen'),
      h('button', { class: 'icon-btn', 'aria-label': 'Eintrag entfernen', onclick: () => { R.entries = R.entries.filter(x => x !== e); render(); } }, '✕')),
    h('div', { class: 'rating' }, ...CONFIG.ratings.map(r => h('button', {
      class: `chip r-${r.toLowerCase()} ${e.rating === r ? 'on' : ''} ${e.rating ? '' : 'missing'}`,
      onclick: () => { e.rating = r; render(); },
    }, r))),
    levelPicker(e.level, n => { e.level = n; render(); }),
    h('div', { class: 'row' },
      select(e.area, areas(), v => { e.area = v; if (!skillsOf(v).includes(e.skill)) e.skill = ''; render(); }, 'Bereich'),
      select(e.skill, skillsOf(e.area).length ? skillsOf(e.area) : S.cfg.skills.map(s => s.skill),
        v => { e.skill = v; e.area = areaOfSkill(v); render(); }, 'Skill')),
    select(e.position, S.cfg.positions.map(p => [p.code, `${p.code} – ${p.label || p.group}`]), v => { e.position = v; }, 'Position (optional)', true),
    h('textarea', { rows: 3, value: e.comment, class: e.comment.trim() ? '' : 'missing', oninput: ev => { e.comment = ev.target.value; } }));

  return h('section', { class: 'view review' },
    h('div', { class: 'card context' },
      h('div', { class: 'row' },
        ...['Spiel', 'Training'].map(v => h('button', { class: `chip ${k.art === v ? 'on' : ''}`, onclick: () => { k.art = k.art === v ? '' : v; render(); } }, v)),
        h('input', { type: 'date', value: k.date, onchange: ev => { k.date = ev.target.value; } })),
      h('input', { type: 'text', placeholder: 'Anlass / Gegner', value: k.anlass, oninput: ev => { k.anlass = ev.target.value; } })),
    R.entries.map(card),
    h('button', { class: 'btn ghost block', onclick: () => { R.entries.push(emptyEntry()); render(); } }, '+ Eintrag hinzufügen'),
    R.sent && h('details', { class: 'sent' }, h('summary', {}, 'An die KI gesendet (anonymisiert)'), h('pre', {}, R.sent)),
    h('div', { class: 'actions sticky' },
      h('button', { class: 'btn ghost', onclick: () => { S.review = null; S.tab = 'capture'; render(); } }, 'Zurück'),
      h('button', { class: 'btn primary', onclick: saveReview }, `Speichern (${R.entries.length})`)));
}

async function saveReview() {
  const R = S.review;
  const bad = R.entries.find(e => !e.player || !e.skill || !e.rating || !e.level || !e.comment.trim());
  if (bad) return toast('Bitte bei allen Einträgen Spieler, Skill, Bewertung, Niveau und Kommentar ausfüllen.', 'error');
  const group = uid().slice(0, 6);
  const now = new Date();
  const stamp = `${today()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const rows = R.entries.map(e => [uid(), stamp, R.kontext.date || '', R.kontext.art || '', R.kontext.anlass || '',
    e.player.name, e.position || '', e.area, e.skill, e.rating, e.comment.trim(), R.source, group, '', e.level]);
  S.pending.push(...rows); savePending();
  S.review = null;
  S.draft = { art: S.draft.art, date: today(), anlass: '', text: '' }; saveDraft();
  S.tab = 'capture';
  await withBusy('Speichere in OneDrive …', async () => {
    try { await flushPending(); showSaved(rows.length); } catch (e) {
      toast('Gerade nicht erreichbar – Einträge sind auf dem Handy vorgemerkt und werden nachgereicht.', 'error');
    }
  });
}
