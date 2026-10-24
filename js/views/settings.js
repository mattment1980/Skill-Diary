// Ansicht „Einstellungen“: Konto, KI, OneDrive-Ordner, Spracheingabe, Spieler/Kompetenzen/Positionen.
import { settings, saveSettings, load, save } from '../core/config.js';
import { S } from '../core/state.js';
import { syncConfig } from '../core/data.js';
import { accountName, logout } from '../services/auth.js';
import * as od from '../services/onedrive.js';
import { localStatus, loadWhisper, whisperCached, WHISPER_MODELS, WHISPER_DEVICES } from '../services/speech.js';
import { h, $, toast, withBusy, render, speechStatus } from '../ui/dom.js';

export function settingsView() {
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
    h('p', { class: 'hint version' }, `Skill Diary · Version ${self.APP_VERSION}`),
    h('div', { class: 'actions sticky' },
      h('button', { class: 'btn ghost', onclick: () => withBusy('Lade aus OneDrive …', syncConfig) }, 'Neu laden'),
      h('button', { class: 'btn primary', onclick: saveConfig }, 'Speichern')));
}

/** Zeigt dauerhaft an, ob das Sprachmodell auf dem Handy liegt. */
export async function showModelStatus() {
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
