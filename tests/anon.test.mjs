// Tests der Pseudonymisierung: Namen dürfen nie im an die KI gesendeten Text bleiben.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anonymize, deanonymize } from '../js/services/anon.js';

const P = (name, aliases = []) => ({ name, aliases, active: true });
const players = [P('Ferdinand Muster', ['Ferdi']), P('Luis Alpha'), P('Luis Beta'), P('Moritz Gamma'), P('Ron Delta')];
const noAsk = async () => { throw new Error('unerwartete Nachfrage'); };

test('ersetzt Vor-, Nach-, Spitznamen und Genitiv', async () => {
  const { text, codes } = await anonymize("Ferdi passt gut, Ferdinands Schuss und Gammas Lauf. Ron Delta auch.", players, noAsk);
  for (const n of ['Ferdi', 'Ferdinand', 'Gamma', 'Ron', 'Delta']) assert.ok(!text.includes(n), `${n} noch im Text: ${text}`);
  assert.equal(codes.size, 3);
});

test('voller Name schlägt mehrdeutigen Vornamen ohne Nachfrage', async () => {
  const { text, codes } = await anonymize('Luis Beta war stark.', players, noAsk);
  assert.ok(!text.includes('Luis'));
  assert.equal([...codes.values()][0].name, 'Luis Beta');
});

test('mehrdeutiger Vorname löst Nachfrage aus', async () => {
  let asked = '';
  const { text, codes } = await anonymize('Luis hat gescannt.', players, async (t, c) => { asked = t; return c[0]; });
  assert.equal(asked, 'Luis');
  assert.ok(!text.includes('Luis'));
  assert.equal([...codes.values()][0].name, 'Luis Alpha');
});

test('keine Teilwort-Treffer (z. B. "Ronja", "Moritzburg")', async () => {
  const { text } = await anonymize('Ronja aus Moritzburg', players, noAsk);
  assert.equal(text, 'Ronja aus Moritzburg');
});

test('Codes werden wieder zu Namen', async () => {
  const { text, codes } = await anonymize('Moritz und Ferdi', players, noAsk);
  assert.equal(deanonymize(text, codes), 'Moritz und Ferdinand');
});

test('fester Code für einen Spieler (Zusammenfassung)', async () => {
  const { text } = await anonymize('Moritz spielt', players, noAsk, { player: players[3], code: 'P-ICH' });
  assert.equal(text, 'P-ICH spielt');
});
