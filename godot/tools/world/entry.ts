// Builds the world exactly as the web game does at load (src/game/game.ts),
// with the web game's own code, and writes it out for the Godot game: per
// archipelago the heightfield, the ground maps the island shader reads, the
// surf field and every plant, plus the plant meshes and an index of islands,
// reefs and sites, and the small tileable textures every shader samples.
// Run through tools/world/bake_world.mjs.
import * as THREE from 'three';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { MeshoptSimplifier } from 'meshoptimizer';
import { CELL, GRID_N, Terrain, WORLD_SIZE } from '../../../src/world/terrain';
import { Seas } from '../../../src/world/seas';
import { REGIONS } from '../../../src/world/regions';
import { Vegetation } from '../../../src/world/vegetation';
import { buildShore } from '../../../src/world/shore';
import { createCausticTexture, createFoamTexture, createNoiseTexture, createWaterNormalTexture } from '../../../src/render/textures';
import { createMoonTexture } from '../../../src/render/nightSky';
import { findPortSite, findTradeSites, portClearings } from '../../../src/port/site';
import { BRUMAS_NAMES, Hazards, NAMES as MAELSTROM_NAMES } from '../../../src/game/hazards';
import { campClearings, findCampSites } from '../../../src/shore/ground';
import { BRUMAS_FORT_KINDS, BRUMAS_FORT_NAMES, findFortSites, fortClearings } from '../../../src/shore/fortKit';

const OUT = process.argv[2];
if (!OUT) throw new Error('usage: entry.mjs <out dir>');

// ------------------------------------------------------------------ the world, as game.ts builds it

/** Where a voyage starts (Game.spawnPoint). */
const SPAWN = new THREE.Vector3(40, 0, 210);
const [homeR, mistR] = REGIONS;
const home = new Terrain(homeR.seed);
const mist = new Terrain(mistR.seed, { ox: mistR.x, oz: mistR.z, style: 'brumas' });
const seas = new Seas([home, mist]);
home.bakeAO(2);
mist.bakeAO(2);
const site = findPortSite(home, SPAWN);
const tradeSites = [...findTradeSites(home, 4, [site]), ...findTradeSites(mist, 2, [], mistR)];
const towns = [site, ...tradeSites].flatMap(portClearings);
const fortSites = [
  ...findFortSites(home, [...towns, { x: SPAWN.x, z: SPAWN.z, r: 380 }], [site.island], 3),
  ...findFortSites(mist, towns, [], 2, BRUMAS_FORT_NAMES, BRUMAS_FORT_KINDS),
];
const fortGround = fortSites.flatMap(fortClearings);
const clear = [
  { x: SPAWN.x, z: SPAWN.z, r: 380 },
  { x: 0, z: 150, r: 300 },
  ...[site, ...tradeSites].map((t) => ({ x: t.x, z: t.z, r: 260 })),
  ...fortSites.map((f) => ({ x: f.x, z: f.z, r: 280 })),
];
const hazards = new Hazards(seas, [
  { cx: homeR.x, cz: homeR.z, names: MAELSTROM_NAMES, avoid: clear, seed: 4242 },
  { cx: mistR.x, cz: mistR.z, names: BRUMAS_NAMES, avoid: clear, seed: 5151 },
]);
const camps = [...findCampSites(home, [...towns, ...fortGround], site.island), ...findCampSites(mist, [...towns, ...fortGround], null)];
// full density: the phone thins it by tier
const veg = new Vegetation(seas, 1, [...towns, ...campClearings(camps), ...fortGround], false);
veg.build();

// ------------------------------------------------------------------ writers

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf: Uint8Array) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
/** An 8-bit RGBA PNG. */
function png(w: number, h: number, rgba: Uint8Array) {
  const raw = new Uint8Array(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ];
  return Buffer.concat(parts);
}
const u8 = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
const half = THREE.DataUtils.toHalfFloat;
const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** Writes raw bytes zlib-deflated (Godot: PackedByteArray.decompress(size, COMPRESSION_DEFLATE)); returns the raw size. */
function writeZ(path: string, a: ArrayBufferView) {
  const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  writeFileSync(path, deflateSync(b, { level: 9 }));
  return b.byteLength;
}

// ------------------------------------------------------------------ one archipelago's ground

