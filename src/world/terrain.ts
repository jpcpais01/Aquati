import * as THREE from 'three';
import { Simplex2, mulberry32, clamp, lerp, smoothstep } from '../core/noise';
import { patchMaterial } from '../render/environment';
import { createTerrainMaterial } from './terrainMaterial';
import { WORLD_SIZE } from './worldSize';

export type IslandKind = 'lush' | 'volcanic' | 'atoll' | 'rocky';

export interface Island {
  name: string;
  kind: IslandKind;
  x: number;
  z: number;
  r: number;
  peak: number;
  rot: number;
  stretch: number;
  seed: number;
  tint: number; // -1..1 hue / lushness variation
}

export { WORLD_SIZE };
export const CELL = 2;
export const GRID_N = WORLD_SIZE / CELL + 1;
const HALF = WORLD_SIZE / 2;
export const FLOOR_DEPTH = -17;

const NAMES = [
  'Isla Serena', 'Cayo Coralina', 'Puerto Ámbar', 'Cayo Esmeralda', 'Isla Vela', 'Bahía Turquesa',
  'Roca del Cuervo', 'Isla Marea', 'Cayo Sol', 'Isla Perla', 'Arrecife Azul', 'Punta Brisa', 'Isla Nácar',
];

function smax(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

/** Colour of the endless deep seabed plane (matches T_SAND_DEEP in the ground shader). */
const DEEP_SAND = new THREE.Color(0xa99a76).convertSRGBToLinear();

export class Terrain {
  readonly heights = new Float32Array(GRID_N * GRID_N);
  readonly ao = new Float32Array(GRID_N * GRID_N).fill(1);
  /** How much tree canopy shades each cell (0..1): forest floor under the trees. */
  readonly canopy = new Float32Array(GRID_N * GRID_N);
  readonly islands: Island[] = [];
  /** Island index owning each cell (-1 = open sea); used for colouring. */
  private owner = new Int8Array(GRID_N * GRID_N).fill(-1);
  /** Normalised inland depth (0 at the shore, 1 at the island centre) of the owner. */
  private inland = new Float32Array(GRID_N * GRID_N);
  private lastInland = 0;
  /** 1 inside an atoll's lagoon, where the reef ring breaks the swell. */
  private lagoon = new Uint8Array(GRID_N * GRID_N);
  private lastLagoon = 0;
  private simplex: Simplex2;
  private seed: number;

  constructor(seed = 1337) {
    this.seed = seed;
    this.simplex = new Simplex2(seed);
    this.placeIslands();
    this.buildHeights();
  }

  // ---------------------------------------------------------------- layout

  private placeIslands() {
    const rnd = mulberry32(this.seed * 7 + 3);
    const names = NAMES.slice();
    const pickName = () => names.splice(Math.floor(rnd() * names.length), 1)[0] ?? 'Isla';
    // A hero volcano anchors the composition north of the spawn point.
    this.islands.push({
      name: 'Monte Fortuna', kind: 'volcanic', x: -30, z: -170, r: 125, peak: 62, rot: 0.4, stretch: 1.18,
      seed: rnd() * 100, tint: 0.2,
    });
    // A lagoon atoll near spawn so the first thing you see is turquoise water.
    this.islands.push({
      name: pickName(), kind: 'atoll', x: 190, z: 150, r: 78, peak: 2.2, rot: rnd() * 6, stretch: 1.1,
      seed: rnd() * 100, tint: 0,
    });
    const kinds: IslandKind[] = ['lush', 'lush', 'rocky', 'lush', 'atoll', 'rocky', 'lush', 'atoll', 'lush', 'rocky'];
    let attempts = 0;
    let ki = 0;
    while (this.islands.length < 12 && attempts < 4000) {
      attempts++;
      const kind = kinds[ki % kinds.length];
      const r = kind === 'atoll' ? 50 + rnd() * 40 : kind === 'rocky' ? 42 + rnd() * 38 : 50 + rnd() * 55;
      const ang = rnd() * Math.PI * 2;
      const dist = Math.sqrt(rnd()) * 780;
      const x = Math.cos(ang) * dist;
      const z = Math.sin(ang) * dist;
      // keep spawn waters open
      if (Math.hypot(x - 0, z - 150) < r + 90) continue;
      let ok = true;
      for (const o of this.islands) {
        const need = (o.r + r) * 1.32 + 70;
        if (Math.hypot(o.x - x, o.z - z) < need) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const peak = kind === 'atoll' ? 2.0 + rnd() * 0.6 : kind === 'rocky' ? 24 + rnd() * 18 : 14 + rnd() * 22;
      this.islands.push({
        name: pickName(), kind, x, z, r, peak, rot: rnd() * Math.PI, stretch: 1 + rnd() * 0.45,
        seed: rnd() * 100, tint: rnd() * 2 - 1,
      });
      ki++;
    }
  }

  // ---------------------------------------------------------------- heights

  private islandHeight(isl: Island, x: number, z: number): number {
    const s = this.simplex;
    const dx = x - isl.x;
    const dz = z - isl.z;
    const cr = Math.cos(isl.rot);
    const sr = Math.sin(isl.rot);
    let lx = (dx * cr + dz * sr) / isl.stretch;
    let lz = (-dx * sr + dz * cr) * isl.stretch;
    lx += s.noise(x * 0.0105 + isl.seed, z * 0.0105) * isl.r * 0.2;
    lz += s.noise(x * 0.0105 - 40.3, z * 0.0105 + isl.seed) * isl.r * 0.2;
    let d = Math.sqrt(lx * lx + lz * lz) / isl.r;
    this.lastInland = 0;
    this.lastLagoon = 0;
    const ang = Math.atan2(lz, lx);
    const lobes = s.fbm(Math.cos(ang) * 1.15 + isl.seed * 3.1, Math.sin(ang) * 1.15 - isl.seed, 3);
    d *= 1 + lobes * (isl.kind === 'atoll' ? 0.12 : 0.34);
    // fine coastline wiggle
    d += s.noise(x * 0.045, z * 0.045 + isl.seed) * 0.03;

    if (isl.kind === 'atoll') {
      const ringR = 0.7;
      let ringF = 0.17 - Math.abs(d - ringR);
      const gap = s.noise(Math.cos(ang) * 2.4 + isl.seed, Math.sin(ang) * 2.4 + 9.1);
      ringF -= Math.max(0, gap) * 0.2;
      if (ringF > 0) {
        return 2.3 * smoothstep(0, 0.09, ringF) + s.noise(x * 0.06, z * 0.06) * 0.25 * smoothstep(0, 0.1, ringF);
      }
      if (d < ringR) {
        this.lastLagoon = 1;
        const lag = -2.4 + s.fbm(x * 0.02, z * 0.02, 2) * 0.9;
        return lerp(0, lag, smoothstep(0, 0.07, -ringF));
      }
      return this.shelf(-ringF * 0.9, x, z, 0.0);
    }

    const f = 1 - d;
    this.lastInland = Math.max(0, f);
    if (f <= 0) return this.shelf(-f, x, z, isl.kind === 'lush' ? 1 : 0.5);

    const beachW = isl.kind === 'rocky' ? 0.05 : isl.kind === 'volcanic' ? 0.09 : 0.13;
    const beach = 1.35 * smoothstep(0, beachW, f);
    const m = smoothstep(beachW * 0.6, 0.98, f);
    let h: number;
    if (isl.kind === 'rocky') {
      const ridge = 0.65 + 0.55 * s.ridged(x * 0.011 + isl.seed, z * 0.011, 4);
      h = isl.peak * Math.pow(m, 0.8) * ridge;
      const step = 3.4;
      const k = h / step;
      const fl = Math.floor(k);
      h = step * (fl + smoothstep(0.2, 0.8, k - fl));
      h += beach;
    } else {
      const ridge = 0.5 + 0.8 * s.ridged(x * 0.0085 + isl.seed, z * 0.0085 - isl.seed, 5);
      h = beach + isl.peak * Math.pow(m, 1.55) * ridge;
      h += 3.2 * m * (s.fbm(x * 0.028, z * 0.028, 3) * 0.5 + 0.5);
      if (isl.kind === 'volcanic') {
        // crater rim at the summit
        const c = smoothstep(0.8, 0.97, f);
        h -= isl.peak * 0.32 * c;
      }
    }
    return h;
  }

  /** Underwater shelf profile; s = normalised distance beyond the shore. */
  private shelf(s: number, x: number, z: number, reef: number): number {
    let h = -2.8 * smoothstep(0, 0.3, s) - 14.5 * smoothstep(0.2, 0.95, s);
    if (reef > 0) h += reef * 1.6 * Math.exp(-Math.pow((s - 0.36) / 0.055, 2)) * (0.6 + 0.4 * this.simplex.noise(x * 0.03, z * 0.03));
    return h;
  }

  private buildHeights() {
    const H = this.heights;
    // coarse rolling seafloor
    const coarse = 8;
    const cn = Math.ceil(GRID_N / coarse) + 1;
    const floor = new Float32Array(cn * cn);
    for (let j = 0; j < cn; j++) {
      for (let i = 0; i < cn; i++) {
        const x = -HALF + i * coarse * CELL;
        const z = -HALF + j * coarse * CELL;
        floor[j * cn + i] = FLOOR_DEPTH + this.simplex.fbm(x * 0.0035, z * 0.0035, 3) * 3.2;
      }
    }
    for (let j = 0; j < GRID_N; j++) {
      const fj = j / coarse;
      const j0 = Math.floor(fj);
      const tj = fj - j0;
      for (let i = 0; i < GRID_N; i++) {
        const fi = i / coarse;
        const i0 = Math.floor(fi);
        const ti = fi - i0;
        const a = floor[j0 * cn + i0];
        const b = floor[j0 * cn + i0 + 1];
        const c = floor[(j0 + 1) * cn + i0];
        const d = floor[(j0 + 1) * cn + i0 + 1];
        H[j * GRID_N + i] = lerp(lerp(a, b, ti), lerp(c, d, ti), tj);
      }
    }
    const best = new Float32Array(GRID_N * GRID_N).fill(-1e9);
    this.islands.forEach((isl, idx) => {
      const ext = isl.r * Math.max(isl.stretch, 1 / isl.stretch) * 2.05 + 20;
      const i0 = Math.max(0, Math.floor((isl.x - ext + HALF) / CELL));
      const i1 = Math.min(GRID_N - 1, Math.ceil((isl.x + ext + HALF) / CELL));
      const j0 = Math.max(0, Math.floor((isl.z - ext + HALF) / CELL));
      const j1 = Math.min(GRID_N - 1, Math.ceil((isl.z + ext + HALF) / CELL));
      for (let j = j0; j <= j1; j++) {
        const z = -HALF + j * CELL;
        for (let i = i0; i <= i1; i++) {
          const x = -HALF + i * CELL;
          const k = j * GRID_N + i;
          const h = this.islandHeight(isl, x, z);
          if (h > best[k]) {
            best[k] = h;
            if (h > -14) {
              this.owner[k] = idx;
              this.inland[k] = this.lastInland;
              this.lagoon[k] = this.lastLagoon;
            }
          }
          H[k] = smax(H[k], h, 3);
        }
      }
    });
  }

  // ---------------------------------------------------------------- queries

  heightAt(x: number, z: number): number {
    const fx = clamp((x + HALF) / CELL, 0, GRID_N - 1.001);
    const fz = clamp((z + HALF) / CELL, 0, GRID_N - 1.001);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const H = this.heights;
    const k = j * GRID_N + i;
    const a = H[k];
    const b = H[k + 1];
    const c = H[k + GRID_N];
    const d = H[k + GRID_N + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  }

  /** Whether (x, z) lies in a sheltered atoll lagoon (nearest grid cell). */
  lagoonAt(x: number, z: number): boolean {
    const i = Math.round(clamp((x + HALF) / CELL, 0, GRID_N - 1));
    const j = Math.round(clamp((z + HALF) / CELL, 0, GRID_N - 1));
    return this.lagoon[j * GRID_N + i] === 1;
  }

  /** Downhill gradient (dh/dx, dh/dz). */
  gradientAt(x: number, z: number, out: THREE.Vector2): THREE.Vector2 {
    const e = CELL;
    out.set(
      (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e),
      (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e),
    );
    return out;
  }

  private gridH(i: number, j: number): number {
    i = clamp(i, 0, GRID_N - 1);
    j = clamp(j, 0, GRID_N - 1);
    return this.heights[j * GRID_N + i];
  }

  nearestIsland(x: number, z: number): { island: Island; dist: number } | null {
    let best: Island | null = null;
    let bd = Infinity;
    for (const isl of this.islands) {
      const d = Math.hypot(isl.x - x, isl.z - z) - isl.r;
      if (d < bd) {
        bd = d;
        best = isl;
      }
    }
    return best ? { island: best, dist: bd } : null;
  }

  // ---------------------------------------------------------------- baking

  /**
   * Horizon-based ambient occlusion: march 8 rays across the heightfield from
   * every land/shallow cell. A cheap, offline cousin of ray-traced AO.
   */
  bakeAO(step = 2) {
    const dirs = 8;
    const dists = [2, 4.5, 8, 13, 21, 34, 52];
    const cs: number[] = [];
    const sn: number[] = [];
    for (let d = 0; d < dirs; d++) {
      const a = (d / dirs) * Math.PI * 2 + 0.3;
      cs.push(Math.cos(a));
      sn.push(Math.sin(a));
    }
    const ao = this.ao;
    const H = this.heights;
    for (let j = 0; j < GRID_N; j += step) {
      for (let i = 0; i < GRID_N; i += step) {
        const k = j * GRID_N + i;
        const h0 = H[k];
        if (h0 < -15.5) continue;
        const x = -HALF + i * CELL;
        const z = -HALF + j * CELL;
        let occ = 0;
        for (let d = 0; d < dirs; d++) {
          let maxSlope = 0;
          for (const dist of dists) {
            const hh = this.heightAt(x + cs[d] * dist, z + sn[d] * dist);
            const sl = (hh - h0 - 0.3) / dist;
            if (sl > maxSlope) maxSlope = sl;
          }
          occ += maxSlope / Math.sqrt(1 + maxSlope * maxSlope);
        }
        occ /= dirs;
        const v = clamp(1 - occ * 1.35, 0.25, 1);
        for (let oj = 0; oj < step && j + oj < GRID_N; oj++) {
          for (let oi = 0; oi < step && i + oi < GRID_N; oi++) ao[(j + oj) * GRID_N + i + oi] = v;
        }
      }
    }
    // smooth the blocky upsample
    if (step > 1) this.blurAO();
  }

  private blurAO() {
    const src = this.ao.slice();
    const ao = this.ao;
    for (let j = 1; j < GRID_N - 1; j++) {
      for (let i = 1; i < GRID_N - 1; i++) {
        const k = j * GRID_N + i;
        ao[k] = (src[k] * 4 + src[k - 1] + src[k + 1] + src[k - GRID_N] + src[k + GRID_N]) / 8;
      }
    }
  }

  /** Darken AO around a point (vegetation contact shadows). */
  stampAO(x: number, z: number, radius: number, strength: number) {
    const i0 = Math.floor((x - radius + HALF) / CELL);
    const i1 = Math.ceil((x + radius + HALF) / CELL);
    const j0 = Math.floor((z - radius + HALF) / CELL);
    const j1 = Math.ceil((z + radius + HALF) / CELL);
    for (let j = Math.max(0, j0); j <= Math.min(GRID_N - 1, j1); j++) {
      for (let i = Math.max(0, i0); i <= Math.min(GRID_N - 1, i1); i++) {
        const px = -HALF + i * CELL;
        const pz = -HALF + j * CELL;
        const d = Math.hypot(px - x, pz - z) / radius;
        if (d < 1) {
          const k = j * GRID_N + i;
          this.ao[k] *= 1 - strength * (1 - d * d);
        }
      }
    }
  }

  /** Mark the ground under a tree crown as forest floor. */
  stampCanopy(x: number, z: number, radius: number, strength: number) {
    const i0 = Math.max(0, Math.floor((x - radius + HALF) / CELL));
    const i1 = Math.min(GRID_N - 1, Math.ceil((x + radius + HALF) / CELL));
    const j0 = Math.max(0, Math.floor((z - radius + HALF) / CELL));
    const j1 = Math.min(GRID_N - 1, Math.ceil((z + radius + HALF) / CELL));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(-HALF + i * CELL - x, -HALF + j * CELL - z) / radius;
        if (d < 1) {
          const k = j * GRID_N + i;
          this.canopy[k] = Math.min(1, this.canopy[k] + strength * (1 - d * d));
        }
      }
    }
  }

  // ---------------------------------------------------------------- meshing

  /** Per-vertex inputs for the ground shader: island kind, tint, summit and crater masks. */
  private surfaceInfo(k: number, h: number, kind: Float32Array, info: Float32Array, o: number) {
    const own = this.owner[k];
    const isl = own >= 0 ? this.islands[own] : null;
    if (!isl) return;
    kind[o] = isl.kind === 'volcanic' ? 1 : 0;
    kind[o + 1] = isl.kind === 'atoll' ? 1 : 0;
    kind[o + 2] = isl.kind === 'rocky' ? 1 : 0;
    info[o] = isl.tint;
    if (isl.kind !== 'atoll') {
      info[o + 1] = smoothstep(isl.peak * 0.7, isl.peak * 0.95, h) * (isl.kind === 'volcanic' ? 1 : 0.6);
    }
    if (isl.kind === 'volcanic') info[o + 2] = smoothstep(0.86, 0.975, this.inland[k]);
  }

  /**
   * Builds the terrain as 64 m chunks (so frustum culling works) sharing the
   * global height grid: seams are exact and normals continuous.
   */
  buildMeshes(lod = 1, lite = false): THREE.Group {
    const group = new THREE.Group();
    group.name = 'terrain';
    const mat = createTerrainMaterial(lite);
    const chunkCells = 32;
    const chunks = Math.floor((GRID_N - 1) / chunkCells);
    for (let cj = 0; cj < chunks; cj++) {
      for (let ci = 0; ci < chunks; ci++) {
        // skip chunks that are pure deep seafloor (the floor plane covers them)
        let maxH = -1e9;
        for (let j = cj * chunkCells; j <= (cj + 1) * chunkCells; j += 2) {
          for (let i = ci * chunkCells; i <= (ci + 1) * chunkCells; i += 2) {
            const h = this.heights[j * GRID_N + i];
            if (h > maxH) maxH = h;
          }
        }
        if (maxH < -14.2) continue;
        const res = chunkCells / lod;
        const vn = res + 1;
        const pos = new Float32Array(vn * vn * 3);
        const nrm = new Float32Array(vn * vn * 3);
        const kindA = new Float32Array(vn * vn * 3);
        const infoA = new Float32Array(vn * vn * 3);
        const aoA = new Float32Array(vn * vn);
        const canA = new Float32Array(vn * vn);
        for (let vj = 0; vj < vn; vj++) {
          for (let vi = 0; vi < vn; vi++) {
            const i = ci * chunkCells + vi * lod;
            const j = cj * chunkCells + vj * lod;
            const k = vj * vn + vi;
            const h = this.heights[j * GRID_N + i];
            pos[k * 3] = -HALF + i * CELL;
            pos[k * 3 + 1] = h;
            pos[k * 3 + 2] = -HALF + j * CELL;
            const hx = this.gridH(i + 1, j) - this.gridH(i - 1, j);
            const hz = this.gridH(i, j + 1) - this.gridH(i, j - 1);
            const nx = -hx;
            const ny = 2 * CELL;
            const nz = -hz;
            const inv = 1 / Math.hypot(nx, ny, nz);
            nrm[k * 3] = nx * inv;
            nrm[k * 3 + 1] = ny * inv;
            nrm[k * 3 + 2] = nz * inv;
            this.surfaceInfo(j * GRID_N + i, h, kindA, infoA, k * 3);
            aoA[k] = this.ao[j * GRID_N + i];
            canA[k] = this.canopy[j * GRID_N + i];
          }
        }
        const idx: number[] = [];
        for (let vj = 0; vj < res; vj++) {
          for (let vi = 0; vi < res; vi++) {
            const a = vj * vn + vi;
            const b = a + 1;
            const c = a + vn;
            const d = c + 1;
            if (pos[a * 3 + 1] < -15.5 && pos[b * 3 + 1] < -15.5 && pos[c * 3 + 1] < -15.5 && pos[d * 3 + 1] < -15.5) continue;
            // alternate the diagonal for nicer silhouettes
            if ((vi + vj) & 1) idx.push(a, c, b, b, c, d);
            else idx.push(a, c, d, a, d, b);
          }
        }
        if (!idx.length) continue;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
        geo.setAttribute('aqKind', new THREE.BufferAttribute(kindA, 3));
        geo.setAttribute('aqInfo', new THREE.BufferAttribute(infoA, 3));
        geo.setAttribute('aqAO', new THREE.BufferAttribute(aoA, 1));
        geo.setAttribute('aqCanopy', new THREE.BufferAttribute(canA, 1));
        geo.setIndex(idx);
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = maxH > 0.5;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
      }
    }
    // the endless seabed under everything
    const floorGeo = new THREE.PlaneGeometry(WORLD_SIZE * 3, WORLD_SIZE * 3, 1, 1);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = patchMaterial(new THREE.MeshStandardMaterial({ color: DEEP_SAND, roughness: 1 }), { caustics: true, detail: true });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = FLOOR_DEPTH - 1.2;
    floor.receiveShadow = false;
    floor.matrixAutoUpdate = false;
    floor.updateMatrix();
    group.add(floor);
    return group;
  }

  /** Half-float heightmap for the water shader (shore foam + wave damping). */
  createHeightTexture(res = 512): THREE.DataTexture {
    const data = new Uint16Array(res * res);
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const x = -HALF + (i + 0.5) * (WORLD_SIZE / res);
        const z = -HALF + (j + 0.5) * (WORLD_SIZE / res);
        data[j * res + i] = THREE.DataUtils.toHalfFloat(this.heightAt(x, z));
      }
    }
    const tex = new THREE.DataTexture(data, res, res, THREE.RedFormat, THREE.HalfFloatType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }
}
