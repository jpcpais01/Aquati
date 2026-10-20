import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, mulberry32 } from '../core/noise';
import { Bucket, Builder, C, lin, shade } from '../port/port';
import { PropGeo } from '../port/pirates';
import { Island, SeaFloor } from '../world/terrain';
import type { CampLayout } from './kit';
import type { Disc } from './ground';

// The Brethren's island forts. No two alike: a castillo of pale coral-stone
// with round bastions and domed sentry boxes, a star fort whose arrowhead
// bastions push out at the corners, a squat tower fort round a tall keep, and
// up in Las Brumas dark, mossy sea keeps under steep slate roofs. Each is a
// square of curtain walls battered out at the foot, guns in the embrasures of
// its seaward walls, an arched gate and a ramp on the landward side, and a
// flagged plaza inside with barracks, a magazine, chapel or keep, a brazier
// and a tall flagstaff.
//
// What a battering can knock down (the parapet round each gun, the tops of
// the corner towers, the barracks roof) is built three ways, whole, wrecked
// and patched with timber, all at load and with the shore's own materials, so
// a fort can fall to pieces under your guns without anything compiling
// mid-voyage. Everything is built in the fort's own frame (+z out to sea, the
// plaza floor at y = 0).

const TAU = Math.PI * 2;
/** Half the width a fort's site is surveyed for. */
export const FORT_H = 12.5;
export const GATE_W = 3.2;
const GATE_H = 3.2;
/** The trunnions' height above the rampart. */
export const GUN_PIVOT = 0.78;

// ------------------------------------------------------------------ styles

export type FortStyleId = 'castillo' | 'estrella' | 'torre' | 'bruma' | 'niebla';

interface Palette {
  stone: THREE.Color;
  lo: THREE.Color;
  cap: THREE.Color;
  damp: THREE.Color;
  floor: THREE.Color;
  wash: THREE.Color;
  /** Barracks tiles, and the towers' roofs. */
  tile: THREE.Color;
  roof: THREE.Color;
  /** How mossy the stone grows (0 sun-baked .. 1 dripping). */
  moss: number;
}

export interface FortStyle {
  id: FortStyleId;
  /** What the fort bar calls it. */
  kind: string;
  /** Half-width to the curtain's outer face, its thickness, the rampart's height. */
  H: number;
  T: number;
  WH: number;
  /** Parapet height and thickness. */
  PH: number;
  PT: number;
  /** Corner works: round bastions, arrowhead bastions, or square towers. */
  tower: 'round' | 'point' | 'square';
  /** Round: radius; square: half-width; point: how far along the curtain the bastion's flank stands. */
  R: number;
  /** The corner towers stand this far above the rampart. */
  rise: number;
  roof: 'none' | 'cone' | 'pyramid';
  parapet: 'round' | 'crenel';
  garita: boolean;
  hall: 'magazine' | 'chapel' | 'keep';
  /** A timber gallery hung over the gate. */
  hoarding: boolean;
  /** Its guns on the rampart (fort frame) and which way each embrasure looks. */
  guns: { x: number; z: number; yaw: number }[];
  P: Palette;
}

const seaGun = (H: number, x: number) => ({ x, z: H - 1.6, yaw: 0 });
const eastGun = (H: number, z: number) => ({ x: H - 1.6, z, yaw: Math.PI / 2 });
const westGun = (H: number, z: number) => ({ x: -(H - 1.6), z, yaw: -Math.PI / 2 });

const pal = (o: { stone: number; lo: number; cap: number; damp: number; floor: number; wash: number; tile: number; roof: number; moss: number }): Palette => ({
  stone: lin(o.stone), lo: lin(o.lo), cap: lin(o.cap), damp: lin(o.damp), floor: lin(o.floor), wash: lin(o.wash), tile: lin(o.tile), roof: lin(o.roof), moss: o.moss,
});

export const FORT_STYLES: Record<FortStyleId, FortStyle> = {
  castillo: {
    id: 'castillo', kind: 'castle', H: 12.5, T: 3.2, WH: 4.4, PH: 1.25, PT: 1.0, tower: 'round', R: 3.0, rise: 0, roof: 'none', parapet: 'round', garita: true, hall: 'magazine', hoarding: false,
    guns: [seaGun(12.5, -4.6), seaGun(12.5, 4.6), eastGun(12.5, 4.8), westGun(12.5, 4.8)],
    P: pal({ stone: 0xdcc7a0, lo: 0xb19a74, cap: 0xeedfbf, damp: 0x7c7457, floor: 0xd3c09a, wash: 0xf1e8d6, tile: 0xb5523a, roof: 0xb5523a, moss: 0 }),
  },
  estrella: {
    id: 'estrella', kind: 'star fort', H: 13, T: 3.4, WH: 4.8, PH: 1.3, PT: 1.1, tower: 'point', R: 4.8, rise: 0, roof: 'none', parapet: 'round', garita: true, hall: 'chapel', hoarding: false,
    guns: [seaGun(13, -5), seaGun(13, 0), seaGun(13, 5), eastGun(13, 2.4), westGun(13, 2.4)],
    P: pal({ stone: 0xcbb995, lo: 0x9b8a68, cap: 0xe6dabd, damp: 0x6d6a52, floor: 0xc6b38e, wash: 0xf4eee2, tile: 0xa84a33, roof: 0xa84a33, moss: 0.05 }),
  },
  torre: {
    id: 'torre', kind: 'tower fort', H: 10, T: 2.8, WH: 4.0, PH: 1.2, PT: 0.9, tower: 'square', R: 2.6, rise: 2.0, roof: 'none', parapet: 'crenel', garita: false, hall: 'keep', hoarding: false,
    guns: [seaGun(10, -3.1), seaGun(10, 3.1), westGun(10, 1.2)],
    P: pal({ stone: 0xddb07f, lo: 0xa97a52, cap: 0xf0d0a6, damp: 0x6e5a40, floor: 0xd6b28a, wash: 0xf4e6d0, tile: 0x9a4630, roof: 0x9a4630, moss: 0.02 }),
  },
  bruma: {
    id: 'bruma', kind: 'sea keep', H: 12, T: 3.0, WH: 4.6, PH: 1.2, PT: 0.95, tower: 'square', R: 3.0, rise: 2.4, roof: 'pyramid', parapet: 'crenel', garita: false, hall: 'magazine', hoarding: true,
    guns: [seaGun(12, -4.2), seaGun(12, 4.2), eastGun(12, 3.4), westGun(12, 3.4)],
    P: pal({ stone: 0x9c9e95, lo: 0x6b6e67, cap: 0xbbbcb2, damp: 0x3b4f34, floor: 0x8e9088, wash: 0xdcd8cd, tile: 0x6a7684, roof: 0x5d6b7c, moss: 0.6 }),
  },
  niebla: {
    id: 'niebla', kind: 'mist castle', H: 11.5, T: 3.0, WH: 4.4, PH: 1.1, PT: 0.95, tower: 'round', R: 3.3, rise: 2.6, roof: 'cone', parapet: 'crenel', garita: false, hall: 'magazine', hoarding: true,
    guns: [seaGun(11.5, -4), seaGun(11.5, 4), eastGun(11.5, 3.0), westGun(11.5, 3.0)],
    P: pal({ stone: 0xa6a796, lo: 0x75786a, cap: 0xc4c5b6, damp: 0x3f5638, floor: 0x9a9c8f, wash: 0xe2ddd0, tile: 0x8a4838, roof: 0x58687a, moss: 0.45 }),
  },
};

export const styleOf = (s: { style?: FortStyleId }) => FORT_STYLES[s.style ?? 'castillo'];

/** The corner works: centre, plan (square/point) or radius (round), top of the stonework. */
export interface Corner {
  x: number;
  z: number;
  /** Round: radius; else the plan's outline (fort frame, outward-wound). */
  r: number;
  poly: [number, number][] | null;
  /** Top of the drum (the parapet stands on it). */
  top: number;
  /** Which way it points out (fort frame angle in xz, atan2(z, x)). */
  out: number;
}

export function corners(S: FortStyle): Corner[] {
  const H = S.H;
  return ([[1, 1], [-1, 1], [1, -1], [-1, -1]] as const).map(([sx, sz]) => {
    const out = Math.atan2(sz, sx);
    if (S.tower === 'round') {
      const c = H - 0.7;
      return { x: sx * c, z: sz * c, r: S.R, poly: null, top: S.WH + S.rise, out };
    }
    if (S.tower === 'square') {
      const c = H - 0.4;
      const R = S.R;
      const poly: [number, number][] = [[c - R, c - R], [c + R, c - R], [c + R, c + R], [c - R, c + R]];
      return { x: sx * c, z: sz * c, r: R * 1.2, poly: poly.map(([x, z]) => [sx * x, sz * z] as [number, number]), top: S.WH + S.rise, out };
    }
    // an arrowhead: a kite from the rampart's corner out past the walls' corner, flanks square to the curtain
    const f = H - S.R;
    const poly: [number, number][] = [[f, f], [H, f], [H + 2.6, f], [H + 5.2, H + 5.2], [f, H + 2.6], [f, H]];
    const pts = poly.map(([x, z]) => [sx * x, sz * z] as [number, number]);
    return { x: sx * (H + 1.2), z: sz * (H + 1.2), r: 5.2, poly: pts, top: S.WH, out };
  });
}

/** How far the corner works reach from the fort's middle. */
export function fortReach(S: FortStyle) {
  return S.tower === 'point' ? (S.H + 5.2) * Math.SQRT2 : S.tower === 'square' ? (S.H - 0.4 + S.R) * Math.SQRT2 : (S.H - 0.7) * Math.SQRT2 + S.R;
}

/** How far out the corners stick past the curtain (for walkers rounding them). */
export const cornerPad = (S: FortStyle) => (S.tower === 'point' ? 5.2 : S.tower === 'square' ? S.R - 0.4 : 1);

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
  style?: FortStyleId;
}

/** Something a battering can knock down, built whole, wrecked and patched. */
export interface FortPiece {
  key: string;
  /** Where it stands (fort frame), for the dust and flames when it goes. */
  at: THREE.Vector3;
  intact: Builder;
  broken: Builder;
  patch: Builder;
}