/**
 * height.bin: the 2 m heightfield, GRID_N x GRID_N pairs of half floats (row
 * by row along +x, rows along +z from the square's south-west corner): the
 * height (m), and the open-sea coral (0..1), which the sea foams over. Every
 * .bin is zlib-deflated; world.json gives its unpacked size.
 * ground.png (GRID_N square, a texel per grid point): the surface normal's
 * x and z, the open-sea coral, and what the rain carved (0.5 = nothing).
 * reef.bin: the coral again, a byte per grid point.
 * cover.png (the same grid): baked occlusion, tree cover, bare summit rock
 * and the volcano's crater.
 * isle.png (every fourth grid point): which kind of island owns the ground
 * (volcanic, atoll, rocky; none of them is lush) and its tint.
 * shore.bin: the surf field (512 square, half-float RGBA): travel time to
 * the shore, the seaward direction and the exposure to the swell.
 */
function writeGround(t: Terrain, dir: string) {
  const N = GRID_N;
  const H = t.heights;
  const tt = t as unknown as {
    reefMask: Float32Array;
    surfaceInfo(k: number, h: number, kind: Float32Array, info: Float32Array, o: number): void;
  };
  const hb = new Uint16Array(N * N * 2);
  for (let k = 0; k < N * N; k++) {
    hb[k * 2] = half(H[k]);
    hb[k * 2 + 1] = half(u8(tt.reefMask[k]) / 255);
  }
  const heightSize = writeZ(join(dir, 'height.bin'), hb);

  const gh = (i: number, j: number) => H[Math.min(N - 1, Math.max(0, j)) * N + Math.min(N - 1, Math.max(0, i))];
  const ground = new Uint8Array(N * N * 4);
  const cover = new Uint8Array(N * N * 4);
  const kind = new Float32Array(3);
  const info = new Float32Array(3);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      // the normal as Terrain.buildMeshes works it out
      const nx = -(gh(i + 1, j) - gh(i - 1, j));
      const nz = -(gh(i, j + 1) - gh(i, j - 1));
      const inv = 1 / Math.hypot(nx, 2 * CELL, nz);
      ground[k * 4] = u8(nx * inv * 0.5 + 0.5);
      ground[k * 4 + 1] = u8(nz * inv * 0.5 + 0.5);
      ground[k * 4 + 2] = u8(tt.reefMask[k]);
      ground[k * 4 + 3] = u8(t.erosion[k] * 0.5 + 0.5);
      kind.fill(0);
      info.fill(0);
      tt.surfaceInfo(k, H[k], kind, info, 0);
      cover[k * 4] = u8(t.ao[k]);
      cover[k * 4 + 1] = u8(t.canopy[k]);
      cover[k * 4 + 2] = u8(info[1]);
      cover[k * 4 + 3] = u8(info[2]);
    }
  }
  writeFileSync(join(dir, 'ground.png'), png(N, N, ground));
  // the reef mask again on its own, for the keel (Region.reef_at)
  const reef = new Uint8Array(N * N);
  for (let k = 0; k < N * N; k++) reef[k] = u8(tt.reefMask[k]);
  const reefSize = writeZ(join(dir, 'reef.bin'), reef);
  writeFileSync(join(dir, 'cover.png'), png(N, N, cover));

  const M = (N - 1) / 4 + 1;
  const isle = new Uint8Array(M * M * 4);
  for (let j = 0; j < M; j++) {
    for (let i = 0; i < M; i++) {
      const k = j * 4 * N + i * 4;
      kind.fill(0);
      info.fill(0);
      tt.surfaceInfo(k, H[k], kind, info, 0);
      const o = (j * M + i) * 4;
      isle[o] = u8(kind[0]);
      isle[o + 1] = u8(kind[1]);
      isle[o + 2] = u8(kind[2]);
      isle[o + 3] = u8(info[0] * 0.5 + 0.5);
    }
  }
  writeFileSync(join(dir, 'isle.png'), png(M, M, isle));

  const surf = buildShore(t);
  const shoreSize = writeZ(join(dir, 'shore.bin'), surf.image.data as unknown as Uint16Array);
  return { shoreRes: surf.image.width, heightSize, shoreSize, reefSize };
}

// ------------------------------------------------------------------ the ground's meshes

