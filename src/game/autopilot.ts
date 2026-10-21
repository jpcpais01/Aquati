// The helmsman: pick a spot on the sea chart (a pin, a port, an isle, a fort,
// the X of a treasure map), give the word, and he sails her there himself.
//
// The course is planned once, on a coarse grid laid over the waters between
// the ship and her goal: land, shoals too shallow for her keel, living coral
// and every maelstrom's pull are struck out, the rest is costed by how close it
// runs to danger, and A* finds the cheapest way through. The grid path is then
// pulled taut into a few long legs. While she sails only the leg in hand is
// looked at: a lookahead point along it to steer for, a corner ahead to shorten
// sail for, and, when a leg runs into the eye of the wind, a beat to windward
// in long boards inside the clear water either side of it. The plan is only
// redone when she's been pushed well off it or stops making way.

import { angleDelta, clamp, smoothstep } from '../core/noise';
import { windFactor, type Ship } from '../ships/ship';
import { EDGE_R, HIGH_SEAS_R, nearestRegion, REGION_R, REGIONS, seaEdge } from '../world/regions';
import type { SeaFloor } from '../world/terrain';

export type HelmTargetKind = 'pin' | 'port' | 'isle' | 'fort' | 'treasure';

/** Somewhere the captain asked to be taken. */
export interface HelmTarget {
  kind: HelmTargetKind;
  name: string;
  x: number;
  z: number;
  /** A waypoint's id: she's arrived once the pin is struck off. */
  pin?: number;
  /** Where she can lie off it (a port's quay face, an isle's shore); the spot itself when unset. */
  aimX?: number;
  aimZ?: number;
  /** Arrived as soon as this holds (a port: within reach of the quay). */
  reach?: (x: number, z: number) => boolean;
}

export type HelmState = 'idle' | 'sailing' | 'arrived';

/** What the HUD shows of the helmsman's work. */
export interface HelmView {
  target: HelmTarget;
  /** Metres still to sail, along the course. */
  left: number;
  /** 0..1 of the course behind her. */
  done: number;
  /** Seconds to go at her recent speed, or -1 while she's barely moving. */
  eta: number;
  /** How she's sailing: "Running before the wind", "Beating to windward"… */
  how: string;
  arrived: boolean;
}

interface Hull {
  pos: { x: number; z: number };
  alive: boolean;
}

/** The whole known sea, as the chart frames it. */
const SEA = {
  x0: Math.min(...REGIONS.map((r) => r.x)) - EDGE_R,
  x1: Math.max(...REGIONS.map((r) => r.x)) + EDGE_R,
  z0: Math.min(...REGIONS.map((r) => r.z)) - EDGE_R,
  z1: Math.max(...REGIONS.map((r) => r.z)) + EDGE_R,
};
/** Most cells a plan may lay down: the grid coarsens past this. */
const MAX_CELLS = 150_000;
const DEG = Math.PI / 180;
/** Off the eye of the wind a beat sails each board (relative to downwind, ~132°: the best way made good to windward). */
const TACK = 48 * DEG;
/** A leg closer than this to the eye of the wind is beaten up in boards. */
const BEAT_WITHIN = 40 * DEG;

/** The planning grid: blocked cells and each cell's clearance (m) from the nearest. */
class NavGrid {
  readonly nx: number;
  readonly nz: number;
  readonly blocked: Uint8Array;
  readonly clear: Float32Array;

