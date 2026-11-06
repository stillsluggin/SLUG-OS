// players.js — the Slug Band. Each player is a little musician with its own
// personality. The clock asks every player, once per 16th-note step, what it
// wants to play. Players return note events; they never touch audio.
//
//   HARMONY  plays the chords: COMP (style rhythm), SUSTAIN, STRUM, ARP
//   MELODY   plays short singable motifs, call and response, lots of space
//   BASS     plays the bass line (Bass Latch follow modes, see bass.js)
//   SOLOIST  improvises phrases in key, aiming for chord tones, with slides
//   DRUMMER  plays the drum pattern (see drums.js)
//
// Event: { player, notes:[midi], vel, dur (steps), late (s), glide (bool) }
//        drummer: { player:'drummer', drum:'kick', vel }

import { mod12, scalePcs } from './theory.js';
import { chordPcs } from './chord.js';
import { BASS_MODES, bassRoot, bassHit, walkingBar } from './bass.js';

export const PLAYER_IDS = ['harmony', 'melody', 'bass', 'soloist', 'drummer'];
export const PLAYER_NAMES = { harmony: 'HARMONY', melody: 'MELODY', bass: 'BASS', soloist: 'SOLOIST', drummer: 'DRUMMER' };
export const MODES = ['FOLLOW', 'FREE', 'MUTE'];
export const HARMONY_MODES = ['COMP', 'SUSTAIN', 'STRUM', 'ARP', 'CHOP'];
export { BASS_MODES };

