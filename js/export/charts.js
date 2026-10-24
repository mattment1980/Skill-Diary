// Grafiken für den PowerPoint-Export (Canvas -> PNG), Farben passend zur Vereinsvorlage.
// Berechnungen kommen aus core/stats.js – dieselben wie am Bildschirm (ui/charts.js).
import { CONFIG } from '../core/config.js';
import { bucketize, avgLevel, ratingCounts } from '../core/stats.js';

/** Kindgerechte Bereichsnamen wie in der Vorlage. */
const KID_LABEL = { 'Koordination / Physis': 'Bewegung', 'Soziales / Mentales': 'Verhalten' };
export const kidLabel = a => KID_LABEL[a] || a;

// Farben passend zur Vorlage (Dunkelgrün der Sterne)
const C = { green: '#02492F', pos: '#2E8B57', neu: '#A9B2AC', krit: '#E8892B', text: '#1D1D1D', muted: '#6B746F', grid: '#D9DED9', team: '#8A938D' };
const RC = [C.pos, C.neu, C.krit];
const LVL = { 1: '#D9534F', 2: '#E8892B', 3: '#B9C2BC', 4: '#5CB85C', 5: '#02492F' };
const PX = 80; // Pixel pro cm

function canvas(wCm, hCm) {
  const c = document.createElement('canvas');
  c.width = Math.round(wCm * PX); c.height = Math.round(hCm * PX);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.textBaseline = 'middle';
  return [c, ctx];
}
const font = (ctx, size, weight = 500) => { ctx.font = `${weight} ${size}px Barlow, Arial, sans-serif`; };
const toBlob = c => new Promise(r => c.toBlob(r, 'image/png'));
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); ctx.fill();
}

export function chartOverview(rows, areas) {
  const [c, ctx] = canvas(7.8, 6.1);
  const W = c.width, counts = ratingCounts(rows);
  const tileW = (W - 40) / 3;
  CONFIG.ratings.forEach((r, i) => {
    const x = i * (tileW + 20);
    ctx.fillStyle = '#F2F5F3'; roundRect(ctx, x, 0, tileW, 120, 14);
    ctx.fillStyle = RC[i] === C.neu ? C.text : RC[i]; font(ctx, 56, 700); ctx.textAlign = 'center';
    ctx.fillText(String(counts[i]), x + tileW / 2, 52);
    ctx.fillStyle = C.muted; font(ctx, 28); ctx.fillText(r, x + tileW / 2, 98);
  });
  ctx.textAlign = 'left';
  const rowH = (c.height - 150) / areas.length;
  areas.forEach((a, i) => {
    const y = 150 + i * rowH;
    const list = rows.filter(f => f.Bereich === a), cs = ratingCounts(list), tot = list.length;
    ctx.fillStyle = C.text; font(ctx, 30, 600); ctx.fillText(kidLabel(a), 0, y + 16);
    const lw = ctx.measureText(kidLabel(a)).width;
    ctx.fillStyle = C.muted; font(ctx, 26); ctx.fillText(`${tot}`, lw + 12, y + 16);
    let x = 0; const bw = W, by = y + 38, bh = 30;
    ctx.fillStyle = '#F2F5F3'; roundRect(ctx, 0, by, bw, bh, 8);
    cs.forEach((n, k) => {
      if (!n) return;
      const w = (n / tot) * bw;
      ctx.fillStyle = RC[k]; roundRect(ctx, x, by, w - 3, bh, 6);
      if (w > 34) { ctx.fillStyle = k === 1 ? C.text : '#fff'; font(ctx, 24, 700); ctx.textAlign = 'center'; ctx.fillText(String(n), x + w / 2, by + bh / 2 + 1); ctx.textAlign = 'left'; }
      x += w;
    });
  });
  return toBlob(c);
}