// The island ground as the web draws it (Terrain.buildMeshes, TerrainLod):
// 64 m chunks of the 2 m grid, each simplified to a few error budgets, every
// level skirted along the chunk's rim so neighbours at different levels never
// gap, the beaches and the shallows by them never moved. Only the indices are
// written: every chunk draws the same template (its grid row by row, then a
// copy of each rim vertex for the skirt) and the Godot vertex shader lifts
// each vertex to its own height from the height map.
//
// The Godot sea is opaque, so ground the water always covers is never drawn:
// the shallows' floor comes from the ocean shader. A cell is dropped once all
// its corners lie deeper than CUT, a chunk once nothing in it reaches CUT.

const CHUNK = 32;
const VN = CHUNK + 1;
const CUT = -1.6;
/** Deviation (m) each level may have, finest first (TerrainLod.LEVELS). */
const LEVELS = [0.05, 0.14, 0.35, 0.8];
/** Heights that never move (TerrainLod.SHORE_BAND). */
const SHORE_BAND = [-0.8, 1];
/** Ground under water may stray further (TerrainLod.UNDER_SCALE). */
const UNDER_SCALE = 1.8;
/** How far the skirts hang (m, TerrainLod.SKIRT_DROP). */
const SKIRT_DROP = 1.2;

/** For each template grid vertex on the rim, its skirt copy (else -1); the template's size. */
const SKIRT_OF = new Int32Array(VN * VN).fill(-1);
let TEMPLATE_N = VN * VN;
for (let vj = 0; vj < VN; vj++) {
  for (let vi = 0; vi < VN; vi++) {
    if (vi > 0 && vi < CHUNK && vj > 0 && vj < CHUNK) continue;
    SKIRT_OF[vj * VN + vi] = TEMPLATE_N++;
  }
}

/**
 * A level's surface plus a skirt hanging from each of its open rim edges,
 * two triangles per edge down to the edge's skirt copies, facing out of the
 * chunk (TerrainLod.skirted).
 */
function skirted(idx: Uint32Array, pos: Float32Array): number[] {
  const n = TEMPLATE_N;
  const edges = new Map<number, number>();
  for (let t = 0; t < idx.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = idx[t + e];
      const b = idx[t + ((e + 1) % 3)];
      const key = a < b ? a * n + b : b * n + a;
      if (edges.has(key)) edges.set(key, -1);
      else edges.set(key, idx[t + ((e + 2) % 3)]);
    }
  }
  const out = Array.from(idx);
  for (const [key, c] of edges) {
    if (c < 0) continue;
    const a = Math.floor(key / n);
    const b = key - a * n;
    const a2 = SKIRT_OF[a];
    const b2 = SKIRT_OF[b];
    if (a2 < 0 || b2 < 0) continue;
    // (b - a) x down, against the way in to the triangle the edge belongs to
    const abx = pos[b * 3] - pos[a * 3];
    const abz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const nx = abz;
    const nz = -abx;
    const inx = pos[c * 3] - pos[a * 3];
    const inz = pos[c * 3 + 2] - pos[a * 3 + 2];
    if (nx * inx + nz * inz > 0) out.push(a, b2, b, a, a2, b2);
    else out.push(a, b, b2, a, b2, a2);
  }
  return out;
}

interface ChunkOut {
  i: number;
  j: number;
  y0: number;
  y1: number;
  isle: number;
  levels: [number, number, number][];
}

/**
 * ground.bin: every chunk's levels' indices (uint32, wound clockwise as Godot
 * draws front faces), back to back. ground.json lists the chunks: grid
 * position, height range, the island they belong to and, per level, its
 * error (m), first index and index count.
 */
