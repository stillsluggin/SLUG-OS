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
// Internal ids stay the same so saved projects still load; the names on screen changed.
export const STYLE_IDS = ['nujabes', 'tyler', 'motown', 'cruise', 'bloom', 'drift', 'boombap', 'dusty', 'strut', 'golden', 'knock'];
export const STYLE_LABELS = {
  nujabes: 'BREATHE', tyler: 'FOCUS', motown: 'STOMP', cruise: 'CRUISE', bloom: 'BLOOM', drift: 'DRIFT',
  boombap: 'BOOM BAP', dusty: 'DUSTY', strut: 'STRUT', golden: 'GOLDEN', knock: 'KNOCK',
};

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
  // BREATHE (id nujabes): minor 9ths, major 7ths, ii–V movement, looping progressions.
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

  // FOCUS (id tyler): maj7#11 chords, chromatic slides, borrowed chords.
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

  // STOMP (id motown): I–vi–IV–V, gospel passing chords, secondary dominants.
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

  // CRUISE: G-funk. Minor sway, dominant 9ths, a slow bounce.
  cruise: {
    major: {
      I: ['vi m9 NOSTALGIC .9 the sunset turn', 'IV 9 CALM .75 lazy lift', 'ii m9 EMOTIONAL .6 sighs', 'bVII 9 SURPRISE .6 borrowed cruise'],
      ii: ['V 9 NOSTALGIC .85 ii–V cruise', 'iii m7 CALM .6 steps up', 'vi m9 EMOTIONAL .6 falls', 'bII 9 SURPRISE .5 slides down'],
      iii: ['vi m9 NOSTALGIC .85 down a fifth', 'IV 9 CALM .7 lifts', 'ii m9 EMOTIONAL .6 sighs', 'bIII 9 SURPRISE .5 slides'],
      IV: ['I maj7 CALM .8 settles', 'iii m7 NOSTALGIC .7 drifts', 'V 9 EMOTIONAL .6 hangs', 'iv m9 SURPRISE .6 borrowed minor iv'],
      V: ['I maj7 CALM .85 home', 'vi m9 EMOTIONAL .75 deceptive', 'IV 9 NOSTALGIC .6 backs off', 'bVI 9 SURPRISE .5 borrowed bVI'],
      vi: ['ii m9 NOSTALGIC .85 cycle of fourths', 'IV 9 CALM .75 lifts', 'V 9 EMOTIONAL .6 rises', 'bVII 9 SURPRISE .55 borrowed bVII'],
      vii: ['iii m7 NOSTALGIC .8 down a fifth', 'I maj7 CALM .7 home', 'vi m9 EMOTIONAL .6 falls', 'bVII 9 SURPRISE .5 slides down'],
    },
    minor: {
      i: ['iv m9 NOSTALGIC .95 the G-funk sway', 'bVII 9 CALM .75 cruises up', 'bVI maj7 EMOTIONAL .7 sinks', 'v m7 CALM .6 drifts', 'bII 9 SURPRISE .5 slides'],
      ii: ['V 7 NOSTALGIC .85 minor ii–V', 'bIII maj7 CALM .6 steps up', 'i m9 EMOTIONAL .55 falls home', 'bII 9 SURPRISE .5 slides down'],
      bIII: ['bVII 9 NOSTALGIC .75 down a fourth', 'iv m9 EMOTIONAL .75 rises', 'bVI maj7 CALM .65 floats', 'bII 9 SURPRISE .45 slides'],
      iv: ['i m9 NOSTALGIC .9 back to the sway', 'bVII 9 CALM .75 lifts', 'v m7 EMOTIONAL .6 rises', 'IV 9 SURPRISE .55 dorian lift'],
      v: ['i m9 CALM .85 home', 'iv m9 NOSTALGIC .7 falls back', 'bVI maj7 EMOTIONAL .7 steps up', 'bII 9 SURPRISE .45 sidesteps'],
      bVI: ['bVII 9 NOSTALGIC .85 climbs', 'v m7 EMOTIONAL .7 falls', 'i m9 CALM .65 home', 'V 7 SURPRISE .5 tense dominant'],
      bVII: ['i m9 NOSTALGIC .9 home, loop it', 'iv m9 CALM .7 falls back', 'bVI maj7 EMOTIONAL .6 steps down', 'IV 9 SURPRISE .45 dorian lift'],
    },
  },

  // BLOOM: gospel-tinged neo-soul. 11ths and 13ths, passing chords, very laid back.
  bloom: {
    major: {
      I: ['IV maj9 NOSTALGIC .85 church lift', 'vi m11 EMOTIONAL .75 falls soft', 'ii m9 CALM .7 walks up', 'iii m7 CALM .55 drifts', '#i dim7 SURPRISE .6 gospel passing chord'],
      ii: ['V 13 NOSTALGIC .95 the ii–V', 'iii m7 CALM .65 walks up', 'vi m11 EMOTIONAL .55 falls', '#ii dim7 SURPRISE .55 gospel climb'],
      iii: ['vi m11 NOSTALGIC .85 down a fifth', 'IV maj9 CALM .75 steps up', 'ii m9 EMOTIONAL .6 sighs', 'III 7 SURPRISE .6 secondary dominant'],
      IV: ['iii m7 NOSTALGIC .8 steps down', 'I maj9 CALM .75 amen', 'V 13 CALM .6 lifts', 'iv m6 EMOTIONAL .7 minor plagal', '#iv dim7 SURPRISE .7 gospel climb'],
      V: ['I maj9 CALM .9 home', 'vi m11 EMOTIONAL .75 deceptive', 'IV maj9 NOSTALGIC .6 backs off', 'bVI maj7 SURPRISE .5 borrowed bVI'],
      vi: ['ii m9 NOSTALGIC .9 down a fifth', 'IV maj9 CALM .75 floats', 'iii m7 EMOTIONAL .55 steps down', 'II 7 SURPRISE .6 secondary dominant'],
      vii: ['iii m7 NOSTALGIC .8 down a fifth', 'I maj9 CALM .75 home', 'vi m11 EMOTIONAL .6 falls', 'III 7 SURPRISE .55 secondary dominant'],
      '#i': ['ii m9 NOSTALGIC .95 passing chord resolves up', 'I maj9 CALM .5 slips back'],
      '#ii': ['iii m7 NOSTALGIC .9 passing chord resolves up', 'ii m9 CALM .5 slips back'],
      '#iv': ['V 13 NOSTALGIC .9 passing chord resolves up', 'I maj9 CALM .6 home over the 5th'],
      III: ['vi m11 NOSTALGIC .95 secondary dominant resolves', 'IV maj9 CALM .5 sidesteps'],
      II: ['V 13 NOSTALGIC .95 secondary dominant resolves', 'ii m9 CALM .5 softens'],
    },
    minor: {
      i: ['iv m11 NOSTALGIC .9 the soul sway', 'bVI maj9 EMOTIONAL .75 sinks', 'bIII maj9 CALM .65 lifts', 'ii m7b5 CALM .6 to the ii–V', 'V 7b9 SURPRISE .55 gospel dominant'],
      ii: ['V 7 NOSTALGIC .95 minor ii–V', 'bIII maj9 CALM .6 steps up', 'i m11 EMOTIONAL .55 falls home', 'bII maj7 SURPRISE .45 Neapolitan'],
      bIII: ['bVI maj9 NOSTALGIC .8 down a fifth', 'iv m11 EMOTIONAL .7 rises', 'bVII 9 CALM .7 sways', 'iii dim7 SURPRISE .5 passing up to iv'],
      iv: ['bVII 13 NOSTALGIC .85 the backdoor', 'V 7 EMOTIONAL .65 tense', 'i m11 CALM .7 home', '#iv dim7 SURPRISE .55 gospel passing chord'],
      v: ['i m11 CALM .8 home', 'bVI maj9 EMOTIONAL .75 steps up', 'iv m11 NOSTALGIC .7 falls back', 'V 7b9 SURPRISE .5 gospel dominant'],
      bVI: ['bVII 13 NOSTALGIC .85 climbs', 'V 7 EMOTIONAL .7 tense dominant', 'iv m11 CALM .65 settles', 'bII maj7 SURPRISE .45 Neapolitan'],
      bVII: ['i m11 NOSTALGIC .9 home, loop it', 'bIII maj9 CALM .7 relative major', 'bVI maj9 EMOTIONAL .65 steps down', 'IV 9 SURPRISE .5 dorian lift'],
    },
  },

  // DRIFT: calm and spacious. Open sus chords, major 7ths, gentle steps.
  drift: {
    major: {
      I: ['IV maj7 CALM .9 floats', 'V sus2 NOSTALGIC .7 hangs open', 'vi m7 EMOTIONAL .7 falls soft', 'ii m9 CALM .6 drifts up', 'bVII maj7 SURPRISE .5 borrowed haze'],
      ii: ['IV maj7 CALM .8 lifts', 'V sus2 NOSTALGIC .75 hangs', 'vi m7 EMOTIONAL .6 falls', 'bVII maj7 SURPRISE .5 borrowed haze'],
      iii: ['IV maj7 CALM .85 drifts up', 'I maj7 NOSTALGIC .6 home', 'vi m7 EMOTIONAL .7 falls', 'bIII maj7 SURPRISE .5 slides'],
      IV: ['I maj7 CALM .85 settles', 'V sus2 NOSTALGIC .7 hangs open', 'vi m7 EMOTIONAL .65 falls', 'iv m6 SURPRISE .55 borrowed minor iv'],
      V: ['IV maj7 NOSTALGIC .8 backs away', 'I maj7 CALM .75 home', 'vi m7 EMOTIONAL .7 deceptive', 'bVI maj7 SURPRISE .5 borrowed bVI'],
      vi: ['IV maj7 CALM .85 floats up', 'V sus2 NOSTALGIC .7 hangs', 'iii m7 EMOTIONAL .6 steps down', 'bVI maj7 SURPRISE .5 slides'],
      vii: ['I maj7 CALM .8 resolves up', 'iii m7 NOSTALGIC .7 down a fifth', 'vi m7 EMOTIONAL .6 falls', 'bVII maj7 SURPRISE .5 slides'],
    },
    minor: {
      i: ['bVI maj7 CALM .85 sinks soft', 'bIII maj7 NOSTALGIC .75 lifts', 'iv m9 EMOTIONAL .7 sways', 'bVII sus2 CALM .65 opens', 'IV 6 SURPRISE .5 dorian light'],
      ii: ['bIII maj7 CALM .75 steps up', 'v m7 NOSTALGIC .65 rises', 'i m9 EMOTIONAL .6 falls home', 'bII maj7 SURPRISE .45 slides'],
      bIII: ['bVI maj7 CALM .8 floats down', 'bVII sus2 NOSTALGIC .7 opens', 'iv m9 EMOTIONAL .65 rises', 'bII maj7 SURPRISE .45 slides'],
      iv: ['i m9 CALM .8 settles', 'bVI maj7 NOSTALGIC .7 floats', 'bIII maj7 EMOTIONAL .6 drifts down', 'IV 6 SURPRISE .5 dorian light'],
      v: ['bVI maj7 CALM .8 steps up', 'i m9 NOSTALGIC .7 home', 'iv m9 EMOTIONAL .65 falls back', 'bII maj7 SURPRISE .45 sidesteps'],
      bVI: ['bVII sus2 NOSTALGIC .8 opens up', 'i m9 CALM .75 home', 'iv m9 EMOTIONAL .65 settles', 'bII maj7 SURPRISE .45 floats'],
      bVII: ['i m9 CALM .85 home', 'bVI maj7 NOSTALGIC .7 steps down', 'bIII maj7 EMOTIONAL .6 relative major', 'IV 6 SURPRISE .45 dorian light'],
    },
  },

  // ---- Hip hop, jazz, funk and soul styles (no artist names, just grooves) ----

  // BOOM BAP: dusty minor loops, two-chord vamps, chopped stabs.
  boombap: {
    major: {
      I: ['vi m9 NOSTALGIC .9 flips to the minor loop', 'IV maj7 CALM .75 lifts', 'iii m7 EMOTIONAL .6 drifts', 'bVII 9 SURPRISE .55 borrowed bVII'],
      ii: ['V 9sus4 NOSTALGIC .85 the ii–V', 'vi m9 EMOTIONAL .6 falls', 'IV maj7 CALM .6 lifts', 'bII maj7 SURPRISE .5 slides down'],
      iii: ['vi m9 NOSTALGIC .85 down a fifth', 'IV maj7 CALM .7 steps up', 'ii m9 EMOTIONAL .6 sighs', 'bIII maj7 SURPRISE .5 slides'],
      IV: ['iii m7 NOSTALGIC .8 the two-chord loop', 'I maj7 CALM .7 settles', 'ii m9 EMOTIONAL .6 steps down', 'iv m9 SURPRISE .6 borrowed minor iv'],
      V: ['vi m9 EMOTIONAL .8 deceptive', 'I maj7 CALM .75 home', 'IV maj7 NOSTALGIC .6 backs off', 'bVI maj7 SURPRISE .5 borrowed bVI'],
      vi: ['IV maj7 NOSTALGIC .85 the vi–IV loop', 'ii m9 CALM .7 down a fifth', 'iii m7 EMOTIONAL .6 steps down', 'bVI maj7 SURPRISE .5 slides'],
      vii: ['iii m7 NOSTALGIC .8 down a fifth', 'vi m9 EMOTIONAL .6 falls', 'I maj7 CALM .6 home', 'bVII 9 SURPRISE .5 slides'],
    },
    minor: {
      i: ['iv m9 NOSTALGIC .95 the two-chord loop', 'bVI maj7 EMOTIONAL .8 sinks', 'bVII 7 CALM .65 lifts', 'v m9 CALM .6 drifts', 'bII maj7 SURPRISE .55 dark slide'],
      ii: ['V 7 NOSTALGIC .85 minor ii–V', 'i m9 EMOTIONAL .6 falls home', 'bIII maj7 CALM .6 steps up', 'bII maj7 SURPRISE .5 slides'],
      bIII: ['bVI maj7 NOSTALGIC .8 down a fifth', 'iv m9 EMOTIONAL .7 rises', 'bVII 7 CALM .65 sways', 'bII maj7 SURPRISE .45 slides'],
      iv: ['i m9 NOSTALGIC .9 back to the loop', 'bVI maj7 EMOTIONAL .7 steps up', 'v m9 CALM .6 rises', 'IV 7 SURPRISE .5 dorian lift'],
      v: ['i m9 CALM .85 home', 'bVI maj7 EMOTIONAL .75 steps up', 'iv m9 NOSTALGIC .65 falls back', 'bII maj7 SURPRISE .5 sidesteps'],
      bVI: ['v m9 NOSTALGIC .8 falls a half step', 'i m9 CALM .7 home', 'bVII 7 EMOTIONAL .6 climbs', 'V 7 SURPRISE .5 tense dominant'],
      bVII: ['i m9 NOSTALGIC .9 home, loop it', 'bVI maj7 EMOTIONAL .7 steps down', 'iv m9 CALM .6 falls back', 'bII maj7 SURPRISE .45 floats'],
    },
  },

  // DUSTY: jazz hip hop. ii–V–I everywhere, 11ths and 13ths, tritone subs.
  dusty: {
    major: {
      I: ['ii m9 NOSTALGIC .9 starts a ii–V', 'vi m11 EMOTIONAL .7 falls', 'IV maj9 CALM .7 lifts', 'iii m7 CALM .6 to the iii–vi', 'VI 7 SURPRISE .6 turnaround dominant'],
      ii: ['V 13 NOSTALGIC 1 the ii–V', 'iii m7 CALM .6 steps up', 'vi m11 EMOTIONAL .55 falls', 'bII 7 SURPRISE .7 tritone sub'],
      iii: ['vi m11 NOSTALGIC .85 iii–vi', 'IV maj9 CALM .65 steps up', 'ii m9 EMOTIONAL .6 sighs', 'bIII 7 SURPRISE .6 chromatic dominant'],
      IV: ['iii m7 NOSTALGIC .8 steps down', 'V 13 CALM .65 lifts', 'ii m9 EMOTIONAL .6 falls', '#iv m7b5 SURPRISE .6 jazz passing chord'],
      V: ['I maj9 CALM .9 home', 'vi m11 EMOTIONAL .7 deceptive', 'iii m7 NOSTALGIC .6 drifts', 'bVI 9 SURPRISE .5 backdoor'],
      vi: ['ii m9 NOSTALGIC .95 cycle of fourths', 'IV maj9 CALM .65 floats', 'iii m7 EMOTIONAL .55 steps down', 'II 7 SURPRISE .6 secondary dominant'],
      vii: ['iii m7 NOSTALGIC .8 down a fifth', 'vi m11 EMOTIONAL .6 falls', 'I maj9 CALM .6 home', 'III 7 SURPRISE .7 to the relative minor'],
      II: ['V 13 NOSTALGIC .95 secondary dominant resolves', 'ii m9 CALM .5 softens'],
      VI: ['ii m9 NOSTALGIC .95 turnaround resolves', 'IV maj9 CALM .5 sidesteps'],
      III: ['vi m11 NOSTALGIC .95 resolves', 'IV maj9 CALM .5 sidesteps'],
      bII: ['I maj9 CALM .95 tritone resolution', 'vi m11 EMOTIONAL .5 falls'],
    },
    minor: {
      i: ['iv m11 NOSTALGIC .85 sways', 'ii m7b5 NOSTALGIC .8 starts a minor ii–V', 'bVI maj9 EMOTIONAL .7 sinks', 'bIII maj9 CALM .65 relative major', 'bII 7 SURPRISE .5 tritone'],
      ii: ['V 7b9 NOSTALGIC 1 minor ii–V', 'bIII maj9 CALM .6 steps up', 'i m11 EMOTIONAL .5 falls home', 'bII 7 SURPRISE .65 tritone sub'],
      bIII: ['bVI maj9 NOSTALGIC .8 down a fifth', 'iv m11 EMOTIONAL .7 rises', 'ii m7b5 CALM .6 to the ii–V', 'iii m7 SURPRISE .5 sidestep'],
      iv: ['bVII 13 NOSTALGIC .85 the backdoor', 'V 7b9 EMOTIONAL .7 tense', 'i m11 CALM .7 home', 'IV 9 SURPRISE .5 dorian lift'],
      v: ['i m11 CALM .8 home', 'bVI maj9 EMOTIONAL .7 steps up', 'iv m11 NOSTALGIC .65 falls back', 'V 7b9 SURPRISE .5 turns dominant'],
      bVI: ['ii m7b5 NOSTALGIC .85 to the ii–V', 'bVII 13 CALM .65 climbs', 'V 7b9 EMOTIONAL .65 tense', 'bII 7 SURPRISE .5 tritone'],
      bVII: ['bIII maj9 NOSTALGIC .85 to the relative major', 'i m11 CALM .75 home', 'bVI maj9 EMOTIONAL .6 steps down', 'IV 9 SURPRISE .5 dorian lift'],
      V: ['i m11 CALM .9 resolves', 'bVI maj9 EMOTIONAL .75 deceptive'],
    },
  },

  // STRUT: funk. One- and two-chord vamps, 9ths and 13ths, tight 16ths.
  strut: {
    major: {
      I: ['IV maj9 NOSTALGIC .8 the vamp', 'ii m7 CALM .7 walks up', 'vi m7 EMOTIONAL .6 falls', 'bVII 9 SURPRISE .6 funky backdoor'],
      ii: ['V 13 NOSTALGIC .9 the ii–V vamp', 'iii m7 CALM .6 steps up', 'IV maj9 EMOTIONAL .55 lifts', 'bIII 9 SURPRISE .5 slides'],
      iii: ['IV maj9 NOSTALGIC .75 climbs', 'vi m7 EMOTIONAL .65 falls', 'ii m7 CALM .6 steps down', 'bIII 9 SURPRISE .5 slides'],
      IV: ['V 13 NOSTALGIC .85 pushes up', 'I 6/9 CALM .75 home', 'ii m7 EMOTIONAL .6 steps down', 'bVII 9 SURPRISE .6 funky backdoor'],
      V: ['IV maj9 NOSTALGIC .8 the funk fall', 'I 6/9 CALM .75 home', 'vi m7 EMOTIONAL .65 deceptive', 'bVI 9 SURPRISE .5 borrowed'],
      vi: ['ii m7 NOSTALGIC .8 down a fifth', 'IV maj9 CALM .7 lifts', 'V 13 EMOTIONAL .6 rises', 'bVII 9 SURPRISE .55 borrowed'],
      vii: ['iii m7 NOSTALGIC .7 down a fifth', 'I 6/9 CALM .7 home', 'vi m7 EMOTIONAL .6 falls', 'bVII 9 SURPRISE .5 slides'],
    },
    minor: {
      i: ['iv m7 NOSTALGIC .9 the minor vamp', 'bVII 9 CALM .8 lifts', 'bIII maj7 EMOTIONAL .6 relative major', 'v m7 CALM .6 drifts', 'IV 9 SURPRISE .6 dorian IV'],
      ii: ['V 7 NOSTALGIC .8 minor ii–V', 'bIII maj7 CALM .6 steps up', 'i m9 EMOTIONAL .55 home', 'bII 9 SURPRISE .5 slides'],
      bIII: ['iv m7 NOSTALGIC .75 rises', 'bVII 9 CALM .75 down a fourth', 'bVI maj7 EMOTIONAL .6 floats', 'IV 9 SURPRISE .5 dorian IV'],
      iv: ['i m9 NOSTALGIC .9 back to the vamp', 'bVII 9 CALM .75 lifts', 'v m7 EMOTIONAL .6 rises', 'IV 9 SURPRISE .55 dorian lift'],
      v: ['i m9 CALM .8 home', 'iv m7 NOSTALGIC .7 falls back', 'bVI maj7 EMOTIONAL .65 steps up', 'bII 9 SURPRISE .45 sidesteps'],
      bVI: ['bVII 9 NOSTALGIC .85 climbs', 'v m7 EMOTIONAL .65 falls', 'i m9 CALM .65 home', 'V 7 SURPRISE .5 tense dominant'],
      bVII: ['i m9 NOSTALGIC .9 home, vamp on', 'iv m7 CALM .7 falls back', 'bVI maj7 EMOTIONAL .6 steps down', 'IV 9 SURPRISE .5 dorian lift'],
    },
  },

  // GOLDEN: sweet soul. Major 7ths, climbing lines, gospel touches.
  golden: {
    major: {
      I: ['iii m7 NOSTALGIC .8 the sweet climb', 'IV maj7 CALM .85 lifts', 'vi m9 EMOTIONAL .75 falls', 'ii m7 CALM .6 walks up', 'III 7 SURPRISE .55 secondary dominant'],
      ii: ['V 9sus4 NOSTALGIC .9 the ii–V', 'iii m7 CALM .65 climbs', 'IV maj7 EMOTIONAL .55 lifts', '#ii dim7 SURPRISE .5 gospel climb'],
      iii: ['IV maj7 NOSTALGIC .85 keeps climbing', 'vi m9 EMOTIONAL .7 falls', 'ii m7 CALM .6 steps down', 'III 7 SURPRISE .55 secondary dominant'],
      IV: ['V 9sus4 NOSTALGIC .85 rises', 'I maj7 CALM .75 amen', 'iii m7 EMOTIONAL .6 steps down', 'iv m6 SURPRISE .65 gospel minor iv'],
      V: ['I maj7 CALM .9 home', 'vi m9 EMOTIONAL .75 deceptive', 'IV maj7 NOSTALGIC .6 backs off', 'bVI maj7 SURPRISE .5 borrowed'],
      vi: ['IV maj7 NOSTALGIC .85 vi–IV', 'ii m7 CALM .7 down a fifth', 'V 9sus4 EMOTIONAL .6 rises', 'II 7 SURPRISE .55 secondary dominant'],
      vii: ['iii m7 NOSTALGIC .75 down a fifth', 'I maj7 CALM .75 home', 'vi m9 EMOTIONAL .6 falls', 'III 7 SURPRISE .55 secondary dominant'],
    },
    minor: {
      i: ['bVI maj7 EMOTIONAL .85 sinks sweet', 'iv m9 NOSTALGIC .8 sways', 'bIII maj7 CALM .75 relative major', 'bVII 9sus4 CALM .6 floats', 'V 7 SURPRISE .5 dominant'],
      ii: ['V 7 NOSTALGIC .9 minor ii–V', 'bIII maj7 CALM .65 steps up', 'i m9 EMOTIONAL .55 home', 'bII maj7 SURPRISE .45 slides'],
      bIII: ['bVI maj7 NOSTALGIC .8 down a fifth', 'iv m9 EMOTIONAL .7 rises', 'bVII 9sus4 CALM .7 floats', 'iii dim7 SURPRISE .5 passing'],
      iv: ['bVII 9sus4 NOSTALGIC .85 lifts', 'i m9 CALM .7 home', 'bIII maj7 EMOTIONAL .65 drifts', '#iv dim7 SURPRISE .55 gospel passing'],
      v: ['i m9 CALM .8 home', 'bVI maj7 EMOTIONAL .75 steps up', 'iv m9 NOSTALGIC .7 falls back', 'V 7 SURPRISE .5 turns dominant'],
      bVI: ['bVII 9sus4 NOSTALGIC .85 climbs', 'i m9 CALM .7 home', 'iv m9 EMOTIONAL .65 settles', 'V 7 SURPRISE .5 tense'],
      bVII: ['bIII maj7 NOSTALGIC .8 relative major', 'i m9 CALM .8 home', 'bVI maj7 EMOTIONAL .65 steps down', 'IV 9 SURPRISE .5 dorian lift'],
    },
  },

  // KNOCK: hard hip hop. Dark minor triads, big drops, a menacing half step.
  knock: {
    major: {
      I: ['vi m NOSTALGIC .85 falls to the minor', 'IV maj CALM .7 lifts', 'iii m EMOTIONAL .65 drifts', 'bVI maj SURPRISE .6 dark drop'],
      ii: ['V maj NOSTALGIC .8 rises', 'vi m EMOTIONAL .6 falls', 'IV maj CALM .6 lifts', 'bII maj SURPRISE .5 slides'],
      iii: ['vi m NOSTALGIC .8 down a fifth', 'IV maj CALM .65 steps up', 'ii m EMOTIONAL .6 steps down', 'bIII maj SURPRISE .5 slides'],
      IV: ['I maj CALM .75 home', 'vi m EMOTIONAL .7 falls', 'V maj NOSTALGIC .65 rises', 'iv m SURPRISE .6 borrowed minor iv'],
      V: ['vi m EMOTIONAL .8 deceptive', 'I maj CALM .7 home', 'IV maj NOSTALGIC .6 backs off', 'bVI maj SURPRISE .5 dark drop'],
      vi: ['IV maj NOSTALGIC .85 vi–IV', 'iii m EMOTIONAL .6 steps down', 'V maj CALM .6 rises', 'bVI maj SURPRISE .55 slides'],
      vii: ['iii m NOSTALGIC .7 down a fifth', 'vi m EMOTIONAL .6 falls', 'I maj CALM .6 home', 'bVII maj SURPRISE .5 slides'],
    },
    minor: {
      i: ['bVI maj NOSTALGIC .9 the dark drop', 'iv m EMOTIONAL .75 sinks', 'bVII maj CALM .7 lifts', 'v m CALM .55 drifts', 'bII maj SURPRISE .65 the menacing half step'],
      ii: ['v m NOSTALGIC .7 falls', 'i m CALM .65 home', 'bVI maj EMOTIONAL .6 sinks', 'bII maj SURPRISE .5 menacing'],
      bIII: ['bVI maj NOSTALGIC .75 down a fifth', 'iv m EMOTIONAL .7 rises', 'bVII maj CALM .6 sways', 'bII maj SURPRISE .45 menacing'],
      iv: ['i m NOSTALGIC .85 home', 'bVI maj EMOTIONAL .7 steps up', 'v m CALM .6 rises', 'bII maj SURPRISE .5 menacing'],
      v: ['i m CALM .8 home', 'bVI maj EMOTIONAL .75 steps up', 'iv m NOSTALGIC .6 falls back', 'bII maj SURPRISE .5 menacing'],
      bVI: ['bVII maj NOSTALGIC .85 climbs', 'i m CALM .75 home', 'v m EMOTIONAL .65 falls', 'bII maj SURPRISE .5 menacing'],
      bVII: ['i m NOSTALGIC .9 home, loop it', 'bVI maj EMOTIONAL .7 steps down', 'iv m CALM .6 falls back', 'bII maj SURPRISE .5 menacing'],
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
  if (style === 'cruise') nq = q === '' ? (off === 0 ? 'maj7' : '9') : q === 'm' ? 'm9' : null;
  if (style === 'bloom') nq = q === '' ? (off === 7 ? '13' : 'maj9') : q === 'm' ? 'm11' : null;
  if (style === 'drift') nq = q === '' ? (off === 7 ? 'sus2' : 'maj7') : q === 'm' ? 'm7' : null;
  if (style === 'boombap') nq = q === '' ? (off === 7 ? '7' : 'maj7') : q === 'm' ? 'm9' : null;
  if (style === 'dusty') nq = q === '' ? (off === 7 ? '13' : 'maj9') : q === 'm' ? 'm11' : null;
  if (style === 'strut') nq = q === '' ? (off === 7 ? '13' : off === 0 ? '6/9' : off === 10 ? '9' : 'maj9') : q === 'm' ? (off === 0 ? 'm9' : 'm7') : null;
  if (style === 'golden') nq = q === '' ? (off === 7 ? '9sus4' : 'maj7') : q === 'm' ? (off === 4 ? 'm7' : 'm9') : null;
  // knock keeps plain triads: dark and hard.
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
