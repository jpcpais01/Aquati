import * as THREE from 'three';
import { clamp, lerp } from '../core/noise';
import { ball, colorize, hexL, lathe, rbox, spar, surfaceMatrix, sweep, tube } from './geo';
import type { HullShape } from './shipModel';
import type { Livery, ShipClass } from './shipTypes';
import type { Part } from './parts';

// The upgrade parts, modelled. Each builder adds its pieces to the ship's
// own merged buckets (wood, metal, gilt and glow), so a refit costs a few
// hundred triangles and no new draw calls; only the floating mythic bits
// (wards, crystal crowns, a halo) are meshes of their own, because they move.
// Metal parts carry their colour in the vertex paint, so bronze, blued steel,
// gold and obsidian all share the one metal material.
//
// Local frame as in shipModel.ts: +Z bow, +Y up, +X port, waterline y = 0.

export const METAL = {
  iron: hexL(0x23262b),
  bronze: hexL(0xb07a3b),
  brass: hexL(0xd4a84e),
  blued: hexL(0x34466e),
  gold: hexL(0xe8b649),
  paleGold: hexL(0xf6d98a),
  amber: hexL(0xc98a2a),
  obsidian: hexL(0x18151f),
  pearl: hexL(0xeceaf4),
  silver: hexL(0xc5cad6),
  ruby: hexL(0x8a1420),
};

/** Glow paint is linear HDR: the bloom picks it up. */
export const GLOW = {
  window: new THREE.Color(5.0, 3.2, 1.4),
  ember: new THREE.Color(3.2, 0.85, 0.18),
  aether: new THREE.Color(0.32, 1.45, 2.8),
  violet: new THREE.Color(1.55, 0.5, 2.9),
  star: new THREE.Color(2.4, 2.5, 3.1),
};

const HEMP = hexL(0x9c8058);
const TAR = hexL(0x2a1f16);

/** Something that moves on its own: spins about a local axis and bobs up and down. */
export interface Spinner {
  geo: THREE.BufferGeometry;
  mat: 'glow' | 'iron';
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  axis: THREE.Vector3;
  spin: number;
  bob: number;
  rate: number;
  phase: number;
}

export interface MastInfo {
  z: number;
  y0: number;
  H: number;
  r0: number;
}

/** Everything a part builder may add to, handed over by the ship model. */
export interface PartKit {
  shape: HullShape;
  cls: ShipClass;
  livery: Livery;
  detail: boolean;
  wood: THREE.BufferGeometry[];
  iron: THREE.BufferGeometry[];
  trim: THREE.BufferGeometry[];
  glow: THREE.BufferGeometry[];
  smallWood: THREE.BufferGeometry[];
  smallIron: THREE.BufferGeometry[];
  fineIron: THREE.BufferGeometry[];
  spinners: Spinner[];
  cannonTs: number[];
  masts: MastInfo[];
  rope: (a: THREE.Vector3, b: THREE.Vector3, r: number, col: THREE.Color, sag: number) => void;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const Y = V(0, 1, 0);
const Z = V(0, 0, 1);

/** Paints metal: colour in the vertex paint of the metal bucket. */
const metal = (g: THREE.BufferGeometry, c: THREE.Color, jitter = 0.04) => colorize(g, c, jitter);
const glow = (g: THREE.BufferGeometry, c: THREE.Color) => colorize(g, c, 0);

function stemZ(k: PartKit) {
  return k.shape.z(1) + 0.11 + k.cls.length * 0.003;
}

/** A frame on the topsides, the normal levelled so things hang plumb. */
function sideFrame(s: HullShape, t: number, y: number, side: number, out: number, tilt = 0) {
  const n = s.skinNormal(t, y, side);
  n.y = tilt;
  n.normalize();
  return surfaceMatrix(s.skinPoint(t, y, side, out), n);
}

/** Positions along the hull, every `gap` metres between two fractions of her length. */
function along(k: PartKit, t0: number, t1: number, gap: number) {
  const L = k.cls.length;
  const n = Math.max(1, Math.floor(((t1 - t0) * L) / gap));
  return Array.from({ length: n + 1 }, (_, i) => lerp(t0, t1, i / n));
}

/**
 * Whether something `half` metres long can sit on the topsides at t without
 * fouling a gun, a channel and its chainplates, or the entry battens.
 */
function clearAt(k: PartKit, t: number, half: number, guns = true) {
  const s = k.shape;
  const c = k.cls;
  const L = c.length;
  const z = s.z(t);
  if (guns && k.cannonTs.some((g) => Math.abs(s.z(g) - z) < 0.36 + half)) return false;
  for (const m of c.masts) {
    const a = s.z(m.t - (0.055 * 21) / L - 0.012) - 0.2;
    const b = s.z(m.t + (0.02 * 21) / L + 0.012) + 0.2;
    if (z + half > a && z - half < b) return false;
  }
  const ts = k.cannonTs;
  const gaps = ts.slice(1).map((g, i) => (g + ts[i]) / 2);
  const entry = gaps.filter((g) => c.masts.every((m) => Math.abs(m.t - g) > 0.075)).sort((a, b) => Math.abs(a - 0.5) - Math.abs(b - 0.5))[0];
  if (entry !== undefined && Math.abs(s.z(entry) - z) < 0.45 + half) return false;
  return true;
}

/** One side's run of a moulding along the topsides. */
function sideRun(k: PartKit, side: number, yOf: (t: number) => number, out: number, t0 = 0.03, t1 = 0.95, n = 26) {
  const s = k.shape;
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = lerp(t0, t1, i / n);
    return s.skinPoint(t, yOf(t), side, out);
  });
}

