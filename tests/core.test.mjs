// Music-brain tests: node --test tests/core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { diatonicChord, applyBends, chordName, voiceChord, makeChord, MAX_CHORD_NOTES, chordPcs } from '../src/core/chord.js';
import { suggestNext, TAGS, STYLE_IDS } from '../src/core/nextChord.js';
import { inKeyPcs } from '../src/core/theory.js';
import { createSession } from '../src/core/session.js';
import { KEYS } from '../src/core/controls.js';
import { BASS_MODES, bassRoot, walkingBar } from '../src/core/bass.js';
import { generateBoomBap, LANES } from '../src/core/drums.js';
import { createSeq, autoFill, seqPosition } from '../src/core/chordSeq.js';
import { equalChops, markersToChops, detectTransients, guessLoopBpm } from '../src/core/chops.js';
import { classify, buildKits, bpmFromName } from '../src/core/kits.js';
import { ENGINES, ENGINE_IDS } from '../src/core/engines.js';

const C = { tonic: 0, mode: 'major' };
const Dm = { tonic: 2, mode: 'minor' };
let seed = 1;
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function fakeOut() {
  const log = [];
  const rec = (name) => (...a) => log.push([name, ...a]);
  return { log, now: () => 0, noteOn: rec('on'), noteOff: rec('off'), play: rec('play'), releasePlayer: rec('rel'), cutPlayer: rec('cut'), drum: rec('drum'), setPlayer() {}, bar: rec('bar'), transport: rec('transport'), metronome: rec('metro'), click: rec('click') };
}

test('chords and bends', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((d) => chordName(diatonicChord(C, d), C)), ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bm7b5']);
  const F = diatonicChord(C, 3);
  assert.equal(chordName(applyBends(F, new Set(['ninth']), C), C), 'Fmaj9');
  assert.equal(chordName(applyBends(F, new Set(['borrowed', 'seventh']), C), C), 'Fm7');
  for (const q of ['m9', '13', 'maj9#11']) assert.ok(voiceChord(makeChord(2, q)).length <= MAX_CHORD_NOTES);
});

test('next chord in key unless SURPRISE, for every style', () => {
  for (const style of STYLE_IDS) for (const key of [C, Dm]) for (let d = 0; d < 7; d++) {
    const cur = diatonicChord(key, d);
    const { best, alts } = suggestNext({ current: cur, key, style, history: [cur] });
    assert.notEqual(best.tag, 'SURPRISE');
    assert.ok(alts.length >= 3);
    for (const s of [best, ...alts]) {
      assert.ok(TAGS.includes(s.tag));
      if (s.tag !== 'SURPRISE') assert.ok(chordPcs(s.chord).every((pc) => inKeyPcs(key).has(pc)), `${s.name}`);
    }
  }
});

test('bass latch modes', () => {
  const ch = makeChord(7, 'maj7'); // G
  const v = voiceChord({ ...ch, bass: 11 });
  assert.equal(bassRoot('ROOT', { chord: ch, voicing: v, key: C }) % 12, 7);
  assert.equal(bassRoot('PEDAL', { chord: ch, voicing: v, key: C }) % 12, 0);
  assert.equal(bassRoot('SLASH', { chord: ch, voicing: v, key: C }) % 12, v[0] % 12);
  const walk = walkingBar(ch, makeChord(0, 'maj7'), C, 43, rng);
  assert.equal(walk.length, 4);
  assert.ok(Math.abs(walk[3] % 12 - 0) <= 2 || Math.abs(walk[3] % 12 - 12) <= 2, `approach ${walk}`);
  assert.equal(BASS_MODES.length, 6);
});

