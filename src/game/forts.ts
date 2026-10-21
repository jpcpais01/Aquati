import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { staticLod } from '../render/staticLod';
import { angleDelta, clamp, damp, mulberry32 } from '../core/noise';
import { progressSaved } from '../core/progress';
import { currentIsle } from '../data/renamedIsles';
import { Bucket, Builder } from '../port/port';
import type { Ship } from '../ships/ship';
import type { Camp, Garrison } from '../shore/shore';
import { Ground } from '../shore/ground';
import { ShoreMats } from '../shore/kit';
import {
  blockGeometry, buildFort, Corner, cornerAt, cornerPad, corners, finishDoors, FortLayout, fortReach, FortSite, fortSolid, FortStyle, fortSurface, fortToWorld, GATE_W, GUN_PIVOT, gunParts,
  pockGeometry, rubbleGeometry, worldToFort,
} from '../shore/fortKit';
import type { AmmoId } from './ammo';
import type { World } from './world';
import { Grudge, sideOf } from './peace';

// The Brethren's island forts. Each holds a rise above the sea with four
// bronze guns in the embrasures of its sea walls; come within their reach and
// they traverse onto you and open fire, leading your ship like any gun crew.
// Batter a gun's embrasure (or burst a shell on it) and it is silenced, its
// carriage smashed and its masonry tumbled; silence them all and the beach
// below is yours to land on. Ashore, the garrison sallies out of the gate to
// meet you. Beat it and the commandant's colours come down the staff and
// yours go up: the fort's guns then cover you and fire on any pirate that
// comes near, it pays a tribute into your purse as the hours pass, and its
// carpenters patch your hull while you lie under its walls. Forts taken stay
// taken, voyage after voyage, synced with your account.
//
// A fort shows the battering it takes: every ball that strikes stone leaves a
// blackened scar and knocks blocks tumbling down the face, a gun's stretch of
// parapet caves in as its crew are shot up, its tower tops come down under a
// steady fire, and a fort silenced burns, its barracks roof going up in flames.
// One you've taken stays scarred, its gaps stopped with gabions and planks.

export const FORTS_KEY = 'aquati.forts.v1';

/** How far the guns reach, and how far a fort's bar shows. */
export const FORT_RANGE = 205;
const SHOW_RANGE = 360;
const GUN_HP = 150;
const RELOAD = 6.4;
const SHOT_SPEED = 66;
const SHOT_DAMAGE = 21;
const GRAVITY = 14;
/** Each gun traverses this far either side of its embrasure, at this rate (rad/s). */
const ARC = 1.3;
const TURN = 0.62;
/** A fort's gun stands high: her gunnery may lay on it this far past her usual reach (with the higher arc that takes). */
const MARK_REACH = 1.3;
/** Shot scars and fallen blocks each fort keeps (the oldest give way to the newest). */
const POCKS = 40;
const DEBRIS = 24;
/** A gun's parapet caves in once she's this far shot up; a tower's top comes down after this many hits. */
const PARAPET_HP = 0.5;
const TOWER_HITS = 4;
/** Tribute per hour a fort pays, and the most it holds for you (hours' worth). */
export const TRIBUTE_HOUR = 150;
const TRIBUTE_CAP = 8;
/** Sail this close to a fort of yours to collect, and lie this close for its carpenters. */
const COLLECT_R = 220;
export const HAVEN_R = 175;

export interface FortSave {
  /** Fort id → when it was taken (ms since 1970). */
  taken: Record<string, number>;
  /** Fort id → when its tribute was last collected. */
  paid: Record<string, number>;
  /** Tribute gold collected, ever. */
  tribute: number;
}

export const freshForts = (): FortSave => ({ taken: {}, paid: {}, tribute: 0 });

const numMap = (v: unknown) => {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object' && !Array.isArray(v))
    for (const [k, n] of Object.entries(v)) if (Number.isFinite(Number(n))) out[k.startsWith('fort:') ? 'fort:' + currentIsle(k.slice(5)) : k] = Number(n);
  return out;
};

export function cleanForts(r: unknown): FortSave | null {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const o = r as Record<string, unknown>;
  return { taken: numMap(o.taken), paid: numMap(o.paid), tribute: Math.max(0, Math.floor(Number(o.tribute) || 0)) };
}

export function readForts(): FortSave | null {
  try {
    const v = localStorage.getItem(FORTS_KEY);
    return v ? cleanForts(JSON.parse(v)) : null;
  } catch {
    return null;
  }
}

/** Forts taken on either device stay taken; a tribute collected anywhere is collected. */
export function mergeForts(b: FortSave | null, l: FortSave | null, r: FortSave | null): FortSave | null {
  if (!l) return r;
  if (!r) return l;
  const taken = { ...r.taken };
  for (const [k, t] of Object.entries(l.taken)) taken[k] = Math.min(t, taken[k] ?? Infinity);
  const paid = { ...r.paid };
  for (const [k, t] of Object.entries(l.paid)) paid[k] = Math.max(t, paid[k] ?? 0);
  return { taken, paid, tribute: r.tribute + Math.max(0, l.tribute - (b?.tribute ?? 0)) };
}

export class FortStore {
  state: FortSave = readForts() ?? freshForts();

  reload() {
    this.state = readForts() ?? freshForts();
  }

  private save() {
    try {
      localStorage.setItem(FORTS_KEY, JSON.stringify(this.state));
    } catch {
      /* private mode: the conquest lasts the session */
    }
    progressSaved();
  }

  take(id: string) {
    const now = Date.now();
    this.state.taken[id] = now;
    this.state.paid[id] = now;
    this.save();
  }

  /** A fresh sea: the Brethren hold every fort again. */
  wipe() {
    this.state = freshForts();
    this.save();
  }

  /** Gold waiting at a fort of yours. */
  owed(id: string, now = Date.now()) {
    if (!(id in this.state.taken)) return 0;
    const since = this.state.paid[id] ?? this.state.taken[id];
    const h = clamp((now - since) / 3.6e6, 0, TRIBUTE_CAP);
    return Math.floor(h * TRIBUTE_HOUR);
  }

  collect(id: string) {
    const n = this.owed(id);
    if (n <= 0) return 0;
    this.state.paid[id] = Date.now();
    this.state.tribute += n;
    this.save();
    return n;
  }
}

/**
 * One fort's breakable stonework, every piece's triangles in one mesh: a piece
 * that's down has its triangles folded to a point (no draw call, no new
 * material, one small buffer upload when it goes).
 */
class Shards {
  readonly mesh: THREE.Mesh;
  private pos: THREE.BufferAttribute;
  private full: Float32Array;
  private ranges = new Map<string, [number, number]>();
  private shown = new Set<string>();

  static make(parts: { key: string; geos: THREE.BufferGeometry[] }[], mat: THREE.Material) {
    const list = parts.filter((p) => p.geos.length);
    return list.length ? new Shards(list, mat) : null;
  }

  private constructor(parts: { key: string; geos: THREE.BufferGeometry[] }[], mat: THREE.Material) {
    const geos: THREE.BufferGeometry[] = [];
    let at = 0;
    for (const p of parts) {
      const g = mergeGeometries(p.geos)!;
      const n = g.getAttribute('position').count;
      this.ranges.set(p.key, [at, n]);
      this.shown.add(p.key);
      at += n;
      geos.push(g);
    }
    const geo = mergeGeometries(geos)!;
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    this.pos = geo.getAttribute('position') as THREE.BufferAttribute;
    this.full = (this.pos.array as Float32Array).slice();
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    // its pieces come and go by folding their vertices away: a set built
    // standing gets simplified levels that never join two pieces (the levels
    // share the vertices, so a piece folds out of every level at once); the
    // sets built folded keep their full mesh
    this.mesh.userData.noLod = !this.shown.size;
    this.mesh.userData.lodSolid = true;
  }

