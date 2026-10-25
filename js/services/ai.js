// KI-Aufrufe (Anthropic API, direkt aus dem Browser). Es werden nur pseudonymisierte Texte gesendet.
// Strukturierte Antworten über ein "Tool", damit kein freies JSON geparst werden muss.
// Manche Modelle erlauben kein erzwungenes Tool (tool_choice) – dann wird per Anweisung verpflichtet.
import { settings } from '../core/config.js';

const noForcedTool = new Set(); // Modelle, die tool_choice "tool" ablehnen

async function request(body) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = res.status;
    try { msg = (await res.json()).error?.message || msg; } catch { /* */ }
    const err = new Error(`KI: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function callTool({ model, system, user, tool, maxTokens }) {
  if (!settings.apiKey) throw new Error('Kein KI-Schlüssel hinterlegt (Einstellungen).');
  const base = { model, max_tokens: maxTokens, tools: [tool], messages: [{ role: 'user', content: user }] };
  const forced = { ...base, system, tool_choice: { type: 'tool', name: tool.name } };
  const free = { ...base, system: `${system}\n\nAntworte ausschließlich, indem du das Werkzeug "${tool.name}" genau einmal aufrufst.` };
  let data;
  if (noForcedTool.has(model)) data = await request(free);
  else {
    try { data = await request(forced); } catch (e) {
      if (e.status !== 400 || !/tool_choice/i.test(e.message)) throw e;
      noForcedTool.add(model);
      data = await request(free);
    }
  }
  const block = data.content.find(c => c.type === 'tool_use');
  if (!block) throw new Error(data.stop_reason === 'max_tokens' ? 'KI: Antwort zu lang abgeschnitten – bitte erneut versuchen' : 'KI: keine strukturierte Antwort');
  return block.input;
}

function catalogText(skills) {
  const areas = {};
  for (const s of skills) (areas[s.area] ||= []).push(s.skill);
  return Object.entries(areas).map(([a, l]) => `${a}: ${l.join('; ')}`).join('\n');
}

/** Zerlegt eine (pseudonymisierte) Notiz in Feedback-Einträge. */
export async function extractFeedback({ text, codes, skills, positions, dateStr }) {
  const areas = [...new Set(skills.map(s => s.area))];
  const tool = {
    name: 'feedback_eintragen',
    description: 'Strukturierte Feedback-Einträge aus der Trainer-Notiz',
    input_schema: {
      type: 'object',
      properties: {
        kontext: {
          type: 'object',
          properties: {
            art: { type: 'string', enum: ['Spiel', 'Training', ''] },
            anlass: { type: 'string', description: 'Gegner, Ort oder Turnier, sonst leer' },
            datum: { type: 'string', description: 'YYYY-MM-DD, nur wenn im Text genannt, sonst leer' },
          },
          required: ['art', 'anlass', 'datum'],
        },
        eintraege: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              spieler: { type: 'string', description: 'Spieler-Code, z. B. P-K7Q' },
              bereich: { type: 'string', enum: [...areas, ''] },
              skill: { type: 'string', enum: [...skills.map(s => s.skill), ''] },
              bewertung: { type: 'string', enum: ['Positiv', 'Neutral', 'Kritisch'] },
              position: { type: 'string', enum: [...positions.map(p => p.code), ''] },
              niveau: { type: 'integer', minimum: 1, maximum: 5, description: 'Leistungsniveau im Altersvergleich' },
              kommentar: { type: 'string' },
            },
            required: ['spieler', 'bereich', 'skill', 'bewertung', 'position', 'kommentar', 'niveau'],
          },
        },
      },
      required: ['kontext', 'eintraege'],
    },
  };
  const system = `Du strukturierst Notizen eines Jugendfußball-Trainers (U10/U11) in Feedback-Einträge.
Spieler sind durch Codes wie P-K7Q ersetzt – verwende nur diese Codes, erfinde keine Namen.
Regeln:
- Ein Eintrag je Spieler und Skill. Betrifft eine Aussage zwei Skills, erzeuge zwei Einträge.
- Bereich und Skill nur aus dem Katalog. Ist der Skill nicht eindeutig, lass skill leer (bereich wenn möglich setzen).
- Bewertung: Positiv = Lob/Fortschritt, Kritisch = Defizit/Arbeitsauftrag, Neutral = beschreibend oder gemischt.
- Kommentar: Aussage des Trainers knapp und sachlich auf Deutsch, nah an seiner Formulierung, Codes statt Namen.
- Niveau 1–5 = gezeigtes Leistungsniveau im Vergleich zum altersgemäß Erwartbaren (U10/U11): 1 weit darunter, 2 darunter, 3 altersgemäß, 4 darüber, 5 weit darüber. Unabhängig von der Bewertung: Lob für Fortschritt kann auf Niveau 2 liegen, Kritik bei einem starken Spieler auf Niveau 4. Ohne klare Hinweise 3.
- Position nur, wenn genannt (Verteidiger links=LV, rechts=RV, Mittelfeld links/zentral/rechts=LM/ZM/RM, Sturm=ST, Tor=TW).
- Kontext: Spiel oder Training, Anlass (Gegner/Ort/Turnier) und Datum nur, wenn erkennbar. Relative Angaben (gestern, Samstag) anhand des heutigen Datums auflösen.
Katalog:
${catalogText(skills)}`;
  const user = `Heute: ${dateStr}. Spieler-Codes im Text: ${[...codes.keys()].join(', ') || 'keine'}.\n\nNotiz:\n${text}`;
  return callTool({ model: settings.modelExtract, system, user, tool, maxTokens: 4000 });
}

/** Erstellt die Spieler-Zusammenfassung aus (pseudonymisierten) Einträgen. */
const TONES = {
  ermutigend: 'ermutigend und warm: Stärken deutlich würdigen, Kritik behutsam als nächsten Schritt formulieren',
  ausgewogen: 'ausgewogen und sachlich-freundlich: Stärken und Baustellen gleich deutlich benennen',
  klar: 'klar und fordernd: direkt sagen, was noch fehlt und was wir erwarten – respektvoll, nie abwertend',
};
const RECENCY = [
  '',
  'Gewichte die aktuellen Notizen etwas stärker als ältere.',
  'Gewichte die aktuellen Notizen deutlich stärker; ältere Notizen vor allem, um die Entwicklung zu zeigen.',
  'Beschreibe vor allem den aktuellen Stand; ältere Notizen nur als Vergleich für die Entwicklung.',
];

/**
 * System-Prompt und Tool-Schema der Zusammenfassung aus den Optionen (ohne Personendaten).
 * @param {{code:string, opts:object, recentFrom?:string}} p opts siehe SUMMARY_DEFAULTS in core/config.js
 */
export function summaryRequest({ code, opts, recentFrom = '' }) {
  const sec = opts.sections;
  const eltern = opts.audience === 'eltern';
  const only = k => (sec[k].areas.length ? ` Nur aus dem Bereich ${sec[k].areas.join(' / ')}.` : '');
  const props = {}, rules = [];
  if (sec.einschaetzung.on) {
    props.einschaetzung = { type: 'string', description: 'max. 100 Wörter' };
    rules.push(`- einschaetzung: allgemeine Einschätzung der Trainer inkl. Entwicklung im Zeitraum, max. 100 Wörter, Perspektive "wir Trainer".${only('einschaetzung')}`);
  }
  if (sec.super.on) {
    props.super = { type: 'array', items: { type: 'string' }, maxItems: sec.super.n };
    rules.push(`- super: genau ${sec.super.n} kurze Stichpunkte zu den größten Stärken (weniger nur, wenn die Notizen nicht mehr hergeben).${only('super')}`);
  }
  if (sec.verbessern.on) {
    props.verbessern = { type: 'array', items: { type: 'string' }, maxItems: sec.verbessern.n };
    rules.push(`- verbessern: genau ${sec.verbessern.n} kurze Stichpunkte, positiv formuliert als nächste Schritte (weniger nur, wenn die Notizen nicht mehr hergeben).${only('verbessern')}`);
  }
  if (sec.stolz.on) {
    props.stolz = {
      type: 'array', maxItems: sec.stolz.n,
      items: { type: 'object', properties: { titel: { type: 'string' }, text: { type: 'string' } }, required: ['titel', 'text'] },
    };
    rules.push(`- stolz: ${sec.stolz.n === 1 ? 'ein Themenblock' : `${sec.stolz.n} Themenblöcke`} "Darauf ${eltern ? 'kann Ihr Kind' : 'kannst du'} stolz sein" mit kurzem Titel und 1–2 Sätzen.${only('stolz')}`);
  }
  const tool = {
    name: 'zusammenfassung',
    description: 'Entwicklungsfeedback aus Trainer-Notizen',
    input_schema: { type: 'object', properties: props, required: Object.keys(props) },
  };
  const who = eltern
    ? 'Du schreibst ein Entwicklungsfeedback für die Eltern eines Kindes (9–11 Jahre) aus einer Jugendfußball-Mannschaft.\nSprich die Eltern mit "Sie" an und schreibe über das Kind als "Ihr Kind", sachlich und verständlich. Keine Namen nennen.'
    : 'Du schreibst ein Entwicklungsfeedback für ein Kind (9–11 Jahre) aus einer Jugendfußball-Mannschaft.\nSprich das Kind direkt mit "du" an, ehrlich und konkret, in einfacher Sprache. Keine Namen nennen.';
  const system = `${who}
Tonlage: ${TONES[opts.tone] || TONES.ermutigend}.
Das Kind heißt im Material ${code}. Andere Codes sind Mitspieler – nicht erwähnen.
Grundlage sind ausschließlich die Trainer-Notizen; nichts erfinden. Keine Übungen oder Trainingstipps vorschlagen.
Niveau (1–5) = Stand im Altersvergleich (3 = altersgemäß); Bewertung = Tendenz/Entwicklung. Berücksichtige beides: auch große Fortschritte auf niedrigem Niveau würdigen, bei hohem Niveau Kritik als nächsten Schritt einordnen.
Als Schwerpunkt genannte Themen deutlich stärker berücksichtigen. Hinweise des Trainers befolgen, solange sie diesen Regeln nicht widersprechen.
${recentFrom && opts.recency ? `Notizen ab ${recentFrom} gelten als aktuell. ${RECENCY[opts.recency]}\n` : ''}${rules.join('\n')}`;
  return { system, tool };
}

/**
 * Zusammenfassung schreiben. user = vollständige (anonymisierte, ggf. in der Vorschau bearbeitete) Nachricht.
 * @returns {Promise<object>} Felder je eingeschaltetem Abschnitt
 */
export async function summarize({ code, user, opts, recentFrom }) {
  const { system, tool } = summaryRequest({ code, opts, recentFrom });
  return callTool({ model: settings.modelSummary, system, user, tool, maxTokens: 4000 });
}