export interface FortLayout extends CampLayout {
  style: FortStyle;
  /** Which side the barracks stand (the plaza's mirror). */
  ms: number;
  /** World positions of the guns' carriages (on the rampart) and their embrasures' facings (world yaw). */
  guns: { pos: THREE.Vector3; yaw: number }[];
  /** The ramp from the gate down to the ground: its length and the ground height at its foot (world). */
  rampLen: number;
  rampFootY: number;
  /** The gate's two door leaves (hinged at the jambs), for swinging open. */
  doors: THREE.Group[];
  /** How far the colours come down the staff when struck. */
  flagDrop: number;
  pieces: FortPiece[];
  /** The barracks roof's ridge (fort frame), where it burns. */
  roofAt: THREE.Vector3[];
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
const FORT_KINDS: FortStyleId[] = ['castillo', 'estrella', 'torre', 'castillo', 'estrella'];
/** The Brethren's strongholds in Las Brumas. */
export const BRUMAS_FORT_NAMES = ['Fortaleza da Bruma', 'Kasteel Nevelrots', 'Bastión de la Garoa'];
export const BRUMAS_FORT_KINDS: FortStyleId[] = ['bruma', 'niebla', 'bruma'];

/**
 * Rises above the sea for the forts: a flat shoulder of dry ground a short
 * way in from the coast, looking out over water deep enough for a ship to
 * come and fight it, with walkable ground at its back for the gate. The best
 * spot on each island the towns leave free, then the `count` of them spread
 * widest across the archipelago. (The survey is the same for every style, so
 * the forts stand where they always have and conquests keep their islands.)
 */
export function findFortSites(terrain: SeaFloor, avoid: Disc[], skip: Island[], count: number, names = FORT_NAMES, kinds = FORT_KINDS): (FortSite & { name: string })[] {
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
    const i = out.length;
    out.push({ ...s, name: names[i % names.length], style: kinds[i % kinds.length] });
  }
  return out;
}

const _p = new THREE.Vector3();

/** Clearings round a fort for the vegetation: the walls and their bastions, the glacis in front and the ramp behind. */
export function fortClearings(s: FortSite): Disc[] {
  const S = styleOf(s);
  const back = fortToWorld(s, 0, -S.H - 7);
  return [
    { x: s.x, z: s.z, r: Math.max(FORT_H * 1.5 + 3, fortReach(S) + 3.5) },
    { x: back.x, z: back.z, r: 8 },
  ];
}

// ------------------------------------------------------------------ shapes, for shot and scars

/** Is a point (fort frame, y above the plaza) inside the convex outline? */
function inPoly(poly: [number, number][], x: number, z: number) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[(i + 1) % poly.length];
    const c = (bx - ax) * (z - az) - (bz - az) * (x - ax);
    if (c === 0) continue;
    if (!sign) sign = Math.sign(c);
    else if (Math.sign(c) !== sign) return false;
  }
  return true;
}

/** The corner a point is in (fort frame), or -1. */
export function cornerAt(cs: Corner[], x: number, z: number, pad = 0) {
  for (let j = 0; j < cs.length; j++) {
    const c = cs[j];
    if (c.poly ? inPoly(c.poly, x, z) || Math.hypot(x - c.x, z - c.z) < pad : Math.hypot(x - c.x, z - c.z) < c.r + pad) return j;
  }
  return -1;
}

/** Is there stone at this point of a fort (fort frame, y above the plaza)? */
export function fortSolid(S: FortStyle, cs: Corner[], x: number, z: number, y: number, ms = 1) {
  const H = S.H;
  const j = cornerAt(cs, x, z);
  if (j >= 0) {
    const c = cs[j];
    const roofed = S.roof !== 'none' ? 4 : S.garita ? 2.4 : 0;
    if (y < c.top + S.PH + 0.25) return true;
    if (roofed && y < c.top + S.PH + roofed && Math.hypot(x - c.x, z - c.z) < c.r * 0.75) return true;
    return false;
  }
  if (S.hall === 'keep') {
    const k = keepSpot(S, ms);
    if (Math.hypot(x - k.x, z - k.z) < k.r && y < k.top) return true;
  }
  const ax = Math.abs(x);
  const az = Math.abs(z);
  const m = Math.max(ax, az);
  const TB = S.WH * 0.45;
  const face = y < TB ? H + (TB - y) * 0.18 : H;
  if (m < face + 0.15 && m > H - S.T - 0.1) {
    if (y < S.WH) return true;
    if (y < S.WH + S.PH && m > H - S.PT - 0.05) return true;
    return false;
  }
  return m <= H - S.T && y < 0.15;
}

/**
 * Where a ball that struck at (x, y, z) leaves its scar: the nearest face of
 * stone, and which way it looks (fort frame). Returns the corner it's on, or -1.
 */
