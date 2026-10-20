import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, mulberry32 } from '../core/noise';
import { Bucket, Builder, C, lin, shade } from '../port/port';
import { PropGeo } from '../port/pirates';
import { Island, Terrain } from '../world/terrain';
import type { CampLayout } from './kit';
import type { Disc } from './ground';

// The Brethren's island forts: a square of pale coral-stone walls on a rise
// above the sea, battered out at the foot and banded with a rounded cordon,
// a round bastion at every corner with a domed sentry box (a garita) hung
// off its parapet, guns in the embrasures of the three seaward walls, an
// arched gate and a ramp on the landward side, and inside a flagged plaza
// with barracks under red tiles, a vaulted powder magazine, a brazier and a
// tall flagstaff. Built once at load in its own frame (+z out to sea, the
// plaza floor at y = 0), with the shore's materials, so nothing compiles
// mid-voyage.

const TAU = Math.PI * 2;
/** Half the fort's width (outer face at the parapet), the walls' thickness and the rampart's height. */
export const FORT_H = 12.5;
export const FORT_T = 3.2;
export const FORT_WH = 4.4;
/** Parapet height and thickness above the rampart. */
const PH = 1.25;
const PT = 1.0;
/** Top of the battered foot (the talud), and the gate's width and lintel. */
const TB = FORT_WH * 0.45;
export const GATE_W = 3.2;
const GATE_H = 3.2;
const TOWER_R = 3.0;
/** Where the fort's guns stand (fort frame, on the rampart), and which way each embrasure looks. */
export const GUN_SPOTS: { x: number; z: number; yaw: number }[] = [
  { x: -4.6, z: FORT_H - 1.6, yaw: 0 },
  { x: 4.6, z: FORT_H - 1.6, yaw: 0 },
  { x: FORT_H - 1.6, z: 4.8, yaw: Math.PI / 2 },
  { x: -(FORT_H - 1.6), z: 4.8, yaw: -Math.PI / 2 },
];
/** The trunnions' height above the rampart. */
export const GUN_PIVOT = 0.78;

export interface FortSite {
  island: Island;
  x: number;
  z: number;
  /** The fort's facing: local +z (its sea wall's outward face) points along (sin yaw, cos yaw). */
  yaw: number;
  /** World height of the plaza floor. */
  y: number;
  /** Plaza floor down to the lowest ground under the walls (m). */
  drop: number;
}

export interface FortLayout extends CampLayout {
  /** World positions of the guns' carriages (on the rampart) and their embrasures' facings (world yaw). */
  guns: { pos: THREE.Vector3; yaw: number }[];
  /** The ramp from the gate down to the ground: its foot (fort frame z) and the ground height there (world). */
  rampLen: number;
  rampFootY: number;
  /** The gate's two door leaves (hinged at the jambs), for swinging open. */
  doors: THREE.Group[];
  /** How far the colours come down the staff when struck. */
  flagDrop: number;
}

/** Fort frame → world. */
export function fortToWorld(s: { x: number; z: number; yaw: number; y?: number }, lx: number, lz: number, out = new THREE.Vector3()) {
  const cy = Math.cos(s.yaw);
  const sy = Math.sin(s.yaw);
  return out.set(s.x + lx * cy + lz * sy, s.y ?? 0, s.z - lx * sy + lz * cy);
}

/** World → fort frame (x across, z out to sea). */
export function worldToFort(s: { x: number; z: number; yaw: number }, x: number, z: number, out: { x: number; z: number }) {
  const cy = Math.cos(s.yaw);
  const sy = Math.sin(s.yaw);
  const dx = x - s.x;
  const dz = z - s.z;
  out.x = dx * cy - dz * sy;
  out.z = dx * sy + dz * cy;
  return out;
}

// ------------------------------------------------------------------ sites

const FORT_NAMES = ['Castillo São Felipe', 'Forte Sainte-Bárbara', 'Kasteel do Morro', 'Fuerte San Cristóvão', 'Bastión de Yaguana'];

/**
 * Rises above the sea for the forts: a flat shoulder of dry ground a short
 * way in from the coast, looking out over water deep enough for a ship to
 * come and fight it, with walkable ground at its back for the gate. The best
 * spot on each island the towns leave free, then the `count` of them spread
 * widest across the archipelago.
 */
