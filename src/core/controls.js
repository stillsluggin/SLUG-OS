// controls.js — the Slug OS control surface, laid out like the M-VAVE FM-1:
// 27 keys (C to D), 7 knobs, a few buttons and a small colour screen.
// The browser draws exactly these; the FM-1 port maps its hardware ids onto them.

export const KEY_COUNT = 27;
export const BASE_MIDI = 48; // key 0 = C3 for MIDI input

const BLACK_PCS = new Set([1, 3, 6, 8, 10]);

// Low black keys: joystick directions that bend the chord while held.
export const BENDS = ['seventh', 'ninth', 'sus', 'inversion', 'borrowed'];
export const BEND_INFO = {
  seventh: { arrow: '↑', label: '7TH' },
  ninth: { arrow: '↗', label: '9TH' },
  sus: { arrow: '→', label: 'SUS' },
  inversion: { arrow: '↓', label: 'INV' },
  borrowed: { arrow: '←', label: 'BOR' },
};

// High black keys: play a Next Chord suggestion, or REST.
export const PICKS = ['best', 'NOSTALGIC', 'EMOTIONAL', 'CALM', 'SURPRISE', 'rest'];
export const PICK_INFO = {
  best: { label: 'NEXT' }, NOSTALGIC: { label: 'NOST' }, EMOTIONAL: { label: 'EMO' },
  CALM: { label: 'CALM' }, SURPRISE: { label: 'SURP' }, rest: { label: 'REST' },
};

/**
 * section 'chord' low whites: chords I..vii (degree)
 *         'bend'  low blacks: bends (bend)
 *         'plate' high whites: the strum plate, plays the focused player (pos 0..8)
 *         'pick'  high blacks: Next Chord picks (pick)
 */
export const KEYS = (() => {
  const keys = [];
  let deg = 0, bend = 0, plate = 0, pick = 0;
  for (let i = 0; i < KEY_COUNT; i++) {
    const pc = i % 12;
    const black = BLACK_PCS.has(pc);
    const k = { index: i, pc, black };
    if (i < 12 && !black) Object.assign(k, { section: 'chord', degree: deg++ });
    else if (i < 12) Object.assign(k, { section: 'bend', bend: BENDS[bend++] });
    else if (!black) Object.assign(k, { section: 'plate', pos: plate++ });
    else Object.assign(k, { section: 'pick', pick: PICKS[pick++] });
    keys.push(k);
  }
  return keys;
})();

export const BUTTONS = [
  { id: 'play', label: 'PLAY' },
  { id: 'latch', label: 'LATCH' },
  { id: 'key', label: 'KEY' },
  { id: 'rec', label: 'REC' },
  { id: 'player', label: 'PLAYER' },
];

// The 7 knobs. A and B are the focused player's two engine knobs.
export const KNOBS = [
  { id: 'tempo', label: 'TEMPO' },
  { id: 'swing', label: 'SWING' },
  { id: 'human', label: 'HUMAN' },
  { id: 'style', label: 'STYLE', steps: 6 },
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
  { id: 'level', label: 'LEVEL' },
];
