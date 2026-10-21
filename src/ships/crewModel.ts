import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../render/environment';
import { simplifiedLevels } from '../render/lod';
import { GHOST_GREEN } from './ghostGlsl';

// One sailor mesh for every crewman on every ship. The body is sculpted from
// smooth parametric surfaces (no primitives glued together) and skinned in the
// vertex shader: each vertex rides one or two bones (aRig.x, and aRig.w = bone
// B + blend weight), so shoulders, elbows, the waist, knees and the neck bend
// as one continuous skin. Beyond the limbs there are finger bones that curl
// into a fist, a jaw, brows, eyelids that really close, eyes that dart about
// and a mouth that talks, shouts and grins. Each vertex also carries a palette
// slot (aRig.y), an optional group (aRig.z: hats, beards, coats, peg legs,
// parrots, held props...), and in `color` its baked occlusion, a part id the
// shaders use for crisp painted seams and per-sailor face morphs, and how much
// it flutters in the breeze. Per instance the CPU only uploads a placement
// matrix, 24 joint/expression values and a style (palette row, hat, prop,
// flags). The whole crew of the whole sea is one draw call per detail level.
//
// Rest frame: feet at y = 0, facing +z, the sailor's left hand on +x.

export const BONE = {
  hips: 0, chest: 1, head: 2, armL: 3, foreL: 4, armR: 5, foreR: 6, thighL: 7, shinL: 8, thighR: 9, shinR: 10,
  fingersL: 11, fingersR: 12, jaw: 13, brows: 14, lids: 15, eyes: 16, mouth: 17,
} as const;

export const TINT = {
  skin: 0,
  shirt: 1,
  sleeve: 2,
  forearm: 3,
  trousers: 4,
  shin: 5,
  boots: 6,
  sash: 7,
  hat: 8,
  hair: 9,
  coat: 10,
  trim: 11,
  wood: 12,
  metal: 13,
  glow: 14,
  cloth: 15,
  stripe: 16,
  dark: 17,
  white: 18,
  pupil: 19, // the iris colour
  parrot: 20,
  wing: 21,
  beak: 22,
  vest: 23,
  plume: 24,
  leather: 25,
  mouth: 26,
  tongue: 27,
  shine: 28, // eye glints, glow a touch
  ghost: 29, // not a colour: r = 1 for a ghost ship's spectral crew
} as const;
export const TINT_SLOTS = 30;

export const HAT = { none: 0, tricorn: 1, bandana: 2, knit: 3, straw: 4 } as const;
// group ids: 1-9 hats, 10-29 shown with a flag bit, 30-49 hidden by a flag bit, 50+ held props,
// 1000 + a*32 + b shown when neither bit is set, 3000 + a*32 + b shown when a is set and b is not
export const PROP = { none: 0, rammer: 50, spyglass: 51, mop: 52, bucket: 53, cutlass: 54, linstock: 55, fiddle: 56, mug: 57, pipe: 58, spade: 59 } as const;
const BIT = {
  beard: 0,
  coat: 1,
  ponytail: 2,
  patch: 3,
  earring: 4,
  vest: 5,
  peg: 6,
  parrot: 7,
  boots: 8,
  pistol: 9,
  plume: 10,
  moustache: 11,
  bald: 12,
  belt: 13,
  longhair: 14,
  kerchief: 15,
  rolled: 16, // sleeves rolled to the elbow
  cuffs: 17, // long sleeves buttoned at the wrist
  garters: 18, // breeches gathered below the knee
  barefoot: 19,
} as const;
export const FLAG = Object.fromEntries(Object.entries(BIT).map(([k, b]) => [k, 1 << b])) as { [K in keyof typeof BIT]: number };
const SHOWN = (b: number) => 10 + b;
const HIDDEN = (b: number) => 30 + b;
const NEITHER = (a: number, b: number) => 1000 + a * 32 + b;
const ONLY = (a: number, b: number) => 3000 + a * 32 + b;

// joint pivots, mirrored in the shader
const SPINE = new THREE.Vector3(0, 0.98, 0);
const NECK = new THREE.Vector3(0, 1.48, 0);
const SH_X = 0.215;
const SH_Y = 1.4;
const EL_Y = 1.125;
const HIP_X = 0.09;
const HIP_Y = 0.88;
const KNEE_Y = 0.5;
/** The joint pivots (model space, metres), for skeletons that drive the sailor from outside. */
export const RIG = { neckY: NECK.y, shX: SH_X, shY: SH_Y, elY: EL_Y, hipX: HIP_X, hipY: HIP_Y, kneeY: KNEE_Y, gripY: 0.818 } as const;
const HX = SH_X + 0.01; // wrist / hand centre line
const KN_Y = 0.832; // knuckles
const FM_Y = 0.806; // middle finger joint
// the captain's parrot perches on the left shoulder
const PARROT = new THREE.Vector3(SH_X * 0.95, SH_Y + 0.07, -0.02);

/** Joint angle + expression layout shared with the vertex shader (6 x vec4). */
export const P = {
  spineX: 0, spineY: 1, spineZ: 2, headX: 3,
  headY: 4, armLX: 5, armLZ: 6, elbowL: 7,
  armRX: 8, armRZ: 9, elbowR: 10, legLX: 11,
  kneeL: 12, legRX: 13, kneeR: 14, rootY: 15,
  headZ: 16, handL: 17, handR: 18, jaw: 19,
  brow: 20, gazeX: 21, gazeY: 22, smile: 23,
} as const;
export const POSE_SIZE = 24;

// part ids (color.g): painted seams in the fragment shader, face morphs in the vertex shader
const PART = {
  none: 0, torso: 1, arm: 2, leg: 3, bandana: 4, knit: 5, nose: 6, ear: 7, face: 8, beard: 9, straw: 10,
  mouth: 11, teeth: 12, wing: 13, parrotHead: 14, parrot: 15, hair: 16, iris: 17, sole: 18,
} as const;

// --------------------------------------------------------------------- toolkit

type V3 = THREE.Vector3;
const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const sm = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const gauss = (d: V3, c: V3, s: number) => Math.exp(-d.distanceToSquared(c) / (s * s));

/** A smooth keyframed profile: rows of [x, ...values], cubic Hermite between keys. */
function curve(keys: number[][]) {
  const n = keys.length;
  const m = keys[0].length - 1;
  const out = new Array<number>(m);
  return (x: number) => {
    let i = 0;
    while (i < n - 2 && x > keys[i + 1][0]) i++;
    const k0 = keys[Math.max(0, i - 1)];
    const k1 = keys[i];
    const k2 = keys[i + 1];
    const k3 = keys[Math.min(n - 1, i + 2)];
    const h = k2[0] - k1[0];
    const t = clamp((x - k1[0]) / h, 0, 1);
    const t2 = t * t;
    const t3 = t2 * t;
    for (let j = 1; j <= m; j++) {
      const d1 = ((k2[j] - k0[j]) / (k2[0] - k0[0] || 1)) * h;
      const d2 = ((k3[j] - k1[j]) / (k3[0] - k1[0] || 1)) * h;
      out[j - 1] = (2 * t3 - 3 * t2 + 1) * k1[j] + (t3 - 2 * t2 + t) * d1 + (-2 * t3 + 3 * t2) * k2[j] + (t3 - t2) * d2;
    }
    return out;
  };
}

const range = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

/** Detail level of the build in progress: scales every surface's segment counts. */
let LOD = 1;
const lodU = (n: number, min = 4) => Math.max(min, Math.round(n * LOD));

interface GridOpts {
  noLod?: boolean; // the caller already scaled nu
  wrap?: boolean; // u closes on itself
  pole0?: boolean; // first row collapses to a point
  pole1?: boolean;
}

/** An indexed (smooth-shaded) surface over u in [0,1] (columns) and the given v rows. */
function grid(nu: number, vs: number[], fn: (u: number, v: number, out: V3) => void, o: GridOpts = {}): THREE.BufferGeometry {
  if (!o.noLod) nu = lodU(nu);
  const wrap = o.wrap ?? true;
  const cols = wrap ? nu : nu + 1;
  const pos: number[] = [];
  const idx: number[] = [];
  const rowStart: number[] = [];
  const p = new THREE.Vector3();
  const nv = vs.length;
  const isPole = (j: number) => (j === 0 && !!o.pole0) || (j === nv - 1 && !!o.pole1);
  for (let j = 0; j < nv; j++) {
    rowStart.push(pos.length / 3);
    if (isPole(j)) {
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (let i = 0; i < nu; i++) {
        fn(i / nu, vs[j], p);
        sx += p.x;
        sy += p.y;
        sz += p.z;
      }
      pos.push(sx / nu, sy / nu, sz / nu);
      continue;
    }
    for (let i = 0; i < cols; i++) {
      fn(i / nu, vs[j], p);
      pos.push(p.x, p.y, p.z);
    }
  }
  const at = (i: number, j: number) => (isPole(j) ? rowStart[j] : rowStart[j] + (wrap ? i % nu : i));
  for (let j = 0; j < nv - 1; j++) {
    for (let i = 0; i < nu; i++) {
      const a = at(i, j);
      const b = at(i + 1, j);
      const c = at(i + 1, j + 1);
      const d = at(i, j + 1);
      if (a !== b && b !== c && a !== c) idx.push(a, b, c);
      if (a !== c && c !== d && a !== d) idx.push(a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** Turns every face to point away from `inside(p)` (by majority), then smooths the normals. */
function orient(g: THREE.BufferGeometry, inside: (p: V3, out: V3) => V3): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  const idx = g.index!.array as Uint32Array | Uint16Array | number[];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const ins = new THREE.Vector3();
  let vote = 0;
  for (let t = 0; t < idx.length; t += 3) {
    a.fromBufferAttribute(pos, idx[t]);
    b.fromBufferAttribute(pos, idx[t + 1]);
    c.fromBufferAttribute(pos, idx[t + 2]);
    n.subVectors(b, a).cross(c.clone().sub(a));
    const cen = a.add(b).add(c).multiplyScalar(1 / 3);
    vote += Math.sign(n.dot(cen.clone().sub(inside(cen, ins))));
  }
  if (vote < 0) {
    const arr = Array.from(idx);
    for (let t = 0; t < arr.length; t += 3) [arr[t + 1], arr[t + 2]] = [arr[t + 2], arr[t + 1]];
    g.setIndex(arr);
  }
  g.computeVertexNormals();
  return g;
}
const about = (c: V3) => (_p: V3, out: V3) => out.copy(c);
const axisY = (x: number, z: number) => (p: V3, out: V3) => out.set(x, p.y, z);

/** Keeps the triangles where any corner has a positive value, and drops the unused vertices. */
function keepWhere(g: THREE.BufferGeometry, val: Float32Array): THREE.BufferGeometry {
  const idx = Array.from(g.index!.array);
  const keep: number[] = [];
  for (let t = 0; t < idx.length; t += 3) if (val[idx[t]] > 0 || val[idx[t + 1]] > 0 || val[idx[t + 2]] > 0) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  const remap = new Map<number, number>();
  const pos = g.getAttribute('position');
  const out: number[] = [];
  const ni: number[] = [];
  for (const k of keep) {
    let r = remap.get(k);
    if (r === undefined) {
      r = remap.size;
      remap.set(k, r);
      out.push(pos.getX(k), pos.getY(k), pos.getZ(k));
    }
    ni.push(r);
  }
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  ng.setIndex(ni);
  return ng;
}

/** A tapering tube through a few points, closed at both ends. */
function strand(pts: V3[], r0: number, r1: number, radial = 6, segs = 8, flat = 1): THREE.BufferGeometry {
  const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  segs = Math.max(1, Math.round(segs * LOD));
  const frames = c.computeFrenetFrames(segs, false);
  const vs = range(0, 1, segs + 2);
  const P0 = new THREE.Vector3();
  const g = grid(
    radial,
    vs,
    (u, v, out) => {
      const k = clamp((v * (segs + 2) - 1) / segs, 0, 1);
      const i = Math.round(k * segs);
      c.getPointAt(k, P0);
      const end = v <= 0 || v >= 1;
      const r = end ? 0 : mix(r0, r1, k) * (k < 0.02 || k > 0.98 ? 0.75 : 1);
      const a = u * TAU;
      out
        .copy(P0)
        .addScaledVector(frames.normals[i], Math.cos(a) * r * flat)
        .addScaledVector(frames.binormals[i], Math.sin(a) * r);
    },
    { pole0: true, pole1: true },
  );
  const tmp = new THREE.Vector3();
  return orient(g, (p, out) => {
    // nearest point on the centreline
    let best = 1e9;
    for (let i = 0; i <= 24; i++) {
      c.getPointAt(i / 24, tmp);
      const d = tmp.distanceToSquared(p);
      if (d < best) {
        best = d;
        out.copy(tmp);
      }
    }
    return out;
  });
}

/** An ellipsoid with an optional sculpt; smooth, poles top and bottom. */
function blob(c: V3, r: V3, nu = 12, nv = 9, sculpt?: (d: V3, p: V3) => void): THREE.BufferGeometry {
  nv = Math.max(3, Math.round(nv * LOD));
  const d = new THREE.Vector3();
  const g = grid(
    nu,
    range(0, 1, nv),
    (u, v, out) => {
      const th = u * TAU;
      const ph = v * Math.PI;
      d.set(Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th));
      out.set(d.x * r.x, d.y * r.y, d.z * r.z);
      sculpt?.(d, out);
      out.add(c);
    },
    { pole0: true, pole1: true },
  );
  return orient(g, about(c));
}

/** A ring swept round the y axis: closed cross-section `loop` of [radius, y] points. */
function ring(loop: [number, number][], nu: number, sculpt?: (p: V3, th: number) => void, phi0 = 0, phiLen = TAU): THREE.BufferGeometry {
  nu = lodU(nu, 5);
  const wrapU = phiLen >= TAU - 1e-6;
  const n = loop.length;
  const g = grid(
    nu,
    range(0, 1, n),
    (u, v, out) => {
      const th = phi0 + u * phiLen;
      const k = Math.round(v * n) % n;
      const [r, y] = loop[k];
      out.set(Math.sin(th) * r, y, Math.cos(th) * r);
      sculpt?.(out, th);
    },
    { wrap: wrapU, noLod: true },
  );
  // the profile is closed: weld the last row onto the first
  const pos = g.getAttribute('position');
  const cols = wrapU ? nu : nu + 1;
  const idx = Array.from(g.index!.array).map((i) => (i >= n * cols ? i - n * cols : i));
  g.setIndex(idx);
  const cen = new THREE.Vector3();
  let my = 0;
  for (const [, y] of loop) my += y / n;
  let mr = 0;
  for (const [r] of loop) mr += r / n;
  void pos;
  return orient(g, (p, out) => {
    const th = Math.atan2(p.x, p.z);
    return out.set(Math.sin(th) * mr, my, Math.cos(th) * mr).add(cen);
  });
}

interface Tag {
  /** a bone, or a per-vertex [boneA, boneB, weightB] */
  bone: number | ((p: V3) => [number, number, number]);
  tint: number;
  group?: number;
  part?: number;
  flex?: number | ((p: V3) => number);
  /** baked occlusion: a constant, a function, or the default height gradient */
  ao?: number | ((p: V3) => number);
}

/** Toy proportions: everything riding the head is built life-size, then scaled up about the neck. */
const HEAD_K = 1.1;
const headish = (b: number) => b === BONE.head || b >= BONE.jaw;
const hs = (v: V3) => v.clone().sub(NECK).multiplyScalar(HEAD_K).add(NECK);

const _tp = new THREE.Vector3();
function tag(g: THREE.BufferGeometry, t: Tag): THREE.BufferGeometry {
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const pos = g.getAttribute('position');
  const n = pos.count;
  const rig = new Float32Array(n * 4);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    _tp.fromBufferAttribute(pos, i);
    let a = 0;
    let b = 0;
    let w = 0;
    if (typeof t.bone === 'number') a = t.bone;
    else [a, b, w] = t.bone(_tp);
    if (w >= 0.999) {
      a = b;
      w = 0;
    }
    const hk = (headish(a) ? 1 - w : 0) + (w > 0 && headish(b) ? w : 0);
    if (hk > 0) {
      const k = 1 + (HEAD_K - 1) * hk;
      pos.setXYZ(i, NECK.x + (_tp.x - NECK.x) * k, NECK.y + (_tp.y - NECK.y) * k, NECK.z + (_tp.z - NECK.z) * k);
    }
    rig[i * 4] = a;
    rig[i * 4 + 1] = t.tint;
    rig[i * 4 + 2] = t.group ?? 0;
    rig[i * 4 + 3] = w > 0.001 ? b + Math.min(w, 0.995) : 0;
    const ao = t.ao === undefined ? 0.72 + 0.28 * sm(0.05, 1.5, _tp.y) : typeof t.ao === 'number' ? t.ao : t.ao(_tp);
    col[i * 3] = ao;
    col[i * 3 + 1] = t.part ?? 0;
    col[i * 3 + 2] = t.flex === undefined ? 0 : typeof t.flex === 'number' ? t.flex : t.flex(_tp);
  }
  g.setAttribute('aRig', new THREE.BufferAttribute(rig, 4));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (!g.index) g.setIndex(Array.from({ length: n }, (_, i) => i));
  return g;
}

/** Linear blend from bone a (above `hi`) to bone b (below `lo`) along y. */
const blendY = (a: number, b: number, lo: number, hi: number) => (p: V3): [number, number, number] => [a, b, 1 - sm(lo, hi, p.y)];

// --------------------------------------------------------------------- the head

const HC = V(0, 1.678, 0.004);
const HR = V(0.126, 0.142, 0.134);
const EYE_DIR = V(0.37, 0.06, 0.93).normalize();
const NOSE_DIR = V(0, -0.1, 1).normalize();
const MOUTH_DIR = V(0, -0.43, 0.9).normalize();
const _hd = new THREE.Vector3();

/** The sculpted skull: unit direction from the head centre -> surface point. */
function headAt(d: V3, out: V3): V3 {
  const low = sm(0.1, -0.95, d.y);
  const front = Math.max(0, d.z);
  let x = d.x * HR.x * (1 - 0.2 * low);
  let y = d.y * HR.y;
  let z = d.z * HR.z * (1 - 0.07 * front * front) * (d.z < 0 ? 1.05 : 1);
  y *= 1 - 0.035 * Math.max(0, d.y) ** 4;
  y += 0.008 * Math.max(0, -d.z) * Math.max(0, d.y);
  out.set(x, y, z);
  // chin, full cheeks, soft eye sockets under a gentle brow
  const ax = Math.abs(d.x);
  _hd.set(ax, d.y, d.z);
  const chin = gauss(_hd, V(0, -0.74, 0.67), 0.32);
  const cheek = gauss(_hd, V(0.62, -0.22, 0.75), 0.3);
  const socket = gauss(_hd, EYE_DIR, 0.17);
  const brow = gauss(_hd, V(0.34, 0.32, 0.88), 0.2);
  const nape = gauss(_hd, V(0, -0.72, -0.69), 0.4);
  const r = 0.006 * chin + 0.011 * cheek - 0.011 * socket + 0.006 * brow - 0.012 * nape;
  out.addScaledVector(d, r);
  out.z += 0.007 * chin;
  x = out.x;
  void x;
  return out.add(HC);
}

const _hu = new THREE.Vector3();
const _hv = new THREE.Vector3();
const _hp = new THREE.Vector3();
function dirOf(u: number, v: number, out: V3) {
  const th = u * TAU;
  const ph = v * Math.PI;
  return out.set(Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th));
}
/** Surface point and outward normal at head param (u around from the front, v from the crown). */
function headPN(u: number, v: number, p: V3, n: V3) {
  const e = 0.002;
  headAt(dirOf(u, v, _hd), p);
  headAt(dirOf(u + e, v, _hd), _hu).sub(p);
  headAt(dirOf(u, Math.min(v + e, 0.9999), _hd), _hv).sub(p);
  n.crossVectors(_hv, _hu).normalize();
  if (v < 0.001) n.set(0, 1, 0);
  if (n.dot(_hp.copy(p).sub(HC)) < 0) n.negate();
}
function headDirPN(d: V3, p: V3, n: V3) {
  const u = Math.atan2(d.x, d.z) / TAU;
  const v = Math.acos(clamp(d.y, -1, 1)) / Math.PI;
  headPN((u + 1) % 1, v, p, n);
}

