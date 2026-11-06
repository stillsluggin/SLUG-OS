// xy.js — the XY Effects Pad's choices, as data.
// X axis = one effect, Y axis = another; each axis is a single "amount" (0..1).
// 0 = effect off. On release the pad glides back to 0 unless HOLD is on.

export const XY_EFFECTS = ['filter', 'isolator', 'looper', 'phaser', 'flanger', 'delay', 'tapestop', 'stutter', 'crusher'];

export const XY_LABELS = {
  filter: 'FILTER', isolator: 'ISOLATOR', looper: 'BEAT REPEAT', phaser: 'PHASER', flanger: 'FLANGER',
  delay: 'DELAY', tapestop: 'TAPE STOP', stutter: 'STUTTER', crusher: 'BIT CRUSH',
};

/** What dragging further along an axis does, in a few words. */
export const XY_HINTS = {
  filter: 'darker', isolator: 'kills lows, then mids', looper: 'shorter repeats', phaser: 'deeper swirl',
  flanger: 'deeper jet', delay: 'more echoes', tapestop: 'faster stop', stutter: 'faster chops', crusher: 'fewer bits',
};

export const DEFAULT_COMBOS = [
  { name: 'DUB', x: 'filter', y: 'delay' },
  { name: 'DJ KILL', x: 'isolator', y: 'filter' },
  { name: 'GLITCH', x: 'stutter', y: 'crusher' },
  { name: 'BREAK', x: 'looper', y: 'tapestop' },
];

/** Beat-repeat length (in beats) for an amount: more amount = shorter repeat. */
export function repeatBeats(amount) {
  const lens = [1, 1 / 2, 1 / 4, 1 / 8, 1 / 16];
  return lens[Math.min(lens.length - 1, Math.floor(Math.max(0, amount - 0.08) / 0.92 * lens.length))];
}

/** Snap-back curve: where an axis is after `t` seconds of gliding home from `from`. */
export const snapBack = (from, t, time = 0.25) => (t >= time ? 0 : from * Math.pow(1 - t / time, 2));
