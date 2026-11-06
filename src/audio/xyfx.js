// xyfx.js — the XY pad's effects on the master bus. Two slots (X and Y) in
// series. Each effect takes one amount 0..1 and is fully transparent at 0.

import { repeatBeats } from '../core/xy.js';

const SMOOTH = 0.02;

export function createXY(ac) {
  const input = ac.createGain();
  const output = ac.createGain();
  let tempo = 90;
  const slots = { x: null, y: null };
  const ids = { x: null, y: null };
  const amounts = { x: 0, y: 0 };

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
    if (old) { old.set(0); setTimeout(() => old.dispose && old.dispose(), 300); }
    ids[axis] = id;
    slots[axis] = MAKERS[id] ? MAKERS[id](ac, () => tempo) : null;
    wire();
    if (slots[axis]) slots[axis].set(amounts[axis]);
  }

  function setAmount(axis, v) {
    amounts[axis] = Math.max(0, Math.min(1, v));
    if (slots[axis]) slots[axis].set(amounts[axis]);
  }

  wire();
  return {
    input, output, setEffect, setAmount,
    setTempo(bpm) { tempo = bpm; for (const s of Object.values(slots)) s && s.tempo && s.tempo(bpm); },
    get ids() { return { ...ids }; },
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

// ---------------------------------------------------------------- effects

const MAKERS = {
  /** FILTER: low-pass sweep, a little resonant. */
  filter(ac) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 20000;
    return {
      input: f, output: f,
      set(a) { to(f.frequency, 20000 * Math.pow(160 / 20000, a), ac); to(f.Q, 0.7 + a * 7, ac); },
    };
  },

  /** ISOLATOR: 3-band kill EQ. First half kills the lows, second half kills the mids too. */
  isolator(ac) {
    const lo = ac.createBiquadFilter();
    lo.type = 'lowshelf'; lo.frequency.value = 280;
    const mid = ac.createBiquadFilter();
    mid.type = 'peaking'; mid.frequency.value = 1100; mid.Q.value = 0.6;
    lo.connect(mid);
    return {
      input: lo, output: mid,
      set(a) {
        to(lo.gain, -40 * Math.min(1, a * 2), ac);
        to(mid.gain, -30 * Math.max(0, a * 2 - 1), ac);
      },
    };
  },

  /** BEAT REPEAT: grabs the last beat (or 1/2, 1/4, 1/8, 1/16) and loops it. */
  looper(ac, getTempo) {
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
    const beat = () => 60 / getTempo();
    return {
      ...io,
      set(a) {
        const t = ac.currentTime;
        const want = a > 0.08;
        const newLen = Math.min(2.4, repeatBeats(a) * beat());
        if (want && !on) {
          on = true;
          len = newLen;
          d.delayTime.setValueAtTime(len, t);
          // The delay line holds the last `len` seconds: stop feeding it and loop it.
          to(cap.gain, 0, ac, 0.003); to(fb.gain, 1, ac, 0.003); to(io.wet.gain, 1, ac, 0.003); to(io.dry.gain, 0, ac, 0.003);
        } else if (want && on && Math.abs(newLen - len) > 0.001) {
          len = newLen;
          d.delayTime.setValueAtTime(len, t);
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
      ap.type = 'allpass';
      ap.frequency.value = 500 + i * 300;
      ap.Q.value = 0.5;
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
  delay(ac, getTempo) {
    const io = dryWet(ac);
    const d = ac.createDelay(2);
    const fb = ac.createGain();
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 3000;
    io.input.connect(d);
    d.connect(lp).connect(fb).connect(d);
    lp.connect(io.wet);
    const sync = (bpm) => to(d.delayTime, (60 / bpm) * 0.75, ac, 0.05);
    sync(getTempo());
    return {
      ...io,
      tempo: sync,
      set(a) { to(io.wet.gain, a * 0.85, ac); to(fb.gain, 0.15 + a * 0.72, ac); },
    };
  },

  /** TAPE STOP: everything slows to a halt like a turntable losing power. */
  tapestop(ac) {
    const d = ac.createDelay(2);
    d.delayTime.value = 0;
    const g = ac.createGain();
    d.connect(g);
    let on = false;
    return {
      input: d, output: g,
      set(a) {
        const t = ac.currentTime;
        if (a > 0.1 && !on) {
          on = true;
          const T = 1.8 - a * 1.4; // drag further = faster stop
          // Delay growing as t²/2T makes the pitch fall smoothly to zero over T seconds.
          const curve = new Float32Array(64);
          for (let i = 0; i < 64; i++) { const x = (i / 63) * T; curve[i] = (x * x) / (2 * T); }
          d.delayTime.cancelScheduledValues(t);
          d.delayTime.setValueCurveAtTime(curve, t, T);
          g.gain.cancelScheduledValues(t);
          g.gain.setValueAtTime(1, t);
          g.gain.setTargetAtTime(0, t + T * 0.7, T * 0.15);
        } else if (a <= 0.1 && on) {
          on = false;
          // Back up to speed: quick fade out, jump back to real time, fade in.
          g.gain.cancelScheduledValues(t);
          g.gain.setValueAtTime(g.gain.value, t);
          g.gain.linearRampToValueAtTime(0, t + 0.02);
          d.delayTime.cancelScheduledValues(t + 0.02);
          d.delayTime.setValueAtTime(0, t + 0.025);
          g.gain.linearRampToValueAtTime(1, t + 0.07);
        }
      },
    };
  },

  /** STUTTER: chops the sound in time: 8ths, then 16ths, then 32nds. */
  stutter(ac, getTempo) {
    const gate = ac.createGain();
    const lfo = ac.createOscillator();
    lfo.type = 'square';
    const depth = ac.createGain();
    depth.gain.value = 0;
    lfo.connect(depth).connect(gate.gain);
    lfo.start();
    let amt = 0;
    const rate = () => (getTempo() / 60) * (amt < 0.4 ? 2 : amt < 0.75 ? 4 : 8);
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
        if (b !== bits) {
          bits = b;
          const steps = Math.pow(2, b - 1);
          const curve = new Float32Array(4096);
          for (let i = 0; i < curve.length; i++) { const x = (i / (curve.length - 1)) * 2 - 1; curve[i] = Math.round(x * steps) / steps; }
          shaper.curve = curve;
        }
        to(lp.frequency, 18000 * Math.pow(2500 / 18000, a), ac);
        const on = a > 0.02 ? 1 : 0;
        to(io.wet.gain, on, ac, 0.01);
        to(io.dry.gain, 1 - on, ac, 0.01);
      },
    };
  },
};
