import * as THREE from 'three';
import { angleDelta, clamp, damp, lerp } from '../core/noise';
import { World } from '../game/world';
import { Ship } from './ship';
import { HullShape, Stair } from './shipModel';
import { CrewRenderer, FLAG, HAT, P, POSE_SIZE, PROP, TINT, TINT_SLOTS } from './crewModel';

// Living crews. Every ship carries a captain, a helmsman, gun crews and deck
// hands who read what their ship is doing: they man the guns on the side the
// enemy is on, sponge, load and ram in time with the real reload, touch off
// each gun as it fires and stagger from the recoil; haul on the lines when the
// canvas is trimmed or the yards swing across; swab, lounge, gossip and lean
// on the rail in quiet water; duck when a ball strikes home, cheer a kill,
// fight fires with buckets, and when their ship founders they leap over the
// side and swim for it while the captain salutes and goes down with her.
// Everything renders as one instanced, GPU-posed mesh.

type Role = 'captain' | 'helm' | 'gunner' | 'hand' | 'lookout';
type Act =
  | 'stand' | 'helm' | 'pace' | 'glass' | 'point' | 'rail' | 'gun' | 'haul' | 'swab' | 'lean' | 'sit' | 'coil' | 'chat'
  | 'powder' | 'bucket' | 'panic' | 'salute' | 'lookout' | 'fiddle' | 'jig';
type Mode = 'aboard' | 'air' | 'swim' | 'gone';

interface Spot {
  x: number;
  z: number;
}
interface Obstacle extends Spot {
  r: number;
  stair?: boolean; // keeps the crew off the companion stairs; the captain climbs them
}

/** The player's captain, walked by hand in the captain's view (ship-local). */
export interface Pilot {
  active: boolean;
  x: number;
  z: number;
  floor: number; // deck height under the feet (stairs included)
  yaw: number;
  speed: number;
  phase: number;
  atHelm: boolean;
  hidden: boolean; // the camera is behind the captain's eyes
}

export interface DeckView {
  obstacles: readonly Obstacle[];
  helm: Spot;
  /** Everyone else standing on the deck, for bumping into. */
  others(out: Spot[]): Spot[];
}
interface Zone {
  t0: number;
  t1: number;
  y: (t: number) => number;
}
/** A companion stair as the crew use it: from a spot on the castle deck down to one on the main deck. */
interface Flight {
  st: Stair;
  castle: Zone;
  head: Spot;
  foot: Spot;
}
interface GunPost {
  muzzle: number;
  side: number;
  x: number;
  z: number;
  t: number;
}

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _up = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const ID = new THREE.Quaternion();

const pick = <T,>(a: readonly T[], r = Math.random()) => a[Math.floor(r * a.length) % a.length];
const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ------------------------------------------------------------------ looks

type RGBA = [number, number, number, number];
const col = (hex: string, a = 0): RGBA => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b, a];
};

const SKIN = ['#f3cfb1', '#e8b48e', '#d39a72', '#b97c55', '#965c3b', '#6e4129', '#4f2e1d'];
const HAIR = ['#1b1512', '#2e2018', '#4a3020', '#6b4325', '#8a5a2b', '#b98a4e', '#d8bf8a', '#8d8a86'];
const TEAM_LOOK = {
  player: {
    shirts: ['#efe7d6', '#f4f1ea', '#2a8f8c', '#7fb2c9', '#d9c39a'],
    stripe: ['#22345a', '#1f6f86'],
    trousers: ['#c9b58c', '#2f3d5c', '#59667a', '#8a7a5f'],
    sash: ['#1fa3a0', '#e2b552', '#c0392b', '#2a6fb0'],
    hats: [
      [HAT.bandana, ['#1fa3a0', '#c0392b', '#22345a']],
      [HAT.knit, ['#22345a', '#b8322a', '#e8e0cf']],
      [HAT.straw, ['#e3c98a', '#d6b871']],
      [HAT.none, ['#000000']],
    ] as [number, string[]][],
    coat: ['#1f2d52'],
  },
  pirate: {
    shirts: ['#d9cfbd', '#7d2323', '#2a2526', '#5a4634', '#8b6d4a'],
    stripe: ['#7d2323', '#1d1a1a'],
    trousers: ['#2b2523', '#4a3a2c', '#3b3f45', '#6b5a45'],
    sash: ['#a3241f', '#6b2b7a', '#c58a2c', '#1d1a1a'],
    hats: [
      [HAT.bandana, ['#a3241f', '#1d1a1a', '#7d2323', '#6b2b7a']],
      [HAT.knit, ['#4a4a4a', '#5a2020']],
      [HAT.tricorn, ['#1a1616']],
      [HAT.none, ['#000000']],
    ] as [number, string[]][],
    coat: ['#5e1414', '#1c1717', '#3b1f4f'],
  },
};

interface Look {
  slots: RGBA[];
  hat: number;
  flags: number;
  /** Lounges with a pipe / sips grog when there's a moment. */
  smoker: boolean;
  drinker: boolean;
}

const VESTS = {
  player: ['#7a2f2a', '#2f3d5c', '#8a6a3c', '#3e6b5a', '#c9b58c'],
  pirate: ['#3a2a22', '#5e1414', '#2d2a33', '#6b4a2b', '#4a3a5a'],
};

export function makeLook(team: 'player' | 'pirate', role: Role): Look {
  const T = TEAM_LOOK[team];
  const pirate = team === 'pirate';
  const chance = (p: number) => Math.random() < p;
  const skin = col(pick(SKIN));
  const hair = col(pick(HAIR));
  const shirtHex = pick(T.shirts);
  const striped = (shirtHex === T.shirts[0] || shirtHex === T.shirts[1]) && chance(0.55);
  const shirt = col(shirtHex, striped ? -15 : 0);
  // short sleeves, sleeves rolled to the elbow, or long sleeves buttoned at the wrist
  const sleeves = Math.random();
  const trousers = col(pick(T.trousers));
  const barefoot = chance(pirate ? 0.35 : 0.25);
  // bare calves, stockings, or long trousers to the ankle
  const legs = barefoot && chance(0.6) ? 'bare' : chance(0.4) ? 'stockings' : 'long';
  const sash = col(pick(T.sash));
  let [hat, hatCols] = pick(T.hats);
  if (role === 'lookout' && hat === HAT.straw) hat = HAT.knit;
  let hatCol = col(pick(hatCols), hat === HAT.bandana && chance(0.5) ? -1 : 0); // half the bandanas are spotted
  let flags = 0;
  if (chance(pirate ? 0.5 : 0.28)) flags |= FLAG.beard;
  else if (chance(pirate ? 0.45 : 0.3)) flags |= FLAG.moustache;
  if (hat !== HAT.bandana && chance(0.22)) flags |= FLAG.ponytail;
  else if (hat === HAT.none && chance(0.2)) flags |= FLAG.longhair;
  if (hat === HAT.none && !(flags & (FLAG.ponytail | FLAG.longhair)) && chance(0.3)) flags |= FLAG.bald;
  if (chance(pirate ? 0.14 : 0.03)) flags |= FLAG.patch;
  if (chance(pirate ? 0.4 : 0.15)) flags |= FLAG.earring;
  if (chance(pirate ? 0.32 : 0.25)) flags |= FLAG.vest;
  if (chance(0.4)) flags |= FLAG.belt;
  if (pirate && chance(0.25)) flags |= FLAG.pistol;
  if (chance(pirate ? 0.25 : 0.35)) flags |= FLAG.kerchief;
  const peg = role !== 'lookout' && role !== 'helm' && chance(pirate ? 0.09 : 0.03);
  if (peg) flags |= FLAG.peg;
  else if (!barefoot && chance(pirate ? 0.4 : 0.3)) flags |= FLAG.boots;
  if (barefoot) flags |= FLAG.barefoot;
  if (legs !== 'long' && !(flags & FLAG.boots)) flags |= FLAG.garters;
  if (sleeves > 0.3 && sleeves < 0.7) flags |= FLAG.rolled;
  else if (sleeves >= 0.7) flags |= FLAG.cuffs;
  const slots: RGBA[] = Array.from({ length: TINT_SLOTS }, () => [1, 1, 1, 0] as RGBA);
  slots[TINT.skin] = skin;
  slots[TINT.shirt] = shirt;
  slots[TINT.sleeve] = sleeves <= 0.3 ? skin : shirt;
  slots[TINT.forearm] = sleeves < 0.7 ? skin : shirt;
  slots[TINT.trousers] = trousers;
  slots[TINT.shin] = legs === 'bare' ? skin : legs === 'stockings' ? col(pick(['#e8e0cf', '#efe9dc', '#d9cdb4'])) : trousers;
  slots[TINT.boots] = col(pick(['#2a1f18', '#3b2a1e', '#1d1714', '#4a3222']));
  slots[TINT.sash] = sash;
  slots[TINT.hat] = hatCol;
  slots[TINT.hair] = hair;
  slots[TINT.coat] = shirt;
  slots[TINT.trim] = col('#d4a64a');
  slots[TINT.wood] = col('#8a6440');
  slots[TINT.metal] = col('#c7ced6');
  slots[TINT.glow] = col('#ff7a2a', 7);
  slots[TINT.cloth] = col('#d8ccb0');
  slots[TINT.stripe] = col(pick(T.stripe));
  slots[TINT.dark] = col('#1a1210');
  slots[TINT.white] = col('#f6f2ea');
  slots[TINT.pupil] = col(pick(['#5a3a1e', '#6b4423', '#3f2a18', '#3b6e8f', '#4a7a9a', '#4f7a3a', '#7a6a2a']));
  slots[TINT.mouth] = col('#4a1618');
  slots[TINT.tongue] = col('#c75a5e');
  slots[TINT.shine] = col('#ffffff', 0.6);
  slots[TINT.parrot] = col(chance(0.75) ? '#d8322a' : '#2fae55');
  slots[TINT.wing] = col(chance(0.7) ? '#2a6fd0' : '#f2c230');
  slots[TINT.beak] = col('#efe2c0');
  slots[TINT.vest] = col(pick(VESTS[team]));
  slots[TINT.plume] = col(pirate ? pick(['#1a1616', '#a3241f', '#efe6d6']) : pick(['#f6f2ea', '#1fa3a0']));
  slots[TINT.leather] = col(pick(['#3b2a1e', '#2a1f18', '#5a3a24']));
  if (role === 'captain') {
    const coat = col(pick(T.coat));
    hat = HAT.tricorn;
    hatCol = col(pirate ? '#141010' : '#1a1a26');
    slots[TINT.hat] = hatCol;
    slots[TINT.coat] = coat;
    slots[TINT.shirt] = coat;
    slots[TINT.sleeve] = coat;
    slots[TINT.forearm] = coat;
    slots[TINT.trousers] = col(pirate ? '#2b2523' : '#e8e0cf');
    slots[TINT.shin] = col('#1d1714');
    slots[TINT.boots] = col('#1d1714');
    slots[TINT.sash] = col(pirate ? '#a3241f' : '#e2b552');
    const keep = FLAG.beard | FLAG.moustache | FLAG.earring | FLAG.patch | FLAG.longhair | FLAG.bald;
    flags = (flags & keep) | FLAG.coat | FLAG.boots | FLAG.plume | FLAG.belt | (chance(0.5) ? FLAG.ponytail : 0);
    if (pirate && chance(0.8)) flags |= chance(0.6) ? FLAG.beard : FLAG.moustache;
    if (pirate && chance(0.4)) flags |= FLAG.patch;
    if (pirate && chance(0.25)) flags = (flags & ~FLAG.boots) | FLAG.peg;
    // every captain worth the name keeps a parrot; ours always does
    if (!pirate || chance(0.6)) flags |= FLAG.parrot;
    if (flags & FLAG.longhair) flags &= ~FLAG.ponytail;
  }
  return { slots, hat, flags, smoker: chance(0.35), drinker: chance(0.5) };
}

// ------------------------------------------------------------------ poses