export function findFortSites(terrain: Terrain, avoid: Disc[], skip: Island[], count: number): (FortSite & { name: string })[] {
  const H = FORT_H;
  const per: { site: FortSite; score: number }[] = [];
  terrain.islands.forEach((isl, idx) => {
    if (skip.includes(isl) || isl.kind === 'atoll' || isl.r < 48) return;
    const rnd = mulberry32(Math.floor(isl.seed * 613) + idx * 17 + 11);
    let best: { site: FortSite; score: number } | null = null;
    for (let k = 0; k < 140; k++) {
      const a = rnd() * TAU;
      const f = 0.25 + rnd() * 0.6;
      const x = isl.x + Math.cos(a) * isl.r * f * isl.stretch;
      const z = isl.z + Math.sin(a) * isl.r * f;
      const ox = x - isl.x;
      const oz = z - isl.z;
      const ol = Math.hypot(ox, oz) || 1;
      const yaw = Math.atan2(ox / ol, oz / ol) + (rnd() - 0.5) * 0.5;
      const s: FortSite = { island: isl, x, z, yaw, y: 0, drop: 0 };
      const G = (lx: number, lz: number) => {
        const p = fortToWorld(s, lx, lz, _p);
        return terrain.heightAt(p.x, p.z);
      };
      if (avoid.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + H + 34)) continue;
      // a shoulder of ground flat enough for the walls
      let lo = Infinity;
      let hi = -Infinity;
      for (let u = -H; u <= H; u += 3.125) {
        for (let v = -H; v <= H; v += 3.125) {
          const h = G(u, v);
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
        }
      }
      // a slope is fine (the walls stand taller on the low side, like any sea fort's), a cliff isn't
      if (lo < 0.25 || hi > 12 || hi - lo > 7.5) continue;
      // the coast a short way off its sea wall, then deep water for a ship to fight from
      let coast = -1;
      let deep = -1;
      for (let d = H; d < H + 140; d += 2) {
        const h = G(0, d);
        if (coast < 0 && h < 0) coast = d;
        if (coast >= 0 && h < -4.5) {
          deep = d;
          break;
        }
      }
      if (coast < 0 || coast > H + 60 || deep < 0 || deep > coast + 80) continue;
      // open sea across its guns' arc, not another island's flank
      let open = 0;
      for (const da of [-0.7, -0.35, 0, 0.35, 0.7]) {
        const ang = s.yaw + da;
        const px = x + Math.sin(ang) * (deep + 70);
        const pz = z + Math.cos(ang) * (deep + 70);
        if (terrain.heightAt(px, pz) < -3) open++;
      }
      if (open < 3) continue;
      // walkable ground at its back for the gate and the ramp
      const back = G(0, -H - 9);
      if (back < 0.3 || back > hi + 1 || hi + 0.3 - back > 6) continue;
      // a low shoulder over the sea: commanding, but not so high a ship's guns can't reach it
      const score = -Math.abs(coast - H - 16) * 0.05 - (hi - lo) * 0.3 - Math.abs(hi - 6) * 0.14 + open * 0.2 + rnd() * 0.3;
      if (!best || score > best.score) {
        s.y = hi + 0.35;
        s.drop = s.y - Math.min(lo, back) + 2.4;
        best = { site: s, score };
      }
    }
    if (best) per.push(best);
  });
  // farthest-point picking, seeded with the best of the lot
  const out: (FortSite & { name: string })[] = [];
  per.sort((p, q) => q.score - p.score);
  const far = (s: FortSite) => Math.min(...[...avoid, ...out].map((o) => Math.hypot(o.x - s.x, o.z - s.z)), Infinity);
  while (out.length < count && per.length) {
    let bi = 0;
    let bd = -1;
    per.forEach((p, i) => {
      const d = out.length ? Math.min(...out.map((o) => Math.hypot(o.x - p.site.x, o.z - p.site.z))) : p.score * 100 + far(p.site) * 0.01;
      if (d > bd) {
        bd = d;
        bi = i;
      }
    });
    const s = per.splice(bi, 1)[0].site;
    out.push({ ...s, name: FORT_NAMES[out.length % FORT_NAMES.length] });
  }
  return out;
}

const _p = new THREE.Vector3();

/** Clearings round a fort for the vegetation: the walls, the glacis in front and the ramp behind. */
export function fortClearings(s: FortSite): Disc[] {
  const back = fortToWorld(s, 0, -FORT_H - 7);
  return [
    { x: s.x, z: s.z, r: FORT_H * 1.5 + 3 },
    { x: back.x, z: back.z, r: 8 },
  ];
}

// ------------------------------------------------------------------ helpers

