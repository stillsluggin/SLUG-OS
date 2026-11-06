// output.js — the browser's implementation of the session's `out` interface:
// one bus per player (engine voices -> engine insert FX -> level -> sends),
// voice management with mono glide, drums, sampler, BPM-synced loops, and
// the step clock.

import { ENGINES, presetParams } from '../core/engines.js';
import { PLAYER_IDS } from '../core/players.js';
import { createMaster } from './context.js';
import { createKeys } from './engines/keys.js';
import { createAnalog } from './engines/analog.js';
import { createPad } from './engines/pad.js';
import { createPluck } from './engines/pluck.js';
import { createShine } from './engines/shine.js';
import { createTrip } from './engines/trip.js';
import { createSiren } from './engines/siren.js';
import { createDrumKit } from './drumkit.js';
import { createSamplePlayer } from './samplePlayer.js';
import { createMorph, MORPH_MAP } from './morph.js';
import { createRecorder } from './recorder.js';
import { createXY } from './xyfx.js';
import { createRenderer } from './sampleRender.js';

const MONO = new Set(['bass', 'melody', 'soloist']);
const MAX_VOICES = 32;

export function createOutput(ac) {
  const master = createMaster(ac);
  const engines = {
    keys: createKeys(ac), analog: createAnalog(ac), pad: createPad(ac), pluck: createPluck(ac),
    shine: createShine(ac), trip: createTrip(ac), siren: createSiren(ac),
  };
  const drums = createDrumKit(ac, master.input);
  const sampler = createSamplePlayer(ac, master.input);
  const renderer = createRenderer(ac);
  const loopBus = ac.createGain();
  // Three groups the XY pad can target: band (the four synth players), drums, sampler + loops.
  const groups = { band: ac.createGain(), drums: ac.createGain(), sampler: ac.createGain() };
  for (const g of Object.values(groups)) g.connect(master.input);
  sampler.bus.disconnect();
  sampler.bus.connect(groups.sampler);
  loopBus.connect(groups.sampler);

  // ---- player buses
  const buses = {};
  for (const id of PLAYER_IDS) {
    const voiceIn = ac.createGain();
    const out = ac.createGain();
    const rev = ac.createGain();
    const del = ac.createGain();
    out.connect(id === 'drummer' ? groups.drums : groups.band);
    out.connect(rev).connect(master.reverbIn);
    out.connect(del).connect(master.delayIn);
    // voices -> engine insert -> MORPH colour chain -> level
    const morph = createMorph(ac);
    morph.output.connect(out);
    voiceIn.connect(morph.input);
    buses[id] = { voiceIn, out, rev, del, insert: null, player: null, morph };
  }
  drums.bus.disconnect();
  drums.bus.connect(buses.drummer.out);

  function setPlayer(i, p) {
    const b = buses[p.id];
    const prevEngine = b.player?.slot?.engine;
    b.player = { ...p, slot: p.slot && { ...p.slot, knobs: [...p.slot.knobs] } };
    const muted = p.mode === 'MUTE' && p.id === 'drummer';
    b.out.gain.setTargetAtTime(muted ? 0 : p.level, ac.currentTime, 0.02);
    if (!p.slot) return;
    const eng = engines[p.slot.engine];
    if (prevEngine !== p.slot.engine) {
      // Swap the engine's insert effect in.
      b.voiceIn.disconnect();
      if (b.insert) b.insert.output.disconnect();
      b.insert = eng.insert ? eng.insert() : null;
      if (b.insert) { b.voiceIn.connect(b.insert.input); b.insert.output.connect(b.morph.input); }
      else b.voiceIn.connect(b.morph.input);
    }
    const k = p.slot.knobs;
    b.morph.set((MORPH_MAP[p.slot.engine] || (() => ({})))(k[2] ?? 0, k[3] ?? 0));
    if (b.insert) b.insert.set(p.slot.knobs, presetParams(p.slot));
    const s = eng.sends(p.slot.knobs);
    b.rev.gain.setTargetAtTime(s.reverb, ac.currentTime, 0.05);
    b.del.gain.setTargetAtTime(s.delay, ac.currentTime, 0.05);
  }

  // ---- voices
  let active = []; // { player, midi, v, start, offAt }
  const prune = () => { const now = ac.currentTime; active = active.filter((a) => a.v.end > now); };

  // Deferred releases (so mono glide can keep a note alive).
  setInterval(() => {
    const horizon = ac.currentTime + 0.05;
    for (const a of active) if (a.offAt != null && a.offAt <= horizon) { a.v.release(a.offAt); a.offAt = null; }
  }, 20);

  function start(player, midi, vel, time, { glide = false, from = null, dur = null } = {}) {
    prune();
    const b = buses[player];
    if (!b.player?.slot) return null;
    const t = Math.max(time ?? ac.currentTime, ac.currentTime);
    const slot = b.player.slot;
    const p = presetParams(slot);
    const glideKnob = slot.engine === 'analog' ? slot.knobs[0] : 0;
    const mono = MONO.has(player);
    const mine = active.filter((a) => a.player === player && a.v.end > t);

    if (mono && mine.length) {
      const last = mine[mine.length - 1];
      const legato = !last.v.released && (last.offAt == null || t <= last.offAt + 0.02);
      // ANALOG: true portamento on the same voice.
      if (legato && last.v.glideTo && (glide || glideKnob > 0.05)) {
        last.v.glideTo(midi, vel, t);
        last.midi = midi;
        last.offAt = dur != null ? t + dur : null;
        return last;
      }
      from = from ?? ((glide || glideKnob > 0.05) ? last.midi : null);
      mine.forEach((a) => a.v.kill(t));
    }
    // Same note retriggered on a poly player
    if (!mono) active.filter((a) => a.player === player && a.midi === midi && !a.v.released).forEach((a) => a.v.kill(t));
    while (active.length >= MAX_VOICES) { const old = active.find((a) => a.v.released) || active[0]; old.v.kill(t); active.splice(active.indexOf(old), 1); }
    const v = engines[slot.engine].voice(slot, p, midi, vel, t, b.voiceIn, { from, dur });
    const entry = { player, midi, v, start: t, offAt: dur != null ? t + dur : null };
    active.push(entry);
    return entry;
  }

  // ---- loops (synced to bars)
  const loops = new Map(); // id -> { buf, bpm, src, g, pending: 'start'|'stop'|null }
  let tempo = 90;
  let playing = false;

  function startLoop(l, t) {
    const src = ac.createBufferSource();
    src.buffer = l.buf;
    src.loop = true;
    src.playbackRate.value = tempo / l.bpm;
    const g = ac.createGain();
    g.gain.value = l.gain ?? 0.8;
    src.connect(g).connect(loopBus);
    src.start(t);
    l.src = src; l.g = g; l.pending = null;
  }
  function stopLoopNow(l, t) {
    if (!l.src) return;
    l.g.gain.setTargetAtTime(0, t, 0.01);
    try { l.src.stop(t + 0.08); } catch (e) { /* stopped */ }
    l.src = null;
  }

  // ---- the clock
  let onStep = null;
  let stepDurOf = () => 0.17;
  let timer = null;
  let stepN = 0;
  let nextTime = 0;
  let metro = false;
  let barOneTime = 0; // when step 0 (bar 1) plays after PLAY
  function runClock(on, reset = false) {
    if (!on) { clearInterval(timer); timer = null; return; }
    if (reset || !timer) {
      clearInterval(timer);
      stepN = 0;
      nextTime = ac.currentTime + 0.06;
      barOneTime = nextTime;
      tick();
      timer = setInterval(tick, 25);
    }
  }
  function tick() {
    const ahead = ac.currentTime + 0.12;
    while (nextTime < ahead) {
      onStep && onStep(stepN, nextTime);
      stepN++;
      nextTime += stepDurOf();
    }
  }

  const out = {
    now: () => ac.currentTime,
    noteOn(player, midi, vel, { time, glide, from } = {}) { start(player, midi, vel, time, { glide, from }); },
    noteOff(player, midi, time) {
      active.filter((a) => a.player === player && a.midi === midi && !a.v.released).forEach((a) => { a.offAt = null; a.v.release(time ?? ac.currentTime); });
    },
    play(player, midi, vel, time, dur, { glide } = {}) { start(player, midi, vel, time, { glide, dur }); },
    releasePlayer(player, time) {
      active.filter((a) => a.player === player && !a.v.released).forEach((a) => { a.offAt = null; a.v.release(time ?? ac.currentTime); });
    },
    cutPlayer(player, time) {
      active.filter((a) => a.player === player).forEach((a) => { a.offAt = null; a.v.kill(time ?? ac.currentTime); });
    },
    drum(lane, vel, time) { drums.play(lane, vel, time ?? ac.currentTime); },
    setPlayer,
    bar(_n, time) {
      for (const l of loops.values()) {
        if (l.pending === 'start') startLoop(l, time);
        else if (l.pending === 'stop') { stopLoopNow(l, time); loops.delete(l.id); }
      }
    },
    transport(on) {
      playing = on;
      if (on) runClock(true, true);
      else {
        const t = ac.currentTime;
        active.filter((a) => a.start > t).forEach((a) => a.v.kill(t));
        for (const l of loops.values()) stopLoopNow(l, t);
        loops.clear();
        if (!metro) runClock(false);
      }
    },
    /** Metronome on/off. It keeps the clock running even while the band is stopped. */
    metronome(on) {
      metro = on;
      if (on && !timer) runClock(true, true);
      if (!on && !playing) runClock(false);
    },
    /** One click: a short pixel "tick", higher on beat 1. Bypasses the XY effects. */
    click(accent, time) {
      const t = Math.max(time ?? ac.currentTime, ac.currentTime);
      const o = ac.createOscillator();
      o.type = 'square';
      o.frequency.value = accent ? 1760 : 1175;
      const g = ac.createGain();
      g.gain.setValueAtTime(accent ? 0.16 : 0.1, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      const lp = ac.createBiquadFilter();
      lp.frequency.value = 4000;
      o.connect(lp).connect(g).connect(master.direct);
      o.start(t);
      o.stop(t + 0.06);
    },
  };

  // ---- EXPORT "WITH FX": a private copy of the shared effects for one stem.
  let xyTarget = 'ALL';
  const groupOf = (name) => (name.startsWith('drum') ? 'DRUMS' : name === 'sampler' || name === 'loops' ? 'SAMPLER' : 'BAND');
  function wetChain(name, node, cleanups) {
    const sum = ac.createGain();
    node.connect(sum);
    const bus = name.startsWith('drum') ? buses.drummer : buses[name];
    if (bus) {
      // This part's share of the room reverb and the tempo echo.
      const rs = ac.createGain(); rs.gain.value = bus.rev.gain.value;
      const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 200;
      const conv = ac.createConvolver(); conv.buffer = master.reverbBuffer;
      node.connect(rs).connect(hp).connect(conv).connect(sum);
      const ds = ac.createGain(); ds.gain.value = bus.del.gain.value;
      const d = ac.createDelay(2); d.delayTime.value = master.delaySeconds;
      const fb = ac.createGain(); fb.gain.value = 0.35;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2800;
      node.connect(ds).connect(d).connect(lp).connect(fb).connect(d);
      lp.connect(sum);
      cleanups.push(() => { try { node.disconnect(rs); node.disconnect(ds); } catch (e) { /* gone */ } });
    }
    let last = sum;
    // The XY pad, mirrored live, if it's aimed at this part.
    if (xyTarget === 'ALL' || xyTarget === groupOf(name)) {
      const src = master.xy;
      const copy = createXY(ac);
      const snap = src.snapshot();
      copy.setTempo(src.tempo);
      if (src.clock) copy.setClock(src.clock);
      for (const ax of ['x', 'y']) if (snap.ids[ax]) { copy.setEffect(ax, snap.ids[ax], snap.params[ax]); copy.setAmount(ax, snap.amounts[ax]); }
      const off = src.subscribe((type, ax, a, b) => {
        if (type === 'effect') copy.setEffect(ax, a, b);
        else if (type === 'amount') copy.setAmount(ax, a);
        else copy.setParams(ax, a);
      });
      sum.connect(copy.input);
      last = copy.output;
      cleanups.push(() => { off(); for (const ax of ['x', 'y']) copy.setAmount(ax, 0); });
    }
    const warm = ac.createWaveShaper();
    warm.curve = master.warmthCurve;
    last.connect(warm);
    cleanups.push(() => { try { node.disconnect(sum); } catch (e) { /* gone */ } });
    return warm;
  }

  // Synced XY effects (LFO filter, trance gate) start on the next beat of the band.
  master.xy.setClock(() => {
    const beat = 60 / tempo;
    const t = ac.currentTime;
    if (!playing) return t;
    return barOneTime + Math.ceil((t - barOneTime) / beat) * beat;
  });

  return {
    out,
    master,
    drums,
    sampler,
    renderer,
    analyser: master.analyser,
    activeVoices: () => { prune(); return active.length; },
    bindClock({ step, stepDur }) { onStep = step; stepDurOf = stepDur; },
    setTempo(bpm) {
      tempo = bpm;
      master.setTempo(bpm);
      for (const b of Object.values(buses)) b.morph.setTempo(bpm);
      for (const l of loops.values()) if (l.src) l.src.playbackRate.setTargetAtTime(tempo / l.bpm, ac.currentTime, 0.05);
    },
    /** Toggle a loop: starts on the next bar while playing, or right away when stopped. */
    toggleLoop(id, buf, bpm, gain) {
      const l = loops.get(id);
      if (l) {
        if (playing && l.src) l.pending = 'stop';
        else { stopLoopNow(l, ac.currentTime); loops.delete(id); }
        return false;
      }
      const nl = { id, buf, bpm, gain, pending: 'start' };
      loops.set(id, nl);
      if (!playing) startLoop(nl, ac.currentTime);
      return true;
    },
    recorder: createRecorder(ac),
    /**
     * The points EXPORT records, plus a cleanup function.
     *   split: drums as one stem, or one per lane (kick, snare, hat, open, rim, perc)
     *   wet:   each stem gets its own copy of the room + echo (at that part's send
     *          level), the XY pad (if it's aimed at that part) and the tape warmth.
     */
    exportSources({ split = false, wet = false } = {}) {
      const raw = {
        harmony: buses.harmony.out, melody: buses.melody.out, bass: buses.bass.out, soloist: buses.soloist.out,
        sampler: sampler.bus, loops: loopBus,
      };
      if (split) for (const [lane, node] of Object.entries(drums.laneNodes)) raw[`drum-${lane}`] = node;
      else raw.drums = buses.drummer.out;
      const cleanups = [];
      const sources = { mix: master.outNode };
      for (const [name, node] of Object.entries(raw)) sources[name] = wet ? wetChain(name, node, cleanups) : node;
      return { sources, cleanup: () => cleanups.forEach((f) => f()) };
    },
    /** SHELL SHOCK "AFFECTS": ALL, BAND, DRUMS or SAMPLER (with loops). */
    setXYTarget(target) {
      xyTarget = target;
      for (const [name, g] of Object.entries(groups)) {
        g.disconnect();
        g.connect(target === 'ALL' || target === name.toUpperCase() ? master.input : master.dryInput);
      }
      master.setReturnsThroughXY(target === 'ALL');
    },
    /** Points EXPORT can record: the final mix and each part (stems are before the shared room/echo). */
    taps: () => ({
      mix: master.outNode,
      harmony: buses.harmony.out, melody: buses.melody.out, bass: buses.bass.out, soloist: buses.soloist.out,
      drums: buses.drummer.out, sampler: sampler.bus, loops: loopBus,
    }),
    get barOneTime() { return barOneTime; },
    loopState: (id) => (loops.has(id) ? (loops.get(id).pending === 'start' ? 'queued' : loops.get(id).pending === 'stop' ? 'stopping' : 'on') : 'off'),
    engineName: (id) => ENGINES[id]?.name,
  };
}
