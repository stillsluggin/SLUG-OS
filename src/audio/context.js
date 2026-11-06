// context.js — Web Audio context, iPhone unlock, and the master bus.
//
// iOS: audio may only start inside a user gesture (the "Tap to start" screen).
// The ring/silent switch mutes Web Audio unless the audio session is set to
// 'playback' (navigator.audioSession, Safari 17+) or, on older iOS, a looping
// silent <audio> element is playing. The context can also be suspended or
// "interrupted" (calls, lock screen), so resumeAudio() runs on every touch.

import { createXY } from './xyfx.js';

let ctx = null;
let silentEl = null;

export const getContext = () => ctx;

function silentWavUrl() {
  const n = 4000;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

/** Call from a user gesture. */
export async function startAudio() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* unsupported */ }
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
  }
  if (!silentEl && !navigator.audioSession) {
    silentEl = document.createElement('audio');
    silentEl.setAttribute('playsinline', '');
    silentEl.loop = true;
    silentEl.src = silentWavUrl();
    silentEl.play().catch(() => {});
  }
  const b = ctx.createBuffer(1, 1, ctx.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = b;
  src.connect(ctx.destination);
  src.start(0);
  if (ctx.state !== 'running') await ctx.resume().catch(() => {});
  return ctx;
}

export function resumeAudio() {
  if (ctx && ctx.state !== 'running') {
    ctx.resume().catch(() => {});
    if (silentEl && silentEl.paused) silentEl.play().catch(() => {});
  }
}

/**
 * Master bus: everything -> gentle tape wobble -> warm saturation -> limiter.
 * Shared reverb ("the room") and tempo delay sends.
 */
export function createMaster(ac) {
  const input = ac.createGain();
  input.gain.value = 0.8;

  const wow = ac.createDelay(0.05);
  wow.delayTime.value = 0.006;
  const wowLfo = ac.createOscillator();
  wowLfo.frequency.value = 0.5;
  const wowDepth = ac.createGain();
  wowDepth.gain.value = 0.00035;
  wowLfo.connect(wowDepth).connect(wow.delayTime);
  wowLfo.start();

  const warmth = ac.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(1.3 * x) / Math.tanh(1.3);
  }
  warmth.curve = curve;

  const tone = ac.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 15000;
  tone.Q.value = 0.4;

  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -9;
  limiter.knee.value = 8;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;

  const out = ac.createGain();
  out.gain.value = 0.9;
  // Everything (players, drums, sampler, loops and the reverb/delay returns) -> XY pad -> tape -> out.
  // `input` goes through the XY pad; `dryInput` skips it (SHELL SHOCK "AFFECTS").
  const xy = createXY(ac);
  input.connect(xy.input);
  xy.output.connect(wow).connect(warmth).connect(tone).connect(limiter).connect(out).connect(ac.destination);
  const dryInput = ac.createGain();
  dryInput.connect(wow);
  const returns = ac.createGain(); // reverb + delay tails
  returns.connect(input);

  // Reverb send
  const reverbIn = ac.createGain();
  const reverb = ac.createConvolver();
  reverb.buffer = makeImpulse(ac, 2.8);
  const revHp = ac.createBiquadFilter();
  revHp.type = 'highpass';
  revHp.frequency.value = 200;
  reverbIn.connect(revHp).connect(reverb).connect(returns);

  // Tempo delay send (dotted 8th by default)
  const delayIn = ac.createGain();
  const delay = ac.createDelay(2);
  delay.delayTime.value = 0.4;
  const fb = ac.createGain();
  fb.gain.value = 0.35;
  const dlp = ac.createBiquadFilter();
  dlp.type = 'lowpass';
  dlp.frequency.value = 2800;
  delayIn.connect(delay).connect(dlp).connect(fb).connect(delay);
  dlp.connect(returns);

  const analyser = ac.createAnalyser();
  analyser.fftSize = 1024;
  out.connect(analyser);

  // A tap for recording the master output (MediaStream), where supported.
  let streamDest = null;
  const stream = () => {
    if (!streamDest && ac.createMediaStreamDestination) { streamDest = ac.createMediaStreamDestination(); out.connect(streamDest); }
    return streamDest && streamDest.stream;
  };

  return {
    input, dryInput, reverbIn, delayIn, analyser, stream, xy,
    /** Tails go through the pad only when it affects everything. */
    setReturnsThroughXY(on) { returns.disconnect(); returns.connect(on ? input : dryInput); },
    reverbBuffer: reverb.buffer, warmthCurve: curve,
    get delaySeconds() { return delay.delayTime.value; },
    direct: limiter, // for sounds that skip the effects (metronome)
    outNode: out, // the final stereo mix (EXPORT records here)
    setTempo(bpm) { delay.delayTime.setTargetAtTime((60 / bpm) * 0.75, ac.currentTime, 0.1); xy.setTempo(bpm); },
    setTone(v) { tone.frequency.setTargetAtTime(600 * Math.pow(30, v), ac.currentTime, 0.05); },
  };
}

function makeImpulse(ac, seconds) {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      lp += 0.32 * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * Math.pow(1 - t, 3) * (i < 300 ? i / 300 : 1);
    }
  }
  return buf;
}
