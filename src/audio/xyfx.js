// xyfx.js — SHELL SHOCK effects on the master bus. Two slots (X and Y) in
// series. Each effect takes one amount 0..1 and is fully transparent at 0.
//
// HOW TO ADD AN EFFECT: add an entry to SHELL_EFFECTS in src/core/xy.js, then
// a maker below with the same id. A maker gets (ac, env) and returns:
//   { input, output, set(amount), tempo?(bpm), dispose?() }
// env.tempo() is the band's BPM; env.worklet is true when AudioWorklet loaded.

import { repeatBeats, tapeStopSeconds } from '../core/xy.js';
import { loadFxWorklet, workletNode } from './fxWorklet.js';
import { makeChorus, noiseSource } from './util.js';

const SMOOTH = 0.02;

export function createXY(ac) {
  const input = ac.createGain();
  const output = ac.createGain();
  let tempo = 90;
  const env = { tempo: () => tempo, worklet: false };
  const slots = { x: null, y: null };
  const ids = { x: null, y: null };
  const amounts = { x: 0, y: 0 };
  // Effects that need the worklet are rebuilt once it has loaded.
  const ready = loadFxWorklet(ac).then((ok) => {
    env.worklet = ok;
    for (const ax of ['x', 'y']) if (ids[ax] && NEEDS_WORKLET.has(ids[ax])) { const id = ids[ax]; ids[ax] = null; setEffect(ax, id); }
    return ok;
  });

  function wire() {
    input.disconnect();
    for (const s of Object.values(slots)) if (s) s.output.disconnect();
    let node = input;
    for (const ax of ['x', 'y']) if (slots[ax]) { node.connect(slots[ax].input); node = slots[ax].output; }
    node.connect(output);
  }

  function setEffect(axis, id) {
    if (ids[axis] === id) return;
    const old = slots[axis];
    if (old) { old.set(0); setTimeout(() => old.dispose && old.dispose(), 400); }
    ids[axis] = id;
    let fx = null;
    try { fx = MAKERS[id] ? MAKERS[id](ac, env) : null; } catch (e) { fx = null; } // never let one effect break the mix
    slots[axis] = fx;
    wire();
    if (fx) fx.set(amounts[axis]);
  }

  function setAmount(axis, v) {
    amounts[axis] = Math.max(0, Math.min(1, v));
    if (slots[axis]) slots[axis].set(amounts[axis]);
  }

  wire();
  return {
    input, output, setEffect, setAmount, ready,
    setTempo(bpm) { tempo = bpm; for (const s of Object.values(slots)) s && s.tempo && s.tempo(bpm); },
    get ids() { return { ...ids }; },
    get worklet() { return env.worklet; },
  };
}

// ---------------------------------------------------------------- helpers

/** input -> dry -> output, plus a wet path you connect yourself. */
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
const NEEDS_WORKLET = new Set(['lofi', 'dive', 'reverse']);

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

// ---------------------------------------------------------------- the effects

