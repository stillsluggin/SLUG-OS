// SHINE — crisp digital / wavetable leads (and the 8-BIT chip presets).
// Method: single-cycle wavetables built from harmonic spectra (PeriodicWave),
// stacked in detuned, stereo-spread unison. No analog filter sweep: brightness
// comes from which table plays. Original tables only.
//   SPARKLE  picks a brighter table + adds top-end bite
//   AIR      the player's stereo delay + reverb send (space and shimmer)

import { mtof, adsr, makeVoice, periodicWave, pulseAmp } from '../util.js';

// Harmonic recipes. `bright` 0..1 tilts the spectrum.
const TABLES = {
  crystal: (b) => (h) => (h % 2 ? 1 : 0.6) / Math.pow(h, 1.6 - b * 0.9) * (h === 3 || h === 5 ? 1.4 : 1),
  bell: (b) => (h) => ([1, 2, 4, 7, 11].includes(h) ? 1 / Math.pow(h, 0.9 - b * 0.4) : 0.02 / h),
  glass: (b) => (h) => (1 / Math.pow(h, 1.25 - b * 0.6)) * (h === 2 || h === 5 ? 1.5 : 1),
  pulse25: () => pulseAmp(0.25),
  pulse12: () => pulseAmp(0.125),
};

export function createShine(ac) {
  const table = (name, sparkle) => {
    const b = Math.round(sparkle * 4) / 4;
    return periodicWave(ac, `shine:${name}:${b}`, TABLES[name](b), name.startsWith('pulse') ? 32 : 40);
  };

  function voice(slot, p, midi, vel, t, dest, { from, dur } = {}) {
    const [sparkle] = slot.knobs;
    const f = mtof(midi);
    const f0 = from != null ? mtof(from) : f;
    const amp = ac.createGain();
    amp.gain.value = 0;
    const shelf = ac.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 3000;
    shelf.gain.value = p.chip ? 0 : -6 + sparkle * 12;
    shelf.connect(amp).connect(dest);
    const n = p.unison ?? 1;
    const oscs = [];
    for (let i = 0; i < n; i++) {
      const o = ac.createOscillator();
      o.setPeriodicWave(table(p.table || 'crystal', sparkle));
      o.frequency.setValueAtTime(f0, t);
      if (from != null) o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      o.detune.value = n > 1 ? (i - (n - 1) / 2) * (6 + sparkle * 6) : 0;
      const pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
      const g = ac.createGain();
      g.gain.value = 1 / n;
      if (pan) { pan.pan.value = n > 1 ? (i - (n - 1) / 2) * 0.6 : 0; o.connect(g).connect(pan).connect(shelf); }
      else o.connect(g).connect(shelf);
      oscs.push(o);
    }
    // 8-bit: stepped vibrato or a fast arpeggio, like an old game chip.
    if (p.chip) {
      const steps = p.arp ? [0, 12, 7] : [0, 15, 0, -15];
      const rate = p.arp ? 1 / 30 : 1 / 12;
      const total = Math.min(dur ?? 2, 3);
      for (let k = 0, at = t + (p.arp ? 0 : 0.2); at < t + total; k++, at += rate) {
        oscs.forEach((o) => o.detune.setValueAtTime(steps[k % steps.length] * (p.arp ? 100 : 1), at));
      }
    }
    const a = p.chip ? 0.002 : 0.012;
    adsr(amp.gain, t, (p.chip ? 0.13 : 0.22) * (0.4 + 0.6 * vel), a, p.decay ?? 0.4, p.sustain ?? 0.75);
    oscs.forEach((o) => o.start(t));
    return makeVoice(ac, amp, oscs, {
      t, a, r: p.chip ? 0.05 : 0.25,
      extra: {
        /** Turning SPARKLE while it plays: more or less top-end bite. */
        update([sp]) { if (!p.chip) shelf.gain.setTargetAtTime(-6 + sp * 12, ac.currentTime, 0.03); },
      },
    });
  }

  /** AIR: ping-pong-ish stereo delay with a bright feedback path. */
  function insert() {
    const input = ac.createGain();
    const output = ac.createGain();
    input.connect(output);
    const merger = ac.createChannelMerger(2);
    const dl = ac.createDelay(1);
    const dr = ac.createDelay(1);
    dl.delayTime.value = 0.23;
    dr.delayTime.value = 0.31;
    const fb = ac.createGain();
    const wet = ac.createGain();
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 700;
    input.connect(hp).connect(dl);
    dl.connect(dr);
    dr.connect(fb).connect(dl);
    dl.connect(merger, 0, 0);
    dr.connect(merger, 0, 1);
    merger.connect(wet).connect(output);
    return {
      input, output,
      set([, air]) {
        const now = ac.currentTime;
        fb.gain.setTargetAtTime(0.2 + air * 0.45, now, 0.05);
        wet.gain.setTargetAtTime(air * 0.55, now, 0.05);
      },
    };
  }

  return { voice, insert, sends: ([, air]) => ({ reverb: 0.08 + air * 0.4, delay: 0 }) };
}