  set(key: string, on: boolean) {
    const r = this.ranges.get(key);
    if (!r || this.shown.has(key) === on) return;
    const a = this.pos.array as Float32Array;
    const [i0, n] = r;
    if (on) a.set(this.full.subarray(i0 * 3, (i0 + n) * 3), i0 * 3);
    else a.fill(0, i0 * 3, (i0 + n) * 3);
    if (on) this.shown.add(key);
    else this.shown.delete(key);
    // only that piece's stretch of the buffer goes up
    this.pos.addUpdateRange(i0 * 3, n * 3);
    this.pos.needsUpdate = true;
    // nothing of this set standing: no draw at all
    this.mesh.visible = this.shown.size > 0;
  }

  all(on: boolean) {
    for (const k of this.ranges.keys()) this.set(k, on);
  }
}

/** A block knocked off a face, tumbling down to lie at its foot. */
interface Falling {
  slot: number;
  p: THREE.Vector3;
  v: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  s: number;
  wet: boolean;
}

/** A fire on the stonework (world), and how long it burns, then smoulders. */
interface Blaze {
  at: THREE.Vector3;
  t: number;
  flames: number;
  smoke: number;
  size: number;
  acc: number;
}

export interface Gun {
  fort: Fort;
  index: number;
  /** Its slot in its own fort's gun meshes. */
  slot: number;
  /** The carriage on the rampart (world), and the embrasure's facing. */
  base: THREE.Vector3;
  yaw0: number;
  yaw: number;
  pitch: number;
  hp: number;
  dead: boolean;
  /** Seconds since she was silenced (for smoke and fire). */
  deadT: number;
  reload: number;
  /** 1 just fired, easing back to 0 as the crew run her out again. */
  recoil: number;
  /** Seconds the crew are thinned (grape) or shaken (wraith-fire): slower to reload. */
  shaken: number;
  smokeT: number;
  target: Ship | null;
  /** Elevation wanted for the target (rad), or -1 out of reach. */
  want: number;
  wantYaw: number;
}

export interface Fort {
  id: string;
  name: string;
  site: FortSite;
  layout: FortLayout;
  guns: Gun[];
  owner: 'brethren' | 'player';
  /** What its shot is fired by, as far as the cannonballs know (never in the ships list). */
  gunner: Ship;
  /** Its garrison, a camp ashore (set once the shore has it). */
  garrison: Camp | null;
  /** Its guns are firing (they had a target lately). */
  alert: boolean;
  quiet: number;
  /** Peaceful seas: the captains who have fired on it (or its garrison, or a ship under its guns). */
  grudge: Grudge;
  /** Gate doors: 0 shut .. 1 swung open. */
  doors: number;
  /** Your colours: 0 at the foot of the staff .. 1 at the truck, and whether they're going up. */
  up: number;
  hoist: number;
  mine: THREE.Group;
  style: FortStyle;
  corners: Corner[];
  /** Its stonework whole, wrecked, and patched with timber. */
  shards: { intact: Shards | null; broken: Shards | null; patch: Shards | null };
  /** Pieces knocked down, and those patched since. */
  down: Set<string>;
  patched: Set<string>;
  /** Hits on each corner's top. */
  towerHits: number[];
  roofHits: number;
  pocks: THREE.InstancedMesh;
  pockN: number;
  debris: THREE.InstancedMesh;
  debrisN: number;
  falling: Falling[];
  blazes: Blaze[];
  /** Pieces to bring down in a moment (after the last gun goes quiet). */
  pending: { key: string; t: number }[];
}

export interface FortHooks {
  /** A fort's guns open on you. */
  openFire(f: Fort): void;
  /** A ball of yours struck its guns (or near them). */
  struck(f: Fort, g: Gun, dmg: number, at: THREE.Vector3, direct: boolean): void;
  /** A gun is silenced; `last` when it was the last of them. */
  silenced(f: Fort, g: Gun, last: boolean): void;
  /** Peaceful seas: a captain's side has given it cause (`by` the ship that did it, if a ship did). */
  riled(f: Fort, side: number, by: Ship | null): void;
}

const _l = { x: 0, z: 0 };
const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _col = new THREE.Color();
const _zero = new THREE.Vector3();
const _q2 = new THREE.Quaternion();
const _n = new THREE.Vector3();
const _w = new THREE.Vector3();
const UNIT = new THREE.Vector3(1, 1, 1);
const TINY = new THREE.Vector3(1e-4, 1e-4, 1e-4);
const ZAXIS = new THREE.Vector3(0, 0, 1);
/** The rubble heap's own stone colour (rubbleGeometry), tinted per fort. */
const RUBBLE = new THREE.Color(0xe0d2b2).convertSRGBToLinear();

/**
 * The fort's guns as far as the cannonballs, ships' logs and pirates' memories
 * are concerned: a stand-in that owns the shot, on its own team, never sailing.
 */
function gunnerFor(name: string, at: THREE.Vector3): Ship {
  return {
    id: -1, name, team: 'pirate', pos: at.clone(), vel: new THREE.Vector3(), kills: 0, alive: true, removed: false, ghost: false, battery: true,
    cls: { id: 'fort', name: 'Fort', length: 30, beam: 30 },
  } as unknown as Ship;
}

export class Forts {
  readonly root = new THREE.Group();
  readonly forts: Fort[] = [];
  /**
   * Each fort's guns, carriages and wreckage as its own small instanced set,
   * so the frustum (and the shadow pass's) culls a fort that's out of view:
   * one world-wide set spanned every island and was drawn twice a frame from
   * anywhere on the sea.
   */
  private sets: { barrels: THREE.InstancedMesh; carriages: THREE.InstancedMesh; rubble: THREE.InstancedMesh }[] = [];
  /** The warm-up shows every rubble heap. */
  private rubbleAll = false;
  private all: Gun[] = [];
  private doorGroups: THREE.Group[][] = [];
  private flagGeo: THREE.BufferGeometry | null = null;
  private flagMat: THREE.Material | null = null;
  private height: (x: number, z: number) => number;
  hooks: FortHooks = { openFire: () => {}, struck: () => {}, silenced: () => {}, riled: () => {} };

