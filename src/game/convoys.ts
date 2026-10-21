import * as THREE from 'three';
import { angleDelta, clamp } from '../core/noise';
import { Ship } from '../ships/ship';
import { ShipModel } from '../ships/shipModel';
import type { Livery, ShipClass } from '../ships/shipTypes';
import { EDGE_R, HIGH_SEAS_R, REGION_R, REGIONS, nearestRegion, type Region } from '../world/regions';
import { LOOT, LootId, Market, MarketTaste, Rarity } from './treasure';
import type { World } from './world';

// Merchant convoys of the high seas. Out on Mar Sereno, between the two
// archipelagos, the trading houses run their cargoes across in company: a
// tubby Ronvliet fluyt deep-laden with casks, a slim Aguadouro xebec under
// striped lateens carrying bullion, a little tan-sailed Vila Garoa ketch with
// tea and silk from the mist. Two or three sail together in line, at the pace
// of the slowest. Come alongside and hail one, and she heaves to and opens her
// hatches: she buys from your hold at her own house's prices and sells you
// what she carries. Fire on them (or ram one) and the whole convoy cracks on
// sail and runs, and will not trade with you.
//
// Every hull is a real ship from the shipwright's generator (cargo lashed on
// deck, no guns) built a slice at a time in the yard; the few hulls are kept
// and sent out again, so a convoy costs nothing to launch. They sail apart
// from the fighting ships: no pirate or gunner aims at them, and only the
// game's crews, collisions and charts see them.

export type MerchantKindId = 'fluyt' | 'xebec' | 'ketch';

export interface MerchantKind {
  id: MerchantKindId;
  /** What she is, for the chart and the market ("Ronvliet fluyt"). */
  title: string;
  house: string;
  cls: ShipClass;
  livery: Livery;
  names: string[];
  masters: string[];
  /** What she carries in her hold (and sells you). */
  wares: LootId[];
  /** What she pays for yours. */
  taste: MarketTaste;
}

const base = { cannonsPerSide: 0, cannonSpan: [0.3, 0.7] as [number, number], chasers: 0, reload: 99, damage: 0, muzzleSpeed: 50, armor: 0.1, jib: true };

