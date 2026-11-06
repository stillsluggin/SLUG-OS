// sampleRender.js — renders a pad's stretched / pitch-kept version once and
// caches it, so pressing the pad again is instant.

import { stretchSmooth, stretchBeats, gridSlices } from './dsp.js';
import { detectTransients } from '../core/chops.js';

export function createRenderer(ac) {
  const cache = new Map();

  function render(buffer, key, start, end, algo, factor, srcBpm) {
    const k = `${key}|${start.toFixed(4)}|${end.toFixed(4)}|${algo}|${factor.toFixed(3)}|${srcBpm || 0}`;
    if (cache.has(k)) return cache.get(k);
    const sr = buffer.sampleRate;
    const a = Math.max(0, Math.floor(start * sr));
    const b = Math.min(buffer.length, Math.ceil(end * sr));
    const chans = [];
    for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) chans.push(buffer.getChannelData(c).subarray(a, b));
    let out;
    if (algo === 'beats') {
      let slices = detectTransients(chans[0], sr, 0, (b - a) / sr, { max: 128, sensitivity: 0.6 });
      if (slices.length < 2) slices = gridSlices((b - a) / sr, srcBpm);
      out = stretchBeats(chans, factor, sr, slices);
    } else {
      out = stretchSmooth(chans, factor, sr);
    }
    const ob = ac.createBuffer(out.length, out[0].length, sr);
    out.forEach((d, c) => ob.getChannelData(c).set(d));
    if (cache.size > 40) cache.delete(cache.keys().next().value);
    cache.set(k, ob);
    return ob;
  }

  return { render, has: (k) => cache.has(k) };
}
