// exportWin.js — EXPORT: record the app's output to WAV.
//   LIVE  record until you press stop (jam, play, tweak Shell Shock...)
//   LOOP  restart the band from bar 1 and record exactly N bars (+ an
//         optional tail so echoes and reverb ring out)
// STEREO MIX = one WAV. MULTITRACK = a WAV per part (harmony, melody, bass,
// soloist, drums, sampler, loops) plus the mix, all the same length, in a zip.
// Also: send the recording to a sampler pad, and save / open project files.

import { h, button } from './widgets.js';
import { resample, wavBytes, peakOf } from '../storage/wav.js';
import { zip } from '../storage/zip.js';
import { STYLE_LABELS } from '../core/nextChord.js';

const RATES = [48000, 44100, 22050, 11025];
const STEMS = ['harmony', 'melody', 'bass', 'soloist', 'drums', 'sampler', 'loops'];

export function exportWindow(app) {
  const { session } = app;
  const st = session.state;
  const opt = { mode: 'LOOP', bars: 4, tail: 2, format: 'MIX', rate: 44100, bits: 16 };
  let result = null; // { blob, name, mixBuffer }
  let timer = null;

  // ---- option rows (each a little segmented switch)
  const seg = (label, values, key, fmt = (v) => String(v)) => {
    const btns = values.map((v) => button(fmt(v), () => { opt[key] = v; render(); }, 'sm'));
    const row = h('div.row.exrow', {}, h('span.lab', { text: label }), h('span.seg', {}, btns));
    row.update = () => btns.forEach((b, i) => b.classList.toggle('on', opt[key] === values[i]));
    return row;
  };
  const rows = [
    seg('RECORD', ['LOOP', 'LIVE'], 'mode'),
    seg('BARS', [1, 2, 4, 8, 16], 'bars'),
    seg('TAIL', [0, 2, 4], 'tail', (v) => `${v}s`),
    seg('FORMAT', ['MIX', 'STEMS'], 'format', (v) => (v === 'MIX' ? 'STEREO MIX' : 'MULTITRACK')),
    seg('RATE', RATES, 'rate', (v) => `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k`),
    seg('BITS', [16, 24], 'bits'),
  ];
  const goBtn = button('', () => (session.state.__exporting ? stopLive() : go()), 'hot');
  goBtn.classList.add('big');
  const status = h('p.help.exstatus');
  const slime = h('div.slime', {}, h('i'));
  const saveBtn = button('⬇ SAVE FILE', () => result && download(result.blob, result.name));
  const padBtn = button('→ SAMPLER PAD', async () => {
    if (!result) return;
    const n = await app.recordingToPad(result.mixBuffer, result.name);
    app.toast(n != null ? `ON PAD ${n + 1}` : 'NO EMPTY PAD');
  });
  const doneRow = h('div.row', {}, saveBtn, padBtn);

  // ---- project files
  const projIn = h('input.sr', { type: 'file', accept: '.json,application/json' });
  projIn.addEventListener('change', async () => {
    const f = projIn.files[0];
    projIn.value = '';
    if (!f) return;
    try { app.openProject(JSON.parse(await f.text())); app.toast('PROJECT OPENED'); } catch (e) { app.toast('NOT A SLUG OS PROJECT'); }
  });
  const projRow = h('div.row', {},
    button('⬇ SAVE PROJECT', () => download(new Blob([JSON.stringify(app.projectFile(), null, 1)], { type: 'application/json' }), `${baseName()}.slug.json`), 'sm'),
    button('⬆ OPEN PROJECT', () => projIn.click(), 'sm'), projIn);

  const win = h('div.win.export-win', {},
    h('div.win-title', {}, h('span.box'), h('b', { text: 'EXPORT' }), button('✕', () => close(), 'sm')),
    h('div.win-body', {},
      ...rows,
      h('div.row', { style: 'margin-top:8px' }, goBtn),
      slime, status, doneRow,
      h('p.help', { text: 'Stems are recorded before the shared room and echo (those are on the mix). Shell Shock and the master warmth are on the mix only. Lo-fi crunch: try 22k or 11k, or use Shell Shock\'s LO-FI.' }),
      h('div.lab', { style: 'margin-top:8px', text: 'PROJECT FILE (settings, chords, parts, beats; your sounds stay on this device)' }),
      projRow));
  const wrap = h('div.loader-wrap.export-wrap', {}, win);
  wrap.addEventListener('pointerdown', (ev) => { if (ev.target === wrap && !session.state.__exporting) close(); });

  function baseName() {
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    return `slug-${STYLE_LABELS[st.style].toLowerCase().replace(/\s+/g, '')}-${st.tempo}bpm-${stamp}`;
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  const setProgress = (v) => { slime.firstChild.style.width = `${Math.round(v * 100)}%`; };

  async function go() {
    if (!app.audio) { app.toast('TAP TO START FIRST'); return; }
    result = null;
    const rec = app.audio.recorder;
    const ac = app.ac();
    const sources = opt.format === 'MIX' ? { mix: app.audio.taps().mix } : app.audio.taps();
    session.state.__exporting = true;
    app.setRecIndicator(true);
    render();
    try {
      if (opt.mode === 'LIVE') {
        const t0 = await rec.start(sources, ac.currentTime + 0.05);
        const tick = () => { if (!rec.recording) return; status.textContent = `● RECORDING ${fmtTime(ac.currentTime - t0)} — play, then tap STOP`; timer = requestAnimationFrame(tick); };
        tick();
        return; // stopLive() finishes it
      }
      // LOOP: restart the band at bar 1 and capture exactly N bars (+ tail).
      session.setPlaying(false);
      session.setPlaying(true);
      const start = app.audio.barOneTime;
      const loopLen = opt.bars * 4 * (60 / st.tempo);
      await rec.start(sources, start);
      const end = start + loopLen;
      const total = loopLen + opt.tail;
      const tick = () => {
        const t = ac.currentTime - start;
        setProgress(Math.min(1, t / total));
        status.textContent = t < loopLen ? `● RECORDING bar ${Math.min(opt.bars, Math.floor(t / (loopLen / opt.bars)) + 1)} of ${opt.bars}` : '● letting the tail ring out…';
        if (t < total) timer = requestAnimationFrame(tick);
      };
      tick();
      // Stop the band just before the loop ends (so the next bar never starts), then wait for the tail.
      await waitUntil(ac, end - 0.05);
      session.setPlaying(false);
      const take = await rec.stop(start + total);
      await finish(take);
    } catch (e) {
      status.textContent = `Export failed: ${e.message}`;
      session.state.__exporting = false;
      app.setRecIndicator(false);
      render();
    }
  }

  async function stopLive() {
    cancelAnimationFrame(timer);
    const take = await app.audio.recorder.stop();
    await finish(take);
  }

  async function finish(take) {
    cancelAnimationFrame(timer);
    session.state.__exporting = false;
    app.setRecIndicator(false);
    status.textContent = 'Writing files…';
    setProgress(1);
    render();
    await new Promise((r) => setTimeout(r, 30));
    const name = baseName();
    const files = [];
    const order = ['mix', ...STEMS];
    let n = 1;
    for (const key of order) {
      const tr = take.tracks[key];
      if (!tr) continue;
      if (key !== 'mix' && peakOf(tr) < 0.0005) continue; // skip silent parts
      const chans = tr.map((c) => resample(c, take.sampleRate, opt.rate));
      files.push({ name: opt.format === 'MIX' ? `${name}.wav` : `${name}/${String(n++).padStart(2, '0')}-${key}.wav`, data: wavBytes(chans, opt.rate, opt.bits) });
    }
    const mix = take.tracks.mix;
    const ac = app.ac();
    const mixBuffer = ac.createBuffer(2, mix[0].length, take.sampleRate);
    mixBuffer.getChannelData(0).set(mix[0]);
    mixBuffer.getChannelData(1).set(mix[1]);
    const seconds = mix[0].length / take.sampleRate;
    if (files.length === 1) result = { blob: new Blob([files[0].data], { type: 'audio/wav' }), name: files[0].name, mixBuffer };
    else result = { blob: new Blob([zip(files)], { type: 'application/zip' }), name: `${name}-stems.zip`, mixBuffer };
    status.textContent = `Done: ${fmtTime(seconds)} · ${files.length} file${files.length > 1 ? 's' : ''} · ${opt.rate / 1000}k / ${opt.bits}-bit. Tap SAVE FILE.`;
    render();
  }

  function render() {
    rows.forEach((r) => r.update());
    const loop = opt.mode === 'LOOP';
    rows[1].style.display = rows[2].style.display = loop ? '' : 'none';
    const busy = !!session.state.__exporting;
    goBtn.textContent = busy ? (opt.mode === 'LIVE' ? '■ STOP' : '● RECORDING…') : loop ? `▶ RECORD ${opt.bars} BAR${opt.bars > 1 ? 'S' : ''}` : '● START RECORDING';
    goBtn.disabled = busy && loop;
    doneRow.style.display = result && !busy ? '' : 'none';
    slime.style.display = busy || result ? '' : 'none';
    if (!busy && !result) status.textContent = loop ? 'The band restarts from bar 1 and records exactly that many bars.' : 'Records everything you play until you tap STOP.';
  }

  function open() { wrap.classList.add('open'); render(); }
  function close() { wrap.classList.remove('open'); }
  render();
  return { el: wrap, open, close };
}

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function waitUntil(ac, t) {
  return new Promise((res) => {
    const check = () => (ac.currentTime >= t ? res() : setTimeout(check, Math.min(50, Math.max(5, (t - ac.currentTime) * 500))));
    check();
  });
}
