import * as THREE from 'three';
import { angleDelta, clamp, damp } from '../core/noise';
import { progressSaved } from '../core/progress';
import { Bucket, Builder } from '../port/port';
import type { Ship } from '../ships/ship';
import type { Camp, Garrison } from '../shore/shore';
import { Ground } from '../shore/ground';
import { ShoreMats } from '../shore/kit';
import {
  buildFort, finishDoors, FORT_H, FORT_T, FORT_WH, FortLayout, FortSite, fortToWorld, GATE_W, GUN_PIVOT, gunParts, rubbleGeometry, worldToFort,
} from '../shore/fortKit';
import type { AmmoId } from './ammo';
import type { World } from './world';

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
  if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, n] of Object.entries(v)) if (Number.isFinite(Number(n))) out[k] = Number(n);
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
  /** Gate doors: 0 shut .. 1 swung open. */
  doors: number;
  /** Your colours: 0 at the foot of the staff .. 1 at the truck, and whether they're going up. */
  up: number;
  hoist: number;
  mine: THREE.Group;
}

export interface FortHooks {
  /** A fort's guns open on you. */
  openFire(f: Fort): void;
  /** A ball of yours struck its guns (or near them). */
  struck(f: Fort, g: Gun, dmg: number, at: THREE.Vector3, direct: boolean): void;
  /** A gun is silenced; `last` when it was the last of them. */
  silenced(f: Fort, g: Gun, last: boolean): void;
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
const UNIT = new THREE.Vector3(1, 1, 1);
const TINY = new THREE.Vector3(1e-4, 1e-4, 1e-4);

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
  private all: Gun[] = [];
  private doorGroups: THREE.Group[][] = [];
  private flagGeo: THREE.BufferGeometry | null = null;
  private flagMat: THREE.Material | null = null;
  hooks: FortHooks = { openFire: () => {}, struck: () => {}, silenced: () => {} };

