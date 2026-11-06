// Browser smoke test (Chromium + Playwright): node tests/smoke.mjs [url]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const url = process.argv[2] || 'http://127.0.0.1:8642/';
const outDir = new URL('./out/', import.meta.url).pathname;
const fx = new URL('./fixtures/', import.meta.url).pathname;
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const R = {};
const level = (page, ms) => page.evaluate(async (ms) => {
  const an = window.__slug.app.audio.analyser; const buf = new Float32Array(an.fftSize); let pk = 0; const end = performance.now() + ms;
  while (performance.now() < end) { an.getFloatTimeDomainData(buf); for (const x of buf) { if (!Number.isFinite(x)) return -1; pk = Math.max(pk, Math.abs(x)); } await new Promise((r) => setTimeout(r, 20)); }
  return +pk.toFixed(3);
}, ms);

const ctx = await browser.newContext({ ...devices['iPhone 13'], acceptDownloads: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('response', (r) => { if (r.status() === 404 && !/kit\.json$/.test(r.url())) errors.push(`404 ${r.url()}`); });
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts\.g|api\.github|status of 404/.test(m.text())) errors.push(m.text()); });
await page.goto(url);
await page.waitForTimeout(500);
await page.screenshot({ path: outDir + 'boot.png' });
await page.tap('#boot');
await page.waitForFunction(() => window.__slug && window.__slug.ac.state === 'running', null, { timeout: 8000 });
await page.waitForTimeout(300);
R.rest = await level(page, 200);
await page.tap('.clickbtn');
R.metronome = await level(page, 1500);
await page.tap('.clickbtn');
await page.waitForTimeout(300);
R.metronomeOff = await level(page, 800);

// chord + bend
const key = (i) => page.locator(`.key[data-i="${i}"]`);
await key(5).dispatchEvent('pointerdown', { pointerId: 1, clientY: 0 }).catch(() => {});
await page.evaluate(() => { const s = window.__slug.session; s.keyDown(5); s.keyUp(5); });
R.chord = await page.textContent('.now-name');
R.chordLevel = await level(page, 400);
await page.keyboard.down('ArrowUp'); await page.waitForTimeout(60); R.bent = await page.textContent('.now-name'); await page.keyboard.up('ArrowUp');
// BPM pop-up (not the drums page)
await page.tap('.menubar .pill >> nth=1');
R.bpmPopup = await page.evaluate(() => document.querySelector('.bpmpop').classList.contains('open') && !document.querySelector('.page.on').textContent.includes('Boom Bap'));
await page.tap('.bpmrow .bevel >> nth=1'); await page.tap('.bpmrow .bevel >> nth=1');
R.bpmPlus = await page.evaluate(() => window.__slug.session.state.tempo);
await page.fill('.bpmnum', '121'); await page.press('.bpmnum', 'Enter');
R.bpmTyped = await page.evaluate(() => window.__slug.session.state.tempo);
await page.tap('.bpm-win .win-title .bevel');
await page.evaluate(() => window.__slug.session.setTempo(88));
// key change transposes
await page.evaluate(() => { const s = window.__slug.session; s.keyDown(5); s.keyUp(5); s.setKey({ tonic: 5, mode: 'minor' }); });
await page.waitForTimeout(100);
R.transposed = await page.textContent('.now-name');
await page.evaluate(() => window.__slug.session.setKey({ tonic: 2, mode: 'minor' }));
// preset change cuts the old sound
R.presetSwap = await page.evaluate(async () => {
  const { session, app } = window.__slug;
  session.keyDown(0); session.keyUp(0);
  await new Promise((r) => setTimeout(r, 200));
  const before = app.audio.activeVoices();
  session.cyclePreset(0);
  await new Promise((r) => setTimeout(r, 120));
  return { before, after: app.audio.activeVoices(), voicing: session.state.voicing.length };
});
// chord history
await page.evaluate(() => { const s = window.__slug.session; for (const i of [0, 9, 4]) { s.keyDown(i); s.keyUp(i); } });
await page.waitForTimeout(100);
R.trailChips = await page.$$eval('.hchip', (els) => els.map((e) => e.textContent));
await page.tap('.hist .bevel:first-child'); await page.waitForTimeout(100);
R.afterBack = await page.textContent('.now-name');
await page.tap('.hchip >> nth=0'); await page.waitForTimeout(100);
R.afterChip = await page.textContent('.now-name');
// capture
await page.tap('.bevel.cap');
R.captured = await page.evaluate(() => window.__slug.session.state.seq.steps.filter(Boolean).map((c) => window.__slug.session.chordName(c)));
await page.tap('text=UNDO'); await page.waitForTimeout(80);
R.afterUndo = await page.evaluate(() => window.__slug.session.state.seq.steps.filter(Boolean).length);
await page.screenshot({ path: outDir + 'band.png' });