/** Paints each triangle one colour, from its centroid and normal (flagstones, ashlar). */
function faceted(geo: THREE.BufferGeometry, paint?: (c: THREE.Vector3, n: THREE.Vector3) => THREE.Color) {
  // indexed shapes (lathes, domes, rods) keep their smooth normals; prisms come in flat
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && !(k === 'color' && !paint)) g.deleteAttribute(k);
  // a prism painted block by block already has its colours
  if (!paint) return g;
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    c.set(0, 0, 0);
    for (let j = 0; j < 3; j++) c.add(_p.fromBufferAttribute(pos, i + j));
    c.multiplyScalar(1 / 3);
    n.fromBufferAttribute(nor, i);
    const k = paint(c, n);
    for (let j = 0; j < 3; j++) {
      col[(i + j) * 3] = k.r;
      col[(i + j) * 3 + 1] = k.g;
      col[(i + j) * 3 + 2] = k.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * A solid from a convex profile in (z, y), run along x from x0 to x1: side
 * faces (cut into a grid of block-sized cells, so each can take its own tone)
 * and both end caps, every face wound outward. Flat-shaded.
 */
function prism(profile: [number, number][], x0: number, x1: number, paint: Stone, cell = 1.3, course = 0.62): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const cc = new THREE.Vector3();
  const nn = new THREE.Vector3();
  /** Two triangles of one block: its colour from the block's centre. */
  const quad = (a: number[], b: number[], c: number[], d: number[], out: THREE.Vector3) => {
    cc.set((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2);
    nn.copy(out).normalize();
    const k = paint(cc, nn);
    tri(a, b, c, out);
    tri(a, c, d, out);
    for (let i = 0; i < 6; i++) col.push(k.r, k.g, k.b);
  };
  let cz = 0;
  let cy = 0;
  for (const [z, y] of profile) {
    cz += z / profile.length;
    cy += y / profile.length;
  }
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const tri = (a: number[], b: number[], c: number[], out: THREE.Vector3) => {
    ab.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    ac.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    if (ab.cross(ac).dot(out) < 0) pos.push(...a, ...c, ...b);
    else pos.push(...a, ...b, ...c);
  };
  const N = profile.length;
  const nx = Math.max(1, Math.ceil((x1 - x0) / cell));
  for (let i = 0; i < N; i++) {
    const [za, ya] = profile[i];
    const [zb, yb] = profile[(i + 1) % N];
    const out = new THREE.Vector3(0, (ya + yb) / 2 - cy, (za + zb) / 2 - cz);
    const ny = Math.max(1, Math.ceil(Math.hypot(zb - za, yb - ya) / course));
    for (let j = 0; j < ny; j++) {
      const t0 = j / ny;
      const t1 = (j + 1) / ny;
      const z0 = za + (zb - za) * t0;
      const y0 = ya + (yb - ya) * t0;
      const z1 = za + (zb - za) * t1;
      const y1 = ya + (yb - ya) * t1;
      // joints staggered course by course, like laid stone
      const cuts = [0];
      for (let k = 1; k < nx; k++) cuts.push(k - (j % 2) * 0.5);
      if (j % 2 && nx > 1) cuts.push(nx - 0.5);
      cuts.push(nx);
      for (let k = 0; k + 1 < cuts.length; k++) {
        const xa = x0 + ((x1 - x0) * cuts[k]) / nx;
        const xb = x0 + ((x1 - x0) * cuts[k + 1]) / nx;
        if (xb - xa < 1e-4) continue;
        quad([xa, y0, z0], [xb, y0, z0], [xb, y1, z1], [xa, y1, z1], out);
      }
    }
  }
  for (const [x, sgn] of [[x0, -1], [x1, 1]] as const) {
    const out = new THREE.Vector3(sgn, 0, 0);
    for (let i = 1; i < N - 1; i++) {
      const a = [x, profile[0][1], profile[0][0]];
      const b = [x, profile[i][1], profile[i][0]];
      const c = [x, profile[i + 1][1], profile[i + 1][0]];
      cc.set(x, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3);
      const k = paint(cc, out);
      tri(a, b, c, out);
      for (let j = 0; j < 3; j++) col.push(k.r, k.g, k.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

type Stone = (c: THREE.Vector3, n: THREE.Vector3) => THREE.Color;

/** A lathe profile with its long runs cut into courses, so the stonework can take its tones. */
function densify(prof: [number, number][], step = 0.62): [number, number][] {
  const out: [number, number][] = [prof[0]];
  for (let i = 1; i < prof.length; i++) {
    const [ra, ya] = prof[i - 1];
    const [rb, yb] = prof[i];
    const n = Math.max(1, Math.ceil(Math.hypot(rb - ra, yb - ya) / step));
    for (let k = 1; k <= n; k++) out.push([ra + ((rb - ra) * k) / n, ya + ((yb - ya) * k) / n]);
  }
  return out;
}

/** Spins a geometry built facing +z (the sea wall) round to face side `k` (0 sea, 1 +x, 2 land, 3 -x). */
const toSide = (g: THREE.BufferGeometry, k: number) => g.rotateY((k * Math.PI) / 2);
/** Which wall an embrasure facing `yaw` (fort frame) is in. */
const sideOf = (yaw: number) => ((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4;
const FACE_Z = new THREE.Vector3(0, 0, 1);
const _c = new THREE.Vector3();

// limestone: warm and pale up high, darker and damp toward the foot, blocks a shade apart
const STONE = lin(0xdcc7a0);
const STONE_LO = lin(0xb19a74);
const STONE_CAP = lin(0xeedfbf);
const STONE_DAMP = lin(0x7c7457);
const FLAG = lin(0xd3c09a);
const WASH = lin(0xf1e8d6);
const TILE = lin(0xb5523a);

const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Ashlar: courses 0.62 m high, blocks 1.3 m long, each a little lighter or darker; damp at the foot. */
function ashlar(c: THREE.Vector3, n: THREE.Vector3, ground: number) {
  const along = Math.abs(n.x) > Math.abs(n.z) ? c.z : c.x;
  const course = Math.floor((c.y + 30) / 0.62);
  const block = Math.floor((along + 40 + (course % 2) * 0.65) / 1.3);
  const k = 0.9 + hash(course, block) * 0.16;
  const base = c.y < TB ? STONE_LO.clone().lerp(STONE, clamp((c.y + 1.5) / (TB + 1.5), 0, 1)) : STONE;
  const damp = clamp((ground + 1.2 - c.y) / 1.6, 0, 1) * 0.7;
  return shade(base.clone().lerp(STONE_DAMP, damp), k);
}

// ------------------------------------------------------------------ the fort

/**
 * Builds a fort into `b` in its own frame (y = 0 the plaza floor) and returns
 * where its garrison stands, its guns, its chest and flag and what's solid
 * (layout positions in world space). `ground` is the terrain's height (world).
 */
export function buildFort(b: Builder, s: FortSite, ground: (x: number, z: number) => number, seed: number): FortLayout {
  const rnd = mulberry32(seed);
  const H = FORT_H;
  const T = FORT_T;
  const WH = FORT_WH;
  const D = s.drop;
  const G = (lx: number, lz: number) => {
    const p = fortToWorld(s, lx, lz, _p);
    return ground(p.x, p.z) - s.y;
  };
  const W = (lx: number, lz: number, ly = 0) => fortToWorld(s, lx, lz).setY(s.y + ly);
  const blocks: Disc[] = [];
  const block = (lx: number, lz: number, r: number) => {
    const p = W(lx, lz);
    blocks.push({ x: p.x, z: p.z, r });
  };
  const push = (g: THREE.BufferGeometry, k: Bucket = 'wood') => b.parts[k].push(g);
  const lowG = Math.min(...[-H, 0, H].flatMap((u) => [-H, 0, H].map((v) => G(u, v))));

  // ---- the curtain walls: a battered foot, the cordon, the face, the rampart
  const talud = (d: number) => H + (TB - d) * 0.18;
  const wallProfile = (top = WH): [number, number][] => [
    [H - T, -D],
    [talud(-D), -D],
    [H, TB],
    [H, top],
    [H - T, top],
  ];
  for (let side = 0; side < 4; side++) {
    const gate = side === 2;
    const spans: [number, number][] = gate ? [[-H + 1, -GATE_W / 2], [GATE_W / 2, H - 1]] : [[-H + 1, H - 1]];
    for (const [x0, x1] of spans) {
      push(faceted(toSide(prism(wallProfile(), x0, x1, (c, n) => ashlar(c, n, lowG + 1.5)), side)));
    }
    if (gate) {
      // the lintel over the gate, and its passage floor
      const lint = toSide(prism([[H - T, GATE_H], [H + 0.02, GATE_H], [H + 0.02, WH], [H - T, WH]], -GATE_W / 2, GATE_W / 2, (c, n) => ashlar(c, n, -9)), side);
      push(faceted(lint));
      const sill = toSide(prism([[H - T - 0.02, -D], [H + 0.3, -D], [H + 0.3, 0], [H - T - 0.02, 0]], -GATE_W / 2, GATE_W / 2, (c) => shade(FLAG, 0.88 + hash(Math.floor(c.x / 0.9), Math.floor(c.z / 0.9)) * 0.14)), side);
      push(faceted(sill));
    }
    // the cordon: a rounded stone rod right round the walls where the batter ends
    const cord = new THREE.CylinderGeometry(0.17, 0.17, 2 * H - 2, 8).rotateZ(Math.PI / 2).translate(0, TB, H + 0.03);
    if (gate) {
      for (const [x0, x1] of [[-H + 1, -GATE_W / 2 - 0.55], [GATE_W / 2 + 0.55, H - 1]]) {
        const piece = new THREE.CylinderGeometry(0.17, 0.17, x1 - x0, 8).rotateZ(Math.PI / 2).translate((x0 + x1) / 2, TB, H + 0.03);
        push(faceted(toSide(piece, side), () => STONE_CAP));
      }
    } else push(faceted(toSide(cord, side), () => STONE_CAP));
    // the parapet: rounded merlons of solid stone, broken by an embrasure at each gun
    // the guns on this face, along it (in the face's own frame, before it's spun round)
    const xs = GUN_SPOTS.filter((g) => sideOf(g.yaw) === side)
      .map((g) => (side === 0 ? g.x : side === 1 ? -g.z : g.z))
      .sort((p, q) => p - q);
    const cuts: [number, number][] = [];
    let at = -H + 2.6;
    for (const gx of xs) {
      cuts.push([at, gx - 0.62]);
      at = gx + 0.62;
    }
    cuts.push([at, H - 2.6]);
    for (const [x0, x1] of cuts) {
      if (x1 - x0 < 0.3) continue;
      const rb = roundBox(x1 - x0, PH, PT, 0.22);
      rb.translate((x0 + x1) / 2, WH + PH / 2, H - PT / 2);
      push(faceted(toSide(rb, side), (c) => shade(STONE_CAP, 0.92 + hash(Math.floor(c.x * 1.3 + c.z * 1.3), 7) * 0.1)));
    }
    // sills under the embrasures, splayed so the guns can traverse
    for (const gx of xs) {
      const sill = roundBox(1.3, 0.45, PT, 0.12).translate(gx, WH + 0.22, H - PT / 2);
      push(faceted(toSide(sill, side), () => shade(STONE_CAP, 0.86)));
    }
    // a waterspout (gárgola) or two down the face
    for (const gx of side === 2 ? [-7.5, 7.5] : [-8.2, 0.3, 8.2]) {
      const spout = new THREE.BoxGeometry(0.28, 0.24, 0.9).translate(gx, WH - 0.15, H + 0.35);
      push(faceted(toSide(spout, side), () => shade(STONE_LO, 0.9)));
    }
  }
  // the rampart floor (the terreplein) between the walls' tops is their prism tops; the plaza below:
  const PL = H - T;
  const floor = new THREE.PlaneGeometry(PL * 2, PL * 2, 13, 13).rotateX(-Math.PI / 2);
  push(faceted(floor, (c) => {
    const k = 0.84 + hash(Math.floor((c.x + 40) / 1.43), Math.floor((c.z + 40) / 1.43)) * 0.2;
    // a worn path of paler stones from the gate to the flagstaff
    const path = Math.abs(c.x) < 1.6 ? 1.06 : 1;
    return shade(FLAG, k * path);
  }));
  // under the floor's edge, a skirt down into the ground so no gap shows where the walls meet it
  push(faceted(prism([[-PL, -D], [PL, -D], [PL, -0.02], [-PL, -0.02]], -PL, PL, () => shade(STONE_LO, 0.7), 40, 40)));

  // ---- round bastions at the corners, each with a garita hung off its parapet
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const cx = sx * (H - 0.7);
    const cz = sz * (H - 0.7);
    const R = TOWER_R;
    const prof: [number, number][] = [
      [0, -D],
      [R + (TB + D) * 0.18, -D],
      [R, TB],
      [R, WH],
      [R + 0.06, WH],
      [R + 0.06, WH + PH - 0.2],
      [R - 0.14, WH + PH],
      [R - PT + 0.1, WH + PH],
      [R - PT, WH + PH - 0.2],
      [R - PT, WH + 0.02],
      [0, WH + 0.02],
    ];
    const lathe = new THREE.LatheGeometry(densify(prof).map(([r, y]) => new THREE.Vector2(r, y)), 22);
    lathe.translate(cx, 0, cz);
    push(faceted(lathe, (c) => {
      if (c.y > WH - 0.01) return shade(STONE_CAP, 0.9 + hash(Math.floor(Math.atan2(c.z - cz, c.x - cx) * 4), 3) * 0.12);
      // unrolled round the drum, so the courses and joints run on
      return ashlar(_c.set(Math.atan2(c.z - cz, c.x - cx) * R, c.y, 0), FACE_Z, lowG + 1.5);
    }));
    const ring = new THREE.TorusGeometry(R + 0.03, 0.17, 6, 26).rotateX(Math.PI / 2).translate(cx, TB, cz);
    push(faceted(ring, () => STONE_CAP));
    // the garita: a little round sentry box, corbelled out over the corner on its cone
    const ga = Math.atan2(sz, sx);
    const gx = cx + Math.cos(ga) * (R - 0.55);
    const gz = cz + Math.sin(ga) * (R - 0.55);
    const gy = WH + PH - 0.25;
    const corbel = new THREE.LatheGeometry([[0.05, -1.3], [0.32, -1.0], [0.62, -0.42], [0.82, 0]].map(([r, y]) => new THREE.Vector2(r, y)), 14).translate(gx, gy, gz);
    push(faceted(corbel, (c) => shade(STONE_CAP, 0.86 + Math.floor((c.y - gy) * -3) * 0.04)));
    const box = new THREE.CylinderGeometry(0.74, 0.74, 1.85, 14, 1, true).translate(gx, gy + 0.93, gz);
    push(faceted(box, (c) => {
      // a dark slit window looking out to each side
      const a = Math.atan2(c.z - gz, c.x - gx);
      const slit = c.y > gy + 0.7 && c.y < gy + 1.4 && [ga, ga + 1.4, ga - 1.4].some((w) => Math.abs(Math.atan2(Math.sin(a - w), Math.cos(a - w))) < 0.18);
      return slit ? lin(0x2a2420) : shade(WASH, 0.95);
    }));
    const lip = new THREE.CylinderGeometry(0.86, 0.86, 0.14, 14).translate(gx, gy + 1.9, gz);
    push(faceted(lip, () => STONE_CAP));
    const dome = new THREE.SphereGeometry(0.8, 14, 6, 0, TAU, 0, Math.PI / 2).translate(gx, gy + 1.96, gz);
    push(faceted(dome, (c) => shade(STONE_CAP, 0.94 + (c.y - gy - 1.96) * 0.06)));
    b.add(new THREE.SphereGeometry(0.14, 8, 6), [gx, gy + 2.86, gz], STONE_CAP);
    b.add(new THREE.CylinderGeometry(0.05, 0.08, 0.2, 6), [gx, gy + 2.72, gz], STONE_CAP);
    block(cx, cz, R + 0.5);
  }

  // ---- the gate: an arched frame on the face, pilasters, the arms above, the doors and the ramp
  const gz0 = -H;
  const arch = new THREE.TorusGeometry(GATE_W / 2 + 0.2, 0.22, 6, 16, Math.PI).translate(0, GATE_H - GATE_W / 2 - 0.2, 0).rotateY(Math.PI).translate(0, 0, gz0 - 0.08);
  push(faceted(arch, () => STONE_CAP));
  for (const sx of [-1, 1]) {
    b.box(0.5, GATE_H - GATE_W / 2 - 0.2, 0.32, [sx * (GATE_W / 2 + 0.2), (GATE_H - GATE_W / 2 - 0.2) / 2, gz0 - 0.08], STONE_CAP, { r: 0.06 });
    // the jambs' corner blocks inside the passage
  }
  b.box(1.25, 1.45, 0.28, [0, GATE_H + 0.95, gz0 - 0.12], shade(STONE_CAP, 1.04), { r: 0.14 });
  b.box(0.72, 0.8, 0.12, [0, GATE_H + 0.98, gz0 - 0.3], lin(0xd8a640), { b: 'gold', r: 0.08 });
  b.ball(0.15, [0, GATE_H + 1.85, gz0 - 0.15], lin(0xd8a640), { b: 'gold' });
  // the ramp: from the gate down to the ground behind the fort, with low kerbs
  let rampLen = 3;
  let foot = 0;
  for (let it = 0; it < 3; it++) {
    foot = G(0, gz0 - rampLen);
    rampLen = clamp(-foot * 2.1 + 1.5, 2.5, 10);
  }
  foot = G(0, gz0 - rampLen);
  const rampProf = (lift: number): [number, number][] => [
    [gz0 + 0.3, lift],
    [gz0 + 0.3, -D],
    [gz0 - rampLen - 0.4, Math.min(-D, foot - 1)],
    [gz0 - rampLen - 0.4, foot + lift * 0.3 - 0.05],
  ];
  push(faceted(prism(rampProf(0), -GATE_W / 2 - 0.25, GATE_W / 2 + 0.25, (c, n) => (n.y > 0.5 ? shade(FLAG, 0.86 + hash(Math.floor(c.z / 0.7), 3) * 0.14) : shade(STONE_LO, 0.85)), 0.8, 0.7)));
  for (const sx of [-1, 1]) {
    const x0 = sx * (GATE_W / 2 + 0.25);
    const x1 = sx * (GATE_W / 2 + 0.7);
    push(faceted(prism(rampProf(0.55), Math.min(x0, x1), Math.max(x0, x1), (c, n) => ashlar(c, n, foot))));
    // the kerbs are walls
    for (let t = 0.15; t <= 1; t += 0.28) block(sx * (GATE_W / 2 + 0.48), gz0 - rampLen * t, 0.42);
  }
  // the two door leaves, hinged at the jambs (built in their own groups so they can swing)
  const doors: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const leaf = new Builder();
    const w = GATE_W / 2 - 0.04;
    leaf.box(w, GATE_H - 0.1, 0.16, [-sx * w / 2, (GATE_H - 0.1) / 2, 0], (p) => shade(lin(0x5c3a22), 0.85 + 0.15 * (Math.floor((p.x + 9) / 0.27) % 2)));
    for (const y of [0.6, 1.6, 2.6]) leaf.box(w * 0.94, 0.12, 0.2, [-sx * w / 2, y, 0], lin(0x2c2a28), { b: 'iron' });
    for (let i = 0; i < 4; i++) leaf.ball(0.045, [-sx * (0.25 + i * 0.36), 2.1, -0.11], lin(0x2c2a28), { b: 'iron' });
    const g = new THREE.Group();
    g.userData.leaf = leaf;
    g.userData.side = sx;
    doors.push(g);
  }

  // ---- the plaza: barracks, the magazine, stairs to the rampart, the brazier, benches and the flagstaff
  // barracks against the -x wall, whitewashed under red tiles
  const bx = -PL + 1.8;
  b.box(3.6, 2.8, 9.2, [bx, 1.4, -1.2], (p) => (p.y < 0.35 ? shade(STONE_LO, 0.9) : WASH), { r: 0.08 });
  b.gable(4.4, 1.5, 9.9, [bx, 2.8, -1.2], (p) => shade(TILE, 0.86 + 0.14 * (Math.floor((p.z + 20) / 0.32) % 2)), false);
  for (const z of [-4.6, -1.2, 2.2]) {
    b.box(0.08, 1.7, 0.95, [bx + 1.82, 0.85, z], C.door);
    b.box(0.1, 0.12, 1.15, [bx + 1.82, 1.78, z], STONE_CAP);
  }
  for (const z of [-2.9, 0.5]) b.box(0.06, 0.6, 0.6, [bx + 1.82, 1.6, z], lin(0x2f6f9a));
  block(bx, -4.2, 2.1);
  block(bx, -1.2, 2.1);
  block(bx, 1.8, 2.1);
  // barrels and crates by its door
  const crate = PropGeo.crate(0.6);
  const barrel = PropGeo.barrel(0.84, 0.3);
  for (const [lx, lz, k, lift] of [[bx + 2.35, 4.4, 'c', 0], [bx + 2.4, 3.6, 'b', 0], [bx + 2.3, 4.4, 'c', 0.6], [bx + 2.6, -6.5, 'b', 0]] as const) {
    const g = (k === 'c' ? crate : barrel).clone();
    g.rotateY(rnd() * 0.8);
    g.translate(lx, (k === 'c' ? 0.3 : 0.42) + lift, lz);
    b.parts.wood.push(g);
    if (!lift) block(lx, lz, 0.45);
  }
  // the powder magazine: a stone vault with an iron door, and a lightning rod
  const mx = PL - 1.9;
  const mz = -4.4;
  b.box(3.0, 2.2, 3.8, [mx, 1.1, mz], (p) => shade(STONE, 0.86 + hash(Math.floor(p.y / 0.5), Math.floor(p.z / 0.9)) * 0.12), { r: 0.06 });
  const vault = new THREE.CylinderGeometry(1.5, 1.5, 3.8, 14, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).rotateZ(0).translate(mx, 2.2, mz);
  push(faceted(vault, () => STONE_CAP));
  b.box(0.08, 1.5, 0.9, [mx - 1.52, 0.75, mz], lin(0x2c2a28), { b: 'iron' });
  block(mx, mz - 0.9, 1.8);
  block(mx, mz + 0.9, 1.8);
  // stairs up to the rampart along the +x wall's inner face
  for (let i = 0; i < 10; i++) {
    const z = PL - 0.4 - (10 - i) * 0.55;
    b.box(1.4, (i + 1) * 0.44, 0.56, [PL - 0.7, ((i + 1) * 0.44) / 2, z], shade(STONE, 0.92 + (i % 2) * 0.05));
  }
  for (let i = 0; i < 4; i++) block(PL - 0.75, PL - 1 - i * 1.4, 0.8);
  // the brazier: an iron basket of coals on a tripod in the middle of the plaza
  const fz = -1.2;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.4;
    b.beam(new THREE.Vector3(Math.cos(a) * 0.55, 0, fz + Math.sin(a) * 0.55), new THREE.Vector3(Math.cos(a) * 0.18, 0.95, fz + Math.sin(a) * 0.18), 0.04, C.iron, 'iron');
  }
  const bowl = new THREE.LatheGeometry([[0.05, 0.86], [0.32, 0.9], [0.48, 1.06], [0.52, 1.14]].map(([r, y]) => new THREE.Vector2(r, y)), 12).translate(0, 0, fz);
  b.add(bowl, [0, 0, 0], lin(0x2a2826), { b: 'iron' });
  b.ball(0.42, [0, 1.08, fz], new THREE.Color(2.6, 0.85, 0.2), { b: 'glow', s: [1, 0.2, 1] });
  block(0, fz, 0.7);
  // stone benches round the brazier, where the garrison sits at ease
  const seats: CampLayout['seats'] = [];
  for (const a of [0.9, 2.5, 4.1, 5.5]) {
    const lx = Math.cos(a) * 2.6;
    const lz = fz + Math.sin(a) * 2.6;
    b.box(1.6, 0.42, 0.5, [lx, 0.21, lz], shade(STONE_CAP, 0.9), { r: 0.1, ry: -a + Math.PI / 2 });
    const pt = W(lx * 0.96, fz + (lz - fz) * 0.96);
    const f = W(0, fz);
    seats.push({ x: pt.x, z: pt.z, yaw: Math.atan2(f.x - pt.x, f.z - pt.z) });
    block(lx, lz, 0.5);
  }
  // the flagstaff: a tall mast on a stone plinth near the sea wall, with a signal yard
  const sz = PL - 1.8;
  const top = 12.6;
  b.box(1.3, 0.7, 1.3, [0, 0.35, sz], STONE_CAP, { r: 0.1 });
  b.beam(new THREE.Vector3(0, 0.6, sz), new THREE.Vector3(0, top, sz), 0.14, C.timberDark);
  b.beam(new THREE.Vector3(-1.6, top - 3.4, sz), new THREE.Vector3(1.6, top - 3.4, sz), 0.06, C.timberDark);
  b.ball(0.2, [0, top + 0.1, sz], lin(0xd8a640), { b: 'gold' });
  block(0, sz, 0.75);
  // round shot stacked by every gun
  for (const g of GUN_SPOTS) {
    const ix = Math.sin(g.yaw);
    const iz = Math.cos(g.yaw);
    // beside the gun along the wall, a little in from the parapet
    const px = g.x + iz * 1.45 - ix * 0.9;
    const pz = g.z - ix * 1.45 - iz * 0.9;
    const ball = new THREE.IcosahedronGeometry(0.14, 1);
    for (const [ox, oy, oz] of [[-0.15, 0.14, -0.15], [0.15, 0.14, -0.15], [-0.15, 0.14, 0.15], [0.15, 0.14, 0.15], [0, 0.36, 0]]) {
      b.add(ball.clone(), [px + ox, WH + oy, pz + oz], lin(0x2a2a2c), { b: 'iron' });
    }
  }
  // the walls are walls: rings of discs along their middles, the gate left open
  for (let side = 0; side < 4; side++) {
    for (let u = -H + 0.8; u <= H - 0.8; u += 1.4) {
      if (side === 2 && Math.abs(u) < GATE_W / 2 + 1.6) continue;
      const v = H - T / 2;
      const [lx, lz] = side === 0 ? [u, v] : side === 1 ? [v, -u] : side === 2 ? [-u, -v] : [-v, u];
      block(lx, lz, T / 2 + 0.2);
    }
  }
  // the gate's jambs, so nobody slips in round the doors' edge
  for (const sx of [-1, 1]) block(sx * (GATE_W / 2 + 0.9), -H + T / 2, 0.9);

  // where people stand about when at ease: by the gate, the magazine, the stairs, under the flag
  const fp = W(0, fz);
  const posts: CampLayout['posts'] = [
    { ...xzOf(W(-1.2, -PL + 1.4)), yaw: s.yaw + Math.PI },
    { ...xzOf(W(1.2, -PL + 1.4)), yaw: s.yaw + Math.PI },
    { ...xzOf(W(mx - 2.2, mz + 2.4)), yaw: s.yaw - Math.PI / 2 },
    { ...xzOf(W(PL - 2.6, PL - 2.2)), yaw: s.yaw },
    { ...xzOf(W(-1.6, sz - 1.4)), yaw: s.yaw },
    { ...xzOf(W(bx + 2.6, 1.2)), yaw: s.yaw + Math.PI / 2 },
  ];
  const chest = W(bx + 2.5, -3.2, 0);
  const guns = GUN_SPOTS.map((g) => ({ pos: W(g.x, g.z, WH), yaw: s.yaw + g.yaw }));
  return {
    fire: new THREE.Vector3(fp.x, s.y + 1.1, fp.z),
    chest,
    chestYaw: s.yaw + Math.PI / 2,
    flagTop: W(0, sz, top - 0.3),
    flagDrop: top - 2.4,
    seats,
    posts,
    blocks,
    guns,
    rampLen,
    rampFootY: foot + s.y,
    doors,
  };
}

const xzOf = (p: THREE.Vector3) => ({ x: p.x, z: p.z });

function roundBox(w: number, h: number, d: number, r: number) {
  // a few segments only: a soft, toy-like edge, not a polished pebble
  const g = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  // pull the top edge in to round it (a cheap bevel)
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) pos.setZ(i, pos.getZ(i) * (1 - r / Math.max(d, 1e-3)));
  }
  return g;
}

// ------------------------------------------------------------------ the guns

/**
 * One shore gun: a bronze barrel on its trunnions (pointing +z, pivot at the
 * origin) and a garrison carriage with trucks (its base at y = -GUN_PIVOT).
 */
export function gunParts() {
  const bronze = lin(0x8d6a3c);
  const dark = lin(0x5a4123);
  const barrel = new Builder();
  const prof = [
    [0, -0.86], [0.12, -0.84], [0.15, -0.78], [0.1, -0.72], [0.08, -0.66], [0.26, -0.62], [0.28, -0.5], [0.26, -0.44], [0.25, 0.1], [0.27, 0.14], [0.27, 0.22],
    [0.23, 0.26], [0.2, 1.2], [0.22, 1.24], [0.22, 1.32], [0.19, 1.36], [0.18, 1.62], [0.22, 1.68], [0.23, 1.78], [0.15, 1.8], [0.13, 1.7], [0, 1.68],
  ];
  const lathe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 14).rotateX(Math.PI / 2);
  barrel.add(lathe, [0, 0, 0], (p) => shade(bronze, 0.9 + 0.12 * Math.sin(p.z * 3)), { b: 'iron' });
  barrel.add(new THREE.CylinderGeometry(0.075, 0.075, 0.74, 8).rotateZ(Math.PI / 2), [0, 0, 0], bronze, { b: 'iron' });
  // the dolphins (lifting handles) cast on top
  for (const sx of [-1, 1]) barrel.add(new THREE.TorusGeometry(0.07, 0.025, 4, 8, Math.PI).rotateY(Math.PI / 2), [sx * 0.08, 0.27, 0.22], bronze, { b: 'iron' });
  const carriage = new Builder();
  const y0 = -GUN_PIVOT;
  for (const sx of [-1, 1]) {
    // stepped cheeks
    carriage.box(0.13, 0.5, 1.45, [sx * 0.31, y0 + 0.45, -0.15], (p) => shade(dark, 0.9 + 0.1 * (Math.floor((p.y + 3) / 0.17) % 2)), { r: 0.03 });
    carriage.box(0.13, 0.3, 0.7, [sx * 0.31, y0 + 0.82, 0.1], dark, { r: 0.03 });
    for (const z of [-0.62, 0.42]) carriage.add(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 12).rotateZ(Math.PI / 2), [sx * 0.42, y0 + 0.22, z], (p) => shade(lin(0x3c2c1c), 0.8 + 0.2 * Math.abs(Math.sin(Math.atan2(p.y - y0 - 0.22, p.z - z) * 4))));
  }
  for (const z of [-0.62, 0.42]) carriage.add(new THREE.CylinderGeometry(0.06, 0.06, 0.95, 6).rotateZ(Math.PI / 2), [0, y0 + 0.22, z], lin(0x2c2a28));
  carriage.box(0.5, 0.1, 1.2, [0, y0 + 0.24, -0.15], dark);
  // the quoin wedge under the breech
  carriage.box(0.32, 0.1, 0.4, [0, y0 + 0.62, -0.62], lin(0x6a4c2c));
  return { barrel: mergeGeometries(barrel.parts.iron)!, carriage: mergeGeometries(carriage.parts.wood)! };
}