/**
 * A shell over the skull (hair, beards, caps): lifted `thick(th, ph)` off the
 * skin. Where the thickness goes negative the shell sinks under the skin, so
 * every edge melts into the head like sculpted toy hair - no seams to see.
 */
function headShell(nu: number, nv: number, thick: (th: number, ph: number, d: V3) => number, shape?: (p: V3, th: number, ph: number, d: V3) => void, v0 = 0, v1 = 1): THREE.BufferGeometry {
  nu = lodU(nu, 8);
  nv = Math.max(4, Math.round(nv * LOD));
  const vals: number[] = [];
  const n = new THREE.Vector3();
  const d = new THREE.Vector3();
  const g = grid(
    nu,
    range(v0, v1, nv),
    (u, v, out) => {
      headPN(u, v, out, n);
      dirOf(u, v, d);
      const th = Math.atan2(d.x, d.z);
      const ph = v * Math.PI;
      const t = thick(th, ph, d);
      vals.push(t);
      // sunk edges only dip just under the skin, however negative the field gets
      out.addScaledVector(n, Math.max(t, -0.004));
      shape?.(out, th, ph, d);
    },
    { pole0: v0 <= 0, pole1: v1 >= 1, noLod: true },
  );
  // grid() evaluates the pole rows nu times and keeps the average; mirror that for the values
  const val = new Float32Array(g.getAttribute('position').count);
  let k = 0;
  let vi = 0;
  const rows = nv + 1;
  for (let j = 0; j < rows; j++) {
    const pole = (j === 0 && v0 <= 0) || (j === rows - 1 && v1 >= 1);
    if (pole) {
      let s = 0;
      for (let i = 0; i < nu; i++) s += vals[k++];
      val[vi++] = s / nu;
    } else for (let i = 0; i < nu; i++) val[vi++] = vals[k++];
  }
  return orient(keepWhere(g, val), about(HC));
}

/** Where the hair meets the skin: polar angle (from the crown) as a function of angle round from the face. */
const hairline = curve([
  [0, 0.7],
  [0.45, 0.78],
  [0.8, 0.98],
  [1.15, 1.2],
  [1.45, 1.22],
  [1.9, 1.62],
  [2.4, 1.92],
  [Math.PI, 2.02],
]);

// eye, mouth, nose and ear anchors (also baked into the shader)
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const ER = 0.031;
headDirPN(EYE_DIR, _p, _n);
const EYE = _p.clone().addScaledVector(_n, -ER * 0.42);
headDirPN(MOUTH_DIR, _p, _n);
const MOUTH = _p.clone().addScaledVector(_n, -0.004);
const MOUTH_N = _n.clone();
headDirPN(NOSE_DIR, _p, _n);
const NOSE = _p.clone();
const EAR = headAt(V(0.985, -0.06, -0.16).normalize(), new THREE.Vector3());
const CHIN_Y = headAt(V(0, -0.86, 0.5).normalize(), new THREE.Vector3()).y;
const JAW_HINGE = V(0, EYE.y - 0.035, -0.05);

// --------------------------------------------------------------------- the body

const torsoProf = curve([
  // y, half-width, half-depth, forward offset
  [0.79, 0.08, 0.07, 0.0],
  [0.81, 0.12, 0.096, 0.0],
  [0.86, 0.154, 0.108, 0.0],
  [0.93, 0.153, 0.104, 0.004],
  // a waist under the sash, the shirt bloused out over it, then a deep chest and square shoulders
  [0.99, 0.144, 0.1, 0.008],
  [1.06, 0.153, 0.108, 0.014],
  [1.13, 0.159, 0.112, 0.016],
  [1.2, 0.172, 0.119, 0.018],
  [1.27, 0.183, 0.124, 0.018],
  [1.34, 0.181, 0.116, 0.01],
  [1.4, 0.165, 0.098, 0.0],
  [1.445, 0.128, 0.084, -0.008],
  [1.485, 0.078, 0.064, -0.01],
  [1.505, 0.03, 0.03, -0.01],
]);
const TORSO_ROWS = [0.79, 0.8, 0.81, 0.83, 0.86, 0.9, 0.93, 0.96, 1.0, 1.04, 1.08, 1.13, 1.18, 1.23, 1.27, 1.31, 1.34, 1.37, 1.4, 1.42, 1.445, 1.465, 1.485, 1.5];

/** Torso surface (u round from the front, at height y), lifted `off` along the normal. */
function torsoAt(u: number, y: number, out: V3, off = 0): V3 {
  const [a, b, zc] = torsoProf(y);
  const th = u * TAU;
  const s = Math.sin(th);
  const c = Math.cos(th);
  const e = 2 / 2.6;
  const sx = Math.sign(s) * Math.abs(s) ** e;
  const cz = Math.sign(c) * Math.abs(c) ** e;
  let x = a * sx;
  let z = zc + b * cz;
  // chest and shoulder blades
  const chest = Math.exp(-(((y - 1.25) / 0.09) ** 2));
  if (c > 0) z += 0.01 * chest * Math.exp(-(((Math.abs(x) - 0.075) / 0.06) ** 2)) * c;
  else z -= 0.006 * chest * Math.exp(-(((Math.abs(x) - 0.08) / 0.06) ** 2)) * -c;
  // a seat to sit on
  const seat = Math.exp(-(((y - 0.85) / 0.06) ** 2));
  if (c < 0) z -= 0.012 * seat * -c;
  if (off) {
    const len = Math.hypot(x, z - zc) || 1;
    x += (x / len) * off;
    z += ((z - zc) / len) * off;
  }
  return out.set(x, y, z);
}

const armProf = curve([
  // y (down the arm), radius across, radius front-back: a capped shoulder, a bit of biceps, a sailor's forearm
  [1.468, 0.0, 0.0],
  [1.458, 0.038, 0.038],
  [1.435, 0.062, 0.062],
  [1.4, 0.071, 0.069],
  [1.35, 0.067, 0.065],
  [1.28, 0.061, 0.063],
  [1.2, 0.056, 0.059],
  [1.15, 0.051, 0.053],
  [1.125, 0.05, 0.051],
  [1.09, 0.053, 0.056],
  [1.04, 0.053, 0.056],
  [0.98, 0.045, 0.047],
  [0.93, 0.036, 0.039],
  [0.905, 0.033, 0.036],
  [0.893, 0.026, 0.029],
  [0.884, 0.0, 0.0],
]);
const ARM_ROWS = [1.468, 1.464, 1.458, 1.448, 1.435, 1.42, 1.4, 1.375, 1.35, 1.315, 1.28, 1.24, 1.2, 1.17, 1.15, 1.135, 1.125, 1.11, 1.09, 1.065, 1.04, 1.01, 0.98, 0.955, 0.93, 0.915, 0.905, 0.893, 0.884];

const legProf = curve([
  // y, radius across, radius front-back, z offset
  [0.958, 0.0, 0.0, 0],
  [0.945, 0.06, 0.06, 0],
  [0.91, 0.086, 0.094, 0],
  [0.85, 0.092, 0.1, -0.004],
  [0.75, 0.088, 0.093, 0.0],
  [0.65, 0.08, 0.084, 0.004],
  [0.56, 0.071, 0.074, 0.006],
  [0.5, 0.066, 0.069, 0.006],
  [0.44, 0.067, 0.072, -0.002],
  [0.37, 0.07, 0.077, -0.009],
  [0.29, 0.063, 0.068, -0.007],
  [0.2, 0.054, 0.056, -0.002],
  [0.13, 0.047, 0.049, 0],
  [0.1, 0.042, 0.044, 0],
  [0.085, 0.0, 0.0, 0],
]);
const LEG_ROWS = [0.958, 0.953, 0.945, 0.93, 0.91, 0.88, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.56, 0.53, 0.5, 0.47, 0.44, 0.4, 0.37, 0.33, 0.29, 0.25, 0.2, 0.16, 0.13, 0.11, 0.1, 0.085];

function thin<T>(rows: T[], res: number): T[] {
  if (res >= 0.95) return rows;
  const keep = Math.max(6, Math.round(rows.length * res));
  const out: T[] = [];
  for (let i = 0; i < keep; i++) out.push(rows[Math.round((i * (rows.length - 1)) / (keep - 1))]);
  return out;
}

// --------------------------------------------------------------------- build

/** Baked occlusion shared by the torso and legs so they read as one body: darker low down, in the crotch and the armpits. */
const bodyAO = (p: V3) => {
  const crotch = Math.exp(-((p.x / 0.05) ** 2) - (((p.y - 0.8) / 0.07) ** 2));
  const pit = sm(0.11, 0.17, Math.abs(p.x)) * Math.exp(-(((p.y - 1.3) / 0.06) ** 2));
  return (0.74 + 0.26 * sm(0.0, 1.4, p.y)) * (1 - 0.3 * crotch - 0.15 * pit);
};

/** Torso skinning: hips below the waist, chest above, and the shoulders follow the arms a little. */
const torsoBone = (p: V3): [number, number, number] => {
  const sh = 0.45 * sm(0.1, 0.165, Math.abs(p.x)) * sm(1.27, 1.38, p.y);
  if (sh > 0.001) return [BONE.chest, p.x > 0 ? BONE.armL : BONE.armR, sh];
  return [BONE.chest, BONE.hips, 1 - sm(0.93, 1.06, p.y)];
};