async function writeChunks(t: Terrain, dir: string, isleIds: number[]) {
  await MeshoptSimplifier.ready;
  const N = GRID_N;
  const H = t.heights;
  const out: number[] = [];
  const chunks: ChunkOut[] = [];
  const chunksPer = (N - 1) / CHUNK;
  const pos = new Float32Array(TEMPLATE_N * 3);
  const lock = new Uint8Array(TEMPLATE_N);
  const noAttr = new Float32Array(TEMPLATE_N);
  let tris = 0;
  for (let cj = 0; cj < chunksPer; cj++) {
    for (let ci = 0; ci < chunksPer; ci++) {
      let maxH = -Infinity;
      let minH = Infinity;
      let top = 0;
      for (let vj = 0; vj < VN; vj++) {
        for (let vi = 0; vi < VN; vi++) {
          const k = (cj * CHUNK + vj) * N + ci * CHUNK + vi;
          const h = H[k];
          const v = vj * VN + vi;
          pos[v * 3] = vi * CELL;
          pos[v * 3 + 1] = h;
          pos[v * 3 + 2] = vj * CELL;
          lock[v] = h >= SHORE_BAND[0] && h <= SHORE_BAND[1] ? 1 : 0;
          if (h > maxH) {
            maxH = h;
            top = k;
          }
          minH = Math.min(minH, h);
          const s = SKIRT_OF[v];
          if (s >= 0) {
            pos[s * 3] = pos[v * 3];
            pos[s * 3 + 1] = h - SKIRT_DROP;
            pos[s * 3 + 2] = pos[v * 3 + 2];
          }
        }
      }
      if (maxH < CUT) continue;
      const idx: number[] = [];
      for (let vj = 0; vj < CHUNK; vj++) {
        for (let vi = 0; vi < CHUNK; vi++) {
          const a = vj * VN + vi;
          const b = a + 1;
          const c = a + VN;
          const d = c + 1;
          if (pos[a * 3 + 1] < CUT && pos[b * 3 + 1] < CUT && pos[c * 3 + 1] < CUT && pos[d * 3 + 1] < CUT) continue;
          // alternate the diagonal for nicer silhouettes
          if ((vi + vj) & 1) idx.push(a, c, b, b, c, d);
          else idx.push(a, c, d, a, d, b);
        }
      }
      if (!idx.length) continue;
      const base = Uint32Array.from(idx);
      const scale = maxH < -1 ? UNDER_SCALE : 1;
      const levels: [number, number[]][] = [[0, skirted(base, pos)]];
      for (const e of LEVELS) {
        const [r] = MeshoptSimplifier.simplifyWithAttributes(base, pos, 3, noAttr, 1, [0], lock, 0, e * scale, ['ErrorAbsolute']);
        // (a piece that melts away entirely keeps its last level: Godot takes no empty one)
        if (!r.length) break;
        // (a level that saves too little isn't worth its indices)
        if (r.length > base.length * 0.9) continue;
        const prev = levels[levels.length - 1][1];
        const sk = skirted(r, pos);
        if (sk.length >= prev.length) continue;
        levels.push([e * scale, sk]);
      }
      const rec: ChunkOut = {
        i: ci,
        j: cj,
        y0: r3(Math.max(minH, CUT - 0.5) - SKIRT_DROP),
        y1: r3(maxH),
        isle: nearestIsle(t, isleIds, top),
        levels: [],
      };
      for (const [err, li] of levels) {
        rec.levels.push([r3(err), out.length, li.length]);
        // clockwise, as Godot draws front faces
        for (let k = 0; k < li.length; k += 3) out.push(li[k], li[k + 2], li[k + 1]);
      }
      tris += levels[0][1].length / 3;
      chunks.push(rec);
    }
  }
  const size = writeZ(join(dir, 'ground.bin'), Uint32Array.from(out));
  writeFileSync(join(dir, 'ground.json'), JSON.stringify({ chunk: CHUNK, template: TEMPLATE_N, skirt: SKIRT_DROP, size, chunks }));
  return { n: chunks.length, tris };
}

/** The island (by its Seas index) nearest grid point k, by distance to its shore. */
function nearestIsle(t: Terrain, ids: number[], k: number) {
  const x = t.x0 + (k % GRID_N) * CELL;
  const z = t.z0 + Math.floor(k / GRID_N) * CELL;
  let best = -1;
  let bd = Infinity;
  t.islands.forEach((isl, n) => {
    const d = Math.hypot(isl.x - x, isl.z - z) - isl.r * Math.max(isl.stretch, 1);
    if (d < bd) {
      bd = d;
      best = ids[n];
    }
  });
  // open-sea reefs and shoals far from any island belong to none
  return bd < 260 ? best : -1;
}

// ------------------------------------------------------------------ plants

/** The plantings, in the order Vegetation.build adds them, and how many meshes (variants) each has. */
const KINDS: [string, number, string][] = [
  ['palm', 3, 'palm'], ['tree', 6, 'tree'], ['treeFern', 3, 'palm'], ['banana', 2, 'banana'], ['bush', 3, 'bush'],
  ['flowerBush', 4, 'bush'], ['fern', 2, 'cover'], ['tuft', 3, 'cover'], ['dune', 2, 'cover'], ['wildflower', 4, 'cover'],
  ['beach', 3, 'beach'], ['coconuts', 2, 'beach'], ['rock', 2, 'rock'], ['drift', 2, 'drift'],
];

