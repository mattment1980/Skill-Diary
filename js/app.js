// Skill Diary – Oberfläche und Ablauf.
// Ansichten: Erfassen -> Prüfen -> Speichern, Auswertung (inkl. Zusammenfassung/Word), Einstellungen.
import { CONFIG, settings, saveSettings, load, save, today } from './config.js';
import { initAuth, login, logout, accountName } from './auth.js';
import * as od from './onedrive.js';
import { anonymize, deanonymize } from './anon.js';
import { extractFeedback, summarize } from './ai.js';
import { startDictation, localStatus, loadWhisper, whisperCached, WHISPER_MODELS, WHISPER_DEVICES } from './speech.js';
import { buildDocx } from './export.js';

const APP_VERSION = '14';

/* ---------- Zustand ---------- */
const S = {
  tab: 'capture',
  cfg: load('sd.cfg', { players: [], skills: [], positions: [] }), // Kopie der Konfiguration für Offline-Nutzung
  pending: load('sd.pending', []),     // noch nicht gespeicherte Zeilen (z. B. ohne Netz)
  draft: load('sd.draft', { art: '', date: today(), anlass: '', text: '' }),
  review: null,                         // aktuell zu prüfende Einträge
  feedback: null,                       // geladene Feedback-Daten (nur im Speicher)
  stats: { player: '', from: CONFIG.seasonStart, to: today(), area: '' },
  summary: null,
  busy: '',
  dictation: null,
  editId: null,                         // Eintrag in der Auswertung, der gerade bearbeitet wird
  edit: null,
};
const saveDraft = () => save('sd.draft', S.draft);
const savePending = () => save('sd.pending', S.pending);

/* ---------- DOM-Helfer ---------- */
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}
const $ = sel => document.querySelector(sel);
const uid = () => crypto.getRandomValues(new Uint32Array(2)).reduce((s, x) => s + x.toString(36), '').slice(0, 10);
const fmtDate = iso => (iso ? iso.split('-').reverse().join('.') : 'ohne Datum');
const firstName = n => n.split(' ')[0];
/** Vorname; bei doppeltem Vornamen mit Nachnamen-Initial ("Luis Z."). */
const displayName = p => {
  const f = firstName(p.name);
  const dup = S.cfg.players.filter(x => firstName(x.name) === f).length > 1;
  return dup ? `${f} ${(p.name.split(' ')[1] || '').charAt(0)}.` : f;
};
const activePlayers = () => S.cfg.players.filter(p => p.active);
const areas = () => [...new Set(S.cfg.skills.map(s => s.area))];
const skillsOf = area => S.cfg.skills.filter(s => s.area === area).map(s => s.skill);
const areaOfSkill = skill => S.cfg.skills.find(s => s.skill === skill)?.area || '';

function toast(msg, kind = '') {
  const t = h('div', { class: `toast ${kind}` }, msg);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), kind === 'error' ? 6000 : 3000);
}

/** Auswahl-Dialog; liefert das gewählte Element oder null. */
function choose(title, options, label) {
  return new Promise(resolve => {
    const close = v => { m.remove(); resolve(v); };
    const m = h('div', { class: 'modal' }, h('div', { class: 'sheet' },
      h('h3', {}, title),
      ...options.map(o => h('button', { class: 'btn block', onclick: () => close(o) }, label(o))),
      h('button', { class: 'btn ghost block', onclick: () => close(null) }, 'Keiner davon')));
    document.body.append(m);
  });
}

async function withBusy(msg, fn) {
  S.busy = msg; render();
  try { return await fn(); } catch (e) { console.error(e); toast(e.message || String(e), 'error'); } finally { S.busy = ''; render(); }
}

/* ---------- Synchronisation ---------- */
async function syncConfig() {
  await od.ensureWorkbook();
  S.cfg = await od.readConfig();
  save('sd.cfg', S.cfg);
}

async function flushPending() {
  if (!S.pending.length) return;
  await od.appendFeedback(S.pending);
  const n = S.pending.length;
  S.pending = []; savePending();
  S.feedback = null;
  toast(`${n} ausstehende Einträge nachgetragen`, 'ok');
}

