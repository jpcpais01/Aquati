import type { AmmoId } from './ammo';
import type { FlagDesign } from '../ships/heraldry';
import type { Livery, ShipClassId } from '../ships/shipTypes';
import type { SailPattern } from '../ships/look';
import { progressSaved } from '../core/progress';

// Bounties and infamy. Every pirate you send to the bottom makes your name a
// little more hated among the Brethren of the Coast. As your infamy climbs
// (the voyage's "wanted" level), the Brethren send their named captains after
// you: famous hunters in their own colours, each with a trick of their own and
// a fat Crown bounty on their head. Sink one and the reward is yours, along
// with their poster, stamped, on your Wanted Board.
//
// Two scales: the voyage's wanted level (heat, drives the hunters) and your
// lifetime infamy (reputation, synced between devices), which raises the
// Crown's reward on every bounty you claim.

// ------------------------------------------------------------------ portraits

export type Hat = 'tricorn' | 'bicorne' | 'bandana' | 'hood' | 'cap' | 'none';
export type Hair = 'long' | 'short' | 'tied' | 'curls' | 'bald' | 'braids';
export type Beard = 'none' | 'stubble' | 'full' | 'goatee' | 'forked' | 'mutton';

export interface Face {
  hat: Hat;
  hair: Hair;
  beard: Beard;
  patch?: 'l' | 'r';
  scar?: boolean;
  earring?: boolean;
  /** A plume in the hat. */
  plume?: boolean;
  /** Brow set: 0 level, 1 scowl, -1 arched. */
  brow: number;
  /** Mouth: 0 flat, 1 smirk, -1 snarl. */
  mouth: number;
}

// ------------------------------------------------------------------ captains

export interface NamedCaptain {
  id: string;
  /** Plain name, as the Crown's notice prints it. */
  name: string;
  /** What the Brethren call them. */
  epithet: string;
  /** Short handle for the HUD and toasts. */
  handle: string;
  ship: string;
  cls: ShipClassId;
  tier: 1 | 2 | 3 | 4 | 5;
  /** Crown gold for sinking them (before your infamy's bonus). */
  bounty: number;
  /** What makes them dangerous, in a line. */
  trait: string;
  /** What they send ahead of them. */
  taunt: string;
  /** Vault skin they sail in. */
  skin: string;
  sail: string;
  sailSeam: string;
  sailAccent?: string;
  sailPattern?: SailPattern;
  sailMark: { emblem: FlagDesign['emblem']; backing: FlagDesign['backing']; color: string };
  flag: Omit<FlagDesign, 'paint' | 'emblemScale'>;
  /** Shot they load, and how often (the rest is round shot). */
  ammo: [AmmoId, number][];
  boost: { hp: number; guns: number; reload: number; speed: number; aim: number };
  escorts: number;
  face: Face;
}

