// drumkit.js — plays drum hits from a sample kit, or from a small synthesized
// boom bap kit when a lane has no sample (so Slug OS always has drums).

import { noiseSource } from './util.js';

export function createDrumKit(ac, dest) {
  // Dusty bus: a touch of low-pass and saturation, like sampled records.
  const bus = ac.createGain();
  const dust = ac.createBiquadFilter();
  dust.type = 'lowpass';
  dust.frequency.value = 11000;
  const sat = ac.createWaveShaper();
  const curve = new Float32Array(512);
  for (let i = 0; i < 512; i++) { const x = (i / 511) * 2 - 1; curve[i] = Math.tanh(1.6 * x) / Math.tanh(1.6); }
  sat.curve = curve;
  bus.connect(dust).connect(sat).connect(dest);

  let kit = { name: 'Synth Bap', lanes: {} }; // lanes: { kick: [AudioBuffer...] }
  const rr = {}; // round robin per lane

  function setKit(k) { kit = k || { name: 'Synth Bap', lanes: {} }; }

  function play(lane, vel, t) {
    const bufs = kit.lanes[lane];
    if (bufs && bufs.length) {
      rr[lane] = ((rr[lane] ?? -1) + 1) % bufs.length;
      const src = ac.createBufferSource();
      src.buffer = bufs[rr[lane]];
      const g = ac.createGain();
      g.gain.value = 0.25 + 0.85 * vel;
      src.connect(g).connect(bus);
      src.start(t);
      return;
    }
    synth(lane, vel, t);
  }

  function synth(lane, vel, t) {
    const g = ac.createGain();
    g.connect(bus);
    const v = 0.3 + 0.7 * vel;
    if (lane === 'kick') {
      const o = ac.createOscillator();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(44, t + 0.13);
      g.gain.setValueAtTime(0.95 * v, t);
      g.gain.setTargetAtTime(0, t + 0.05, 0.12);
      o.connect(g);
      o.start(t); o.stop(t + 0.8);
      const click = noiseSource(ac);
      const cf = ac.createBiquadFilter(); cf.type = 'lowpass'; cf.frequency.value = 2500;
      const cg = ac.createGain(); cg.gain.setValueAtTime(0.25 * v, t); cg.gain.setTargetAtTime(0, t, 0.006);
      click.connect(cf).connect(cg).connect(bus); click.start(t); click.stop(t + 0.05);
    } else if (lane === 'snare' || lane === 'rim') {
      const n = noiseSource(ac);
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = lane === 'rim' ? 2200 : 1700;
      bp.Q.value = lane === 'rim' ? 6 : 0.9;
      const ng = ac.createGain();
      ng.gain.setValueAtTime((lane === 'rim' ? 0.5 : 0.7) * v, t);
      ng.gain.setTargetAtTime(0, t, lane === 'rim' ? 0.015 : 0.06);
      n.connect(bp).connect(ng).connect(g);
      g.gain.value = 1;
      const o = ac.createOscillator();
      o.frequency.setValueAtTime(lane === 'rim' ? 820 : 210, t);
      o.frequency.exponentialRampToValueAtTime(lane === 'rim' ? 700 : 160, t + 0.05);
      const og = ac.createGain();
      og.gain.setValueAtTime(0.35 * v, t);
      og.gain.setTargetAtTime(0, t, 0.03);
      o.connect(og).connect(g);
      n.start(t); n.stop(t + 0.4); o.start(t); o.stop(t + 0.3);
    } else if (lane === 'hat' || lane === 'open') {
      const n = noiseSource(ac);
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7000;
      const pk = ac.createBiquadFilter();
      pk.type = 'peaking'; pk.frequency.value = 10000; pk.gain.value = 6;
      g.gain.setValueAtTime(0.32 * v, t);
      g.gain.setTargetAtTime(0, t, lane === 'open' ? 0.18 : 0.025);
      n.connect(hp).connect(pk).connect(g);
      n.start(t); n.stop(t + (lane === 'open' ? 1 : 0.2));
    } else { // perc: a little woodblock
      const o = ac.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(900, t);
      o.frequency.exponentialRampToValueAtTime(620, t + 0.06);
      g.gain.setValueAtTime(0.4 * v, t);
      g.gain.setTargetAtTime(0, t, 0.035);
      o.connect(g);
      o.start(t); o.stop(t + 0.3);
    }
  }

  return { play, setKit, get kit() { return kit; }, bus };
}
