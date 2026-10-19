import { BACKINGS, EMBLEMS, FlagDesign, PATTERNS, SHAPES } from './heraldry';
import { Livery, PLAYER_LIVERY } from './shipTypes';
import { progressSaved } from '../core/progress';

// The player's ship styling: flag, sails and paintwork. Saved locally and
// turned into a Livery for the ship builder.

export type SailPattern = 'plain' | 'stripes' | 'band' | 'border' | 'cross' | 'diagonal';

export interface SailLook {
  cloth: string;
  accent: string;
  pattern: SailPattern;
  mark: boolean; // carry the flag's emblem on the main sails
  markColor: string;
}

export interface HullLook {
  planks: string;
  topsides: string;
  wale: string;
  gilding: string;
  boot: string;
  bottom: string;
}

export interface ShipLook {
  flag: FlagDesign;
  sail: SailLook;
  hull: HullLook;
  name: string;
}

export const SAIL_PATTERNS: { id: SailPattern; name: string }[] = [
  { id: 'plain', name: 'Plain' },
  { id: 'stripes', name: 'Stripes' },
  { id: 'band', name: 'Band' },
  { id: 'border', name: 'Border' },
  { id: 'cross', name: 'Cross' },
  { id: 'diagonal', name: 'Diagonal' },
];

export const HULL_PARTS: { id: keyof HullLook; name: string; palette: 'wood' | 'paint' | 'metal' }[] = [
  { id: 'topsides', name: 'Topsides', palette: 'paint' },
  { id: 'planks', name: 'Planking', palette: 'wood' },
  { id: 'bottom', name: 'Bottom', palette: 'paint' },
  { id: 'boot', name: 'Waterline', palette: 'paint' },
  { id: 'wale', name: 'Wale', palette: 'wood' },
  { id: 'gilding', name: 'Gilding', palette: 'metal' },
];

export const PALETTES = {
  flag: ['#141212', '#f3ecdc', '#b8262b', '#1fa3a0', '#1b3f7a', '#2f7d3a', '#f2c45a', '#e86a2c', '#6b2f86', '#e98fb0', '#7a4b2a', '#8fd3e8', '#0e5a5e', '#c9b38a'],
  sail: ['#f4ead4', '#fbf7ee', '#e6d3ad', '#c9a97a', '#3a3634', '#1d1b1b', '#9c2a2a', '#c4533a', '#1f6f8b', '#27407a', '#2f6b47', '#d9a441', '#7d4a8c', '#e7a3a0'],
  wood: ['#7a4b2a', '#5a3620', '#3f2a1e', '#9b6a3e', '#b98b5a', '#2b1d15', '#6e5a48', '#8a3f2a'],
  paint: ['#1f8a8a', '#b33a2c', '#21160f', '#f5efe1', '#1d3f73', '#2f6b3d', '#d9a441', '#5b3a7a', '#e46f4b', '#0f5c63', '#c8d6d2', '#962e4f', '#2c2a2a', '#78a6c8'],
  metal: ['#e2b552', '#c9944a', '#b87333', '#d8d8d2', '#8c8a84', '#2a2a2e', '#d4b26a', '#7fb7a8'],
};

export const DEFAULT_LOOK: ShipLook = {
  flag: {
    shape: 'swallowtail',
    bg: PLAYER_LIVERY.flag,
    pattern: 'plain',
    patternColor: '#f3ecdc',
    emblem: 'sun',
    emblemColor: PLAYER_LIVERY.flag2,
    backing: 'none',
    emblemScale: 1,
    paint: '',
  },
  sail: { cloth: PLAYER_LIVERY.sail, accent: '#1f8a8a', pattern: 'plain', mark: true, markColor: PLAYER_LIVERY.emblemColor },
  hull: {
    planks: PLAYER_LIVERY.hull,
    topsides: PLAYER_LIVERY.strake,
    wale: PLAYER_LIVERY.wale,
    gilding: PLAYER_LIVERY.trim,
    boot: PLAYER_LIVERY.boot,
    bottom: PLAYER_LIVERY.bottom,
  },
  name: '',
};