/** A heap of fallen masonry and a split carriage, for a silenced gun (origin on the rampart). */
export function rubbleGeometry() {
  const b = new Builder();
  const rnd = mulberry32(4242);
  for (let i = 0; i < 9; i++) {
    const a = rnd() * TAU;
    const r = rnd() * 0.9;
    const s = 0.22 + rnd() * 0.26;
    b.add(new THREE.DodecahedronGeometry(s, 0).scale(1.2, 0.7, 1), [Math.cos(a) * r, s * 0.4, Math.sin(a) * r * 0.8 + 0.3], shade(STONE_CAP, 0.7 + rnd() * 0.35), { ry: rnd() * 3, flat: true });
  }
  // a scorched beam end and a cracked wheel
  b.add(new THREE.BoxGeometry(0.13, 0.13, 1.1), [0.35, 0.18, -0.4], lin(0x2b1e14), { ry: 0.7, rz: 0.2 });
  b.add(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 10).rotateX(Math.PI / 2.4), [-0.5, 0.2, -0.3], lin(0x2b2016));
  return mergeGeometries(b.parts.wood)!;
}

/** Turns the door builders stashed on each leaf's group into meshes. */
export function finishDoors(doors: THREE.Group[], mats: Record<Bucket, THREE.Material>) {
  for (const g of doors) {
    const leaf = g.userData.leaf as Builder;
    leaf.finish(g, mats);
    delete g.userData.leaf;
  }
}
