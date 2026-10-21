import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../render/environment';
import { damp } from '../core/noise';
import { mulberry } from './loot';
import type { World } from './world';
import type { Ship } from '../ships/ship';

// What the open sea carries: messages in bottles bobbing along with a glint of
// sun on the glass, and mats of flotsam far from any shore: a raft of
// sun-bleached driftwood, or a golden tangle of kelp with its floats. Crabs
// ride them (scuttling sideways about the logs, claws up at a passing ship,
// plopping off the edge when a hull comes too close), a gull or two loafs on
// top, and now and then a crate has fetched up in the weed. All of it drifts
// downwind with the barrels and chests (see loot.ts), so a crate keeps to its
// mat. Everything is instanced; nothing is built after the warm-up.

const TAU = Math.PI * 2;
const BOTTLE_MAX = 3;
const MAT_MAX = 4;
const CRAB_MAX = 18;
/** Drift with the wind, as fast as the floating salvage. */
const DRIFT = 0.25;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ sculpt

type Paint = (x: number, y: number, z: number) => [number, number, number];

const hex = (h: number): [number, number, number] => {
  const c = new THREE.Color(h);
  return [c.r, c.g, c.b];
};

/** Non-indexed, no uv, vertex colours from a flat colour or a function of the vertex. */
function paint(geo: THREE.BufferGeometry, c: number | number[] | Paint): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const p = g.getAttribute('position');
  const a = new Float32Array(p.count * 3);
  const flat = typeof c === 'number' ? hex(c) : Array.isArray(c) ? c : null;
  for (let i = 0; i < p.count; i++) a.set(flat ?? (c as Paint)(p.getX(i), p.getY(i), p.getZ(i)), i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** A round bar from a to b. */
function rod(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1 = r0, seg = 6) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r1, r0, d.length(), seg, 1);
  g.translate(0, d.length() / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}