type Preset = { name: string; look: Omit<ShipLook, 'name'> };

const P = (name: string, flag: Partial<FlagDesign>, sail: SailLook, hull: HullLook): Preset => ({
  name,
  look: { flag: { ...DEFAULT_LOOK.flag, ...flag }, sail, hull },
});

export const PRESETS: Preset[] = [
  { name: 'Turquoise Sun', look: { flag: DEFAULT_LOOK.flag, sail: DEFAULT_LOOK.sail, hull: DEFAULT_LOOK.hull } },
  P(
    'Black Pearl',
    { shape: 'tattered', bg: '#141212', emblem: 'skull', backing: 'bones', emblemColor: '#f3ecdc' },
    { cloth: '#3a3634', accent: '#1d1b1b', pattern: 'plain', mark: false, markColor: '#f3ecdc' },
    { planks: '#2b1d15', topsides: '#1d1b1b', wale: '#2b1d15', gilding: '#d4b26a', boot: '#2c2a2a', bottom: '#21160f' },
  ),
  P(
    'Crimson Kraken',
    { shape: 'swallowtail', bg: '#b8262b', emblem: 'kraken', backing: 'none', emblemColor: '#141212', pattern: 'border', patternColor: '#141212' },
    { cloth: '#9c2a2a', accent: '#1d1b1b', pattern: 'band', mark: true, markColor: '#1d1b1b' },
    { planks: '#3f2a1e', topsides: '#962e4f', wale: '#21160f', gilding: '#c9944a', boot: '#f5efe1', bottom: '#2c2a2a' },
  ),
  P(
    'Royal Azure',
    { shape: 'square', bg: '#1b3f7a', emblem: 'crown', backing: 'laurel', emblemColor: '#f2c45a', pattern: 'border', patternColor: '#f2c45a' },
    { cloth: '#fbf7ee', accent: '#27407a', pattern: 'border', mark: true, markColor: '#27407a' },
    { planks: '#5a3620', topsides: '#1d3f73', wale: '#21160f', gilding: '#e2b552', boot: '#f5efe1', bottom: '#b33a2c' },
  ),
  P(
    'Coral Queen',
    { shape: 'burgee', bg: '#e98fb0', emblem: 'shark', backing: 'none', emblemColor: '#fbf7ee', pattern: 'diagonal', patternColor: '#e86a2c' },
    { cloth: '#fbf7ee', accent: '#e7a3a0', pattern: 'stripes', mark: false, markColor: '#e46f4b' },
    { planks: '#b98b5a', topsides: '#e46f4b', wale: '#6e5a48', gilding: '#d8d8d2', boot: '#f5efe1', bottom: '#0f5c63' },
  ),
  P(
    'Emerald Corsair',
    { shape: 'swallowtail', bg: '#2f7d3a', emblem: 'swords', backing: 'ring', emblemColor: '#f3ecdc', pattern: 'hoist', patternColor: '#141212' },
    { cloth: '#e6d3ad', accent: '#2f6b47', pattern: 'diagonal', mark: true, markColor: '#2f6b47' },
    { planks: '#7a4b2a', topsides: '#2f6b3d', wale: '#2b1d15', gilding: '#b87333', boot: '#f5efe1', bottom: '#21160f' },
  ),
  P(
    'Ghost Tide',
    { shape: 'tattered', bg: '#c9b38a', emblem: 'hourglass', backing: 'bones', emblemColor: '#141212', pattern: 'plain' },
    { cloth: '#c9a97a', accent: '#6e5a48', pattern: 'plain', mark: true, markColor: '#3a3634' },
    { planks: '#6e5a48', topsides: '#c8d6d2', wale: '#3f2a1e', gilding: '#8c8a84', boot: '#2c2a2a', bottom: '#2c2a2a' },
  ),
  P(
    'Sunset Rogue',
    { shape: 'square', bg: '#e86a2c', emblem: 'parrot', backing: 'rays', emblemColor: '#f2c45a', pattern: 'band', patternColor: '#6b2f86' },
    { cloth: '#f4ead4', accent: '#d9a441', pattern: 'cross', mark: true, markColor: '#c4533a' },
    { planks: '#9b6a3e', topsides: '#5b3a7a', wale: '#2b1d15', gilding: '#e2b552', boot: '#f5efe1', bottom: '#e46f4b' },
  ),
];

