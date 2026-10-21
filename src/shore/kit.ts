import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../render/environment';
import { clamp, mulberry32 } from '../core/noise';
import { Bucket, Builder, C, colorize, lin, shade } from '../port/port';
import { PropGeo } from '../port/pirates';
import type { CampSite, Disc } from './ground';
import { lampMaterial } from '../render/lamps';

// The things a landing party finds and brings: the ship's boat pulled up on
// the sand, and the cutthroats' camps (a patched tent, a smoking fire with a
// pot on the spit, log benches, plunder stacked in crates, a weapon rack and
// the jolly roger on a pole) with a locked chest beside each tent. All of it
// is built once at load with the harbour's own material setups, so nothing
// new is compiled mid-voyage.

const TAU = Math.PI * 2;

export interface ShoreMats {
  wood: THREE.MeshStandardMaterial;
  iron: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
  flag: THREE.MeshStandardMaterial;
}

/** The same material setups as the harbour and the trading ports. */
export function shoreMats(): ShoreMats {
  return {
    wood: patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, envMapIntensity: 0.8 }), { clouds: true, caustics: true }),
    iron: patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.7, envMapIntensity: 1.2 }), { clouds: true }),
    gold: patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 1, envMapIntensity: 1.6, emissive: new THREE.Color(0.35, 0.22, 0.03) }), { clouds: true }),
    glow: lampMaterial(),
    flag: patchMaterial(new THREE.MeshStandardMaterial({ map: jollyRoger(), side: THREE.DoubleSide, roughness: 0.8, alphaTest: 0.5 }), { flag: true }),
  };
}

/** The cutthroats' colours: a grinning skull over crossed cutlasses, frayed at the fly. */
function jollyRoger() {
  const W = 256;
  const H = 160;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#121010';
  g.beginPath();
  // a ragged trailing edge
  g.moveTo(0, 0);
  g.lineTo(W - 10, 0);
  for (let i = 0; i <= 8; i++) g.lineTo(W - (i % 2 ? 22 : 4) - Math.random() * 8, (i / 8) * H);
  g.lineTo(0, H);
  g.closePath();
  g.fill();
  g.fillStyle = '#efe8d8';
  g.strokeStyle = '#efe8d8';
  g.lineCap = 'round';
  // crossed blades
  g.lineWidth = 9;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(112 - s * 62, 132);
    g.quadraticCurveTo(112 - s * 10, 96, 112 + s * 56, 34);
    g.stroke();
    g.fillRect(112 - s * 62 - 13, 124, 26, 9);
  }
  // the skull
  g.beginPath();
  g.ellipse(112, 70, 34, 32, 0, 0, TAU);
  g.fill();
  g.fillRect(92, 88, 40, 26);
  g.fillStyle = '#121010';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(112 + s * 14, 70, 10, 11, 0, 0, TAU);
    g.fill();
  }
  g.beginPath();
  g.moveTo(112, 80);
  g.lineTo(106, 92);
  g.lineTo(118, 92);
  g.fill();
  for (let i = 0; i < 4; i++) g.fillRect(97 + i * 9, 104, 3, 10);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ------------------------------------------------------------------ the ship's boat

/** Length and beam of the ship's boat. */
export const BOAT_L = 5.4;
export const BOAT_B = 1.6;