// ================================================================== hull plating

export function buildHullPart(k: PartKit, p: Part) {
  ({ strakes: oakStrakes, iron: ironStraps, pavisade, dragonscale, aegis } as Record<string, (k: PartKit) => void>)[p.id.split(':')[1]]?.(k);
}

const waleR = (k: PartKit) => 0.13 + k.cls.length * 0.0035;

/** Common: two extra oak rubbing strakes and fat rope fenders over the side. */
function oakStrakes(k: PartKit) {
  const s = k.shape;
  const r = 0.075 + k.cls.length * 0.0018;
  const col = hexL(k.livery.wale).lerp(hexL(k.livery.hull), 0.55);
  for (const side of [1, -1]) {
    for (const f of [0.38, 0.72]) {
      const pts = sideRun(k, side, (t) => lerp(0.2, s.waleY(t) - waleR(k) * 0.6, f), r * 0.4, 0.035, 0.93);
      k.wood.push(colorize(tube(pts, r, false, k.detail ? 6 : 4, 2), col));
      for (const e of [pts[0], pts[pts.length - 1]]) k.wood.push(colorize(ball(r, e, 6, 4), col));
    }
    // rope fenders hung from the rail on a lanyard
    for (const t of along(k, 0.14, 0.86, 3.4)) {
      if (!clearAt(k, t, 0.2)) continue;
      const y = s.waleY(t) + waleR(k) + 0.3;
      const m = sideFrame(s, t, y, side, 0.12);
      const f = new THREE.CapsuleGeometry(0.13, 0.32, 3, 8);
      k.wood.push(colorize(f.applyMatrix4(m), HEMP));
      for (const dy of [-0.14, 0.14]) {
        const band = new THREE.TorusGeometry(0.135, 0.022, 3, 10);
        band.rotateX(Math.PI / 2).translate(0, dy, 0);
        k.smallWood.push(colorize(band.applyMatrix4(m), TAR));
      }
      const top = V(0, 0.32, 0).applyMatrix4(m);
      k.rope(top, s.skinPoint(t, s.top(t) + 0.04, side, -0.04), 0.022, HEMP, 0);
    }
  }
}

