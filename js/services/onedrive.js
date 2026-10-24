// Zugriff auf OneDrive und die Excel-Datenbank über Microsoft Graph.
// Excel-Struktur: Blatt "Feedback" (Tabelle "Feedback") + Konfigurationsblätter
// "Spieler", "Kompetenzen", "Positionen" (einfache Bereiche mit Kopfzeile).
import { CONFIG, settings } from '../core/config.js';
import { getToken } from './auth.js';

const G = 'https://graph.microsoft.com/v1.0';

/** Pfad relativ zum App-Ordner (OneDrive/Apps/Skill Diary) -> Graph-Adressierung.
 *  Mit der Berechtigung Files.ReadWrite.AppFolder ist nur dieser Ordner erreichbar. */
function byPath(path) {
  return '/me/drive/special/approot:/' + path.split('/').filter(Boolean).map(encodeURIComponent).join('/') + ':';
}

/** Fehler, wenn im App-Ordner noch keine Datenbank liegt (z. B. vor dem Umzug). */
export class NoWorkbookError extends Error {
  constructor() { super('Keine Datenbank im App-Ordner gefunden.'); this.name = 'NoWorkbookError'; }
}

/** Link zum App-Ordner im OneDrive (legt ihn bei Bedarf an). */
export async function appFolderUrl() {
  const r = await graph('/me/drive/special/approot?$select=webUrl');
  return r.webUrl;
}

async function graph(url, { method = 'GET', body, headers = {}, allow404 = false, raw = false } = {}) {
  const token = await getToken();
  const isJson = body && !(body instanceof ArrayBuffer) && !(body instanceof Blob);
  const res = await fetch(G + url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(isJson ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: isJson ? JSON.stringify(body) : body,
  });
  if (allow404 && res.status === 404) return null;
  if (!res.ok) {
    let msg = `${res.status}`;
    try { const j = await res.json(); msg = j.error?.message || msg; } catch { /* kein JSON */ }
    throw new Error(`OneDrive: ${msg}`);
  }
  if (raw || res.status === 204) return res;
  return res.json();
}

let workbookId = null;
const wb = () => `/me/drive/items/${workbookId}/workbook`;

/**
 * Sucht die Datenbank im App-Ordner. Fehlt sie, wird nur mit create=true eine leere aus der Vorlage
 * angelegt – sonst NoWorkbookError, damit nie versehentlich eine leere Datenbank neben der echten entsteht.
 */
export async function ensureWorkbook({ create = false } = {}) {
  const path = `${settings.folder}/${CONFIG.workbookName}`;
  let item = await graph(byPath(path), { allow404: true });
  if (!item) {
    if (!create) throw new NoWorkbookError();
    const tpl = await (await fetch(CONFIG.templateUrl)).arrayBuffer();
    item = await graph(byPath(path) + '/content', {
      method: 'PUT', body: tpl,
      headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    });
  }
  workbookId = item.id;
  await migrateFeedbackColumns();
  return item;
}

let migrated = false;
/** Ergänzt fehlende Spalten (z. B. "Niveau") in bestehenden Datenbanken – einmal pro Sitzung geprüft. */
async function migrateFeedbackColumns() {
  if (migrated) return;
  const r = await graph(`${wb()}/tables('${CONFIG.feedbackTable}')/headerRowRange?$select=values`);
  const have = r.values[0];
  for (const name of CONFIG.feedbackColumns.filter(c => !have.includes(c))) {
    const col = await graph(`${wb()}/tables('${CONFIG.feedbackTable}')/columns/add`, { method: 'POST', body: { index: null } });
    // Spaltenkopf direkt beschriften (benennt die Tabellenspalte um)
    await graph(`${wb()}/tables('${CONFIG.feedbackTable}')/columns('${encodeURIComponent(col.id)}')/headerRowRange`, {
      method: 'PATCH', body: { values: [[name]] },
    });
  }
  migrated = true;
}

/** Excel-Seriennummer -> YYYY-MM-DD (Excel liefert Datumszellen als Zahl). */
function excelDate(v) {
  if (typeof v !== 'number' || !v) return v ?? '';
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86400000));
  return d.toISOString().slice(0, 10);
}

async function readSheet(name) {
  const r = await graph(`${wb()}/worksheets('${name}')/usedRange(valuesOnly=true)?$select=values`);
  const [, ...rows] = r.values || [];
  return rows.filter(row => row.some(c => c !== '' && c !== null));
}