/* ---------- Erfassen ---------- */
function captureView() {
  const d = S.draft;
  const chip = (val) => h('button', {
    class: `chip ${d.art === val ? 'on' : ''}`,
    onclick: () => { d.art = d.art === val ? '' : val; saveDraft(); render(); },
  }, val);
  const ta = h('textarea', {
    id: 'note', rows: 9, placeholder: 'Was ist dir aufgefallen? z. B. „Ferdi hat heute als LV super gescannt, Moritz muss am ersten Kontakt arbeiten …“',
    value: d.text, oninput: e => { d.text = e.target.value; saveDraft(); },
  });
  const dict = S.dictation;
  return h('section', { class: 'view capture' },
    h('div', { class: 'card context' },
      h('div', { class: 'row' }, chip('Spiel'), chip('Training'),
        h('input', { type: 'date', value: d.date, onchange: e => { d.date = e.target.value; saveDraft(); } })),
      h('input', { type: 'text', placeholder: 'Anlass / Gegner (optional – geht auch im Text)', value: d.anlass,
        oninput: e => { d.anlass = e.target.value; saveDraft(); } })),
    h('div', { class: 'card note' }, ta, h('div', { id: 'interim', class: 'interim' })),
    h('div', { class: 'mic-wrap' },
      h('button', { class: `mic ${dict ? 'rec' : ''}`, 'aria-label': 'Diktieren', onclick: toggleDictation },
        h('span', { class: 'mic-icon' }, dict ? '■' : '🎙')),
      h('div', { id: 'mic-hint', class: 'mic-hint' }, dict ? micLabel() : 'Tippen zum Diktieren')),
    h('div', { class: 'actions' },
      h('button', { class: 'btn ghost', onclick: manualEntry }, 'Manuell'),
      h('button', { class: 'btn primary', onclick: runAI }, 'KI zuordnen')),
    !activePlayers().length && h('p', { class: 'hint' }, 'Noch keine Spieler geladen – unter Einstellungen prüfen.'));
}

let recTimer = null;
function micLabel() {
  const d = S.dictation;
  if (!d) return 'Tippen zum Diktieren';
  if (d.mode !== 'whisper') return d.mode === 'local' ? 'Ich höre zu … (auf dem Gerät)' : 'Ich höre zu … (Cloud)';
  const sec = Math.round((Date.now() - d.started) / 1000);
  return `Aufnahme ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} – zum Beenden tippen`;
}

/** Zeigt Fortschritt (Modell-Download, Umwandlung) im Ladefenster bzw. unter dem Textfeld. */
function speechStatus(msg) {
  if (S.busy) { S.busy = msg; const el = $('.busy-msg'); if (el) el.textContent = msg; }
  else { const el = $('#interim'); if (el) el.textContent = msg; }
}

/** Beendet eine laufende Aufnahme; bei Whisper wird gewartet, bis der Text da ist. */
async function stopDictation() {
  const d = S.dictation;
  if (!d) return;
  clearInterval(recTimer);
  if (d.mode === 'whisper') {
    S.busy = 'Sprache wird umgewandelt …'; render();
    try { await d.stop(); } finally { S.busy = ''; S.dictation = null; render(); }
  } else { d.stop(); S.dictation = null; render(); }
}

async function toggleDictation() {
  if (S.dictation) return stopDictation();
  try {
    const d = await startDictation({
      onText: t => {
        S.draft.text = (S.draft.text ? S.draft.text.replace(/\s*$/, ' ') : '') + t;
        saveDraft();
        const ta = $('#note'); if (ta) { ta.value = S.draft.text; ta.scrollTop = ta.scrollHeight; }
      },
      onInterim: t => { const el = $('#interim'); if (el) el.textContent = t; },
      onStatus: speechStatus,
      onInfo: msg => toast(msg),
      onEnd: msg => {
        if (S.dictation?.mode !== 'whisper') { S.dictation = null; render(); }
        const el = $('#interim'); if (el) el.textContent = '';
        if (msg) toast(msg, 'error');
      },
    });
    S.dictation = { ...d, stop: d.stop, started: Date.now() };
    clearInterval(recTimer);
    if (d.mode === 'whisper') recTimer = setInterval(() => { const el = $('#mic-hint'); if (el) el.textContent = micLabel(); }, 1000);
    render();
  } catch (e) {
    toast(e.message, 'error');
  }
}

const emptyEntry = (o = {}) => ({ id: uid(), player: null, area: '', skill: '', rating: '', level: 0, position: '', comment: '', ...o });

async function manualEntry() {
  await stopDictation();
  const d = S.draft;
  S.review = { kontext: { art: d.art, date: d.date, anlass: d.anlass }, entries: [emptyEntry({ comment: d.text.trim() })], source: 'manuell', sent: '' };
  S.tab = 'review'; render();
}

async function runAI() {
  const d = S.draft;
  await stopDictation();
  if (!d.text.trim()) return toast('Erst etwas diktieren oder eintippen.');
  await withBusy('KI ordnet zu …', async () => {
    const { text, codes } = await anonymize(d.text, activePlayers(),
      (token, cands) => choose(`Welcher „${token}“ ist gemeint?`, cands, p => p.name));
    if (!codes.size) toast('Kein Spielername erkannt – bitte Spieler in der Prüfung auswählen.');
    const r = await extractFeedback({ text, codes, skills: S.cfg.skills, positions: S.cfg.positions, dateStr: `${today()} (${new Date().toLocaleDateString('de-DE', { weekday: 'long' })})` });
    const k = r.kontext || {};
    const entries = (r.eintraege || []).map(e => {
      const skill = skillsOf(e.bereich).includes(e.skill) ? e.skill : (areaOfSkill(e.skill) ? e.skill : '');
      return emptyEntry({
        player: codes.get(e.spieler) || null,
        skill, area: skill ? areaOfSkill(skill) : (areas().includes(e.bereich) ? e.bereich : ''),
        rating: e.bewertung || '', position: e.position || '',
        level: Number(e.niveau) >= 1 && Number(e.niveau) <= 5 ? Number(e.niveau) : 0,
        comment: deanonymize(e.kommentar, codes, displayName),
      });
    });
    S.review = {
      kontext: {
        art: d.art || k.art || '',
        date: (d.date !== today() ? d.date : (k.datum || d.date)),
        anlass: d.anlass || k.anlass || '',
      },
      entries: entries.length ? entries : [emptyEntry({ comment: d.text.trim() })],
      source: 'KI', sent: text,
    };
    S.tab = 'review';
  });
}

