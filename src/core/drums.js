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

/** Which drum feel each style uses. */
export const STYLE_DRUMS = {
  nujabes: 'boombap', tyler: 'boombap', cruise: 'boombap', bloom: 'boombap', boombap: 'boombap',
  motown: 'soul', golden: 'soul', strut: 'funk', dusty: 'jazz', knock: 'knock', drift: 'sparse',
};

/**
 * A beat that fits the style and tempo.
 *   boombap  kick 1 + pushes, snare 2 & 4, 8th hats (see generateBoomBap)
 *   funk     syncopated kicks, ghost-note snares, 16th hats, open hats on the "and"
 *   soul     backbeat, tambourine-style 8ths on PERC, kick on 1 and 3 with pickups
 *   jazz     ride-style "ding, ding-a" on the hats, feathered kick, rim on 4
 *   knock    half-time snare on beat 3, rolling hats, syncopated kicks
 *   sparse   just a soft kick, a rim and a few hats
 */
export function generateBeat(style, bpm, rng = Math.random) {
  const flavor = STYLE_DRUMS[style] || 'boombap';
  if (flavor === 'boombap') return generateBoomBap(bpm, rng);
  const p = emptyPattern();
  const chance = (x) => rng() < x;
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  if (flavor === 'funk') {
    p.kick[0] = 2;
    for (const st of pick([[3, 6, 10], [2, 7, 10, 14], [3, 8, 11], [6, 9, 10, 15]])) p.kick[st] = 2;
    p.snare[4] = 2; p.snare[12] = 2;
    for (const g of [1, 7, 9, 10, 15]) if (chance(0.45)) p.snare[g] = 1;
    for (let st = 0; st < 16; st++) p.hat[st] = st % 4 === 0 ? 2 : 1;
    p.hat[6] = 0; p.open[6] = 2;
    if (chance(0.6)) { p.hat[14] = 0; p.open[14] = 2; }
    if (chance(0.5)) p.perc[pick([3, 11, 13])] = 1;
  } else if (flavor === 'soul') {
    p.kick[0] = 2; p.kick[8] = 2;
    if (chance(0.6)) p.kick[pick([6, 7, 14, 15])] = 1;
    p.snare[4] = 2; p.snare[12] = 2;
    for (let st = 0; st < 16; st += 2) p.hat[st] = st % 4 === 0 ? 2 : 1;
    for (let st = 0; st < 16; st += 2) p.perc[st] = st % 4 === 2 ? 2 : 1; // tambourine
    if (chance(0.4)) p.snare[15] = 1;
  } else if (flavor === 'jazz') {
    // Ride pattern on the hats: beats 1-4 with the swung "a" before 2 and 4.
    for (const st of [0, 4, 7, 8, 12, 15]) p.hat[st] = st % 4 === 0 ? 2 : 1;
    p.kick[0] = 1; p.kick[8] = 1;
    if (chance(0.5)) p.kick[pick([6, 10, 14])] = 1;
    p.rim[12] = 2;
    if (chance(0.5)) p.rim[4] = 1;
    for (const g of [3, 10, 11]) if (chance(0.3)) p.snare[g] = 1;
    p.open[pick([6, 14])] = chance(0.4) ? 1 : 0;
  } else if (flavor === 'knock') {
    p.kick[0] = 2;
    for (const st of pick([[3, 10], [6, 7, 11], [3, 6, 14], [10, 11, 15]])) p.kick[st] = 2;
    p.snare[8] = 2; // half time: the snare lands on beat 3
    if (chance(0.4)) p.snare[15] = 1;
    for (let st = 0; st < 16; st += 2) p.hat[st] = 2;
    // Hat rolls: runs of quick soft hits
    for (const r of pick([[13, 14, 15], [5, 7], [11, 13, 15], [6, 7, 14, 15]])) p.hat[r] = 1;
    if (chance(0.5)) p.open[pick([4, 12])] = 1;
    if (chance(0.5)) p.perc[pick([7, 11, 15])] = 1;
  } else { // sparse
    p.kick[0] = 1;
    if (chance(0.5)) p.kick[10] = 1;
    p.rim[12] = 1;
    for (const st of [4, 8, 14]) if (chance(0.5)) p.hat[st] = 1;
  }
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
