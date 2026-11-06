// xy.js — SHELL SHOCK, the XY effects pad: the effect list and combo names.
// Pure data, no audio or DOM.
//
// X axis = one effect, Y axis = another, each with a single "amount" (0..1,
// 0 = off). On release the pad glides back to 0 unless HOLD is on.
//
// HOW TO ADD AN EFFECT
//   1. Add an entry to SHELL_EFFECTS below: id, label, a short hint, and a few
//      words for combo names (`a` words lead a name, `b` words end it).
//      Optional `params`: up to 4 hidden knobs ({ id, label, def, steps? }),
//      shown under TWEAK; the maker's params(p) receives them as 0..1.
//   2. Add a maker with the same id in src/audio/xyfx.js (MAKERS).
//   That's it: the loader list, names and saving pick it up automatically.
//   (tests/core.test.mjs checks every effect here has a maker.)

export const SHELL_EFFECTS = [
  { id: 'filter', label: 'FILTER', hint: 'low-pass sweep, darker', a: ['Muffled', 'Murky', 'Underwater'], b: ['Fog', 'Sweep', 'Haze'] , params: [{ id: 'res', label: 'RES', def: 0.4 }, { id: 'range', label: 'RANGE', def: 0.5 }] },
  { id: 'lfofilter', label: 'LFO FILTER', hint: 'tempo-synced low-pass sweep, deeper as you go', a: ['Breathing', 'Tidal', 'Pulsing'], b: ['Tide', 'Breath', 'Sweep'], params: [{ id: 'rate', label: 'RATE', def: 0.5, steps: 7 }, { id: 'res', label: 'RES', def: 0.4 }, { id: 'shape', label: 'SHAPE', def: 0, steps: 4 }, { id: 'center', label: 'CENTER', def: 0.5 }] },
  { id: 'isolator', label: 'ISOLATOR', hint: 'kills the lows, mids or highs (pick the band)', a: ['Hollow', 'Thin', 'Skeleton'], b: ['Kill', 'Cut', 'Drop'] , params: [{ id: 'band', label: 'BAND', def: 0, steps: 4 }, { id: 'depth', label: 'DEPTH', def: 1 }] },
  { id: 'looper', label: 'BEAT REPEAT', hint: 'loops the last beat, shorter as you go', a: ['Looping', 'Stuck', 'Echoing'], b: ['Loop', 'Repeat', 'Spiral'] , params: [{ id: 'feel', label: 'TRIPLET', def: 0 }, { id: 'fade', label: 'FADE', def: 0 }] },
  { id: 'phaser', label: 'PHASER', hint: 'deep swirl', a: ['Swirly', 'Spinning', 'Liquid'], b: ['Swirl', 'Whirl', 'Eddy'] , params: [{ id: 'rate', label: 'RATE', def: 0.3 }, { id: 'color', label: 'COLOR', def: 0.5 }] },
  { id: 'flanger', label: 'FLANGER', hint: 'jet-plane whoosh', a: ['Jet', 'Metal', 'Comet'], b: ['Jet', 'Rush', 'Streak'] , params: [{ id: 'rate', label: 'RATE', def: 0.3 }, { id: 'fb', label: 'FEEDBACK', def: 0.5 }] },
  { id: 'delay', label: 'DELAY', hint: 'tempo echoes, more = longer', a: ['Echo', 'Canyon', 'Cave'], b: ['Echo', 'Ripple', 'Return'] , params: [{ id: 'time', label: 'TIME', def: 0.5, steps: 5 }, { id: 'fb', label: 'FEEDBACK', def: 0.6 }, { id: 'tone', label: 'TONE', def: 0.5 }] },
  { id: 'tapestop', label: 'TAPE STOP', hint: 'slow wind-down to instant stop', a: ['Tape', 'Sleepy', 'Rusty'], b: ['Halt', 'Stop', 'Nap'] , params: [{ id: 'spin', label: 'SPIN-UP', def: 0.5 }, { id: 'dark', label: 'DARK', def: 0.6 }] },
  { id: 'stutter', label: 'STUTTER', hint: 'loops tiny slices: 1/8 rolling down to 1/64', a: ['Stutter', 'Glitchy', 'Jittery'], b: ['Glitch', 'Chop', 'Twitch'] , params: [{ id: 'feel', label: 'TRIPLET', def: 0, steps: 2 }, { id: 'fade', label: 'FADE', def: 0 }] },
  { id: 'crusher', label: 'BIT CRUSH', hint: 'fewer bits, gritty', a: ['Pixel', 'Crunchy', 'Gritty'], b: ['Static', 'Crunch', 'Grit'] , params: [{ id: 'tone', label: 'TONE', def: 0.5 }, { id: 'mix', label: 'MIX', def: 1 }] },
  { id: 'lofi', label: 'LO-FI', hint: 'lower sample rate + bits + hiss', a: ['Cassette', 'Dusty', 'Lo-Fi'], b: ['Dust', 'Hiss', 'Cassette'] , params: [{ id: 'era', label: 'ERA', def: 0.4, steps: 4 }, { id: 'hiss', label: 'HISS', def: 0.4 }] },
  { id: 'wobble', label: 'VINYL WOBBLE', hint: 'warped record wow + crackle', a: ['Warped', 'Vinyl', 'Seasick'], b: ['Wobble', 'Warp', 'Wow'] , params: [{ id: 'rate', label: 'RATE', def: 0.4 }, { id: 'crackle', label: 'CRACKLE', def: 0.5 }] },
  { id: 'saturate', label: 'TAPE SATURATION', hint: 'warm drive, then fuzz', a: ['Toasty', 'Warm', 'Molten'], b: ['Glow', 'Toast', 'Ember'] , params: [{ id: 'tone', label: 'TONE', def: 0.5 }, { id: 'mix', label: 'MIX', def: 1 }] },
  { id: 'wash', label: 'REVERB WASH', hint: 'drowns in a big room', a: ['Misty', 'Dewy', 'Cathedral'], b: ['Bloom', 'Wash', 'Mist'] , params: [{ id: 'size', label: 'SIZE', def: 0.6, steps: 4 }, { id: 'damp', label: 'DAMP', def: 0.5 }] },
  { id: 'chorus', label: 'CHORUS', hint: 'wide, shimmering doubles', a: ['Shimmer', 'Twin', 'Glassy'], b: ['Shimmer', 'Choir', 'Sparkle'] , params: [{ id: 'rate', label: 'RATE', def: 0.4 }, { id: 'depth', label: 'DEPTH', def: 0.5 }] },
  { id: 'ringmod', label: 'RING MOD', hint: 'metallic, bell-like, higher as you go', a: ['Robot', 'Tin', 'Clanky'], b: ['Bells', 'Clank', 'Robot'] , params: [{ id: 'range', label: 'RANGE', def: 0.5 }, { id: 'square', label: 'SQUARE', def: 0 }] },
  { id: 'dive', label: 'PITCH DIVE', hint: 'pitch falls, up to two octaves', a: ['Diving', 'Sinking', 'Falling'], b: ['Dive', 'Plunge', 'Sink'] , params: [{ id: 'depth', label: 'DEPTH', def: 0.6 }, { id: 'glide', label: 'GLIDE', def: 0.3 }] },
  { id: 'gate', label: 'TRANCE GATE', hint: 'rhythmic chop pattern, busier as you go', a: ['Pulsing', 'Strobe', 'Blinking'], b: ['Pulse', 'Strobe', 'Gate'] , params: [{ id: 'pattern', label: 'PATTERN', def: 0, steps: 6 }, { id: 'smooth', label: 'SMOOTH', def: 0.2 }] },
  { id: 'reverse', label: 'REVERSE REPEAT', hint: 'plays the last beat backwards', a: ['Backwards', 'Mirror', 'Rewind'], b: ['Rewind', 'Mirror', 'Reverse'] , params: [{ id: 'length', label: 'LENGTH', def: 0.5, steps: 4 }, { id: 'mix', label: 'MIX', def: 1 }] },
];

