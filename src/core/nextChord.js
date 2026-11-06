// nextChord.js — "Next Chord, Your Way".
//
// Given the chord you just played, suggest ONE best next chord plus up to four
// alternatives, each tagged NOSTALGIC, EMOTIONAL, CALM or SURPRISE.
//
// HOW IT WORKS (tune it here):
//   1. Each style has a hand-written table: from a chord (roman numeral) to a
//      few next chords, each with a quality, a tag, a weight and a reason.
//      Edit these tables first: they are the personality of Slug OS.
//   2. A generic pool (every diatonic chord, in the style's colours) fills any
//      gaps, so even unusual chords always get suggestions.
//   3. The KEY RULE: everything stays in key except SURPRISE. A suggestion
//      whose core tones (root, 3rd, 5th, 7th) leave the key becomes SURPRISE;
//      for the others, extensions that leave the key are dropped (iii m9 -> iii m7).
//   4. Scoring = table weight + smooth voice leading + a bonus for closing a
//      4-chord loop − penalties for repeating or ping-ponging.
//   5. Best = top score that isn't SURPRISE. Alternatives = the top chord for
//      each tag.
//
// Table entry format: 'roman quality TAG weight reason...'
//   roman   relative to the MAJOR scale of the tonic (bIII, bVI, bVII, #iv...)
//   quality a name from chord.js QUALITIES ('maj' = plain major triad)

import { mod12, inKeyPcs, parseRoman } from './theory.js';
import { makeChord, chordPcs, chordName, romanOf, qualityName, diatonicChord, borrow, cloneChord, sameChord } from './chord.js';

export const TAGS = ['NOSTALGIC', 'EMOTIONAL', 'CALM', 'SURPRISE'];
export const STYLE_IDS = ['nujabes', 'tyler', 'motown'];
export const STYLE_LABELS = { nujabes: 'NUJABES', tyler: 'TYLER', motown: 'MOTOWN' };

// ---------------------------------------------------------------------------
// STYLE TABLES
// ---------------------------------------------------------------------------

// Shared moves out of borrowed / chromatic chords, used when a style table has no row.
const COMMON = {
  major: {
    bII: ['I maj9 CALM .9 slides home', 'vi m9 EMOTIONAL .6 falls to the relative minor', 'V 9sus4 NOSTALGIC .6 back to the dominant'],
    bIII: ['ii m9 NOSTALGIC .85 keeps sliding down', 'IV maj7 CALM .7 lifts to IV', 'bVI maj7 EMOTIONAL .55 deeper into minor'],
    iv: ['I maj9 CALM .9 the plagal sigh home', 'bVII 9 NOSTALGIC .7 the backdoor', 'iii m7 EMOTIONAL .55 drifts down'],
    bVI: ['bVII 9 NOSTALGIC .85 climbs to bVII', 'I maj9 CALM .75 borrowed resolution', 'V 7sus4 EMOTIONAL .6 hangs on the dominant'],
    bVII: ['I maj9 CALM .9 mixolydian home', 'IV maj7 NOSTALGIC .7 falls to IV', 'bVI maj7 EMOTIONAL .55 steps down'],
    '#i': ['ii m7 NOSTALGIC .95 passing chord resolves up', 'I maj CALM .5 slips back'],
    '#ii': ['iii m7 NOSTALGIC .9 passing chord resolves up', 'ii m7 CALM .5 slips back'],
    '#iv': ['V 7 NOSTALGIC .9 passing chord resolves up', 'I maj CALM .6 home over the 5th'],
    III: ['vi m7 NOSTALGIC .95 secondary dominant resolves', 'IV maj7 CALM .5 sidesteps'],
    II: ['V 7 NOSTALGIC .95 secondary dominant resolves', 'ii m7 CALM .5 softens'],
    v: ['I maj9 CALM .8 home', 'IV maj7 NOSTALGIC .7 falls to IV', 'vi m9 EMOTIONAL .6 into minor'],
  },
  minor: {
    V: ['i m9 CALM .95 resolves home', 'bVI maj7 EMOTIONAL .8 deceptive', 'iv m9 NOSTALGIC .55 backs off'],
    bII: ['i m9 CALM .9 slides home', 'V 7 NOSTALGIC .7 Neapolitan to dominant', 'bVI maj7 EMOTIONAL .55 sinks'],
    IV: ['i m9 CALM .8 dorian sway home', 'bVII 9 NOSTALGIC .7 lifts', 'iv m9 EMOTIONAL .6 back to minor'],
    I: ['iv m9 NOSTALGIC .85 major I falls to iv', 'bVI maj7 EMOTIONAL .6 sinks', 'bVII 9 CALM .5 floats'],
    ii: ['V 7 NOSTALGIC .9 dorian ii–V', 'bIII maj7 CALM .6 steps up'],
    '#iv': ['V 7 NOSTALGIC .9 passing chord resolves up', 'i m7 CALM .55 slips home'],
    iii: ['iv m7 NOSTALGIC .9 passing chord resolves up', 'bIII maj CALM .5 slips back'],
  },
};

