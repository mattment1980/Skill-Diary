// Gemeinsame Berechnungen für Auswertung (Bildschirm) und PowerPoint-Export.
import { CONFIG } from './config.js';

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const dayNum = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
const isIsoDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v));

/**
 * Teilt Einträge in lückenlose Zeitabschnitte (je Woche bei bis zu ~10 Wochen, sonst je Monat).
 * @returns {{weekly:boolean, buckets:{label:string, counts:number[], total:number}[], undated:number}}
 */
export function bucketize(rows, from, to) {
  const dated = rows.filter(f => isIsoDate(f.Datum));
  const fromD = dayNum(from), toD = dayNum(to);
  const weekly = toD - fromD <= 70;
  const buckets = [];
  if (weekly) {
    const monday = d => d - ((new Date(d * 86400000).getUTCDay() + 6) % 7);
    for (let d = monday(fromD); d <= toD; d += 7) {
      const dt = new Date(d * 86400000);
      buckets.push({ start: d, end: d + 6, label: `${dt.getUTCDate()}.${dt.getUTCMonth() + 1}.` });
    }
  } else {
    let y = +from.slice(0, 4), m = +from.slice(5, 7) - 1;
    while (Date.UTC(y, m, 1) / 86400000 <= toD) {
      buckets.push({ start: Date.UTC(y, m, 1) / 86400000, end: Date.UTC(y, m + 1, 1) / 86400000 - 1, label: MONTHS[m] });
      if (++m > 11) { m = 0; y++; }
    }
  }
  for (const b of buckets) {
    const inB = dated.filter(f => { const d = dayNum(f.Datum); return d >= b.start && d <= b.end; });
    b.counts = CONFIG.ratings.map(r => inB.filter(f => f.Bewertung === r).length);
    b.total = inB.length;
  }
  return { weekly, buckets, undated: rows.length - dated.length };
}

/** Durchschnittsniveau einer Gruppe von Einträgen; null, wenn kein Niveau erfasst. */
export function avgLevel(rows) {
  const v = rows.map(f => Number(f.Niveau)).filter(n => n >= 1 && n <= 5);
  return v.length ? { val: v.reduce((a, b) => a + b, 0) / v.length, n: v.length } : null;
}

/** Anzahl je Bewertung. */
export const ratingCounts = rows => CONFIG.ratings.map(r => rows.filter(f => f.Bewertung === r).length);

const SCORE = { Positiv: 1, Neutral: 0, Kritisch: -1 };
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;

/**
 * Themenvorschläge für die Zusammenfassung: je Skill Anzahl und grobe Einordnung.
 * kind: 'Fortschritt' | 'nachgelassen' (Tendenz 1. vs. 2. Hälfte, ab 4 Einträgen),
 *       sonst 'Stärke' | 'Baustelle' | 'gemischt'. Sortiert nach Anzahl.
 * @returns {{skill:string, area:string, n:number, kind:string}[]}
 */
export function suggestTopics(rows) {
  const by = new Map();
  for (const f of rows) {
    if (!f.Skill) continue;
    if (!by.has(f.Skill)) by.set(f.Skill, { skill: f.Skill, area: f.Bereich || '', rows: [] });
    by.get(f.Skill).rows.push(f);
  }
  return [...by.values()].map(({ skill, area, rows: r }) => {
    const s = [...r].sort((a, b) => String(a.Datum).localeCompare(String(b.Datum))).map(f => SCORE[f.Bewertung] ?? 0);
    const half = Math.floor(s.length / 2);
    const delta = s.length >= 4 ? mean(s.slice(s.length - half)) - mean(s.slice(0, half)) : 0;
    const avg = mean(s);
    const kind = delta >= 0.5 ? 'Fortschritt' : delta <= -0.5 ? 'nachgelassen'
      : avg >= 0.5 ? 'Stärke' : avg <= -0.3 ? 'Baustelle' : 'gemischt';
    return { skill, area, n: r.length, kind };
  }).sort((a, b) => b.n - a.n || a.skill.localeCompare(b.skill));
}

/** Datum, ab dem Notizen als „aktuell“ gelten: letztes Drittel (bzw. letzte Hälfte bei stärkster Gewichtung) des Zeitraums. */
export function recentFrom(from, to, recency) {
  if (!recency) return '';
  const a = dayNum(from), b = dayNum(to);
  const d = new Date(Math.round(b - (b - a) * (recency >= 3 ? 1 / 4 : 1 / 3)) * 86400000);
  return d.toISOString().slice(0, 10);
}
