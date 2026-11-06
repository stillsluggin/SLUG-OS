// ANALOG — Moog-style subtractive synth, shared by bass and lead.
// Method: saw / square / triangle / sine oscillators + a sub oscillator into a
// 24 dB low-pass (two cascaded resonant stages, ladder-style) with its own
// envelope, then an amp envelope. Mono players glide between notes.
//   GLIDE    portamento time (long sliding G-funk bass at the top)
//   SQUELCH  filter envelope depth + resonance (funk squelch at the top)

import { mtof, adsr, makeVoice, holdAt } from '../util.js';

const WAVES = {
  'sine+saw': [['sine', 0.7], ['sawtooth', 0.35]],
  saw: [['sawtooth', 0.8]],
  'sine+tri': [['sine', 0.8], ['triangle', 0.4]],
  'square+saw': [['square', 0.45], ['sawtooth', 0.4]],
};

export function createAnalog(ac) {
  function voice(slot, p, midi, vel, t, dest, { from } = {}) {
    const [glide, squelch] = slot.knobs;
    const glideTime = 0.02 + glide * 0.3;
    const f = mtof(midi);
    const amp = ac.createGain();
    amp.gain.value = 0;
    const lp1 = ac.createBiquadFilter();
    const lp2 = ac.createBiquadFilter();
    lp1.type = lp2.type = 'lowpass';
    lp1.Q.value = 0.7 + squelch * 11;
    lp2.Q.value = 0.6;
    lp1.connect(lp2).connect(amp).connect(dest);

    const oscs = [];
    const freqs = [];
    const fat = slot.knobs[3] ?? 0; // MORPH: FAT spreads the oscillators apart
    let oi = 0;
    for (const [type, g] of WAVES[p.wave] || WAVES.saw) {
      const o = ac.createOscillator();
      o.type = type;
      o.detune.value = (oi++ % 2 ? 1 : -1) * fat * 14;
      const gg = ac.createGain();
      gg.gain.value = g;
      o.connect(gg).connect(lp1);
      oscs.push(o);
      freqs.push([o.frequency, 1]);
    }
    if (p.sub) {
      const s = ac.createOscillator();
      s.type = 'sine';
      const sg = ac.createGain();
      sg.gain.value = p.sub;
      s.connect(sg).connect(lp1);
      oscs.push(s);
      freqs.push([s.frequency, 0.5]);
    }
    const setPitch = (fNew, at, fromF) => {
      for (const [param, mul] of freqs) {
        holdAt(param, at);
        if (fromF) param.setValueAtTime(fromF * mul, at);
        param.exponentialRampToValueAtTime(fNew * mul, at + (fromF || glide > 0.02 ? glideTime : 0.005));
      }
    };
    freqs.forEach(([param, mul]) => param.setValueAtTime((from != null ? mtof(from) : f) * mul, t));
    if (from != null) setPitch(f, t);

    // Vibrato (leads)
    if (p.vib) {
      const lfo = ac.createOscillator();
      lfo.frequency.value = 5.3;
      const lg = ac.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(p.vib, t + 0.5);
      lfo.connect(lg);
      oscs.forEach((o) => lg.connect(o.detune));
      oscs.push(lfo);
    }

    const base = Math.min(12000, (p.cutoff ?? 500) * Math.pow(f / 110, 0.5));
    const filterEnv = (at, v) => {
      const peak = Math.min(16000, base * (1 + squelch * 12 * (0.4 + 0.6 * v)));
      for (const fl of [lp1, lp2]) {
        holdAt(fl.frequency, at);
        fl.frequency.setValueAtTime(peak, at);
        fl.frequency.setTargetAtTime(base, at + 0.003, 0.04 + (p.decay ?? 0.5) * 0.25 * (1 - squelch * 0.5));
      }
    };
    lp1.frequency.value = lp2.frequency.value = base;
    filterEnv(t, vel);
    const peakAmp = 0.32 * (0.35 + 0.65 * vel);
    adsr(amp.gain, t, peakAmp, 0.005, p.decay ?? 0.5, p.sustain ?? 0.7);
    oscs.forEach((o) => o.start(t));
    let curF = f;
    return makeVoice(ac, amp, oscs, {
      t, a: 0.005, r: 0.12,
      extra: {
        /** Mono legato: slide to a new note without re-striking the oscillators. */
        glideTo(m, v, at) {
          const nf = mtof(m);
          setPitch(nf, at, null);
          curF = nf;
          filterEnv(at, v * 0.8);
          holdAt(amp.gain, at);
          amp.gain.linearRampToValueAtTime(peakAmp * (0.6 + 0.4 * v), at + 0.01);
          amp.gain.setTargetAtTime(peakAmp * (p.sustain ?? 0.7), at + 0.01, (p.decay ?? 0.5) / 3);
          return true;
        },
      },
    });
  }

  return { voice, sends: ([, squelch]) => ({ reverb: 0.06, delay: 0.02 + squelch * 0.04 }) };
}
