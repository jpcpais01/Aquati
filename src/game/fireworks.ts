// Fireworks: the sixth thing a gun can be loaded with. Not a weapon at all:
// every gun on the side sends a rocket up at seventy degrees and the night
// sky over the sea opens into flowers of coloured fire. Ten kinds sold by the
// harbour pyrotechnists and found in salvage, and three showpieces so rare
// that most captains only ever hear of them.
//
// They're kept in a locker that follows the captain between voyages (and
// devices, with the cloud save), not in the voyage's shot racks.

import { progressSaved } from '../core/progress';

export type FireworkId =
  | 'peony'
  | 'chrysanthemum'
  | 'willow'
  | 'palm'
  | 'ring'
  | 'crossette'
  | 'strobe'
  | 'crackle'
  | 'fish'
  | 'saturn'
  // the three showpieces
  | 'kraken'
  | 'roger'
  | 'fortune';

export interface FireworkType {
  id: FireworkId;
  name: string;
  /** One word for chips. */
  short: string;
  /** What it looks like, for tooltips and the picker. */
  blurb: string;
  /** UI colours: the main star colour and its partner. */
  css: string;
  css2: string;
  /** 0 common, 1 fine, 2 showpiece. */
  tier: 0 | 1 | 2;
  /** Pyrotechnist's price per rocket-volley (gold). */
  price: number;
  /** Most the locker holds. */
  max: number;
}

export const FIREWORKS: Record<FireworkId, FireworkType> = {
  peony: {
    id: 'peony',
    name: 'Coral Peony',
    short: 'Peony',
    blurb: 'A perfect sphere of coral stars that ripen to gold as they fall.',
    css: '#ff6f7d',
    css2: '#ffc85a',
    tier: 0,
    price: 40,
    max: 30,
  },
  chrysanthemum: {
    id: 'chrysanthemum',
    name: 'Gold Chrysanthemum',
    short: 'Mum',
    blurb: 'Hundreds of petals, each drawing a glittering golden tail behind it.',
    css: '#ffd27a',
    css2: '#fff2c4',
    tier: 0,
    price: 50,
    max: 30,
  },
  willow: {
    id: 'willow',
    name: 'Weeping Willow',
    short: 'Willow',
    blurb: 'Slow golden branches that droop and hang in the sky long after the bang.',
    css: '#ffb84a',
    css2: '#ffe2a0',
    tier: 0,
    price: 55,
    max: 30,
  },
  palm: {
    id: 'palm',
    name: 'Island Palm',
    short: 'Palm',
    blurb: 'A glittering trunk climbs, then heavy green-gold fronds fan out and bow to the sea.',
    css: '#7be08a',
    css2: '#ffcf6a',
    tier: 0,
    price: 50,
    max: 30,
  },
  ring: {
    id: 'ring',
    name: 'Halo Ring',
    short: 'Halo',
    blurb: 'Two crisp rings of aqua and violet, tilted across the sky like a gyroscope.',
    css: '#6fe7ff',
    css2: '#c39bff',
    tier: 1,
    price: 75,
    max: 25,
  },
  crossette: {
    id: 'crossette',
    name: 'Crossette',
    short: 'Cross',
    blurb: 'Silver comets fly out and split, every one, into a little cross of fire.',
    css: '#e8f2ff',
    css2: '#7fc4ff',
    tier: 1,
    price: 80,
    max: 25,
  },
  strobe: {
    id: 'strobe',
    name: 'Lighthouse Strobe',
    short: 'Strobe',
    blurb: 'A cloud of white stars that hang and blink on and off like a lighthouse gone mad.',
    css: '#f4f8ff',
    css2: '#9fdcff',
    tier: 1,
    price: 70,
    max: 25,
  },
  crackle: {
    id: 'crackle',
    name: "Dragon's Eggs",
    short: 'Eggs',
    blurb: 'Gold stars that hatch at the end of their fall into a hail of crackling pops.',
    css: '#ffcc5a',
    css2: '#ff8a3a',
    tier: 1,
    price: 85,
    max: 25,
  },
  fish: {
    id: 'fish',
    name: 'Shoal of Fish',
    short: 'Fish',
    blurb: 'A shoal of bright little fish that wriggle away across the dark in every direction.',
    css: '#5fe8c8',
    css2: '#ffe27a',
    tier: 1,
    price: 80,
    max: 25,
  },
  saturn: {
    id: 'saturn',
    name: 'Saturn',
    short: 'Saturn',
    blurb: 'A violet planet in a tilted ring of gold, hanging over the sea.',
    css: '#b88cff',
    css2: '#ffd36a',
    tier: 1,
    price: 90,
    max: 25,
  },
  kraken: {
    id: 'kraken',
    name: "Kraken's Bloom",
    short: 'Kraken',
    blurb: 'Showpiece. A sea-green maw opens across the sky and eight great tentacles of fire curl down toward the water.',
    css: '#46f0b0',
    css2: '#b46cff',
    tier: 2,
    price: 1400,
    max: 5,
  },
  roger: {
    id: 'roger',
    name: 'Jolly Roger',
    short: 'Roger',
    blurb: 'Showpiece. The skull and crossbones, written across the night in white fire, with a crimson crown of crackle.',
    css: '#f6f6ff',
    css2: '#ff4a5a',
    tier: 2,
    price: 1600,
    max: 5,
  },
  fortune: {
    id: 'fortune',
    name: "Fortune's Finale",
    short: 'Finale',
    blurb: 'Showpiece. A golden crown fills the sky, rings of every colour break around it and a rain of gold coins glitters down to the sea.',
    css: '#ffd75a',
    css2: '#ff7ad9',
    tier: 2,
    price: 2000,
    max: 5,
  },
};