/** A frond lying on the water: a tapering ribbon along a wavy path, facing up. */
function ribbon(rnd: () => number, x: number, z: number, yaw: number, len: number, width: number, col: (k: number) => [number, number, number]) {
  const N = 8;
  const pos: number[] = [];
  const cols: number[] = [];
  let a = yaw;
  let px = x;
  let pz = z;
  const pts: [number, number, number, number][] = [];
  for (let i = 0; i <= N; i++) {
    pts.push([px, pz, a, 0.02 + (rnd() - 0.35) * 0.05]);
    a += (rnd() - 0.5) * 0.7;
    px += Math.cos(a) * (len / N);
    pz += Math.sin(a) * (len / N);
  }
  for (let i = 0; i < N; i++) {
    const [x0, z0, a0, y0] = pts[i];
    const [x1, z1, a1, y1] = pts[i + 1];
    const w0 = width * Math.sin(Math.PI * (0.15 + 0.85 * (i / N))) * 0.5 + 0.02;
    const w1 = width * Math.sin(Math.PI * (0.15 + 0.85 * ((i + 1) / N))) * 0.5 + 0.02;
    // left/right of the path
    const l0 = [x0 - Math.sin(a0) * w0, y0, z0 + Math.cos(a0) * w0];
    const r0 = [x0 + Math.sin(a0) * w0, y0, z0 - Math.cos(a0) * w0];
    const l1 = [x1 - Math.sin(a1) * w1, y1, z1 + Math.cos(a1) * w1];
    const r1 = [x1 + Math.sin(a1) * w1, y1, z1 - Math.cos(a1) * w1];
    // wound so the face looks up
    pos.push(...l0, ...l1, ...r0, ...r0, ...l1, ...r1);
    const c0 = col(i / N);
    const c1 = col((i + 1) / N);
    cols.push(...c0, ...c1, ...c0, ...c0, ...c1, ...c1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  // make sure it faces the sky
  const n = g.getAttribute('normal');
  let up = 0;
  for (let i = 0; i < n.count; i++) up += n.getY(i);
  if (up < 0) {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i += 3) {
      for (const attr of [p, g.getAttribute('color'), n]) {
        const ax = attr.getX(i + 1), ay = attr.getY(i + 1), az = attr.getZ(i + 1);
        attr.setXYZ(i + 1, attr.getX(i + 2), attr.getY(i + 2), attr.getZ(i + 2));
        attr.setXYZ(i + 2, ax, ay, az);
      }
    }
    g.computeVertexNormals();
  }
  return g;
}

const KELP = [0x5b4a1d, 0x6b5622, 0x4a3d18, 0x7a6428, 0x544a1e];

function kelpColor(rnd: () => number) {
  const base = hex(KELP[Math.floor(rnd() * KELP.length)]);
  const tip = hex(0x957a33);
  return (k: number): [number, number, number] => {
    const t = Math.max(0, k - 0.55) * 1.8;
    return [base[0] + (tip[0] - base[0]) * t, base[1] + (tip[1] - base[1]) * t, base[2] + (tip[2] - base[2]) * t];
  };
}

interface Log {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  y: number;
}

interface MatShape {
  geo: THREE.BufferGeometry;
  radius: number;
  /** Where crabs walk: log tops (driftwood) or the weed's surface (kelp, a single disc). */
  logs: Log[];
  /** Where a gull stands. */
  perch: THREE.Vector3[];
  /** Kelp: a crate fits in the middle. */
  kelp: boolean;
}

function driftwood(seed: number): MatShape {
  const rnd = mulberry(seed);
  const parts: THREE.BufferGeometry[] = [];
  const logs: Log[] = [];
  const perch: THREE.Vector3[] = [];
  const n = 3 + Math.floor(rnd() * 3);
  let radius = 0;
  let biggest = 0;
  const wet = hex(0x4d4a36);
  const end = hex(0x6a543c);
  const lerp3 = (a: number[], b: number[], k: number): [number, number, number] => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  for (let i = 0; i < n; i++) {
    const L = 3.4 + rnd() * 3.6;
    const r = 0.17 + rnd() * 0.17;
    const yaw = rnd() * Math.PI;
    const cx = (rnd() - 0.5) * 2.2;
    const cz = (rnd() - 0.5) * 2.2;
    // crossing logs ride up on the ones beneath
    const y = i === 0 ? 0 : 0.06 + rnd() * 0.14;
    const bend = (rnd() - 0.5) * 0.5;
    const ph = rnd() * 10;
    // modelled along y; once laid down (rotateZ) "up" is +x
    const g = new THREE.CylinderGeometry(r * (0.55 + rnd() * 0.15), r, L, 13, 7);
    const p = g.getAttribute('position');
    const pale = hex([0xcdbd9f, 0xbca98a, 0xc4b398, 0xae9c80][Math.floor(rnd() * 4)]);
    const cols = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++) {
      const ly = p.getY(k);
      const th = Math.atan2(p.getZ(k), p.getX(k));
      // gnarled: the girth swells and pinches along the trunk, and it's never quite round
      const sw = 1 + 0.14 * Math.sin(ly * 2.3 + ph) + 0.07 * Math.sin(ly * 5.3 + ph * 2) + 0.08 * Math.sin(th * 3 + ph + ly * 0.7);
      const x = p.getX(k) * sw;
      const z = p.getZ(k) * sw;
      const t = ly / (L * 0.5);
      p.setXYZ(k, x, ly, z + bend * (1 - t * t));
      // sun-bleached on top, dark and weedy where the sea washes it; grain streaks and browner, broken ends
      const top = Math.min(1, Math.max(0, (Math.cos(th) + 0.25) / 1.1));
      const grain = 0.88 + 0.12 * Math.sin(th * 9 + ly * 1.7 + ph) * Math.sin(ly * 0.9 + th * 2);
      const knot = Math.max(0, Math.sin(ly * 3.1 + ph * 3) * Math.sin(th * 2 + ph) - 0.8) * 2.5;
      let c = lerp3(wet, pale, top);
      c = [c[0] * grain, c[1] * grain, c[2] * grain];
      c = lerp3(c, end, Math.min(1, knot + Math.max(0, Math.abs(t) - 0.93) * 14));
      cols.set(c, k * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.computeVertexNormals();
    const log = g.toNonIndexed();
    log.deleteAttribute('uv');
    log.rotateZ(Math.PI / 2);
    const place = new THREE.Matrix4().compose(new THREE.Vector3(cx, y, cz), new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(1, 1, 1));
    log.applyMatrix4(place);
    parts.push(log);
    const dx = Math.cos(yaw) * L * 0.5;
    const dz = -Math.sin(yaw) * L * 0.5;
    const ty = y + r * 0.85;
    logs.push({ ax: cx - dx * 0.8, az: cz - dz * 0.8, bx: cx + dx * 0.8, bz: cz + dz * 0.8, y: ty });
    radius = Math.max(radius, Math.hypot(cx, cz) + L * 0.5);
    if (L * r > biggest) {
      biggest = L * r;
      perch.unshift(new THREE.Vector3(cx + dx * 0.25, ty, cz + dz * 0.25));
    } else perch.push(new THREE.Vector3(cx - dx * 0.3, ty, cz - dz * 0.3));
    // a snapped-off branch stub or two reaching up out of the water
    const stubs = Math.floor(rnd() * 2.6);
    for (let k = 0; k < stubs; k++) {
      const t = (rnd() - 0.5) * 0.7;
      const a = new THREE.Vector3(t * L, r * 0.5, 0);
      const b = a.clone().add(new THREE.Vector3((rnd() - 0.5) * 0.5, 0.25 + rnd() * 0.45, (rnd() - 0.5) * 0.6));
      const st = paint(rod(a, b, r * 0.3, r * 0.08, 5), (_x, yy) => lerp3(wet, pale, Math.min(1, Math.max(0, yy / (r * 1.4)))));
      st.applyMatrix4(place);
      parts.push(st);
    }
    // the first log still has its root plate: stubby roots splayed out and down into the sea
    if (i === 0) {
      const o = new THREE.Vector3(L * 0.5, 0, 0);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU + rnd() * 0.6;
        const len = 0.5 + rnd() * 0.6;
        const b = o.clone().add(new THREE.Vector3(0.15 + rnd() * 0.3, Math.cos(a) * len * 0.5 - 0.15, Math.sin(a) * len));
        const rt = paint(rod(o, b, 0.06, 0.02, 5), (_x, yy) => lerp3(wet, end, Math.min(1, Math.max(0, yy / 0.3 + 0.5))));
        rt.applyMatrix4(place);
        parts.push(rt);
      }
    }
  }
  // weed snagged across the logs
  for (let k = 0; k < 4; k++) {
    const g = ribbon(rnd, (rnd() - 0.5) * 2, (rnd() - 0.5) * 2, rnd() * TAU, 1.4 + rnd() * 1.6, 0.16, kelpColor(rnd));
    g.translate(0, 0.1, 0);
    parts.push(g);
  }
  return { geo: mergeGeometries(parts), radius, logs, perch, kelp: false };
}

function kelpMat(seed: number): MatShape {
  const rnd = mulberry(seed);
  const parts: THREE.BufferGeometry[] = [];
  const radius = 3.4 + rnd() * 1.6;
  const n = 56 + Math.floor(rnd() * 16);
  const floats = hex(0x8a6c28);
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU;
    const d = Math.sqrt(rnd()) * radius * 0.4;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const inner = rnd() < 0.35;
    const len = inner ? 0.8 + rnd() * 1.2 : 1.6 + rnd() * 2.4;
    // streaming outward from the tangle, with short ones matted every which way across it
    const yaw = inner ? rnd() * TAU : a + (rnd() - 0.5) * 1.8;
    parts.push(ribbon(rnd, x, z, yaw, len, 0.12 + rnd() * 0.12, kelpColor(rnd)));
    // a gas bladder or two along the frond
    const nb = Math.floor(rnd() * 2.4);
    for (let k = 0; k < nb; k++) {
      const t = 0.15 + rnd() * 0.7;
      const b = new THREE.SphereGeometry(0.04 + rnd() * 0.035, 6, 4);
      b.scale(1.3, 0.75, 1);
      b.translate(x + Math.cos(yaw) * len * t, 0.05, z + Math.sin(yaw) * len * t);
      parts.push(paint(b, (_x, y) => (y > 0.06 ? [floats[0] * 1.3, floats[1] * 1.25, floats[2] * 1.1] : floats)));
    }
  }
  // the heart of it: a low heap of matted weed
  const heap = new THREE.SphereGeometry(1, 14, 6, 0, TAU, 0, Math.PI / 2);
  const hp = heap.getAttribute('position');
  for (let k = 0; k < hp.count; k++) {
    const th = Math.atan2(hp.getZ(k), hp.getX(k));
    const w = 1 + 0.25 * Math.sin(th * 3 + seed) + 0.12 * Math.sin(th * 7 + seed * 2);
    hp.setXYZ(k, hp.getX(k) * radius * 0.27 * w, hp.getY(k) * 0.12, hp.getZ(k) * radius * 0.22 * w);
  }
  heap.computeVertexNormals();
  parts.push(paint(heap, (x, y, z) => {
    const k = 0.8 + 0.3 * Math.sin(x * 7.1 + z * 5.3) * Math.sin(x * 3.7 - z * 8.9);
    const c = hex(y > 0.07 ? 0x6e5a25 : 0x56471c);
    return [c[0] * k, c[1] * k, c[2] * k];
  }));
  // the thick stipes knotted in the middle, and a stick or two caught up in it
  for (let k = 0; k < 6; k++) {
    const a = rnd() * TAU;
    const l = 0.8 + rnd() * 1.4;
    const p0 = new THREE.Vector3(Math.cos(a) * 0.4, 0.09, Math.sin(a) * 0.4);
    const p1 = new THREE.Vector3(Math.cos(a + 2.4) * l, 0.05, Math.sin(a + 2.4) * l);
    parts.push(paint(rod(p0, p1, 0.045, 0.03, 5), 0x54431a));
  }
  for (let k = 0; k < 2; k++) {
    const a = rnd() * TAU;
    const p0 = new THREE.Vector3(Math.cos(a) * radius * 0.3, 0.07, Math.sin(a) * radius * 0.3);
    const p1 = p0.clone().add(new THREE.Vector3(Math.cos(a + 1.7) * 1.3, 0.02, Math.sin(a + 1.7) * 1.3));
    parts.push(paint(rod(p0, p1, 0.06, 0.04, 6), (_x, y) => (y > 0.07 ? hex(0xb6a688) : hex(0x5f5644))));
  }
  return { geo: mergeGeometries(parts), radius, logs: [], perch: [new THREE.Vector3(0.3, 0.17, -0.2), new THREE.Vector3(-0.6, 0.12, 0.5)], kelp: true };
}

