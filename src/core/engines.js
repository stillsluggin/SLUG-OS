// engines.js — the seven Slug synth engines, as data.
//
// Each engine makes sound a genuinely different way (the browser renderers
// live in src/audio/engines/). Every engine shows exactly TWO knobs; a preset is
// a starting position for those knobs plus a few hidden settings.
//
//   KEYS    FM tine-and-bell electric piano + tremolo/phaser/chorus swirl
//   ANALOG  subtractive: saw/square/sub -> 24 dB ladder-style low-pass, glide
//   PAD     detuned saw + pulse ensemble -> stereo BBD-style chorus
//   PLUCK   Karplus-Strong plucked string (physical model)
//   SHINE   wavetable / digital: bright harmonic tables, unison, 8-bit chip
//   TRIP    3-operator FM with odd ratios, cross-feedback and random drift
//   SIREN   pitch-swept oscillators + filtered noise for risers and drops
//
// Knob values are 0..1. Hidden params are read by the renderer with defaults.

export const ENGINES = {
  keys: {
    name: 'KEYS', method: 'FM tines', knobs: ['WAVE', 'TONE'], poly: true,
    presets: [
      { name: 'Soul Tines', knobs: [0.45, 0.4] },
      { name: 'Dusty Suitcase', knobs: [0.75, 0.3], p: { bell: 0.08, decay: 2.4 } },
      { name: 'Bark Funk', knobs: [0.2, 0.85], p: { bell: 0.18 } },
      { name: 'Glass Mist', knobs: [0.6, 0.55], p: { bell: 0.3, decay: 3 } },
    ],
  },
  analog: {
    name: 'ANALOG', method: 'ladder filter', knobs: ['GLIDE', 'SQUELCH'], poly: true,
    presets: [
      { name: 'Sunset Glide', knobs: [0.7, 0.25], p: { wave: 'sine+saw', sub: 0.6, cutoff: 420, decay: 0.9, sustain: 0.8, vib: 4 } },
      { name: 'Funk Squelch', knobs: [0.08, 0.8], p: { wave: 'saw', sub: 0.3, cutoff: 260, decay: 0.25, sustain: 0.35 } },
      { name: 'Deep Sub', knobs: [0.25, 0.05], p: { wave: 'sine+tri', sub: 0.9, cutoff: 300, decay: 1, sustain: 0.9 } },
      { name: 'Whiny Lead', knobs: [0.55, 0.5], p: { wave: 'square+saw', sub: 0, cutoff: 900, decay: 0.6, sustain: 0.7, vib: 18 } },
    ],
  },
  pad: {
    name: 'PAD', method: 'ensemble chorus', knobs: ['WIDTH', 'GLOW'], poly: true,
    presets: [
      { name: 'Velvet', knobs: [0.7, 0.45] },
      { name: 'Sunrise', knobs: [0.9, 0.75], p: { attack: 0.5 } },
      { name: 'Night Moss', knobs: [0.5, 0.2], p: { attack: 0.9 } },
    ],
  },
  pluck: {
    name: 'PLUCK', method: 'plucked string', knobs: ['THUMP', 'MUFFLE'], poly: true,
    presets: [
      { name: 'Soul Thump', knobs: [0.85, 0.75], p: { body: 0.9, decay: 0.997 } },
      { name: 'Soul Guitar', knobs: [0.35, 0.3], p: { body: 0.4, decay: 0.996 } },
      { name: 'Funk Chank', knobs: [0.6, 0.85], p: { body: 0.3, decay: 0.99 } },
      { name: 'Nylon Dew', knobs: [0.2, 0.45], p: { body: 0.6, decay: 0.998 } },
    ],
  },
  shine: {
    name: 'SHINE', method: 'wavetable', knobs: ['SPARKLE', 'AIR'], poly: true,
    presets: [
      { name: 'Crystal Lead', knobs: [0.6, 0.5], p: { table: 'crystal', unison: 3 } },
      { name: 'Digi Bell', knobs: [0.5, 0.65], p: { table: 'bell', unison: 1, decay: 1.2, sustain: 0.1 } },
      { name: 'Glass Saw', knobs: [0.75, 0.35], p: { table: 'glass', unison: 3 } },
      { name: '8-BIT Hero', knobs: [0.5, 0.2], p: { table: 'pulse25', unison: 1, chip: true } },
      { name: '8-BIT Bubble', knobs: [0.3, 0.4], p: { table: 'pulse12', unison: 1, chip: true, arp: true } },
    ],
  },
  trip: {
    name: 'TRIP', method: 'feedback FM', knobs: ['WEIRD', 'DRIFT'], poly: true,
    presets: [
      { name: 'Melt', knobs: [0.35, 0.5], p: { ratios: [1, 1.41, 3.17] } },
      { name: 'Wobble Moth', knobs: [0.6, 0.8], p: { ratios: [1, 0.5, 2.71] } },
      { name: 'Spore Cloud', knobs: [0.85, 0.35], p: { ratios: [1, 4.23, 7.11] } },
    ],
  },
  siren: {
    name: 'SIREN', method: 'pitch sweep', knobs: ['RISE', 'SPEED'], poly: true,
    presets: [
      { name: 'Riser', knobs: [0.7, 0.3], p: { shape: 'rise' } },
      { name: 'Air Raid', knobs: [0.5, 0.6], p: { shape: 'siren' } },
      { name: 'Drop', knobs: [0.8, 0.5], p: { shape: 'drop' } },
      { name: 'Whoosh', knobs: [0.6, 0.4], p: { shape: 'whoosh' } },
    ],
  },
};

/** Build order from the plan; also the order the ENGINE button cycles through. */
export const ENGINE_IDS = ['keys', 'analog', 'pad', 'pluck', 'shine', 'trip', 'siren'];

/** A fresh engine slot for a player: engine id, preset index, the two knob values. */
export function engineSlot(engine, preset = 0) {
  const e = ENGINES[engine];
  const pr = e.presets[preset] || e.presets[0];
  return { engine, preset, knobs: [...pr.knobs] };
}

export function presetParams(slot) {
  return ENGINES[slot.engine].presets[slot.preset]?.p || {};
}