  constructor(
    readonly x0: number,
    readonly z0: number,
    readonly cell: number,
    w: number,
    h: number,
    floor: SeaFloor,
    draft: number,
    vortices: { x: number; z: number; r: number }[],
  ) {
    const nx = (this.nx = Math.max(2, Math.ceil(w / cell)));
    const nz = (this.nz = Math.max(2, Math.ceil(h / cell)));
    const N = nx * nz;
    const B = (this.blocked = new Uint8Array(N));
    const shoal = -(draft + 1.0);
    const coral = -(draft + 2.6);
    const e = cell * 0.35;
    const near2 = (REGION_R + 160) ** 2;
    // the edge of the known sea lies at least EDGE_R from every archipelago's middle
    const edge2 = (EDGE_R - 90) ** 2;
    const vr2 = vortices.map((m) => m.r * m.r);
    for (let j = 0; j < nz; j++) {
      const z = z0 + (j + 0.5) * cell;
      for (let i = 0; i < nx; i++) {
        const x = x0 + (i + 0.5) * cell;
        const k = j * nx + i;
        let d2 = Infinity;
        for (const r of REGIONS) d2 = Math.min(d2, (r.x - x) ** 2 + (r.z - z) ** 2);
        // the swell turns you back at the edge of the known sea
        if (d2 > edge2 && seaEdge(x, z) > -70) {
          B[k] = 1;
          continue;
        }
        // the high seas are deep water all the way: only an archipelago's waters need sounding
        if (d2 > near2) continue;
        let v = false;
        for (let m = 0; m < vortices.length; m++) {
          if ((vortices[m].x - x) ** 2 + (vortices[m].z - z) ** 2 < vr2[m]) {
            v = true;
            break;
          }
        }
        if (v) {
          B[k] = 1;
          continue;
        }
        // the shoalest of five soundings, so a thin spit or sandbar isn't slipped between
        const h = Math.max(floor.heightAt(x, z), floor.heightAt(x - e, z - e), floor.heightAt(x + e, z - e), floor.heightAt(x - e, z + e), floor.heightAt(x + e, z + e));
        if (h > shoal || (h > coral && floor.reefAt(x, z) > 0.22)) B[k] = 1;
      }
    }
    // clearance: a two-pass chamfer distance transform, in metres
    const D = (this.clear = new Float32Array(N));
    const a = cell;
    const d = cell * Math.SQRT2;
    for (let k = 0; k < N; k++) D[k] = B[k] ? 0 : 1e9;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        let v = D[k];
        if (!v) continue;
        if (i > 0) v = Math.min(v, D[k - 1] + a);
        if (j > 0) {
          v = Math.min(v, D[k - nx] + a);
          if (i > 0) v = Math.min(v, D[k - nx - 1] + d);
          if (i < nx - 1) v = Math.min(v, D[k - nx + 1] + d);
        }
        D[k] = v;
      }
    }
    for (let j = nz - 1; j >= 0; j--) {
      for (let i = nx - 1; i >= 0; i--) {
        const k = j * nx + i;
        let v = D[k];
        if (!v) continue;
        if (i < nx - 1) v = Math.min(v, D[k + 1] + a);
        if (j < nz - 1) {
          v = Math.min(v, D[k + nx] + a);
          if (i < nx - 1) v = Math.min(v, D[k + nx + 1] + d);
          if (i > 0) v = Math.min(v, D[k + nx - 1] + d);
        }
        D[k] = v;
      }
    }
  }

  contains(x: number, z: number) {
    return x >= this.x0 && z >= this.z0 && x < this.x0 + this.nx * this.cell && z < this.z0 + this.nz * this.cell;
  }

  index(x: number, z: number) {
    const i = clamp(Math.floor((x - this.x0) / this.cell), 0, this.nx - 1);
    const j = clamp(Math.floor((z - this.z0) / this.cell), 0, this.nz - 1);
    return j * this.nx + i;
  }

  /** Clearance at a point; open water off the grid. */
  clearAt(x: number, z: number) {
    return this.contains(x, z) ? this.clear[this.index(x, z)] : 1e9;
  }
}

/** Farthest she stands off a leg either way while beating up it (m). */
const LANE = 110;

/** A planned course: its legs, from her bow to the goal. */
interface Course {
  xs: number[];
  zs: number[];
  /** Per vertex: course still to sail from it to the end. */
  rest: number[];
  /** The goal couldn't be reached: this is as near as she can get. */
  short: boolean;
}