export const CAPTAINS: NamedCaptain[] = [
  {
    id: 'ned', name: 'Ned Varrow', epithet: 'Calico Ned', handle: 'Calico Ned', ship: 'Quickthorn', cls: 'sloop', tier: 1, bounty: 650,
    trait: 'Shreds your canvas with chain shot, then dances round you.',
    taunt: 'Your sails will be ribbons before you see me coming.',
    skin: 'skin:harlequin', sail: '#efe4cc', sailSeam: '#d2c3a2', sailAccent: '#b8402f', sailPattern: 'stripes',
    sailMark: { emblem: 'swords', backing: 'none', color: '#1c1512' },
    flag: { shape: 'swallowtail', bg: '#1c1512', pattern: 'stripes', patternColor: '#b8402f', emblem: 'swords', emblemColor: '#efe4cc', backing: 'none' },
    ammo: [['chain', 0.42], ['grape', 0.1]],
    boost: { hp: 1.7, guns: 1.15, reload: 0.9, speed: 1.08, aim: 0.75 },
    escorts: 0,
    face: { hat: 'bandana', hair: 'curls', beard: 'stubble', earring: true, brow: -1, mouth: 1 },
  },
  {
    id: 'anne', name: 'Anne Mercer', epithet: 'Saltbones Anne', handle: 'Saltbones', ship: 'Whisper', cls: 'sloop', tier: 1, bounty: 700,
    trait: 'Sweeps your decks with grape shot. Never misses twice.',
    taunt: 'Never heard of me? That is rather the point.',
    skin: 'skin:camo', sail: '#3c4a44', sailSeam: '#2c3833',
    sailMark: { emblem: 'skull', backing: 'bones', color: '#d9d3c2' },
    flag: { shape: 'tattered', bg: '#26302c', pattern: 'border', patternColor: '#d9d3c2', emblem: 'skull', emblemColor: '#d9d3c2', backing: 'bones' },
    ammo: [['grape', 0.4], ['chain', 0.1]],
    boost: { hp: 1.8, guns: 1.2, reload: 0.88, speed: 1.06, aim: 0.6 },
    escorts: 0,
    face: { hat: 'hood', hair: 'long', beard: 'none', scar: true, brow: 1, mouth: 0 },
  },
  {
    id: 'isolde', name: 'Isolde Crane', epithet: 'Red Isolde', handle: 'Red Isolde', ship: 'Scarlet Widow', cls: 'brig', tier: 2, bounty: 1200,
    trait: 'Lights you up with fire shot and watches you burn.',
    taunt: 'Every captain I have met burned brighter than they sailed.',
    skin: 'skin:damask', sail: '#8e1d24', sailSeam: '#6e151b', sailAccent: '#e8b84f', sailPattern: 'border',
    sailMark: { emblem: 'heart', backing: 'swords', color: '#f3d48a' },
    flag: { shape: 'swallowtail', bg: '#7a1424', pattern: 'border', patternColor: '#e8b84f', emblem: 'heart', emblemColor: '#f6dfa0', backing: 'swords' },
    ammo: [['fire', 0.4], ['chain', 0.08]],
    boost: { hp: 1.75, guns: 1.2, reload: 0.85, speed: 1.05, aim: 0.7 },
    escorts: 0,
    face: { hat: 'tricorn', hair: 'long', beard: 'none', earring: true, plume: true, brow: -1, mouth: 1 },
  },
  {
    id: 'kett', name: 'Bartholomew Kett', epithet: 'Iron Jaw Kett', handle: 'Iron Jaw', ship: 'Gravemaw', cls: 'brig', tier: 2, bounty: 1300,
    trait: 'Iron-banded hull. Takes a beating and comes straight on.',
    taunt: 'I have swallowed bigger ships than yours.',
    skin: 'skin:tiger', sail: '#d8c9a6', sailSeam: '#bba985', sailAccent: '#1d1714', sailPattern: 'band',
    sailMark: { emblem: 'shark', backing: 'ring', color: '#1d1714' },
    flag: { shape: 'square', bg: '#e8792f', pattern: 'band', patternColor: '#1d1714', emblem: 'shark', emblemColor: '#1d1714', backing: 'none' },
    ammo: [['shell', 0.18], ['grape', 0.12]],
    boost: { hp: 2.3, guns: 1.15, reload: 0.95, speed: 1.0, aim: 0.8 },
    escorts: 0,
    face: { hat: 'cap', hair: 'bald', beard: 'mutton', scar: true, brow: 1, mouth: -1 },
  },
  {
    id: 'mags', name: 'Margaret Holloway', epithet: 'Mad Mags', handle: 'Mad Mags', ship: 'Banshee', cls: 'brig', tier: 3, bounty: 1900,
    trait: 'Reloads like a demon. Fire and chain, all at once.',
    taunt: 'Hear that wailing? That is your hull.',
    skin: 'skin:chevron', sail: '#f0d9a8', sailSeam: '#d6bb85', sailAccent: '#6b2f86', sailPattern: 'diagonal',
    sailMark: { emblem: 'moon', backing: 'rays', color: '#e4573d' },
    flag: { shape: 'tattered', bg: '#3a1846', pattern: 'diagonal', patternColor: '#e4573d', emblem: 'moon', emblemColor: '#f2b347', backing: 'rays' },
    ammo: [['fire', 0.24], ['chain', 0.24]],
    boost: { hp: 2.0, guns: 1.25, reload: 0.68, speed: 1.07, aim: 0.7 },
    escorts: 1,
    face: { hat: 'none', hair: 'braids', beard: 'none', patch: 'l', earring: true, brow: 1, mouth: -1 },
  },
  {
    id: 'eel', name: 'Silas Dunmore', epithet: 'Silas the Eel', handle: 'The Eel', ship: 'Black Eel', cls: 'brig', tier: 3, bounty: 2000,
    trait: 'The fastest brig in the isles. Slips in, rakes you, slips away.',
    taunt: 'Slippery? I prefer inevitable.',
    skin: 'skin:kraken', sail: '#2a1f3a', sailSeam: '#1d1529', sailAccent: '#3fd1c4', sailPattern: 'cross',
    sailMark: { emblem: 'kraken', backing: 'none', color: '#3fd1c4' },
    flag: { shape: 'burgee', bg: '#1a0f2e', pattern: 'chevron', patternColor: '#7b2a8c', emblem: 'kraken', emblemColor: '#3fd1c4', backing: 'none' },
    ammo: [['chain', 0.3], ['grape', 0.18]],
    boost: { hp: 1.9, guns: 1.2, reload: 0.8, speed: 1.2, aim: 0.65 },
    escorts: 1,
    face: { hat: 'bicorne', hair: 'tied', beard: 'goatee', brow: -1, mouth: 1 },
  },
  {
    id: 'hester', name: 'Hester Blackwood', epithet: 'The Duchess of Ash', handle: 'The Duchess', ship: 'Ashen Crown', cls: 'galleon', tier: 4, bounty: 3200,
    trait: 'Rains shell and fire from three gun decks. Never sails alone.',
    taunt: 'Kneel, and I shall sink you quickly.',
    skin: 'skin:kintsugi', sail: '#2b2730', sailSeam: '#1e1b22', sailAccent: '#f0c35a', sailPattern: 'border',
    sailMark: { emblem: 'crown', backing: 'laurel', color: '#f0c35a' },
    flag: { shape: 'swallowtail', bg: '#0d0c0f', pattern: 'border', patternColor: '#f0c35a', emblem: 'crown', emblemColor: '#f0c35a', backing: 'laurel' },
    ammo: [['shell', 0.26], ['fire', 0.2]],
    boost: { hp: 1.9, guns: 1.25, reload: 0.85, speed: 1.08, aim: 0.65 },
    escorts: 1,
    face: { hat: 'tricorn', hair: 'curls', beard: 'none', plume: true, earring: true, brow: -1, mouth: 0 },
  },
  {
    id: 'grimm', name: 'Thaddeus Grimm', epithet: 'The Undertaker', handle: 'The Undertaker', ship: 'Coffin Bell', cls: 'galleon', tier: 4, bounty: 3400,
    trait: 'Bursting shell by the broadside. Tolls a bell for every ship he sinks.',
    taunt: 'I have measured you for a box already.',
    skin: 'skin:marble', sail: '#e7e2d6', sailSeam: '#c9c3b4', sailAccent: '#2b2b2b', sailPattern: 'cross',
    sailMark: { emblem: 'hourglass', backing: 'bones', color: '#2b2b2b' },
    flag: { shape: 'square', bg: '#141414', pattern: 'cross', patternColor: '#e7e2d6', emblem: 'hourglass', emblemColor: '#e7e2d6', backing: 'bones' },
    ammo: [['shell', 0.42], ['grape', 0.1]],
    boost: { hp: 2.1, guns: 1.2, reload: 0.9, speed: 1.05, aim: 0.6 },
    escorts: 1,
    face: { hat: 'bicorne', hair: 'short', beard: 'forked', brow: 1, mouth: 0 },
  },
  {
    id: 'vane', name: 'Morgan Vane', epithet: 'Blackheart Vane', handle: 'Blackheart', ship: 'Leviathan\'s Wrath', cls: 'galleon', tier: 5, bounty: 5200,
    trait: 'Lord of the Brethren. A molten hull, a fleet at his back.',
    taunt: 'The Brethren want your head. I want your ship.',
    skin: 'skin:molten', sail: '#1c1513', sailSeam: '#120d0c', sailAccent: '#ff5a12', sailPattern: 'border',
    sailMark: { emblem: 'skull', backing: 'swords', color: '#ff7a2a' },
    flag: { shape: 'tattered', bg: '#120d0c', pattern: 'border', patternColor: '#ff5a12', emblem: 'skull', emblemColor: '#ffd56a', backing: 'swords' },
    ammo: [['shell', 0.24], ['fire', 0.22], ['chain', 0.1]],
    boost: { hp: 2.5, guns: 1.35, reload: 0.8, speed: 1.1, aim: 0.55 },
    escorts: 2,
    face: { hat: 'tricorn', hair: 'long', beard: 'full', patch: 'r', scar: true, brow: 1, mouth: -1 },
  },
  {
    id: 'drake', name: 'Cassius Drake', epithet: 'The Storm King', handle: 'Storm King', ship: 'Tempest Throne', cls: 'galleon', tier: 5, bounty: 5600,
    trait: 'Sails like the wind obeys him. His gunners never miss.',
    taunt: 'The sea crowned me. You will make a fine footnote.',
    skin: 'skin:aurora', sail: '#14203b', sailSeam: '#0c1529', sailAccent: '#38ff9c', sailPattern: 'stripes',
    sailMark: { emblem: 'trident', backing: 'rays', color: '#b9ffe0' },
    flag: { shape: 'swallowtail', bg: '#07122b', pattern: 'saltire', patternColor: '#38ff9c', emblem: 'trident', emblemColor: '#e8fff4', backing: 'rays' },
    ammo: [['shell', 0.22], ['chain', 0.18], ['grape', 0.12]],
    boost: { hp: 2.4, guns: 1.35, reload: 0.78, speed: 1.16, aim: 0.45 },
    escorts: 2,
    face: { hat: 'bicorne', hair: 'tied', beard: 'goatee', plume: true, earring: true, brow: -1, mouth: 1 },
  },
];

