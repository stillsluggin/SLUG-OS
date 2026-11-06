// fxWorklet.js — sample-by-sample effects Web Audio can't build from its
// standard nodes, run in an AudioWorklet (Safari 14.5+, Chrome, Firefox).
// Loaded once from a Blob URL. If the browser has no AudioWorklet, xyfx.js
// falls back to simpler built-in versions.
//
//   slug-lofi     sample-rate reduction (sample & hold) + bit reduction + hiss
//   slug-pitch    pitch shifter (two crossfading read heads) for PITCH DIVE
//   slug-reverse  grabs the last beat (or less) and plays it backwards, looped

const CODE = `
class Lofi extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'amount', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' }]; }
  constructor() { super(); this.hold = [0, 0]; this.count = 0; }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    const a = params.amount[0];
    const factor = 1 + Math.floor(a * a * 28);          // hold each sample this many times
    const steps = Math.pow(2, 16 - a * 11) / 2;         // 16 bits -> 5 bits
    const hiss = a * 0.012;
    for (let ch = 0; ch < out.length; ch++) {
      const x = inp[ch] || inp[0];
      const y = out[ch];
      if (!x) { y.fill(0); continue; }
      let c = this.count;
      for (let i = 0; i < y.length; i++) {
        if (c % factor === 0) this.hold[ch] = Math.round(x[i] * steps) / steps;
        c++;
        y[i] = this.hold[ch] + (Math.random() * 2 - 1) * hiss;
      }
      if (ch === out.length - 1) this.count = c;
    }
    return true;
  }
}
registerProcessor('slug-lofi', Lofi);

class Pitch extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'semitones', defaultValue: 0, minValue: -36, maxValue: 12, automationRate: 'k-rate' }]; }
  constructor() {
    super();
    this.N = 16384; this.W = Math.round(sampleRate * 0.06);
    this.buf = [new Float32Array(this.N), new Float32Array(this.N)];
    this.w = 0; this.p = 0; this.ratio = 1;
  }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    const target = Math.pow(2, params.semitones[0] / 12);
    const N = this.N, W = this.W;
    const n = out[0].length;
    for (let i = 0; i < n; i++) {
      this.ratio += (target - this.ratio) * 0.0008;      // glide, no zipper noise
      for (let ch = 0; ch < out.length; ch++) { const x = inp[ch] || inp[0]; this.buf[ch][this.w] = x ? x[i] : 0; }
      // Two read heads half a window apart; each fades in and out (sin^2 + cos^2 = 1).
      const d1 = this.p, d2 = (this.p + W / 2) % W;
      const g1 = Math.sin(Math.PI * d1 / W) ** 2, g2 = Math.sin(Math.PI * d2 / W) ** 2;
      for (let ch = 0; ch < out.length; ch++) {
        const b = this.buf[ch];
        const r = (k) => { const pos = (this.w - k - 1 + N) % N; const i0 = Math.floor(pos), f = pos - i0; return b[i0] * (1 - f) + b[(i0 + 1) % N] * f; };
        out[ch][i] = r(d1) * g1 + r(d2) * g2;
      }
      this.p += 1 - this.ratio; if (this.p >= W) this.p -= W; if (this.p < 0) this.p += W;
      this.w = (this.w + 1) % N;
    }
    return true;
  }
}
registerProcessor('slug-pitch', Pitch);

class Reverse extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [
    { name: 'on', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    { name: 'length', defaultValue: 0.5, minValue: 0.02, maxValue: 2, automationRate: 'k-rate' },
  ]; }
  constructor() {
    super();
    this.N = Math.ceil(sampleRate * 2.5);
    this.buf = [new Float32Array(this.N), new Float32Array(this.N)];
    this.w = 0; this.on = false; this.start = 0; this.k = 0; this.mix = 0;
  }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    const want = params.on[0] > 0.5;
    const L = Math.max(64, Math.floor(params.length[0] * sampleRate));
    if (want && !this.on) { this.on = true; this.start = this.w; this.k = 0; }
    if (!want && this.on) this.on = false;
    const N = this.N, fade = 96;
    for (let i = 0; i < out[0].length; i++) {
      this.mix += ((this.on ? 1 : 0) - this.mix) * 0.01;
      const pos = this.k % L;
      // Short fades at the loop edges so the reversed loop doesn't click.
      const edge = Math.min(1, pos / fade, (L - pos) / fade);
      for (let ch = 0; ch < out.length; ch++) {
        const x = inp[ch] || inp[0];
        const dry = x ? x[i] : 0;
        if (!this.on) this.buf[ch][this.w] = dry;          // keep recording until it's switched on
        const rev = this.buf[ch][(this.start - 1 - pos + N * 2) % N] * edge;
        out[ch][i] = dry * (1 - this.mix) + rev * this.mix;
      }
      if (!this.on) this.w = (this.w + 1) % N; else this.k++;
    }
    return true;
  }
}
registerProcessor('slug-reverse', Reverse);
`;

let loading = null;

/** Load the processors into this audio context. Resolves true if available. */
export function loadFxWorklet(ac) {
  if (loading) return loading;
  if (!ac.audioWorklet || typeof AudioWorkletNode === 'undefined') { loading = Promise.resolve(false); return loading; }
  const url = URL.createObjectURL(new Blob([CODE], { type: 'application/javascript' }));
  loading = ac.audioWorklet.addModule(url).then(() => true, () => false);
  return loading;
}

export const workletNode = (ac, name, opts = {}) => new AudioWorkletNode(ac, name, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], ...opts });