test('session: chord, bend, band, drums, seq, bass latch', () => {
  const out = fakeOut();
  const s = createSession(out, { rng });
  const iv = KEYS.find((k) => k.section === 'chord' && k.degree === 3).index;
  s.keyDown(iv); s.keyUp(iv);
  assert.equal(s.screenModel().chordName, 'Gm');
  assert.ok(out.log.some((e) => e[0] === 'on' && e[1] === 'harmony'));
  assert.ok(out.log.some((e) => e[0] === 'on' && e[1] === 'bass'));
  s.setBend('seventh', true);
  assert.equal(s.screenModel().chordName, 'Gm7');
  s.setBend('seventh', false);
  // Every player follows
  s.state.players.forEach((p, i) => { if (p.mode !== 'FOLLOW') s.cycleMode(i); while (s.state.players[i].mode !== 'FOLLOW') s.cycleMode(i); });
  s.buttonDown('play'); s.buttonUp('play');
  out.log.length = 0;
  for (let n = 0; n < 64; n++) s.step(n, n * 0.17);
  const by = (p) => out.log.filter((e) => e[0] === 'play' && e[1] === p).length;
  for (const p of ['harmony', 'bass', 'melody', 'soloist']) assert.ok(by(p) > 0, `${p} played`);
  assert.ok(out.log.filter((e) => e[0] === 'drum').length > 20);
  assert.ok(out.log.filter((e) => e[0] === 'bar').length === 4);
  // Bass latch off -> bass stops auto-playing
  s.toggleBassLatch();
  out.log.length = 0;
  for (let n = 64; n < 80; n++) s.step(n, n * 0.17);
  assert.equal(by('bass'), 0);
  // Walking bass
  s.toggleBassLatch();
  while (s.state.players[2].bassMode !== 'WALKING') s.cycleFeel(2);
  out.log.length = 0;
  for (let n = 80; n < 96; n++) s.step(n, n * 0.17);
  assert.equal(by('bass'), 4);
  // Sequencer AUTO drives chords
  s.seqAuto();
  const names = new Set();
  for (let n = 96; n < 96 + 64; n++) { s.step(n, n * 0.17); names.add(s.screenModel().chordName); }
  assert.ok(names.size >= 3, `seq chords ${[...names]}`);
  // save/load round trip
  const saved = JSON.parse(JSON.stringify(s.serialize()));
  const s2 = createSession(fakeOut(), { rng });
  s2.load(saved);
  assert.equal(s2.state.players[2].bassMode, 'WALKING');
});

test('strum plate plays the focused player, drummer too', () => {
  const out = fakeOut();
  const s = createSession(out, { rng });
  const plate = KEYS.filter((k) => k.section === 'plate');
  s.focus(3);
  s.keyDown(plate[2].index); s.keyDown(plate[4].index); s.keyUp(plate[4].index);
  assert.ok(out.log.filter((e) => e[0] === 'on' && e[1] === 'soloist').length >= 3, 'mono legato returns to held note');
  s.focus(4);
  s.keyDown(plate[0].index);
  assert.ok(out.log.some((e) => e[0] === 'drum' && e[1] === 'kick'));
});

test('drums, seq, chops, kits', () => {
  for (const bpm of [70, 88, 105]) {
    const p = generateBoomBap(bpm, rng);
    assert.equal(p.snare[4], 2); assert.equal(p.snare[12], 2); assert.equal(p.kick[0], 2);
    assert.deepEqual(Object.keys(p), LANES);
  }
  const seq = autoFill(createSeq(), { key: Dm, style: 'nujabes' });
  assert.ok(seq.steps.slice(0, 4).every(Boolean));
  assert.deepEqual(seqPosition(seq, 16), { index: 1, isStart: true });
  assert.equal(equalChops(0, 4, 8).length, 8);
  assert.deepEqual(markersToChops([1, 3, 2], 0, 4).map((c) => c.start), [0, 1, 2, 3]);
  const sr = 8000; const data = new Float32Array(sr * 2);
  for (const t of [0.5, 1.0, 1.5]) for (let i = 0; i < 400; i++) data[Math.floor(t * sr) + i] = Math.sin(i) * (1 - i / 400);
  const tr = detectTransients(data, sr, 0, 2);
  assert.equal(tr.length, 3, `transients ${tr}`);
  assert.equal(guessLoopBpm(2.667).bars, 1);
  assert.equal(classify('Dusty Kick 03.wav'), 'kick');
  assert.equal(classify('OH_tight.wav'), 'open');
  assert.equal(classify('closed hat.wav'), 'hat');
  assert.equal(classify('rimshot.wav'), 'rim');
  assert.equal(classify('soul loop 92bpm.wav'), 'loop');
  assert.equal(bpmFromName('soul loop 92bpm.wav'), 92);
  const kits = buildKits([{ id: 1, path: 'Crate A/kick.wav', kind: 'kick' }, { id: 2, path: 'Crate A/snare.wav', kind: 'snare' }, { id: 3, path: 'Crate B/hat.wav', kind: 'hat' }]);
  assert.deepEqual(kits.map((k) => k.name), ['Crate A', 'Crate B']);
});

