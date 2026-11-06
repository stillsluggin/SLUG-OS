// trail.js — Chord History: every chord you play, in order, with its bends and
// exact voicing, so BACK / FORWARD can take you to one you liked.
// Pure data, no audio or DOM.
//
// Nothing is ever thrown away by going back: if you go back and play a new
// chord, it is added at the end (the old "future" stays in the trail).

export const TRAIL_MAX = 64;

export function createTrail(saved = null) {
  let entries = Array.isArray(saved?.entries) ? saved.entries.slice(-TRAIL_MAX) : [];
  let pos = null; // index you've stepped back to, or null = at the newest chord

  const same = (a, b) => a && b && a.name === b.name && a.voicing.join() === b.voicing.join();

  return {
    get entries() { return entries; },
    get pos() { return pos ?? entries.length - 1; },
    get browsing() { return pos != null; },

    /** A chord you just played. Returns true if it was added. */
    push(entry) {
      pos = null;
      if (same(entries[entries.length - 1], entry)) return false;
      entries.push(entry);
      if (entries.length > TRAIL_MAX) entries = entries.slice(-TRAIL_MAX);
      return true;
    },

    /** Step one chord back. Returns the entry to replay, or null at the start. */
    back() {
      if (!entries.length) return null;
      const p = this.pos;
      if (p <= 0) return null;
      pos = p - 1;
      return entries[pos];
    },

    /** Step one chord forward. Returns the entry, or null at the newest one. */
    forward() {
      if (pos == null || pos >= entries.length - 1) return null;
      pos += 1;
      const e = entries[pos];
      if (pos === entries.length - 1) pos = null;
      return e;
    },

    /** Jump to entry i (tapping a chip in the trail). */
    go(i) {
      if (i < 0 || i >= entries.length) return null;
      pos = i === entries.length - 1 ? null : i;
      return entries[i];
    },

    /** The last `n` entries around where you are, for the on-screen trail. */
    window(n = 5) {
      const p = this.pos;
      let start = Math.max(0, entries.length - n);
      if (p < start) start = Math.max(0, p - 1); // keep the chord you went back to in view
      return entries.slice(start, start + n).map((e, k) => ({ ...e, index: start + k, current: start + k === p }));
    },

    clear() { entries = []; pos = null; },
    toJSON() { return { entries }; },
  };
}
