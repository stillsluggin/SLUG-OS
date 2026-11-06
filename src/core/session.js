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
import { ENGINES, ENGINE_IDS, engineSlot, fixSlot } from './engines.js';
import { PLAYER_IDS, PLAYER_NAMES, MODES, HARMONY_MODES, BASS_MODES, harmonyEvents, bassEvents, melodyEvents, soloEvents, plateNotes } from './players.js';
import { bassRoot } from './bass.js';
import { drumEvents, generateBoomBap, generateBeat, LANES } from './drums.js';
import { createSeq, seqPosition, seqChordAt, hasChords, autoFill } from './chordSeq.js';
import { KEYS, KNOBS, BEND_INFO } from './controls.js';
import { createTrail } from './trail.js';
import { chordMapper, noteMapper } from './transpose.js';
import { PART_PLAYERS, REC_MODES, captureChords, captureNotes, mergePart, notesIn, emptyParts, cloneParts, snap16 } from './capture.js';

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
    morph: false, // knobs A/B show the MORPH pair
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
    drums: { pattern: generateBoomBap(88, rng), range: [80, 95], auto: true }, // auto: the beat was generated, not edited
    keySelect: false,
    pressed: new Set(),
    buttonsHeld: new Set(),
    toast: null,
    parts: emptyParts(), // recorded MELODY / BASS / SOLOIST parts
    partBeats: 16, // part loop length when the chord sequencer is empty
    recMode: 'OVERDUB',
    undoLabel: null,
  };
  const chordStack = []; // held chord sources
  const plateStack = []; // held plate keys {index, midi, player}
  let held = 0;
  let chordStart = false;
  let keyChosenWhileHeld = false;
  const mem = { bass: {}, melody: {}, soloist: {} };
  let trail = createTrail(); // Chord History

  // ---- Always-on listening for CAPTURE. Events are kept in "segments": a new
  // segment starts whenever the band starts or stops, because the beat count
  // restarts there.
  const listen = [{ chords: [], notes: [] }];
  const seg = () => listen[listen.length - 1];
  const newSegment = () => { listen.push({ chords: [], notes: [] }); if (listen.length > 3) listen.shift(); };
  let clockRef = null; // { step, time } of the last clock step while playing
  /** Where we are now, in beats (band clock while playing, the tempo while stopped). */
  function beatNow() {
    const t = out.now();
    if (state.playing && clockRef) return (clockRef.step + (t - clockRef.time) / stepDur()) / 4;
    return t / (60 / state.tempo);
  }
  const heldNotes = new Map(); // plate key -> logged note (to fill in its length)
  const undoStack = [];
  const snapshot = (label) => ({ label, seq: JSON.parse(JSON.stringify(state.seq)), parts: cloneParts(state.parts), partBeats: state.partBeats, drums: JSON.parse(JSON.stringify(state.drums.pattern)) });
  function pushUndo(label) {
    undoStack.push(snapshot(label));
    if (undoStack.length > 20) undoStack.shift();
    state.undoLabel = label;
  }
  // ---- Live recording into parts (REC on + band playing)
  let passStart = null; // snapshot at the start of the loop pass being recorded
  let passDirty = false; // something was recorded in this pass
  let take = 0; // one REC on..off is a "take"; REPLACE never erases notes from the current take
  const replacing = new Set(); // players whose old part REPLACE is wiping (from your first new note)
  const liveNotes = new Map(); // plate key -> recorded part note (to set its length)

  function setRec(on) {
    if (on === state.seq.rec) return;
    if (on) {
      state.seq.rec = true;
      state.seq.on = true;
      take++;
      replacing.clear();
      passStart = snapshot('PASS');
      passDirty = false;
      toast(`● REC · ${state.recMode}`);
    } else {
      endPass();
      state.seq.rec = false;
      passStart = null;
      toast('REC OFF');
    }
    emit();
  }

  /** Close the current pass: if anything was recorded, it becomes one UNDO step. */
  function endPass() {
    if (passDirty && passStart) { undoStack.push(passStart); if (undoStack.length > 20) undoStack.shift(); state.undoLabel = 'PASS'; }
    // Notes recorded in the pass now play every loop like the rest.
    for (const id of PART_PLAYERS) for (const n of state.parts[id]) delete n.fresh;
    passStart = state.seq.rec ? snapshot('PASS') : null;
    passDirty = false;
  }

  /** A muted player you record into becomes FREE, so you hear your part. */
  function unmute(id) {
    const p = player(id);
    if (p.mode === 'MUTE') { p.mode = 'FREE'; syncPlayer(id); }
  }

  function toggleRecMode() {
    state.recMode = state.recMode === 'OVERDUB' ? 'REPLACE' : 'OVERDUB';
    replacing.clear();
    take++; // a new take: REPLACE replaces everything recorded before this switch
    toast(state.recMode === 'OVERDUB' ? 'OVERDUB · LAYER ON TOP' : 'REPLACE · NEW NOTES WIPE THE OLD');
    emit();
  }

  /** Write a note you just played into the player's part (REC on, band playing). */
  function recordLive(index, id, midi, vel, beat) {
    if (!state.seq.rec || !state.playing || !PART_PLAYERS.includes(id)) return;
    unmute(id);
    const loop = partLoopBeats();
    const pos = ((snap16(beat) % loop) + loop) % loop;
    const loopNo = Math.floor(snap16(beat) / loop);
    if (state.recMode === 'REPLACE' && !replacing.has(id)) {
      replacing.add(id);
      // From your first note on, the old notes go as the loop passes; wipe this spot now.
      state.parts[id] = state.parts[id].filter((n) => n.take === take || Math.abs(n.pos - pos) > 0.01);
    }
    const note = { pos, midi, vel, dur: 0.25, take, loop: loopNo, fresh: true };
    state.parts[id] = state.parts[id].filter((n) => !(n.take === take && n.pos === pos && n.midi === midi));
    state.parts[id].push(note);
    state.parts[id].sort((a, b) => a.pos - b.pos);
    liveNotes.set(index, { note, beat, player: id });
    passDirty = true;
    emit();
  }

  /** REPLACE: wipe old notes of players you're replacing as the playhead passes them. */
  function replaceSweep(b0) {
    for (const id of replacing) {
      const before = state.parts[id].length;
      state.parts[id] = state.parts[id].filter((n) => n.take === take || n.pos < b0 - 1e-6 || n.pos >= b0 + 0.25 - 1e-6);
      if (state.parts[id].length !== before) passDirty = true;
    }
  }

  const hasPart = (id) => PART_PLAYERS.includes(id) && state.parts[id].length > 0;
  const partLoopBeats = () => (state.seq.on && hasChords(state.seq) ? state.seq.length * state.seq.stepBeats : state.partBeats);
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
      if (state.seq.rec && state.playing) { state.seq.steps[state.seqIndex] = chord; passDirty = true; }
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
      if (bass && !hasPart('bass') && (fresh || newBass !== oldBass)) {
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
    logChord();
    trail.push({
      chord: { ...state.chord, ext: [...state.chord.ext] },
      voicing: [...state.voicing],
      name: chordName(state.chord, state.key),
      roman: romanOf(state.chord, state.key),
    });
  }

  /** Note the chord for CAPTURE (with its time in beats). */
  function logChord() {
    const c = seg().chords;
    c.push({ beat: beatNow(), chord: { ...state.chord, ext: [...state.chord.ext] }, name: chordName(state.chord, state.key) });
    if (c.length > 400) c.shift();
  }

  /** Play a chord from the history again, exactly as it was. */
  function replay(entry) {
    if (!entry) return false;
    chordStack.length = 0;
    held = 0;
    setBase({ ...entry.chord, ext: [...entry.chord.ext] });
    refresh({ fresh: true, vel: 0.8, voicing: entry.voicing });
    if (state.chord) logChord();
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
      // REC + band playing: drum hits overdub into the drum pattern, snapped to 16ths.
      if (state.seq.rec && state.playing) {
        const st16 = ((Math.round(beatNow() * 4) % 16) + 16) % 16;
        const row = state.drums.pattern[lanes[pos]];
        row[st16] = Math.max(row[st16], pos >= 6 ? 1 : 2);
        state.drums.auto = false;
        passDirty = true;
        emit();
      }
      return;
    }
    const notes = plateNotes(p.id, harmonyNow(), state.key);
    const midi = notes[Math.min(pos, notes.length - 1)];
    const mine = plateStack.filter((e) => e.player === p.id);
    const prev = MONO.has(p.id) && mine.length ? mine[mine.length - 1].midi : null;
    plateStack.push({ index, midi, player: p.id });
    out.noteOn(p.id, midi, vel, { time: out.now(), glide: prev != null, from: prev });
    hits([p.id], out.now());
    logNote(index, p.id, midi, vel);
  }

  /** Note a played note for CAPTURE. Mono players end the previous note here. */
  function logNote(index, id, midi, vel) {
    if (!PART_PLAYERS.includes(id)) return;
    const b = beatNow();
    if (MONO.has(id)) for (const [k, n] of heldNotes) if (n.player === id) { n.dur = b - n.beat; heldNotes.delete(k); }
    const note = { player: id, midi, vel, beat: b, dur: null };
    seg().notes.push(note);
    if (seg().notes.length > 800) seg().notes.shift();
    heldNotes.set(index, note);
    if (MONO.has(id)) for (const [k, l] of [...liveNotes]) if (l.player === id && k !== index) endLive(k, b);
    recordLive(index, id, midi, vel, b);
  }
  function endNote(index) {
    const n = heldNotes.get(index);
    if (n) { n.dur = beatNow() - n.beat; heldNotes.delete(index); }
    endLive(index, beatNow());
  }
  function endLive(index, b) {
    const l = liveNotes.get(index);
    if (!l) return;
    l.note.dur = Math.max(0.25, snap16(b - l.beat));
    liveNotes.delete(index);
  }

  function plateUp(index) {
    const i = plateStack.findIndex((e) => e.index === index);
    if (i < 0) return;
    const [gone] = plateStack.splice(i, 1);
    endNote(index);
    const mine = plateStack.filter((e) => e.player === gone.player);
    if (MONO.has(gone.player) && mine.length) {
      const back = mine[mine.length - 1];
      out.noteOn(gone.player, back.midi, 0.6, { time: out.now(), glide: true, from: gone.midi });
      logNote(back.index, gone.player, back.midi, 0.6);
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
    const newKey = pc === state.key.tonic
      ? { tonic: pc, mode: state.key.mode === 'minor' ? 'major' : 'minor' }
      : { tonic: pc, mode: state.key.mode };
    keyChosenWhileHeld = true;
    if (!state.buttonsHeld.has('key')) state.keySelect = false;
    setKey(newKey);
  }

  /**
   * Change key and TRANSPOSE THE WHOLE PROJECT with it: the chord playing, the
   * chord sequencer, Chord History, the recorded parts and what CAPTURE has
   * heard. Drums and sampler pads are left alone (they aren't in a key).
   */
  function setKey(newKey) {
    const oldKey = state.key;
    if (oldKey.tonic === newKey.tonic && oldKey.mode === newKey.mode) return;
    const mc = chordMapper(oldKey, newKey);
    const mn = noteMapper(oldKey, newKey);
    state.key = newKey;
    state.seq.steps = state.seq.steps.map(mc);
    state.history = state.history.map(mc);
    for (const e of trail.entries) {
      e.chord = mc(e.chord);
      e.voicing = e.voicing.map(mn);
      e.name = chordName(e.chord, newKey);
      e.roman = romanOf(e.chord, newKey);
    }
    for (const id of PART_PLAYERS) for (const n of state.parts[id]) n.midi = mn(n.midi);
    for (const g of listen) {
      for (const c of g.chords) { c.chord = mc(c.chord); c.name = chordName(c.chord, newKey); }
      for (const n of g.notes) n.midi = mn(n.midi);
    }
    for (const e of chordStack) e.chord = mc(e.chord);
    if (state.base) {
      state.base = mc(state.base);
      state.voicing = state.voicing.map(mn);
      refresh({ fresh: true, vel: 0.7, quiet: state.playing, voicing: state.voicing });
    }
    refreshSuggestions();
    toast(`${keyName(newKey).toUpperCase()} · TRANSPOSED`);
    emit();
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
      case 'rec': setRec(!state.seq.rec); break;
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
    if (state.seq.rec) endPass();
    state.playing = on;
    newSegment();
    clockRef = null;
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

  /** MORPH: knobs A and B switch to the engine's two MORPH knobs (and back). */
  function toggleMorph() {
    state.morph = !state.morph;
    const p = state.players[state.focus];
    toast(state.morph && p.slot ? `MORPH · ${ENGINES[p.slot.engine].morph.join(' + ')}` : 'MAIN KNOBS');
    emit();
  }

  /** Set the tempo directly (the BPM pop-up). 40..220 BPM. */
  function setTempo(bpm) {
    const t = Math.round(Math.max(40, Math.min(220, Number(bpm) || state.tempo)));
    if (t === state.tempo) return;
    state.tempo = t;
    emit();
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

  /**
   * Switching sound: cut whatever the old sound was still holding, and if a
   * chord (or bass note) is being held, strike it again with the new sound.
   */
  function swapSound(id) {
    const t = out.now();
    out.cutPlayer(id, t);
    if (state.playing || !state.chord || !follows(id)) return;
    if (id === 'harmony') state.voicing.forEach((n, k) => out.noteOn('harmony', n, 0.75, { time: t + 0.02 + k * 0.007 }));
    if (id === 'bass' && state.bassNote != null) out.noteOn('bass', state.bassNote, 0.75, { time: t + 0.02 });
  }

  function cycleEngine(i, dir = 1) {
    const p = state.players[i];
    if (!p.slot) return;
    p.slot = engineSlot(cycle(ENGINE_IDS, p.slot.engine, dir), 0);
    syncPlayer(p.id);
    swapSound(p.id);
    toast(`${PLAYER_NAMES[p.id]} · ${ENGINES[p.slot.engine].name}`);
    emit();
  }

  function cyclePreset(i, dir = 1) {
    const p = state.players[i];
    if (!p.slot) return;
    const n = ENGINES[p.slot.engine].presets.length;
    p.slot = engineSlot(p.slot.engine, (p.slot.preset + dir + n) % n);
    syncPlayer(p.id);
    swapSound(p.id);
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
      case 'tempo': return Math.max(0, Math.min(1, (state.tempo - 60) / 90));
      case 'swing': return state.swing;
      case 'human': return state.human;
      case 'style': return (STYLE_IDS.indexOf(state.style) + 0.5) / STYLE_IDS.length;
      case 'a': return p.slot ? p.slot.knobs[state.morph ? 2 : 0] ?? 0 : 0;
      case 'b': return p.slot ? p.slot.knobs[state.morph ? 3 : 1] ?? 0 : 0;
      case 'level': return p.level;
    }
    return 0;
  }

  function knobLabel(i) {
    const p = state.players[state.focus];
    const id = KNOBS[i].id;
    if ((id === 'a' || id === 'b') && p.slot) return (state.morph ? ENGINES[p.slot.engine].morph : ENGINES[p.slot.engine].knobs)[id === 'a' ? 0 : 1];
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
        if (s !== state.style) {
          state.style = s;
          refreshSuggestions();
          // A generated beat follows the style; a beat you edited stays.
          if (state.drums.auto) state.drums.pattern = generateBeat(s, state.tempo, rng);
        }
        break;
      }
      case 'a': case 'b':
        if (!p.slot) return;
        p.slot.knobs[(KNOBS[i].id === 'a' ? 0 : 1) + (state.morph ? 2 : 0)] = v;
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

  function setPattern(pattern) { state.drums.pattern = pattern; state.drums.auto = false; emit(); }
  function toggleDrumStep(lane, s) {
    const row = state.drums.pattern[lane];
    row[s] = (row[s] + 1) % 3;
    state.drums.auto = false; // your beat now: style changes won't replace it
    emit();
  }
  function generateDrums({ useRange = false } = {}) {
    if (useRange) {
      const [lo, hi] = state.drums.range;
      state.tempo = Math.round(lo + rng() * (hi - lo));
    }
    state.drums.pattern = generateBeat(state.style, state.tempo, rng);
    state.drums.auto = true;
    toast(`NEW BEAT · ${STYLE_LABELS[state.style]} · ${state.tempo} BPM`);
    emit();
  }

  // ------------------------------------------------------------ the clock

  function step(n, time) {
    state.step = n;
    // Metronome: a click on every beat, accented on beat 1.
    if (state.metronome && n % 4 === 0) out.click(n % 16 === 0, time);
    if (!state.playing) { emit('step'); return; }
    clockRef = { step: n, time };
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
    // A player with a recorded part plays your part instead of improvising.
    if (follows('bass') && !hasPart('bass')) evs.push(...bassEvents(s, ctx, mem.bass));
    if (follows('melody') && !hasPart('melody')) evs.push(...melodyEvents(s, ctx, mem.melody));
    if (follows('soloist') && !hasPart('soloist')) evs.push(...soloEvents(s, ctx, mem.soloist));
    partEvents(n, time, sd, played);
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

  /** Play the recorded parts' notes that fall in this 16th. */
  function partEvents(n, time, sd, played) {
    const loop = partLoopBeats();
    const b0 = (n / 4) % loop;
    const loopNo = Math.floor(n / 4 / loop);
    if (state.seq.rec) {
      if (b0 === 0 && n > 0) endPass(); // each loop you record is one pass (one UNDO)
      if (state.recMode === 'REPLACE') replaceSweep(b0);
    }
    for (const id of PART_PLAYERS) {
      if (player(id).mode === 'MUTE' || !state.parts[id].length) continue;
      for (const nt of notesIn(state.parts[id], b0, b0 + 0.25)) {
        if (nt.loop === loopNo && nt.fresh) continue; // just recorded live in this pass: you already heard it
        out.play(id, nt.midi, nt.vel, time + (nt.pos - b0) * 4 * sd, nt.dur * 4 * sd * 0.95);
        if (!played.includes(id)) played.push(id);
      }
    }
  }

  // ------------------------------------------------------------ capture & undo

  /**
   * CAPTURE: take what you just played (chords + MELODY / BASS / SOLOIST notes),
   * snap it to the grid and the BPM, and drop it into the chord sequencer and
   * the players' parts. One UNDO puts everything back.
   */
  function capture() {
    const src = [...listen].reverse().find((g) => g.chords.length || g.notes.length);
    if (!src) { toast('NOTHING TO CAPTURE YET'); return false; }
    pushUndo('CAPTURE');
    const res = captureChords(src.chords);
    let startBeat = null;
    if (res) {
      state.seq = { ...state.seq, steps: res.steps, length: res.length, stepBeats: res.stepBeats, on: true };
      startBeat = res.startBeat;
    }
    const loop = res ? res.loopBeats : state.partBeats;
    const now = beatNow();
    const notes = src.notes.map((nt) => ({ ...nt, dur: nt.dur ?? now - nt.beat }));
    const parts = captureNotes(notes, loop, startBeat);
    if (!res) state.partBeats = loop;
    let count = 0;
    for (const [id, add] of Object.entries(parts)) { state.parts[id] = mergePart(state.parts[id], add, state.recMode); count += add.length; unmute(id); }
    const chords = res ? res.steps.filter(Boolean).length : 0;
    toast(`CAPTURED · ${chords} CHORD${chords === 1 ? '' : 'S'}${count ? ` · ${count} NOTES` : ''}`);
    emit();
    return true;
  }

  /** UNDO the last capture or recorded pass. */
  function undo() {
    // Recording now? Undo the pass in progress first.
    if (state.seq.rec && passDirty && passStart) {
      restore(passStart);
      passDirty = false;
      replacing.clear();
      take++;
      toast('UNDO · THIS PASS');
      emit();
      return true;
    }
    const snap = undoStack.pop();
    if (!snap) { toast('NOTHING TO UNDO'); return false; }
    restore(snap);
    if (state.seq.rec) passStart = snapshot('PASS');
    state.undoLabel = undoStack.length ? undoStack[undoStack.length - 1].label : null;
    toast(`UNDO · ${snap.label}`);
    emit();
    return true;
  }

  function restore(snap) {
    state.seq = { ...JSON.parse(JSON.stringify(snap.seq)), rec: state.seq.rec };
    state.parts = cloneParts(snap.parts);
    state.partBeats = snap.partBeats;
    if (snap.drums) state.drums.pattern = JSON.parse(JSON.stringify(snap.drums));
  }

  function clearPart(id) {
    if (!state.parts[id]?.length) return;
    pushUndo(`CLEAR ${PLAYER_NAMES[id]}`);
    state.parts[id] = [];
    emit();
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
      parts: state.parts, partBeats: state.partBeats, recMode: state.recMode,
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
      fixSlot(p.slot);
    });
    if (d.seq) state.seq = { ...createSeq(), ...d.seq, rec: false };
    if (d.trail) trail = createTrail(d.trail);
    if (d.parts) {
      state.parts = { ...emptyParts(), ...cloneParts(d.parts) };
      for (const id of PART_PLAYERS) for (const n of state.parts[id]) delete n.fresh;
    }
    if (d.partBeats) state.partBeats = d.partBeats;
    if (REC_MODES.includes(d.recMode)) state.recMode = d.recMode;
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
    seqSelect, seqSet, seqClear, seqAuto, toggleMetronome, setKey, setTempo, toggleMorph,
    historyBack, historyForward, historyGo, capture, undo, clearPart, setRec, toggleRecMode,
    partLoopBeats, get canUndo() { return undoStack.length > 0 || (state.seq.rec && passDirty); },
    get trail() { return trail; },
    setPattern, toggleDrumStep, generateDrums,
    step, stepDur,
    screenModel, chordKeyLabels, serialize, load,
    chordName: (c) => chordName(c, state.key),
  };
}