// ---------------------------------------------------------------- rhythms
// Per style. Steps are 16ths in a bar. Each style has several comping and
// strum patterns and 4 bars of bass; FORM says which pattern each bar of a
// 4-bar phrase uses (the last bar is usually a turnaround), so the band never
// plays the exact same bar over and over.
//   comps:  [ [step, length, velocity], ... ] per pattern
//   strums: [ [step, velocity], ... ] per pattern
//   bass:   one row per bar: [step, tone, length, velocity]  (tones: R 5 8 3 b7 apr)
//   arp:    steps per arpeggio note (2 = 8ths, 1 = 16ths, 4 = quarters)
export const STYLE_FEEL = {
  // BREATHE (id nujabes): laid back, lazy pushes, lyrical.
  nujabes: {
    late: 0.014, form: [0, 1, 0, 2], arp: 2,
    comps: [
      [[0, 6, 0.8], [7, 2, 0.42], [10, 5, 0.62]],
      [[0, 3, 0.75], [3, 3, 0.5], [10, 6, 0.6]],
      [[0, 6, 0.8], [8, 2, 0.5], [11, 2, 0.45], [14, 2, 0.55]],
    ],
    strums: [[[0, 0.8], [6, 0.5], [10, 0.65]], [[0, 0.8], [3, 0.45], [8, 0.6], [14, 0.4]]],
    bass: [
      [[0, 'R', 5, 0.9], [6, 'R', 1, 0.55], [8, '5', 3, 0.75], [11, '8', 2, 0.6], [14, 'R', 2, 0.7]],
      [[0, 'R', 5, 0.9], [6, '5', 2, 0.62], [8, 'b7', 2, 0.7], [10, '8', 3, 0.7], [15, 'apr', 1, 0.6]],
      [[0, 'R', 3, 0.9], [3, 'R', 2, 0.55], [7, '5', 1, 0.6], [8, '8', 4, 0.75], [14, '5', 2, 0.6]],
      [[0, 'R', 5, 0.9], [6, '3', 2, 0.6], [8, '5', 2, 0.7], [11, 'b7', 1, 0.6], [12, '8', 2, 0.7], [15, 'apr', 1, 0.65]],
    ],
    melodyDensity: 0.45, soloDensity: 0.55,
  },
  // FOCUS (id tyler): long floating chords, open space.
  tyler: {
    late: 0.006, form: [0, 0, 1, 2], arp: 2,
    comps: [
      [[0, 8, 0.72], [8, 8, 0.55]],
      [[0, 12, 0.7], [12, 4, 0.5]],
      [[0, 4, 0.65], [6, 4, 0.5], [12, 4, 0.55]],
    ],
    strums: [[[0, 0.75], [8, 0.6]], [[0, 0.75], [6, 0.5], [12, 0.6]]],
    bass: [
      [[0, 'R', 7, 0.85], [8, '5', 5, 0.7], [14, 'apr', 2, 0.6]],
      [[0, 'R', 6, 0.85], [7, '8', 1, 0.55], [8, '3', 5, 0.7], [15, 'apr', 1, 0.6]],
      [[0, 'R', 12, 0.85], [12, '5', 4, 0.6]],
      [[0, 'R', 4, 0.85], [6, '8', 2, 0.6], [8, '5', 4, 0.7], [12, 'b7', 2, 0.6], [15, 'apr', 1, 0.6]],
    ],
    melodyDensity: 0.4, soloDensity: 0.5,
  },
  // STOMP (id motown): backbeat chops, busy bass.
  motown: {
    late: 0, form: [0, 1, 0, 2], arp: 2,
    comps: [
      [[0, 2, 0.5], [4, 2, 0.8], [10, 1, 0.45], [12, 2, 0.8]],
      [[4, 2, 0.8], [7, 1, 0.5], [12, 2, 0.8], [15, 1, 0.45]],
      [[0, 1, 0.6], [2, 1, 0.5], [4, 2, 0.85], [8, 1, 0.55], [10, 1, 0.6], [12, 2, 0.85], [14, 1, 0.5]],
    ],
    strums: [[[4, 0.8], [12, 0.8], [14, 0.4]], [[0, 0.5], [4, 0.85], [10, 0.45], [12, 0.85]]],
    bass: [
      [[0, 'R', 2, 0.95], [3, 'R', 1, 0.6], [4, '5', 2, 0.75], [6, '8', 1, 0.7], [8, 'R', 2, 0.9], [10, '3', 1, 0.65], [11, '5', 1, 0.7], [12, '8', 2, 0.8], [15, 'apr', 1, 0.65]],
      [[0, 'R', 2, 0.95], [3, '8', 1, 0.6], [4, '5', 2, 0.75], [6, 'R', 1, 0.7], [8, 'b7', 2, 0.85], [10, '5', 1, 0.65], [11, '3', 1, 0.7], [12, 'R', 2, 0.8], [14, '5', 1, 0.6], [15, 'apr', 1, 0.65]],
      [[0, 'R', 1, 0.95], [2, 'R', 1, 0.6], [4, '8', 1, 0.75], [6, '5', 1, 0.7], [8, 'R', 1, 0.9], [9, '3', 1, 0.6], [10, '5', 1, 0.7], [12, '8', 1, 0.8], [13, 'b7', 1, 0.6], [14, '5', 1, 0.7], [15, 'apr', 1, 0.65]],
      [[0, 'R', 3, 0.95], [4, '5', 2, 0.75], [7, 'R', 1, 0.6], [8, '8', 2, 0.85], [11, '5', 1, 0.65], [12, '3', 2, 0.75], [14, '5', 1, 0.6], [15, 'apr', 1, 0.7]],
    ],
    melodyDensity: 0.6, soloDensity: 0.65,
  },
  // CRUISE: G-funk. Slow bounce, chords on the "and", long gliding bass.
  cruise: {
    late: 0.01, form: [0, 1, 0, 2], arp: 2,
    comps: [
      [[0, 3, 0.7], [6, 2, 0.5], [8, 3, 0.65], [14, 2, 0.45]],
      [[0, 8, 0.6], [10, 2, 0.5], [12, 3, 0.55]],
      [[0, 2, 0.7], [3, 2, 0.5], [8, 2, 0.65], [11, 2, 0.5], [14, 2, 0.5]],
    ],
    strums: [[[0, 0.7], [8, 0.65]], [[0, 0.7], [6, 0.5], [10, 0.6]]],
    bass: [
      [[0, 'R', 3, 0.95], [3, '8', 1, 0.6], [4, 'R', 2, 0.7], [8, '5', 3, 0.8], [11, 'b7', 1, 0.6], [12, '8', 2, 0.7], [14, 'apr', 2, 0.65]],
      [[0, 'R', 6, 0.95], [7, '5', 1, 0.6], [8, '8', 4, 0.8], [14, 'b7', 2, 0.65]],
      [[0, 'R', 3, 0.95], [4, '3', 2, 0.65], [6, '5', 2, 0.7], [8, 'R', 3, 0.85], [12, '8', 3, 0.75], [15, 'apr', 1, 0.6]],
      [[0, 'R', 4, 0.95], [6, '8', 2, 0.65], [8, '5', 2, 0.75], [10, 'b7', 2, 0.65], [12, '8', 2, 0.7], [14, 'apr', 2, 0.65]],
    ],
    melodyDensity: 0.45, soloDensity: 0.6,
  },
  // BLOOM: gospel-tinged neo-soul. Very behind the beat, pushes and ghost stabs.
  bloom: {
    late: 0.022, form: [0, 1, 0, 2], arp: 1,
    comps: [
      [[0, 2, 0.65], [3, 4, 0.55], [10, 3, 0.6]],
      [[0, 1, 0.5], [2, 5, 0.7], [9, 2, 0.5], [12, 3, 0.6]],
      [[0, 4, 0.7], [6, 2, 0.5], [8, 2, 0.6], [12, 1, 0.5], [14, 2, 0.6]],
    ],
    strums: [[[0, 0.7], [3, 0.5], [10, 0.6]], [[2, 0.7], [9, 0.5], [12, 0.6]]],
    bass: [
      [[0, 'R', 3, 0.9], [3, '5', 2, 0.6], [6, '8', 1, 0.55], [8, 'R', 2, 0.8], [10, 'b7', 2, 0.6], [13, '5', 1, 0.55], [14, 'apr', 2, 0.6]],
      [[0, 'R', 2, 0.9], [2, 'R', 1, 0.5], [3, '3', 2, 0.6], [7, '5', 1, 0.6], [8, '8', 3, 0.75], [12, 'b7', 2, 0.6], [15, 'apr', 1, 0.6]],
      [[0, 'R', 4, 0.9], [5, '5', 1, 0.55], [6, '8', 2, 0.65], [10, '5', 2, 0.6], [12, 'R', 2, 0.7], [14, '3', 1, 0.55], [15, 'apr', 1, 0.6]],
      [[0, 'R', 3, 0.9], [4, 'b7', 2, 0.6], [6, '5', 2, 0.6], [8, '8', 2, 0.75], [11, '5', 1, 0.6], [12, '3', 2, 0.65], [14, 'apr', 2, 0.6]],
    ],
    melodyDensity: 0.5, soloDensity: 0.6,
  },
  // DRIFT: calm and spacious. Long pads, very few bass notes, slow arpeggios.
  drift: {
    late: 0.03, form: [0, 0, 1, 2], arp: 4,
    comps: [
      [[0, 16, 0.55]],
      [[0, 8, 0.5], [8, 8, 0.45]],
      [[0, 12, 0.5], [12, 4, 0.4]],
    ],
    strums: [[[0, 0.55]], [[0, 0.5], [8, 0.4]]],
    bass: [
      [[0, 'R', 14, 0.7]],
      [[0, 'R', 8, 0.7], [8, '5', 8, 0.55]],
      [[0, 'R', 12, 0.7], [12, '8', 4, 0.5]],
      [[0, 'R', 6, 0.7], [8, '5', 6, 0.55], [14, 'apr', 2, 0.45]],
    ],
    melodyDensity: 0.3, soloDensity: 0.35,
  },
};

