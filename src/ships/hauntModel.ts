import * as THREE from 'three';
import { lerp } from '../core/noise';
import { ball, colorize, hexL, lathe, rbox, spar, sweep } from './geo';
import type { BowHead } from './figureheads';
import type { HullShape } from './shipModel';
import type { ShipClass } from './shipTypes';

// The Hollow Jack's dressing (a haunted ship's: ShipClass.haunt): carved
// pumpkins grinning along her rails and heaped on her decks, skulls on her
// taffrail, and in place of a figurehead her dead captain, a skeleton in a
// rotting coat and tricorn with a cutlass raised and a ghost lantern held out
// ahead. Everything goes into the ship's merged buckets (wood, gilt, metal and
// glow), so it costs triangles but no draw calls or new materials.

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

const PUMPKIN = hexL('#e0701c');
const STEM = hexL('#4a5226');
const BONE = hexL('#d9cfb4');
const SOCKET = hexL('#0a0709');
const SHROUD = hexL('#231a2a');
const HAT = hexL('#120e14');
const STEEL = hexL('#b9bfca');
const IRON = hexL('#23262b');
/** Lamplight paint (linear HDR, the bloom picks it up). */
export const PUMPKIN_FIRE = new THREE.Color(3.4, 1.25, 0.18);
export const GHOST_FIRE = new THREE.Color(0.35, 2.6, 1.35);

export interface HauntKit {
  shape: HullShape;
  cls: ShipClass;
  head: BowHead;
  trim: THREE.Color;
  wood: THREE.BufferGeometry[];
  smallWood: THREE.BufferGeometry[];
  trimParts: THREE.BufferGeometry[];
  iron: THREE.BufferGeometry[];
  glow: THREE.BufferGeometry[];
}

/** Where the ghost-fire is (hull-root space), for the wisps off her while she's a phantom. */
export function buildHaunt(k: HauntKit): THREE.Vector3[] {
  const s = k.shape;
  const c = k.cls;
  const points: THREE.Vector3[] = [];
  // along the rails, clear of the masts' channels and the castles' steps
  for (const t of [0.1, 0.36, 0.42, 0.61, 0.89]) {
    if (c.masts.some((m) => Math.abs(m.t - t) < 0.055)) continue;
    const railR = 0.09 + c.length * 0.0034;
    for (const side of [1, -1]) {
      const r = 0.25 + 0.03 * Math.sin(t * 40 + side);
      const at = V(side * (s.halfWidthAtY(t, s.top(t)) - 0.065), s.top(t) + 0.03 + railR + r * 0.72, s.z(t));
      points.push(pumpkin(k, at, r, V(side, 0, -0.45).normalize(), t * 13 + side));
    }
  }
  // heaps of them on the quarterdeck, either side of the wheel, and on the forecastle
  const heaps = [V(c.beam * 0.17, 0, 0.065), V(-c.beam * 0.17, 0, 0.065), V(c.beam * 0.09, 0, 0.875)];
  heaps.forEach((hp, hi) => {
    const t = hp.z;
    const y = s.deckY(t);
    const zz = s.z(t);
    const sx = Math.sign(hp.x);
    const face = V(sx * 0.4, 0, hi < 2 ? -1 : 1).normalize();
    points.push(pumpkin(k, V(hp.x, y + 0.36, zz), 0.44, face, 3 + hi));
    pumpkin(k, V(hp.x + sx * 0.55, y + 0.25, zz + 0.25), 0.31, face.clone().add(V(sx * 0.5, 0, 0)).normalize(), 5 + hi);
    pumpkin(k, V(hp.x - sx * 0.25, y + 0.19, zz + face.z * 0.55), 0.23, face, 7 + hi);
  });
  // grinning skulls along her taffrail, between the lanterns
  const ty = s.top(0.01);
  const hb = s.halfBeam(0.01);
  for (const lx of [-0.3, 0.3, -0.85, 0.85]) {
    const m = new THREE.Matrix4().compose(V(lx * hb, ty + 0.2, s.z(0.012) + 0.02), new THREE.Quaternion().setFromAxisAngle(UP, Math.PI), V(0.15, 0.15, 0.15));
    skull(k, m, k.wood);
  }
  points.push(...deadCaptain(k));
  return points;
}

/**
 * A carved pumpkin, ribbed and squat with a crooked stem, its face cut out and
 * lit from within, turned toward `face` (horizontal). Returns its middle.
 */
