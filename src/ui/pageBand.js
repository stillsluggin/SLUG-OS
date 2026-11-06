// pageBand.js — the home screen: what's playing, Next Chord, the five Slug
// Band players, the 7 knobs and the buttons.

import { h, win, hold, tap, button, knob } from './widgets.js';
import { spriteImg, PLAYER_TINTS } from './sprites.js';
import { TAGS } from '../core/nextChord.js';
import { ENGINES } from '../core/engines.js';
import { PLAYER_NAMES } from '../core/players.js';
import { KNOBS, BEND_INFO } from '../core/controls.js';

export function bandPage({ session }) {
  const st = session.state;

  // ---- Now playing + Next Chord
  const name = h('div.now-name');
  const roman = h('div.now-roman');
  const bends = h('div.now-bends');
  const best = h('button.next-best', { 'data-slot': 'best', type: 'button' }, h('span.lab', { text: 'NEXT' }), h('span.nm'), h('span.why'));
  hold(best, () => session.pickDown('best'), () => session.pickUp('best'));
  const alts = h('div.alts');
  const altEls = {};
  for (const t of TAGS) {
    const a = h('button.alt', { 'data-slot': t, type: 'button' }, h('span.tg', { text: t }), h('span.nm'));
    hold(a, () => session.pickDown(t), () => session.pickUp(t));
    altEls[t] = a;
    alts.append(a);
  }
  // Chord History: BACK / FORWARD and a little slime trail of recent chords.
  const chips = h('div.hchips');
  const backBtn = button('◂', () => session.historyBack(), 'sm');
  const fwdBtn = button('▸', () => session.historyForward(), 'sm');
  backBtn.title = 'Back to the previous chord ( [ )';
  fwdBtn.title = 'Forward ( ] )';
  const hist = h('div.hist', {}, backBtn, chips, fwdBtn);
  const nowWin = win('Now Playing', [h('div.now-row', {}, name, roman, hist), best, alts], { cls: 'span' });
  let lastTrailKey = '';
  function renderTrail() {
    const t = session.trail;
    const win5 = t.window(5);
    const key = `${t.entries.length}|${t.pos}|${win5.map((e) => e.name).join()}`;
    if (key === lastTrailKey) return;
    lastTrailKey = key;
    chips.innerHTML = '';
    if (!win5.length) chips.append(h('span.hempty', { text: 'your chords leave a trail here' }));
    for (const e of win5) {
      const c = h('button.hchip', { type: 'button', title: `${e.roman} · tap to play again` }, e.name);
      if (e.current) c.classList.add('cur');
      tap(c, () => session.historyGo(e.index));
      chips.append(c);
    }
    backBtn.disabled = t.pos <= 0;
    fwdBtn.disabled = !t.browsing;
  }

  // ---- The band
  const band = h('div.band');
  const members = st.players.map((p, i) => {
    const av = h('div.avatar', {}, spriteImg('snail', 2, PLAYER_TINTS[p.id]));
    const mode = h('span.chip');
    tap(mode, (ev) => { ev.stopPropagation(); session.cycleMode(i); });
    mode.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    const eng = h('span.eng');
    const m = h('div.member', {}, av, h('span.nm', { text: PLAYER_NAMES[p.id] }), eng, mode);
    tap(m, () => session.focus(i));
    band.append(m);
    return { m, mode, eng };
  });
  const focusName = h('span.nm');
  const engBtn = button('ENGINE', () => session.cycleEngine(st.focus));
  const presetBtn = button('', () => session.cyclePreset(st.focus), 'preset');
  const feelBtn = button('', () => session.cycleFeel(st.focus));
  const focusbar = h('div.focusbar', {}, focusName, engBtn, presetBtn, feelBtn);
  const bandWin = win('The Slug Band', [band, focusbar], { cls: 'span' });

  // ---- Knobs + buttons
  const knobs = KNOBS.map((k, i) => knob({ label: () => session.knobLabel(i), get: () => session.knobValue(i), set: (v) => session.knob(i, v), steps: k.steps }));
  const btn = (id, label) => {
    const b = h('button.bevel', { type: 'button' }, label);
    hold(b, () => session.buttonDown(id), () => session.buttonUp(id));
    return b;
  };
  const latchBtn = btn('latch', 'BASS LATCH');
  const keyBtn = btn('key', 'KEY');
  const recBtn = btn('rec', 'REC');
  const playerBtn = btn('player', 'PLAYER ▸');
  const panel = win('Controls', h('div.panel', {}, h('div.knobs', {}, knobs.map((k) => k.el)), h('div.buttons', {}, latchBtn, keyBtn, recBtn, playerBtn)), { cls: 'span' });

  const el = h('div.page.cols', {}, nowWin, bandWin, panel);

  const hitTimers = new Map();
  function flash(ids, time, now) {
    const delay = Math.max(0, (time - now) * 1000);
    for (const id of ids) {
      const i = st.players.findIndex((p) => p.id === id);
      if (i < 0) continue;
      setTimeout(() => {
        const m = members[i].m;
        m.classList.remove('hit');
        void m.offsetWidth;
        m.classList.add('hit');
        clearTimeout(hitTimers.get(i));
        hitTimers.set(i, setTimeout(() => m.classList.remove('hit'), 240));
      }, delay);
    }
  }

  function update() {
    const m = session.screenModel();
    name.textContent = m.chordName || (m.keySelect ? 'pick a key…' : 'play a chord');
    name.classList.toggle('idle', !m.chordName);
    roman.textContent = m.roman;
    renderTrail();
    bends.textContent = m.bends.map((b) => BEND_INFO[b].arrow + BEND_INFO[b].label).join(' ');
    best.querySelector('.nm').textContent = m.best.name;
    best.querySelector('.why').textContent = `${m.best.roman} · ${m.best.why}`;
    for (const t of TAGS) {
      const a = m.alts.find((x) => x.tag === t);
      altEls[t].querySelector('.nm').textContent = a ? a.name : '—';
      altEls[t].title = a ? `${a.roman}: ${a.why}` : '';
      altEls[t].disabled = !a;
    }
    st.players.forEach((p, i) => {
      const { m: mem, mode, eng } = members[i];
      mem.className = `member ${p.mode}${i === st.focus ? ' focus' : ''}`;
      mode.className = `chip ${p.mode}`;
      mode.textContent = p.mode;
      eng.textContent = p.slot ? ENGINES[p.slot.engine].name : 'KIT';
    });
    const f = st.players[st.focus];
    focusName.textContent = `${PLAYER_NAMES[f.id]}:`;
    engBtn.style.display = presetBtn.style.display = f.slot ? '' : 'none';
    if (f.slot) {
      engBtn.textContent = `◂ ${ENGINES[f.slot.engine].name} ▸`;
      presetBtn.textContent = `${ENGINES[f.slot.engine].presets[f.slot.preset].name} ▸`;
    }
    feelBtn.style.display = f.id === 'harmony' || f.id === 'bass' ? '' : 'none';
    feelBtn.textContent = f.id === 'harmony' ? `PLAY: ${f.harmonyMode}` : f.id === 'bass' ? `FOLLOW: ${f.bassMode}` : '';
    knobs.forEach((k) => k.update());
    latchBtn.classList.toggle('on', st.players[2].mode === 'FOLLOW');
    keyBtn.classList.toggle('on', st.keySelect);
    recBtn.classList.toggle('hot', st.seq.rec);
  }

  return { el, update, flash };
}
