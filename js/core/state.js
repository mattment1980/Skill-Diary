// Zentraler App-Zustand und Hilfsfunktionen rund um die Konfiguration (Spieler, Kompetenzen).
// Persistiert wird nur, was offline gebraucht wird (Konfiguration, Entwurf, ausstehende Einträge).
import { CONFIG, load, save, today } from './config.js';
import { uid, firstName } from './format.js';

export const S = {
  tab: 'capture',
  cfg: load('sd.cfg', { players: [], skills: [], positions: [] }), // Kopie der Konfiguration für Offline-Nutzung
  pending: load('sd.pending', []),     // noch nicht gespeicherte Zeilen (z. B. ohne Netz)
  draft: load('sd.draft', { art: '', date: today(), anlass: '', text: '' }),
  review: null,                         // aktuell zu prüfende Einträge
  feedback: null,                       // geladene Feedback-Daten (nur im Speicher)
  stats: { player: '', from: CONFIG.seasonStart, to: today(), area: '', skill: '' },
  summary: null,
  busy: '',
  dictation: null,
  editId: null,                         // Eintrag in der Auswertung, der gerade bearbeitet wird
  edit: null,
  noDb: false,                          // im App-Ordner liegt (noch) keine Datenbank
};

export const saveDraft = () => save('sd.draft', S.draft);
export const savePending = () => save('sd.pending', S.pending);

export const activePlayers = () => S.cfg.players.filter(p => p.active);
export const areas = () => [...new Set(S.cfg.skills.map(s => s.area))];
export const skillsOf = area => S.cfg.skills.filter(s => s.area === area).map(s => s.skill);
export const areaOfSkill = skill => S.cfg.skills.find(s => s.skill === skill)?.area || '';

/** Vorname; bei doppeltem Vornamen mit Nachnamen-Initial ("Luis Z."). */
export const displayName = p => {
  const f = firstName(p.name);
  const dup = S.cfg.players.filter(x => firstName(x.name) === f).length > 1;
  return dup ? `${f} ${(p.name.split(' ')[1] || '').charAt(0)}.` : f;
};

/** Neuer, leerer Eintrag für die Prüfansicht. */
export const emptyEntry = (o = {}) => ({ id: uid(), player: null, area: '', skill: '', rating: '', level: 0, position: '', comment: '', ...o });

/** Filter: Eintrag liegt im gewählten Auswertungszeitraum (Einträge ohne Datum zählen mit). */
export const inStatsRange = f => !f.Datum || (f.Datum >= S.stats.from && f.Datum <= S.stats.to);