  constructor(sites: (FortSite & { name: string })[], ground: Ground, mats: ShoreMats) {
    this.root.name = 'forts';
    const M = mats as unknown as Record<Bucket, THREE.Material>;
    this.height = (x, z) => ground.height(x, z);
    const parts = gunParts();
    const rubbleGeo = rubbleGeometry();
    const pockGeo = pockGeometry();
    const blockGeo = blockGeometry();
    sites.forEach((site, i) => {
      const b = new Builder();
      const layout = buildFort(b, site, (x, z) => ground.terrain.heightAt(x, z), 7300 + i * 41);
      const S = layout.style;
      const g = new THREE.Group();
      g.name = `fort-${i}`;
      g.position.set(site.x, site.y, site.z);
      g.rotation.y = site.yaw;
      b.finish(g, M);
      finishDoors(layout.doors, M);
      layout.doors.forEach((d, k) => {
        d.position.set((k ? 1 : -1) * (GATE_W / 2), 0, -S.H + 0.75);
        g.add(d);
      });
      // what a battering knocks down, three ways over
      const shard = (k: 'intact' | 'broken' | 'patch') => {
        const sh = Shards.make(layout.pieces.map((p) => ({ key: p.key, geos: p[k].parts.wood })), M.wood);
        if (sh) g.add(sh.mesh);
        return sh;
      };
      const shards = { intact: shard('intact'), broken: shard('broken'), patch: shard('patch') };
      for (const sh of [shards.broken, shards.patch]) {
        sh?.all(false);
        if (sh) sh.mesh.userData.noLod = true;
      }
      this.root.add(g);
      staticLod.add(g);
      // its plaza and ramp are floor to walk on
      const H = S.H;
      const footY = layout.rampFootY;
      const L = layout.rampLen;
      ground.lifts.push({
        x: site.x,
        z: site.z,
        r: H * 1.5 + L,
        at: (x, z) => {
          const p = worldToFort(site, x, z, _l);
          if (Math.abs(p.x) < H - 0.15 && Math.abs(p.z) < H - 0.15) return site.y;
          if (Math.abs(p.x) < GATE_W / 2 + 0.3 && p.z <= -H + 0.3 && p.z > -H - L) return footY + (site.y - footY) * clamp((p.z + H + L) / L, 0, 1);
          return null;
        },
      });
      const id = `fort:${site.island.name}`;
      const mine = new THREE.Group();
      mine.visible = false;
      this.root.add(mine);
      const reach = fortReach(S);
      // the guns traverse and recoil but never leave the rampart: one sphere round the fort holds them
      const bound = new THREE.Sphere(new THREE.Vector3(site.x, site.y, site.z), reach + 6);
      // the scars and fallen blocks, in the world's frame
      const pocks = new THREE.InstancedMesh(pockGeo, mats.wood, POCKS);
      const debris = new THREE.InstancedMesh(blockGeo, mats.wood, DEBRIS);
      for (const m of [pocks, debris]) {
        for (let k = 0; k < m.instanceMatrix.count; k++) {
          m.setMatrixAt(k, _m.identity());
          m.setColorAt(k, _col.setRGB(1, 1, 1));
        }
        m.count = 0;
        m.boundingSphere = bound;
        m.receiveShadow = true;
        this.root.add(m);
      }
      debris.castShadow = true;
      const f: Fort = {
        id, name: site.name, site, layout, guns: [], owner: 'brethren', gunner: gunnerFor(site.name, new THREE.Vector3(site.x, site.y, site.z)), garrison: null,
        alert: false, quiet: 0, grudge: new Grudge(), doors: 0, up: 0, hoist: 0, mine,
        style: S, corners: corners(S), shards, down: new Set(), patched: new Set(), towerHits: [0, 0, 0, 0], roofHits: 0,
        pocks, pockN: 0, debris, debrisN: 0, falling: [], blazes: [], pending: [],
      };
      const n = Math.max(1, layout.guns.length);
      const set = {
        barrels: new THREE.InstancedMesh(parts.barrel, mats.iron, n),
        carriages: new THREE.InstancedMesh(parts.carriage, mats.wood, n),
        rubble: new THREE.InstancedMesh(rubbleGeo, mats.wood, n),
      };
      for (const m of [set.barrels, set.carriages, set.rubble]) {
        m.castShadow = m.receiveShadow = true;
        for (let i = 0; i < n; i++) {
          m.setMatrixAt(i, _m.identity());
          m.setColorAt(i, _col.setRGB(1, 1, 1));
        }
        m.count = layout.guns.length;
        m.boundingSphere = bound;
        // the battery takes the fort's distance levels too
        m.userData.lodInstanced = true;
        this.root.add(m);
        staticLod.add(m);
      }
      // no gun down yet: no rubble heaps to draw
      set.rubble.count = 0;
      this.sets.push(set);
      layout.guns.forEach((gs, k) => {
        const gun: Gun = {
          fort: f, index: this.all.length, slot: k, base: gs.pos.clone(), yaw0: gs.yaw, yaw: gs.yaw, pitch: 0.02, hp: GUN_HP, dead: false, deadT: 0, reload: 2 + k * 1.3, recoil: 0, shaken: 0, smokeT: 0, target: null, want: -1, wantYaw: gs.yaw,
        };
        f.guns.push(gun);
        this.all.push(gun);
      });
      this.doorGroups.push(layout.doors);
      this.forts.push(f);
    });
    for (const g of this.all) this.pose(g);
    this.flush();
  }

  /** The garrisons for the shore to man, one per fort. */
  garrisons(): Garrison[] {
    return this.forts.map((f) => ({
      site: { island: f.site.island, x: f.site.x, z: f.site.z, yaw: f.site.yaw, y: f.site.y },
      layout: f.layout,
      walls: { x: f.site.x, z: f.site.z, yaw: f.site.yaw, H: f.style.H, T: f.style.T, pad: cornerPad(f.style) },
    }));
  }

  /** Your ship's colours, flown over the forts you hold (her flag's own mesh and material). */
  setColours(ship: Ship | null) {
    const flag = ship?.model.flagPivot.children[0] as THREE.Mesh | undefined;
    this.flagGeo = flag?.geometry ?? null;
    this.flagMat = (flag?.material as THREE.Material | undefined) ?? null;
    for (const f of this.forts) this.dress(f);
  }

  private dress(f: Fort) {
    f.mine.clear();
    if (!this.flagGeo || !this.flagMat) return;
    const m = new THREE.Mesh(this.flagGeo, this.flagMat);
    m.castShadow = true;
    this.flagGeo.computeBoundingBox();
    const w = this.flagGeo.boundingBox!.max.x - this.flagGeo.boundingBox!.min.x || 1;
    m.scale.setScalar(3.9 / w);
    f.mine.add(m);
    this.raise(f);
  }

  /** Who holds what, from the save: yours fly your colours with the gate open; the rest are manned. */
  apply(taken: Record<string, number>) {
    for (const f of this.forts) {
      const ours = f.id in taken;
      f.owner = ours ? 'player' : 'brethren';
      f.gunner.team = ours ? 'player' : 'pirate';
      f.up = ours ? 1 : 0;
      f.hoist = 0;
      f.doors = ours ? 1 : 0;
      f.alert = false;
      for (const g of f.guns) {
        g.dead = false;
        g.hp = GUN_HP;
        g.deadT = 0;
        g.shaken = 0;
        g.recoil = 0;
        g.target = null;
        g.yaw = g.yaw0;
        g.reload = 2 + Math.random() * 3;
        this.pose(g);
      }
      this.mend(f);
      if (ours) this.scarred(f);
      if (f.garrison) {
        const c = f.garrison;
        c.empty = ours;
        if (ours) {
          c.routed = c.opened = true;
          c.alert = false;
          c.flag.visible = false;
          c.strike = 1;
        }
      }
      this.raise(f);
    }
    this.flush();
  }

  /** The fort is yours: her colours are coming down; yours follow them up. */
  conquer(f: Fort) {
    f.owner = 'player';
    f.gunner.team = 'player';
    f.alert = false;
    f.up = 0;
    f.hoist = -2.6; // a beat for theirs to come down first
    for (const g of f.guns) g.target = null;
    this.raise(f);
  }

  private raise(f: Fort) {
    const top = f.layout.flagTop;
    f.mine.visible = f.owner === 'player' && f.mine.children.length > 0;
    const e = f.up * f.up * (3 - 2 * f.up);
    f.mine.position.set(top.x, top.y - (1 - e) * f.layout.flagDrop, top.z);
  }

  // ------------------------------------------------------------------ per frame