function rest(o: Float32Array) {
  o.fill(0);
  o[P.armLZ] = 0.1;
  o[P.armRZ] = 0.1;
  o[P.elbowL] = 0.15;
  o[P.elbowR] = 0.15;
  o[P.kneeL] = 0.04;
  o[P.kneeR] = 0.04;
  o[P.handL] = 0.3;
  o[P.handR] = 0.3;
}

function walk(o: Float32Array, ph: number, run: number, armsBusy = false) {
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  const legA = 0.5 + 0.3 * run;
  o[P.legLX] = legA * s;
  o[P.legRX] = -legA * s;
  const kn = 0.75 + 0.6 * run;
  o[P.kneeL] = 0.1 + kn * Math.max(0, c);
  o[P.kneeR] = 0.1 + kn * Math.max(0, -c);
  if (!armsBusy) {
    const armA = 0.35 + 0.45 * run;
    o[P.armLX] = -armA * s;
    o[P.armRX] = armA * s;
    o[P.elbowL] = 0.25 + 1.0 * run + 0.25 * Math.max(0, -s);
    o[P.elbowR] = 0.25 + 1.0 * run + 0.25 * Math.max(0, s);
  }
  o[P.spineX] = 0.05 + 0.25 * run;
  o[P.spineY] = 0.1 * s;
  o[P.headX] = -0.05 - 0.15 * run;
  o[P.rootY] = -0.015 - 0.05 * run - (0.035 + 0.04 * run) * s * s;
}

function crouch(o: Float32Array, k: number) {
  // keeps both feet planted: thighs forward, knees back, hips drop
  const th = 0.55 * k;
  const kn = 1.1 * k;
  o[P.legLX] = th;
  o[P.legRX] = th;
  o[P.kneeL] = kn;
  o[P.kneeR] = kn;
  const drop = 0.38 * (1 - Math.cos(th)) + 0.42 * (1 - Math.cos(kn - th));
  o[P.rootY] = -drop;
  o[P.spineX] += th * 0.6;
}

// ------------------------------------------------------------------ sailor

class Sailor {
  mode: Mode = 'aboard';
  act: Act = 'stand';
  actT = 0;
  actDur = 5;
  x = 0;
  z = 0;
  y = 0; // extra lift (sitting on a barrel, the fighting top)
  yaw = 0;
  wantYaw = 0;
  readonly pose = new Float32Array(POSE_SIZE);
  readonly target = new Float32Array(POSE_SIZE);
  prop: number = PROP.none;
  zone: Zone;
  // walking
  goal: Spot | null = null;
  goalYaw: number | null = null;
  run = false;
  phase = Math.random() * 6;
  moving = 0;
  stuck = 0;
  ignore: Obstacle | null = null;
  // on a companion stair: +1 going down, -1 climbing
  flight: Flight | null = null;
  flightDir = 1;
  flightK = 0;
  // flavour
  readonly seed = Math.random() * 100;
  readonly tempo = rand(0.88, 1.12);
  readonly mood = rand(-0.15, 0.55); // some sailors just grin more than others
  readonly height = rand(0.94, 1.06);
  readonly girth = rand(0.92, 1.12);
  lookYaw = 0;
  lookT = 0;
  flinch = 0;
  cheer = 0;
  gun: GunPost | null = null;
  spot: Spot | null = null;
  topY = 0; // deck height of a lookout's fighting top
  seat: Obstacle | null = null;
  partner: Sailor | null = null;
  panicDelay = 0;
  // free flight / swimming (world space)
  wx = 0;
  wy = 0;
  wz = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  swimT = 0;
  dive = Math.random() < 0.5;
  fade = 0;

  constructor(
    readonly role: Role,
    readonly look: Look,
    readonly row: number,
    zone: Zone,
  ) {
    this.zone = zone;
    rest(this.pose);
    rest(this.target);
  }
}

// ------------------------------------------------------------------ one ship's crew

class ShipCrew {
  readonly sailors: Sailor[] = [];
  readonly shape: HullShape;
  readonly L: number;
  readonly main: Zone;
  readonly quarter: Zone | null;
  readonly fore: Zone | null;
  readonly helmZone: Zone;
  readonly obstacles: Obstacle[] = [];
  readonly seats: Obstacle[] = [];
  readonly posts: GunPost[] = [];
  readonly helm: Spot;
  readonly hauls: { x: number; z: number; side: number; zone: Zone }[] = [];
  readonly flights: Flight[] = [];
  readonly hatch: Spot;
  readonly tops: { x: number; z: number; y: number }[] = [];
  battle = false;
  pilot: Pilot | null = null;
  enemy: Ship | null = null;
  enemyDist = 1e9;
  gunSide = 1;
  lastFire = -100;
  volleyAt = { port: -100, starboard: -100 };
  private prevReload = { port: 0, starboard: 0 };
  private lastHit = -100;
  private kills = 0;
  private deadSeen = false;
  readonly upright = new THREE.Quaternion();

  constructor(
    readonly ship: Ship,
    alloc: () => number,
    tier: number,
    writeLook: (row: number, look: Look) => void,
  ) {
    const c = ship.cls;
    const s = ship.model.shape;
    this.shape = s;
    this.L = c.length;
    const L = c.length;
    const m = 0.75 / L;
    const sc = c.sternCastle;
    const fc = c.foreCastle;
    this.main = { t0: sc ? sc.t + m : 0.07, t1: fc ? fc.t - m : 0.86, y: (t) => s.mainDeckY(t) };
    this.quarter = sc ? { t0: 0.045, t1: sc.t - m, y: (t) => s.sheer(t) + sc.h - c.bulwark } : null;
    this.fore = fc ? { t0: fc.t + m, t1: 0.92, y: (t) => s.sheer(t) + fc.h - c.bulwark } : null;
    this.kills = ship.kills;

    // --- what's on deck (mirrors ShipModel's layout)
    const B = c.beam;
    const z = (t: number) => s.z(t);
    c.masts.forEach((mast, i) => {
      const mz = z(mast.t);
      this.obstacles.push({ x: 0, z: mz, r: 0.12 + mast.height * 0.0085 + 0.16 });
      const b1 = { x: B * 0.24, z: mz - 0.9, r: 0.36 };
      const b2 = { x: B * 0.27, z: mz - 0.3, r: 0.36 };
      this.obstacles.push(b1, b2);
      this.seats.push(b1, b2);
      if (i % 2 === 0) this.obstacles.push({ x: -B * 0.24, z: mz - 0.8, r: 0.48 });
      else {
        const b3 = { x: -B * 0.26, z: mz + 0.7, r: 0.36 };
        this.obstacles.push(b3);
        this.seats.push(b3);
      }
      this.obstacles.push({ x: -B * 0.1, z: mz + 0.9, r: 0.32 });
      if (mast.top) this.tops.push({ x: B * 0.07, z: mz - B * 0.06, y: s.deckY(mast.t) + mast.height * 0.6 + 0.09 });
    });
    this.obstacles.push({ x: B * 0.2, z: z(0.86), r: 0.42 });
    for (const o of ship.model.deckProps) this.obstacles.push({ ...o });
    const wt = sc ? sc.t * 0.55 : 0.16;
    this.obstacles.push({ x: 0, z: z(wt) - 0.06, r: 0.66 });
    this.helm = { x: 0, z: z(wt) - 0.66 };
    this.helmZone = sc ? this.quarter! : this.main;
    const capT = 0.53;
    const capZ = z(capT) + (c.masts.some((mm) => Math.abs(mm.t - capT) < 0.05) ? 1.6 : 0);
    this.obstacles.push({ x: 0, z: capZ, r: 0.9 });
    if (c.id === 'galleon') for (let k = -2; k <= 2; k++) this.obstacles.push({ x: 0, z: z(0.62) + k * 0.85, r: 0.95 });
    for (const st of ship.model.stairs) for (const f of [0.2, 0.55, 0.9]) this.obstacles.push({ x: st.x, z: lerp(st.z0, st.z1, f), r: st.w * 0.62, stair: true });
    for (const st of ship.model.stairs) {
      const down = Math.sign(st.z0 - st.z1); // stern castle stairs run down toward the bow
      const castle = down > 0 ? this.quarter : this.fore;
      if (!castle) continue;
      const on = (zone: Zone, z: number): Spot => {
        const t = clamp(this.tOf(z), zone.t0, zone.t1);
        const hw = this.halfWidth(zone, t) - 0.28;
        return { x: clamp(st.x, -hw, hw), z: this.shape.z(t) };
      };
      this.flights.push({ st, castle, head: on(castle, st.z1 - down), foot: on(this.main, st.z0 + down * 0.45) });
    }
    const hatchT = [0.46, 0.6].find((t) => !c.masts.some((mm) => Math.abs(mm.t - t) < 0.05)) ?? 0.46;
    this.hatch = { x: B * 0.05, z: z(hatchT) + 0.5 };

    // gun posts on the open main deck, inboard of each carriage
    const k = 0.75 + L * 0.011;
    ship.model.muzzles.forEach((mz, i) => {
      if (Math.abs(mz.dir.z) > 0.5) return; // chasers
      const t = mz.pos.z / L + 0.5;
      if (t < this.main.t0 || t > this.main.t1) return;
      const hw = s.halfWidthAtY(t, mz.pos.y);
      this.obstacles.push({ x: mz.side * (hw - 0.13 - 0.42 * k), z: mz.pos.z, r: 0.42 * k + 0.08 });
      this.posts.push({ muzzle: i, side: mz.side, x: mz.side * (hw - 0.13 - 0.85 * k - 0.42), z: mz.pos.z, t });
    });
    for (const p of this.posts) {
      // stand beside the breech, whichever side is clearer
      const a = this.clearance(p.x, p.z + 0.42);
      const b = this.clearance(p.x, p.z - 0.42);
      p.z += a >= b ? 0.42 : -0.42;
    }
    // pin rails at each mast for hauling
    for (const mast of c.masts) {
      const t = mast.t + 0.55 / L;
      const zone = this.zoneAt(t);
      if (!zone) continue;
      const hw = this.halfWidth(zone, t);
      for (const side of [1, -1]) this.hauls.push({ x: side * (hw - 0.4), z: z(t), side, zone });
    }

    // --- muster the crew
    const gunsPerSide = this.posts.filter((p) => p.side === 1).length;
    const hands = (c.id === 'sloop' ? 2 : c.id === 'brig' ? 3 : 5) - (tier === 0 ? 1 : 0);
    // nobody posted aloft: a lookout would be left standing on air when the mast comes down
    const lookouts = 0;
    const roles: Role[] = ['helm', 'captain'];
    for (let i = 0; i < gunsPerSide; i++) roles.push('gunner');
    for (let i = 0; i < hands; i++) roles.push('hand');
    for (let i = 0; i < lookouts; i++) roles.push('lookout');
    let gunner = 0;
    let lookout = 0;
    for (const role of roles) {
      const row = alloc();
      if (row < 0) break;
      const look = makeLook(ship.team, role);
      writeLook(row, look);
      const zone = role === 'helm' || role === 'captain' ? this.helmZone : this.main;
      const sl = new Sailor(role, look, row, zone);
      if (role === 'gunner') {
        const posts = this.posts.filter((p) => p.side === 1);
        sl.gun = posts[gunner++ % posts.length];
      }
      if (role === 'lookout') {
        const top = this.tops[lookout++ % this.tops.length];
        sl.spot = top;
        sl.topY = top.y;
      }
      this.place(sl);
      this.sailors.push(sl);
    }
  }

  // ---------------------------------------------------------------- deck geometry

  tOf(z: number) {
    return z / this.L + 0.5;
  }

  zoneAt(t: number): Zone | null {
    for (const zn of [this.main, this.quarter, this.fore]) if (zn && t >= zn.t0 && t <= zn.t1) return zn;
    return null;
  }

  halfWidth(zone: Zone, t: number) {
    return Math.max(0.3, this.shape.halfWidthAtY(t, zone.y(t)) - 0.14);
  }

  deckY(zone: Zone, x: number, z: number) {
    const t = clamp(this.tOf(z), zone.t0, zone.t1);
    const w = this.halfWidth(zone, t);
    return zone.y(t) + 0.06 * Math.max(0, 1 - Math.abs(x) / w);
  }

