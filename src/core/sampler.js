// sampler.js — the Slug Sampler's pad model (pure data, no audio).
//
// Pads live on pages of 16. PAGES is 1 for now; set it to 2 for 32 pads and
// everything (storage, UI, keys) follows.
//
// A pad points at a source sample (by id) and plays a region of it. A CHOP
// BANK pad keeps the whole sample plus a list of chops: markers only, the
// source audio is never changed.

export const PADS_PER_PAGE = 16;
export const PAGES = 1;
export const PLAY_MODES = ['ONE-SHOT', 'GATE', 'LOOP'];

export function emptyPad(i) {
  return {
    index: i, name: '', sampleId: null, duration: 0,
    start: 0, end: 0,
    mode: 'ONE-SHOT', attack: 0, release: 0.05, tone: 0.5, pitch: 0, gain: 0.85, reverse: false,
    bank: null, // { chops: [{start, end}] }
  };
}

export const createPads = () => Array.from({ length: PADS_PER_PAGE * PAGES }, (_, i) => emptyPad(i));

/** Point a pad at a newly loaded sample (whole file selected). */
export function assignSample(pad, { sampleId, name, duration }) {
  return { ...emptyPad(pad.index), sampleId, name, duration, start: 0, end: duration };
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