// a binary heap of cell indices keyed by f-score, reused across plans
class Heap {
  private ids = new Int32Array(1024);
  private fs = new Float32Array(1024);
  size = 0;

  push(id: number, f: number) {
    if (this.size === this.ids.length) {
      const ids = new Int32Array(this.size * 2);
      const fs = new Float32Array(this.size * 2);
      ids.set(this.ids);
      fs.set(this.fs);
      this.ids = ids;
      this.fs = fs;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.fs[p] <= f) break;
      this.ids[i] = this.ids[p];
      this.fs[i] = this.fs[p];
      i = p;
    }
    this.ids[i] = id;
    this.fs[i] = f;
  }

  pop(): number {
    const top = this.ids[0];
    const n = --this.size;
    if (n > 0) {
      const id = this.ids[n];
      const f = this.fs[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && this.fs[c + 1] < this.fs[c]) c++;
        if (this.fs[c] >= f) break;
        this.ids[i] = this.ids[c];
        this.fs[i] = this.fs[c];
        i = c;
      }
      this.ids[i] = id;
      this.fs[i] = f;
    }
    return top;
  }
}

const heap = new Heap();
const NB_DI = [1, -1, 0, 0, 1, 1, -1, -1];
const NB_DJ = [0, 0, 1, -1, 1, -1, 1, -1];

export class Autopilot {
  state: HelmState = 'idle';
  target: HelmTarget | null = null;
  /** The sail she cruises under: full unless the captain trims it while the helmsman steers. */
  cruise = 1;
  private course: Course | null = null;
  private grid: NavGrid | null = null;
  private gridDraft = 0;
  private leg = 0;
  private hardR = 24;
  private tack = 0;
  private tackT = 0;
  /** A leg too hemmed in to beat up: she just pinches up it. */
  private noBeat = -1;
  private tacks = 0;
  private aboutT = 0;
  private best = Infinity;
  private bestT = 0;
  private slowT = 0;
  private stuck = 0;
  private replanT = 0;
  private speedAvg = 0;
  private total = 1;
  private arrivedT = 0;
  private gx = 0;
  private gz = 0;
  private how = '';
  /** Told when she gives up (aground, boxed in) with a line to say why. */
  onGiveUp: (why: string) => void = () => {};
  /** Told when she arrives. */
  onArrive: (t: HelmTarget) => void = () => {};

  constructor(
    private floor: SeaFloor,
    private vortices: () => { x: number; z: number; r: number }[],
  ) {}

  get active() {
    return this.state === 'sailing';
  }

  /** The course still ahead of her, from her bow to the goal, for the charts. */
  route(from: { x: number; z: number }): { x: number; z: number }[] | null {
    const c = this.course;
    if (!c || this.state !== 'sailing') return null;
    const pts = [{ x: from.x, z: from.z }];
    for (let i = this.leg + 1; i < c.xs.length; i++) pts.push({ x: c.xs[i], z: c.zs[i] });
    return pts;
  }

  /** Sets her on a course for `t`. False when there's no sea to sail there through. */
  engage(ship: Ship, t: HelmTarget): boolean {
    this.target = t;
    this.hardR = 16 + ship.cls.length * 0.45 + ship.cls.beam * 0.5;
    this.gx = t.aimX ?? t.x;
    this.gz = t.aimZ ?? t.z;
    this.cruise = 1;
    this.tack = 0;
    this.tacks = 0;
    this.stuck = 0;
    this.slowT = 0;
    this.speedAvg = Math.abs(ship.speed);
    if (!this.plan(ship, true)) {
      this.state = 'idle';
      this.target = null;
      return false;
    }
    this.total = Math.max(1, this.course!.rest[0]);
    this.state = 'sailing';
    return true;
  }