export const FW_ORDER: FireworkId[] = ['peony', 'chrysanthemum', 'willow', 'palm', 'ring', 'crossette', 'strobe', 'crackle', 'fish', 'saturn', 'kraken', 'roger', 'fortune'];
export const FW_COMMON = FW_ORDER.filter((id) => FIREWORKS[id].tier === 0);
export const FW_FINE = FW_ORDER.filter((id) => FIREWORKS[id].tier === 1);
export const FW_SHOW = FW_ORDER.filter((id) => FIREWORKS[id].tier === 2);
export const isFirework = (id: unknown): id is FireworkId => typeof id === 'string' && id in FIREWORKS;

// ------------------------------------------------------------------ the locker

export const FIREWORKS_KEY = 'aquati.fireworks.v1';
export type FireworkCounts = Partial<Record<FireworkId, number>>;

/** A crate the harbour sends every new captain off with, so the first night at sea has a show. */
const WELCOME: FireworkCounts = { peony: 3, chrysanthemum: 2, palm: 2, willow: 1 };

/** Keeps only known kinds, as whole numbers within each locker's room. */
export function cleanFireworks(raw: unknown): FireworkCounts | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: FireworkCounts = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isFirework(k)) continue;
    const n = Math.min(FIREWORKS[k].max, Math.max(0, Math.floor(Number(v) || 0)));
    if (n > 0) out[k] = n;
  }
  return out;
}

export function readFireworks(): FireworkCounts | null {
  try {
    const v = localStorage.getItem(FIREWORKS_KEY);
    return v ? cleanFireworks(JSON.parse(v)) : null;
  } catch {
    return null;
  }
}

/** Counts merge as deltas, like the vault's: rockets bought on one device and fired on another both count. */
export function mergeFireworks(b: FireworkCounts | null, l: FireworkCounts | null, r: FireworkCounts | null): FireworkCounts | null {
  if (!l) return r;
  if (!r) return l;
  const B = b ?? {};
  const out: FireworkCounts = {};
  for (const id of FW_ORDER) {
    const n = (r[id] ?? 0) + ((l[id] ?? 0) - (B[id] ?? 0));
    if (n > 0) out[id] = Math.min(FIREWORKS[id].max, n);
  }
  return out;
}

export class FireworkLocker {
  private counts: FireworkCounts = {};
  private subs = new Set<() => void>();

  constructor() {
    this.reload();
  }

  /** Reads the saved locker; a captain who has never had one gets the welcome crate. */
  reload() {
    const saved = readFireworks();
    if (saved) this.counts = saved;
    else {
      this.counts = { ...WELCOME };
      this.save();
    }
    this.subs.forEach((f) => f());
  }

