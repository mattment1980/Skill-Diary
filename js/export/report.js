// PowerPoint-Export (Entwicklungsgespräch) auf Basis von template/Auswertung-Vorlage.pptx.
// Seite 1: Texte + Sterne je Bereich. Seite 2: Grafiken aus export/charts.js.
// Alles wird auf dem Handy erzeugt; Texte bleiben in PowerPoint editierbar, Grafiken sind Bilder.
import { avgLevel } from '../core/stats.js';
import { kidLabel, chartOverview, chartRadar, chartTimeline, chartSkills } from './charts.js';

const TEMPLATE = 'template/Auswertung-Vorlage.pptx';
const STAR_FULL = 'rId3';  // ppt/media/image2.png (gefüllter Stern)
const STAR_EMPTY = 'rId4'; // ppt/media/image3.png (leerer Stern)
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

let jszipLoading = null;
function loadJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  jszipLoading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'lib/jszip.min.js';
    s.onload = () => resolve(window.JSZip);
    s.onerror = () => reject(new Error('ZIP-Bibliothek konnte nicht geladen werden'));
    document.head.appendChild(s);
  });
  return jszipLoading;
}

/* ---------- PPTX befüllen ---------- */
const parse = s => new DOMParser().parseFromString(s, 'application/xml');
const serialize = d => new XMLSerializer().serializeToString(d);
const texts = doc => [...doc.getElementsByTagNameNS(NS_A, 't')];

function replaceSimple(doc, map) {
  for (const t of texts(doc)) {
    t.textContent = t.textContent.replace(/\{\{([A-Z0-9]+)\}\}/g, (m, k) => (k in map ? map[k] : m));
  }
}

/** Absatz mit Platzhalter je Listeneintrag klonen. items: string[] oder {title,text}[]. */
function replaceList(doc, key, items, gap = false) {
  const t = texts(doc).find(x => x.textContent.includes(`{{${key}}}`));
  if (!t) return;
  let p = t;
  while (p && !(p.localName === 'p' && p.namespaceURI === NS_A)) p = p.parentNode;
  items.forEach((it, i) => {
    const np = p.cloneNode(true);
    const run = np.getElementsByTagNameNS(NS_A, 'r')[0];
    const nt = np.getElementsByTagNameNS(NS_A, 't')[0];
    if (typeof it === 'string') nt.textContent = it;
    else {
      // fetter Titel + normaler Text
      const bold = run.cloneNode(true);
      bold.getElementsByTagNameNS(NS_A, 'rPr')[0]?.setAttribute('b', '1');
      bold.getElementsByTagNameNS(NS_A, 't')[0].textContent = `${it.title}: `;
      run.parentNode.insertBefore(bold, run);
      nt.textContent = it.text;
    }
    if (gap && i > 0) {
      const empty = p.cloneNode(true);
      empty.getElementsByTagNameNS(NS_A, 't')[0].textContent = '';
      p.parentNode.insertBefore(empty, p);
    }
    p.parentNode.insertBefore(np, p);
  });
  if (items.length) p.parentNode.removeChild(p); else t.textContent = '';
}

function picsByName(doc) {
  const out = {};
  for (const pic of doc.getElementsByTagNameNS(NS_P, 'pic')) {
    const name = pic.getElementsByTagNameNS(NS_P, 'cNvPr')[0]?.getAttribute('name');
    const blip = pic.getElementsByTagNameNS(NS_A, 'blip')[0];
    if (name && blip) out[name] = blip;
  }
  return out;
}

/**
 * Erzeugt die PPTX.
 * @param {object} p {name, period, from, to, summary, rows (Spieler, Zeitraum), teamRows, areas, skills}
 * @returns {Promise<Blob>}
 */
export async function buildPptx({ name, period, from, to, summary, rows, teamRows, areas, skills }) {
  const JSZip = await loadJSZip();
  try { await Promise.all([document.fonts.load('500 20px Barlow'), document.fonts.load('700 20px Barlow')]); } catch { /* Ersatzschrift */ }
  const zip = await JSZip.loadAsync(await (await fetch(TEMPLATE)).arrayBuffer());
  const four = areas.slice(0, 4);
  const mine = four.map(a => avgLevel(rows.filter(f => f.Bereich === a)));
  const team = four.map(a => avgLevel(teamRows.filter(f => f.Bereich === a)));

  // Seite 1
  const s1 = parse(await zip.file('ppt/slides/slide1.xml').async('string'));
  replaceSimple(s1, {
    ZEITRAUM: period, SPIELER: name, EINSCHAETZUNG: summary.einschaetzung,
    ...Object.fromEntries([0, 1, 2, 3].map(i => [`B${i + 1}`, four[i] ? kidLabel(four[i]) : ''])),
  });
  replaceList(s1, 'SUPER', summary.super);
  replaceList(s1, 'VERBESSERN', summary.verbessern);
  replaceList(s1, 'STOLZ', summary.stolz.map(b => ({ title: b.titel, text: b.text })), true);
  const pics1 = picsByName(s1);
  for (let b = 1; b <= 4; b++) {
    const stars = mine[b - 1] ? Math.round(mine[b - 1].val) : 0;
    for (let i = 1; i <= 5; i++) {
      const blip = pics1[`STAR_${b}_${i}`];
      if (!blip) continue;
      if (!four[b - 1]) blip.parentNode.parentNode.parentNode.removeChild(blip.parentNode.parentNode); // Bereich fehlt
      else blip.setAttributeNS(NS_R, 'r:embed', i <= stars ? STAR_FULL : STAR_EMPTY);
    }
  }
  zip.file('ppt/slides/slide1.xml', serialize(s1));

  // Seite 2
  const s2 = parse(await zip.file('ppt/slides/slide2.xml').async('string'));
  replaceSimple(s2, { ZEITRAUM: period, SPIELER: name });
  const rels = parse(await zip.file('ppt/slides/_rels/slide2.xml.rels').async('string'));
  const target = id => [...rels.getElementsByTagName('Relationship')].find(r => r.getAttribute('Id') === id)?.getAttribute('Target');
  const charts = {
    CHART_OVERVIEW: () => chartOverview(rows, areas),
    CHART_RADAR: () => chartRadar(mine, team, four),
    CHART_TIMELINE: () => chartTimeline(rows, from, to),
    CHART_SKILLS: () => chartSkills(rows, skills, areas),
  };
  const pics2 = picsByName(s2);
  for (const [key, draw] of Object.entries(charts)) {
    const blip = pics2[key];
    const t = blip && target(blip.getAttributeNS(NS_R, 'embed'));
    if (t) zip.file('ppt/' + t.replace(/^\.\.\//, ''), await draw()); // Target ist relativ zu ppt/slides/
  }
  zip.file('ppt/slides/slide2.xml', serialize(s2));
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}