/** A shore crab, a touch over life size so it reads from the masthead: carapace, eyes on stalks, eight legs. */
function crabGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const shell = hex(0xc4482a);
  const belly = hex(0xe8a978);
  const body = new THREE.SphereGeometry(0.17, 12, 7);
  body.scale(1.25, 0.42, 0.95);
  body.translate(0, 0.11, 0);
  parts.push(paint(body, (_x, y, z) => (y > 0.1 ? [shell[0] * (0.9 + z * 0.6), shell[1] * (0.9 + z * 0.6), shell[2]] : belly)));
  for (const s of [-1, 1]) {
    const st = rod(new THREE.Vector3(s * 0.05, 0.15, 0.12), new THREE.Vector3(s * 0.065, 0.21, 0.15), 0.012, 0.01, 5);
    parts.push(paint(st, shell));
    const eye = new THREE.SphereGeometry(0.022, 7, 5);
    eye.translate(s * 0.066, 0.215, 0.152);
    parts.push(paint(eye, 0x141110));
    for (let k = 0; k < 4; k++) {
      const z = 0.07 - k * 0.055;
      const hip = new THREE.Vector3(s * 0.17, 0.1, z);
      const knee = new THREE.Vector3(s * 0.31, 0.17, z * 1.35 - 0.01);
      const toe = new THREE.Vector3(s * 0.39, 0.0, z * 1.6 - 0.02);
      parts.push(paint(rod(hip, knee, 0.018, 0.015, 5), shell), paint(rod(knee, toe, 0.015, 0.006, 5), shell));
    }
  }
  return mergeGeometries(parts);
}

