// Tests der Pseudonymisierung: Namen dürfen nie im an die KI gesendeten Text bleiben.
// Nur erfundene Namen verwenden – keine Namen aus dem echten Team.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anonymize, deanonymize } from '../js/services/anon.js';

const P = (name, aliases = []) => ({ name, aliases, active: true });
const players = [P('Maximilian Muster', ['Maxi']), P('Tom Alpha'), P('Tom Beta'), P('Paul Gamma'), P('Ben Delta')];
const noAsk = async () => { throw new Error('unerwartete Nachfrage'); };

test('ersetzt Vor-, Nach-, Spitznamen und Genitiv', async () => {
  const { text, codes } = await anonymize('Maxi passt gut, Maximilians Schuss und Gammas Lauf. Ben Delta auch.', players, noAsk);
  for (const n of ['Maxi', 'Maximilian', 'Gamma', 'Ben', 'Delta']) assert.ok(!text.includes(n), `${n} noch im Text: ${text}`);
  assert.equal(codes.size, 3);
});

test('voller Name schlägt mehrdeutigen Vornamen ohne Nachfrage', async () => {
  const { text, codes } = await anonymize('Tom Beta war stark.', players, noAsk);
  assert.ok(!text.includes('Tom'));
  assert.equal([...codes.values()][0].name, 'Tom Beta');
});

test('mehrdeutiger Vorname löst Nachfrage aus', async () => {
  let asked = '';
  const { text, codes } = await anonymize('Tom hat gescannt.', players, async (t, c) => { asked = t; return c[0]; });
  assert.equal(asked, 'Tom');
  assert.ok(!text.includes('Tom'));
  assert.equal([...codes.values()][0].name, 'Tom Alpha');
});

test('keine Teilwort-Treffer (z. B. "Benno", "Paulsdorf")', async () => {
  const { text } = await anonymize('Benno aus Paulsdorf', players, noAsk);
  assert.equal(text, 'Benno aus Paulsdorf');
});

test('Codes werden wieder zu Namen', async () => {
  const { text, codes } = await anonymize('Paul und Maxi', players, noAsk);
  assert.equal(deanonymize(text, codes), 'Paul und Maximilian');
});

test('fester Code für einen Spieler (Zusammenfassung)', async () => {
  const { text } = await anonymize('Paul spielt', players, noAsk, { player: players[3], code: 'P-ICH' });
  assert.equal(text, 'P-ICH spielt');
});