// ---- Hip hop, jazz, funk and soul grooves (styles, not artists) ----
Object.assign(STYLE_FEEL, {
  // BOOM BAP: chopped stabs that sit with the kick, sparse bass that locks to it.
  boombap: {
    late: 0.012, form: [0, 1, 0, 2], arp: 2,
    comps: [
      [[0, 2, 0.85], [6, 1, 0.6], [10, 2, 0.75]],
      [[0, 4, 0.8], [7, 2, 0.55], [11, 1, 0.5], [14, 2, 0.6]],
      [[0, 2, 0.85], [3, 1, 0.5], [8, 2, 0.75], [14, 1, 0.55]],
    ],
    strums: [[[0, 0.8], [10, 0.6]], [[0, 0.8], [7, 0.5], [12, 0.6]]],
    chops: [[[0, 0.9], [3, 0.55], [6, 0.7], [10, 0.8], [11, 0.5], [14, 0.6]], [[0, 0.9], [2, 0.5], [7, 0.7], [10, 0.8], [13, 0.55]]],
    bass: [
      [[0, 'R', 4, 0.95], [7, 'R', 1, 0.6], [10, '5', 3, 0.75], [14, '8', 1, 0.55]],
      [[0, 'R', 3, 0.95], [3, 'R', 1, 0.55], [8, '8', 2, 0.7], [10, 'R', 4, 0.8]],
      [[0, 'R', 6, 0.95], [10, 'b7', 2, 0.65], [12, '5', 2, 0.65], [15, 'apr', 1, 0.55]],
      [[0, 'R', 4, 0.95], [6, '5', 1, 0.6], [7, '8', 1, 0.55], [10, 'R', 3, 0.8], [14, 'apr', 2, 0.6]],
    ],
    melodyDensity: 0.4, soloDensity: 0.5,
  },
  // DUSTY: jazz hip hop. Charleston comping, walking-ish bass, swung.
  dusty: {
    late: 0.016, form: [0, 1, 0, 2], arp: 1,
    comps: [
      [[0, 3, 0.7], [6, 2, 0.6]],
      [[3, 2, 0.6], [10, 3, 0.65]],
      [[0, 2, 0.65], [6, 1, 0.5], [8, 2, 0.6], [14, 2, 0.55]],
    ],
    strums: [[[0, 0.7], [6, 0.55]], [[3, 0.6], [10, 0.6]]],
    chops: [[[0, 0.8], [6, 0.6], [10, 0.7]], [[3, 0.7], [8, 0.6], [14, 0.6]]],
    bass: [
      [[0, 'R', 3, 0.9], [4, '5', 3, 0.7], [8, '8', 3, 0.75], [12, 'apr', 3, 0.65]],
      [[0, 'R', 3, 0.9], [4, '3', 3, 0.7], [8, '5', 3, 0.72], [12, 'b7', 3, 0.65]],
      [[0, 'R', 3, 0.9], [4, '8', 3, 0.7], [8, '5', 2, 0.72], [11, '3', 1, 0.55], [12, 'apr', 3, 0.65]],
      [[0, 'R', 3, 0.9], [4, 'b7', 3, 0.7], [8, '5', 3, 0.7], [12, '3', 2, 0.65], [15, 'apr', 1, 0.6]],
    ],
    melodyDensity: 0.55, soloDensity: 0.7,
  },
  // STRUT: funk. Tight 16th chops on the guitar/keys, slap-style octave bass.
  strut: {
    late: 0, form: [0, 1, 0, 2], arp: 1,
    comps: [
      [[0, 1, 0.85], [3, 1, 0.55], [6, 1, 0.7], [10, 1, 0.6], [12, 1, 0.8], [14, 1, 0.5]],
      [[2, 1, 0.7], [4, 1, 0.8], [7, 1, 0.55], [10, 1, 0.65], [13, 1, 0.6]],
      [[0, 1, 0.85], [1, 1, 0.5], [4, 1, 0.75], [6, 1, 0.6], [8, 1, 0.8], [11, 1, 0.55], [12, 1, 0.75], [14, 1, 0.6], [15, 1, 0.5]],
    ],
    strums: [[[0, 0.8], [3, 0.5], [6, 0.7], [10, 0.6], [12, 0.8]], [[2, 0.7], [4, 0.8], [10, 0.6], [14, 0.6]]],
    chops: [[[0, 0.9], [1, 0.5], [4, 0.8], [7, 0.6], [10, 0.75], [12, 0.85], [15, 0.5]]],
    bass: [
      [[0, 'R', 1, 0.95], [2, '8', 1, 0.7], [3, 'R', 1, 0.6], [6, 'b7', 1, 0.65], [7, '8', 1, 0.7], [8, 'R', 1, 0.9], [10, '5', 1, 0.65], [11, '8', 1, 0.7], [14, 'b7', 1, 0.6], [15, 'apr', 1, 0.65]],
      [[0, 'R', 2, 0.95], [3, '8', 1, 0.7], [4, 'R', 1, 0.6], [6, '5', 1, 0.7], [8, 'R', 1, 0.9], [9, '8', 1, 0.6], [11, 'b7', 1, 0.65], [12, '8', 1, 0.75], [14, '5', 1, 0.6], [15, 'apr', 1, 0.65]],
      [[0, 'R', 1, 0.95], [1, 'R', 1, 0.5], [3, '8', 1, 0.75], [6, 'R', 1, 0.7], [7, '8', 1, 0.65], [10, 'b7', 1, 0.7], [12, '5', 1, 0.75], [13, '8', 1, 0.6], [15, 'apr', 1, 0.65]],
      [[0, 'R', 2, 0.95], [3, 'b7', 1, 0.65], [4, '8', 1, 0.75], [7, '5', 1, 0.65], [8, 'R', 1, 0.9], [10, '8', 1, 0.7], [12, '3', 1, 0.65], [13, '5', 1, 0.6], [14, '8', 1, 0.7], [15, 'apr', 1, 0.65]],
    ],
    melodyDensity: 0.6, soloDensity: 0.7,
  },
  // GOLDEN: sweet soul. Straight 8th-note piano, Motown-ish walking bass.
  golden: {
    late: 0.008, form: [0, 1, 0, 2], arp: 2,
    comps: [
      [[0, 2, 0.7], [4, 2, 0.75], [8, 2, 0.7], [12, 2, 0.75]],
      [[0, 6, 0.7], [6, 2, 0.55], [10, 4, 0.65]],
      [[0, 2, 0.7], [4, 2, 0.75], [8, 1, 0.6], [10, 1, 0.55], [12, 2, 0.75], [14, 2, 0.6]],
    ],
    strums: [[[0, 0.7], [4, 0.6], [8, 0.7], [12, 0.6]], [[0, 0.7], [6, 0.55], [10, 0.65]]],
    chops: [[[0, 0.8], [4, 0.7], [10, 0.6], [12, 0.7]]],
    bass: [
      [[0, 'R', 3, 0.9], [4, '3', 2, 0.7], [6, '5', 2, 0.7], [8, '8', 3, 0.8], [12, '5', 2, 0.7], [15, 'apr', 1, 0.6]],
      [[0, 'R', 3, 0.9], [4, '5', 3, 0.7], [8, 'R', 2, 0.8], [10, '3', 2, 0.65], [12, '5', 3, 0.7]],
      [[0, 'R', 2, 0.9], [2, '8', 2, 0.6], [4, '5', 3, 0.7], [8, 'R', 3, 0.8], [12, 'b7', 2, 0.65], [14, 'apr', 2, 0.6]],
      [[0, 'R', 3, 0.9], [4, '3', 3, 0.7], [8, '5', 3, 0.75], [12, '8', 2, 0.7], [15, 'apr', 1, 0.6]],
    ],
    melodyDensity: 0.55, soloDensity: 0.55,
  },
  // KNOCK: hard hip hop. Few big chord hits, long sliding low bass, fast arps.
  knock: {
    late: 0, form: [0, 0, 1, 2], arp: 1,
    comps: [
      [[0, 8, 0.8]],
      [[0, 3, 0.8], [6, 2, 0.6], [10, 4, 0.7]],
      [[0, 6, 0.8], [12, 4, 0.6]],
    ],
    strums: [[[0, 0.8]], [[0, 0.8], [10, 0.6]]],
    chops: [[[0, 0.9], [3, 0.6], [10, 0.8]], [[0, 0.9], [6, 0.6], [7, 0.55], [12, 0.7]]],
    bass: [
      [[0, 'R', 6, 1], [7, 'R', 2, 0.7], [10, '8', 4, 0.8]],
      [[0, 'R', 3, 1], [3, 'R', 3, 0.75], [8, '5', 2, 0.7], [11, 'R', 4, 0.8]],
      [[0, 'R', 10, 1], [10, 'apr', 2, 0.7], [12, 'R', 4, 0.85]],
      [[0, 'R', 4, 1], [6, '8', 2, 0.75], [8, 'R', 3, 0.8], [12, 'b7', 2, 0.7], [14, 'apr', 2, 0.7]],
    ],
    melodyDensity: 0.35, soloDensity: 0.45,
  },
});

