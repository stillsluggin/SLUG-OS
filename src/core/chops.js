// chops.js — lazy-chop logic for the sampler. Non-destructive: chops are just
// marker times (seconds) into the untouched source audio.

/** Equal slices between start and end. Returns `n` regions {start, end}. */
export function equalChops(start, end, n) {
  const len = (end - start) / n;
  return Array.from({ length: n }, (_, i) => ({ start: start + i * len, end: start + (i + 1) * len }));
}

/** Turn a list of marker times into consecutive regions inside [start, end]. */
export function markersToChops(markers, start, end, max = 16) {
  const ms = [...new Set(markers.map((m) => +m.toFixed(4)))]
    .filter((m) => m > start + 0.01 && m < end - 0.01)
    .sort((a, b) => a - b)
    .slice(0, max - 1);
  const edges = [start, ...ms, end];
  return edges.slice(0, -1).map((s, i) => ({ start: s, end: edges[i + 1] }));
}

/**
 * Transient detection: energy jumps in short windows. `data` is a mono
 * Float32Array. Returns marker times (s), strongest first trimmed to `max`.
 */
export function detectTransients(data, sampleRate, start, end, { max = 16, sensitivity = 0.5 } = {}) {
  const win = Math.floor(sampleRate * 0.01); // 10 ms
  const a = Math.floor(start * sampleRate);
  const b = Math.min(data.length, Math.floor(end * sampleRate));
  const energies = [];
  for (let i = a; i + win < b; i += win) {
    let e = 0;
    for (let j = i; j < i + win; j++) e += data[j] * data[j];
    energies.push(e / win);
  }
  const cands = [];
  const ratio = 2.2 + (1 - sensitivity) * 4;
  const minGap = Math.round(0.08 / 0.01); // 80 ms between hits
  let last = -minGap;
  for (let k = 3; k < energies.length; k++) {
    const prev = (energies[k - 1] + energies[k - 2] + energies[k - 3]) / 3 + 1e-6;
    if (energies[k] / prev > ratio && energies[k] > 1e-4 && k - last >= minGap) {
      cands.push({ t: start + (k * win) / sampleRate, s: energies[k] / prev });
      last = k;
    }
  }
  return cands.sort((x, y) => y.s - x.s).slice(0, max - 1).map((c) => c.t).sort((x, y) => x - y);
}

/** Guess a loop's tempo from its length: the bar count (1, 2, 4, 8) that lands nearest 90 BPM. */
export function guessLoopBpm(seconds) {
  let best = null;
  for (const bars of [1, 2, 4, 8, 16]) {
    const bpm = (bars * 4 * 60) / seconds;
    if (bpm < 60 || bpm > 180) continue;
    if (!best || Math.abs(bpm - 90) < Math.abs(best.bpm - 90)) best = { bars, bpm };
  }
  return best || { bars: 1, bpm: (4 * 60) / seconds };
}