function pumpkin(k: HauntKit, at: THREE.Vector3, r: number, face: THREE.Vector3, seed: number): THREE.Vector3 {
  const yaw = Math.atan2(face.x, face.z);
  const xf = new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromAxisAngle(UP, yaw), V(1, 1, 1));
  const g = new THREE.SphereGeometry(1, 16, 8);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const rib = 0.9 + 0.1 * Math.abs(Math.cos(Math.atan2(z, -x) * 4));
    // a dimple at the crown where the stem grows
    p.setXYZ(i, x * rib * r, (y * 0.8 - (y > 0.999 ? 0.16 : 0)) * r, z * rib * r);
  }
  g.computeVertexNormals();
  const f = (seed * 3.7) % 1;
  k.wood.push(colorize(g.applyMatrix4(xf), PUMPKIN.clone().multiplyScalar(0.92 + 0.12 * Math.abs(f)), 0.04));
  // the stem, curling off the top
  const top = V(0, r * 0.62, 0).applyMatrix4(xf);
  const lean = V(0.6, 1, -0.3).normalize().applyAxisAngle(UP, yaw);
  k.smallWood.push(colorize(spar(top, top.clone().addScaledVector(lean, r * 0.42), r * 0.11, r * 0.06, 5), STEM, 0.05));
  // the face: two eyes, a nose and a jagged grin, lit
  const on = (fx: number, fy: number) => {
    const dz = Math.sqrt(Math.max(1 - fx * fx - fy * fy, 0.04));
    const rib = 0.9 + 0.1 * Math.abs(Math.cos(Math.atan2(dz, -fx) * 4));
    return V(fx * rib, fy * 0.8, dz * rib).multiplyScalar(r * 1.03).applyMatrix4(xf);
  };
  const tris: number[] = [];
  const n = V(0, 0, 1).applyAxisAngle(UP, yaw);
  const poly = (pts: THREE.Vector3[]) => {
    const flip = pts[1].clone().sub(pts[0]).cross(pts[2].clone().sub(pts[0])).dot(n) < 0;
    for (let q = 1; q < pts.length - 1; q++) {
      const [a, b, cc] = flip ? [pts[0], pts[q + 1], pts[q]] : [pts[0], pts[q], pts[q + 1]];
      tris.push(a.x, a.y, a.z, b.x, b.y, b.z, cc.x, cc.y, cc.z);
    }
  };
  for (const sx of [-1, 1]) poly([on(sx * 0.42, 0.1), on(sx * 0.13, 0.1), on(sx * 0.28, 0.42)]);
  poly([on(-0.08, -0.04), on(0.08, -0.04), on(0, 0.11)]);
  const K = 8;
  for (let q = 0; q < K; q++) {
    const xa = lerp(-0.56, 0.56, q / K);
    const xb = lerp(-0.56, 0.56, (q + 1) / K);
    const ta = -0.2 + 0.3 * xa * xa - (q % 2 === 1 ? 0.09 : 0);
    const tb = -0.2 + 0.3 * xb * xb - (q % 2 === 0 && q + 1 < K ? 0.09 : 0);
    poly([on(xa, -0.44 + 0.38 * xa * xa), on(xb, -0.44 + 0.38 * xb * xb), on(xb, tb), on(xa, ta)]);
  }
  const lit = new THREE.BufferGeometry();
  lit.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
  const nn: number[] = [];
  for (let i = 0; i < tris.length / 3; i++) nn.push(n.x, n.y, n.z);
  lit.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3));
  k.glow.push(colorize(lit, PUMPKIN_FIRE, 0));
  return at;
}

