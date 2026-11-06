// pageSeq.js — the 16-step chord sequencer.

import { h, win, button, tap } from './widgets.js';
import { SEQ_STEPS, STEP_BEATS } from '../core/chordSeq.js';

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
  const el = h('div.page', {}, win('Chord Sequencer', body));

  function update() {
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
