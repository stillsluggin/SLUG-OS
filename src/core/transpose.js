// transpose.js — move a whole project to a new key. Pure functions.
//
// New tonic: everything shifts by the interval (nearest way, so nothing jumps
// an octave: D -> F goes up 3, D -> B goes down 3).
// Major <-> minor on the same tonic: each chord and note moves to the same
// scale degree in the new mode (iv in minor becomes IV in major, and so on).
// Chords and notes outside the old scale are left as they are.

import { mod12, SCALES } from './theory.js';
import { diatonicChord } from './chord.js';

/** Nearest semitone shift from one tonic to another (-6..+5). */
export function keyShift(fromTonic, toTonic) {
  const d = mod12(toTonic - fromTonic);
  return d > 5 ? d - 12 : d;
}

/** A function that maps a MIDI note from the old key to the new one. */
export function noteMapper(oldKey, newKey) {
  if (oldKey.mode === newKey.mode) {
    const d = keyShift(oldKey.tonic, newKey.tonic);
    return (m) => m + d;
  }
  const a = SCALES[oldKey.mode];
  const b = SCALES[newKey.mode];
  const d = keyShift(oldKey.tonic, newKey.tonic);
  return (m) => {
    const idx = a.indexOf(mod12(m - oldKey.tonic));
    return m + d + (idx >= 0 ? b[idx] - a[idx] : 0);
  };
}

/** A function that maps a chord from the old key to the new one. */
export function chordMapper(oldKey, newKey) {
  if (oldKey.mode === newKey.mode) {
    const d = keyShift(oldKey.tonic, newKey.tonic);
    return (c) => c && { ...c, ext: [...c.ext], root: mod12(c.root + d), bass: c.bass == null ? null : mod12(c.bass + d) };
  }
  const a = SCALES[oldKey.mode];
  const d = keyShift(oldKey.tonic, newKey.tonic);
  return (c) => {
    if (!c) return c;
    const idx = a.indexOf(mod12(c.root - oldKey.tonic));
    if (idx < 0) return { ...c, ext: [...c.ext], root: mod12(c.root + d), bass: c.bass == null ? null : mod12(c.bass + d) };
    // Same degree, the new mode's own colour: a minor ii becomes iiø, iv becomes IV...
    const base = diatonicChord(newKey, idx);
    const scale = new Set(SCALES[newKey.mode].map((s) => mod12(newKey.tonic + s)));
    const out = { ...base, ext: [...c.ext], bass: null };
    if (c.third === 's2' || c.third === 's4') out.third = c.third; // keep sus chords sus
    if (c.seventh && !out.seventh) out.seventh = scale.has(mod12(out.root + 11)) && out.third !== 'm' ? 'M' : 'm';
    if (c.seventh === 'd') out.seventh = 'd';
    if (c.bass != null) out.bass = mod12(out.root + mod12(c.bass - c.root) + (out.third === 'M' && c.third === 'm' && mod12(c.bass - c.root) === 3 ? 1 : out.third === 'm' && c.third === 'M' && mod12(c.bass - c.root) === 4 ? -1 : 0));
    return out;
  };
}

