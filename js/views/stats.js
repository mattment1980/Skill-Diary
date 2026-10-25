// Ansicht „Auswertung“: Übersicht je Spieler, Diagramme, Einträge bearbeiten/löschen,
// KI-Zusammenfassung und PowerPoint-Export.
import { CONFIG, settings, today, saveSettings, SUMMARY_SECTIONS, SUMMARY_DEFAULTS, summaryOptions } from '../core/config.js';
import { S, activePlayers, areas, skillsOf, areaOfSkill, inStatsRange } from '../core/state.js';
import { fmtDate, shortPeriod } from '../core/format.js';
import { ratingCounts, suggestTopics, recentFrom } from '../core/stats.js';
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
    ...(S.summary ? [summaryEditor()] : summaryStart(all)),
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
/* ---------- Zusammenfassung: Optionen ---------- */
const TONE_LABELS = [['ermutigend', 'Ermutigend'], ['ausgewogen', 'Ausgewogen'], ['klar', 'Klar & fordernd']];
const RECENCY_LABELS = ['Ganzer Zeitraum gleich', 'Aktuelles etwas stärker', 'Aktuelles deutlich stärker', 'Vor allem aktueller Stand'];
const WEIGHTS = [['aus', 'Auslassen'], ['', 'Normal'], ['fokus', 'Schwerpunkt']];

/** Spielerbezogene Optionen (Themen-Gewichte, Hinweise) – nur im Arbeitsspeicher, je Spieler neu. */
function playerOpts() {
  if (S.sumPlayer?.player !== S.stats.player) S.sumPlayer = { player: S.stats.player, weights: {}, extra: '', open: S.sumPlayer?.open || false };
  return S.sumPlayer;
}
const storeOpts = o => saveSettings({ summary: o });

/** Knopfreihe; options als [Wert, Beschriftung]. */
const chips = (value, options, onpick, cls = '') => h('div', { class: `chips ${cls}` }, ...options.map(([v, l]) =>
  h('button', { class: `chip small ${value === v ? 'on' : ''}`, onclick: () => onpick(v) }, l)));