export const XY_EFFECTS = SHELL_EFFECTS.map((e) => e.id);
export const XY_LABELS = Object.fromEntries(SHELL_EFFECTS.map((e) => [e.id, e.label]));
export const XY_HINTS = Object.fromEntries(SHELL_EFFECTS.map((e) => [e.id, e.hint]));
const byId = Object.fromEntries(SHELL_EFFECTS.map((e) => [e.id, e]));

// Slugz / nature / retro-tech words that open a name.
const OPENERS = ['Mossy', 'Shell', 'Slimy', 'Dewdrop', 'Snail', 'Fern', 'Mushroom', 'Pebble', 'Lichen', 'Puddle',
  'Floppy', 'Pixel', 'Cassette', 'Dial-up', 'Turbo', 'Handheld', 'CRT', 'Modem', 'VHS', 'Leafy', 'Garden', 'Midnight', 'Rainy'];
// (Only generic words: no brand or product names.)

const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const pick = (list, n) => list[n % list.length];

/**
 * A fun name for an X/Y pairing, like "Mossy Tape Dive" or "Shell Static Bloom".
 * Same pairing + same `roll` = same name; change `roll` (the dice) for another.
 */
export function comboName(x, y, roll = 0) {
  const X = byId[x] || SHELL_EFFECTS[0];
  const Y = byId[y] || SHELL_EFFECTS[0];
  const h = hash(`${x}|${y}|${roll}`);
  const opener = pick(OPENERS, h);
  const mid = pick(X.a, h >>> 5);
  let end = pick(Y.b, h >>> 9);
  if (end === mid) end = pick(Y.b, (h >>> 9) + 1);
  return `${opener} ${mid} ${end}`;
}