/** Which pattern bar `bar` uses in the 4-bar form. */
export const formIndex = (f, bar) => (f.form || [0])[bar % (f.form || [0]).length];

const feelOf = (style) => STYLE_FEEL[style] || STYLE_FEEL.nujabes;

// ---------------------------------------------------------------- HARMONY

export function harmonyEvents(s, ctx) {
  const { voicing, style, harmonyMode, chordStart } = ctx;
  if (!voicing || !voicing.length) return [];
  const f = feelOf(style);
  const ev = [];
  switch (harmonyMode) {
    case 'SUSTAIN':
      if (s === 0 || chordStart) ev.push({ player: 'harmony', notes: voicing, vel: 0.7, dur: 16, late: f.late });
      break;
    case 'STRUM':
      for (const [st, vel] of f.strums[formIndex(f, ctx.bar ?? 0) % f.strums.length]) {
        if (st !== s) continue;
        const down = (s / 2) % 2 === 0;
        const order = down ? voicing : [...voicing].reverse();
        order.forEach((n, i) => ev.push({ player: 'harmony', notes: [n], vel: vel * (1 - i * 0.06), dur: 5, late: f.late + i * 0.018 }));
      }
      break;
    case 'ARP': {
      // Up-and-down over the voicing plus an octave, at the style's speed.
      const r = f.arp || 2;
      if (s % r) break;
      const up = [...voicing, voicing[0] + 12];
      const cycle = [...up, ...up.slice(1, -1).reverse()];
      const n = cycle[(s / r) % cycle.length];
      ev.push({ player: 'harmony', notes: [n], vel: s % 8 === 0 ? 0.75 : 0.55, dur: r * 1.5, late: f.late });
      break;
    }
    case 'CHOP': {
      // Hip hop chops: short stabs like chopped-up record hits, flipping the
      // voicing around (full chord, top notes, an octave up) from hit to hit.
      const chops = f.chops || [[[0, 0.9], [3, 0.55], [6, 0.7], [10, 0.8], [14, 0.6]]];
      const pat = chops[formIndex(f, ctx.bar ?? 0) % chops.length];
      const k = pat.findIndex(([st]) => st === s);
      if (k < 0) break;
      const flips = [voicing, voicing.slice(-2), voicing.map((n) => n + 12).slice(0, 3), voicing.slice(0, 3)];
      ev.push({ player: 'harmony', notes: flips[(k + (ctx.bar ?? 0)) % flips.length], vel: pat[k][1], dur: 1.2, late: f.late });
      break;
    }
    default: { // COMP
      const comp = f.comps[formIndex(f, ctx.bar ?? 0) % f.comps.length];
      for (const [st, len, vel] of comp) if (st === s) ev.push({ player: 'harmony', notes: voicing, vel, dur: len, late: f.late });
    }
  }
  return ev;
}

