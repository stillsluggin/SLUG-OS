// wav.js — WAV files for EXPORT: any sample rate, 16 or 24 bit, plus a small
// resampler (so 22 kHz / 11 kHz "lo-fi" exports and 48 kHz all work everywhere).

/** Change sample rate with a windowed-sinc filter (clean, no aliasing hiss). */
export function resample(data, fromRate, toRate) {
  if (fromRate === toRate) return data;
  const ratio = toRate / fromRate;
  const outLen = Math.floor(data.length * ratio);
  const out = new Float32Array(outLen);
  const cutoff = Math.min(1, ratio); // low-pass when going down
  const half = 12;
  for (let i = 0; i < outLen; i++) {
    const x = i / ratio;
    const c = Math.floor(x);
    let sum = 0, wsum = 0;
    for (let k = c - half + 1; k <= c + half; k++) {
      if (k < 0 || k >= data.length) continue;
      const t = x - k;
      const sinc = t === 0 ? 1 : Math.sin(Math.PI * t * cutoff) / (Math.PI * t * cutoff);
      const w = 0.5 + 0.5 * Math.cos((Math.PI * t) / half); // Hann window
      sum += data[k] * sinc * w;
      wsum += sinc * w;
    }
    out[i] = wsum ? sum / wsum : 0;
  }
  return out;
}

/** WAV bytes from channel arrays. */
export function wavBytes(channels, sampleRate, bits = 16) {
  const ch = channels.length;
  const len = channels[0].length;
  const bps = bits / 8;
  const buf = new ArrayBuffer(44 + len * ch * bps);
  const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + len * ch * bps, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * ch * bps, true);
  v.setUint16(32, ch * bps, true); v.setUint16(34, bits, true);
  w(36, 'data'); v.setUint32(40, len * ch * bps, true);
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      if (bits === 24) {
        const n = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff);
        v.setUint8(o, n & 255); v.setUint8(o + 1, (n >> 8) & 255); v.setUint8(o + 2, (n >> 16) & 255);
        o += 3;
      } else { v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
    }
  }
  return new Uint8Array(buf);
}

export const peakOf = (channels) => channels.reduce((m, c) => { for (let i = 0; i < c.length; i += 8) m = Math.max(m, Math.abs(c[i])); return m; }, 0);
