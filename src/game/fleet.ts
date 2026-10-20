import * as THREE from 'three';
import { angleDelta, clamp, mulberry32 } from '../core/noise';
import { progressSaved } from '../core/progress';
import { Ship, gunRange, windFactor } from '../ships/ship';
import type { Livery, ShipClassId } from '../ships/shipTypes';
import { dayNumber } from '../ships/parts';
import { World } from './world';

// Your own fleet: up to two escorts that sail in formation on your quarters,
// take your orders and fight at your side. A pirate you board can strike and
// sign on instead of being sent off for prize money, and the harbour masters
// at the trading ports have ships (and captains) for hire. The roster is kept
// between voyages and follows you between devices; the ships themselves are
// built fresh each voyage from it.

export const FLEET_KEY = 'aquati.fleet.v1';
/** Escorts you can have at once. */
export const FLEET_MAX = 2;

export type Order = 'follow' | 'attack' | 'hold';
export const ORDERS: Order[] = ['follow', 'attack', 'hold'];

export const ORDER_INFO: Record<Order, { name: string; short: string; line: string; ack: string[] }> = {
  follow: { name: 'Form on me', short: 'Follow', line: 'Keep station on the flagship and guard her', ack: ['Forming on you!', 'Aye, falling in!', 'On your quarter, Captain!'] },
  attack: { name: 'Attack my target', short: 'Attack', line: 'Break formation and engage the enemy', ack: ['Engaging!', 'Run out the guns!', 'Aye, at them!'] },
  hold: { name: 'Hold position', short: 'Hold', line: 'Heave to and guard these waters', ack: ['Heaving to!', 'Holding here, Captain!', 'Aye, we hold!'] },
};

/** What a harbour master asks to sign a ship and her crew on (from your purse). */
export const HIRE_PRICE: Record<ShipClassId, number> = { sloop: 2500, brig: 6000, galleon: 14000 };

export interface EscortRec {
  id: string;
  cls: ShipClassId;
  name: string;
  /** Her captain, for the roster. */
  master: string;
  origin: 'prize' | 'hired';
  /** A prize keeps the paint she was taken in (and any fittings); hired ships wear your colours. */
  livery?: Livery;
  /** Hull left, 0..1, carried from voyage to voyage until a port mends it. */
  hp: number;
  kills: number;
  /** When she joined (ms since epoch): the roster's order. */
  joined: number;
}

export interface FleetState {
  ships: EscortRec[];
  /** Escorts that went down under your flag, ever. */
  lost: number;
  order: Order;
}

export const freshFleet = (): FleetState => ({ ships: [], lost: 0, order: 'follow' });

const CLASSES: ShipClassId[] = ['sloop', 'brig', 'galleon'];
const LIVERY_KEYS = ['id', 'hull', 'bottom', 'boot', 'strake', 'wale', 'trim', 'sail', 'sailSeam', 'emblem', 'emblemColor', 'flag', 'flag2'] as const;
const LIVERY_EXTRA = ['sailAccent', 'sailPattern', 'skin'] as const;

/** A prize's paint, kept to what a rebuild needs (her flag and sail mark are always yours). */
function cleanLivery(v: unknown): Livery | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  for (const k of LIVERY_KEYS) if (typeof o[k] !== 'string') return undefined;
  // a prize never wears a player's own (owned, uncached) paint, nor a phantom's
  if ((o.id as string).startsWith('custom') || o.ghost) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of LIVERY_KEYS) out[k] = o[k];
  for (const k of LIVERY_EXTRA) if (typeof o[k] === 'string') out[k] = o[k];
  if (o.parts && typeof o.parts === 'object' && !Array.isArray(o.parts)) {
    const parts: Record<string, string> = {};
    for (const [slot, id] of Object.entries(o.parts as Record<string, unknown>)) if (typeof id === 'string') parts[slot] = id;
    out.parts = parts;
  }
  return out as unknown as Livery;
}