export const CAPTAIN = new Map(CAPTAINS.map((c) => [c.id, c]));

/** The hull paint every hunter shares (black, crimson strake, gold trim); sails, flag and skin are their own. */
export const HUNTER_HULL: Livery = {
  id: 'pirate-hunter',
  hull: '#2a1d17',
  bottom: '#1f1b1b',
  boot: '#d9cfbb',
  strake: '#8a1e22',
  wale: '#0f0a08',
  trim: '#e2b552',
  sail: '#2b2522',
  sailSeam: '#1f1a18',
  emblem: 'skull',
  emblemColor: '#e8dcc4',
  flag: '#120d0c',
  flag2: '#e8dcc4',
};

/** A captain's full colours: the shared hunter hull dressed in their own sails, flag and vault skin. */
export function hunterLivery(c: NamedCaptain): Livery {
  return {
    ...HUNTER_HULL,
    sail: c.sail,
    sailSeam: c.sailSeam,
    sailAccent: c.sailAccent,
    sailPattern: c.sailPattern,
    sailMark: c.sailMark,
    flagDesign: { ...c.flag, emblemScale: 1, paint: '' },
    skin: c.skin,
  };
}

// ------------------------------------------------------------------ the voyage's heat

/** Infamy a sinking earns, by class. */
export const KILL_INFAMY: Record<ShipClassId, number> = { sloop: 1, brig: 2, galleon: 3 };
/** Voyage infamy at which each wanted level (1..5) is reached. */
export const WANTED_AT = [3, 8, 15, 24, 35];
/** Past five skulls, another hunter sets out every this many points. */
export const WANTED_MORE = 14;
/** Extra Crown gold per wanted skull on every pirate bounty: the hotter, the richer. */
export const HEAT_BONUS = 0.08;

