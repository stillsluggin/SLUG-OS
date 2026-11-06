// pageFx.js — the XY Effects Pad: one drag plays two effects at once.

import { h, win, button, tap } from './widgets.js';
import { spriteImg } from './sprites.js';
import { XY_EFFECTS, XY_LABELS, XY_HINTS, snapBack } from '../core/xy.js';

export function fxPage(app) {
  const s = app.xy; // { x, y, hold, combos, ax, ay }
  const fx = () => app.audio && app.audio.master.xy;

  // ---- axis pickers
  const pick = (axis, dir) => {
    const list = XY_EFFECTS;
    s[axis] = list[(list.indexOf(s[axis]) + dir + list.length) % list.length];
    if (s[axis] === s[axis === 'x' ? 'y' : 'x']) s[axis] = list[(list.indexOf(s[axis]) + dir + list.length) % list.length];
    apply();
    app.saveXY();
    update();
  };
  const xLab = h('span.axisname');
  const yLab = h('span.axisname');
  const holdBtn = button('HOLD', () => { s.hold = !s.hold; if (!s.hold) release(); update(); app.saveXY(); });
  const pickers = h('div.pickers', {},
    h('div.row', {}, h('span.lab', { text: 'X →' }), button('◂', () => pick('x', -1), 'sm'), xLab, button('▸', () => pick('x', 1), 'sm')),
    h('div.row', {}, h('span.lab', { text: 'Y ↑' }), button('◂', () => pick('y', -1), 'sm'), yLab, button('▸', () => pick('y', 1), 'sm')));

  // ---- the pad
  const canvas = h('canvas');
  const dot = h('div.xydot', {}, spriteImg('dew', 4));
  const xHint = h('span.xyh.xh');
  const yHint = h('span.xyh.yh');
  const pad = h('div.xypad', {}, canvas, dot, xHint, yHint);
  const trail = [];
  let dragging = false;
  let snapAnim = 0;

  function setXY(ax, ay) {
    s.ax = Math.max(0, Math.min(1, ax));
    s.ay = Math.max(0, Math.min(1, ay));
    fx()?.setAmount('x', s.ax);
    fx()?.setAmount('y', s.ay);
    trail.push({ x: s.ax, y: s.ay, t: performance.now() });
    if (trail.length > 40) trail.shift();
    draw();
  }
  const fromEvent = (ev) => { const r = pad.getBoundingClientRect(); return [(ev.clientX - r.left) / r.width, 1 - (ev.clientY - r.top) / r.height]; };
  pad.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    pad.setPointerCapture?.(ev.pointerId);
    cancelAnimationFrame(snapAnim);
    dragging = true;
    pad.classList.add('live');
    setXY(...fromEvent(ev));
  });
  pad.addEventListener('pointermove', (ev) => { if (dragging) setXY(...fromEvent(ev)); });
  const up = () => { if (!dragging) return; dragging = false; pad.classList.remove('live'); if (!s.hold) release(); };
  pad.addEventListener('pointerup', up);
  pad.addEventListener('pointercancel', up);

  /** Glide both axes smoothly back to zero. */
  function release() {
    const fromX = s.ax || 0;
    const fromY = s.ay || 0;
    const t0 = performance.now();
    cancelAnimationFrame(snapAnim);
    const stepAnim = () => {
      const t = (performance.now() - t0) / 1000;
      setXY(snapBack(fromX, t), snapBack(fromY, t));
      if (s.ax > 0 || s.ay > 0) snapAnim = requestAnimationFrame(stepAnim);
    };
    stepAnim();
  }

  function draw() {
    const W = 48, H = 48; // drawn small, scaled up crisp
    canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d');
    g.fillStyle = '#2b1d14'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#3f5a26';
    for (let i = 6; i < W; i += 6) { g.fillRect(i, 0, 1, H); g.fillRect(0, i, W, 1); }
    // slime trail
    const now = performance.now();
    for (const p of trail) {
      const age = (now - p.t) / 700;
      if (age > 1) continue;
      g.fillStyle = `rgba(182,227,90,${0.7 * (1 - age)})`;
      g.fillRect(Math.round(p.x * (W - 2)), Math.round((1 - p.y) * (H - 2)), 2, 2);
    }
    // amount bars along the edges
    g.fillStyle = '#d9823b';
    g.fillRect(0, H - 2, Math.round((s.ax || 0) * W), 2);
    g.fillRect(0, H - Math.round((s.ay || 0) * H), 2, Math.round((s.ay || 0) * H));
    dot.style.left = `${(s.ax || 0) * 100}%`;
    dot.style.top = `${(1 - (s.ay || 0)) * 100}%`;
    dot.style.opacity = (s.ax || 0) + (s.ay || 0) > 0.01 || dragging ? 1 : 0.35;
  }

  // ---- combos
  const comboRow = h('div.combos');
  function renderCombos() {
    comboRow.innerHTML = '';
    s.combos.forEach((c, i) => {
      const b = h('button.bevel.combo', { type: 'button' }, h('b', { text: c.name }), h('small', { text: `${XY_LABELS[c.x]} + ${XY_LABELS[c.y]}` }));
      b.classList.toggle('on', c.x === s.x && c.y === s.y);
      // Tap: load this pairing. Hold 0.6 s: save the current pairing here.
      let timer = null;
      let saved = false;
      b.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        saved = false;
        b.classList.add('down');
        timer = setTimeout(() => { saved = true; s.combos[i] = { name: c.name, x: s.x, y: s.y }; app.saveXY(); app.toast(`SAVED · ${c.name}`); renderCombos(); }, 600);
      });
      const end = () => {
        clearTimeout(timer);
        b.classList.remove('down');
        if (!saved && timer) { s.x = c.x; s.y = c.y; apply(); app.saveXY(); update(); app.toast(`${c.name} · ${XY_LABELS[c.x]} + ${XY_LABELS[c.y]}`); }
        timer = null;
      };
      b.addEventListener('pointerup', end);
      b.addEventListener('pointerleave', () => { clearTimeout(timer); timer = null; b.classList.remove('down'); });
      comboRow.append(b);
    });
  }

  const el = h('div.page', {},
    win('XY Effects', [pickers, h('div.xywrap', { style: 'margin-top:6px' }, pad), h('div.row', { style: 'margin-top:6px' }, holdBtn, h('span.grow'), h('span.help', { text: 'Drag to play both effects. Let go: they glide back.' }))]),
    win('Combos', [comboRow, h('p.help', { text: 'Tap a combo to load it. Hold one to save the current X + Y pairing in its place.' })]),
  );

  function apply() {
    fx()?.setEffect('x', s.x);
    fx()?.setEffect('y', s.y);
    fx()?.setAmount('x', s.ax || 0);
    fx()?.setAmount('y', s.ay || 0);
  }

  function update() {
    xLab.textContent = XY_LABELS[s.x];
    yLab.textContent = XY_LABELS[s.y];
    xHint.textContent = `${XY_LABELS[s.x]} → ${XY_HINTS[s.x]}`;
    yHint.textContent = `${XY_LABELS[s.y]} ↑ ${XY_HINTS[s.y]}`;
    holdBtn.classList.toggle('on', s.hold);
    renderCombos();
    draw();
  }

  return { el, update, apply };
}