test('engines: seven, two knobs each, presets', () => {
  assert.deepEqual(ENGINE_IDS, ['keys', 'analog', 'pad', 'pluck', 'shine', 'trip', 'siren']);
  for (const id of ENGINE_IDS) {
    assert.equal(ENGINES[id].knobs.length, 2);
    assert.ok(ENGINES[id].presets.length >= 3);
  }
});

test('metronome clicks every beat, accent on 1, even when stopped', () => {
  const out = fakeOut();
  const s = createSession(out, { rng });
  s.toggleMetronome();
  assert.ok(out.log.some((e) => e[0] === 'metro' && e[1] === true));
  for (let n = 0; n < 16; n++) s.step(n, n * 0.1);
  const clicks = out.log.filter((e) => e[0] === 'click');
  assert.equal(clicks.length, 4);
  assert.deepEqual(clicks.map((c) => c[1]), [true, false, false, false]);
  assert.equal(out.log.filter((e) => e[0] === 'play').length, 0, 'band stays quiet while stopped');
  s.toggleMetronome();
  out.log.length = 0;
  for (let n = 16; n < 32; n++) s.step(n, n * 0.1);
  assert.equal(out.log.filter((e) => e[0] === 'click').length, 0);
});

import { stretchSmooth, stretchBeats } from '../src/audio/dsp.js';
import { playbackPlan, emptyPad, assignSample } from '../src/core/sampler.js';

const zeroCrossRate = (d, sr) => { let z = 0; for (let i = 1; i < d.length; i++) if ((d[i - 1] < 0) !== (d[i] < 0)) z++; return (z / 2) / (d.length / sr); };

test('SMOOTH stretch keeps pitch and changes length', () => {
  const sr = 22050;
  const x = new Float32Array(sr); // 1 s of 220 Hz
  for (let i = 0; i < x.length; i++) x[i] = Math.sin((2 * Math.PI * 220 * i) / sr);
  for (const f of [0.5, 1.5, 2]) {
    const [y] = stretchSmooth([x], f, sr);
    assert.equal(y.length, Math.round(sr * f));
    const hz = zeroCrossRate(y.subarray(2000, y.length - 2000), sr);
    assert.ok(Math.abs(hz - 220) < 6, `factor ${f}: ${hz.toFixed(1)} Hz`);
  }
});

test('BEATS stretch moves hits to their new times', () => {
  const sr = 8000;
  const x = new Float32Array(sr);
  for (const t of [0, 0.25, 0.5, 0.75]) for (let i = 0; i < 200; i++) x[Math.round(t * sr) + i] = 1 - i / 200;
  const [y] = stretchBeats([x], 2, sr, [0, 0.25, 0.5, 0.75]);
  assert.equal(y.length, sr * 2);
  for (const t of [0, 0.5, 1.0, 1.5]) assert.ok(y[Math.round(t * sr) + 10] > 0.8, `hit at ${t}s`);
  assert.ok(Math.abs(y[Math.round(0.3 * sr)]) < 0.01, 'gap between hits when slowed');
});

test('pitch / warp planner', () => {
  const pad = { ...emptyPad(0), pitch: 12 };
  assert.deepEqual(playbackPlan(pad, 90), { algo: 'none', factor: 1, rate: 2 }); // classic resample
  const kt = playbackPlan({ ...pad, pitchMode: 'KEEP TIME' }, 90);
  assert.equal(kt.algo, 'smooth'); assert.equal(kt.factor / kt.rate, 1); // same length, higher pitch
  const warp = playbackPlan({ ...emptyPad(0), warp: 'BEATS', warpToBpm: true, srcBpm: 90 }, 120);
  assert.equal(warp.algo, 'beats'); assert.equal(warp.factor, 0.75); assert.equal(warp.rate, 1);
  const tape = playbackPlan({ ...emptyPad(0), warpToBpm: true, srcBpm: 90 }, 120);
  assert.equal(+tape.rate.toFixed(3), 1.333); // repitch: faster and higher
  assert.equal(assignSample(emptyPad(0), { sampleId: 'x', name: 'loop 92bpm', duration: 2 }).srcBpm, 92);
});

