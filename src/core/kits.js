// kits.js — sort drum samples into kits by folder and by sound type, from
// their file paths and names. Pure functions.

// Order matters: the first rule that matches wins.
const RULES = [
  ['open', /open|o[-_ ]?hat|ohh|\boh\b/i],
  ['hat', /hat|hh|hihat|hi-hat|chh|\bch\b|closed/i],
  ['kick', /kick|kik|\bbd\b|bass ?drum|boom/i],
  ['snare', /snare|snr|\bsd\b|\bsn\b/i],
  ['rim', /rim|stick|clap|clp|snap/i],
  ['perc', /perc|shak|tamb|conga|bongo|cowbell|bell|tom|block|clave|cabasa|guiro|fx|vox|chant/i],
];

export const KINDS = ['kick', 'snare', 'hat', 'open', 'rim', 'perc', 'loop', 'other'];

export function classify(name, path = '') {
  const s = `${path} ${name}`.replace(/\.[a-z0-9]+$/i, '').replace(/[_\-.]+/g, ' '); // OH_tight -> OH tight
  if (/loop|break|groove|\d{2,3} ?bpm/i.test(s)) return 'loop';
  for (const [kind, re] of RULES) if (re.test(s)) return kind;
  return 'other';
}

export const isAudioFile = (name) => /\.(wav|wave|aif|aiff|mp3|m4a|aac|ogg|oga|flac|caf|webm)$/i.test(name);
export const isVideoFile = (name) => /\.(mp4|mov|m4v|webm|mkv)$/i.test(name);

/** The kit a file belongs to: its parent folder, or 'Imported' for loose files. */
export function kitNameFor(path) {
  const parts = path.split('/').filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 2] : 'Imported';
}

/** BPM written in a file name ("dusty loop 92bpm.wav"), or null. */
export function bpmFromName(name) {
  const m = /(\d{2,3})\s?bpm/i.exec(name) || /[_ -](\d{2,3})[_ -]/.exec(name);
  const n = m ? Number(m[1]) : null;
  return n && n >= 50 && n <= 200 ? n : null;
}

/**
 * Build kits from a list of files [{name, path}]. Each kit maps a lane
 * (kick, snare...) to the list of sample ids that fit it.
 */
export function buildKits(entries) {
  const kits = new Map();
  for (const e of entries) {
    if (e.kind === 'loop') continue;
    const name = kitNameFor(e.path || e.name);
    if (!kits.has(name)) kits.set(name, { name, lanes: { kick: [], snare: [], hat: [], open: [], rim: [], perc: [] }, other: [] });
    const kit = kits.get(name);
    if (kit.lanes[e.kind]) kit.lanes[e.kind].push(e.id); else kit.other.push(e.id);
  }
  // Fill empty lanes from "other" so every kit plays something.
  for (const kit of kits.values()) {
    for (const lane of Object.keys(kit.lanes)) if (!kit.lanes[lane].length && kit.other.length) kit.lanes[lane].push(kit.other[0]);
  }
  return [...kits.values()];
}
