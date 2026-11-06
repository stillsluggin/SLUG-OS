// theory.js — pitch, key and roman-numeral helpers.
// Pure functions only: no DOM, no Web Audio. Ports 1:1 to C on the FM-1.

export const mod12 = (n) => ((n % 12) + 12) % 12;

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10], // natural minor
};

const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Keys whose signatures use flats.
const FLAT_KEYS = {
  major: new Set([0, 5, 10, 3, 8, 1, 6]), // C counts as flat-side: borrowed chords read as bIII, bVI, bVII
  minor: new Set([2, 7, 0, 5, 10, 3, 9]),
};

/** Absolute pitch classes of the key's scale. */
export function scalePcs(key) {
  return SCALES[key.mode].map((i) => mod12(key.tonic + i));
}

/**
 * Pitch classes that count as "in key". Minor also allows the raised 7th
 * (leading tone), so V7 and the ii–V–i are in key, as in common practice.
 */
export function inKeyPcs(key) {
  const s = new Set(scalePcs(key));
  if (key.mode === 'minor') s.add(mod12(key.tonic + 11));
  return s;
}

/** Spell a pitch class for display in the given key. */
export function noteName(pc, key) {
  pc = mod12(pc);
  if (!key) return FLAT[pc];
  const flats = FLAT_KEYS[key.mode].has(key.tonic);
  if (key.mode === 'minor' && pc === mod12(key.tonic + 11)) return SHARP[pc]; // leading tone: C# in D minor
  if (!scalePcs(key).includes(pc)) return FLAT[pc]; // borrowed tones read flat-side (bIII, bVI, bVII)
  return flats ? FLAT[pc] : SHARP[pc];
}

export function keyName(key) {
  return `${noteName(key.tonic, key)} ${key.mode}`;
}

const ROMAN_BASE = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };
const OFFSET_ROMAN = ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII'];

/**
 * Parse a roman numeral relative to the major scale of the tonic.
 * 'bVI' -> { offset: 8, minor: false }, 'ii' -> { offset: 2, minor: true }.
 */
export function parseRoman(r) {
  const m = /^([b#]?)(VII|VI|V|IV|III|II|I)$/i.exec(r);
  if (!m) throw new Error(`Bad roman numeral: ${r}`);
  const acc = m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0;
  return { offset: mod12(ROMAN_BASE[m[2].toUpperCase()] + acc), minor: m[2] === m[2].toLowerCase() };
}

/** Roman numeral for a root offset from the tonic. Lowercase when the chord is minor. */
export function offsetToRoman(offset, minor) {
  const r = OFFSET_ROMAN[mod12(offset)];
  return minor ? r.replace(/[IV]+/, (x) => x.toLowerCase()) : r;
}

export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