/** A few combos to start with (all deletable). */
export const STARTER_COMBOS = [
  { x: 'filter', y: 'delay' },
  { x: 'tapestop', y: 'dive' },
  { x: 'lofi', y: 'wash' },
].map((c) => ({ ...c, name: comboName(c.x, c.y) }));
export const DEFAULT_COMBOS = STARTER_COMBOS;

/** Beat-repeat length (in beats) for an amount: more amount = shorter repeat. */
export function repeatBeats(amount) {
  const lens = [1, 1 / 2, 1 / 4, 1 / 8, 1 / 16];
  return lens[Math.min(lens.length - 1, Math.floor(Math.max(0, amount - 0.08) / 0.92 * lens.length))];
}

/**
 * TAPE STOP timing: how long a full wind-down takes at this position on the
 * axis. Just past the start = a slow 3 s wind-down; the far end = instant.
 */
export const tapeStopSeconds = (amount) => 3 * Math.pow(0.04 / 3, Math.pow(Math.max(0, Math.min(1, (amount - 0.05) / 0.95)), 1.5));

/** Snap-back curve: where an axis is after `t` seconds of gliding home from `from`. */
export const snapBack = (from, t, time = 0.25) => (t >= time ? 0 : from * Math.pow(1 - t / time, 2));

/** Default hidden-knob values for an effect: { id: value }. */
export const defaultParams = (id) => Object.fromEntries((byId[id]?.params || []).map((p) => [p.id, p.def]));
export const paramsOf = (id) => byId[id]?.params || [];

/** What the pad can affect. */
export const XY_TARGETS = ['ALL', 'BAND', 'DRUMS', 'SAMPLER'];

// Tempo-synced choices used by the hidden knobs (in beats).
export const LFO_RATES = [16, 8, 4, 2, 1, 0.5, 0.25]; // 4 bars ... 1/16
export const LFO_RATE_NAMES = ['4 BARS', '2 BARS', '1 BAR', '1/2', '1/4', '1/8', '1/16'];
export const DELAY_TIMES = [0.5, 0.75, 1, 1.5, 2]; // 1/8, dotted 1/8, 1/4, dotted 1/4, 1/2
export const DELAY_TIME_NAMES = ['1/8', '1/8.', '1/4', '1/4.', '1/2'];
export const LOFI_ERAS = ['SAMPLER', 'CASSETTE', 'RADIO', 'CONSOLE'];
export const ISO_BANDS = ['LOWS', 'MIDS', 'HIGHS', 'SWEEP'];

/** STUTTER slice length (in beats) for an amount: 1/8 note rolling down to 1/64. */
export function stutterBeats(amount) {
  const lens = [0.5, 0.25, 0.125, 0.0625];
  return lens[Math.min(lens.length - 1, Math.floor(Math.max(0, amount - 0.06) / 0.94 * lens.length))];
}
export const stepOf = (v, n) => Math.min(n - 1, Math.floor(v * n));

/**
 * Factory presets: ready-made pairings with their hidden knobs set. They show
 * first on the SHELL SHOCK page; your saved combos come after them.
 * (px / py = hidden-knob settings for X / Y.)
 */
export const FACTORY_PRESETS = [
  { name: 'DJ FILTER', x: 'filter', y: 'isolator', py: { band: 0.4 } }, // Y kills the mids
  { name: 'KILL LOWS', x: 'isolator', y: 'filter', px: { band: 0.1 } },
  { name: 'KILL MIDS', x: 'isolator', y: 'filter', px: { band: 0.4 } },
  { name: 'KILL HIGHS', x: 'isolator', y: 'filter', px: { band: 0.6 } },
  { name: 'STUTTER ROLL', x: 'stutter', y: 'filter' },
  { name: 'BEAT REPEAT', x: 'looper', y: 'filter' },
  { name: 'DUB ECHO', x: 'delay', y: 'filter', px: { time: 0.5, fb: 0.75 } },
  { name: 'TAPE STOP', x: 'tapestop', y: 'dive' },
  { name: 'LO-FI DUST', x: 'lofi', y: 'wobble', px: { era: 0.3 } },
  { name: 'LFO SWEEP', x: 'lfofilter', y: 'isolator', px: { rate: 0.6 }, py: { band: 0.1 } },
  { name: 'TRANCE GATE', x: 'gate', y: 'delay' },
  { name: 'REWIND', x: 'reverse', y: 'wash' },
  { name: 'SPACE', x: 'phaser', y: 'flanger' },
  { name: 'GLITCH', x: 'stutter', y: 'crusher', px: { feel: 0.8 } },
  { name: 'WASH OUT', x: 'wash', y: 'filter' },
  { name: 'ROBOT', x: 'ringmod', y: 'crusher' },
  { name: 'WARM TAPE', x: 'saturate', y: 'chorus' },
];