/* ---------- Prüfen ---------- */
/** Knöpfe 1–5 für das Niveau im Altersvergleich. */
function levelPicker(value, onpick) {
  return h('div', { class: 'levels' },
    h('span', { class: 'levels-label' }, 'Niveau', h('small', {}, value ? CONFIG.levels[value] : 'im Altersvergleich')),
    h('div', { class: 'level-btns' }, ...[1, 2, 3, 4, 5].map(n => h('button', {
      class: `lvl l${n} ${Number(value) === n ? 'on' : ''} ${value ? '' : 'missing'}`, title: CONFIG.levels[n],
      onclick: () => onpick(n),
    }, String(n)))));
}

function select(value, options, onchange, placeholder, optional = false) {
  return h('select', { class: value || optional ? '' : 'missing', onchange: e => onchange(e.target.value) },
    h('option', { value: '' }, placeholder),
    ...options.map(o => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return h('option', { value: v, selected: v === value }, l);
    }));
}

function reviewView() {
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

function showSaved(n) {
  const m = h('div', { class: 'modal saved', onclick: () => m.remove() }, h('div', { class: 'sheet center' },
    h('img', { src: 'assets/leo-head.webp', alt: '', class: 'leo-head' }),
    h('h3', {}, `${n} ${n === 1 ? 'Eintrag' : 'Einträge'} gespeichert`),
    h('p', {}, 'Stark! Weiter so, Coach.')));
  document.body.append(m);
  setTimeout(() => m.remove(), 1800);
}

/* ---------- Auswertung ---------- */
function statsView() {
  const st = S.stats;
  const head = h('div', { class: 'card context' },
    select(st.player, activePlayers().map(p => p.name), v => { st.player = v; S.summary = null; render(); }, 'Alle Spieler (Übersicht)', true),
    h('div', { class: 'row' },
      h('label', {}, 'von', h('input', { type: 'date', value: st.from, onchange: e => { st.from = e.target.value; S.summary = null; render(); } })),
      h('label', {}, 'bis', h('input', { type: 'date', value: st.to, onchange: e => { st.to = e.target.value; S.summary = null; render(); } })),
      h('button', { class: 'icon-btn', 'aria-label': 'Neu laden', onclick: () => { S.feedback = null; loadFeedback(); } }, '↻')));
  if (!S.feedback) { loadFeedback(); return h('section', { class: 'view' }, head, h('p', { class: 'hint' }, 'Lade Daten …')); }
  if (!st.player) return h('section', { class: 'view' }, head, overview());

  const all = S.feedback.filter(f => f.Spieler === st.player && (!f.Datum || (f.Datum >= st.from && f.Datum <= st.to)))
    .sort((a, b) => String(b.Datum).localeCompare(String(a.Datum)));
  const list = st.area ? all.filter(f => f.Bereich === st.area) : all;
  const count = (rows, r) => rows.filter(f => f.Bewertung === r).length;
  const bar = rows => {
    const t = rows.length || 1;
    return h('div', { class: 'bar' }, ...CONFIG.ratings.map(r => {
      const n = count(rows, r);
      return n ? h('span', { class: `seg r-${r.toLowerCase()}`, style: `flex:${n / t}` }, n) : null;
    }));
  };
  return h('section', { class: 'view stats' }, head,
    h('div', { class: 'card' },
      h('div', { class: 'totals' }, ...CONFIG.ratings.map(r => h('div', { class: `total r-${r.toLowerCase()}` }, h('b', {}, count(all, r)), r))),
      ...areas().map(a => {
        const rows = all.filter(f => f.Bereich === a);
        return h('button', { class: `area-row ${st.area === a ? 'on' : ''}`, onclick: () => { st.area = st.area === a ? '' : a; render(); } },
          h('span', { class: 'area-name' }, a, h('small', {}, ` ${rows.length}`)), bar(rows));
      })),
    radar(all, st.player),
    timeline(list, st.area),
    S.summary ? summaryEditor() : h('button', { class: 'btn primary block', disabled: !all.length, onclick: () => makeSummary(all) }, 'Zusammenfassung erstellen'),
    h('h3', { class: 'list-title' }, st.area ? `${st.area} (${list.length})` : `Alle Einträge (${list.length})`),
    ...list.map(f => (S.editId === f.ID ? editCard(f) : h('div', { class: `card fb r-${String(f.Bewertung).toLowerCase()}` },
      h('div', { class: 'fb-head' },
        h('div', { class: 'fb-meta' }, `${fmtDate(f.Datum)} · ${[f.Art, f.Anlass].filter(Boolean).join(' ') || '–'}${f.Position ? ' · ' + f.Position : ''}`),
        h('button', { class: 'mini', 'aria-label': 'Bearbeiten', onclick: () => { S.editId = f.ID; S.edit = { ...f }; render(); } }, '✎'),
        h('button', { class: 'mini', 'aria-label': 'Löschen', onclick: () => removeFeedback(f) }, '✕')),
      h('div', { class: 'fb-skill' }, f.Skill, h('span', { class: 'tags' }, Number(f.Niveau) ? h('span', { class: `tag lvl-tag l${f.Niveau}` }, `Niveau ${f.Niveau}`) : null, h('span', { class: 'tag' }, f.Bewertung))),
      h('div', {}, f.Kommentar)))));
}

/** Bearbeitungsansicht eines gespeicherten Eintrags in der Auswertung. */
function editCard(f) {
  const e = S.edit;
  return h('div', { class: 'card entry' },
    h('div', { class: 'row' },
      h('input', { type: 'date', value: e.Datum || '', onchange: ev => { e.Datum = ev.target.value; } }),
      ...['Spiel', 'Training'].map(v => h('button', { class: `chip ${e.Art === v ? 'on' : ''}`, onclick: () => { e.Art = e.Art === v ? '' : v; render(); } }, v))),
    h('input', { type: 'text', placeholder: 'Anlass / Gegner', value: e.Anlass || '', oninput: ev => { e.Anlass = ev.target.value; } }),
    h('div', { class: 'rating' }, ...CONFIG.ratings.map(r => h('button', {
      class: `chip r-${r.toLowerCase()} ${e.Bewertung === r ? 'on' : ''}`, onclick: () => { e.Bewertung = r; render(); },
    }, r))),
    levelPicker(Number(e.Niveau) || 0, n => { e.Niveau = n; render(); }),
    h('div', { class: 'row' },
      select(e.Bereich, areas(), v => { e.Bereich = v; if (!skillsOf(v).includes(e.Skill)) e.Skill = ''; render(); }, 'Bereich'),
      select(e.Skill, skillsOf(e.Bereich).length ? skillsOf(e.Bereich) : S.cfg.skills.map(s => s.skill), v => { e.Skill = v; e.Bereich = areaOfSkill(v); render(); }, 'Skill')),
    select(e.Position || '', S.cfg.positions.map(p => [p.code, `${p.code} – ${p.label || p.group}`]), v => { e.Position = v; }, 'Position (optional)', true),
    h('textarea', { rows: 4, value: e.Kommentar, oninput: ev => { e.Kommentar = ev.target.value; } }),
    h('div', { class: 'actions' },
      h('button', { class: 'btn ghost', onclick: () => { S.editId = null; render(); } }, 'Abbrechen'),
      h('button', { class: 'btn primary', onclick: saveEdit }, 'Speichern')));
}

async function saveEdit() {
  const e = S.edit;
  if (!e.Skill || !e.Bewertung || !String(e.Kommentar).trim()) return toast('Skill, Bewertung und Kommentar ausfüllen.', 'error');
  const patch = { Datum: e.Datum || '', Art: e.Art || '', Anlass: e.Anlass || '', Bereich: e.Bereich, Skill: e.Skill, Niveau: Number(e.Niveau) || '',
    Bewertung: e.Bewertung, Position: e.Position || '', Kommentar: String(e.Kommentar).trim() };
  await withBusy('Speichere Änderung …', async () => {
    await od.updateFeedback(e.ID, patch);
    Object.assign(S.feedback.find(f => f.ID === e.ID), patch);
    S.editId = null; S.summary = null;
    toast('Geändert', 'ok');
  });
}

async function removeFeedback(f) {
  if (!confirm(`Diesen Eintrag wirklich löschen?\n\n${f.Skill}: ${String(f.Kommentar).slice(0, 80)}`)) return;
  await withBusy('Lösche …', async () => {
    await od.deleteFeedback(f.ID);
    S.feedback = S.feedback.filter(x => x.ID !== f.ID);
    S.summary = null;
    toast('Gelöscht', 'ok');
  });
}

/** Spinnendiagramm: durchschnittliches Niveau je Kompetenzbereich (Spieler vs. Team im selben Zeitraum). */
function radar(rows, playerName) {
  const A = areas();
  const inRange = f => !f.Datum || (f.Datum >= S.stats.from && f.Datum <= S.stats.to);
  const avg = (list, a) => {
    const v = list.filter(f => f.Bereich === a && Number(f.Niveau) >= 1).map(f => Number(f.Niveau));
    return v.length ? { val: v.reduce((x, y) => x + y, 0) / v.length, n: v.length } : null;
  };
  const me = A.map(a => avg(rows, a));
  const team = A.map(a => avg(S.feedback.filter(inRange), a));
  const card = (...k) => h('div', { class: 'card' }, h('h3', {}, 'Niveau je Bereich'), ...k);
  if (!me.some(Boolean)) return card(h('p', { class: 'hint' }, 'Noch keine Einträge mit Niveau im Zeitraum. Das Niveau wird ab jetzt bei jedem neuen Eintrag erfasst und lässt sich bei alten Einträgen über ✎ nachtragen.'));

  const W = 390, H = 260, cx = W / 2, cy = 128, R = 84, n = A.length;
  const ang = i => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const pt = (i, v) => [cx + Math.cos(ang(i)) * R * (v / 5), cy + Math.sin(ang(i)) * R * (v / 5)];
  const poly = vals => vals.map((v, i) => pt(i, v ? v.val : 0).map(x => x.toFixed(1)).join(',')).join(' ');
  let svg = '';
  for (let lvl = 1; lvl <= 5; lvl++) {
    svg += `<polygon points="${A.map((_, i) => pt(i, lvl).join(',')).join(' ')}" class="${lvl === 3 ? 'rd-ref' : 'rd-grid'}"/>`;
  }
  A.forEach((a, i) => {
    const [x, y] = pt(i, 5);
    svg += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="rd-grid"/>`;
    const [lx, ly] = pt(i, 5.75);
    const anchor = Math.abs(lx - cx) < 5 ? 'middle' : lx > cx ? 'start' : 'end';
    const label = a.split(' / ')[0];
    svg += `<text x="${lx}" y="${ly}" text-anchor="${anchor}" class="rd-l">${label}</text>`;
    svg += `<text x="${lx}" y="${ly + 13}" text-anchor="${anchor}" class="rd-v">${me[i] ? me[i].val.toFixed(1).replace('.', ',') : '–'}</text>`;
  });
  if (team.some(Boolean)) svg += `<polygon points="${poly(team)}" class="rd-team"/>`;
  svg += `<polygon points="${poly(me)}" class="rd-me"/>`;
  me.forEach((v, i) => { if (v) { const [x, y] = pt(i, v.val); svg += `<circle cx="${x}" cy="${y}" r="3.5" class="rd-dot"/>`; } });
  const chart = h('div', { class: 'radar' });
  chart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Niveau je Kompetenzbereich">${svg}</svg>`;
  const counted = me.reduce((s, v) => s + (v ? v.n : 0), 0);
  return card(chart,
    h('div', { class: 'legend' },
      h('span', { class: 'lg lg-me' }, firstName(playerName)),
      h('span', { class: 'lg lg-team' }, 'Team-Schnitt'),
      h('span', { class: 'lg lg-ref' }, '3 = altersgemäß')),
    h('p', { class: 'hint' }, `Grundlage: ${counted} Einträge mit Niveau im Zeitraum.`));
}

/** Zeitleiste: gestapelte Säulen je Monat (bei bis zu ~10 Wochen je Woche) mit Positiv/Neutral/Kritisch. */
function timeline(rows, area) {
  const dated = rows.filter(f => /^\d{4}-\d{2}-\d{2}$/.test(String(f.Datum)));
  const undated = rows.length - dated.length;
  const card = (...kids) => h('div', { class: 'card' }, h('h3', {}, `Verlauf${area ? ` · ${area}` : ''}`), ...kids);
  if (!dated.length) return card(h('p', { class: 'hint' }, 'Noch keine datierten Einträge im Zeitraum.'));

  const days = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
  const fromD = days(S.stats.from), toD = days(S.stats.to);
  const weekly = toD - fromD <= 70;
  const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  // Buckets lückenlos über den gewählten Zeitraum anlegen
  const buckets = [];
  if (weekly) {
    const monday = d => d - ((new Date(d * 86400000).getUTCDay() + 6) % 7);
    for (let d = monday(fromD); d <= toD; d += 7) {
      const dt = new Date(d * 86400000);
      buckets.push({ start: d, end: d + 6, label: `${dt.getUTCDate()}.${dt.getUTCMonth() + 1}.` });
    }
  } else {
    let y = +S.stats.from.slice(0, 4), m = +S.stats.from.slice(5, 7) - 1;
    while (Date.UTC(y, m, 1) / 86400000 <= toD) {
      buckets.push({ start: Date.UTC(y, m, 1) / 86400000, end: Date.UTC(y, m + 1, 1) / 86400000 - 1, label: MONTHS[m] });
      if (++m > 11) { m = 0; y++; }
    }
  }
  for (const b of buckets) {
    const inB = dated.filter(f => { const d = days(f.Datum); return d >= b.start && d <= b.end; });
    b.counts = CONFIG.ratings.map(r => inB.filter(f => f.Bewertung === r).length);
    b.total = inB.length;
  }
  const max = Math.max(1, ...buckets.map(b => b.total));
  const W = 340, H = 150, top = 14, bottom = 22, left = 4;
  const slot = (W - left) / buckets.length, bw = Math.min(34, slot * 0.7);
  const scale = (H - top - bottom) / max;
  const colors = ['var(--pos)', 'var(--neu)', 'var(--krit)'];
  let svg = '';
  buckets.forEach((b, i) => {
    const x = left + i * slot + (slot - bw) / 2;
    let y = H - bottom;
    b.counts.forEach((n, k) => {
      if (!n) return;
      const hgt = n * scale;
      y -= hgt;
      svg += `<rect x="${x}" y="${y}" width="${bw}" height="${hgt}" rx="2" fill="${colors[k]}"><title>${b.label}: ${n} ${CONFIG.ratings[k]}</title></rect>`;
      if (hgt >= 12) svg += `<text x="${x + bw / 2}" y="${y + hgt / 2 + 4}" text-anchor="middle" class="tl-n">${n}</text>`;
    });
    if (b.total) svg += `<text x="${x + bw / 2}" y="${y - 3}" text-anchor="middle" class="tl-t">${b.total}</text>`;
    if (!weekly || buckets.length <= 8 || i % 2 === 0) svg += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" class="tl-l">${b.label}</text>`;
  });
  svg += `<line x1="0" x2="${W}" y1="${H - bottom}" y2="${H - bottom}" class="tl-axis"/>`;
  const chart = h('div', { class: 'timeline' });
  chart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Verlauf der Bewertungen">${svg}</svg>`;
  return card(chart,
    h('div', { class: 'legend' }, ...CONFIG.ratings.map(r => h('span', { class: `lg r-${r.toLowerCase()}` }, r)),
      h('span', { class: 'hint' }, weekly ? 'je Woche' : 'je Monat')),
    undated ? h('p', { class: 'hint' }, `${undated} Einträge ohne Datum sind nicht enthalten.`) : null);
}

function overview() {
  const by = {};
  for (const f of S.feedback) (by[f.Spieler] ||= []).push(f);
  return h('div', { class: 'card' }, h('h3', {}, 'Einträge je Spieler'),
    ...activePlayers().map(p => {
      const rows = by[p.name] || [];
      return h('button', { class: 'area-row', onclick: () => { S.stats.player = p.name; render(); } },
        h('span', { class: 'area-name' }, p.name, h('small', {}, ` ${rows.length}`)),
        h('div', { class: 'bar' }, ...CONFIG.ratings.map(r => {
          const n = rows.filter(f => f.Bewertung === r).length;
          return n ? h('span', { class: `seg r-${r.toLowerCase()}`, style: `flex:${n}` }, n) : null;
        })));
    }));
}

let loadingFb = false;
async function loadFeedback() {
  if (loadingFb) return;
  loadingFb = true;
  try { await od.ensureWorkbook(); S.feedback = await od.readFeedback(); } catch (e) { toast(e.message, 'error'); S.feedback = []; }
  loadingFb = false; render();
}

async function makeSummary(rows) {
  const player = S.cfg.players.find(p => p.name === S.stats.player);
  await withBusy('Zusammenfassung wird geschrieben …', async () => {
    const code = 'P-ICH';
    const lines = [...rows].reverse().map(f => `${fmtDate(f.Datum)} | ${[f.Art, f.Anlass].filter(Boolean).join(' ') || '–'} | ${f.Bereich}/${f.Skill} | ${f.Bewertung} | ${Number(f.Niveau) || '–'} | ${String(f.Kommentar).replace(/\n/g, ' ')}`);
    const { text } = await anonymize(lines.join('\n'), S.cfg.players,
      async (_t, cands) => (cands.includes(player) ? player : null), { player, code });
    const period = `${fmtDate(S.stats.from)} – ${fmtDate(S.stats.to)}`;
    const r = await summarize({ code, lines: text.replace(/P-(?!ICH)[A-Z2-9]{3}/g, 'ein Mitspieler').split('\n'), period });
    S.summary = { period, ...r };
  });
}

function summaryEditor() {
  const s = S.summary;
  const words = t => (t.trim().match(/\S+/g) || []).length;
  const listArea = (key, max) => h('textarea', {
    rows: 5, value: s[key].join('\n'),
    oninput: e => { s[key] = e.target.value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, max); },
  });
  const counter = h('small', { class: 'counter' }, `${words(s.einschaetzung)}/100 Wörter`);
  return h('div', { class: 'card summary' },
    h('h3', {}, 'Unsere Einschätzung ', counter),
    h('textarea', { rows: 6, value: s.einschaetzung, oninput: e => { s.einschaetzung = e.target.value; counter.textContent = `${words(e.target.value)}/100 Wörter`; } }),
    h('h3', {}, 'Das machst du schon super'), h('small', { class: 'hint' }, 'Ein Punkt pro Zeile, max. 5'), listArea('super', 5),
    h('h3', {}, 'Hier kannst du dich noch verbessern'), listArea('verbessern', 5),
    h('h3', {}, 'Darauf kannst du stolz sein'),
    ...s.stolz.map(b => h('div', { class: 'stolz' },
      h('input', { type: 'text', value: b.titel, oninput: e => { b.titel = e.target.value; } }),
      h('textarea', { rows: 3, value: b.text, oninput: e => { b.text = e.target.value; } }))),
    h('div', { class: 'actions' },
      h('button', { class: 'btn ghost', onclick: () => { S.summary = null; render(); } }, 'Verwerfen'),
      h('button', { class: 'btn primary', onclick: exportWord }, 'Word exportieren')));
}

async function exportWord() {
  const name = S.stats.player;
  await withBusy('Erstelle Word-Datei …', async () => {
    const blob = await buildDocx({ name, period: S.summary.period, summary: S.summary });
    const file = `${name} - Entwicklungsfeedback ${today()}.docx`;
    const a = h('a', { href: URL.createObjectURL(blob), download: file });
    document.body.append(a); a.click(); a.remove();
    await od.uploadFile(settings.exportFolder, file, blob);
    toast('Word-Datei gespeichert (OneDrive „Exporte“ + Download)', 'ok');
  });
}

/* ---------- Einstellungen ---------- */
function settingsView() {
  const cfg = S.cfg;
  const field = (label, key, type = 'text') => h('label', { class: 'field' }, label,
    h('input', { type, value: settings[key], onchange: e => saveSettings({ [key]: e.target.value.trim() }) }));
  const rowsEditor = (title, list, cols, make) => h('div', { class: 'card' },
    h('h3', {}, title),
    ...list.map(item => h('div', { class: 'row edit' },
      ...cols.map(([key, ph, kind]) => kind === 'check'
        ? h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: item[key], onchange: e => { item[key] = e.target.checked; } }), ph)
        : h('input', { type: 'text', placeholder: ph, value: kind === 'list' ? item[key].join(', ') : item[key],
            oninput: e => { item[key] = kind === 'list' ? e.target.value.split(/[,;]/).map(s => s.trim()).filter(Boolean) : e.target.value; } })),
      h('button', { class: 'icon-btn', 'aria-label': 'Entfernen', onclick: () => { list.splice(list.indexOf(item), 1); render(); } }, '✕'))),
    h('button', { class: 'btn ghost block', onclick: () => { list.push(make()); render(); } }, '+ hinzufügen'));

  return h('section', { class: 'view settings' },
    h('div', { class: 'card' }, h('h3', {}, 'Konto'),
      h('p', {}, accountName()),
      h('button', { class: 'btn ghost', onclick: logout }, 'Abmelden')),
    h('div', { class: 'card' }, h('h3', {}, 'KI'),
      field('Anthropic-Schlüssel (bleibt nur auf diesem Handy)', 'apiKey', 'password'),
      field('Modell Zuordnung', 'modelExtract'),
      field('Modell Zusammenfassung', 'modelSummary')),
    h('div', { class: 'card' }, h('h3', {}, 'OneDrive'),
      field('Ordner Datenbank', 'folder'),
      field('Ordner Exporte', 'exportFolder')),
    h('div', { class: 'card' }, h('h3', {}, 'Spracheingabe'),
      h('p', { class: 'hint' }, 'Der Aufnahme-Button nutzt die Erkennung direkt auf dem Gerät. Ist die Chrome-eigene nicht verfügbar, wandelt ein Sprachmodell (Whisper) die Aufnahme auf dem Handy in Text um – ohne Upload.'),
      h('label', { class: 'field' }, 'Sprachmodell',
        h('select', { onchange: e => { saveSettings({ whisperModel: e.target.value }); showModelStatus(); } },
          ...Object.entries(WHISPER_MODELS).map(([v, l]) => h('option', { value: v, selected: (settings.whisperModel || Object.keys(WHISPER_MODELS)[0]) === v }, l)))),
      h('label', { class: 'field' }, 'Rechnen auf',
        h('select', { onchange: e => { saveSettings({ whisperDevice: e.target.value }); loadWhisper().catch(() => {}); } },
          ...Object.entries(WHISPER_DEVICES).map(([v, l]) => h('option', { value: v, selected: (settings.whisperDevice || 'cpu') === v }, l)))),
      h('p', { id: 'model-status', class: 'model-status' }, 'Sprachmodell: wird geprüft …'),
      h('p', { class: 'hint' }, `Letzte Umwandlung: ${load('sd.lastSpeech', null) ?? (() => { try { return localStorage.getItem('sd.lastSpeech') || '–'; } catch { return '–'; } })()}`),
      h('p', { class: 'hint' }, `Technik: WebGPU ${navigator.gpu ? 'vorhanden' : 'nicht vorhanden'} · Mehrkern ${self.crossOriginIsolated ? 'aktiv' : 'nicht aktiv'} · ${navigator.hardwareConcurrency || '?'} Kerne`),
      h('button', { class: 'btn ghost', onclick: () => withBusy('Sprachmodell wird geladen …', async () => { await loadWhisper(p => speechStatus(`Sprachmodell wird geladen … ${p}%`)); toast('Sprachmodell bereit ✓', 'ok'); }) }, 'Sprachmodell jetzt laden (WLAN)'),
      h('p', { id: 'speech-status', class: 'hint' }, ''),
      h('button', { class: 'btn ghost', onclick: async () => { $('#speech-status').textContent = 'Prüfe …'; const st = await localStatus(); $('#speech-status').textContent = ({ available: 'Chrome-Erkennung auf dem Gerät verfügbar ✓ (Live-Text)', downloading: 'Chrome lädt das Sprachpaket …', unavailable: 'Chrome-Erkennung lokal nicht verfügbar – Whisper wird genutzt', unsupported: 'Keine Chrome-Erkennung – Whisper wird genutzt', unknown: 'Chrome-Erkennung lokal nicht verfügbar – Whisper wird genutzt' })[st] || st; } }, 'Chrome-Erkennung prüfen'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: settings.allowCloudSpeech, onchange: e => saveSettings({ allowCloudSpeech: e.target.checked }) }),
        'Statt Whisper Cloud-Erkennung (Google) nutzen – Namen verlassen dann das Gerät')),
    rowsEditor('Spieler', cfg.players, [['name', 'Name'], ['aliases', 'Spitznamen, …', 'list'], ['active', 'aktiv', 'check']],
      () => ({ name: '', aliases: [], active: true })),
    rowsEditor('Kompetenzen', cfg.skills, [['area', 'Bereich'], ['skill', 'Skill']], () => ({ area: '', skill: '' })),
    rowsEditor('Positionen', cfg.positions, [['group', 'Gruppe'], ['code', 'Kürzel'], ['label', 'Bezeichnung']], () => ({ group: '', code: '', label: '' })),
    h('p', { class: 'hint version' }, `Skill Diary · Version ${APP_VERSION}`),
    h('div', { class: 'actions sticky' },
      h('button', { class: 'btn ghost', onclick: () => withBusy('Lade aus OneDrive …', syncConfig) }, 'Neu laden'),
      h('button', { class: 'btn primary', onclick: saveConfig }, 'Speichern')));
}