/** Rare: wrought-iron straps from the waterline to the wale, riveted, under an iron cap rail. */
function ironStraps(k: PartKit) {
  const s = k.shape;
  const c = k.cls;
  const iron = METAL.iron.clone().multiplyScalar(1.15);
  for (const side of [1, -1]) {
    for (const t of along(k, 0.08, 0.9, 1.7)) {
      const y1 = s.waleY(t) - waleR(k) * 0.9;
      if (y1 < 0.5) continue;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 4; i++) pts.push(s.skinPoint(t, lerp(0.1, y1, i / 4), side, 0.025));
      const strap = sweep(pts, () => 0.045, 4, 8);
      // flatten the bar against the planking
      k.iron.push(metal(strap, iron));
      if (k.detail) for (let i = 0; i <= 4; i++) k.smallIron.push(metal(ball(0.03, s.skinPoint(t, lerp(0.16, y1 - 0.05, i / 4), side, 0.07), 5, 3), METAL.iron));
    }
    // a band at the boot-top and a capping along the rail
    k.iron.push(metal(tube(sideRun(k, side, () => 0.17, 0.03, 0.03, 0.96), 0.05, false, 5, 2), iron));
    k.iron.push(metal(tube(sideRun(k, side, (t) => s.top(t) + 0.035, -0.09, 0.02, 0.97, 34), 0.06, false, 5, 2), iron));
    // iron knees bolted over the bow and quarter
    for (const t of [0.06, 0.93]) {
      const m = sideFrame(s, t, s.waleY(t) * 0.6, side, 0.04);
      const knee = rbox(0.5, 0.9, 0.06, 0.03).applyMatrix4(m);
      k.iron.push(metal(knee, iron));
    }
  }
  // the cutwater sheathed in iron
  const z = stemZ(k);
  const kr = 0.11 + c.length * 0.003;
  k.iron.push(metal(sweep([V(0, -0.2, z - kr * 0.2), V(0, lerp(s.bottom(1), s.top(1), 0.45), z + kr * 0.25), V(0, s.top(1) - 0.6, z + kr * 0.7)], () => kr * 0.85, 6, 10), iron));
}

/** Epic: bronze-bossed painted shields hung along the rails, and a bronze ram at the cutwater. */
function pavisade(k: PartKit) {
  const s = k.shape;
  const c = k.cls;
  const r = 0.36 + c.length * 0.004;
  const faces = [hexL(k.livery.strake), hexL(k.livery.boot)];
  const seg = k.detail ? 16 : 10;
  let n = 0;
  for (const side of [1, -1]) {
    for (const t of along(k, 0.06, 0.9, r * 1.86)) {
      if (!clearAt(k, t, r * 0.8)) continue;
      const y = s.top(t) - r * 0.15;
      const m = sideFrame(s, t, Math.min(y, s.top(t) - 0.05), side, 0.06, 0.1);
      const face = new THREE.SphereGeometry(r, seg, 4, 0, Math.PI * 2, 0, 0.55);
      face.rotateX(Math.PI / 2).scale(1, 1, 0.6).translate(0, 0, -r * 0.5);
      k.wood.push(skinnedPaint(colorize(face.applyMatrix4(m), faces[n++ % 2], 0.03)));
      const rim = new THREE.TorusGeometry(r * 0.99, 0.04, 4, seg);
      rim.translate(0, 0, 0.0);
      k.iron.push(metal(rim.applyMatrix4(m), METAL.bronze));
      const boss = new THREE.SphereGeometry(r * 0.24, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
      boss.rotateX(Math.PI / 2).translate(0, 0, r * 0.05);
      k.iron.push(metal(boss.applyMatrix4(m), METAL.bronze));
      if (k.detail) {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          k.smallIron.push(metal(ball(0.028, V(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78, 0.035).applyMatrix4(m), 4, 3), METAL.bronze));
        }
      }
    }
  }
  bronzeRam(k, METAL.bronze, 1);
}