  clearance(x: number, z: number) {
    let best = 1e9;
    for (const o of this.obstacles) best = Math.min(best, Math.hypot(x - o.x, z - o.z) - o.r);
    return best;
  }

  /** A random free point on a zone's deck. */
  freeSpot(zone: Zone, nearRail = false): Spot {
    for (let i = 0; i < 24; i++) {
      const t = rand(zone.t0 + 0.02, zone.t1 - 0.02);
      const hw = this.halfWidth(zone, t) - 0.38;
      if (hw < 0.2) continue;
      const x = nearRail ? (Math.random() < 0.5 ? -1 : 1) * hw : rand(-hw, hw);
      const z = this.shape.z(t);
      if (this.clearance(x, z) > 0.32 && !this.sailors.some((o) => o.mode === 'aboard' && Math.hypot(o.x - x, o.z - z) < 0.7)) return { x, z };
    }
    return { x: 0, z: this.shape.z((zone.t0 + zone.t1) / 2) };
  }

  private place(sl: Sailor) {
    if (sl.role === 'helm') {
      sl.x = this.helm.x;
      sl.z = this.helm.z;
      sl.act = 'helm';
    } else if (sl.role === 'lookout' && sl.spot) {
      sl.act = 'lookout';
      sl.x = sl.spot.x;
      sl.z = sl.spot.z;
    } else {
      const p = this.freeSpot(sl.zone);
      sl.x = p.x;
      sl.z = p.z;
      sl.act = sl.role === 'captain' ? 'pace' : 'stand';
      sl.actDur = rand(0.5, 4);
    }
    sl.yaw = sl.wantYaw = sl.role === 'helm' ? 0 : rand(-Math.PI, Math.PI);
  }

  // ---------------------------------------------------------------- per frame