const STYLES = {
  // NUJABES: minor 9ths, major 7ths, ii–V movement, looping progressions.
  nujabes: {
    major: {
      I: ['ii m9 NOSTALGIC .9 starts a ii–V', 'IV maj7 CALM .85 floats up to IV', 'vi m9 EMOTIONAL .8 falls to the relative minor', 'iii m7 CALM .6 drifts up', 'bVII 9 SURPRISE .5 borrowed bVII', 'bIII maj7 SURPRISE .45 borrowed bIII'],
      ii: ['V 9sus4 NOSTALGIC 1 the ii–V', 'iii m7 CALM .7 steps up', 'vi m9 EMOTIONAL .6 sighs to vi', 'IV maj7 CALM .5 lifts', 'bII maj7 SURPRISE .5 tritone slide'],
      iii: ['vi m9 NOSTALGIC .95 cycle of fourths', 'IV maj7 CALM .75 steps up', 'ii m9 EMOTIONAL .6 sighs down', 'bIII maj7 SURPRISE .55 chromatic slide down'],
      IV: ['iii m7 NOSTALGIC .95 IV–iii, the classic loop', 'V 9sus4 CALM .7 rises', 'I maj9 CALM .65 settles home', 'vi m9 EMOTIONAL .6 drops to vi', 'iv m6 SURPRISE .6 borrowed minor iv'],
      V: ['I maj9 CALM .9 home', 'vi m9 EMOTIONAL .8 deceptive', 'iii m7 NOSTALGIC .6 drifts down', 'bVI maj7 SURPRISE .55 borrowed bVI'],
      vi: ['ii m9 NOSTALGIC .95 cycle of fourths', 'IV maj7 CALM .8 floats up', 'iii m7 EMOTIONAL .55 steps down', 'V 9sus4 EMOTIONAL .5 hangs', 'bVI maj7 SURPRISE .5 slides down a half step'],
      vii: ['iii m7 NOSTALGIC .9 resolves down a fifth', 'I maj9 CALM .7 home', 'vi m9 EMOTIONAL .6 steps down', 'bVII 9 SURPRISE .5 slides down'],
    },
    minor: {
      i: ['iv m9 NOSTALGIC .95 the i–iv sway', 'bVI maj7 EMOTIONAL .8 sinks to bVI', 'bIII maj7 CALM .65 lifts to the relative major', 'v m7 CALM .6 drifts up', 'bII maj7 SURPRISE .5 Neapolitan slide'],
      ii: ['V 7 NOSTALGIC 1 minor ii–V', 'bIII maj7 CALM .6 steps up', 'i m9 EMOTIONAL .5 falls home', 'bII maj7 SURPRISE .5 slides down'],
      bIII: ['bVI maj7 NOSTALGIC .85 cycle of fourths', 'iv m9 EMOTIONAL .75 rises to iv', 'bVII 9 CALM .7 sways', 'bII maj7 SURPRISE .45 chromatic slide'],
      iv: ['bVII 9 NOSTALGIC .9 the backdoor', 'bIII maj7 EMOTIONAL .7 drifts down', 'v m7 CALM .7 rises', 'i m9 CALM .65 settles home', 'IV 7 SURPRISE .5 dorian lift'],
      v: ['i m9 CALM .85 home', 'bVI maj7 EMOTIONAL .8 steps up', 'iv m9 NOSTALGIC .6 falls back', 'bII maj7 SURPRISE .45 Neapolitan'],
      bVI: ['bVII 9 NOSTALGIC .85 climbs to bVII', 'v m7 EMOTIONAL .7 falls to v', 'iv m9 CALM .65 settles', 'ii m7b5 EMOTIONAL .55 to the ii–V', 'V 7 SURPRISE .5 tense dominant'],
      bVII: ['i m9 NOSTALGIC .9 back home, loop it', 'bIII maj7 CALM .75 to the relative major', 'bVI maj7 EMOTIONAL .6 steps down', 'bII maj7 SURPRISE .45 floats sideways'],
    },
  },

  // TYLER, THE CREATOR: maj7#11 chords, chromatic slides, borrowed chords.
  tyler: {
    major: {
      I: ['IV maj7#11 CALM .9 lydian float', 'vi m9 EMOTIONAL .75 falls to vi', 'iii m7 NOSTALGIC .7 drifts up', 'bIII maj7 SURPRISE .65 borrowed bIII', 'bVI maj7#11 SURPRISE .6 borrowed bVI'],
      ii: ['V 13 NOSTALGIC .8 the ii–V', 'iii m7 CALM .7 steps up', 'IV maj9 CALM .65 lifts', 'vi m9 EMOTIONAL .6 falls', 'bII maj7#11 SURPRISE .7 slides down a half step'],
      iii: ['vi m9 EMOTIONAL .75 falls a fifth', 'IV maj7#11 CALM .7 steps up', 'ii m9 NOSTALGIC .65 sighs down', 'bIII maj7 SURPRISE .8 chromatic slide down'],
      IV: ['iii m7 NOSTALGIC .85 IV–iii', 'I maj9 CALM .7 settles home', 'vi m9 EMOTIONAL .6 drops', 'iv m6 SURPRISE .8 borrowed minor iv', 'bVII 9 SURPRISE .55 borrowed bVII'],
      V: ['vi m9 EMOTIONAL .75 deceptive', 'I maj9 CALM .7 home', 'IV maj7#11 NOSTALGIC .7 backwards resolution', 'bVI maj7#11 SURPRISE .7 borrowed bVI'],
      vi: ['IV maj7#11 CALM .8 lydian float', 'ii m9 NOSTALGIC .8 cycle of fourths', 'V 13 EMOTIONAL .55 lifts', 'bVI maj7#11 SURPRISE .65 slides down'],
      vii: ['iii m7 NOSTALGIC .8 down a fifth', 'I maj9 CALM .7 home', 'vi m9 EMOTIONAL .6 steps down', 'bVII maj7 SURPRISE .7 slides down'],
      bIII: ['ii m9 NOSTALGIC .9 keeps sliding down', 'bVI maj7 CALM .65 floats', 'IV maj7#11 EMOTIONAL .6 rises', 'bII maj7#11 SURPRISE .5 slides again'],
      bVI: ['bVII 9 NOSTALGIC .8 climbs', 'I maj9 CALM .75 borrowed resolution', 'V 13 EMOTIONAL .6 hangs', 'bII maj7 SURPRISE .5 sidesteps'],
      bII: ['I maj9 CALM .9 slides home', 'vi m9 EMOTIONAL .6 falls', 'V 9sus4 NOSTALGIC .6 back to V', 'bVI maj7 SURPRISE .5 sinks'],
    },
    minor: {
      i: ['bVI maj7#11 EMOTIONAL .85 lydian bVI', 'iv m9 NOSTALGIC .8 the i–iv sway', 'bIII maj7 CALM .75 lifts', 'bII maj7#11 SURPRISE .6 slides up a half step', 'IV 9 SURPRISE .55 dorian IV'],
      ii: ['V 7 NOSTALGIC .8 minor ii–V', 'bIII maj7 CALM .7 steps up', 'i m9 EMOTIONAL .55 falls home', 'bII maj7#11 SURPRISE .7 slides down'],
      bIII: ['bVI maj7#11 CALM .75 floats down', 'iv m9 EMOTIONAL .75 rises', 'bVII 9 NOSTALGIC .7 sways', 'bII maj7#11 SURPRISE .5 slides'],
      iv: ['bVII 9 NOSTALGIC .8 the backdoor', 'bIII maj7 EMOTIONAL .7 drifts down', 'i m9 CALM .7 settles', 'bVI maj7#11 CALM .65 floats', 'IV 7 SURPRISE .55 dorian lift'],
      v: ['bVI maj7#11 EMOTIONAL .8 steps up', 'i m9 CALM .75 home', 'iv m9 NOSTALGIC .65 falls back', 'bII maj7#11 SURPRISE .55 sidesteps'],
      bVI: ['v m9 NOSTALGIC .8 slides down a half step', 'bVII 9 CALM .7 climbs', 'iv m9 EMOTIONAL .65 settles', 'bII maj7#11 SURPRISE .55 floats'],
      bVII: ['i m9 CALM .8 home', 'bIII maj7 NOSTALGIC .75 relative major', 'bVI maj7#11 EMOTIONAL .65 steps down', 'V 7 SURPRISE .5 tense dominant'],
    },
  },

  // MOTOWN: I–vi–IV–V, gospel passing chords, secondary dominants.
  motown: {
    major: {
      I: ['vi m7 NOSTALGIC 1 I–vi, the Motown classic', 'IV 6 CALM .8 lifts to IV', 'ii m7 CALM .6 walks up', 'iii m7 EMOTIONAL .55 steps up', '#i dim7 SURPRISE .6 gospel passing chord'],
      ii: ['V 7 NOSTALGIC .95 ii–V home', 'iii m7 CALM .65 walks up', 'vi m7 EMOTIONAL .5 falls', '#ii dim7 SURPRISE .55 gospel climb'],
      iii: ['vi m7 NOSTALGIC .85 down a fifth', 'IV maj CALM .75 steps up', 'ii m7 EMOTIONAL .6 steps down', 'III 7 SURPRISE .6 secondary dominant to vi'],
      IV: ['V 7 NOSTALGIC 1 IV–V lift', 'I maj CALM .75 amen', 'ii m7 EMOTIONAL .5 steps down', 'iv m6 SURPRISE .7 gospel minor iv', '#iv dim7 SURPRISE .65 gospel passing chord'],
      V: ['I maj CALM .95 home', 'vi m7 EMOTIONAL .75 deceptive', 'IV maj NOSTALGIC .6 the blues fall', 'bVI maj7 SURPRISE .5 borrowed bVI'],
      vi: ['IV maj NOSTALGIC .95 vi–IV', 'ii m7 CALM .75 down a fifth', 'iii m7 EMOTIONAL .55 steps down', 'II 7 SURPRISE .6 secondary dominant'],
      vii: ['I maj CALM .8 resolves up', 'iii m7 NOSTALGIC .75 down a fifth', 'vi m7 EMOTIONAL .6 falls', 'III 7 SURPRISE .55 secondary dominant'],
      '#i': ['ii m7 NOSTALGIC .95 passing chord resolves up', 'I maj CALM .5 slips back'],
      '#ii': ['iii m7 NOSTALGIC .9 passing chord resolves up', 'ii m7 CALM .5 slips back'],
      '#iv': ['V 7 NOSTALGIC .9 passing chord resolves up', 'I maj CALM .6 home'],
      III: ['vi m7 NOSTALGIC .95 secondary dominant resolves', 'IV maj CALM .5 sidesteps'],
      II: ['V 7 NOSTALGIC .95 secondary dominant resolves', 'ii m7 CALM .5 softens'],
    },
    minor: {
      i: ['iv m7 NOSTALGIC .9 the soul sway', 'bVII maj CALM .75 soul vamp', 'bVI maj7 EMOTIONAL .7 sinks', 'bIII maj CALM .6 relative major', 'V 7 SURPRISE .5 harmonic minor dominant'],
      ii: ['V 7 NOSTALGIC .95 minor ii–V', 'bIII maj CALM .6 steps up', 'i m7 EMOTIONAL .5 falls home', 'bII maj SURPRISE .45 Neapolitan'],
      bIII: ['bVI maj NOSTALGIC .8 down a fifth', 'bVII maj CALM .75 steps down', 'iv m7 EMOTIONAL .7 rises', 'iii dim7 SURPRISE .5 passing up to iv'],
      iv: ['V 7 NOSTALGIC .85 iv–V', 'bVII maj CALM .75 lifts', 'i m7 CALM .7 home', 'bVI maj EMOTIONAL .6 steps up', '#iv dim7 SURPRISE .55 gospel passing chord'],
      v: ['i m7 CALM .8 home', 'bVI maj EMOTIONAL .75 steps up', 'iv m7 NOSTALGIC .7 falls back', 'bII maj SURPRISE .45 Neapolitan'],
      bVI: ['bVII maj NOSTALGIC .9 climbs', 'V 7 EMOTIONAL .7 tense dominant', 'iv m7 CALM .65 settles', 'bII maj SURPRISE .45 Neapolitan'],
      bVII: ['i m7 NOSTALGIC .9 home, loop it', 'bIII maj CALM .7 relative major', 'bVI maj EMOTIONAL .65 steps down', 'IV 7 SURPRISE .5 dorian lift'],
    },
  },
};