// all players follow + band plays
await page.evaluate(() => { const s = window.__slug.session; s.state.players.forEach((p, i) => { while (s.state.players[i].mode !== 'FOLLOW') s.cycleMode(i); }); s.setPlaying(true); });
R.band = await level(page, 2500);
// every engine on every melodic player
R.engines = {};
for (const pi of [0, 1, 2, 3]) {
  for (let e = 0; e < 7; e++) {
    await page.evaluate(([pi]) => window.__slug.session.cycleEngine(pi), [pi]);
    const name = await page.evaluate(([pi]) => window.__slug.session.state.players[pi].slot.engine, [pi]);
    R.engines[`${pi}:${name}`] = await level(page, 450);
  }
}
// MORPH knobs fully up on every engine
R.morph = await page.evaluate(async () => {
  const { session, app } = window.__slug;
  const an = app.audio.analyser; const buf = new Float32Array(an.fftSize);
  const res = {};
  session.state.morph = true;
  for (let e = 0; e < 7; e++) {
    session.cycleEngine(0);
    session.focus(0);
    session.knob(4, 1); session.knob(5, 1);
    let pk = 0, bad = false;
    const end = performance.now() + 350;
    while (performance.now() < end) { an.getFloatTimeDomainData(buf); for (const x of buf) { if (!Number.isFinite(x)) bad = true; pk = Math.max(pk, Math.abs(x)); } await new Promise((r) => setTimeout(r, 20)); }
    res[session.state.players[0].slot.engine] = bad ? -1 : +pk.toFixed(2);
  }
  session.state.morph = false;
  return res;
});
// bass modes
for (let m = 0; m < 6; m++) await page.evaluate(() => window.__slug.session.cycleFeel(2));
// harmony modes
for (let m = 0; m < 4; m++) { await page.evaluate(() => window.__slug.session.cycleFeel(0)); R[`harm${m}`] = await level(page, 400); }
// EXPORT
await page.tap('.menubar .logo');
R.exportOpen = await page.evaluate(() => document.querySelector('.export-wrap').classList.contains('open'));
const exportRun = async (setup) => {
  await page.evaluate(setup);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), (async () => {
    await page.tap('.export-win .bevel.hot');
    await page.waitForFunction(() => /Done:/.test(document.querySelector('.exstatus').textContent), null, { timeout: 30000 });
    await page.tap('.export-win button:has-text("SAVE FILE")');
  })()]);
  const path = await dl.path();
  return { name: dl.suggestedFilename(), bytes: fs.readFileSync(path) };
};
const setOpts = (o) => page.evaluate((o) => { for (const [lab, val] of Object.entries(o)) { const row = [...document.querySelectorAll('.exrow')].find((r) => r.querySelector('.lab').textContent === lab); [...row.querySelectorAll('.bevel')].find((b) => b.textContent === val).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), [...row.querySelectorAll('.bevel')].find((b) => b.textContent === val).dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); } }, o);
await setOpts({ RECORD: 'LOOP', BARS: '1', TAIL: '0s', FORMAT: 'STEREO MIX', RATE: '22.1k', BITS: '16' }).catch(() => {});
await setOpts({ RATE: '22.1k' }).catch(() => {});
let ex = await exportRun(() => {});
const rd = (b, o) => b.readUInt32LE(o);
R.exportMix = { name: ex.name, rate: rd(ex.bytes, 24), seconds: +(rd(ex.bytes, 40) / 4 / rd(ex.bytes, 24)).toFixed(3), expect: +(4 * 60 / (await page.evaluate(() => window.__slug.session.state.tempo))).toFixed(3) };
await setOpts({ FORMAT: 'MULTITRACK', RATE: '44.1k', BITS: '24' });
ex = await exportRun(() => {});
const names = []; for (let o = 0; o < ex.bytes.length - 4; o++) if (ex.bytes.readUInt32LE(o) === 0x04034b50) { const nl = ex.bytes.readUInt16LE(o + 26); names.push(ex.bytes.slice(o + 30, o + 30 + nl).toString()); }
const sizes = []; for (let o = 0; o < ex.bytes.length - 4; o++) if (ex.bytes.readUInt32LE(o) === 0x04034b50) sizes.push(ex.bytes.readUInt32LE(o + 18));
R.exportStems = { name: ex.name, files: names.map((n) => n.split('/').pop()), sameLength: new Set(sizes).size === 1 };
await setOpts({ RECORD: 'LIVE', FORMAT: 'STEREO MIX' });
await page.tap('.export-win .bevel.hot'); await page.waitForTimeout(1200);
await page.tap('.export-win .bevel.hot');
await page.waitForFunction(() => /Done:/.test(document.querySelector('.exstatus').textContent), null, { timeout: 30000 });
R.exportLive = await page.textContent('.exstatus');
await page.tap('.export-win button:has-text("SAMPLER PAD")'); await page.waitForTimeout(400);
R.exportToPad = await page.evaluate(() => window.__slug.app.pads.filter((p) => p.sampleId && p.name.startsWith('take')).length);
const [pj] = await Promise.all([page.waitForEvent('download'), page.tap('.export-win button:has-text("SAVE PROJECT")')]);
const proj = JSON.parse(fs.readFileSync(await pj.path(), 'utf8'));
R.project = { format: proj.format, style: proj.session.style, hasSeq: !!proj.session.seq };
await page.tap('.export-win .win-title .bevel');
await page.evaluate(() => window.__slug.session.setPlaying(true));
// SHELL SHOCK (band still playing)
await page.click('.dock .bevel:nth-child(5)'); await page.waitForTimeout(200);
await page.evaluate(() => window.__slug.app.audio.master.xy.ready);
R.worklet = await page.evaluate(() => window.__slug.app.audio.master.xy.worklet);
R.xyBase = await level(page, 400);
const pad = await page.locator('.xypad').boundingBox();
const at = (fx, fy) => [pad.x + pad.width * fx, pad.y + pad.height * (1 - fy)];
const drag = async (fx, fy, ms = 500) => { await page.mouse.move(...at(fx, fy)); await page.mouse.down(); await page.waitForTimeout(80); const l = await level(page, ms); await page.mouse.up(); return l; };
const setFx = (x, y) => page.evaluate(([x, y]) => { const a = window.__slug.app; a.xy.x = x; a.xy.y = y; window.__slug.pages.fx.apply(); window.__slug.pages.fx.update(); }, [x, y]);
// every effect, on X and on Y
R.xy = {};
const effects = await page.evaluate(async () => (await import('/src/core/xy.js')).XY_EFFECTS);
for (let i = 0; i < effects.length; i++) {
  const y = effects[(i + 7) % effects.length];
  await setFx(effects[i], y);
  R.xy[`${effects[i]}+${y}`] = await drag(0.75, 0.75, 350);
  await page.waitForTimeout(150);
}
R.xyBroken = Object.entries(R.xy).filter(([, v]) => v < 0).map(([k]) => k);
// hidden knobs at both extremes on every effect
R.xyParamsBroken = await page.evaluate(async (effects) => {
  const { app } = window.__slug;
  const xy = app.audio.master.xy;
  const an = app.audio.analyser; const buf = new Float32Array(an.fftSize);
  const bad = [];
  for (const id of effects) {
    xy.setEffect('x', id); xy.setAmount('x', 0.8);
    for (const v of [0, 1]) {
      const p = {}; for (const k of ['res', 'range', 'low', 'mid', 'feel', 'fade', 'rate', 'color', 'fb', 'time', 'tone', 'spin', 'dark', 'grid', 'soft', 'mix', 'era', 'hiss', 'crackle', 'size', 'damp', 'depth', 'square', 'glide', 'pattern', 'smooth', 'length', 'shape', 'center']) p[k] = v;
      xy.setParams('x', p);
      await new Promise((r) => setTimeout(r, 150));
      an.getFloatTimeDomainData(buf);
      if (buf.some((x) => !Number.isFinite(x))) bad.push(`${id}@${v}`);
    }
    xy.setAmount('x', 0);
  }
  return bad;
}, effects);
// LFO filter: the level should pulse (vary) over time when deep
R.lfoPulse = await page.evaluate(async () => {
  const { app, session } = window.__slug;
  const xy = app.audio.master.xy;
  xy.setEffect('x', 'lfofilter', { rate: 0.6, res: 0.5, shape: 0, center: 0.1 }); xy.setAmount('x', 1);
  xy.setEffect('y', 'filter'); xy.setAmount('y', 0);
  const an = app.audio.analyser; const buf = new Float32Array(an.fftSize);
  const lv = [];
  const end = performance.now() + 2000;
  while (performance.now() < end) { an.getFloatTimeDomainData(buf); let e = 0; for (const x of buf) e += x * x; lv.push(Math.sqrt(e / buf.length)); await new Promise((r) => setTimeout(r, 30)); }
  xy.setAmount('x', 0);
  return +((Math.max(...lv) - Math.min(...lv)) / (Math.max(...lv) || 1)).toFixed(2);
});
// AFFECTS: a full tape stop aimed at SAMPLER leaves the band playing; at ALL it goes silent
R.affects = await page.evaluate(async () => {
  const { app } = window.__slug;
  const xy = app.audio.master.xy;
  const an = app.audio.analyser; const buf = new Float32Array(an.fftSize);
  const lvl = async (ms) => { let pk = 0; const e = performance.now() + ms; while (performance.now() < e) { an.getFloatTimeDomainData(buf); for (const x of buf) pk = Math.max(pk, Math.abs(x)); await new Promise((r) => setTimeout(r, 20)); } return +pk.toFixed(3); };
  xy.setEffect('x', 'tapestop'); xy.setEffect('y', 'filter');
  const out = {};
  for (const t of ['SAMPLER', 'ALL']) {
    app.audio.setXYTarget(t);
    xy.setAmount('x', 1);
    await new Promise((r) => setTimeout(r, 900));
    out[t] = await lvl(300);
    xy.setAmount('x', 0);
    await new Promise((r) => setTimeout(r, 1500));
  }
  app.audio.setXYTarget('ALL');
  return out;
});
// TWEAK drawer opens with knobs for both axes
await setFx('lfofilter', 'delay');
await page.tap('button:has-text("TWEAK")');
R.tweakKnobs = await page.$$eval('.tweakrow', (rows) => rows.map((r) => [...r.querySelectorAll('.kl')].map((k) => k.textContent).join(',')));
await page.tap('button:has-text("TWEAK")');
// the loader: tap X, pick TAPE STOP from the list
await page.tap('.loader >> nth=0');
R.loaderRows = await page.$$eval('.fxrow', (els) => els.length);
await page.tap('.fxrow:has-text("TAPE STOP")');
R.loadedX = await page.evaluate(() => window.__slug.app.xy.x);
await setFx('tapestop', 'tapestop');
// expressive tape stop: just past the start = slow wind-down, far end = instant
await page.mouse.move(...at(0.12, 0.03)); await page.mouse.down();
await page.waitForTimeout(500);
R.tapeSlowAfterHalfSecond = await level(page, 200);
await page.mouse.up(); await page.waitForTimeout(1200);
await page.mouse.move(...at(0.97, 0.03)); await page.mouse.down();
await page.waitForTimeout(500);
R.tapeStopEnd = await level(page, 300);
// drag back towards the start: it spins back up
await page.mouse.move(...at(0.3, 0.03), { steps: 10 }); await page.mouse.move(...at(0.02, 0.03), { steps: 10 });
await page.waitForTimeout(700);
R.tapeBackUp = await level(page, 300);
await page.mouse.up();
await page.waitForTimeout(600);
R.snappedBack = await page.evaluate(() => window.__slug.app.xy.ax === 0 && window.__slug.app.xy.ay === 0);
R.afterTapeStop = await level(page, 600);
await page.click('text=HOLD');
await drag(0.5, 0.5, 100); await page.waitForTimeout(400);
R.holdKeeps = await page.evaluate(() => window.__slug.app.xy.ax > 0.4);
await page.click('text=HOLD'); await page.waitForTimeout(400);
// auto-named combos: save, rename, load, delete
await setFx('lofi', 'wash');
R.comboName = await page.textContent('.comboname');
const before = await page.evaluate(() => window.__slug.app.xy.combos.length);
await page.tap('.namerow .bevel.hot');
R.saved = (await page.evaluate(() => window.__slug.app.xy.combos.length)) - before;
page.once('dialog', (d) => d.accept('My Mossy Thing'));
await page.tap('button.bevel:text-is("EDIT")');
await page.locator('.comboedit').last().locator('.bevel.sm').first().tap();
await page.waitForTimeout(100);
R.renamed = await page.evaluate(() => window.__slug.app.xy.combos.at(-1).name);
await page.locator('.comboedit').last().locator('.bevel.sm').last().tap();
R.afterDelete = (await page.evaluate(() => window.__slug.app.xy.combos.length)) - before;
await page.tap('button.bevel:text-is("DONE")');
await page.tap('.combo >> nth=1'); await page.waitForTimeout(100);
R.combo = await page.evaluate(() => `${window.__slug.app.xy.x}+${window.__slug.app.xy.y}`);
await page.screenshot({ path: outDir + 'xy.png' });
// live recording into a part (band is playing)
await page.evaluate(() => { const s = window.__slug.session; s.focus(3); s.setRec(true); });
await page.waitForTimeout(100);
R.recPill = await page.textContent('.recpill');
await page.evaluate(async () => { const s = window.__slug.session; for (const i of [12, 14, 16]) { s.keyDown(i); await new Promise((r) => setTimeout(r, 180)); s.keyUp(i); } });
R.liveNotes = await page.evaluate(() => window.__slug.session.state.parts.soloist.length);
await page.tap('.recpill'); await page.waitForTimeout(50);
R.recPill2 = await page.textContent('.recpill');
await page.evaluate(() => { const s = window.__slug.session; s.undo(); s.setRec(false); s.toggleRecMode(); });
R.afterPassUndo = await page.evaluate(() => window.__slug.session.state.parts.soloist.length);
await page.evaluate(() => window.__slug.session.seqAuto());
await page.click('.dock .bevel:nth-child(2)'); await page.waitForTimeout(1500);
await page.screenshot({ path: outDir + 'seq.png' });
R.seqChords = await page.$$eval('.step .ch', (els) => els.slice(0, 4).map((e) => e.textContent));
await page.click('.dock .bevel:nth-child(3)'); await page.waitForTimeout(300);
await page.screenshot({ path: outDir + 'drums.png' });
// private import into drums
await page.setInputFiles('input[webkitdirectory]', fx + 'Crate Test');
await page.waitForFunction(() => /Added/.test(document.querySelector('.page.on .help')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
R.import = await page.$eval('.page.on .help', (e) => e.textContent);
R.kits = await page.$$eval('.kitlist .bevel', (els) => els.map((e) => e.textContent));
R.loops = await page.$$eval('.loop .nm', (els) => els.map((e) => e.textContent));
await page.evaluate(() => window.__slug.session.setPlaying(false));
await page.waitForTimeout(400);
await page.screenshot({ path: outDir + 'drums2.png' });
// sampler
await page.click('.dock .bevel:nth-child(4)'); await page.waitForTimeout(300);
await page.setInputFiles('.page.on input[type=file]', fx + 'chop-me.wav');
await page.waitForFunction(() => /saved privately/.test(document.querySelector('.page.on .help')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
R.samplerInfo = await page.$eval('.page.on .help', (e) => e.textContent);
await page.evaluate(() => document.querySelector('.pads16 .pad').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
R.padLevel = await level(page, 300);
// pitch & stretch algorithms
R.stretch = await page.evaluate(async () => {
  const { app } = window.__slug;
  const pad = app.pads[0];
  const buf = await app.bufferFor(pad.sampleId);
  const res = {};
  for (const [name, patch] of [['smooth2x', { warp: 'SMOOTH', stretch: 2 }], ['beats2x', { warp: 'BEATS', stretch: 2 }], ['keepTime+7', { pitchMode: 'KEEP TIME', pitch: 7 }], ['sync', { warp: 'SMOOTH', warpToBpm: true, srcBpm: 60 }]]) {
    const t0 = performance.now();
    const plan = app.playPad(buf, { ...pad, ...patch }, null, 'test');
    res[name] = { algo: plan.algo, outSeconds: +((pad.end - pad.start) * plan.factor / plan.rate).toFixed(2), ms: Math.round(performance.now() - t0) };
  }
  return res;
});
R.stretchLevel = await level(page, 400);
await page.click('text=CHOP BANK');
await page.click('text=HITS');
R.chops = await page.$$eval('.pads16 .pad.filled', (els) => els.length);
await page.screenshot({ path: outDir + 'sampler.png' });
// persistence: reload and check pads + kit survive
await page.waitForTimeout(600);
await page.reload(); await page.waitForTimeout(800); await page.tap('#boot'); await page.waitForTimeout(600);
await page.click('.dock .bevel:nth-child(3)'); await page.waitForTimeout(300);
R.persistedKits = await page.$$eval('.kitlist .bevel', (els) => els.length);
R.persistedPad = await page.evaluate(async () => { const r = indexedDB.open('slug-os'); return new Promise((res) => { r.onsuccess = () => { const t = r.result.transaction('kv').objectStore('kv').get('pads'); t.onsuccess = () => res(t.result?.value?.[0]?.bank?.chops?.length || 0); }; }); });
await ctx.close();

// desktop screenshot
const d = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const dp = await d.newPage();
dp.on('pageerror', (e) => errors.push(`desktop: ${e.message}`));
await dp.goto(url); await dp.click('#boot');
await dp.waitForFunction(() => window.__slug, null, { timeout: 8000 });
await dp.evaluate(() => { const s = window.__slug.session; s.keyDown(9); s.keyUp(9); });
await dp.waitForTimeout(400);
await dp.screenshot({ path: outDir + 'desktop.png' });
await d.close();
await browser.close();
console.log(JSON.stringify(R, null, 1));
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no errors');