  update(dt: number, world: World, ships: Ship[], onSplash: (x: number, y: number, z: number, s: number) => void) {
    const sh = this.ship;
    const time = world.time;
    // combat awareness
    this.enemy = null;
    this.enemyDist = 1e9;
    for (const o of ships) {
      if (o === sh || !o.alive || o.team === sh.team || o.removed) continue;
      const d = Math.hypot(o.pos.x - sh.pos.x, o.pos.z - sh.pos.z);
      if (d < this.enemyDist) {
        this.enemyDist = d;
        this.enemy = o;
      }
    }
    for (const side of ['port', 'starboard'] as const) {
      if (sh.reload[side] > this.prevReload[side] + 0.3) {
        this.volleyAt[side] = time;
        this.lastFire = time;
        this.gunSide = side === 'port' ? 1 : -1;
      }
      this.prevReload[side] = sh.reload[side];
    }
    // a ship riding at anchor (the harbour view) keeps an easy watch until someone actually opens fire
    const near = this.enemy && this.enemyDist < 230 && !sh.anchored;
    this.battle = sh.alive && (!!near || time - this.lastFire < 8 || time - sh.lastHit < 6);
    if (near && this.enemy) {
      const rel = angleDelta(sh.heading, Math.atan2(this.enemy.pos.x - sh.pos.x, this.enemy.pos.z - sh.pos.z));
      const want = rel > 0 ? 1 : -1;
      const cur = this.gunSide > 0 ? 'port' : 'starboard';
      // don't abandon a half-loaded battery unless the enemy is plainly on the other beam
      const mid = sh.reload[cur] > 0 && sh.reload[cur] < sh.cls.reload * 0.75;
      if (want !== this.gunSide && Math.abs(Math.abs(rel) - Math.PI / 2) < 1.2 && !mid) this.gunSide = want;
    }
    // hits make everyone duck; kills make everyone roar
    if (sh.lastHit > this.lastHit) {
      this.lastHit = sh.lastHit;
      if (sh.alive) for (const sl of this.sailors) if (sl.mode === 'aboard') sl.flinch = Math.max(sl.flinch, rand(0.5, 0.75));
    }
    if (sh.kills > this.kills) {
      this.kills = sh.kills;
      for (const sl of this.sailors) if (sl.mode === 'aboard') sl.cheer = rand(2.6, 3.4);
    }
    if (!sh.alive && !this.deadSeen) {
      this.deadSeen = true;
      for (const sl of this.sailors) {
        sl.panicDelay = sl.role === 'helm' ? rand(2.4, 3.2) : rand(0.15, 2.6);
        sl.flinch = 0;
        sl.cheer = 0;
      }
    }

    // ship-local "world up" so people stand against the roll instead of with the deck
    _q.copy(sh.root.quaternion).invert();
    _v.copy(_up).applyQuaternion(_q);
    _q2.setFromUnitVectors(_up, _v);
    const ang = 2 * Math.acos(clamp(_q2.w, -1, 1));
    this.upright.copy(ID).slerp(_q2, ang > 1e-4 ? Math.min(0.8, 0.5 / ang) : 0.8);

    for (const sl of this.sailors) {
      if (sl.mode === 'aboard') this.think(sl, dt, world, onSplash);
      else updateLoose(sl, dt, world);
    }
    // keep folk from standing inside each other
    const n = this.sailors.length;
    for (let i = 0; i < n; i++) {
      const a = this.sailors[i];
      if (a.mode !== 'aboard' || a.act === 'helm' || a.act === 'lookout' || a.seat || (a.role === 'captain' && this.pilot?.active)) continue;
      for (let j = 0; j < n; j++) {
        const b = this.sailors[j];
        if (i === j || b.mode !== 'aboard' || b.act === 'lookout' || b.seat) continue;
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.36 && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (0.6 - d) * 0.5 * Math.min(1, dt * 8);
          a.x += (dx / d) * push;
          a.z += (dz / d) * push;
        }
      }
    }
  }

  // ---------------------------------------------------------------- brains

  private walkTo(sl: Sailor, x: number, z: number, run = false, yaw: number | null = null, ignore: Obstacle | null = null) {
    sl.goal = { x, z };
    sl.goalYaw = yaw;
    sl.run = run;
    sl.stuck = 0;
    sl.ignore = ignore;
  }

  /** Steps toward the goal around obstacles. Returns true on arrival. */
  private stepWalk(sl: Sailor, dt: number): boolean {
    const g = sl.goal;
    if (!g) return true;
    const dx = g.x - sl.x;
    const dz = g.z - sl.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.07) {
      sl.goal = null;
      sl.moving = 0;
      if (sl.goalYaw !== null) sl.wantYaw = sl.goalYaw;
      return true;
    }
    let mx = dx / d;
    let mz = dz / d;
    const ghost = sl.stuck > 2.5;
    if (!ghost) {
      for (const o of this.obstacles) {
        if (o === sl.ignore) continue;
        const ox = sl.x - o.x;
        const oz = sl.z - o.z;
        const od = Math.hypot(ox, oz);
        const reach = o.r + 0.55;
        if (od < reach && od > 1e-4) {
          // fades out close to the goal so posts beside a gun or barrel can still be reached
          const w = (1 - od / reach) * 2.2 * Math.min(1, d);
          // push away and slide around the side the goal lies on
          const tx = -oz / od;
          const tz = ox / od;
          const sgn = tx * dx + tz * dz > 0 ? 1 : -1;
          mx += (ox / od) * w + tx * sgn * w * 0.8;
          mz += (oz / od) * w + tz * sgn * w * 0.8;
        }
      }
      const ml = Math.hypot(mx, mz) || 1;
      mx /= ml;
      mz /= ml;
    }
    const speed = (sl.run ? 3.3 : 1.3) * sl.tempo * Math.min(1, 0.35 + d * 1.2);
    const step = Math.min(d, speed * dt);
    const px = sl.x;
    const pz = sl.z;
    sl.x += mx * step;
    sl.z += mz * step;
    this.confine(sl);
    const moved = Math.hypot(sl.x - px, sl.z - pz);
    sl.stuck = moved < step * 0.3 ? sl.stuck + dt : Math.max(0, sl.stuck - dt);
    sl.moving = moved / Math.max(dt, 1e-4);
    sl.phase += (moved / (sl.run ? 1.9 : 1.3)) * Math.PI * 2;
    if (moved > 1e-4) sl.wantYaw = Math.atan2(mx, mz);
    if (ghost || sl.stuck > 4) {
      // shove through rather than stand frozen against a barrel forever
      sl.x += (dx / d) * step * 0.6;
      sl.z += (dz / d) * step * 0.6;
    }
    return false;
  }

  /** Starts down (dir 1) or up (dir -1) a companion stair; the walk ends on the other deck. */
  private takeFlight(sl: Sailor, f: Flight, dir: number) {
    sl.flight = f;
    sl.flightDir = dir;
    sl.flightK = 0;
    sl.goal = null;
    sl.zone = dir > 0 ? this.main : f.castle;
    sl.actDur = 0; // straight to a chore at the bottom
  }

  /** One step along the stair, treads underfoot. Returns true while still on it. */
  private stepFlight(sl: Sailor, dt: number): boolean {
    const f = sl.flight!;
    const a = sl.flightDir > 0 ? f.head : f.foot;
    const b = sl.flightDir > 0 ? f.foot : f.head;
    const len = Math.max(0.1, Math.hypot(b.x - a.x, b.z - a.z));
    sl.flightK = Math.min(1, sl.flightK + (1.05 * sl.tempo * dt) / len);
    const px = sl.x;
    const pz = sl.z;
    sl.x = lerp(a.x, b.x, sl.flightK);
    sl.z = lerp(a.z, b.z, sl.flightK);
    const moved = Math.hypot(sl.x - px, sl.z - pz);
    sl.moving = moved / Math.max(dt, 1e-4);
    sl.phase += (moved / 1.1) * Math.PI * 2;
    sl.wantYaw = Math.atan2(b.x - a.x, b.z - a.z);
    // the treads: castle deck, the slope of the flight, then the main deck
    const st = f.st;
    const u = (sl.z - st.z1) / (st.z0 - st.z1);
    const t = this.tOf(sl.z);
    const floor = u <= 0 ? f.castle.y(t) : u >= 1 ? this.main.y(t) : lerp(st.y1, st.y0, u);
    sl.y = floor - this.deckY(sl.zone, sl.x, sl.z);
    if (sl.flightK < 1) return true;
    sl.flight = null;
    sl.moving = 0;
    return false;
  }

  private confine(sl: Sailor) {
    const zn = sl.zone;
    const t = clamp(this.tOf(sl.z), zn.t0, zn.t1);
    sl.z = this.shape.z(t);
    const hw = this.halfWidth(zn, t) - 0.28;
    sl.x = clamp(sl.x, -hw, hw);
  }

  private think(sl: Sailor, dt: number, world: World, onSplash: (x: number, y: number, z: number, s: number) => void) {
    const sh = this.ship;
    const T = sl.target;
    const time = world.time;
    const tt = time * sl.tempo + sl.seed;
    sl.actT += dt;
    rest(T);
    let prop: number = PROP.none;

    if (!sh.alive) {
      this.founder(sl, dt, world);
      return;
    }

    // what this sailor should be doing right now
    if (sl.role === 'captain' && this.pilot?.active) {
      this.piloted(sl, dt, tt);
      return;
    }
    if (sl.role === 'helm') this.helmPlan(sl);
    else if (sl.role === 'lookout') sl.act = 'lookout';
    else if (sl.role === 'captain') this.captainPlan(sl, time);
    else this.handPlan(sl);

    const walking = sl.flight ? this.stepFlight(sl, dt) : sl.goal !== null && !this.stepWalk(sl, dt);
    const run = sl.run ? 1 : 0;
    // chores are timed from arrival, not from setting off
    if (walking && sl.act !== 'gun') sl.actT = 0;

    switch (sl.act) {
      case 'helm': {
        const r = sh.rudder;
        const spin = Math.abs(r) > 0.35 ? Math.sin(tt * 5) * 0.35 * Math.abs(r) : 0;
        T[P.armLX] = 1.05 - 0.35 * r + spin;
        T[P.armRX] = 1.05 + 0.35 * r - spin;
        T[P.armLZ] = -0.05;
        T[P.armRZ] = -0.05;
        T[P.elbowL] = 0.55 + 0.2 * r;
        T[P.elbowR] = 0.55 - 0.2 * r;
        T[P.spineY] = r * 0.18;
        T[P.spineZ] = -r * 0.06;
        T[P.spineX] = 0.08;
        T[P.headY] = r * 0.25 + Math.sin(tt * 0.31) * 0.2;
        T[P.headX] = -0.12;
        T[P.legLX] = 0.12;
        T[P.legRX] = -0.1;
        T[P.kneeL] = 0.18;
        sl.wantYaw = 0;
        if (sl.cheer > 0) {
          T[P.armRX] = 2.7 + Math.sin(tt * 9) * 0.25;
          T[P.armRZ] = -0.3;
          T[P.elbowR] = 0.3;
          T[P.handR] = 1;
          T[P.jaw] = 0.6 + 0.3 * Math.sin(tt * 9);
          T[P.smile] = 1;
          T[P.brow] = 0.7;
        }
        break;
      }
      case 'lookout': {
        const e = this.enemy;
        if (e && this.enemyDist < 300) {
          sl.wantYaw = this.localYawTo(e.pos) ;
          if (this.enemyDist > 70) {
            prop = PROP.spyglass;
            this.spyglass(T);
          } else this.pointPose(T, tt);
        } else {
          sl.wantYaw = Math.sin(tt * 0.13) * 1.6 + Math.sin(tt * 0.051) * 1.2;
          if (Math.sin(tt * 0.21) > 0.2) {
            prop = PROP.spyglass;
            this.spyglass(T);
          } else {
            T[P.headY] = Math.sin(tt * 0.4) * 0.4;
            T[P.armLZ] = 0.45;
            T[P.elbowL] = 1.9;
            T[P.armLX] = 0.2;
          }
        }
        break;
      }
      case 'pace': {
        if (walking) walk(T, sl.phase, run, true);
        T[P.armLX] = -0.5;
        T[P.armRX] = -0.5;
        T[P.armLZ] = 0.28;
        T[P.armRZ] = 0.28;
        T[P.elbowL] = 1.25;
        T[P.elbowR] = 1.25;
        T[P.headY] = walking ? 0 : Math.sin(tt * 0.5) * 0.5;
        T[P.spineX] += 0.04;
        break;
      }
      case 'glass':
        prop = PROP.spyglass;
        this.spyglass(T);
        break;
      case 'rail':
      case 'point': {
        prop = PROP.cutlass;
        if (walking) walk(T, sl.phase, run);
        else if (sl.act === 'point') this.pointPose(T, tt);
        else {
          T[P.legLX] = 0.25;
          T[P.kneeL] = 0.3;
          T[P.legRX] = -0.12;
          T[P.armLZ] = 0.45;
          T[P.elbowL] = 1.8;
          T[P.armLX] = 0.15;
          T[P.armRX] = 0.25;
          T[P.elbowR] = 0.5;
          T[P.headY] = Math.sin(tt * 0.6) * 0.3;
        }
        break;
      }
      case 'gun':
        prop = this.gunnery(sl, T, walking, run, time, tt);
        break;
      case 'powder':
        prop = PROP.bucket;
        if (walking) {
          walk(T, sl.phase, run, true);
          T[P.armRX] = 0.35;
          T[P.elbowR] = 1.3;
          T[P.armLX] = -0.6 * Math.sin(sl.phase);
          T[P.elbowL] = 1.2;
        } else {
          T[P.spineX] = 0.4;
          crouch(T, 0.7);
          T[P.armRX] = 0.9;
          T[P.armLX] = 0.9;
          T[P.elbowR] = 0.4;
          T[P.elbowL] = 0.5;
        }
        break;
      case 'bucket': {
        prop = PROP.bucket;
        if (walking) {
          walk(T, sl.phase, run, true);
          T[P.armRX] = 0.25;
          T[P.elbowR] = 0.5;
        } else {
          const cyc = (sl.actT * 0.85) % 1;
          const wind = cyc < 0.55 ? cyc / 0.55 : 0;
          const thr = cyc >= 0.55 ? Math.sin(((cyc - 0.55) / 0.45) * Math.PI) : 0;
          T[P.armRX] = -0.6 * wind + 2.0 * thr;
          T[P.armLX] = -0.4 * wind + 1.8 * thr;
          T[P.elbowR] = 0.3;
          T[P.elbowL] = 0.4;
          T[P.spineX] = -0.15 * wind + 0.45 * thr;
          T[P.spineY] = 0.3 * wind;
          T[P.legLX] = 0.4;
          T[P.kneeL] = 0.35;
          T[P.legRX] = -0.2;
          if (cyc >= 0.7 && cyc - dt * 0.85 < 0.7) {
            const fy = Math.sin(sl.yaw);
            const fz = Math.cos(sl.yaw);
            _p.set(sl.x + fy * 0.8, this.deckY(sl.zone, sl.x, sl.z) + 1.2, sl.z + fz * 0.8).applyMatrix4(sh.root.matrixWorld);
            onSplash(_p.x, _p.y, _p.z, 0);
          }
        }
        break;
      }
      case 'haul': {
        if (walking) walk(T, sl.phase, run);
        else {
          const w = tt * 4.2;
          T[P.armLX] = 2.35 + 0.5 * Math.sin(w);
          T[P.armRX] = 2.35 + 0.5 * Math.sin(w + Math.PI);
          T[P.elbowL] = 0.35 + 0.45 * (0.5 + 0.5 * Math.cos(w));
          T[P.elbowR] = 0.35 + 0.45 * (0.5 - 0.5 * Math.cos(w));
          T[P.armLZ] = 0.05;
          T[P.armRZ] = 0.05;
          T[P.spineX] = -0.2 + 0.08 * Math.sin(w * 2);
          T[P.headX] = -0.35;
          T[P.legLX] = 0.3;
          T[P.kneeL] = 0.35;
          T[P.legRX] = -0.15;
          T[P.kneeR] = 0.2;
          T[P.rootY] = -0.05;
        }
        break;
      }
      case 'swab': {
        prop = PROP.mop;
        if (walking) {
          walk(T, sl.phase, run, true);
          T[P.armRX] = 0.3;
          T[P.elbowR] = 0.3;
        } else {
          const w = tt * 2.6;
          T[P.spineX] = 0.3;
          T[P.spineY] = 0.28 * Math.sin(w);
          T[P.armRX] = 0.75 + 0.25 * Math.sin(w);
          T[P.armLX] = 0.95 + 0.25 * Math.sin(w);
          T[P.armLZ] = -0.2;
          T[P.armRZ] = 0.05;
          T[P.elbowR] = 0.35;
          T[P.elbowL] = 0.75;
          T[P.legLX] = 0.3;
          T[P.kneeL] = 0.3;
          T[P.kneeR] = 0.15;
          T[P.rootY] = -0.04;
          // inch along the deck as the boards get scrubbed
          const ax = Math.cos(sl.yaw);
          const az = -Math.sin(sl.yaw);
          sl.x += ax * Math.cos(w) * 0.12 * dt;
          sl.z += az * Math.cos(w) * 0.12 * dt;
          this.confine(sl);
        }
        break;
      }
      case 'lean': {
        if (walking) walk(T, sl.phase, run);
        else {
          if (sl.look.smoker) prop = PROP.pipe;
          T[P.spineX] = 0.5;
          T[P.armLX] = 1.15;
          T[P.armRX] = 1.15;
          T[P.armLZ] = -0.12;
          T[P.armRZ] = -0.12;
          T[P.elbowL] = 1.45;
          T[P.elbowR] = 1.45;
          T[P.headX] = -0.42;
          T[P.headY] = Math.sin(tt * 0.35) * 0.45;
          T[P.legLX] = 0.12;
          T[P.kneeL] = 0.4;
          T[P.rootY] = -0.03;
        }
        break;
      }
      case 'sit': {
        if (walking) walk(T, sl.phase, run);
        else {
          if (sl.look.smoker) prop = PROP.pipe;
          T[P.legLX] = 1.45;
          T[P.legRX] = 1.45;
          T[P.kneeL] = 1.35 + Math.sin(tt * 1.7) * 0.18;
          T[P.kneeR] = 1.35 + Math.sin(tt * 1.7 + 2) * 0.18;
          T[P.spineX] = 0.1;
          T[P.armLX] = 0.55;
          T[P.armRX] = 0.55;
          T[P.elbowL] = 0.7;
          T[P.elbowR] = 0.7;
          T[P.headY] = Math.sin(tt * 0.27) * 0.5;
          T[P.rootY] = -0.8;
        }
        break;
      }
      case 'coil': {
        if (walking) walk(T, sl.phase, run);
        else {
          const w = tt * 3;
          T[P.spineX] = 0.35;
          crouch(T, 0.85);
          T[P.armRX] = 0.75 + 0.3 * Math.sin(w);
          T[P.armRZ] = 0.15 + 0.25 * Math.cos(w);
          T[P.armLX] = 0.7;
          T[P.armLZ] = 0.05;
          T[P.elbowR] = 0.5;
          T[P.elbowL] = 0.9;
          T[P.headX] = 0.3;
        }
        break;
      }
      case 'chat': {
        if (walking) walk(T, sl.phase, run);
        else {
          const talk = Math.sin(tt * 0.9 + sl.seed) > 0;
          if (sl.look.drinker) {
            prop = PROP.mug;
            // a swig of grog between remarks
            const sip = (tt * 0.23 + sl.seed) % 1 < 0.16;
            T[P.armLX] = -0.2;
            T[P.armLZ] = 0.4;
            T[P.elbowL] = 1.7;
            T[P.armRX] = sip ? 1.85 : talk ? 0.6 + 0.3 * Math.sin(tt * 3.1) : 0.3;
            T[P.armRZ] = sip ? 0.15 : 0.2;
            T[P.elbowR] = sip ? 2.35 : 1.35;
            T[P.headX] = sip ? -0.4 : 0.08 * Math.sin(tt * 4);
          } else if (talk) {
            T[P.armRX] = 0.55 + 0.35 * Math.sin(tt * 3.1);
            T[P.armRZ] = 0.2;
            T[P.elbowR] = 1.2 + 0.3 * Math.sin(tt * 2.3);
            T[P.headX] = 0.08 * Math.sin(tt * 4);
          } else {
            T[P.armLX] = -0.2;
            T[P.armLZ] = 0.4;
            T[P.elbowL] = 1.7;
            T[P.armRZ] = 0.4;
            T[P.armRX] = -0.2;
            T[P.elbowR] = 1.7;
            T[P.headX] = 0.1 + 0.1 * Math.sin(tt * 1.3);
          }
          T[P.spineZ] = 0.05 * Math.sin(tt * 0.5);
          if (sl.partner) sl.wantYaw = Math.atan2(sl.partner.x - sl.x, sl.partner.z - sl.z);
        }
        break;
      }
      case 'fiddle': {
        prop = PROP.fiddle;
        if (walking) {
          walk(T, sl.phase, run, true);
          T[P.armLX] = 0.4;
          T[P.elbowL] = 1.3;
          T[P.armRX] = 0.25;
          T[P.elbowR] = 0.6;
        } else {
          // a hornpipe: fiddle tucked under the chin, the bow sawing, a foot tapping the beat
          const w = time * 7.5;
          const bow = Math.sin(w * 0.5);
          T[P.armLX] = 1.15;
          T[P.armLZ] = -0.55;
          T[P.elbowL] = 1.95;
          T[P.armRX] = 0.85;
          T[P.armRZ] = 0.45 + 0.12 * bow;
          T[P.elbowR] = 1.1 + 0.45 * bow;
          T[P.headX] = 0.22;
          T[P.headY] = 0.35;
          T[P.spineZ] = 0.07 * bow;
          T[P.spineX] = -0.04;
          T[P.legRX] = 0.12 * Math.max(0, Math.sin(w));
          T[P.kneeR] = 0.1 + 0.18 * Math.max(0, Math.sin(w));
          T[P.kneeL] = 0.12;
          T[P.rootY] = -0.015 - 0.015 * Math.abs(Math.sin(w));
        }
        break;
      }
      case 'jig': {
        const f = sl.partner;
        if (!f || f.act !== 'fiddle' || f.mode !== 'aboard') sl.actDur = 0;
        if (walking) walk(T, sl.phase, run);
        else {
          const w = time * 7.5;
          const k = Math.sin(w * 0.5);
          if (sl.seed % 2 < 1) {
            // arms folded high across the chest, sailor-fashion
            T[P.armLX] = 0.95;
            T[P.armRX] = 0.95;
            T[P.armLZ] = -0.55;
            T[P.armRZ] = -0.55;
            T[P.elbowL] = 2.1;
            T[P.elbowR] = 2.1;
          } else {
            T[P.armLZ] = 0.5;
            T[P.armRZ] = 0.5;
            T[P.elbowL] = 1.6;
            T[P.elbowR] = 1.6;
            T[P.armLX] = -0.15;
            T[P.armRX] = -0.15;
          }
          T[P.legLX] = 0.75 * Math.max(0, k);
          T[P.kneeL] = 0.1 + 1.25 * Math.max(0, k);
          T[P.legRX] = 0.75 * Math.max(0, -k);
          T[P.kneeR] = 0.1 + 1.25 * Math.max(0, -k);
          T[P.rootY] = 0.07 * Math.abs(k) - 0.03;
          T[P.spineZ] = 0.12 * k;
          T[P.spineX] = -0.05;
          T[P.headY] = 0.25 * Math.sin(w * 0.25);
          T[P.headX] = -0.1;
          if (f) sl.wantYaw = Math.atan2(f.x - sl.x, f.z - sl.z) + Math.sin(time * 0.6 + sl.seed) * 0.6;
        }
        break;
      }
      default: {
        if (walking) walk(T, sl.phase, run);
        else {
          if (sl.look.smoker) prop = PROP.pipe;
          T[P.spineX] = 0.02 + 0.015 * Math.sin(tt * 1.7);
          T[P.headY] = sl.lookYaw;
          T[P.legLX] = 0.06 * Math.sin(tt * 0.2);
          T[P.kneeL] = 0.1 + 0.1 * Math.max(0, Math.sin(tt * 0.2));
          if (Math.sin(tt * 0.17) > 0.6) {
            // hands on hips
            T[P.armLZ] = 0.5;
            T[P.armRZ] = 0.5;
            T[P.elbowL] = 1.6;
            T[P.elbowR] = 1.6;
            T[P.armLX] = -0.15;
            T[P.armRX] = -0.15;
          }
        }
      }
    }
    // idle glances
    sl.lookT -= dt;
    if (sl.lookT <= 0) {
      sl.lookT = rand(1.5, 5);
      sl.lookYaw = rand(-0.9, 0.9);
    }

    face(sl, T, tt, walking, !!this.enemy && this.enemyDist < 260, prop);

    // overlays: cheering and ducking
    if (sl.cheer > 0) {
      sl.cheer -= dt;
      if (sl.act !== 'helm' && !walking && sl.act !== 'sit') {
        const w = Math.min(1, sl.cheer * 2, (3.2 - sl.cheer) * 4);
        const j = Math.max(0, Math.sin(tt * 8.5));
        blendInto(T, (o) => {
          rest(o);
          o[P.armRX] = 2.7 + 0.3 * Math.sin(tt * 8.5);
          o[P.armLX] = 2.5 + 0.3 * Math.sin(tt * 8.5 + 1.3);
          o[P.armRZ] = -0.35;
          o[P.armLZ] = -0.35;
          o[P.elbowL] = 0.35;
          o[P.elbowR] = 0.2;
          o[P.headX] = -0.3;
          o[P.handL] = 1;
          o[P.handR] = 1;
          o[P.jaw] = 0.65 + 0.35 * Math.sin(tt * 8.5);
          o[P.brow] = 0.8;
          o[P.smile] = 1;
          o[P.gazeY] = 0.3;
          o[P.kneeL] = 0.5 * (1 - j);
          o[P.kneeR] = 0.5 * (1 - j);
          o[P.legLX] = 0.25 * (1 - j);
          o[P.legRX] = 0.25 * (1 - j);
          o[P.rootY] = j * 0.22 - (1 - j) * 0.08;
        }, w);
        if (sl.role === 'captain' || sl.prop === PROP.cutlass) prop = PROP.cutlass;
      }
    }
    if (sl.flinch > 0) {
      sl.flinch -= dt;
      if (sl.act !== 'lookout' && sl.act !== 'sit') {
        const w = Math.min(1, sl.flinch * 4) * Math.min(1, (0.75 - sl.flinch) * 10 + 0.3);
        blendInto(T, (o) => {
          rest(o);
          o[P.spineX] = 0.35;
          crouch(o, 0.9);
          o[P.armLX] = 2.3;
          o[P.armRX] = 2.2;
          o[P.armLZ] = -0.1;
          o[P.armRZ] = -0.1;
          o[P.elbowL] = 1.9;
          o[P.elbowR] = 1.9;
          o[P.headX] = 0.55;
          o[P.handL] = 0.15;
          o[P.handR] = 0.15;
          o[P.jaw] = 0.35;
          o[P.brow] = 1;
          o[P.smile] = -0.7;
        }, w);
      }
    }
    sl.prop = prop;
    if (prop === PROP.pipe && Math.random() < dt * 0.45) {
      const c = Math.cos(sl.yaw);
      const sn = Math.sin(sl.yaw);
      const lx = -0.08 * sl.girth;
      const lz = 0.24 * sl.girth;
      _p.set(sl.x + lx * c + lz * sn, this.deckY(sl.zone, sl.x, sl.z) + sl.y + sl.pose[P.rootY] + 1.64 * sl.height, sl.z - lx * sn + lz * c).applyMatrix4(sh.root.matrixWorld);
      world.particles.emit({
        x: _p.x, y: _p.y, z: _p.z, vx: sh.vel.x + rand(-0.1, 0.1), vy: rand(0.25, 0.45), vz: sh.vel.z + rand(-0.1, 0.1),
        life: rand(1.4, 2.2), size: 0.08, sizeEnd: rand(0.45, 0.7), color: [0.9, 0.9, 0.9], colorEnd: [1.05, 1.05, 1.05], alpha: 0.4, drag: 1.2, grav: -0.1, kind: 1, fadeIn: 0.1,
      });
    }

    // lift for the barrel seat / fighting top
    const lift = sl.act === 'lookout' && sl.spot ? sl.topY - this.deckY(sl.zone, sl.x, sl.z) : sl.seat && !walking && sl.act === 'sit' ? 0.74 : 0;
    if (!sl.flight) sl.y += (lift - sl.y) * damp(sl.act === 'lookout' ? 50 : 9, dt);
    this.ease(sl, dt, walking ? 16 : 9);
  }

  private ease(sl: Sailor, dt: number, rate: number) {
    const k = damp(rate, dt);
    for (let i = 0; i < POSE_SIZE; i++) sl.pose[i] += (sl.target[i] - sl.pose[i]) * k;
    // the eyes get there first: they lead every turn of the head, and of the body
    const lead = (sl.target[P.headY] - sl.pose[P.headY]) * 1.4 + angleDelta(sl.yaw, sl.wantYaw) * 0.8;
    sl.pose[P.gazeX] = clamp(sl.target[P.gazeX] + lead, -0.6, 0.6);
    sl.yaw += angleDelta(sl.yaw, sl.wantYaw) * damp(sl.goal ? 10 : 6, dt);
  }

  private localYawTo(p: THREE.Vector3) {
    const sh = this.ship;
    return angleDelta(sh.heading, Math.atan2(p.x - sh.pos.x, p.z - sh.pos.z));
  }

  private spyglass(T: Float32Array) {
    T[P.armRX] = 1.62;
    T[P.elbowR] = 1.52;
    T[P.armRZ] = 0.32;
    T[P.armLX] = 1.25;
    T[P.elbowL] = 1.55;
    T[P.armLZ] = 0.3;
    T[P.headX] = -0.08;
    T[P.legLX] = 0.15;
    T[P.kneeL] = 0.15;
  }

  private pointPose(T: Float32Array, tt: number) {
    T[P.armRX] = 1.8 + Math.sin(tt * 6) * 0.08;
    T[P.armRZ] = 0.12;
    T[P.elbowR] = 0.08;
    T[P.armLX] = -0.3;
    T[P.armLZ] = 0.35;
    T[P.elbowL] = 0.4;
    T[P.spineX] = -0.04;
    T[P.headX] = -0.18;
    T[P.legLX] = 0.38;
    T[P.kneeL] = 0.32;
    T[P.legRX] = -0.22;
    T[P.rootY] = -0.04;
  }

  // ---------------------------------------------------------------- roles

  /**
   * The helmsman hands over the wheel when the captain takes it: he goes down
   * the companion stair to the main deck and turns to like any other hand,
   * out of the captain's view, then climbs back to the wheel once it's free.
   */
  private helmPlan(sl: Sailor) {
    if (sl.flight) {
      sl.act = 'stand';
      return;
    }
    const yielded = !!this.pilot?.active && this.pilot.atHelm;
    const up = this.helmZone;
    const flights = this.flights.filter((f) => f.castle === up);
    const near = (k: 'head' | 'foot') => flights.reduce((a, b) => (Math.hypot(b[k].x - sl.x, b[k].z - sl.z) < Math.hypot(a[k].x - sl.x, a[k].z - sl.z) ? b : a));
    if (yielded) {
      if (sl.zone === this.main) return this.handPlan(sl);
      if (!flights.length) return this.idleAt(sl, { x: Math.min(0.95, this.halfWidth(sl.zone, this.tOf(this.helm.z)) - 0.45), z: this.helm.z + 0.3 }, -Math.PI / 2, 'stand');
      const f = near('head');
      if (Math.hypot(sl.x - f.head.x, sl.z - f.head.z) > 0.1) this.idleAt(sl, f.head, null, 'stand');
      else this.takeFlight(sl, f, 1);
      return;
    }
    if (sl.act !== 'helm' && sl.act !== 'stand') {
      this.setTask(sl, 'stand', 0);
      sl.spot = null;
    }
    if (sl.zone !== up && flights.length) {
      // back up to the wheel
      const f = near('foot');
      if (Math.hypot(sl.x - f.foot.x, sl.z - f.foot.z) > 0.1) this.idleAt(sl, f.foot, null, 'stand');
      else this.takeFlight(sl, f, -1);
      return;
    }
    this.idleAt(sl, this.helm, 0, 'helm');
  }

  /** Walks to a spot and, once there, takes up `act`. */
  private idleAt(sl: Sailor, want: Spot, yaw: number | null, act: Act) {
    if (Math.hypot(sl.x - want.x, sl.z - want.z) > 0.08) {
      if (!sl.goal || Math.abs(sl.goal.x - want.x) + Math.abs(sl.goal.z - want.z) > 0.01) this.walkTo(sl, want.x, want.z, false, yaw);
      sl.act = 'stand';
    } else sl.act = act;
  }

  /** The player walks the captain: copy their feet over and animate the stride. */
  private piloted(sl: Sailor, dt: number, tt: number) {
    const p = this.pilot!;
    const T = sl.target;
    sl.goal = null;
    sl.x = p.x;
    sl.z = p.z;
    sl.zone = this.zoneAt(this.tOf(p.z)) ?? sl.zone;
    sl.y = p.floor - this.deckY(sl.zone, p.x, p.z);
    sl.yaw = sl.wantYaw = p.yaw;
    sl.act = p.atHelm ? 'helm' : 'stand';
    sl.prop = PROP.none;
    if (p.atHelm) {
      const r = this.ship.rudder;
      T[P.armLX] = 1.05 - 0.35 * r;
      T[P.armRX] = 1.05 + 0.35 * r;
      T[P.elbowL] = 0.55 + 0.2 * r;
      T[P.elbowR] = 0.55 - 0.2 * r;
      T[P.spineY] = r * 0.18;
    } else if (p.speed > 0.15) walk(T, p.phase, p.speed > 3 ? 1 : 0);
    else T[P.spineX] = 0.02 + 0.015 * Math.sin(tt * 1.7);
    face(sl, T, tt, !p.atHelm && p.speed > 0.15, false, PROP.none);
    const k = damp(16, dt);
    for (let i = 0; i < POSE_SIZE; i++) sl.pose[i] += (T[i] - sl.pose[i]) * k;
  }

  deckView(): DeckView {
    return {
      obstacles: this.obstacles,
      helm: this.helm,
      others: (out) => {
        out.length = 0;
        for (const o of this.sailors) if (o.mode === 'aboard' && o.role !== 'captain' && o.act !== 'lookout' && o.y < 0.5) out.push({ x: o.x, z: o.z });
        return out;
      },
    };
  }

  /** Where the captain stands right now (ship-local), to step into their shoes. */
  captainAt(): { x: number; z: number; yaw: number } | null {
    const c = this.sailors.find((o) => o.role === 'captain');
    return c && c.mode === 'aboard' ? { x: c.x, z: c.z, yaw: c.yaw } : null;
  }

  private captainPlan(sl: Sailor, time: number) {
    const e = this.enemy;
    const zone = sl.zone;
    if (this.battle) {
      // to the rail on the engaged beam, cutlass drawn, and bellow the order as each volley goes
      const side = this.gunSide;
      const t = clamp(this.tOf(this.helm.z) + 1.2 / this.L, zone.t0, zone.t1);
      const want = { x: side * (this.halfWidth(zone, t) - 0.62), z: this.shape.z(t) };
      if (sl.act !== 'rail' && sl.act !== 'point') {
        sl.act = 'rail';
        sl.actT = 0;
      }
      if (!sl.goal && Math.hypot(sl.x - want.x, sl.z - want.z) > 0.3) this.walkTo(sl, want.x, want.z, true, side * Math.PI / 2);
      const since = time - Math.max(this.volleyAt.port, this.volleyAt.starboard);
      sl.act = !sl.goal && since >= 0 && since < 1.4 ? 'point' : 'rail';
      if (!sl.goal && e) sl.wantYaw = this.localYawTo(e.pos);
      return;
    }
    if (sl.act === 'rail' || sl.act === 'point') {
      sl.act = 'pace';
      sl.actT = 0;
      sl.actDur = 0;
    }
    if (sl.actT < sl.actDur) return;
    // stroll the quarterdeck; now and then stop for a long look through the glass
    if (e && this.enemyDist < 320 && Math.random() < 0.6) {
      sl.act = 'glass';
      sl.actT = 0;
      sl.actDur = rand(3, 5);
      sl.goal = null;
      sl.wantYaw = this.localYawTo(e.pos);
      return;
    }
    if (sl.act === 'pace' && Math.random() < 0.3) {
      sl.act = 'glass';
      sl.actT = 0;
      sl.actDur = rand(2.5, 4.5);
      sl.goal = null;
      sl.wantYaw = (Math.random() < 0.5 ? -1 : 1) * rand(1.2, 1.9);
      return;
    }
    sl.act = 'pace';
    sl.actT = 0;
    const t0 = this.tOf(this.helm.z);
    const tA = clamp(t0 + rand(0.4, 2.4) / this.L, zone.t0, zone.t1);
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side * (this.halfWidth(zone, tA) * rand(0.25, 0.55));
    this.walkTo(sl, x, this.shape.z(tA));
    sl.actDur = rand(3, 7);
  }

  private handPlan(sl: Sailor) {
    const sh = this.ship;
    // battle stations
    if (this.battle) {
      if (sl.role === 'gunner' && sl.gun) {
        const want = this.posts.find((p) => p.side === this.gunSide && Math.abs(p.z - sl.gun!.z) < 0.9) ?? this.posts.find((p) => p.side === this.gunSide);
        if (want && want !== sl.gun) sl.gun = want;
        if (sl.act !== 'gun') {
          sl.act = 'gun';
          sl.actT = 0;
          sl.seat = null;
          sl.y = 0;
        }
        if (!sl.goal && Math.hypot(sl.x - sl.gun.x, sl.z - sl.gun.z) > 0.12) this.walkTo(sl, sl.gun.x, sl.gun.z, true, sl.gun.side * Math.PI / 2);
        return;
      }
      if (sh.burning > 0 && sl.seed % 2 < 1.2) return this.firefight(sl);
      // powder monkeys: shuttle cartridges from the hatch to the guns
      if (sl.act !== 'powder') {
        sl.act = 'powder';
        sl.actT = 0;
        sl.actDur = 0;
        sl.seat = null;
        sl.goal = null;
      }
      if (!sl.goal && sl.actT >= sl.actDur) {
        const atHatch = Math.hypot(sl.x - this.hatch.x, sl.z - this.hatch.z) < 0.9;
        if (atHatch) {
          const posts = this.posts.filter((p) => p.side === this.gunSide);
          const p = posts.length ? pick(posts) : null;
          if (p) this.walkTo(sl, p.x - p.side * 0.55, p.z - Math.sign(p.z - sl.z || 1) * 0.5, true);
        } else this.walkTo(sl, this.hatch.x + rand(-0.4, 0.4), this.hatch.z + rand(-0.6, 0.6), true);
        sl.actT = 0;
        sl.actDur = rand(0.5, 0.9);
      } else if (sl.goal) sl.actT = 0;
      return;
    }
    if (sh.burning > 0) return this.firefight(sl);

    // trimming canvas or swinging yards: hands to the pin rails
    const trimming = Math.abs(sh.sailTarget - sh.sailLevel) > 0.03 || sh.rigActivity() > 0.35;
    if (trimming && sl.act !== 'haul' && this.hauls.length) {
      const taken = this.sailors.filter((o) => o.act === 'haul').length;
      if (taken < Math.min(this.hauls.length, 4)) {
        const free = this.hauls.filter((h) => h.zone === sl.zone && !this.sailors.some((o) => o.act === 'haul' && o.spot === h));
        if (free.length) {
          free.sort((a, b) => Math.hypot(a.x - sl.x, a.z - sl.z) - Math.hypot(b.x - sl.x, b.z - sl.z));
          const h = free[0];
          this.setTask(sl, 'haul', rand(2.5, 4));
          sl.spot = h;
          this.walkTo(sl, h.x, h.z, true, h.side * Math.PI / 2);
          return;
        }
      }
    }
    if (sl.act === 'haul' && (trimming || sl.goal)) {
      sl.actT = 0;
      return;
    }
    if (sl.act === 'gun' || sl.act === 'powder' || sl.act === 'bucket') sl.actDur = 0;
    if (sl.goal || sl.actT < sl.actDur) return;

    // a new chore
    sl.spot = null;
    sl.seat = null;
    sl.partner = null;
    const r = Math.random();
    const zone = sl.zone;
    // a fiddler strikes up now and then, and the hands nearby can't help but dance
    const fiddler = this.sailors.find((o) => o.act === 'fiddle' && o.mode === 'aboard');
    if (fiddler && fiddler !== sl && fiddler.zone === zone && !fiddler.goal && fiddler.actDur - fiddler.actT > 4 && Math.random() < 0.6 && this.sailors.filter((o) => o.act === 'jig').length < 3) {
      this.setTask(sl, 'jig', fiddler.actDur - fiddler.actT);
      sl.partner = fiddler;
      const a = rand(0, Math.PI * 2);
      this.walkTo(sl, fiddler.x + Math.sin(a) * rand(1.1, 1.5), fiddler.z + Math.cos(a) * rand(1.1, 1.5));
      return;
    }
    if (r < 0.08 && !fiddler && this.sailors.filter((o) => o.mode === 'aboard').length >= 5) {
      this.setTask(sl, 'fiddle', rand(18, 28));
      const p = this.freeSpot(zone);
      this.walkTo(sl, p.x, p.z, false, rand(-Math.PI, Math.PI));
      return;
    }
    if (r < 0.2) {
      this.setTask(sl, 'swab', rand(7, 13));
      const p = this.freeSpot(zone);
      this.walkTo(sl, p.x, p.z, false, rand(-Math.PI, Math.PI));
    } else if (r < 0.42) {
      this.setTask(sl, 'lean', rand(8, 15));
      const p = this.freeSpot(zone, true);
      this.walkTo(sl, p.x, p.z, false, Math.sign(p.x) * Math.PI / 2);
    } else if (r < 0.58 && this.seats.length) {
      const seat = pick(this.seats);
      const t = this.tOf(seat.z);
      if (t > zone.t0 && t < zone.t1 && !this.sailors.some((o) => o.seat === seat)) {
        this.setTask(sl, 'sit', rand(10, 18));
        sl.seat = seat;
        this.walkTo(sl, seat.x, seat.z, false, -Math.sign(seat.x || 1) * Math.PI / 2 + rand(-0.5, 0.5), seat);
      } else this.setTask(sl, 'stand', rand(2, 4));
    } else if (r < 0.7) {
      this.setTask(sl, 'coil', rand(5, 9));
      const p = this.freeSpot(zone);
      this.walkTo(sl, p.x, p.z, false, rand(-Math.PI, Math.PI));
    } else if (r < 0.85) {
      const mate = this.sailors.find((o) => o !== sl && o.mode === 'aboard' && o.zone === zone && (o.act === 'stand' || o.act === 'lean' || o.act === 'coil') && !o.goal && !o.partner);
      if (mate) {
        this.setTask(sl, 'chat', rand(6, 11));
        sl.partner = mate;
        const a = rand(0, Math.PI * 2);
        this.walkTo(sl, mate.x + Math.sin(a) * 0.95, mate.z + Math.cos(a) * 0.95);
        if (mate.act === 'stand') {
          mate.act = 'chat';
          mate.actT = 0;
          mate.actDur = sl.actDur;
          mate.partner = sl;
        }
      } else this.setTask(sl, 'stand', rand(2, 5));
    } else {
      this.setTask(sl, 'stand', rand(2.5, 6));
      const p = this.freeSpot(zone);
      this.walkTo(sl, p.x, p.z);
    }
  }

  private setTask(sl: Sailor, act: Act, dur: number) {
    sl.act = act;
    sl.actT = 0;
    sl.actDur = dur;
    sl.seat = null;
    sl.partner = null;
  }

  private firefight(sl: Sailor) {
    if (sl.act !== 'bucket') {
      sl.act = 'bucket';
      sl.actT = 0;
      sl.actDur = 0;
      sl.seat = null;
    }
    if (!sl.goal && sl.actT > sl.actDur) {
      const pts = this.ship.model.deckPoints.filter((p) => {
        const t = this.tOf(p.z);
        return t > sl.zone.t0 && t < sl.zone.t1;
      });
      const p = pts.length ? pick(pts) : this.freeSpot(sl.zone);
      const off = rand(0.9, 1.3) * (Math.random() < 0.5 ? -1 : 1);
      this.walkTo(sl, p.x + off, p.z + rand(-0.6, 0.6), true, off > 0 ? -Math.PI / 2 : Math.PI / 2);
      sl.actT = 0;
      sl.actDur = rand(2.5, 4);
    } else if (sl.goal) sl.actT = 0;
  }

  private gunnery(sl: Sailor, T: Float32Array, walking: boolean, run: number, time: number, tt: number): number {
    const sh = this.ship;
    const g = sl.gun;
    if (walking || !g) {
      walk(T, sl.phase, run);
      return PROP.none;
    }
    sl.wantYaw = g.side * Math.PI / 2;
    const side = g.side > 0 ? 'port' : 'starboard';
    const reload = sh.reload[side];
    const p = 1 - reload / sh.cls.reload;
    const fired = sh.gunFiredAt[g.muzzle] ?? -100;
    const since = time - fired;
    const volley = this.volleyAt[side];
    // the volley is rippling down the battery but this gun hasn't gone yet: put the match to the touch-hole
    if (reload > 0 && fired < volley && time - volley < 1.2) {
      T[P.armRX] = 1.0;
      T[P.elbowR] = 0.15;
      T[P.armLX] = 0.2;
      T[P.armLZ] = 0.5;
      T[P.elbowL] = 0.9;
      T[P.spineX] = 0.4;
      T[P.headX] = 0.1;
      T[P.legLX] = 0.45;
      T[P.kneeL] = 0.4;
      T[P.legRX] = -0.3;
      T[P.rootY] = -0.08;
      return PROP.linstock;
    }
    if (since >= 0 && since < 0.85) {
      // the gun bucks back on its breeching: jump clear, arm up against the blast
      const k = Math.sin(Math.min(1, since / 0.85) * Math.PI);
      T[P.spineX] = -0.3 * k;
      T[P.spineY] = 0.3 * k;
      T[P.armLX] = 1.7;
      T[P.elbowL] = 1.9;
      T[P.armRX] = 0.4;
      T[P.armRZ] = 0.6;
      T[P.legLX] = -0.3 * k;
      T[P.legRX] = 0.35 * k;
      T[P.kneeR] = 0.5 * k;
      T[P.headX] = 0.3;
      T[P.headY] = -0.5 * k;
      T[P.rootY] = 0.06 * k;
      return PROP.linstock;
    }
    if (reload > 0) {
      if (p < 0.45 || (p >= 0.6 && p < 0.84)) {
        // sponge out, then ram home: the staff drives in and out through the port
        const ram = p >= 0.6;
        const w = ram ? ((p - 0.6) / 0.24) * Math.PI * 4 : (p / 0.45) * Math.PI * 6;
        const push = 0.5 + 0.5 * Math.cos(w);
        T[P.armRX] = 1.45;
        T[P.armLX] = 1.4;
        T[P.armRZ] = -0.1;
        T[P.armLZ] = -0.25;
        T[P.elbowR] = 0.15 + 1.0 * push;
        T[P.elbowL] = 0.3 + 1.0 * push;
        T[P.spineX] = 0.35 + 0.2 * (1 - push);
        T[P.headX] = -0.15;
        T[P.legLX] = 0.45;
        T[P.kneeL] = 0.45;
        T[P.legRX] = -0.3;
        T[P.kneeR] = 0.1;
        T[P.rootY] = -0.09;
        return PROP.rammer;
      }
      if (p < 0.6) {
        // cartridge and ball into the muzzle
        T[P.spineX] = 0.5;
        crouch(T, 0.75);
        T[P.armLX] = 1.1;
        T[P.armRX] = 1.1;
        T[P.elbowL] = 0.5 + 0.3 * Math.sin(tt * 5);
        T[P.elbowR] = 0.5 + 0.3 * Math.sin(tt * 5 + 1);
        T[P.armLZ] = -0.2;
        T[P.armRZ] = -0.2;
        return PROP.none;
      }
      // run her out: heave on the gun tackle
      const w = Math.sin(tt * 4.5);
      T[P.spineX] = -0.25 + 0.12 * w;
      T[P.armLX] = 0.9;
      T[P.armRX] = 0.9;
      T[P.elbowL] = 0.25 + 0.25 * w;
      T[P.elbowR] = 0.25 + 0.25 * w;
      T[P.legLX] = 0.5;
      T[P.kneeL] = 0.6;
      T[P.legRX] = -0.2;
      T[P.kneeR] = 0.35;
      T[P.rootY] = -0.12;
      return PROP.none;
    }
    // loaded and run out: crouched by the breech, match smouldering, eyes on the enemy
    const b = Math.sin(tt * 1.4) * 0.03;
    T[P.spineX] = 0.28 + b;
    crouch(T, 0.45);
    T[P.armRX] = 0.75;
    T[P.elbowR] = 0.45;
    T[P.armLX] = 0.35;
    T[P.armLZ] = 0.25;
    T[P.elbowL] = 0.9;
    T[P.headX] = -0.3;
    if (this.enemy) T[P.headY] = clamp(angleDelta(sl.yaw, this.localYawTo(this.enemy.pos)), -0.8, 0.8);
    return PROP.linstock;
  }

  // ---------------------------------------------------------------- abandon ship

  private founder(sl: Sailor, dt: number, world: World) {
    const sh = this.ship;
    const T = sl.target;
    const tt = world.time * sl.tempo + sl.seed;
    rest(T);
    sl.seat = null;
    sl.y += (0 - sl.y) * damp(6, dt);
    sl.prop = PROP.none;
    if (sl.role === 'captain') {
      // he goes down with her, saluting
      sl.act = 'salute';
      if (sl.goal) {
        this.stepWalk(sl, dt);
        walk(T, sl.phase, 0);
      } else {
        T[P.armRX] = 2.0;
        T[P.armRZ] = 0.3;
        T[P.elbowR] = 1.7;
        T[P.headX] = -0.15;
        sl.wantYaw = 0;
      }
    } else if (sl.role === 'lookout' && sl.spot) {
      // clinging to the top, arms round the mast
      T[P.armLX] = 1.4;
      T[P.armRX] = 1.4;
      T[P.armLZ] = -0.35;
      T[P.armRZ] = -0.35;
      T[P.elbowL] = 1.2;
      T[P.elbowR] = 1.2;
      T[P.headY] = Math.sin(tt * 3) * 0.6;
      sl.panicDelay -= dt;
      sl.y = sl.topY - this.deckY(sl.zone, sl.x, sl.z);
      if (sl.panicDelay < -1.5) this.leap(sl);
    } else if (sl.role === 'helm' && sl.panicDelay > 1.1) {
      // the helmsman fights the wheel to the last
      sl.panicDelay -= dt;
      T[P.armLX] = 1.05 + Math.sin(tt * 7) * 0.5;
      T[P.armRX] = 1.05 - Math.sin(tt * 7) * 0.5;
      T[P.elbowL] = 0.6;
      T[P.elbowR] = 0.6;
      T[P.spineY] = Math.sin(tt * 3.5) * 0.25;
      T[P.headY] = Math.sin(tt * 2.1) * 0.7;
      crouch(T, 0.25);
      sl.wantYaw = 0;
    } else {
      sl.act = 'panic';
      sl.panicDelay -= dt;
      if (!sl.goal && sl.actDur !== -1) {
        // make for the high side and go over
        const side = sh.highSide();
        const t = clamp(this.tOf(sl.z) + rand(-0.06, 0.06), sl.zone.t0, sl.zone.t1);
        this.walkTo(sl, side * (this.halfWidth(sl.zone, t) - 0.25), this.shape.z(t), true, side * Math.PI / 2);
        sl.actDur = -1;
      }
      const moving = sl.goal !== null && !this.stepWalk(sl, dt);
      if (moving) {
        walk(T, sl.phase, 1, true);
        T[P.armLX] = 2.4 + Math.sin(tt * 11) * 0.4;
        T[P.armRX] = 2.2 + Math.sin(tt * 12 + 1) * 0.4;
        T[P.armLZ] = 0.5;
        T[P.armRZ] = 0.5;
      } else {
        T[P.armLX] = 0.6 + Math.sin(tt * 9) * 0.5;
        T[P.armRX] = 0.6 + Math.sin(tt * 8 + 2) * 0.5;
        T[P.armLZ] = 0.8;
        T[P.armRZ] = 0.8;
        T[P.headY] = Math.sin(tt * 2.3) * 0.8;
        crouch(T, 0.3);
        if (sl.panicDelay <= 0) this.leap(sl);
      }
    }
    if (sl.act === 'salute') {
      // stiff upper lip; the hand flat at the brim
      T[P.handR] = 0;
      T[P.brow] = -0.2;
      T[P.smile] = 0.1;
      T[P.handL] = 0.6;
    } else {
      // terror: brows up, mouth wide, hands splayed
      T[P.jaw] = 0.75 + 0.25 * Math.sin(tt * 6);
      T[P.brow] = 1;
      T[P.smile] = -0.8;
      T[P.handL] = 0;
      T[P.handR] = 0;
      T[P.gazeY] = 0.2 * Math.sin(tt * 2);
    }
    if (sl.mode === 'aboard') this.ease(sl, dt, 12);
    // the sea comes over the rail: whoever is still aboard is now swimming (or gone down with her)
    if (sl.mode === 'aboard') {
      _p.set(sl.x, this.deckY(sl.zone, sl.x, sl.z) + sl.y + 0.9, sl.z).applyMatrix4(sh.root.matrixWorld);
      if (_p.y < world.waterHeight(_p.x, _p.z)) {
        if (sl.role === 'captain') sl.mode = 'gone';
        else {
          this.toWorld(sl);
          sl.mode = 'swim';
          sl.swimT = 0;
          sl.wy = world.waterHeight(sl.wx, sl.wz);
        }
      }
    }
  }

  /** Copies the sailor's ship-local placement into world space. */
  private toWorld(sl: Sailor) {
    const sh = this.ship;
    _p.set(sl.x, this.deckY(sl.zone, sl.x, sl.z) + sl.y, sl.z).applyMatrix4(sh.root.matrixWorld);
    sl.wx = _p.x;
    sl.wy = _p.y;
    sl.wz = _p.z;
    sl.yaw = sh.heading + sl.yaw;
    sl.wantYaw = sl.yaw;
  }

  private leap(sl: Sailor) {
    const sh = this.ship;
    this.toWorld(sl);
    const side = sl.x >= 0 ? 1 : -1;
    const port = sh.portDir(_s);
    const out = rand(2.6, 3.6);
    sl.vx = sh.vel.x + port.x * side * out;
    sl.vz = sh.vel.z + port.z * side * out;
    sl.vy = rand(3.2, 4.4);
    sl.mode = 'air';
    sl.wantYaw = sl.yaw = Math.atan2(port.x * side, port.z * side);
  }

  /** Writes this sailor's instance matrix into `out` for aboard crew. */
  matrixOf(sl: Sailor, out: THREE.Matrix4) {
    const y = this.deckY(sl.zone, sl.x, sl.z) + sl.y;
    _p.set(sl.x, y, sl.z);
    _q3.setFromAxisAngle(_up, sl.yaw);
    _q2.copy(this.upright).multiply(_q3);
    _s.set(sl.girth, sl.height, sl.girth);
    _m.compose(_p, _q2, _s);
    out.multiplyMatrices(this.ship.root.matrixWorld, _m);
  }
}