/** One claw, from its shoulder at the origin, reaching forward (+z). */
function clawGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const shell = hex(0xcf4f2c);
  const tip = hex(0x2a1a14);
  parts.push(paint(rod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.03, 0.11), 0.022, 0.02, 6), shell));
  const palm = new THREE.SphereGeometry(0.05, 9, 6);
  palm.scale(0.75, 0.6, 1.2);
  palm.translate(0, 0.035, 0.15);
  parts.push(paint(palm, shell));
  parts.push(paint(rod(new THREE.Vector3(0, 0.05, 0.19), new THREE.Vector3(0, 0.07, 0.25), 0.016, 0.005, 5), tip));
  parts.push(paint(rod(new THREE.Vector3(0, 0.025, 0.19), new THREE.Vector3(0, 0.015, 0.245), 0.014, 0.005, 5), tip));
  return mergeGeometries(parts);
}

/**
 * A corked bottle lying on its side, neck along +x, with a rolled letter
 * inside. The glass is opaque, so the top of it is left open as a window the
 * letter shows through, its edges caught by two bright lines of sun.
 */
function bottleGeometry(): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const S = 1.7;
  const glass = hex(0x2a7563);
  const sky = hex(0x83c9b4);
  // modelled upright (along y); "up" once it is laid down is -x here
  const tint = (x: number, y: number): [number, number, number] => {
    const k = Math.min(1, Math.max(0, -x / (0.1 * S)) * 0.8 + (y > 0.26 * S && y < 0.36 * S ? 0.2 : 0));
    return [glass[0] + (sky[0] - glass[0]) * k, glass[1] + (sky[1] - glass[1]) * k, glass[2] + (sky[2] - glass[2]) * k];
  };
  const lathe = (pts: [number, number][], start = 0, len = Math.PI * 2) => paint(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r * S, y * S)), 16, start, len), (x, y) => tint(x, y));
  const W = 0.55; // half the window, radians
  const up = Math.PI * 1.5;
  const parts = [
    lathe([[0.0, 0], [0.085, 0], [0.1, 0.012], [0.102, 0.05]]),
    // the body, open along the top
    lathe([[0.102, 0.05], [0.1, 0.25]], up + W, Math.PI * 2 - W * 2),
    lathe([[0.1, 0.25], [0.088, 0.3], [0.055, 0.34], [0.038, 0.37], [0.036, 0.44], [0.044, 0.45], [0.042, 0.465]]),
  ];
  // the inside of the glass seen through the window
  const inner = new THREE.LatheGeometry([new THREE.Vector2(0.094 * S, 0.25 * S), new THREE.Vector2(0.096 * S, 0.05 * S)], 16, up + W, Math.PI * 2 - W * 2);
  parts.push(paint(inner, [glass[0] * 0.6, glass[1] * 0.6, glass[2] * 0.6]));
  const cork = new THREE.CylinderGeometry(0.034 * S, 0.03 * S, 0.06 * S, 10);
  cork.translate(0, 0.48 * S, 0);
  const seal = new THREE.CylinderGeometry(0.046 * S, 0.046 * S, 0.018 * S, 10);
  seal.translate(0, 0.51 * S, 0);
  const twine = new THREE.TorusGeometry(0.04 * S, 0.006 * S, 4, 12);
  twine.rotateX(Math.PI / 2);
  twine.translate(0, 0.41 * S, 0);
  parts.push(paint(cork, 0xa98456), paint(seal, 0xa3261e), paint(twine, 0xcdb88a));
  // the letter: a roll of paper tied with a red thread
  const letter = new THREE.CylinderGeometry(0.06 * S, 0.06 * S, 0.19 * S, 12);
  letter.translate(-0.02 * S, 0.15 * S, 0);
  parts.push(paint(letter, (_x, y) => (Math.abs(y - 0.15 * S) < 0.012 * S ? hex(0xa3261e) : [0.86, 0.76, 0.56])));
  const solid = mergeGeometries(parts);
  // sun along the window's edges
  const lines: THREE.BufferGeometry[] = [];
  for (const a of [up + W, up - W]) {
    const g = new THREE.CylinderGeometry(0.005 * S, 0.005 * S, 0.19 * S, 4);
    g.translate(Math.sin(a) * 0.103 * S, 0.15 * S, Math.cos(a) * 0.103 * S);
    lines.push(paint(g, [1.5, 1.6, 1.5]));
  }
  const lit = mergeGeometries(lines);
  for (const g of [solid, lit]) g.rotateZ(-Math.PI / 2);
  return [solid, lit];
}

