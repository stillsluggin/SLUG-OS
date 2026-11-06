// app.js — boots Slug OS and wires the music brain (src/core), Web Audio
// (src/audio), private storage (src/storage) and the pages together.

import { createSession } from '../core/session.js';
import { KEYS, BASE_MIDI, KEY_COUNT } from '../core/controls.js';
import { plateNotes } from '../core/players.js';
import { LANE_LABELS, LANES } from '../core/drums.js';
import { createPads, padRegion, playbackPlan } from '../core/sampler.js';
import { diatonicChord } from '../core/chord.js';
import { noteName } from '../core/theory.js';
import { startAudio, resumeAudio, getContext } from '../audio/context.js';
import { createOutput } from '../audio/output.js';
import { db } from '../storage/db.js';
import { createLibrary } from '../storage/library.js';
import { decode, decodeFile, createMicRecorder, encodeWav } from '../storage/media.js';
import { h, keybed, tap, button } from './widgets.js';
import { spriteImg } from './sprites.js';
import { bandPage } from './pageBand.js';
import { seqPage } from './pageSeq.js';
import { drumsPage } from './pageDrums.js';
import { samplerPage } from './pageSampler.js';
import { fxPage } from './pageFx.js';
import { DEFAULT_COMBOS } from '../core/xy.js';

// ---------------------------------------------------------------- session
// The session exists before audio starts (so the screens can draw). Its `out`
// forwards to Web Audio once the user taps to start.
let real = null;
const out = new Proxy({}, { get: (_, k) => (...a) => (real ? real[k](...a) : k === 'now' ? 0 : undefined) });
const session = createSession(out);
const st = session.state;

const app = {
  session, out, audio: null, library: null,
  pads: createPads(),
  kitId: 'builtin',
  xy: { x: 'filter', y: 'delay', hold: false, ax: 0, ay: 0, combos: DEFAULT_COMBOS.map((c) => ({ ...c })) },
  toast,
  now: () => getContext()?.currentTime ?? 0,
};

// ---------------------------------------------------------------- layout
const root = document.getElementById('app');
const toastEl = h('div.toast');
document.body.append(toastEl);
let toastTimer;
function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1200);
}

const trailFill = h('i');
const recPill = h('span.pill.recpill', { title: 'Tap to switch OVERDUB / REPLACE' });
tap(recPill, () => session.toggleRecMode());
const trailSnail = spriteImg('slug', 2);
const keyPill = h('span.pill');
const bpmPill = h('span.pill');
const playBtn = h('button.bevel.playbtn', { type: 'button' });
const clickBtn = h('button.bevel.sm.clickbtn', { type: 'button', 'aria-label': 'Metronome', title: 'Metronome (;)' }, '♩');
tap(clickBtn, () => session.toggleMetronome());
tap(playBtn, () => { session.buttonDown('play'); session.buttonUp('play'); });
tap(keyPill, () => { session.buttonDown('key'); session.buttonUp('key'); });
tap(bpmPill, () => setPage('drums'));
const menubar = h('div.menubar', {},
  h('span.logo', {}, spriteImg('snail', 1), 'SLUG OS'), keyPill, bpmPill,
  h('span.trail', {}, trailFill, trailSnail), recPill, clickBtn, playBtn);

const pages = { band: bandPage(app), seq: seqPage(app), drums: drumsPage(app), sampler: samplerPage(app), fx: fxPage(app) };
const pagesEl = h('div.pages', {}, ...Object.values(pages).map((p) => p.el));
const kb = keybed(session);
const keyzone = h('div.keyzone', {}, kb.el);
const dockBtns = {};
const dock = h('div.dock', {}, ...[['band', 'BAND', 'iconBand'], ['seq', 'SEQ', 'iconSeq'], ['drums', 'DRUMS', 'iconDrums'], ['sampler', 'SAMPLER', 'iconSampler'], ['fx', 'XY FX', 'iconFx']].map(([id, label, icon]) => {
  const b = button([spriteImg(icon, 2), label], () => setPage(id));
  dockBtns[id] = b;
  return b;
}));
root.append(menubar, pagesEl, keyzone, dock);

let page = 'band';
function setPage(id) {
  page = id;
  for (const [k, p] of Object.entries(pages)) p.el.classList.toggle('on', k === id);
  for (const [k, b] of Object.entries(dockBtns)) b.classList.toggle('on', k === id);
  keyzone.classList.toggle('on', id === 'band' || id === 'seq');
  if (id !== 'seq') session.seqSelect(null);
  pages[id].update();
  if (id === 'sampler') pages.sampler.show();
}