function blendInto(T: Float32Array, make: (o: Float32Array) => void, w: number) {
  if (w <= 0) return;
  make(_tmpPose);
  const k = Math.min(1, w);
  for (let i = 0; i < POSE_SIZE; i++) T[i] = lerp(T[i], _tmpPose[i], k);
}
const _tmpPose = new Float32Array(POSE_SIZE);

// props gripped two-handed, and how tight the off hand closes
const OFF_HAND: Record<number, number> = {
  [PROP.rammer]: 0.95, [PROP.mop]: 0.95, [PROP.bucket]: 0.9, [PROP.spyglass]: 0.85, [PROP.fiddle]: 0.7,
};

/** Hands and faces: what each sailor's fingers and features are doing for the job at hand. */
function face(sl: Sailor, T: Float32Array, tt: number, walking: boolean, battle: boolean, prop: number) {
  T[P.smile] = sl.mood;
  T[P.brow] = 0.15 * Math.sin(tt * 0.37);
  if (battle) {
    T[P.smile] = Math.min(sl.mood, 0) - 0.25;
    T[P.brow] = -0.55;
  }
  if (prop !== PROP.none) {
    T[P.handR] = prop === PROP.fiddle ? 0.8 : 1;
    T[P.handL] = OFF_HAND[prop] ?? T[P.handL];
  }
  if (walking) return;
  switch (sl.act) {
    case 'helm':
    case 'haul':
      T[P.handL] = 1;
      T[P.handR] = 1;
      T[P.brow] -= sl.act === 'haul' ? 0.3 : 0.15;
      if (sl.act === 'haul') T[P.jaw] = 0.3 + 0.3 * Math.max(0, Math.sin(tt * 4.2)); // heave-ho
      break;
    case 'coil':
    case 'swab':
      T[P.handL] = Math.max(T[P.handL], 0.85);
      T[P.handR] = Math.max(T[P.handR], 0.85);
      break;
    case 'pace':
      // hands clasped at the small of the back
      T[P.handL] = 0.7;
      T[P.handR] = 0.7;
      T[P.brow] -= 0.25;
      break;
    case 'lean':
      T[P.handL] = 0.55;
      T[P.handR] = prop === PROP.pipe ? 1 : 0.55;
      break;
    case 'lookout':
      T[P.brow] -= 0.35; // squinting at the horizon
      break;
    case 'point':
    case 'rail':
      if (battle) {
        // bellowing orders across the deck
        T[P.jaw] = 0.45 + 0.4 * Math.max(0, Math.sin(tt * 5.3));
        T[P.brow] = -0.9;
        T[P.smile] = -0.3;
      }
      break;
    case 'gun':
      T[P.brow] = -0.6;
      T[P.jaw] = 0.12;
      break;
    case 'powder':
    case 'bucket':
      T[P.brow] = 0.5;
      T[P.jaw] = 0.35;
      T[P.smile] = -0.3;
      break;
    case 'chat': {
      const talk = Math.sin(tt * 0.9 + sl.seed) > 0;
      if (talk) {
        // syllables, and the eyebrows doing half the talking
        T[P.jaw] = 0.12 + 0.4 * Math.max(0, Math.sin(tt * 11)) * (0.5 + 0.5 * Math.sin(tt * 2.7));
        T[P.brow] = 0.45 * Math.max(0, Math.sin(tt * 1.9));
        T[P.smile] = sl.mood + 0.3;
        if (prop === PROP.none) T[P.handR] = 0.15;
      } else {
        T[P.smile] = sl.mood + 0.15 + 0.4 * Math.max(0, Math.sin(tt * 1.3)); // listening, amused
        T[P.handL] = 0.5;
        T[P.handR] = prop === PROP.none ? 0.5 : T[P.handR];
      }
      break;
    }
    case 'fiddle':
      T[P.smile] = 0.7;
      T[P.brow] = 0.3;
      T[P.gazeY] = -0.25;
      break;
    case 'jig': {
      const hips = sl.seed % 2 >= 1;
      T[P.handL] = hips ? 0.5 : 0.7;
      T[P.handR] = hips ? 0.5 : 0.7;
      T[P.smile] = 1;
      T[P.jaw] = 0.3 * Math.max(0, Math.sin(tt * 3.75));
      T[P.brow] = 0.5;
      break;
    }
    case 'sit':
      T[P.handL] = 0.4;
      T[P.handR] = prop === PROP.pipe ? 1 : 0.4;
      T[P.smile] = sl.mood + 0.2;
      break;
    default:
      if (T[P.elbowL] > 1.4 && T[P.armLZ] > 0.4) {
        // hands on hips
        T[P.handL] = 0.55;
        T[P.handR] = 0.55;
      }
  }
}

