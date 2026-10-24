// Pseudonymisierung: Spielernamen werden VOR jedem KI-Aufruf lokal durch zufällige Codes ersetzt.
// Die Zuordnung Code -> Spieler existiert nur im Arbeitsspeicher und wird bei jedem Aufruf neu erzeugt.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(used) {
  let code;
  do {
    const b = crypto.getRandomValues(new Uint8Array(3));
    code = 'P-' + [...b].map(x => ALPHABET[x % ALPHABET.length]).join('');
  } while (used.has(code));
  used.add(code);
  return code;
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Wort-Grenzen für Umlaute: kein Buchstabe davor/danach; Genitiv-s bzw. Apostroph erlaubt.
const wordRe = token => new RegExp(`(?<![\\p{L}\\d])${esc(token)}(?:s|')?(?![\\p{L}\\d])`, 'giu');

/** Alle Namensvarianten (voller Name, Vor-, Nachname, Aliase) mit den Spielern, zu denen sie passen. */
function tokenIndex(players) {
  const idx = new Map();
  for (const p of players) {
    const parts = p.name.split(/\s+/);
    const tokens = new Set([p.name, ...parts.filter(x => x.length > 1), ...p.aliases]);
    for (const t of tokens) {
      const key = t.toLowerCase();
      if (!idx.has(key)) idx.set(key, { token: t, players: new Set() });
      idx.get(key).players.add(p);
    }
  }
  return [...idx.values()].sort((a, b) => b.token.length - a.token.length);
}

/**
 * Ersetzt Namen im Text durch Codes.
 * @param {string} text
 * @param {Array} players aktive Spieler {name, aliases}
 * @param {(token:string, candidates:Array)=>Promise<object|null>} resolveAmbiguous fragt bei mehrdeutigen Namen nach
 * @param {object} [fixed] optional {player, code}: festen Code für einen Spieler verwenden
 * @returns {{text:string, codes:Map<string,object>}} codes: Code -> Spieler
 */
export async function anonymize(text, players, resolveAmbiguous, fixed) {
  const used = new Set();
  const codeOf = new Map(); // Spieler -> Code
  if (fixed) { codeOf.set(fixed.player, fixed.code); used.add(fixed.code); }
  const getCode = p => { if (!codeOf.has(p)) codeOf.set(p, randomCode(used)); return codeOf.get(p); };

  let out = text;
  const index = tokenIndex(players);
  // 1) Eindeutige Namen ersetzen (längste zuerst, damit "Luis Zimpfer" vor "Luis" greift)
  for (const { token, players: ps } of index) {
    if (ps.size === 1) out = out.replace(wordRe(token), () => getCode([...ps][0]));
  }
  // 2) Mehrdeutige Namen (z. B. zwei Spieler namens Luis) beim Nutzer nachfragen
  for (const { token, players: ps } of index) {
    if (ps.size > 1 && wordRe(token).test(out)) {
      const chosen = await resolveAmbiguous(token, [...ps]);
      out = out.replace(wordRe(token), () => (chosen ? getCode(chosen) : '[Spieler]'));
    }
  }
  const codes = new Map([...codeOf].map(([p, c]) => [c, p]));
  return { text: out, codes };
}

/** Codes in einem KI-Text wieder durch Spielernamen ersetzen. */
export function deanonymize(text, codes, nameOf = p => p.name.split(' ')[0]) {
  return String(text || '').replace(/P-[A-Z2-9]{3}/g, c => (codes.has(c) ? nameOf(codes.get(c)) : c));
}
