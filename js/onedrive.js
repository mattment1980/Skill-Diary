// Zugriff auf OneDrive und die Excel-Datenbank über Microsoft Graph.
// Excel-Struktur: Blatt "Feedback" (Tabelle "Feedback") + Konfigurationsblätter
// "Spieler", "Kompetenzen", "Positionen" (einfache Bereiche mit Kopfzeile).
import { CONFIG, settings } from './config.js';
import { getToken } from './auth.js';

const G = 'https://graph.microsoft.com/v1.0';

/** OneDrive-Pfad -> Graph-Adressierung über den Pfad. */
function byPath(path) {
  return '/me/drive/root:/' + path.split('/').filter(Boolean).map(encodeURIComponent).join('/') + ':';
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

/** Stellt sicher, dass die Datenbank existiert – legt sie bei Bedarf aus der leeren Vorlage an. */
export async function ensureWorkbook() {
  const path = `${settings.folder}/${CONFIG.workbookName}`;
  let item = await graph(byPath(path), { allow404: true });
  if (!item) {
    const tpl = await (await fetch(CONFIG.templateUrl)).arrayBuffer();
    item = await graph(byPath(path) + '/content', {
      method: 'PUT', body: tpl,
      headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    });
  }
  workbookId = item.id;
  return item;
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
  await graph(`${wb()}/tables('${CONFIG.feedbackTable}')/rows/add`, { method: 'POST', body: { values: rows } });
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

/** Lädt eine Datei in einen OneDrive-Ordner hoch (Ordner werden bei Bedarf angelegt). */
export async function uploadFile(folder, filename, blob) {
  return graph(byPath(`${folder}/${filename}`) + '/content', { method: 'PUT', body: blob });
}