async function writeSheet(name, header, rows) {
  const lastCol = String.fromCharCode(64 + header.length);
  await graph(`${wb()}/worksheets('${name}')/range(address='A2:${lastCol}2000')/clear`, {
    method: 'POST', body: { applyTo: 'Contents' },
  });
  if (!rows.length) return;
  await graph(`${wb()}/worksheets('${name}')/range(address='A2:${lastCol}${rows.length + 1}')`, {
    method: 'PATCH', body: { values: rows.map(r => header.map((_, i) => r[i] ?? '')) },
  });
}

/** Lädt Spieler, Kompetenzen und Positionen. */
export async function readConfig() {
  const [p, k, pos] = await Promise.all([readSheet('Spieler'), readSheet('Kompetenzen'), readSheet('Positionen')]);
  return {
    players: p.map(([name, aliases, active]) => ({
      name: String(name).trim(),
      aliases: String(aliases || '').split(/[,;]/).map(s => s.trim()).filter(Boolean),
      active: String(active || 'ja').toLowerCase() !== 'nein',
    })).filter(x => x.name),
    skills: k.map(([area, skill]) => ({ area: String(area).trim(), skill: String(skill).trim() })).filter(x => x.area && x.skill),
    positions: pos.map(([group, code, label]) => ({ group: String(group), code: String(code).trim(), label: String(label || '') })).filter(x => x.code),
  };
}

export async function writeConfig(cfg) {
  await writeSheet('Spieler', ['Name', 'Aliase', 'Aktiv'],
    cfg.players.map(p => [p.name, p.aliases.join(', '), p.active ? 'ja' : 'nein']));
  await writeSheet('Kompetenzen', ['Bereich', 'Skill'], cfg.skills.map(s => [s.area, s.skill]));
  await writeSheet('Positionen', ['Gruppe', 'Position', 'Bezeichnung'], cfg.positions.map(p => [p.group, p.code, p.label]));
}

/** Hängt Feedback-Zeilen (Arrays in Spaltenreihenfolge) an die Tabelle an. */
export async function appendFeedback(rows) {
  if (!migrated && workbookId) await migrateFeedbackColumns();
  // Ältere vorgemerkte Zeilen haben evtl. weniger Spalten -> auffüllen
  const n = CONFIG.feedbackColumns.length;
  const values = rows.map(r => [...r, ...Array(Math.max(0, n - r.length)).fill('')].slice(0, n));
  await graph(`${wb()}/tables('${CONFIG.feedbackTable}')/rows/add`, { method: 'POST', body: { values } });
}

/** Liest alle Feedback-Zeilen als Objekte. */
export async function readFeedback() {
  const r = await graph(`${wb()}/tables('${CONFIG.feedbackTable}')/range?$select=values`);
  const [header, ...rows] = r.values;
  return rows.filter(row => row[0]).map(row => {
    const o = {};
    header.forEach((h, i) => { o[h] = row[i]; });
    o.Datum = excelDate(o.Datum);
    return o;
  });
}

/** Sucht eine Feedback-Zeile per ID (frisch gelesen) und liefert Blatt-Zeilennummer und Werte. */
async function findFeedbackRow(id) {
  const r = await graph(`${wb()}/tables('${CONFIG.feedbackTable}')/range?$select=address,values`);
  const startRow = Number(r.address.split('!')[1].match(/\d+/)[0]); // Kopfzeile
  const idx = r.values.findIndex((row, i) => i > 0 && String(row[0]) === String(id));
  if (idx < 0) throw new Error('Eintrag nicht gefunden – bitte Daten neu laden.');
  return { sheetRow: startRow + idx, header: r.values[0], values: r.values[idx] };
}

/** Ändert Felder eines Feedback-Eintrags (patch: {Spaltenname: Wert}). */
export async function updateFeedback(id, patch) {
  const { sheetRow, header, values } = await findFeedbackRow(id);
  const row = header.map((h, i) => (h in patch ? patch[h] : values[i]));
  const last = String.fromCharCode(64 + header.length);
  await graph(`${wb()}/worksheets('${CONFIG.feedbackTable}')/range(address='A${sheetRow}:${last}${sheetRow}')`, {
    method: 'PATCH', body: { values: [row] },
  });
}

/** Löscht einen Feedback-Eintrag (Tabellenzeile rückt nach oben). */
export async function deleteFeedback(id) {
  const { sheetRow, header } = await findFeedbackRow(id);
  const last = String.fromCharCode(64 + header.length);
  await graph(`${wb()}/worksheets('${CONFIG.feedbackTable}')/range(address='A${sheetRow}:${last}${sheetRow}')/delete`, {
    method: 'POST', body: { shift: 'Up' },
  });
}

/** Lädt eine Datei in einen OneDrive-Ordner hoch (Ordner werden bei Bedarf angelegt). */
export async function uploadFile(folder, filename, blob) {
  return graph(byPath(`${folder}/${filename}`) + '/content', { method: 'PUT', body: blob });
}