// ------------------------------------------------------------------ state

export interface Bottle {
  x: number;
  z: number;
  phase: number;
  age: number;
  life: number;
  sparkle: number;
}

interface Crab {
  /** Mat-local position. */
  x: number;
  z: number;
  y: number;
  /** Where it's scuttling to (mat-local). */
  tx: number;
  tz: number;
  ty: number;
  face: number;
  wait: number;
  claws: number;
  wave: number;
  /** Over the side: falling (world space), then gone. */
  off: boolean;
  wx: number;
  wy: number;
  wz: number;
  vy: number;
  seed: number;
}

interface Mat {
  shape: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  spin: number;
  age: number;
  life: number;
  sink: number;
  quat: THREE.Quaternion;
  y: number;
  crabs: Crab[];
  /** World points the gulls stand on, moved with the mat. */
  spots: THREE.Vector3[];
  scared: boolean;
}

export interface DriftView {
  /** The ship whose waters fill with flotsam (null: nothing new turns up). */
  ship: Ship | null;
  highSeas: boolean;
}

export class Drift {
  readonly group = new THREE.Group();
  /** A crate has fetched up in a fresh mat (put a barrel or chest there). */
  onCrate: (x: number, z: number, kelp: boolean) => void = () => {};
  /** A gull should come and stand on this (moving) spot. */
  onRider: (spot: THREE.Vector3) => void = () => {};
  /** ...and that spot's flotsam is gone. */
  onRiderGone: (spot: THREE.Vector3) => void = () => {};

  readonly bottles: Bottle[] = [];
  private mats: Mat[] = [];
  private shapes: MatShape[] = [];
  private matMesh: THREE.InstancedMesh[] = [];
  private bottleMesh: THREE.InstancedMesh;
  private bottleLit: THREE.InstancedMesh;
  private crabMesh: THREE.InstancedMesh;
  private clawMesh: THREE.InstancedMesh;
  private bottleT = 35 + Math.random() * 25;
  private matT = 18 + Math.random() * 14;

