// chord.js — chord structure, naming, joystick bends and voicing.
// Pure functions only: no DOM, no Web Audio.
//
// A chord is a small plain object, easy to mirror as a C struct on the FM-1:
//   { root: 0..11, third: 'M'|'m'|'s2'|'s4', fifth: 'P'|'b'|'#',
//     seventh: null|'M'|'m'|'d', ext: ['9','11','#11','13','6','b9'], bass: null|0..11 }

import { mod12, SCALES, scalePcs, inKeyPcs, noteName, offsetToRoman } from './theory.js';

export const MAX_CHORD_NOTES = 4; // FM-1 / Felucca CHORD_MAX is 4

const THIRD = { M: 4, m: 3, s2: 2, s4: 5 };
const FIFTH = { P: 7, b: 6, '#': 8 };
const SEVENTH = { M: 11, m: 10, d: 9 };
const EXT = { b9: 13, 9: 14, 11: 17, '#11': 18, 13: 21, 6: 9 };

const Q = (third, fifth, seventh = null, ext = []) => ({ third, fifth, seventh, ext });

/** Quality names used by the Next Chord tables. 'maj' is a plain major triad. */
export const QUALITIES = {
  maj: Q('M', 'P'),
  m: Q('m', 'P'),
  dim: Q('m', 'b'),
  aug: Q('M', '#'),
  sus4: Q('s4', 'P'),
  sus2: Q('s2', 'P'),
  6: Q('M', 'P', null, ['6']),
  m6: Q('m', 'P', null, ['6']),
  '6/9': Q('M', 'P', null, ['6', '9']),
  maj7: Q('M', 'P', 'M'),
  m7: Q('m', 'P', 'm'),
  7: Q('M', 'P', 'm'),
  m7b5: Q('m', 'b', 'm'),
  dim7: Q('m', 'b', 'd'),
  maj9: Q('M', 'P', 'M', ['9']),
  m9: Q('m', 'P', 'm', ['9']),
  9: Q('M', 'P', 'm', ['9']),
  13: Q('M', 'P', 'm', ['9', '13']),
  m11: Q('m', 'P', 'm', ['9', '11']),
  '7sus4': Q('s4', 'P', 'm'),
  '9sus4': Q('s4', 'P', 'm', ['9']),
  'maj7#11': Q('M', 'P', 'M', ['#11']),
  'maj9#11': Q('M', 'P', 'M', ['9', '#11']),
  '7b9': Q('M', 'P', 'm', ['b9']),
};

export function makeChord(root, quality = 'maj') {
  const q = QUALITIES[quality];
  if (!q) throw new Error(`Unknown chord quality: ${quality}`);
  return { root: mod12(root), third: q.third, fifth: q.fifth, seventh: q.seventh, ext: [...q.ext], bass: null };
}

export const cloneChord = (c) => ({ ...c, ext: [...c.ext] });

/** Every interval of the chord above the root (no cap), unique by pitch class. */
export function chordIntervals(c) {
  const list = [0, THIRD[c.third], FIFTH[c.fifth]];
  if (c.seventh) list.push(SEVENTH[c.seventh]);
  for (const e of c.ext) list.push(EXT[e]);
  const seen = new Set();
  return list.filter((i) => (seen.has(i % 12) ? false : seen.add(i % 12)));
}

export const chordPcs = (c) => chordIntervals(c).map((i) => mod12(c.root + i));

/**
 * The intervals actually played, at most `max` notes (FM-1 voice budget).
 * Jazz rule of thumb: drop the 5th first, then the root (the bass plays it).
 */
export function chordTones(c, max = MAX_CHORD_NOTES) {
  let tones = chordIntervals(c);
  if (tones.length > max && c.fifth === 'P') tones = tones.filter((i) => i !== 7);
  if (tones.length > max) tones = tones.filter((i) => i !== 0);
  return tones.slice(0, max);
}

