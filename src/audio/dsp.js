// dsp.js — offline sample processing for the sampler: time-stretch that keeps
// pitch (two flavours). Pure functions on Float32Arrays (no Web Audio), so they
// can be tested in Node. Browser-only feature (too heavy for the FM-1).
//
//   SMOOTH  WSOLA: overlapping grains, each nudged to line up with the last
//           one's waveform. Good for melodic, sustained material (keys, vocals).
//   BEATS   slices at the hits and moves each slice to its new time without
//           stretching it, like a drum machine replaying a break. Keeps drums
//           punchy; slowing down leaves small gaps between hits.

/**
 * WSOLA time-stretch. `factor` = output length / input length (2 = twice as long).
 * channels: Float32Array[] (same length). Returns Float32Array[].
 */
export function stretchSmooth(channels, factor, sampleRate) {
  const len = channels[0].length;
  const outLen = Math.max(1, Math.round(len * factor));
  const frame = Math.max(256, 2 * Math.round((sampleRate * 0.046) / 2)); // ~46 ms grains
  const hop = frame / 2;
  const tol = Math.round(sampleRate * 0.012); // search ±12 ms
  const win = new Float32Array(frame);
  for (let i = 0; i < frame; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / frame);

  // Mono guide signal for alignment.
  const mono = new Float32Array(len);
  for (const c of channels) for (let i = 0; i < len; i++) mono[i] += c[i] / channels.length;

  const out = channels.map(() => new Float32Array(outLen + frame));
  const norm = new Float32Array(outLen + frame);
  let prev = 0;
  const overlap = hop;
  const corr = (a, b) => { // a: natural continuation, b: candidate
    let s = 0;
    for (let i = 0; i < overlap; i += 2) s += mono[a + i] * mono[b + i];
    return s;
  };
  for (let k = 0, outPos = 0; outPos < outLen; k++, outPos += hop) {
    let best = 0;
    if (k > 0) {
      const nominal = Math.round(outPos / factor);
      const natural = Math.min(len - overlap - 1, prev + hop);
      const lo = Math.max(0, nominal - tol);
      const hi = Math.min(len - frame - 1, nominal + tol);
      if (hi <= lo) best = Math.max(0, Math.min(len - frame - 1, nominal));
      else {
        // Coarse search, then refine around the best spot.
        let bestS = -Infinity;
        for (let d = lo; d <= hi; d += 4) { const s = corr(natural, d); if (s > bestS) { bestS = s; best = d; } }
        for (let d = Math.max(lo, best - 3); d <= Math.min(hi, best + 3); d++) { const s = corr(natural, d); if (s > bestS) { bestS = s; best = d; } }
      }
    }
    for (let i = 0; i < frame && best + i < len; i++) {
      const w = win[i];
      for (let c = 0; c < channels.length; c++) out[c][outPos + i] += channels[c][best + i] * w;
      norm[outPos + i] += w;
    }
    prev = best;
  }
  for (let c = 0; c < out.length; c++) {
    const o = out[c];
    for (let i = 0; i < outLen; i++) o[i] = norm[i] > 0.05 ? o[i] / norm[i] : o[i];
  }
  return out.map((o) => o.subarray(0, outLen));
}

/**
 * BEATS time-stretch: each slice (from `slices`, start times in seconds,
 * sorted, first = 0) moves to its stretched position and plays at its own
 * speed, cut short with a quick fade if the next slice arrives first.
 */
export function stretchBeats(channels, factor, sampleRate, slices) {
  const len = channels[0].length;
  const outLen = Math.max(1, Math.round(len * factor));
  const starts = [...new Set([0, ...slices.map((t) => Math.round(t * sampleRate))])].filter((s) => s >= 0 && s < len).sort((a, b) => a - b);
  const out = channels.map(() => new Float32Array(outLen));
  const fadeIn = Math.round(sampleRate * 0.001);
  const fadeOut = Math.round(sampleRate * 0.004);
  for (let i = 0; i < starts.length; i++) {
    const a = starts[i];
    const sliceLen = (starts[i + 1] ?? len) - a;
    const b = Math.round(a * factor);
    const nextB = i + 1 < starts.length ? Math.round(starts[i + 1] * factor) : outLen;
    const n = Math.min(sliceLen, nextB - b, outLen - b);
    const cut = n < sliceLen;
    for (let j = 0; j < n; j++) {
      let g = 1;
      if (j < fadeIn) g = j / fadeIn;
      if (cut && j > n - fadeOut) g *= (n - j) / fadeOut;
      for (let c = 0; c < channels.length; c++) out[c][b + j] = channels[c][a + j] * g;
    }
  }
  return out;
}

/** Evenly spaced slice times (seconds) when there are no clear hits: 16ths at `bpm`, else 125 ms. */
export function gridSlices(duration, bpm) {
  const step = bpm ? 60 / bpm / 4 : 0.125;
  const out = [];
  for (let t = 0; t < duration; t += step) out.push(t);
  return out;
}