// The colour each style gives a plain diatonic chord (used by the generic pool
// and for the "start here" suggestion).
export function colorChord(c, key, style) {
  const off = mod12(c.root - key.tonic);
  const q = qualityName(c);
  let nq = null;
  if (style === 'motown') nq = q === '' ? (off === 7 ? '7' : 'maj') : q === 'm' ? 'm7' : null;
  if (style === 'nujabes') nq = q === '' ? (off === 7 ? '9sus4' : off === 0 ? 'maj9' : 'maj7') : q === 'm' ? 'm9' : null;
  if (style === 'tyler') nq = q === '' ? (off === 5 ? 'maj7#11' : off === 7 ? '13' : 'maj9') : q === 'm' ? 'm9' : null;
  return nq ? makeChord(c.root, nq) : cloneChord(c);
}

// ---------------------------------------------------------------------------
// ENGINE
// ---------------------------------------------------------------------------

function parseEntry(str) {
  const [roman, quality, tag, weight, ...why] = str.split(' ');
  return { roman, quality, tag, weight: parseFloat(weight), why: why.join(' ') };
}

function findRow(table, current, key) {
  if (!table) return null;
  const off = mod12(current.root - key.tonic);
  const minor = current.third === 'm';
  let fallback = null;
  for (const from of Object.keys(table)) {
    const p = parseRoman(from);
    if (p.offset !== off) continue;
    if (p.minor === minor) return table[from];
    fallback = fallback || table[from];
  }
  return fallback;
}