export function buildSailorGeometry(res = 1): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, t: Tag) => parts.push(tag(g, t));
  // the far level drops the trinkets nobody could see from up in the sky
  const far = res < 0.6;
  const hi = res >= 0.75;
  LOD = far ? res * 0.85 : res;
  // segments round each part: the far sculpt is a few dozen pixels tall at
  // most, where a 44-segment head is pure triangle cost, so it rounds every
  // part far more coarsely (the silhouette at that size is the same)
  const cols = res >= 0.95 ? 1 : far ? Math.max(0.2, res * 0.55) : 0.75;
  const seg = (n: number) => Math.max(far ? 4 : 6, Math.round(n * cols));
  const rowsOf = (rows: number[]) => thin(rows, far ? res * 0.75 : res);

  // ---- torso: one continuous skin from the seat to the collarbones, bending at the waist
  {
    const g = grid(seg(36), rowsOf(TORSO_ROWS), (u, y, out) => torsoAt(u, y, out), { pole0: true, pole1: true });
    orient(g, axisY(0, 0.008));
    add(g, { bone: torsoBone, tint: TINT.shirt, part: PART.torso, ao: bodyAO });
  }
  // neck, blending from the shoulders into the head
  {
    const nr = curve([[1.4, 0.066], [1.48, 0.06], [1.55, 0.057], [1.6, 0.058]]);
    const g = grid(seg(14), range(1.4, 1.6, hi ? 8 : 4), (u, y, out) => {
      const th = u * TAU;
      const [r] = nr(y);
      out.set(Math.sin(th) * r, y, Math.cos(th) * r * 0.95 - 0.006 + (y - 1.4) * 0.05);
    }, { wrap: true });
    orient(g, axisY(0, 0));
    add(g, { bone: blendY(BONE.head, BONE.chest, 1.465, 1.535), tint: TINT.skin, ao: (p) => 0.78 + 0.2 * sm(1.42, 1.56, p.y) });
  }

  // ---- arms: shoulder to wrist in one tube that bends at the elbow
  for (const s of [1, -1]) {
    const up = s > 0 ? BONE.armL : BONE.armR;
    const lo = s > 0 ? BONE.foreL : BONE.foreR;
    const g = grid(seg(16), rowsOf(ARM_ROWS), (u, y, out) => {
      const [rx, rz] = armProf(y);
      const th = u * TAU;
      const x = s * mix(HX, SH_X, sm(0.9, 1.4, y));
      // the forearm sits a touch forward of the upper arm
      const z = 0.006 * sm(1.15, 1.0, y);
      out.set(x + Math.sin(th) * rx, y, z + Math.cos(th) * rz);
    }, { pole0: true, pole1: true });
    orient(g, (p, out) => out.set(s * mix(HX, SH_X, sm(0.9, 1.4, p.y)), p.y, 0));
    add(g, { bone: blendY(up, lo, EL_Y - 0.035, EL_Y + 0.035), tint: TINT.sleeve, part: PART.arm, ao: (p) => 0.74 + 0.26 * sm(0.9, 1.4, p.y) });
    // a rolled sleeve at the elbow, buttoned cuffs at the wrist
    const roll = ring([[0.054, -0.012], [0.062, -0.004], [0.064, 0.008], [0.058, 0.016], [0.05, 0.01]], seg(14));
    roll.translate(s * mix(HX, SH_X, sm(0.9, 1.4, EL_Y - 0.03)), EL_Y - 0.03, 0.003);
    add(roll, { bone: lo, tint: TINT.sleeve, group: SHOWN(BIT.rolled), ao: 0.95 });
    const cuff = ring([[0.034, -0.02], [0.042, -0.016], [0.043, 0.012], [0.036, 0.016]], seg(14));
    cuff.translate(s * HX, 0.925, 0);
    add(cuff, { bone: lo, tint: TINT.forearm, group: SHOWN(BIT.cuffs), ao: 0.9 });
  }

  // ---- hands: a palm, four jointed fingers and a thumb
  for (const s of [1, -1]) {
    const lo = s > 0 ? BONE.foreL : BONE.foreR;
    const fb = s > 0 ? BONE.fingersL : BONE.fingersR;
    const hx = s * HX;
    // palm faces the thigh (-x for the left hand), knuckles toward the deck
    add(
      blob(V(hx, 0.866, 0.004), V(0.022, 0.044, 0.037), seg(12), seg(9), (d, p) => {
        // flat palm, rounded back, wider at the knuckles
        if (d.x * s < 0) p.x *= 0.72;
        p.z *= 1 + 0.12 * Math.max(0, -d.y);
      }),
      { bone: lo, tint: TINT.skin, ao: 0.95 },
    );
    if (hi) {
      const fz = [0.023, 0.008, -0.007, -0.021];
      const fl = [0.05, 0.055, 0.051, 0.041];
      const fr = [0.0098, 0.0102, 0.0096, 0.0086];
      for (let f = 0; f < 4; f++) {
        const len = fl[f];
        const x0 = hx - s * 0.002;
        const pts = [V(x0, KN_Y + 0.012, fz[f]), V(x0 - s * 0.002, KN_Y - len * 0.45, fz[f] * 0.95), V(x0 - s * 0.009, KN_Y - len, fz[f] * 0.92)];
        add(strand(pts, fr[f], fr[f] * 0.86, 7, 5), { bone: fb, tint: TINT.skin, ao: 0.92 });
      }
    } else {
      // a mitten of fingers
      add(blob(V(hx - s * 0.004, KN_Y - 0.024, 0.0), V(0.013, 0.032, 0.034), seg(10), seg(7), (d, p) => {
        p.x -= s * 0.006 * Math.max(0, -d.y);
      }), { bone: fb, tint: TINT.skin, ao: 0.92 });
    }
    add(strand([V(hx - s * 0.01, 0.884, 0.026), V(hx - s * 0.014, 0.86, 0.042), V(hx - s * 0.019, 0.838, 0.05)], 0.0118, 0.0096, hi ? 7 : 5, hi ? 5 : 3), { bone: lo, tint: TINT.skin, ao: 0.95 });
  }

  // ---- legs: hip to ankle in one tube that bends at the knee
  for (const s of [1, -1]) {
    const th = s > 0 ? BONE.thighL : BONE.thighR;
    const sh = s > 0 ? BONE.shinL : BONE.shinR;
    const legX = (y: number) => s * mix(HIP_X + 0.006, HIP_X, sm(0.1, 0.9, y));
    const leg = (rows: number[], top = true) =>
      grid(seg(16), rows, (u, y, out) => {
        const [rx, rz, zo] = legProf(y);
        const a = u * TAU;
        out.set(legX(y) + Math.sin(a) * rx, y, zo + Math.cos(a) * rz);
      }, { pole0: top, pole1: true });
    const g = leg(rowsOf(LEG_ROWS));
    orient(g, (p, out) => out.set(legX(p.y), p.y, 0));
    add(g, { bone: blendY(th, sh, KNEE_Y - 0.035, KNEE_Y + 0.04), tint: TINT.trousers, part: PART.leg, group: s > 0 ? 0 : HIDDEN(BIT.peg), ao: bodyAO });
    // breeches gathered below the knee
    const garter = ring([[0.061, -0.014], [0.07, -0.01], [0.073, 0.004], [0.069, 0.016], [0.061, 0.018]], seg(16));
    garter.translate(legX(KNEE_Y - 0.04), KNEE_Y - 0.045, 0.004);
    add(garter, { bone: sh, tint: TINT.trousers, group: s > 0 ? SHOWN(BIT.garters) : ONLY(BIT.garters, BIT.peg), ao: 0.85 });

    // shoes: a chunky rounded toe-cap on a sole with a little heel, buckled
    const x = legX(0.06);
    const shoeGroup = s > 0 ? HIDDEN(BIT.barefoot) : NEITHER(BIT.barefoot, BIT.peg);
    add(
      blob(V(x, 0.058, 0.03), V(0.05, 0.056, 0.104), seg(14), seg(9), (d, p) => {
        p.x *= 1 - 0.18 * Math.max(0, d.z) - 0.1 * Math.max(0, -d.z);
        p.y *= 1 - 0.42 * Math.max(0, d.z) * Math.max(0, d.y);
        if (p.y < -0.036) p.y = -0.036 + (p.y + 0.036) * 0.15;
        p.z += 0.02 * Math.max(0, d.z) * Math.max(0, -d.y);
      }),
      { bone: sh, tint: TINT.boots, group: shoeGroup, ao: (p) => 0.62 + 0.38 * sm(0.0, 0.11, p.y) },
    );
    add(
      blob(V(x, 0.014, 0.032), V(0.054, 0.016, 0.112), seg(14), seg(5), (d, p) => {
        p.x *= 1 - 0.15 * Math.max(0, d.z);
        if (p.y < -0.008) p.y = -0.008 - (p.y + 0.008) * 0.0;
      }),
      { bone: sh, tint: TINT.dark, group: shoeGroup, part: PART.sole, ao: 0.6 },
    );
    add(blob(V(x, 0.075, 0.095), V(0.022, 0.014, 0.01), 8, 5, (d, p) => {
      p.z -= Math.abs(d.y) * 0.006;
    }), { bone: sh, tint: TINT.trim, group: shoeGroup, ao: 1.05 });
    // bare feet with toes
    const footGroup = s > 0 ? SHOWN(BIT.barefoot) : ONLY(BIT.barefoot, BIT.peg);
    add(
      blob(V(x, 0.035, 0.035), V(0.043, 0.04, 0.098), seg(12), seg(8), (d, p) => {
        p.y *= 1 - 0.45 * Math.max(0, d.z) * Math.max(0, d.y);
        if (p.y < -0.03) p.y = -0.03 + (p.y + 0.03) * 0.15;
      }),
      { bone: sh, tint: TINT.skin, group: footGroup, ao: (p) => 0.7 + 0.3 * sm(0.0, 0.08, p.y) },
    );
    if (hi) {
      for (let t = 0; t < 5; t++) {
        const tx = x + s * (0.026 - t * 0.0125) * (t === 0 ? 1.0 : 1);
        const r = t === 0 ? 0.014 : 0.0105 - t * 0.0008;
        add(blob(V(tx, 0.016, 0.122 - t * t * 0.0025 - (t === 0 ? -0.004 : 0)), V(r, r * 0.8, r * 1.1), 7, 5), { bone: sh, tint: TINT.skin, group: footGroup, ao: 0.85 });
      }
    }
    // tall boots with a turned-down cuff (the shoe is their foot)
    const bootGroup = s > 0 ? SHOWN(BIT.boots) : ONLY(BIT.boots, BIT.peg);
    const shaft = grid(seg(16), range(0.07, 0.4, hi ? 8 : 4), (u, y, out) => {
      const [rx, rz, zo] = legProf(y);
      const a = u * TAU;
      const k = 1.0 + 0.012 / Math.max(rx, 0.03);
      out.set(legX(y) + Math.sin(a) * Math.max(rx * k, 0.052), y, zo + Math.cos(a) * Math.max(rz * k, 0.055) + 0.004);
    }, { wrap: true });
    orient(shaft, (p, out) => out.set(legX(p.y), p.y, 0));
    add(shaft, { bone: sh, tint: TINT.boots, group: bootGroup, ao: (p) => 0.7 + 0.25 * sm(0.07, 0.4, p.y) });
    const bc = ring([[0.07, 0.0], [0.08, 0.006], [0.087, 0.05], [0.089, 0.07], [0.081, 0.074], [0.074, 0.04]], seg(16), (p, a) => {
      p.z += 0.01 * Math.max(0, Math.cos(a)) * (p.y / 0.07);
      p.y += 0.012 * Math.max(0, Math.cos(a));
    });
    bc.translate(legX(0.36), 0.35, -0.004);
    add(bc, { bone: sh, tint: TINT.boots, group: bootGroup, ao: 0.95 });
  }
  // a peg leg in place of the right shin: thigh to a capped stump, then the timber
  {
    const x = -(HIP_X + 0.004);
    const stump = grid(seg(16), rowsOf(LEG_ROWS.filter((y) => y > KNEE_Y - 0.02)).concat([KNEE_Y - 0.035, KNEE_Y - 0.04]), (u, y, out) => {
      const [rx, rz, zo] = legProf(Math.max(y, KNEE_Y - 0.02));
      const k = y < KNEE_Y - 0.03 ? 0.0 : y < KNEE_Y - 0.015 ? 0.8 : 1;
      const a = u * TAU;
      out.set(-HIP_X + Math.sin(a) * rx * k, y, zo + Math.cos(a) * rz * k);
    }, { pole0: true, pole1: true });
    orient(stump, (p, out) => out.set(-HIP_X, p.y, 0));
    add(stump, { bone: BONE.thighR, tint: TINT.trousers, part: PART.leg, group: SHOWN(BIT.peg), ao: bodyAO });
    const peg = ring([[0.0, 0.0], [0.03, 0.006], [0.034, 0.03], [0.04, 0.22], [0.055, 0.4], [0.062, 0.48], [0.0, 0.5]], seg(10));
    peg.translate(x, 0, 0);
    add(peg, { bone: BONE.shinR, tint: TINT.wood, group: SHOWN(BIT.peg), ao: (p) => 0.75 + 0.2 * sm(0, 0.5, p.y) });
    for (const y of [0.05, 0.46]) {
      const band = ring([[0.034, -0.008], [0.042, -0.004], [0.042, 0.006], [0.034, 0.01]], seg(10));
      band.scale(y > 0.3 ? 1.5 : 1, 1, y > 0.3 ? 1.5 : 1);
      band.translate(x, y, 0);
      add(band, { bone: BONE.shinR, tint: TINT.metal, group: SHOWN(BIT.peg), ao: 1 });
    }
  }

  // ---- waist: sash with a knot and tails, belt and buckle, a pistol in the sash
  {
    const sash = grid(seg(36), range(0.95, 1.03, hi ? 4 : 2), (u, y, out) => {
      torsoAt(u, y, out, 0.012 + 0.004 * Math.sin(((y - 0.95) / 0.08) * Math.PI));
      // a few folds
      out.y += 0.004 * Math.sin(u * TAU * 7);
    }, { wrap: true });
    orient(sash, axisY(0, 0.008));
    add(sash, { bone: blendY(BONE.chest, BONE.hips, 0.93, 1.06), tint: TINT.sash, ao: 0.9 });
    const kx = 0.11;
    add(blob(V(kx, 0.985, 0.088), V(0.03, 0.026, 0.022), seg(9), seg(7)), { bone: BONE.hips, tint: TINT.sash, ao: 0.95 });
    add(strand([V(kx, 0.975, 0.1), V(kx + 0.012, 0.92, 0.11), V(kx + 0.008, 0.85, 0.11)], 0.016, 0.022, 6, 5, 0.45), { bone: BONE.hips, tint: TINT.sash, flex: (p) => sm(0.97, 0.86, p.y) * 0.8, ao: 0.9 });
    add(strand([V(kx - 0.01, 0.975, 0.1), V(kx - 0.02, 0.93, 0.105), V(kx - 0.012, 0.88, 0.1)], 0.014, 0.02, 6, 5, 0.45), { bone: BONE.hips, tint: TINT.sash, flex: (p) => sm(0.97, 0.88, p.y) * 0.8, ao: 0.9 });

    const belt = grid(seg(36), [0.912, 0.918, 0.948, 0.954], (u, y, out) => torsoAt(u, y, out, y > 0.915 && y < 0.95 ? 0.009 : 0.004), { wrap: true });
    orient(belt, axisY(0, 0.004));
    add(belt, { bone: BONE.hips, tint: TINT.leather, group: SHOWN(BIT.belt), ao: 0.85 });
    torsoAt(0, 0.933, _p, 0.012);
    add(ring([[0.012, -0.02], [0.024, -0.024], [0.03, 0.0], [0.024, 0.024], [0.012, 0.02]], seg(12)).rotateX(Math.PI / 2).scale(1.15, 0.85, 1).translate(0, 0.933, _p.z), { bone: BONE.hips, tint: TINT.trim, group: SHOWN(BIT.belt), ao: 1.05 });
    // flintlock: barrel down, grip angled out of the sash
    torsoAt(0.94, 1.0, _p, 0.03);
    add(strand([V(_p.x, 1.035, _p.z), V(_p.x + 0.004, 0.96, _p.z + 0.004), V(_p.x + 0.006, 0.88, _p.z + 0.006)], 0.011, 0.009, 7, 4), { bone: BONE.hips, tint: TINT.metal, group: SHOWN(BIT.pistol), ao: 1 });
    add(strand([V(_p.x, 1.03, _p.z), V(_p.x - 0.03, 1.065, _p.z + 0.004), V(_p.x - 0.07, 1.08, _p.z + 0.004)], 0.014, 0.019, 7, 4, 0.7), { bone: BONE.hips, tint: TINT.wood, group: SHOWN(BIT.pistol), ao: 1 });
    add(blob(V(_p.x - 0.074, 1.081, _p.z + 0.004), V(0.017, 0.02, 0.019), 8, 6), { bone: BONE.hips, tint: TINT.trim, group: SHOWN(BIT.pistol), ao: 1 });
  }

  // ---- open collar with laces, a neckerchief, a waistcoat
  {
    for (const sx of [-1, 1]) {
      // collar points folded over the shoulders
      const pts = [V(sx * 0.035, 1.47, 0.07), V(sx * 0.07, 1.455, 0.085), V(sx * 0.1, 1.43, 0.075)];
      add(strand(pts, 0.02, 0.012, 6, 4, 0.35), { bone: BONE.chest, tint: TINT.shirt, group: HIDDEN(BIT.coat), ao: 1 });
    }
    if (hi) {
      // lacing criss-crossing the V of the shirt
      for (let i = 0; i < 3; i++) {
        const y = 1.36 + i * 0.03;
        const w = 0.012 + (y - 1.33) * 0.3;
        torsoAt(0.0, y, _p, 0.002);
        add(strand([V(-w, y - 0.012, _p.z - 0.006), V(0, y, _p.z + 0.003), V(w, y + 0.012, _p.z - 0.006)], 0.0036, 0.0036, 4, 3), { bone: BONE.chest, tint: TINT.leather, group: NEITHER(BIT.coat, BIT.kerchief), ao: 0.95 });
      }
    }
    // neckerchief: a soft roll round the neck and a knot with two tails
    const kr = ring([[0.054, -0.016], [0.068, -0.012], [0.074, 0.004], [0.066, 0.018], [0.054, 0.016]], seg(16), (p, a) => {
      p.y -= 0.012 * Math.max(0, Math.cos(a));
      p.z += 0.01 * Math.max(0, Math.cos(a));
    });
    kr.translate(0, 1.47, -0.004);
    add(kr, { bone: BONE.chest, tint: TINT.sash, group: SHOWN(BIT.kerchief), ao: 0.95 });
    add(blob(V(0, 1.43, 0.085), V(0.024, 0.022, 0.016), 8, 6), { bone: BONE.chest, tint: TINT.sash, group: SHOWN(BIT.kerchief), ao: 0.95 });
    add(strand([V(0.006, 1.42, 0.09), V(0.02, 1.37, 0.1), V(0.016, 1.33, 0.11)], 0.014, 0.02, 6, 4, 0.4), { bone: BONE.chest, tint: TINT.sash, group: SHOWN(BIT.kerchief), flex: 0.5, ao: 0.9 });
    add(strand([V(-0.006, 1.42, 0.09), V(-0.022, 1.38, 0.1), V(-0.03, 1.35, 0.1)], 0.012, 0.017, 6, 4, 0.4), { bone: BONE.chest, tint: TINT.sash, group: SHOWN(BIT.kerchief), flex: 0.5, ao: 0.9 });

    // waistcoat: the torso again, a size up, open down the front with buttons, cut round the arms
    const vestT = (u: number, y: number) => {
      const th = Math.abs(((u + 0.5) % 1) - 0.5) * TAU; // 0 at the front
      const open = 0.24 + 0.32 * sm(1.18, 1.42, y);
      let t = Math.min(sm(open - 0.02, open + 0.05, th) * 2 - 1, sm(0.93, 0.97, y) * 2 - 1);
      // arm holes
      const hole = Math.exp(-(((th - Math.PI / 2) / 0.42) ** 2)) * sm(1.24, 1.32, y);
      t = Math.min(t, 1 - hole * 2.4);
      t = Math.min(t, sm(1.47, 1.43, y) * 2 - 1);
      return t;
    };
    const vals: number[] = [];
    const vest = grid(seg(36), rowsOf(TORSO_ROWS.filter((y) => y >= 0.9 && y <= 1.485)), (u, y, out) => {
      const t = vestT(u, y);
      vals.push(t);
      torsoAt(u, y, out, t > 0 ? 0.008 + 0.003 * t : 0.008 * (1 + t) - 0.006 * -t);
      if (y < 0.97) out.y -= 0.02 * sm(0.97, 0.93, y) * Math.max(0, Math.cos(u * TAU)); // pointed fronts
    }, { wrap: true });
    const vv = keepWhere(vest, new Float32Array(vals));
    orient(vv, axisY(0, 0.008));
    add(vv, { bone: torsoBone, tint: TINT.vest, group: SHOWN(BIT.vest), ao: (p) => 0.78 + 0.2 * sm(0.95, 1.35, p.y) });
    for (const y of [1.02, 1.09, 1.16, 1.23]) {
      const u = 0.035 + 0.06 * sm(1.18, 1.42, y);
      torsoAt(u, y, _p, 0.016);
      add(blob(_p.clone(), V(0.009, 0.009, 0.005), 7, 5), { bone: y > 1.0 ? BONE.chest : BONE.hips, tint: TINT.trim, group: SHOWN(BIT.vest), ao: 1.05 });
    }
  }

  // ---- the captain's coat: skirts that swing with the legs, lapels, cuffs, epaulettes, a jabot
  {
    const G = SHOWN(BIT.coat);
    const coatT = (u: number, y: number) => {
      const th = Math.abs(((u + 0.5) % 1) - 0.5) * TAU;
      const open = 0.16 + 0.42 * sm(1.08, 1.4, y);
      return Math.min(sm(open - 0.03, open + 0.04, th) * 2 - 1, sm(1.49, 1.45, y) * 2 - 1);
    };
    const vals: number[] = [];
    const body = grid(seg(40), rowsOf(TORSO_ROWS.filter((y) => y >= 0.93 && y <= 1.485)), (u, y, out) => {
      const t = coatT(u, y);
      vals.push(t);
      torsoAt(u, y, out, t > 0 ? 0.016 : 0.016 * (1 + t) - 0.01 * -t);
    }, { wrap: true });
    const bb = keepWhere(body, new Float32Array(vals));
    orient(bb, axisY(0, 0.008));
    add(bb, { bone: torsoBone, tint: TINT.coat, group: G, ao: (p) => 0.75 + 0.25 * sm(0.95, 1.4, p.y) });
    // skirts: a thick flared panel all round but the front, built as one closed loop (outside then inside)
    const th0 = 0.42;
    const span = TAU - th0 * 2;
    const skirtR = (y: number, th: number) => {
      const k = sm(0.99, 0.48, y);
      torsoAt(th / TAU, Math.max(y, 0.93), _p, 0.018);
      const fl = 0.035 + 0.075 * k;
      return _p.set(_p.x * (1 + fl / 0.16), y, _p.z * (1 + fl / 0.12) + 0.006 * k);
    };
    const nu = seg(40);
    const skirt = grid(nu, range(0.99, 0.47, hi ? 10 : 5), (u, y, out) => {
      // u: 0..0.5 outside left->right round the back, 0.5..1 back along the inside
      const w = u < 0.5 ? u * 2 : (1 - u) * 2;
      const th = th0 + w * span;
      const p = skirtR(y, th);
      const inner = u >= 0.5;
      const ci = Math.hypot(p.x, p.z) || 1;
      const thick = 0.009;
      const edge = Math.min(w, 1 - w) < 0.02 ? 0.5 : 1;
      out.copy(p);
      if (inner) {
        out.x -= (p.x / ci) * thick * edge;
        out.z -= (p.z / ci) * thick * edge;
      }
      // a vent and a little flare at the back
      out.x += 0.006 * Math.sin(th * 5) * sm(0.85, 0.5, y);
    }, { wrap: true });
    orient(skirt, (p, out) => {
      // outside faces out, inside faces in: aim at a ring just inside the cloth
      const th = Math.atan2(p.x, p.z);
      const q = skirtR(p.y, (th + TAU) % TAU);
      const c = Math.hypot(q.x, q.z) || 1;
      return out.set(q.x - (q.x / c) * 0.0045, p.y, q.z - (q.z / c) * 0.0045).multiplyScalar(1);
    });
    // swing: each side of the skirt follows its own thigh
    add(skirt, {
      bone: (p) => [BONE.hips, p.x > 0 ? BONE.thighL : BONE.thighR, 0.62 * sm(0.93, 0.55, p.y) * sm(0.0, 0.07, Math.abs(p.x) + 0.02)],
      tint: TINT.coat, group: G, flex: (p) => 0.25 * sm(0.8, 0.48, p.y), ao: (p) => 0.68 + 0.3 * sm(0.47, 0.95, p.y),
    });
    // gilded hem
    const hem: V3[] = [];
    for (let i = 0; i <= 24; i++) hem.push(skirtR(0.475, th0 + (i / 24) * span).clone());
    add(strand(hem, 0.0075, 0.0075, 5, hi ? 40 : 20), {
      bone: (p) => [BONE.hips, p.x > 0 ? BONE.thighL : BONE.thighR, 0.62 * sm(0.93, 0.55, p.y) * sm(0.0, 0.07, Math.abs(p.x) + 0.02)],
      tint: TINT.trim, group: G, flex: 0.25, ao: 0.9,
    });
    for (const sx of [-1, 1]) {
      // lapels: broad facings folded back along the opening
      const pts: V3[] = [];
      for (const y of [1.06, 1.16, 1.26, 1.35, 1.43]) {
        const open = 0.16 + 0.42 * sm(1.08, 1.4, y);
        torsoAt((sx * (open + 0.05)) / TAU, y, _p, 0.022);
        pts.push(_p.clone());
      }
      add(strand(pts, 0.022, 0.032, 6, hi ? 10 : 5, 0.25), { bone: blendY(BONE.chest, BONE.hips, 0.93, 1.06), tint: TINT.sash, group: G, ao: 0.95 });
      for (const y of [1.0, 1.08, 1.16, 1.24]) {
        const open = 0.16 + 0.42 * sm(1.08, 1.4, y);
        torsoAt((sx * (open + 0.12)) / TAU, y, _p, 0.024);
        add(blob(_p.clone(), V(0.011, 0.011, 0.006), 7, 5), { bone: y > 1.0 ? BONE.chest : BONE.hips, tint: TINT.trim, group: G, ao: 1.05 });
      }
      // big turned-back cuffs
      const cuff = ring([[0.04, -0.03], [0.054, -0.026], [0.06, 0.02], [0.062, 0.04], [0.05, 0.044], [0.044, 0.0]], seg(16), (p, a) => {
        p.y += 0.012 * Math.cos(a);
      });
      cuff.translate(sx * HX, 0.955, 0.004);
      add(cuff, { bone: sx > 0 ? BONE.foreL : BONE.foreR, tint: TINT.sash, group: G, ao: 0.95 });
      const lace = ring([[0.058, 0.04], [0.064, 0.044], [0.06, 0.05], [0.054, 0.046]], seg(16), (p, a) => {
        p.y += 0.012 * Math.cos(a);
      });
      lace.translate(sx * HX, 0.955, 0.004);
      add(lace, { bone: sx > 0 ? BONE.foreL : BONE.foreR, tint: TINT.trim, group: G, ao: 1 });
      // epaulettes: a gilded board and a fringe of bullion
      const arm = sx > 0 ? BONE.armL : BONE.armR;
      add(blob(V(sx * (SH_X - 0.004), SH_Y + 0.058, 0), V(0.05, 0.014, 0.046), seg(10), 5, (d, p) => {
        p.y += 0.01 * (1 - d.x * d.x);
      }), { bone: arm, tint: TINT.trim, group: G, ao: 1.05 });
      if (hi) {
        for (let i = 0; i < 11; i++) {
          const a = -1.25 + (i / 10) * 2.5;
          const fx = sx * (SH_X + 0.04 * Math.cos(a));
          const fz = 0.043 * Math.sin(a);
          add(strand([V(sx * SH_X + (fx - sx * SH_X) * 1.1, SH_Y + 0.055, fz * 1.05), V(sx * SH_X + (fx - sx * SH_X) * 1.3, SH_Y + 0.025, fz * 1.25)], 0.0055, 0.006, 4, 2), { bone: arm, tint: TINT.trim, group: G, ao: 0.95 });
        }
      } else {
        const fr = ring([[0.05, -0.03], [0.058, -0.026], [0.054, 0.0], [0.048, 0.0]], 10);
        add(fr.translate(sx * (SH_X + 0.004), SH_Y + 0.055, 0), { bone: arm, tint: TINT.trim, group: G, ao: 0.95 });
      }
    }
    // jabot: a cascade of lace at the throat
    for (let i = 0; i < 3; i++) {
      add(blob(V(0, 1.455 - i * 0.032, 0.105 + i * 0.006), V(0.034 - i * 0.004, 0.024, 0.016), seg(10), 6, (d, p) => {
        p.y += 0.006 * Math.sin(Math.atan2(d.x, d.z) * 6) * Math.max(0, -d.y);
      }), { bone: BONE.chest, tint: TINT.white, group: G, ao: 1 });
    }
    // a high collar at the back of the neck
    const col = ring([[0.075, 0.0], [0.086, 0.0], [0.09, 0.05], [0.082, 0.052]], seg(16), undefined, Math.PI * 0.55, Math.PI * 0.9);
    col.translate(0, 1.435, -0.01);
    add(col, { bone: BONE.chest, tint: TINT.coat, group: G, ao: 0.9 });
  }

  // ---- head ---------------------------------------------------------------
  const headBone = (p: V3): [number, number, number] => {
    // the chin and lower lip ride the jaw
    const w = sm(MOUTH.y - 0.004, MOUTH.y - 0.035, p.y) * sm(-0.02, 0.07, p.z - HC.z) * sm(0.11, 0.05, Math.abs(p.x));
    return [BONE.head, BONE.jaw, w];
  };
  {
    const nu = seg(44);
    const nv = seg(32);
    const g = grid(nu, range(0, 1, nv), (u, v, out) => headAt(dirOf(u, v, _hd), out), { pole0: true, pole1: true });
    orient(g, about(HC));
    add(g, { bone: headBone, tint: TINT.skin, part: PART.face, ao: (p) => 0.86 + 0.14 * sm(1.56, 1.7, p.y) });
  }
  // eyes: whites, a coloured iris with a pupil, a glint; lids that blink; lashes; brows
  for (const s of [1, -1]) {
    const E = V(s * EYE.x, EYE.y, EYE.z);
    add(blob(E, V(ER, ER, ER), seg(14), seg(10)), { bone: BONE.head, tint: TINT.white, ao: 1.0 });
    const axis = V(s * 0.06, 0.0, 1).normalize();
    const cap = (r: number, ang: number, tint: number, part = 0) => {
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), axis);
      const g = grid(seg(16), range(0, 1, hi ? 4 : 2), (u, v, out) => {
        const th = u * TAU;
        const ph = v * ang;
        out.set(Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th)).multiplyScalar(r).applyQuaternion(q).add(E);
      }, { pole0: true });
      orient(g, about(E));
      add(g, { bone: BONE.eyes, tint, part, ao: 1 });
    };
    cap(ER * 1.012, 0.64, TINT.pupil, PART.iris);
    cap(ER * 1.022, 0.3, TINT.dark);
    // the glint sits up and out, and swims with the eye
    const gl = V(s * 0.3, 0.42, 0.86).normalize();
    add(blob(E.clone().addScaledVector(gl, ER * 1.02), V(0.0058, 0.0058, 0.0058), 6, 5, (_d, p) => {
      p.addScaledVector(gl, -p.dot(gl) * 0.7);
    }), { bone: BONE.eyes, tint: TINT.shine, ao: 1 });
    // upper lid: a shell over the eyeball that rotates down to close (a lash line along its edge)
    const lidA = 1.75;
    const lid = grid(seg(16), range(0, 1, hi ? 7 : 4), (u, v, out) => {
      const th = u * TAU;
      const ph = v * lidA;
      out.set(Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th)).multiplyScalar(ER * 1.1).add(E);
    }, { pole0: true });
    orient(lid, about(E));
    add(lid, { bone: BONE.lids, tint: TINT.skin, ao: 0.97 });
    const lash: V3[] = [];
    for (let i = 0; i <= 12; i++) {
      const th = -1.25 + (i / 12) * 2.5;
      lash.push(V(Math.sin(lidA) * Math.sin(th), Math.cos(lidA), Math.sin(lidA) * Math.cos(th)).multiplyScalar(ER * 1.12).add(E));
    }
    add(strand(lash, 0.0032, 0.0032, 4, hi ? 12 : 6), { bone: BONE.lids, tint: TINT.dark, ao: 1 });
    if (hi) add(strand([lash[s > 0 ? 12 : 0], lash[s > 0 ? 12 : 0].clone().add(V(s * 0.008, 0.004, -0.004))], 0.003, 0.0012, 4, 2), { bone: BONE.lids, tint: TINT.dark, ao: 1 });
    // lower lid, fixed
    const low = grid(seg(16), range(0, 1, 3), (u, v, out) => {
      const th = u * TAU;
      const ph = v * 0.8;
      out.set(Math.sin(ph) * Math.sin(th), -Math.cos(ph), Math.sin(ph) * Math.cos(th)).multiplyScalar(ER * 1.07).add(E);
    }, { pole0: true });
    orient(low, about(E));
    add(low, { bone: BONE.head, tint: TINT.skin, ao: 0.95 });
    // brows, following the brow ridge
    const bp: V3[] = [];
    for (let i = 0; i <= 4; i++) {
      const k = i / 4;
      const d = V(s * mix(0.1, 0.52, k), mix(0.3, 0.33, k) + 0.07 * Math.sin(k * Math.PI), 1).normalize();
      headDirPN(d, _p, _n);
      bp.push(_p.clone().addScaledVector(_n, 0.0045));
    }
    add(strand(bp, 0.0085, 0.0055, 6, hi ? 8 : 4, 0.55), { bone: BONE.brows, tint: TINT.hair, ao: 0.95 });
  }
  // nose: a round button with soft nostril wings and a hint of a bridge
  {
    const c = NOSE.clone().add(V(0, -0.006, 0.012));
    add(blob(c, V(0.021, 0.023, 0.022), seg(12), seg(9), (d, p) => {
      p.z += 0.006 * Math.max(0, -d.y) * Math.max(0, d.z);
      p.y -= 0.004 * Math.max(0, d.z);
    }), { bone: BONE.head, tint: TINT.skin, part: PART.nose, ao: (p) => 0.9 + 0.1 * sm(c.y - 0.02, c.y + 0.02, p.y) });
    for (const s of [1, -1]) add(blob(c.clone().add(V(s * 0.016, -0.009, -0.007)), V(0.011, 0.009, 0.01), 8, 6), { bone: BONE.head, tint: TINT.skin, part: PART.nose, ao: 0.88 });
    if (hi) {
      headDirPN(V(0, 0.07, 1).normalize(), _p, _n);
      add(strand([_p.clone().addScaledVector(_n, -0.004), c.clone().add(V(0, 0.016, -0.006))], 0.007, 0.012, 6, 3), { bone: BONE.head, tint: TINT.skin, part: PART.nose, ao: 0.95 });
    }
  }
  // ears with a cupped bowl, gold earring on the left
  for (const s of [1, -1]) {
    const c = V(s * EAR.x, EAR.y, EAR.z);
    add(blob(c.clone().add(V(s * 0.004, 0, 0)), V(0.014, 0.036, 0.026), seg(10), seg(8), (d, p) => {
      // cup facing forward-out, a lobe at the bottom
      const outward = d.x * s;
      if (outward > 0) p.x -= s * 0.008 * Math.exp(-((d.y / 0.6) ** 2)) * outward;
      p.z += 0.006 * d.y;
      p.x += s * 0.004 * Math.max(0, d.y);
    }), { bone: BONE.head, tint: TINT.skin, part: PART.ear, ao: 0.85 });
  }
  {
    const hoop = new THREE.TorusGeometry(0.011, 0.0028, 5, 12).rotateY(Math.PI / 2);
    add(hoop.translate(EAR.x + 0.006, EAR.y - 0.034, EAR.z + 0.004), { bone: BONE.head, tint: TINT.trim, group: SHOWN(BIT.earring), ao: 1.1 });
  }
  // mouth: a dark smile that opens to show teeth and a tongue (squashed shut in the shader)
  {
    const M = MOUTH;
    const mb = (c: V3, r: V3, tint: number, part: number) =>
      add(blob(c, r, seg(12), seg(7), (d, p) => {
        p.addScaledVector(MOUTH_N, -Math.abs(d.x) * r.x * 0.35); // follow the curve of the face
      }), { bone: BONE.mouth, tint, part, ao: 1 });
    mb(M.clone(), V(0.031, 0.021, 0.008), TINT.mouth, PART.mouth);
    mb(M.clone().add(V(0, 0.012, 0.001)), V(0.021, 0.005, 0.007), TINT.white, PART.teeth);
    mb(M.clone().add(V(0, -0.012, 0.0)), V(0.019, 0.008, 0.007), TINT.tongue, PART.mouth);
  }

  // hair: a sculpted cap with a fringe of tufts and sideburns (bald pates keep a horseshoe)
  {
    const nu = seg(56);
    const nv = seg(34);
    const cap = headShell(nu, nv, (th, ph) => {
      const at = Math.abs(th);
      let line = hairline(at)[0];
      // a fringe of tufts across the brow
      line += 0.07 * Math.max(0, Math.cos(th * 11)) * sm(1.0, 0.3, at);
      // sideburns down in front of the ears
      const sb = Math.exp(-(((at - 1.3) / 0.11) ** 2));
      line = Math.max(line, mix(line, 1.82, sb));
      const t = 0.012 + 0.006 * Math.max(0, Math.cos(ph * 1.2)) + 0.0035 * Math.sin(th * 9 + ph * 6) * sm(0.2, 0.8, ph) - 0.004 * sb;
      return Math.min(t, (line - ph) * 0.12) - 0.002;
    });
    add(cap, { bone: BONE.head, tint: TINT.hair, group: HIDDEN(BIT.bald), part: PART.hair, ao: (p) => 0.8 + 0.2 * sm(1.66, 1.8, p.y) });
    const shoe = headShell(nu, nv, (th, ph) => {
      const at = Math.abs(th);
      const band = Math.min(ph - 1.18, 1.9 - ph) * 0.12;
      return Math.min(0.012, band, (at - 1.05) * 0.06) - 0.002;
    }, undefined, 0.3, 0.7);
    add(shoe, { bone: BONE.head, tint: TINT.hair, group: SHOWN(BIT.bald), part: PART.hair, ao: 0.85 });
  }
  // beard: thick at the chin, thinning up the jaw to the sideburns, leaving the mouth clear
  {
    const md = MOUTH_DIR;
    const bd = headShell(seg(48), seg(32), (th, ph, d) => {
      const at = Math.abs(th);
      if (at > 1.62) return -1;
      // top edge: high on the cheeks, dipping under the mouth
      const top = mix(1.5, 2.08, sm(1.35, 0.15, at));
      const hole = Math.exp(-d.distanceToSquared(md) / (0.17 * 0.17)) * 0.03;
      const neck = 2.78 - 0.35 * sm(0.6, 1.5, at);
      let t = 0.014 + 0.018 * Math.exp(-(((ph - 2.4) / 0.35) ** 2)) * sm(1.1, 0.0, at);
      t = Math.min(t, (ph - top) * 0.1, (neck - ph) * 0.1) - hole;
      return t + 0.0035 * Math.sin(th * 13 + ph * 7) - 0.002;
    }, (p, th, ph) => {
      // the chin tuft hangs down a little
      p.y -= 0.025 * Math.exp(-(((ph - 2.5) / 0.3) ** 2)) * sm(0.9, 0.0, Math.abs(th));
    }, 0.35, 1);
    add(bd, { bone: headBone, tint: TINT.hair, group: SHOWN(BIT.beard), part: PART.beard, ao: (p) => 0.78 + 0.18 * sm(1.5, 1.62, p.y) });
  }
  // moustache: two swept wings from under the nose
  for (const s of [1, -1]) {
    const pts: V3[] = [];
    for (let i = 0; i <= 4; i++) {
      const k = i / 4;
      const d = V(s * mix(0.02, 0.36, k), mix(-0.26, -0.4, k * k), 1).normalize();
      headDirPN(d, _p, _n);
      pts.push(_p.clone().addScaledVector(_n, 0.006 - 0.003 * k));
    }
    pts[4].y -= 0.008;
    add(strand(pts, 0.0145, 0.006, 7, hi ? 8 : 4, 0.7), { bone: BONE.head, tint: TINT.hair, group: SHOWN(BIT.moustache), part: PART.hair, ao: 0.92 });
  }
  // ponytail tied with a ribbon; a long mane down the back
  {
    const nape = V(0, 1.6, -0.115);
    add(blob(nape.clone().add(V(0, 0, -0.012)), V(0.022, 0.018, 0.02), 8, 6), { bone: BONE.head, tint: TINT.sash, group: SHOWN(BIT.ponytail), ao: 0.95 });
    add(strand([nape.clone().add(V(0, 0.01, 0)), V(0, 1.55, -0.15), V(0.004, 1.46, -0.16), V(0.0, 1.39, -0.148)], 0.026, 0.012, 7, hi ? 8 : 4), {
      bone: blendY(BONE.head, BONE.chest, 1.45, 1.56), tint: TINT.hair, group: SHOWN(BIT.ponytail), part: PART.hair, flex: (p) => sm(1.58, 1.4, p.y) * 0.8, ao: 0.9,
    });
    const mane = headShell(seg(40), seg(14), (th, ph) => {
      const at = Math.abs(th);
      return Math.min(0.016, (at - 1.2) * 0.08, (2.25 - ph) * 0.2 + 0.02) - 0.002;
    }, (p, _th, ph) => {
      // pull the lower edge down past the collar
      const k = sm(1.7, 2.35, ph);
      p.y -= k * 0.2;
      p.z -= k * 0.03;
      p.x *= 1 + k * 0.15;
    }, 0.45, 0.82);
    add(mane, { bone: blendY(BONE.head, BONE.chest, 1.44, 1.56), tint: TINT.hair, group: SHOWN(BIT.longhair), part: PART.hair, flex: (p) => sm(1.56, 1.4, p.y) * 0.6, ao: (p) => 0.75 + 0.2 * sm(1.4, 1.7, p.y) });
  }
  // eyepatch with its strap
  {
    const E = V(EYE.x, EYE.y, EYE.z);
    add(blob(E.clone().add(V(0.003, 0.002, 0.026)), V(0.033, 0.03, 0.012), seg(10), 6, (d, p) => {
      p.z -= 0.01 * (d.x * d.x + d.y * d.y);
    }), { bone: BONE.head, tint: TINT.dark, group: SHOWN(BIT.patch), ao: 0.95 });
    // the strap: a great circle from the patch up across the brow and round the back
    const sn = new THREE.Vector3().crossVectors(EYE_DIR, V(-0.8, 0.58, -0.15).normalize()).normalize();
    const strap = headShell(seg(52), seg(32), (_th, _ph, d) => Math.min(0.007, (0.05 - Math.abs(d.dot(sn))) * 0.2) - 0.001);
    add(strap, { bone: BONE.head, tint: TINT.dark, group: SHOWN(BIT.patch), ao: 0.9 });
  }

  // ---- hats
  {
    // tricorn: a domed crown, a stiff brim turned up into three points, gold lace, a plume
    const crown = blob(V(0, 1.765, -0.006), V(0.136, 0.098, 0.144), seg(16), seg(10), (d, p) => {
      if (d.y < -0.4) p.y = -0.4 * 0.098 + (p.y + 0.4 * 0.098) * 0.3;
      p.y += 0.008 * d.y * d.y;
    });
    add(crown, { bone: BONE.head, tint: TINT.hat, group: HAT.tricorn, ao: (p) => 0.8 + 0.2 * sm(1.74, 1.85, p.y) });
    const tri = (p: V3, th: number) => {
      const k = Math.cos(3 * th);
      const r = Math.hypot(p.x, p.z);
      const f = 1 + 0.15 * k;
      p.x *= f;
      p.z *= f;
      // the turned-up walls dip toward each point
      p.y -= Math.max(0, k) * 0.24 * Math.max(0, r - 0.1);
      p.y += 0.012 * (1 - Math.max(0, k));
    };
    const brim = ring([[0.115, 1.738], [0.19, 1.74], [0.226, 1.752], [0.232, 1.79], [0.226, 1.806], [0.216, 1.8], [0.21, 1.765], [0.188, 1.755], [0.115, 1.752]], seg(54), tri);
    brim.translate(0, 0, -0.008);
    add(brim, { bone: BONE.head, tint: TINT.hat, group: HAT.tricorn, ao: (p) => 0.75 + 0.25 * sm(1.74, 1.8, p.y) });
    const lace = ring([[0.22, 1.8], [0.229, 1.8], [0.231, 1.812], [0.222, 1.814]], seg(54), tri);
    lace.translate(0, 0, -0.008);
    add(lace, { bone: BONE.head, tint: TINT.trim, group: HAT.tricorn, ao: 1.05 });
    // a sweeping plume for the swagger
    add(strand([V(0.11, 1.8, -0.06), V(0.17, 1.88, -0.13), V(0.13, 1.93, -0.24), V(0.03, 1.89, -0.3)], 0.034, 0.008, 6, hi ? 12 : 6, 0.4), { bone: BONE.head, tint: TINT.plume, group: SHOWN(BIT.plume), flex: (p) => sm(-0.1, -0.3, p.z) * 0.6, ao: 1 });

    // bandana: knotted at the back, spotted, two tails in the wind
    const ban = headShell(seg(52), seg(30), (th, ph) => {
      const at = Math.abs(th);
      const line = mix(0.94, 1.95, sm(0.0, Math.PI, at)) - 0.18 * Math.exp(-(((at - 1.55) / 0.35) ** 2));
      return Math.min(0.034 + 0.004 * Math.cos(ph), (line - ph) * 0.18) - 0.002;
    });
    add(ban, { bone: BONE.head, tint: TINT.hat, group: HAT.bandana, part: PART.bandana, ao: (p) => 0.82 + 0.18 * sm(1.65, 1.82, p.y) });
    // a folded hem along the edge
    const bandLine = (th: number) => {
      const at = Math.abs(th);
      return mix(0.94, 1.95, sm(0.0, Math.PI, at)) - 0.18 * Math.exp(-(((at - 1.55) / 0.35) ** 2));
    };
    const hemPts: V3[] = [];
    for (let i = 0; i <= 40; i++) {
      const th = -Math.PI + (i / 40) * TAU;
      const ph = bandLine(th) - 0.1;
      headDirPN(V(Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th)), _p, _n);
      hemPts.push(_p.clone().addScaledVector(_n, 0.026));
    }
    add(strand(hemPts, 0.012, 0.012, 6, hi ? 44 : 22, 0.6), { bone: BONE.head, tint: TINT.hat, group: HAT.bandana, part: PART.bandana, ao: 0.9 });
    const knot = V(0.02, 1.645, -0.14);
    add(blob(knot, V(0.03, 0.026, 0.024), 9, 7), { bone: BONE.head, tint: TINT.hat, group: HAT.bandana, part: PART.bandana, ao: 0.9 });
    add(strand([knot.clone(), V(0.05, 1.6, -0.17), V(0.08, 1.51, -0.18)], 0.02, 0.026, 6, hi ? 6 : 3, 0.4), { bone: BONE.head, tint: TINT.hat, group: HAT.bandana, part: PART.bandana, flex: (p) => sm(1.63, 1.5, p.y), ao: 0.88 });
    add(strand([knot.clone(), V(-0.01, 1.59, -0.175), V(-0.03, 1.53, -0.19)], 0.018, 0.023, 6, hi ? 6 : 3, 0.4), { bone: BONE.head, tint: TINT.hat, group: HAT.bandana, part: PART.bandana, flex: (p) => sm(1.63, 1.52, p.y), ao: 0.88 });

    // knit cap: a ribbed watch cap with a rolled brim and a pom-pom
    const kn = headShell(seg(52), seg(26), (th, ph) => {
      const at = Math.abs(th);
      const line = mix(0.98, 1.4, sm(0.0, Math.PI, at));
      return Math.min(0.03 + 0.03 * Math.max(0, Math.cos(ph * 1.6)), (line - ph) * 0.2) - 0.002;
    }, (p) => {
      p.y += 0.012 * sm(1.75, 1.85, p.y);
    }, 0, 0.55);
    add(kn, { bone: BONE.head, tint: TINT.hat, group: HAT.knit, part: PART.knit, ao: (p) => 0.85 + 0.15 * sm(1.7, 1.85, p.y) });
    const kroll: V3[] = [];
    for (let i = 0; i <= 32; i++) {
      const th = (i / 32) * TAU;
      const at = Math.abs(((th + Math.PI) % TAU) - Math.PI);
      const ph = mix(0.98, 1.4, sm(0.0, Math.PI, at)) - 0.06;
      headDirPN(V(Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th)), _p, _n);
      kroll.push(_p.clone().addScaledVector(_n, 0.022));
    }
    add(strand(kroll, 0.02, 0.02, 7, hi ? 40 : 20), { bone: BONE.head, tint: TINT.hat, group: HAT.knit, part: PART.knit, ao: 0.88 });
    add(blob(V(0, 1.885, -0.03), V(0.036, 0.034, 0.036), seg(12), seg(9), (d, p) => {
      p.multiplyScalar(1 + 0.12 * Math.sin(d.x * 17) * Math.sin(d.y * 15) * Math.sin(d.z * 13));
    }), { bone: BONE.head, tint: TINT.stripe, group: HAT.knit, ao: 1 });

    // straw hat: woven crown and a wide, gently drooping brim with a ribbon
    const sc = ring([[0.0, 1.88], [0.08, 1.878], [0.112, 1.865], [0.122, 1.8], [0.128, 1.75], [0.12, 1.75], [0.114, 1.8], [0.104, 1.86], [0.0, 1.868]], seg(24));
    sc.translate(0, 0, -0.008);
    add(sc, { bone: BONE.head, tint: TINT.hat, group: HAT.straw, part: PART.straw, ao: (p) => 0.85 + 0.15 * sm(1.75, 1.88, p.y) });
    const sb = ring([[0.11, 1.756], [0.2, 1.738], [0.27, 1.71], [0.286, 1.702], [0.284, 1.712], [0.27, 1.722], [0.2, 1.75], [0.11, 1.766]], seg(36), (p, a) => {
      p.y -= 0.012 * Math.cos(2 * a) * Math.max(0, Math.hypot(p.x, p.z) - 0.15) * 6;
    });
    sb.translate(0, 0, -0.008);
    add(sb, { bone: BONE.head, tint: TINT.hat, group: HAT.straw, part: PART.straw, ao: 0.95 });
    const rb = ring([[0.123, 1.752], [0.128, 1.752], [0.124, 1.79], [0.12, 1.79]], seg(24));
    rb.translate(0, 0, -0.008);
    add(rb, { bone: BONE.head, tint: TINT.sash, group: HAT.straw, ao: 0.95 });
  }

  // ---- the parrot: a scarlet macaw on the left shoulder
  {
    const G = SHOWN(BIT.parrot);
    const [px, py, pz] = [PARROT.x, PARROT.y, PARROT.z];
    const B = V(px, py + 0.045, pz);
    add(blob(B, V(0.034, 0.055, 0.036), seg(12), seg(9), (d, p) => {
      p.z += 0.012 * d.y; // leaning forward
      p.multiplyScalar(1 - 0.18 * Math.max(0, -d.y));
    }), { bone: BONE.chest, tint: TINT.parrot, group: G, part: PART.parrot, ao: 1 });
    const H = V(px, py + 0.112, pz + 0.018);
    add(blob(H, V(0.03, 0.03, 0.032), seg(12), seg(9)), { bone: BONE.chest, tint: TINT.parrot, group: G, part: PART.parrotHead, ao: 1.05 });
    // a hooked beak
    add(strand([H.clone().add(V(0, 0.008, 0.026)), H.clone().add(V(0, 0.002, 0.048)), H.clone().add(V(0, -0.02, 0.05))], 0.014, 0.004, 6, hi ? 6 : 3), { bone: BONE.chest, tint: TINT.beak, group: G, part: PART.parrotHead, ao: 1 });
    add(blob(H.clone().add(V(0, -0.012, 0.03)), V(0.011, 0.008, 0.012), 7, 5), { bone: BONE.chest, tint: TINT.dark, group: G, part: PART.parrotHead, ao: 1 });
    for (const sx of [-1, 1]) {
      add(blob(H.clone().add(V(sx * 0.021, 0.006, 0.012)), V(0.011, 0.012, 0.01), 7, 5), { bone: BONE.chest, tint: TINT.white, group: G, part: PART.parrotHead, ao: 1.05 });
      add(blob(H.clone().add(V(sx * 0.028, 0.006, 0.014)), V(0.005, 0.006, 0.005), 6, 4), { bone: BONE.chest, tint: TINT.dark, group: G, part: PART.parrotHead, ao: 1 });
      // folded wings with a golden shoulder band and feather tips
      const wing = blob(B.clone().add(V(sx * 0.03, -0.004, -0.008)), V(0.014, 0.05, 0.03), seg(10), seg(8), (d, p) => {
        p.z -= 0.012 * Math.max(0, -d.y);
        p.y -= 0.012 * Math.max(0, -d.y) * (0.5 + 0.5 * Math.cos(d.z * 9));
      });
      wing.rotateX(-0.2);
      add(wing, { bone: BONE.chest, tint: TINT.wing, group: G, part: PART.wing, ao: 0.95 });
      add(blob(B.clone().add(V(sx * 0.034, 0.022, 0.004)), V(0.011, 0.016, 0.02), 7, 5), { bone: BONE.chest, tint: TINT.trim, group: G, part: PART.wing, ao: 1 });
      // feet gripping the shoulder
      add(strand([B.clone().add(V(sx * 0.014, -0.05, 0.006)), B.clone().add(V(sx * 0.016, -0.068, 0.02))], 0.006, 0.004, 4, 2), { bone: BONE.chest, tint: TINT.dark, group: G, ao: 0.9 });
    }
    // long tail feathers down the back
    for (const [dx, len] of [[0, 0.24], [0.012, 0.2], [-0.012, 0.19]] as [number, number][]) {
      add(strand([B.clone().add(V(dx * 0.5, -0.03, -0.03)), B.clone().add(V(dx, -0.11, -0.06)), B.clone().add(V(dx * 1.4, -0.03 - len, -0.075))], 0.012, 0.004, 5, hi ? 6 : 3, 0.35), {
        bone: BONE.chest, tint: dx === 0 ? TINT.parrot : TINT.wing, group: G, part: PART.parrot, flex: 0.4, ao: 0.95,
      });
    }
  }

  // ---- held props, built round the right fist (the grip runs front-to-back through it)
  const hx = -HX + 0.012;
  const hy = 0.818;
  const R = BONE.foreR;
  {
    // rammer & sponge: a long staff along the forearm, sheepskin head out front of the fist
    add(strand([V(hx, hy + 0.55, 0.006), V(hx, hy - 1.05, 0.006)], 0.016, 0.016, 7, 2), { bone: R, tint: TINT.wood, group: PROP.rammer, ao: 1 });
    add(blob(V(hx, hy - 1.11, 0.006), V(0.05, 0.08, 0.05), seg(10), 7, (d, p) => {
      p.multiplyScalar(1 + 0.06 * Math.sin(d.x * 11) * Math.sin(d.y * 9 + d.z * 7));
    }), { bone: R, tint: TINT.cloth, group: PROP.rammer, ao: 0.9 });
    add(ring([[0.019, -0.03], [0.026, -0.026], [0.026, 0.02], [0.019, 0.024]], 10).translate(hx, hy - 1.02, 0.006), { bone: R, tint: TINT.metal, group: PROP.rammer, ao: 1 });

    // spyglass: brass tube in three draws, a leather grip, glinting lens out front
    const sg = ring([[0.0, 0.07], [0.022, 0.07], [0.024, 0.04], [0.026, -0.08], [0.03, -0.09], [0.03, -0.24], [0.036, -0.25], [0.036, -0.38], [0.04, -0.39], [0.04, -0.41], [0.034, -0.41], [0.0, -0.405]], seg(14));
    sg.rotateX(Math.PI / 2).rotateY(Math.PI);
    sg.translate(hx, hy, 0.004);
    add(sg, { bone: R, tint: TINT.trim, group: PROP.spyglass, ao: 1 });
    add(ring([[0.0275, -0.03], [0.033, -0.03], [0.033, 0.03], [0.0275, 0.03]], seg(14)).rotateX(Math.PI / 2).translate(hx, hy, -0.17), { bone: R, tint: TINT.leather, group: PROP.spyglass, ao: 0.95 });
    add(blob(V(hx, hy, -0.405), V(0.033, 0.033, 0.006), 10, 4), { bone: R, tint: TINT.shine, group: PROP.spyglass, ao: 1 });

    // swab: a pole down past the fist, a shaggy head of rope yarns
    add(strand([V(hx, hy + 0.3, 0.006), V(hx, hy - 1.1, 0.006)], 0.015, 0.015, 7, 2), { bone: R, tint: TINT.wood, group: PROP.mop, ao: 1 });
    const yarn = seg(11);
    for (let i = 0; i < yarn; i++) {
      const a = (i / yarn) * TAU;
      const r = 0.03;
      add(strand([V(hx + Math.cos(a) * 0.01, hy - 1.08, 0.006 + Math.sin(a) * 0.01), V(hx + Math.cos(a) * r * 2, hy - 1.18, 0.006 + Math.sin(a) * r * 2), V(hx + Math.cos(a) * r * 3.4, hy - 1.24, 0.006 + Math.sin(a) * r * 3.2)], 0.014, 0.009, 4, 3), { bone: R, tint: TINT.cloth, group: PROP.mop, flex: 0.3, ao: 0.9 });
    }

    // spade: an ash shaft with a crutch grip, the iron blade dished and worn bright at the edge
    add(strand([V(hx, hy + 0.36, 0.006), V(hx, hy - 0.78, 0.006)], 0.016, 0.016, 7, 2), { bone: R, tint: TINT.wood, group: PROP.spade, ao: 1 });
    add(strand([V(hx - 0.075, hy + 0.4, 0.006), V(hx, hy + 0.37, 0.006), V(hx + 0.075, hy + 0.4, 0.006)], 0.014, 0.014, 6, 3), { bone: R, tint: TINT.wood, group: PROP.spade, ao: 1 });
    const sb = new THREE.BoxGeometry(0.19, 0.27, 0.012, 6, 5, 1);
    const sp = sb.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i);
      const y = sp.getY(i);
      // taper to a rounded point, and dish the face
      const t = (0.135 - y) / 0.27;
      sp.setX(i, x * (1 - 0.35 * t * t));
      sp.setZ(i, sp.getZ(i) - 0.035 * (1 - (x / 0.095) ** 2));
    }
    sb.computeVertexNormals();
    add(sb.translate(hx, hy - 0.91, 0.006), { bone: R, tint: TINT.metal, group: PROP.spade, ao: 1 });
    add(new THREE.CylinderGeometry(0.024, 0.02, 0.09, seg(10)).translate(hx, hy - 0.75, 0.006), { bone: R, tint: TINT.metal, group: PROP.spade, ao: 1 });

    // bucket hanging from its bail
    const bk = ring([[0.0, 0.0], [0.072, 0.0], [0.086, 0.004], [0.098, 0.17], [0.104, 0.172], [0.104, 0.18], [0.092, 0.18], [0.084, 0.02], [0.0, 0.02]], seg(14));
    bk.translate(hx, hy - 0.27, 0.006);
    add(bk, { bone: R, tint: TINT.wood, group: PROP.bucket, ao: (p) => 0.8 + 0.2 * sm(hy - 0.27, hy - 0.1, p.y) });
    for (const y of [0.04, 0.14]) add(ring([[0.088 + y * 0.07, -0.008], [0.094 + y * 0.07, -0.006], [0.094 + y * 0.07, 0.006], [0.088 + y * 0.07, 0.008]], seg(14)).translate(hx, hy - 0.27 + y, 0.006), { bone: R, tint: TINT.metal, group: PROP.bucket, ao: 1 });
    add(new THREE.CylinderGeometry(0.086, 0.086, 0.004, seg(14)).translate(hx, hy - 0.115, 0.006), { bone: R, tint: TINT.stripe, group: PROP.bucket, ao: 1 });
    const bail: V3[] = [];
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * (i / 10);
      bail.push(V(hx, hy - 0.1 + Math.sin(a) * 0.095, 0.006 + Math.cos(a) * 0.1));
    }
    add(strand(bail, 0.005, 0.005, 4, hi ? 10 : 6), { bone: R, tint: TINT.metal, group: PROP.bucket, ao: 1 });

    // cutlass: a curved blade sloping out ahead of the fist, a gilded basket and pommel
    const dir = V(0, -0.5, 0.866);
    const side = V(1, 0, 0);
    const up = new THREE.Vector3().crossVectors(dir, side).normalize();
    const blade = grid(hi ? 4 : 3, range(0, 1, hi ? 12 : 6), (u, v, out) => {
      // cross-section: a lens, thick at the back edge
      const a = u * TAU;
      const w = 0.026 * (1 - 0.65 * v ** 3) * (v > 0.97 ? 0.3 : 1);
      const th = 0.005 * (1 - 0.5 * v);
      const along = 0.04 + v * 0.62;
      out.set(hx, hy, 0.006)
        .addScaledVector(dir, along)
        .addScaledVector(up, Math.cos(a) * w + 0.06 * v * v)
        .addScaledVector(side, Math.sin(a) * th);
    }, { pole1: true });
    orient(blade, (p, out) => {
      const k = clamp(p.clone().sub(V(hx, hy, 0.006)).dot(dir), 0, 1);
      return out.set(hx, hy, 0.006).addScaledVector(dir, k).addScaledVector(up, 0.06 * ((k - 0.04) / 0.62) ** 2);
    });
    add(blade, { bone: R, tint: TINT.metal, group: PROP.cutlass, ao: 1.1 });
    const gc = V(hx, hy, 0.006).addScaledVector(dir, 0.04);
    add(blob(gc, V(0.024, 0.024, 0.008), 10, 6), { bone: R, tint: TINT.trim, group: PROP.cutlass, ao: 1 });
    const basket: V3[] = [];
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI;
      basket.push(V(hx, hy, 0.006).addScaledVector(dir, 0.04 - Math.sin(a) * 0.1).addScaledVector(up, -0.04 - Math.sin(a) * 0.012).addScaledVector(side, (Math.cos(a) * 0.0) - 0.018));
    }
    add(strand(basket, 0.005, 0.005, 4, hi ? 10 : 5), { bone: R, tint: TINT.trim, group: PROP.cutlass, ao: 1 });
    add(blob(V(hx, hy, 0.006).addScaledVector(dir, -0.065), V(0.014, 0.014, 0.014), 8, 6), { bone: R, tint: TINT.trim, group: PROP.cutlass, ao: 1 });

    // linstock: a staff with a glowing slow-match coiled at its tip
    add(strand([V(hx, hy + 0.2, 0.006), V(hx, hy - 0.95, 0.006)], 0.013, 0.012, 6, 2), { bone: R, tint: TINT.wood, group: PROP.linstock, ao: 1 });
    add(strand([V(hx, hy - 0.94, 0.006), V(hx + 0.03, hy - 0.98, 0.006), V(hx + 0.02, hy - 1.02, 0.006)], 0.008, 0.008, 4, 3), { bone: R, tint: TINT.metal, group: PROP.linstock, ao: 1 });
    add(blob(V(hx + 0.02, hy - 1.03, 0.006), V(0.012, 0.016, 0.012), 7, 5), { bone: R, tint: TINT.glow, group: PROP.linstock, ao: 1 });

    // fiddle: tucked along the left forearm toward the chin, the bow in the right hand
    {
      const fx = HX - 0.03;
      const body = blob(V(fx, 1.06, 0.065), V(0.055, 0.1, 0.022), seg(12), seg(9), (d, p) => {
        // waisted violin outline
        p.x *= 1 - 0.28 * Math.exp(-((d.y / 0.3) ** 2));
        p.z *= 1 - 0.2 * Math.abs(d.x);
      });
      add(body, { bone: BONE.foreL, tint: TINT.wood, group: PROP.fiddle, ao: 1.05 });
      add(strand([V(fx, 0.96, 0.08), V(fx + 0.002, 0.84, 0.075)], 0.01, 0.009, 5, 2), { bone: BONE.foreL, tint: TINT.dark, group: PROP.fiddle, ao: 1 });
      add(blob(V(fx + 0.002, 0.83, 0.075), V(0.012, 0.018, 0.012), 6, 5), { bone: BONE.foreL, tint: TINT.dark, group: PROP.fiddle, ao: 1 });
      add(blob(V(fx, 1.03, 0.088), V(0.03, 0.032, 0.004), 8, 4), { bone: BONE.foreL, tint: TINT.dark, group: PROP.fiddle, ao: 1 });
      add(strand([V(hx, hy, -0.04), V(hx, hy + 0.01, 0.56)], 0.005, 0.004, 4, 2), { bone: R, tint: TINT.wood, group: PROP.fiddle, ao: 1 });
      add(strand([V(hx + 0.012, hy - 0.016, -0.03), V(hx + 0.012, hy - 0.006, 0.54)], 0.0025, 0.0025, 3, 2), { bone: R, tint: TINT.white, group: PROP.fiddle, ao: 1 });
    }

    // tankard of grog: the handle in the fist, a foaming head
    {
      const c = V(hx + 0.07, hy, 0.006);
      const mug = ring([[0.0, -0.065], [0.05, -0.065], [0.054, -0.06], [0.05, 0.05], [0.054, 0.058], [0.05, 0.062], [0.044, 0.05], [0.0, 0.05]], seg(14));
      mug.rotateX(Math.PI / 2).translate(c.x, c.y, c.z);
      add(mug, { bone: R, tint: TINT.wood, group: PROP.mug, ao: 0.95 });
      for (const z of [-0.04, 0.03]) add(ring([[0.052, -0.006], [0.057, -0.004], [0.057, 0.004], [0.052, 0.006]], seg(14)).rotateX(Math.PI / 2).translate(c.x, c.y, c.z + z), { bone: R, tint: TINT.metal, group: PROP.mug, ao: 1 });
      add(blob(c.clone().add(V(0, 0, 0.055)), V(0.05, 0.05, 0.022), seg(10), 6, (d, p) => {
        p.z += 0.006 * Math.sin(d.x * 9) * Math.sin(d.y * 7);
      }), { bone: R, tint: TINT.cloth, group: PROP.mug, ao: 1.08 });
      const h: V3[] = [];
      for (let i = 0; i <= 8; i++) {
        const a = (i / 8) * Math.PI;
        h.push(V(c.x - 0.05 - Math.sin(a) * 0.035, c.y, c.z - 0.035 + Math.cos(a) * 0.04));
      }
      add(strand(h, 0.009, 0.009, 5, hi ? 8 : 4), { bone: R, tint: TINT.wood, group: PROP.mug, ao: 0.95 });
    }
  }
  // clay pipe clenched in the corner of the mouth
  {
    const m = MOUTH.clone().add(V(-0.026, 0.002, 0.004));
    add(strand([m, m.clone().add(V(-0.03, -0.018, 0.07)), m.clone().add(V(-0.04, -0.022, 0.1))], 0.0045, 0.0055, 5, hi ? 5 : 3), { bone: BONE.head, tint: TINT.cloth, group: PROP.pipe, ao: 1 });
    const bowl = m.clone().add(V(-0.042, -0.006, 0.108));
    add(ring([[0.0, -0.022], [0.013, -0.02], [0.016, 0.01], [0.012, 0.012], [0.0, -0.004]], 9).translate(bowl.x, bowl.y, bowl.z), { bone: BONE.head, tint: TINT.cloth, group: PROP.pipe, ao: 1 });
    add(blob(bowl.clone().add(V(0, 0.006, 0)), V(0.01, 0.003, 0.01), 7, 3), { bone: BONE.head, tint: TINT.glow, group: PROP.pipe, ao: 1 });
  }

  for (const g of parts) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'aRig'].includes(k)) g.deleteAttribute(k);
  const merged = mergeGeometries(parts, false)!;
  merged.computeBoundingSphere();
  LOD = 1;
  return merged;
}

