// samplePlayer.js — plays sampler pads, chops and BPM-synced loops.

export function createSamplePlayer(ac, dest) {
  const bus = ac.createGain();
  bus.connect(dest);
  const reversed = new WeakMap();

  function reverseOf(buf) {
    if (reversed.has(buf)) return reversed.get(buf);
    const r = ac.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const src = buf.getChannelData(c);
      const dst = r.getChannelData(c);
      for (let i = 0, n = src.length; i < n; i++) dst[i] = src[n - 1 - i];
    }
    reversed.set(buf, r);
    return r;
  }

  const active = new Map(); // padKey -> voice (for gate mode / choke)

  /**
   * Play a region of a buffer.
   * opts: { start, end, attack, release, tone (0 dark..0.5 open..1 thin), reverse,
   *         pitch (semitones), gain, gate (hold to play), loop, key (for choke), time }
   */
  function play(buf, o = {}) {
    if (!buf) return null;
    const t = Math.max(o.time ?? ac.currentTime, ac.currentTime);
    const start = Math.max(0, o.start ?? 0);
    const end = Math.min(buf.duration, o.end ?? buf.duration);
    if (end - start < 0.005) return null;
    if (o.key != null && active.has(o.key)) stop(o.key, t, 0.01);
    const src = ac.createBufferSource();
    src.buffer = o.reverse ? reverseOf(buf) : buf;
    const rate = Math.pow(2, (o.pitch || 0) / 12) * (o.rate || 1);
    src.playbackRate.value = rate;
    const offset = o.reverse ? buf.duration - end : start;
    const len = end - start;
    // Tone: below the middle darkens (low-pass), above thins (high-pass).
    const tone = o.tone ?? 0.5;
    const filt = ac.createBiquadFilter();
    if (tone < 0.5) { filt.type = 'lowpass'; filt.frequency.value = 300 * Math.pow(60, tone * 2); }
    else { filt.type = 'highpass'; filt.frequency.value = 20 * Math.pow(60, (tone - 0.5) * 2); }
    filt.Q.value = 0.7;
    const g = ac.createGain();
    const peak = o.gain ?? 0.9;
    const a = Math.max(0.002, o.attack ?? 0.003);
    const r = Math.max(0.005, o.release ?? 0.03);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    src.connect(filt).connect(g).connect(bus);
    let endT;
    if (o.loop) {
      src.loop = true;
      src.loopStart = offset;
      src.loopEnd = offset + len;
      src.start(t, offset);
      endT = Infinity;
    } else {
      src.start(t, offset, len);
      endT = t + len / rate;
      if (!o.gate) {
        g.gain.setValueAtTime(peak, Math.max(t + a, endT - r));
        g.gain.linearRampToValueAtTime(0, endT);
      }
    }
    const v = { src, g, r, endT, t };
    if (o.key != null) {
      active.set(o.key, v);
      src.onended = () => { if (active.get(o.key) === v) active.delete(o.key); };
    }
    return v;
  }

  function stop(key, t = ac.currentTime, fade) {
    const v = active.get(key);
    if (!v) return;
    active.delete(key);
    const r = fade ?? v.r;
    v.g.gain.cancelScheduledValues(t);
    v.g.gain.setValueAtTime(v.g.gain.value, t);
    v.g.gain.linearRampToValueAtTime(0, t + r);
    try { v.src.stop(t + r + 0.02); } catch (e) { /* already stopped */ }
  }

  const isPlaying = (key) => active.has(key);

  return { play, stop, isPlaying, bus, reverseOf };
}