/** 'm9', 'maj7#11', '7sus4' ... */
export function qualityName(c) {
  const ext = new Set(c.ext);
  const { third, fifth, seventh } = c;
  let n;
  if (!seventh) {
    if (third === 's4') n = 'sus4';
    else if (third === 's2') n = 'sus2';
    else if (third === 'm' && fifth === 'b') n = 'dim';
    else if (third === 'M' && fifth === '#') n = 'aug';
    else n = third === 'm' ? 'm' : '';
    if (ext.has('6')) n = ext.has('9') ? `${n}6/9` : `${n}6`;
    else if (ext.has('9')) n = `${n}add9`;
  } else if (seventh === 'd') {
    n = 'dim7';
  } else if (third === 'm' && fifth === 'b') {
    n = ext.has('9') ? 'm9b5' : 'm7b5';
  } else {
    const num = ext.has('13') ? '13' : ext.has('11') ? '11' : ext.has('9') ? '9' : '7';
    if (seventh === 'M') n = (third === 'm' ? 'mMaj' : 'maj') + num;
    else if (third === 'm') n = `m${num}`;
    else if (third === 's4') n = `${num}sus4`;
    else if (third === 's2') n = `${num}sus2`;
    else n = num;
    if (fifth === '#') n += '#5';
    if (ext.has('6') && num === '7') n = n.replace('7', '6'); // never produced, kept for safety
  }
  if (ext.has('#11')) n += '#11';
  if (ext.has('b9')) n += 'b9';
  return n;
}

export function chordName(c, key) {
  if (!c) return '';
  const slash = c.bass != null && c.bass !== c.root ? `/${noteName(c.bass, key)}` : '';
  return noteName(c.root, key) + qualityName(c) + slash;
}

export function romanOf(c, key) {
  return offsetToRoman(c.root - key.tonic, c.third === 'm');
}

export function sameChord(a, b) {
  if (!a || !b) return false;
  return a.root === b.root && qualityName(a) === qualityName(b) && (a.bass ?? a.root) === (b.bass ?? b.root);
}

/** The diatonic triad on scale degree 0..6. Diminished triads become m7b5 (softer, jazzier). */
export function diatonicChord(key, degree) {
  const sc = SCALES[key.mode];
  const r = sc[degree];
  const third = mod12(sc[(degree + 2) % 7] - r);
  const fifth = mod12(sc[(degree + 4) % 7] - r);
  const q = third === 4 ? 'maj' : fifth === 6 ? 'm7b5' : 'm';
  return makeChord(key.tonic + r, q);
}

// ---------------------------------------------------------------------------
// Joystick bends. Momentary like a spring-loaded stick: hold to bend, let go
// to return. Several can be held at once and they combine.
// ---------------------------------------------------------------------------

export const BEND_ORDER = ['borrowed', 'sus', 'seventh', 'ninth', 'inversion'];

export function applyBends(base, bends, key) {
  if (!base) return null;
  let c = cloneChord(base);
  if (bends.has('borrowed')) c = borrow(c, key);
  if (bends.has('sus')) c = sus(c);
  if (bends.has('ninth')) c = addNinth(c, key);
  else if (bends.has('seventh')) c = addSeventh(c, key);
  if (bends.has('inversion')) c = invert(c);
  return c;
}

/** Diatonic 7th; if the chord already has one, swap it for a 6th (maj7 -> 6, m7 -> m6). */
export function addSeventh(c, key) {
  c = cloneChord(c);
  if (c.seventh) {
    if (c.seventh === 'd') return c;
    if (c.third === 'm' && c.fifth === 'b') { c.seventh = 'd'; return c; }
    if (c.third === 'M' && c.seventh === 'm') { if (!c.ext.includes('13')) c.ext.push('9', '13'); return dedupeExt(c); }
    c.seventh = null;
    c.ext = c.ext.filter((e) => e !== '9');
    c.ext.push('6');
    return dedupeExt(c);
  }
  c.seventh = pickSeventh(c, key);
  return c;
}

