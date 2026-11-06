// drums.js — Slug Drums: pattern format, the boom bap generator, and the
// drummer player. Pure data and functions.
//
// A pattern is 16 steps per lane, each value 0 (off), 1 (soft/ghost) or 2 (hit).
// Lanes: KICK SNARE HAT OPEN RIM PERC.

export const LANES = ['kick', 'snare', 'hat', 'open', 'rim', 'perc'];
export const LANE_LABELS = { kick: 'KICK', snare: 'SNARE', hat: 'HAT', open: 'OPEN', rim: 'RIM', perc: 'PERC' };

export const emptyPattern = () => Object.fromEntries(LANES.map((l) => [l, Array(16).fill(0)]));

/**
 * Boom bap generator. Tempo shapes the feel:
 *   < 82 BPM   laid back: sparse kicks, ghost snares, 8th hats
 *   82–96      classic boom bap: kick 1 + "and of 2" pushes, 8th hats
 *   > 96       busier: 16th-note hat runs, more kick syncopation
 * Always: snare on 2 and 4 (steps 4 and 12), kick on 1.
 */
export function generateBoomBap(bpm, rng = Math.random) {
  const p = emptyPattern();
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const chance = (x) => rng() < x;
  const slow = bpm < 82;
  const fast = bpm > 96;

  // Kick
  p.kick[0] = 2;
  const kickIdeas = slow
    ? [[10], [7, 10], [9], [10, 11]]
    : fast ? [[3, 10], [6, 10, 11], [3, 7, 10], [2, 10, 14]] : [[7, 10], [10], [6, 10], [3, 10], [7, 9]];
  for (const s of pick(kickIdeas)) p.kick[s] = 2;
  if (chance(0.3)) p.kick[15] = 1;

  // Snare on 2 and 4, ghosts around them.
  p.snare[4] = 2;
  p.snare[12] = 2;
  for (const g of [7, 9, 15, 2]) if (chance(slow ? 0.35 : 0.2)) p.snare[g] = 1;

  // Hats
  for (let s = 0; s < 16; s += 2) p.hat[s] = s % 4 === 0 ? 2 : 1;
  if (fast || chance(0.25)) for (let s = 1; s < 16; s += 2) if (chance(fast ? 0.55 : 0.2)) p.hat[s] = 1;
  if (chance(0.5)) { p.open[14] = 2; p.hat[14] = 0; }

  // Rim and percussion
  if (chance(0.4)) p.rim[pick([6, 10, 11])] = 1;
  if (chance(0.5)) for (const s of pick([[3, 11], [6, 14], [2, 9]])) p.perc[s] = 1;
  return p;
}

/** Pick a tempo inside a range and a pattern that fits it. */
export function generateForRange(lo, hi, rng = Math.random) {
  const bpm = Math.round(lo + rng() * (hi - lo));
  return { bpm, pattern: generateBoomBap(bpm, rng) };
}

/**
 * The drummer player: hits for one step. Every 4th bar it adds a small fill
 * (extra snare ghosts and a kick pickup) so loops breathe.
 */
export function drumEvents(s, { pattern, bar, rng = Math.random }) {
  if (!pattern) return [];
  const out = [];
  const fill = bar % 4 === 3 && s >= 12;
  for (const lane of LANES) {
    let v = pattern[lane][s];
    if (fill && lane === 'snare' && !v && rng() < 0.4) v = 1;
    if (!v) continue;
    out.push({ player: 'drummer', drum: lane, vel: v === 2 ? 0.95 : 0.45 });
  }
  return out;
}
