// bass.js — Bass Latch: the BASS player's follow modes.
//
// One press (the LATCH button) switches the bass player between FOLLOW
// (it follows every chord instantly) and FREE (unlocked: you play the bass).
// In FOLLOW it picks notes with one of these modes:
//
//   ROOT        the chord's root (default)
//   SLASH       the lowest note of the chord voicing (follows inversions)
//   ROOT-FIFTH  root on strong beats, fifth on the others
//   OCTAVE      root, jumping up an octave on the off-hits
//   WALKING     quarter notes walking into the next chord with passing notes
//   PEDAL       holds the key's home note under every chord
//
// Pure functions. No audio, no DOM.

import { mod12, scalePcs } from './theory.js';

export const BASS_MODES = ['ROOT', 'SLASH', 'ROOT-FIFTH', 'OCTAVE', 'WALKING', 'PEDAL'];

const LOW = 31; // G1
const HIGH = 50; // D3
const FIFTH = { P: 7, b: 6, '#': 8 };
const THIRD = { M: 4, m: 3, s2: 2, s4: 5 };

/** Nearest MIDI note with pitch class `pc` to `target`, inside the bass range. */
export function nearestBass(pc, target = 38, low = LOW, high = HIGH - 7) {
  let best = null;
  for (let m = low; m <= high; m++) {
    if (mod12(m) !== pc) continue;
    if (best == null || Math.abs(m - target) < Math.abs(best - target)) best = m;
  }
  return best;
}

/** The "home" bass note for a chord under a follow mode (what sounds on the downbeat). */
export function bassRoot(mode, { chord, voicing, key, prevBass }) {
  const target = prevBass ?? 38;
  if (mode === 'PEDAL') return nearestBass(key.tonic, target);
  if (mode === 'SLASH' && voicing && voicing.length) return nearestBass(mod12(voicing[0]), target);
  return nearestBass(chord.bass ?? chord.root, target);
}

/**
 * The note for one hit of a groove. `tone` comes from the style's bass rhythm
 * (R 5 8 3 b7 apr) and `hit` counts hits in the bar so modes can alternate.
 */
export function bassHit(mode, tone, hit, root, chord) {
  const fifth = root + FIFTH[chord.fifth];
  switch (mode) {
    case 'ROOT': case 'SLASH': case 'PEDAL':
      return tone === 'apr' && mode !== 'PEDAL' ? root - 1 : root;
    case 'ROOT-FIFTH':
      return hit % 2 === 0 ? root : (fifth > HIGH ? fifth - 12 : fifth);
    case 'OCTAVE':
      return hit % 2 === 0 ? root : root + 12;
    default: { // follow the groove's own tones
      const map = { R: 0, 5: FIFTH[chord.fifth], 8: 12, 3: THIRD[chord.third], b7: chord.seventh === 'M' ? 11 : 10, apr: -1 };
      return root + (map[tone] ?? 0);
    }
  }
}

/**
 * WALKING: four quarter notes for one bar, from this chord's root to a
 * chromatic or scale approach into the next chord's root.
 */
export function walkingBar(chord, nextChord, key, root, rng = Math.random) {
  const scale = scalePcs(key);
  const third = root + THIRD[chord.third];
  const fifth = root + FIFTH[chord.fifth];
  const target = nearestBass((nextChord ?? chord).bass ?? (nextChord ?? chord).root, root);
  const second = rng() < 0.5 ? third : fifth;
  // Beat 4: half step above or below the target, or the scale note below it.
  const below = target - 1;
  const above = target + 1;
  let scaleBelow = target - 1;
  while (!scale.includes(mod12(scaleBelow)) && scaleBelow > target - 3) scaleBelow--;
  const options = [below, above, scaleBelow];
  let fourth = options[Math.floor(rng() * options.length)];
  let third3 = rng() < 0.5 ? fifth : root + 12 > HIGH ? third : root + 12;
  if (Math.abs(third3 - fourth) > 7) third3 = fourth + (third3 > fourth ? 2 : -2);
  if (fourth === second) fourth = below;
  return [root, second, third3, fourth].map((m) => clampBass(m));
}

const clampBass = (m) => { while (m > HIGH) m -= 12; while (m < LOW - 5) m += 12; return m; };
