// xyfx.js — SHELL SHOCK effects. Two slots (X and Y) in series. Each effect
// takes one amount 0..1 (the pad) and is fully transparent at 0, plus a few
// hidden knobs (TWEAK) passed to params(p) as 0..1 values.
//
// HOW TO ADD AN EFFECT: add an entry to SHELL_EFFECTS in src/core/xy.js, then
// a maker below with the same id. A maker gets (ac, env) and returns:
//   { input, output, set(amount), params?(p), tempo?(bpm), dispose?() }
// env.tempo() = BPM, env.nextBeat() = audio time of the next beat (for sync),
// env.worklet = true when the AudioWorklet effects loaded.

import { repeatBeats, stutterBeats, tapeStopSeconds, defaultParams, LFO_RATES, DELAY_TIMES, stepOf } from '../core/xy.js';
import { loadFxWorklet, workletNode } from './fxWorklet.js';
import { makeChorus, noiseSource } from './util.js';

const SMOOTH = 0.02;

export function createXY(ac) {
  const input = ac.createGain();
  const output = ac.createGain();
  let tempo = 90;
  let clock = null; // () => next beat time
  const env = {
    tempo: () => tempo,
    nextBeat: () => (clock ? clock() : ac.currentTime),
    worklet: false,
  };
  const slots = { x: null, y: null };
  const ids = { x: null, y: null };
  const amounts = { x: 0, y: 0 };
  const params = { x: {}, y: {} };
  const listeners = new Set(); // copies that follow this pad (EXPORT stems with FX)
  const tell = (...a) => listeners.forEach((fn) => fn(...a));
  const ready = loadFxWorklet(ac).then((ok) => {
    env.worklet = ok;
    for (const ax of ['x', 'y']) if (ids[ax] && NEEDS_WORKLET.has(ids[ax])) { const id = ids[ax]; ids[ax] = null; setEffect(ax, id, params[ax]); }
    return ok;
  });

  function wire() {
    input.disconnect();
    for (const s of Object.values(slots)) if (s) s.output.disconnect();
    let node = input;
    for (const ax of ['x', 'y']) if (slots[ax]) { node.connect(slots[ax].input); node = slots[ax].output; }
    node.connect(output);
  }

  function setEffect(axis, id, p = null) {
    tell('effect', axis, id, p);
    if (p) params[axis] = { ...defaultParams(id), ...p };
    if (ids[axis] === id) { slots[axis]?.params?.(params[axis]); return; }
    const old = slots[axis];
    if (old) { old.set(0); setTimeout(() => old.dispose && old.dispose(), 400); }
    ids[axis] = id;
    if (!p) params[axis] = defaultParams(id);
    let fx = null;
    try { fx = MAKERS[id] ? MAKERS[id](ac, env) : null; } catch (e) { fx = null; } // never let one effect break the mix
    slots[axis] = fx;
    wire();
    if (fx) { fx.params?.(params[axis]); fx.set(amounts[axis]); }
  }

  function setAmount(axis, v) {
    amounts[axis] = Math.max(0, Math.min(1, v));
    tell('amount', axis, amounts[axis]);
    if (slots[axis]) slots[axis].set(amounts[axis]);
  }

  function setParams(axis, p) {
    params[axis] = { ...params[axis], ...p };
    tell('params', axis, params[axis]);
    slots[axis]?.params?.(params[axis]);
  }

  wire();
  return {
    input, output, setEffect, setAmount, setParams, ready,
    setTempo(bpm) { tempo = bpm; for (const s of Object.values(slots)) s && s.tempo && s.tempo(bpm); },
    setClock(fn) { clock = fn; },
    /** The current state, so EXPORT can build an identical copy for each stem. */
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get tempo() { return tempo; },
    get clock() { return clock; },
    snapshot: () => ({ ids: { ...ids }, amounts: { ...amounts }, params: { x: { ...params.x }, y: { ...params.y } } }),
    get ids() { return { ...ids }; },
    get worklet() { return env.worklet; },
  };
}

// ---------------------------------------------------------------- helpers

