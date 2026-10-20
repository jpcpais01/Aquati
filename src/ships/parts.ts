// Ship upgrades: real parts bolted onto your ship, in four slots (hull
// plating, sails, guns and the figurehead) and five rarities. Each one
// changes how she sails and fights, and each one is built into the model, so
// you can see it: the common ones are honest shipwright's work, and the
// higher you climb the stranger they get, until the mythic parts are frankly
// not of this world. Parts are found in chests and wrecks, bought from the
// shipwrights at trading ports, or come out of the Treasure Vault, and every
// ship in your fleet carries her own refit.

import { progressSaved } from '../core/progress';
import type { ShipClass, ShipClassId } from './shipTypes';

export type PartSlot = 'hull' | 'sails' | 'guns' | 'figure';
export type PartTier = 0 | 1 | 2 | 3 | 4;

export const SLOTS: PartSlot[] = ['hull', 'sails', 'guns', 'figure'];

export const SLOT_NAMES: Record<PartSlot, string> = { hull: 'Hull plating', sails: 'Sails', guns: 'Guns', figure: 'Figurehead' };

export interface PartRarity {
  id: string;
  name: string;
  css: string;
  /** A second, deeper tone for gradients. */
  deep: string;
  /** What a port shipwright asks for one. */
  price: number;
  /** Gold handed back for a spare. */
  refund: number;
}

export const PART_RARITIES: PartRarity[] = [
  { id: 'common', name: 'Common', css: '#d8cfb8', deep: '#857a62', price: 600, refund: 150 },
  { id: 'rare', name: 'Rare', css: '#6cc8ff', deep: '#1f6fd1', price: 1800, refund: 450 },
  { id: 'epic', name: 'Epic', css: '#c48bff', deep: '#7a35d6', price: 5000, refund: 1200 },
  { id: 'legendary', name: 'Legendary', css: '#ffbe3d', deep: '#e0701a', price: 14000, refund: 3500 },
  { id: 'mythic', name: 'Mythic', css: '#ff5f9e', deep: '#5b2bd6', price: 40000, refund: 10000 },
];

/** Bonuses as fractions of the class's own figure (armour is added outright). */
export interface PartStats {
  hp?: number;
  armor?: number;
  speed?: number;
  accel?: number;
  turn?: number;
  reload?: number;
  damage?: number;
  range?: number;
  /** Better odds of finding parts in chests and wrecks. */
  luck?: number;
}

export interface Part {
  id: string;
  slot: PartSlot;
  tier: PartTier;
  name: string;
  blurb: string;
  stats: PartStats;
}

const P = (slot: PartSlot, tier: PartTier, key: string, name: string, stats: PartStats, blurb: string): Part => ({ id: `${slot}:${key}`, slot, tier, name, stats, blurb });