// --------------------------------------------------------------------- shader

const f = (n: number) => n.toFixed(4);
// the head's anchors as they end up after the toy scale
const S_EYE = hs(EYE);
const S_MOUTH = hs(MOUTH);
const S_NOSE = hs(NOSE);
const S_EAR = hs(EAR);
const S_CHIN_Y = hs(V(0, CHIN_Y, 0)).y;
const S_JAW = hs(JAW_HINGE);
const v3 = (v: V3) => `vec3(${f(v.x)}, ${f(v.y)}, ${f(v.z)})`;

const GLSL_CREW = /* glsl */ `
attribute vec4 aRig;
attribute vec4 aPose0;
attribute vec4 aPose1;
attribute vec4 aPose2;
attribute vec4 aPose3;
attribute vec4 aPose4;
attribute vec4 aPose5;
attribute vec4 aStyle;

vec3 crX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, c * v.y - s * v.z, s * v.y + c * v.z); }
vec3 crY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z); }
vec3 crZ(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c * v.x - s * v.y, s * v.x + c * v.y, v.z); }
float crHash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

bool crewShown(float g) {
  int gi = int(g + 0.5);
  if (gi == 0) return true;
  if (gi < 10) return gi == int(aStyle.y + 0.5);
  int fl = int(aStyle.w + 0.5);
  if (gi >= 3000) { int a = (gi - 3000) / 32; int b = (gi - 3000) - a * 32; return (fl & (1 << a)) != 0 && (fl & (1 << b)) == 0; }
  if (gi >= 1000) { int a = (gi - 1000) / 32; int b = (gi - 1000) - a * 32; return (fl & ((1 << a) | (1 << b))) == 0; }
  if (gi >= 50) return gi == int(aStyle.z + 0.5);
  if (gi < 30) return (fl & (1 << (gi - 10))) != 0;
  return (fl & (1 << (gi - 30))) == 0;
}

// how far shut the eyes are right now (0 open .. 1 closed)
float crewBlink() {
#ifdef CREW_ANIM
  float seed = aStyle.x * 0.6180339;
  float ph = fract(uTime * (0.24 + fract(seed * 7.0) * 0.1) + seed);
  float b = smoothstep(0.0, 0.018, ph) * (1.0 - smoothstep(0.03, 0.06, ph));
  // now and then a double blink
  float ph2 = fract(ph + 0.075);
  b = max(b, step(0.6, fract(seed * 3.7)) * smoothstep(0.0, 0.018, ph2) * (1.0 - smoothstep(0.03, 0.06, ph2)));
  return b;
#else
  return 0.0;
#endif
}

// The small bones move in their own frame, then hand over to the limb they ride.
void crewLocal(inout int b, inout vec3 p, inout vec3 n) {
  if (b == 11 || b == 12) {
    // fingers curl toward the palm: the middle joint, then the knuckles
    bool L = b == 11;
    float curl = L ? aPose4.y : aPose4.z;
    float sgn = L ? -1.0 : 1.0;
    float hx = L ? ${f(HX)} : -${f(HX)};
    if (p.y < ${f(FM_Y)}) {
      vec3 mj = vec3(hx - sgn * -0.004, ${f(FM_Y)}, 0.0);
      float a2 = sgn * curl * 1.5;
      p = mj + crZ(p - mj, a2); n = crZ(n, a2);
    }
    vec3 kj = vec3(hx, ${f(KN_Y)}, 0.0);
    float a1 = sgn * (curl * 1.3 + 0.12);
    p = kj + crZ(p - kj, a1); n = crZ(n, a1);
    b = L ? 4 : 6;
    return;
  }
  if (b < 13) return;
  float open = clamp(aPose4.w, 0.0, 1.0);
  float brow = aPose5.x;
  if (b == 13) {
    // the jaw drops as the mouth opens
    vec3 hj = ${v3(S_JAW)};
    float a = open * 0.16;
    p = hj + crX(p - hj, a); n = crX(n, a);
  } else if (b == 14) {
    // raised in surprise, knitted down at the middle in anger
    float inner = 1.0 - smoothstep(0.03, 0.08, abs(p.x));
    p.y += brow > 0.0 ? brow * 0.011 : brow * (0.002 + 0.011 * inner);
    p.z += min(brow, 0.0) * 0.004 * inner;
  } else if (b == 15) {
    // upper lids: rest a little lowered, squint when cross, fly open when startled, blink
    float rest = -0.6 + max(-brow, 0.0) * 0.28 - max(brow, 0.0) * 0.28;
    float a = mix(rest, 0.62, crewBlink());
    vec3 e = vec3(sign(p.x) * ${f(S_EYE.x)}, ${f(S_EYE.y)}, ${f(S_EYE.z)});
    p = e + crX(p - e, a); n = crX(n, a);
  } else if (b == 16) {
    float gx = aPose5.y;
    float gy = aPose5.z;
#ifdef CREW_ANIM
    // little saccades: the eyes flick to a new spot every second or two
    float seed = aStyle.x * 0.7548;
    float slot = floor(uTime * (0.55 + fract(seed * 5.0) * 0.4) + seed * 9.0);
    gx += (crHash(slot + seed) - 0.5) * 0.5;
    gy += (crHash(slot * 1.7 + seed) - 0.5) * 0.25;
#endif
    vec3 e = vec3(sign(p.x) * ${f(S_EYE.x)}, ${f(S_EYE.y)}, ${f(S_EYE.z)});
    p = e + crY(crX(p - e, -clamp(gy, -0.5, 0.5)), clamp(gx, -0.6, 0.6)); n = crY(crX(n, -clamp(gy, -0.5, 0.5)), clamp(gx, -0.6, 0.6));
  } else if (b == 17) {
    // the mouth: a thin line at rest, a wide "O" when shouting; corners lift into a grin
    float smile = aPose5.w;
    vec3 m = ${v3(S_MOUTH)};
    int part = int(color.g + 0.5);
    float k = part == ${PART.teeth} ? open : mix(0.24, 1.0, open);
    p.y = m.y + (p.y - m.y) * k;
    if (part == ${PART.teeth}) p.z -= (1.0 - open) * 0.01;
    float dx = (p.x - m.x) / 0.034;
    p.x = m.x + (p.x - m.x) * mix(1.0, 0.82, open);
    p.y += smile * (0.011 * dx * dx - 0.004) * (1.0 - 0.5 * open);
    if (p.y < m.y) p.y -= open * 0.004;
  }
  b = 2;
}

// Forward kinematics, leaf to root, on both the position and its normal.
vec3 crewFK(int b, vec3 p, inout vec3 n) {
  crewLocal(b, p, n);
  if (b == 4 || b == 6) {
    bool L = b == 4;
    float e = L ? aPose1.w : aPose2.z;
    vec3 pv = vec3(L ? ${f(SH_X)} : -${f(SH_X)}, ${f(EL_Y)}, 0.0);
    p = pv + crX(p - pv, -e); n = crX(n, -e);
  }
  if (b >= 3 && b <= 6) {
    bool L = b <= 4;
    float sx = L ? aPose1.y : aPose2.x;
    float sz = L ? aPose1.z : -aPose2.y;
    vec3 pv = vec3(L ? ${f(SH_X)} : -${f(SH_X)}, ${f(SH_Y)}, 0.0);
    p = pv + crZ(crX(p - pv, -sx), sz); n = crZ(crX(n, -sx), sz);
  }
  if (b == 2) {
    vec3 pv = vec3(0.0, ${f(NECK.y)}, 0.0);
    p = pv + crY(crX(crZ(p - pv, aPose4.x), aPose0.w), aPose1.x); n = crY(crX(crZ(n, aPose4.x), aPose0.w), aPose1.x);
  }
  if (b >= 1 && b <= 6) {
    vec3 pv = vec3(0.0, ${f(SPINE.y)}, 0.0);
    p = pv + crY(crZ(crX(p - pv, aPose0.x), aPose0.z), aPose0.y); n = crY(crZ(crX(n, aPose0.x), aPose0.z), aPose0.y);
  }
  if (b == 8 || b == 10) {
    bool L = b == 8;
    float k = L ? aPose3.x : aPose3.z;
    vec3 pv = vec3(L ? ${f(HIP_X)} : -${f(HIP_X)}, ${f(KNEE_Y)}, 0.0);
    p = pv + crX(p - pv, k); n = crX(n, k);
  }
  if (b >= 7 && b <= 10) {
    bool L = b <= 8;
    float a = L ? aPose2.w : aPose3.y;
    vec3 pv = vec3(L ? ${f(HIP_X)} : -${f(HIP_X)}, ${f(HIP_Y)}, 0.0);
    p = pv + crX(p - pv, -a); n = crX(n, -a);
  }
  return p;
}

void crewDeform(inout vec3 p, inout vec3 n) {
  if (!crewShown(aRig.z)) { p = vec3(0.0); return; }
  int ba = int(aRig.x + 0.5);
  float bw = fract(aRig.w);
  int bb = int(floor(aRig.w) + 0.5);
  int part = int(color.g + 0.5);
  float seed = aStyle.x * 0.6180339 + 0.37;
  // every face a little different: nose, ears, jaw, beard and belly from the sailor's seed
  if (part == ${PART.nose}) {
    float k = 0.82 + 0.5 * crHash(seed * 1.31);
    vec3 r = ${v3(S_NOSE)};
    p = r + (p - r) * vec3(k, mix(1.0, k, 0.7), k);
  } else if (part == ${PART.ear}) {
    float k = 0.85 + 0.35 * crHash(seed * 2.17);
    vec3 r = vec3(sign(p.x) * ${f(S_EAR.x - 0.01)}, ${f(S_EAR.y)}, ${f(S_EAR.z)});
    p = r + (p - r) * k;
  } else if (part == ${PART.beard}) {
    float k = 0.6 + 1.1 * crHash(seed * 3.71);
    if (p.y < ${f(S_CHIN_Y)}) p.y = ${f(S_CHIN_Y)} + (p.y - ${f(S_CHIN_Y)}) * k;
  }
  if (ba == 2 || ba >= 13) {
    float jaw = (crHash(seed * 4.33) - 0.5) * 0.2;
    p.x *= 1.0 + jaw * smoothstep(${f(S_EYE.y)}, ${f(S_CHIN_Y)}, p.y);
  }
  if (ba <= 1) {
    // a belly on some, and the slow rise and fall of breathing
    float belly = max(0.0, crHash(seed * 5.9) - 0.5) * 2.0;
    float bz = smoothstep(-0.02, 0.09, p.z) * exp(-pow((p.y - 1.03) / 0.13, 2.0));
    p.z += belly * 0.045 * bz;
    p.x *= 1.0 + belly * 0.1 * exp(-pow((p.y - 1.0) / 0.15, 2.0));
#ifdef CREW_ANIM
    float br = sin(uTime * (1.4 + fract(seed * 3.0) * 0.5) + seed * 20.0);
    float w = exp(-pow((p.y - 1.24) / 0.12, 2.0));
    p.z += br * 0.006 * w * smoothstep(-0.05, 0.08, p.z);
    p.x *= 1.0 + br * 0.008 * w;
#endif
  }
#ifdef CREW_ANIM
  // cloth and hair stirring in the breeze
  float fl = color.b;
  if (fl > 0.0) {
    float t = uTime * 2.2 + seed * 17.0;
    p.x += fl * 0.012 * sin(t + p.y * 9.0);
    p.z += fl * 0.014 * sin(t * 1.3 + p.y * 7.0 + 1.3) - fl * 0.006;
  }
  // the parrot looks about, bobs, and every so often flaps its wings
  if (part == ${PART.wing} || part == ${PART.parrotHead} || part == ${PART.parrot}) {
    vec3 pc = ${v3(PARROT)};
    float t = uTime + seed * 13.0;
    if (part == ${PART.wing}) {
      float burst = step(fract(t * 0.11), 0.06);
      float side = sign(p.x - pc.x);
      float a = burst * (0.6 + 0.6 * sin(t * 34.0)) * side;
      vec3 hinge = pc + vec3(side * 0.03, 0.07, 0.0);
      p = hinge + crZ(p - hinge, a); n = crZ(n, a);
    }
    if (part == ${PART.parrotHead}) {
      vec3 neck = pc + vec3(0.0, 0.09, 0.0);
      float yaw = sin(t * 0.7) * 0.7 + sin(t * 1.9) * 0.25;
      float nod = max(0.0, sin(t * 2.3)) * 0.25 * step(0.5, fract(t * 0.21));
      float tilt = sin(t * 0.43) * 0.3;
      p = neck + crY(crX(crZ(p - neck, tilt), nod), yaw); n = crY(crX(crZ(n, tilt), nod), yaw);
    }
    p.y += abs(sin(t * 1.3)) * 0.005;
  }
#endif
  vec3 na = n;
  vec3 pa = crewFK(ba, p, na);
  if (bw > 0.001) {
    vec3 nb = n;
    vec3 pb = crewFK(bb, p, nb);
    pa = mix(pa, pb, bw);
    na = normalize(mix(na, nb, bw));
  }
  p = pa;
  n = na;
  p.y += aPose3.w;
}
`;