// ---------------------------------------------------------------- rendering
function renderMenubar() {
  const m = session.screenModel();
  keyPill.textContent = m.keySelect ? 'KEY?' : m.keyName.toUpperCase();
  bpmPill.textContent = `${m.tempo} BPM`;
  playBtn.innerHTML = '';
  playBtn.append(spriteImg(m.playing ? 'stop' : 'play', 2), m.playing ? 'STOP' : 'PLAY');
  playBtn.classList.toggle('on', m.playing);
  clickBtn.classList.toggle('on', st.metronome);
  // While recording, the trail makes way for a clear REC badge showing the mode.
  recPill.style.display = st.seq.rec ? '' : 'none';
  recPill.textContent = `● ${st.recMode}`;
  trailFill.parentElement.style.display = st.seq.rec ? 'none' : '';
}

function renderTrail() {
  const bar = (st.step % 64) / 64; // the slug crawls along four bars
  const w = st.playing ? bar * 100 : 0;
  trailFill.style.width = `${w}%`;
  trailSnail.style.left = `calc(${w}% - ${(w / 100) * 30}px)`; // stays inside the trail
}

function renderKeys() {
  const labels = session.chordKeyLabels();
  const m = session.screenModel();
  const focus = st.players[st.focus];
  const harmony = st.chord || st.base || diatonicChord(st.key, 0);
  const plate = focus.id === 'drummer' ? null : plateNotes(focus.id, harmony, st.key);
  const drumLabels = [...LANES, 'kick', 'snare', 'hat'].map((l, i) => (i >= 6 ? `${LANE_LABELS[l].slice(0, 3)}·` : LANE_LABELS[l].slice(0, 4)));
  for (const k of KEYS) {
    const e = kb.keyEls[k.index];
    e.classList.toggle('down', st.pressed.has(k.index));
    if (m.keySelect && !k.black) {
      e.querySelector('.r').textContent = noteName(k.pc, st.key);
      e.querySelector('.n').textContent = k.pc === st.key.tonic ? st.key.mode.slice(0, 3) : '';
      e.classList.remove('hint');
      continue;
    }
    if (k.section === 'chord') {
      e.querySelector('.r').textContent = labels[k.degree].roman;
      e.querySelector('.n').textContent = labels[k.degree].name;
      e.classList.toggle('hint', m.bestDegree === k.degree && !st.pressed.has(k.index));
      e.classList.toggle('cur', !!st.base && st.base.root === labels[k.degree].root);
    } else if (k.section === 'plate') {
      e.querySelector('.r').textContent = '';
      e.querySelector('.n').textContent = plate ? noteName(plate[k.pos], st.key) : drumLabels[k.pos];
    } else if (k.section === 'pick') {
      e.classList.toggle('hint', k.pick === 'best');
    }
  }
}

let rafPending = false;
function renderAll() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    renderMenubar();
    renderKeys();
    pages[page].update();
    if (page !== 'band') pages.band.update(); // keep focus/latch state fresh
  });
}

session.subscribe((what, _s, data) => {
  if (what === 'toast') return toast(st.toast.text);
  if (what === 'hits') { if (page === 'band') pages.band.flash(data.players, data.time, app.now()); return; }
  if (what === 'step') { renderTrail(); if (page === 'drums') pages.drums.update('step'); if (page === 'seq' && st.step % 4 === 0) pages.seq.update(); return; }
  if (app.audio) app.audio.setTempo(st.tempo);
  renderAll();
  saveSoon();
});

// ---------------------------------------------------------------- audio + storage helpers
// The library reads IndexedDB right away; decoding waits for the audio context.
app.library = createLibrary({ decodeAudioData: (...a) => getContext().decodeAudioData(...a) });

app.selectKit = async (id) => {
  app.kitId = id;
  db.setKV('drumKit', id);
  if (!app.audio) { pages.drums.update(); return; }
  const kit = await app.library.kitBuffers(id);
  app.audio.drums.setKit(kit);
  const n = Object.values(kit.lanes).reduce((a, l) => a + l.length, 0);
  toast(id === 'builtin' && !n ? 'FREE KIT NOT UPLOADED YET · USING SYNTH' : `KIT · ${kit.name}`);
  pages.drums.update();
};

app.importFiles = async (files, onProgress) => {
  if (!app.audio) await boot();
  try { return await app.library.importFiles(files, onProgress); } catch (e) { return null; }
};

app.toggleLoop = async (l) => {
  if (!app.audio) return;
  const buf = l.buffer || await app.library.bufferFor(l.id);
  if (!buf) return;
  app.audio.toggleLoop(l.id, buf, l.bpm);
  setTimeout(() => pages.drums.renderLoops(), 50);
};

app.bufferFor = (id) => (app.library ? app.library.bufferFor(id) : null);
app.playRegion = (buf, o) => app.audio && app.audio.sampler.play(buf, o);