// ---------------------------------------------------------------- BASS

export function bassEvents(s, ctx, mem) {
  const { chord, voicing, key, style, bassMode, nextChord, bar, rng } = ctx;
  if (!chord) return [];
  const root = bassRoot(bassMode, { chord, voicing, key, prevBass: mem.lastRoot });
  mem.lastRoot = root;
  if (bassMode === 'WALKING') {
    if (s % 4) return [];
    if (s === 0 || !mem.walk) mem.walk = walkingBar(chord, nextChord, key, root, rng);
    return [{ player: 'bass', notes: [mem.walk[s / 4]], vel: s === 0 ? 0.9 : 0.72, dur: 3.6, late: 0 }];
  }
  const rows = feelOf(style).bass[bar % feelOf(style).bass.length];
  const out = [];
  let hit = 0;
  for (const [st, tone, len, vel] of rows) {
    if (st === s) out.push({ player: 'bass', notes: [bassHit(bassMode, tone, hit, root, chord)], vel, dur: len, late: 0, glide: tone === 'apr' });
    if (st < s) hit++; // hits before this step, so modes can alternate
  }
  return out;
}

// ---------------------------------------------------------------- MELODY

const MOTIF_RHYTHMS = {
  nujabes: [[0, 3, 6, 12, 18], [2, 6, 8, 16, 22, 24], [0, 4, 10, 16, 20]],
  tyler: [[0, 6, 12, 20], [4, 8, 16, 24, 28], [0, 10, 14, 22]],
  motown: [[0, 2, 6, 8, 12, 16, 18, 22], [2, 4, 8, 14, 18, 20, 24], [0, 3, 6, 10, 16, 19, 22]],
  cruise: [[0, 4, 6, 12, 20], [2, 8, 10, 16, 24], [0, 3, 8, 14, 18, 22]],
  bloom: [[1, 3, 6, 9, 14, 18, 21], [0, 2, 5, 10, 16, 19, 24], [3, 6, 8, 12, 17, 22]],
  drift: [[0, 8, 16], [4, 12, 24], [0, 12, 20]],
  boombap: [[0, 3, 6, 10, 16, 22], [2, 6, 12, 18, 20, 26], [0, 4, 10, 14, 20]],
  dusty: [[0, 2, 3, 6, 10, 12, 16, 19, 22], [1, 4, 6, 9, 14, 16, 20, 24], [0, 3, 8, 11, 14, 18, 22, 27]],
  strut: [[0, 2, 3, 6, 8, 10, 14, 16, 18, 22], [1, 4, 6, 10, 12, 17, 20, 22, 26], [0, 3, 4, 8, 11, 12, 16, 19, 24]],
  golden: [[0, 2, 4, 8, 12, 16, 18, 20], [0, 4, 6, 10, 16, 22, 24], [2, 4, 8, 14, 18, 20, 26]],
  knock: [[0, 3, 6, 16, 19], [0, 6, 10, 16, 22], [2, 8, 12, 18]],
};