function cleanRec(v: unknown): EscortRec | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || !CLASSES.includes(o.cls as ShipClassId) || typeof o.name !== 'string') return null;
  const n = (x: unknown, d = 0) => (Number.isFinite(Number(x)) ? Number(x) : d);
  return {
    id: o.id,
    cls: o.cls as ShipClassId,
    name: o.name.slice(0, 40),
    master: typeof o.master === 'string' ? o.master.slice(0, 40) : '',
    origin: o.origin === 'prize' ? 'prize' : 'hired',
    livery: o.origin === 'prize' ? cleanLivery(o.livery) : undefined,
    hp: clamp(n(o.hp, 1), 0.05, 1),
    kills: Math.max(0, Math.floor(n(o.kills))),
    joined: n(o.joined),
  };
}

/** Tidies a saved fleet (from this device or the cloud). */
export function cleanFleet(r: unknown): FleetState | null {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const o = r as Record<string, unknown>;
  const ships = (Array.isArray(o.ships) ? o.ships : []).map(cleanRec).filter((s): s is EscortRec => !!s);
  const seen = new Set<string>();
  return {
    ships: ships.filter((s) => !seen.has(s.id) && seen.add(s.id)).sort((a, b) => a.joined - b.joined).slice(0, FLEET_MAX),
    lost: Math.max(0, Math.floor(Number(o.lost) || 0)),
    order: ORDERS.includes(o.order as Order) ? (o.order as Order) : 'follow',
  };
}