/** Airborne leapers and swimmers live in world space. */
function updateLoose(sl: Sailor, dt: number, world: World) {
  const T = sl.target;
  const tt = world.time * sl.tempo + sl.seed;
  rest(T);
  if (sl.mode === 'air') {
    sl.vy -= 9.8 * dt;
    sl.wx += sl.vx * dt;
    sl.wy += sl.vy * dt;
    sl.wz += sl.vz * dt;
    if (sl.dive) {
      T[P.armLX] = 2.9;
      T[P.armRX] = 2.9;
      T[P.armLZ] = -0.15;
      T[P.armRZ] = -0.15;
      T[P.spineX] = 0.2;
    } else {
      // cannonball!
      T[P.legLX] = 1.9;
      T[P.legRX] = 1.9;
      T[P.kneeL] = 2.3;
      T[P.kneeR] = 2.3;
      T[P.armLX] = 1.0;
      T[P.armRX] = 1.0;
      T[P.elbowL] = 1.6;
      T[P.elbowR] = 1.6;
      T[P.spineX] = 0.4;
      T[P.rootY] = 0.3;
    }
    const wh = world.waterHeight(sl.wx, sl.wz);
    if (sl.wy < wh && sl.vy < 0) {
      sl.mode = 'swim';
      sl.swimT = 0;
      sl.vx *= 0.15;
      sl.vz *= 0.15;
      sl.wy = wh;
      _p.set(sl.wx, wh, sl.wz);
      world.particles.splash(_p, 0.32);
      const [vol, pan, d] = world.soundAt(_p);
      world.audio.splash(vol * 0.18, pan, d);
    }
  } else if (sl.mode === 'swim') {
    sl.swimT += dt;
    // a laboured breaststroke away from the wreck
    const w = tt * 3.2;
    T[P.armLX] = 1.7 + 0.6 * Math.sin(w);
    T[P.armRX] = 1.7 + 0.6 * Math.sin(w);
    T[P.armLZ] = 0.5 + 0.6 * Math.cos(w);
    T[P.armRZ] = 0.5 + 0.6 * Math.cos(w);
    T[P.elbowL] = 0.5 + 0.4 * Math.max(0, -Math.cos(w));
    T[P.elbowR] = 0.5 + 0.4 * Math.max(0, -Math.cos(w));
    T[P.legLX] = 0.3 + 0.35 * Math.sin(w + 1);
    T[P.legRX] = 0.3 + 0.35 * Math.sin(w + 1);
    T[P.kneeL] = 0.9 + 0.6 * Math.sin(w + 2);
    T[P.kneeR] = 0.9 + 0.6 * Math.sin(w + 2);
    T[P.headX] = -0.95;
    const sp = 0.9 * (0.6 + 0.4 * Math.max(0, Math.sin(w)));
    sl.vx += (Math.sin(sl.yaw) * sp - sl.vx) * damp(2, dt);
    sl.vz += (Math.cos(sl.yaw) * sp - sl.vz) * damp(2, dt);
    sl.wx += sl.vx * dt;
    sl.wz += sl.vz * dt;
    sl.wantYaw += Math.sin(tt * 0.3) * 0.2 * dt;
    const wh = world.waterHeight(sl.wx, sl.wz);
    if (sl.swimT > 6 + (sl.seed % 3)) sl.fade += dt * 0.35;
    sl.wy += (wh - sl.fade - sl.wy) * damp(5, dt);
    if (sl.fade > 2.2) sl.mode = 'gone';
  }
  if (sl.mode === 'air') {
    // the yell all the way down
    T[P.jaw] = 1;
    T[P.brow] = 1;
    T[P.smile] = sl.dive ? 0.2 : 0.6;
    T[P.handL] = sl.dive ? 0 : 1;
    T[P.handR] = sl.dive ? 0 : 1;
  } else if (sl.mode === 'swim') {
    // spluttering, eyes on the horizon
    T[P.jaw] = 0.25 + 0.25 * Math.max(0, Math.sin(tt * 3.2 + 1.5));
    T[P.brow] = 0.55;
    T[P.smile] = -0.4;
    T[P.handL] = 0.15;
    T[P.handR] = 0.15;
    T[P.gazeY] = 0.35;
  }
  const k = damp(10, dt);
  for (let i = 0; i < POSE_SIZE; i++) sl.pose[i] += (T[i] - sl.pose[i]) * k;
  sl.yaw += angleDelta(sl.yaw, sl.wantYaw) * damp(4, dt);
}