  /** The captain takes the helm back (or the voyage moves on): she sails on as she is. */
  disengage() {
    this.state = 'idle';
    this.target = null;
    this.course = null;
  }

  /** Whether her course came up short of the goal (it's walled in by land or coral). */
  get short() {
    return !!this.course?.short;
  }

  /** The waters were reshaped (a new voyage): forget the old grid. */
  reset() {
    this.disengage();
    this.grid = null;
  }

  // ---------------------------------------------------------------- planning

  private buildGrid(sx: number, sz: number, gx: number, gz: number, draft: number) {
    const dist = Math.hypot(gx - sx, gz - sz);
    const pad = 380 + dist * 0.06;
    const x0 = Math.max(SEA.x0, Math.min(sx, gx) - pad);
    const x1 = Math.min(SEA.x1, Math.max(sx, gx) + pad);
    const z0 = Math.max(SEA.z0, Math.min(sz, gz) - pad);
    const z1 = Math.min(SEA.z1, Math.max(sz, gz) + pad);
    const w = Math.max(64, x1 - x0);
    const h = Math.max(64, z1 - z0);
    const cell = clamp(Math.sqrt((w * h) / MAX_CELLS), 8, 32);
    const vx = this.vortices().map((v) => ({ x: v.x, z: v.z, r: v.r * 1.3 }));
    this.grid = new NavGrid(x0, z0, cell, w, h, this.floor, draft, vx);
    this.gridDraft = draft;
  }