/** A clinker-built jolly boat: bow toward +z, keel at y = 0, oars shipped across the thwarts. */
export function buildBoat(b: Builder) {
  const L = BOAT_L;
  const B = BOAT_B;
  const NU = 22;
  const NV = 12;
  const halfW = (t: number) => (B / 2) * Math.pow(Math.sin(Math.PI * clamp(0.13 + t * 0.87, 0, 1)), 0.55);
  const sheer = (t: number) => 0.62 + 0.16 * (2 * t - 1) ** 2 + 0.07 * t;
  const keel = (t: number) => 0.14 * Math.abs(2 * t - 1) ** 3;
  const paint = lin(0x2f6f73);
  const stripe = lin(0xf1e6cc);
  const bottom = lin(0x7a3324);
  const raw = lin(0xb88a5a);
  const shell = (inner: boolean) => {
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= NU; i++) {
      const t = i / NU;
      const w = halfW(t) * (inner ? 0.9 : 1);
      const g = sheer(t) - (inner ? 0.02 : 0);
      const k = keel(t) + (inner ? 0.07 : 0);
      for (let j = 0; j <= NV; j++) {
        const th = (j / NV) * Math.PI;
        const s = Math.pow(Math.sin(th), 0.62);
        pos.push(w * Math.cos(th), g - (g - k) * s, (t - 0.5) * L);
      }
    }
    for (let i = 0; i < NU; i++) {
      for (let j = 0; j < NV; j++) {
        const a = i * (NV + 1) + j;
        const c = a + NV + 1;
        if (inner) idx.push(a, a + 1, c, a + 1, c + 1, c);
        else idx.push(a, c, a + 1, a + 1, c, c + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  };
  // the strakes: lapped planks in bands, a cream sheer stripe and red bottom paint
  b.add(shell(false), [0, 0, 0], (p) => {
    const strake = Math.floor((p.y + 0.02) / 0.105) % 2 ? 0.9 : 1;
    if (p.y > 0.6 + 0.16 * (p.z / (L / 2)) ** 2) return shade(stripe, strake);
    return shade(p.y < 0.24 ? bottom : paint, strake);
  });
  b.add(shell(true), [0, 0, 0], (p) => shade(raw, 0.85 + 0.15 * (Math.floor(p.z / 0.32 + 40) % 2)));
  // gunwale caps and the transom
  const gun: THREE.Vector3[] = [];
  for (let i = 0; i <= NU; i++) {
    const t = i / NU;
    gun.push(new THREE.Vector3(halfW(t) * 0.95, sheer(t) + 0.015, (t - 0.5) * L));
  }
  for (const s of [-1, 1]) {
    for (let i = 0; i < NU; i++) {
      const a = gun[i].clone().setX(gun[i].x * s);
      const c = gun[i + 1].clone().setX(gun[i + 1].x * s);
      if (a.distanceTo(c) < 1e-3) continue;
      b.beam(a, c, 0.045, C.timberDark, 'wood', 5);
    }
  }
  const tw = halfW(0);
  b.box(tw * 2, sheer(0) - keel(0) - 0.05, 0.06, [0, (sheer(0) + keel(0)) / 2 + 0.02, -L / 2 + 0.03], (p) => (p.y > sheer(0) - 0.14 ? stripe : paint), { r: 0.02 });
  // stem post, rising past the bow
  b.beam(new THREE.Vector3(0, 0.1, L / 2 - 0.2), new THREE.Vector3(0, sheer(1) + 0.16, L / 2 + 0.02), 0.06, C.timberDark);
  // thwarts, the oars across them, a coil of painter at the bow and a bailer
  for (const t of [0.26, 0.5, 0.72]) {
    const w = halfW(t) * 0.9 * 2;
    b.box(w, 0.05, 0.28, [0, sheer(t) - 0.2, (t - 0.5) * L], shade(raw, 1.05), { r: 0.015 });
  }
  for (const s of [-1, 1]) {
    const oar = new THREE.CylinderGeometry(0.03, 0.03, 3.4, 6).rotateX(Math.PI / 2).rotateY(s * 0.05);
    b.add(oar, [s * 0.32, 0.58, -0.1], C.timber);
    b.box(0.16, 0.02, 0.62, [s * 0.32 - s * 0.08, 0.58, -0.1 - 1.55], C.timber, { ry: s * 0.05 });
  }
  b.add(new THREE.TorusGeometry(0.16, 0.035, 5, 12).rotateX(Math.PI / 2), [0, sheer(0.84) - 0.25, (0.84 - 0.5) * L], lin(0xcdb98a));
  b.add(new THREE.CylinderGeometry(0.12, 0.09, 0.14, 8), [0.25, 0.2, -0.9], lin(0x8a6440));
}

// ------------------------------------------------------------------ chests

/** A plunder chest in two parts: the body, and the lid hinged at its back edge (pivot at the origin). */
export function chestParts(): { body: Record<Bucket, THREE.BufferGeometry | null>; lid: Record<Bucket, THREE.BufferGeometry | null> } {
  const W = 0.86;
  const D = 0.54;
  const H = 0.44;
  const wood = lin(0x6a3f22);
  const dark = lin(0x3a2414);
  const body = new Builder();
  body.box(W, H, D, [0, H / 2, 0], (p) => shade(wood, 0.85 + 0.15 * (Math.floor((p.y + 1) / 0.11) % 2)), { r: 0.03 });
  for (const x of [-W * 0.36, W * 0.36]) body.box(0.07, H + 0.01, D + 0.02, [x, H / 2, 0], lin(0x2c2a28), { b: 'iron', r: 0.01 });
  body.box(W + 0.02, 0.05, D + 0.02, [0, 0.03, 0], dark, { r: 0.01 });
  body.box(0.13, 0.16, 0.05, [0, H - 0.07, D / 2 + 0.02], lin(0xd8a640), { b: 'gold', r: 0.02 });
  const lid = new Builder();
  // the lid curves over like a barrel top, hinged along its back edge
  const top = new THREE.CylinderGeometry(D / 2, D / 2, W, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2);
  top.scale(1, 0.62, 1);
  lid.add(top, [0, 0, D / 2], (p) => shade(wood, 0.95 + 0.1 * Math.sin(p.x * 30)));
  for (const x of [-W * 0.36, W * 0.36]) {
    const band = new THREE.CylinderGeometry(D / 2 + 0.012, D / 2 + 0.012, 0.075, 12, 1, true, 0, Math.PI).rotateZ(Math.PI / 2);
    band.scale(1, 0.64, 1);
    lid.add(band, [x, 0, D / 2], lin(0x2c2a28), { b: 'iron' });
  }
  lid.box(0.12, 0.14, 0.04, [0, 0, D + 0.01], lin(0xd8a640), { b: 'gold', r: 0.015 });
  const pack = (bld: Builder) => {
    const out = { wood: null, iron: null, glow: null, gold: null } as Record<Bucket, THREE.BufferGeometry | null>;
    for (const k of Object.keys(bld.parts) as Bucket[]) if (bld.parts[k].length) out[k] = mergeGeometries(bld.parts[k])!;
    return out;
  };
  // the body sits with its back edge at z = -D / 2, so the lid's hinge is at (0, H, -D / 2)
  return { body: pack(body), lid: pack(lid) };
}
export const CHEST_H = 0.44;
export const CHEST_D = 0.54;

// ------------------------------------------------------------------ camps

export interface CampLayout {
  /** World-space fire centre (ground height). */
  fire: THREE.Vector3;
  /** The chest, its facing, and the flag's masthead. */
  chest: THREE.Vector3;
  chestYaw: number;
  flagTop: THREE.Vector3;
  /** Log seats round the fire (world), each facing the flames. */
  seats: { x: number; z: number; yaw: number }[];
  /** Spots to loiter at: by the tent, at the woodpile, watching the sea. */
  posts: { x: number; z: number; yaw: number }[];
  blocks: Disc[];
}

/**
 * Builds one camp into `b`, in world space and sitting on the ground, and
 * returns where its people sit and stand and what's solid.
 */
export function buildCamp(b: Builder, site: CampSite, ground: (x: number, z: number) => number, seed: number): CampLayout {
  const rnd = mulberry32(seed);
  const cy = Math.cos(site.yaw);
  const sy = Math.sin(site.yaw);
  // camp frame: +z towards the sea (the tent's mouth), +x to its left
  const W = (lx: number, lz: number) => new THREE.Vector3(site.x + lx * cy + lz * sy, 0, site.z - lx * sy + lz * cy);
  const at = (lx: number, lz: number, lift = 0): [number, number, number] => {
    const p = W(lx, lz);
    return [p.x, ground(p.x, p.z) + lift, p.z];
  };
  const blocks: Disc[] = [];
  const block = (lx: number, lz: number, r: number) => {
    const p = W(lx, lz);
    blocks.push({ x: p.x, z: p.z, r });
  };
  const stone = (k: number) => lin(0x8d8a84).multiplyScalar(0.8 + k * 0.35);

  // the fire: a ring of stones, a cone of burning logs, an ember bed and a pot on the spit
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + rnd() * 0.2;
    const s = 0.15 + rnd() * 0.06;
    b.add(new THREE.DodecahedronGeometry(s, 0).scale(1.2, 0.75, 1), at(Math.cos(a) * 0.72, Math.sin(a) * 0.72, s * 0.35), stone(rnd()), { ry: rnd() * TAU, flat: true });
  }
  const fy = at(0, 0)[1];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.3;
    const foot = W(Math.cos(a) * 0.48, Math.sin(a) * 0.48).setY(fy + 0.02);
    const tip = W(Math.cos(a) * 0.08, Math.sin(a) * 0.08).setY(fy + 0.62);
    b.beam(foot, tip, 0.05, (p) => (p.y > fy + 0.3 ? lin(0x1b1512) : C.timberDark));
  }
  b.ball(0.42, at(0, 0, 0.02), new THREE.Color(2.4, 0.75, 0.18), { b: 'glow', s: [1, 0.22, 1] });
  for (const s of [-1, 1]) {
    const foot = W(s * 0.95, 0).setY(ground(...xz(W(s * 0.95, 0))) - 0.1);
    const top = foot.clone().setY(foot.y + 1.15);
    b.beam(foot, top, 0.04, C.timber);
    b.beam(top, top.clone().add(W(s * 0.14, 0).sub(W(0, 0))).setY(top.y + 0.16), 0.03, C.timber);
    b.beam(top, top.clone().add(W(-s * 0.14, 0).sub(W(0, 0))).setY(top.y + 0.16), 0.03, C.timber);
  }
  b.beam(W(-1.05, 0).setY(fy + 1.12), W(1.05, 0).setY(fy + 1.12), 0.025, lin(0x4a4642), 'iron');
  const pot = new THREE.LatheGeometry([[0.02, -0.2], [0.17, -0.18], [0.22, -0.06], [0.2, 0.08], [0.17, 0.1]].map(([r, y]) => new THREE.Vector2(r, y)), 12);
  b.add(pot, at(0, 0, 0.82), lin(0x2a2826), { b: 'iron' });
  block(0, 0, 0.95);

  // log benches round the fire, sat on by whoever isn't busy
  const seats: CampLayout['seats'] = [];
  for (const a of [0.95, 2.4, 3.85, 5.3].slice(0, 3 + Math.floor(rnd() * 2))) {
    const r = 2.25;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const [x, y, z] = at(cx, cz);
    const len = 1.9;
    const log = new THREE.CylinderGeometry(0.2, 0.22, len, 9).rotateZ(Math.PI / 2);
    // lie tangent to the ring
    // weathered driftwood: grey-brown bark, paler where it's been sat on
    b.add(log, [x, y + 0.14, z], (p) => shade(p.y > y + 0.3 ? lin(0xa08a6c) : lin(0x8a6d4e), 0.85 + 0.25 * Math.abs(Math.sin(p.x * 9 + p.z * 7))), { ry: site.yaw - a + Math.PI / 2 });
    for (const end of [-1, 1]) {
      const e = W(cx - Math.sin(a) * end * len * 0.3, cz + Math.cos(a) * end * len * 0.3);
      blocks.push({ x: e.x, z: e.z, r: 0.42 });
    }
    // sit facing the fire
    const seat = W(cx * 0.97, cz * 0.97);
    seats.push({ x: seat.x, z: seat.z, yaw: Math.atan2(site.x - seat.x, site.z - seat.z) });
  }

  // the tent: patched canvas over a ridge pole, its mouth to the fire
  const TZ = -4.6;
  const span = 1.4;
  const rise = 1.95;
  const len = 3.2;
  const canvas = lin(0xd9ccaa);
  const patch = lin(0xb59a6c);
  const slant = Math.hypot(span, rise);
  const lean = Math.atan2(span, rise);
  const ty = Math.max(...[[-1.2, -1.4], [1.2, -1.4], [-1.2, 1.4], [1.2, 1.4], [0, 0]].map(([u, v]) => ground(...xz(W(u, TZ + v))))) - 0.08;
  const tc = W(0, TZ);
  for (const s of [-1, 1]) {
    const sheet = new THREE.BoxGeometry(0.035, slant, len, 1, 4, 6);
    sheet.rotateZ(s * lean);
    sheet.translate(s * span * 0.5, rise / 2, 0);
    b.add(sheet, [tc.x, ty, tc.z], (p) => {
      const u = p.y - ty;
      const dirt = clamp(1 - u / 0.6, 0, 1) * 0.25;
      const pz = Math.floor((p.x + p.z) * 1.7) % 3 === 0 && u > 0.6 && u < 1.4 ? patch : canvas;
      return shade(pz, 1 - dirt);
    }, { ry: site.yaw });
  }
  const back = new THREE.BufferGeometry();
  back.setAttribute('position', new THREE.Float32BufferAttribute([-span, 0, -len / 2, span, 0, -len / 2, 0, rise, -len / 2, span, 0, -len / 2 - 0.02, -span, 0, -len / 2 - 0.02, 0, rise, -len / 2 - 0.02], 3));
  back.computeVertexNormals();
  b.add(back, [tc.x, ty, tc.z], shade(canvas, 0.92), { ry: site.yaw });
  // ridge pole, front poles and guy pegs
  const ridgeA = W(0, TZ - len / 2 - 0.15).setY(ty + rise + 0.02);
  const ridgeB = W(0, TZ + len / 2 + 0.3).setY(ty + rise + 0.02);
  b.beam(ridgeA, ridgeB, 0.04, C.timberDark);
  b.beam(W(0, TZ + len / 2 + 0.2).setY(ty - 0.1), ridgeB.clone().setY(ty + rise + 0.04), 0.035, C.timberDark);
  // a bedroll in the mouth of the tent
  b.add(new THREE.CylinderGeometry(0.17, 0.17, 1.2, 8).rotateZ(Math.PI / 2), at(0.4, TZ + 0.9, 0.17), lin(0x7a4a3a), { ry: site.yaw + 1.2 });
  block(0, TZ, 1.75);
  block(0, TZ + 1.2, 1.2);

  // the plunder: crates and barrels against the tent, a rack of blades
  const crate = PropGeo.crate(0.62);
  const barrel = PropGeo.barrel(0.86, 0.32);
  const stack: [number, number, 'c' | 'b', number][] = [[2.1, TZ + 0.6, 'c', 0], [2.25, TZ - 0.3, 'b', 0], [2.0, TZ + 0.6, 'c', 0.62], [-2.15, TZ + 0.2, 'b', 0], [-2.3, TZ - 0.6, 'b', 0]];
  for (const [lx, lz, k, lift] of stack) {
    const g = (k === 'c' ? crate : barrel).clone();
    const [x, y, z] = at(lx, lz, (k === 'c' ? 0.31 : 0.43) + lift - 0.04);
    g.rotateY(site.yaw + (rnd() - 0.5) * 0.6);
    g.translate(x, y, z);
    b.parts.wood.push(g);
    if (!lift) block(lx, lz, 0.45);
  }
  const rackA = W(-2.6, -1.3);
  const rackB = W(-2.6, 0.1);
  for (const p of [rackA, rackB]) {
    const y0 = ground(p.x, p.z) - 0.1;
    b.beam(p.clone().setY(y0), p.clone().setY(y0 + 1.25), 0.045, C.timberDark);
  }
  const ry0 = ground(rackA.x, rackA.z) + 1.0;
  b.beam(rackA.clone().setY(ry0), rackB.clone().setY(ry0), 0.03, C.timber);
  for (let i = 0; i < 3; i++) {
    const p = rackA.clone().lerp(rackB, 0.22 + i * 0.28);
    const blade = new THREE.BoxGeometry(0.03, 0.85, 0.06).rotateZ((rnd() - 0.5) * 0.15);
    b.add(blade, [p.x, ry0 - 0.1, p.z], lin(0xc7ced6), { b: 'iron', ry: site.yaw });
  }
  block(-2.6, -0.6, 0.6);

  // the jolly roger's pole
  const pole = W(2.6, TZ + 2.2);
  const py = ground(pole.x, pole.z) - 0.2;
  b.beam(pole.clone().setY(py), pole.clone().setY(py + 5.4), 0.06, C.timberDark);
  block(2.6, TZ + 2.2, 0.2);

  const chest = W(-1.25, TZ + 2.0);
  chest.y = ground(chest.x, chest.z) - 0.02;
  block(-1.25, TZ + 2.0, 0.55);

  const posts: CampLayout['posts'] = [
    { ...xzOf(W(1.4, TZ + 1.9)), yaw: site.yaw + 0.4 },
    { ...xzOf(W(0, 4.2)), yaw: site.yaw },
    { ...xzOf(W(-2.1, -2.2)), yaw: site.yaw - 1.2 },
    { ...xzOf(W(3.2, 1.6)), yaw: site.yaw + 0.9 },
  ];
  return {
    fire: new THREE.Vector3(site.x, fy, site.z),
    chest,
    chestYaw: site.yaw + 0.25,
    flagTop: pole.clone().setY(py + 5.3),
    seats,
    posts,
    blocks,
  };
}

