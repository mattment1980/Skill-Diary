// Datenabgleich zwischen App-Zustand und OneDrive (Konfiguration, ausstehende Einträge, Feedback laden).
import { save } from './config.js';
import { S, savePending } from './state.js';
import * as od from '../services/onedrive.js';
import { toast, render } from '../ui/dom.js';

/** Konfiguration (Spieler, Kompetenzen, Positionen) aus dem Excel laden und lokal zwischenspeichern. */
export async function syncConfig() {
  await od.ensureWorkbook();
  S.cfg = await od.readConfig();
  save('sd.cfg', S.cfg);
}

/** Vorgemerkte Einträge ins Excel schreiben (z. B. nach Speichern ohne Netz). */
export async function flushPending() {
  if (!S.pending.length) return;
  await od.appendFeedback(S.pending);
  const n = S.pending.length;
  S.pending = []; savePending();
  S.feedback = null;
  toast(`${n} ausstehende Einträge nachgetragen`, 'ok');
}

/** Alle Feedback-Einträge laden (nur im Arbeitsspeicher, für die Auswertung). */
let loadingFb = false;
export async function loadFeedback() {
  if (loadingFb) return;
  loadingFb = true;
  try { await od.ensureWorkbook(); S.feedback = await od.readFeedback(); } catch (e) { toast(e.message, 'error'); S.feedback = []; }
  loadingFb = false; render();
}
