// Ansicht „Auswertung“: Übersicht je Spieler, Diagramme, Einträge bearbeiten/löschen,
// KI-Zusammenfassung und PowerPoint-Export.
import { CONFIG, settings, today } from '../core/config.js';
import { S, activePlayers, areas, skillsOf, areaOfSkill, inStatsRange } from '../core/state.js';
import { fmtDate, shortPeriod } from '../core/format.js';
import { ratingCounts } from '../core/stats.js';
import { loadFeedback } from '../core/data.js';
import * as od from '../services/onedrive.js';
import { anonymize } from '../services/anon.js';
import { summarize } from '../services/ai.js';
import { buildPptx } from '../export/report.js';
import { h, toast, confirmSend, withBusy, render, select, levelPicker } from '../ui/dom.js';
import { radar, skillBars, timeline } from '../ui/charts.js';

let loading = false;
/** Feedback (neu) laden; Fehler als Meldung, danach neu zeichnen. */
function reload() {
  if (loading) return;
  loading = true;
  loadFeedback().catch(e => toast(e.message, 'error')).finally(() => { loading = false; render(); });
}

/** Gestapelter Balken Positiv/Neutral/Kritisch. */
function ratingBar(rows) {
  const counts = ratingCounts(rows), t = rows.length || 1;
  return h('div', { class: 'bar' }, ...CONFIG.ratings.map((r, i) =>
    counts[i] ? h('span', { class: `seg r-${r.toLowerCase()}`, style: `flex:${counts[i] / t}` }, counts[i]) : null));
}

export function statsView() {
  const st = S.stats;
  const head = h('div', { class: 'card context' },
    select(st.player, activePlayers().map(p => p.name), v => { st.player = v; S.summary = null; render(); }, 'Alle Spieler (Übersicht)', true),
    h('div', { class: 'row' },
      h('label', {}, 'von', h('input', { type: 'date', value: st.from, onchange: e => { st.from = e.target.value; S.summary = null; render(); } })),
      h('label', {}, 'bis', h('input', { type: 'date', value: st.to, onchange: e => { st.to = e.target.value; S.summary = null; render(); } })),
      h('button', { class: 'icon-btn', 'aria-label': 'Neu laden', onclick: () => { S.feedback = null; reload(); } }, '↻')));
  if (!S.feedback) { reload(); return h('section', { class: 'view' }, head, h('p', { class: 'hint' }, 'Lade Daten …')); }
  if (!st.player) return h('section', { class: 'view' }, head, overview());

  const all = S.feedback.filter(f => f.Spieler === st.player && inStatsRange(f))
    .sort((a, b) => String(b.Datum).localeCompare(String(a.Datum)));
  const list = st.skill ? all.filter(f => f.Skill === st.skill) : st.area ? all.filter(f => f.Bereich === st.area) : all;

  return h('section', { class: 'view stats' }, head,
    h('div', { class: 'card' },
      h('div', { class: 'totals' }, ...CONFIG.ratings.map(r => h('div', { class: `total r-${r.toLowerCase()}` }, h('b', {}, ratingCounts(all)[CONFIG.ratings.indexOf(r)]), r))),
      ...areas().map(a => {
        const rows = all.filter(f => f.Bereich === a);
        return h('button', { class: `area-row ${st.area === a ? 'on' : ''}`, onclick: () => { st.area = st.area === a ? '' : a; st.skill = ''; render(); } },
          h('span', { class: 'area-name' }, a, h('small', {}, ` ${rows.length}`)), ratingBar(rows));
      })),
    radar(all, st.player),
    skillBars(all),
    timeline(list, st.area),
    S.summary ? summaryEditor() : h('button', { class: 'btn primary block', disabled: !all.length, onclick: () => makeSummary(all) }, 'Zusammenfassung erstellen'),
    h('h3', { class: 'list-title' }, st.skill || st.area || 'Alle Einträge', ` (${list.length})`, (st.skill || st.area) ? h('button', { class: 'mini clear', onclick: () => { st.skill = ''; st.area = ''; render(); } }, '✕ Filter') : null),
    ...list.map(f => (S.editId === f.ID ? editCard() : h('div', { class: `card fb r-${String(f.Bewertung).toLowerCase()}` },
      h('div', { class: 'fb-head' },
        h('div', { class: 'fb-meta' }, `${fmtDate(f.Datum)} · ${[f.Art, f.Anlass].filter(Boolean).join(' ') || '–'}${f.Position ? ' · ' + f.Position : ''}`),
        h('button', { class: 'mini', 'aria-label': 'Bearbeiten', onclick: () => { S.editId = f.ID; S.edit = { ...f }; render(); } }, '✎'),
        h('button', { class: 'mini', 'aria-label': 'Löschen', onclick: () => removeFeedback(f) }, '✕')),
      h('div', { class: 'fb-skill' }, f.Skill, h('span', { class: 'tags' }, Number(f.Niveau) ? h('span', { class: `tag lvl-tag l${f.Niveau}` }, `Niveau ${f.Niveau}`) : null, h('span', { class: 'tag' }, f.Bewertung))),
      h('div', {}, f.Kommentar)))));
}

