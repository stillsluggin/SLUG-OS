// pageDrums.js — Slug Drums: kits (built-in + your private imports), the
// boom bap pattern editor/generator, finger-drum pads and BPM-synced loops.

import { h, win, button, tap, hold } from './widgets.js';
import { spriteImg } from './sprites.js';
import { LANES, LANE_LABELS } from '../core/drums.js';
import { STORE_URL } from '../config.js';

export function drumsPage(app) {
  const { session } = app;
  const st = session.state;

  // ---- Kits
  const kitList = h('div.kitlist');
  const status = h('p.help');
  const files = h('input.sr', { type: 'file', multiple: true, accept: 'audio/*,video/*,.wav,.aif,.aiff,.mp3,.m4a,.flac,.ogg' });
  const folder = h('input.sr', { type: 'file', multiple: true, webkitdirectory: true });
  const onPick = async (input) => {
    if (!input.files.length) return;
    status.textContent = 'Importing… (stays private on this device)';
    const res = await app.importFiles(input.files, (p, name) => { status.textContent = `Importing ${Math.round(p * 100)}% · ${name}`; });
    status.textContent = res ? `Added ${res.added} sounds · ${res.kits} kit(s) · ${res.loops} loop(s). Stored only on this device.` : 'Import failed.';
    input.value = '';
    update();
  };
  files.addEventListener('change', () => onPick(files));
  folder.addEventListener('change', () => onPick(folder));
  const store = h('a.storelink', { href: STORE_URL || '#', target: '_blank', rel: 'noopener', title: STORE_URL ? '' : 'Set STORE_URL in src/config.js' }, 'Get more Slugz kits ↗');
  if (!STORE_URL) store.addEventListener('click', (e) => { e.preventDefault(); app.toast('Store link coming soon'); });
  const kitWin = win('Drum Kit', [
    kitList,
    h('div.row', { style: 'margin-top:6px' }, button('+ FILES', () => files.click(), 'sm'), button('+ FOLDER', () => folder.click(), 'sm'), h('span.grow'), store),
    status, files, folder,
  ]);

  // ---- Pattern
  const grid = h('div.dgrid');
  const cells = {};
  for (const lane of LANES) {
    grid.append(h('span.ln', { text: LANE_LABELS[lane] }));
    cells[lane] = Array.from({ length: 16 }, (_, s) => {
      const c = h('button.cell', { type: 'button', 'aria-label': `${lane} step ${s + 1}` });
      if (s % 4 === 0) c.classList.add('beat');
      tap(c, () => session.toggleDrumStep(lane, s));
      grid.append(c);
      return c;
    });
  }
  const rangeLab = h('span.lab');
  const r = st.drums.range;
  const nudge = (i, d) => { r[i] = Math.max(60, Math.min(150, r[i] + d)); if (r[0] > r[1]) r[1 - i] = r[i]; update(); };
  const patWin = win('Boom Bap Pattern', [
    h('div.row', {}, button('★ BOOM BAP', () => session.generateDrums(), 'hot'), button('RANGE', () => session.generateDrums({ useRange: true })),
      button('−', () => nudge(0, -5), 'sm'), rangeLab, button('+', () => nudge(1, 5), 'sm'), h('span.grow'), button('CLEAR', () => session.setPattern(Object.fromEntries(LANES.map((l) => [l, Array(16).fill(0)]))), 'sm')),
    h('div', { style: 'margin-top:6px;overflow-x:auto' }, grid),
    h('p.help', { text: 'Tap a cell: off → ghost → hit. BOOM BAP writes a beat for the current tempo; RANGE also picks a tempo in the range.' }),
  ], { cls: 'span' });

  // ---- Pads
  const pads = h('div.pads6');
  LANES.forEach((lane) => {
    const p = h('div.pad', {}, h('span.pl', { text: LANE_LABELS[lane] }));
    hold(p, () => app.out.drum(lane, 0.9, app.out.now()));
    pads.append(p);
  });
  const padWin = win('Finger Drums', pads);

  // ---- Loops
  const loopList = h('div.loops');
  const loopWin = win('Loops', [loopList, h('p.help', { text: 'Loops follow the tempo and start on the next bar. Import loops with + FILES (names like "dusty 92bpm.wav" set their tempo).' })]);

  const deco = h('div.deco', {}, spriteImg('mush', 3), spriteImg('leaf', 3), spriteImg('dew', 3), spriteImg('snail', 2));
  const el = h('div.page.cols', {}, kitWin, patWin, padWin, loopWin, deco);

  function renderKits() {
    kitList.innerHTML = '';
    const kits = [{ id: 'builtin', name: 'Slugz Delight (free)' }, { id: 'synth', name: 'Synth Bap' }, ...app.library.kits.map((k) => ({ id: k.id, name: k.name }))];
    for (const k of kits) kitList.append(button(k.name, () => app.selectKit(k.id), `sm${app.kitId === k.id ? '.on' : ''}`));
  }

  function renderLoops() {
    loopList.innerHTML = '';
    const loops = [...(app.library.builtin?.loops || []).map((l) => ({ ...l, builtin: true })), ...app.library.loops];
    if (!loops.length) { loopList.append(h('p.help', { text: 'No loops yet.' })); return; }
    for (const l of loops) {
      const state = app.audio ? app.audio.loopState(l.id) : 'off';
      const b = button(state === 'off' ? '▶' : state === 'queued' ? '…' : '■', async () => { await app.toggleLoop(l); renderLoops(); }, `sm${state !== 'off' ? '.on' : ''}`);
      loopList.append(h('div.loop', {}, b, h('span.nm', { text: l.name }), h('span.bpm', { text: `${Math.round(l.bpm)} BPM` })));
    }
  }

  function update(what) {
    if (what === 'step') return updateStep();
    rangeLab.textContent = `${r[0]}–${r[1]}`;
    for (const lane of LANES) cells[lane].forEach((c, s) => { c.classList.toggle('v1', st.drums.pattern[lane][s] === 1); c.classList.toggle('v2', st.drums.pattern[lane][s] === 2); });
    renderKits();
    renderLoops();
    updateStep();
  }
  let lastStep = -1;
  function updateStep() {
    const s = st.playing ? st.step % 16 : -1;
    if (s === lastStep) return;
    for (const lane of LANES) { if (lastStep >= 0) cells[lane][lastStep].classList.remove('now'); if (s >= 0) cells[lane][s].classList.add('now'); }
    lastStep = s;
  }
  return { el, update, renderLoops };
}