export const PARTS: Part[] = [
  // hull plating: heavier and harder to hole, until the mythic aegis weighs nothing at all
  P('hull', 0, 'strakes', 'Oak Rubbing Strakes', { hp: 0.06, armor: 0.02, speed: -0.01 }, 'Extra oak fenders bolted along her sides and rope bumpers hung over the rail. She shrugs off a scrape.'),
  P('hull', 1, 'iron', 'Iron-Strapped Hull', { hp: 0.12, armor: 0.04, speed: -0.02 }, 'Wrought-iron straps from rail to waterline and an iron-capped gunwale. Heavier, and far harder to hole.'),
  P('hull', 2, 'pavisade', 'Bronze Pavisade', { hp: 0.18, armor: 0.06, speed: -0.02 }, 'A wall of bronze-bossed shields hung along her rails, and a bronze ram at the cutwater.'),
  P('hull', 3, 'dragonscale', 'Dragonscale Plating', { hp: 0.26, armor: 0.09, speed: -0.02 }, 'Gilded scales layered like a dragon\'s hide, with a crest of golden spines along each rail.'),
  P('hull', 4, 'aegis', 'Leviathan Aegis', { hp: 0.36, armor: 0.12 }, 'Obsidian armour veined with living light, watched over by hovering wards of glowing glass. Weighs nothing. Stops everything.'),
  // sails
  P('sails', 0, 'storm', 'Storm Canvas', { speed: 0.04, accel: 0.05 }, 'Doubled cloths, reinforced edges and three rows of reef points. Holds a gale without splitting.'),
  P('sails', 1, 'clipper', 'Clipper Cloth', { speed: 0.07, accel: 0.1, turn: 0.03 }, 'Tight-woven racing canvas cut flat for speed, bound in crimson, with brass wind vanes on every masthead.'),
  P('sails', 2, 'batwing', 'Batwing Battens', { speed: 0.1, accel: 0.15, turn: 0.05 }, 'Bamboo-battened cloth that opens like a fan and claws round onto any wind.'),
  P('sails', 3, 'phoenix', 'Phoenix Canvas', { speed: 0.14, accel: 0.22, turn: 0.08 }, 'Embroidered in gold thread with a rising phoenix and crowned with golden suns. It catches the light, and the wind, like nothing else.'),
  P('sails', 4, 'aether', 'Aether Sails', { speed: 0.19, accel: 0.3, turn: 0.12 }, 'Woven from storm light. Currents of starfire run through the cloth while crystal shards circle every masthead.'),
  // guns
  P('guns', 0, 'bronze', 'Bronze Long Guns', { damage: 0.05, reload: 0.03 }, 'Cast bronze with extra reinforce rings. Warm to the touch and a shade harder-hitting.'),
  P('guns', 1, 'culverin', 'Blued Culverins', { damage: 0.1, reload: 0.06, range: 0.03 }, 'Long, slender barrels of blued steel banded in brass. They reach further and reload quicker.'),
  P('guns', 2, 'bombard', 'Siege Bombards', { damage: 0.15, reload: 0.09, range: 0.05 }, 'Fat-bellied guns with flared, crowned muzzles. Every broadside lands like a falling wall.'),
  P('guns', 3, 'dragonmaw', 'Dragonmaw Cannons', { damage: 0.22, reload: 0.13, range: 0.08 }, 'Gilded barrels cast as roaring dragons with ember eyes. The shot leaves their jaws like fire.'),
  P('guns', 4, 'starfire', 'Starfire Lances', { damage: 0.3, reload: 0.18, range: 0.12 }, 'Ring-bound lances humming with captured starlight. Nobody knows who forged them, or how.'),
  // figureheads
  P('figure', 0, 'lion', 'Oak Lion', { turn: 0.05, luck: 0.05 }, 'A proud carved lion with a painted mane. Steady at the helm, steady in a fight.'),
  P('figure', 1, 'eagle', 'Sea Eagle', { turn: 0.09, speed: 0.02, luck: 0.1 }, 'A white-headed eagle, wings swept back along the bows, beak into the wind.'),
  P('figure', 2, 'kraken', 'Gilded Kraken', { turn: 0.13, speed: 0.03, luck: 0.18 }, 'A golden kraken coiled round the stem, tentacles curling down the cutwater. Fortune follows it.'),
  P('figure', 3, 'dragon', 'Golden Dragon', { turn: 0.18, speed: 0.04, hp: 0.04, luck: 0.28 }, 'A horned dragon reaching out over the waves, eyes like coals. Pirates have struck their colours on sight.'),
  P('figure', 4, 'seraph', 'Celestial Seraph', { turn: 0.24, speed: 0.05, hp: 0.06, luck: 0.4 }, 'A pearl-white seraph with wings of living crystal and a halo that never stops turning.'),
];

const BY_ID = new Map(PARTS.map((p) => [p.id, p]));
export const part = (id: string | undefined | null) => (id ? BY_ID.get(id) : undefined);

/** What a ship has bolted on, slot by slot (missing = the standard fit). */
export type Loadout = Partial<Record<PartSlot, string>>;

/** Parts of a loadout, by slot. */
export function loadoutParts(l: Loadout | undefined): Partial<Record<PartSlot, Part>> {
  const out: Partial<Record<PartSlot, Part>> = {};
  if (!l) return out;
  for (const s of SLOTS) {
    const p = part(l[s]);
    if (p && p.slot === s) out[s] = p;
  }
  return out;
}

/** Every bonus of a loadout added up. */
export function loadoutStats(l: Loadout | undefined): Required<PartStats> {
  const t: Required<PartStats> = { hp: 0, armor: 0, speed: 0, accel: 0, turn: 0, reload: 0, damage: 0, range: 0, luck: 0 };
  for (const p of Object.values(loadoutParts(l))) for (const [k, v] of Object.entries(p.stats)) t[k as keyof PartStats] += v as number;
  return t;
}

/** A ship class refitted with a loadout: the same hull and rig, better figures. */
export function refit(c: ShipClass, l: Loadout | undefined): ShipClass {
  const s = loadoutStats(l);
  if (!l || !Object.keys(l).length) return c;
  return {
    ...c,
    hp: Math.round(c.hp * (1 + s.hp)),
    armor: Math.min(0.62, c.armor + s.armor),
    maxSpeed: c.maxSpeed * (1 + s.speed),
    accel: c.accel * (1 + s.accel),
    turnRate: c.turnRate * (1 + s.turn),
    reload: c.reload * (1 - s.reload),
    damage: c.damage * (1 + s.damage),
    muzzleSpeed: c.muzzleSpeed * Math.sqrt(1 + s.range * 2),
  };
}