function dryWet(ac) {
  const input = ac.createGain();
  const output = ac.createGain();
  const dry = ac.createGain();
  const wet = ac.createGain();
  wet.gain.value = 0;
  input.connect(dry).connect(output);
  wet.connect(output);
  return { input, output, dry, wet };
}
const to = (param, v, ac, tc = SMOOTH) => param.setTargetAtTime(v, ac.currentTime, tc);
const shaperCurve = (fn, n = 2048) => { const c = new Float32Array(n); for (let i = 0; i < n; i++) c[i] = fn((i / (n - 1)) * 2 - 1); return c; };
const NEEDS_WORKLET = new Set(['lofi', 'dive', 'reverse', 'stutter', 'looper']);
const mixTo = (io, ac, on, mix = 1) => { to(io.wet.gain, on ? mix : 0, ac, 0.01); to(io.dry.gain, on ? 1 - mix : 1, ac, 0.01); };

function impulse(ac, seconds, decay) {
  const len = Math.floor(ac.sampleRate * seconds);
  const b = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) { lp += 0.5 * ((Math.random() * 2 - 1) - lp); d[i] = lp * Math.pow(1 - i / len, decay); }
  }
  return b;
}

/** Loop repeater using the worklet (clean joins). lenBeats(a) gives the slice length. */
function repeaterFx(ac, env, lenBeats, threshold, feelOf) {
  const rp = workletNode(ac, 'slug-repeat');
  let a = 0, p = { feel: 0, fade: 0 };
  const upd = () => {
    const on = a > threshold;
    const t = ac.currentTime;
    rp.parameters.get('length').setValueAtTime(Math.min(2, lenBeats(a) * feelOf(p) * (60 / env.tempo())), t);
    rp.parameters.get('decay').setValueAtTime(1 - p.fade * 0.35, t);
    rp.parameters.get('on').setValueAtTime(on ? 1 : 0, t);
  };
  upd();
  return { input: rp, output: rp, tempo: upd, set(v) { a = v; upd(); }, params(q) { p = q; upd(); } };
}

/** Fallback loop repeater from a delay line (browsers without AudioWorklet). */
function delayLooper(ac, env, lenBeats, threshold, feelOf) {
  const io = dryWet(ac);
  const cap = ac.createGain();
  const d = ac.createDelay(2.5);
  const fb = ac.createGain();
  fb.gain.value = 0;
  io.input.connect(cap).connect(d);
  d.connect(fb).connect(d);
  d.connect(io.wet);
  let on = false, len = 0, p = { feel: 0, fade: 0 }, a = 0;
  const upd = () => {
    const t = ac.currentTime;
    const want = a > threshold;
    const newLen = Math.min(2.4, lenBeats(a) * feelOf(p) * (60 / env.tempo()));
    if (want && !on) {
      on = true; len = newLen;
      d.delayTime.setValueAtTime(len, t);
      to(cap.gain, 0, ac, 0.003); to(fb.gain, 1 - p.fade * 0.3, ac, 0.003); to(io.wet.gain, 1, ac, 0.003); to(io.dry.gain, 0, ac, 0.003);
    } else if (want && on && Math.abs(newLen - len) > 0.001) {
      len = newLen; d.delayTime.setValueAtTime(len, t);
    } else if (!want && on) {
      on = false;
      to(cap.gain, 1, ac, 0.003); to(fb.gain, 0, ac, 0.003); to(io.wet.gain, 0, ac, 0.01); to(io.dry.gain, 1, ac, 0.01);
    }
  };
  return { ...io, set(v) { a = v; upd(); }, params(q) { p = q; upd(); } };
}

// ---------------------------------------------------------------- the effects

