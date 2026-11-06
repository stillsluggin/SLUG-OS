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