import { XY_EFFECTS, SHELL_EFFECTS, DEFAULT_COMBOS, repeatBeats, snapBack, comboName, tapeStopSeconds } from '../src/core/xy.js';
import { MAKERS } from '../src/audio/xyfx.js';

test('shell shock: every effect has a maker, names, tape stop timing, snap back', () => {
  assert.equal(XY_EFFECTS.length, 18);
  for (const id of ['filter', 'isolator', 'looper', 'phaser', 'flanger', 'delay', 'tapestop', 'stutter', 'crusher',
    'lofi', 'wobble', 'saturate', 'wash', 'chorus', 'ringmod', 'dive', 'gate', 'reverse']) assert.ok(XY_EFFECTS.includes(id), id);
  for (const e of SHELL_EFFECTS) {
    assert.equal(typeof MAKERS[e.id], 'function', `maker for ${e.id}`);
    assert.ok(e.label && e.hint && e.a.length && e.b.length, `metadata for ${e.id}`);
  }
  assert.ok(DEFAULT_COMBOS.every((c) => XY_EFFECTS.includes(c.x) && XY_EFFECTS.includes(c.y) && c.name));
  // Names: 3 words, stable for the same pairing, different with the dice
  const n = comboName('tapestop', 'dive');
  assert.equal(n.split(' ').length, 3);
  assert.equal(comboName('tapestop', 'dive'), n);
  const rolls = new Set([0, 1, 2, 3, 4, 5].map((r) => comboName('tapestop', 'dive', r)));
  assert.ok(rolls.size >= 4, [...rolls].join(' / '));
  assert.ok(comboName('filter', 'filter').split(' ').length === 3, 'same effect on both axes is fine');
  // Tape stop: slow wind-down near the start, instant at the end
  assert.ok(tapeStopSeconds(0.06) > 2.5);
  assert.ok(tapeStopSeconds(1) < 0.05);
  assert.ok(tapeStopSeconds(0.5) < tapeStopSeconds(0.3));
  assert.equal(repeatBeats(0.1), 1);
  assert.equal(snapBack(0.8, 0.3), 0);
});

import { createTrail } from '../src/core/trail.js';

test('chord history: back, forward, replay exact voicing, bends remembered', () => {
  const out = fakeOut();
  const s = createSession(out, { rng });
  const k = (deg) => KEYS.find((x) => x.section === 'chord' && x.degree === deg).index;
  for (const d of [0, 3, 4]) { s.keyDown(k(d)); s.keyUp(k(d)); }
  s.setBend('seventh', true); s.setBend('seventh', false); // Am -> Am7 is remembered
  assert.deepEqual(s.trail.entries.map((e) => e.name), ['Dm', 'Gm', 'Am', 'Am7']);
  const gmVoicing = s.trail.entries[1].voicing;
  s.historyBack(); assert.equal(s.screenModel().chordName, 'Am');
  s.historyBack(); assert.equal(s.screenModel().chordName, 'Gm');
  assert.deepEqual(s.state.voicing, gmVoicing, 'exact voicing replayed');
  // Next Chord works from the chord you went back to
  assert.equal(s.screenModel().best.name, 'C9');
  s.historyForward(); assert.equal(s.screenModel().chordName, 'Am');
  // Playing something new while back in history adds it at the end; nothing is lost
  s.historyBack();
  s.keyDown(k(5)); s.keyUp(k(5));
  assert.deepEqual(s.trail.entries.map((e) => e.name), ['Dm', 'Gm', 'Am', 'Am7', 'Bb']);
  s.historyGo(0); assert.equal(s.screenModel().chordName, 'Dm');
  // saved with the session
  const s2 = createSession(fakeOut(), { rng });
  s2.load(JSON.parse(JSON.stringify(s.serialize())));
  assert.equal(s2.trail.entries.length, 5);
  const t = createTrail();
  assert.equal(t.back(), null);
});

import { captureChords, captureNotes, mergePart } from '../src/core/capture.js';

