// Spracheingabe über die Web Speech API.
// Bevorzugt Erkennung direkt auf dem Gerät (processLocally). Cloud-Erkennung (Google) nur, wenn in den
// Einstellungen ausdrücklich erlaubt – dort würden gesprochene Namen das Gerät verlassen.
import { settings } from './config.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const LANG = 'de-DE';

/** Prüft, ob lokale Erkennung verfügbar ist (und lädt das Sprachpaket bei Bedarf). */
export async function localStatus() {
  if (!SR) return 'unsupported';
  if (typeof SR.available !== 'function') return 'unknown';
  try {
    const st = await SR.available({ langs: [LANG], processLocally: true });
    if (st === 'downloadable' && typeof SR.install === 'function') {
      const ok = await SR.install({ langs: [LANG], processLocally: true });
      return ok ? 'available' : 'unavailable';
    }
    return st; // available | downloading | unavailable
  } catch { return 'unknown'; }
}

/**
 * Startet die Erkennung. onText(finalText) liefert fertige Sätze, onInterim(text) den Zwischenstand.
 * Gibt ein Objekt mit stop() zurück oder wirft einen Fehler mit verständlicher Meldung.
 */
export async function startDictation({ onText, onInterim, onEnd }) {
  const status = await localStatus();
  const local = status === 'available';
  if (!local && !settings.allowCloudSpeech) {
    throw new Error(status === 'unsupported'
      ? 'Spracheingabe wird von diesem Browser nicht unterstützt. Nutze das Mikrofon der Tastatur.'
      : 'Lokale Spracherkennung ist hier nicht verfügbar. Nutze das Mikrofon der Tastatur (Gboard) – oder erlaube Cloud-Erkennung in den Einstellungen.');
  }
  let active = true;
  const rec = new SR();
  rec.lang = LANG;
  rec.continuous = true;
  rec.interimResults = true;
  if (local && 'processLocally' in rec) rec.processLocally = true;

  rec.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) onText(r[0].transcript.trim());
      else interim += r[0].transcript;
    }
    onInterim(interim);
  };
  rec.onerror = e => { if (e.error === 'not-allowed') { active = false; onEnd?.('Mikrofonzugriff wurde verweigert.'); } };
  // Android beendet die Erkennung nach Sprechpausen – solange aktiv, automatisch neu starten.
  rec.onend = () => { if (active) { try { rec.start(); } catch { active = false; onEnd?.(); } } else onEnd?.(); };
  rec.start();
  return { local, stop() { active = false; rec.stop(); } };
}