function bronzeRam(k: PartKit, col: THREE.Color, scale: number) {
  const L = k.cls.length;
  const z = stemZ(k);
  const len = (0.9 + L * 0.03) * scale;
  const ram = lathe(
    [
      [0, 0],
      [0.34, 0.04],
      [0.36, 0.2],
      [0.3, 0.42],
      [0.2, 0.7],
      [0.1, 0.92],
      [0, 1],
    ],
    k.detail ? 10 : 7,
  );
  ram.scale(scale, len, scale * 0.8).rotateX(Math.PI / 2).translate(0, 0.12, z - 0.15);
  k.iron.push(metal(ram, col));
  // three fins, the trident's teeth
  for (const dy of [-0.18, 0, 0.18]) {
    const fin = rbox(0.06, 0.05, len * 0.55, 0.02, 1);
    fin.scale(1, 1, 1).translate(0, 0.12 + dy * scale, z + len * 0.25);
    k.iron.push(metal(fin, col));
  }
  const collar = new THREE.SphereGeometry(0.42 * scale, 10, 6);
  collar.scale(0.8, 1.2, 0.35).translate(0, 0.2, z - 0.12);
  k.iron.push(metal(collar, col));
}

/** Legendary: golden scale plates layered down the topsides, spines along the rails, a horned ram. */
function dragonscale(k: PartKit) {
  const s = k.shape;
  const c = k.cls;
  const w = 0.42 + c.length * 0.006;
  const h = w * 0.78;
  const tones = [METAL.gold, METAL.amber, METAL.bronze];
  const ws = k.detail ? 8 : 6;
  const hs = k.detail ? 4 : 3;
  for (const side of [1, -1]) {
    for (const t of along(k, 0.06, 0.92, w * 0.8)) {
      const y1 = s.waleY(t) - waleR(k) * 0.5;
      const rows = Math.max(2, Math.floor((y1 - 0.25) / (h * 0.6)));
      for (let r = 0; r < rows; r++) {
        // every other row sits half a scale along, like a fish's
        const tt = clamp(t + (r % 2 ? (w * 0.4) / c.length : 0), 0.05, 0.93);
        const y = lerp(0.3, y1, rows === 1 ? 0.5 : r / (rows - 1));
        const m = sideFrame(s, tt, y, side, 0.035 + r * 0.014);
        const sc = new THREE.SphereGeometry(1, ws, hs, 0, Math.PI * 2, 0, Math.PI / 2);
        sc.rotateX(Math.PI / 2).scale(w * 0.56, h * 0.62, 0.055).translate(0, -h * 0.24, 0);
        k.iron.push(metal(sc.applyMatrix4(m), tones[(r + Math.floor(t * 97)) % 3], 0.05));
      }
    }
    // a crest of golden spines raked back along each rail
    for (const t of along(k, 0.05, 0.93, 1.05)) {
      if (!clearAt(k, t, 0.12, false)) continue;
      const ht = 0.42 + c.length * 0.008;
      const sp = new THREE.ConeGeometry(0.08, ht, 6);
      sp.translate(0, ht / 2, 0).rotateX(-0.55).rotateZ(-side * 0.3);
      k.iron.push(metal(sp.translate(...s.skinPoint(t, s.top(t) + 0.02, side, -0.07).toArray()), METAL.gold));
    }
  }
  // a gilded horn sweeping forward and up from the cutwater
  const z = stemZ(k);
  const L = c.length;
  const reach = 1.1 + L * 0.03;
  k.iron.push(metal(sweep([V(0, 0.2, z - 0.2), V(0, 0.16, z + reach * 0.45), V(0, 0.32, z + reach * 0.85), V(0, 0.7, z + reach)], (u) => lerp(0.3, 0.025, Math.pow(u, 0.8)), 8, 16), METAL.gold));
  for (const side of [1, -1]) k.iron.push(metal(sweep([V(side * 0.2, 0.3, z - 0.1), V(side * 0.42, 0.26, z + 0.3), V(side * 0.5, 0.5, z + 0.55)], (u) => lerp(0.13, 0.02, u), 6, 10), METAL.gold));
}