  private plan(ship: Ship, fresh: boolean): boolean {
    const sx = ship.pos.x;
    const sz = ship.pos.z;
    const draft = ship.cls.draft;
    let g = this.grid;
    // a replan keeps the grid while she's still on it
    if (fresh || !g || this.gridDraft !== draft || !g.contains(sx, sz) || !g.contains(this.gx, this.gz)) {
      this.buildGrid(sx, sz, this.gx, this.gz, draft);
      g = this.grid!;
    }

    const { nx, nz, cell, blocked: B, clear: D } = g;
    const R = this.hardR;
    // her own cell may lie in the shoal margin (she's close inshore): start from the nearest open water
    let s = g.index(sx, sz);
    if (B[s]) s = this.nearestOpen(g, s, 6);
    if (s < 0) return false;
    const goal = this.goalCell(g, this.gx, this.gz, sx, sz);
    if (goal < 0) return false;
    // (the goal may have moved off the land onto the water beside it)
    const gx = this.gx;
    const gz = this.gz;
    const N = nx * nz;
    const gs = new Float32Array(N).fill(Infinity);
    const from = new Int32Array(N).fill(-1);
    const shut = new Uint8Array(N);
    const gi = goal % nx;
    const gj = (goal / nx) | 0;
    const hOf = (k: number) => {
      const di = Math.abs((k % nx) - gi);
      const dj = Math.abs(((k / nx) | 0) - gj);
      return (Math.max(di, dj) + 0.41421 * Math.min(di, dj)) * cell;
    };
    // how much dearer water is near danger: a lot inside her clearance, a little just outside it
    const pen = (k: number) => {
      const d = D[k];
      if (d < R) return 1 + 7 * (1 - d / R);
      if (d < R * 2.5) return 1 + 0.5 * (1 - (d - R) / (R * 1.5));
      return 1;
    };
    heap.size = 0;
    gs[s] = 0;
    heap.push(s, hOf(s) * 1.12);
    let nearest = s;
    let nearH = hOf(s);
    let found = false;
    while (heap.size) {
      const k = heap.pop();
      if (shut[k]) continue;
      shut[k] = 1;
      if (k === goal) {
        found = true;
        break;
      }
      const hk = hOf(k);
      if (hk < nearH) {
        nearH = hk;
        nearest = k;
      }
      const i = k % nx;
      const j = (k / nx) | 0;
      const pk = pen(k);
      for (let n = 0; n < 8; n++) {
        const ii = i + NB_DI[n];
        const jj = j + NB_DJ[n];
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const q = jj * nx + ii;
        if (B[q] || shut[q]) continue;
        // no cutting a corner between two blocked cells
        if (n >= 4 && (B[j * nx + ii] || B[jj * nx + i])) continue;
        const c = gs[k] + (n < 4 ? cell : cell * Math.SQRT2) * (pk + pen(q)) * 0.5;
        if (c < gs[q]) {
          gs[q] = c;
          from[q] = k;
          heap.push(q, c + hOf(q) * 1.12);
        }
      }
    }
    const end = found ? goal : nearest;
    if (!found && end === s) return false;
    // back along the cells
    const cells: number[] = [];
    for (let k = end; k >= 0; k = from[k]) cells.push(k);
    cells.reverse();
    // pulled taut: each leg runs as far as the water stays as clear as the cells it replaces
    const cx = (k: number) => g.x0 + ((k % nx) + 0.5) * cell;
    const cz = (k: number) => g.z0 + (((k / nx) | 0) + 0.5) * cell;
    const xs = [sx];
    const zs = [sz];
    let a = 0;
    let ax = sx;
    let az = sz;
    while (a < cells.length - 1) {
      let b = a + 1;
      let runMin = Math.min(D[cells[a]], D[cells[b]]);
      for (let c = b + 1; c < cells.length; c++) {
        const m = Math.min(runMin, D[cells[c]]);
        if (!this.sight(g, ax, az, cx(cells[c]), cz(cells[c]), Math.min(R, m) * 0.92)) break;
        runMin = m;
        b = c;
      }
      const bx = b === cells.length - 1 && found ? gx : cx(cells[b]);
      const bz = b === cells.length - 1 && found ? gz : cz(cells[b]);
      xs.push(bx);
      zs.push(bz);
      ax = bx;
      az = bz;
      a = b;
    }
    if (xs.length < 2) {
      xs.push(found ? gx : cx(end));
      zs.push(found ? gz : cz(end));
    }
    const rest = new Array<number>(xs.length).fill(0);
    for (let i = xs.length - 2; i >= 0; i--) rest[i] = rest[i + 1] + Math.hypot(xs[i + 1] - xs[i], zs[i + 1] - zs[i]);
    this.course = { xs, zs, rest, short: !found };
    this.noBeat = -1;
    this.leg = 0;
    this.best = Infinity;
    this.bestT = 0;
    this.replanT = 1.5;
    return true;
  }

  /** The nearest cell that isn't land or shoal, within `r` cells. */
  private nearestOpen(g: NavGrid, k: number, r: number) {
    const i0 = k % g.nx;
    const j0 = (k / g.nx) | 0;
    let best = -1;
    let bd = Infinity;
    for (let j = Math.max(0, j0 - r); j <= Math.min(g.nz - 1, j0 + r); j++) {
      for (let i = Math.max(0, i0 - r); i <= Math.min(g.nx - 1, i0 + r); i++) {
        const q = j * g.nx + i;
        if (g.blocked[q]) continue;
        const d = (i - i0) ** 2 + (j - j0) ** 2 - g.clear[q] * 0.02;
        if (d < bd) {
          bd = d;
          best = q;
        }
      }
    }
    return best;
  }