  update(dt: number, world: World, player: Ship | null, ships: Ship[], focus: THREE.Vector3) {
    let dirty = false;
    for (const f of this.forts) {
      const near = Math.hypot(f.site.x - focus.x, f.site.z - focus.z);
      // colours flying downwind, going up the staff after a conquest
      f.mine.rotation.y = Math.atan2(-world.wind.dirZ, world.wind.dirX);
      if (f.owner === 'player' && f.up < 1) {
        f.hoist += dt;
        if (f.hoist > 0) f.up = Math.min(1, f.hoist / 3.4);
        this.raise(f);
      }
      // the gate swings open for a sally (or for the new owners)
      const open = f.owner === 'player' || !!f.garrison?.alert || !!f.garrison?.routed ? 1 : 0;
      if (f.doors !== open) {
        f.doors += clamp(open - f.doors, -dt * 0.5, dt * 0.7);
        const k = f.doors * f.doors * (3 - 2 * f.doors);
        for (const d of f.layout.doors) d.rotation.y = -(d.userData.side as number) * k * 1.75;
      }
      // the wreck going on: pieces coming down, blocks tumbling, fires burning
      for (let i = f.pending.length - 1; i >= 0; i--) {
        const q = f.pending[i];
        q.t -= dt;
        if (q.t > 0) continue;
        f.pending.splice(i, 1);
        this.knock(f, q.key, world);
      }
      if (f.falling.length) this.tumble(f, dt, world);
      if (f.blazes.length) this.burn(f, dt, world, near);
      // whom the guns may fire on
      let any = false;
      for (const g of f.guns) {
        if (g.dead) {
          // knocked off her trunnions: she goes over in a moment
          if (g.deadT < 0.7) {
            this.pose(g);
            dirty = true;
          }
          g.deadT += dt;
          if (near < 700) this.smoke(g, dt, world);
          continue;
        }
        g.reload -= dt * (g.shaken > 0 ? 0.55 : 1);
        g.shaken = Math.max(0, g.shaken - dt);
        if (g.recoil > 0) {
          g.recoil = Math.max(0, g.recoil - dt * 0.9);
          dirty = true;
        }
        if (near > 900) {
          g.target = null;
          continue;
        }
        this.pick(g, f, player, ships, world);
        if (g.target) {
          any = true;
          // a mark under its guns keeps the quarrel fresh
          if (f.owner === 'brethren') f.grudge.mark(sideOf(g.target), world.time);
        }
        dirty = this.lay(g, dt) || dirty;
        if (g.target && g.want >= 0 && g.reload <= 0 && Math.abs(angleDelta(g.yaw, g.wantYaw)) < 0.035) this.fire(g, f, world);
      }
      if (any) {
        f.quiet = 0;
        if (!f.alert) {
          f.alert = true;
          if (f.owner === 'brethren') this.hooks.openFire(f);
        }
      } else if (f.alert) {
        f.quiet += dt;
        if (f.quiet > 20) f.alert = false;
      }
    }
    if (dirty) this.flush();
  }

  /** The nearest mark within the gun's arc and reach: you or your escorts for theirs, pirates for yours. */
  private pick(g: Gun, f: Fort, player: Ship | null, ships: Ship[], world: World) {
    const ours = f.owner === 'player';
    // peaceful seas: the Brethren's guns stay quiet for any captain who hasn't given them cause
    const calm = !ours && world.peaceful;
    const now = world.time;
    let best: Ship | null = null;
    let bd = FORT_RANGE;
    const consider = (s: Ship) => {
      if (!s.alive || s.removed || s.prize) return;
      if (calm && !f.grudge.against(s, now)) return;
      const dx = s.pos.x - g.base.x;
      const dz = s.pos.z - g.base.z;
      const d = Math.hypot(dx, dz);
      // a little hysteresis: a gun keeps its mark
      const dd = d - (s === g.target ? 25 : 0);
      if (d > FORT_RANGE || dd >= bd) return;
      if (Math.abs(angleDelta(g.yaw0, Math.atan2(dx, dz))) > ARC) return;
      bd = dd;
      best = s;
    };
    if (ours) {
      for (const s of ships) if (s.team === 'pirate' && !s.ghost) consider(s);
    } else {
      if (player) consider(player);
      for (const s of ships) if (s.team === 'player' && s !== player) consider(s);
    }
    g.target = best;
  }

  /** Lays the gun on its mark: leads her, finds the elevation, and traverses round. Returns true if it moved. */
  private lay(g: Gun, dt: number) {
    const s = g.target;
    const py = g.base.y + GUN_PIVOT;
    let wantPitch = 0.02;
    if (s) {
      let tx = s.pos.x;
      let tz = s.pos.z;
      let e = 0.05;
      const v = SHOT_SPEED;
      g.want = -1;
      for (let it = 0; it < 3; it++) {
        const d = Math.hypot(tx - g.base.x, tz - g.base.z);
        const h = 1.4 - py;
        const v2 = v * v;
        const disc = v2 * v2 - GRAVITY * (GRAVITY * d * d + 2 * h * v2);
        if (disc < 0) break;
        e = Math.atan((v2 - Math.sqrt(disc)) / (GRAVITY * d));
        const tof = d / (v * Math.cos(e));
        tx = s.pos.x + s.vel.x * tof * 0.9;
        tz = s.pos.z + s.vel.z * tof * 0.9;
        g.want = e;
      }
      g.wantYaw = Math.atan2(tx - g.base.x, tz - g.base.z);
      // the embrasure only lets her swing so far
      const off = clamp(angleDelta(g.yaw0, g.wantYaw), -ARC, ARC);
      g.wantYaw = g.yaw0 + off;
      if (g.want >= 0) wantPitch = g.want;
    } else g.wantYaw = g.yaw0;
    const y0 = g.yaw;
    const p0 = g.pitch;
    const dy = angleDelta(g.yaw, g.wantYaw);
    g.yaw += clamp(dy, -TURN * dt, TURN * dt);
    g.pitch += (wantPitch - g.pitch) * damp(2.5, dt);
    const moved = Math.abs(g.yaw - y0) > 1e-5 || Math.abs(g.pitch - p0) > 1e-5;
    if (moved) this.pose(g);
    return moved;
  }

  private muzzle(g: Gun, out: THREE.Vector3) {
    _d.set(Math.sin(g.yaw) * Math.cos(g.pitch), Math.sin(g.pitch), Math.cos(g.yaw) * Math.cos(g.pitch));
    return out.copy(g.base).setY(g.base.y + GUN_PIVOT).addScaledVector(_d, 1.9);
  }

  private fire(g: Gun, f: Fort, world: World) {
    const pos = this.muzzle(g, new THREE.Vector3());
    // gun crews ashore are steady, but no gun is perfect
    const yaw = g.yaw + (Math.random() - 0.5) * 0.042;
    const pitch = g.pitch + (Math.random() - 0.5) * 0.02;
    const v = SHOT_SPEED * (0.985 + Math.random() * 0.03);
    const vel = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(v);
    world.onShot({ pos, vel, owner: f.gunner, damage: SHOT_DAMAGE, trail: 'powder', ammo: 'round' });
    world.particles.muzzle(pos, _d.clone().setY(0).normalize(), _zero, 'powder');
    const [vol, pan, d] = world.soundAt(pos);
    world.audio.cannon(vol, pan, d, 1);
    world.onShake(0.1 * vol, pos);
    g.recoil = 1;
    g.reload = RELOAD + Math.random() * 2.4;
    // the rest of the battery fires in a ragged ripple behind her, not all at once
    for (const o of f.guns) if (o !== g && !o.dead && o.reload < 0.6) o.reload = 0.6 + Math.random() * 1.2;
  }