/** Mythic: obsidian plate veined with light, a glowing rail, and floating wards of light. */
function aegis(k: PartKit) {
  const s = k.shape;
  const c = k.cls;
  const pw = 0.95 + c.length * 0.01;
  for (const side of [1, -1]) {
    const ts = along(k, 0.07, 0.91, pw + 0.1);
    for (let i = 0; i < ts.length - 1; i++) {
      const t = (ts[i] + ts[i + 1]) / 2;
      const y0 = 0.24;
      const y1 = s.waleY(t) - waleR(k) * 0.4;
      const m = sideFrame(s, t, (y0 + y1) / 2, side, 0.05);
      k.iron.push(metal(rbox(pw, y1 - y0, 0.09, 0.035, 1).applyMatrix4(m), METAL.obsidian, 0.08));
      // a chevron of light across each plate
      if (k.detail) {
        for (const sx of [-1, 1]) {
          const a = V(sx * pw * 0.32, -(y1 - y0) * 0.22, 0.05).applyMatrix4(m);
          const b = V(0, (y1 - y0) * 0.18, 0.05).applyMatrix4(m);
          k.glow.push(glow(spar(a, b, 0.016, 0.016, 3), GLOW.aether));
        }
      }
      // the seam to the next plate glows
      const seam = sideFrame(s, ts[i + 1], (y0 + y1) / 2, side, 0.035);
      k.glow.push(glow(rbox(0.05, y1 - y0, 0.05, 0.02, 1).applyMatrix4(seam), GLOW.aether));
    }
    for (const yOf of [() => 0.2, (t: number) => s.waleY(t) - waleR(k) * 0.35]) k.glow.push(glow(tube(sideRun(k, side, yOf, 0.04, 0.07, 0.91, 22), 0.028, false, 4, 2), GLOW.aether));
    // light runs along the rail cap
    k.glow.push(glow(tube(sideRun(k, side, (t) => s.top(t) + 0.03, -0.09, 0.02, 0.97, 34), 0.03, false, 4, 2), GLOW.violet));
    // floating wards: hexagons of light standing off the hull, turning slowly
    const n = c.length > 25 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const t = lerp(0.28, 0.72, i / (n - 1));
      const y = s.top(t) * 0.62;
      const nrm = s.skinNormal(t, y, side);
      nrm.y = 0;
      nrm.normalize();
      const at = s.skinPoint(t, y, side, 1.25 + c.beam * 0.05);
      const R = 0.5 + c.length * 0.012;
      const parts = [
        glow(new THREE.TorusGeometry(R, 0.045, 3, 6), GLOW.aether),
        glow(new THREE.TorusGeometry(R * 0.82, 0.016, 3, 6).rotateZ(Math.PI / 6), GLOW.aether),
        glow(new THREE.TorusGeometry(R * 0.52, 0.026, 3, 3).rotateZ(Math.PI / 2), GLOW.violet),
        glow(new THREE.TorusGeometry(R * 0.26, 0.02, 3, 16), GLOW.star),
        glow(new THREE.OctahedronGeometry(R * 0.11), GLOW.star),
      ];
      // little runes at the hexagon's corners
      for (let j = 0; j < 6; j++) {
        const a = (j / 6) * Math.PI * 2 + Math.PI / 6;
        parts.push(glow(new THREE.OctahedronGeometry(R * 0.07).translate(Math.cos(a) * R * 0.66, Math.sin(a) * R * 0.66, 0), GLOW.violet));
      }
      const geo = merged(parts);
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0, 1, 0).cross(nrm).normalize(), Y, nrm));
      k.spinners.push({ geo, mat: 'glow', pos: at, quat: q, axis: Z, spin: (0.35 + i * 0.1) * side, bob: 0.13, rate: 1.1 + i * 0.23, phase: i * 1.7 + (side > 0 ? 0 : 2.4) });
    }
  }
  // the keel line burns faintly under the forefoot
  const z = stemZ(k);
  k.glow.push(glow(sweep([V(0, -0.05, z - 0.25), V(0, lerp(s.bottom(1), s.top(1), 0.45), z + 0.04), V(0, s.top(1) - 0.6, z + 0.12)], () => 0.05, 4, 8), GLOW.aether));
}

