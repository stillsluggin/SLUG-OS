// library.js — the drum and loop library: the built-in Slugz Delight kit
// (bundled in assets/drums) plus your private imports (IndexedDB only).

import { db, newId } from './db.js';
import { decode } from './media.js';
import { classify, isAudioFile, isVideoFile, buildKits, bpmFromName } from '../core/kits.js';
import { guessLoopBpm } from '../core/chops.js';

const BUILTIN_DIR = 'assets/drums/';

/**
 * Find the bundled kit's files. GitHub Pages can't list folders, so we try:
 *   1. assets/drums/kit.json  (made by `node tools/make-drum-manifest.mjs`)
 *   2. the GitHub API listing of the public repo (works on *.github.io)
 *   3. a local server's folder listing (python -m http.server)
 */
async function builtinFiles() {
  try {
    const r = await fetch(`${BUILTIN_DIR}kit.json`, { cache: 'no-cache' });
    if (r.ok) { const j = await r.json(); return (j.files || j.sounds || []).map((f) => (typeof f === 'string' ? { file: f } : f)); }
  } catch (e) { /* try next */ }
  const gh = /^([^.]+)\.github\.io$/.exec(location.hostname);
  if (gh) {
    const repo = location.pathname.split('/').filter(Boolean)[0];
    try {
      const r = await fetch(`https://api.github.com/repos/${gh[1]}/${repo}/contents/${BUILTIN_DIR.replace(/\/$/, '')}`);
      if (r.ok) return walkGitHub(await r.json());
    } catch (e) { /* try next */ }
  }
  try {
    const r = await fetch(BUILTIN_DIR);
    if (r.ok && /html/.test(r.headers.get('content-type') || '')) {
      const html = await r.text();
      return [...html.matchAll(/href="([^"?#]+)"/g)].map((m) => decodeURIComponent(m[1])).filter(isAudioFile).map((file) => ({ file }));
    }
  } catch (e) { /* none */ }
  return [];
}

async function walkGitHub(items, prefix = '') {
  const out = [];
  for (const it of items) {
    if (it.type === 'file' && isAudioFile(it.name)) out.push({ file: prefix + it.name });
    else if (it.type === 'dir') {
      try {
        const r = await fetch(it.url);
        if (r.ok) out.push(...await walkGitHub(await r.json(), `${prefix}${it.name}/`));
      } catch (e) { /* skip */ }
    }
  }
  return out;
}

export function createLibrary(ac) {
  const buffers = new Map(); // sampleId -> AudioBuffer
  let index = []; // sample metadata (no bytes)
  let kits = []; // private kits
  let builtin = null; // { name, lanes: {lane: [AudioBuffer]}, files: n, loops: [] }

  async function loadBuiltin() {
    if (builtin) return builtin;
    const files = await builtinFiles();
    const lanes = { kick: [], snare: [], hat: [], open: [], rim: [], perc: [] };
    const loops = [];
    await Promise.all(files.map(async (f) => {
      try {
        const r = await fetch(BUILTIN_DIR + f.file.split('/').map(encodeURIComponent).join('/'));
        if (!r.ok) return;
        const buf = await decode(ac, await r.arrayBuffer());
        const kind = f.kind || classify(f.file.split('/').pop(), f.file);
        if (kind === 'loop') loops.push({ id: `builtin:${f.file}`, name: f.file.split('/').pop(), buffer: buf, bpm: f.bpm || bpmFromName(f.file) || guessLoopBpm(buf.duration).bpm });
        else (lanes[kind] || lanes.perc).push(buf);
      } catch (e) { /* skip unreadable files */ }
    }));
    for (const l of Object.values(lanes)) l.sort((a, b) => a.duration - b.duration);
    builtin = { id: 'builtin', name: 'Slugz Delight (free)', lanes, files: files.length, loops };
    return builtin;
  }

  async function refresh() {
    try {
      const all = await db.all('samples');
      index = all.map(({ data, ...meta }) => meta);
      kits = await db.all('kits');
    } catch (e) { index = []; kits = []; }
  }

  async function bufferFor(id) {
    if (buffers.has(id)) return buffers.get(id);
    const rec = await db.get('samples', id);
    if (!rec) return null;
    const buf = await decode(ac, rec.data.slice(0));
    buffers.set(id, buf);
    return buf;
  }

  /** Resolve a kit to AudioBuffers per lane, ready for the drum player. */
  async function kitBuffers(kitId) {
    if (kitId === 'builtin') return loadBuiltin();
    if (kitId === 'synth') return { id: 'synth', name: 'Synth Bap', lanes: {} };
    const kit = kits.find((k) => k.id === kitId);
    if (!kit) return { id: 'synth', name: 'Synth Bap', lanes: {} };
    const lanes = {};
    for (const [lane, ids] of Object.entries(kit.lanes)) lanes[lane] = (await Promise.all(ids.slice(0, 8).map(bufferFor))).filter(Boolean);
    return { id: kit.id, name: kit.name, lanes };
  }

  /**
   * Import many files at once (a folder or a multi-select). Each file keeps
   * its folder path; drums are sorted into kits by folder and type, loops get
   * a BPM from the name or their length. Stored privately in IndexedDB.
   */
  async function importFiles(fileList, onProgress) {
    const files = [...fileList].filter((f) => isAudioFile(f.name) || isVideoFile(f.name));
    const added = [];
    let i = 0;
    for (const f of files) {
      i++;
      onProgress && onProgress(i / files.length, f.name);
      try {
        const data = await f.arrayBuffer();
        const path = f.webkitRelativePath || f.name;
        const kind = classify(f.name, path);
        let bpm = null;
        let buf = null;
        try { buf = await decode(ac, data.slice(0)); } catch (e) { continue; }
        if (kind === 'loop') bpm = bpmFromName(f.name) || guessLoopBpm(buf.duration).bpm;
        const rec = { id: newId(), name: f.name, path, kind, bpm, type: f.type, data, duration: buf.duration, added: Date.now() };
        await db.put('samples', rec);
        buffers.set(rec.id, buf);
        added.push(rec);
      } catch (e) { /* skip */ }
    }
    // Rebuild kits: one per folder.
    const newKits = buildKits(added).map((k) => ({ id: newId(), name: k.name, lanes: k.lanes }));
    if (newKits.length) await db.putMany('kits', newKits);
    await refresh();
    return { added: added.length, kits: newKits.length, loops: added.filter((a) => a.kind === 'loop').length };
  }

  async function saveBuffer(name, arrayBuffer, kind = 'other', buffer = null) {
    const rec = { id: newId(), name, path: name, kind, bpm: null, type: 'audio/wav', data: arrayBuffer, duration: buffer?.duration, added: Date.now() };
    await db.put('samples', rec);
    if (buffer) buffers.set(rec.id, buffer);
    await refresh();
    return rec.id;
  }

  async function removeKit(id) { await db.del('kits', id); await refresh(); }
  async function removeSample(id) { await db.del('samples', id); buffers.delete(id); await refresh(); }

  return {
    refresh, loadBuiltin, kitBuffers, importFiles, bufferFor, saveBuffer, removeKit, removeSample,
    get kits() { return kits; },
    get loops() { return index.filter((s) => s.kind === 'loop'); },
    get samples() { return index; },
    get builtin() { return builtin; },
  };
}