/** Zeigt dauerhaft an, ob das Sprachmodell auf dem Handy liegt. */
async function showModelStatus() {
  const ok = await whisperCached();
  const el = $('#model-status');
  if (el) { el.textContent = ok ? 'Sprachmodell: auf dem Handy gespeichert ✓' : 'Sprachmodell: noch nicht geladen'; el.classList.toggle('ok', ok); }
}

async function saveConfig() {
  const cfg = S.cfg;
  cfg.players = cfg.players.filter(p => p.name.trim()).map(p => ({ ...p, name: p.name.trim() }));
  cfg.skills = cfg.skills.filter(s => s.area.trim() && s.skill.trim());
  cfg.positions = cfg.positions.filter(p => p.code.trim());
  await withBusy('Speichere Einstellungen …', async () => {
    await od.ensureWorkbook(); await od.writeConfig(cfg); save('sd.cfg', cfg); toast('Gespeichert', 'ok');
  });
}

/* ---------- Rahmen ---------- */
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

function loginView() {
  $('#app').replaceChildren(h('section', { class: 'login' },
    h('img', { src: 'assets/logo.png', alt: '', class: 'logo big' }),
    h('h1', {}, 'Skill Diary'),
    h('img', { src: 'assets/leo.webp', alt: 'Leo', class: 'leo' }),
    h('button', { class: 'btn primary block', onclick: login }, 'Mit Microsoft anmelden'),
    h('p', { class: 'hint' }, 'Deine Daten liegen ausschließlich in deinem OneDrive.')));
}

async function start() {
  if ('serviceWorker' in navigator) {
    // Neue Version aktiv -> Seite einmal neu laden, damit sie sofort genutzt wird.
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) location.reload(); });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
  }
  let signedIn = false;
  try { signedIn = await initAuth(); } catch (e) { console.error(e); toast(`Anmeldung: ${e.message}`, 'error'); }
  if (!signedIn) return loginView();
  render();
  try {
    await syncConfig();
    await flushPending();
  } catch (e) { toast(e.message, 'error'); }
  render();
  // Sprachmodell im Hintergrund in den Speicher holen, damit das erste Diktat nicht warten muss.
  if (!settings.allowCloudSpeech && await whisperCached() && (await localStatus()) !== 'available') loadWhisper().catch(() => {});
}

start();