test('capture: chords snap to a grid, newest part that fits', () => {
  const ch = (name) => ({ name, chord: makeChord(0, 'maj') });
  // one chord per bar, slightly sloppy timing
  let r = captureChords([0, 4.1, 7.9, 12.05].map((b, i) => ({ beat: b, ...ch(`c${i}`) })));
  assert.equal(r.stepBeats, 4); assert.equal(r.length, 4);
  assert.deepEqual(r.steps.slice(0, 4).map((c) => !!c), [true, true, true, true]);
  // chords every 2 beats need a 2-beat grid
  r = captureChords([0, 2, 4, 6].map((b, i) => ({ beat: b, ...ch(`c${i}`) })));
  assert.equal(r.stepBeats, 2); assert.equal(r.length, 4);
  // 20 bars of chords: keep the newest 16 steps
  r = captureChords(Array.from({ length: 20 }, (_, i) => ({ beat: i * 4, ...ch(`c${i}`) })));
  assert.equal(r.length, 16); assert.equal(r.startBeat, 16);
  // repeated chord merges
  r = captureChords([{ beat: 0, ...ch('a') }, { beat: 4, ...ch('a') }, { beat: 8, ...ch('b') }]);
  assert.equal(r.steps.filter(Boolean).length, 2);
  // a chord touched for a moment (e.g. two keys at once) doesn't wreck the grid
  r = captureChords([{ beat: 0, ...ch('a') }, { beat: 0.05, ...ch('b') }, { beat: 4, ...ch('c') }, { beat: 8, ...ch('d') }, { beat: 12, ...ch('e') }]);
  assert.equal(r.stepBeats, 4); assert.equal(r.length, 4);
  assert.deepEqual(r.steps.slice(0, 4).map((c) => !!c), [true, true, true, true]);
  // notes snap to 16ths, inside the loop
  const parts = captureNotes([{ player: 'bass', beat: 0.02, midi: 40, vel: 0.8, dur: 0.9 }, { player: 'melody', beat: 2.49, midi: 72, vel: 0.7, dur: 0.3 }, { player: 'bass', beat: 20, midi: 41, vel: 1, dur: 1 }], 16, 0);
  assert.deepEqual(parts.bass.map((n) => n.pos), [0]);
  assert.deepEqual(parts.melody.map((n) => [n.pos, n.dur]), [[2.5, 0.25]]);
  assert.equal(mergePart([{ pos: 0, midi: 40 }], [{ pos: 1, midi: 41 }], 'OVERDUB').length, 2);
  assert.equal(mergePart([{ pos: 0, midi: 40 }], [{ pos: 1, midi: 41 }], 'REPLACE').length, 1);
});

test('session capture: stopped jam -> sequencer + parts, parts play back, undo', () => {
  const out = fakeOut();
  let now = 0;
  out.now = () => now;
  const s = createSession(out, { rng });
  const beat = 60 / s.state.tempo;
  const k = (deg) => KEYS.find((x) => x.section === 'chord' && x.degree === deg).index;
  const plate = KEYS.filter((x) => x.section === 'plate');
  // Four chords, one bar each, plus some bass notes on the strum plate
  s.focus(2); s.toggleBassLatch(); // bass FREE
  [0, 3, 4, 0].forEach((d, i) => {
    now = (i * 4 + 0.05) * beat; s.keyDown(k(d)); s.keyUp(k(d));
    now = (i * 4 + 0.1) * beat; s.keyDown(plate[i].index);
    now = (i * 4 + 1) * beat; s.keyUp(plate[i].index);
  });
  // Dm Gm Am Dm: the repeated Dm is a new step (not consecutive)
  assert.ok(s.capture());
  assert.equal(s.state.seq.length, 4);
  assert.equal(s.state.seq.stepBeats, 4);
  assert.deepEqual(s.state.seq.steps.slice(0, 4).map((c) => s.chordName(c)), ['Dm', 'Gm', 'Am', 'Dm']);
  assert.equal(s.state.parts.bass.length, 4);
  assert.deepEqual(s.state.parts.bass.map((n) => n.pos), [0, 4, 8, 12]);
  // The bass part plays back when the band runs
  s.setPlaying(true);
  out.log.length = 0;
  for (let n = 0; n < 64; n++) s.step(n, n * 0.17);
  assert.equal(out.log.filter((e) => e[0] === 'play' && e[1] === 'bass').length, 4);
  // Undo puts it all back
  assert.ok(s.undo());
  assert.equal(s.state.parts.bass.length, 0);
  assert.equal(s.state.seq.steps.filter(Boolean).length, 0);
});

