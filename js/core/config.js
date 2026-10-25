// Zentrale Konfiguration und lokale Einstellungen.
// Hier stehen KEINE personenbezogenen Daten – die liegen ausschließlich im OneDrive.

export const CONFIG = {
  clientId: '08e840d7-6c4b-440b-b55e-85b168c02713',
  authority: 'https://login.microsoftonline.com/consumers',
  // Nur der App-eigene Ordner OneDrive/Apps/Skill Diary – kein Zugriff auf das übrige OneDrive.
  scopes: ['Files.ReadWrite.AppFolder'],
  workbookName: 'Skill-Diary.xlsx',
  templateUrl: 'template/Skill-Diary-Vorlage.xlsx',
  feedbackTable: 'Feedback',
  feedbackColumns: ['ID', 'Zeitstempel', 'Datum', 'Art', 'Anlass', 'Spieler', 'Position', 'Bereich',
    'Skill', 'Bewertung', 'Kommentar', 'Quelle', 'Gruppe', 'VideoLink', 'Niveau'],
  levels: { 1: 'weit unter altersgemäß', 2: 'unter altersgemäß', 3: 'altersgemäß', 4: 'über altersgemäß', 5: 'weit über altersgemäß' },
  ratings: ['Positiv', 'Neutral', 'Kritisch'],
  seasonStart: '2026-07-01',
};

const DEFAULTS = {
  apiKey: '',
  modelExtract: 'claude-haiku-5-5',
  modelSummary: 'claude-sonnet-5-5',
  folder: 'Datenbank',        // relativ zum App-Ordner OneDrive/Apps/Skill Diary
  exportFolder: 'Exporte',
  allowCloudSpeech: false,
  previewBeforeSend: true,   // anonymisierten Text vor dem Senden an die KI anzeigen
  downloadExports: false,    // Exporte zusätzlich in die Downloads des Handys legen
  summary: null,             // zuletzt gewählte Optionen der Zusammenfassung (siehe SUMMARY_DEFAULTS)
};

/** Abschnitte des Berichts (Reihenfolge wie in der PowerPoint). max = Höchstzahl Punkte (Listen). */
export const SUMMARY_SECTIONS = [
  { key: 'einschaetzung', label: 'Einschätzung vom Trainerteam' },
  { key: 'super', label: 'Größte Stärken', max: 5 },
  { key: 'verbessern', label: 'Kannst du verbessern', max: 5 },
  { key: 'stolz', label: 'Darauf kannst du stolz sein', max: 2 },
];

/** Standard-Optionen der Zusammenfassung. Spielerbezogenes (Themen, Hinweise) wird nicht gespeichert. */
export const SUMMARY_DEFAULTS = {
  audience: 'kind',     // kind | eltern
  tone: 'ermutigend',   // ermutigend | ausgewogen | klar
  recency: 0,           // 0 gleichmäßig … 3 vor allem der aktuelle Stand
  sections: {
    einschaetzung: { on: true, areas: [] },        // areas leer = alle Bereiche
    super: { on: true, areas: [], n: 5 },
    verbessern: { on: true, areas: [], n: 5 },
    stolz: { on: true, areas: [], n: 2 },
  },
};

/** Gespeicherte Optionen mit den Standardwerten zusammenführen (auch nach App-Updates vollständig). */
export function summaryOptions() {
  const s = settings.summary || {};
  const out = structuredClone(SUMMARY_DEFAULTS);
  for (const k of ['audience', 'tone', 'recency']) if (s[k] != null) out[k] = s[k];
  for (const k of Object.keys(out.sections)) Object.assign(out.sections[k], s.sections?.[k] || {});
  return out;
}

const KEY = 'sd.settings';

/** Liest einen JSON-Wert sicher aus localStorage (kann in manchen Kontexten werfen). */
export function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
export function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Speicher nicht verfügbar */ }
}

export const settings = { ...DEFAULTS, ...load(KEY, {}) };
// Umstellung auf App-Ordner (Version 20): alte, absolute Pfade auf die neuen Standardordner zurücksetzen.
if (settings.folder.includes('/')) settings.folder = DEFAULTS.folder;
if (settings.exportFolder.includes('/')) settings.exportFolder = DEFAULTS.exportFolder;
export function saveSettings(patch) { Object.assign(settings, patch); save(KEY, settings); }

/** Heutiges Datum als YYYY-MM-DD in lokaler Zeit. */
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