interface Batch {
  mesh: THREE.InstancedMesh;
  mat: Float32Array;
  col: Float32Array;
  n: number;
  shadows: boolean;
  role: 'near' | 'mid' | 'shadow' | 'far' | 'farShadow' | 'cover';
  lodPx: number;
  midPx: number;
}
interface Flora { nearB: Batch[]; farB: Batch[]; alwaysB: Batch[] }

const geoIds = new Map<THREE.BufferGeometry, number>();
const geoList: THREE.BufferGeometry[] = [];
const geoId = (g: THREE.BufferGeometry | undefined) => {
  if (!g) return -1;
  let id = geoIds.get(g);
  if (id === undefined) {
    id = geoList.length;
    geoIds.set(g, id);
    geoList.push(g);
  }
  return id;
};

/** Side of the squares (m) the plants are drawn in, each square picking its own level. */
const PLANT_CELL = 64;

/**
 * Each set is one mesh variant of one kind on one island, with the meshes it
 * is drawn with up close (hi), in between (mid), in the shadow map up close
 * (shadow) and far off (lo). Its plants are sorted into PLANT_CELL squares;
 * cells lists, per square: its grid position, first plant and plant count,
 * the range of the plants' footings (y0, y1), the box their trunks stand in
 * (x0, z0, x1, z1, about the archipelago's centre) and their mean and largest
 * scale. plants.bin holds, per plant, Godot's MultiMesh layout about the
 * archipelago's centre: the transform's three rows, then the plant's tint
 * (rgb, and a random phase in a).
 */
function writePlants(t: Terrain, cx: number, cz: number, regionIslands: number[], dir: string) {
  const vv = veg as unknown as { flora: Flora[]; lists: Record<string, { variant: number }[]>[] };
  const floats: number[] = [];
  const sets: object[] = [];
  for (const gi of regionIslands) {
    const f = vv.flora[gi];
    const L = vv.lists[gi];
    const expected: { kind: string; variant: number; n: number; material: string }[] = [];
    for (const [kind, nv, material] of KINDS) {
      for (let v = 0; v < nv; v++) {
        const n = L[kind].filter((p) => p.variant % nv === v).length;
        if (n) expected.push({ kind, variant: v, n, material });
      }
    }
    // a set's batches all share its matrix array
    const byMat = new Map<Float32Array, Partial<Record<Batch['role'], Batch>>>();
    for (const b of [...f.nearB, ...f.alwaysB, ...f.farB]) {
      let s = byMat.get(b.mat);
      if (!s) byMat.set(b.mat, (s = {}));
      s[b.role] = b;
    }
    const found = [...byMat.values()];
    if (found.length !== expected.length) throw new Error(`island ${gi}: ${found.length} plant sets, expected ${expected.length}`);
    found.forEach((s, si) => {
      const e = expected[si];
      const near = (s.near ?? s.cover)!;
      if (near.n !== e.n) throw new Error(`island ${gi} ${e.kind}#${e.variant}: ${near.n} plants, expected ${e.n}`);
      const cellOf = (k: number) => {
        const ci = Math.floor((near.mat[k * 16 + 12] - t.x0) / PLANT_CELL);
        const cj = Math.floor((near.mat[k * 16 + 14] - t.z0) / PLANT_CELL);
        return cj * 64 + ci;
      };
      const order = Array.from({ length: near.n }, (_, k) => k).sort((a, b) => cellOf(a) - cellOf(b));
      const cells: number[][] = [];
      for (const k of order) {
        const m = near.mat.subarray(k * 16, k * 16 + 16);
        const key = cellOf(k);
        let c = cells[cells.length - 1];
        if (!c || c[0] + c[1] * 64 !== key) {
          c = [key % 64, Math.floor(key / 64), floats.length / 16, 0, Infinity, -Infinity, Infinity, Infinity, -Infinity, -Infinity, 0, 0];
          cells.push(c);
        }
        const x = m[12] - cx;
        const z = m[14] - cz;
        const sc = Math.hypot(m[0], m[1], m[2]);
        c[3]++;
        c[4] = Math.min(c[4], m[13]);
        c[5] = Math.max(c[5], m[13]);
        c[6] = Math.min(c[6], x);
        c[7] = Math.min(c[7], z);
        c[8] = Math.max(c[8], x);
        c[9] = Math.max(c[9], z);
        c[10] += sc;
        c[11] = Math.max(c[11], sc);
        for (let r = 0; r < 3; r++) floats.push(m[r], m[4 + r], m[8 + r], m[12 + r] - (r === 0 ? cx : r === 2 ? cz : 0));
        floats.push(near.col[k * 3], near.col[k * 3 + 1], near.col[k * 3 + 2], ((m[12] * 0.13 + m[14] * 0.17) % 1 + 1) % 1);
      }
      for (const c of cells) {
        c[10] /= c[3];
        for (let k = 4; k < 12; k++) c[k] = r3(c[k]);
      }
      sets.push({
        island: gi,
        kind: e.kind,
        variant: e.variant,
        material: e.material,
        count: near.n,
        // (palms and trees cast through their lighter shadow stand-in)
        shadows: near.shadows || !!s.shadow,
        lodPx: near.lodPx,
        midPx: near.midPx,
        hi: geoId(near.mesh.geometry),
        mid: geoId(s.mid?.mesh.geometry),
        shadow: geoId(s.shadow?.mesh.geometry),
        lo: geoId(s.far?.mesh.geometry),
        cells,
      });
    });
  }
  const size = writeZ(join(dir, 'plants.bin'), new Float32Array(floats));
  return { sets, size, cell: PLANT_CELL };
}