export function chartRadar(mine, team, areas) {
  const [c, ctx] = canvas(7.9, 6.1);
  const cx = c.width / 2, cy = c.height / 2 - 4, R = Math.min(c.width, c.height) * 0.3, n = areas.length;
  const ang = i => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const pt = (i, v) => [cx + Math.cos(ang(i)) * R * (v / 5), cy + Math.sin(ang(i)) * R * (v / 5)];
  const path = vals => { ctx.beginPath(); vals.forEach((v, i) => { const [x, y] = pt(i, v ? v.val : 0); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); };
  for (let l = 1; l <= 5; l++) {
    ctx.beginPath(); areas.forEach((_, i) => { const [x, y] = pt(i, l); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath();
    ctx.setLineDash(l === 3 ? [8, 6] : []); ctx.strokeStyle = l === 3 ? C.muted : C.grid; ctx.lineWidth = l === 3 ? 2.5 : 1.5; ctx.stroke();
  }
  ctx.setLineDash([]);
  areas.forEach((a, i) => {
    const [x, y] = pt(i, 5); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.strokeStyle = C.grid; ctx.stroke();
    let [lx, ly] = pt(i, 5.9);
    const side = Math.abs(lx - cx) < 5 ? 'center' : lx > cx ? 'left' : 'right';
    font(ctx, 28, 600);
    const tw = ctx.measureText(kidLabel(a)).width;
    // Beschriftung innerhalb des Bildes halten
    if (side === 'left') lx = Math.min(lx, c.width - tw - 4);
    if (side === 'right') lx = Math.max(lx, tw + 4);
    if (side === 'center') ly += ly < cy ? -10 : 6;
    ctx.textAlign = side;
    ctx.fillStyle = C.text; ctx.fillText(kidLabel(a), lx, ly - 14);
    ctx.fillStyle = C.green; font(ctx, 28, 700); ctx.fillText(mine[i] ? mine[i].val.toFixed(1).replace('.', ',') : '–', lx, ly + 16);
  });
  if (team.some(Boolean)) { path(team); ctx.setLineDash([6, 6]); ctx.strokeStyle = C.team; ctx.lineWidth = 2.5; ctx.stroke(); ctx.setLineDash([]); }
  path(mine); ctx.fillStyle = 'rgba(2,73,47,.25)'; ctx.fill(); ctx.strokeStyle = C.green; ctx.lineWidth = 4; ctx.stroke();
  mine.forEach((v, i) => { if (v) { const [x, y] = pt(i, v.val); ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fillStyle = C.green; ctx.fill(); } });
  // Legende
  ctx.textAlign = 'left'; font(ctx, 24); const ly = c.height - 16;
  ctx.fillStyle = C.green; ctx.fillRect(0, ly - 8, 22, 16); ctx.fillStyle = C.text; ctx.fillText('Du', 30, ly);
  ctx.setLineDash([6, 4]); ctx.strokeStyle = C.team; ctx.lineWidth = 2.5; ctx.strokeRect(80, ly - 8, 22, 16); ctx.setLineDash([]);
  ctx.fillText('Team', 110, ly);
  ctx.fillStyle = C.muted; ctx.textAlign = 'right'; ctx.fillText('3 = altersgemäß', c.width, ly);
  return toBlob(c);
}

export function chartTimeline(rows, from, to) {
  const [c, ctx] = canvas(16.5, 4.3);
  const { buckets, weekly } = bucketize(rows, from, to);
  const top = 40, bottom = 50, H = c.height, W = c.width;
  const max = Math.max(1, ...buckets.map(b => b.total));
  const slot = W / Math.max(1, buckets.length), bw = Math.min(90, slot * 0.6), scale = (H - top - bottom) / max;
  buckets.forEach((b, i) => {
    const x = i * slot + (slot - bw) / 2; let y = H - bottom;
    b.counts.forEach((n, k) => {
      if (!n) return; const h = n * scale; y -= h;
      ctx.fillStyle = RC[k]; ctx.fillRect(x, y, bw, h - 2);
      if (h > 26) { ctx.fillStyle = k === 1 ? C.text : '#fff'; font(ctx, 20, 700); ctx.textAlign = 'center'; ctx.fillText(String(n), x + bw / 2, y + h / 2); }
    });
    ctx.textAlign = 'center'; ctx.fillStyle = C.muted; font(ctx, 24);
    if (b.total) ctx.fillText(String(b.total), x + bw / 2, y - 14);
    if (!weekly || buckets.length <= 10 || i % 2 === 0) { ctx.fillStyle = C.text; font(ctx, 28, 600); ctx.fillText(b.label, x + bw / 2, H - 18); }
  });
  ctx.strokeStyle = C.grid; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, H - bottom); ctx.lineTo(W, H - bottom); ctx.stroke();
  // Legende rechts oben
  ctx.textAlign = 'left'; font(ctx, 24); let lx = W - 470;
  CONFIG.ratings.forEach((r, k) => { ctx.fillStyle = RC[k]; ctx.fillRect(lx, 4, 18, 18); ctx.fillStyle = C.text; ctx.fillText(r, lx + 24, 14); lx += 34 + ctx.measureText(r).width; });
  ctx.fillStyle = C.muted; ctx.fillText(weekly ? 'je Woche' : 'je Monat', lx + 6, 14);
  return toBlob(c);
}

export function chartSkills(rows, skills, areas) {
  const [c, ctx] = canvas(16.5, 6.0);
  // Zeilen: Bereichsüberschriften + Skills, auf zwei Spalten verteilt
  const lines = [];
  areas.forEach(a => { lines.push({ head: kidLabel(a) }); skills.filter(s => s.area === a).forEach(s => lines.push({ skill: s.skill })); });
  const half = Math.ceil(lines.length / 2);
  // Bereichsüberschrift nicht allein am Spaltenende
  let split = half; if (lines[split - 1]?.head) split--;
  const cols = [lines.slice(0, split), lines.slice(split)];
  const colW = (c.width - 60) / 2, rowH = c.height / Math.max(cols[0].length, cols[1].length);
  cols.forEach((col, ci) => {
    const x0 = ci * (colW + 60);
    col.forEach((ln, ri) => {
      const y = ri * rowH + rowH / 2;
      ctx.textAlign = 'left';
      if (ln.head) { ctx.fillStyle = C.green; font(ctx, 26, 700); ctx.fillText(ln.head.toUpperCase(), x0, y + 4); return; }
      const list = rows.filter(f => f.Skill === ln.skill), av = avgLevel(list);
      ctx.fillStyle = C.text; font(ctx, 27);
      let name = ln.skill; while (ctx.measureText(name).width > colW * 0.44 && name.length > 4) name = name.slice(0, -2) + '…';
      ctx.fillText(name, x0, y);
      const bx = x0 + colW * 0.46, bwid = colW * 0.34, bh = 20;
      ctx.fillStyle = '#EEF1EF'; roundRect(ctx, bx, y - bh / 2, bwid, bh, 8);
      if (av) { ctx.fillStyle = LVL[Math.round(av.val)]; roundRect(ctx, bx, y - bh / 2, bwid * av.val / 5, bh, 8); }
      ctx.fillStyle = C.text; ctx.fillRect(bx + bwid * 0.6 - 1, y - bh / 2 - 4, 2, bh + 8);
      font(ctx, 27, 700); ctx.textAlign = 'right';
      ctx.fillText(av ? av.val.toFixed(1).replace('.', ',') : '–', x0 + colW * 0.92, y);
      ctx.fillStyle = C.muted; font(ctx, 23); ctx.fillText(`(${list.length})`, x0 + colW, y);
    });
  });
  return toBlob(c);
}