/** Woodwork the vault skins paint over (see AQ_SKIN 2). */
function skinnedPaint(g: THREE.BufferGeometry) {
  const col = g.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < col.count; i++) col.setZ(i, col.getZ(i) + 4);
  return g;
}

/** Merges small coloured pieces into one geometry (for the moving parts). */
export function merged(parts: THREE.BufferGeometry[]) {
  for (const g of parts) {
    for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'color') g.deleteAttribute(n);
    if (!g.index) g.setIndex(Array.from({ length: g.getAttribute('position').count }, (_, i) => i));
  }
  const out = mergeAll(parts);
  return out;
}

function mergeAll(parts: THREE.BufferGeometry[]) {
  let nv = 0;
  let ni = 0;
  for (const g of parts) {
    nv += g.getAttribute('position').count;
    ni += g.index!.count;
  }
  const pos = new Float32Array(nv * 3);
  const nrm = new Float32Array(nv * 3);
  const col = new Float32Array(nv * 3);
  const idx = new Uint32Array(ni);
  let v = 0;
  let i = 0;
  for (const g of parts) {
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    const c = g.getAttribute('color') as THREE.BufferAttribute;
    for (let j = 0; j < p.count; j++) {
      pos.set([p.getX(j), p.getY(j), p.getZ(j)], (v + j) * 3);
      nrm.set([n.getX(j), n.getY(j), n.getZ(j)], (v + j) * 3);
      col.set([c.getX(j), c.getY(j), c.getZ(j)], (v + j) * 3);
    }
    const gi = g.index!;
    for (let j = 0; j < gi.count; j++) idx[i + j] = gi.getX(j) + v;
    v += p.count;
    i += gi.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

// ================================================================== sails

/** Sail parts are mostly in the cloth (see GLSL_PART_SAIL); the higher ones dress the masts too. */
export function buildSailPart(k: PartKit, p: Part) {
  if (p.tier === 3) sunMedallions(k);
  if (p.tier === 4) crystalCrowns(k);
}

/** Legendary: a gilded sun on the fore face of every mast, rays and all. */
function sunMedallions(k: PartKit) {
  for (const m of k.masts) {
    const y = m.y0 + m.H * 0.5;
    const r = 0.26 + m.H * 0.006;
    for (const dir of [1, -1]) {
      const zf = m.z + dir * (m.r0 * 0.82 + 0.05);
      const disc = new THREE.CylinderGeometry(r, r, 0.06, 18);
      disc.rotateX(Math.PI / 2).translate(0, y, zf);
      k.iron.push(metal(disc, METAL.gold));
      const face = new THREE.SphereGeometry(r * 0.62, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2);
      face.rotateX((dir * Math.PI) / 2).scale(1, 1, 0.45).translate(0, y, zf + dir * 0.03);
      k.iron.push(metal(face, METAL.paleGold));
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const len = i % 2 ? r * 0.55 : r * 0.9;
        const ray = new THREE.ConeGeometry(0.05, len, 4);
        ray.translate(0, r + len / 2 - 0.02, 0).rotateZ(a).translate(0, y, zf);
        k.iron.push(metal(ray, i % 2 ? METAL.amber : METAL.gold));
      }
    }
    // and a gilded ball on the truck
    k.iron.push(metal(ball(m.r0 * 0.7, V(0, m.y0 + m.H + 0.12 + m.r0 * 0.5, m.z), 10, 7), METAL.gold));
  }
}

/** Mythic: a crown of crystal shards turning above every masthead, in a ring of light. */
function crystalCrowns(k: PartKit) {
  k.masts.forEach((m, i) => {
    const R = 0.62 + m.r0 * 1.6;
    const parts: THREE.BufferGeometry[] = [];
    for (let j = 0; j < 3; j++) {
      const a = (j / 3) * Math.PI * 2;
      const sh = new THREE.OctahedronGeometry(0.16, 0);
      sh.scale(0.75, 2.4, 0.75).rotateZ(0.25).rotateY(a).translate(Math.cos(a) * R, 0, Math.sin(a) * R);
      parts.push(glow(sh, j === 1 ? GLOW.violet : GLOW.aether));
      const sm = new THREE.OctahedronGeometry(0.07, 0);
      sm.translate(Math.cos(a + 1.05) * R, 0.1, Math.sin(a + 1.05) * R);
      parts.push(glow(sm, GLOW.star));
    }
    parts.push(glow(new THREE.TorusGeometry(R, 0.018, 3, 36).rotateX(Math.PI / 2), GLOW.aether));
    parts.push(glow(new THREE.OctahedronGeometry(0.2, 0).scale(1, 1.6, 1).translate(0, 0.25, 0), GLOW.star));
    k.spinners.push({ geo: merged(parts), mat: 'glow', pos: V(0, m.y0 + m.H + 0.95, m.z), quat: new THREE.Quaternion(), axis: Y, spin: 0.55 + i * 0.12, bob: 0.14, rate: 0.9 + i * 0.2, phase: i * 2.1 });
  });
}

// ================================================================== guns

/** A barrel in its own frame (+y the muzzle), coloured, and how far along it the bore opens. */
export interface Barrel {
  parts: { g: THREE.BufferGeometry; bucket: 'iron' | 'glow' }[];
  tip: number;
}

const ring = (r: number, w: number, y: number, col: THREE.Color, seg = 12) => metal(new THREE.TorusGeometry(r, w, 4, seg).rotateX(Math.PI / 2).translate(0, y, 0), col);

export function gunBarrel(p: Part, detail: boolean): Barrel {
  const seg = detail ? 12 : 8;
  const out: Barrel['parts'] = [];
  const iron = (g: THREE.BufferGeometry) => out.push({ g, bucket: 'iron' });
  const lit = (g: THREE.BufferGeometry) => out.push({ g, bucket: 'glow' });
  switch (p.id.split(':')[1]) {
    case 'bronze': {
      iron(metal(lathe([[0, -0.9], [0.08, -0.89], [0.11, -0.82], [0.065, -0.76], [0.2, -0.72], [0.225, -0.6], [0.215, -0.42], [0.2, -0.3], [0.188, 0.0], [0.175, 0.3], [0.16, 0.62], [0.2, 0.7], [0.21, 0.8], [0.18, 0.84], [0.1, 0.84], [0.1, 0.7], [0, 0.7]], seg), METAL.bronze));
      for (const y of [-0.5, -0.12, 0.28, 0.58]) iron(ring(0.2 - y * 0.03, 0.03, y, METAL.bronze.clone().multiplyScalar(0.85), seg));
      return { parts: out, tip: 0.84 };
    }
    case 'culverin': {
      iron(metal(lathe([[0, -0.92], [0.07, -0.91], [0.09, -0.85], [0.06, -0.8], [0.17, -0.76], [0.18, -0.55], [0.16, -0.3], [0.145, 0.3], [0.13, 0.9], [0.16, 0.96], [0.165, 1.04], [0.09, 1.04], [0.09, 0.96], [0, 0.96]], seg), METAL.blued));
      for (const [y, r] of [[-0.7, 0.18], [-0.32, 0.165], [0.2, 0.15], [0.62, 0.14], [0.98, 0.17]]) iron(ring(r, 0.028, y, METAL.brass, seg));
      // the dolphins: two lifting handles on top of the barrel (local -x is up once mounted)
      for (const dz of [-0.07, 0.07]) iron(metal(new THREE.TorusGeometry(0.06, 0.018, 4, 8, Math.PI).rotateZ(Math.PI / 2).translate(-0.15, -0.12, dz), METAL.brass));
      return { parts: out, tip: 1.04 };
    }
    case 'bombard': {
      iron(metal(lathe([[0, -0.82], [0.1, -0.81], [0.14, -0.74], [0.09, -0.68], [0.27, -0.64], [0.29, -0.5], [0.27, -0.2], [0.24, 0.2], [0.22, 0.4], [0.26, 0.5], [0.33, 0.62], [0.34, 0.68], [0.17, 0.68], [0.17, 0.58], [0, 0.58]], seg), METAL.iron));
      for (const [y, r] of [[-0.56, 0.29], [-0.25, 0.275], [0.1, 0.25], [0.44, 0.24]]) iron(ring(r, 0.04, y, METAL.gold, seg));
      // a crown of teeth round the flared mouth
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        iron(metal(new THREE.ConeGeometry(0.05, 0.14, 4).translate(Math.cos(a) * 0.29, 0.74, Math.sin(a) * 0.29), METAL.gold));
      }
      return { parts: out, tip: 0.7 };
    }
    case 'dragonmaw': {
      iron(metal(lathe([[0, -0.86], [0.08, -0.85], [0.12, -0.78], [0.07, -0.72], [0.2, -0.68], [0.22, -0.55], [0.2, -0.2], [0.18, 0.3], [0.17, 0.48], [0, 0.48]], seg), METAL.gold));
      for (const y of [-0.45, -0.1, 0.22]) iron(ring(0.205 - y * 0.02, 0.035, y, METAL.amber, seg));
      // the head: upper jaw and brow above the bore (local -x is up), lower jaw below
      iron(metal(new THREE.SphereGeometry(0.2, 10, 7).scale(0.85, 1.75, 1.05).translate(-0.1, 0.62, 0), METAL.gold));
      iron(metal(new THREE.SphereGeometry(0.15, 8, 6).scale(0.6, 1.6, 0.9).translate(0.15, 0.6, 0), METAL.amber));
      iron(metal(new THREE.CylinderGeometry(0.1, 0.11, 0.06, 10, 1, true).translate(0, 0.86, 0), METAL.iron));
      for (const dz of [-1, 1]) {
        // horns sweeping back along the barrel
        iron(metal(sweep([V(-0.24, 0.62, dz * 0.1), V(-0.34, 0.45, dz * 0.16), V(-0.36, 0.25, dz * 0.12), V(-0.3, 0.12, dz * 0.08)], (u) => lerp(0.055, 0.01, u), 5, 8), METAL.paleGold));
        // teeth
        for (const y of [0.72, 0.84]) iron(metal(new THREE.ConeGeometry(0.022, 0.07, 4).rotateZ(Math.PI / 2).translate(-0.02, y, dz * 0.1), METAL.pearl));
        lit(glow(new THREE.SphereGeometry(0.035, 6, 4).translate(-0.2, 0.7, dz * 0.12), GLOW.ember));
      }
      return { parts: out, tip: 0.94 };
    }
    case 'starfire': {
      iron(metal(lathe([[0, -0.8], [0.15, -0.78], [0.19, -0.66], [0.17, -0.55], [0.1, -0.5], [0.08, 0.9], [0.11, 0.94], [0, 0.94]], seg), METAL.obsidian));
      // collars between the rings of light, as if the rings were held off the core by nothing
      for (const y of [-0.22, 0.14, 0.5]) iron(ring(0.1, 0.03, y, METAL.silver, seg));
      for (const [y, r] of [[-0.38, 0.2], [-0.04, 0.18], [0.32, 0.16], [0.68, 0.14]]) lit(glow(new THREE.TorusGeometry(r, 0.024, 3, 16).rotateX(Math.PI / 2).translate(0, y, 0), y > 0.5 ? GLOW.violet : GLOW.aether));
      lit(glow(new THREE.OctahedronGeometry(0.12, 0).scale(1, 1.4, 1).translate(0, -0.95, 0), GLOW.violet));
      lit(glow(new THREE.CylinderGeometry(0.075, 0.075, 0.04, 10).translate(0, 0.95, 0), GLOW.star));
      return { parts: out, tip: 0.96 };
    }
  }
  return { parts: out, tip: 0.71 };
}
