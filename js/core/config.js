// Zentrale Konfiguration und lokale Einstellungen.
// Hier stehen KEINE personenbezogenen Daten – die liegen ausschließlich im OneDrive.

export const CONFIG = {
  clientId: '08e840d7-6c4b-440b-b55e-85b168c02713',
  authority: 'https://login.microsoftonline.com/consumers',
  scopes: ['Files.ReadWrite'],
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
  folder: '12_Fussball Kinder/Saison 26-27 (2017)/04_Skill Diary - Claude/Datenbank',
  exportFolder: '12_Fussball Kinder/Saison 26-27 (2017)/04_Skill Diary - Claude/Exporte',
  allowCloudSpeech: false,
};

const KEY = 'sd.settings';

/** Liest einen JSON-Wert sicher aus localStorage (kann in manchen Kontexten werfen). */
export function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
export function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Speicher nicht verfügbar */ }
}

export const settings = { ...DEFAULTS, ...load(KEY, {}) };
export function saveSettings(patch) { Object.assign(settings, patch); save(KEY, settings); }

/** Heutiges Datum als YYYY-MM-DD in lokaler Zeit. */
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