/** Optionen-Karte + Start-Knopf (solange noch keine Zusammenfassung da ist). */
function summaryStart(all) {
  const o = summaryOptions(), p = playerOpts();
  const set = fn => { fn(o); storeOpts(o); render(); };
  const topics = suggestTopics(all);
  const used = all.filter(f => p.weights[f.Skill] !== 'aus');
  const onSecs = SUMMARY_SECTIONS.filter(x => o.sections[x.key].on);
  const changed = JSON.stringify(o) !== JSON.stringify(SUMMARY_DEFAULTS);
  const brief = [o.audience === 'eltern' ? 'für Eltern' : 'für das Kind', TONE_LABELS.find(t => t[0] === o.tone)?.[1],
    `${onSecs.length}/4 Abschnitte`, Object.values(p.weights).some(Boolean) ? 'Themen gewichtet' : '', p.extra.trim() ? 'mit Hinweisen' : '']
    .filter(Boolean).join(' · ');

  const section = x => {
    const c = o.sections[x.key];
    return h('div', { class: `sum-sec ${c.on ? '' : 'off'}` },
      h('label', { class: 'sum-sec-head' },
        h('input', { type: 'checkbox', checked: c.on, onchange: e => set(q => { q.sections[x.key].on = e.target.checked; }) }),
        h('b', {}, x.label),
        c.on && x.max ? h('select', { class: 'count', 'aria-label': 'Anzahl Punkte', onchange: e => set(q => { q.sections[x.key].n = +e.target.value; }) },
          ...Array.from({ length: x.max }, (_, i) => h('option', { value: i + 1, selected: c.n === i + 1 }, `${i + 1} ${x.key === 'stolz' ? (i ? 'Blöcke' : 'Block') : (i ? 'Punkte' : 'Punkt')}`))) : null),
      c.on ? h('div', { class: 'chips' },
        h('button', { class: `chip small ${c.areas.length ? '' : 'on'}`, onclick: () => set(q => { q.sections[x.key].areas = []; }) }, 'Alle Bereiche'),
        ...areas().map(a => h('button', {
          class: `chip small ${c.areas.includes(a) ? 'on' : ''}`,
          onclick: () => set(q => { const l = q.sections[x.key].areas; q.sections[x.key].areas = l.includes(a) ? l.filter(y => y !== a) : [...l, a]; }),
        }, a))) : null);
  };

  const panel = h('details', { class: 'card sum-opts', open: p.open, ontoggle: e => { p.open = e.target.open; } },
    h('summary', {}, h('b', {}, 'Optionen'), h('small', {}, brief)),
    h('h4', {}, 'Für wen'), chips(o.audience, [['kind', 'Kind'], ['eltern', 'Eltern']], v => set(q => { q.audience = v; })),
    h('h4', {}, 'Tonlage'), chips(o.tone, TONE_LABELS, v => set(q => { q.tone = v; })),
    h('h4', {}, 'Zeitliche Gewichtung'),
    h('div', { class: 'range-row' },
      h('input', { type: 'range', min: 0, max: 3, step: 1, value: o.recency,
        oninput: e => { e.target.nextSibling.textContent = RECENCY_LABELS[e.target.value]; },
        onchange: e => set(q => { q.recency = +e.target.value; }) }),
      h('span', {}, RECENCY_LABELS[o.recency])),
    o.recency ? h('p', { class: 'hint' }, `Aktuell = ab ${fmtDate(recentFrom(S.stats.from, S.stats.to, o.recency))}`) : null,
    h('h4', {}, 'Abschnitte'),
    ...SUMMARY_SECTIONS.map(section),
    h('h4', {}, 'Themen'), h('p', { class: 'hint' }, `${used.length} von ${all.length} Notizen gehen an die KI`),
    topics.length ? h('div', { class: 'topics' }, ...topics.map(t => h('div', { class: `topic ${p.weights[t.skill] || 'normal'}` },
      h('span', { class: 'topic-name' }, t.skill, h('small', {}, ` ${t.n} · ${t.kind}`)),
      chips(p.weights[t.skill] || '', WEIGHTS, v => { p.weights[t.skill] = v; render(); }, 'seg3')))) : h('p', { class: 'hint' }, 'Keine Themen im Zeitraum.'),
    h('h4', {}, 'Hinweise an die KI'),
    h('textarea', { rows: 3, value: p.extra, placeholder: 'z. B. „Er war 4 Wochen verletzt – das bitte nicht als Rückschritt werten.“',
      oninput: e => { p.extra = e.target.value; } }),
    h('p', { class: 'hint' }, 'Wird wie die Notizen anonymisiert und in der Vorschau angezeigt; nicht gespeichert.'),
    changed ? h('button', { class: 'btn ghost small', onclick: () => { storeOpts(null); render(); } }, 'Optionen zurücksetzen') : null);

  return [panel, h('button', { class: 'btn primary block', disabled: !used.length || !onSecs.length, onclick: () => makeSummary(used, topics, o, p) }, 'Zusammenfassung erstellen')];
}