  /** Smoke from a silenced gun: a fire on the rampart for a while, then a long dark smudge. */
  private smoke(g: Gun, dt: number, world: World) {
    g.smokeT -= dt;
    if (g.smokeT > 0) return;
    g.smokeT = g.deadT < 14 ? 0.12 : g.deadT < 50 ? 0.45 : 1.6;
    const p = _v.copy(g.base).setY(g.base.y + 0.5);
    // her carriage and the powder by her burn a good while
    if (g.deadT < 14) world.particles.flame(p, 0.75 * (1 - g.deadT / 14) + 0.25);
    const w = world.wind;
    world.particles.emit({
      x: p.x + (Math.random() - 0.5) * 1.2, y: p.y + 0.6, z: p.z + (Math.random() - 0.5) * 1.2,
      vx: w.dirX * 1.4, vy: 2.2 + Math.random(), vz: w.dirZ * 1.4,
      life: 5 + Math.random() * 3, size: 1.4, sizeEnd: 7, color: [0.26, 0.24, 0.23], colorEnd: [0.55, 0.54, 0.53], alpha: g.deadT < 40 ? 0.5 : 0.28, drag: 0.25, kind: 1, spin: (Math.random() - 0.5) * 0.4, fadeIn: 0.4,
    });
  }

  // ------------------------------------------------------------------ the gunnery's marks

  /**
   * The guns of hostile forts within reach of `p`, as marks for her gunnery
   * to lay on. A gun stands up on its wall, so each mark is set out past it on
   * the water, where a ball fired flat for that range would arc through it.
   */
  marks(out: { x: number; z: number; r: number; reach?: number; calm?: boolean }[], start: number, p: Ship | null, reach: number, peace: { now: number; riledOnly: boolean } | null = null): number {
    let n = start;
    if (!p || !p.alive) return n;
    const v = p.muzzleSpeed;
    for (const f of this.forts) {
      if (f.owner !== 'brethren' || Math.hypot(f.site.x - p.pos.x, f.site.z - p.pos.z) > FORT_RANGE + 60) continue;
      // peaceful seas: a fort that holds its fire is marked so (and an escort's guns leave it be)
      const calm = !!peace && !f.grudge.against(p, peace.now);
      if (calm && peace!.riledOnly) continue;
      for (const g of f.guns) {
        if (g.dead) continue;
        const dx = g.base.x - p.pos.x;
        const dz = g.base.z - p.pos.z;
        const D = Math.hypot(dx, dz);
        const h = g.base.y + 0.9 - 2;
        const v2 = v * v;
        const disc = v2 * v2 - GRAVITY * (GRAVITY * D * D + 2 * h * v2);
        if (disc < 0 || D < 1) continue;
        const e = Math.atan((v2 - Math.sqrt(disc)) / (GRAVITY * D));
        const flat = (v2 * Math.sin(2 * e)) / GRAVITY;
        // too high and far for her guns' elevation: no lock until she closes
        if (flat > reach * MARK_REACH || e > 0.46) continue;
        if (!out[n]) out[n] = { x: 0, z: 0, r: 0 };
        const m = out[n++];
        m.x = p.pos.x + (dx / D) * flat;
        m.z = p.pos.z + (dz / D) * flat;
        m.r = 3;
        m.reach = MARK_REACH;
        m.calm = calm;
      }
    }
    return n;
  }

  // ------------------------------------------------------------------ shot striking the walls

  /** A cannonball in flight: true if it struck one of the forts (and is spent). */
  strike(b: { pos: THREE.Vector3; vel: THREE.Vector3; damage: number; owner: Ship; ammo: AmmoId }, world: World): boolean {
    for (const f of this.forts) {
      const s = f.site;
      const R = fortReach(f.style) + 1;
      if (Math.abs(b.pos.x - s.x) > R || Math.abs(b.pos.z - s.z) > R) continue;
      if (b.owner === f.gunner) continue;
      const l = worldToFort(s, b.pos.x, b.pos.z, _l);
      const y = b.pos.y - s.y;
      if (y > f.style.WH + f.style.rise + f.style.PH + 4.5) continue;
      // the guns themselves stand up over the parapet: a ball can find one square on its muzzle
      let gun = false;
      for (const g of f.guns) if (_v.copy(g.base).setY(g.base.y + 0.75).distanceToSquared(b.pos) < 1.5 * 1.5) gun = true;
      if (!gun && !fortSolid(f.style, f.corners, l.x, l.z, y, f.layout.ms)) continue;
      this.impact(f, b, world, l.x, l.z, y);
      return true;
    }
    return false;
  }

  private impact(f: Fort, b: { pos: THREE.Vector3; vel: THREE.Vector3; damage: number; owner: Ship; ammo: AmmoId }, world: World, lx: number, lz: number, ly: number) {
    const at = b.pos.clone();
    const s = f.site;
    const shell = b.ammo === 'shell';
    const [vol, pan, dd] = world.soundAt(at);
    if (shell) {
      world.particles.shellBurst(at, false);
      world.audio.shell(vol, pan, dd);
      world.onShake(0.4 * vol * vol, at);
    } else {
      world.particles.sandHit(at);
      // chips of masonry kicked off the face
      for (let i = 0; i < 6; i++) {
        world.particles.emit({
          x: at.x, y: at.y, z: at.z, vx: -b.vel.x * 0.04 + (Math.random() - 0.5) * 5, vy: 2 + Math.random() * 4, vz: -b.vel.z * 0.04 + (Math.random() - 0.5) * 5,
          life: 0.8 + Math.random() * 0.5, size: 0.09 + Math.random() * 0.08, sizeEnd: 0.06, color: [0.86, 0.78, 0.62], alpha: 1, grav: 12, drag: 0.4, kind: 0, fadeIn: 0.01,
        });
      }
      if (b.ammo === 'fire') world.particles.fireHit(at);
      if (b.ammo === 'wraith') world.particles.wraithHit(at);
      if (b.ammo !== 'grape' || Math.random() < 0.3) world.audio.thud(vol, pan, dd);
    }
    // the stone takes its scar, and a block or two comes away down the face
    const j = fortSurface(f.style, f.corners, lx, lz, ly, _w, _n);
    if (b.ammo !== 'grape' && b.ammo !== 'chain' && b.ammo !== 'firework') {
      this.scar(f, _w, _n, shell ? 1.15 : 0.55 + Math.random() * 0.35);
      if (_n.y < 0.5) {
        const wp = fortToWorld(s, _w.x, _w.z, new THREE.Vector3()).setY(s.y + _w.y);
        const wn = _n.clone().applyAxisAngle(_s.set(0, 1, 0), s.yaw);
        for (let i = shell ? 2 : Math.random() < 0.6 ? 1 : 0; i > 0; i--) this.drop(f, wp, wn, 0.7 + Math.random() * 0.6);
      }
    }
    // only your guns (and your escorts') can hurt the Brethren's walls
    if (f.owner !== 'brethren' || b.owner.team !== 'player') return;
    this.rile(f, sideOf(b.owner), world.time, b.owner);
    // a corner's top brought down by steady fire; the barracks fired by a shell or a hot shot in the plaza
    const tj = j >= 0 ? j : cornerAt(f.corners, lx, lz, 1.5);
    if (tj >= 0 && ly > f.corners[tj].top - 3 && b.ammo !== 'grape' && b.ammo !== 'chain') {
      f.towerHits[tj] += shell ? 2 : 1;
      if (f.towerHits[tj] >= TOWER_HITS) this.knock(f, `tower${tj}`, world);
    }
    const PL = f.style.H - f.style.T;
    if (Math.max(Math.abs(lx), Math.abs(lz)) < PL + 0.5 && ly < 4) {
      f.roofHits += b.ammo === 'fire' || shell ? 3 : 1;
      if (f.roofHits >= 3) this.knock(f, 'roof', world);
    }
    const mult = { round: 1, shell: 1.5, fire: 0.75, chain: 0.3, grape: 0.4, firework: 0, wraith: 1 }[b.ammo] ?? 1;
    let near: Gun | null = null;
    let nd = Infinity;
    for (const g of f.guns) {
      if (g.dead) continue;
      const d = _v.copy(g.base).setY(g.base.y + 0.6).distanceTo(at);
      if (d < nd) {
        nd = d;
        near = g;
      }
    }
    if (shell) {
      // the burst catches every gun crew within its reach
      const R = 7;
      for (const g of f.guns) {
        if (g.dead) continue;
        const d = _v.copy(g.base).setY(g.base.y + 0.6).distanceTo(at);
        if (d > R) continue;
        this.hurt(f, g, b.damage * mult * (0.45 + 0.55 * (1 - d / R)), at, d < 3.2, world);
      }
      if (near && nd > R) this.hurt(f, near, b.damage * 0.25, at, false, world);
      return;
    }
    if (!near) return;
    const direct = nd < 3.4;
    // a ball on the masonry well away from a gun shakes her crew and cracks the stonework round her
    const k = direct ? 1 : nd < 12 ? 0.32 : 0.16;
    if ((b.ammo === 'grape' || b.ammo === 'wraith') && nd < 6) near.shaken = 10;
    this.hurt(f, near, b.damage * mult * k, at, direct, world);
  }

