// TRIP — experimental feedback FM for trippy, warped, psychedelic sounds.
// Method: three operators in a chain (op3 -> op2 -> op1) with odd,
// non-integer ratios, plus a short delayed feedback path from the output back
// into op3, so the spectrum folds and tangles. DRIFT adds slow, uneven LFOs
// that wander the ratios, pitch and stereo position.
//   WEIRD  modulation depth + ratio chaos
//   DRIFT  amount and speed of the slow random movement

import { mtof, adsr, makeVoice } from '../util.js';

export function createTrip(ac) {
  function voice(slot, p, midi, vel, t, dest) {
    const [weird, drift] = slot.knobs;
    const f = mtof(midi);
    const ratios = (p.ratios || [1, 1.41, 3.17]).map((r, i) => (i === 0 ? r : r + (Math.random() - 0.5) * weird * 0.3));
    const amp = ac.createGain();
    amp.gain.value = 0;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2500 + (1 - weird) * 4000;
    const pan = ac.createStereoPanner ? ac.createStereoPanner() : ac.createGain();
    amp.connect(lp).connect(pan).connect(dest);

    const ops = ratios.map((r) => { const o = ac.createOscillator(); o.frequency.value = f * r; return o; });
    const g2 = ac.createGain();
    const g3 = ac.createGain();
    const depth = 0.4 + weird * 6;
    g2.gain.setValueAtTime(depth * f * ratios[1] * vel, t);
    g2.gain.setTargetAtTime(depth * f * ratios[1] * 0.4, t, 0.6);
    g3.gain.value = depth * 0.6 * f * ratios[2];
    ops[2].connect(g3).connect(ops[1].frequency);
    ops[1].connect(g2).connect(ops[0].frequency);
    ops[0].connect(amp);

    // Feedback: output -> short delay -> op3's frequency.
    const fbDelay = ac.createDelay(0.05);
    fbDelay.delayTime.value = 0.003 + weird * 0.01;
    const fb = ac.createGain();
    fb.gain.value = weird * f * 0.8;
    ops[0].connect(fbDelay).connect(fb).connect(ops[2].frequency);

    // Drift: three slow LFOs at uneven rates.
    const lfos = [0.07, 0.113, 0.191].map((rate, i) => {
      const l = ac.createOscillator();
      l.frequency.value = rate * (0.5 + drift * 2) * (1 + Math.random() * 0.3);
      const lg = ac.createGain();
      l.connect(lg);
      if (i === 0) { lg.gain.value = drift * 25; lg.connect(ops[0].detune); }
      if (i === 1) { lg.gain.value = drift * f * 0.08; lg.connect(ops[1].frequency); }
      if (i === 2 && pan.pan) { lg.gain.value = drift * 0.7; lg.connect(pan.pan); }
      return l;
    });

    adsr(amp.gain, t, 0.2 * (0.4 + 0.6 * vel), 0.03, 1.5, 0.6);
    const srcs = [...ops, ...lfos];
    srcs.forEach((o) => o.start(t));
    return makeVoice(ac, amp, srcs, { t, a: 0.03, r: 0.6 });
  }

  return { voice, sends: ([weird, drift]) => ({ reverb: 0.2 + drift * 0.25, delay: 0.05 + weird * 0.1 }) };
}
