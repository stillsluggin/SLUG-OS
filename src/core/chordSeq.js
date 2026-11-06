// chordSeq.js — the 16-step chord sequencer.
//
// Each step holds a chord (or nothing = keep the previous chord). LENGTH is how
// many steps loop (1..16); STEP is how long each step lasts in beats (1, 2, 4).
// While REC is on, the chord you play is written into the step that is
// playing. AUTO fills the loop using Next Chord, so one press gives you a
// progression in your chosen style.

import { suggestNext } from './nextChord.js';
import { diatonicChord } from './chord.js';

export const SEQ_STEPS = 16;
export const STEP_BEATS = [1, 2, 4];

export function createSeq() {
  return { steps: Array(SEQ_STEPS).fill(null), length: 4, stepBeats: 4, on: false, rec: false };
}

/** Which sequencer step is playing at a 16th-note count, and whether it just started. */
export function seqPosition(seq, sixteenth) {
  const per = seq.stepBeats * 4;
  const index = Math.floor(sixteenth / per) % seq.length;
  return { index, isStart: sixteenth % per === 0 };
}

/** The chord in force at a step: the step's own chord, or the last one before it. */
export function seqChordAt(seq, index) {
  for (let i = 0; i < seq.length; i++) {
    const c = seq.steps[(index - i + seq.length) % seq.length];
    if (c) return c;
  }
  return null;
}

export const hasChords = (seq) => seq.steps.slice(0, seq.length).some(Boolean);

/** Fill the loop with a Next Chord progression starting from `start` (or the home chord). */
export function autoFill(seq, { key, style, start = null }) {
  let cur = start || null;
  const history = [];
  const out = [];
  for (let i = 0; i < seq.length; i++) {
    if (i === 0 && cur) { out.push(cur); history.push(cur); continue; }
    const sg = suggestNext({ current: cur, key, style, history });
    cur = sg.best.chord;
    out.push(cur);
    history.push(cur);
  }
  if (!out.length) out.push(diatonicChord(key, 0));
  return { ...seq, steps: seq.steps.map((s, i) => (i < seq.length ? out[i] : s)) };
}