function scaleNotes(key, low, high) {
  const pcs = new Set(scalePcs(key));
  const out = [];
  for (let m = low; m <= high; m++) if (pcs.has(mod12(m))) out.push(m);
  return out;
}

function nearestIn(list, target) {
  return list.reduce((b, m) => (Math.abs(m - target) < Math.abs(b - target) ? m : b), list[0]);
}

/**
 * MELODY: a 2-bar motif (rhythm + scale-step shape) that repeats with small
 * variations, re-fitted to whatever chord is playing. Every third phrase rests.
 */
export function melodyEvents(s, ctx, mem) {
  const { chord, key, style, bar, rng } = ctx;
  if (!chord) return [];
  const pos = (bar % 2) * 16 + s; // 0..31 in the 2-bar phrase
  if (pos === 0) {
    mem.phrase = (mem.phrase || 0) + 1;
    if (!mem.motif || mem.phrase % 4 === 1) {
      const rh = MOTIF_RHYTHMS[style] || MOTIF_RHYTHMS.nujabes;
      const rhythm = rh[Math.floor(rng() * rh.length)];
      let step = 0;
      mem.motif = rhythm.map((p, i) => {
        step += i === 0 ? 0 : Math.round((rng() - 0.45) * 3);
        return { pos: p, shape: step, len: i === rhythm.length - 1 ? 6 : Math.min(4, (rhythm[i + 1] ?? 32) - p) };
      });
    } else if (rng() < 0.5) {
      // Vary one note of the shape.
      const i = Math.floor(rng() * mem.motif.length);
      mem.motif[i] = { ...mem.motif[i], shape: mem.motif[i].shape + (rng() < 0.5 ? 1 : -1) };
    }
    mem.resting = mem.phrase % 3 === 0 || rng() > feelOf(style).melodyDensity + 0.4;
  }
  if (mem.resting || !mem.motif) return [];
  const n = mem.motif.find((m) => m.pos === pos);
  if (!n) return [];
  const scale = scaleNotes(key, 62, 86);
  const tones = chordPcs(chord);
  const anchorPc = tones[(mem.phrase || 0) % tones.length];
  let anchor = scale.find((m) => mod12(m) === anchorPc && m >= 67) ?? 72;
  const idx = Math.max(0, Math.min(scale.length - 1, scale.indexOf(nearestIn(scale, anchor)) + n.shape));
  let note = scale[idx];
  if (s % 8 === 0) { // strong beat: land on a chord tone
    const ct = scale.filter((m) => tones.includes(mod12(m)));
    note = nearestIn(ct, note);
  }
  return [{ player: 'melody', notes: [note], vel: s % 4 === 0 ? 0.72 : 0.6, dur: n.len, late: feelOf(style).late }];
}

