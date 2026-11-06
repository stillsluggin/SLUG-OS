// pageSeq.js — the 16-step chord sequencer.

import { h, win, button, tap } from './widgets.js';
import { SEQ_STEPS, STEP_BEATS } from '../core/chordSeq.js';
import { PART_PLAYERS } from '../core/capture.js';
import { PLAYER_NAMES } from '../core/players.js';
import { spriteImg, PLAYER_TINTS } from './sprites.js';

export function seqPage({ session }) {
  const st = session.state;
  const onBtn = button('SEQ OFF', () => session.seqSet({ on: !st.seq.on }));
  const recBtn = button('REC', () => { session.buttonDown('rec'); session.buttonUp('rec'); });
  const autoBtn = button('★ AUTO', () => session.seqAuto(), 'hot');
  const clearBtn = button('CLEAR', () => session.seqClear());
  const lenLab = h('span.lab');
  const lenDown = button('−', () => session.seqSet({ length: Math.max(1, st.seq.length - 1) }), 'sm');
  const lenUp = button('+', () => session.seqSet({ length: Math.min(SEQ_STEPS, st.seq.length + 1) }), 'sm');
  const stepBtn = button('', () => session.seqSet({ stepBeats: STEP_BEATS[(STEP_BEATS.indexOf(st.seq.stepBeats) + 1) % STEP_BEATS.length] }), 'sm');

  const grid = h('div.seqgrid');
  const cells = Array.from({ length: SEQ_STEPS }, (_, i) => {
    const c = h('div.step', {}, h('span.no', { text: i + 1 }), h('span.ch'));
    tap(c, () => session.seqSelect(st.seqSel === i ? null : i));
    grid.append(c);
    return c;
  });
  const eraseBtn = button('ERASE STEP', () => st.seqSel != null && session.seqClear(st.seqSel), 'sm');

  const body = [
    h('div.row', {}, onBtn, recBtn, autoBtn, clearBtn),
    h('div.row', { style: 'margin-top:6px' }, h('span.lab', { text: 'LENGTH' }), lenDown, lenLab, lenUp, h('span.grow'), h('span.lab', { text: 'STEP' }), stepBtn),
    h('div', { style: 'margin-top:6px' }, grid),
    h('div.row', { style: 'margin-top:6px' }, eraseBtn, h('span.grow')),
    h('p.help', { text: 'Tap a step, then play a chord to write it (it moves to the next step). Or press REC and play along while the band runs. AUTO writes a loop in the current style using Next Chord.' }),
  ];
  // ---- Parts: what's been recorded for MELODY, BASS and SOLOIST
  const capBtn = button('CAPTURE', () => session.capture(), 'cap');
  const undoBtn = button('UNDO', () => session.undo());
  const loopLab = h('span.lab');
  const lanes = PART_PLAYERS.map((id) => {
    const cells = Array.from({ length: 16 }, () => h('i'));
    const count = h('span.pc');
    const clear = button('CLEAR', () => session.clearPart(id), 'sm');
    const row = h('div.part', {}, spriteImg('snail', 1, PLAYER_TINTS[id]), h('span.pn', { text: PLAYER_NAMES[id] }), h('span.roll', {}, cells), count, clear);
    return { id, row, cells, count, clear };
  });
  const partsWin = win('Parts', [
    h('div.row', {}, capBtn, undoBtn, h('span.grow'), loopLab),
    h('div.parts', { style: 'margin-top:6px' }, lanes.map((l) => l.row)),
    h('p.help', { text: 'Slug OS is always listening. Play some chords (and notes on MELODY, BASS or SOLOIST), then tap CAPTURE: it drops them into the sequencer and the parts, snapped to the beat. UNDO takes it back. A player with a part plays your notes instead of improvising.' }),
  ]);
  const el = h('div.page', {}, win('Chord Sequencer', body), partsWin);

  function updateParts() {
    const loop = session.partLoopBeats();
    loopLab.textContent = `LOOP ${loop / 4 >= 1 ? `${loop / 4} BAR${loop / 4 > 1 ? 'S' : ''}` : `${loop} BEATS`}`;
    undoBtn.disabled = !session.canUndo;
    for (const l of lanes) {
      const notes = st.parts[l.id];
      l.count.textContent = notes.length ? `${notes.length}♪` : '—';
      l.clear.disabled = !notes.length;
      l.cells.forEach((c, i) => { c.className = notes.some((n) => Math.floor((n.pos / loop) * 16) === i) ? 'on' : ''; });
    }
  }

  function update() {
    updateParts();
    const s = st.seq;
    onBtn.textContent = s.on ? 'SEQ ON' : 'SEQ OFF';
    onBtn.classList.toggle('on', s.on);
    recBtn.classList.toggle('hot', s.rec);
    lenLab.textContent = String(s.length);
    stepBtn.textContent = s.stepBeats === 4 ? '1 BAR' : `${s.stepBeats} BEAT${s.stepBeats > 1 ? 'S' : ''}`;
    cells.forEach((c, i) => {
      const ch = s.steps[i];
      c.querySelector('.ch').textContent = ch ? session.chordName(ch) : i < s.length ? '·' : '';
      c.classList.toggle('off', i >= s.length);
      c.classList.toggle('sel', st.seqSel === i);
      c.classList.toggle('now', st.playing && s.on && st.seqIndex === i);
    });
  }
  return { el, update };
}
