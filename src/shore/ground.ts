import * as THREE from 'three';
import { mulberry32 } from '../core/noise';
import { Island, Terrain } from '../world/terrain';
import type { Vegetation } from '../world/vegetation';

// The islands as ground to walk on: how high the sand is underfoot, where the
// sea gets too deep to wade, which slopes are too steep to climb, the trunks
// and boulders to walk round, and the towns' walls. Also where a boat can be
// run up a beach, and where the cutthroats have pitched their camps.

/** Deepest water (m below the still sea) anyone wades into. */
export const WADE = 0.8;
/** Steepest ground (rise per metre) anyone climbs. */
const STEEP = 1.15;

export interface Disc {
  x: number;
  z: number;
  r: number;
}

/** Where the boat comes ashore: the keel touches at (x, z), and the beach runs on inland along (dx, dz). */
export interface Landing {
  island: Island;
  x: number;
  z: number;
  dx: number;
  dz: number;
  /** First dry sand beyond the boat. */
  sandX: number;
  sandZ: number;
}

export interface CampSite {
  island: Island;
  x: number;
  z: number;
  /** Facing of the camp (the tent's mouth looks along this heading). */
  yaw: number;
  /** Ground height at the fire. */
  y: number;
}

/** Raised ground laid over the island: a fort's plaza and its ramp. `at` is null outside it. */
export interface Lift {
  x: number;
  z: number;
  /** Half-size of the square it may answer within. */
  r: number;
  at(x: number, z: number): number | null;
}

const _g = new THREE.Vector2();
const _solids: Disc[] = [];

export class Ground {
  /** Discs nobody walks into on top of the plants: camp furniture, the boat. */
  readonly blocks: Disc[] = [];
  /** Stone floors over the island (forts' plazas and ramps). */
  readonly lifts: Lift[] = [];

  constructor(
    readonly terrain: Terrain,
    private veg: Vegetation | undefined,
    /** Towns and the harbour: no wandering through their walls. */
    readonly towns: Disc[],
  ) {}

  height(x: number, z: number) {
    const v = this.lifted(x, z);
    return v ?? this.terrain.heightAt(x, z);
  }

  /** The height of a stone floor here, or null on bare ground. */
  lifted(x: number, z: number) {
    for (const l of this.lifts) {
      if (Math.abs(x - l.x) > l.r || Math.abs(z - l.z) > l.r) continue;
      const v = l.at(x, z);
      if (v !== null) return v;
    }
    return null;
  }

  /** Rise per metre at a point. */
  slope(x: number, z: number) {
    return this.terrain.gradientAt(x, z, _g).length();
  }

  /** Can a body of radius `r` stand here? */
  open(x: number, z: number, r = 0.3) {
    // flagstones are level going, whatever the hill beneath them does
    if (this.lifts.length && this.lifted(x, z) !== null) {
      for (const t of this.towns) if ((x - t.x) ** 2 + (z - t.z) ** 2 < (t.r + r) ** 2) return false;
      return true;
    }
    const h = this.terrain.heightAt(x, z);
    if (h < -WADE) return false;
    if (h > 0.5 && this.slope(x, z) > STEEP) return false;
    for (const t of this.towns) if ((x - t.x) ** 2 + (z - t.z) ** 2 < (t.r + r) ** 2) return false;
    return true;
  }

