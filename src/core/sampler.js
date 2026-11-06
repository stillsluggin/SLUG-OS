// sampler.js — the Slug Sampler's pad model (pure data, no audio).
//
// Pads live on pages of 16. PAGES is 1 for now; set it to 2 for 32 pads and
// everything (storage, UI, keys) follows.
//
// A pad points at a source sample (by id) and plays a region of it. A CHOP
// BANK pad keeps the whole sample plus a list of chops: markers only, the
// source audio is never changed.

import { bpmFromName } from './kits.js';
import { guessLoopBpm } from './chops.js';

export const PADS_PER_PAGE = 16;
export const PAGES = 1;
export const PLAY_MODES = ['ONE-SHOT', 'GATE', 'LOOP'];

// PITCH algorithms
//   RESAMPLE   like old samplers: pitch and speed change together.
//   KEEP TIME  pitch-shift that keeps the timing (stretch + resample).
export const PITCH_MODES = ['RESAMPLE', 'KEEP TIME'];

// STRETCH / WARP algorithms
//   REPITCH  speeding up raises the pitch, slowing down lowers it (tape style).
//   BEATS    for drums: slices move in time, each hit keeps its sound.
//   SMOOTH   for melodic material: grains overlap so pitch stays put.
export const WARP_MODES = ['REPITCH', 'BEATS', 'SMOOTH'];

export function emptyPad(i) {
  return {
    index: i, name: '', sampleId: null, duration: 0,
    start: 0, end: 0,
    mode: 'ONE-SHOT', attack: 0, release: 0.05, tone: 0.5, pitch: 0, gain: 0.85, reverse: false,
    pitchMode: 'RESAMPLE', warp: 'REPITCH', stretch: 1, warpToBpm: false, srcBpm: null,
    bank: null, // { chops: [{start, end}] }
  };
}

export const createPads = () => Array.from({ length: PADS_PER_PAGE * PAGES }, (_, i) => emptyPad(i));

/** Point a pad at a newly loaded sample (whole file selected). */
export function assignSample(pad, { sampleId, name, duration }) {
  // Guess the source tempo for WARP→BPM: from the name ("92bpm"), else from the length.
  const srcBpm = duration ? Math.round(bpmFromName(name || '') || guessLoopBpm(duration).bpm) : null;
  return { ...emptyPad(pad.index), sampleId, name, duration, start: 0, end: duration, srcBpm };
}

/** Playback options for a pad, or for one of its chops. */
export function padRegion(pad, chopIndex = null) {
  const c = chopIndex != null && pad.bank ? pad.bank.chops[chopIndex] : null;
  return {
    start: c ? c.start : pad.start,
    end: c ? c.end : pad.end,
    attack: pad.attack, release: pad.release, tone: pad.tone, pitch: pad.pitch, gain: pad.gain,
    reverse: pad.reverse, gate: pad.mode === 'GATE', loop: pad.mode === 'LOOP',
  };
}

/** How long the sound should become: the STRETCH knob, or the tempo ratio when WARP→BPM is on. */
export function timeRatio(pad, tempo) {
  if (pad.warpToBpm && pad.srcBpm && tempo) return pad.srcBpm / tempo;
  return pad.stretch || 1;
}

/**
 * Work out how to play a pad with its pitch and stretch settings.
 * Returns { algo: 'none' | 'beats' | 'smooth', factor, rate }:
 *   factor  how much to stretch the audio first (keeping pitch), 1 = untouched
 *   rate    playback speed afterwards (also the pitch change), 1 = normal
 */
export function playbackPlan(pad, tempo) {
  const p = Math.pow(2, (pad.pitch || 0) / 12);
  const T = timeRatio(pad, tempo);
  const keepTime = pad.pitchMode === 'KEEP TIME';
  let plan;
  if (pad.warp === 'REPITCH' || !pad.warp) {
    // Tape style: stretching changes speed (and pitch).
    plan = keepTime ? { algo: 'smooth', factor: p, rate: p / T } : { algo: 'none', factor: 1, rate: p / T };
  } else {
    const algo = pad.warp === 'BEATS' ? 'beats' : 'smooth';
    plan = keepTime ? { algo, factor: T * p, rate: p } : { algo, factor: T, rate: p };
  }
  if (Math.abs(plan.factor - 1) < 0.005) plan = { algo: 'none', factor: 1, rate: plan.rate };
  return plan;
}
