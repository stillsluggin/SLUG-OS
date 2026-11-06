// Makes small test WAVs (synthetic, original) for the smoke test: node tests/make-fixtures.mjs
import fs from 'node:fs';
const dir = new URL('./fixtures/', import.meta.url);
fs.mkdirSync(dir, { recursive: true });
function wav(name, seconds, fn, sr = 22050) {
  const n = Math.floor(seconds * sr);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, fn(i / sr))) * 30000), 44 + i * 2);
  fs.mkdirSync(new URL(name.split('/').slice(0, -1).join('/') + '/', dir), { recursive: true });
  fs.writeFileSync(new URL(name, dir), b);
}
const hit = (t, f, d) => Math.sin(2 * Math.PI * f * t) * Math.exp(-t / d);
wav('Crate Test/Dusty Kick.wav', 0.4, (t) => hit(t, 60 - t * 40, 0.12));
wav('Crate Test/Snare Crack.wav', 0.3, (t) => (Math.random() * 2 - 1) * Math.exp(-t / 0.06));
wav('Crate Test/Closed Hat.wav', 0.1, (t) => (Math.random() * 2 - 1) * Math.exp(-t / 0.02));
wav('Crate Test/soul loop 90bpm.wav', 2.6667, (t) => { const b = t % 0.6667; return hit(b, 55, 0.1) + 0.3 * Math.sin(2 * Math.PI * 220 * t) * 0.5; });
wav('chop-me.wav', 2, (t) => { const b = t % 0.5; return hit(b, 180, 0.08); });
console.log('fixtures written');