  private hurt(f: Fort, g: Gun, dmg: number, at: THREE.Vector3, direct: boolean, world: World) {
    if (g.dead) return;
    g.hp -= dmg;
    this.hooks.struck(f, g, dmg, at, direct);
    // her embrasure caves in round her before she's done
    if (g.hp < GUN_HP * PARAPET_HP) this.knock(f, `gun${g.slot}`, world);
    if (g.hp > 0) return;
    g.hp = 0;
    g.dead = true;
    g.deadT = 0;
    g.target = null;
    const p = g.base.clone().setY(g.base.y + 0.8);
    world.particles.explosion(p, 0.75);
    const [vol, pan, d] = world.soundAt(p);
    world.audio.explosion(vol, pan, d);
    world.onShake(0.5 * vol, p);
    this.pose(g);
    this.flush();
    const last = f.guns.every((o) => o.dead);
    if (last) {
      // the last of them: the seaward towers come down, and the fire takes the barracks
      f.pending.push({ key: 'tower0', t: 1.0 }, { key: 'tower1', t: 2.1 }, { key: 'roof', t: 3.4 });
    }
    this.hooks.silenced(f, g, last);
  }

  // ------------------------------------------------------------------ the wreck

  /** Brings a piece of the fort down (with its dust, falling blocks and fire unless `quiet`). */
  private knock(f: Fort, key: string, world: World | null, quiet = false) {
    if (f.down.has(key)) return;
    const pc = f.layout.pieces.find((p) => p.key === key);
    if (!pc) return;
    f.down.add(key);
    f.shards.intact?.set(key, false);
    f.shards.broken?.set(key, true);
    if (quiet || !world) return;
    const at = fortToWorld(f.site, pc.at.x, pc.at.z, new THREE.Vector3()).setY(f.site.y + pc.at.y);
    const roof = key === 'roof';
    const tower = key.startsWith('tower');
    const big = tower ? 1.5 : roof ? 1.1 : 1;
    // a roar of masonry, a cloud of dust and stone flying
    const [vol, pan, d] = world.soundAt(at);
    world.audio.explosion(vol * (roof ? 0.6 : 0.85), pan, d);
    world.audio.thud(vol, pan, d);
    world.onShake(0.35 * big * vol, at);
    const P = f.style.P;
    const dust: [number, number, number] = [P.cap.r * 1.1, P.cap.g * 1.05, P.cap.b];
    for (let i = 0; i < 9 * big; i++) {
      world.particles.emit({
        x: at.x + (Math.random() - 0.5) * 2.5 * big, y: at.y + Math.random() * 1.5, z: at.z + (Math.random() - 0.5) * 2.5 * big,
        vx: (Math.random() - 0.5) * 3, vy: 0.6 + Math.random() * 2.4, vz: (Math.random() - 0.5) * 3,
        life: 2.4 + Math.random() * 2.2, size: 1.4 * big, sizeEnd: (5 + Math.random() * 3) * big, color: dust, colorEnd: [dust[0] * 0.9, dust[1] * 0.9, dust[2] * 0.9], alpha: 0.6, drag: 1.4, grav: -0.15, spin: (Math.random() - 0.5) * 0.6, kind: 1, fadeIn: 0.04,
      });
    }
    for (let i = 0; i < 16 * big; i++) {
      world.particles.emit({
        x: at.x + (Math.random() - 0.5) * 2, y: at.y + Math.random(), z: at.z + (Math.random() - 0.5) * 2,
        vx: (Math.random() - 0.5) * 9, vy: 2 + Math.random() * 6, vz: (Math.random() - 0.5) * 9,
        life: 1.4 + Math.random() * 1.2, size: 0.16 + Math.random() * 0.22, color: [P.cap.r * 0.9, P.cap.g * 0.9, P.cap.b * 0.85], alpha: 1, grav: 16, drag: 0.3, spin: (Math.random() - 0.5) * 14, kind: 3, fadeIn: 0.001,
      });
    }
    // a few real blocks go over the side
    worldToFort(f.site, at.x, at.z, _l);
    const n = Math.hypot(_l.x, _l.z) > 0.5 ? fortToWorld({ ...f.site, x: 0, z: 0 }, _l.x, _l.z, _n).setY(0).normalize() : _n.set(0, 0, 1);
    if (!roof) for (let i = 0; i < (tower ? 4 : 2); i++) this.drop(f, at, n, 0.8 + Math.random() * 0.7);
    // and it burns
    f.blazes.push({ at: at.clone().setY(at.y - (roof ? 0.4 : 0.6)), t: 0, flames: roof ? 46 : tower ? 12 : 6, smoke: roof ? 150 : 70, size: roof ? 1.25 : 0.9, acc: 0 });
    if (roof) for (const r of f.layout.roofAt) if (r !== f.layout.roofAt[1]) f.blazes.push({ at: fortToWorld(f.site, r.x, r.z, new THREE.Vector3()).setY(f.site.y + r.y - 0.4), t: -2 - Math.random() * 4, flames: 40, smoke: 120, size: 1.1, acc: 0 });
  }

  /** A ball's scar on the stone (world point and outward normal). */
  private scar(f: Fort, at: THREE.Vector3, n: THREE.Vector3, size: number) {
    const k = f.pockN++ % POCKS;
    // the scar's +z along the face's outward normal, turned to the world, spun at random
    _d.copy(n).applyAxisAngle(_s.set(0, 1, 0), f.site.yaw).normalize();
    _q.setFromUnitVectors(ZAXIS, _d);
    _q2.setFromAxisAngle(ZAXIS, Math.random() * Math.PI * 2);
    _q.multiply(_q2);
    fortToWorld(f.site, at.x, at.z, _v).setY(f.site.y + at.y);
    f.pocks.setMatrixAt(k, _m.compose(_v, _q, _s.set(size, size, 1)));
    f.pocks.setColorAt(k, _col.copy(f.style.P.stone).multiplyScalar(0.95 + Math.random() * 0.1));
    f.pocks.count = Math.min(POCKS, f.pockN);
    f.pocks.instanceMatrix.needsUpdate = true;
    if (f.pocks.instanceColor) f.pocks.instanceColor.needsUpdate = true;
  }