  count(id: FireworkId) {
    return this.counts[id] ?? 0;
  }

  get total() {
    let n = 0;
    for (const id of FW_ORDER) n += this.count(id);
    return n;
  }

  /** Room left for a kind. */
  room(id: FireworkId) {
    return FIREWORKS[id].max - this.count(id);
  }

  /** Adds what fits; returns how many were stowed of each. */
  add(add: FireworkCounts): FireworkCounts {
    const got: FireworkCounts = {};
    for (const id of FW_ORDER) {
      const n = Math.min(add[id] ?? 0, this.room(id));
      if (n <= 0) continue;
      this.counts[id] = this.count(id) + n;
      got[id] = n;
    }
    if (Object.keys(got).length) this.save();
    return got;
  }

  /** One volley fired. */
  take(id: FireworkId) {
    const n = this.count(id);
    if (n <= 0) return false;
    if (n === 1) delete this.counts[id];
    else this.counts[id] = n - 1;
    this.save();
    return true;
  }

  /** Every kind, to the brim (the admiral's grant). */
  fill() {
    let any = false;
    for (const id of FW_ORDER) {
      if (this.count(id) < FIREWORKS[id].max) any = true;
      this.counts[id] = FIREWORKS[id].max;
    }
    if (any) this.save();
    return any;
  }

  /** The next kind after `from` that's aboard (wrapping round), or null. */
  next(from: FireworkId | null): FireworkId | null {
    const i = from ? FW_ORDER.indexOf(from) : -1;
    for (let k = 1; k <= FW_ORDER.length; k++) {
      const id = FW_ORDER[(i + k + FW_ORDER.length) % FW_ORDER.length];
      if (this.count(id) > 0) return id;
    }
    return null;
  }

  subscribe(fn: () => void) {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  private save() {
    try {
      localStorage.setItem(FIREWORKS_KEY, JSON.stringify(this.counts));
    } catch {
      /* private mode: the locker lasts as long as the page */
    }
    progressSaved();
    this.subs.forEach((f) => f());
  }
}

/**
 * Fireworks found in salvage, by tier (0 barrel .. 4 legendary chest). Most
 * barrels hold none; fine chests a few rockets; only the finest have any
 * chance of a showpiece.
 */
export function fireworkLoot(tier: number, rnd = Math.random): FireworkCounts {
  const out: FireworkCounts = {};
  const one = (pool: FireworkId[], n: number) => {
    const id = pool[Math.floor(rnd() * pool.length)];
    out[id] = (out[id] ?? 0) + n;
  };
  if (tier === 0) {
    if (rnd() < 0.08) one(FW_COMMON, 1);
  } else if (tier === 1) {
    if (rnd() < 0.3) one(FW_COMMON, 1 + Math.floor(rnd() * 2));
  } else if (tier === 2) {
    if (rnd() < 0.55) one(rnd() < 0.6 ? FW_COMMON : FW_FINE, 2);
  } else if (tier === 3) {
    one(FW_COMMON, 2);
    if (rnd() < 0.7) one(FW_FINE, 2);
    if (rnd() < 0.05) one(FW_SHOW, 1);
  } else {
    one(FW_COMMON, 3);
    one(FW_FINE, 2);
    one(FW_FINE, 2);
    if (rnd() < 0.22) one(FW_SHOW, 1);
  }
  return out;
}

/**
 * What a port's pyrotechnist has on the counter today: a few of the common
 * kinds, a couple of the finer ones and, now and then, a showpiece at a
 * fortune. Stable for a port through a day so the stall doesn't reshuffle.
 */
export function pyroStock(portSeed: number, day: number): FireworkId[] {
  let s = (portSeed * 2654435761 + day * 40503) >>> 0 || 1;
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const draw = (pool: FireworkId[], n: number) => {
    const p = pool.slice();
    const out: FireworkId[] = [];
    while (out.length < n && p.length) out.push(p.splice(Math.floor(rnd() * p.length), 1)[0]);
    return out;
  };
  const list = [...draw(FW_COMMON, 3), ...draw(FW_FINE, 3)];
  if (rnd() < 0.45) list.push(...draw(FW_SHOW, 1));
  return list;
}
