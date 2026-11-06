// session.js — the Slug OS music brain.
//
// Owns all musical state and turns controls into note events for the band.
// No DOM, no Web Audio: it talks to an `out` object (src/audio/output.js in the
// browser; C calls into Felucca's voices on the FM-1):
//
//   out.now()                                     audio time in seconds
//   out.noteOn(player, midi, vel, {time, glide})  held note
//   out.noteOff(player, midi, time)
//   out.play(player, midi, vel, time, dur, {glide})  note with a length
//   out.releasePlayer(player, time) / out.cutPlayer(player, time)
//   out.drum(lane, vel, time)
//   out.setPlayer(index, player)                  engine, preset, knobs, level, mode
//   out.bar(barIndex, time)                       a bar starts (loops sync to this)
//   out.transport(playing)
//
// The clock calls session.step(n, time) once per 16th note while playing.

import { keyName } from './theory.js';
import { diatonicChord, applyBends, voiceChord, chordName, romanOf, sameChord } from './chord.js';
import { suggestNext, STYLE_IDS, STYLE_LABELS } from './nextChord.js';
import { ENGINES, ENGINE_IDS, engineSlot } from './engines.js';
import { PLAYER_IDS, PLAYER_NAMES, MODES, HARMONY_MODES, BASS_MODES, harmonyEvents, bassEvents, melodyEvents, soloEvents, plateNotes } from './players.js';
import { bassRoot } from './bass.js';
import { drumEvents, generateBoomBap, LANES } from './drums.js';
import { createSeq, seqPosition, seqChordAt, hasChords, autoFill } from './chordSeq.js';
import { KEYS, KNOBS, BEND_INFO } from './controls.js';
import { createTrail } from './trail.js';

const DEFAULT_PLAYERS = [
  { id: 'harmony', mode: 'FOLLOW', slot: engineSlot('keys', 0), level: 0.8, harmonyMode: 'COMP' },
  { id: 'melody', mode: 'MUTE', slot: engineSlot('pluck', 1), level: 0.6 },
  { id: 'bass', mode: 'FOLLOW', slot: engineSlot('pluck', 0), level: 0.85, bassMode: 'ROOT' },
  { id: 'soloist', mode: 'MUTE', slot: engineSlot('analog', 3), level: 0.55 },
  { id: 'drummer', mode: 'FOLLOW', slot: null, level: 0.8 },
];
const MONO = new Set(['bass', 'melody', 'soloist']);

