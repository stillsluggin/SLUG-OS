// db.js — private, on-device storage (IndexedDB). Your imported samples,
// loops, kits and sampler pads live ONLY in this browser on this device.
// Nothing here is ever uploaded or committed.
//
// Stores:
//   samples  { id, name, path, kind, bpm, type, data: ArrayBuffer (original file bytes), added }
//   kits     { id, name, lanes: { kick: [sampleId...] ... } }
//   kv       { key, value }   settings, session state, sampler pads

const DB_NAME = 'slug-os';
const VERSION = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB not available')); return; }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('samples')) db.createObjectStore('samples', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kits')) db.createObjectStore('kits', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const db = {
  put: (store, value) => tx(store, 'readwrite', (s) => reqP(s.put(value))),
  putMany: (store, values) => tx(store, 'readwrite', (s) => Promise.all(values.map((v) => reqP(s.put(v))))),
  get: (store, key) => tx(store, 'readonly', (s) => reqP(s.get(key))),
  all: (store) => tx(store, 'readonly', (s) => reqP(s.getAll())),
  del: (store, key) => tx(store, 'readwrite', (s) => reqP(s.delete(key))),
  clear: (store) => tx(store, 'readwrite', (s) => reqP(s.clear())),
  async getKV(key, fallback = null) {
    try { const r = await this.get('kv', key); return r ? r.value : fallback; } catch (e) { return fallback; }
  },
  setKV(key, value) { return this.put('kv', { key, value }).catch(() => {}); },
  /** Ask the browser not to evict our data (best effort). */
  async persist() { try { return await navigator.storage?.persist?.(); } catch (e) { return false; } },
  async usage() { try { return await navigator.storage?.estimate?.(); } catch (e) { return null; } },
};

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
