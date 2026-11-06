// media.js — getting audio in: decode files, pull the audio track out of
// videos (screen recordings), record the microphone, and write WAV files.

/** decodeAudioData with the old callback form as a fallback (older Safari). */
export function decode(ac, arrayBuffer) {
  return new Promise((resolve, reject) => {
    let done = false;
    const ok = (b) => { if (!done) { done = true; resolve(b); } };
    const bad = (e) => { if (!done) { done = true; reject(e || new Error('Could not decode audio')); } };
    try {
      const p = ac.decodeAudioData(arrayBuffer, ok, bad);
      if (p && p.then) p.then(ok, bad);
    } catch (e) { bad(e); }
  });
}

/**
 * Audio from any file. Audio files and most videos (mp4, mov, webm) decode
 * directly. If a video's audio can't be decoded that way, we play the video
 * silently and capture its sound in real time (slower, but works).
 */
export async function decodeFile(ac, file, onProgress) {
  const data = await file.arrayBuffer();
  try {
    return await decode(ac, data.slice(0));
  } catch (e) {
    if (!/^video\//.test(file.type) && !/\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name)) throw e;
    return captureMediaElement(ac, file, onProgress);
  }
}

function captureMediaElement(ac, file, onProgress) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement('video');
    el.src = url;
    el.playsInline = true;
    el.muted = false;
    el.preload = 'auto';
    const chunksL = [];
    const chunksR = [];
    let src, proc, sink;
    const finish = () => {
      try { proc.disconnect(); src.disconnect(); sink.disconnect(); } catch (e) { /* ignore */ }
      URL.revokeObjectURL(url);
      const len = chunksL.reduce((n, c) => n + c.length, 0);
      if (!len) { reject(new Error('No audio found in this video')); return; }
      const buf = ac.createBuffer(2, len, ac.sampleRate);
      let o = 0;
      chunksL.forEach((c, i) => { buf.getChannelData(0).set(c, o); buf.getChannelData(1).set(chunksR[i], o); o += c.length; });
      resolve(buf);
    };
    el.onloadedmetadata = () => {
      src = ac.createMediaElementSource(el);
      proc = ac.createScriptProcessor(4096, 2, 2);
      sink = ac.createGain();
      sink.gain.value = 0; // capture without playing it out loud
      proc.onaudioprocess = (ev) => {
        if (el.paused) return;
        chunksL.push(new Float32Array(ev.inputBuffer.getChannelData(0)));
        chunksR.push(new Float32Array(ev.inputBuffer.getChannelData(ev.inputBuffer.numberOfChannels > 1 ? 1 : 0)));
        onProgress && el.duration && onProgress(el.currentTime / el.duration);
      };
      src.connect(proc).connect(sink).connect(ac.destination);
      el.onended = finish;
      el.play().catch(reject);
    };
    el.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This video could not be read')); };
  });
}

/**
 * Microphone recorder. Captures raw PCM (no codecs), so it behaves the same
 * on every browser. start() asks for permission; stop() returns an AudioBuffer.
 */
export function createMicRecorder(ac) {
  let stream = null, src = null, proc = null, sink = null;
  let chunks = [];
  let level = 0;
  return {
    get level() { return level; },
    async start() {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      src = ac.createMediaStreamSource(stream);
      proc = ac.createScriptProcessor(4096, 1, 1);
      sink = ac.createGain();
      sink.gain.value = 0;
      chunks = [];
      proc.onaudioprocess = (ev) => {
        const d = ev.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(d));
        let pk = 0;
        for (let i = 0; i < d.length; i += 16) pk = Math.max(pk, Math.abs(d[i]));
        level = pk;
      };
      src.connect(proc).connect(sink).connect(ac.destination);
    },
    stop() {
      try { proc.disconnect(); src.disconnect(); sink.disconnect(); } catch (e) { /* ignore */ }
      stream?.getTracks().forEach((t) => t.stop());
      const len = chunks.reduce((n, c) => n + c.length, 0);
      if (!len) return null;
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      let o = 0;
      for (const c of chunks) { buf.getChannelData(0).set(c, o); o += c.length; }
      return buf;
    },
  };
}

/** 16-bit PCM WAV bytes from an AudioBuffer (for saving recordings privately). */
export function encodeWav(buf) {
  const ch = Math.min(2, buf.numberOfChannels);
  const len = buf.length;
  const out = new ArrayBuffer(44 + len * ch * 2);
  const v = new DataView(out);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, buf.sampleRate, true); v.setUint32(28, buf.sampleRate * ch * 2, true);
  v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, len * ch * 2, true);
  const data = [...Array(ch)].map((_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) {
    const s = Math.max(-1, Math.min(1, data[c][i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    o += 2;
  }
  return out;
}

/** Peaks for drawing a waveform: `width` pairs of [min, max]. */
export function peaks(buf, width) {
  const d = buf.getChannelData(0);
  const step = Math.max(1, Math.floor(d.length / width));
  const out = new Float32Array(width * 2);
  for (let x = 0; x < width; x++) {
    let mn = 1, mx = -1;
    for (let i = x * step, e = Math.min(d.length, i + step); i < e; i += 4) { const s = d[i]; if (s < mn) mn = s; if (s > mx) mx = s; }
    out[x * 2] = mn; out[x * 2 + 1] = mx;
  }
  return out;
}