export const MAKERS = {
  /** FILTER: low-pass sweep. RES = resonance, RANGE = how low it goes. */
  filter(ac) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 20000;
    let a = 0, p = { res: 0.4, range: 0.5 };
    const upd = () => { const lo = 800 * Math.pow(60 / 800, p.range); to(f.frequency, 20000 * Math.pow(lo / 20000, a), ac); to(f.Q, 0.7 + a * (2 + p.res * 14), ac); };
    return { input: f, output: f, set(v) { a = v; upd(); }, params(q) { p = q; upd(); } };
  },

  /** LFO FILTER: a tempo-synced low-pass sweep; the pad sets how deep. */
  lfofilter(ac, env) {
    const io = dryWet(ac);
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    io.input.connect(f).connect(io.wet);
    const depth = ac.createGain();
    depth.gain.value = 0;
    depth.connect(f.detune);
    let lfo = null, a = 0, on = false, p = { rate: 0.5, res: 0.4, shape: 0, center: 0.5 };
    const SHAPES = ['sine', 'triangle', 'square', 'sawtooth'];
    const hz = () => (env.tempo() / 60) / LFO_RATES[stepOf(p.rate, LFO_RATES.length)];
    // Start the wobble on the next beat so it locks to the groove.
    function restart() {
      if (lfo) { try { lfo.stop(); } catch (e) { /* stopped */ } lfo.disconnect(); }
      lfo = ac.createOscillator();
      lfo.type = SHAPES[stepOf(p.shape, 4)];
      lfo.frequency.value = hz();
      lfo.connect(depth);
      lfo.start(Math.max(ac.currentTime, env.nextBeat()));
    }
    const upd = () => {
      to(f.frequency, 300 * Math.pow(20, p.center), ac);
      to(f.Q, 0.7 + p.res * 14, ac);
      to(depth.gain, a * 2400, ac);
      if (lfo) to(lfo.frequency, hz(), ac, 0.05);
      mixTo(io, ac, a > 0.01, Math.min(1, a * 3));
    };
    return {
      ...io,
      set(v) { a = v; if (v > 0.01 && !on) { on = true; restart(); } if (v <= 0.01) on = false; upd(); },
      params(q) { const shapeChanged = !lfo || stepOf(q.shape, 4) !== stepOf(p.shape, 4); p = q; if (shapeChanged && on) restart(); upd(); },
      tempo: () => upd(),
      dispose() { if (lfo) try { lfo.stop(); } catch (e) { /* stopped */ } },
    };
  },

  /**
   * ISOLATOR: a DJ kill EQ. BAND picks what the pad cuts: LOWS, MIDS, HIGHS,
   * or SWEEP (lows first, then mids). DEPTH = how far (all the way = gone).
   */
  isolator(ac) {
    const lo = ac.createBiquadFilter(); lo.type = 'lowshelf'; lo.frequency.value = 250;
    const mid = ac.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 0.7;
    const hi = ac.createBiquadFilter(); hi.type = 'highshelf'; hi.frequency.value = 3500;
    lo.connect(mid).connect(hi);
    let a = 0, p = { band: 0, depth: 1 };
    const upd = () => {
      const band = stepOf(p.band, 4);
      const max = 12 + p.depth * 36;
      const g = { lo: 0, mid: 0, hi: 0 };
      if (band === 0) g.lo = -max * a;
      if (band === 1) g.mid = -max * a;
      if (band === 2) g.hi = -max * a;
      if (band === 3) { g.lo = -max * Math.min(1, a * 2); g.mid = -max * Math.max(0, a * 2 - 1); }
      to(lo.gain, g.lo, ac); to(mid.gain, g.mid, ac); to(hi.gain, g.hi, ac);
    };
    return { input: lo, output: hi, set(v) { a = v; upd(); }, params(q) { p = q; upd(); } };
  },

  /** BEAT REPEAT: loops the last beat (or 1/2, 1/4...). TRIPLET feel, FADE each repeat. */
  looper(ac, env) {
    const feelOf = (p) => (p.feel >= 0.5 ? 2 / 3 : 1);
    if (env.worklet) return repeaterFx(ac, env, (a) => repeatBeats(a), 0.08, feelOf);
    return delayLooper(ac, env, (a) => repeatBeats(a), 0.08, feelOf);
  },

  /**
   * STUTTER: a real DJ-style loop stutter. It grabs the slice of music you're
   * on and repeats it: 1/8 notes, rolling down to 1/16, 1/32 and 1/64 as you
   * push further. TRIPLET for triplet slices, FADE makes each repeat softer.
   */
  stutter(ac, env) {
    const feelOf = (p) => (p.feel >= 0.5 ? 2 / 3 : 1);
    if (env.worklet) return repeaterFx(ac, env, (a) => stutterBeats(a), 0.06, feelOf);
    return delayLooper(ac, env, (a) => stutterBeats(a), 0.06, feelOf);
  },

  /** PHASER: six swept all-pass stages. RATE, COLOR (where it sweeps). */
  phaser(ac) {
    const io = dryWet(ac);
    const lfo = ac.createOscillator();
    const depth = ac.createGain();
    lfo.connect(depth);
    const stages = [];
    let node = io.input;
    for (let i = 0; i < 6; i++) {
      const ap = ac.createBiquadFilter();
      ap.type = 'allpass'; ap.Q.value = 0.5;
      depth.connect(ap.frequency);
      node.connect(ap);
      node = ap;
      stages.push(ap);
    }
    node.connect(io.wet);
    lfo.start();
    let a = 0, p = { rate: 0.3, color: 0.5 };
    const upd = () => {
      stages.forEach((ap, i) => { ap.frequency.value = (250 + p.color * 900) * (1 + i * 0.6); });
      to(io.wet.gain, a * 0.9, ac); to(io.dry.gain, 1 - a * 0.3, ac);
      to(lfo.frequency, (0.05 + p.rate * 1.5) * (0.5 + a), ac); to(depth.gain, 200 + a * 1400, ac);
    };
    return { ...io, set(v) { a = v; upd(); }, params(q) { p = q; upd(); }, dispose() { lfo.stop(); } };
  },

  /** FLANGER: a very short swept delay with feedback (the jet). RATE, FEEDBACK. */
  flanger(ac) {
    const io = dryWet(ac);
    const d = ac.createDelay(0.03);
    d.delayTime.value = 0.003;
    const fb = ac.createGain();
    const lfo = ac.createOscillator();
    const depth = ac.createGain();
    depth.gain.value = 0.002;
    lfo.connect(depth).connect(d.delayTime);
    lfo.start();
    io.input.connect(d);
    d.connect(fb).connect(d);
    d.connect(io.wet);
    let a = 0, p = { rate: 0.3, fb: 0.5 };
    const upd = () => { to(io.wet.gain, a * 0.8, ac); to(fb.gain, a * (0.3 + p.fb * 0.6), ac); to(lfo.frequency, 0.05 + p.rate * 1.2, ac); };
    return { ...io, set(v) { a = v; upd(); }, params(q) { p = q; upd(); }, dispose() { lfo.stop(); } };
  },

  /** DELAY: tempo-synced echoes. TIME (1/8 ... 1/2), FEEDBACK, TONE. */
  delay(ac, env) {
    const io = dryWet(ac);
    const d = ac.createDelay(4);
    const fb = ac.createGain();
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    io.input.connect(d);
    d.connect(lp).connect(fb).connect(d);
    lp.connect(io.wet);
    let a = 0, p = { time: 0.5, fb: 0.6, tone: 0.5 };
    const upd = () => {
      to(d.delayTime, (60 / env.tempo()) * DELAY_TIMES[stepOf(p.time, DELAY_TIMES.length)], ac, 0.05);
      to(lp.frequency, 800 * Math.pow(10, p.tone), ac);
      to(io.wet.gain, a * 0.85, ac); to(fb.gain, 0.1 + a * (0.3 + p.fb * 0.55), ac);
    };
    return { ...io, tempo: upd, set(v) { a = v; upd(); }, params(q) { p = q; upd(); } };
  },

  /**
   * TAPE STOP, expressive: position = how fast the tape slows (slow 3 s
   * wind-down ... instant). Drag back and it spins back up. SPIN-UP = how fast
   * it comes back, DARK = how muffled it gets as it slows.
   */
  tapestop(ac) {
    const d = ac.createDelay(8);
    d.delayTime.value = 0;
    const tone = ac.createBiquadFilter();
    tone.type = 'lowpass'; tone.frequency.value = 20000;
    const g = ac.createGain();
    const live = ac.createGain();
    const input = ac.createGain();
    const output = ac.createGain();
    input.connect(d).connect(tone).connect(g).connect(output);
    input.connect(live).connect(output);
    live.gain.value = 0;
    let amount = 0, last = 0, speed = 1, delay = 0, engaged = false, p = { spin: 0.5, dark: 0.6 };
    let lastT = ac.currentTime;
    const TICK = 0.015;
    const timer = setInterval(() => {
      const t = ac.currentTime;
      const dt = Math.min(0.05, Math.max(0, t - lastT));
      lastT = t;
      const falling = amount < last - 0.002;
      if (amount > 0.05 && !falling) {
        engaged = true;
        speed = Math.max(0, speed - dt / tapeStopSeconds(amount)); // brake
      } else if (engaged) {
        const spinUp = (1.2 - p.spin * 1.1) * (amount <= 0.05 ? 1 : 1 / (1 + amount * 3));
        speed = Math.min(1, speed + dt / spinUp);
      }
      last = amount;
      if (engaged) {
        delay = Math.min(7.9, delay + (1 - speed) * dt);
        d.delayTime.linearRampToValueAtTime(delay, t + TICK);
        g.gain.setTargetAtTime(Math.min(1, speed * 2.5), t, 0.01);
        tone.frequency.setTargetAtTime(20000 * Math.pow(Math.max(0.01, speed), 0.5 + p.dark * 2.5) + 200, t, 0.01);
        if (speed >= 1 && amount <= 0.05) {
          engaged = false;
          g.gain.setTargetAtTime(0, t, 0.015);
          live.gain.setTargetAtTime(1, t, 0.015);
          setTimeout(() => {
            if (engaged) return;
            const now = ac.currentTime;
            delay = 0;
            d.delayTime.cancelScheduledValues(now);
            d.delayTime.setValueAtTime(0, now);
            g.gain.setTargetAtTime(1, now + 0.01, 0.015);
            live.gain.setTargetAtTime(0, now + 0.01, 0.015);
          }, 90);
        }
      }
    }, TICK * 1000);
    return {
      input, output,
      set(a) { amount = a; },
      params(q) { p = q; },
      dispose() { clearInterval(timer); },
      get speed() { return speed; },
    };
  },

  /** BIT CRUSHER: fewer bits. TONE = how dark, MIX = blend with the clean sound. */
  crusher(ac) {
    const io = dryWet(ac);
    const shaper = ac.createWaveShaper();
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    io.input.connect(shaper).connect(lp).connect(io.wet);
    let bits = 0, a = 0, p = { tone: 0.5, mix: 1 };
    const upd = () => {
      const b = Math.round(16 - a * 13);
      if (b !== bits) { bits = b; const steps = Math.pow(2, b - 1); shaper.curve = shaperCurve((x) => Math.round(x * steps) / steps, 4096); }
      to(lp.frequency, 18000 * Math.pow((1200 + p.tone * 6000) / 18000, a), ac);
      mixTo(io, ac, a > 0.02, p.mix);
    };
    return { ...io, set(v) { a = v; upd(); }, params(q) { p = q; upd(); } };
  },

  /**
   * LO-FI with ERAS (the ERA knob steps through them):
   *   SAMPLER  12-bit, half sample rate, a touch of hiss (old drum machines)
   *   CASSETTE soft top end, more hiss, gentle wow
   *   RADIO    narrow band (AM speaker), crunchy
   *   CONSOLE  very few bits and a low sample rate (8-bit games)
   * The pad sets how far into that era you go.
   */
  lofi(ac, env) {
    const io = dryWet(ac);
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 20;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass';
    const wow = ac.createDelay(0.05); wow.delayTime.value = 0.004;
    const wowLfo = ac.createOscillator(); wowLfo.frequency.value = 0.7;
    const wowD = ac.createGain(); wowD.gain.value = 0;
    wowLfo.connect(wowD).connect(wow.delayTime);
    wowLfo.start();
    let core;
    if (env.worklet) core = workletNode(ac, 'slug-lofi');
    else { core = ac.createWaveShaper(); core.curve = shaperCurve((x) => Math.round(x * 24) / 24, 4096); }
    io.input.connect(hp).connect(core).connect(lp).connect(wow).connect(io.wet);
    let a = 0, p = { era: 0.4, hiss: 0.4 };
    const ERAS = [
      { hold: 2, bits: 12, lp: 11000, hp: 30, wow: 0, hiss: 0.003 },
      { hold: 1, bits: 14, lp: 7000, hp: 60, wow: 0.0012, hiss: 0.012 },
      { hold: 3, bits: 9, lp: 3200, hp: 400, wow: 0, hiss: 0.008 },
      { hold: 8, bits: 5, lp: 9000, hp: 20, wow: 0, hiss: 0.002 },
    ];
    const upd = () => {
      const e = ERAS[stepOf(p.era, ERAS.length)];
      const k = a; // how far into the era
      if (core.parameters) {
        to(core.parameters.get('hold'), 1 + (e.hold - 1) * k * 1.5, ac);
        to(core.parameters.get('bits'), 16 - (16 - e.bits) * k, ac);
        to(core.parameters.get('hiss'), e.hiss * k * (0.3 + p.hiss * 1.4), ac);
      }
      to(lp.frequency, 20000 * Math.pow(e.lp / 20000, k), ac);
      to(hp.frequency, 20 * Math.pow(e.hp / 20, k), ac);
      to(wowD.gain, e.wow * k, ac);
      mixTo(io, ac, a > 0.02);
    };
    return { ...io, set(v) { a = v; upd(); }, params(q) { p = q; upd(); }, dispose() { wowLfo.stop(); } };
  },

  /** VINYL WOBBLE: warped record. RATE = wow speed, CRACKLE = surface noise. */
  wobble(ac) {
    const input = ac.createGain();
    const output = ac.createGain();
    const d = ac.createDelay(0.1);
    d.delayTime.value = 0.02;
    const wow = ac.createOscillator();
    const flut = ac.createOscillator(); flut.frequency.value = 6.3;
    const wowD = ac.createGain(); wowD.gain.value = 0;
    const flutD = ac.createGain(); flutD.gain.value = 0;
    wow.connect(wowD).connect(d.delayTime);
    flut.connect(flutD).connect(d.delayTime);
    wow.start(); flut.start();
    const tone = ac.createBiquadFilter();
    tone.type = 'lowpass'; tone.frequency.value = 20000;
    input.connect(d).connect(tone).connect(output);
    const n = noiseSource(ac);
    const spike = ac.createWaveShaper();
    spike.curve = shaperCurve((x) => (Math.abs(x) > 0.985 ? x : 0));
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
    const crackle = ac.createGain(); crackle.gain.value = 0;
    n.connect(spike).connect(hp).connect(crackle).connect(output);
    n.start();
    let a = 0, p = { rate: 0.4, crackle: 0.5 };
    const upd = () => {
      to(wow.frequency, 0.2 + p.rate * 1.8, ac, 0.05);
      to(wowD.gain, a * 0.006, ac, 0.05);
      to(flutD.gain, a * 0.0004, ac, 0.05);
      to(crackle.gain, a * p.crackle * 2.4, ac, 0.05);
      to(tone.frequency, 20000 * Math.pow(5000 / 20000, a), ac);
    };
    return { input, output, set(v) { a = v; upd(); }, params(q) { p = q; upd(); }, dispose() { wow.stop(); flut.stop(); n.stop(); } };
  },

  /** TAPE SATURATION: warm drive into soft clipping. TONE, MIX. */
  saturate(ac) {
    const io = dryWet(ac);
    const pre = ac.createGain();
    const sh = ac.createWaveShaper();
    sh.oversample = '2x';
    sh.curve = shaperCurve((x) => Math.tanh(x));
    const warm = ac.createBiquadFilter(); warm.type = 'lowshelf'; warm.frequency.value = 180; warm.gain.value = 3;
    const top = ac.createBiquadFilter(); top.type = 'lowpass';
    const post = ac.createGain();
    io.input.connect(pre).connect(sh).connect(warm).connect(top).connect(post).connect(io.wet);
    let a = 0, p = { tone: 0.5, mix: 1 };
    const upd = () => {
      const drive = 1 + a * 14;
      to(pre.gain, drive, ac); to(post.gain, 1 / Math.sqrt(drive), ac);
      to(top.frequency, (4000 + p.tone * 14000) - a * 4000, ac);
      mixTo(io, ac, a > 0.02, p.mix);
    };
    return { ...io, set(v) { a = v; upd(); }, params(q) { p = q; upd(); } };
  },

  /** REVERB WASH: drowns the mix in a big room. SIZE (4 rooms), DAMP (darker tail). */
  wash(ac) {
    const io = dryWet(ac);
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 250;
    const conv = ac.createConvolver();
    const damp = ac.createBiquadFilter(); damp.type = 'lowpass';
    io.input.connect(hp).connect(conv).connect(damp).connect(io.wet);
    let a = 0, size = -1, p = { size: 0.6, damp: 0.5 };
    const upd = () => {
      const s = stepOf(p.size, 4);
      if (s !== size) { size = s; conv.buffer = impulse(ac, [1.5, 3, 4.5, 7][s], 2.2); }
      to(damp.frequency, 16000 * Math.pow(1500 / 16000, p.damp), ac);
      to(io.wet.gain, a * 1.4, ac, 0.05); to(io.dry.gain, 1 - a * 0.55, ac, 0.05);
    };
    upd();
    return { ...io, set(v) { a = v; upd(); }, params(q) { p = q; upd(); } };
  },

  /** CHORUS: wide, shimmering doubles. RATE, DEPTH. */
  chorus(ac) {
    const ch = makeChorus(ac);
    let a = 0, p = { rate: 0.4, depth: 0.5 };
    const upd = () => ch.set({ mix: a * 0.9, depth: 0.0005 + a * (0.001 + p.depth * 0.007), rate: 0.15 + p.rate * 2 });
    upd();
    return { input: ch.input, output: ch.output, set(v) { a = v; upd(); }, params(q) { p = q; upd(); } };
  },

  /** RING MOD: metallic and bell-like. RANGE = how high, SQUARE = harsher tone. */
  ringmod(ac) {
    const io = dryWet(ac);
    const ring = ac.createGain();
    ring.gain.value = 0;
    const osc = ac.createOscillator();
    osc.connect(ring.gain);
    osc.start();
    io.input.connect(ring).connect(io.wet);
    let a = 0, p = { range: 0.5, square: 0 };
    const upd = () => {
      osc.type = p.square >= 0.5 ? 'square' : 'sine';
      to(osc.frequency, (10 + p.range * 80) * Math.pow(40, a), ac, 0.03);
      to(io.wet.gain, Math.min(1, a * 2.2), ac); to(io.dry.gain, 1 - Math.min(0.85, a * 1.5), ac);
    };
    return { ...io, set(v) { a = v; upd(); }, params(q) { p = q; upd(); }, dispose() { osc.stop(); } };
  },

  /** PITCH DIVE: the pitch falls as you go. DEPTH = how far, GLIDE = how smoothly. */
  dive(ac, env) {
    const io = dryWet(ac);
    let a = 0, p = { depth: 0.6, glide: 0.3 };
    if (env.worklet) {
      const ps = workletNode(ac, 'slug-pitch');
      io.input.connect(ps).connect(io.wet);
      const upd = () => {
        ps.parameters.get('semitones').setTargetAtTime(-(6 + p.depth * 30) * Math.pow(a, 1.3), ac.currentTime, 0.01 + p.glide * 0.2);
        mixTo(io, ac, a > 0.01);
      };
      return { ...io, set(v) { a = v; upd(); }, params(q) { p = q; upd(); } };
    }
    const d = ac.createDelay(0.2);
    io.input.connect(d).connect(io.wet);
    return { ...io, set(v) { a = v; to(d.delayTime, v * 0.15, ac, 0.3); mixTo(io, ac, v > 0.01); }, params(q) { p = q; } };
  },

  /** TRANCE GATE: a chop pattern locked to the bar. PATTERN picks it, SMOOTH softens it. */
  gate(ac, env) {
    const io = dryWet(ac);
    const vca = ac.createGain();
    vca.gain.value = 0;
    io.input.connect(vca).connect(io.wet);
    const PATTERNS = [
      [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0],
      [1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1],
      [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
      [1, 1, 1, 0, 1, 1, 0, 0, 1, 1, 1, 0, 1, 0, 1, 0],
      [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 1, 1, 1],
    ];
    let src = null, patIdx = -1, on = false, a = 0, p = { pattern: 0, smooth: 0.2 };
    function build(k) {
      const sr = 8000;
      const bar = (60 / env.tempo()) * 4;
      const len = Math.round(bar * sr);
      const buf = ac.createBuffer(1, len, sr);
      const dd = buf.getChannelData(0);
      const step = len / 16;
      const atk = 40 - p.smooth * 36;
      for (let i = 0; i < len; i++) {
        const s = Math.floor(i / step);
        const ph = (i - s * step) / step;
        dd[i] = PATTERNS[k][s] ? Math.min(1, ph * atk) * (1 - Math.max(0, ph - (0.75 - p.smooth * 0.3)) / (0.25 + p.smooth * 0.3)) : 0;
      }
      return buf;
    }
    function startPattern(k) {
      if (src) { try { src.stop(); } catch (e) { /* stopped */ } src.disconnect(); }
      src = ac.createBufferSource();
      src.buffer = build(k);
      src.loop = true;
      src.connect(vca.gain);
      src.start(Math.max(ac.currentTime, env.nextBeat())); // lock to the beat
      patIdx = k;
    }
    const patFor = (v) => (stepOf(p.pattern, 6) + (v < 0.4 ? 0 : v < 0.75 ? 1 : 2)) % PATTERNS.length;
    const upd = () => {
      const want = a > 0.03;
      const k = patFor(a);
      if (want && (!on || k !== patIdx)) startPattern(k);
      if (!want && on && src) { try { src.stop(ac.currentTime + 0.05); } catch (e) { /* stopped */ } src = null; }
      on = want;
      const depth = Math.min(1, a * 1.8);
      to(io.wet.gain, want ? depth : 0, ac, 0.01); to(io.dry.gain, want ? 1 - depth : 1, ac, 0.01);
    };
    return {
      ...io,
      tempo() { if (on) startPattern(patIdx); },
      set(v) { a = v; upd(); },
      params(q) { const rebuild = on && (q.smooth !== p.smooth); p = q; if (rebuild) startPattern(patFor(a)); upd(); },
      dispose() { if (src) try { src.stop(); } catch (e) { /* stopped */ } },
    };
  },

  /** REVERSE REPEAT: plays the last beat backwards. LENGTH (1/2 ... 4 beats), MIX. */
  reverse(ac, env) {
    if (!env.worklet) return MAKERS.looper(ac, env);
    const io = dryWet(ac);
    const rv = workletNode(ac, 'slug-reverse');
    io.input.connect(rv).connect(io.wet);
    let a = 0, p = { length: 0.5, mix: 1 };
    const upd = () => {
      const on = a > 0.08;
      const maxBeats = [0.5, 1, 2, 4][stepOf(p.length, 4)];
      rv.parameters.get('length').setValueAtTime(Math.min(2, repeatBeats(a) * maxBeats * (60 / env.tempo())), ac.currentTime);
      rv.parameters.get('on').setValueAtTime(on ? 1 : 0, ac.currentTime);
      mixTo(io, ac, on, p.mix);
    };
    upd();
    return { ...io, set(v) { a = v; upd(); }, params(q) { p = q; upd(); } };
  },
};