/** Palette rows: one per crewman, TINT_SLOTS texels wide. a > 0 glows, a < 0 patterns with the stripe slot. */
export function createCrewMaterial(palette: THREE.DataTexture): { material: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial } {
  const material = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0, envMapIntensity: 0.85 }), { clouds: true });
  const base = material.onBeforeCompile;
  const uniforms = { uCrewPalette: { value: palette } };
  material.onBeforeCompile = (shader, r) => {
    base.call(material, shader, r);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <uv_pars_vertex>',
        `#include <uv_pars_vertex>
#define CREW_ANIM
${GLSL_CREW}
uniform highp sampler2D uCrewPalette;
varying float vCrewGhost;
varying vec3 vCrewB;
varying vec3 vCrewC;
varying vec3 vCrewStripe;
varying vec3 vCrewRest;
varying vec4 vCrewInfo;
varying vec3 vCrewCloth;`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
  vec3 crewPos = position;
  crewDeform(crewPos, objectNormal);`,
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n  transformed = crewPos;`)
      .replace(
        '#include <color_vertex>',
        `{
    int row = int(aStyle.x + 0.5);
    int tint = int(aRig.y + 0.5);
    int part = int(color.g + 0.5);
    vec4 pal = texelFetch(uCrewPalette, ivec2(tint, row), 0);
    vCrewGhost = texelFetch(uCrewPalette, ivec2(${TINT.ghost}, row), 0).r;
    vec3 stripe = texelFetch(uCrewPalette, ivec2(${TINT.stripe}, row), 0).rgb;
    float ao = color.r;
    vColor = vec4(pal.rgb * ao, 1.0);
    vCrewStripe = stripe * ao;
    // second and third colours for the painted seams
    vec3 b = pal.rgb;
    vec3 c = pal.rgb;
    if (part == ${PART.torso}) { b = texelFetch(uCrewPalette, ivec2(${TINT.trousers}, row), 0).rgb; c = texelFetch(uCrewPalette, ivec2(${TINT.skin}, row), 0).rgb; }
    else if (part == ${PART.arm}) { b = texelFetch(uCrewPalette, ivec2(${TINT.forearm}, row), 0).rgb; c = texelFetch(uCrewPalette, ivec2(${TINT.shirt}, row), 0).rgb; }
    else if (part == ${PART.leg}) b = texelFetch(uCrewPalette, ivec2(${TINT.shin}, row), 0).rgb;
    vCrewB = b * ao;
    vCrewC = c * ao;
    vCrewRest = position;
    float cPat = part == ${PART.arm} ? max(-texelFetch(uCrewPalette, ivec2(${TINT.shirt}, row), 0).a, 0.0) : 0.0;
    vCrewInfo = vec4(float(part), max(-pal.a, 0.0), max(pal.a, 0.0), float(tint) + 64.0 * floor(cPat + 0.5));
    // which stretches of the limbs are cloth (and crease) rather than bare skin
    vec3 sk = texelFetch(uCrewPalette, ivec2(${TINT.skin}, row), 0).rgb;
    vCrewCloth = vec3(
      step(0.002, distance(texelFetch(uCrewPalette, ivec2(${TINT.sleeve}, row), 0).rgb, sk)),
      step(0.002, distance(texelFetch(uCrewPalette, ivec2(${TINT.forearm}, row), 0).rgb, sk)),
      step(0.002, distance(texelFetch(uCrewPalette, ivec2(${TINT.shin}, row), 0).rgb, sk)));
  }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vCrewB;
varying vec3 vCrewC;
varying vec3 vCrewStripe;
varying vec3 vCrewRest;
varying vec4 vCrewInfo;
varying vec3 vCrewCloth;
varying float vCrewGhost;
float crewEdge(float d) { float w = fwidth(d) * 0.75 + 1e-4; return smoothstep(-w, w, d); }
float crewNoise(vec3 p) { return sin(p.x * 1.7 + sin(p.y * 2.3 + p.z * 1.1)) * sin(p.y * 1.3 + sin(p.z * 2.9 + p.x * 0.7)); }
// Folds in the cloth, as a height (metres) over the rest pose: the shirt bloused over the sash,
// pull lines from the armpits, creases at the elbows and behind the knees, the drape of the
// trousers and their gathered hems, pleats in a captain's coat skirts.
float crewFolds(vec3 p, int part, int tint) {
  float h = 0.0;
  float ang = atan(p.x, p.z);
  float wob = crewNoise(p * 31.0);
  if (part == ${PART.torso}) {
    if (p.y > 0.955) {
      float blouse = smoothstep(0.955, 1.0, p.y) * smoothstep(1.2, 1.03, p.y);
      h += blouse * 0.0042 * sin(ang * 9.0 + wob * 1.4);
      float pit = exp(-pow((p.y - 1.29) / 0.075, 2.0)) * smoothstep(0.07, 0.15, abs(p.x));
      h += pit * 0.0026 * sin((abs(p.x) * 0.8 - p.y) * 85.0 + wob);
    } else {
      h += 0.0022 * sin(ang * 13.0 + wob) * smoothstep(0.86, 0.94, p.y);
    }
  } else if (part == ${PART.arm}) {
    float ax = sign(p.x) * mix(${f(HX)}, ${f(SH_X)}, smoothstep(0.9, 1.4, p.y));
    float a = atan(p.z, p.x - ax);
    float cloth = p.y > 1.3 ? 1.0 : p.y > ${f(EL_Y - 0.03)} ? vCrewCloth.x : vCrewCloth.y;
    float elb = exp(-pow((p.y - ${f(EL_Y)}) / 0.065, 2.0));
    h += elb * 0.0042 * sin(p.y * 150.0 + sin(a * 2.0 + wob) * 1.6);
    h += 0.0022 * sin(a * 3.0 + p.y * 28.0 + wob) * smoothstep(1.42, 1.22, p.y) * smoothstep(1.13, 1.2, p.y);
    h += 0.002 * smoothstep(1.0, 0.94, p.y) * sin(p.y * 190.0 + a) * vCrewCloth.y;
    h *= cloth;
  } else if (part == ${PART.leg}) {
    float lx = sign(p.x) * ${f(HIP_X)};
    float a = atan(p.z, p.x - lx);
    float cloth = p.y > ${f(KNEE_Y - 0.045)} ? 1.0 : vCrewCloth.z;
    float knee = exp(-pow((p.y - ${f(KNEE_Y)}) / 0.075, 2.0));
    h += knee * 0.0038 * sin(p.y * 115.0 + sin(a * 1.5) * 2.0 + wob);
    h += 0.0028 * sin(a * 4.0 + p.y * 7.0 + wob * 0.8) * smoothstep(0.95, 0.55, p.y);
    h += 0.0024 * smoothstep(0.26, 0.12, p.y) * sin(a * 7.0 + p.y * 40.0);
    // the crotch pulls into a few short diagonals
    h += 0.002 * exp(-pow((p.y - 0.84) / 0.05, 2.0)) * sin((p.y + abs(p.x - lx)) * 120.0);
    h *= cloth;
  } else if (tint == ${TINT.coat} && p.y < 0.99) {
    h += 0.0055 * sin(ang * 11.0 + wob * 0.5) * smoothstep(0.98, 0.7, p.y);
  } else if (tint == ${TINT.vest} || tint == ${TINT.coat}) {
    h += 0.0018 * sin(ang * 7.0 + p.y * 30.0 + wob);
  }
  return h;
}
// screen-space bump: tilts the normal by the slope of a height field, given its change over one
// pixel across and one down (taken per pixel, not per 2x2 quad, so the folds don't come out blocky)
vec3 crewBump(vec3 pos, vec3 n, float hx, float hy) {
  vec3 sx = dFdx(pos);
  vec3 sy = dFdy(pos);
  vec3 r1 = cross(sy, n);
  vec3 r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 g = sign(det) * (hx * r1 + hy * r2);
  return normalize(abs(det) * n - g);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  int crPart = int(vCrewInfo.x + 0.5);
  int crTint = int(mod(vCrewInfo.w + 0.5, 64.0));
  float crCPat = floor((vCrewInfo.w + 0.5) / 64.0);
  vec3 crP = vCrewRest;
  if (vCrewInfo.y > 0.0) {
    if (crPart == ${PART.bandana}) {
      // polka dots
      vec2 q = vec2(atan(crP.x, crP.z) * 4.0, crP.y * 34.0);
      vec2 cell = fract(q) - 0.5;
      diffuseColor.rgb = mix(diffuseColor.rgb, vCrewStripe, crewEdge(0.2 - length(cell)));
    } else {
      float st = abs(fract(crP.y * vCrewInfo.y) - 0.5) * 2.0;
      diffuseColor.rgb = mix(diffuseColor.rgb, vCrewStripe, crewEdge(st - 0.5));
    }
  }
  if (crPart == ${PART.torso}) {
    // trousers below the sash, skin in the open V of the collar
    diffuseColor.rgb = mix(diffuseColor.rgb, vCrewB, crewEdge(0.955 - crP.y));
    float vee = 0.008 + (crP.y - 1.33) * 0.45;
    diffuseColor.rgb = mix(diffuseColor.rgb, vCrewC, crewEdge(vee - abs(crP.x)) * crewEdge(crP.z) * crewEdge(crP.y - 1.33));
  } else if (crPart == ${PART.arm}) {
    // the shirt shoulder, the sleeve, then the forearm below the elbow
    diffuseColor.rgb = mix(diffuseColor.rgb, vCrewB, crewEdge(${f(EL_Y - 0.03)} - crP.y));
    vec3 shoulder = vCrewC;
    if (crCPat > 0.0) shoulder = mix(shoulder, vCrewStripe, crewEdge(abs(fract(crP.y * crCPat) - 0.5) * 2.0 - 0.5));
    diffuseColor.rgb = mix(diffuseColor.rgb, shoulder, crewEdge(crP.y - 1.3));
  } else if (crPart == ${PART.leg}) {
    diffuseColor.rgb = mix(diffuseColor.rgb, vCrewB, crewEdge(${f(KNEE_Y - 0.045)} - crP.y));
  } else if (crPart == ${PART.face}) {
    // rosy cheeks
    float bl = exp(-pow(length(vec2(abs(crP.x) - 0.079, crP.y - ${f(S_EYE.y - 0.05)})) / 0.031, 2.0)) * step(0.0, crP.z);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 0.78, 0.74), bl * 0.55);
  } else if (crPart == ${PART.iris}) {
    // a darker limbal ring and light spokes in the iris
    vec3 e = vec3(sign(crP.x) * ${f(S_EYE.x)}, ${f(S_EYE.y)}, ${f(S_EYE.z)});
    vec3 d = normalize(crP - e);
    float r = length(d.xy - vec2(sign(crP.x) * 0.06, 0.0)) / 0.6;
    float ang = atan(d.y, d.x - sign(crP.x) * 0.06);
    diffuseColor.rgb *= mix(1.25, 0.55, smoothstep(0.55, 1.0, r)) * (0.92 + 0.12 * sin(ang * 14.0));
  } else if (crPart == ${PART.knit}) {
    diffuseColor.rgb *= 0.86 + 0.14 * crewEdge(sin(atan(crP.x, crP.z) * 26.0));
  } else if (crPart == ${PART.straw}) {
    vec2 q = vec2(atan(crP.x, crP.z) * 18.0, length(crP.xz) * 120.0 + crP.y * 120.0);
    diffuseColor.rgb *= 0.86 + 0.16 * step(0.5, fract(q.x + step(0.5, fract(q.y)) * 0.5));
  } else if (crPart == ${PART.sole}) {
    diffuseColor.rgb *= 0.9;
  }
  // cloth: folds that fade out once they're finer than a pixel, a little cavity shade in
  // their valleys (that holds on a bit further out), stitched seams and a slightly uneven dye
  float crPx = length(fwidth(crP));
  float crFold = crewFolds(crP, crPart, crTint);
  float crFoldK = 1.0 - smoothstep(0.004, 0.016, crPx);
  diffuseColor.rgb *= 1.0 - clamp(-crFold * 55.0, 0.0, 0.16) * (1.0 - smoothstep(0.01, 0.035, crPx));
  if (crPart == ${PART.leg} && (crP.y > ${f(KNEE_Y - 0.045)} || vCrewCloth.z > 0.5)) {
    // the outside leg seam
    float lx = sign(crP.x) * ${f(HIP_X)};
    float seam = (1.0 - crewEdge(abs(crP.z + 0.002) - 0.0025)) * step(0.0, (crP.x - lx) * sign(crP.x));
    diffuseColor.rgb *= 1.0 - 0.28 * seam;
  }
  if (crPart == ${PART.torso} && crP.y > 0.955 && crP.y < 1.33) {
    // a placket down the shirt front
    diffuseColor.rgb *= 1.0 - 0.18 * (1.0 - crewEdge(abs(crP.x) - 0.003)) * step(0.0, crP.z);
  }
  if (crPart == ${PART.torso} || crPart == ${PART.arm} || crPart == ${PART.leg} || crTint == ${TINT.coat} || crTint == ${TINT.vest} || crTint == ${TINT.sash}) {
    diffuseColor.rgb *= 1.0 + 0.045 * crewNoise(crP * 9.0);
  }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
  if (crFoldK > 0.001) {
    float crHx = crewFolds(crP + dFdx(crP), crPart, crTint) - crFold;
    float crHy = crewFolds(crP + dFdy(crP), crPart, crTint) - crFold;
    normal = crewBump(-vViewPosition, normal, crHx * crFoldK, crHy * crFoldK);
  }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
  if (crTint == ${TINT.trim} || crTint == ${TINT.metal}) { roughnessFactor = 0.32; }
  else if (crTint == ${TINT.white} || crTint == ${TINT.pupil} || crTint == ${TINT.dark} || crTint == ${TINT.shine}) { roughnessFactor = crPart == 0 && crTint == ${TINT.dark} ? 0.55 : 0.12; }
  else if (crTint == ${TINT.leather} || crTint == ${TINT.boots}) { roughnessFactor = 0.48; }
  else if (crTint == ${TINT.skin}) { roughnessFactor = 0.62; }
  else if (crTint == ${TINT.mouth} || crTint == ${TINT.tongue}) { roughnessFactor = 0.35; }
  else if (crTint == ${TINT.wood}) { roughnessFactor = 0.66; }`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
  if (crTint == ${TINT.trim}) metalnessFactor = 0.85;
  else if (crTint == ${TINT.metal}) metalnessFactor = 0.9;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  totalEmissiveRadiance += vColor.rgb * vCrewInfo.z * (crTint == ${TINT.glow} ? 0.8 + 0.2 * sin(uTime * 23.0 + vCrewRest.y * 40.0) : 1.0);
  {
    float rim = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
    // a soft sky-lit rim so the little figures read crisply against the deck
    totalEmissiveRadiance += diffuseColor.rgb * vec3(0.3, 0.34, 0.4) * uLight * rim * rim * rim;
    // light glowing through skin at the edges
    if (crTint == ${TINT.skin}) totalEmissiveRadiance += diffuseColor.rgb * vec3(0.22, 0.07, 0.04) * uLight * (0.35 + rim * rim);
    // a sheen sliding over hair
    if (crPart == ${PART.hair} || crPart == ${PART.beard}) {
      float band = exp(-pow((normal.y - 0.45) / 0.18, 2.0));
      totalEmissiveRadiance += diffuseColor.rgb * 0.45 * band * uLight;
    }
  }
  // a ghost ship's crew: grey-green shades, lit from within, eyes burning, half see-through
  float crGhA = 1.0;
  if (vCrewGhost > 0.5) {
    float rim = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
    float lum = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
    diffuseColor.rgb = vec3(lum) * vec3(0.45, 0.75, 0.66);
    vec3 G = vec3(${GHOST_GREEN.join(', ')});
    totalEmissiveRadiance = G * (0.05 + rim * rim * 0.95) * (0.5 + uNight * 0.45);
    if (crTint == ${TINT.pupil} || crTint == ${TINT.shine} || crTint == ${TINT.white}) totalEmissiveRadiance += G * 5.0;
    crGhA = clamp(0.32 + rim * rim * 0.8, 0.0, 1.0);
  }`,
      )
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  gl_FragColor.a = crGhA;');
  };
  const prevKey = material.customProgramCacheKey;
  material.customProgramCacheKey = () => prevKey.call(material) + '|crew5';

  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec3 color;\n${GLSL_CREW}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n  { vec3 crN = vec3(0.0, 1.0, 0.0); crewDeform(transformed, crN); }`);
  };
  depth.customProgramCacheKey = () => 'crew-depth2';
  return { material, depth };
}