const NAME_A = ['Salty', 'Golden', 'Crimson', 'Midnight', 'Laughing', 'Wandering', 'Restless', 'Gilded', 'Silver', 'Howling', 'Merry', 'Lucky', 'Stormy', 'Coral', 'Wicked', 'Jolly'];
const NAME_B = ['Gull', 'Marlin', 'Siren', 'Mermaid', 'Kraken', 'Parrot', 'Doubloon', 'Tempest', 'Barnacle', 'Corsair', 'Maiden', 'Albatross', 'Dolphin', 'Lantern', 'Pelican', 'Rose'];

export function randomShipName() {
  const a = NAME_A[Math.floor(Math.random() * NAME_A.length)];
  const b = NAME_B[Math.floor(Math.random() * NAME_B.length)];
  return `${a} ${b}`;
}

const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

function lum(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

/** Picks a colour that reads clearly against `bg`. */
function contrasting(pal: string[], bg: string) {
  const l = lum(bg);
  const ok = pal.filter((c) => Math.abs(lum(c) - l) > 0.35);
  return pick(ok.length ? ok : pal);
}

/** A random but harmonious look. */
export function randomLook(keepName = ''): ShipLook {
  const f = PALETTES.flag;
  const bg = pick(f);
  const patternColor = contrasting(f.filter((c) => c !== bg), bg);
  const emblems = EMBLEMS.filter((e) => e.id !== 'none');
  const cloth = Math.random() < 0.6 ? pick(PALETTES.sail.slice(0, 4)) : pick(PALETTES.sail);
  const topsides = pick(PALETTES.paint);
  return {
    flag: {
      shape: pick(SHAPES).id,
      bg,
      pattern: Math.random() < 0.35 ? 'plain' : pick(PATTERNS).id,
      patternColor,
      emblem: pick(emblems).id,
      emblemColor: contrasting(f, bg),
      backing: Math.random() < 0.45 ? 'none' : pick(BACKINGS).id,
      emblemScale: 0.85 + Math.random() * 0.3,
      paint: '',
    },
    sail: {
      cloth,
      accent: contrasting(PALETTES.sail, cloth),
      pattern: Math.random() < 0.4 ? 'plain' : pick(SAIL_PATTERNS).id,
      mark: Math.random() < 0.7,
      markColor: contrasting(PALETTES.sail, cloth),
    },
    hull: {
      planks: pick(PALETTES.wood),
      topsides,
      wale: pick(PALETTES.wood.filter((c) => lum(c) < 0.3)),
      gilding: pick(PALETTES.metal),
      boot: Math.random() < 0.7 ? '#f5efe1' : pick(PALETTES.paint),
      bottom: pick(PALETTES.paint.filter((c) => c !== topsides)),
    },
    name: keepName,
  };
}

// ------------------------------------------------------------------ persistence

export const LOOK_KEY = 'aquati.look.v1';
const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

function sanitize(raw: unknown): ShipLook {
  const d = structuredClone(DEFAULT_LOOK);
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<ShipLook>;
  const merge = <T extends object>(base: T, src: unknown) => {
    if (!src || typeof src !== 'object') return;
    for (const k of Object.keys(base) as (keyof T)[]) {
      const v = (src as T)[k];
      const b = base[k];
      if (typeof b === 'string' && b.startsWith('#') ? isHex(v) : typeof v === typeof b) base[k] = v;
    }
  };
  merge(d.flag, r.flag);
  merge(d.sail, r.sail);
  merge(d.hull, r.hull);
  if (typeof r.name === 'string') d.name = r.name.slice(0, 24);
  if (!EMBLEMS.some((e) => e.id === d.flag.emblem)) d.flag.emblem = 'sun';
  if (!BACKINGS.some((e) => e.id === d.flag.backing)) d.flag.backing = 'none';
  if (!PATTERNS.some((e) => e.id === d.flag.pattern)) d.flag.pattern = 'plain';
  if (!SHAPES.some((e) => e.id === d.flag.shape)) d.flag.shape = 'square';
  if (!SAIL_PATTERNS.some((e) => e.id === d.sail.pattern)) d.sail.pattern = 'plain';
  if (!d.flag.paint.startsWith('data:image/png')) d.flag.paint = '';
  d.flag.emblemScale = Math.min(1.4, Math.max(0.6, d.flag.emblemScale || 1));
  return d;
}

export function loadLook(): ShipLook {
  try {
    const s = localStorage.getItem(LOOK_KEY);
    return sanitize(s ? JSON.parse(s) : null);
  } catch {
    return structuredClone(DEFAULT_LOOK);
  }
}

export function saveLook(look: ShipLook) {
  try {
    localStorage.setItem(LOOK_KEY, JSON.stringify(look));
  } catch {
    // private mode / quota: the look still applies for this session
    return;
  }
  progressSaved();
}

// ------------------------------------------------------------------ your own presets

export interface SavedDesign {
  id: string;
  name: string;
  look: ShipLook;
}

export const SAVED_KEY = 'aquati.designs.v1';
export const MAX_SAVED = 12;

export function loadDesigns(): SavedDesign[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((d) => d && typeof d === 'object' && typeof d.id === 'string')
      .slice(0, MAX_SAVED)
      .map((d) => ({ id: d.id, name: String(d.name ?? '').replace(/[<>]/g, '').slice(0, 24), look: sanitize(d.look) }));
  } catch {
    return [];
  }
}

