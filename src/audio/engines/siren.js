// SIREN — risers, sweeps, drops and transition effects.
// Method: oscillators whose pitch is swept by long automation curves, plus
// band-passed noise swept alongside. The note you press sets where the sweep
// starts.
//   RISE   sweep range (up to 4 octaves)
//   SPEED  sweep time (slow build to quick zap)

import { mtof, makeVoice, noiseSource } from '../util.js';

export function createSiren(ac) {
  function voice(slot, p, midi, vel, t, dest) {
    const [rise, speed] = slot.knobs;
    const shape = p.shape || 'rise';
    const f = mtof(midi);
    const span = Math.pow(2, 0.25 + rise * 3.75);
    const time = 0.25 + (1 - speed) * 7.5;
    const amp = ac.createGain();
    amp.gain.value = 0;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2.5;
    const toneMix = ac.createGain();
    toneMix.gain.value = shape === 'whoosh' ? 0 : 0.5;
    const noiseMix = ac.createGain();
    noiseMix.gain.value = shape === 'whoosh' ? 1.2 : 0.35;
    toneMix.connect(amp);
    bp.connect(noiseMix).connect(amp);
    amp.connect(dest);

    const o1 = ac.createOscillator();
    const o2 = ac.createOscillator();
    o1.type = 'sawtooth';
    o2.type = 'square';
    o2.detune.value = 7;
    const og = ac.createGain();
    og.gain.value = 0.5;
    o1.connect(toneMix);
    o2.connect(og).connect(toneMix);
    const noise = noiseSource(ac);
    noise.connect(bp);

    const freqs = [o1.frequency, o2.frequency];
    const peak = 0.22 * (0.5 + 0.5 * vel);
    const end = t + time;
    if (shape === 'siren') {
      // Up-and-down wail, repeating.
      const rate = 0.3 + speed * 3.5;
      const n = Math.ceil(12 * rate); // cycles in 12 s
      const curve = new Float32Array(64);
      for (let i = 0; i < 64; i++) curve[i] = f * Math.pow(span, 0.5 - 0.5 * Math.cos((i / 63) * Math.PI * 2));
      for (let k = 0; k < n; k++) freqs.forEach((fr) => fr.setValueCurveAtTime(curve, t + k / rate, 1 / rate - 0.001));
      bp.frequency.value = f * 4;
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(peak, t + 0.05);
    } else if (shape === 'drop') {
      freqs.forEach((fr) => { fr.setValueAtTime(f * span, t); fr.exponentialRampToValueAtTime(Math.max(20, f / 4), end); });
      bp.frequency.setValueAtTime(Math.min(12000, f * span * 4), t);
      bp.frequency.exponentialRampToValueAtTime(200, end);
      amp.gain.setValueAtTime(peak, t);
      amp.gain.setTargetAtTime(peak * 0.3, t + time * 0.6, time * 0.2);
    } else {
      // rise and whoosh: build up.
      freqs.forEach((fr) => { fr.setValueAtTime(f, t); fr.exponentialRampToValueAtTime(f * span, end); });
      bp.frequency.setValueAtTime(400, t);
      bp.frequency.exponentialRampToValueAtTime(Math.min(14000, 400 * span * 2), end);
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(peak, end);
      if (shape === 'whoosh') amp.gain.setTargetAtTime(0, end, time * 0.3);
    }
    const srcs = [o1, o2, noise];
    srcs.forEach((o) => o.start(t));
    return makeVoice(ac, amp, srcs, { t, a: 0.01, r: 0.4, autoEnd: shape === 'siren' ? t + 12 : end + (shape === 'whoosh' ? time : 4) });
  }

  return { voice, sends: ([rise]) => ({ reverb: 0.3 + rise * 0.2, delay: 0.12 }) };
}