const xz = (p: THREE.Vector3): [number, number] => [p.x, p.z];
const xzOf = (p: THREE.Vector3) => ({ x: p.x, z: p.z });

/** A camp's flag: hung from its masthead, flying downwind. */
export function campFlag(mat: THREE.Material) {
  const w = 1.7;
  const h = 1.06;
  const g = new THREE.PlaneGeometry(w, h, 10, 3);
  g.translate(w / 2, -h / 2, 0);
  const pivot = new THREE.Group();
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  pivot.add(m);
  return pivot;
}


// ------------------------------------------------------------------ buried treasure

/**
 * What marks a treasure map's X on the ground: two driftwood sticks crossed on
 * the sand and a little cairn of stones beside them. Local space, X at the origin.
 */
export function buildDigMarks(b: Builder, seed: number) {
  const rnd = mulberry32(seed);
  const drift = lin(0x9c8466);
  for (const a of [Math.PI / 4, -Math.PI / 4]) {
    const len = 1.5 + rnd() * 0.2;
    const s = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(len / 2);
    b.beam(new THREE.Vector3(-s.x, 0.05, -s.z), new THREE.Vector3(s.x, 0.09, s.z), 0.045, (p) => shade(drift, 0.85 + 0.25 * Math.abs(Math.sin(p.x * 13 + p.z * 11))));
  }
  // the cairn, a stride off the X
  let y = 0;
  for (let i = 0; i < 5; i++) {
    const r = 0.26 - i * 0.04 + rnd() * 0.03;
    const g = new THREE.IcosahedronGeometry(r, 0);
    g.scale(1.1, 0.7, 1);
    b.add(g, [1.55 + (rnd() - 0.5) * 0.08, y + r * 0.6, 0.35 + (rnd() - 0.5) * 0.08], shade(lin(0x8d8a84), 0.75 + rnd() * 0.4), { ry: rnd() * 3, flat: true });
    y += r * 1.15;
  }
}

