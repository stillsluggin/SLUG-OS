// Writes assets/drums/kit.json listing the built-in kit's audio files and
// their sound type. Run after adding or renaming files:
//   node tools/make-drum-manifest.mjs
import fs from 'node:fs';
import path from 'node:path';
import { classify, isAudioFile, bpmFromName } from '../src/core/kits.js';

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'assets', 'drums');
const files = [];
(function walk(d, rel = '') {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) walk(path.join(d, e.name), `${rel}${e.name}/`);
    else if (isAudioFile(e.name)) {
      const file = rel + e.name;
      const kind = classify(e.name, file);
      files.push({ file, kind, ...(kind === 'loop' && bpmFromName(e.name) ? { bpm: bpmFromName(e.name) } : {}) });
    }
  }
})(dir);
fs.writeFileSync(path.join(dir, 'kit.json'), `${JSON.stringify({ name: 'Slugz Delight (free)', files }, null, 1)}\n`);
const count = files.reduce((m, f) => ((m[f.kind] = (m[f.kind] || 0) + 1), m), {});
console.log(`kit.json: ${files.length} files`, count);
