// DOM-Helfer und wiederverwendbare Bausteine der Oberfläche.
// render() wird von ui/shell.js registriert, damit Ansichten neu zeichnen können ohne zyklische Importe.
import { CONFIG } from '../core/config.js';
import { S } from '../core/state.js';

let renderer = () => {};
export const setRenderer = fn => { renderer = fn; };
export const render = () => renderer();

/** Element erzeugen: h('div', {class, onclick, …}, ...kinder). false/null-Kinder werden ignoriert. */
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}
export const $ = sel => document.querySelector(sel);

export function toast(msg, kind = '') {
  const t = h('div', { class: `toast ${kind}` }, msg);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), kind === 'error' ? 6000 : 3000);
}

/** Auswahl-Dialog; liefert das gewählte Element oder null. */
export function choose(title, options, label) {
  return new Promise(resolve => {
    const close = v => { m.remove(); resolve(v); };
    const m = h('div', { class: 'modal' }, h('div', { class: 'sheet' },
      h('h3', {}, title),
      ...options.map(o => h('button', { class: 'btn block', onclick: () => close(o) }, label(o))),
      h('button', { class: 'btn ghost block', onclick: () => close(null) }, 'Keiner davon')));
    document.body.append(m);
  });
}

/** Zeigt ein Ladefenster, solange fn läuft; Fehler erscheinen als Hinweis. */
export async function withBusy(msg, fn) {
  S.busy = msg; render();
  try { return await fn(); } catch (e) { console.error(e); toast(e.message || String(e), 'error'); } finally { S.busy = ''; render(); }
}

/** Fortschritt (z. B. Sprachmodell) im Ladefenster bzw. unter dem Textfeld anzeigen. */
export function speechStatus(msg) {
  if (S.busy) { S.busy = msg; const el = $('.busy-msg'); if (el) el.textContent = msg; }
  else { const el = $('#interim'); if (el) el.textContent = msg; }
}

/** Knöpfe 1–5 für das Niveau im Altersvergleich. */
export function levelPicker(value, onpick) {
  return h('div', { class: 'levels' },
    h('span', { class: 'levels-label' }, 'Niveau', h('small', {}, value ? CONFIG.levels[value] : 'im Altersvergleich')),
    h('div', { class: 'level-btns' }, ...[1, 2, 3, 4, 5].map(n => h('button', {
      class: `lvl l${n} ${Number(value) === n ? 'on' : ''} ${value ? '' : 'missing'}`, title: CONFIG.levels[n],
      onclick: () => onpick(n),
    }, String(n)))));
}

/** Auswahlfeld; options als Werte oder [Wert, Beschriftung]. Pflichtfelder werden leer orange markiert. */
export function select(value, options, onchange, placeholder, optional = false) {
  return h('select', { class: value || optional ? '' : 'missing', onchange: e => onchange(e.target.value) },
    h('option', { value: '' }, placeholder),
    ...options.map(o => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return h('option', { value: v, selected: v === value }, l);
    }));
}

/** Kurze Bestätigung mit Leo nach dem Speichern. */
export function showSaved(n) {
  const m = h('div', { class: 'modal saved', onclick: () => m.remove() }, h('div', { class: 'sheet center' },
    h('img', { src: 'assets/leo-head.webp', alt: '', class: 'leo-head' }),
    h('h3', {}, `${n} ${n === 1 ? 'Eintrag' : 'Einträge'} gespeichert`),
    h('p', {}, 'Stark! Weiter so, Coach.')));
  document.body.append(m);
  setTimeout(() => m.remove(), 1800);
}
