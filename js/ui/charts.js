// Diagramme der Auswertung am Bildschirm (SVG). Berechnungen kommen aus core/stats.js,
// damit Bildschirm und PowerPoint-Export dieselben Zahlen zeigen.
import { CONFIG } from '../core/config.js';
import { S, areas, skillsOf, inStatsRange } from '../core/state.js';
import { firstName } from '../core/format.js';
import { bucketize, avgLevel } from '../core/stats.js';
import { h, render } from './dom.js';

const fmt1 = v => v.toFixed(1).replace('.', ',');
const svgBox = (cls, W, H, svg, label) => {
  const el = h('div', { class: cls });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">${svg}</svg>`;
  return el;
};

/** Skill-Liste: Durchschnittsniveau je Skill als Balken (Markierung bei 3), gruppiert nach Bereich. Antippen filtert. */
export function skillBars(rows) {
  const st = S.stats;
  const groups = areas().map(a => h('div', { class: 'sk-group' },
    h('div', { class: 'sk-area' }, a),
    ...skillsOf(a).map(sk => {
      const list = rows.filter(f => f.Skill === sk);
      const av = avgLevel(list);
      return h('button', { class: `sk-row ${st.skill === sk ? 'on' : ''}`, onclick: () => { st.skill = st.skill === sk ? '' : sk; st.area = ''; render(); } },
        h('span', { class: 'sk-name' }, sk),
        h('span', { class: 'sk-bar' },
          av ? h('span', { class: `sk-fill l${Math.round(av.val)}`, style: `width:${(av.val / 5) * 100}%` }) : null,
          h('span', { class: 'sk-ref' })),
        h('span', { class: 'sk-val' }, av ? fmt1(av.val) : '–'),
        h('span', { class: 'sk-n' }, `(${list.length})`));
    })));
  return h('div', { class: 'card' }, h('h3', {}, 'Niveau je Skill'),
    h('p', { class: 'hint' }, 'Balken = Ø Niveau (Strich bei 3 = altersgemäß), Klammer = Anzahl Einträge. Antippen filtert die Liste.'),
    ...groups);
}

/** Spinnendiagramm: durchschnittliches Niveau je Kompetenzbereich (Spieler vs. Team im selben Zeitraum). */
export function radar(rows, playerName) {
  const A = areas();
  const me = A.map(a => avgLevel(rows.filter(f => f.Bereich === a)));
  const teamRows = S.feedback.filter(inStatsRange);
  const team = A.map(a => avgLevel(teamRows.filter(f => f.Bereich === a)));
  const card = (...k) => h('div', { class: 'card' }, h('h3', {}, 'Niveau je Bereich'), ...k);
  if (!me.some(Boolean)) return card(h('p', { class: 'hint' }, 'Noch keine Einträge mit Niveau im Zeitraum. Das Niveau wird bei jedem neuen Eintrag erfasst und lässt sich bei alten Einträgen über ✎ nachtragen.'));

  const W = 390, H = 260, cx = W / 2, cy = 128, R = 84, n = A.length;
  const ang = i => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const pt = (i, v) => [cx + Math.cos(ang(i)) * R * (v / 5), cy + Math.sin(ang(i)) * R * (v / 5)];
  const poly = vals => vals.map((v, i) => pt(i, v ? v.val : 0).map(x => x.toFixed(1)).join(',')).join(' ');
  let svg = '';
  for (let lvl = 1; lvl <= 5; lvl++) {
    svg += `<polygon points="${A.map((_, i) => pt(i, lvl).join(',')).join(' ')}" class="${lvl === 3 ? 'rd-ref' : 'rd-grid'}"/>`;
  }
  A.forEach((a, i) => {
    const [x, y] = pt(i, 5);
    svg += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="rd-grid"/>`;
    const [lx, ly] = pt(i, 5.75);
    const anchor = Math.abs(lx - cx) < 5 ? 'middle' : lx > cx ? 'start' : 'end';
    svg += `<text x="${lx}" y="${ly}" text-anchor="${anchor}" class="rd-l">${a.split(' / ')[0]}</text>`;
    svg += `<text x="${lx}" y="${ly + 13}" text-anchor="${anchor}" class="rd-v">${me[i] ? fmt1(me[i].val) : '–'}</text>`;
  });
  if (team.some(Boolean)) svg += `<polygon points="${poly(team)}" class="rd-team"/>`;
  svg += `<polygon points="${poly(me)}" class="rd-me"/>`;
  me.forEach((v, i) => { if (v) { const [x, y] = pt(i, v.val); svg += `<circle cx="${x}" cy="${y}" r="3.5" class="rd-dot"/>`; } });
  const counted = me.reduce((s, v) => s + (v ? v.n : 0), 0);
  return card(svgBox('radar', W, H, svg, 'Niveau je Kompetenzbereich'),
    h('div', { class: 'legend' },
      h('span', { class: 'lg lg-me' }, firstName(playerName)),
      h('span', { class: 'lg lg-team' }, 'Team-Schnitt'),
      h('span', { class: 'lg lg-ref' }, '3 = altersgemäß')),
    h('p', { class: 'hint' }, `Grundlage: ${counted} Einträge mit Niveau im Zeitraum.`));
}

/** Zeitleiste: gestapelte Säulen je Monat (bei bis zu ~10 Wochen je Woche) mit Positiv/Neutral/Kritisch. */
export function timeline(rows, area) {
  const card = (...kids) => h('div', { class: 'card' }, h('h3', {}, `Verlauf${area ? ` · ${area}` : ''}`), ...kids);
  const { weekly, buckets, undated } = bucketize(rows, S.stats.from, S.stats.to);
  if (undated === rows.length) return card(h('p', { class: 'hint' }, 'Noch keine datierten Einträge im Zeitraum.'));

  const max = Math.max(1, ...buckets.map(b => b.total));
  const W = 340, H = 150, top = 14, bottom = 22, left = 4;
  const slot = (W - left) / buckets.length, bw = Math.min(34, slot * 0.7);
  const scale = (H - top - bottom) / max;
  const colors = ['var(--pos)', 'var(--neu)', 'var(--krit)'];
  let svg = '';
  buckets.forEach((b, i) => {
    const x = left + i * slot + (slot - bw) / 2;
    let y = H - bottom;
    b.counts.forEach((n, k) => {
      if (!n) return;
      const hgt = n * scale;
      y -= hgt;
      svg += `<rect x="${x}" y="${y}" width="${bw}" height="${hgt}" rx="2" fill="${colors[k]}"><title>${b.label}: ${n} ${CONFIG.ratings[k]}</title></rect>`;
      if (hgt >= 12) svg += `<text x="${x + bw / 2}" y="${y + hgt / 2 + 4}" text-anchor="middle" class="tl-n">${n}</text>`;
    });
    if (b.total) svg += `<text x="${x + bw / 2}" y="${y - 3}" text-anchor="middle" class="tl-t">${b.total}</text>`;
    if (!weekly || buckets.length <= 8 || i % 2 === 0) svg += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" class="tl-l">${b.label}</text>`;
  });
  svg += `<line x1="0" x2="${W}" y1="${H - bottom}" y2="${H - bottom}" class="tl-axis"/>`;
  return card(svgBox('timeline', W, H, svg, 'Verlauf der Bewertungen'),
    h('div', { class: 'legend' }, ...CONFIG.ratings.map(r => h('span', { class: `lg r-${r.toLowerCase()}` }, r)),
      h('span', { class: 'hint' }, weekly ? 'je Woche' : 'je Monat')),
    undated ? h('p', { class: 'hint' }, `${undated} Einträge ohne Datum sind nicht enthalten.`) : null);
}
