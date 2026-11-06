// morph.js — the MORPH layer: two extra knobs per engine that reshape its
// sound. One small colour chain per player, after the engine's own effect:
//   drive / crush -> warmth (low shelf) -> air (high shelf) -> darken (low-pass)
//   -> wobble (slow pitch wow) -> pulse (tremolo) -> width (stereo)
// Each engine maps its two MORPH knobs (0..1) onto these. All zero = untouched.

const SMOOTH = 0.03;

/** Engine id -> (m1, m2) -> chain settings. Names are in src/core/engines.js. */
export const MORPH_MAP = {
  keys: (dust, halo) => ({ wobble: dust * 0.8, dark: dust * 0.45, warm: dust * 3, air: halo * 6, width: halo * 0.8 }),
  analog: (grit, fat) => ({ drive: grit, warm: fat * 5, width: fat * 0.6 }), // FAT also spreads the oscillators (analog.js)
  pad: (airy, swell) => ({ air: airy * 7, width: 0.2 + airy * 0.3, pulse: swell * 0.55, pulseRate: 0.22, wobble: swell * 0.35 }),
  pluck: (body, snap) => ({ warm: body * 7, drive: body * 0.25 + snap * 0.2, air: snap * 6 }),
  shine: (melt, glint) => ({ dark: melt * 0.75, wobble: melt * 0.5, air: glint * 8, width: glint * 0.7 }),
  trip: (spore, pulse) => ({ drive: spore * 0.8, wobble: spore, pulse: pulse * 0.9, pulseSync: 2 }),
  siren: (howl, stat) => ({ wobble: howl, drive: howl * 0.5, crush: stat }),
};

export function createMorph(ac) {
  const input = ac.createGain();
  const output = ac.createGain();
  const pre = ac.createGain();
  const shaper = ac.createWaveShaper();
  const warm = ac.createBiquadFilter(); warm.type = 'lowshelf'; warm.frequency.value = 200;
  const air = ac.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 6000;
  const dark = ac.createBiquadFilter(); dark.type = 'lowpass'; dark.frequency.value = 20000; dark.Q.value = 0.5;
  const wob = ac.createDelay(0.05); wob.delayTime.value = 0.006;
  const wobLfo = ac.createOscillator(); wobLfo.frequency.value = 0.6;
  const wobDepth = ac.createGain(); wobDepth.gain.value = 0;
  wobLfo.connect(wobDepth).connect(wob.delayTime);
  const trem = ac.createGain();
  const tremLfo = ac.createOscillator(); tremLfo.frequency.value = 0.25;
  const tremDepth = ac.createGain(); tremDepth.gain.value = 0;
  tremLfo.connect(tremDepth).connect(trem.gain);
  wobLfo.start(); tremLfo.start();
  // Width: left = the sound, right = the sound a few ms later, blended in.
  const merger = ac.createChannelMerger(2);
  const haas = ac.createDelay(0.03); haas.delayTime.value = 0.013;
  const wide = ac.createGain(); wide.gain.value = 0;
  const dry = ac.createGain();

  input.connect(pre).connect(shaper).connect(warm).connect(air).connect(dark).connect(wob).connect(trem);
  trem.connect(dry).connect(output);
  trem.connect(haas).connect(wide).connect(merger, 0, 1);
  wide.connect(merger, 0, 0); // keeps the blend centred-ish on mono speakers
  merger.connect(output);

  let tempo = 90;
  let last = {};
  let shapeKey = '';

  function set(params) {
    const p = { drive: 0, crush: 0, warm: 0, air: 0, dark: 0, wobble: 0, pulse: 0, pulseRate: 0, pulseSync: 0, width: 0, ...params };
    last = p;
    const t = ac.currentTime;
    // Drive (soft saturation) and crush (fewer levels): rebuild the curve only when it changes.
    const key = `${p.drive.toFixed(2)}|${p.crush.toFixed(2)}`;
    if (key !== shapeKey) {
      shapeKey = key;
      if (p.drive < 0.01 && p.crush < 0.01) shaper.curve = null;
      else {
        const k = 1 + p.drive * 8;
        const steps = p.crush > 0.01 ? Math.pow(2, 12 - p.crush * 9) : 0;
        const c = new Float32Array(2048);
        for (let i = 0; i < c.length; i++) {
          let x = (i / (c.length - 1)) * 2 - 1;
          x = Math.tanh(k * x) / Math.tanh(k);
          if (steps) x = Math.round(x * steps) / steps;
          c[i] = x;
        }
        shaper.curve = c;
      }
    }
    pre.gain.setTargetAtTime(1, t, SMOOTH);
    warm.gain.setTargetAtTime(p.warm, t, SMOOTH);
    air.gain.setTargetAtTime(p.air, t, SMOOTH);
    dark.frequency.setTargetAtTime(20000 * Math.pow(1500 / 20000, p.dark), t, SMOOTH);
    wobDepth.gain.setTargetAtTime(p.wobble * 0.0035, t, SMOOTH);
    const rate = p.pulseSync ? (tempo / 60) * p.pulseSync : p.pulseRate || 4;
    tremLfo.frequency.setTargetAtTime(rate, t, SMOOTH);
    trem.gain.setTargetAtTime(1 - p.pulse / 2, t, SMOOTH);
    tremDepth.gain.setTargetAtTime(p.pulse / 2, t, SMOOTH);
    wide.gain.setTargetAtTime(p.width * 0.6, t, SMOOTH);
    dry.gain.setTargetAtTime(1 - p.width * 0.25, t, SMOOTH);
  }
  set({});

  return {
    input, output, set,
    setTempo(bpm) { tempo = bpm; if (last.pulseSync) set(last); },
  };
}
