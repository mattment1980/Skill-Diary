// Ansicht „Erfassen“: Kontext, Notiz (Text oder Diktat), KI-Zuordnung bzw. manuelle Erfassung.
import { today } from '../core/config.js';
import { S, saveDraft, activePlayers, areas, skillsOf, areaOfSkill, displayName, emptyEntry } from '../core/state.js';
import { anonymize, deanonymize } from '../services/anon.js';
import { extractFeedback } from '../services/ai.js';
import { startDictation } from '../services/speech.js';
import { h, $, toast, choose, withBusy, render, speechStatus } from '../ui/dom.js';

export function captureView() {
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