export const MAKERS = {
  /** FILTER: low-pass sweep, a little resonant. */
  filter(ac) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 20000;
    return { input: f, output: f, set(a) { to(f.frequency, 20000 * Math.pow(160 / 20000, a), ac); to(f.Q, 0.7 + a * 7, ac); } };
  },

  /** ISOLATOR: 3-band kill EQ. First half kills the lows, second half the mids too. */
  isolator(ac) {
    const lo = ac.createBiquadFilter();
    lo.type = 'lowshelf'; lo.frequency.value = 280;
    const mid = ac.createBiquadFilter();
    mid.type = 'peaking'; mid.frequency.value = 1100; mid.Q.value = 0.6;
    lo.connect(mid);
    return { input: lo, output: mid, set(a) { to(lo.gain, -40 * Math.min(1, a * 2), ac); to(mid.gain, -30 * Math.max(0, a * 2 - 1), ac); } };
  },

  /** BEAT REPEAT: grabs the last beat (or 1/2, 1/4, 1/8, 1/16) and loops it. */
  looper(ac, env) {
    const io = dryWet(ac);
    const cap = ac.createGain();
    const d = ac.createDelay(2.5);
    const fb = ac.createGain();
    fb.gain.value = 0;
    io.input.connect(cap).connect(d);
    d.connect(fb).connect(d);
    d.connect(io.wet);
    let on = false;
    let len = 0;
    return {
      ...io,
      set(a) {
        const t = ac.currentTime;
        const want = a > 0.08;
        const newLen = Math.min(2.4, repeatBeats(a) * (60 / env.tempo()));
        if (want && !on) {
          on = true; len = newLen;
          d.delayTime.setValueAtTime(len, t);
          to(cap.gain, 0, ac, 0.003); to(fb.gain, 1, ac, 0.003); to(io.wet.gain, 1, ac, 0.003); to(io.dry.gain, 0, ac, 0.003);
        } else if (want && on && Math.abs(newLen - len) > 0.001) {
          len = newLen; d.delayTime.setValueAtTime(len, t);
        } else if (!want && on) {
          on = false;
          to(cap.gain, 1, ac, 0.003); to(fb.gain, 0, ac, 0.003); to(io.wet.gain, 0, ac, 0.01); to(io.dry.gain, 1, ac, 0.01);
        }
      },
    };
  },

  /** PHASER: six swept all-pass stages. */
  phaser(ac) {
    const io = dryWet(ac);
    const lfo = ac.createOscillator();
    const depth = ac.createGain();
    lfo.connect(depth);
    let node = io.input;
    for (let i = 0; i < 6; i++) {
      const ap = ac.createBiquadFilter();
      ap.type = 'allpass'; ap.frequency.value = 500 + i * 300; ap.Q.value = 0.5;
      depth.connect(ap.frequency);
      node.connect(ap);
      node = ap;
    }
    node.connect(io.wet);
    lfo.start();
    return {
      ...io,
      set(a) { to(io.wet.gain, a * 0.9, ac); to(io.dry.gain, 1 - a * 0.3, ac); to(lfo.frequency, 0.15 + a * 1.2, ac); to(depth.gain, 200 + a * 1400, ac); },
      dispose() { lfo.stop(); },
    };
  },

  /** FLANGER: a very short swept delay with feedback (the jet sound). */
  flanger(ac) {
    const io = dryWet(ac);
    const d = ac.createDelay(0.03);
    d.delayTime.value = 0.003;
    const fb = ac.createGain();
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.25;
    const depth = ac.createGain();
    depth.gain.value = 0.002;
    lfo.connect(depth).connect(d.delayTime);
    lfo.start();
    io.input.connect(d);
    d.connect(fb).connect(d);
    d.connect(io.wet);
    return {
      ...io,
      set(a) { to(io.wet.gain, a * 0.8, ac); to(fb.gain, a * 0.75, ac); to(lfo.frequency, 0.15 + a * 0.5, ac); },
      dispose() { lfo.stop(); },
    };
  },

  /** DELAY: tempo-synced dotted-8th echoes; more amount = louder and longer. */
  delay(ac, env) {
    const io = dryWet(ac);
    const d = ac.createDelay(2);
    const fb = ac.createGain();
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 3000;
    io.input.connect(d);
    d.connect(lp).connect(fb).connect(d);
    lp.connect(io.wet);
    const sync = (bpm) => to(d.delayTime, (60 / bpm) * 0.75, ac, 0.05);
    sync(env.tempo());
    return { ...io, tempo: sync, set(a) { to(io.wet.gain, a * 0.85, ac); to(fb.gain, 0.15 + a * 0.72, ac); } };
  },

  /**
   * TAPE STOP, expressive: where you are on the axis sets how fast the tape
   * slows (just past the start = a slow 3 s wind-down, the far end = an
   * instant stop). Drag back and it spins smoothly back up to speed; at the
   * start it catches up with the live sound.
   * How: the sound runs through a delay line; letting the delay grow at
   * (1 - speed) seconds per second plays it at `speed`.
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
    let amount = 0, last = 0, speed = 1, delay = 0, engaged = false;
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
        // Dragging back (or let go): spin back up; faster the further back you are.
        const spinUp = amount <= 0.05 ? 0.35 : 0.35 + amount * 1.2;
        speed = Math.min(1, speed + dt / spinUp);
      }
      last = amount;
      if (engaged) {
        delay = Math.min(7.9, delay + (1 - speed) * dt);
        d.delayTime.linearRampToValueAtTime(delay, t + TICK);
        g.gain.setTargetAtTime(Math.min(1, speed * 2.5), t, 0.01);
        tone.frequency.setTargetAtTime(250 + speed * speed * 19000, t, 0.01);
        // Back to full speed with the pad at the start: crossfade to the live sound.
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
      dispose() { clearInterval(timer); },
      get speed() { return speed; },
    };
  },

  /** STUTTER: chops the sound in time: 8ths, then 16ths, then 32nds. */
  stutter(ac, env) {
    const gate = ac.createGain();
    const lfo = ac.createOscillator();
    lfo.type = 'square';
    const depth = ac.createGain();
    depth.gain.value = 0;
    lfo.connect(depth).connect(gate.gain);
    lfo.start();
    let amt = 0;
    const rate = () => (env.tempo() / 60) * (amt < 0.4 ? 2 : amt < 0.75 ? 4 : 8);
    return {
      input: gate, output: gate,
      tempo: () => to(lfo.frequency, rate(), ac),
      set(a) {
        amt = a;
        const dep = Math.min(1, a * 1.6);
        to(gate.gain, 1 - dep / 2, ac, 0.005);
        to(depth.gain, dep / 2, ac, 0.005);
        lfo.frequency.setValueAtTime(rate(), ac.currentTime);
      },
      dispose() { lfo.stop(); },
    };
  },

  /** BIT CRUSHER: fewer bits and a lower-fi top end. */
  crusher(ac) {
    const io = dryWet(ac);
    const shaper = ac.createWaveShaper();
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    io.input.connect(shaper).connect(lp).connect(io.wet);
    let bits = 0;
    return {
      ...io,
      set(a) {
        const b = Math.round(16 - a * 13);
        if (b !== bits) { bits = b; const steps = Math.pow(2, b - 1); shaper.curve = shaperCurve((x) => Math.round(x * steps) / steps, 4096); }
        to(lp.frequency, 18000 * Math.pow(2500 / 18000, a), ac);
        const on = a > 0.02 ? 1 : 0;
        to(io.wet.gain, on, ac, 0.01); to(io.dry.gain, 1 - on, ac, 0.01);
      },
    };
  },

  /** LO-FI: lower sample rate + fewer bits + a little hiss (old samplers). */
  lofi(ac, env) {
    const io = dryWet(ac);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    let core;
    if (env.worklet) {
      core = workletNode(ac, 'slug-lofi');
      io.input.connect(core).connect(lp).connect(io.wet);
    } else { // fallback: bit reduction + darker top end
      core = ac.createWaveShaper();
      core.curve = shaperCurve((x) => Math.round(x * 24) / 24, 4096);
      io.input.connect(core).connect(lp).connect(io.wet);
    }
    return {
      ...io,
      set(a) {
        if (core.parameters) to(core.parameters.get('amount'), a, ac);
        to(lp.frequency, 16000 * Math.pow(3000 / 16000, a), ac);
        const on = a > 0.02 ? 1 : 0;
        to(io.wet.gain, on, ac, 0.01); to(io.dry.gain, 1 - on, ac, 0.01);
      },
    };
  },

  /** VINYL WOBBLE: a warped record: slow wow + fast flutter + crackle. */
  wobble(ac) {
    const input = ac.createGain();
    const output = ac.createGain();
    const d = ac.createDelay(0.1);
    d.delayTime.value = 0.02;
    const wow = ac.createOscillator(); wow.frequency.value = 0.55;
    const flut = ac.createOscillator(); flut.frequency.value = 6.3;
    const wowD = ac.createGain(); wowD.gain.value = 0;
    const flutD = ac.createGain(); flutD.gain.value = 0;
    wow.connect(wowD).connect(d.delayTime);
    flut.connect(flutD).connect(d.delayTime);
    wow.start(); flut.start();
    const tone = ac.createBiquadFilter();
    tone.type = 'lowpass'; tone.frequency.value = 20000;
    input.connect(d).connect(tone).connect(output);
    // Crackle: sparse clicks from filtered noise through a spiky shaper.
    const n = noiseSource(ac);
    const spike = ac.createWaveShaper();
    spike.curve = shaperCurve((x) => (Math.abs(x) > 0.985 ? x : 0));
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
    const crackle = ac.createGain(); crackle.gain.value = 0;
    n.connect(spike).connect(hp).connect(crackle).connect(output);
    n.start();
    return {
      input, output,
      set(a) {
        to(wowD.gain, a * 0.006, ac, 0.05);
        to(flutD.gain, a * 0.0004, ac, 0.05);
        to(crackle.gain, a * 1.2, ac, 0.05);
        to(tone.frequency, 20000 * Math.pow(5000 / 20000, a), ac);
      },
      dispose() { wow.stop(); flut.stop(); n.stop(); },
    };
  },

  /** TAPE SATURATION: warm drive into tape-style soft clipping, then fuzz. */
  saturate(ac) {
    const io = dryWet(ac);
    const pre = ac.createGain();
    const sh = ac.createWaveShaper();
    sh.oversample = '2x';
    sh.curve = shaperCurve((x) => Math.tanh(x));
    const warm = ac.createBiquadFilter(); warm.type = 'lowshelf'; warm.frequency.value = 180; warm.gain.value = 3;
    const top = ac.createBiquadFilter(); top.type = 'lowpass'; top.frequency.value = 9000;
    const post = ac.createGain();
    io.input.connect(pre).connect(sh).connect(warm).connect(top).connect(post).connect(io.wet);
    return {
      ...io,
      set(a) {
        const drive = 1 + a * 14;
        to(pre.gain, drive, ac);
        to(post.gain, 1 / Math.sqrt(drive), ac); // keep the level about the same
        to(top.frequency, 12000 - a * 7000, ac);
        const on = a > 0.02 ? 1 : 0;
        to(io.wet.gain, on, ac, 0.01); to(io.dry.gain, 1 - on, ac, 0.01);
      },
    };
  },

  /** REVERB WASH: drowns the mix in a big, dark room. */
  wash(ac) {
    const io = dryWet(ac);
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 250;
    const conv = ac.createConvolver();
    conv.buffer = impulse(ac, 4.5, 2.2);
    io.input.connect(hp).connect(conv).connect(io.wet);
    return { ...io, set(a) { to(io.wet.gain, a * 1.4, ac, 0.05); to(io.dry.gain, 1 - a * 0.55, ac, 0.05); } };
  },

  /** CHORUS: wide, shimmering doubles. */
  chorus(ac) {
    const ch = makeChorus(ac);
    ch.set({ mix: 0, depth: 0.001, rate: 0.5 });
    return { input: ch.input, output: ch.output, set(a) { ch.set({ mix: a * 0.9, depth: 0.001 + a * 0.004, rate: 0.35 + a * 0.9 }); } };
  },

  /** RING MOD: multiplies the sound by a tone: metallic, bell-like, higher as you go. */
  ringmod(ac) {
    const io = dryWet(ac);
    const ring = ac.createGain();
    ring.gain.value = 0;
    const osc = ac.createOscillator();
    osc.frequency.value = 40;
    osc.connect(ring.gain);
    osc.start();
    io.input.connect(ring).connect(io.wet);
    return {
      ...io,
      set(a) { to(osc.frequency, 30 * Math.pow(40, a), ac, 0.03); to(io.wet.gain, Math.min(1, a * 2.2), ac); to(io.dry.gain, 1 - Math.min(0.85, a * 1.5), ac); },
      dispose() { osc.stop(); },
    };
  },

  /** PITCH DIVE: the pitch falls as you go, up to two octaves down. */
  dive(ac, env) {
    const io = dryWet(ac);
    if (env.worklet) {
      const ps = workletNode(ac, 'slug-pitch');
      io.input.connect(ps).connect(io.wet);
      return {
        ...io,
        set(a) {
          ps.parameters.get('semitones').setTargetAtTime(-24 * Math.pow(a, 1.3), ac.currentTime, 0.03);
          const on = a > 0.01 ? 1 : 0;
          to(io.wet.gain, on, ac, 0.02); to(io.dry.gain, 1 - on, ac, 0.02);
        },
      };
    }
    // Fallback: a short delay swept downward (a gentler wobbly dive).
    const d = ac.createDelay(0.2);
    io.input.connect(d).connect(io.wet);
    return { ...io, set(a) { to(d.delayTime, a * 0.15, ac, 0.3); to(io.wet.gain, a > 0.01 ? 1 : 0, ac, 0.02); to(io.dry.gain, a > 0.01 ? 0 : 1, ac, 0.02); } };
  },

  /** TRANCE GATE: a rhythmic chop pattern locked to the tempo; busier as you go. */
  gate(ac, env) {
    const io = dryWet(ac);
    const vca = ac.createGain();
    vca.gain.value = 0;
    io.input.connect(vca).connect(io.wet);
    const PATTERNS = [
      [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0],
      [1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1],
    ];
    let src = null, patIdx = -1, on = false;
    // The pattern is one bar of envelope, looped as a control signal into the gate.
    function build(p) {
      const sr = 8000;
      const bar = (60 / env.tempo()) * 4;
      const len = Math.round(bar * sr);
      const buf = ac.createBuffer(1, len, sr);
      const dd = buf.getChannelData(0);
      const step = len / 16;
      for (let i = 0; i < len; i++) {
        const k = Math.floor(i / step);
        const ph = (i - k * step) / step;
        dd[i] = PATTERNS[p][k] ? Math.min(1, ph * 40) * (1 - Math.max(0, ph - 0.7) / 0.3) : 0;
      }
      return buf;
    }
    function startPattern(p) {
      if (src) { try { src.stop(); } catch (e) { /* stopped */ } src.disconnect(); }
      src = ac.createBufferSource();
      src.buffer = build(p);
      src.loop = true;
      src.connect(vca.gain);
      src.start();
      patIdx = p;
    }
    return {
      ...io,
      tempo() { if (on) startPattern(patIdx); },
      set(a) {
        const want = a > 0.03;
        const p = a < 0.4 ? 0 : a < 0.75 ? 1 : 2;
        if (want && (!on || p !== patIdx)) startPattern(p);
        if (!want && on && src) { try { src.stop(ac.currentTime + 0.05); } catch (e) { /* stopped */ } src = null; }
        on = want;
        const depth = Math.min(1, a * 1.8);
        to(io.wet.gain, want ? depth : 0, ac, 0.01);
        to(io.dry.gain, want ? 1 - depth : 1, ac, 0.01);
      },
      dispose() { if (src) try { src.stop(); } catch (e) { /* stopped */ } },
    };
  },

  /** REVERSE REPEAT: plays the last beat (or less) backwards, looped. */
  reverse(ac, env) {
    if (!env.worklet) return MAKERS.looper(ac, env); // fallback: a normal beat repeat
    const rv = workletNode(ac, 'slug-reverse');
    return {
      input: rv, output: rv,
      set(a) {
        const on = a > 0.08;
        rv.parameters.get('length').setValueAtTime(Math.min(2, repeatBeats(a) * 2 * (60 / env.tempo())), ac.currentTime);
        rv.parameters.get('on').setValueAtTime(on ? 1 : 0, ac.currentTime);
      },
    };
  },
};