function candidate(chord, tag, weight, why, key, source) {
  return { chord, tag, weight, why, source };
}

/** Apply the key rule: in-key unless SURPRISE. */
function fitToKey(cand, key) {
  const inKey = inKeyPcs(key);
  const core = cloneChord(cand.chord);
  core.ext = [];
  const coreIn = chordPcs(core).every((pc) => inKey.has(pc));
  if (!coreIn) {
    if (cand.tag !== 'SURPRISE') { cand.tag = 'SURPRISE'; cand.why = `borrowed: ${cand.why}`; }
    return cand;
  }
  if (cand.tag !== 'SURPRISE') {
    const c = cloneChord(cand.chord);
    c.ext = c.ext.filter((e) => {
      const probe = { ...c, seventh: null, fifth: 'P', ext: [e] };
      return chordPcs(probe).every((pc) => inKey.has(pc));
    });
    cand.chord = c;
  }
  return cand;
}

function genericPool(current, key, style) {
  const out = [];
  for (let d = 0; d < 7; d++) {
    const chord = colorChord(diatonicChord(key, d), key, style);
    const motion = current ? mod12(chord.root - current.root) : 0;
    let tag = 'CALM';
    let w = 0.25;
    let why = 'stays in key';
    if (motion === 5) { tag = 'NOSTALGIC'; w += 0.2; why = 'falls a fifth'; }
    else if (chord.third === 'm') { tag = 'EMOTIONAL'; why = 'moves to a minor colour'; }
    else if (motion === 2 || motion === 10) { w += 0.08; why = 'steps gently'; }
    out.push(candidate(chord, tag, w, why, key, 'generic'));
  }
  // The generic pool is the "stay in key" safety net: drop colours whose core leaves the key.
  const inKey = inKeyPcs(key);
  return out.filter((c) => chordPcs({ ...c.chord, ext: [] }).every((pc) => inKey.has(pc)));
}