  /** Is there a trunk, boulder or camp furniture within `r` of a point? */
  solidNear(x: number, z: number, r: number) {
    const list = this.veg ? this.veg.solidsNear(x, z, _solids) : (_solids.length = 0, _solids);
    for (const b of this.blocks) list.push(b);
    return list.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r);
  }

  /**
   * Moves a walker from (x, z) by (dx, dz), sliding along whatever stops it:
   * deep water, cliffs, towns. Returns the new position in `out`.
   */
  step(x: number, z: number, dx: number, dz: number, r: number, out: { x: number; z: number }) {
    let nx = x + dx;
    let nz = z + dz;
    if (!this.open(nx, nz, r)) {
      if (this.open(nx, z, r)) nz = z;
      else if (this.open(x, nz, r)) nx = x;
      else {
        nx = x;
        nz = z;
      }
    }
    // trunks, boulders and camp furniture push you round them: every overlap's
    // push summed, so two side by side (a log's two ends) act as one wall
    // rather than shoving you back and forth between them
    const ml = Math.hypot(dx, dz) || 1;
    for (let pass = 0; pass < 3; pass++) {
      const list = this.veg ? this.veg.solidsNear(nx, nz, _solids) : (_solids.length = 0, _solids);
      for (const b of this.blocks) list.push(b);
      let px = 0;
      let pz = 0;
      for (const o of list) {
        const ox = nx - o.x;
        const oz = nz - o.z;
        const min = o.r + r;
        const d2 = ox * ox + oz * oz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 1e-3;
        const ux = ox / d;
        const uz = oz / d;
        px += ux * (min - d);
        pz += uz * (min - d);
        // walking square into a trunk: step round it instead of stopping dead
        const into = -(dx * ux + dz * uz) / ml;
        if (pass === 0 && into > 0.6) {
          const side = dx * -uz + dz * ux >= 0 ? 1 : -1;
          px += -uz * side * (min - d) * into;
          pz += ux * side * (min - d) * into;
        }
      }
      if (!px && !pz) break;
      if (this.open(nx + px, nz + pz, r)) {
        nx += px;
        nz += pz;
      } else break;
    }
    out.x = nx;
    out.z = nz;
    return out;
  }

  /**
   * The nearest beach a boat can be pulled up on from a ship at (x, z):
   * clean water all the way in, a gentle beach, then land you can walk on.
   */
  landing(x: number, z: number, reach = 85): Landing | null {
    const t = this.terrain;
    const near = t.nearestIsland(x, z);
    if (!near || near.dist > reach + 30) return null;
    const isl = near.island;
    const a0 = Math.atan2(isl.x - x, isl.z - z);
    let best: Landing | null = null;
    let bestD = Infinity;
    for (const off of [0, 0.22, -0.22, 0.45, -0.45, 0.75, -0.75, 1.1, -1.1]) {
      const a = a0 + off;
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      let keel = -1;
      for (let d = 4; d < reach; d += 1.5) {
        const h = t.heightAt(x + dx * d, z + dz * d);
        if (keel < 0 && h > -0.45) {
          keel = d;
          break;
        }
      }
      if (keel < 0 || keel >= bestD) continue;
      const bx = x + dx * keel;
      const bz = z + dz * keel;
      // dry sand within a few metres, and gentle going a little way past it
      let sand = -1;
      for (let d = 0; d < 14; d += 0.75) {
        if (t.heightAt(bx + dx * d, bz + dz * d) > 0.3) {
          sand = d;
          break;
        }
      }
      if (sand < 0) continue;
      const sx = bx + dx * (sand + 1.5);
      const sz = bz + dz * (sand + 1.5);
      let ok = this.open(sx, sz, 1) && this.slope(sx, sz) < 0.5;
      for (let d = 2; d <= 8 && ok; d += 2) ok = this.open(sx + dx * d, sz + dz * d, 0.5);
      if (!ok) continue;
      bestD = keel;
      best = { island: isl, x: bx, z: bz, dx, dz, sandX: sx, sandZ: sz };
    }
    return best;
  }
}

/**
 * Where a treasure map's X falls: a patch of open ground a short walk in from
 * a beach a boat can land on, clear of towns, camps and trees. `seed` picks
 * the island and the spot, so every device draws the same map.
 */