// --------------------------------------------------------------------- renderer

/** CPU twin of the shader's crewShown(): does group `g` show on this sailor? */
function groupShown(g: number, hat: number, prop: number, fl: number): boolean {
  if (g === 0) return true;
  if (g < 10) return g === hat;
  if (g >= 3000) {
    const a = Math.floor((g - 3000) / 32);
    const b = g - 3000 - a * 32;
    return (fl & (1 << a)) !== 0 && (fl & (1 << b)) === 0;
  }
  if (g >= 1000) {
    const a = Math.floor((g - 1000) / 32);
    const b = g - 1000 - a * 32;
    return (fl & ((1 << a) | (1 << b))) === 0;
  }
  if (g >= 50) return g === prop;
  if (g < 30) return (fl & (1 << (g - 10))) !== 0;
  return (fl & (1 << (g - 30))) === 0;
}

/** Extras only some sailors have, big enough to be worth a mesh of their own. */
const OWN_MESH = new Set<number>([BIT.beard, BIT.coat, BIT.vest, BIT.peg, BIT.parrot, BIT.boots, BIT.bald, BIT.longhair, BIT.barefoot]);

/**
 * Which part of the sculpt a group is drawn with. Hats, held props and the
 * bigger extras only some sailors wear (coats, parrots, beards...) get a mesh of
 * their own, so a sailor costs the triangles of what they actually wear rather
 * than of the whole wardrobe. Everything most sailors show anyway, and the
 * small trinkets, stay in the body mesh, where the shader still hides what one
 * sailor doesn't wear.
 */