function pickSeventh(c, key) {
  if (c.third === 'm' && c.fifth === 'b') return 'm';
  const scale = new Set(scalePcs(key));
  const b7 = mod12(c.root + 10);
  const M7 = mod12(c.root + 11);
  if (c.third === 'M' && scale.has(M7) && !scale.has(b7)) return 'M';
  if (scale.has(b7) && !scale.has(M7)) return 'm';
  if (scale.has(M7)) return c.third === 'm' ? 'm' : 'M';
  return c.third === 'M' ? 'M' : 'm';
}

/** Adds 7th + 9th; on a chord that has a 9th already, adds the next colour (11, 13 or #11). */
export function addNinth(c, key) {
  c = cloneChord(c);
  if (!c.seventh || c.ext.includes('6')) {
    c.ext = c.ext.filter((e) => e !== '6');
    c.seventh = c.seventh || pickSeventh(c, key);
  }
  if (!c.ext.includes('9')) c.ext.push('9');
  else if (c.seventh === 'M') c.ext.push('#11');
  else if (c.third === 'm') c.ext.push('11');
  else c.ext.push('13');
  return dedupeExt(c);
}

/** sus4; sus4 -> sus2; sus2 -> sus4. */
export function sus(c) {
  c = cloneChord(c);
  c.third = c.third === 's4' ? 's2' : 's4';
  if (c.fifth === 'b') c.fifth = 'P';
  if (c.seventh === 'M' || c.seventh === 'd') c.seventh = 'm';
  c.ext = c.ext.filter((e) => e !== '11');
  return c;
}

/** First inversion (3rd in the bass); if already inverted, the 5th in the bass. */
export function invert(c) {
  c = cloneChord(c);
  const third = c.third === 'M' || c.third === 'm' ? THIRD[c.third] : FIFTH[c.fifth];
  c.bass = c.bass == null ? mod12(c.root + third) : mod12(c.root + FIFTH[c.fifth]);
  return c;
}

// Modal interchange, by the chord's root offset from the tonic.
// [new root offset, triad quality, quality when the chord has a 7th]
const BORROW = {
  major: {
    0: [0, 'm', 'm7'], // I -> i
    2: [2, 'm7b5', 'm7b5'], // ii -> iiø
    4: [3, 'maj', 'maj7'], // iii -> bIII
    5: [5, 'm', 'm6'], // IV -> iv (the gospel minor iv)
    7: [7, 'm', 'm7'], // V -> v
    9: [8, 'maj', 'maj7'], // vi -> bVI
    11: [10, 'maj', '7'], // viiø -> bVII
  },
  minor: {
    0: [0, 'maj', 'maj7'], // i -> I (Picardy)
    2: [2, 'm', 'm7'], // iiø -> ii (dorian)
    3: [1, 'maj', 'maj7'], // bIII -> bII (Neapolitan)
    5: [5, 'maj', '7'], // iv -> IV (dorian)
    7: [7, 'maj', '7'], // v -> V (harmonic minor)
    8: [8, '7', '7'], // bVI -> bVI7
    10: [11, 'dim7', 'dim7'], // bVII -> vii°7 (leading-tone)
  },
};

export function borrow(c, key) {
  const off = mod12(c.root - key.tonic);
  const row = BORROW[key.mode][off];
  if (!row) {
    const f = cloneChord(c);
    f.third = c.third === 'M' ? 'm' : 'M';
    return f;
  }
  const out = makeChord(key.tonic + row[0], c.seventh ? row[2] : row[1]);
  if (c.ext.includes('9') && out.seventh && out.seventh !== 'd' && out.fifth === 'P') out.ext.push('9');
  return out;
}

function dedupeExt(c) {
  c.ext = [...new Set(c.ext)];
  return c;
}

// ---------------------------------------------------------------------------
// Voicing: pick notes for the chord that move as little as possible from the
// previous voicing (smooth voice leading), avoid muddy clusters, stay centred.
// ---------------------------------------------------------------------------