/** The menu's 0..1 stat bars after a refit (the hull/armour/speed figures scaled the way the bars are). */
export function refitBars(c: ShipClass, l: Loadout | undefined) {
  const s = loadoutStats(l);
  const b = c.stats;
  return {
    speed: b.speed * (1 + s.speed),
    agility: b.agility * (1 + s.turn * 0.7 + s.accel * 0.3),
    armour: b.armour + s.armor * 2.2,
    hull: b.hull * (1 + s.hp),
    firepower: b.firepower * (1 + s.damage) / (1 - s.reload),
  };
}

const pct = (v: number) => `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%`;

/** Short lines for a part card: "+12% hull", "−2% speed". */
export function statLines(st: PartStats): { text: string; bad: boolean }[] {
  const out: { text: string; bad: boolean }[] = [];
  const add = (v: number | undefined, label: string, invert = false) => {
    if (!v) return;
    out.push({ text: `${pct(invert ? -v : v)} ${label}`, bad: v < 0 });
  };
  add(st.hp, 'hull');
  if (st.armor) out.push({ text: `+${Math.round(st.armor * 100)} armour`, bad: false });
  add(st.speed, 'speed');
  add(st.accel, 'acceleration');
  add(st.turn, 'turning');
  add(st.damage, 'damage');
  add(st.reload, 'reload', true);
  add(st.range, 'range');
  if (st.luck) out.push({ text: `+${Math.round(st.luck * 100)}% salvage luck`, bad: false });
  return out;
}

// ------------------------------------------------------------------ finding them