export function wantedLevel(pts: number) {
  let n = 0;
  while (n < WANTED_AT.length && pts >= WANTED_AT[n]) n++;
  return n;
}

/** 0..1 toward the next skull (1 once all five are lit). */
export function wantedProgress(pts: number) {
  const n = wantedLevel(pts);
  if (n >= WANTED_AT.length) return 1;
  const lo = n ? WANTED_AT[n - 1] : 0;
  return (pts - lo) / (WANTED_AT[n] - lo);
}

/** How many hunters this much infamy has earned you (the sixth on, one per WANTED_MORE). */
export function huntersEarned(pts: number) {
  const n = wantedLevel(pts);
  if (n < WANTED_AT.length) return n;
  return n + Math.floor((pts - WANTED_AT[WANTED_AT.length - 1]) / WANTED_MORE);
}

// ------------------------------------------------------------------ reputation

export const REPUTE: [number, string, string][] = [
  [0, 'Unknown', 'No pirate in the isles has heard your name. Yet.'],
  [12, 'Rumoured', 'Whispers in the taverns of a captain who sinks pirates.'],
  [40, 'Notorious', 'The Brethren of the Coast have pinned up your likeness.'],
  [100, 'Wanted', 'Pirate crews drink to whoever sends you down.'],
  [220, 'Most Wanted', 'The Brethren\'s finest sail out for you alone.'],
  [400, 'Infamous', 'Merchantmen cheer your sails. Pirates strike theirs.'],
  [700, 'Scourge of the Brethren', 'They frighten their cabin boys with your name.'],
  [1100, 'Legend of the Black Water', 'The Brethren will be telling this story for a hundred years.'],
];
/** Crown's extra reward per rank of infamy, on every bounty. */
export const REPUTE_BONUS = 0.05;

