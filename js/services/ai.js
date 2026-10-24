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
export async function summarize({ code, lines, period }) {
  const tool = {
    name: 'zusammenfassung',
    description: 'Entwicklungsfeedback für ein Kind',
    input_schema: {
      type: 'object',
      properties: {
        einschaetzung: { type: 'string', description: 'max. 100 Wörter' },
        super: { type: 'array', items: { type: 'string' }, maxItems: 5 },
        verbessern: { type: 'array', items: { type: 'string' }, maxItems: 5 },
        stolz: {
          type: 'array', minItems: 1, maxItems: 2,
          items: { type: 'object', properties: { titel: { type: 'string' }, text: { type: 'string' } }, required: ['titel', 'text'] },
        },
      },
      required: ['einschaetzung', 'super', 'verbessern', 'stolz'],
    },
  };
  const system = `Du schreibst ein Entwicklungsfeedback für ein Kind (9–11 Jahre) aus einer Jugendfußball-Mannschaft.
Sprich das Kind direkt mit "du" an, ermutigend, ehrlich und konkret, in einfacher Sprache. Keine Namen nennen.
Das Kind heißt im Material ${code}. Andere Codes sind Mitspieler – nicht erwähnen.
Grundlage sind ausschließlich die Trainer-Notizen; nichts erfinden.
Niveau (1–5) = Stand im Altersvergleich (3 = altersgemäß); Bewertung = Tendenz/Entwicklung. Berücksichtige beides: auch große Fortschritte auf niedrigem Niveau würdigen, bei hohem Niveau Kritik als nächsten Schritt einordnen.
- einschaetzung: allgemeine Einschätzung der Trainer inkl. Entwicklung im Zeitraum, max. 100 Wörter, Perspektive "wir Trainer".
- super: max. 5 kurze Stichpunkte "Das machst du schon super".
- verbessern: max. 5 kurze Stichpunkte, positiv formuliert als nächste Schritte.
- stolz: 1–2 Themenblöcke "Darauf kannst du stolz sein" mit kurzem Titel und 1–2 Sätzen.`;
  const user = `Zeitraum: ${period}\nNotizen (Datum | Anlass | Bereich/Skill | Bewertung | Niveau | Kommentar):\n${lines.join('\n')}`;
  return callTool({ model: settings.modelSummary, system, user, tool, maxTokens: 4000 });
}