export function fortSurface(S: FortStyle, cs: Corner[], x: number, z: number, y: number, out: THREE.Vector3, n: THREE.Vector3): number {
  const H = S.H;
  const TB = S.WH * 0.45;
  const j = cornerAt(cs, x, z, 0.6);
  if (j >= 0) {
    const c = cs[j];
    const yy = Math.min(y, c.top - 0.45);
    if (!c.poly) {
      const a = Math.atan2(z - c.z, x - c.x);
      const r = (yy < TB ? c.r + (TB - yy) * 0.18 : c.r) + 0.03;
      n.set(Math.cos(a), yy < TB ? 0.18 : 0, Math.sin(a)).normalize();
      out.set(c.x + Math.cos(a) * r, yy, c.z + Math.sin(a) * r);
      return j;
    }
    // the nearest outer edge of its plan
    let bd = Infinity;
    for (let i = 0; i < c.poly.length; i++) {
      const [ax, az] = c.poly[i];
      const [bx, bz] = c.poly[(i + 1) % c.poly.length];
      const ex = bx - ax;
      const ez = bz - az;
      const L = Math.hypot(ex, ez) || 1;
      const t = clamp(((x - ax) * ex + (z - az) * ez) / (L * L), 0.05, 0.95);
      const px = ax + ex * t;
      const pz = az + ez * t;
      // its outward normal: away from the corner's middle
      let nx = ez / L;
      let nz = -ex / L;
      if (nx * (px - c.x) + nz * (pz - c.z) < 0) {
        nx = -nx;
        nz = -nz;
      }
      // an edge inside the walls never takes a ball
      if (Math.max(Math.abs(px + nx), Math.abs(pz + nz)) < H - 0.2) continue;
      const d = Math.hypot(x - px, z - pz);
      if (d < bd) {
        bd = d;
        const o = (yy < TB ? (TB - yy) * 0.18 : 0) + 0.03;
        out.set(px + nx * o, yy, pz + nz * o);
        n.set(nx, yy < TB ? 0.18 : 0, nz).normalize();
      }
    }
    return j;
  }
  const ax = Math.abs(x);
  const az = Math.abs(z);
  const m = Math.max(ax, az);
  if (m <= H - S.T + 0.05 && y < 0.6) {
    out.set(x, 0.02, z);
    n.set(0, 1, 0);
    return -1;
  }
  if (m < H - S.PT && y > S.WH - 0.3) {
    out.set(x, S.WH + 0.02, z);
    n.set(0, 1, 0);
    return -1;
  }
  // a ball on the parapet scars the face just under it (the parapet's own wreck shows the rest)
  const yy = Math.min(y, S.WH - 0.45);
  const f = (yy < TB ? H + (TB - yy) * 0.18 : H) + 0.03;
  const sl = yy < TB ? 0.18 : 0;
  const lim = H - 1;
  if (ax > az) {
    out.set(Math.sign(x) * f, yy, clamp(z, -lim, lim));
    n.set(Math.sign(x), sl, 0).normalize();
  } else {
    out.set(clamp(x, -lim, lim), yy, Math.sign(z) * f);
    n.set(0, sl, Math.sign(z)).normalize();
  }
  return -1;
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

type Stone = (c: THREE.Vector3, n: THREE.Vector3) => THREE.Color;

/** Collects coloured triangles, two at a time for each block-sized cell. */
class Tris {
  pos: number[] = [];
  col: number[] = [];
  private ab = new THREE.Vector3();
  private ac = new THREE.Vector3();
  private cc = new THREE.Vector3();
  private nn = new THREE.Vector3();

  tri(a: number[], b: number[], c: number[], out: THREE.Vector3) {
    this.ab.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    this.ac.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    if (this.ab.cross(this.ac).dot(out) < 0) this.pos.push(...a, ...c, ...b);
    else this.pos.push(...a, ...b, ...c);
  }

  /** One cell: its colour from its middle. */
  quad(a: number[], b: number[], c: number[], d: number[], out: THREE.Vector3, paint: Stone) {
    this.cc.set((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2);
    this.nn.copy(out).normalize();
    const k = paint(this.cc, this.nn);
    this.tri(a, b, c, out);
    this.tri(a, c, d, out);
    for (let i = 0; i < 6; i++) this.col.push(k.r, k.g, k.b);
  }

  fan(pts: number[][], out: THREE.Vector3, paint: Stone) {
    for (let i = 1; i < pts.length - 1; i++) {
      this.cc.set((pts[0][0] + pts[i][0] + pts[i + 1][0]) / 3, (pts[0][1] + pts[i][1] + pts[i + 1][1]) / 3, (pts[0][2] + pts[i][2] + pts[i + 1][2]) / 3);
      const k = paint(this.cc, out);
      this.tri(pts[0], pts[i], pts[i + 1], out);
      for (let j = 0; j < 3; j++) this.col.push(k.r, k.g, k.b);
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    return g;
  }
}

/** Cuts a run into staggered block joints: the cut points (0..n) of course `j`. */
function joints(n: number, j: number) {
  const cuts = [0];
  for (let k = 1; k < n; k++) cuts.push(k - (j % 2) * 0.5);
  if (j % 2 && n > 1) cuts.push(n - 0.5);
  cuts.push(n);
  return cuts;
}

/**
 * A solid from a convex profile in (z, y), run along x from x0 to x1: side
 * faces (cut into a grid of block-sized cells, so each can take its own tone)
 * and both end caps, every face wound outward. Flat-shaded.
 */
function prism(profile: [number, number][], x0: number, x1: number, paint: Stone, cell = 1.3, course = 0.62): THREE.BufferGeometry {
  const t = new Tris();
  let cz = 0;
  let cy = 0;
  for (const [z, y] of profile) {
    cz += z / profile.length;
    cy += y / profile.length;
  }
  const N = profile.length;
  const nx = Math.max(1, Math.ceil((x1 - x0) / cell));
  for (let i = 0; i < N; i++) {
    const [za, ya] = profile[i];
    const [zb, yb] = profile[(i + 1) % N];
    const out = new THREE.Vector3(0, (ya + yb) / 2 - cy, (za + zb) / 2 - cz);
    const ny = Math.max(1, Math.ceil(Math.hypot(zb - za, yb - ya) / course));
    for (let j = 0; j < ny; j++) {
      const z0 = za + ((zb - za) * j) / ny;
      const y0 = ya + ((yb - ya) * j) / ny;
      const z1 = za + ((zb - za) * (j + 1)) / ny;
      const y1 = ya + ((yb - ya) * (j + 1)) / ny;
      // joints staggered course by course, like laid stone
      const cuts = joints(nx, j);
      for (let k = 0; k + 1 < cuts.length; k++) {
        const xa = x0 + ((x1 - x0) * cuts[k]) / nx;
        const xb = x0 + ((x1 - x0) * cuts[k + 1]) / nx;
        if (xb - xa < 1e-4) continue;
        t.quad([xa, y0, z0], [xb, y0, z0], [xb, y1, z1], [xa, y1, z1], out, paint);
      }
    }
  }
  for (const [x, sgn] of [[x0, -1], [x1, 1]] as const) {
    t.fan(profile.map(([z, y]) => [x, y, z]), new THREE.Vector3(sgn, 0, 0), paint);
  }
  return t.geometry();
}

/**
 * A convex plan (fort frame) stood up from y0 to y1: battered out below the
 * cordon at `tb`, its faces coursed like the walls, a flat top.
 */
function pile(plan: [number, number][], y0: number, y1: number, tb: number, paint: Stone, top: Stone = paint): THREE.BufferGeometry {
  const t = new Tris();
  const N = plan.length;
  let mx = 0;
  let mz = 0;
  for (const [x, z] of plan) {
    mx += x / N;
    mz += z / N;
  }
  // each corner's mitre: how far out it moves for the faces either side to move out by 1
  const mitre = plan.map((p, i) => {
    const q = plan[(i + N - 1) % N];
    const r = plan[(i + 1) % N];
    const n1 = edgeOut(q, p, mx, mz);
    const n2 = edgeOut(p, r, mx, mz);
    const sx = n1[0] + n2[0];
    const sz = n1[1] + n2[1];
    const d = 1 + n1[0] * n2[0] + n1[1] * n2[1];
    return [sx / d, sz / d];
  });
  const at = (i: number, y: number) => {
    const o = y < tb ? (tb - y) * 0.18 : 0;
    return [plan[i][0] + mitre[i][0] * o, y, plan[i][1] + mitre[i][1] * o];
  };
  const levels = y0 < tb && tb < y1 ? [y0, tb, y1] : [y0, y1];
  for (let i = 0; i < N; i++) {
    const k = (i + 1) % N;
    const n = edgeOut(plan[i], plan[k], mx, mz);
    const out = new THREE.Vector3(n[0], 0, n[1]);
    const L = Math.hypot(plan[k][0] - plan[i][0], plan[k][1] - plan[i][1]);
    const nx = Math.max(1, Math.ceil(L / 1.3));
    let course = 0;
    for (let l = 0; l + 1 < levels.length; l++) {
      const ya = levels[l];
      const yb = levels[l + 1];
      const ny = Math.max(1, Math.ceil((yb - ya) / 0.62));
      for (let j = 0; j < ny; j++, course++) {
        const y0j = ya + ((yb - ya) * j) / ny;
        const y1j = ya + ((yb - ya) * (j + 1)) / ny;
        const a0 = at(i, y0j);
        const b0 = at(k, y0j);
        const a1 = at(i, y1j);
        const b1 = at(k, y1j);
        const cuts = joints(nx, course);
        for (let c = 0; c + 1 < cuts.length; c++) {
          const u0 = cuts[c] / nx;
          const u1 = cuts[c + 1] / nx;
          if (u1 - u0 < 1e-4) continue;
          const L0 = (u: number) => [a0[0] + (b0[0] - a0[0]) * u, a0[1], a0[2] + (b0[2] - a0[2]) * u];
          const L1 = (u: number) => [a1[0] + (b1[0] - a1[0]) * u, a1[1], a1[2] + (b1[2] - a1[2]) * u];
          t.quad(L0(u0), L0(u1), L1(u1), L1(u0), out, paint);
        }
      }
    }
  }
  t.fan(plan.map((_, i) => at(i, y1)), new THREE.Vector3(0, 1, 0), top);
  return t.geometry();
}

function edgeOut(a: [number, number], b: [number, number], mx: number, mz: number): [number, number] {
  const ex = b[0] - a[0];
  const ez = b[1] - a[1];
  const L = Math.hypot(ex, ez) || 1;
  let nx = ez / L;
  let nz = -ex / L;
  if (nx * ((a[0] + b[0]) / 2 - mx) + nz * ((a[1] + b[1]) / 2 - mz) < 0) {
    nx = -nx;
    nz = -nz;
  }
  return [nx, nz];
}

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

const lathe = (prof: [number, number][], seg: number) => new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg);

/** Spins a geometry built facing +z (the sea wall) round to face side `k` (0 sea, 1 +x, 2 land, 3 -x). */
const toSide = <G extends THREE.BufferGeometry>(g: G, k: number) => g.rotateY((k * Math.PI) / 2);
/** A point on face `k`'s own frame (u along it, v out) in the fort's frame. */
const faceToFort = (k: number, u: number, v: number): [number, number] => {
  const a = (k * Math.PI) / 2;
  const c = Math.round(Math.cos(a));
  const s = Math.round(Math.sin(a));
  return [u * c + v * s, -u * s + v * c];
};
/** Which wall an embrasure facing `yaw` (fort frame) is in. */
const sideOf = (yaw: number) => ((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4;
/** A gun's place along its own wall (its face frame's u). */
const alongOf = (g: { x: number; z: number; yaw: number }) => {
  const k = sideOf(g.yaw);
  return k === 0 ? g.x : k === 1 ? -g.z : k === 2 ? -g.x : g.z;
};
const FACE_Z = new THREE.Vector3(0, 0, 1);
const _c = new THREE.Vector3();

const SOOT = lin(0x1e1a17);
const CHAR = lin(0x2a211b);
const MOSS = lin(0x5d8a3c);
const TIMBER = lin(0x8a6440);
const WICKER = lin(0x8a6a3e);

const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Ashlar: courses 0.62 m high, blocks 1.3 m long, each a little lighter or darker; damp and mossy toward the foot, streaked by rain. */
function ashlar(S: FortStyle, c: THREE.Vector3, n: THREE.Vector3, ground: number) {
  const P = S.P;
  const TB = S.WH * 0.45;
  const along = Math.abs(n.x) > Math.abs(n.z) ? c.z : c.x;
  const course = Math.floor((c.y + 30) / 0.62);
  const block = Math.floor((along + 40 + (course % 2) * 0.65) / 1.3);
  let k = 0.9 + hash(course, block) * 0.16;
  // rain has run down from the coping in dark streaks
  const streak = hash(Math.floor((along + 40) / 0.5), 3.7);
  if (streak > 0.78) k *= 1 - (streak - 0.78) * (0.55 + P.moss * 0.8) * clamp((c.y - ground) / 3, 0.2, 1);
  const base = c.y < TB ? P.lo.clone().lerp(P.stone, clamp((c.y + 1.5) / (TB + 1.5), 0, 1)) : P.stone.clone();
  const damp = clamp((ground + 1.2 - c.y) / 1.6, 0, 1) * 0.7;
  base.lerp(P.damp, damp);
  if (P.moss > 0) {
    // moss creeping up from the foot, and in patches where the blocks stay wet
    const patch = hash(Math.floor((along + 40) / 1.9), Math.floor((c.y + 30) / 1.24));
    const m = P.moss * (clamp((ground + 2.6 - c.y) / 2.6, 0, 1) * 0.85 + (patch > 0.72 ? 0.45 : 0) + (n.y > 0.5 ? 0.5 : 0));
    base.lerp(MOSS, clamp(m, 0, 0.8));
  }
  return shade(base, k);
}

/** Coping and parapet tops: the palest stone, mossed over in the mists. */
function capStone(S: FortStyle, c: THREE.Vector3, n: THREE.Vector3, k = 1) {
  const v = 0.92 + hash(Math.floor(c.x * 1.3 + c.z * 1.3), Math.floor(c.y * 2)) * 0.1;
  const base = S.P.cap.clone();
  if (S.P.moss > 0 && (n.y > 0.4 || hash(Math.floor(c.x * 0.8), Math.floor(c.z * 0.8)) > 0.6)) base.lerp(MOSS, S.P.moss * 0.5);
  return shade(base, v * k);
}

/** Stone a fire has blackened: darker the nearer the heart of it. */
const scorched = (col: THREE.Color, t: number) => col.clone().lerp(SOOT, clamp(t, 0, 1) * 0.85);

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

/** A tumbled block of masonry. */
const rock = (s: number, rnd: () => number) => new THREE.DodecahedronGeometry(s, 0).scale(1.25, 0.7 + rnd() * 0.25, 1).rotateY(rnd() * 3).rotateX((rnd() - 0.5) * 0.6);

/** A blackened beam between two points (a roof's charred rafter). */
function rafter(b: Builder, a: THREE.Vector3, c: THREE.Vector3, r: number) {
  b.beam(a, c, r, (p) => (hash(Math.floor(p.y * 5), Math.floor(p.x * 5 + p.z * 5)) > 0.7 ? lin(0x4a2a18) : CHAR), 'wood', 5);
}

/** The keep's place and size (torre), x mirrored by `ms`. */
function keepSpot(S: FortStyle, ms: number) {
  const PL = S.H - S.T;
  return { x: ms * (PL - 2.6), z: -PL + 2.8, r: 2.5, top: S.WH + 6.4 };
}

// ------------------------------------------------------------------ the fort

/**
 * Builds a fort into `b` in its own frame (y = 0 the plaza floor) and returns
 * where its garrison stands, its guns, its chest and flag, what's solid and
 * what can be knocked down (layout positions in world space). `ground` is the
 * terrain's height (world).
 */
export function buildFort(b: Builder, s: FortSite, ground: (x: number, z: number) => number, seed: number): FortLayout {
  const rnd = mulberry32(seed);
  const S = styleOf(s);
  const P = S.P;
  const { H, T, WH, PH, PT } = S;
  const TB = WH * 0.45;
  const D = s.drop;
  const PL = H - T;
  const cs = corners(S);
  /** The interior's mirror: which side the barracks stand on. */
  const ms = rnd() < 0.5 ? 1 : -1;
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
  const push = (g: THREE.BufferGeometry, into: Builder = b) => into.parts.wood.push(g);
  const lowG = Math.min(...[-H, 0, H].flatMap((u) => [-H, 0, H].map((v) => G(u, v))));
  const ash: Stone = (c, n) => ashlar(S, c, n, lowG + 1.5);
  const cap: Stone = (c, n) => capStone(S, c, n);

  const pieces: FortPiece[] = [];
  const piece = (key: string, at: THREE.Vector3) => {
    const p: FortPiece = { key, at, intact: new Builder(), broken: new Builder(), patch: new Builder() };
    pieces.push(p);
    return p;
  };
  /** A talus of fallen blocks on the ground (fort frame), scorched or not. */
  const talus = (into: Builder, lx: number, lz: number, spread: number, n: number, dir: number, hot = 0.4) => {
    for (let i = 0; i < n; i++) {
      const a = dir + (rnd() - 0.5) * 1.6;
      const r = rnd() * spread;
      const x = lx + Math.cos(a) * r;
      const z = lz + Math.sin(a) * r;
      const sz = 0.22 + rnd() * 0.3;
      into.add(rock(sz, rnd), [x, G(x, z) + sz * 0.35, z], scorched(shade(P.stone, 0.72 + rnd() * 0.3), rnd() * hot), { flat: true });
    }
  };

  // ---- the curtain walls: a battered foot, the cordon, the face, the rampart
  const talud = (d: number) => H + (TB - d) * 0.18;
  const wallProfile = (): [number, number][] => [
    [H - T, -D],
    [talud(-D), -D],
    [H, TB],
    [H, WH],
    [H - T, WH],
  ];
  // the curtain runs to the corner works (a star fort's bastions stand on its ends)
  const span = S.tower === 'point' ? H - S.R : H - 1;
  // and its parapet stops where the corner's own begins
  const pEnd =
    S.tower === 'point'
      ? H - S.R
      : S.tower === 'square'
      ? H - 0.4 - S.R + 0.05
      : S.rise > 0
      ? cs[0].x - Math.sqrt(Math.max(0, S.R * S.R - (cs[0].x - (H - PT / 2)) ** 2)) + 0.15
      : H - 2.6;
  const BAND = 2.2;
  S.guns.forEach((g, gi) => {
    const k = sideOf(g.yaw);
    const u = alongOf(g);
    const [fx, fz] = faceToFort(k, u, H - PT / 2);
    piece(`gun${gi}`, new THREE.Vector3(fx, WH + PH * 0.5, fz));
  });
  const gunPiece = (gi: number) => pieces.find((p) => p.key === `gun${gi}`)!;

  for (let side = 0; side < 4; side++) {
    const gate = side === 2;
    const spans: [number, number][] = gate ? [[-span, -GATE_W / 2], [GATE_W / 2, span]] : [[-span, span]];
    for (const [x0, x1] of spans) push(faceted(toSide(prism(wallProfile(), x0, x1, ash), side)));
    if (gate) {
      // the lintel over the gate, and its passage floor
      push(faceted(toSide(prism([[H - T, GATE_H], [H + 0.02, GATE_H], [H + 0.02, WH], [H - T, WH]], -GATE_W / 2, GATE_W / 2, (c, n) => ashlar(S, c, n, -9)), side)));
      push(faceted(toSide(prism([[H - T - 0.02, -D], [H + 0.3, -D], [H + 0.3, 0], [H - T - 0.02, 0]], -GATE_W / 2, GATE_W / 2, (c) => shade(P.floor, 0.88 + hash(Math.floor(c.x / 0.9), Math.floor(c.z / 0.9)) * 0.14)), side)));
    }
    // the cordon: a rounded stone rod right round the walls where the batter ends
    const rods: [number, number][] = gate ? [[-span, -GATE_W / 2 - 0.55], [GATE_W / 2 + 0.55, span]] : [[-span, span]];
    for (const [x0, x1] of rods) {
      const rod = new THREE.CylinderGeometry(0.17, 0.17, x1 - x0, 8).rotateZ(Math.PI / 2).translate((x0 + x1) / 2, TB, H + 0.03);
      push(faceted(toSide(rod, side), () => P.cap));
    }
    // the guns on this face, along it (in the face's own frame, before it's spun round)
    const xs = S.guns.map((g, gi) => ({ u: alongOf(g), gi, k: sideOf(g.yaw) })).filter((g) => g.k === side).sort((p, q) => p.u - q.u);
    // the parapet, broken by an embrasure at each gun; the stretch either side of a gun is that gun's to lose
    const runs: [number, number][] = [];
    let at = -pEnd;
    for (const g of xs) {
      runs.push([at, g.u - 0.62]);
      at = g.u + 0.62;
    }
    runs.push([at, pEnd]);
    const subs: { x0: number; x1: number; gi: number }[] = [];
    for (const [x0, x1] of runs) {
      if (x1 - x0 < 0.3) continue;
      const marks = [x0, x1];
      for (const g of xs) for (const e of [g.u - BAND, g.u + BAND]) if (e > x0 + 0.05 && e < x1 - 0.05) marks.push(e);
      marks.sort((p, q) => p - q);
      for (let i = 0; i + 1 < marks.length; i++) {
        const m = (marks[i] + marks[i + 1]) / 2;
        const g = xs.find((o) => Math.abs(o.u - m) < BAND);
        subs.push({ x0: marks[i], x1: marks[i + 1], gi: g ? g.gi : -1 });
      }
    }
    for (const r of subs) {
      const into = r.gi < 0 ? b : gunPiece(r.gi).intact;
      parapetRun(r.x0, r.x1, (g) => push(faceted(toSide(g, side), cap), into));
    }
    for (const g of xs) {
      const pc = gunPiece(g.gi);
      // sills under the embrasures, splayed so the guns can traverse
      push(faceted(toSide(roundBox(1.3, 0.45, PT, 0.12).translate(g.u, WH + 0.22, H - PT / 2), side), () => shade(P.cap, 0.86)), pc.intact);
      wreckParapet(pc, side, g.u);
    }
    // a waterspout (gárgola) or two down the face, each with its stain
    for (const gx of side === 2 ? [-span * 0.62, span * 0.62] : [-span * 0.68, 0.3, span * 0.68]) {
      if (xs.some((g) => Math.abs(g.u - gx) < 1.2)) continue;
      push(faceted(toSide(new THREE.BoxGeometry(0.28, 0.24, 0.9).translate(gx, WH - 0.15, H + 0.35), side), () => shade(P.lo, 0.9)));
      const stain = new THREE.PlaneGeometry(0.5, WH - TB - 0.4, 1, 3).translate(gx, (WH + TB) / 2 - 0.2, H + 0.025);
      push(faceted(toSide(stain, side), (c) => shade(P.stone.clone().lerp(P.moss > 0 ? MOSS : P.damp, 0.45), 0.7 + clamp((WH - c.y) / WH, 0, 1) * 0.25)));
    }
  }

  /** A run of parapet along a face (face frame), as rounded merlons or crenellations. */
  function parapetRun(x0: number, x1: number, out: (g: THREE.BufferGeometry) => void) {
    if (S.parapet === 'round') {
      out(roundBox(x1 - x0, PH, PT, 0.22).translate((x0 + x1) / 2, WH + PH / 2, H - PT / 2));
      return;
    }
    // a breastwork, and square merlons standing on it
    const base = PH * 0.45;
    out(new THREE.BoxGeometry(x1 - x0, base, PT).translate((x0 + x1) / 2, WH + base / 2, H - PT / 2));
    const L = x1 - x0;
    const n = Math.max(1, Math.round((L + 0.55) / 1.55));
    const mw = Math.min(1.0, (L - (n - 1) * 0.55) / n);
    const gap = n > 1 ? (L - n * mw) / (n - 1) : 0;
    for (let i = 0; i < n; i++) {
      const cx = n > 1 ? x0 + mw / 2 + i * (mw + gap) : (x0 + x1) / 2;
      const h = PH + 0.3 - base;
      out(new THREE.BoxGeometry(mw, h, PT * 0.92).translate(cx, WH + base + h / 2, H - PT / 2));
    }
  }

  /** A gun's stretch of parapet smashed (face frame `side`, gun at `u`): stumps, blocks on the rampart, a talus at the foot, the face blackened; and the timber mantlets its new owners put up. */
  function wreckParapet(pc: FortPiece, side: number, u: number) {
    const B = pc.broken;
    for (const sgn of [-1, 1]) {
      let x = u + sgn * 0.7;
      while (Math.abs(x - u) < BAND - 0.2) {
        const w = 0.45 + rnd() * 0.5;
        const h = PH * (0.12 + rnd() * 0.45);
        const g = new THREE.BoxGeometry(w, h, PT * (0.7 + rnd() * 0.3)).rotateY((rnd() - 0.5) * 0.3).rotateZ((rnd() - 0.5) * 0.25).translate(x + (sgn * w) / 2, WH + h / 2, H - PT / 2 + (rnd() - 0.5) * 0.15);
        push(faceted(toSide(g, side), (c) => scorched(capStone(S, c, FACE_Z), 0.6 - Math.abs(c.x - u) * 0.12 + rnd() * 0.3)), B);
        x += sgn * (w + 0.12 + rnd() * 0.3);
      }
    }
    // blocks tumbled in onto the rampart
    for (let i = 0; i < 4; i++) {
      const sz = 0.2 + rnd() * 0.22;
      const g = rock(sz, rnd).translate(u + (rnd() - 0.5) * 3.4, WH + sz * 0.4, H - PT - 0.5 - rnd() * 1.2);
      push(faceted(toSide(g, side), () => scorched(shade(P.cap, 0.8 + rnd() * 0.25), rnd() * 0.5)), B);
    }
    // the face under it blackened by the blast
    const sc = new THREE.CircleGeometry(1.5, 10);
    const pos = sc.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 1; i < pos.count; i++) pos.setXY(i, pos.getX(i) * (0.8 + rnd() * 0.5), pos.getY(i) * (0.7 + rnd() * 0.4));
    sc.scale(1, 0.9, 1).translate(u, WH - 0.55, H + 0.03);
    toSide(sc, side);
    // (the scorch rides with the wreck, so it shows only once the parapet's gone)
    push(colorOf(sc, (p) => scorched(P.stone, 1 - Math.hypot(sideU(side, p) - u, (p.y - (WH - 0.55)) * 1.1) / 1.6)), B);
    // and what fell outward lies at the foot of the wall
    const [lx, lz] = faceToFort(side, u, H + 1.6);
    const [nx, nz] = faceToFort(side, 0, 1);
    talus(B, lx, lz, 2.2, 7, Math.atan2(nz, nx), 0.3);
    // the patch: gabions either side of the gap and a plank mantlet over the stumps
    const Pp = pc.patch;
    for (const sgn of [-1, 1]) {
      const gx = u + sgn * 1.15;
      const gab = new THREE.CylinderGeometry(0.42, 0.42, 0.95, 9, 3).translate(gx, WH + 0.48, H - PT / 2);
      push(faceted(toSide(gab, side), (c) => shade(WICKER, 0.8 + 0.25 * (Math.floor((c.y - WH) / 0.16) % 2))), Pp);
      for (let i = 0; i < 4; i++) {
        const px = u + sgn * (1.75 + i * 0.26);
        const plank = new THREE.BoxGeometry(0.22, PH + 0.1, 0.07).rotateZ((rnd() - 0.5) * 0.06).translate(px, WH + (PH + 0.1) / 2, H - PT * 0.25);
        push(faceted(toSide(plank, side), () => shade(TIMBER, 0.85 + rnd() * 0.3)), Pp);
      }
      const rail = new THREE.BoxGeometry(1.2, 0.1, 0.09).translate(u + sgn * 2.15, WH + PH * 0.7, H - PT * 0.25 - 0.08);
      push(faceted(toSide(rail, side), () => shade(TIMBER, 0.7)), Pp);
    }
  }

  // the rampart floor (the terreplein) between the walls' tops is their prism tops; the plaza below:
  const floor = new THREE.PlaneGeometry(PL * 2, PL * 2, Math.round(PL * 1.33), Math.round(PL * 1.33)).rotateX(-Math.PI / 2);
  push(faceted(floor, (c) => {
    const k = 0.84 + hash(Math.floor((c.x + 40) / 1.43), Math.floor((c.z + 40) / 1.43)) * 0.2;
    // a worn path of paler stones from the gate to the flagstaff
    const path = Math.abs(c.x) < 1.6 ? 1.06 : 1;
    const f = P.floor.clone();
    if (P.moss > 0 && hash(Math.floor((c.x + 40) / 1.43), 9) > 0.7) f.lerp(MOSS, P.moss * 0.35);
    return shade(f, k * path);
  }));
  // under the floor's edge, a skirt down into the ground so no gap shows where the walls meet it
  push(faceted(prism([[-PL, -D], [PL, -D], [PL, -0.02], [-PL, -0.02]], -PL, PL, () => shade(P.lo, 0.7), 40, 40)));

  // ---- the corner works
  cs.forEach((c, j) => towerAt(c, j));

  function towerAt(c: Corner, j: number) {
    const pc = piece(`tower${j}`, new THREE.Vector3(c.x, c.top + PH, c.z));
    // its own foot may run deeper than the curtain's, out over the slope
    let Dt = D;
    const probe = c.poly ?? [[c.x + c.r, c.z], [c.x - c.r, c.z], [c.x, c.z + c.r], [c.x, c.z - c.r]];
    for (const [x, z] of probe) Dt = Math.max(Dt, -G(x, z) + 2.0);
    const ga = c.out;
    const outX = Math.cos(ga);
    const outZ = Math.sin(ga);
    if (!c.poly) {
      const R = c.r;
      const prof: [number, number][] = [[0, -Dt], [R + (TB + Dt) * 0.18, -Dt], [R, TB], [R, c.top], [0, c.top + 0.02]];
      const drum = lathe(densify(prof), 22).translate(c.x, 0, c.z);
      push(faceted(drum, (p, n) => {
        if (p.y > c.top - 0.01) return capStone(S, p, n, 0.92);
        // unrolled round the drum, so the courses and joints run on
        return ashlar(S, _c.set(Math.atan2(p.z - c.z, p.x - c.x) * R, p.y, 0), FACE_Z, lowG + 1.5);
      }));
      push(faceted(new THREE.TorusGeometry(R + 0.03, 0.17, 6, 26).rotateX(Math.PI / 2).translate(c.x, TB, c.z), () => P.cap));
      if (S.rise > 0) push(faceted(new THREE.TorusGeometry(R + 0.05, 0.14, 6, 26).rotateX(Math.PI / 2).translate(c.x, c.top - 0.12, c.z), () => P.cap));
      // its parapet: a rounded ring, or a low breastwork with merlons (under a cone roof, just the breastwork)
      if (S.parapet === 'round') {
        const ring: [number, number][] = [[R + 0.06, c.top], [R + 0.06, c.top + PH - 0.2], [R - 0.14, c.top + PH], [R - PT + 0.1, c.top + PH], [R - PT, c.top + PH - 0.2], [R - PT, c.top + 0.02]];
        push(faceted(lathe(ring, 22).translate(c.x, 0, c.z), (p, n) => capStone(S, p, n, 0.9 + hash(Math.floor(Math.atan2(p.z - c.z, p.x - c.x) * 4), 3) * 0.12)), pc.intact);
      } else {
        const base = S.roof === 'cone' ? 0.6 : PH * 0.45;
        push(faceted(lathe([[R + 0.05, c.top], [R + 0.05, c.top + base], [R - PT, c.top + base], [R - PT, c.top + 0.02]], 22).translate(c.x, 0, c.z), cap), pc.intact);
        if (S.roof !== 'cone') {
          const n = Math.round((TAU * R) / 1.55);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + ga;
            const h = PH + 0.3 - base;
            const m = new THREE.BoxGeometry(0.95, h, PT * 0.9).rotateY(-a + Math.PI / 2).translate(c.x + Math.cos(a) * (R - PT / 2), c.top + base + h / 2, c.z + Math.sin(a) * (R - PT / 2));
            push(faceted(m, cap), pc.intact);
          }
        }
      }
      if (S.roof === 'cone') {
        const e = c.top + 0.55;
        const cone = lathe([[R + 0.5, e], [R + 0.38, e + 0.22], [0.14, e + 4.3], [0, e + 4.4]], 18).translate(c.x, 0, c.z);
        push(faceted(cone, (p) => shade(P.roof, 0.82 + 0.16 * (Math.floor((p.y - e) / 0.42) % 2) + hash(Math.floor(Math.atan2(p.z - c.z, p.x - c.x) * 5), Math.floor(p.y * 2)) * 0.08)), pc.intact);
        push(faceted(new THREE.CylinderGeometry(0.03, 0.06, 1.1, 5).translate(c.x, e + 4.9, c.z), () => lin(0x2c2a28)), pc.intact);
        push(faceted(new THREE.SphereGeometry(0.13, 8, 5).translate(c.x, e + 4.55, c.z), () => lin(0x2c2a28)), pc.intact);
        // burnt through: a few charred rafters standing out of the drum
        for (let i = 0; i < 6; i++) {
          if (rnd() < 0.25) continue;
          const a = (i / 6) * TAU + rnd() * 0.4;
          const foot = new THREE.Vector3(c.x + Math.cos(a) * (R - 0.4), e - 0.2, c.z + Math.sin(a) * (R - 0.4));
          const t = 0.35 + rnd() * 0.4;
          const tip = new THREE.Vector3(c.x + Math.cos(a) * (R - 0.4) * (1 - t), e - 0.2 + 4.2 * t, c.z + Math.sin(a) * (R - 0.4) * (1 - t));
          rafter(pc.broken, foot, tip, 0.09);
        }
      }
      // the garita: a little round sentry box, corbelled out over the corner on its cone
      if (S.garita) garita(pc, c.x + outX * (R - 0.55), c.top + PH - 0.25, c.z + outZ * (R - 0.55), ga);
      // the ring smashed to jagged stumps, blocks on the tower's top and at its foot
      const n = 12;
      for (let i = 0; i < n; i++) {
        if (rnd() < 0.3) continue;
        const a = (i / n) * TAU + rnd() * 0.2;
        const h = PH * (0.1 + rnd() * 0.55);
        const w = (TAU * R) / n - 0.15;
        const m = new THREE.BoxGeometry(w, h, PT * 0.85).rotateZ((rnd() - 0.5) * 0.3).rotateY(-a + Math.PI / 2).translate(c.x + Math.cos(a) * (R - PT / 2), c.top + h / 2, c.z + Math.sin(a) * (R - PT / 2));
        push(faceted(m, (p, nn) => scorched(capStone(S, p, nn), 0.35 + rnd() * 0.4)), pc.broken);
      }
      for (let i = 0; i < 4; i++) {
        const a = rnd() * TAU;
        const r = rnd() * (R - 1.2);
        const sz = 0.2 + rnd() * 0.25;
        pc.broken.add(rock(sz, rnd), [c.x + Math.cos(a) * r, c.top + sz * 0.4, c.z + Math.sin(a) * r], scorched(shade(P.cap, 0.85), rnd() * 0.6), { flat: true });
      }
      talus(pc.broken, c.x + outX * (R + 1.6), c.z + outZ * (R + 1.6), 2.4, 7, ga, 0.35);
      block(c.x, c.z, R + 0.5);
    } else {
      // square towers and arrowhead bastions: a coursed pile on their plan
      const plan = c.poly;
      push(faceted(pile(plan.map(([x, z]) => [x, z] as [number, number]), -Dt, c.top, TB, ash, (p, n) => capStone(S, p, n, 0.92))));
      // cordon rods round its outer faces
      const outer = edges(plan, c, H).filter((e) => e.outer);
      for (const e of outer) {
        const rod = new THREE.CylinderGeometry(0.17, 0.17, e.L, 8).rotateZ(Math.PI / 2).rotateY(-Math.atan2(e.dz, e.dx)).translate(e.mx + e.nx * 0.03, TB, e.mz + e.nz * 0.03);
        push(faceted(rod, () => P.cap));
        if (S.rise > 0) {
          const rod2 = new THREE.BoxGeometry(e.L + 0.3, 0.22, 0.26).rotateY(-Math.atan2(e.dz, e.dx)).translate(e.mx + e.nx * 0.08, c.top - 0.11, e.mz + e.nz * 0.08);
          push(faceted(rod2, () => P.cap));
        }
      }
      // its parapet along the outer faces (all four on a tower that stands clear of the rampart)
      const run = S.tower === 'square' ? edges(plan, c, H) : outer;
      for (const e of run) {
        const yaw = -Math.atan2(e.dz, e.dx);
        const along = (g: THREE.BufferGeometry, t: number, inset: number) => g.rotateY(yaw).translate(e.ax + e.dx * t - e.nx * inset, 0, e.az + e.dz * t - e.nz * inset);
        if (S.parapet === 'round') {
          push(faceted(along(roundBox(e.L, PH, PT, 0.22).translate(0, c.top + PH / 2, 0).rotateY(Math.PI), 0.5, PT / 2), cap), pc.intact);
        } else {
          const base = PH * 0.45;
          push(faceted(along(new THREE.BoxGeometry(e.L, base, PT).translate(0, c.top + base / 2, 0), 0.5, PT / 2), cap), pc.intact);
          // (under a roof, just the breastwork: the eaves come down over it)
          const n = S.roof === 'none' ? Math.max(2, Math.round((e.L + 0.55) / 1.55)) : 0;
          const mw = Math.min(1.0, (e.L - (n - 1) * 0.55) / n);
          const gap = n > 1 ? (e.L - n * mw) / (n - 1) : 0;
          for (let i = 0; i < n; i++) {
            const t = (mw / 2 + i * (mw + gap)) / e.L;
            const h = PH + 0.3 - base;
            push(faceted(along(new THREE.BoxGeometry(mw, h, PT * 0.92).translate(0, c.top + base + h / 2, 0), t, PT / 2), cap), pc.intact);
          }
        }
        // the wreck: stumps along it
        for (let t = 0.08; t < 0.95; t += 0.16 + rnd() * 0.12) {
          if (rnd() < 0.3) continue;
          const h = PH * (0.1 + rnd() * 0.5);
          push(faceted(along(new THREE.BoxGeometry(0.5 + rnd() * 0.5, h, PT * 0.85).rotateZ((rnd() - 0.5) * 0.3).translate(0, c.top + h / 2, 0), t, PT / 2), (p, nn) => scorched(capStone(S, p, nn), 0.3 + rnd() * 0.45)), pc.broken);
        }
      }
      if (S.roof === 'pyramid') {
        const R = S.R;
        const e = c.top + PH * 0.45 + 0.05;
        const roof = new THREE.ConeGeometry((R + 0.55) * Math.SQRT2, 4.2, 4, 3).rotateY(Math.PI / 4).translate(c.x, e + 2.1, c.z);
        push(faceted(roof, (p) => shade(P.roof, 0.82 + 0.16 * (Math.floor((p.y - e) / 0.4) % 2) + hash(Math.floor(p.x * 2), Math.floor(p.z * 2)) * 0.06)), pc.intact);
        push(faceted(new THREE.CylinderGeometry(0.03, 0.06, 1.2, 5).translate(c.x, e + 4.7, c.z), () => lin(0x2c2a28)), pc.intact);
        push(faceted(new THREE.SphereGeometry(0.14, 8, 5).translate(c.x, e + 4.3, c.z), () => lin(0x2c2a28)), pc.intact);
        // its eaves on a timber plate over the merlons
        for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
          const foot = new THREE.Vector3(c.x + dx * (R - 0.3), e - 0.1, c.z + dz * (R - 0.3));
          const t = 0.3 + rnd() * 0.45;
          rafter(pc.broken, foot, new THREE.Vector3(c.x + dx * (R - 0.3) * (1 - t), e - 0.1 + 4.1 * t, c.z + dz * (R - 0.3) * (1 - t)), 0.1);
        }
        rafter(pc.broken, new THREE.Vector3(c.x - (R - 0.4), e - 0.05, c.z + (rnd() - 0.5)), new THREE.Vector3(c.x + (R - 0.6) * 0.4, e + 0.6, c.z + (rnd() - 0.5)), 0.08);
      }
      if (S.garita && S.tower === 'point') {
        // the bastion's point: a sentry box hung off its salient
        const [tx, tz] = plan[3];
        garita(pc, tx - outX * 0.55 * Math.SQRT2, c.top + PH - 0.25, tz - outZ * 0.55 * Math.SQRT2, ga);
      }
      for (let i = 0; i < 4; i++) {
        const sz = 0.2 + rnd() * 0.25;
        const x = c.x + (rnd() - 0.5) * c.r * 0.9;
        const z = c.z + (rnd() - 0.5) * c.r * 0.9;
        pc.broken.add(rock(sz, rnd), [x, c.top + sz * 0.4, z], scorched(shade(P.cap, 0.85), rnd() * 0.6), { flat: true });
      }
      const far = plan.reduce((m, p) => (p[0] * outX + p[1] * outZ > m[0] * outX + m[1] * outZ ? p : m), plan[0]);
      talus(pc.broken, far[0] + outX * 1.4, far[1] + outZ * 1.4, 2.6, 8, ga, 0.35);
      // walls for the walkers: its outline
      for (const e of edges(plan, c, H)) {
        const n = Math.max(1, Math.round(e.L / 1.3));
        for (let i = 0; i <= n; i++) block(e.ax + (e.dx * i) / n - e.nx * 0.7, e.az + (e.dz * i) / n - e.nz * 0.7, 1.0);
      }
      block(c.x, c.z, Math.min(c.r, 3.2));
    }
  }

  function garita(pc: FortPiece, gx: number, gy: number, gz: number, ga: number) {
    const corbel = lathe([[0.05, -1.3], [0.32, -1.0], [0.62, -0.42], [0.82, 0]], 14).translate(gx, gy, gz);
    const corbelPaint: Stone = (c) => shade(P.cap, 0.86 + Math.floor((c.y - gy) * -3) * 0.04);
    push(faceted(corbel, corbelPaint));
    const box = new THREE.CylinderGeometry(0.74, 0.74, 1.85, 14, 1, true).translate(gx, gy + 0.93, gz);
    push(faceted(box, (c) => {
      // a dark slit window looking out to each side
      const a = Math.atan2(c.z - gz, c.x - gx);
      const slit = c.y > gy + 0.7 && c.y < gy + 1.4 && [ga, ga + 1.4, ga - 1.4].some((w) => Math.abs(Math.atan2(Math.sin(a - w), Math.cos(a - w))) < 0.18);
      return slit ? lin(0x2a2420) : shade(P.wash, 0.95);
    }), pc.intact);
    push(faceted(new THREE.CylinderGeometry(0.86, 0.86, 0.14, 14).translate(gx, gy + 1.9, gz), () => P.cap), pc.intact);
    push(faceted(new THREE.SphereGeometry(0.8, 14, 6, 0, TAU, 0, Math.PI / 2).translate(gx, gy + 1.96, gz), (c) => shade(P.cap, 0.94 + (c.y - gy - 1.96) * 0.06)), pc.intact);
    pc.intact.add(new THREE.SphereGeometry(0.14, 8, 6), [gx, gy + 2.86, gz], P.cap);
    pc.intact.add(new THREE.CylinderGeometry(0.05, 0.08, 0.2, 6), [gx, gy + 2.72, gz], P.cap);
    // knocked off: a stub of its wall on the corbel, the rest gone over the side
    const stub = new THREE.CylinderGeometry(0.74, 0.74, 0.5, 14, 1, true, ga - 2.2, 3.6).translate(gx, gy + 0.25, gz);
    push(faceted(stub, (c) => scorched(P.wash, 0.3 + (c.y - gy) * 0.6)), pc.broken);
    talus(pc.broken, gx + Math.cos(ga) * 3.5, gz + Math.sin(ga) * 3.5, 1.6, 4, ga, 0.1);
  }

  // ---- the gate: an arched frame on the face, pilasters, the arms above, the doors and the ramp
  const gz0 = -H;
  const arch = new THREE.TorusGeometry(GATE_W / 2 + 0.2, 0.22, 6, 16, Math.PI).translate(0, GATE_H - GATE_W / 2 - 0.2, 0).rotateY(Math.PI).translate(0, 0, gz0 - 0.08);
  push(faceted(arch, () => P.cap));
  for (const sx of [-1, 1]) b.box(0.5, GATE_H - GATE_W / 2 - 0.2, 0.32, [sx * (GATE_W / 2 + 0.2), (GATE_H - GATE_W / 2 - 0.2) / 2, gz0 - 0.08], P.cap, { r: 0.06 });
  b.box(1.25, 1.45, 0.28, [0, GATE_H + 0.95, gz0 - 0.12], shade(P.cap, 1.04), { r: 0.14 });
  b.box(0.72, 0.8, 0.12, [0, GATE_H + 0.98, gz0 - 0.3], lin(0xd8a640), { b: 'gold', r: 0.08 });
  b.ball(0.15, [0, GATE_H + 1.85, gz0 - 0.15], lin(0xd8a640), { b: 'gold' });
  // a lantern on a bracket either side, lit through the night
  for (const sx of [-1, 1]) {
    const lx = sx * (GATE_W / 2 + 1.0);
    b.box(0.08, 0.08, 0.5, [lx, GATE_H + 0.1, gz0 - 0.25], lin(0x2c2a28), { b: 'iron' });
    b.cyl(0.16, 0.12, 0.34, [lx, GATE_H - 0.18, gz0 - 0.48], lin(0x2c2a28), { b: 'iron', seg: 6 });
    b.ball(0.11, [lx, GATE_H - 0.2, gz0 - 0.48], new THREE.Color(2.4, 1.3, 0.45), { b: 'glow' });
    b.add(new THREE.ConeGeometry(0.2, 0.18, 6), [lx, GATE_H + 0.07, gz0 - 0.48], lin(0x2c2a28), { b: 'iron' });
  }
  if (S.hoarding) {
    // a timber gallery hung out over the gate on beams, for dropping things on the unwelcome
    const y0 = WH - 0.2;
    for (const x of [-2.5, -1.25, 0, 1.25, 2.5]) b.box(0.2, 0.2, 2.4, [x, y0, gz0 - 0.2], C.timberDark);
    b.box(5.6, 0.1, 1.3, [0, y0 + 0.15, gz0 - 0.75], (p) => shade(TIMBER, 0.8 + 0.2 * (Math.floor((p.x + 9) / 0.3) % 2)));
    b.box(5.6, PH + 0.5, 0.12, [0, y0 + 0.2 + (PH + 0.5) / 2, gz0 - 1.38], (p) => shade(TIMBER, (Math.abs(p.x % 1.1) < 0.12 && p.y > y0 + 0.9 ? 0.25 : 0.82) + 0.12 * (Math.floor((p.x + 9) / 0.28) % 2)));
    for (const x of [-2.75, 2.75]) b.box(0.12, PH + 0.5, 1.3, [x, y0 + 0.2 + (PH + 0.5) / 2, gz0 - 0.75], shade(TIMBER, 0.75));
    b.gable(1.7, 0.7, 6.0, [0, y0 + PH + 0.7, gz0 - 0.7], (p) => shade(P.roof, 0.85 + 0.15 * (Math.floor((p.x + 20) / 0.35) % 2)), true);
  }
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
  push(faceted(prism(rampProf(0), -GATE_W / 2 - 0.25, GATE_W / 2 + 0.25, (c, n) => (n.y > 0.5 ? shade(P.floor, 0.86 + hash(Math.floor(c.z / 0.7), 3) * 0.14) : shade(P.lo, 0.85)), 0.8, 0.7)));
  for (const sx of [-1, 1]) {
    const x0 = sx * (GATE_W / 2 + 0.25);
    const x1 = sx * (GATE_W / 2 + 0.7);
    push(faceted(prism(rampProf(0.55), Math.min(x0, x1), Math.max(x0, x1), (c, n) => ashlar(S, c, n, foot))));
    // the kerbs are walls
    for (let t = 0.15; t <= 1; t += 0.28) block(sx * (GATE_W / 2 + 0.48), gz0 - rampLen * t, 0.42);
  }
  // the two door leaves, hinged at the jambs (built in their own groups so they can swing)
  const doors: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const leaf = new Builder();
    const w = GATE_W / 2 - 0.04;
    leaf.box(w, GATE_H - 0.1, 0.16, [(-sx * w) / 2, (GATE_H - 0.1) / 2, 0], (p) => shade(lin(0x5c3a22), 0.85 + 0.15 * (Math.floor((p.x + 9) / 0.27) % 2)));
    for (const y of [0.6, 1.6, 2.6]) leaf.box(w * 0.94, 0.12, 0.2, [(-sx * w) / 2, y, 0], lin(0x2c2a28), { b: 'iron' });
    for (let i = 0; i < 4; i++) leaf.ball(0.045, [-sx * (0.25 + i * 0.36), 2.1, -0.11], lin(0x2c2a28), { b: 'iron' });
    const g = new THREE.Group();
    g.userData.leaf = leaf;
    g.userData.side = sx;
    doors.push(g);
  }

  // ---- the plaza: barracks, the magazine (or chapel, or keep), stairs to the rampart, the brazier, benches and the flagstaff
  // barracks against one wall, whitewashed under tiles
  const bx = -ms * (PL - 1.8);
  const bl = Math.min(9.2, 2 * PL - 5.6);
  const bz = -1.2;
  b.box(3.6, 2.8, bl, [bx, 1.4, bz], (p) => (p.y < 0.35 ? shade(P.lo, 0.9) : P.wash), { r: 0.08 });
  const roof = piece('roof', new THREE.Vector3(bx, 3.6, bz));
  roof.intact.gable(4.4, 1.5, bl + 0.7, [bx, 2.8, bz], (p) => shade(P.tile, 0.86 + 0.14 * (Math.floor((p.z + 20) / 0.32) % 2)), false);
  // burnt out: blackened rafters and the ridge pole sagging, a scrap of tiles at either end
  for (let z = bz - bl / 2 + 0.3; z <= bz + bl / 2 - 0.2; z += 1.1) {
    for (const sx of [-1, 1]) {
      if (rnd() < 0.3) continue;
      const t = 0.55 + rnd() * 0.45;
      rafter(roof.broken, new THREE.Vector3(bx + sx * 2.0, 2.82, z), new THREE.Vector3(bx + sx * 2.0 * (1 - t), 2.82 + 1.45 * t, z + (rnd() - 0.5) * 0.2), 0.07);
    }
  }
  rafter(roof.broken, new THREE.Vector3(bx, 4.2, bz - bl / 2 + 0.2), new THREE.Vector3(bx + 0.1, 3.4, bz + 0.4), 0.09);
  rafter(roof.broken, new THREE.Vector3(bx - 0.1, 3.1, bz + 1.6), new THREE.Vector3(bx, 4.15, bz + bl / 2 - 0.2), 0.09);
  roof.broken.gable(4.4, 1.5, 1.4, [bx, 2.8, bz + bl / 2 - 0.35], () => scorched(shade(P.tile, 0.86), 0.5 + rnd() * 0.3), false);
  roof.broken.gable(4.4, 1.5, 0.9, [bx, 2.8, bz - bl / 2 + 0.1], () => scorched(shade(P.tile, 0.86), 0.6), false);
  for (let i = 0; i < 6; i++) roof.broken.add(rock(0.18 + rnd() * 0.12, rnd), [bx + ms * (2.2 + rnd() * 0.8), 0.12, bz + (rnd() - 0.5) * bl], scorched(P.tile, 0.4 + rnd() * 0.4), { flat: true });
  const roofAt = [-1, 0, 1].map((t) => new THREE.Vector3(bx, 3.9, bz + t * bl * 0.33));
  const dx = bx + ms * 1.82;
  const dz = [bz - bl * 0.37, bz, bz + bl * 0.37];
  for (const z of dz) {
    b.box(0.08, 1.7, 0.95, [dx, 0.85, z], C.door);
    b.box(0.1, 0.12, 1.15, [dx, 1.78, z], P.cap);
  }
  for (const z of [(dz[0] + dz[1]) / 2, (dz[1] + dz[2]) / 2]) b.box(0.06, 0.6, 0.6, [dx, 1.6, z], lin(S.P.moss > 0 ? 0x3d5a6a : 0x2f6f9a));
  for (let z = bz - bl / 2 + 1; z <= bz + bl / 2 - 0.9; z += 1.5) block(bx, z, 2.1);
  // barrels and crates by its door
  const crate = PropGeo.crate(0.6);
  const barrel = PropGeo.barrel(0.84, 0.3);
  for (const [lx, lz, k, lift] of [[bx + ms * 2.35, bz + bl / 2 - 0.6, 'c', 0], [bx + ms * 2.4, bz + bl / 2 - 1.4, 'b', 0], [bx + ms * 2.3, bz + bl / 2 - 0.6, 'c', 0.6], [bx + ms * 2.6, bz - bl / 2 - 0.7, 'b', 0]] as const) {
    if (Math.abs(lz) > PL - 0.5) continue;
    const g = (k === 'c' ? crate : barrel).clone();
    g.rotateY(rnd() * 0.8);
    g.translate(lx, (k === 'c' ? 0.3 : 0.42) + lift, lz);
    b.parts.wood.push(g);
    if (!lift) block(lx, lz, 0.45);
  }
  // across the plaza: the powder magazine, a chapel, or the keep
  const mx = ms * (PL - 1.9);
  const mz = -PL + 2.6;
  if (S.hall === 'magazine') {
    b.box(3.0, 2.2, 3.8, [mx, 1.1, mz], (p) => shade(P.stone, 0.86 + hash(Math.floor(p.y / 0.5), Math.floor(p.z / 0.9)) * 0.12), { r: 0.06 });
    const vault = new THREE.CylinderGeometry(1.5, 1.5, 3.8, 14, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(mx, 2.2, mz);
    push(faceted(vault, cap));
    b.box(0.08, 1.5, 0.9, [mx - ms * 1.52, 0.75, mz], lin(0x2c2a28), { b: 'iron' });
    // a lightning rod, for the obvious reason
    b.beam(new THREE.Vector3(mx, 3.6, mz + 1.6), new THREE.Vector3(mx, 5.4, mz + 1.6), 0.025, lin(0x2c2a28), 'iron', 4);
    block(mx, mz - 0.9, 1.8);
    block(mx, mz + 0.9, 1.8);
  } else if (S.hall === 'chapel') {
    // a little whitewashed chapel, its bell hung in an espadaña over the door
    const cx = ms * (PL - 2.1);
    const cz = -PL + 3.6;
    b.box(3.2, 3.0, 4.4, [cx, 1.5, cz], (p) => (p.y < 0.4 ? shade(P.lo, 0.9) : P.wash), { r: 0.08 });
    b.gable(3.8, 1.3, 4.8, [cx, 3.0, cz], (p) => shade(P.tile, 0.86 + 0.14 * (Math.floor((p.z + 20) / 0.32) % 2)), false);
    const fz = cz + 2.25;
    b.box(2.4, 2.0, 0.4, [cx, 4.0, fz], P.wash, { r: 0.06 });
    b.box(1.1, 0.9, 0.4, [cx, 5.3, fz], P.wash, { r: 0.06 });
    b.box(2.6, 0.14, 0.5, [cx, 5.0, fz], P.cap);
    b.box(0.62, 0.8, 0.44, [cx, 4.25, fz], lin(0x2a2420));
    b.add(new THREE.LatheGeometry([[0.02, 0.36], [0.16, 0.34], [0.2, 0.12], [0.27, 0]].map(([r, y]) => new THREE.Vector2(r, y)), 10), [cx, 3.95, fz], lin(0xb08a3a), { b: 'gold' });
    b.box(0.05, 0.5, 0.05, [cx, 5.95, fz], lin(0x2c2a28), { b: 'iron' });
    b.box(0.32, 0.05, 0.05, [cx, 6.05, fz], lin(0x2c2a28), { b: 'iron' });
    b.box(0.08, 1.8, 0.95, [cx, 0.9, fz + 0.01], C.door);
    block(cx, cz - 1.1, 2.0);
    block(cx, cz + 1.1, 2.0);
  } else {
    // the keep: a tall round tower in the corner, the last place to hold out
    const k = keepSpot(S, ms);
    const prof: [number, number][] = [[0, -0.5], [k.r + 0.45, -0.5], [k.r, 1.8], [k.r, k.top], [0, k.top + 0.02]];
    push(faceted(lathe(densify(prof), 18).translate(k.x, 0, k.z), (p, n) => {
      if (p.y > k.top - 0.01) return capStone(S, p, n, 0.92);
      const a = Math.atan2(p.z - k.z, p.x - k.x);
      // arrow slits up its face
      const slit = Math.abs(Math.sin(a * 2 + 0.6)) < 0.08 && p.y > 2.2 && p.y < k.top - 1 && Math.floor(p.y / 1.4) % 2 === 0;
      return slit ? lin(0x2a2420) : ashlar(S, _c.set(a * k.r, p.y, 0), FACE_Z, -0.5);
    }));
    push(faceted(new THREE.TorusGeometry(k.r + 0.05, 0.14, 6, 22).rotateX(Math.PI / 2).translate(k.x, k.top - 0.12, k.z), () => P.cap));
    push(faceted(lathe([[k.r + 0.05, k.top], [k.r + 0.05, k.top + 0.5], [k.r - 0.7, k.top + 0.5], [k.r - 0.7, k.top + 0.02]], 18).translate(k.x, 0, k.z), cap));
    const n = Math.round((TAU * k.r) / 1.5);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      push(faceted(new THREE.BoxGeometry(0.85, 0.75, 0.62).rotateY(-a + Math.PI / 2).translate(k.x + Math.cos(a) * (k.r - 0.32), k.top + 0.87, k.z + Math.sin(a) * (k.r - 0.32)), cap));
    }
    const da = Math.atan2(-k.z, -k.x);
    b.box(0.95, 1.9, 0.3, [k.x + Math.cos(da) * (k.r - 0.05), 0.95, k.z + Math.sin(da) * (k.r - 0.05)], C.door, { ry: -da + Math.PI / 2 });
    block(k.x, k.z, k.r + 0.4);
  }
  // stairs up to the rampart along the wall facing the barracks
  const nSteps = Math.round(WH / 0.44);
  const stH = WH / nSteps;
  const stTop = Math.min(PL - 0.95, S.tower === 'point' ? H - S.R - 0.7 : S.tower === 'square' ? H - 0.4 - S.R - 0.6 : PL - 0.95);
  for (let i = 0; i < nSteps; i++) {
    const z = stTop - (nSteps - 1 - i) * 0.55;
    b.box(1.4, (i + 1) * stH, 0.56, [ms * (PL - 0.7), ((i + 1) * stH) / 2, z], shade(P.stone, 0.92 + (i % 2) * 0.05));
  }
  for (let i = 0; i < 4; i++) block(ms * (PL - 0.75), stTop - 0.6 - i * 1.4, 0.8);
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
    b.box(1.6, 0.42, 0.5, [lx, 0.21, lz], shade(P.cap, 0.9), { r: 0.1, ry: -a + Math.PI / 2 });
    const pt = W(lx * 0.96, fz + (lz - fz) * 0.96);
    const f = W(0, fz);
    seats.push({ x: pt.x, z: pt.z, yaw: Math.atan2(f.x - pt.x, f.z - pt.z) });
    block(lx, lz, 0.5);
  }
  // the flagstaff: a tall mast on a stone plinth near the sea wall, with a signal yard
  const sz = PL - 1.8;
  const top = 12.6;
  b.box(1.3, 0.7, 1.3, [0, 0.35, sz], P.cap, { r: 0.1 });
  b.beam(new THREE.Vector3(0, 0.6, sz), new THREE.Vector3(0, top, sz), 0.14, C.timberDark);
  b.beam(new THREE.Vector3(-1.6, top - 3.4, sz), new THREE.Vector3(1.6, top - 3.4, sz), 0.06, C.timberDark);
  b.ball(0.2, [0, top + 0.1, sz], lin(0xd8a640), { b: 'gold' });
  block(0, sz, 0.75);
  // round shot stacked by every gun
  for (const g of S.guns) {
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
    for (let u = -span + 0.8; u <= span - 0.8; u += 1.4) {
      if (side === 2 && Math.abs(u) < GATE_W / 2 + 1.6) continue;
      const [lx, lz] = faceToFort(side, u, H - T / 2);
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
    { ...xzOf(W(ms * (PL - 4.3), mz + 2.6)), yaw: s.yaw - (ms * Math.PI) / 2 },
    { ...xzOf(W(ms * (PL - 2.6), stTop - 2.2)), yaw: s.yaw },
    { ...xzOf(W(-1.6, sz - 1.4)), yaw: s.yaw },
    { ...xzOf(W(bx + ms * 2.6, 1.2)), yaw: s.yaw + (ms * Math.PI) / 2 },
  ];
  const chest = W(bx + ms * 2.5, -3.2, 0);
  const guns = S.guns.map((g) => ({ pos: W(g.x, g.z, WH), yaw: s.yaw + g.yaw }));
  return {
    style: S,
    ms,
    fire: new THREE.Vector3(fp.x, s.y + 1.1, fp.z),
    chest,
    chestYaw: s.yaw + (ms * Math.PI) / 2,
    flagTop: W(0, sz, top - 0.3),
    flagDrop: top - 2.4,
    seats,
    posts,
    blocks,
    guns,
    rampLen,
    rampFootY: foot + s.y,
    doors,
    pieces,
    roofAt,
  };
}