export function reputeRank(infamy: number) {
  let i = 0;
  while (i + 1 < REPUTE.length && infamy >= REPUTE[i + 1][0]) i++;
  return i;
}

// ------------------------------------------------------------------ the ledger (synced)

export const BOUNTY_KEY = 'aquati.bounty.v1';

export interface Ledger {
  /** Lifetime infamy. */
  infamy: number;
  /** Times each named captain has been sunk. */
  sunk: Record<string, number>;
  /** When each was first sunk (ms since epoch). */
  first: Record<string, number>;
  /** Captains who have come hunting at least once. */
  seen: string[];
  /** Gold the Crown has paid you for named captains. */
  claimed: number;
  /** Highest wanted level ever reached. */
  best: number;
}

export const freshLedger = (): Ledger => ({ infamy: 0, sunk: {}, first: {}, seen: [], claimed: 0, best: 0 });

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);

function counts(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, n] of Object.entries(v)) if (CAPTAIN.has(k) && num(n) > 0) out[k] = Math.floor(num(n));
  return out;
}

/** Defensive parse: junk falls back to empty. */
export function cleanLedger(raw: unknown): Ledger | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  return {
    infamy: Math.floor(num(r.infamy)),
    sunk: counts(r.sunk),
    first: counts(r.first),
    seen: Array.isArray(r.seen) ? [...new Set(r.seen.filter((id): id is string => typeof id === 'string' && CAPTAIN.has(id)))] : [],
    claimed: Math.floor(num(r.claimed)),
    best: Math.min(5, Math.floor(num(r.best))),
  };
}