export const MERCHANTS: Record<MerchantKindId, MerchantKind> = {
  fluyt: {
    id: 'fluyt',
    title: 'Ronvliet fluyt',
    house: 'Ronvliet Company',
    cls: {
      ...base,
      id: 'brig',
      key: 'fluyt',
      cargo: 1,
      name: 'Fluyt',
      title: 'Fluyt',
      blurb: 'A round-bellied Ronvliet cargo carrier, narrow on deck and wide in the hold.',
      length: 18.5,
      beam: 6.4,
      draft: 2.1,
      freeboard: 1.7,
      bulwark: 0.8,
      transom: 0.46,
      sheerBow: 0.75,
      sheerStern: 0.75,
      // the fluyt's famous pear-shaped section: broad at the waterline, pinched at the rail
      tumblehome: 0.2,
      sternCastle: { t: 0.2, h: 1.7 },
      masts: [
        { t: 0.16, height: 10.5, rig: 'lateen', tiers: 1, span: 0.75 },
        { t: 0.47, height: 16.5, rig: 'square', tiers: 2, top: true },
        { t: 0.76, height: 14.5, rig: 'square', tiers: 2 },
      ],
      bowsprit: 5.5,
      hp: 560,
      maxSpeed: 7.4,
      accel: 0.26,
      turnRate: 0.42,
      mass: 2.1,
      stats: { speed: 0.4, agility: 0.3, armour: 0.3, hull: 0.7, firepower: 0 },
    },
    livery: {
      id: 'merchant-ronvliet',
      hull: '#6b4528',
      bottom: '#d6ccb2',
      boot: '#f2ead6',
      strake: '#2f6e3c',
      wale: '#1c140e',
      trim: '#e8c25a',
      sail: '#f3ead6',
      sailSeam: '#dccdb0',
      emblem: 'none',
      emblemColor: '#2f6e3c',
      flag: '#2f7d3a',
      flag2: '#f0cf5e',
      flagDesign: { shape: 'swallowtail', bg: '#2f7d3a', pattern: 'band', patternColor: '#f0cf5e', emblem: 'star', emblemColor: '#f6efd8', backing: 'none', emblemScale: 0.9, paint: '' },
      sailMark: { emblem: 'star', backing: 'ring', color: '#2f7d3a' },
    },
    names: ['Morgenster', 'Goede Hoop', 'Zeemeeuw', 'Gouden Leeuw', 'Witte Valk', 'Vrouw Maria', 'Drie Gebroeders', 'Noordster'],
    masters: ['Pieter Ronvliet', 'Jan de Wit', 'Hendrikje Smit', 'Willem Kuyper', 'Klaas Visser', 'Anneke Brand'],
    wares: ['rum', 'cider', 'brandy', 'wine', 'reserve', 'coffee', 'sugar', 'cheese', 'hardtack', 'oranges', 'saltfish', 'tobacco', 'spices', 'saffron'],
    taste: { tagline: 'Casks and victuals from the distillery. She pays well for cloth, coin and gems.', mult: { cloth: 1.25, coin: 1.1, gems: 1.1, jewellery: 1.05, art: 1, relics: 0.95, provisions: 0.72, spirits: 0.7 } },
  },
  xebec: {
    id: 'xebec',
    title: 'Aguadouro xebec',
    house: 'Aguadouro Bullion Line',
    cls: {
      ...base,
      id: 'brig',
      key: 'xebec',
      cargo: 0.45,
      jib: false,
      name: 'Xebec',
      title: 'Xebec',
      blurb: 'A long, low bullion runner under three great lateens, quick enough to show any thief her stern.',
      length: 17.5,
      beam: 4.4,
      draft: 1.5,
      freeboard: 1.35,
      bulwark: 0.72,
      transom: 0.5,
      sheerBow: 1.0,
      sheerStern: 0.8,
      tumblehome: 0.04,
      masts: [
        { t: 0.2, height: 11.5, rig: 'lateen', tiers: 1, span: 0.85 },
        { t: 0.5, height: 15, rig: 'lateen', tiers: 1, span: 1.15 },
        { t: 0.8, height: 13.5, rig: 'lateen', tiers: 1, span: 1.05 },
      ],
      bowsprit: 6.5,
      hp: 420,
      maxSpeed: 9.6,
      accel: 0.4,
      turnRate: 0.7,
      mass: 1.2,
      stats: { speed: 0.6, agility: 0.7, armour: 0.2, hull: 0.5, firepower: 0 },
    },
    livery: {
      id: 'merchant-aguadouro',
      hull: '#2c4a86',
      bottom: '#e6dcc4',
      boot: '#f3ecdc',
      strake: '#f3ecdc',
      wale: '#14203d',
      trim: '#e2b552',
      sail: '#f6f0e2',
      sailSeam: '#ddd1b8',
      sailPattern: 'stripes',
      sailAccent: '#3a5a9c',
      emblem: 'none',
      emblemColor: '#e2b552',
      flag: '#27407a',
      flag2: '#e2b552',
      flagDesign: { shape: 'burgee', bg: '#27407a', pattern: 'border', patternColor: '#e2b552', emblem: 'crown', emblemColor: '#e2b552', backing: 'none', emblemScale: 1, paint: '' },
    },
    names: ['Santa Luzia', 'Estrela do Mar', 'Flor de Prata', 'Dom Sebastião', 'Rainha do Sul', 'Andorinha', 'São Gabriel', 'Boa Ventura'],
    masters: ['Duarte Lemos', 'Inês Barreto', 'Afonso Carvalho', 'Beatriz Sampaio', 'Rodrigo Teles'],
    wares: ['pennies', 'cowries', 'silver', 'coral', 'doubloons', 'ingots', 'pearls', 'emeralds', 'cameo', 'ruby', 'diamond'],
    taste: { tagline: 'Bullion out of the counting houses. She pays well for victuals, spirits and cloth.', mult: { provisions: 1.25, spirits: 1.2, cloth: 1.1, art: 1.05, relics: 1, coin: 0.72, gems: 0.72, jewellery: 0.72 } },
  },
  ketch: {
    id: 'ketch',
    title: 'Vila Garoa ketch',
    house: 'Vila Garoa tea packet',
    cls: {
      ...base,
      id: 'sloop',
      key: 'ketch',
      cargo: 0.8,
      name: 'Ketch',
      title: 'Ketch',
      blurb: 'A little two-masted packet from the mist, tan sails and a deck full of tea chests.',
      length: 12.5,
      beam: 4.3,
      draft: 1.3,
      freeboard: 1.3,
      bulwark: 0.66,
      transom: 0.64,
      sheerBow: 0.75,
      sheerStern: 0.45,
      tumblehome: 0.05,
      masts: [
        { t: 0.2, height: 9, rig: 'gaff', tiers: 1, span: 0.5 },
        { t: 0.6, height: 12.5, rig: 'gaff', tiers: 1, span: 0.66 },
      ],
      bowsprit: 4.6,
      hp: 300,
      maxSpeed: 10.2,
      accel: 0.5,
      turnRate: 0.85,
      mass: 0.85,
      stats: { speed: 0.7, agility: 0.85, armour: 0.15, hull: 0.3, firepower: 0 },
    },
    livery: {
      id: 'merchant-garoa',
      hull: '#7a5a3a',
      bottom: '#b9545a',
      boot: '#faf4ea',
      strake: '#3f6f62',
      wale: '#1b2420',
      trim: '#e7c46d',
      // tanned canvas, the colour of red ochre, as the barges of the mist carry it
      sail: '#c7774f',
      sailSeam: '#a65e3c',
      emblem: 'none',
      emblemColor: '#f4e6dc',
      flag: '#3f6f62',
      flag2: '#d9667a',
      flagDesign: { shape: 'swallowtail', bg: '#3f6f62', pattern: 'hoist', patternColor: '#d9667a', emblem: 'moon', emblemColor: '#faf4ea', backing: 'none', emblemScale: 0.9, paint: '' },
      sailMark: { emblem: 'moon', backing: 'none', color: '#f4e6dc' },
    },
    names: ['Garça Branca', 'Névoa', 'Lua Rosa', 'Bruma Doce', 'Orvalho', 'Lótus', 'Grou', 'Chuvisco'],
    masters: ['Lin Garoa', 'Amaya Teodoro', 'Chen Bastos', 'Rosa Nakamura', 'Tomás Ito'],
    wares: ['tea', 'silk', 'lace', 'calico', 'indigo', 'rope', 'pipe', 'scrimshaw', 'jade', 'musicBox', 'carpet'],
    taste: { tagline: 'Tea and silk out of the mist. She pays well for spirits, relics and gems.', mult: { spirits: 1.3, relics: 1.2, gems: 1.15, coin: 1, jewellery: 1, provisions: 0.72, art: 0.72, cloth: 0.7 } },
  },
};