test('live recording: OVERDUB layers, REPLACE wipes from your first note, UNDO per pass', () => {
  const out = fakeOut();
  let now = 0;
  out.now = () => now;
  const s = createSession(out, { rng });
  const sd = s.stepDur();
  const plate = KEYS.filter((x) => x.section === 'plate').map((x) => x.index);
  s.focus(1); // MELODY (starts muted)
  s.setPlaying(true);
  s.setRec(true);
  assert.equal(s.state.recMode, 'OVERDUB');
  // Run the clock; `hits` = { step: plateKey } notes to play at those steps (held 2 steps).
  const run = (from, to, hits = {}) => {
    for (let n = from; n < to; n++) {
      now = n * sd;
      s.step(n, n * sd);
      if (hits[n] != null) s.keyDown(plate[hits[n]]);
      if (hits[n - 2] != null) s.keyUp(plate[hits[n - 2]]);
    }
  };
  const loopSteps = s.partLoopBeats() * 4; // 16 beats = 64 steps
  run(0, loopSteps, { 0: 0, 16: 2 });
  assert.equal(s.state.parts.melody.length, 2, 'pass 1: two notes');
  assert.equal(s.state.players[1].mode, 'FREE', 'muted player becomes FREE');
  run(loopSteps, loopSteps * 2, { [loopSteps + 32]: 4 });
  assert.equal(s.state.parts.melody.length, 3, 'pass 2 overdubs on top');
  // The part plays back next loop
  out.log.length = 0;
  run(loopSteps * 2, loopSteps * 3);
  assert.equal(out.log.filter((e) => e[0] === 'play' && e[1] === 'melody').length, 3);
  // UNDO takes back the last pass only
  assert.ok(s.undo());
  assert.equal(s.state.parts.melody.length, 2);
  // REPLACE: one new note; after a full loop only it is left
  s.toggleRecMode();
  run(loopSteps * 3, loopSteps * 4, { [loopSteps * 3 + 8]: 1 });
  run(loopSteps * 4, loopSteps * 5);
  assert.deepEqual(s.state.parts.melody.map((n) => n.pos), [2]);
  // REPLACE does nothing until you play: a quiet loop keeps the part
  s.setRec(false); s.setRec(true);
  run(loopSteps * 5, loopSteps * 6);
  assert.equal(s.state.parts.melody.length, 1);
  // UNDO the replace pass brings the old notes back
  assert.ok(s.undo());
  assert.equal(s.state.parts.melody.length, 2);
});

test('fix: changing preset or engine cuts the old sound and replays the held chord', () => {
  const out = fakeOut();
  const s = createSession(out, { rng });
  s.keyDown(5); s.keyUp(5); // chord held (latched), band stopped
  out.log.length = 0;
  s.cyclePreset(0);
  assert.ok(out.log.some((e) => e[0] === 'cut' && e[1] === 'harmony'), 'old sound cut');
  assert.equal(out.log.filter((e) => e[0] === 'on' && e[1] === 'harmony').length, s.state.voicing.length, 'chord replayed with the new sound');
  out.log.length = 0;
  s.cycleEngine(2);
  assert.ok(out.log.some((e) => e[0] === 'cut' && e[1] === 'bass'));
  assert.ok(out.log.some((e) => e[0] === 'on' && e[1] === 'bass'));
});