export function createSession(out, { rng = Math.random } = {}) {
  const state = {
    key: { tonic: 2, mode: 'minor' },
    style: 'nujabes',
    tempo: 88,
    swing: 0.4,
    human: 0.35,
    playing: false,
    metronome: false,
    step: 0,
    players: DEFAULT_PLAYERS.map((p) => ({ ...p, slot: p.slot && { ...p.slot, knobs: [...p.slot.knobs] } })),
    focus: 0,
    bends: new Set(),
    base: null,
    chord: null,
    voicing: [],
    bassNote: null,
    suggestions: null,
    history: [],
    seq: createSeq(),
    seqIndex: 0,
    seqSel: null,
    drums: { pattern: generateBoomBap(88, rng), range: [80, 95] },
    keySelect: false,
    pressed: new Set(),
    buttonsHeld: new Set(),
    toast: null,
  };
  const chordStack = []; // held chord sources
  const plateStack = []; // held plate keys {index, midi, player}
  let held = 0;
  let chordStart = false;
  let keyChosenWhileHeld = false;
  const mem = { bass: {}, melody: {}, soloist: {} };
  let trail = createTrail(); // Chord History
  const listeners = new Set();

  const emit = (what = 'state', data) => listeners.forEach((fn) => fn(what, state, data));
  const toast = (text) => { state.toast = { text, at: Date.now() }; emit('toast'); };
  const player = (id) => state.players.find((p) => p.id === id);
  const follows = (id) => player(id).mode === 'FOLLOW';
  const stepDur = () => 60 / state.tempo / 4;

  // ------------------------------------------------------------ the chord

  function refreshSuggestions() {
    state.suggestions = suggestNext({ current: state.base, key: state.key, style: state.style, history: state.history });
  }

  function setBase(chord, { fromSeq = false } = {}) {
    state.base = chord;
    if (!sameChord(state.history[state.history.length - 1], chord)) {
      state.history.push(chord);
      if (state.history.length > 8) state.history.shift();
    }
    refreshSuggestions();
    // REC: write live chords into the sequencer.
    if (!fromSeq && chord) {
      if (state.seq.rec && state.playing) state.seq.steps[state.seqIndex] = chord;
      else if (state.seqSel != null) {
        state.seq.steps[state.seqSel] = chord;
        state.seqSel = (state.seqSel + 1) % state.seq.length;
      }
    }
  }

  /** Recompute the sounding chord from the base + bends and play the change. */
  function refresh({ fresh = false, vel = 0.8, quiet = false, voicing: exact = null } = {}) {
    const prev = state.chord;
    const eff = state.base && state.base !== 'rest' ? applyBends(state.base, state.bends, state.key) : null;
    if (!eff) {
      if (prev) silence();
      state.chord = null;
      emit();
      return;
    }
    if (!fresh && prev && sameChord(prev, eff)) { emit(); return; }
    // Replaying from Chord History uses the exact notes you played (unless you're bending it now).
    const voicing = exact && !state.bends.size ? [...exact] : voiceChord(eff, state.voicing);
    const oldV = prev ? state.voicing : [];
    state.chord = eff;
    state.voicing = voicing;
    const bassNote = bassRoot(player('bass').bassMode, { chord: eff, voicing, key: state.key, prevBass: state.bassNote });
    const oldBass = prev ? state.bassNote : null;
    state.bassNote = bassNote;
    chordStart = true;
    if (!quiet) sound(oldV, voicing, oldBass, bassNote, fresh || !prev, vel);
    emit();
  }

  function sound(oldV, newV, oldBass, newBass, fresh, vel) {
    const t = out.now();
    const harm = follows('harmony');
    const bass = follows('bass');
    if (state.playing) {
      if (harm && player('harmony').harmonyMode !== 'ARP') {
        out.cutPlayer('harmony', t);
        newV.forEach((n, i) => out.play('harmony', n, fresh ? vel : vel * 0.75, t + i * 0.005, stepDur() * 6));
      }
      if (bass && (fresh || newBass !== oldBass)) {
        out.cutPlayer('bass', t);
        out.play('bass', newBass, vel, t, stepDur() * 3);
      }
      hits(['harmony', 'bass'].filter(follows), t);
      return;
    }
    if (harm) {
      if (fresh) {
        out.releasePlayer('harmony', t);
        newV.forEach((n, i) => out.noteOn('harmony', n, vel * (0.85 + 0.15 * (i / newV.length)), { time: t + i * 0.007 }));
      } else {
        oldV.filter((n) => !newV.includes(n)).forEach((n) => out.noteOff('harmony', n, t));
        newV.filter((n) => !oldV.includes(n)).forEach((n) => out.noteOn('harmony', n, vel * 0.8, { time: t }));
      }
    }
    if (bass && (fresh || newBass !== oldBass)) {
      out.releasePlayer('bass', t);
      out.noteOn('bass', newBass, vel, { time: t, glide: oldBass != null && !fresh });
    }
    hits(['harmony', 'bass'].filter(follows), t);
  }

  function silence() {
    const t = out.now();
    for (const id of ['harmony', 'bass', 'melody', 'soloist']) out.releasePlayer(id, t);
  }

  const hits = (ids, time) => ids.length && emit('hits', { players: ids, time });

  function chordDown(src, chord, vel) {
    chordStack.push({ src, chord });
    held++;
    setBase(chord);
    refresh({ fresh: true, vel });
    remember();
  }

  // ------------------------------------------------------------ chord history

  /** Add the chord that's sounding now (with its bends and exact voicing) to the history. */
  function remember() {
    if (!state.chord) return;
    trail.push({
      chord: { ...state.chord, ext: [...state.chord.ext] },
      voicing: [...state.voicing],
      name: chordName(state.chord, state.key),
      roman: romanOf(state.chord, state.key),
    });
  }

  /** Play a chord from the history again, exactly as it was. */
  function replay(entry) {
    if (!entry) return false;
    chordStack.length = 0;
    held = 0;
    setBase({ ...entry.chord, ext: [...entry.chord.ext] });
    refresh({ fresh: true, vel: 0.8, voicing: entry.voicing });
    toast(`◂ ${entry.name}`);
    return true;
  }

  function historyBack() { if (!replay(trail.back())) toast('START OF HISTORY'); emit(); }
  function historyForward() { if (!replay(trail.forward())) toast('NEWEST CHORD'); emit(); }
  function historyGo(i) { replay(trail.go(i)); emit(); }

  function chordUp(src) {
    const i = chordStack.findIndex((e) => e.src === src);
    if (i < 0) return;
    const wasTop = i === chordStack.length - 1;
    chordStack.splice(i, 1);
    held = Math.max(0, held - 1);
    // Chords hold after release (like a latch); REST stops them.
    if (wasTop && chordStack.length) {
      setBase(chordStack[chordStack.length - 1].chord);
      refresh({ fresh: true, vel: 0.7 });
    } else emit();
  }

  function rest() {
    chordStack.length = 0;
    held = 0;
    state.base = null;
    refresh();
    toast('REST');
  }

  function pickSuggestion(slot) {
    const sg = state.suggestions || suggestNext({ current: null, key: state.key, style: state.style });
    return slot === 'best' ? sg.best : sg.alts.find((a) => a.tag === slot) || null;
  }

  // ------------------------------------------------------------ the strum plate

  const harmonyNow = () => state.chord || state.base || diatonicChord(state.key, 0);

  function plateDown(index, pos, vel) {
    const p = state.players[state.focus];
    if (p.id === 'drummer') {
      const lanes = [...LANES, 'kick', 'snare', 'hat'];
      out.drum(lanes[pos], pos >= 6 ? vel * 0.5 : vel, out.now());
      hits(['drummer'], out.now());
      return;
    }
    const notes = plateNotes(p.id, harmonyNow(), state.key);
    const midi = notes[Math.min(pos, notes.length - 1)];
    const mine = plateStack.filter((e) => e.player === p.id);
    const prev = MONO.has(p.id) && mine.length ? mine[mine.length - 1].midi : null;
    plateStack.push({ index, midi, player: p.id });
    out.noteOn(p.id, midi, vel, { time: out.now(), glide: prev != null, from: prev });
    hits([p.id], out.now());
  }

  function plateUp(index) {
    const i = plateStack.findIndex((e) => e.index === index);
    if (i < 0) return;
    const [gone] = plateStack.splice(i, 1);
    const mine = plateStack.filter((e) => e.player === gone.player);
    if (MONO.has(gone.player) && mine.length) {
      const back = mine[mine.length - 1];
      out.noteOn(gone.player, back.midi, 0.6, { time: out.now(), glide: true, from: gone.midi });
    } else out.noteOff(gone.player, gone.midi, out.now());
  }

  // ------------------------------------------------------------ inputs

  function keyDown(index, vel = 0.8) {
    const k = KEYS[index];
    if (!k || state.pressed.has(index)) return;
    state.pressed.add(index);
    if (state.keySelect) { chooseKey(k.pc); emit(); return; }
    switch (k.section) {
      case 'chord': chordDown(`k${index}`, diatonicChord(state.key, k.degree), vel); break;
      case 'bend': setBend(k.bend, true); break;
      case 'plate': plateDown(index, k.pos, vel); emit(); break;
      case 'pick':
        if (k.pick === 'rest') rest();
        else { const s = pickSuggestion(k.pick); if (s) chordDown(`k${index}`, s.chord, vel); }
        break;
    }
  }

  function keyUp(index) {
    const k = KEYS[index];
    if (!k || !state.pressed.has(index)) return;
    state.pressed.delete(index);
    if (k.section === 'chord' || k.section === 'pick') chordUp(`k${index}`);
    else if (k.section === 'bend') setBend(k.bend, false);
    else if (k.section === 'plate') plateUp(index);
    emit();
  }

  function pickDown(slot, vel = 0.8) {
    const s = pickSuggestion(slot);
    if (s) chordDown(`pick:${slot}`, s.chord, vel);
  }
  const pickUp = (slot) => chordUp(`pick:${slot}`);

  function setBend(name, on) {
    if (on === state.bends.has(name)) return;
    if (on) state.bends.add(name); else state.bends.delete(name);
    refresh({ vel: 0.75 });
    if (on) remember(); // a bent chord is a chord you played
    if (on) toast(`${BEND_INFO[name].arrow} ${BEND_INFO[name].label}`);
  }

  function chooseKey(pc) {
    state.key = pc === state.key.tonic
      ? { tonic: pc, mode: state.key.mode === 'minor' ? 'major' : 'minor' }
      : { tonic: pc, mode: state.key.mode };
    keyChosenWhileHeld = true;
    if (!state.buttonsHeld.has('key')) state.keySelect = false;
    chordStack.length = 0;
    state.base = null;
    state.history = [];
    refresh();
    refreshSuggestions();
    toast(keyName(state.key).toUpperCase());
  }

  function buttonDown(id) {
    state.buttonsHeld.add(id);
    switch (id) {
      case 'play': setPlaying(!state.playing); break;
      case 'latch': toggleBassLatch(); break;
      case 'key':
        keyChosenWhileHeld = false;
        state.keySelect = !state.keySelect;
        if (state.keySelect) toast('PICK A KEY');
        break;
      case 'rec':
        state.seq.rec = !state.seq.rec;
        if (state.seq.rec) state.seq.on = true;
        toast(state.seq.rec ? 'REC CHORDS' : 'REC OFF');
        break;
      case 'player': focus((state.focus + 1) % state.players.length); break;
    }
    emit();
  }

  function buttonUp(id) {
    state.buttonsHeld.delete(id);
    if (id === 'key' && keyChosenWhileHeld) state.keySelect = false;
    emit();
  }

  /** Bass Latch: one press flips the bass player between FOLLOW and FREE. */
  function toggleBassLatch() {
    const b = player('bass');
    b.mode = b.mode === 'FOLLOW' ? 'FREE' : 'FOLLOW';
    syncPlayer('bass');
    if (b.mode === 'FREE') {
      out.releasePlayer('bass', out.now());
      focus(state.players.indexOf(b), true);
      toast('BASS FREE · play it on the strum plate');
    } else {
      toast(`BASS LATCH · ${b.bassMode}`);
      if (state.chord && !state.playing) out.noteOn('bass', state.bassNote, 0.8, { time: out.now() });
    }
  }

  function setPlaying(on) {
    if (on === state.playing) return;
    const t = out.now();
    out.releasePlayer('harmony', t);
    out.releasePlayer('bass', t);
    state.playing = on;
    if (on) {
      state.step = 0;
      mem.melody = {}; mem.soloist = {}; mem.bass = {};
      if (!(state.seq.on && hasChords(state.seq)) && !state.base) {
        // One press makes music: PLAY with nothing going starts on the home chord.
        setBase(diatonicChord(state.key, 0), { fromSeq: true });
        refresh({ fresh: true, quiet: true });
      }
    } else {
      silence();
    }
    out.transport(on);
    toast(on ? 'PLAY' : 'STOP');
  }

  /** Metronome: one press on, one press off. Follows TEMPO. */
  function toggleMetronome(on = !state.metronome) {
    state.metronome = on;
    out.metronome(on);
    toast(on ? `CLICK ON · ${state.tempo} BPM` : 'CLICK OFF');
    emit();
  }

  // ------------------------------------------------------------ players

  function syncPlayer(id) {
    const i = state.players.findIndex((p) => p.id === id);
    out.setPlayer(i, state.players[i]);
  }

  function focus(i, silent = false) {
    state.focus = i;
    if (!silent) {
      const p = state.players[i];
      toast(`${PLAYER_NAMES[p.id]}${p.slot ? ` · ${ENGINES[p.slot.engine].name}` : ''}`);
    }
    emit();
  }

  const cycle = (list, v, dir = 1) => list[(list.indexOf(v) + dir + list.length) % list.length];

  function cycleMode(i) {
    const p = state.players[i];
    p.mode = cycle(MODES, p.mode);
    if (p.mode !== 'FOLLOW' && p.id !== 'drummer') out.releasePlayer(p.id, out.now());
    syncPlayer(p.id);
    toast(`${PLAYER_NAMES[p.id]} · ${p.mode}`);
    emit();
  }

  function cycleEngine(i, dir = 1) {
    const p = state.players[i];
    if (!p.slot) return;
    p.slot = engineSlot(cycle(ENGINE_IDS, p.slot.engine, dir), 0);
    syncPlayer(p.id);
    toast(`${PLAYER_NAMES[p.id]} · ${ENGINES[p.slot.engine].name}`);
    emit();
  }

  function cyclePreset(i, dir = 1) {
    const p = state.players[i];
    if (!p.slot) return;
    const n = ENGINES[p.slot.engine].presets.length;
    p.slot = engineSlot(p.slot.engine, (p.slot.preset + dir + n) % n);
    syncPlayer(p.id);
    toast(ENGINES[p.slot.engine].presets[p.slot.preset].name.toUpperCase());
    emit();
  }

  function cycleFeel(i) {
    const p = state.players[i];
    if (p.id === 'harmony') { p.harmonyMode = cycle(HARMONY_MODES, p.harmonyMode); toast(`HARMONY · ${p.harmonyMode}`); }
    if (p.id === 'bass') {
      p.bassMode = cycle(BASS_MODES, p.bassMode);
      if (state.chord) state.bassNote = bassRoot(p.bassMode, { chord: state.chord, voicing: state.voicing, key: state.key, prevBass: state.bassNote });
      toast(`BASS · ${p.bassMode}`);
    }
    emit();
  }

  // ------------------------------------------------------------ knobs

  function knobValue(i) {
    const p = state.players[state.focus];
    switch (KNOBS[i].id) {
      case 'tempo': return (state.tempo - 60) / 90;
      case 'swing': return state.swing;
      case 'human': return state.human;
      case 'style': return (STYLE_IDS.indexOf(state.style) + 0.5) / STYLE_IDS.length;
      case 'a': return p.slot ? p.slot.knobs[0] : 0;
      case 'b': return p.slot ? p.slot.knobs[1] : 0;
      case 'level': return p.level;
    }
    return 0;
  }

  function knobLabel(i) {
    const p = state.players[state.focus];
    const id = KNOBS[i].id;
    if ((id === 'a' || id === 'b') && p.slot) return ENGINES[p.slot.engine].knobs[id === 'a' ? 0 : 1];
    if (id === 'a' || id === 'b') return '—';
    return KNOBS[i].label;
  }

  function knobText(i) {
    const id = KNOBS[i].id;
    const pct = (v) => `${Math.round(v * 100)}%`;
    if (id === 'tempo') return `${state.tempo} BPM`;
    if (id === 'style') return STYLE_LABELS[state.style];
    return pct(knobValue(i));
  }

  function knob(i, v) {
    v = Math.max(0, Math.min(1, v));
    const p = state.players[state.focus];
    switch (KNOBS[i].id) {
      case 'tempo': state.tempo = Math.round(60 + v * 90); break;
      case 'swing': state.swing = v; break;
      case 'human': state.human = v; break;
      case 'style': {
        const s = STYLE_IDS[Math.min(STYLE_IDS.length - 1, Math.floor(v * STYLE_IDS.length))];
        if (s !== state.style) { state.style = s; refreshSuggestions(); }
        break;
      }
      case 'a': case 'b':
        if (!p.slot) return;
        p.slot.knobs[KNOBS[i].id === 'a' ? 0 : 1] = v;
        syncPlayer(p.id);
        break;
      case 'level': p.level = v; syncPlayer(p.id); break;
    }
    toast(`${knobLabel(i)} · ${knobText(i)}`);
    emit();
  }

  // ------------------------------------------------------------ sequencer & drums

  function seqSelect(i) { state.seqSel = i; emit(); }
  function seqSet(patch) { Object.assign(state.seq, patch); state.seqIndex %= state.seq.length; emit(); }
  function seqClear(i) {
    if (i == null) state.seq.steps = state.seq.steps.map(() => null); else state.seq.steps[i] = null;
    emit();
  }
  function seqAuto() {
    state.seq = autoFill({ ...state.seq, on: true }, { key: state.key, style: state.style, start: state.base && state.base !== 'rest' ? state.base : null });
    toast(`AUTO · ${STYLE_LABELS[state.style]} LOOP`);
    emit();
  }

  function setPattern(pattern) { state.drums.pattern = pattern; emit(); }
  function toggleDrumStep(lane, s) {
    const row = state.drums.pattern[lane];
    row[s] = (row[s] + 1) % 3;
    emit();
  }
  function generateDrums({ useRange = false } = {}) {
    if (useRange) {
      const [lo, hi] = state.drums.range;
      state.tempo = Math.round(lo + rng() * (hi - lo));
    }
    state.drums.pattern = generateBoomBap(state.tempo, rng);
    toast(`BOOM BAP · ${state.tempo} BPM`);
    emit();
  }

  // ------------------------------------------------------------ the clock

  function step(n, time) {
    state.step = n;
    // Metronome: a click on every beat, accented on beat 1.
    if (state.metronome && n % 4 === 0) out.click(n % 16 === 0, time);
    if (!state.playing) { emit('step'); return; }
    const s = n % 16;
    const bar = Math.floor(n / 16);
    if (s === 0) out.bar(bar, time);

    // Chord sequencer drives the harmony unless you are holding a chord.
    let nextChord = null;
    if (state.seq.on && hasChords(state.seq)) {
      const pos = seqPosition(state.seq, n);
      state.seqIndex = pos.index;
      if (pos.isStart && held === 0) {
        const c = seqChordAt(state.seq, pos.index);
        if (c && !sameChord(c, state.base)) { setBase(c, { fromSeq: true }); refresh({ fresh: true, quiet: true }); }
      }
      nextChord = seqChordAt(state.seq, (pos.index + 1) % state.seq.length);
    } else if (state.suggestions) nextChord = state.suggestions.best.chord;

    const ctx = {
      chord: state.chord, voicing: state.voicing, key: state.key, style: state.style, bar, rng, nextChord,
      harmonyMode: player('harmony').harmonyMode, bassMode: player('bass').bassMode, chordStart,
      pattern: state.drums.pattern,
    };
    chordStart = false;
    const sd = stepDur();
    const swingT = s % 2 === 1 ? state.swing * 0.33 * sd : 0;
    const humanT = () => (rng() - 0.5) * state.human * 0.03;
    const humanV = () => (rng() - 0.5) * state.human * 0.25;
    const played = [];
    const evs = [];
    if (follows('harmony')) evs.push(...harmonyEvents(s, ctx));
    if (follows('bass')) evs.push(...bassEvents(s, ctx, mem.bass));
    if (follows('melody')) evs.push(...melodyEvents(s, ctx, mem.melody));
    if (follows('soloist')) evs.push(...soloEvents(s, ctx, mem.soloist));
    if (follows('drummer')) evs.push(...drumEvents(s, ctx));
    for (const ev of evs) {
      const t = time + swingT + Math.max(0, (ev.late || 0) + humanT());
      const vel = Math.max(0.08, Math.min(1, ev.vel + humanV()));
      if (ev.drum) out.drum(ev.drum, vel, t);
      else for (const m of ev.notes) out.play(ev.player, m, vel, t, ev.dur * sd * 0.95, { glide: ev.glide });
      if (!played.includes(ev.player)) played.push(ev.player);
    }
    if (played.length) hits(played, time);
    emit('step');
  }

  // ------------------------------------------------------------ display

  function screenModel() {
    const sg = state.suggestions || suggestNext({ current: null, key: state.key, style: state.style });
    let bestDegree = null;
    for (let d = 0; d < 7; d++) if (diatonicChord(state.key, d).root === sg.best.chord.root) bestDegree = d;
    const shown = state.chord || null;
    return {
      keyName: keyName(state.key),
      style: STYLE_LABELS[state.style],
      tempo: state.tempo,
      playing: state.playing,
      keySelect: state.keySelect,
      chordName: shown ? chordName(shown, state.key) : '',
      roman: shown ? romanOf(shown, state.key) : '',
      best: sg.best,
      alts: sg.alts,
      bestDegree,
      bends: [...state.bends],
      step: state.step,
      rec: state.seq.rec,
    };
  }

  const chordKeyLabels = () => Array.from({ length: 7 }, (_, d) => {
    const c = diatonicChord(state.key, d);
    return { roman: romanOf(c, state.key), name: chordName(c, state.key), root: c.root };
  });

  // ------------------------------------------------------------ save / load

  function serialize() {
    return {
      v: 1, key: state.key, style: state.style, tempo: state.tempo, swing: state.swing, human: state.human,
      players: state.players.map((p) => ({ id: p.id, mode: p.mode, slot: p.slot, level: p.level, harmonyMode: p.harmonyMode, bassMode: p.bassMode })),
      seq: state.seq, drums: state.drums,
      trail: trail.toJSON(),
    };
  }

  function load(d) {
    if (!d || d.v !== 1) return;
    Object.assign(state, { key: d.key, style: d.style, tempo: d.tempo, swing: d.swing, human: d.human });
    d.players?.forEach((sp) => {
      const p = player(sp.id);
      if (!p) return;
      Object.assign(p, sp);
      if (p.slot && !ENGINES[p.slot.engine]) p.slot = engineSlot('keys');
    });
    if (d.seq) state.seq = { ...createSeq(), ...d.seq, rec: false };
    if (d.trail) trail = createTrail(d.trail);
    if (d.drums?.pattern) state.drums = { ...state.drums, ...d.drums };
    state.players.forEach((p, i) => out.setPlayer(i, p));
    refreshSuggestions();
    emit();
  }

  refreshSuggestions();

  return {
    state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    keyDown, keyUp, buttonDown, buttonUp, pickDown, pickUp, setBend,
    focus, cycleMode, cycleEngine, cyclePreset, cycleFeel, toggleBassLatch, setPlaying,
    knob, knobValue, knobLabel, knobText,
    seqSelect, seqSet, seqClear, seqAuto, toggleMetronome,
    historyBack, historyForward, historyGo,
    get trail() { return trail; },
    setPattern, toggleDrumStep, generateDrums,
    step, stepDur,
    screenModel, chordKeyLabels, serialize, load,
    chordName: (c) => chordName(c, state.key),
  };
}