export const MERCHANT_KINDS = Object.values(MERCHANTS);

/** The kind a hull was built as (by its paint key), if she's a merchantman. */
export function merchantKindOf(cls: ShipClass): MerchantKind | null {
  return (cls.key && (MERCHANTS as Record<string, MerchantKind>)[cls.key]) || null;
}

/** A lot on her counter: how many, at her asking price. `deal`: priced under the fair value. */
export interface Ware {
  id: LootId;
  n: number;
  price: number;
  deal: boolean;
}

export interface Merchant {
  ship: Ship;
  kind: MerchantKind;
  master: string;
  market: Market;
  wares: Ware[];
  /** Place in the line (0 leads). */
  slot: number;
  /** Echelon offset off the leader's wake (m, + to port). */
  side: number;
  /** Fired on (or rammed): she won't be sent out again with her scars. */
  struck: boolean;
}

export interface Convoy {
  fleet: Merchant[];
  /** Where she's bound. */
  dest: Region;
  /** Seen from your deck yet (the toast). */
  sighted: boolean;
  /** Fired on: every hull runs from you and none will trade. */
  scattered: boolean;
  /** The ship you're alongside, trading (all the convoy heaves to). */
  parley: Merchant | null;
  t: number;
}

/** Seconds after you reach the high seas before the first convoy can heave into sight, and between convoys. */
const FIRST_WAIT: [number, number] = [30, 65];
const NEXT_WAIT: [number, number] = [120, 210];
/** Beyond this from the camera's focus they're too far to see: no physics, no draw. */
const FAR = 760;

