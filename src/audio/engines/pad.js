// PAD — Juno-style ensemble.
// Method: two detuned saws + a pulse + a sub per voice, a gentle low-pass,
// then the player's stereo BBD-style chorus (the classic shimmer).
//   WIDTH  detune + chorus depth + stereo spread
//   GLOW   filter brightness

import { mtof, adsr, makeVoice, periodicWave, pulseAmp, makeChorus } from '../util.js';

export function createPad(ac) {
  function voice(slot, p, midi, vel, t, dest) {
    const [width, glow] = slot.knobs;
    const f = mtof(midi);
    const amp = ac.createGain();
    amp.gain.value = 0;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.8;
    const cut = 500 + glow * glow * 6500;
    lp.frequency.setValueAtTime(cut * 0.6, t);
    lp.frequency.linearRampToValueAtTime(cut, t + 0.4 + (p.attack ?? 0.3));
    lp.connect(amp).connect(dest);
    const det = 5 + width * 12;
    const parts = [['sawtooth', -det, 0.35], ['sawtooth', det, 0.35], ['pulse', 0, 0.25], ['sine-sub', 0, 0.2]];
    const oscs = parts.map(([type, d, g]) => {
      const o = ac.createOscillator();
      if (type === 'pulse') o.setPeriodicWave(periodicWave(ac, 'pulse40', pulseAmp(0.4)));
      else o.type = type === 'sine-sub' ? 'sine' : type;
      o.frequency.value = type === 'sine-sub' ? f / 2 : f;
      o.detune.value = d;
      const gg = ac.createGain();
      gg.gain.value = g;
      o.connect(gg).connect(lp);
      return o;
    });
    const a = p.attack ?? 0.3;
    adsr(amp.gain, t, 0.16 * (0.5 + 0.5 * vel), a, 1.2, 0.85);
    oscs.forEach((o) => o.start(t));
    return makeVoice(ac, amp, oscs, { t, a, r: 0.9 });
  }

  function insert() {
    const ch = makeChorus(ac);
    return {
      input: ch.input,
      output: ch.output,
      set([width]) { ch.set({ mix: 0.35 + width * 0.6, depth: 0.0015 + width * 0.003, rate: 0.45 + width * 0.4 }); },
    };
  }

  return { voice, insert, sends: ([width]) => ({ reverb: 0.25 + width * 0.15, delay: 0.03 }) };
}