  constructor() {
    const wood = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 }), { clouds: true, caustics: true });
    const glass = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.06, metalness: 0.1 }), { clouds: true, caustics: true });
    const shell = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0 }), { clouds: true, caustics: true });
    const lit = new THREE.MeshBasicMaterial({ vertexColors: true });
    const make = (g: THREE.BufferGeometry, m: THREE.Material, cap: number, shadow = true) => {
      const im = new THREE.InstancedMesh(g, m, cap);
      im.count = 0;
      im.castShadow = shadow;
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(im);
      return im;
    };
    this.shapes = [driftwood(11), driftwood(57), kelpMat(23), kelpMat(91)];
    for (const s of this.shapes) this.matMesh.push(make(s.geo, wood, MAT_MAX));
    const [b, l] = bottleGeometry();
    this.bottleMesh = make(b, glass, BOTTLE_MAX);
    this.bottleLit = make(l, lit, BOTTLE_MAX, false);
    this.crabMesh = make(crabGeometry(), shell, CRAB_MAX);
    this.clawMesh = make(clawGeometry(), shell, CRAB_MAX * 2);
  }

  /** Every bottle bobbing about, for the charts. */
  get count() {
    return this.bottles.length;
  }

  /** Puts a bottle on the water (also used to test: `?bottle`). */
  dropBottle(x: number, z: number) {
    if (this.bottles.length >= BOTTLE_MAX) this.bottles.shift();
    this.bottles.push({ x, z, phase: Math.random() * 10, age: 0, life: 260, sparkle: 0 });
  }

  /** Sets a mat of flotsam adrift here: `kind` 0 driftwood, 1 kelp (random when omitted). */
  dropMat(x: number, z: number, kind?: 0 | 1) {
    if (this.mats.length >= MAT_MAX) this.removeMat(0);
    const k = kind ?? (Math.random() < 0.5 ? 0 : 1);
    const shape = k * 2 + (Math.random() < 0.5 ? 0 : 1);
    const S = this.shapes[shape];
    const m: Mat = {
      shape, x, z, vx: 0, vz: 0, yaw: Math.random() * TAU, spin: (Math.random() - 0.5) * 0.02, age: 0, life: 300 + Math.random() * 60, sink: 0,
      quat: new THREE.Quaternion(), y: 0, crabs: [], spots: [], scared: false,
    };
    const crabs = S.kelp ? 1 + Math.floor(Math.random() * 3) : 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < crabs; i++) {
      const c: Crab = { x: 0, z: 0, y: 0, tx: 0, tz: 0, ty: 0, face: Math.random() * TAU, wait: Math.random() * 3, claws: 0, wave: 0, off: false, wx: 0, wy: 0, wz: 0, vy: 0, seed: Math.random() * 100 };
      this.pickSpot(S, c);
      c.x = c.tx;
      c.z = c.tz;
      c.y = c.ty;
      m.crabs.push(c);
    }
    this.mats.push(m);
    // a gull or two loafing on top
    const birds = Math.random() < 0.7 ? (Math.random() < 0.3 ? 2 : 1) : 0;
    for (let i = 0; i < birds && i < S.perch.length; i++) {
      const spot = new THREE.Vector3();
      m.spots.push(spot);
    }
    this.place(m);
    for (const s of m.spots) this.onRider(s);
    if (Math.random() < 0.38) {
      // a crate caught up in it (in the weed's heart, or bumping along beside the logs)
      const a = Math.random() * TAU;
      const r = S.kelp ? 0.3 : S.radius * 0.55;
      this.onCrate(x + Math.cos(a) * r, z + Math.sin(a) * r, S.kelp);
    }
  }

  private pickSpot(S: MatShape, c: Crab) {
    if (S.logs.length) {
      const l = S.logs[Math.floor(Math.random() * S.logs.length)];
      const t = 0.1 + Math.random() * 0.8;
      c.tx = l.ax + (l.bx - l.ax) * t;
      c.tz = l.az + (l.bz - l.az) * t;
      c.ty = l.y - 0.02;
    } else {
      const a = Math.random() * TAU;
      const d = Math.sqrt(Math.random()) * S.radius * 0.5;
      c.tx = Math.cos(a) * d;
      c.tz = Math.sin(a) * d;
      c.ty = 0.07;
    }
  }

  private removeMat(i: number) {
    for (const s of this.mats[i].spots) this.onRiderGone(s);
    this.mats.splice(i, 1);
  }

  /** Somewhere ahead of her bows, in open water well clear of any land. */
  private findOpen(w: World, s: Ship, d0: number, d1: number): THREE.Vector3 | null {
    for (let k = 0; k < 8; k++) {
      const a = s.heading + (Math.random() - 0.5) * 1.5;
      const d = rand(d0, d1);
      const x = s.pos.x + Math.sin(a) * d;
      const z = s.pos.z + Math.cos(a) * d;
      if (w.terrain.heightAt(x, z) > -9) continue;
      let ok = true;
      for (let j = 0; j < 4 && ok; j++) {
        const b = (j / 4) * TAU;
        if (w.terrain.heightAt(x + Math.cos(b) * 28, z + Math.sin(b) * 28) > -5) ok = false;
      }
      if (ok) return _v.set(x, 0, z);
    }
    return null;
  }

  /**
   * Bottles the collector swept up this frame. `collector`/`radius` work like
   * the salvage magnet; `view.ship` sets where new flotsam turns up.
   */
  update(dt: number, w: World, collector: THREE.Vector3 | null, radius: number, ships: Ship[], view: DriftView): Bottle[] {
    const got: Bottle[] = [];
    if (dt <= 0) {
      this.upload(w);
      return got;
    }
    const s = view.ship;
    if (s && s.alive) {
      // the open sea is where it all drifts: more of it out on the high seas
      this.bottleT -= dt;
      if (this.bottleT < 0) {
        this.bottleT = view.highSeas ? rand(45, 80) : rand(75, 130);
        const at = this.bottles.length < 2 ? this.findOpen(w, s, 110, 190) : null;
        if (at) this.dropBottle(at.x, at.z);
      }
      this.matT -= dt;
      if (this.matT < 0) {
        this.matT = view.highSeas ? rand(32, 60) : rand(50, 90);
        const at = this.mats.length < 3 ? this.findOpen(w, s, 150, 260) : null;
        // driftwood far from land, kelp nearer the isles
        if (at) this.dropMat(at.x, at.z, Math.random() < (view.highSeas ? 0.62 : 0.4) ? 0 : 1);
      }
    }
    const dx = w.wind.dirX * DRIFT * dt;
    const dz = w.wind.dirZ * DRIFT * dt;
    const far = s ? s.pos : collector;

    // ---------------------------------------------------------- bottles
    for (let i = this.bottles.length - 1; i >= 0; i--) {
      const b = this.bottles[i];
      b.age += dt;
      b.x += dx;
      b.z += dz;
      if (collector) {
        const ox = collector.x - b.x, oz = collector.z - b.z;
        const d = Math.hypot(ox, oz);
        if (d < radius * 0.5) {
          got.push(b);
          this.bottles.splice(i, 1);
          continue;
        } else if (d < radius) {
          const pull = Math.min(d, (6 + 26 * (1 - d / radius)) * dt);
          b.x += (ox / d) * pull;
          b.z += (oz / d) * pull;
        }
      }
      if (b.age > b.life || (far && Math.hypot(far.x - b.x, far.z - b.z) > 800)) {
        this.bottles.splice(i, 1);
        continue;
      }
      b.sparkle += dt;
      if (b.sparkle > 0.5) {
        b.sparkle = 0;
        glint(w, b.x, b.z);
      }
    }

    // ---------------------------------------------------------- mats
    for (let i = this.mats.length - 1; i >= 0; i--) {
      const m = this.mats[i];
      const S = this.shapes[m.shape];
      m.age += dt;
      const k = Math.exp(-0.8 * dt);
      m.vx *= k;
      m.vz *= k;
      // hulls shoulder the flotsam aside
      let near = Infinity;
      for (const o of ships) {
        if (!o.alive) continue;
        const ox = m.x - o.pos.x, oz = m.z - o.pos.z;
        const d = Math.hypot(ox, oz);
        near = Math.min(near, d - o.cls.length * 0.5);
        const fx = Math.sin(o.heading), fz = Math.cos(o.heading);
        const along = ox * fx + oz * fz;
        if (Math.abs(along) > o.cls.length * 0.5 + S.radius * 0.5) continue;
        const lx = ox - fx * along, lz = oz - fz * along;
        const ld = Math.hypot(lx, lz);
        const reach = o.cls.beam * 0.5 + S.radius * 0.6;
        if (ld < reach && ld > 1e-3) {
          const push = (reach - ld) * 1.2 + Math.abs(o.speed) * 0.25;
          m.vx += (lx / ld) * push * dt * 2;
          m.vz += (lz / ld) * push * dt * 2;
        }
      }
      m.x += dx + m.vx * dt;
      m.z += dz + m.vz * dt;
      m.yaw += m.spin * dt;
      if (m.age > m.life) m.sink += dt * 0.25;
      if (m.sink > 1.4 || (far && Math.hypot(far.x - m.x, far.z - m.z) > 900)) {
        this.removeMat(i);
        continue;
      }
      this.place(m, w, dt);
      // a ship coming close sends the crabs over the side
      if (!m.scared && near < 24) m.scared = true;
      this.crabs(m, S, w, dt);
    }

    this.upload(w);
    return got;
  }

  /** Rides the mat on the swell: heaves with the water and tilts to its slope. */
  private place(m: Mat, w?: World, dt = 1) {
    const S = this.shapes[m.shape];
    if (w) {
      const r = S.radius * 0.55;
      const h0 = w.waterHeight(m.x, m.z);
      const hx = w.waterHeight(m.x + r, m.z);
      const hz = w.waterHeight(m.x, m.z + r);
      _n.set(-(hx - h0) / r, 1, -(hz - h0) / r).normalize();
      _q.setFromUnitVectors(UP, _n);
      _q2.setFromAxisAngle(UP, m.yaw);
      _q.multiply(_q2);
      const f = Math.min(1, dt * 4);
      m.quat.slerp(_q, f);
      m.y += (h0 + (S.kelp ? 0.07 : -0.2) - m.sink - m.y) * Math.min(1, dt * 6);
    } else m.quat.setFromAxisAngle(UP, m.yaw);
    _m.compose(_v.set(m.x, m.y, m.z), m.quat, _s);
    m.spots.forEach((s, i) => s.copy(S.perch[i]).applyMatrix4(_m));
  }

  private crabs(m: Mat, S: MatShape, w: World, dt: number) {
    for (let i = m.crabs.length - 1; i >= 0; i--) {
      const c = m.crabs[i];
      if (c.off) {
        // over the side: a little fall, a plop, gone
        c.vy -= 9.8 * dt;
        c.wy += c.vy * dt;
        if (c.wy < w.waterHeight(c.wx, c.wz) - 0.5) m.crabs.splice(i, 1);
        continue;
      }
      if (m.scared) {
        // bolt for the edge away from the ship, and drop off it
        if (c.wait >= 0) {
          c.wait = -1;
          const a = Math.atan2(c.z, c.x) + (Math.random() - 0.5) * 0.6;
          c.tx = Math.cos(a) * S.radius * 0.95;
          c.tz = Math.sin(a) * S.radius * 0.95;
          c.ty = 0.02;
        }
      }
      const ox = c.tx - c.x, oz = c.tz - c.z;
      const d = Math.hypot(ox, oz);
      if (d > 0.04) {
        // crabs go sideways: face across the way they're walking
        const sp = m.scared ? 1.6 : 0.45;
        const step = Math.min(d, sp * dt);
        c.x += (ox / d) * step;
        c.z += (oz / d) * step;
        c.y += (c.ty - c.y) * damp(6, dt);
        const want = Math.atan2(ox, oz) + Math.PI / 2;
        let da = want - c.face;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        // either flank will do
        if (Math.abs(da) > Math.PI / 2) da -= Math.sign(da) * Math.PI;
        c.face += da * damp(8, dt);
        c.claws += (0.15 - c.claws) * damp(6, dt);
      } else if (m.scared) {
        // off the edge
        c.off = true;
        _m.compose(_v.set(m.x, m.y, m.z), m.quat, _s);
        _v.set(c.x, c.y, c.z).applyMatrix4(_m);
        c.wx = _v.x;
        c.wy = _v.y;
        c.wz = _v.z;
        c.vy = 1.2;
        _v.y = w.waterHeight(_v.x, _v.z);
        w.particles.splash(_v, 0.12);
        const [vol, pan, dd] = w.soundAt(_v);
        if (vol > 0.4) w.audio.splash(vol * 0.05, pan, dd);
        continue;
      } else {
        c.wait -= dt;
        // claws up and waving now and then: at the gulls, at the sky, at you
        c.wave = Math.max(0, c.wave - dt);
        if (c.wave <= 0 && Math.random() < dt * 0.15) c.wave = 1.6 + Math.random();
        c.claws += ((c.wave > 0 ? 1 : 0) - c.claws) * damp(5, dt);
        if (c.wait < 0) {
          c.wait = 1.5 + Math.random() * 5;
          this.pickSpot(S, c);
        }
      }
    }
  }

  private upload(w: World) {
    const n = [0, 0, 0, 0];
    let nc = 0;
    let nk = 0;
    const t = w.time;
    for (const m of this.mats) {
      const mesh = this.matMesh[m.shape];
      _m.compose(_v.set(m.x, m.y, m.z), m.quat, _s);
      mesh.setMatrixAt(n[m.shape]++, _m);
      for (const c of m.crabs) {
        if (nc >= CRAB_MAX) break;
        const moving = Math.hypot(c.tx - c.x, c.tz - c.z) > 0.04 && !c.off;
        // a scurry: the body bobs and rocks as the legs patter
        const bob = moving ? Math.abs(Math.sin(t * 22 + c.seed)) * 0.012 : 0;
        const rock = moving ? Math.sin(t * 22 + c.seed) * 0.06 : Math.sin(t * 1.3 + c.seed) * 0.02;
        _e.set(0, c.face, rock, 'YXZ');
        _q.setFromEuler(_e);
        if (c.off) {
          _q.premultiply(m.quat);
          _m2.compose(_v.set(c.wx, c.wy, c.wz), _q, _s);
        } else {
          _m2.compose(_v.set(c.x, c.y + bob, c.z), _q, _s);
          _m2.premultiply(_m);
        }
        this.crabMesh.setMatrixAt(nc++, _m2);
        // the claws: raised and snipping when it waves, tucked in front as it walks
        const up = c.claws;
        for (const side of [-1, 1]) {
          const snip = up > 0.5 ? Math.sin(t * 9 + c.seed + side) * 0.25 * up : 0;
          _e.set(-0.2 - up * 1.0 + snip, side * (0.45 - up * 0.15), side * up * 0.3, 'YXZ');
          _q2.setFromEuler(_e);
          _m.compose(_v.set(side * 0.11, 0.12, 0.13), _q2, _s);
          _m.premultiply(_m2);
          this.clawMesh.setMatrixAt(nk++, _m);
        }
        _m.compose(_v.set(m.x, m.y, m.z), m.quat, _s);
      }
    }
    this.matMesh.forEach((mesh, k) => {
      mesh.count = n[k];
      mesh.visible = n[k] > 0;
      if (n[k]) mesh.instanceMatrix.needsUpdate = true;
    });
    let nb = 0;
    for (const b of this.bottles) {
      // lying on its side, neck cocked up, rolling and nodding on the swell
      const y = w.waterHeight(b.x, b.z);
      const fade = Math.min(1, b.age * 1.2, Math.max(0, (b.life - b.age) / 3));
      _e.set(Math.sin(t * 1.7 + b.phase) * 0.35, b.phase + t * 0.05, 0.18 + Math.sin(t * 1.2 + b.phase) * 0.12, 'YXZ');
      _q.setFromEuler(_e);
      _m.compose(_v.set(b.x, y - 0.06 - (1 - fade) * 0.6, b.z), _q, _s);
      this.bottleMesh.setMatrixAt(nb, _m);
      this.bottleLit.setMatrixAt(nb, _m);
      nb++;
    }
    for (const im of [this.bottleMesh, this.bottleLit]) {
      im.count = nb;
      im.visible = nb > 0;
      if (nb) im.instanceMatrix.needsUpdate = true;
    }
    this.crabMesh.count = nc;
    this.clawMesh.count = nk;
    this.crabMesh.visible = this.clawMesh.visible = nc > 0;
    if (nc) this.crabMesh.instanceMatrix.needsUpdate = this.clawMesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.bottles.length = 0;
    for (let i = this.mats.length - 1; i >= 0; i--) this.removeMat(i);
    this.bottleT = 35 + Math.random() * 25;
    this.matT = 18 + Math.random() * 14;
  }
}

const _sp = new THREE.Vector3();
/** The sun catching the glass. */
function glint(w: World, x: number, z: number) {
  _sp.set(x, w.waterHeight(x, z) + 0.1, z);
  w.particles.sparkle(_sp, [1.5, 1.35, 0.95], 0.8);
}
