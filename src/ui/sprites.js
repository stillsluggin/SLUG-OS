// sprites.js — original pixel art for Slug OS, drawn from tiny text bitmaps.
// Each character is one pixel; '.' is transparent. Rendered once to a canvas
// and used as crisp, scaled-up images (image-rendering: pixelated).

export const PALETTE = {
  k: '#2b1d14', // ink
  c: '#f4e9cc', // cream
  w: '#fffaf0', // shine
  s: '#d9823b', // shell
  S: '#8c4a22', // shell shadow
  y: '#f2b35e', // shell light
  b: '#cdd69a', // snail body
  B: '#94a362', // body shadow
  m: '#6b8f3a', // moss
  M: '#3f5a26', // moss dark
  l: '#a6c94e', // leaf
  d: '#9ad8ea', // dew
  D: '#4a9fc4', // dew dark
  p: '#e07a6a', // blush
  r: '#c45545', // red cap
  g: '#b6e35a', // slime
  t: '#e6d3a8', // tan
};

const ART = {
  snail: [
    '...............k...k',
    '...............k...k',
    '.....kkkkk......k.k.',
    '...kksssssk.....kbk.',
    '..ksyyssssSk...kbbbk',
    '.ksyykkkkksSk.kbbkbk',
    '.ksyk.sssksSkkbbbbbk',
    '.kssksyykssSkbbbpbk.',
    '.kssksskkssSkbbbbbk.',
    '..kSssssssSkbbbbbk..',
    '...kkSSSSSkbbbbbk...',
    'kkkbbbbbbbbbbbbbk...',
    'kBBBBBBBBBBBBBBk....',
    '.kkkkkkkkkkkkkk.....',
  ],
  slug: [
    '...........k..k',
    '...........k..k',
    '............kk.',
    '......kkkkkbbbk',
    '...kkkbbbbbbkbk',
    '.kkbbbbbbbbbbbk',
    'kBBBBBBBBBBBBk.',
    '.kkkkkkkkkkkk..',
  ],
  shell: [
    '.....kkkkkk.....',
    '...kkyyyyyskk...',
    '..kyyyssssssSk..',
    '.kyyskkkkkksSSk.',
    '.kyskssssssksSk.',
    'kyysksyyyyskssSk',
    'kysksykkkksksSSk',
    'kysksyk..ksksSSk',
    'kysksyks.ksksSSk',
    'kyskssykkksksSSk',
    'kyssksssssskSSSk',
    '.kssskkkkkkSSSk.',
    '.kSsssssssSSSSk.',
    '..kSSSSSSSSSSk..',
    '...kkSSSSSSkk...',
    '.....kkkkkk.....',
  ],
  leaf: [
    '......kk.',
    '....kkllk',
    '..kkllllk',
    '.kllmlllk',
    'kllmllkk.',
    'klmlkk...',
    'kmkk.....',
    'k........',
  ],
  dew: [
    '..k..',
    '.kdk.',
    'kdwdk',
    'kddDk',
    'kdDDk',
    '.kkk.',
  ],
  mush: [
    '..kkkk..',
    '.krrcrk.',
    'krcrrrrk',
    'kkkkkkkk',
    '..kcck..',
    '..kcck..',
    '..kkkk..',
  ],
  moss: [
    '.m..M..m.m..M.m.',
    'mMm.mm.MmMm.mMmm',
    'MmMmMMmMMmMmMMmM',
  ],
  play: [
    'k.....',
    'kkk...',
    'kckk..',
    'kccckk',
    'kckk..',
    'kkk...',
    'k.....',
  ],
  stop: [
    'kkkkkk',
    'kcccck',
    'kcccck',
    'kcccck',
    'kkkkkk',
  ],
  // Dock icons
  iconBand: [
    '....kkkkkk....',
    '..kkcccccckk..',
    '.kccckkkkccck.',
    '.kcck....kcck.',
    'kcck......kcck',
    'kkkk......kkkk',
    'kssk......kssk',
    'kSSk......kSSk',
    '.kk........kk.',
  ],
  iconSeq: [
    'kkkkkkkkkkkkkk',
    'kgkkcckkgkkcck',
    'kgkkcckkgkkcck',
    'kkkkkkkkkkkkkk',
    'kcckkgkkcckkgk',
    'kcckkgkkcckkgk',
    'kkkkkkkkkkkkkk',
  ],
  iconDrums: [
    '..kkkkkkkkkk..',
    '.kccccccccccck',
    'kcccccccccccck',
    'kkccccccccccck',
    'ksskkkkkkkksk.',
    'kssssssssssssk',
    'kSSSSSSSSSSSSk',
    '.kkkkkkkkkkkk.',
  ],
  iconFx: [
    '....kkkkk...d.',
    '..kksyyyskk.d.',
    '.ksyskkkysk.dd',
    'kssksyyksSk...',
    'kssksykksSk.d.',
    'kSssskkssSk...',
    '.kSSSSSSSk....',
    'kkkkkkkkkkkkk.',
  ],
  iconSampler: [
    'kkkkkkkkkkkkkk',
    'kcccccccccccck',
    'kcckcccccckcck',
    'kckkkcckckkkck',
    'kkkkkkkkkkkkkk',
    'kdkdkdkdkdkdkk',
    'kkkkkkkkkkkkkk',
  ],
};

const cache = new Map();

/** Data URL of a sprite. `tint` maps palette letters to other colours (e.g. shell colour per player). */
export function sprite(name, tint = null) {
  const key = name + JSON.stringify(tint || {});
  if (cache.has(key)) return cache.get(key);
  const rows = ART[name];
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    g.fillStyle = (tint && tint[ch]) || PALETTE[ch] || '#f0f';
    g.fillRect(x, y, 1, 1);
  }));
  const url = cv.toDataURL();
  cache.set(key, { url, w, h });
  return cache.get(key);
}

/** An <img> element for a sprite at an integer scale. */
export function spriteImg(name, scale = 2, tint = null, cls = '') {
  const s = sprite(name, tint);
  const img = document.createElement('img');
  img.src = s.url;
  img.width = s.w * scale;
  img.height = s.h * scale;
  img.alt = '';
  img.draggable = false;
  img.className = `px ${cls}`;
  return img;
}

// Shell colours for each band member's snail.
export const PLAYER_TINTS = {
  harmony: { s: '#d9823b', y: '#f2b35e', S: '#8c4a22' },
  melody: { s: '#c9a0dc', y: '#e8cff2', S: '#7a4f8f' },
  bass: { s: '#5f9e6e', y: '#9bd3a2', S: '#2f5e3a' },
  soloist: { s: '#e07a6a', y: '#f5b0a2', S: '#8f3b30' },
  drummer: { s: '#4a9fc4', y: '#9ad8ea', S: '#245c78' },
};