/**
 * Play a pad (or one of its chops) with its pitch and stretch settings.
 * Stretch/keep-time modes render once (cached), then play like any sample.
 * Returns the plan so the waveform playhead can follow.
 */
app.playPad = (buffer, pad, chopIndex, key, extra = {}) => {
  if (!app.audio || !buffer) return null;
  const r = padRegion(pad, chopIndex);
  const plan = playbackPlan(pad, st.tempo);
  let buf = buffer;
  let region = { start: r.start, end: r.end };
  if (plan.algo !== 'none') {
    buf = app.audio.renderer.render(buffer, pad.sampleId, r.start, r.end, plan.algo, plan.factor, pad.srcBpm);
    region = { start: 0, end: buf.duration };
  }
  app.audio.sampler.play(buf, { ...r, ...region, pitch: 0, rate: plan.rate, key, ...extra });
  return plan;
};
/** Render ahead of time after a setting changes, so the next press is instant. */
app.prerenderPad = (buffer, pad) => {
  if (!app.audio || !buffer || !pad.sampleId) return;
  const plan = playbackPlan(pad, st.tempo);
  if (plan.algo !== 'none') app.audio.renderer.render(buffer, pad.sampleId, pad.start, pad.end, plan.algo, plan.factor, pad.srcBpm);
};
app.stopRegion = (key) => app.audio && app.audio.sampler.stop(key);

app.loadSampleFile = async (file, onProgress) => {
  if (!app.audio) await boot();
  const ac = getContext();
  let buffer;
  let bytes;
  try { bytes = await file.arrayBuffer(); buffer = await decode(ac, bytes.slice(0)); } catch (e) {
    buffer = await decodeFile(ac, file, onProgress); // video fallback: capture in real time
    bytes = encodeWav(buffer);
  }
  if (/^video\//.test(file.type)) bytes = encodeWav(buffer); // keep only the audio, not the whole video
  const sampleId = await app.library.saveBuffer(file.name, bytes, 'sampler', buffer);
  return { sampleId, name: file.name.replace(/\.[^.]+$/, ''), duration: buffer.duration, buffer };
};

app.startMic = async () => {
  if (!app.audio) await boot();
  const r = createMicRecorder(getContext());
  await r.start();
  return r;
};
app.stopMic = async (r) => {
  const buffer = r.stop();
  if (!buffer) return null;
  const sampleId = await app.library.saveBuffer(`mic-${new Date().toISOString().slice(0, 19)}.wav`, encodeWav(buffer), 'sampler', buffer);
  return { sampleId, name: 'mic take', duration: buffer.duration, buffer };
};

app.saveXY = () => db.setKV('xy', { x: app.xy.x, y: app.xy.y, hold: app.xy.hold, combos: app.xy.combos });

let padsTimer;
app.savePads = () => { clearTimeout(padsTimer); padsTimer = setTimeout(() => db.setKV('pads', app.pads), 300); };
// Never lose edits when the phone backgrounds the page.
const flush = () => { db.setKV('pads', app.pads); db.setKV('session', session.serialize()); };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
window.addEventListener('pagehide', flush);
let saveTimer;
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(() => db.setKV('session', session.serialize()), 800); }

// ---------------------------------------------------------------- boot
const bootEl = document.getElementById('boot');
const bootBtn = document.getElementById('boot-btn');
const bootSlime = document.getElementById('boot-slime');
document.getElementById('boot-snail').append(spriteImg('snail', 3));
let booting = null;

function boot() {
  if (booting) return booting;
  booting = (async () => {
    bootSlime.style.width = '20%';
    const ac = await startAudio();
    bootSlime.style.width = '50%';
    app.audio = createOutput(ac);
    app.audio.bindClock({ step: session.step, stepDur: session.stepDur });
    real = app.audio.out;
    st.players.forEach((p, i) => real.setPlayer(i, p));
    app.audio.setTempo(st.tempo);
    pages.fx.apply();
    ac.addEventListener?.('statechange', onStateChange);
    bootSlime.style.width = '75%';
    db.persist();
    await app.library.loadBuiltin().catch(() => null);
    await app.selectKit(app.kitId);
    bootSlime.style.width = '100%';
    setupMidi();
    window.__slug = { session, app, ac, pages };
    if (ac.state === 'running') bootEl.classList.add('hidden');
    else { bootBtn.textContent = 'TAP AGAIN'; booting = null; }
    renderAll();
  })();
  return booting;
}

function onStateChange() {
  const ac = getContext();
  if (!ac) return;
  if (ac.state === 'running') { bootEl.classList.add('hidden'); return; }
  if (document.visibilityState !== 'visible') return;
  resumeAudio();
  setTimeout(() => {
    if (ac.state !== 'running') { bootBtn.textContent = 'TAP TO RESUME'; bootEl.classList.remove('hidden'); booting = null; }
  }, 400);
}

