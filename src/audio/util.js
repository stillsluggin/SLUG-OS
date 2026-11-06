// util.js — small Web Audio helpers shared by the engines.

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const canHold = typeof AudioParam !== 'undefined' && 'cancelAndHoldAtTime' in AudioParam.prototype;

/** Freeze a param at time t so a new ramp can start from its current value. */
export function holdAt(param, t) {
  if (canHold) param.cancelAndHoldAtTime(t);
  else { param.cancelScheduledValues(t); param.setValueAtTime(param.value, t); }
}

/** Attack to `peak`, then decay towards `peak * s`. */
export function adsr(param, t, peak, a, d, s) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + Math.max(0.001, a));
  param.setTargetAtTime(peak * s, t + a, Math.max(0.005, d / 3));
}

/** A voice handle: release/kill fade the amp and stop every source. */
export function makeVoice(ac, amp, sources, { t, a, r, autoEnd = Infinity, extra = {} }) {
  let end = autoEnd;
  let released = false;
  const stopAll = (e) => sources.forEach((o) => { try { o.stop(e); } catch (err) { /* already stopped */ } });
  if (end !== Infinity) stopAll(end + 0.05);
  return {
    ...extra,
    get end() { return end; },
    get released() { return released; },
    release(rt) {
      if (released) return end;
      released = true;
      rt = Math.max(rt, t + a, ac.currentTime);
      holdAt(amp.gain, rt);
      amp.gain.setTargetAtTime(0, rt, Math.max(0.01, r / 4));
      const e = rt + r * 1.6 + 0.05;
      if (e < end) { end = e; stopAll(end); }
      return end;
    },
    kill(kt) {
      kt = Math.max(kt, ac.currentTime);
      released = true;
      holdAt(amp.gain, kt);
      amp.gain.linearRampToValueAtTime(0, kt + 0.015);
      const e = kt + 0.025;
      if (e < end) { end = e; stopAll(end); }
      return end;
    },
  };
}

let noiseBuf = null;
export function noiseBuffer(ac) {
  if (noiseBuf && noiseBuf.sampleRate === ac.sampleRate) return noiseBuf;
  const len = ac.sampleRate * 2;
  noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

export function noiseSource(ac) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  src.loop = true;
  return src;
}

const waveCache = new Map();
/** A PeriodicWave from a harmonic amplitude function (cached by name). */
export function periodicWave(ac, name, amp, n = 48) {
  const k = `${name}:${ac.sampleRate}`;
  if (waveCache.has(k)) return waveCache.get(k);
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let h = 1; h < n; h++) im[h] = amp(h);
  const w = ac.createPeriodicWave(re, im);
  waveCache.set(k, w);
  return w;
}

export const pulseAmp = (duty) => (h) => (2 / (h * Math.PI)) * Math.sin(h * Math.PI * duty);

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Stereo chorus (BBD-style): two modulated delays panned left and right. */
export function makeChorus(ac) {
  const input = ac.createGain();
  const output = ac.createGain();
  const dry = ac.createGain();
  const wet = ac.createGain();
  const merger = ac.createChannelMerger(2);
  const lfo = ac.createOscillator();
  lfo.frequency.value = 0.55;
  const delays = [0, 1].map((ch) => {
    const d = ac.createDelay(0.05);
    d.delayTime.value = 0.008;
    const depth = ac.createGain();
    depth.gain.value = ch === 0 ? 0.002 : -0.002;
    lfo.connect(depth).connect(d.delayTime);
    input.connect(d);
    d.connect(merger, 0, ch);
    return { d, depth };
  });
  lfo.start();
  input.connect(dry).connect(output);
  merger.connect(wet).connect(output);
  return {
    input, output,
    set({ mix = 0.5, depth = 0.002, rate = 0.55 }) {
      const t = ac.currentTime;
      wet.gain.setTargetAtTime(mix, t, 0.05);
      dry.gain.setTargetAtTime(1 - mix * 0.4, t, 0.05);
      lfo.frequency.setTargetAtTime(rate, t, 0.05);
      delays[0].depth.gain.setTargetAtTime(depth, t, 0.05);
      delays[1].depth.gain.setTargetAtTime(-depth, t, 0.05);
    },
  };
}
