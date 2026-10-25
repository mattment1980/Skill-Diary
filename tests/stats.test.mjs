// Tests der gemeinsamen Berechnungen (Bildschirm und PowerPoint nutzen dieselben Funktionen).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bucketize, avgLevel, ratingCounts } from '../js/core/stats.js';
import { shortPeriod, fmtDate } from '../js/core/format.js';

const row = (Datum, Bewertung, Niveau) => ({ Datum, Bewertung, Niveau });

test('Monats-Abschnitte lückenlos, Einträge ohne Datum gezählt', () => {
  const r = bucketize([row('2026-07-27', 'Positiv'), row('2026-09-26', 'Kritisch'), row('', 'Neutral')], '2026-07-01', '2026-10-24');
  assert.equal(r.weekly, false);
  assert.deepEqual(r.buckets.map(b => b.label), ['Jul', 'Aug', 'Sep', 'Okt']);
  assert.deepEqual(r.buckets.map(b => b.total), [1, 0, 1, 0]);
  assert.deepEqual(r.buckets[2].counts, [0, 0, 1]);
  assert.equal(r.undated, 1);
});

test('kurzer Zeitraum -> Wochen', () => {
  const r = bucketize([row('2026-10-10', 'Positiv')], '2026-10-01', '2026-10-24');
  assert.equal(r.weekly, true);
  assert.equal(r.buckets.reduce((s, b) => s + b.total, 0), 1);
});

test('Durchschnittsniveau ignoriert leere/ungültige Werte', () => {
  assert.deepEqual(avgLevel([row('', '', 2), row('', '', 4), row('', '', ''), row('', '', 9)]), { val: 3, n: 2 });
  assert.equal(avgLevel([row('', '', '')]), null);
});

test('Zählung je Bewertung', () => {
  assert.deepEqual(ratingCounts([row('', 'Positiv'), row('', 'Positiv'), row('', 'Kritisch')]), [2, 0, 1]);
});

test('Formatierung Zeitraum und Datum', () => {
  assert.equal(shortPeriod('2026-07-01', '2026-10-24'), 'Jul – Okt 2026');
  assert.equal(shortPeriod('2026-11-01', '2027-02-10'), 'Nov 2026 – Feb 2027');
  assert.equal(fmtDate('2026-10-24'), '24.10.2026');
});

test('Themenvorschläge: Anzahl, Stärke/Baustelle, Fortschritt', async () => {
  const { suggestTopics } = await import('../js/core/stats.js');
  const r = (Skill, Datum, Bewertung) => ({ Skill, Bereich: 'Technik', Datum, Bewertung });
  const t = suggestTopics([
    r('Passen', '2026-08-01', 'Kritisch'), r('Passen', '2026-08-10', 'Kritisch'),
    r('Passen', '2026-09-20', 'Positiv'), r('Passen', '2026-10-01', 'Positiv'),
    r('Schuss', '2026-08-01', 'Positiv'), r('Schuss', '2026-09-01', 'Positiv'),
    r('Kopfball', '2026-09-01', 'Kritisch'), { Skill: '', Bewertung: 'Positiv' },
  ]);
  assert.deepEqual(t.map(x => [x.skill, x.n, x.kind]), [['Passen', 4, 'Fortschritt'], ['Schuss', 2, 'Stärke'], ['Kopfball', 1, 'Baustelle']]);
});

test('aktueller Abschnitt je nach Gewichtung', async () => {
  const { recentFrom } = await import('../js/core/stats.js');
  assert.equal(recentFrom('2026-07-01', '2026-10-01', 0), '');
  assert.equal(recentFrom('2026-07-01', '2026-10-01', 1), '2026-08-31');
  assert.equal(recentFrom('2026-07-01', '2026-10-01', 3), '2026-09-08');
});