function bucketOf(g: number): number {
  if (g === 0) return 0;
  if (g < 10 || (g >= 50 && g < 1000)) return g;
  const bit = g >= 3000 ? Math.floor((g - 3000) / 32) : g < 30 ? g - 10 : -1;
  return OWN_MESH.has(bit) ? SHOWN(bit) : 0;
}

/** Floats per sailor in a batch's one instance buffer: matrix, six pose vectors, style. */
const STRIDE = 16 + 6 * 4 + 4;

interface Batch {
  mesh: THREE.InstancedMesh;
  /** Every per-sailor value, interleaved: one upload a frame instead of eight. */
  data: THREE.InstancedInterleavedBuffer;
  /** the groups this mesh draws (none: the body, drawn for everyone) */
  groups: number[];
  n: number;
}

interface Level {
  batches: Batch[];
  /** sailors queued this frame (the body mesh's count) */
  n: number;
  max: number;
}

/**
 * Draws a crowd of sailors in two detail levels sharing one palette and one
 * shader: the full sculpt (fingers, lashes, laces...) for the few close to the
 * camera, a lighter one for everyone further off. Each level is split into a
 * body mesh plus one per hat, prop and bigger extra (see bucketOf), all sharing
 * one vertex buffer; a sailor is queued only into the meshes they wear.
 */
