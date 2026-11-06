// widgets.js — DOM helpers and the reusable retro widgets: windows, shell
// knobs and the 27-key keybed.

import { KEYS, BEND_INFO, PICK_INFO } from '../core/controls.js';
import { spriteImg } from './sprites.js';

/** h('div.class', {attrs}, ...children) */
export function h(sel, attrs = {}, ...kids) {
  const [tag, ...cls] = sel.split('.');
  const e = document.createElement(tag || 'div');
  if (cls.length) e.className = cls.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'style') e.style.cssText = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}

/** An old-OS window with a striped title bar. */
export function win(title, body, { tools = [], cls = '' } = {}) {
  const t = h('div.win-title', {}, h('span.box'), h('b', { text: title }), ...tools, h('span.box'));
  return h(`div.win${cls ? `.${cls}` : ''}`, {}, t, h('div.win-body', {}, body));
}

/** Press-and-hold behaviour with pointer capture. */
export function hold(el, down, up) {
  el.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    el.setPointerCapture?.(ev.pointerId);
    el.classList.add('down');
    down(ev);
  });
  const end = (ev) => { if (!el.classList.contains('down')) return; el.classList.remove('down'); up && up(ev); };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

export function tap(el, fn) {
  el.addEventListener('pointerdown', (ev) => { ev.preventDefault(); el.classList.add('down'); });
  el.addEventListener('pointerup', (ev) => { if (el.classList.contains('down')) { el.classList.remove('down'); fn(ev); } });
  el.addEventListener('pointercancel', () => el.classList.remove('down'));
  el.addEventListener('pointerleave', () => el.classList.remove('down'));
  return el;
}

export const button = (label, fn, cls = '') => tap(h(`button.bevel${cls ? `.${cls}` : ''}`, { type: 'button' }, label), fn);

/**
 * A shell knob: drag up/down (or sideways), scroll, or arrow keys. A ring of
 * slime dots shows the value, like an old LED ring.
 */
export function knob({ label, get, set, steps = 0, size = 2 }) {
  const dial = h('div.dial');
  dial.append(spriteImg('shell', size));
  const N = 11;
  const dots = [];
  for (let i = 0; i < N; i++) {
    const a = (-135 + (270 * i) / (N - 1)) * (Math.PI / 180);
    const d = h('i.dot');
    d.style.transform = `translate(${Math.sin(a) * 19}px, ${-Math.cos(a) * 19}px)`;
    dial.append(d);
    dots.push(d);
  }
  const kl = h('span.kl');
  const el = h('div.knob', { role: 'slider', tabindex: 0 }, dial, kl);
  let start = null;
  const apply = (v) => set(Math.max(0, Math.min(1, v)));
  el.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    el.setPointerCapture?.(ev.pointerId);
    start = { x: ev.clientX, y: ev.clientY, v: get() };
    el.classList.add('active');
  });
  el.addEventListener('pointermove', (ev) => {
    if (!start) return;
    apply(start.v + (start.y - ev.clientY + (ev.clientX - start.x)) / 150);
  });
  const end = () => { start = null; el.classList.remove('active'); };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', (ev) => { ev.preventDefault(); apply(get() + (ev.deltaY < 0 ? 1 : -1) * (steps ? 1 / steps : 0.03)); }, { passive: false });
  el.addEventListener('keydown', (ev) => {
    const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[ev.key];
    if (!d) return;
    ev.preventDefault(); ev.stopPropagation();
    apply(get() + d * (steps ? 1 / steps : 0.03));
  });
  function update() {
    const v = get();
    const lit = Math.round(v * (N - 1));
    dots.forEach((d, i) => d.classList.toggle('lit', i <= lit));
    kl.textContent = typeof label === 'function' ? label() : label;
    el.setAttribute('aria-valuenow', Math.round(v * 100));
    el.setAttribute('aria-label', kl.textContent);
  }
  update();
  return { el, update };
}

/**
 * The 27-key keybed. Multi-touch with glissando (slide across the strum
 * plate), velocity from how low on the key you strike.
 */
export function keybed(session) {
  const el = h('div.keybed');
  const keyEls = [];
  const makeOct = (sec, from, to) => {
    const oct = h('div.oct', { 'data-sec': sec });
    const whites = h('div.whites');
    oct.append(whites);
    const list = KEYS.slice(from, to);
    const nWhite = list.filter((k) => !k.black).length;
    let w = 0;
    for (const k of list) {
      const e = h(`button.key.${k.black ? 'black' : 'white'}.${k.section}`, { 'data-i': k.index, type: 'button' });
      if (k.black) {
        const bw = 100 / nWhite;
        e.style.width = `${bw * 0.64}%`;
        e.style.left = `calc(${bw * w}% - ${bw * 0.32}%)`;
        if (k.section === 'bend') e.append(h('span.a', { text: BEND_INFO[k.bend].arrow }), h('span.t', { text: BEND_INFO[k.bend].label }));
        else { e.dataset.slot = k.pick; e.append(h('span.t', { text: PICK_INFO[k.pick].label })); }
        oct.append(e);
      } else {
        w++;
        e.append(h('span.r'), h('span.n'));
        whites.append(e);
      }
      keyEls[k.index] = e;
    }
    el.append(oct);
  };
  makeOct('low', 0, 12);
  makeOct('high', 12, 27);

  // Pointer handling
  const fingers = new Map();
  const vel = (k, y) => { const r = k.getBoundingClientRect(); return Math.max(0.35, Math.min(1, 0.45 + 0.6 * ((y - r.top) / r.height))); };
  const down = (id, i, y) => { fingers.set(id, i); session.keyDown(i, vel(keyEls[i], y)); };
  const up = (id) => { const i = fingers.get(id); fingers.delete(id); if (i != null && ![...fingers.values()].includes(i)) session.keyUp(i); };
  el.addEventListener('pointerdown', (ev) => {
    const k = ev.target.closest('.key');
    if (!k) return;
    ev.preventDefault();
    el.setPointerCapture?.(ev.pointerId);
    down(ev.pointerId, Number(k.dataset.i), ev.clientY);
  });
  el.addEventListener('pointermove', (ev) => {
    if (!fingers.has(ev.pointerId)) return;
    const t = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.key');
    if (!t || !el.contains(t)) return;
    const i = Number(t.dataset.i);
    const cur = fingers.get(ev.pointerId);
    if (i === cur || KEYS[i].black !== KEYS[cur].black) return;
    up(ev.pointerId);
    down(ev.pointerId, i, ev.clientY);
  });
  const end = (ev) => { if (fingers.has(ev.pointerId)) up(ev.pointerId); };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', end);
  el.addEventListener('contextmenu', (ev) => ev.preventDefault());

  return { el, keyEls };
}
