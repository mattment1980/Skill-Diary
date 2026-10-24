// Datenabgleich zwischen App-Zustand und OneDrive (Konfiguration, ausstehende Einträge, Feedback).
// Reine Logik ohne Oberfläche: Funktionen ändern den Zustand S und liefern Ergebnisse zurück;
// Meldungen und Neuzeichnen übernehmen die Aufrufer in ui/ bzw. views/.
import { CONFIG, settings, save } from './config.js';
import { S, savePending } from './state.js';
import * as od from '../services/onedrive.js';

export { appFolderUrl } from '../services/onedrive.js';

/**
 * Konfiguration (Spieler, Kompetenzen, Positionen) aus dem Excel laden und lokal zwischenspeichern.
 * @param {{create?: boolean}} opt create=true legt eine leere Datenbank an, falls keine existiert
 * @returns {Promise<boolean>} false, wenn im App-Ordner keine Datenbank liegt (S.noDb wird gesetzt)
 */
export async function syncConfig({ create = false } = {}) {
  try {
    await od.ensureWorkbook({ create });
  } catch (e) {
    if (e instanceof od.NoWorkbookError) { S.noDb = true; return false; }
    throw e;
  }
  S.noDb = false;
  S.cfg = await od.readConfig();
  save('sd.cfg', S.cfg);
  return true;
}

/**
 * Vorgemerkte Einträge ins Excel schreiben (z. B. nach Speichern ohne Netz).
 * @returns {Promise<number>} Anzahl nachgetragener Einträge
 */
export async function flushPending() {
  if (!S.pending.length) return 0;
  if (S.noDb) throw new od.NoWorkbookError(); // Einträge bleiben vorgemerkt, bis die Datenbank da ist
  await od.appendFeedback(S.pending);
  const n = S.pending.length;
  S.pending = []; savePending();
  S.feedback = null;
  return n;
}

/** Alle Feedback-Einträge laden (nur im Arbeitsspeicher, für die Auswertung) und in S.feedback ablegen. */
export async function loadFeedback() {
  try {
    await od.ensureWorkbook();
    S.feedback = await od.readFeedback();
  } catch (e) {
    S.feedback = [];
    throw e;
  }
}

/**
 * Bestehende Datenbank (vom Nutzer gewählte .xlsx) in den App-Ordner übernehmen.
 * @returns {Promise<boolean>} true, wenn die Datenbank danach gefunden wird
 */
export async function importWorkbook(file) {
  if (!/\.xlsx$/i.test(file?.name || '')) throw new Error('Bitte eine .xlsx-Datei wählen.');
  await od.uploadFile(settings.folder, CONFIG.workbookName, file);
  return syncConfig();
}
