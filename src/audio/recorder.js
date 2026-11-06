// recorder.js — records any set of points in the mix at once, sample-aligned,
// for EXPORT. Each track gets a tap (an AudioWorklet that captures between two
// exact sample frames), so stems line up perfectly with each other and the mix.

import { loadFxWorklet } from './fxWorklet.js';

export function createRecorder(ac) {
  let session = null; // { taps: [{ name, node, chunksL, chunksR, done }], ... }

  /** Start recording `sources` ({ name: AudioNode }) at audio time `at`. */
  async function start(sources, at) {
    const ok = await loadFxWorklet(ac);
    if (!ok) throw new Error('This browser cannot record the mix (no AudioWorklet).');
    const sink = ac.createGain();
    sink.gain.value = 0;
    sink.connect(ac.destination);
    const startFrame = Math.ceil(Math.max(at, ac.currentTime + 0.02) * ac.sampleRate);
    const taps = Object.entries(sources).map(([name, src]) => {
      const node = new AudioWorkletNode(ac, 'slug-tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit' });
      const tap = { name, node, src, l: [], r: [], done: null };
      tap.finished = new Promise((res) => { tap.done = res; });
      node.port.onmessage = (e) => {
        tap.l.push(e.data.l); tap.r.push(e.data.r);
        if (e.data.done) tap.done();
      };
      src.connect(node);
      node.connect(sink);
      node.port.postMessage({ cmd: 'start', at: startFrame });
      return tap;
    });
    session = { taps, sink, startFrame, startTime: startFrame / ac.sampleRate };
    return session.startTime;
  }

  /** Stop at audio time `at` (default: now). Resolves to { sampleRate, tracks: { name: [L, R] } }. */
  async function stop(at = ac.currentTime) {
    if (!session) return null;
    const s = session;
    session = null;
    const stopFrame = Math.max(s.startFrame + 128, Math.ceil(Math.max(at, ac.currentTime + 0.01) * ac.sampleRate));
    for (const t of s.taps) t.node.port.postMessage({ cmd: 'stop', at: stopFrame });
    await Promise.all(s.taps.map((t) => t.finished));
    const tracks = {};
    for (const t of s.taps) {
      const join = (parts) => { const n = parts.reduce((a, p) => a + p.length, 0); const o = new Float32Array(n); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; };
      tracks[t.name] = [join(t.l), join(t.r)];
      try { t.src.disconnect(t.node); } catch (e) { /* already */ }
      t.node.disconnect();
    }
    s.sink.disconnect();
    return { sampleRate: ac.sampleRate, tracks };
  }

  return { start, stop, get recording() { return !!session; }, get startTime() { return session ? session.startTime : null; } };
}