/** A plan's edges, each with its outward normal and whether it faces out past the walls. */
function edges(plan: [number, number][], c: { x: number; z: number }, H: number) {
  const N = plan.length;
  return plan.map((a, i) => {
    const b = plan[(i + 1) % N];
    const [nx, nz] = edgeOut(a, b, c.x, c.z);
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const L = Math.hypot(dx, dz);
    const mx = (a[0] + b[0]) / 2;
    const mz = (a[1] + b[1]) / 2;
    // an edge that only faces the plaza or the rampart is buried in them
    const outer = Math.max(Math.abs(mx + nx * 0.5), Math.abs(mz + nz * 0.5)) > H;
    return { ax: a[0], az: a[1], dx, dz, L, mx, mz, nx, nz, outer };
  });
}

/** Paints a geometry vertex by vertex (smooth: a scorch fading into the stone round it). */
function colorOf(g: THREE.BufferGeometry, paint: (p: THREE.Vector3) => THREE.Color) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
  if (!n.getAttribute('normal')) n.computeVertexNormals();
  const pos = n.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = paint(_p.fromBufferAttribute(pos, i));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  n.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return n;
}

/** A point's place along face `k` (fort frame back to the face's own u). */
function sideU(k: number, p: THREE.Vector3) {
  return k === 0 ? p.x : k === 1 ? -p.z : k === 2 ? -p.x : p.z;
}