export function readFleet(): FleetState | null {
  try {
    const v = localStorage.getItem(FLEET_KEY);
    return v ? cleanFleet(JSON.parse(v)) : null;
  } catch {
    return null;
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Three-way merge against the copy this device last synced: a ship signed on
 * here joins, one lost or paid off here leaves, and a ship both sides still
 * have keeps whichever copy changed (her hull, her tally) since the base.
 */
export function mergeFleet(b: FleetState | null, l: FleetState | null, r: FleetState | null): FleetState | null {
  if (!l) return r;
  if (!r) return l;
  const B = new Map((b?.ships ?? []).map((s) => [s.id, s]));
  const L = new Map(l.ships.map((s) => [s.id, s]));
  const out: EscortRec[] = [];
  for (const s of r.ships) {
    const was = B.get(s.id);
    const mine = L.get(s.id);
    if (b && was && !mine) continue; // gone here since the last sync
    out.push(mine && (!was || !same(mine, was)) ? mine : s);
  }
  for (const s of l.ships) if (!out.some((o) => o.id === s.id) && (!b || !B.has(s.id))) out.push(s);
  return cleanFleet({
    ships: out,
    lost: r.lost + Math.max(0, l.lost - (b?.lost ?? 0)),
    order: b && l.order !== b.order ? l.order : r.order,
  });
}

/** The roster: who sails with you, kept between voyages and synced. */
export class FleetStore {
  state: FleetState = readFleet() ?? freshFleet();
  private subs = new Set<() => void>();

  /** The cloud brought another device's fleet. */
  reload() {
    this.state = readFleet() ?? freshFleet();
    this.emit();
  }

  get ships() {
    return this.state.ships;
  }

  get full() {
    return this.state.ships.length >= FLEET_MAX;
  }

  get(id: string) {
    return this.state.ships.find((s) => s.id === id);
  }

  add(rec: EscortRec) {
    if (this.full || this.get(rec.id)) return false;
    this.state.ships.push(rec);
    this.save();
    return true;
  }

  /** Lost at sea (or paid off): off the roster for good. */
  remove(id: string, sunk: boolean) {
    const i = this.state.ships.findIndex((s) => s.id === id);
    if (i < 0) return;
    this.state.ships.splice(i, 1);
    if (sunk) this.state.lost++;
    this.save();
  }

  /** Writes back each escort's hull and tally (quietly unless something changed). */
  sync(recs: { id: string; hp: number; kills: number }[]) {
    let dirty = false;
    for (const u of recs) {
      const s = this.get(u.id);
      if (!s) continue;
      const hp = Math.round(clamp(u.hp, 0.05, 1) * 100) / 100;
      if (s.hp !== hp || s.kills !== u.kills) {
        s.hp = hp;
        s.kills = u.kills;
        dirty = true;
      }
    }
    if (dirty) this.save();
  }

  setOrder(o: Order) {
    if (this.state.order === o) return;
    this.state.order = o;
    this.save();
  }

  subscribe(fn: () => void) {
    this.subs.add(fn);
  }

  private emit() {
    this.subs.forEach((f) => f());
  }

  private save() {
    try {
      localStorage.setItem(FLEET_KEY, JSON.stringify(this.state));
    } catch {
      /* private mode: the fleet lasts the session */
    }
    this.emit();
    progressSaved();
  }
}

// ------------------------------------------------------------------ the harbour master

const SHIP_NAMES = [
  'Swift Tern', 'Merry Dolphin', 'Faithful', 'Dauntless', 'Saucy Sue', 'Sea Lark', 'Valiant', 'Bonny Kate', 'Albatross',
  'Lucky Star', 'Steadfast', 'Morning Glory', 'Silver Heron', 'Good Hope', 'Wanderer', 'Brave Margaret', 'Kingfisher', 'Gallant',
];
const MASTERS: [string, string][] = [
  ['Anne Corbett', 'Never yet lost a ship'],
  ['Jonah Reed', 'Knows every reef by heart'],
  ['Mira Holt', 'Fastest gun crews in the isles'],
  ['Silas Crane', 'Old salt, steady in a blow'],
  ['Isabel Vane', 'Holds a grudge against the Brethren'],
  ['Tobias Fenn', 'Sailed with the Crown for twenty years'],
  ['Grace O\'Malley', 'Fights like a cornered cat'],
  ['Elias Marsh', 'Calm as a millpond under fire'],
  ['Rosa Quint', 'Will follow you into any storm'],
  ['Barnaby Hale', 'Laughs loudest when the shot flies'],
  ['Henrietta Moss', 'A gunner\'s daughter, born on the deck'],
  ['Ned Larkin', 'Young, keen and very lucky'],
];

export interface HireOffer {
  id: string;
  cls: ShipClassId;
  name: string;
  master: string;
  trait: string;
  price: number;
}

/** Two ships a harbour master has to offer today, the same all day at the same port. */
export function hireOffers(portSeed: number, day = dayNumber()): HireOffer[] {
  const rnd = mulberry32((portSeed * 7919 + day * 104729) >>> 0);
  const second: ShipClassId = rnd() < 0.68 ? 'brig' : 'galleon';
  const out: HireOffer[] = [];
  const used = new Set<number>();
  for (const cls of ['sloop', second] as ShipClassId[]) {
    let ni = Math.floor(rnd() * SHIP_NAMES.length);
    while (used.has(ni)) ni = (ni + 1) % SHIP_NAMES.length;
    used.add(ni);
    const [master, trait] = MASTERS[Math.floor(rnd() * MASTERS.length)];
    out.push({ id: `hire-${day}-${portSeed}-${cls}`, cls, name: SHIP_NAMES[ni], master, trait, price: HIRE_PRICE[cls] });
  }
  return out;
}

/** A prize crew's master, picked from her own (now loyal) hands. */
export function prizeMaster() {
  const first = ['Black', 'One-Eyed', 'Red', 'Long', 'Mad', 'Lucky', 'Silent', 'Salty'];
  const last = ['Tom', 'Meg', 'Jack', 'Bess', 'Finn', 'Nell', 'Will', 'Moll'];
  return `${first[Math.floor(Math.random() * first.length)]} ${last[Math.floor(Math.random() * last.length)]}`;
}

// ------------------------------------------------------------------ formation

/**
 * Where escort `i` of `n` keeps station off a flagship `flagLength` long: astern on her
 * quarters, wide enough apart that neither masks the other's broadside. x to
 * port, z astern (metres).
 */
export function station(i: number, n: number, flagLength: number, length: number) {
  const L = (flagLength + length) * 0.5;
  const side = n === 1 ? 1 : i === 0 ? 1 : -1;
  return { x: side * (L + 16), z: L * 1.35 + 12 };
}

// ------------------------------------------------------------------ an escort's captain

export type EscortMode = 'station' | 'fight' | 'hold' | 'fallback' | 'adrift';

const _st = { x: 0, z: 0 };

/** A mark on the sea worth a broadside that isn't a ship (an arm of the Kraken). */
export interface SeaMark {
  x: number;
  z: number;
  r: number;
}

export class EscortAI {
  order: Order = 'follow';
  mode: EscortMode = 'station';
  /** The ship she's fighting, if any. */
  target: Ship | null = null;
  slot = { x: 20, z: 30 };
  private think = 0;
  private desired: number;
  private sideBias = Math.random() < 0.5 ? 1 : -1;
  private rnd = mulberry32(Math.floor(Math.random() * 1e9));
  private aimDelay = 0;
  /** Seconds she has spent too far off station to fight: a breather before the leash lets go again. */
  private leashT = 0;
  /** Her own pace; a ship out of station gets a little extra (every stitch set, the hands at the braces). */
  private readonly baseSpeed: number;

  constructor(readonly ship: Ship, readonly rec: EscortRec) {
    this.desired = ship.heading;
    this.baseSpeed = ship.boost.speed;
  }

  /** How far her guns reach with round shot. */
  get range() {
    return gunRange(this.ship.cls.muzzleSpeed) * 0.92;
  }

  /** A word for the fleet panel. */
  status(): string {
    if (!this.ship.alive) return 'Lost';
    switch (this.mode) {
      case 'fight':
        return this.target ? `Engaging the ${this.target.name}` : 'Engaging';
      case 'hold':
        return 'Holding position';
      case 'fallback':
        return 'Badly holed · falling back';
      case 'adrift':
        return 'Hove to';
      default:
        return this.order === 'attack' ? 'No target · on station' : 'On station';
    }
  }

  /** Steering away from shallows: probe ahead and to either side (as the pirates do). */
  private avoid(world: World, heading: number): number {
    const s = this.ship;
    const L = s.cls.length;
    const blocked = (ang: number, d: number) => world.terrain.heightAt(s.pos.x + Math.sin(ang) * d, s.pos.z + Math.cos(ang) * d) > -s.cls.draft - 1.5;
    const look = [L * 0.8, L * 1.6, L * 2.6 + s.speed * 2];
    if (!look.some((d) => blocked(heading, d))) return heading;
    for (let k = 1; k <= 6; k++) {
      const off = k * 0.32;
      const left = look.every((d) => !blocked(heading + off, d));
      const right = look.every((d) => !blocked(heading - off, d));
      if (left && right) return heading + off * this.sideBias;
      if (left) return heading + off;
      if (right) return heading - off;
    }
    return heading + Math.PI * 0.6;
  }

  /** The way she'd make with full sail on heading `h` (for matching the flagship's pace). */
  private fullSpeed(world: World, h: number) {
    const s = this.ship;
    const w = world.wind;
    const rel = angleDelta(Math.atan2(w.dirX, w.dirZ), h);
    const hpF = (0.72 + 0.28 * (s.hp / s.maxHp)) * s.dmg.speedFactor;
    return Math.max(1, s.cls.maxSpeed * s.boost.speed * windFactor((rel * 180) / Math.PI) * (0.75 + 0.25 * w.strength) * hpF);
  }

  /**
   * `flag` is your ship (null once she's gone), `foes` every hostile ship
   * afloat, `mark` the ship your own guns last laid on, `others` every hull to
   * keep clear of and `marks` anything else worth a broadside.
   */
  update(dt: number, world: World, flag: Ship | null, foes: Ship[], mark: Ship | null, others: Ship[], marks: SeaMark[] = []) {
    const s = this.ship;
    if (!s.alive) {
      s.rudder = 0;
      return;
    }
    this.think -= dt;
    const range = this.range;
    const flagOk = !!flag && flag.alive;
    if (this.think <= 0) {
      this.think = 0.35 + this.rnd() * 0.25;
      this.leashT = Math.max(0, this.leashT - 0.4);
      this.choose(world, flagOk ? flag : null, foes, mark, range);
      this.steer(world, flagOk ? flag : null, range);
      // keep clear of other hulls (the flagship most of all)
      for (const o of others) {
        if (o === s || !o.alive || o.removed) continue;
        const ox = o.pos.x - s.pos.x;
        const oz = o.pos.z - s.pos.z;
        const od = Math.hypot(ox, oz);
        const minD = (o.cls.length + s.cls.length) * (o === flag ? 0.95 : 0.75);
        if (od < minD) this.desired += angleDelta(this.desired, Math.atan2(-ox, -oz)) * (o === flag ? 0.7 : 0.5);
      }
    }
    s.rudder = clamp(angleDelta(s.heading, this.avoid(world, this.desired)) * 2.2, -1, 1);
    this.gunnery(dt, world, foes, marks, range);
  }

  /** Picks what she's doing: who to fight, or where to be. */
  private choose(world: World, flag: Ship | null, foes: Ship[], mark: Ship | null, range: number) {
    const s = this.ship;
    if (!flag) {
      // the flagship is gone: she breaks off and makes for home
      this.mode = 'adrift';
      this.target = null;
      return;
    }
    const hpF = s.hp / s.maxHp;
    const fromFlag = Math.hypot(s.pos.x - flag.pos.x, s.pos.z - flag.pos.z);
    const leash = this.order === 'attack' ? 650 : this.order === 'hold' ? Infinity : 240;
    if (hpF < 0.2 && this.order !== 'hold') {
      // too badly holed to stand in the line: back under the flagship's guns
      this.mode = 'fallback';
      this.target = null;
      return;
    }
    if (fromFlag > leash) this.leashT = 6;
    const live = (t: Ship | null) => !!t && t.alive && !t.removed && foes.includes(t);
    let pick: Ship | null = null;
    if (this.order === 'attack') {
      if (live(mark) && Math.hypot(mark!.pos.x - flag.pos.x, mark!.pos.z - flag.pos.z) < 700) pick = mark;
      else if (live(this.target) && Math.hypot(this.target!.pos.x - flag.pos.x, this.target!.pos.z - flag.pos.z) < 560) pick = this.target;
      else pick = nearest(foes, flag.pos.x, flag.pos.z, 480);
    } else if (this.order === 'hold') {
      pick = live(this.target) && dist(this.target!, s) < range * 1.15 ? this.target : nearest(foes, s.pos.x, s.pos.z, range * 1.05);
    } else if (this.leashT <= 0) {
      // guarding: whoever comes for the flagship (or for her), and nothing she'd have to chase far
      const t = world.time;
      let best: Ship | null = null;
      let bd = Infinity;
      for (const f of foes) {
        const df = Math.hypot(f.pos.x - flag.pos.x, f.pos.z - flag.pos.z);
        const de = dist(f, s);
        const hostile = (flag.lastAttacker === f && t - flag.lastHit < 15) || (s.lastAttacker === f && t - s.lastHit < 15);
        if (de > range * 1.5 && !(hostile && df < 300)) continue;
        if (df > 260) continue;
        const score = de * (hostile ? 0.6 : 1) * (f === this.target ? 0.8 : 1);
        if (score < bd) {
          bd = score;
          best = f;
        }
      }
      pick = best;
    }
    this.target = pick;
    this.mode = pick ? 'fight' : this.order === 'hold' ? 'hold' : 'station';
  }

  private steer(world: World, flag: Ship | null, range: number) {
    const s = this.ship;
    s.boost.speed = this.baseSpeed;
    if (this.mode === 'adrift' || !flag) {
      // nothing to guard: away under easy sail, out of the fight
      s.sailTarget = 1 / 3;
      return;
    }
    if (this.mode === 'hold') {
      s.sailTarget = 0;
      this.desired = s.heading;
      return;
    }
    if (this.mode === 'fight' && this.target) {
      const t = this.target;
      const dx = t.pos.x - s.pos.x;
      const dz = t.pos.z - s.pos.z;
      const d = Math.hypot(dx, dz);
      const bearing = Math.atan2(dx, dz);
      if (this.order === 'hold') {
        // hove to: just swing the loaded broadside round onto her
        const rel = angleDelta(s.heading, bearing);
        const side = s.canFire(rel > 0 ? 'port' : 'starboard') || !s.canFire(rel > 0 ? 'starboard' : 'port') ? Math.sign(rel) || 1 : -(Math.sign(rel) || 1);
        this.desired = bearing - side * (Math.PI / 2);
        s.sailTarget = Math.abs(angleDelta(s.heading, this.desired)) > 0.35 ? 0.25 : 0;
        return;
      }
      // keep her abeam on whichever side is loaded, at a comfortable range for the guns
      const rel = angleDelta(s.heading, bearing);
      let side = rel > 0 ? 1 : -1;
      if (!s.canFire(side > 0 ? 'port' : 'starboard') && s.canFire(side > 0 ? 'starboard' : 'port') && d < range * 0.9) side = -side;
      const ideal = range * 0.55;
      let off = Math.PI / 2;
      if (d > ideal * 1.5) off = Math.PI * 0.22;
      else if (d > ideal * 1.1) off = Math.PI * 0.38;
      else if (d < ideal * 0.55) off = Math.PI * 0.72;
      this.desired = bearing - side * off;
      s.sailTarget = d > ideal * 1.2 ? 1 : 0.75;
      return;
    }
    // on station (or falling back to it, under all the canvas she has)
    const sl = this.mode === 'fallback' ? { x: this.slot.x * 0.6, z: this.slot.z * 0.6 } : this.slot;
    const sh = Math.sin(flag.heading);
    const ch = Math.cos(flag.heading);
    // port = (cos h, -sin h), forward = (sin h, cos h)
    _st.x = flag.pos.x + ch * sl.x - sh * sl.z;
    _st.z = flag.pos.z - sh * sl.x - ch * sl.z;
    const ex = _st.x - s.pos.x;
    const ez = _st.z - s.pos.z;
    const gap = Math.hypot(ex, ez);
    const along = ex * sh + ez * ch; // + she's astern of her station
    const across = ex * ch - ez * sh; // + her station is to port
    const stopped = flag.anchored || (flag.speed < 1.8 && flag.sailTarget < 0.1);
    if (stopped) {
      // the flagship has hove to (or anchored): come up to the station and lie there
      if (gap < 22) {
        s.sailTarget = 0;
        this.desired = flag.heading;
      } else {
        this.desired = Math.atan2(ex, ez);
        s.sailTarget = gap > 60 ? 1 : gap > 34 ? 2 / 3 : 0.4;
      }
      return;
    }
    if (gap > 48) {
      // well off station: steer for a point a little ahead of it, so she falls in alongside rather than chasing
      this.desired = Math.atan2(ex + sh * 26, ez + ch * 26);
      s.sailTarget = 1;
      if (along > 0) s.boost.speed = this.baseSpeed * 1.3;
      return;
    }
    // in station: hold the flagship's course, easing across onto the line and matching her pace
    this.desired = flag.heading + clamp(across * 0.035, -0.5, 0.5);
    // dropping astern of a flagship under full sail: a touch more than she has, so she can close up
    if (along > 4) s.boost.speed = this.baseSpeed * (1 + Math.min(0.25, along * 0.008));
    const want = flag.speed + clamp(along * 0.22, -3.5, 5);
    s.sailTarget = clamp(want / this.fullSpeed(world, this.desired), 0.06, 1);
  }

  /** Any foe (or other mark) sat in a loaded broadside's arc and in reach gets it. */
  private gunnery(dt: number, world: World, foes: Ship[], marks: SeaMark[], range: number) {
    const s = this.ship;
    this.aimDelay -= dt;
    if (this.aimDelay > 0 || this.mode === 'adrift') return;
    if (!s.canFire('port') && !s.canFire('starboard')) return;
    const arc = 0.42;
    let fired = false;
    const tryAt = (x: number, z: number, t: Ship | null) => {
      const d = Math.hypot(x - s.pos.x, z - s.pos.z);
      if (d > range * 1.05 || d < s.cls.beam) return false;
      const rel = angleDelta(s.heading, Math.atan2(x - s.pos.x, z - s.pos.z));
      for (const side of ['port', 'starboard'] as const) {
        const want = side === 'port' ? Math.PI / 2 : -Math.PI / 2;
        if (Math.abs(rel - want) < arc && s.canFire(side)) {
          s.ammo = 'round';
          s.fire(side, world, t, t ? null : _pt.set(x, 0, z));
          return true;
        }
      }
      return false;
    };
    // her own target first, then whoever else wanders into her guns
    const t = this.target;
    if (t && t.alive) fired = tryAt(t.pos.x, t.pos.z, t);
    if (!fired) {
      for (const f of foes) {
        if (f === t || !f.alive) continue;
        if (tryAt(f.pos.x, f.pos.z, f)) {
          fired = true;
          break;
        }
      }
    }
    if (!fired) for (const m of marks) if (tryAt(m.x, m.z, null)) break;
    if (fired) this.aimDelay = 0.5 + this.rnd() * 0.9;
  }
}

const _pt = new THREE.Vector3();

const dist = (a: Ship, b: Ship) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);

function nearest(foes: Ship[], x: number, z: number, within: number): Ship | null {
  let best: Ship | null = null;
  let bd = within;
  for (const f of foes) {
    const d = Math.hypot(f.pos.x - x, f.pos.z - z);
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  return best;
}