const _v = new THREE.Vector3();
const _inv = new THREE.Matrix4();
const _n = new THREE.Vector3();
const range = ([a, b]: [number, number]) => a + Math.random() * (b - a);
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** Her manifest for this crossing: four to six lots of her house's goods, now and then one going cheap. */
function manifest(kind: MerchantKind): Ware[] {
  const pool = kind.wares.slice();
  const lots = 4 + Math.floor(Math.random() * 3);
  const out: Ware[] = [];
  // rarer goods turn up less often
  const weight = (r: Rarity) => [1, 0.75, 0.4, 0.14, 0][r];
  let deal = Math.random() < 0.6;
  for (let i = 0; i < lots && pool.length; i++) {
    let tot = 0;
    for (const id of pool) tot += weight(LOOT[id].rarity);
    let r = Math.random() * tot;
    let k = 0;
    for (; k < pool.length - 1; k++) {
      r -= weight(LOOT[pool[k]].rarity);
      if (r <= 0) break;
    }
    const id = pool.splice(k, 1)[0];
    const rar = LOOT[id].rarity;
    const n = rar === 0 ? 2 + Math.floor(Math.random() * 3) : rar === 1 ? 1 + Math.floor(Math.random() * 3) : rar === 2 ? 1 + Math.floor(Math.random() * 2) : 1;
    // the house's asking price: a little over fair, or a bargain to clear the hold
    const cheap = deal && rar <= 2 && Math.random() < 0.5;
    if (cheap) deal = false;
    // (her own goods never fetch that much back from her: she pays under 0.75 of fair for them)
    const mult = cheap ? 0.86 + Math.random() * 0.06 : 1.04 + Math.random() * 0.12;
    out.push({ id, n, price: Math.max(1, Math.round(LOOT[id].price * mult)), deal: cheap });
  }
  return out.sort((a, b) => LOOT[b.id].price - LOOT[a.id].price);
}

export class Convoys {
  /** The convoy at sea (one at a time), if any. */
  convoy: Convoy | null = null;
  /** Hulls built and waiting to be sent out. */
  private yard: Ship[] = [];
  private wait = range(FIRST_WAIT);
  private crossing = false;
  private all: Ship[] = [];
  /** A convoy came into sight. */
  onSighted: (c: Convoy) => void = () => {};
  /** You fired on one (or rammed her): they all run. */
  onScatter: (c: Convoy, m: Merchant) => void = () => {};

  constructor(private readonly opaque: THREE.Object3D, private readonly water: THREE.Object3D) {}

  // ---------------------------------------------------------------- the yard

  /** The next kind of hull the yard wants laid down, if it's short of one. */
  wanted(): MerchantKind | null {
    const afloat = this.convoy?.fleet.map((m) => m.kind) ?? [];
    for (const k of MERCHANT_KINDS) if (!this.yard.some((s) => merchantKindOf(s.cls) === k) && !afloat.includes(k)) return k;
    return null;
  }

  get stocked() {
    return this.yard.length;
  }

  /** A hull fresh off the slipway (built by the game's shipyard). */
  launch(model: ShipModel) {
    const s = new Ship(model.cls, model.livery, 'merchant', 1, model);
    this.yard.push(s);
  }

  // ---------------------------------------------------------------- at sea

  /** Every merchant hull afloat. */
  get ships(): readonly Ship[] {
    return this.all;
  }

  /** `ships` and the merchantmen afloat together (the same array back when there are none). */
  with(ships: Ship[], into: Ship[]): Ship[] {
    if (!this.all.length) return ships;
    into.length = 0;
    for (const s of ships) into.push(s);
    for (const s of this.all) into.push(s);
    return into;
  }

  merchantOf(s: Ship): Merchant | null {
    return this.convoy?.fleet.find((m) => m.ship === s) ?? null;
  }