/** A skull in a frame (+z its face, +y up, a unit its cranium's radius): bone, dark sockets with ghost-fire in them, a row of teeth. */
function skull(k: HauntKit, xf: THREE.Matrix4, into: THREE.BufferGeometry[]) {
  const at = (g: THREE.BufferGeometry, m: THREE.Matrix4 | null, col: THREE.Color, j = 0.03) => {
    if (m) g.applyMatrix4(m);
    into.push(colorize(g.applyMatrix4(xf), col, j));
  };
  const sc = (x: number, y: number, z: number, p: THREE.Vector3) => new THREE.Matrix4().compose(p, new THREE.Quaternion(), V(x, y, z));
  at(new THREE.SphereGeometry(1, 12, 8), sc(0.92, 0.95, 1.05, V(0, 0.12, 0)), BONE);
  at(rbox(1.05, 0.6, 0.85, 0.24, 2), sc(1, 1, 1, V(0, -0.5, 0.32)), BONE);
  for (const sx of [-1, 1]) at(new THREE.SphereGeometry(0.27, 8, 6), sc(1, 0.85, 0.6, V(sx * 0.36, -0.02, 0.8)), SOCKET, 0);
  at(new THREE.SphereGeometry(0.13, 6, 4), sc(0.7, 1, 0.6, V(0, -0.36, 0.9)), SOCKET, 0);
  at(new THREE.BoxGeometry(0.72, 0.17, 0.3), sc(1, 1, 1, V(0, -0.66, 0.66)), SOCKET, 0);
  for (let ti = 0; ti < 6; ti++) at(new THREE.BoxGeometry(0.085, 0.15, 0.08), sc(1, 1, 1, V(-0.3 + ti * 0.12, -0.66, 0.79)), BONE);
  const s = new THREE.Vector3().setFromMatrixScale(xf).x;
  for (const sx of [-1, 1]) k.glow.push(colorize(ball(s * 0.11, V(sx * 0.35, -0.02, 0.86).applyMatrix4(xf), 6, 4), GHOST_FIRE, 0));
}

/**
 * The dead captain on the knee of her head (the figurehead's frame: y up from
 * the hips, z out ahead, leaning with the bowsprit). Returns his lantern and
 * his skull, for the wisps.
 */
