// capture.js — CAPTURE and recorded parts. Pure functions, no audio or DOM.
//
// Slug OS quietly logs what you play (chords, and notes on the MELODY, BASS
// and SOLOIST players) with their time in beats. CAPTURE turns the most
// recent stretch of that into:
//   * a chord sequencer loop (snapped to a 1-bar, 2-beat or 1-beat grid), and
//   * a recorded PART for each player you played (notes snapped to 16ths).
//
// A part is { notes: [{ pos, midi, vel, dur }] } with pos/dur in beats inside
// a loop of `loopBeats` beats.

export const PART_PLAYERS = ['melody', 'bass', 'soloist'];
export const REC_MODES = ['OVERDUB', 'REPLACE'];

const NICE_LENGTHS = [1, 2, 4, 8, 12, 16];
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 1; };
export const snap16 = (beats) => Math.round(beats * 4) / 4;

/**
 * Turn logged chord events [{ beat, chord }] into a sequencer loop.
 * Picks the biggest grid (1 bar, 2 beats, 1 beat) that keeps every chord
 * change on its own step; if it's longer than 16 steps, keeps the newest part.
 * Returns { steps: (chord|null)[16], length, stepBeats, startBeat, loopBeats } or null.
 */
export function captureChords(events) {
  // Merge repeats of the same chord in a row.
  const evs = [];
  for (const e of events) if (!evs.length || evs[evs.length - 1].name !== e.name) evs.push(e);
  if (!evs.length) return null;
  const t0 = evs[0].beat;
  let grid = 1;
  for (const g of [4, 2, 1]) {
    const steps = evs.map((e) => Math.round((e.beat - t0) / g));
    if (new Set(steps).size === steps.length) { grid = g; break; }
  }
  let steps = evs.map((e) => Math.round((e.beat - t0) / grid));
  // Most recent part that fits in 16 steps.
  const last = steps[steps.length - 1];
  let first = 0;
  while (last - steps[first] >= 16) first++;
  const kept = evs.slice(first);
  steps = steps.slice(first).map((s, _, arr) => s - arr[0]);
  const gaps = steps.slice(1).map((s, i) => s - steps[i]).filter((g) => g > 0);
  const lastLen = Math.max(1, median(gaps));
  const raw = Math.min(16, steps[steps.length - 1] + lastLen);
  const length = NICE_LENGTHS.find((n) => n >= raw) || 16;
  const out = Array(16).fill(null);
  kept.forEach((e, i) => { out[steps[i]] = e.chord; });
  return { steps: out, length, stepBeats: grid, startBeat: kept[0].beat, loopBeats: length * grid };
}

/**
 * Notes logged [{ player, beat, midi, vel, dur }] -> parts inside a loop that
 * starts at `startBeat` and lasts `loopBeats`. If startBeat is null, the loop
 * is anchored on the newest run of notes that fits (starting on a beat).
 * Returns { melody: [...], bass: [...], soloist: [...] } (only players with notes).
 */
export function captureNotes(notes, loopBeats, startBeat = null) {
  if (!notes.length) return {};
  let start = startBeat;
  if (start == null) {
    const lastBeat = notes[notes.length - 1].beat;
    const recent = notes.filter((n) => n.beat > lastBeat - loopBeats + 0.01);
    start = Math.floor(recent[0].beat);
  }
  const parts = {};
  for (const n of notes) {
    const rel = n.beat - start;
    if (rel < -0.125 || rel >= loopBeats - 0.125) continue;
    const pos = ((snap16(rel) % loopBeats) + loopBeats) % loopBeats;
    (parts[n.player] = parts[n.player] || []).push({ pos, midi: n.midi, vel: n.vel, dur: Math.max(0.25, snap16(n.dur ?? 0.25)) });
  }
  return parts;
}

/** Add `add` notes to a part: OVERDUB keeps what's there, REPLACE throws it away first. */
export function mergePart(existing, add, mode) {
  const base = mode === 'REPLACE' ? [] : existing;
  const out = [...base];
  for (const n of add) if (!out.some((o) => o.pos === n.pos && o.midi === n.midi)) out.push(n);
  return out.sort((a, b) => a.pos - b.pos || a.midi - b.midi);
}

/** Notes of a part that start inside [from, to) beats (loop positions). */
export function notesIn(part, from, to) {
  return part.filter((n) => n.pos >= from - 1e-6 && n.pos < to - 1e-6);
}

export const emptyParts = () => Object.fromEntries(PART_PLAYERS.map((p) => [p, []]));
export const cloneParts = (parts) => Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.map((n) => ({ ...n }))]));