function commonTones(a, b) {
  const pa = new Set(chordPcs(a));
  const pb = chordPcs(b);
  return pb.filter((pc) => pa.has(pc)).length / Math.max(pa.size, pb.length);
}

/**
 * Suggest what to play next.
 * @param {object} p
 * @param {object|null} p.current  the base chord just played (null = nothing yet)
 * @param {{tonic:number, mode:'major'|'minor'}} p.key
 * @param {'nujabes'|'tyler'|'motown'} p.style
 * @param {object[]} p.history  recent base chords, oldest first, current last
 * @returns {{best: Suggestion, alts: Suggestion[]}}
 */
export function suggestNext({ current, key, style = 'nujabes', history = [] }) {
  const home = colorChord(diatonicChord(key, 0), key, style);
  if (!current) {
    const res = suggestNext({ current: home, key, style, history: [] });
    const best = finish(candidate(home, 'CALM', 1, 'start at home', key, 'start'), key);
    return { best, alts: res.alts.filter((a) => a.name !== best.name).slice(0, 4) };
  }

  const tables = STYLES[style] || STYLES.nujabes;
  const row = findRow(tables[key.mode], current, key) || findRow(COMMON[key.mode], current, key) || [];
  let cands = row.map((s) => {
    const e = parseEntry(s);
    const { offset } = parseRoman(e.roman);
    return candidate(makeChord(key.tonic + offset, e.quality), e.tag, e.weight, e.why, key, 'table');
  });
  cands.push(...genericPool(current, key, style));
  cands = cands.map((c) => fitToKey(c, key));

  // Score.
  const names = history.map((h) => chordName(h, key));
  for (const c of cands) {
    c.name = chordName(c.chord, key);
    let s = c.weight + 0.15 * commonTones(current, c.chord);
    if (names.length >= 4 && c.name === names[names.length - 4]) { s += 0.3; c.why += ' · closes the 4-chord loop'; }
    if (names.length >= 2 && c.name === names[names.length - 2]) s -= 0.3;
    if (c.chord.root === current.root) s -= 0.6;
    c.score = s;
  }
  // Dedupe by name, keeping the best-scoring version.
  const byName = new Map();
  for (const c of cands) if (!byName.has(c.name) || byName.get(c.name).score < c.score) byName.set(c.name, c);
  cands = [...byName.values()].filter((c) => !sameChord(c.chord, current)).sort((a, b) => b.score - a.score);

  const best = cands.find((c) => c.tag !== 'SURPRISE') || cands[0];
  const alts = [];
  for (const tag of TAGS) {
    // One alternative per tag, each on a different root from the best and from each other.
    const used = new Set([best.chord.root, ...alts.map((x) => x.chord.root)]);
    const a = cands.find((c) => c.tag === tag && !used.has(c.chord.root))
      || cands.find((c) => c.tag === tag && c !== best && !alts.includes(c) && c.chord.root !== best.chord.root);
    if (a) alts.push(a);
  }
  // Fill an empty slot so all four tags are always offered.
  for (const tag of TAGS) {
    if (alts.some((a) => a.tag === tag) || tag === 'SURPRISE') continue;
    const taken = new Set([best.name, ...alts.map((a) => a.name)]);
    let fill = null;
    if (tag === 'NOSTALGIC') {
      // Literally nostalgic: go back to a chord from earlier in your progression.
      const back = [...history].reverse().find((h) => h.root !== current.root && h.root !== best.chord.root && !taken.has(chordName(h, key)));
      if (back) fill = candidate(back, 'NOSTALGIC', 0.4, 'goes back to where you were', key, 'history');
    }
    if (!fill) {
      const spare = cands.find((c) => c.tag !== 'SURPRISE' && !taken.has(c.name) && c.chord.root !== best.chord.root);
      if (spare) fill = { ...spare, tag };
    }
    if (fill) { fill.name = chordName(fill.chord, key); alts.push(fill); }
  }
  alts.sort((a, b) => TAGS.indexOf(a.tag) - TAGS.indexOf(b.tag));
  if (!alts.some((a) => a.tag === 'SURPRISE')) {
    alts.push(candidate(borrow(best.chord, key), 'SURPRISE', 0.3, 'the borrowed twin of the best move', key, 'generic'));
  }
  return { best: finish(best, key), alts: alts.map((a) => finish(a, key)).filter((a) => a.name !== chordName(best.chord, key)) };
}

function finish(c, key) {
  return { chord: c.chord, name: chordName(c.chord, key), roman: romanOf(c.chord, key), tag: c.tag, why: c.why };
}