function looseMatrix(sl: Sailor, out: THREE.Matrix4) {
  _s.set(sl.girth, sl.height, sl.girth);
  if (sl.mode === 'swim') {
    // lying in the water, chest at the surface, head up
    _e.set(1.15, sl.yaw, 0, 'YXZ');
    _q.setFromEuler(_e);
    _m2.makeTranslation(0, -1.3, 0);
    _m.compose(_p.set(sl.wx, sl.wy - 0.04, sl.wz), _q, _s);
    out.multiplyMatrices(_m, _m2);
    return;
  }
  const tumble = sl.dive ? clamp(-sl.vy * 0.12, 0, 1.4) : clamp(-sl.vy * 0.05, -0.3, 0.6);
  _e.set(tumble, sl.yaw, 0, 'YXZ');
  _q.setFromEuler(_e);
  _m2.makeTranslation(0, -0.9, 0);
  _m.compose(_p.set(sl.wx, sl.wy + 0.9, sl.wz), _q, _s);
  out.multiplyMatrices(_m, _m2);
}

// ------------------------------------------------------------------ system

export class CrewSystem {
  readonly mesh: THREE.Group;
  private readonly crews = new Map<Ship, ShipCrew>();
  private orphans: Sailor[] = [];
  private readonly free: number[] = [];
  private readonly view: CrewRenderer;
  private readonly max: number;