function deadCaptain(k: HauntKit): THREE.Vector3[] {
  const h = k.head;
  const f = h.place;
  const S = h.scale;
  const P = (x: number, y: number, z: number) => V(x, y, z).applyMatrix4(f);
  const put = (g: THREE.BufferGeometry, local: THREE.Matrix4 | null, col: THREE.Color, into = k.wood, j = 0.02) => {
    if (local) g.applyMatrix4(local);
    into.push(colorize(g.applyMatrix4(f), col, j));
  };
  const flat = (y: number, z = 0.72) => new THREE.Matrix4().compose(V(0, y, 0), new THREE.Quaternion(), V(1, 1, z));
  // his long coat, turned and flattened fore and aft
  put(lathe([[0.001, -0.66], [0.21, -0.66], [0.28, -0.45], [0.31, -0.15], [0.26, 0.2], [0.21, 0.5], [0.25, 0.68], [0.22, 0.79], [0.08, 0.86], [0.001, 0.88]], 14), flat(0), SHROUD);
  // gilt hem of the coat and his sword belt, with its buckle
  put(new THREE.TorusGeometry(0.235, 0.022, 4, 16).rotateX(Math.PI / 2), flat(-0.6), k.trim, k.trimParts);
  put(new THREE.TorusGeometry(0.29, 0.03, 4, 16).rotateX(Math.PI / 2), flat(0.08), k.trim, k.trimParts);
  put(rbox(0.1, 0.09, 0.03, 0.01, 1), flat(0.08, 1).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.215)), k.trim, k.trimParts);
  // epaulettes
  for (const sx of [-1, 1]) put(new THREE.SphereGeometry(0.08, 8, 5), new THREE.Matrix4().compose(V(sx * 0.23, 0.74, 0), new THREE.Quaternion(), V(1, 0.45, 1)), k.trim, k.trimParts);
  // his ribs bare where the coat has rotted open, a coal of ghost-fire behind them
  k.glow.push(colorize(ball(0.055 * S, P(0.04, 0.47, 0.11), 7, 5), GHOST_FIRE, 0));
  for (let q = 0; q < 4; q++) {
    const y = 0.31 + 0.088 * q;
    const br = 0.215 - 0.012 * Math.abs(q - 1.5);
    put(new THREE.TorusGeometry(br, 0.017, 4, 10, 0.76 * Math.PI).rotateX(Math.PI / 2).rotateY(-0.12 * Math.PI), flat(y, 0.76), BONE, k.wood, 0.03);
  }
  k.wood.push(colorize(spar(P(0, 0.27, 0.16), P(0, 0.62, 0.16), 0.02 * S, 0.02 * S, 4), BONE, 0.03));
  // the skull, levelled to look ahead
  const hx = f.clone().multiply(new THREE.Matrix4().compose(V(0, 1, 0.04), new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -h.lean * 0.85), V(0.165, 0.165, 0.165)));
  const H = (x: number, y: number, z: number) => V(x, y, z).applyMatrix4(hx);
  k.wood.push(colorize(spar(P(0, 0.8, 0), H(0, -0.7, 0), 0.05 * S, 0.045 * S, 5), BONE, 0.03));
  skull(k, hx, k.wood);
  // his tricorn: a low crown and three cocked flaps piped in gilt
  const crown = lathe([[0.001, 0], [0.98, 0], [0.92, 0.32], [0.78, 0.56], [0.4, 0.66], [0.001, 0.68]], 12);
  k.wood.push(colorize(crown.translate(0, 0.55, -0.02).applyMatrix4(hx), HAT, 0.02));
  for (const a of [Math.PI, Math.PI / 3, -Math.PI / 3]) {
    const q = new THREE.Quaternion().setFromAxisAngle(UP, a).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), 0.42));
    const fx = hx.clone().multiply(new THREE.Matrix4().compose(V(0, 0.66, 0.88).applyAxisAngle(UP, a), q, V(1, 1, 1)));
    k.wood.push(colorize(rbox(1.75, 0.62, 0.09, 0.04, 1).applyMatrix4(fx), HAT, 0.02));
    k.trimParts.push(colorize(spar(V(-0.86, 0.3, 0.05).applyMatrix4(fx), V(0.86, 0.3, 0.05).applyMatrix4(fx), 0.012 * S, 0.012 * S, 4), k.trim, 0.02));
  }
  // a ghostly plume
  k.glow.push(colorize(sweep([H(0.55, 0.95, 0.1), H(0.9, 1.45, -0.35), H(0.8, 1.7, -1.0), H(0.5, 1.6, -1.5)], (u) => lerp(0.035, 0.01, u) * S, 5, 10), GHOST_FIRE, 0));
  // his sword arm, a cutlass raised high
  const shR = P(-0.25, 0.7, 0);
  const elR = P(-0.33, 0.5, 0.18);
  const haR = P(-0.34, 0.66, 0.4);
  k.wood.push(colorize(spar(shR, elR, 0.08 * S, 0.065 * S, 7), SHROUD, 0.02));
  k.wood.push(colorize(spar(elR, haR, 0.028 * S, 0.024 * S, 5), BONE, 0.03));
  k.wood.push(colorize(ball(0.045 * S, haR, 6, 4), BONE, 0.03));
  const blade = V(-0.05, 1, 0.45).transformDirection(f);
  const bq = new THREE.Quaternion().setFromUnitVectors(UP, blade);
  const bl = 0.7 * S;
  k.iron.push(colorize(rbox(0.075 * S, bl, 0.014 * S, 0.005, 1).applyMatrix4(new THREE.Matrix4().compose(haR.clone().addScaledVector(blade, bl * 0.5 + 0.06 * S), bq, V(1, 1, 1))), STEEL, 0.02));
  k.trimParts.push(
    colorize(new THREE.TorusGeometry(0.06 * S, 0.012 * S, 4, 10, Math.PI).rotateX(Math.PI / 2).applyMatrix4(new THREE.Matrix4().compose(haR.clone().addScaledVector(blade, 0.05 * S), bq, V(1, 1, 1))), k.trim, 0.02),
  );
  // his lantern arm, held out ahead, the lantern swinging below his hand
  const shL = P(0.25, 0.7, 0);
  const elL = P(0.31, 0.6, 0.27);
  const haL = P(0.3, 0.78, 0.55);
  k.wood.push(colorize(spar(shL, elL, 0.08 * S, 0.065 * S, 7), SHROUD, 0.02));
  k.wood.push(colorize(spar(elL, haL, 0.028 * S, 0.024 * S, 5), BONE, 0.03));
  k.wood.push(colorize(ball(0.045 * S, haL, 6, 4), BONE, 0.03));
  const lantern = haL.clone().add(V(0, -0.42, 0));
  k.iron.push(colorize(spar(haL, lantern.clone().add(V(0, 0.2, 0)), 0.012, 0.012, 4), IRON, 0.03));
  k.iron.push(colorize(new THREE.ConeGeometry(0.15, 0.13, 8).translate(lantern.x, lantern.y + 0.265, lantern.z), IRON, 0.03));
  k.iron.push(colorize(spar(lantern.clone().add(V(0, -0.2, 0)), lantern.clone().add(V(0, -0.13, 0)), 0.06, 0.12, 8), IRON, 0.03));
  k.glow.push(colorize(new THREE.SphereGeometry(0.12, 8, 6).scale(1, 1.3, 1).translate(lantern.x, lantern.y, lantern.z), GHOST_FIRE, 0));
  return [lantern, H(0, 0, 0)];
}