/** Returns false when the browser refuses (private mode or out of space). */
export function saveDesigns(list: SavedDesign[]): boolean {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, MAX_SAVED)));
    progressSaved();
    return true;
  } catch {
    return false;
  }
}

/** Same flag, sails and paintwork (names aside). */
export function sameStyle(a: Omit<ShipLook, 'name'>, b: Omit<ShipLook, 'name'>) {
  const k = (l: Omit<ShipLook, 'name'>) => JSON.stringify([l.flag, l.sail, l.hull]);
  return k(a) === k(b);
}

/** Same style and name: saving it again would just make a twin. */
export function sameDesign(a: ShipLook, b: ShipLook) {
  return a.name === b.name && sameStyle(a, b);
}

// ------------------------------------------------------------------ livery

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

function shadeHex(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => c(v).toString(16).padStart(2, '0')).join('');
}

/** Only the parts of the look that are baked into hull geometry and textures. */
export function hullKey(look: ShipLook) {
  return JSON.stringify(look.hull);
}

export function lookToLivery(look: ShipLook): Livery {
  const { flag, sail, hull } = look;
  return {
    id: 'custom-' + hash(JSON.stringify({ ...look, name: '' })),
    hull: hull.planks,
    bottom: hull.bottom,
    boot: hull.boot,
    strake: hull.topsides,
    wale: hull.wale,
    trim: hull.gilding,
    sail: sail.cloth,
    sailSeam: shadeHex(sail.cloth, 0.86),
    emblem: 'none',
    emblemColor: sail.markColor,
    flag: flag.bg,
    flag2: flag.emblemColor,
    flagDesign: flag,
    sailAccent: sail.accent,
    sailPattern: sail.pattern,
    sailMark: sail.mark && flag.emblem !== 'none' ? { emblem: flag.emblem, backing: flag.backing, color: sail.markColor } : null,
  };
}