export function digSite(ground: Ground, seed: number, avoid: Disc[], skip: Island | null): { island: Island; x: number; z: number } | null {
  const t = ground.terrain;
  const rnd = mulberry32(seed);
  const isles = t.islands.filter((i) => i !== skip && i.r > 40);
  for (let n = 0; n < 8 && isles.length; n++) {
    const isl = isles.splice(Math.floor(rnd() * isles.length), 1)[0];
    for (let k = 0; k < 60; k++) {
      const a = rnd() * Math.PI * 2;
      const f = isl.kind === 'atoll' ? 0.6 + rnd() * 0.2 : 0.3 + rnd() * 0.6;
      const x = isl.x + Math.cos(a) * isl.r * f * isl.stretch;
      const z = isl.z + Math.sin(a) * isl.r * f;
      const h = t.heightAt(x, z);
      if (h < 0.9 || h > 9 || ground.slope(x, z) > 0.4 || !ground.open(x, z, 2)) continue;
      if (avoid.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 30)) continue;
      if (ground.solidNear(x, z, 2.2)) continue;
      // a beach within a short walk, straight out to sea
      const ox = x - isl.x;
      const oz = z - isl.z;
      const ol = Math.hypot(ox, oz) || 1;
      let sea = -1;
      for (let d = 2; d < 70; d += 2) {
        if (t.heightAt(x + (ox / ol) * d, z + (oz / ol) * d) < -0.5) {
          sea = d;
          break;
        }
      }
      if (sea < 14 || sea > 60) continue;
      if (!ground.landing(x + (ox / ol) * (sea + 40), z + (oz / ol) * (sea + 40), 85)) continue;
      return { island: isl, x, z };
    }
  }
  return null;
}

/**
 * Where the cutthroats camp: one flat glade a short walk in from the beach on
 * most islands, away from the towns. Fixed by the world's seed, and handed to
 * the vegetation as clearings so no tree grows through a tent.
 */
export function findCampSites(terrain: Terrain, avoid: Disc[], skip: Island | null): CampSite[] {
  const sites: CampSite[] = [];
  terrain.islands.forEach((isl, idx) => {
    if (isl === skip) return;
    const rnd = mulberry32(Math.floor(isl.seed * 977) + idx * 31 + 5);
    const atoll = isl.kind === 'atoll';
    let best: CampSite | null = null;
    let bestScore = -Infinity;
    for (let k = 0; k < 160; k++) {
      const a = rnd() * Math.PI * 2;
      const f = atoll ? 0.62 + rnd() * 0.16 : 0.2 + rnd() * 0.7;
      const x = isl.x + Math.cos(a) * isl.r * f * isl.stretch;
      const z = isl.z + Math.sin(a) * isl.r * f;
      const h = terrain.heightAt(x, z);
      if (h < (atoll ? 1.5 : 1.6) || h > 14) continue;
      if (avoid.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 26)) continue;
      // flat enough for a fire, a tent and a ring of logs
      let worst = 0;
      for (let i = 0; i < 10; i++) {
        const b = (i / 10) * Math.PI * 2;
        for (const rr of [3.5, 7]) worst = Math.max(worst, Math.abs(terrain.heightAt(x + Math.cos(b) * rr, z + Math.sin(b) * rr) - h));
      }
      if (worst > (atoll ? 1.1 : 1.5)) continue;
      // how far is the sea, walking straight out?
      const ox = x - isl.x;
      const oz = z - isl.z;
      const ol = Math.hypot(ox, oz) || 1;
      let shore = -1;
      for (let d = 2; d < 90; d += 2) {
        if (terrain.heightAt(x + (ox / ol) * d, z + (oz / ol) * d) < 0) {
          shore = d;
          break;
        }
      }
      if (shore < 10 || shore > 70) continue;
      const score = -worst * 3 - Math.abs(shore - 28) * 0.08 + rnd() * 0.5;
      if (score > bestScore) {
        bestScore = score;
        // the tent backs onto the island's heart, its mouth towards the sea
        best = { island: isl, x, z, y: h, yaw: Math.atan2(ox, oz) };
      }
    }
    if (best) sites.push(best);
  });
  return sites.slice(0, 9);
}

/** Clearings around each camp for the vegetation. */
export function campClearings(sites: CampSite[]): Disc[] {
  return sites.map((s) => ({ x: s.x, z: s.z, r: 10 }));
}

