// pageSampler.js — the Slug Sampler: load audio, video or the mic, set start
// and end on the waveform, play 16 pads, and lazy-chop a pad into a CHOP BANK.

import { h, win, button, tap, knob } from './widgets.js';
import { PADS_PER_PAGE, PLAY_MODES, PITCH_MODES, WARP_MODES, assignSample, padRegion, playbackPlan, timeRatio } from '../core/sampler.js';
import { equalChops, markersToChops, detectTransients } from '../core/chops.js';
import { peaks } from '../storage/media.js';

export const PAD_KEYS = ['1', '2', '3', '4', 'q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 'z', 'x', 'c', 'v'];

export function samplerPage(app) {
  let sel = 0; // selected pad
  let page = 0;
  let bankOpen = false; // showing the chops of the selected pad
  let selChop = null;
  let buffer = null; // AudioBuffer of the selected pad
  let preview = null; // { t0, offset, rate } for the playhead
  let recorder = null;
  const pads = () => app.pads;
  const pad = () => pads()[sel];

  // ---- Source window
  const canvas = h('canvas');
  const empty = h('div.empty', { text: 'Tap LOAD to bring in audio or a video (its sound is pulled out), or REC the mic.' });
  const wave = h('div.wave', {}, canvas, empty);
  const fileIn = h('input.sr', { type: 'file', accept: 'audio/*,video/*,.wav,.aif,.aiff,.mp3,.m4a,.mp4,.mov,.webm' });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0];
    fileIn.value = '';
    if (!f) return;
    info.textContent = `Loading ${f.name}…`;
    try {
      const res = await app.loadSampleFile(f, (p) => { info.textContent = `Extracting audio… ${Math.round(p * 100)}%`; });
      setPad(assignSample(pad(), res));
      buffer = res.buffer;
      info.textContent = `${f.name} · ${res.duration.toFixed(2)} s · saved privately`;
    } catch (e) { info.textContent = `Could not load: ${e.message}`; }
    draw(); update();
  });
  const meter = h('div.meter', {}, h('i'));
  const recBtn = button('● REC MIC', async () => {
    if (recorder) {
      const res = await app.stopMic(recorder);
      recorder = null;
      recBtn.textContent = '● REC MIC';
      recBtn.classList.remove('hot');
      if (res) { setPad(assignSample(pad(), res)); buffer = res.buffer; info.textContent = `Mic take · ${res.duration.toFixed(2)} s`; }
      draw(); update();
      return;
    }
    try {
      recorder = await app.startMic();
      recBtn.textContent = '■ STOP';
      recBtn.classList.add('hot');
      const tick = () => { if (!recorder) { meter.firstChild.style.width = '0'; return; } meter.firstChild.style.width = `${Math.min(100, recorder.level * 140)}%`; requestAnimationFrame(tick); };
      tick();
    } catch (e) { info.textContent = 'Microphone not available (allow it in your browser settings).'; recorder = null; }
  });
  const info = h('p.help');
  const sourceWin = win('Source', [
    wave,
    h('div.row', { style: 'margin-top:6px' }, button('LOAD', () => fileIn.click()), recBtn, meter, button('▶', () => playSelected(true), 'sm')),
    info, fileIn,
  ], { cls: 'span' });

  // ---- Pad settings
  const modeBtn = button('', () => setPad({ ...pad(), mode: PLAY_MODES[(PLAY_MODES.indexOf(pad().mode) + 1) % PLAY_MODES.length] }), 'sm');
  const revBtn = button('REVERSE', () => setPad({ ...pad(), reverse: !pad().reverse }), 'sm');
  const bankBtn = button('CHOP BANK', () => toggleBank(), 'sm');
  const clearBtn = button('CLEAR PAD', () => { setPad({ ...assignSample(pad(), { sampleId: null, name: '', duration: 0 }) }); buffer = null; bankOpen = false; draw(); update(); }, 'sm');
  const knobDefs = [
    ['ATTACK', 'attack', (v) => v * 0.5, (x) => x / 0.5],
    ['RELEASE', 'release', (v) => 0.01 + v * 1.5, (x) => (x - 0.01) / 1.5],
    ['TONE', 'tone', (v) => v, (x) => x],
    ['PITCH', 'pitch', (v) => Math.round(v * 24 - 12), (x) => (x + 12) / 24],
    // STRETCH: 0.5x (half as long, faster) .. 1x .. 2x (twice as long, slower).
    ['STRETCH', 'stretch', (v) => +Math.pow(2, v * 2 - 1).toFixed(3), (x) => (Math.log2(x || 1) + 1) / 2],
    ['GAIN', 'gain', (v) => v * 1.2, (x) => x / 1.2],
  ];
  const knobLabel = (label, key) => {
    const p = pad();
    if (key === 'pitch') return `${label} ${p.pitch > 0 ? '+' : ''}${p.pitch}`;
    if (key === 'stretch') return p.warpToBpm ? 'STR SYNC' : `STR ${(p.stretch || 1).toFixed(2)}x`;
    return label;
  };
  const knobs = knobDefs.map(([label, key, to, from]) => knob({
    label: () => knobLabel(label, key),
    get: () => Math.max(0, Math.min(1, from(pad()[key]))),
    set: (v) => { setPad({ ...pad(), [key]: to(v) }, true); },
  }));
  // Pitch and stretch algorithms
  const cycle = (list, v) => list[(list.indexOf(v) + 1) % list.length];
  const pitchBtn = button('', () => setPad({ ...pad(), pitchMode: cycle(PITCH_MODES, pad().pitchMode) }), 'sm');
  const warpBtn = button('', () => setPad({ ...pad(), warp: cycle(WARP_MODES, pad().warp) }), 'sm');
  const syncBtn = button('WARP→BPM', () => setPad({ ...pad(), warpToBpm: !pad().warpToBpm }), 'sm');
  const bpmLab = h('span.lab');
  const bpmSet = (f) => { const p = pad(); setPad({ ...p, srcBpm: Math.max(40, Math.min(240, Math.round(f(p.srcBpm || 90)))) }); };
  const algoInfo = h('p.help');
  const padWin = win('Pad', [
    h('div.row', {}, modeBtn, revBtn, bankBtn, clearBtn),
    h('div.row', { style: 'margin-top:6px' }, h('span.lab', { text: 'PITCH' }), pitchBtn, h('span.lab', { text: 'WARP' }), warpBtn),
    h('div.row', { style: 'margin-top:4px' }, syncBtn, h('span.lab', { text: 'SOURCE' }), button('½', () => bpmSet((b) => b / 2), 'sm'), button('−', () => bpmSet((b) => b - 1), 'sm'), bpmLab, button('+', () => bpmSet((b) => b + 1), 'sm'), button('×2', () => bpmSet((b) => b * 2), 'sm')),
    h('div.mini-knobs', { style: 'margin-top:6px' }, knobs.map((k) => k.el)),
    algoInfo,
  ]);

  // ---- Chop tools
  const chopRow = h('div.row', {},
    button('TAP', () => tapChop(), 'hot'),
    button('÷4', () => chopEqual(4), 'sm'), button('÷8', () => chopEqual(8), 'sm'), button('÷16', () => chopEqual(16), 'sm'),
    button('HITS', () => chopHits(), 'sm'), button('CLEAR', () => setChops([]), 'sm'), h('span.grow'), button('◂ PADS', () => toggleBank(), 'sm'));
  const chopHelp = h('p.help', { text: 'Press ▶ or a chop, then TAP in time to drop chops. Or tap the waveform, split evenly, or find the HITS. The original audio is never changed.' });

  // ---- Pads grid
  const grid = h('div.pads16');
  const padEls = Array.from({ length: PADS_PER_PAGE }, (_, i) => {
    const e = h('div.pad', {}, h('span.pk', { text: PAD_KEYS[i].toUpperCase() }), h('span.pl'));
    e.addEventListener('pointerdown', (ev) => { ev.preventDefault(); e.setPointerCapture?.(ev.pointerId); padDown(i); });
    const up = () => padUp(i);
    e.addEventListener('pointerup', up);
    e.addEventListener('pointercancel', up);
    grid.append(e);
    return e;
  });
  const gridTitle = h('span.lab');
  const pageBtn = button('PAGE A', () => app.toast('Page B (32 pads) coming next'), 'sm');
  const padsWin = win('Pads', [h('div.row', {}, gridTitle, h('span.grow'), pageBtn), h('div', { style: 'margin-top:6px' }, chopRow, chopHelp), h('div', { style: 'margin-top:6px' }, grid)], { cls: 'span' });

  const el = h('div.page.cols', {}, sourceWin, padsWin, padWin);

  // ---- behaviour
  let renderTimer = null;
  function setPad(p, quiet = false) {
    app.pads[sel] = p;
    app.savePads();
    if (!quiet) update(); else { knobs.forEach((k) => k.update()); updateAlgo(); }
    // Pre-render stretched sound shortly after you stop turning, so the next press is instant.
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => { if (buffer) app.prerenderPad(buffer, pad()); }, 350);
  }
  function updateAlgo() {
    const p = pad();
    const T = timeRatio(p, app.session.state.tempo);
    const plan = playbackPlan(p, app.session.state.tempo);
    const what = {
      none: p.warp === 'REPITCH' ? 'tape-style: speed and pitch move together' : 'untouched',
      smooth: 'smooth stretch (melodic)',
      beats: 'beats stretch (drums)',
    }[plan.algo];
    algoInfo.textContent = p.sampleId ? `Length ×${T.toFixed(2)} · ${what}${p.warpToBpm ? ` · ${p.srcBpm} → ${app.session.state.tempo} BPM` : ''}` : '';
  }
  function setChops(markersOrChops, isChops = false) {
    const p = pad();
    if (!p.sampleId) return;
    const chops = isChops ? markersOrChops : markersToChops(markersOrChops, p.start, p.end);
    setPad({ ...p, bank: { chops } });
    draw();
  }
  const markers = () => (pad().bank ? pad().bank.chops.slice(1).map((c) => c.start) : []);

  function toggleBank() {
    const p = pad();
    if (!p.sampleId) { app.toast('Load a sample first'); return; }
    if (!p.bank) setPad({ ...p, bank: { chops: [{ start: p.start, end: p.end }] } });
    bankOpen = !bankOpen;
    selChop = null;
    draw(); update();
  }
  function chopEqual(n) { const p = pad(); setChops(equalChops(p.start, p.end, n), true); update(); }
  function chopHits() {
    if (!buffer) return;
    const p = pad();
    const ms = detectTransients(buffer.getChannelData(0), buffer.sampleRate, p.start, p.end, { max: 16 });
    setChops(ms);
    app.toast(`${ms.length + 1} CHOPS`);
    update();
  }
  function tapChop() {
    if (!preview) { playSelected(true); return; }
    const t = playheadTime();
    if (t == null) return;
    setChops([...markers(), t]);
    update();
  }

  async function ensureBuffer() {
    const p = pad();
    if (!p.sampleId) { buffer = null; return null; }
    if (!buffer || buffer._id !== p.sampleId) { buffer = await app.bufferFor(p.sampleId); if (buffer) buffer._id = p.sampleId; }
    return buffer;
  }

  async function playSelected(whole = false) {
    const b = await ensureBuffer();
    if (!b) return;
    const p = pad();
    const chop = !whole && bankOpen ? selChop : null;
    const r = padRegion(p, chop);
    const plan = app.playPad(b, p, chop, 'preview', { gate: false, loop: false });
    preview = { t0: app.now(), start: r.start, end: r.end, rate: plan ? plan.rate / plan.factor : 1, reverse: p.reverse };
    animate();
  }

  async function padDown(i) {
    if (bankOpen) {
      selChop = i;
      const p = pad();
      if (!p.bank || !p.bank.chops[i]) { update(); return; }
      const b = await ensureBuffer();
      const r = padRegion(p, i);
      const plan = app.playPad(b, p, i, `chop${i}`);
      preview = { t0: app.now(), start: r.start, end: r.end, rate: plan ? plan.rate / plan.factor : 1, reverse: p.reverse };
      padEls[i].classList.add('down');
      animate(); update();
      return;
    }
    const changed = sel !== i;
    sel = page * PADS_PER_PAGE + i;
    if (changed) { buffer = null; await ensureBuffer(); draw(); update(); }
    padEls[i].classList.add('down');
    const p = pad();
    if (!p.sampleId) return;
    const b = await ensureBuffer();
    const r = padRegion(p);
    const plan = app.playPad(b, p, null, `pad${sel}`);
    preview = { t0: app.now(), start: r.start, end: r.end, rate: plan ? plan.rate / plan.factor : 1, reverse: p.reverse };
    animate();
  }
  function padUp(i) {
    padEls[i].classList.remove('down');
    const p = pad();
    if (p.mode === 'GATE') app.stopRegion(bankOpen ? `chop${i}` : `pad${sel}`);
  }

  // Waveform drawing and editing
  function playheadTime() {
    if (!preview) return null;
    const el2 = (app.now() - preview.t0) * preview.rate;
    const len = preview.end - preview.start;
    if (el2 > len && pad().mode !== 'LOOP') return null;
    const pos = el2 % len;
    return preview.reverse ? preview.end - pos : preview.start + pos;
  }
  let raf = 0;
  function animate() {
    cancelAnimationFrame(raf);
    const step = () => { draw(); if (playheadTime() != null) raf = requestAnimationFrame(step); else { preview = null; draw(); } };
    raf = requestAnimationFrame(step);
  }
  function draw() {
    const W = Math.max(64, Math.floor(wave.clientWidth / 2));
    const H = 46;
    canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d');
    g.fillStyle = '#2b1d14'; g.fillRect(0, 0, W, H);
    const p = pad();
    empty.style.display = p.sampleId && buffer ? 'none' : '';
    if (!p.sampleId || !buffer) return;
    const dur = buffer.duration;
    const x = (t) => Math.round((t / dur) * W);
    g.fillStyle = 'rgba(244,233,204,.12)';
    g.fillRect(x(p.start), 0, x(p.end) - x(p.start), H);
    const pk = peaks(buffer, W);
    for (let i = 0; i < W; i++) {
      const inside = i >= x(p.start) && i <= x(p.end);
      g.fillStyle = inside ? '#b6e35a' : '#5f7a3a';
      const y1 = Math.round((1 - pk[i * 2 + 1]) * H / 2), y2 = Math.round((1 - pk[i * 2]) * H / 2);
      g.fillRect(i, y1, 1, Math.max(1, y2 - y1));
    }
    // start / end handles
    g.fillStyle = '#d9823b';
    g.fillRect(x(p.start), 0, 2, H); g.fillRect(x(p.start), 0, 5, 4);
    g.fillRect(x(p.end) - 2, 0, 2, H); g.fillRect(x(p.end) - 5, H - 4, 5, 4);
    if (p.bank) {
      g.fillStyle = '#9ad8ea';
      p.bank.chops.forEach((c, i) => { if (i) g.fillRect(x(c.start), 0, 1, H); });
      if (bankOpen && selChop != null && p.bank.chops[selChop]) { const c = p.bank.chops[selChop]; g.fillStyle = 'rgba(154,216,234,.25)'; g.fillRect(x(c.start), 0, x(c.end) - x(c.start), H); }
    }
    const ph = playheadTime();
    if (ph != null) { g.fillStyle = '#fffaf0'; g.fillRect(x(ph), 0, 1, H); }
  }

  // Drag start/end handles (or chop markers in the bank view); tap the wave in the bank view to add a chop.
  let drag = null;
  wave.addEventListener('pointerdown', (ev) => {
    const p = pad();
    if (!p.sampleId || !buffer) { fileIn.click(); return; }
    ev.preventDefault();
    wave.setPointerCapture?.(ev.pointerId);
    const r = wave.getBoundingClientRect();
    const t = ((ev.clientX - r.left) / r.width) * buffer.duration;
    const near = (a) => Math.abs(a - t) < buffer.duration * 0.04;
    if (bankOpen) {
      const ms = markers();
      const mi = ms.findIndex(near);
      drag = mi >= 0 ? { kind: 'marker', i: mi, moved: false } : { kind: 'add', t };
    } else drag = { kind: near(p.start) || Math.abs(t - p.start) < Math.abs(t - p.end) ? 'start' : 'end' };
  });
  wave.addEventListener('pointermove', (ev) => {
    if (!drag || !buffer) return;
    const r = wave.getBoundingClientRect();
    const t = Math.max(0, Math.min(buffer.duration, ((ev.clientX - r.left) / r.width) * buffer.duration));
    const p = pad();
    const rebank = (np) => (p.bank ? { ...np, bank: { chops: markersToChops(markers(), np.start, np.end) } } : np);
    if (drag.kind === 'start') setPad(rebank({ ...p, start: Math.min(t, p.end - 0.01) }), true);
    else if (drag.kind === 'end') setPad(rebank({ ...p, end: Math.max(t, p.start + 0.01) }), true);
    else if (drag.kind === 'marker') { const ms = markers(); ms[drag.i] = t; drag.moved = true; setChops(ms); }
    draw();
  });
  wave.addEventListener('pointerup', () => {
    if (drag?.kind === 'add') { setChops([...markers(), drag.t]); update(); }
    if (drag?.kind === 'marker' && !drag.moved) { const ms = markers(); ms.splice(drag.i, 1); setChops(ms); update(); }
    drag = null;
  });

  function update() {
    const p = pad();
    modeBtn.textContent = p.mode;
    pitchBtn.textContent = p.pitchMode || 'RESAMPLE';
    warpBtn.textContent = p.warp || 'REPITCH';
    syncBtn.classList.toggle('on', !!p.warpToBpm);
    bpmLab.textContent = p.srcBpm ? `${p.srcBpm}` : '—';
    updateAlgo();
    revBtn.classList.toggle('on', p.reverse);
    bankBtn.classList.toggle('on', !!p.bank);
    bankBtn.textContent = p.bank ? (bankOpen ? 'CHOPS OPEN' : `OPEN CHOPS (${p.bank.chops.length})`) : 'CHOP BANK';
    knobs.forEach((k) => k.update());
    chopRow.style.display = chopHelp.style.display = bankOpen ? '' : 'none';
    gridTitle.textContent = bankOpen ? `CHOPS · PAD ${sel + 1}` : 'PADS';
    padEls.forEach((e, i) => {
      if (bankOpen) {
        const c = p.bank?.chops[i];
        e.className = `pad${c ? ' filled' : ''}${selChop === i ? ' sel' : ''}`;
        e.querySelector('.pl').textContent = c ? `${(c.end - c.start).toFixed(2)}s` : '';
      } else {
        const q = pads()[page * PADS_PER_PAGE + i];
        e.className = `pad${q.sampleId ? ' filled' : ''}${q.bank ? ' bank' : ''}${sel === i ? ' sel' : ''}`;
        e.querySelector('.pl').textContent = q.sampleId ? `${q.bank ? '✂ ' : ''}${q.name || 'sample'}` : '';
      }
    });
    if (!info.textContent && p.sampleId) info.textContent = `${p.name} · ${(p.end - p.start).toFixed(2)} s`;
  }

  async function show() { await ensureBuffer(); draw(); update(); }

  return {
    el, update, show,
    keyDown: (k) => { const i = PAD_KEYS.indexOf(k); if (i >= 0) padDown(i); return i >= 0; },
    keyUp: (k) => { const i = PAD_KEYS.indexOf(k); if (i >= 0) padUp(i); return i >= 0; },
  };
}