  /**
   * Sends a convoy out across `p`'s path, beyond the edge of what the camera
   * sees (`viewR`): most head the other way and pass you; some sail your
   * way, slower, so you overhaul them. `near`: right ahead, for testing.
   */
  spawn(p: Ship, viewR: number, near = false): boolean {
    if (this.convoy || this.yard.length < 2) return false;
    const [A, B] = REGIONS;
    const ux = B.x - A.x;
    const uz = B.z - A.z;
    const uL = Math.hypot(ux, uz);
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    const along = (fx * ux + fz * uz) / uL;
    const ahead = Math.abs(along) < 0.3 ? (Math.random() < 0.5 ? A : B) : along > 0 ? B : A;
    const passing = near || Math.random() < 0.65;
    const dest = passing ? (ahead === A ? B : A) : ahead;
    const D = near ? 150 : Math.max(480, viewR + 260) * (passing ? 1 : 0.7);
    const side = Math.random() < 0.5 ? 1 : -1;
    const off = (near ? 40 : passing ? 90 + Math.random() * 90 : 50 + Math.random() * 60) * side;
    let x = p.pos.x + fx * D + fz * off;
    let z = p.pos.z + fz * D - fx * off;
    // keep well inside the known sea: drawn in toward the lane between the archipelagos
    const t = clamp(((x - A.x) * ux + (z - A.z) * uz) / (uL * uL), 0, 1);
    const lx = A.x + ux * t;
    const lz = A.z + uz * t;
    const d = Math.hypot(x - lx, z - lz);
    const lim = EDGE_R - 320;
    if (d > lim) {
      x = lx + ((x - lx) / d) * lim;
      z = lz + ((z - lz) / d) * lim;
    }
    // out on the open ocean, clear of every isle and reef
    if (nearestRegion(x, z).dist < HIGH_SEAS_R + 120) return false;
    const heading = Math.atan2(dest.x - x, dest.z - z);

    // two or three hulls, the slowest leading so the line keeps together
    const n = this.yard.length >= 3 && Math.random() < 0.45 ? 3 : 2;
    const hulls = this.yard.sort(() => Math.random() - 0.5).splice(0, n);
    hulls.sort((a, b) => a.cls.maxSpeed - b.cls.maxSpeed);
    const fleet: Merchant[] = [];
    const used = new Set<string>();
    const hx = Math.sin(heading);
    const hz = Math.cos(heading);
    let back = 0;
    for (const [i, s] of hulls.entries()) {
      const kind = merchantKindOf(s.cls)!;
      let name = pick(kind.names);
      for (let k = 0; k < 6 && used.has(name); k++) name = pick(kind.names);
      used.add(name);
      s.name = name;
      if (i > 0) back += (hulls[i - 1].cls.length + s.cls.length) * 0.5 + 15;
      const sd = i === 0 ? 0 : (i % 2 ? 1 : -1) * (5 + Math.random() * 3);
      s.place(x - hx * back + hz * sd, z - hz * back - hx * sd, heading);
      s.hp = s.maxHp;
      s.alive = true;
      // willing to deal (the chart's trade-gold mark) until you give her cause not to be
      s.calm = true;
      s.anchored = false;
      s.drift.set(0, 0);
      s.sailTarget = s.sailLevel = 0.7;
      s.speed = s.cls.maxSpeed * 0.8;
      this.opaque.add(s.root);
      this.water.add(s.bowWave.mesh);
      fleet.push({ ship: s, kind, master: pick(kind.masters), market: new Market(kind.taste, Math.floor(Math.random() * 1e6)), wares: manifest(kind), slot: i, side: sd, struck: false });
    }
    this.convoy = { fleet, dest, sighted: false, scattered: false, parley: null, t: 0 };
    this.all = fleet.map((m) => m.ship);
    return true;
  }

  /** Back to the yard (unscathed hulls) or the breakers (the rest). Returns the hulls to break up. */
  private retire(): Ship[] {
    const c = this.convoy;
    if (!c) return [];
    const scrap: Ship[] = [];
    for (const m of c.fleet) {
      this.opaque.remove(m.ship.root);
      this.water.remove(m.ship.bowWave.mesh);
      if (m.struck) scrap.push(m.ship);
      else this.yard.push(m.ship);
    }
    this.convoy = null;
    this.all = [];
    this.wait = range(NEXT_WAIT);
    return scrap;
  }