/** A random part of a tier (any slot), favouring ones not yet owned. */
export function rollPart(tier: PartTier, owned: (id: string) => boolean = () => false, rnd = Math.random): Part {
  const pool = PARTS.filter((p) => p.tier === tier);
  const w = pool.map((p) => (owned(p.id) ? 1 : 3));
  let x = rnd() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    x -= w[i];
    if (x <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/**
 * Whether a floating chest of this tier (0 barrel .. 4 legendary) holds a
 * part, and how rare it is. Luck (from the figurehead) raises the chance.
 */
export function chestPart(tier: number, luck: number, rnd = Math.random): PartTier | null {
  const chance = [0.015, 0.06, 0.14, 0.3, 0.6][tier] * (1 + luck);
  if (rnd() > chance) return null;
  // mostly a rarity at or a step below the chest's own, now and then one above
  const r = rnd();
  const base = Math.max(0, tier - 1);
  let t = r < 0.55 ? base : r < 0.9 ? Math.min(4, base + 1) : Math.min(4, base + 2);
  // mythics stay mythic: only the best chests, and rarely
  if (t === 4 && !(tier >= 3 && rnd() < 0.35)) t = 3;
  return t as PartTier;
}

/** The rarity of a part an enemy ship carries into battle (null: the standard fit). */
export function pirateFit(cls: ShipClassId, rnd = Math.random): Loadout {
  const n = { sloop: 0.05, brig: 0.14, galleon: 0.3 }[cls];
  const out: Loadout = {};
  if (rnd() > n) return out;
  const r = rnd();
  const tier = (cls === 'galleon' ? (r < 0.4 ? 1 : r < 0.8 ? 2 : r < 0.97 ? 3 : 4) : r < 0.5 ? 0 : r < 0.85 ? 1 : 2) as PartTier;
  // a pirate's prize fittings show: plating, guns or a figurehead (her sails are her own)
  const slot = (['hull', 'guns', 'figure'] as const)[Math.floor(rnd() * 3)];
  const pool = PARTS.filter((p) => p.tier === tier && p.slot === slot);
  out[slot] = pool[Math.floor(rnd() * pool.length)].id;
  return out;
}

/** Three parts a port's shipwright has in today, the same all day for the same yard. */
export function portStock(portSeed: number, day = dayNumber()): Part[] {
  let h = (portSeed * 2654435761 + day * 40503) >>> 0;
  const rnd = () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out: Part[] = [];
  const tiers: PartTier[] = [0, 1, rnd() < 0.65 ? 2 : 3];
  // one yard in a while has something truly special in
  if (rnd() < 0.18) tiers[2] = rnd() < 0.3 ? 4 : 3;
  for (const t of tiers) {
    const pool = PARTS.filter((p) => p.tier === t && !out.some((o) => o.slot === p.slot));
    out.push(pool[Math.floor(rnd() * pool.length)]);
  }
  return out;
}

export function dayNumber(d = new Date()) {
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
}

// ------------------------------------------------------------------ the store

export interface PartsState {
  owned: Record<string, number>;
  /** Each ship's own refit. */
  fit: Partial<Record<ShipClassId, Loadout>>;
  /** Found but not yet looked at in the Shipwright. */
  unseen: string[];
}

export const PARTS_KEY = 'aquati.parts.v1';

export const freshParts = (): PartsState => ({ owned: {}, fit: {}, unseen: [] });

const CLASS_IDS: ShipClassId[] = ['sloop', 'brig', 'galleon'];

/** Cleans up a parts save from this device or the cloud. */
export function sanitizeParts(r: unknown): PartsState {
  const s = freshParts();
  if (!r || typeof r !== 'object') return s;
  const o = r as Record<string, unknown>;
  if (o.owned && typeof o.owned === 'object') {
    for (const [k, v] of Object.entries(o.owned as Record<string, unknown>)) if (BY_ID.has(k) && Number.isFinite(v) && (v as number) > 0) s.owned[k] = Math.floor(v as number);
  }
  if (o.fit && typeof o.fit === 'object') {
    for (const c of CLASS_IDS) {
      const l: unknown = (o.fit as Record<string, unknown>)[c];
      if (!l || typeof l !== 'object') continue;
      const fit: Loadout = {};
      for (const slot of SLOTS) {
        const id = (l as Record<string, unknown>)[slot];
        if (typeof id === 'string' && BY_ID.get(id)?.slot === slot && s.owned[id]) fit[slot] = id;
      }
      s.fit[c] = fit;
    }
  }
  if (Array.isArray(o.unseen)) s.unseen = o.unseen.filter((id): id is string => typeof id === 'string' && BY_ID.has(id)).slice(0, 32);
  return s;
}

function load(): PartsState {
  try {
    return sanitizeParts(JSON.parse(localStorage.getItem(PARTS_KEY) || 'null'));
  } catch {
    return freshParts();
  }
}

export interface Found {
  part: Part;
  fresh: boolean;
  /** Gold paid out for a spare. */
  refund: number;
}

/** The player's parts locker and each ship's refit. Saved the moment it changes. */
export class PartStore {
  private s = load();
  private subs = new Set<() => void>();

  owns(id: string) {
    return !!this.s.owned[id];
  }

  count(id: string) {
    return this.s.owned[id] ?? 0;
  }

  get unseen(): readonly string[] {
    return this.s.unseen;
  }

  /** How many different parts you hold. */
  collected() {
    return PARTS.filter((p) => this.s.owned[p.id]).length;
  }

  loadout(cls: ShipClassId): Loadout {
    return { ...(this.s.fit[cls] ?? {}) };
  }

  equipped(cls: ShipClassId, slot: PartSlot) {
    return this.s.fit[cls]?.[slot];
  }

  subscribe(fn: () => void) {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  private save() {
    try {
      localStorage.setItem(PARTS_KEY, JSON.stringify(this.s));
    } catch {
      // the locker still works for this session
    }
    this.subs.forEach((f) => f());
    progressSaved();
  }

  /** Re-reads the save after the cloud (or a sign-out) rewrote it. */
  reload() {
    this.s = load();
    this.subs.forEach((f) => f());
  }

  /** Adds a part to the locker; a spare comes back as gold (the caller pays it out). */
  grant(id: string): Found | null {
    const p = BY_ID.get(id);
    if (!p) return null;
    const fresh = !this.s.owned[id];
    this.s.owned[id] = (this.s.owned[id] ?? 0) + 1;
    if (fresh && !this.s.unseen.includes(id)) this.s.unseen.push(id);
    this.save();
    return { part: p, fresh, refund: fresh ? 0 : PART_RARITIES[p.tier].refund };
  }

  /** Bolts a part on (or, with null, puts the standard fit back). */
  equip(cls: ShipClassId, slot: PartSlot, id: string | null) {
    const fit = (this.s.fit[cls] ??= {});
    if (id === null) delete fit[slot];
    else {
      const p = BY_ID.get(id);
      if (!p || p.slot !== slot || !this.s.owned[id]) return false;
      fit[slot] = id;
    }
    this.save();
    return true;
  }

  markSeen(ids?: string[]) {
    const before = this.s.unseen.length;
    this.s.unseen = ids ? this.s.unseen.filter((id) => !ids.includes(id)) : [];
    if (this.s.unseen.length !== before) this.save();
  }

  /** Every part in the locker; true if anything was new. */
  grantAll() {
    let changed = false;
    for (const p of PARTS) {
      if (this.s.owned[p.id]) continue;
      this.s.owned[p.id] = 1;
      changed = true;
    }
    if (changed) this.save();
    return changed;
  }
}