export function readLedger(): Ledger | null {
  try {
    return cleanLedger(JSON.parse(localStorage.getItem(BOUNTY_KEY) || 'null'));
  } catch {
    return null;
  }
}

/** Three-way merge (see cloud/profile.ts): counts as deltas over the base, the rest only grows. */
export function mergeLedger(b: Ledger | null, l: Ledger | null, r: Ledger | null): Ledger | null {
  if (!l) return r;
  if (!r) return l;
  const B = b ?? freshLedger();
  const sunk: Record<string, number> = { ...r.sunk };
  for (const [k, n] of Object.entries(l.sunk)) sunk[k] = (sunk[k] ?? 0) + Math.max(0, n - (B.sunk[k] ?? 0));
  const first: Record<string, number> = { ...r.first };
  for (const [k, t] of Object.entries(l.first)) first[k] = first[k] ? Math.min(first[k], t) : t;
  return {
    infamy: r.infamy + Math.max(0, l.infamy - B.infamy),
    sunk,
    first,
    seen: [...new Set([...r.seen, ...l.seen])],
    claimed: r.claimed + Math.max(0, l.claimed - B.claimed),
    best: Math.max(l.best, r.best),
  };
}

export class BountyBook {
  private s: Ledger = readLedger() ?? freshLedger();
  private subs = new Set<() => void>();

  get ledger(): Readonly<Ledger> {
    return this.s;
  }

  get rank() {
    return reputeRank(this.s.infamy);
  }

  /** The Crown's multiplier on bounties at your current infamy. */
  get bonus() {
    return 1 + this.rank * REPUTE_BONUS;
  }

  onChange(fn: () => void) {
    this.subs.add(fn);
  }

  /** Re-read from disk (the cloud rewrote it). */
  reload() {
    this.s = readLedger() ?? freshLedger();
    this.subs.forEach((f) => f());
  }

  private save() {
    try {
      localStorage.setItem(BOUNTY_KEY, JSON.stringify(this.s));
    } catch {
      /* private mode: kept for this session */
    }
    progressSaved();
    this.subs.forEach((f) => f());
  }

  /** A fresh sea: no infamy, every poster unstamped. */
  wipe() {
    this.s = freshLedger();
    this.save();
  }

  /** Infamy earned; returns the new rank if it just went up, else -1. */
  addInfamy(pts: number) {
    if (pts <= 0) return -1;
    const was = this.rank;
    this.s.infamy += Math.round(pts);
    this.save();
    return this.rank > was ? this.rank : -1;
  }

  /** A hunter set out after you. */
  sighted(id: string) {
    if (this.s.seen.includes(id)) return;
    this.s.seen.push(id);
    this.save();
  }

  /** A named captain sunk: their poster gets its stamp. */
  claim(id: string, gold: number) {
    this.s.sunk[id] = (this.s.sunk[id] ?? 0) + 1;
    if (!this.s.first[id]) this.s.first[id] = Date.now();
    if (!this.s.seen.includes(id)) this.s.seen.push(id);
    this.s.claimed += Math.round(gold);
    this.save();
  }

  reached(level: number) {
    if (level <= this.s.best) return;
    this.s.best = level;
    this.save();
  }

  /** The captain the Brethren send at this wanted level: one you have not beaten yet, if any are left. */
  pick(level: number, exclude: Set<string>) {
    const tier = Math.min(5, Math.max(1, level));
    const pool = CAPTAINS.filter((c) => c.tier === tier && !exclude.has(c.id));
    const all = pool.length ? pool : CAPTAINS.filter((c) => c.tier >= Math.min(tier, 4) && !exclude.has(c.id));
    const list = all.length ? all : CAPTAINS.filter((c) => c.tier === tier);
    const fresh = list.filter((c) => !this.s.sunk[c.id]);
    const from = fresh.length ? fresh : list;
    return from[Math.floor(Math.random() * from.length)];
  }
}