  /**
   * Sails the convoy a frame (and now and then sends one out while you're on
   * the high seas). Returns any hulls to break up. `focus`: what the camera
   * looks at; `viewR`: how far round it the view reaches.
   */
  update(dt: number, w: World, p: Ship | null, focus: THREE.Vector3, viewR: number, highSeas: boolean, canSpawn: boolean): Ship[] {
    if (highSeas !== this.crossing) {
      this.crossing = highSeas;
      if (highSeas) this.wait = Math.min(this.wait, range(FIRST_WAIT));
    }
    const c = this.convoy;
    if (!c) {
      if (highSeas && canSpawn && p && p.alive && dt > 0) {
        this.wait -= dt;
        if (this.wait <= 0 && !this.spawn(p, viewR)) this.wait = 4;
      }
      return [];
    }
    if (dt <= 0) return [];
    c.t += dt;
    const lead = c.fleet[0].ship;
    for (const m of c.fleet) this.steer(m, c, lead, p);
    let far = true;
    for (const m of c.fleet) {
      const s = m.ship;
      const d = Math.hypot(s.pos.x - focus.x, s.pos.z - focus.z);
      if (d < FAR) {
        far = false;
        s.root.visible = true;
        s.update(dt, w);
      } else {
        // over the horizon: just carried along her course, nothing drawn
        s.root.visible = false;
        s.heading += s.rudder * s.cls.turnRate * 0.5 * dt;
        s.pos.x += Math.sin(s.heading) * s.speed * dt;
        s.pos.z += Math.cos(s.heading) * s.speed * dt;
      }
      // she's no fighting ship: a beating holes her, but never sinks her
      if (s.hp < s.maxHp * 0.6) s.hp = s.maxHp * 0.6;
    }
    if (!c.sighted && p && Math.hypot(lead.pos.x - p.pos.x, lead.pos.z - p.pos.z) < viewR + 120) {
      c.sighted = true;
      this.onSighted(c);
    }
    // gone: well astern of you (or of a voyage that has ended), or come to her landfall
    const pd = p ? Math.hypot(lead.pos.x - p.pos.x, lead.pos.z - p.pos.z) : Infinity;
    const landfall = Math.hypot(lead.pos.x - c.dest.x, lead.pos.z - c.dest.z) < REGION_R + 380;
    if (!c.parley && far && (pd > 1250 || (!highSeas && pd > 800) || (landfall && pd > 500))) return this.retire();
    return [];
  }

  /** Line ahead behind the leader, at the leader's pace; or, scattered, every hull running from you. */
  private steer(m: Merchant, c: Convoy, lead: Ship, p: Ship | null) {
    const s = m.ship;
    if (c.parley) {
      // hove to while you trade, sails half in
      s.anchored = true;
      s.sailTarget = 0.25;
      s.rudder = 0;
      return;
    }
    s.anchored = false;
    let want: number;
    if (c.scattered && p) {
      // away from you under every stitch she has, a little off the line so they spread
      want = Math.atan2(s.pos.x - p.pos.x, s.pos.z - p.pos.z) + m.side * 0.04;
      s.sailTarget = 1;
    } else if (m.slot === 0) {
      want = Math.atan2(c.dest.x - s.pos.x, c.dest.z - s.pos.z);
      // a long, easy pace the others can hold; off her landfall she shortens sail and lies to in the roads
      const home = Math.hypot(c.dest.x - s.pos.x, c.dest.z - s.pos.z);
      s.sailTarget = home < REGION_R + 300 ? 0 : home < REGION_R + 420 ? 0.25 : 0.72;
    } else {
      // her station: astern of the ship ahead, a little out to one side
      const ahead = c.fleet[m.slot - 1].ship;
      const hx = Math.sin(lead.heading);
      const hz = Math.cos(lead.heading);
      const gap = (ahead.cls.length + s.cls.length) * 0.5 + 15;
      const sx = ahead.pos.x - hx * gap + hz * m.side;
      const sz = ahead.pos.z - hz * gap - hx * m.side;
      // steer for a point a little ahead of the station, so she closes it smoothly
      want = Math.atan2(sx + hx * 22 - s.pos.x, sz + hz * 22 - s.pos.z);
      const lag = (sx - s.pos.x) * hx + (sz - s.pos.z) * hz;
      s.sailTarget = clamp(lead.sailLevel * (lead.cls.maxSpeed / s.cls.maxSpeed) + lag * 0.03, 0.15, 1);
    }
    // give your ship a berth unless you're coming alongside slowly
    if (p && p.alive && !c.scattered) {
      const dx = p.pos.x - s.pos.x;
      const dz = p.pos.z - s.pos.z;
      const d = Math.hypot(dx, dz);
      const fwd = (dx * Math.sin(s.heading) + dz * Math.cos(s.heading)) / Math.max(d, 1);
      if (d < 45 && fwd > 0.5) want += (angleDelta(s.heading, Math.atan2(dx, dz)) > 0 ? -1 : 1) * 0.5 * (1 - d / 45);
    }
    s.rudder = clamp(angleDelta(s.heading, want) * 1.8, -1, 1);
  }

