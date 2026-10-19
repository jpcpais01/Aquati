// Shot types. Every gun on a ship loads the same kind for a broadside, and
// each kind trades something for something: round shot is the honest all-
// rounder you never run out of; the specials are powerful, carried in short
// supply and topped up from salvage, chests and friendly isles.

export type AmmoId = 'round' | 'shell' | 'fire' | 'chain' | 'grape';

export interface AmmoType {
  id: AmmoId;
  name: string;
  /** One word for the rack. */
  short: string;
  /** What it does, for tooltips. */
  blurb: string;
  /** UI colour. */
  css: string;
  /** Hull damage per ball, × the ship's gun damage. */
  damage: number;
  /** Reload time, × the class reload. */
  reload: number;
  /** Muzzle velocity, × the class muzzle speed (reach goes with its square). */
  speed: number;
  /** Balls per gun. */
  balls: number;
  /** Scatter (radians) of the balls from one gun. */
  spread: number;
  /** Ball size, × a round shot. */
  size: number;
  /** Ball colour (sRGB hex). */
  color: number;
  /** Trail the ball leaves; null keeps the ship's own (vault) trail. */
  trail: string | null;
  /** Most broadsides' worth you can carry; Infinity for round shot. */
  max: number;
  /** Broadsides' worth aboard when a voyage begins. */
  start: number;
}

export const AMMO: Record<AmmoId, AmmoType> = {
  round: {
    id: 'round',
    name: 'Round shot',
    short: 'Round',
    blurb: 'Solid iron. Reliable, long reach, and the magazine never runs dry.',
    css: '#d9e2e6',
    damage: 1,
    reload: 1,
    speed: 1,
    balls: 1,
    spread: 0,
    size: 1,
    color: 0x1c1d20,
    trail: null,
    max: Infinity,
    start: Infinity,
  },
  shell: {
    id: 'shell',
    name: 'Explosive shell',
    short: 'Shell',
    blurb: 'Hollow shot packed with powder. Bursts on impact and wrecks everything close by, even on a near miss. Slow to load.',
    css: '#ffb347',
    damage: 0.55,
    reload: 1.4,
    speed: 0.9,
    balls: 1,
    spread: 0,
    size: 1.12,
    color: 0x2a2622,
    trail: 'fuse',
    max: 12,
    start: 3,
  },
  fire: {
    id: 'fire',
    name: 'Fire shot',
    short: 'Fire',
    blurb: 'Red-hot iron. Sets the target ablaze, burning her down until the fire dies. Rain puts it out sooner.',
    css: '#ff6a3d',
    damage: 0.6,
    reload: 1.25,
    speed: 0.95,
    balls: 1,
    spread: 0,
    size: 1,
    color: 0x6b2410,
    trail: 'fire',
    max: 12,
    start: 3,
  },
  chain: {
    id: 'chain',
    name: 'Chain shot',
    short: 'Chain',
    blurb: 'Two half-balls on a chain that scythe through the rigging. Shreds sails and slows the target to a crawl. Shorter reach.',
    css: '#9fd8ff',
    damage: 0.35,
    reload: 1.2,
    speed: 0.85,
    balls: 1,
    spread: 0,
    size: 0.8,
    color: 0x26292d,
    trail: 'chain',
    max: 12,
    start: 3,
  },
  grape: {
    id: 'grape',
    name: 'Grape shot',
    short: 'Grape',
    blurb: 'A bag of musket balls that sprays the deck. Brutal up close, cuts down gun crews so they reload slowly. Short reach, quick to load.',
    css: '#c9b3ff',
    damage: 0.17,
    reload: 0.8,
    speed: 0.72,
    balls: 6,
    spread: 0.075,
    size: 0.42,
    color: 0x3a3a3c,
    trail: 'grape',
    max: 12,
    start: 4,
  },
};

export const AMMO_ORDER: AmmoId[] = ['round', 'shell', 'fire', 'chain', 'grape'];
export const SPECIALS: AmmoId[] = ['shell', 'fire', 'chain', 'grape'];

/** How long effects last, and how hard they bite. */
export const EFFECT = {
  /** Explosive shell: burst radius (m) and damage at the centre, × gun damage. */
  blastRadius: 7.5,
  blastDamage: 0.95,
  /** Fire shot: seconds of burning per ball that strikes, the cap, and hull burnt per second (fraction of max). */
  burnPerHit: 2.6,
  burnMax: 12,
  burnRate: 0.018,
  /** Chain shot: seconds the canvas stays shredded, and the speed it costs. */
  tornTime: 14,
  tornSlow: 0.38,
  /** Grape shot: seconds the gun crews stay thinned, and how much slower they reload. */
  crewTime: 10,
  crewReload: 0.55,
};

export type AmmoStock = Record<AmmoId, number>;

export function freshStock(): AmmoStock {
  const s = {} as AmmoStock;
  for (const id of AMMO_ORDER) s[id] = AMMO[id].start;
  return s;
}

/**
 * Shot found in salvage, by tier (0 barrel .. 4 legendary chest). Barrels only
 * sometimes hold a keg of something special; the finer the chest the more
 * kinds, and the more of each.
 */
export function ammoLoot(tier: number, rnd = Math.random): Partial<AmmoStock> {
  const out: Partial<AmmoStock> = {};
  const pick = (n: number, each: number) => {
    const pool = SPECIALS.slice();
    for (let i = 0; i < n && pool.length; i++) {
      const id = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      out[id] = (out[id] ?? 0) + each;
    }
  };
  if (tier === 0) {
    if (rnd() < 0.35) pick(1, 1);
  } else if (tier === 1) pick(1, 2);
  else if (tier === 2) pick(2, 2);
  else if (tier === 3) pick(3, 3);
  else pick(4, 4);
  return out;
}
