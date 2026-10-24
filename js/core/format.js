// Kleine Formatierungs- und Hilfsfunktionen ohne Abhängigkeiten.

/** Kurze Zufalls-ID (10 Zeichen). */
export const uid = () => crypto.getRandomValues(new Uint32Array(2)).reduce((s, x) => s + x.toString(36), '').slice(0, 10);

/** YYYY-MM-DD -> TT.MM.JJJJ */
export const fmtDate = iso => (iso ? iso.split('-').reverse().join('.') : 'ohne Datum');

export const firstName = n => n.split(' ')[0];

/** Zeitraum kurz wie in der PowerPoint-Vorlage: "Jul – Okt 2026" bzw. "Nov 2026 – Feb 2027". */
export function shortPeriod(from, to) {
  const M = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const [fy, fm] = [from.slice(0, 4), M[+from.slice(5, 7) - 1]], [ty, tm] = [to.slice(0, 4), M[+to.slice(5, 7) - 1]];
  if (fy === ty) return fm === tm ? `${tm} ${ty}` : `${fm} – ${tm} ${ty}`;
  return `${fm} ${fy} – ${tm} ${ty}`;
}