const xzOf = (p: THREE.Vector3) => ({ x: p.x, z: p.z });

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
    b.add(new THREE.DodecahedronGeometry(s, 0).scale(1.2, 0.7, 1), [Math.cos(a) * r, s * 0.4, Math.sin(a) * r * 0.8 + 0.3], shade(lin(0xe0d2b2), 0.7 + rnd() * 0.35), { ry: rnd() * 3, flat: true });
  }
  // a scorched beam end and a cracked wheel
  b.add(new THREE.BoxGeometry(0.13, 0.13, 1.1), [0.35, 0.18, -0.4], lin(0x2b1e14), { ry: 0.7, rz: 0.2 });
  b.add(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 10).rotateX(Math.PI / 2.4), [-0.5, 0.2, -0.3], lin(0x2b2016));
  return mergeGeometries(b.parts.wood)!;
}

/**
 * A shot scar: a blackened crater with a pale rim of fresh-broken stone and a
 * few chips standing proud, facing +z (centred on the surface it marks).
 */
export function pockGeometry() {
  const b = new Builder();
  const rnd = mulberry32(919);
  const N = 11;
  const pos: number[] = [];
  const col: number[] = [];
  const ring = (r: number, z: number) => Array.from({ length: N }, (_, i) => {
    const a = (i / N) * TAU;
    const j = 0.75 + rnd() * 0.5;
    return [Math.cos(a) * r * j, Math.sin(a) * r * j, z];
  });
  // (all of it standing a hair proud of the face it's laid on)
  const mid = [0, 0, 0.005];
  const inner = ring(0.42, 0.015);
  const rim = ring(0.62, 0.05);
  const outer = ring(0.95, 0.01);
  const c = (k: number) => [k, k, k];
  for (let i = 0; i < N; i++) {
    const n = (i + 1) % N;
    pos.push(...mid, ...inner[i], ...inner[n]);
    col.push(...c(0.05), ...c(0.09), ...c(0.09));
    pos.push(...inner[i], ...rim[i], ...rim[n], ...inner[i], ...rim[n], ...inner[n]);
    col.push(...c(0.09), ...c(0.72), ...c(0.72), ...c(0.09), ...c(0.72), ...c(0.09));
    pos.push(...rim[i], ...outer[i], ...outer[n], ...rim[i], ...outer[n], ...rim[n]);
    col.push(...c(0.72), ...c(0.42), ...c(0.42), ...c(0.72), ...c(0.42), ...c(0.72));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  b.parts.wood.push(g);
  for (let i = 0; i < 4; i++) {
    const a = rnd() * TAU;
    const r = 0.7 + rnd() * 0.35;
    b.add(new THREE.TetrahedronGeometry(0.08 + rnd() * 0.06), [Math.cos(a) * r, Math.sin(a) * r, 0.03], new THREE.Color(1, 1, 1), { ry: rnd() * 3, rx: rnd() * 3, flat: true });
  }
  return mergeGeometries(b.parts.wood)!;
}

/** One fallen block (unit-ish), for masonry knocked off a face. */
export function blockGeometry() {
  const b = new Builder();
  b.add(new THREE.DodecahedronGeometry(0.34, 0).scale(1.3, 0.75, 1), [0, 0, 0], new THREE.Color(1, 1, 1), { flat: true });
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