test('fix: notes played over the chords (HARMONY focused) and drum hits overdub while recording', () => {
  const out = fakeOut();
  let now = 0;
  out.now = () => now;
  const s = createSession(out, { rng });
  const sd = s.stepDur();
  const plate = KEYS.filter((x) => x.section === 'plate').map((x) => x.index);
  s.keyDown(5); s.keyUp(5);
  s.setPlaying(true);
  s.setRec(true);
  assert.equal(s.state.focus, 0, 'HARMONY is focused by default');
  const run = (from, to, fn) => { for (let n = from; n < to; n++) { now = n * sd; s.step(n, n * sd); fn && fn(n); } };
  run(0, 64, (n) => { if (n === 8 || n === 24) s.keyDown(plate[3]); if (n === 10 || n === 26) s.keyUp(plate[3]); });
  assert.equal(s.state.parts.harmony.length, 2, 'harmony notes recorded');
  // They play back on top of the chords
  out.log.length = 0;
  run(64, 128);
  const harmonyPlays = out.log.filter((e) => e[0] === 'play' && e[1] === 'harmony');
  assert.ok(harmonyPlays.length > 2, 'chords still play');
  assert.ok(harmonyPlays.some((e) => e[2] === s.state.parts.harmony[0].midi), 'and the recorded note plays too');
  // Drummer: hits land in the drum pattern
  s.setPattern(Object.fromEntries(Object.keys(s.state.drums.pattern).map((l) => [l, Array(16).fill(0)])));
  s.focus(4);
  run(128, 128 + 6, (n) => { if (n === 128 + 4) { s.keyDown(plate[0]); s.keyUp(plate[0]); } });
  assert.equal(s.state.drums.pattern.kick[4], 2, 'kick overdubbed on step 5');
  assert.ok(s.undo());
  assert.equal(s.state.drums.pattern.kick[4], 0, 'undo takes the drum pass back');
});

import { chordMapper, noteMapper, keyShift } from '../src/core/transpose.js';

test('transpose: changing key moves the whole project', () => {
  assert.equal(keyShift(2, 5), 3);
  assert.equal(keyShift(2, 11), -3);
  const out = fakeOut();
  const s = createSession(out, { rng });
  // A loop in D minor: Dm Gm Am, plus a bass part and history
  s.seqAuto();
  const k = (deg) => KEYS.find((x) => x.section === 'chord' && x.degree === deg).index;
  for (const d of [0, 3, 4]) { s.keyDown(k(d)); s.keyUp(k(d)); }
  s.state.parts.bass = [{ pos: 0, midi: 38, vel: 0.8, dur: 1 }]; // D
  const seqBefore = s.state.seq.steps.slice(0, 4).map((c) => s.chordName(c));
  s.setKey({ tonic: 5, mode: 'minor' }); // to F minor: up 3
  assert.equal(s.screenModel().keyName, 'F minor');
  assert.equal(s.screenModel().chordName, 'Cm', 'the playing chord (Am) moves to Cm');
  assert.deepEqual(s.trail.entries.slice(-3).map((e) => e.name), ['Fm', 'Bbm', 'Cm']);
  assert.equal(s.state.parts.bass[0].midi, 41, 'bass part D -> F');
  const seqAfter = s.state.seq.steps.slice(0, 4).map((c) => s.chordName(c));
  assert.notDeepEqual(seqAfter, seqBefore);
  // Flip to F major: same degrees, major colours
  s.setKey({ tonic: 5, mode: 'major' });
  assert.equal(s.screenModel().chordName, 'C', 'v (Cm) becomes V (C)');
  assert.deepEqual(s.trail.entries.slice(-3).map((e) => e.name), ['F', 'Bb', 'C']);
  // Notes in the scale move to the same degree: Ab (b3 in F minor) -> A (3 in F major)
  const nm = noteMapper({ tonic: 5, mode: 'minor' }, { tonic: 5, mode: 'major' });
  assert.equal(nm(56), 57);
  const cm = chordMapper({ tonic: 0, mode: 'major' }, { tonic: 0, mode: 'minor' });
  assert.equal(s.chordName.call(null, cm(makeChord(5, 'maj7'))), 'Fm7', 'IVmaj7 -> iv7 in minor');
});

import { STYLE_LABELS } from '../src/core/nextChord.js';