  /** A block knocked loose at `at` (world) to tumble down the face, thrown out along `n`. */
  private drop(f: Fort, at: THREE.Vector3, n: THREE.Vector3, s: number) {
    if (f.falling.length > 10) return;
    const p = at.clone();
    const out = n.clone();
    out.y = 0;
    if (out.lengthSq() < 1e-4) out.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    out.normalize();
    p.addScaledVector(out, 0.5);
    const v = out.multiplyScalar(1.2 + Math.random() * 2.2);
    v.x += (Math.random() - 0.5) * 1.5;
    v.z += (Math.random() - 0.5) * 1.5;
    v.y = 1 + Math.random() * 2;
    const slot = f.debrisN++ % DEBRIS;
    // a block that was already lying here makes way
    for (let i = f.falling.length - 1; i >= 0; i--) if (f.falling[i].slot === slot) f.falling.splice(i, 1);
    f.falling.push({ slot, p, v, rot: new THREE.Euler(Math.random() * 3, Math.random() * 3, 0), spin: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 9), s, wet: p.y < 0 });
    f.debris.setColorAt(slot, _col.copy(f.style.P.stone).multiplyScalar(0.72 + Math.random() * 0.3));
    f.debris.count = Math.min(DEBRIS, f.debrisN);
    if (f.debris.instanceColor) f.debris.instanceColor.needsUpdate = true;
  }

  private tumble(f: Fort, dt: number, world: World) {
    for (let i = f.falling.length - 1; i >= 0; i--) {
      const b = f.falling[i];
      b.v.y -= 15 * dt;
      b.p.addScaledVector(b.v, dt);
      b.rot.x += b.spin.x * dt;
      b.rot.y += b.spin.y * dt;
      b.rot.z += b.spin.z * dt;
      // into the sea: a splash, then down slowly to the bottom
      if (!b.wet && b.p.y < 0 && this.height(b.p.x, b.p.z) < -0.2) {
        b.wet = true;
        world.particles.splash(_v.set(b.p.x, 0, b.p.z), 0.45 * b.s);
        b.v.multiplyScalar(0.25);
      }
      const floor = Math.max(this.height(b.p.x, b.p.z), -8) + 0.22 * b.s;
      let done = false;
      if (b.p.y <= floor) {
        b.p.y = floor;
        if (b.v.y < -3 && !b.wet) {
          // a bounce, with a puff of dust
          b.v.y *= -0.32;
          b.v.x *= 0.5;
          b.v.z *= 0.5;
          b.spin.multiplyScalar(0.5);
          world.particles.emit({ x: b.p.x, y: b.p.y, z: b.p.z, vy: 0.8, life: 1.2, size: 0.5, sizeEnd: 1.8, color: [0.8, 0.74, 0.62], alpha: 0.45, drag: 2, kind: 1, fadeIn: 0.02 });
        } else {
          // settled: lay it flat-ish where it stopped
          b.rot.x = Math.round(b.rot.x / Math.PI) * Math.PI + (Math.random() - 0.5) * 0.3;
          b.rot.z = Math.round(b.rot.z / Math.PI) * Math.PI + (Math.random() - 0.5) * 0.3;
          done = true;
        }
      }
      _q.setFromEuler(b.rot);
      f.debris.setMatrixAt(b.slot, _m.compose(b.p, _q, _s.setScalar(b.s)));
      if (done) f.falling.splice(i, 1);
    }
    f.debris.instanceMatrix.needsUpdate = true;
  }

  private burn(f: Fort, dt: number, world: World, near: number) {
    for (let i = f.blazes.length - 1; i >= 0; i--) {
      const z = f.blazes[i];
      z.t += dt;
      if (z.t > z.flames + z.smoke) {
        f.blazes.splice(i, 1);
        continue;
      }
      if (z.t < 0 || near > 750) continue;
      z.acc += dt;
      const flaming = z.t < z.flames;
      const rate = flaming ? 0.09 : z.t < z.flames + z.smoke * 0.4 ? 0.5 : 1.3;
      while (z.acc > rate) {
        z.acc -= rate;
        const k = flaming ? Math.min(1, z.t / 2) * (1 - (z.t / z.flames) * 0.5) : 0;
        if (flaming) world.particles.flame(_v.copy(z.at), z.size * (0.6 + k * 0.6));
        else {
          const w = world.wind;
          world.particles.emit({
            x: z.at.x + (Math.random() - 0.5) * 1.4, y: z.at.y + 0.5, z: z.at.z + (Math.random() - 0.5) * 1.4,
            vx: w.dirX * 1.2, vy: 1.8 + Math.random(), vz: w.dirZ * 1.2,
            life: 5 + Math.random() * 3, size: 1.2 * z.size, sizeEnd: 6.5 * z.size, color: [0.24, 0.22, 0.21], colorEnd: [0.55, 0.54, 0.53], alpha: 0.4 * (1 - (z.t - z.flames) / z.smoke) + 0.08, drag: 0.25, kind: 1, spin: (Math.random() - 0.5) * 0.4, fadeIn: 0.4,
          });
        }
      }
    }
  }

  /** Every piece whole again, the scars and fallen blocks gone (a fresh voyage). */
  private mend(f: Fort) {
    f.down.clear();
    f.patched.clear();
    f.shards.intact?.all(true);
    f.shards.broken?.all(false);
    f.shards.patch?.all(false);
    f.towerHits.fill(0);
    f.roofHits = 0;
    f.pockN = f.debrisN = 0;
    f.pocks.count = f.debris.count = 0;
    f.falling.length = 0;
    f.blazes.length = 0;
    f.pending.length = 0;
  }

  /**
   * A fort that's yours, as you left it: its guns remounted behind gabions and
   * plank mantlets where the parapet came down, the seaward towers still
   * broken, its face pocked where your shot went home.
   */
  private scarred(f: Fort) {
    for (const p of f.layout.pieces) {
      if (p.key === 'roof') continue;
      if (p.key.startsWith('gun') || p.key === 'tower0' || p.key === 'tower1') this.knock(f, p.key, null, true);
      if (p.key.startsWith('gun')) {
        f.shards.patch?.set(p.key, true);
        f.patched.add(p.key);
      }
    }
    const rnd = mulberry32(this.forts.indexOf(f) * 131 + 7);
    const S = f.style;
    for (let i = 0; i < 16; i++) {
      // most on the sea wall, the rest on the flanks toward the sea
      const side = rnd() < 0.6 ? 0 : rnd() < 0.5 ? 1 : 3;
      const u = (rnd() - 0.5) * 2 * (S.H - 3);
      const y = S.WH * (0.2 + rnd() * 0.75);
      const v = S.H - 0.3;
      const [x, z] = side === 0 ? [u, v] : side === 1 ? [v, rnd() * S.H * 0.8] : [-v, rnd() * S.H * 0.8];
      fortSurface(S, f.corners, x, z, y, _w, _n);
      this.scar(f, _w, _n, 0.55 + rnd() * 0.45);
    }
  }

  // ------------------------------------------------------------------ drawing the guns

  private pose(g: Gun) {
    const i = g.slot;
    const { barrels, carriages, rubble } = this.sets[this.forts.indexOf(g.fort)];
    if (g.dead) {
      // the barrel knocked off its trunnions and lying across the wrecked carriage: over she goes, with a bounce
      const t = clamp(g.deadT / 0.55, 0, 1);
      const k = t < 0.75 ? (t / 0.75) ** 2 : 1 - Math.sin(((t - 0.75) / 0.25) * Math.PI) * 0.12;
      _e.set(-g.pitch, g.yaw, 0);
      _q2.setFromEuler(_e);
      _e.set(-0.3, g.yaw + 0.6, 0.45);
      _q.setFromEuler(_e);
      _q.copy(_q2.slerp(_q, k));
      _v.copy(g.base).setY(g.base.y + GUN_PIVOT + (0.32 - GUN_PIVOT) * k);
      barrels.setMatrixAt(i, _m.compose(_v, _q, UNIT));
      barrels.setColorAt(i, _col.setRGB(1 - 0.58 * t, 1 - 0.62 * t, 1 - 0.66 * t));
      _q2.setFromAxisAngle(_d.set(0, 1, 0), g.yaw);
      _e.set(0.1, g.yaw - 0.3, 0.38);
      _q.setFromEuler(_e);
      _q.copy(_q2.slerp(_q, k));
      _v.copy(g.base).setY(g.base.y + GUN_PIVOT + (-0.1 - GUN_PIVOT) * k);
      carriages.setMatrixAt(i, _m.compose(_v, _q, UNIT));
      carriages.setColorAt(i, _col.setRGB(1 - 0.7 * t, 1 - 0.73 * t, 1 - 0.75 * t));
      _q.setFromAxisAngle(_d.set(0, 1, 0), g.yaw0);
      rubble.setMatrixAt(i, _m.compose(g.base, _q, _s.setScalar(Math.max(1e-4, k))));
      // its masonry is the fort's own stone
      const P = g.fort.style.P.cap;
      rubble.setColorAt(i, _col.setRGB(P.r / RUBBLE.r, P.g / RUBBLE.g, P.b / RUBBLE.b));
      return;
    }
    const back = g.recoil > 0 ? Math.sin(Math.min(1, g.recoil) * Math.PI * 0.5) * 0.45 : 0;
    _e.set(-g.pitch, g.yaw, 0);
    _q.setFromEuler(_e);
    _d.set(Math.sin(g.yaw), 0, Math.cos(g.yaw));
    _v.copy(g.base).setY(g.base.y + GUN_PIVOT).addScaledVector(_d, -back);
    barrels.setMatrixAt(i, _m.compose(_v, _q, UNIT));
    barrels.setColorAt(i, _col.setRGB(1, 1, 1));
    _q.setFromAxisAngle(_s.set(0, 1, 0), g.yaw);
    _v.copy(g.base).setY(g.base.y + GUN_PIVOT).addScaledVector(_d, -back * 0.8);
    carriages.setMatrixAt(i, _m.compose(_v, _q, UNIT));
    carriages.setColorAt(i, _col.setRGB(1, 1, 1));
    rubble.setMatrixAt(i, _m.compose(g.base, _q, TINY));
  }

  private flush() {
    // a rubble heap stands only where a gun is down (the warm-up draws them all)
    const heaps = this.sets.map(() => 0);
    for (const g of this.all) if (g.dead || this.rubbleAll) heaps[this.forts.indexOf(g.fort)] = Math.max(heaps[this.forts.indexOf(g.fort)], g.slot + 1);
    this.sets.forEach((set, i) => (set.rubble.count = heaps[i]));
    for (const set of this.sets) {
      for (const m of [set.barrels, set.carriages, set.rubble]) {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    }
  }

  /** Show every wreck and colour for the warm-up's draw (so their programs compile up front). */
  warm() {
    for (const f of this.forts) {
      f.mine.visible = f.mine.children.length > 0;
      for (const sh of [f.shards.intact, f.shards.broken, f.shards.patch]) sh?.all(true);
      // a scar and a block, so their draws are in the warm-up too
      for (const m of [f.pocks, f.debris]) {
        m.setMatrixAt(0, _m.compose(_v.set(f.site.x, f.site.y + 1, f.site.z), _q.identity(), UNIT));
        m.count = 1;
        m.instanceMatrix.needsUpdate = true;
      }
    }
    for (const g of this.all) this.sets[this.forts.indexOf(g.fort)].rubble.setMatrixAt(g.slot, _m.compose(g.base, _q.identity(), UNIT));
    this.rubbleAll = true;
    this.flush();
  }

  unwarm() {
    for (const f of this.forts) {
      this.raise(f);
      for (const p of f.layout.pieces) {
        f.shards.intact?.set(p.key, !f.down.has(p.key));
        f.shards.broken?.set(p.key, f.down.has(p.key));
        f.shards.patch?.set(p.key, f.patched.has(p.key));
      }
      f.pocks.count = Math.min(POCKS, f.pockN);
      f.debris.count = Math.min(DEBRIS, f.debrisN);
    }
    this.rubbleAll = false;
    for (const g of this.all) this.pose(g);
    this.flush();
  }

  // ------------------------------------------------------------------ questions the game asks

  /** Peaceful seas: captain `side` has given the fort cause to fight (a ball on its walls, a blow on its garrison, a shot at a ship under its guns). */
  rile(f: Fort, side: number, now: number, by: Ship | null = null) {
    if (f.owner !== 'brethren') return;
    const fresh = !f.grudge.holds(side, now);
    f.grudge.mark(side, now);
    if (fresh) this.hooks.riled(f, side, by);
  }

  byGunner(s: Ship | null): Fort | null {
    return s ? (this.forts.find((f) => f.gunner === s) ?? null) : null;
  }

  /** The hostile fort whose live guns reach (x, z), if any (with `calm`, peaceful seas: only one at war with that captain). */
  covering(x: number, z: number, calm: { side: number; now: number } | null = null): Fort | null {
    for (const f of this.forts) {
      if (f.owner !== 'brethren' || f.guns.every((g) => g.dead)) continue;
      // peaceful seas: a fort that holds its fire covers nothing
      if (calm && !f.grudge.holds(calm.side, calm.now)) continue;
      if (f.guns.some((g) => !g.dead && Math.hypot(g.base.x - x, g.base.z - z) < FORT_RANGE - 20)) return f;
    }
    return null;
  }

  /** The fort nearest (x, z) within its bar's range. */
  nearest(x: number, z: number, r = SHOW_RANGE): Fort | null {
    let best: Fort | null = null;
    let bd = r;
    for (const f of this.forts) {
      const d = Math.hypot(f.site.x - x, f.site.z - z);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return best;
  }

  /** A fort of yours near enough to pay tribute or patch her up. */
  havenNear(x: number, z: number, r = HAVEN_R): Fort | null {
    for (const f of this.forts) if (f.owner === 'player' && f.up >= 1 && Math.hypot(f.site.x - x, f.site.z - z) < r) return f;
    return null;
  }

  collectRange(f: Fort, x: number, z: number) {
    return f.owner === 'player' && Math.hypot(f.site.x - x, f.site.z - z) < COLLECT_R;
  }

  /** A hostile fort that's firing on you right now, for the camera to keep in frame. */
  engaging(x: number, z: number, calm: { side: number; now: number } | null = null): Fort | null {
    for (const f of this.forts) {
      if (f.owner !== 'brethren' || !f.alert || !f.guns.some((g) => g.target) || Math.hypot(f.site.x - x, f.site.z - z) >= FORT_RANGE + 40) continue;
      // peaceful seas: only a fort at war with this captain (not one trading shot with another)
      if (calm && !f.grudge.holds(calm.side, calm.now)) continue;
      return f;
    }
    return null;
  }

  liveGuns(f: Fort) {
    return f.guns.reduce((n, g) => n + (g.dead ? 0 : 1), 0);
  }

  gunHp(f: Fort) {
    return f.guns.reduce((n, g) => n + g.hp, 0) / (f.guns.length * GUN_HP);
  }

  /** Where the fort's gate is (world), to steer a landing party by. */
  gate(f: Fort, out = new THREE.Vector3()) {
    return fortToWorld(f.site, 0, -f.style.H - 2, out);
  }
}
