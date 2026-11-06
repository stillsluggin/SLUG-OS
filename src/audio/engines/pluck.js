// PLUCK — plucked-string physical model (Karplus-Strong).
// Method: a short burst of noise (the pluck) circulates in a delay line one
// period long; a damping filter in the loop makes the string decay and mellow
// like a real one. Each note is computed in JavaScript on the first press and
// cached, then played as a buffer, so it runs on every browser (no worklet).
//   THUMP   pluck shape: thumb-soft and round + body boom (Motown bass) vs pick
//   MUFFLE  palm mute: more loop damping and a shorter ring

import { mtof, makeVoice } from '../util.js';

export function createPluck(ac) {
  const cache = new Map();

  function render(f, thump, muffle, body, decay, velBucket) {
    const key = `${f.toFixed(2)}|${thump.toFixed(1)}|${muffle.toFixed(1)}|${body}|${decay}|${velBucket}`;
    if (cache.has(key)) return cache.get(key);
    const sr = ac.sampleRate;
    const period = sr / f;
    const len = Math.floor(sr * Math.min(4, 1.2 + (1 - muffle) * 2.8 * Math.pow(110 / f, 0.3)));
    const out = new Float32Array(len);
    const N = Math.max(2, Math.floor(period));
    const frac = period - N;
    // Excitation: noise, smoothed more for a thumb pluck, plus a half-sine "thump".
    let lp = 0;
    const smooth = 0.15 + (1 - thump) * 0.8;
    const amp = 0.5 + 0.5 * (velBucket / 2);
    for (let i = 0; i < N; i++) {
      lp += smooth * ((Math.random() * 2 - 1) - lp);
      out[i] = amp * (lp * (1 - thump * 0.6) + thump * 0.8 * Math.sin((Math.PI * i) / N));
    }
    // Loop damping: one-pole low-pass inside the loop + a decay factor.
    const c = 0.5 - muffle * 0.38; // smaller = darker
    const g = Math.min(0.9995, decay - muffle * 0.012);
    let s = 0;
    for (let i = N; i < len; i++) {
      const a = out[i - N];
      const b = out[i - N - 1] ?? 0;
      const x = a + (b - a) * frac; // fractional delay for tuning
      s += c * 2 * (x - s);
      out[i] = s * g;
    }
    // Gentle fade at the end.
    const fade = Math.min(len, Math.floor(sr * 0.05));
    for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
    const buf = ac.createBuffer(1, len, sr);
    buf.copyToChannel ? buf.copyToChannel(out, 0) : buf.getChannelData(0).set(out);
    if (cache.size > 240) cache.delete(cache.keys().next().value);
    cache.set(key, buf);
    return buf;
  }

  function voice(slot, p, midi, vel, t, dest, { from } = {}) {
    const [thump, muffle] = slot.knobs;
    const f = mtof(midi);
    const bucket = vel > 0.75 ? 2 : vel > 0.45 ? 1 : 0;
    const buf = render(f, Math.round(thump * 10) / 10, Math.round(muffle * 10) / 10, p.body ?? 0.5, p.decay ?? 0.996, bucket);
    const src = ac.createBufferSource();
    src.buffer = buf;
    if (from != null) { // slide like a finger on a fret
      src.playbackRate.setValueAtTime(mtof(from) / f, t);
      src.playbackRate.exponentialRampToValueAtTime(1, t + 0.07);
    }
    // Body: a low resonance for bass guitar thump, a tone control for muffle.
    const bodyF = ac.createBiquadFilter();
    bodyF.type = 'peaking';
    bodyF.frequency.value = Math.min(400, Math.max(70, f * 1.1));
    bodyF.gain.value = (p.body ?? 0.5) * thump * 9;
    bodyF.Q.value = 1.2;
    const toneF = ac.createBiquadFilter();
    toneF.type = 'lowpass';
    toneF.frequency.value = 900 + (1 - muffle) * 7000;
    const amp = ac.createGain();
    const peak = 0.55 * (0.35 + 0.65 * vel);
    amp.gain.setValueAtTime(peak, t);
    src.connect(bodyF).connect(toneF).connect(amp).connect(dest);
    src.start(t);
    return makeVoice(ac, amp, [src], {
      t, a: 0.001, r: 0.06 + (1 - muffle) * 0.15, autoEnd: t + buf.duration,
      extra: {
        /** The string is already plucked, so turning changes its tone: MUFFLE darkens, THUMP adds body. */
        update([th, mu]) {
          const now = ac.currentTime;
          toneF.frequency.setTargetAtTime(900 + (1 - mu) * 7000, now, 0.03);
          bodyF.gain.setTargetAtTime((p.body ?? 0.5) * th * 9, now, 0.03);
        },
      },
    });
  }

  return { voice, sends: ([, muffle]) => ({ reverb: 0.1 + (1 - muffle) * 0.1, delay: 0.02 }) };
}
