// Gemeinsame Berechnungen für Auswertung (Bildschirm) und PowerPoint-Export.
import { CONFIG } from './config.js';

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const dayNum = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
export const isIsoDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v));

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