  /**
   * Where to make for: the goal's own cell when it's open water with room to
   * lie in, else the nearest water off it that is, a little toward her side.
   */
  private goalCell(g: NavGrid, gx: number, gz: number, sx: number, sz: number) {
    const k = g.index(gx, gz);
    const R = this.hardR;
    if (!g.blocked[k] && g.clear[k] >= R * 0.8) return k;
    const span = Math.ceil(520 / g.cell);
    const i0 = k % g.nx;
    const j0 = (k / g.nx) | 0;
    let best = -1;
    let bd = Infinity;
    for (let j = Math.max(0, j0 - span); j <= Math.min(g.nz - 1, j0 + span); j++) {
      for (let i = Math.max(0, i0 - span); i <= Math.min(g.nx - 1, i0 + span); i++) {
        const q = j * g.nx + i;
        if (g.blocked[q]) continue;
        const x = g.x0 + (i + 0.5) * g.cell;
        const z = g.z0 + (j + 0.5) * g.cell;
        const d = Math.hypot(x - gx, z - gz) + Math.max(0, R - g.clear[q]) * 4 + Math.hypot(x - sx, z - sz) * 0.08;
        if (d < bd) {
          bd = d;
          best = q;
        }
      }
    }
    if (best >= 0) {
      // lie off it, not on it: make for that water's middle
      this.gx = g.x0 + ((best % g.nx) + 0.5) * g.cell;
      this.gz = g.z0 + (((best / g.nx) | 0) + 0.5) * g.cell;
    }
    return best;
  }

