// pageFx.js — SHELL SHOCK: the XY effects pad. One drag plays two effects.
// Tap X or Y to load any effect from the list; Slug OS names every pairing.

import { h, win, button, tap, knob } from './widgets.js';
import { spriteImg } from './sprites.js';
import { SHELL_EFFECTS, XY_LABELS, XY_HINTS, XY_TARGETS, comboName, snapBack, defaultParams, paramsOf, stepOf, LFO_RATE_NAMES, DELAY_TIME_NAMES, LOFI_ERAS } from '../core/xy.js';

export function fxPage(app) {
  const s = app.xy; // { x, y, hold, combos, ax, ay, roll }
  s.roll = s.roll || 0;
  const fx = () => app.audio && app.audio.master.xy;

  // ---- effect loaders (one tap to open, one tap to choose)
  const loadX = h('button.bevel.loader', { type: 'button' });
  const loadY = h('button.bevel.loader', { type: 'button' });
  tap(loadX, () => openLoader('x'));
  tap(loadY, () => openLoader('y'));

  const list = h('div.fxlist');
  const loaderTitle = h('b');
  const loader = h('div.loader-wrap', {},
    h('div.win.loader-win', {},
      h('div.win-title', {}, h('span.box'), loaderTitle, button('✕', () => closeLoader(), 'sm')),
      h('div.win-body', {}, list)));
  loader.addEventListener('pointerdown', (ev) => { if (ev.target === loader) closeLoader(); });
  let loaderAxis = null;
  function openLoader(axis) {
    loaderAxis = axis;
    loaderTitle.textContent = `LOAD ${axis.toUpperCase()} ${axis === 'x' ? '→' : '↑'}`;
    list.innerHTML = '';
    for (const e of SHELL_EFFECTS) {
      const row = h('button.fxrow', { type: 'button' }, h('span.fxn', { text: e.label }), h('span.fxh', { text: e.hint }));
      if (s[axis] === e.id) row.classList.add('on');
      tap(row, () => choose(e.id));
      list.append(row);
    }
    loader.classList.add('open');
    list.querySelector('.on')?.scrollIntoView({ block: 'center' });
  }
  function closeLoader() { loader.classList.remove('open'); loaderAxis = null; }
  function choose(id) {
    s[loaderAxis] = id;
    s.roll = 0;
    closeLoader();
    apply();
    app.saveXY();
    update();
  }

  // ---- the generated name + SAVE
  const nameEl = h('span.comboname');
  const diceBtn = button('🎲', () => { s.roll++; update(); }, 'sm');
  diceBtn.title = 'Another name';
  const saveBtn = button('SAVE', () => {
    s.combos.push({ name: currentName(), x: s.x, y: s.y, px: { ...paramsFor(s.x) }, py: { ...paramsFor(s.y) } });
    app.saveXY();
    app.toast(`SAVED · ${currentName()}`);
    update();
  }, 'hot');
  const currentName = () => comboName(s.x, s.y, s.roll);

  // ---- the pad
  const canvas = h('canvas');
  const cursor = h('div.xydot', {}, spriteImg('shell', 2));
  const xHint = h('span.xyh.xh');
  const yHint = h('span.xyh.yh');
  const pad = h('div.xypad', {}, canvas, cursor, xHint, yHint);
  const trail = [];
  let dragging = false;
  let snapAnim = 0;

  function setXY(ax, ay) {
    s.ax = Math.max(0, Math.min(1, ax));
    s.ay = Math.max(0, Math.min(1, ay));
    fx()?.setAmount('x', s.ax);
    fx()?.setAmount('y', s.ay);
    trail.push({ x: s.ax, y: s.ay, t: performance.now() });
    if (trail.length > 60) trail.shift();
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

  /** Glide both axes smoothly back to zero (the shell crawls home). */
  function release() {
    const fromX = s.ax || 0;
    const fromY = s.ay || 0;
    const t0 = performance.now();
    cancelAnimationFrame(snapAnim);
    const stepAnim = () => {
      const t = (performance.now() - t0) / 1000;
      setXY(snapBack(fromX, t), snapBack(fromY, t));
      if (s.ax > 0 || s.ay > 0) snapAnim = requestAnimationFrame(stepAnim);
      else fadeTrail();
    };
    stepAnim();
  }
  // Keep redrawing for a moment so the slime trail dries up.
  function fadeTrail() {
    const end = performance.now() + 800;
    const f = () => { draw(); if (performance.now() < end && !dragging) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }

  function draw() {
    const W = 48, H = 48; // drawn small, scaled up crisp
    canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d');
    g.fillStyle = '#2b1d14'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#3f5a26';
    for (let i = 6; i < W; i += 6) { g.fillRect(i, 0, 1, H); g.fillRect(0, i, W, 1); }
    const now = performance.now();
    for (const p of trail) {
      const age = (now - p.t) / 800;
      if (age > 1) continue;
      g.fillStyle = `rgba(182,227,90,${0.8 * (1 - age)})`;
      g.fillRect(Math.round(p.x * (W - 2)), Math.round((1 - p.y) * (H - 2)), 2, 2);
    }
    g.fillStyle = '#d9823b';
    g.fillRect(0, H - 2, Math.round((s.ax || 0) * W), 2);
    g.fillRect(0, H - Math.round((s.ay || 0) * H), 2, Math.round((s.ay || 0) * H));
    cursor.style.left = `${(s.ax || 0) * 100}%`;
    cursor.style.top = `${(1 - (s.ay || 0)) * 100}%`;
    cursor.classList.toggle('rest', (s.ax || 0) + (s.ay || 0) <= 0.01 && !dragging);
  }

  // ---- saved combos (as many as you like)
  const comboGrid = h('div.combos');
  let editing = false;
  const editBtn = button('EDIT', () => { editing = !editing; renderCombos(); }, 'sm');
  function renderCombos() {
    editBtn.classList.toggle('on', editing);
    editBtn.textContent = editing ? 'DONE' : 'EDIT';
    comboGrid.innerHTML = '';
    if (!s.combos.length) comboGrid.append(h('p.help', { text: 'No combos yet. Build a pairing and tap SAVE.' }));
    s.combos.forEach((c, i) => {
      const b = h('button.bevel.combo', { type: 'button' }, h('b', { text: c.name }), h('small', { text: `${XY_LABELS[c.x] || c.x} + ${XY_LABELS[c.y] || c.y}` }));
      b.classList.toggle('on', c.x === s.x && c.y === s.y);
      if (!editing) {
        tap(b, () => {
          s.x = c.x; s.y = c.y; s.roll = 0;
          // A combo brings back its hidden-knob settings too.
          if (c.px) s.params[c.x] = { ...c.px };
          if (c.py) s.params[c.y] = { ...c.py };
          apply(); app.saveXY(); update(); app.toast(c.name);
        });
        comboGrid.append(b);
        return;
      }
      const rename = button('✎', () => {
        const name = window.prompt('Name this combo', c.name);
        if (name && name.trim()) { c.name = name.trim().slice(0, 40); app.saveXY(); renderCombos(); }
      }, 'sm');
      const del = button('✕', () => { s.combos.splice(i, 1); app.saveXY(); renderCombos(); }, 'sm');
      comboGrid.append(h('div.comboedit', {}, b, rename, del));
    });
  }

  const holdBtn = button('HOLD', () => { s.hold = !s.hold; if (!s.hold) release(); update(); app.saveXY(); });

  // ---- TWEAK: each effect's hidden knobs, and what the pad affects (out of the way until you want it)
  s.params = s.params || {};
  s.target = s.target || 'ALL';
  const paramsFor = (id) => (s.params[id] = { ...defaultParams(id), ...(s.params[id] || {}) });
  const tweakBtn = button('⚙ TWEAK', () => { tweakOpen = !tweakOpen; update(); });
  let tweakOpen = false;
  const tweakRows = { x: h('div.tweakrow'), y: h('div.tweakrow') };
  const targetBtns = XY_TARGETS.map((t) => button(t, () => { s.target = t; app.audio?.setXYTarget(t); app.saveXY(); update(); }, 'sm'));
  const drawer = h('div.drawer', {},
    h('div.row', {}, h('span.lab', { text: 'AFFECTS' }), h('span.seg', {}, targetBtns)),
    tweakRows.x, tweakRows.y);
  const stepName = (id, pid, v) => {
    if (id === 'lfofilter' && pid === 'rate') return LFO_RATE_NAMES[stepOf(v, LFO_RATE_NAMES.length)];
    if (id === 'lfofilter' && pid === 'shape') return ['SINE', 'TRI', 'SQUARE', 'SAW'][stepOf(v, 4)];
    if (id === 'delay' && pid === 'time') return DELAY_TIME_NAMES[stepOf(v, DELAY_TIME_NAMES.length)];
    if (id === 'lofi' && pid === 'era') return LOFI_ERAS[stepOf(v, LOFI_ERAS.length)];
    if (id === 'wash' && pid === 'size') return ['ROOM', 'HALL', 'CAVE', 'CANYON'][stepOf(v, 4)];
    if (id === 'stutter' && pid === 'grid') return ['SLOW', 'MID', 'FAST'][stepOf(v, 3)];
    if (id === 'reverse' && pid === 'length') return ['1/2', '1 BEAT', '2 BEATS', '1 BAR'][stepOf(v, 4)];
    if (id === 'gate' && pid === 'pattern') return `PAT ${stepOf(v, 6) + 1}`;
    return null;
  };
  function renderTweak() {
    for (const axis of ['x', 'y']) {
      const id = s[axis];
      const row = tweakRows[axis];
      row.innerHTML = '';
      row.append(h('span.tweakname', { text: `${axis.toUpperCase()} ${XY_LABELS[id]}` }));
      const knobs = h('div.tweakknobs');
      for (const prm of paramsOf(id)) {
        const k = knob({
          label: () => stepName(id, prm.id, paramsFor(id)[prm.id]) || prm.label,
          get: () => paramsFor(id)[prm.id],
          set: (v) => {
            paramsFor(id)[prm.id] = v;
            fx()?.setParams(axis, paramsFor(id));
            if (s.x === s.y) fx()?.setParams(axis === 'x' ? 'y' : 'x', paramsFor(id));
            k.update();
            saveSoonXY();
          },
          steps: prm.steps || 0,
        });
        knobs.append(k.el);
      }
      row.append(knobs);
    }
  }
  let xyTimer = null;
  const saveSoonXY = () => { clearTimeout(xyTimer); xyTimer = setTimeout(() => app.saveXY(), 300); };
  const el = h('div.page', {},
    win('Shell Shock', [
      h('div.loaders', {}, loadX, loadY),
      h('div.row.namerow', {}, nameEl, diceBtn, saveBtn),
      h('div.xywrap', {}, pad),
      h('div.row', { style: 'margin-top:6px' }, holdBtn, tweakBtn, h('span.grow'), h('span.help.padhelp', { text: 'Drag: both effects. Let go: they glide back.' })),
      drawer,
    ]),
    win('Combos', [h('div.row', {}, h('span.lab', { text: 'SAVED' }), h('span.grow'), editBtn), h('div', { style: 'margin-top:6px' }, comboGrid)]),
    loader,
  );

  function apply() {
    fx()?.setEffect('x', s.x, paramsFor(s.x));
    fx()?.setEffect('y', s.y, paramsFor(s.y));
    app.audio?.setXYTarget(s.target || 'ALL');
    fx()?.setAmount('x', s.ax || 0);
    fx()?.setAmount('y', s.ay || 0);
  }

  function update() {
    loadX.innerHTML = '';
    loadX.append(h('small', { text: 'X →' }), h('span', { text: XY_LABELS[s.x] || s.x }), h('i', { text: '▾' }));
    loadY.innerHTML = '';
    loadY.append(h('small', { text: 'Y ↑' }), h('span', { text: XY_LABELS[s.y] || s.y }), h('i', { text: '▾' }));
    nameEl.textContent = `“${currentName()}”`;
    xHint.textContent = `${XY_LABELS[s.x]} → ${XY_HINTS[s.x]}`;
    yHint.textContent = `${XY_LABELS[s.y]} ↑ ${XY_HINTS[s.y]}`;
    holdBtn.classList.toggle('on', s.hold);
    tweakBtn.classList.toggle('on', tweakOpen);
    drawer.style.display = tweakOpen ? '' : 'none';
    targetBtns.forEach((b, i) => b.classList.toggle('on', s.target === XY_TARGETS[i]));
    if (tweakOpen) renderTweak();
    renderCombos();
    draw();
  }

  return { el, update, apply, currentName };
}