/** How far (m) the distant crew sculpt may stray from the far one. */
const CREW_DISTANT_ERROR = 0.012;

export class CrewRenderer {
  readonly group = new THREE.Group();
  readonly palette: THREE.DataTexture;
  private readonly data: Float32Array;
  private readonly levels: Level[];

  constructor(readonly rows: number, nearRes: number, farRes: number, nearMax: number) {
    this.data = new Float32Array(TINT_SLOTS * rows * 4);
    this.palette = new THREE.DataTexture(this.data, TINT_SLOTS, rows, THREE.RGBAFormat, THREE.FloatType);
    this.palette.minFilter = THREE.NearestFilter;
    this.palette.magFilter = THREE.NearestFilter;
    this.palette.colorSpace = THREE.NoColorSpace;
    this.palette.needsUpdate = true;
    const { material, depth } = createCrewMaterial(this.palette);
    this.material = material;
    this.depth = depth;
    // a crowd that always fits in the near batch never needs the far sculpt
    const levels = nearMax >= rows ? [[nearRes, rows]] : [[nearRes, nearMax], [farRes, rows]];
    const sculpts = levels.map(([res]) => buildSailorGeometry(res));
    this.levels = levels.map(([, max], i) => this.level(sculpts[i], null, max));
    if (levels.length > 1) {
      // a third, lighter cut of the far sculpt for sailors seen from the sea
      // (the camera never comes closer than 70 m out there): the simplifier
      // holds it within a centimetre and a bit, a fraction of a pixel at that range
      const far = sculpts[1];
      void simplifiedLevels(far, [{ error: CREW_DISTANT_ERROR, prune: true }]).then(([g]) => {
        if (g) this.distant = this.level(far, g.index!.array as ArrayLike<number>, rows);
      });
    }
  }

  private readonly material: THREE.Material;
  private readonly depth: THREE.Material;
  private distant: Level | null = null;

  /**
   * One level: the sculpt split into a body mesh plus one per hat, prop and
   * bigger extra, all drawing from the same vertices (through `index`, a
   * lighter cut of them, when given).
   */
  private level(full: THREE.BufferGeometry, index: ArrayLike<number> | null, max: number): Level {
    const idx = index ?? full.index!.array;
    const grp = full.getAttribute('aRig');
    const triGroup = new Float32Array(idx.length / 3);
    const groups = new Set<number>();
    for (let t = 0; t < triGroup.length; t++) {
      const g = grp.getZ(idx[t * 3]);
      triGroup[t] = g;
      groups.add(g);
    }
    const members = new Map<number, number[]>();
    for (const g of groups) {
      const b = bucketOf(g);
      if (!members.has(b)) members.set(b, []);
      members.get(b)!.push(g);
    }
    const keys = [...members.keys()].sort((a, b) => a - b);
    const batches = keys.map((key) => {
      const want = new Set(members.get(key)!);
      const sub: number[] = [];
      for (let t = 0; t < triGroup.length; t++) if (want.has(triGroup[t])) sub.push(idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]);
      const geo = new THREE.BufferGeometry();
      // the vertex data is shared by every mesh of the level and uploaded once
      for (const [name, a] of Object.entries(full.attributes)) {
        if (name.startsWith('aPose') || name === 'aStyle') continue;
        geo.setAttribute(name, a);
      }
      geo.setIndex(sub);
      const data = new THREE.InstancedInterleavedBuffer(new Float32Array(max * STRIDE), STRIDE);
      data.setUsage(THREE.DynamicDrawUsage);
      for (let k = 0; k < 6; k++) geo.setAttribute(`aPose${k}`, new THREE.InterleavedBufferAttribute(data, 4, 16 + k * 4));
      geo.setAttribute('aStyle', new THREE.InterleavedBufferAttribute(data, 4, 40));
      const mesh = new THREE.InstancedMesh(geo, this.material, max);
      mesh.customDepthMaterial = this.depth;
      // the matrix rides in the same buffer (three binds an interleaved instanceMatrix as it does any attribute)
      mesh.instanceMatrix = new THREE.InterleavedBufferAttribute(data, 16, 0) as unknown as THREE.InstancedBufferAttribute;
      mesh.count = 0;
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return { mesh, data, groups: key === 0 ? [] : members.get(key)!, n: 0 };
    });
    return { batches, n: 0, max };
  }

  /** One sailor's colours: TINT_SLOTS rgba entries (a > 0 glows, a < 0 patterns). */
  setRow(row: number, slots: readonly (readonly number[])[]) {
    const d = this.data;
    for (let s = 0; s < TINT_SLOTS; s++) {
      const o = (row * TINT_SLOTS + s) * 4;
      const c = slots[s];
      d[o] = c[0];
      d[o + 1] = c[1];
      d[o + 2] = c[2];
      d[o + 3] = c[3] ?? 0;
    }
    this.palette.needsUpdate = true;
  }

  begin() {
    for (const l of this.all()) {
      l.n = 0;
      for (const b of l.batches) b.n = 0;
    }
  }

  private all() {
    return this.distant ? [...this.levels, this.distant] : this.levels;
  }

  /**
   * Queues one posed sailor; `near` asks for the detailed sculpt (if there's
   * room), `distant` for the lightest one (once it's ready).
   */
  push(m: THREE.Matrix4, pose: ArrayLike<number>, row: number, hat: number, prop: number, flags: number, near: boolean, distant = false) {
    let l = near ? this.levels[0] : distant && this.distant ? this.distant : this.levels[this.levels.length - 1];
    if (l.n >= l.max) l = this.levels[1];
    if (!l || l.n >= l.max) return;
    l.n++;
    for (const b of l.batches) {
      if (b.groups.length && !b.groups.some((g) => groupShown(g, hat, prop, flags))) continue;
      const n = b.n++;
      const arr = b.data.array as Float32Array;
      const o = n * STRIDE;
      m.toArray(arr, o);
      for (let k = 0; k < 24; k++) arr[o + 16 + k] = pose[k];
      arr[o + 40] = row;
      arr[o + 41] = hat;
      arr[o + 42] = prop;
      arr[o + 43] = flags;
    }
  }

  end() {
    for (const l of this.all()) {
      for (const b of l.batches) {
        b.mesh.count = b.n;
        b.mesh.visible = b.n > 0;
        if (b.n === 0) continue;
        b.data.clearUpdateRanges();
        b.data.addUpdateRange(0, b.n * STRIDE);
        b.data.needsUpdate = true;
      }
    }
  }
}