async function makeSummary(rows, topics, opts, p) {
  const player = S.cfg.players.find(x => x.name === S.stats.player);
  const code = 'P-ICH';
  const st = S.stats;
  const period = `${fmtDate(st.from)} – ${fmtDate(st.to)}`;
  const recent = recentFrom(st.from, st.to, opts.recency);
  const focus = topics.filter(t => p.weights[t.skill] === 'fokus').map(t => t.skill);
  const lines = [...rows].reverse().map(f => `${fmtDate(f.Datum)} | ${[f.Art, f.Anlass].filter(Boolean).join(' ') || '–'} | ${f.Bereich}/${f.Skill} | ${f.Bewertung} | ${Number(f.Niveau) || '–'} | ${String(f.Kommentar).replace(/\n/g, ' ')}`);
  const msg = [
    `Zeitraum: ${period}`,
    focus.length ? `Schwerpunkte: ${focus.join(', ')}` : '',
    p.extra.trim() ? `Hinweise des Trainers: ${p.extra.trim().replace(/\n+/g, ' ')}` : '',
    'Notizen (Datum | Anlass | Bereich/Skill | Bewertung | Niveau | Kommentar):',
    ...lines,
  ].filter(Boolean).join('\n');
  const anon = await anonymize(msg, S.cfg.players,
    async (_t, cands) => (cands.includes(player) ? player : null), { player, code });
  let text = anon.text.replace(/P-(?!ICH)[A-Z2-9]{3}/g, 'ein Mitspieler');
  if (settings.previewBeforeSend) {
    text = await confirmSend('Vorschau: an die KI', text, new Map([[code, player.name]]));
    if (text == null) return;
  }
  await withBusy('Zusammenfassung wird geschrieben …', async () => {
    const r = await summarize({ code, user: text, opts, recentFrom: recent ? fmtDate(recent) : '' });
    const on = Object.fromEntries(SUMMARY_SECTIONS.map(x => [x.key, opts.sections[x.key].on]));
    S.summary = {
      period, audience: opts.audience, on,
      einschaetzung: on.einschaetzung ? String(r.einschaetzung || '') : '',
      super: on.super ? (r.super || []).slice(0, opts.sections.super.n) : [],
      verbessern: on.verbessern ? (r.verbessern || []).slice(0, opts.sections.verbessern.n) : [],
      stolz: on.stolz ? (r.stolz || []).slice(0, opts.sections.stolz.n) : [],
    };
  });
}

/** Überschriften je Zielgruppe (Bildschirm und PowerPoint). */
const ELTERN_TITLES = { verbessern: 'Nächste Entwicklungsschritte', stolz: 'Darauf kann Ihr Kind stolz sein' };
function sectionTitles(audience) {
  return { ...Object.fromEntries(SUMMARY_SECTIONS.map(x => [x.key, x.label])), ...(audience === 'eltern' ? ELTERN_TITLES : {}) };
}

function summaryEditor() {
  const s = S.summary;
  const T = sectionTitles(s.audience);
  const words = t => (t.trim().match(/\S+/g) || []).length;
  const listArea = (key, max) => h('textarea', {
    rows: Math.max(3, s[key].length + 1), value: s[key].join('\n'),
    oninput: e => { s[key] = e.target.value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, max); },
  });
  const counter = h('small', { class: 'counter' }, `${words(s.einschaetzung)}/100 Wörter`);
  return h('div', { class: 'card summary' },
    s.on.einschaetzung ? [
      h('h3', {}, T.einschaetzung, ' ', counter),
      h('textarea', { rows: 6, value: s.einschaetzung, oninput: e => { s.einschaetzung = e.target.value; counter.textContent = `${words(e.target.value)}/100 Wörter`; } })] : null,
    s.on.super ? [h('h3', {}, T.super), h('small', { class: 'hint' }, 'Ein Punkt pro Zeile, max. 5'), listArea('super', 5)] : null,
    s.on.verbessern ? [h('h3', {}, T.verbessern), listArea('verbessern', 5)] : null,
    s.on.stolz ? [h('h3', {}, T.stolz),
      ...s.stolz.map(b => h('div', { class: 'stolz' },
        h('input', { type: 'text', value: b.titel, oninput: e => { b.titel = e.target.value; } }),
        h('textarea', { rows: 3, value: b.text, oninput: e => { b.text = e.target.value; } })))] : null,
    h('div', { class: 'actions' },
      h('button', { class: 'btn ghost', onclick: () => { S.summary = null; render(); } }, 'Verwerfen'),
      h('button', { class: 'btn primary', onclick: exportPptx }, 'PowerPoint exportieren')));
}

async function exportPptx() {
  const name = S.stats.player, st = S.stats;
  await withBusy('Erstelle PowerPoint …', async () => {
    const blob = await buildPptx({
      name, period: shortPeriod(st.from, st.to), from: st.from, to: st.to, summary: S.summary, titles: S.summary.audience === 'eltern' ? ELTERN_TITLES : {},
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