  constructor(readonly tier: number) {
    this.max = tier === 0 ? 200 : 320;
    for (let i = this.max - 1; i >= 0; i--) this.free.push(i);
    this.view = tier === 0 ? new CrewRenderer(this.max, 0.65, 0.35, 16) : new CrewRenderer(this.max, 0.8, 0.45, 32);
    this.mesh = this.view.group;
  }

  private alloc = () => this.free.pop() ?? -1;

  private writeLook = (row: number, look: Look) => this.view.setRow(row, look.slots);

  private release(sl: Sailor) {
    this.free.push(sl.row);
  }

  /** Hands the player's captain to (or back from) manual control. */
  setPilot(ship: Ship, pilot: Pilot | null) {
    const c = this.crews.get(ship);
    if (c) c.pilot = pilot;
  }

  deckView(ship: Ship): DeckView | null {
    return this.crews.get(ship)?.deckView() ?? null;
  }

  captainAt(ship: Ship) {
    return this.crews.get(ship)?.captainAt() ?? null;
  }

  clear() {
    for (const c of this.crews.values()) for (const sl of c.sailors) this.release(sl);
    for (const sl of this.orphans) this.release(sl);
    this.crews.clear();
    this.orphans = [];
    this.view.begin();
    this.view.end();
  }

  update(dt: number, world: World, ships: Ship[], focus: THREE.Vector3, viewR: number, eye: THREE.Vector3 | null = null) {
    // crews come aboard new ships, and are cast adrift when a ship is gone
    for (const s of ships) if (!this.crews.has(s) && !s.removed) this.crews.set(s, new ShipCrew(s, this.alloc, this.tier, this.writeLook));
    for (const [s, c] of this.crews) {
      if (ships.includes(s) && !s.removed) continue;
      for (const sl of c.sailors) {
        if (sl.mode === 'air' || sl.mode === 'swim') this.orphans.push(sl);
        else this.release(sl);
      }
      this.crews.delete(s);
    }

    const splash = (x: number, y: number, z: number) => {
      for (let i = 0; i < 6; i++) {
        world.particles.emit({
          x, y, z, vx: rand(-1.5, 1.5), vy: rand(1, 3.5), vz: rand(-1.5, 1.5),
          life: rand(0.5, 0.8), size: rand(0.12, 0.22), sizeEnd: 0.08, color: [1.2, 1.3, 1.35], alpha: 0.85, grav: 12, drag: 0.8, kind: 0, fadeIn: 0.01,
        });
      }
    };

    const view = this.view;
    view.begin();
    // the full sculpt (fingers, lashes, laces) only for those close enough to see it
    const near2 = 26 * 26;
    const emit = (sl: Sailor, m: THREE.Matrix4) => {
      const e = m.elements;
      const near = !!eye && (e[12] - eye.x) ** 2 + (e[13] - eye.y) ** 2 + (e[14] - eye.z) ** 2 < near2;
      view.push(m, sl.pose, sl.row, sl.look.hat, sl.prop, sl.look.flags, near);
    };

    const m = _mOut;
    for (const c of this.crews.values()) {
      const s = c.ship;
      const far = Math.hypot(s.pos.x - focus.x, s.pos.z - focus.z) > viewR + s.cls.length;
      if (far) continue;
      if (dt > 0) c.update(dt, world, ships, splash);
      for (const sl of c.sailors) {
        if (sl.mode === 'gone') continue;
        if (c.pilot?.hidden && sl.role === 'captain' && sl.mode === 'aboard') continue;
        if (sl.mode === 'aboard') c.matrixOf(sl, m);
        else looseMatrix(sl, m);
        emit(sl, m);
      }
    }
    for (let i = this.orphans.length - 1; i >= 0; i--) {
      const sl = this.orphans[i];
      if (dt > 0) updateLoose(sl, dt, world);
      if (sl.mode === 'gone') {
        this.release(sl);
        this.orphans.splice(i, 1);
        continue;
      }
      looseMatrix(sl, m);
      emit(sl, m);
    }
    view.end();
  }
}
const _mOut = new THREE.Matrix4();