  // ---------------------------------------------------------------- you and them

  /** The merchantman near enough `p` to hail, if any would answer. */
  hailable(p: Ship): Merchant | null {
    const c = this.convoy;
    if (!c || c.scattered || c.parley || !p.alive) return null;
    let best: Merchant | null = null;
    let bd = Infinity;
    for (const m of c.fleet) {
      const s = m.ship;
      const d = Math.hypot(s.pos.x - p.pos.x, s.pos.z - p.pos.z) - (s.cls.length + p.cls.length) * 0.5;
      if (d < 26 && d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }

  /** She heaves to and comes alongside `p`, on whichever beam she lay; the rest of the line heaves to round you. */
  parley(m: Merchant, p: Ship) {
    const c = this.convoy;
    if (!c) return;
    c.parley = m;
    const s = m.ship;
    const px = Math.cos(p.heading);
    const pz = -Math.sin(p.heading);
    const side = (s.pos.x - p.pos.x) * px + (s.pos.z - p.pos.z) * pz >= 0 ? 1 : -1;
    const gap = (p.cls.beam + s.cls.beam) * 0.5 + 3.4;
    s.place(p.pos.x + px * side * gap, p.pos.z + pz * side * gap, p.heading);
    s.speed = 0;
    s.drift.set(0, 0);
    for (const o of c.fleet) {
      o.ship.anchored = true;
      o.ship.speed = 0;
    }
  }

  /** You cast off: she sails on with the convoy. */
  release() {
    const c = this.convoy;
    if (!c || !c.parley) return;
    c.parley = null;
    for (const o of c.fleet) {
      o.ship.anchored = false;
      o.ship.speed = o.ship.cls.maxSpeed * 0.25;
    }
  }

  /** A blow from your side (a ball, a ram): the convoy scatters. */
  offend(s: Ship, by: Ship) {
    const c = this.convoy;
    if (!c || by.team !== 'player') return;
    const m = c.fleet.find((x) => x.ship === s);
    if (!m) return;
    m.struck = true;
    if (c.scattered) return;
    c.scattered = true;
    for (const o of c.fleet) o.ship.calm = false;
    this.onScatter(c, m);
  }

  /** A cannonball reaching a merchant's hull: true if she took it. */
  strike(b: { pos: THREE.Vector3; vel: THREE.Vector3; damage: number; owner: Ship }, w: World): boolean {
    for (const s of this.all) {
      if (!s.root.visible || b.owner === s) continue;
      const dx = b.pos.x - s.pos.x;
      const dz = b.pos.z - s.pos.z;
      const R = s.cls.length * 0.55;
      if (dx * dx + dz * dz > R * R) continue;
      _inv.copy(s.model.root.matrixWorld).invert();
      _v.copy(b.pos).applyMatrix4(_inv);
      const shape = s.model.shape;
      const t = _v.z / s.cls.length + 0.5;
      if (t < 0 || t > 1.02) continue;
      const tc = clamp(t, 0, 1);
      if (_v.y > shape.top(tc) + 0.4 || _v.y < shape.bottom(tc)) continue;
      if (Math.abs(_v.x) > shape.halfWidthAtY(tc, clamp(_v.y, 0, shape.top(tc)))) continue;
      const at = b.pos.clone();
      s.damage(b.damage * 0.6, b.owner, w, at);
      w.particles.woodHit(at, _n.set(-b.vel.x, 0, -b.vel.z).normalize());
      const [vol, pan, d] = w.soundAt(at);
      w.audio.hit(vol, pan, d);
      this.offend(s, b.owner);
      return true;
    }
    return false;
  }

  /** Every hull back in the yard (a fresh voyage); returns those to break up. */
  clear(): Ship[] {
    this.wait = range(FIRST_WAIT);
    this.crossing = false;
    return this.retire();
  }
}