/**
 * flora.bin: every plant mesh, back to back: float32 positions and normals,
 * sRGB colour bytes (alpha 0 marks bark, which the web paints with negative
 * colour), uint32 indices wound clockwise, as Godot draws front faces.
 * flora.json says where each one lies.
 */
function writeFloraMeshes(dir: string) {
  mkdirSync(dir, { recursive: true });
  const parts: Uint8Array[] = [];
  let at = 0;
  const put = (a: ArrayBufferView) => {
    const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    const o = at;
    parts.push(b);
    at += b.byteLength;
    const pad = (4 - (at % 4)) % 4;
    if (pad) {
      parts.push(new Uint8Array(pad));
      at += pad;
    }
    return o;
  };
  const toS = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  const meshes = geoList.map((g, id) => {
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    let nrm = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
    if (!nrm) {
      g.computeVertexNormals();
      nrm = g.getAttribute('normal') as THREE.BufferAttribute;
    }
    const col = g.getAttribute('color') as THREE.BufferAttribute | undefined;
    const n = pos.count;
    const P = new Float32Array(n * 3);
    const Nn = new Float32Array(n * 3);
    const C = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      P[i * 3] = pos.getX(i);
      P[i * 3 + 1] = pos.getY(i);
      P[i * 3 + 2] = pos.getZ(i);
      Nn[i * 3] = nrm.getX(i);
      Nn[i * 3 + 1] = nrm.getY(i);
      Nn[i * 3 + 2] = nrm.getZ(i);
      const r = col ? col.getX(i) : 1;
      const gg = col ? col.getY(i) : 1;
      const b = col ? col.getZ(i) : 1;
      C[i * 4] = u8(toS(Math.abs(r)));
      C[i * 4 + 1] = u8(toS(Math.abs(gg)));
      C[i * 4 + 2] = u8(toS(Math.abs(b)));
      C[i * 4 + 3] = gg < 0 ? 0 : 255;
    }
    let I: Uint32Array;
    if (g.index) I = Uint32Array.from(g.index.array as ArrayLike<number>);
    else I = Uint32Array.from({ length: n }, (_, i) => i);
    for (let k = 0; k < I.length; k += 3) {
      const t = I[k + 1];
      I[k + 1] = I[k + 2];
      I[k + 2] = t;
    }
    g.computeBoundingSphere();
    const bs = g.boundingSphere!;
    return {
      id,
      verts: n,
      indices: I.length,
      radius: r3(bs.radius),
      centre: [r3(bs.center.x), r3(bs.center.y), r3(bs.center.z)],
      pos: put(P),
      nrm: put(Nn),
      col: put(C),
      idx: put(I),
    };
  });
  const size = writeZ(join(dir, 'flora.bin'), Buffer.concat(parts));
  writeFileSync(join(dir, 'flora.json'), JSON.stringify({ size, meshes }, null, 0));
  return meshes.length;
}

