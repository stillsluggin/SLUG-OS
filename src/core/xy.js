// xy.js — SHELL SHOCK, the XY effects pad: the effect list and combo names.
// Pure data, no audio or DOM.
//
// X axis = one effect, Y axis = another, each with a single "amount" (0..1,
// 0 = off). On release the pad glides back to 0 unless HOLD is on.
//
// HOW TO ADD AN EFFECT
//   1. Add an entry to SHELL_EFFECTS below: id, label, a short hint, and a few
//      words for combo names (`a` words lead a name, `b` words end it).
//   2. Add a maker with the same id in src/audio/xyfx.js (MAKERS).
//   That's it: the loader list, names and saving pick it up automatically.
//   (tests/core.test.mjs checks every effect here has a maker.)

export const SHELL_EFFECTS = [
  { id: 'filter', label: 'FILTER', hint: 'low-pass sweep, darker', a: ['Muffled', 'Murky', 'Underwater'], b: ['Fog', 'Sweep', 'Haze'] },
  { id: 'isolator', label: 'ISOLATOR', hint: 'kills lows, then mids', a: ['Hollow', 'Thin', 'Skeleton'], b: ['Kill', 'Cut', 'Drop'] },
  { id: 'looper', label: 'BEAT REPEAT', hint: 'loops the last beat, shorter as you go', a: ['Looping', 'Stuck', 'Echoing'], b: ['Loop', 'Repeat', 'Spiral'] },
  { id: 'phaser', label: 'PHASER', hint: 'deep swirl', a: ['Swirly', 'Spinning', 'Liquid'], b: ['Swirl', 'Whirl', 'Eddy'] },
  { id: 'flanger', label: 'FLANGER', hint: 'jet-plane whoosh', a: ['Jet', 'Metal', 'Comet'], b: ['Jet', 'Rush', 'Streak'] },
  { id: 'delay', label: 'DELAY', hint: 'tempo echoes, more = longer', a: ['Echo', 'Canyon', 'Cave'], b: ['Echo', 'Ripple', 'Return'] },
  { id: 'tapestop', label: 'TAPE STOP', hint: 'slow wind-down to instant stop', a: ['Tape', 'Sleepy', 'Rusty'], b: ['Halt', 'Stop', 'Nap'] },
  { id: 'stutter', label: 'STUTTER', hint: 'chops in time, faster as you go', a: ['Stutter', 'Glitchy', 'Jittery'], b: ['Glitch', 'Chop', 'Twitch'] },
  { id: 'crusher', label: 'BIT CRUSH', hint: 'fewer bits, gritty', a: ['Pixel', 'Crunchy', 'Gritty'], b: ['Static', 'Crunch', 'Grit'] },
  { id: 'lofi', label: 'LO-FI', hint: 'lower sample rate + bits + hiss', a: ['Cassette', 'Dusty', 'Lo-Fi'], b: ['Dust', 'Hiss', 'Cassette'] },
  { id: 'wobble', label: 'VINYL WOBBLE', hint: 'warped record wow + crackle', a: ['Warped', 'Vinyl', 'Seasick'], b: ['Wobble', 'Warp', 'Wow'] },
  { id: 'saturate', label: 'TAPE SATURATION', hint: 'warm drive, then fuzz', a: ['Toasty', 'Warm', 'Molten'], b: ['Glow', 'Toast', 'Ember'] },
  { id: 'wash', label: 'REVERB WASH', hint: 'drowns in a big room', a: ['Misty', 'Dewy', 'Cathedral'], b: ['Bloom', 'Wash', 'Mist'] },
  { id: 'chorus', label: 'CHORUS', hint: 'wide, shimmering doubles', a: ['Shimmer', 'Twin', 'Glassy'], b: ['Shimmer', 'Choir', 'Sparkle'] },
  { id: 'ringmod', label: 'RING MOD', hint: 'metallic, bell-like, higher as you go', a: ['Robot', 'Tin', 'Clanky'], b: ['Bells', 'Clank', 'Robot'] },
  { id: 'dive', label: 'PITCH DIVE', hint: 'pitch falls, up to two octaves', a: ['Diving', 'Sinking', 'Falling'], b: ['Dive', 'Plunge', 'Sink'] },
  { id: 'gate', label: 'TRANCE GATE', hint: 'rhythmic chop pattern, busier as you go', a: ['Pulsing', 'Strobe', 'Blinking'], b: ['Pulse', 'Strobe', 'Gate'] },
  { id: 'reverse', label: 'REVERSE REPEAT', hint: 'plays the last beat backwards', a: ['Backwards', 'Mirror', 'Rewind'], b: ['Rewind', 'Mirror', 'Reverse'] },
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