// ---------------------------------------------------------------- SOLOIST

/**
 * SOLOIST: improvised phrases. A random walk through the key's scale with
 * momentum, a preference for pentatonic notes, chord tones on the beat, the
 * odd chromatic approach and slide, and breaths between phrases.
 */
export function soloEvents(s, ctx, mem) {
  const { chord, key, style, rng } = ctx;
  if (!chord) return [];
  const density = feelOf(style).soloDensity;
  if (mem.rest > 0) { mem.rest--; return []; }
  if (!mem.left) {
    // Start a new phrase.
    mem.left = 4 + Math.floor(rng() * 9);
    mem.dir = rng() < 0.5 ? 1 : -1;
    mem.note = mem.note ?? 72;
  }
  const onBeat = s % 4 === 0;
  const play = onBeat ? rng() < 0.85 : rng() < density * (s % 2 ? 0.55 : 0.9);
  if (!play) return [];

  const scale = scaleNotes(key, 60, 88);
  const tones = chordPcs(chord);
  const penta = pentatonic(key);
  // Momentum walk: mostly steps, sometimes leaps, turn around at the edges.
  if (rng() < 0.22) mem.dir *= -1;
  let i = scale.indexOf(nearestIn(scale, mem.note));
  const jump = rng() < 0.15 ? 2 + Math.floor(rng() * 3) : 1;
  i += mem.dir * jump;
  if (i <= 1 || i >= scale.length - 2) { mem.dir *= -1; i = Math.max(1, Math.min(scale.length - 2, i)); }
  let note = scale[i];
  if (!penta.has(mod12(note)) && rng() < 0.6) note = scale[Math.min(scale.length - 1, i + mem.dir)];
  if (onBeat) note = nearestIn(scale.filter((m) => tones.includes(mod12(m))), note);
  const approach = !onBeat && rng() < 0.12; // chromatic lean into the next note
  if (approach) note -= 1;
  const glide = rng() < 0.18;
  mem.note = note;
  mem.left--;
  if (!mem.left) mem.rest = 3 + Math.floor(rng() * (14 - density * 8));
  const dur = mem.left ? (rng() < 0.3 ? 2 : 1) : 4 + Math.floor(rng() * 4);
  return [{ player: 'soloist', notes: [note], vel: (onBeat ? 0.78 : 0.62) + rng() * 0.1, dur, late: 0, glide }];
}

function pentatonic(key) {
  const iv = key.mode === 'minor' ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
  return new Set(iv.map((i) => mod12(key.tonic + i)));
}

// ---------------------------------------------------------------- notes for FREE play

/**
 * The 9 notes the strum plate (upper white keys) plays for a player in FREE
 * mode (or any player you point it at). Chord tones plus in-key colours, in
 * the player's register.
 */
export function plateNotes(player, chord, key) {
  const start = { harmony: 55, melody: 64, bass: 33, soloist: 67, drummer: 0 }[player] ?? 60;
  const pcs = new Set(chordPcs({ ...chord, ext: [] }));
  const scale = new Set(scalePcs(key));
  const nine = mod12(chord.root + 2);
  const six = mod12(chord.root + (chord.third === 'm' ? 5 : 9));
  if (player !== 'harmony') { if (scale.has(nine)) pcs.add(nine); if (scale.has(six)) pcs.add(six); }
  const out = [];
  for (let m = start; out.length < 9 && m < 110; m++) if (pcs.has(mod12(m))) out.push(m);
  return out;
}