  constructor(sites: (FortSite & { name: string })[], ground: Ground, mats: ShoreMats) {
    this.root.name = 'forts';
    const M = mats as unknown as Record<Bucket, THREE.Material>;
    const parts = gunParts();
    const rubbleGeo = rubbleGeometry();
    sites.forEach((site, i) => {
      const b = new Builder();
      const layout = buildFort(b, site, (x, z) => ground.terrain.heightAt(x, z), 7300 + i * 41);
      const g = new THREE.Group();
      g.name = `fort-${i}`;
      g.position.set(site.x, site.y, site.z);
      g.rotation.y = site.yaw;
      b.finish(g, M);
      finishDoors(layout.doors, M);
      layout.doors.forEach((d, k) => {
        d.position.set((k ? 1 : -1) * (GATE_W / 2), 0, -FORT_H + 0.75);
        g.add(d);
      });
      this.root.add(g);
      // its plaza and ramp are floor to walk on
      const H = FORT_H;
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
      const f: Fort = {
        id, name: site.name, site, layout, guns: [], owner: 'brethren', gunner: gunnerFor(site.name, new THREE.Vector3(site.x, site.y, site.z)), garrison: null,
        alert: false, quiet: 0, doors: 0, up: 0, hoist: 0, mine,
      };
      const n = Math.max(1, layout.guns.length);
      const set = {
        barrels: new THREE.InstancedMesh(parts.barrel, mats.iron, n),
        carriages: new THREE.InstancedMesh(parts.carriage, mats.wood, n),
        rubble: new THREE.InstancedMesh(rubbleGeo, mats.wood, n),
      };
      // the guns traverse and recoil but never leave the rampart: one sphere round the fort holds them
      const bound = new THREE.Sphere(new THREE.Vector3(site.x, site.y, site.z), FORT_H * 1.6 + 4);
      for (const m of [set.barrels, set.carriages, set.rubble]) {
        m.castShadow = m.receiveShadow = true;
        for (let i = 0; i < n; i++) {
          m.setMatrixAt(i, _m.identity());
          m.setColorAt(i, _col.setRGB(1, 1, 1));
        }
        m.count = layout.guns.length;
        m.boundingSphere = bound;
        this.root.add(m);
      }
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
      walls: { x: f.site.x, z: f.site.z, yaw: f.site.yaw, H: FORT_H, T: FORT_T },
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
      // whom the guns may fire on
      let any = false;
      for (const g of f.guns) {
        if (g.dead) {
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
        this.pick(g, f, player, ships);
        if (g.target) any = true;
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
  private pick(g: Gun, f: Fort, player: Ship | null, ships: Ship[]) {
    const ours = f.owner === 'player';
    let best: Ship | null = null;
    let bd = FORT_RANGE;
    const consider = (s: Ship) => {
      if (!s.alive || s.removed || s.prize) return;
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
    g.smokeT = g.deadT < 8 ? 0.12 : g.deadT < 40 ? 0.45 : 1.6;
    const p = _v.copy(g.base).setY(g.base.y + 0.5);
    if (g.deadT < 7) world.particles.flame(p, 0.6 * (1 - g.deadT / 7) + 0.2);
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
  marks(out: { x: number; z: number; r: number; reach?: number }[], start: number, p: Ship | null, reach: number): number {
    let n = start;
    if (!p || !p.alive) return n;
    const v = p.muzzleSpeed;
    for (const f of this.forts) {
      if (f.owner !== 'brethren' || Math.hypot(f.site.x - p.pos.x, f.site.z - p.pos.z) > FORT_RANGE + 60) continue;
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
      }
    }
    return n;
  }

  // ------------------------------------------------------------------ shot striking the walls

  /** A cannonball in flight: true if it struck one of the forts (and is spent). */
  strike(b: { pos: THREE.Vector3; vel: THREE.Vector3; damage: number; owner: Ship; ammo: AmmoId }, world: World): boolean {
    for (const f of this.forts) {
      const s = f.site;
      if (Math.abs(b.pos.x - s.x) > FORT_H * 1.6 || Math.abs(b.pos.z - s.z) > FORT_H * 1.6) continue;
      if (b.owner === f.gunner) continue;
      const l = worldToFort(s, b.pos.x, b.pos.z, _l);
      const y = b.pos.y - s.y;
      if (y > FORT_WH + 3.2) continue;
      // the guns themselves stand up over the parapet: a ball can find one square on its muzzle
      let gun = false;
      for (const g of f.guns) if (_v.copy(g.base).setY(g.base.y + 0.75).distanceToSquared(b.pos) < 1.5 * 1.5) gun = true;
      if (!gun && !this.solid(l.x, l.z, y)) continue;
      this.impact(f, b, world);
      return true;
    }
    return false;
  }

  /** Is there stone at this point of a fort (fort frame, y above the plaza)? */
  private solid(x: number, z: number, y: number) {
    const H = FORT_H;
    const ax = Math.abs(x);
    const az = Math.abs(z);
    // the corner bastions and their garitas
    const tr = Math.hypot(ax - (H - 0.7), az - (H - 0.7));
    if (tr < 3.3 && y < FORT_WH + 1.25) return true;
    if (tr < 1.2 && y < FORT_WH + 3.6) return true;
    const m = Math.max(ax, az);
    // the walls, their parapets on the outer edge and the battered foot
    const face = y < FORT_WH * 0.45 ? H + (FORT_WH * 0.45 - y) * 0.18 : H;
    if (m < face + 0.15 && m > H - FORT_T - 0.1) {
      if (y < FORT_WH) return true;
      if (y < FORT_WH + 1.25 && m > H - 1.05) return true;
      return false;
    }
    // the plaza floor
    return m <= H - FORT_T && y < 0.15;
  }

  private impact(f: Fort, b: { pos: THREE.Vector3; vel: THREE.Vector3; damage: number; owner: Ship; ammo: AmmoId }, world: World) {
    const at = b.pos.clone();
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
    // only your guns (and your escorts') can hurt the Brethren's walls
    if (f.owner !== 'brethren' || b.owner.team !== 'player') return;
    const mult = { round: 1, shell: 1.5, fire: 0.75, chain: 0.3, grape: 0.4, wraith: 1 }[b.ammo] ?? 1;
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
    this.hooks.silenced(f, g, f.guns.every((o) => o.dead));
  }

  // ------------------------------------------------------------------ drawing the guns

  private pose(g: Gun) {
    const i = g.slot;
    const { barrels, carriages, rubble } = this.sets[this.forts.indexOf(g.fort)];
    if (g.dead) {
      // the barrel knocked off its trunnions and lying across the wrecked carriage
      _e.set(-0.3, g.yaw + 0.6, 0.45);
      _q.setFromEuler(_e);
      _v.copy(g.base).setY(g.base.y + 0.32);
      barrels.setMatrixAt(i, _m.compose(_v, _q, UNIT));
      barrels.setColorAt(i, _col.setRGB(0.42, 0.38, 0.34));
      _e.set(0.1, g.yaw - 0.3, 0.38);
      _q.setFromEuler(_e);
      _v.copy(g.base).setY(g.base.y - 0.1);
      carriages.setMatrixAt(i, _m.compose(_v, _q, UNIT));
      carriages.setColorAt(i, _col.setRGB(0.3, 0.27, 0.25));
      _q.setFromAxisAngle(_d.set(0, 1, 0), g.yaw0);
      rubble.setMatrixAt(i, _m.compose(g.base, _q, UNIT));
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
    for (const set of this.sets) {
      for (const m of [set.barrels, set.carriages, set.rubble]) {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    }
  }

  /** Show every wreck and colour for the warm-up's draw (so their programs compile up front). */
  warm() {
    for (const f of this.forts) f.mine.visible = f.mine.children.length > 0;
    for (const g of this.all) this.sets[this.forts.indexOf(g.fort)].rubble.setMatrixAt(g.slot, _m.compose(g.base, _q.identity(), UNIT));
    this.flush();
  }

  unwarm() {
    for (const f of this.forts) this.raise(f);
    for (const g of this.all) this.pose(g);
    this.flush();
  }

  // ------------------------------------------------------------------ questions the game asks

  byGunner(s: Ship | null): Fort | null {
    return s ? (this.forts.find((f) => f.gunner === s) ?? null) : null;
  }

  /** The hostile fort whose live guns reach (x, z), if any. */
  covering(x: number, z: number): Fort | null {
    for (const f of this.forts) {
      if (f.owner !== 'brethren' || f.guns.every((g) => g.dead)) continue;
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
  engaging(x: number, z: number): Fort | null {
    for (const f of this.forts) if (f.owner === 'brethren' && f.alert && f.guns.some((g) => g.target) && Math.hypot(f.site.x - x, f.site.z - z) < FORT_RANGE + 40) return f;
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
    return fortToWorld(f.site, 0, -FORT_H - 2, out);
  }
}