/** The hole as it's dug: dark damp sand at the bottom, a lip of dry sand thrown up round it (grows by scale). */
export function holeGeometry() {
  const prof = [
    [0, -0.42],
    [0.35, -0.4],
    [0.62, -0.25],
    [0.8, -0.02],
    [0.95, 0.1],
    [1.15, 0.06],
    [1.35, 0],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(prof, 18);
  const dry = lin(0xd8c49a);
  const wet = lin(0x5a4630);
  return colorize(g, (p) => {
    const r = Math.hypot(p.x, p.z);
    return shade(r < 0.8 ? wet.clone().lerp(dry, clamp((r - 0.35) / 0.5, 0, 1)) : dry, 0.9 + 0.1 * Math.sin(p.x * 17 + p.z * 13));
  });
}

/** The heap of spoil beside the hole. */
export function spoilGeometry() {
  const g = new THREE.SphereGeometry(0.75, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1.4, 0.36, 1.0);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    // a loose, lumpy heap thrown off the spade, not a boulder
    const r = 1 + 0.13 * Math.sin(Math.atan2(z, x) * 3 + 1) + 0.07 * Math.sin(Math.atan2(z, x) * 7);
    pos.setX(i, x * r);
    pos.setZ(i, z * r);
    pos.setY(i, pos.getY(i) * (1 + 0.22 * Math.sin(x * 7 + z * 5) + 0.12 * Math.sin(x * 13 - z * 11)));
  }
  g.computeVertexNormals();
  return colorize(g, (p) => shade(lin(0xc9b083), 0.88 + 0.14 * Math.sin(p.x * 23 + p.z * 19)));
}