export function voiceChord(c, prev = [], { low = 50, high = 79, center = 63, max = MAX_CHORD_NOTES } = {}) {
  const ivs = chordTones(c, max);
  const pcs = [...ivs].sort((a, b) => mod12(a) - mod12(b)).map((i) => mod12(c.root + i));
  const n = pcs.length;
  let best = null;
  let bestScore = Infinity;
  for (let inv = 0; inv < n; inv++) {
    const order = pcs.slice(inv).concat(pcs.slice(0, inv));
    for (let start = low - 12; start <= high; start++) {
      if (mod12(start) !== order[0]) continue;
      const close = [start];
      for (let k = 1; k < n; k++) {
        let m = close[k - 1] + 1;
        while (mod12(m) !== order[k]) m++;
        close.push(m);
      }
      const variants = [close];
      if (n >= 4) {
        const drop2 = [...close]; drop2[n - 2] -= 12; // 2nd voice from the top down an octave
        const drop3 = [...close]; drop3[n - 3] -= 12; // 3rd voice from the top down an octave
        variants.push(drop2, drop3);
      }
      for (const v of variants) {
        const sv = sortNum(v);
        if (sv[0] < low - 2 || sv[sv.length - 1] > high) continue;
        const s = scoreVoicing(sv, prev, center);
        if (s < bestScore) { bestScore = s; best = sv; }
      }
    }
  }
  return best || sortNum(pcs.map((pc) => 60 + pc));
}

function scoreVoicing(v, prev, center) {
  let s = 0;
  for (let i = 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    if (d === 1) s += 5;
    else if (d === 2 && v[i - 1] < 55) s += 3;
    if (d > 7) s += (d - 7) * 0.6;
  }
  const mid = v.reduce((a, b) => a + b, 0) / v.length;
  if (prev && prev.length) {
    s += voiceLeadDistance(prev, v);
    s += Math.abs(mid - center) * 0.3;
  } else {
    s += Math.abs(mid - center) * 0.8;
  }
  return s;
}

export function voiceLeadDistance(a, b) {
  if (a.length === b.length) return a.reduce((sum, x, i) => sum + Math.abs(x - b[i]), 0);
  let d = 0;
  for (const x of b) d += Math.min(...a.map((y) => Math.abs(x - y)));
  return d + 2 * Math.abs(a.length - b.length);
}

const sortNum = (arr) => [...arr].sort((x, y) => x - y);

/** Bass note: the chord's bass (or root) in E1..A#2, nearest the previous bass note. */
export function bassNoteFor(c, prevBass = null, { low = 31, high = 46 } = {}) {
  const pc = c.bass ?? c.root;
  const target = prevBass ?? 38;
  let best = null;
  for (let m = low; m <= high; m++) {
    if (mod12(m) !== pc) continue;
    if (best == null || Math.abs(m - target) < Math.abs(best - target)) best = m;
  }
  return best;
}

/**
 * The strum plate: 9 lead notes that always fit the chord. Chord tones plus
 * two in-key colour tones (9th and 6th, or 9th and 11th on minor chords).
 */
export function leadTones(c, key, count = 9, start = 60) {
  const inKey = inKeyPcs(key);
  const pcs = new Set(chordPcs({ ...c, ext: [] }));
  const nine = mod12(c.root + 2);
  const color2 = mod12(c.root + (c.third === 'm' ? 5 : 9));
  if (inKey.has(nine)) pcs.add(nine);
  if (inKey.has(color2) && pcs.size < 5) pcs.add(color2);
  const out = [];
  for (let m = start; out.length < count && m < 110; m++) if (pcs.has(mod12(m))) out.push(m);
  return out;
}

/** Notes for the EXTRA track: chord tones in a high register. */
export function extraNotes(c, count = 4, low = 67, high = 90) {
  const pcs = new Set(chordTones(c, MAX_CHORD_NOTES).map((i) => mod12(c.root + i)));
  const out = [];
  for (let m = low; m <= high && out.length < count; m++) if (pcs.has(mod12(m))) out.push(m);
  return out;
}