test('styles: all eleven play the full band with variation', () => {
  assert.deepEqual(STYLE_IDS.map((id) => STYLE_LABELS[id]), ['BREATHE', 'FOCUS', 'STOMP', 'CRUISE', 'BLOOM', 'DRIFT', 'BOOM BAP', 'DUSTY', 'STRUT', 'GOLDEN', 'KNOCK']);
  for (const style of STYLE_IDS) {
    const out = fakeOut();
    const s = createSession(out, { rng });
    s.state.style = style;
    s.state.players.forEach((p, i) => { while (s.state.players[i].mode !== 'FOLLOW') s.cycleMode(i); });
    s.setPlaying(true);
    out.log.length = 0;
    const bars = [];
    for (let n = 0; n < 64; n++) {
      const before = out.log.length;
      s.step(n, n * 0.17);
      if (n % 16 === 0) bars.push([]);
      bars[bars.length - 1].push(...out.log.slice(before).filter((e) => e[0] === 'play' && (e[1] === 'harmony' || e[1] === 'bass')).map((e) => `${n % 16}:${e[1]}`));
    }
    for (const p of ['harmony', 'bass', 'melody', 'soloist']) assert.ok(out.log.some((e) => e[0] === 'play' && e[1] === p), `${style}: ${p} plays`);
    assert.ok(out.log.some((e) => e[0] === 'drum'), `${style}: drums`);
    assert.ok(new Set(bars.map((b) => b.join())).size >= 2, `${style}: bars vary`);
  }
});

import { generateBeat, STYLE_DRUMS } from '../src/core/drums.js';

test('hip hop: style-aware beats, CHOP mode, generated beat follows the style', () => {
  for (const style of STYLE_IDS) {
    assert.ok(STYLE_DRUMS[style], `${style} has a drum feel`);
    const p = generateBeat(style, 90, rng);
    assert.ok(p.kick.some(Boolean), `${style} has kicks`);
  }
  assert.equal(generateBeat('knock', 140, rng).snare[8], 2, 'knock: half-time snare on beat 3');
  assert.ok(generateBeat('strut', 100, rng).hat.filter(Boolean).length >= 12, 'funk: 16th hats');
  const out = fakeOut();
  const s = createSession(out, { rng });
  s.keyDown(5); s.keyUp(5);
  while (s.state.players[0].harmonyMode !== 'CHOP') s.cycleFeel(0);
  s.setPlaying(true);
  out.log.length = 0;
  for (let n = 0; n < 32; n++) s.step(n, n * 0.17);
  assert.ok(out.log.filter((e) => e[0] === 'play' && e[1] === 'harmony').length >= 6, 'CHOP stabs');
  // style change swaps a generated beat, keeps an edited one
  const styleKnob = 3;
  s.knob(styleKnob, (STYLE_IDS.indexOf('knock') + 0.5) / STYLE_IDS.length);
  assert.equal(s.state.drums.pattern.snare[8], 2);
  s.toggleDrumStep('kick', 5);
  const mine = JSON.stringify(s.state.drums.pattern);
  s.knob(styleKnob, (STYLE_IDS.indexOf('strut') + 0.5) / STYLE_IDS.length);
  assert.equal(JSON.stringify(s.state.drums.pattern), mine, 'edited beat kept');
});

import { fixSlot, engineSlot as slotOf } from '../src/core/engines.js';
import { MORPH_MAP } from '../src/audio/morph.js';

test('MORPH: two named extra knobs per engine, A/B switch to them', () => {
  for (const id of ENGINE_IDS) {
    assert.equal(ENGINES[id].morph.length, 2, id);
    assert.equal(slotOf(id).knobs.length, 4, id);
    assert.equal(typeof MORPH_MAP[id], 'function', id);
    const zero = MORPH_MAP[id](0, 0);
    assert.ok(Object.values(zero).every((v) => !v || v === 0.2 || v === 0.22 || v === 2), `${id} neutral at zero`);
  }
  assert.equal(fixSlot({ engine: 'keys', preset: 0, knobs: [0.4, 0.5] }).knobs.length, 4, 'old saves upgraded');
  const s = createSession(fakeOut(), { rng });
  s.focus(0);
  assert.equal(s.knobLabel(4), 'WAVE');
  s.toggleMorph();
  assert.equal(s.knobLabel(4), 'DUST');
  assert.equal(s.knobLabel(5), 'HALO');
  s.knob(4, 0.9);
  assert.equal(s.state.players[0].slot.knobs[2], 0.9);
  assert.notEqual(s.state.players[0].slot.knobs[0], 0.9, 'main knob untouched');
});