bootEl.addEventListener('pointerup', () => { if (app.audio) { resumeAudio(); bootEl.classList.add('hidden'); } else boot(); });
bootEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') boot(); });
document.addEventListener('pointerdown', resumeAudio, true);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') resumeAudio(); });

// ---------------------------------------------------------------- computer keyboard
const KEYMAP = { z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11, q: 12, 2: 13, w: 14, 3: 15, e: 16, r: 17, 5: 18, t: 19, 6: 20, y: 21, 7: 22, u: 23, i: 24, 9: 25, o: 26 };
const BTN_KEYS = { ' ': 'play', l: 'latch', k: 'key', p: 'player', '`': 'rec' };
const arrows = new Set();
function applyArrows() {
  const diag = arrows.has('ArrowUp') && arrows.has('ArrowRight');
  session.setBend('ninth', diag);
  session.setBend('seventh', arrows.has('ArrowUp') && !diag);
  session.setBend('sus', arrows.has('ArrowRight') && !diag);
  session.setBend('inversion', arrows.has('ArrowDown'));
  session.setBend('borrowed', arrows.has('ArrowLeft'));
}
window.addEventListener('keydown', (ev) => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.target.closest?.('.knob, input')) return;
  if (!app.audio) boot(); else resumeAudio();
  const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
  if (ev.repeat) { if (k in BTN_KEYS || k.startsWith('Arrow')) ev.preventDefault(); return; }
  if (k in BTN_KEYS) { session.buttonDown(BTN_KEYS[k]); ev.preventDefault(); return; }
  if (k === ';') { session.toggleMetronome(); return; }
  if (k === '[') { session.historyBack(); return; }
  if (k === '/') { session.capture(); ev.preventDefault(); return; }
  if (k === 'Backspace') { session.undo(); ev.preventDefault(); return; }
  if (k === ']') { session.historyForward(); return; }
  if (page === 'sampler' && pages.sampler.keyDown(k)) { ev.preventDefault(); return; }
  if (page === 'drums' && '123456'.includes(k)) { out.drum(LANES[Number(k) - 1], 0.9, out.now()); return; }
  if (k in KEYMAP) { session.keyDown(KEYMAP[k], 0.8); ev.preventDefault(); }
  else if (k.startsWith('Arrow')) { arrows.add(k); applyArrows(); ev.preventDefault(); }
});
window.addEventListener('keyup', (ev) => {
  const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
  if (k in BTN_KEYS) session.buttonUp(BTN_KEYS[k]);
  else if (page === 'sampler' && pages.sampler.keyUp(k)) { /* handled */ }
  else if (k in KEYMAP) session.keyUp(KEYMAP[k]);
  else if (k.startsWith('Arrow')) { arrows.delete(k); applyArrows(); }
});
window.addEventListener('blur', () => { arrows.clear(); applyArrows(); });

// ---------------------------------------------------------------- Web MIDI (optional)
async function setupMidi() {
  if (!navigator.requestMIDIAccess) return;
  let access;
  try { access = await navigator.requestMIDIAccess(); } catch (e) { return; }
  const toKey = (note) => { const i = note - BASE_MIDI; return i >= 0 && i < KEY_COUNT ? i : i < 0 ? ((note % 12) + 12) % 12 : 12 + (note % 12); };
  const onMsg = (msg) => {
    const [s, d1, d2] = msg.data;
    const type = s & 0xf0;
    if (type === 0x90 && d2 > 0) session.keyDown(toKey(d1), d2 / 127);
    else if (type === 0x80 || (type === 0x90 && d2 === 0)) session.keyUp(toKey(d1));
    else if (type === 0xb0 && d1 >= 70 && d1 <= 76) session.knob(d1 - 70, d2 / 127);
    else if (type === 0xfa) session.setPlaying(true);
    else if (type === 0xfc) session.setPlaying(false);
  };
  const attach = () => access.inputs.forEach((i) => { i.onmidimessage = onMsg; });
  attach();
  access.onstatechange = attach;
}

// ---------------------------------------------------------------- restore saved state
(async () => {
  try {
    const saved = await db.getKV('session');
    if (saved) session.load(saved);
    const pads = await db.getKV('pads');
    if (Array.isArray(pads)) pads.forEach((p, i) => { if (app.pads[i]) app.pads[i] = { ...app.pads[i], ...p }; });
    app.kitId = (await db.getKV('drumKit')) || 'builtin';
    const xy = await db.getKV('xy');
    if (xy) Object.assign(app.xy, xy, { ax: 0, ay: 0 });
    await app.library.refresh();
  } catch (e) { /* first run */ }
  setPage('band');
  renderAll();
})();
setPage('band');