// ------------------------------------------------------------------ the index

const islandIndex = new Map(seas.islands.map((isl, i) => [isl, i]));
const regions: object[] = [];
const report: string[] = [];
for (const [ri, t] of [home, mist].entries()) {
  const R = REGIONS[ri];
  const dir = join(OUT, R.id);
  mkdirSync(dir, { recursive: true });
  const { shoreRes, heightSize, shoreSize, reefSize } = writeGround(t, dir);
  const mine = t.islands.map((isl) => islandIndex.get(isl)!);
  const ground = await writeChunks(t, dir, mine);
  const plants = writePlants(t, R.x, R.z, mine, dir);
  writeFileSync(join(dir, 'plants.json'), JSON.stringify({ cell: plants.cell, size: plants.size, sets: plants.sets }, null, 0));
  const isMine = (x: number, z: number) => t.contains(x, z);
  report.push(`${R.id} ${t.islands.length} isles, ${t.reefs.length} reefs, ${ground.n} ground chunks (${ground.tris} triangles in full)`);
  regions.push({
    id: R.id,
    name: R.name,
    motto: R.motto,
    x: R.x,
    z: R.z,
    x0: t.x0,
    z0: t.z0,
    shore: shoreRes,
    sizes: { height: heightSize, shore: shoreSize, reef: reefSize },
    islands: t.islands.map((isl) => ({
      id: islandIndex.get(isl),
      name: isl.name,
      kind: isl.kind,
      x: r1(isl.x),
      z: r1(isl.z),
      r: r1(isl.r),
      peak: r1(isl.peak),
      rot: r3(isl.rot),
      stretch: r3(isl.stretch),
      tint: r3(isl.tint),
      towers: isl.towers?.map((tw) => ({ x: r1(tw.x), z: r1(tw.z), r: r1(tw.r), h: r1(tw.h) })),
    })),
    reefs: t.reefs.map((rf) => ({ name: rf.name, kind: rf.kind, x: r1(rf.x), z: r1(rf.z), r: r1(rf.r) })),
    maelstroms: hazards.maelstroms.filter((m) => isMine(m.x, m.z)).map((m) => ({ name: m.name, x: r1(m.x), z: r1(m.z), r: r1(m.r0) })),
    ports: [site, ...tradeSites].filter((s) => isMine(s.x, s.z)).map((s, i) => ({
      island: s.island.name, home: s === site, x: r1(s.x), z: r1(s.z), nx: r3(s.nx), nz: r3(s.nz), depth: r1(s.depth), index: i,
    })),
    forts: fortSites.filter((s) => isMine(s.x, s.z)).map((s) => ({ name: s.name, island: s.island.name, style: s.style ?? null, x: r1(s.x), z: r1(s.z), yaw: r3(s.yaw), y: r3(s.y), drop: r3(s.drop) })),
    camps: camps.filter((s) => isMine(s.x, s.z)).map((s) => ({ island: s.island.name, x: r1(s.x), z: r1(s.z), yaw: r3(s.yaw), y: r3(s.y) })),
  });
}

// the noise, ripple, caustic and foam maps and the moon's face, byte for
// byte as the web game generates them at start: the coral heads, the
// seagrass, the caustics, the lace in the foam and the moon's seas and
// craters lie exactly where they do there
const ART = join(OUT, '..', 'art');
for (const [name, tex] of [
  ['noise', createNoiseTexture()],
  ['water_normal', createWaterNormalTexture()],
  ['caustics', createCausticTexture()],
  ['foam', createFoamTexture()],
  ['moon', createMoonTexture()],
] as const) {
  const img = tex.image as { data: Uint8Array; width: number; height: number };
  writeFileSync(join(ART, `${name}.png`), png(img.width, img.height, img.data));
}

const floraN = writeFloraMeshes(join(OUT, 'flora'));
writeFileSync(
  join(OUT, 'world.json'),
  JSON.stringify({ version: 1, size: WORLD_SIZE, cell: CELL, grid: GRID_N, spawn: [SPAWN.x, SPAWN.z], regions }, null, 1),
);
console.log(`world: ${report.join('; ')}; ${floraN} plant meshes`);
