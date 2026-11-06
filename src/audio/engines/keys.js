// KEYS — FM tine-and-bell electric piano.
// Method: 2-operator FM (1:1 ratio, the "tine" body) plus a fast-decaying
// high bell partial. TONE sets how much the modulation index grows with
// velocity: mellow when soft, barky when played hard. WAVE drives the player's
// insert: tremolo + slow phaser + chorus swirl.

import { mtof, adsr, makeVoice, makeChorus } from '../util.js';

export function createKeys(ac) {
  function voice(slot, p, midi, vel, t, dest, { from } = {}) {
    const [wave, tone] = slot.knobs;
    const f = mtof(midi);
    const f0 = from != null ? mtof(from) : f;
    const amp = ac.createGain();
    amp.gain.value = 0;
    amp.connect(dest);

    const car = ac.createOscillator();
    const mod = ac.createOscillator();
    const car2 = ac.createOscillator(); // a slightly detuned twin for warmth
    for (const [o, mul] of [[car, 1], [mod, 1], [car2, 1]]) {
      o.frequency.setValueAtTime(f0 * mul, t);
      if (from != null) o.frequency.exponentialRampToValueAtTime(f * mul, t + 0.06);
    }
    car2.detune.value = 4 + wave * 4;
    const index = (0.5 + tone * 2.8 * Math.pow(vel, 1.4)) * f;
    const mg = ac.createGain();
    mg.gain.setValueAtTime(index, t);
    mg.gain.setTargetAtTime(index * 0.18, t, 0.25 + (1 - tone) * 0.3);
    mod.connect(mg);
    mg.connect(car.frequency);
    mg.connect(car2.frequency);
    const c2 = ac.createGain();
    c2.gain.value = 0.45;
    car.connect(amp);
    car2.connect(c2).connect(amp);

    // Bell / tine partial
    const bell = ac.createOscillator();
    bell.frequency.value = f * 14;
    const bg = ac.createGain();
    bg.gain.setValueAtTime((p.bell ?? 0.14) * vel * (0.4 + tone), t);
    bg.gain.setTargetAtTime(0, t, 0.04);
    bell.connect(bg).connect(amp);

    const decay = (p.decay ?? 2) * Math.pow(261.6 / f, 0.35);
    adsr(amp.gain, t, 0.3 * (0.3 + 0.7 * vel), 0.006, decay, 0.16);
    const srcs = [car, car2, mod, bell];
    srcs.forEach((o) => o.start(t));
    return makeVoice(ac, amp, srcs, { t, a: 0.006, r: 0.35 });
  }

  /** The WAVE swirl: tremolo -> 4-stage phaser -> chorus. */
  function insert() {
    const input = ac.createGain();
    const trem = ac.createGain();
    const tLfo = ac.createOscillator();
    tLfo.frequency.value = 4.5;
    const tDepth = ac.createGain();
    tLfo.connect(tDepth).connect(trem.gain);
    tLfo.start();
    input.connect(trem);

    const stages = [];
    let node = trem;
    const pLfo = ac.createOscillator();
    pLfo.frequency.value = 0.18;
    const pDepth = ac.createGain();
    pLfo.connect(pDepth);
    pLfo.start();
    for (let i = 0; i < 4; i++) {
      const ap = ac.createBiquadFilter();
      ap.type = 'allpass';
      ap.frequency.value = 600 + i * 400;
      ap.Q.value = 0.6;
      pDepth.connect(ap.frequency);
      node.connect(ap);
      node = ap;
      stages.push(ap);
    }
    const phaseMix = ac.createGain();
    const dry = ac.createGain();
    trem.connect(dry);
    node.connect(phaseMix);
    const sum = ac.createGain();
    dry.connect(sum);
    phaseMix.connect(sum);
    const chorus = makeChorus(ac);
    sum.connect(chorus.input);
    return {
      input,
      output: chorus.output,
      set([wave]) {
        const now = ac.currentTime;
        trem.gain.setTargetAtTime(1 - wave * 0.25, now, 0.05);
        tDepth.gain.setTargetAtTime(wave * 0.25, now, 0.05);
        pDepth.gain.setTargetAtTime(200 + wave * 900, now, 0.05);
        phaseMix.gain.setTargetAtTime(wave * 0.7, now, 0.05);
        dry.gain.setTargetAtTime(1 - wave * 0.3, now, 0.05);
        chorus.set({ mix: 0.15 + wave * 0.5, depth: 0.0008 + wave * 0.0022, rate: 0.4 + wave * 0.5 });
      },
    };
  }

  return { voice, insert, sends: ([wave]) => ({ reverb: 0.18 + wave * 0.15, delay: 0.04 }) };
}