/** Bearbeitungsansicht eines gespeicherten Eintrags in der Auswertung. */
function editCard() {
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
/** Übersicht ohne gewählten Spieler: Einträge je Spieler. */
function overview() {
  const by = {};
  for (const f of S.feedback) (by[f.Spieler] ||= []).push(f);
  return h('div', { class: 'card' }, h('h3', {}, 'Einträge je Spieler'),
    ...activePlayers().map(p => {
      const rows = by[p.name] || [];
      return h('button', { class: 'area-row', onclick: () => { S.stats.player = p.name; render(); } },
        h('span', { class: 'area-name' }, p.name, h('small', {}, ` ${rows.length}`)),
        ratingBar(rows));
    }));
}
async function makeSummary(rows) {
  const player = S.cfg.players.find(p => p.name === S.stats.player);
  const code = 'P-ICH';
  const lines = [...rows].reverse().map(f => `${fmtDate(f.Datum)} | ${[f.Art, f.Anlass].filter(Boolean).join(' ') || '–'} | ${f.Bereich}/${f.Skill} | ${f.Bewertung} | ${Number(f.Niveau) || '–'} | ${String(f.Kommentar).replace(/\n/g, ' ')}`);
  const anon = await anonymize(lines.join('\n'), S.cfg.players,
    async (_t, cands) => (cands.includes(player) ? player : null), { player, code });
  let text = anon.text.replace(/P-(?!ICH)[A-Z2-9]{3}/g, 'ein Mitspieler');
  if (settings.previewBeforeSend) {
    text = await confirmSend('Vorschau: an die KI', text, new Map([[code, player.name]]));
    if (text == null) return;
  }
  await withBusy('Zusammenfassung wird geschrieben …', async () => {
    const period = `${fmtDate(S.stats.from)} – ${fmtDate(S.stats.to)}`;
    const r = await summarize({ code, lines: text.split('\n'), period });
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
      h('button', { class: 'btn primary', onclick: exportPptx }, 'PowerPoint exportieren')));
}
async function exportPptx() {
  const name = S.stats.player, st = S.stats;
  await withBusy('Erstelle PowerPoint …', async () => {
    const blob = await buildPptx({
      name, period: shortPeriod(st.from, st.to), from: st.from, to: st.to, summary: S.summary,
      rows: S.feedback.filter(f => f.Spieler === name && inStatsRange(f)),
      teamRows: S.feedback.filter(inStatsRange),
      areas: areas(), skills: S.cfg.skills,
    });
    const file = `${name} - Entwicklungsgespräch ${today()}.pptx`;
    await od.uploadFile(settings.exportFolder, file, blob);
    if (settings.downloadExports) {
      const a = h('a', { href: URL.createObjectURL(blob), download: file });
      document.body.append(a); a.click(); a.remove();
    }
    toast(settings.downloadExports ? 'PowerPoint gespeichert (OneDrive „Exporte“ + Download)' : 'PowerPoint gespeichert in OneDrive „Exporte“', 'ok');
  });
}