  /** A straight run from a to b keeps at least `min` metres off any danger. */
  private sight(g: NavGrid, ax: number, az: number, bx: number, bz: number, min: number) {
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(L / (g.cell * 0.5)));
    for (let s = 1; s <= n; s++) {
      const t = s / n;
      const k = g.index(ax + (bx - ax) * t, az + (bz - az) * t);
      if (g.blocked[k] || g.clear[k] < min) return false;
    }
    return true;
  }

  /** Danger within a board's length ahead on heading `h`. */
  private blind(x: number, z: number, h: number) {
    const g = this.grid;
    if (!g) return false;
    const sx = Math.sin(h);
    const sz = Math.cos(h);
    for (const d of [40, 80, 120]) if (g.clearAt(x + sx * d, z + sz * d) < this.hardR * 0.9) return true;
    return false;
  }

  // ---------------------------------------------------------------- the helm

  /**
   * Each frame while she's under the helmsman: sets her rudder and her sail.
   * `wind` points downwind. Returns true on the frame she arrives.
   */
  steer(ship: Ship, dt: number, wind: { dirX: number; dirZ: number }, hulls: readonly Hull[], pinGone: boolean): boolean {
    if (this.state === 'arrived') {
      this.arrivedT += dt;
      if (this.arrivedT > 2.6) this.disengage();
      return false;
    }
    const c = this.course;
    const t = this.target;
    if (this.state !== 'sailing' || !c || !t) return false;
    const x = ship.pos.x;
    const z = ship.pos.z;
    const n = c.xs.length;
    // move on to the next leg once she's abreast of this one's end (or cut the corner)
    for (;;) {
      if (this.leg >= n - 2) break;
      const i = this.leg;
      const ex = c.xs[i + 1];
      const ez = c.zs[i + 1];
      const lx = ex - c.xs[i];
      const lz = ez - c.zs[i];
      const L2 = lx * lx + lz * lz || 1;
      const u = ((x - c.xs[i]) * lx + (z - c.zs[i]) * lz) / L2;
      if (u > 0.995 || Math.hypot(ex - x, ez - z) < Math.max(26, this.hardR)) {
        this.leg++;
        this.tack = 0;
        continue;
      }
      break;
    }
    const i = this.leg;
    const ax = c.xs[i];
    const az = c.zs[i];
    const bx = c.xs[i + 1];
    const bz = c.zs[i + 1];
    const lx = bx - ax;
    const lz = bz - az;
    const L = Math.hypot(lx, lz) || 1;
    const dx = lx / L;
    const dz = lz / L;
    const u = clamp(((x - ax) * dx + (z - az) * dz) / L, 0, 1);
    // how far she stands off the leg, signed by which side
    const side = (x - ax) * dz - (z - az) * dx;
    const toEnd = Math.hypot(bx - x, bz - z);
    const left = toEnd + c.rest[i + 1];
    this.speedAvg += (Math.abs(ship.speed) - this.speedAvg) * Math.min(1, dt * 0.5);

    // ---- arrived?
    const finalLeg = i >= n - 2;
    const arriveR = t.kind === 'pin' ? 16 : 30;
    const inReach = !!t.reach && left < 120 && t.reach(x, z);
    if (pinGone || inReach || (finalLeg && toEnd < arriveR)) {
      ship.sailTarget = 0;
      ship.rudder = 0;
      this.state = 'arrived';
      this.arrivedT = 0;
      this.how = 'Arrived';
      this.onArrive(t);
      return true;
    }

    // ---- pushed well off the course, or making no way: plan again from here
    this.replanT -= dt;
    if (left < this.best - 4) {
      this.best = left;
      this.bestT = 0;
    } else this.bestT += dt;
    this.slowT = this.speedAvg < 0.8 ? this.slowT + dt : 0;
    if (this.speedAvg > 2.5) this.stuck = 0;
    const balked = this.slowT > 9 || this.bestT > 30;
    if (this.replanT <= 0 && (Math.abs(side) > (this.tack ? LANE + 70 : 95) || balked)) {
      if (balked && ++this.stuck >= 4) {
        this.disengage();
        this.onGiveUp('She can make no headway: take the helm');
        return false;
      }
      this.slowT = 0;
      if (!this.plan(ship, false)) {
        this.disengage();
        this.onGiveUp('No clear water to sail on through');
        return false;
      }
      return false;
    }

    // ---- where to point her
    const upwind = Math.atan2(-wind.dirX, -wind.dirZ);
    const legBrg = Math.atan2(dx, dz);
    const open = smoothstep(HIGH_SEAS_R - 150, HIGH_SEAS_R + 450, nearestRegion(x, z).dist);
    const off = angleDelta(upwind, legBrg);
    const beat = !ship.ghost && open < 0.5 && this.noBeat !== i && toEnd > 90 && Math.abs(off) < BEAT_WITHIN;
    let want: number;
    this.tackT += dt;
    this.aboutT -= dt;
    if (beat) {
      // long boards either side of the leg, coming about at the edge of the clear water
      if (!this.tack) this.tack = angleDelta(upwind, ship.heading) >= 0 ? 1 : -1;
      let h = upwind + this.tack * TACK;
      // which way this board carries her across the leg
      const drift = Math.sin(angleDelta(legBrg, h)) > 0 ? 1 : -1;
      const half = Math.min(LANE, Math.max(26, toEnd * 0.42));
      const pastLane = drift * side > half;
      // and never stand on into danger
      const blind = this.blind(x, z, h);
      if ((pastLane && this.tackT > 6) || (blind && this.tackT > 3)) {
        const h2 = upwind - this.tack * TACK;
        if (blind && this.blind(x, z, h2)) {
          // hemmed in on both boards: no room to tack here, pinch up the leg as she can
          this.noBeat = i;
          this.tack = 0;
        } else {
          this.tack = -this.tack;
          this.tackT = 0;
          this.tacks++;
          this.aboutT = 4;
          h = h2;
        }
      }
      want = this.tack ? h : legBrg;
    } else {
      this.tack = 0;
      // chase a point a little way along the course
      const look = clamp(Math.abs(ship.speed) * 2.6 + 22, 26, 75);
      let rem = look;
      let qx = ax + dx * u * L;
      let qz = az + dz * u * L;
      let k = i;
      for (;;) {
        const ex = c.xs[k + 1];
        const ez = c.zs[k + 1];
        const d = Math.hypot(ex - qx, ez - qz);
        if (d >= rem || k >= n - 2) {
          const f = d > 0 ? Math.min(1, rem / d) : 0;
          qx += (ex - qx) * f;
          qz += (ez - qz) * f;
          break;
        }
        rem -= d;
        qx = ex;
        qz = ez;
        k++;
      }
      // pulled well wide of the course, come back to it more squarely
      const back = clamp(Math.abs(side) / 60, 0, 1);
      want = Math.atan2(qx - x, qz - z);
      if (back > 0.4) want = Math.atan2(qx - x + (ax + dx * u * L - x) * back, qz - z + (az + dz * u * L - z) * back);
    }
    // the current and her leeway set her sideways: lay off a little for it
    const sp = Math.hypot(ship.vel.x, ship.vel.z);
    if (sp > 2) want -= clamp(angleDelta(ship.heading, Math.atan2(ship.vel.x, ship.vel.z)), -0.3, 0.3) * 0.8;
    // give way to any hull close under her bow
    for (const o of hulls) {
      if (o === (ship as unknown as Hull) || !o.alive) continue;
      const ox = o.pos.x - x;
      const oz = o.pos.z - z;
      const d = Math.hypot(ox, oz);
      if (d > 85 || d < 1) continue;
      const rel = angleDelta(ship.heading, Math.atan2(ox, oz));
      if (Math.abs(rel) > 0.75) continue;
      want -= Math.sign(rel || 1) * (1 - d / 85) * 0.65;
    }
    const err = angleDelta(ship.heading, want);
    ship.rudder = clamp(err * 2.4, -1, 1);

    // ---- how much canvas
    let sail = this.cruise;
    // swinging round onto a new heading: less way, a tighter turn
    if (Math.abs(err) > 1.3) sail = Math.min(sail, 2 / 3);
    // a sharp corner coming up: shorten sail into it
    if (!finalLeg && !beat) {
      const nx = c.xs[i + 2] - bx;
      const nz = c.zs[i + 2] - bz;
      const turn = Math.abs(angleDelta(legBrg, Math.atan2(nx, nz)));
      if (turn > 1.0 && toEnd < 60 + Math.abs(ship.speed) * 4) sail = Math.min(sail, turn > 2 ? 1 / 3 : 2 / 3);
    }
    // the last stretch: easing in, so she glides up to her mark and stops gently
    // (into the wind she's slow enough already; running free she takes in canvas)
    if (left < 170) {
      const vT = clamp((left - 8) / 13, 1.6, 12);
      sail = Math.min(sail, this.cruise * clamp(vT / Math.max(0.5, Math.abs(ship.speed)), 0.12, 1));
    }
    ship.sailTarget = sail;

    // ---- the word on the HUD
    if (left < 170) this.how = 'Easing in';
    else if (Math.abs(ship.speed) < 1.2) this.how = 'Making sail';
    else if (beat) this.how = this.aboutT > 0 ? 'Coming about' : `Beating to windward${this.tacks ? ` · tack ${this.tacks}` : ''}`;
    else if (Math.abs(err) > 1.3) this.how = 'Bringing her round';
    else if (open > 0.5) this.how = 'The trade wind carries her';
    else {
      const rel = Math.abs(angleDelta(Math.atan2(wind.dirX, wind.dirZ), ship.heading)) / DEG;
      this.how = rel < 50 ? 'Running before the wind' : rel < 120 ? 'On a broad reach' : windFactor(rel) < 0.5 ? 'Close-hauled' : 'On a reach';
    }
    return false;
  }

  /** The HUD's view of her progress, or null while he isn't at the helm. */
  view(ship: Ship): HelmView | null {
    const c = this.course;
    const t = this.target;
    if (!c || !t || this.state === 'idle') return null;
    const i = this.leg;
    const left = this.state === 'arrived' ? 0 : Math.hypot(c.xs[i + 1] - ship.pos.x, c.zs[i + 1] - ship.pos.z) + c.rest[i + 1];
    return {
      target: t,
      left,
      done: clamp(1 - left / this.total, 0, 1),
      eta: this.speedAvg > 1 ? left / this.speedAvg : -1,
      how: this.how || 'Setting sail',
      arrived: this.state === 'arrived',
    };
  }
}
