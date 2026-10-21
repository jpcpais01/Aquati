import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { angleDelta, clamp, damp, lerp, smoothstep } from '../core/noise';
import { patchMaterial } from '../render/environment';
import type { World } from '../game/world';
import type { Ship } from '../ships/ship';
import { Island } from '../world/terrain';

// Herring gulls. Each one is a little sculpted bird (body, head, hooked beak,
// grey mantle, black-and-white wingtips, fanned tail, pink legs) skinned in the
// vertex shader: shoulders and wrists flap with a lagging hand, the wings fold
// back along the flanks when it lands, the tail spreads to brake, the legs drop
// and the head turns. On the CPU each gull flies with a little steering model
// (banking into its turns, pitching into climbs, gliding with occasional flap
// bursts, riding the gusts) and goes about its day: wheeling over its island,
// trailing a ship to circle her masts, landing on mast caps, fighting tops, the
// jib-boom and the shore rocks, bobbing on the swell, and scattering in a
// screaming cloud when the guns go off. All of it is one instanced draw.
//
// A few more gulls wait off stage: riders, that loaf on drifting kelp and
// driftwood far out at sea (and wheel round it while a ship goes by), and the
// carrier, who flies in with a scroll on her back, lands on your rail, calls
// out her news and is gone again.

const S = 1.5; // model scale: ~2.6 m across the wings, a touch big so it reads from the bird's-eye camera
const LEG = 0.205 * S; // hip to sole
const TAU = Math.PI * 2;
const SCARE_GUNS = 75;
const SCARE_BOOM = 120;

type Mode = 'soar' | 'land' | 'perch' | 'float' | 'takeoff' | 'flee' | 'off';
type Kind = 'flock' | 'rider' | 'carrier';

const RIDERS = 6;
/** Spar index of the carrier's spot on the rail: stands as long as the ship does. */
const RAIL = -9;

interface Perch {
  ship: Ship | null;
  spar: number;
  /** Hull-root space on a ship, world space on the shore. */
  local: THREE.Vector3;
  taken: boolean;
}

interface Gull {
  kind: Kind;
  home: Island;
  mode: Mode;
  t: number; // time left in this mode
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  pitch: number;
  bank: number;
  // wing rig (smoothed toward targets every frame)
  phase: number;
  amp: number;
  fold: number;
  legs: number;
  dih: number;
  head: number;
  headT: number;
  headClock: number;
  nod: number;
  tail: number;
  burst: number;
  burstClock: number;
  // soaring circle
  cx: number;
  cz: number;
  r: number;
  h: number;
  dir: number;
  escort: Ship | null;
  // landing target
  perch: Perch | null;
  water: THREE.Vector3 | null;
  from: THREE.Vector3; // where a scare came from
  off: THREE.Vector3; // touchdown offset, settled out on the perch
  call: number; // long-call head toss timer
  seed: number;
  /** A rider's patch of flotsam (its perch moves with it). */
  raft: Perch | null;
  /** A rider or carrier with nothing left to do: seconds until it leaves the stage. */
  life: number;
  /** The carrier's news, told on touchdown. */
  news: (() => void) | null;
  /** The carrier is on her errand: no gunfire turns her back. */
  errand: boolean;
}

// ---------------------------------------------------------------- sculpt

function gullGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const fold: number[] = [];
  const rig: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const P = (p: number[]) => new THREE.Vector3(p[0], p[1], p[2]);
  const vert = (p: number[], c: number[], r: number[] = [0, 0, 0, 0], f: number[] = p) => {
    pos.push(p[0], p[1], p[2]);
    fold.push(f[0], f[1], f[2]);
    rig.push(r[0], r[1], r[2], r[3]);
    col.push(c[0], c[1], c[2]);
    return pos.length / 3 - 1;
  };
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const _c = new THREE.Vector3();
  const at = (i: number, v: THREE.Vector3) => v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  // wind every triangle outward from a point inside its part
  const tri = (a: number, b: number, c: number, inside: THREE.Vector3) => {
    at(a, _a);
    at(b, _b);
    at(c, _c);
    const g = _a.clone().add(_b).add(_c).multiplyScalar(1 / 3).sub(inside);
    const n = _b.sub(_a).cross(_c.sub(_a));
    if (n.dot(g) < 0) idx.push(a, c, b);
    else idx.push(a, b, c);
  };
  const quad = (a: number, b: number, c: number, d: number, inside: THREE.Vector3) => {
    tri(a, b, c, inside);
    tri(a, c, d, inside);
  };

  const white = [0.93, 0.93, 0.91];
  const mantle = [0.3, 0.34, 0.41];
  const black = [0.06, 0.06, 0.07];
  const yellow = [0.98, 0.72, 0.12];
  const red = [0.85, 0.12, 0.06];
  const pink = [0.86, 0.55, 0.47];

  // body + neck + head: one smooth loft along z (tail -z, beak +z)
  const rings: [number, number, number, number][] = [
    // z, half-width, half-height, centre y
    [-0.3, 0.022, 0.016, 0.02],
    [-0.22, 0.048, 0.038, 0.016],
    [-0.12, 0.074, 0.064, 0.006],
    [0.0, 0.088, 0.08, 0.0],
    [0.1, 0.082, 0.075, 0.006],
    [0.18, 0.056, 0.056, 0.022],
    [0.235, 0.044, 0.047, 0.045],
    [0.285, 0.054, 0.055, 0.062],
    [0.335, 0.05, 0.05, 0.064],
    [0.375, 0.031, 0.033, 0.058],
    [0.397, 0.014, 0.016, 0.052],
  ];
  const N = 8;
  const ringIds: number[][] = [];
  for (const [z, rx, ry, yc] of rings) {
    const hw = smoothstep(0.17, 0.26, z);
    const ids: number[] = [];
    for (let k = 0; k < N; k++) {
      const a = (k / N) * TAU;
      const sx = Math.sin(a);
      const cy = Math.cos(a);
      const y = yc + cy * ry * (cy < 0 ? 0.9 : 1); // flatter belly
      const back = cy > 0.3 && z > -0.2 && z < 0.14;
      ids.push(vert([sx * rx, y, z], back ? mantle : white, [0, 0, hw, 0]));
    }
    ringIds.push(ids);
  }
  for (let r = 0; r < rings.length - 1; r++) {
    const inside = new THREE.Vector3(0, (rings[r][3] + rings[r + 1][3]) / 2, (rings[r][0] + rings[r + 1][0]) / 2);
    for (let k = 0; k < N; k++) {
      const k2 = (k + 1) % N;
      quad(ringIds[r][k], ringIds[r][k2], ringIds[r + 1][k2], ringIds[r + 1][k], inside);
    }
  }
  const tailTip = vert([0, 0.02, -0.32], white);
  const noseTip = vert([0, 0.052, 0.402], yellow, [0, 0, 1, 0]);
  for (let k = 0; k < N; k++) {
    tri(ringIds[0][k], ringIds[0][(k + 1) % N], tailTip, new THREE.Vector3(0, 0.02, -0.28));
    tri(ringIds[rings.length - 1][k], ringIds[rings.length - 1][(k + 1) % N], noseTip, new THREE.Vector3(0, 0.052, 0.38));
  }

  // hooked yellow beak with the red gonys spot
  {
    const h = [0, 0, 1, 0];
    const top = vert([0, 0.066, 0.392], yellow, h);
    const l = vert([0.015, 0.05, 0.392], yellow, h);
    const r = vert([-0.015, 0.05, 0.392], yellow, h);
    const bot = vert([0, 0.036, 0.392], yellow, h);
    const gonys = vert([0, 0.033, 0.452], red, h);
    const tip = vert([0, 0.043, 0.498], yellow, h);
    const inside = new THREE.Vector3(0, 0.05, 0.43);
    tri(top, l, tip, inside);
    tri(top, r, tip, inside);
    tri(l, gonys, tip, inside);
    tri(r, gonys, tip, inside);
    tri(l, bot, gonys, inside);
    tri(r, bot, gonys, inside);
  }
  // beady eyes
  for (const s of [1, -1]) {
    const c = [s * 0.043, 0.074, 0.312];
    const e = 0.011;
    const h = [0, 0, 1, 0];
    const ids = [
      vert([c[0] + s * e, c[1], c[2]], black, h),
      vert([c[0], c[1] + e, c[2]], black, h),
      vert([c[0], c[1], c[2] + e], black, h),
      vert([c[0], c[1] - e, c[2]], black, h),
      vert([c[0], c[1], c[2] - e], black, h),
    ];
    const inside = P(c).add(new THREE.Vector3(-s * e, 0, 0));
    for (let k = 1; k <= 4; k++) tri(ids[0], ids[k], ids[(k % 4) + 1], inside);
  }

  // wings: an airfoil slab per side, the hand swept back to a long pointed tip.
  // Each station: span s, leading edge z, trailing edge z, thickness.
  const st: [number, number, number, number][] = [
    [0.05, 0.16, -0.13, 0.055],
    [0.2, 0.17, -0.14, 0.04],
    [0.4, 0.16, -0.12, 0.03],
    [0.54, 0.11, -0.11, 0.024],
    [0.66, 0.06, -0.115, 0.018],
    [0.77, 0.0, -0.12, 0.013],
    [0.87, -0.08, -0.13, 0.006],
  ];
  const wy = 0.035;
  for (const sgn of [1, -1]) {
    const ids: number[][] = [];
    for (const [s, zl, zt, th] of st) {
      const zm = zl * 0.62 + zt * 0.38;
      const hand = s > 0.62;
      const tip = s > 0.72;
      const topC = hand ? black : s > 0.5 ? [0.2, 0.22, 0.26] : mantle;
      const teC = tip ? (s < 0.8 ? white : black) : hand ? black : white; // white trailing edge, a white "mirror" near the tip
      const botC = hand ? [0.2, 0.2, 0.22] : white;
      const r = [smoothstep(0.03, 0.12, s), smoothstep(0.36, 0.45, s), 0, 0];
      // folded: the wing laid back along the flank, the black tips crossing over the tail
      const u = (s - 0.05) / 0.82;
      const fx = sgn * (0.088 - 0.1 * Math.pow(u, 1.5));
      const fy = 0.058 + 0.012 * (1 - u) + (sgn > 0 ? 0.005 * u : 0);
      const fz = 0.12 - u * 0.6;
      const pts: [number, number][] = [
        [zl, 0],
        [zm, th / 2],
        [zt, 0],
        [zm, -th / 2],
      ];
      const cols = [topC, topC, teC, botC];
      ids.push(
        pts.map(([z, t], k) => {
          const c = z - (zl + zt) / 2;
          return vert([sgn * s, wy + t, z], cols[k], r, [fx + sgn * c * 0.32, fy - c * 0.22 + t, fz + c * 0.1]);
        }),
      );
    }
    for (let i = 0; i < st.length - 1; i++) {
      const inside = new THREE.Vector3(sgn * (st[i][0] + st[i + 1][0]) / 2, wy, (st[i][1] + st[i][2] + st[i + 1][1] + st[i + 1][2]) / 4);
      for (let k = 0; k < 4; k++) quad(ids[i][k], ids[i][(k + 1) % 4], ids[i + 1][(k + 1) % 4], ids[i + 1][k], inside);
    }
    const capIn = (i: number, dx: number) => new THREE.Vector3(sgn * (st[i][0] + dx), wy, (st[i][1] + st[i][2]) / 2);
    const last = ids[st.length - 1];
    quad(last[0], last[1], last[2], last[3], capIn(st.length - 1, -0.02));
    quad(ids[0][0], ids[0][1], ids[0][2], ids[0][3], capIn(0, 0.02));
  }

  // tail: a short fan that spreads to brake on landing
  {
    const T = [0, 0, 0, -1];
    const th = 0.009;
    const ring = (y: number) => [
      vert([0.034, y, -0.2], white, T),
      vert([0.064, y, -0.365], white, T),
      vert([0, y, -0.39], white, T),
      vert([-0.064, y, -0.365], white, T),
      vert([-0.034, y, -0.2], white, T),
    ];
    const top = ring(0.02 + th);
    const bot = ring(0.02 - th);
    const inside = new THREE.Vector3(0, 0.02, -0.3);
    for (const f of [top, bot]) {
      tri(f[0], f[1], f[2], inside);
      tri(f[0], f[2], f[4], inside);
      tri(f[4], f[2], f[3], inside);
    }
    for (let k = 0; k < 4; k++) quad(top[k], top[k + 1], bot[k + 1], bot[k], inside);
  }

  // pink legs and webbed feet; tucked back under the belly in flight
  for (const s of [1, -1]) {
    const L = [0, 0, 0, 1];
    const hip = [s * 0.032, -0.05, -0.02];
    const ank = [s * 0.036, -0.192, 0.0];
    const hipF = [s * 0.03, -0.05, -0.04];
    const ankF = [s * 0.028, -0.062, -0.15];
    const w = 0.008;
    const leg: number[] = [];
    for (const [p, f] of [
      [hip, hipF],
      [ank, ankF],
    ]) {
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU;
        const o = [Math.cos(a) * w, 0, Math.sin(a) * w];
        leg.push(vert([p[0] + o[0], p[1], p[2] + o[2]], pink, L, [f[0] + o[0], f[1] + o[2] * 0.5, f[2]]));
      }
    }
    const legIn = new THREE.Vector3(s * 0.034, -0.12, -0.01);
    for (let k = 0; k < 4; k++) quad(leg[k], leg[(k + 1) % 4], leg[4 + ((k + 1) % 4)], leg[4 + k], legIn);
    // foot: three toes splayed forward with the web between
    const y = -0.203;
    const foot = [
      vert([ank[0], y + 0.008, ank[2] - 0.01], pink, L, [ankF[0], ankF[1], ankF[2] - 0.01]),
      vert([ank[0] + s * 0.035, y, ank[2] + 0.06], pink, L, [ankF[0] + s * 0.012, ankF[1], ankF[2] - 0.05]),
      vert([ank[0], y, ank[2] + 0.075], pink, L, [ankF[0], ankF[1] - 0.004, ankF[2] - 0.06]),
      vert([ank[0] - s * 0.03, y, ank[2] + 0.06], pink, L, [ankF[0] - s * 0.012, ankF[1], ankF[2] - 0.05]),
    ];
    const footIn = new THREE.Vector3(ank[0], y + 0.03, ank[2] + 0.03);
    tri(foot[0], foot[1], foot[2], footIn);
    tri(foot[0], foot[2], foot[3], footIn);
    const sole = foot.map((i) => vert([pos[i * 3], y - 0.004, pos[i * 3 + 2]], pink, L, [fold[i * 3], fold[i * 3 + 1] - 0.004, fold[i * 3 + 2]]));
    const soleIn = new THREE.Vector3(ank[0], y + 0.02, ank[2] + 0.03);
    tri(sole[0], sole[1], sole[2], soleIn);
    tri(sole[0], sole[2], sole[3], soleIn);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aFold', new THREE.Float32BufferAttribute(fold, 3));
  g.setAttribute('aRig', new THREE.Float32BufferAttribute(rig, 4));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- vertex rig

/** A scroll tied across the carrier's back (gull model space, behind the shoulders). */
function scrollGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const paint = (g: THREE.BufferGeometry, c: number[]) => {
    const n = g.getAttribute('position').count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set(c, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    g.deleteAttribute('uv');
    return g.index ? g.toNonIndexed() : g;
  };
  const roll = new THREE.CylinderGeometry(0.026, 0.026, 0.13, 10);
  roll.rotateZ(Math.PI / 2);
  parts.push(paint(roll, [0.93, 0.85, 0.66]));
  for (const x of [-0.068, 0.068]) {
    const end = new THREE.CircleGeometry(0.026, 10);
    end.rotateY(x > 0 ? Math.PI / 2 : -Math.PI / 2);
    end.translate(x, 0, 0);
    parts.push(paint(end, [0.78, 0.68, 0.5]));
  }
  const band = new THREE.CylinderGeometry(0.029, 0.029, 0.024, 10);
  band.rotateZ(Math.PI / 2);
  parts.push(paint(band, [0.78, 0.1, 0.08]));
  // the ribbon's tails trail back over the rump
  for (const s of [-1, 1]) {
    const tail = new THREE.BoxGeometry(0.012, 0.004, 0.07);
    tail.rotateY(s * 0.25);
    tail.translate(s * 0.012, 0.018, -0.045);
    parts.push(paint(tail, [0.78, 0.1, 0.08]));
  }
  const g = mergeGeometries(parts);
  g.translate(0, 0.094, -0.035);
  return g;
}

function shipNear(ships: Ship[], at: THREE.Vector3, r: number) {
  for (const s of ships) if (s.alive && Math.hypot(s.pos.x - at.x, s.pos.z - at.z) < r + s.cls.length * 0.5) return true;
  return false;
}

const RIG_GLSL = /* glsl */ `
attribute vec3 aFold;
attribute vec4 aRig;   // x shoulder weight, y wrist weight, z head weight, w: 1 legs, -1 tail
attribute vec4 aWingA; // flap phase, flap amplitude, fold, legs down
attribute vec4 aWingB; // dihedral, head yaw, tail spread, head pitch
vec3 gRotX(vec3 p, vec3 o, float a) { p -= o; float c = cos(a), s = sin(a); return o + vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
vec3 gRotY(vec3 p, vec3 o, float a) { p -= o; float c = cos(a), s = sin(a); return o + vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 gRotZ(vec3 p, vec3 o, float a) { p -= o; float c = cos(a), s = sin(a); return o + vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
// k = 1 poses a point, k = 0 a normal (pivots collapse to the origin)
vec3 gullPose(vec3 rest, vec3 folded, float k) {
  vec3 p = aRig.w > 0.5 ? mix(folded, rest, aWingA.w) : mix(rest, folded, aWingA.z);
  float side = rest.x >= 0.0 ? 1.0 : -1.0;
  float open = 1.0 - aWingA.z;
  float ph = aWingA.x;
  float amp = aWingA.y * open;
  float dih = aWingB.x * open;
  if (aRig.y > 0.0) {
    // the hand lags the arm and sweeps back on the upstroke
    float a2 = (-dih * 0.8 + sin(ph - 0.9) * amp * 0.6) * aRig.y;
    float sweep = max(0.0, cos(ph + 0.3)) * amp * 0.45 * aRig.y;
    vec3 w = vec3(side * 0.4, 0.035, 0.14) * k;
    p = gRotZ(p, w, a2 * side);
    p = gRotY(p, w, sweep * side);
  }
  if (aRig.x > 0.0) {
    float a1 = (dih + sin(ph) * amp) * aRig.x;
    p = gRotZ(p, vec3(side * 0.05, 0.035, 0.02) * k, a1 * side);
  }
  if (aRig.z > 0.0) {
    vec3 n = vec3(0.0, 0.05, 0.2) * k;
    p = gRotX(p, n, aWingB.w * aRig.z);
    p = gRotY(p, n, aWingB.y * aRig.z);
  }
  if (aRig.w < -0.5) {
    float t = clamp((-0.2 - rest.z) / 0.19, 0.0, 1.0);
    p.x *= mix(1.0, 1.0 + aWingB.z * 1.3 * t, k);
    p = gRotX(p, vec3(0.0, 0.02, -0.2) * k, -aWingB.z * 0.35);
  }
  return p;
}
`;

function rigShader(shader: { vertexShader: string }, normals: boolean) {
  let v = shader.vertexShader.replace('#include <common>', `#include <common>\n${RIG_GLSL}`);
  if (normals) v = v.replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(gullPose(normal, normal, 0.0));');
  shader.vertexShader = v.replace('#include <begin_vertex>', 'vec3 transformed = gullPose(position, aFold, 1.0);');
}

// ---------------------------------------------------------------- flock

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _s = new THREE.Vector3(S, S, S);
const _v = new THREE.Vector3();
const _t = new THREE.Vector3();
const _dv = new THREE.Vector3();
const _T = new THREE.Vector3();
const _pm = new THREE.Matrix4();
const _fr = new THREE.Frustum();
const _sph = new THREE.Sphere();
/** Past this (m) a gull is a pixel or two at most, and mostly fogged out. */
const GULL_FAR = 520;

export class Birds {
  readonly mesh: THREE.InstancedMesh;
  private gulls: Gull[] = [];
  private shore: Perch[] = [];
  private shipPerches = new WeakMap<Ship, Perch[]>();
  private gunsSeen = new WeakMap<Ship, number>();
  private dead = new WeakSet<Ship>();
  private wingA: THREE.InstancedBufferAttribute;
  private wingB: THREE.InstancedBufferAttribute;
  private cryClock = 3;
  private time = 0;
  private carrier!: Gull;
  /** The carrier's scroll, tied across her back with a red ribbon. */
  readonly scroll: THREE.InstancedMesh;

  /** `islands` give every perch; the flock first nests round `homes` (see rehome). */
  constructor(islands: Island[], count: number, heightAt: (x: number, z: number) => number, homes = islands) {
    const geo = gullGeometry();
    const all = count + RIDERS + 1;
    this.wingA = new THREE.InstancedBufferAttribute(new Float32Array(all * 4), 4);
    this.wingB = new THREE.InstancedBufferAttribute(new Float32Array(all * 4), 4);
    this.wingA.setUsage(THREE.DynamicDrawUsage);
    this.wingB.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aWingA', this.wingA);
    geo.setAttribute('aWingB', this.wingB);
    const mat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 }), { clouds: true });
    const base = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, r) => {
      base.call(mat, shader, r);
      rigShader(shader, true);
    };
    const prevKey = mat.customProgramCacheKey;
    mat.customProgramCacheKey = () => prevKey.call(mat) + '|gull';
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = (shader) => rigShader(shader, false);
    depth.customProgramCacheKey = () => 'gull-depth';
    this.mesh = new THREE.InstancedMesh(geo, mat, all);
    this.mesh.customDepthMaterial = depth;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.scroll = new THREE.InstancedMesh(scrollGeometry(), patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.15 }), { clouds: true, caustics: true }), 1);
    this.scroll.count = 0;
    this.scroll.castShadow = true;
    this.scroll.frustumCulled = false;

    // shore rocks and beaches to stand on
    for (const isl of islands) {
      let n = 0;
      for (let k = 0; k < 80 && n < 5; k++) {
        const a = Math.random() * TAU;
        const d = isl.r * (0.35 + Math.random() * 0.75);
        const x = isl.x + Math.cos(a) * d;
        const z = isl.z + Math.sin(a) * d;
        const h = heightAt(x, z);
        if (h < 0.5 || h > 6) continue;
        // keep it level enough to stand on
        if (Math.abs(heightAt(x + 1, z) - heightAt(x - 1, z)) + Math.abs(heightAt(x, z + 1) - heightAt(x, z - 1)) > 1.6) continue;
        this.shore.push({ ship: null, spar: 0, local: new THREE.Vector3(x, h, z), taken: false });
        n++;
      }
    }

    for (let i = 0; i < all; i++) {
      const home = homes[i % homes.length];
      const g: Gull = {
        kind: i < count ? 'flock' : i < count + RIDERS ? 'rider' : 'carrier',
        home,
        mode: 'soar',
        t: 6 + Math.random() * 20,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        yaw: Math.random() * TAU,
        pitch: 0,
        bank: 0,
        phase: Math.random() * TAU,
        amp: 0,
        fold: 0,
        legs: 0,
        dih: 0.12,
        head: 0,
        headT: 0,
        headClock: Math.random() * 2,
        nod: 0,
        tail: 0,
        burst: 0,
        burstClock: 2 + Math.random() * 6,
        cx: 0,
        cz: 0,
        r: 20,
        h: 20,
        dir: Math.random() < 0.5 ? -1 : 1,
        escort: null,
        perch: null,
        water: null,
        from: new THREE.Vector3(),
        off: new THREE.Vector3(),
        call: 0,
        seed: Math.random() * 100,
        raft: null,
        life: 0,
        news: null,
        errand: false,
      };
      if (g.kind !== 'flock') {
        g.mode = 'off';
        this.gulls.push(g);
        if (g.kind === 'carrier') this.carrier = g;
        continue;
      }
      this.newCircle(g);
      const a = Math.random() * TAU;
      g.pos.set(g.cx + Math.cos(a) * g.r, g.h, g.cz + Math.sin(a) * g.r);
      g.vel.set(-Math.sin(a) * g.dir * 9, 0, Math.cos(a) * g.dir * 9);
      // a few already loafing on the rocks when the voyage begins
      if (i % 4 === 1) {
        const p = this.freeShore(g);
        if (p) {
          p.taken = true;
          g.perch = p;
          g.mode = 'perch';
          g.t = 5 + Math.random() * 30;
          g.pos.copy(p.local).setY(p.local.y + LEG);
          g.vel.set(0, 0, 0);
          g.fold = g.legs = 1;
        }
      }
      this.gulls.push(g);
    }
  }

  /**
   * The flock moves to another archipelago's isles (done out on the high seas,
   * where none of them is in sight): each gull lets go of its perch or escort
   * and is found circling over its new home.
   */
  rehome(homes: Island[]) {
    if (!homes.length || this.gulls[0]?.home === homes[0]) return;
    this.gulls.forEach((g, i) => {
      if (g.kind !== 'flock') return;
      if (g.perch) g.perch.taken = false;
      g.perch = null;
      g.water = null;
      g.home = homes[i % homes.length];
      g.mode = 'soar';
      g.fold = g.legs = 0;
      g.t = 6 + Math.random() * 20;
      this.newCircle(g);
      const a = Math.random() * TAU;
      g.pos.set(g.cx + Math.cos(a) * g.r, g.h, g.cz + Math.sin(a) * g.r);
      g.vel.set(-Math.sin(a) * g.dir * 9, 0, Math.cos(a) * g.dir * 9);
    });
  }

  private newCircle(g: Gull) {
    const isl = g.home;
    g.escort = null;
    if (g.raft) {
      // wheel low over the flotsam, waiting for the ship to pass
      g.cx = g.raft.local.x;
      g.cz = g.raft.local.z;
      g.r = 9 + Math.random() * 8;
      g.h = 8 + Math.random() * 6;
      return;
    }
    g.cx = isl.x + (Math.random() - 0.5) * isl.r;
    g.cz = isl.z + (Math.random() - 0.5) * isl.r;
    g.r = 16 + Math.random() * isl.r * 0.7;
    g.h = Math.max(14, isl.peak * 0.8) + 5 + Math.random() * 16;
    if (Math.random() < 0.3) g.dir = -g.dir;
  }

  private freeShore(g: Gull): Perch | null {
    let best: Perch | null = null;
    let bd = Infinity;
    for (const p of this.shore) {
      if (p.taken) continue;
      const d = Math.hypot(p.local.x - g.home.x, p.local.z - g.home.z) / g.home.r + Math.random();
      if (d < bd && d < 2.6) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  private perchesOf(ship: Ship): Perch[] {
    let list = this.shipPerches.get(ship);
    if (!list) {
      list = ship.model.perches.map((p) => ({ ship, spar: p.spar, local: p.pos, taken: false }));
      this.shipPerches.set(ship, list);
    }
    return list;
  }

  private perchOk(p: Perch) {
    const s = p.ship;
    return !s || (s.alive && s.root.visible && (p.spar === RAIL || s.dmg.sparStanding(p.spar)));
  }

  private perchWorld(p: Perch, out: THREE.Vector3) {
    if (!p.ship) return out.copy(p.local);
    return out.copy(p.local).applyMatrix4(p.ship.model.root.matrixWorld);
  }

  private release(g: Gull) {
    if (g.perch) g.perch.taken = false;
    g.perch = null;
    g.water = null;
  }

  /**
   * A gull comes to loaf on a patch of drifting flotsam. `spot` is the world
   * point it stands on: the caller keeps it moving with the drift. Returns
   * false when every rider is already out.
   */
  ride(spot: THREE.Vector3, home: Island | null): boolean {
    const g = this.gulls.find((o) => o.kind === 'rider' && o.mode === 'off');
    if (!g) return false;
    const p: Perch = { ship: null, spar: 0, local: spot, taken: true };
    g.raft = p;
    g.perch = p;
    g.water = null;
    if (home) g.home = home;
    g.mode = 'perch';
    g.t = 20 + Math.random() * 40;
    g.pos.copy(spot).setY(spot.y + LEG);
    g.vel.set(0, 0, 0);
    g.yaw = Math.random() * TAU;
    g.fold = g.legs = 1;
    g.amp = 0;
    g.life = 0;
    return true;
  }

  /** The flotsam under `spot` is gone: its gull flies off and leaves the stage. */
  unride(spot: THREE.Vector3, w: World) {
    for (const g of this.gulls) {
      if (g.raft?.local !== spot) continue;
      g.raft = null;
      g.life = 16;
      if (g.mode === 'perch') this.takeOff(g, w);
      else this.release(g);
    }
  }

  /** True while the carrier is out on an errand. */
  get carrying() {
    return this.carrier.mode !== 'off';
  }

  /**
   * The carrier gull flies in from `from` (or upwind) with a scroll on her
   * back, lands on the ship's rail, and `news` is told the moment her feet
   * touch the wood. Returns false if she is already out.
   */
  carry(ship: Ship, w: World, news: () => void, from: { x: number; z: number } | null = null): boolean {
    const g = this.carrier;
    if (g.mode !== 'off' || !ship.alive) return false;
    const s = ship.model.shape;
    const t = 0.3;
    const top = s.top(t);
    const rail: Perch = { ship, spar: RAIL, local: new THREE.Vector3(s.halfWidthAtY(t, top) - 0.07, top + 0.04, s.z(t)), taken: true };
    let a = Math.atan2(-w.wind.dirX, -w.wind.dirZ);
    if (from) a = Math.atan2(from.x - ship.pos.x, from.z - ship.pos.z);
    a += (Math.random() - 0.5) * 0.6;
    const d = 150 + Math.random() * 40;
    g.pos.set(ship.pos.x + Math.sin(a) * d, 30 + Math.random() * 8, ship.pos.z + Math.cos(a) * d);
    g.vel.set(-Math.sin(a) * 10, 0, -Math.cos(a) * 10);
    g.yaw = a + Math.PI;
    g.fold = g.legs = 0;
    g.raft = null;
    g.water = null;
    g.escort = null;
    g.perch = rail;
    g.mode = 'land';
    g.t = 50;
    g.news = news;
    g.errand = true;
    g.life = 0;
    return true;
  }

  /** Called home: the carrier (and any riders) leave at once (a new voyage). */
  recall() {
    for (const g of this.gulls) {
      if (g.kind === 'flock') continue;
      g.mode = 'off';
      g.raft = g.perch = null;
      g.news = null;
      g.errand = false;
    }
  }

  /** Tells the carrier's news (once) and sends her about her business. */
  private deliver(g: Gull) {
    const f = g.news;
    g.news = null;
    f?.();
  }

  /** Decide what to do after a spell of soaring. */
  private plan(g: Gull, ships: Ship[], w: World) {
    if (g.kind !== 'flock') {
      const raft = g.raft;
      if (!raft) {
        g.mode = 'off';
        return;
      }
      // back down onto the flotsam once no hull is near it
      if (!raft.taken && !shipNear(ships, raft.local, 34)) return this.startLanding(g, raft, null);
      this.newCircle(g);
      g.mode = 'soar';
      g.t = 4 + Math.random() * 5;
      return;
    }
    const r = Math.random();
    let near: Ship | null = null;
    let nd = 150;
    for (const s of ships) {
      if (!s.alive || !s.root.visible) continue;
      const d = Math.hypot(s.pos.x - g.pos.x, s.pos.z - g.pos.z);
      if (d < nd) {
        nd = d;
        near = s;
      }
    }
    if (near && r < 0.28) {
      // tag along with a passing ship and wheel round her masts
      g.escort = near;
      g.mode = 'soar';
      g.t = 15 + Math.random() * 25;
      g.r = near.cls.length * (0.45 + Math.random() * 0.5);
      g.h = near.cls.masts[0].height + 6 + Math.random() * 10;
      return;
    }
    if (near && r < 0.5) {
      const free = this.perchesOf(near).filter((p) => !p.taken && this.perchOk(p));
      if (free.length) return this.startLanding(g, free[(Math.random() * free.length) | 0], null);
    }
    if (r < 0.72) {
      const p = this.freeShore(g);
      if (p) return this.startLanding(g, p, null);
    }
    if (r < 0.86) {
      for (let k = 0; k < 10; k++) {
        const a = Math.random() * TAU;
        const d = g.home.r * (0.9 + Math.random() * 0.6);
        const x = g.home.x + Math.cos(a) * d;
        const z = g.home.z + Math.sin(a) * d;
        if (w.terrain.heightAt(x, z) < -4) return this.startLanding(g, null, new THREE.Vector3(x, 0, z));
      }
    }
    this.newCircle(g);
    g.mode = 'soar';
    g.t = 10 + Math.random() * 25;
  }

  private startLanding(g: Gull, p: Perch | null, water: THREE.Vector3 | null) {
    g.escort = null;
    g.mode = 'land';
    g.t = 40;
    g.perch = p;
    g.water = water;
    if (p) p.taken = true;
  }

  private takeOff(g: Gull, w: World) {
    this.release(g);
    g.mode = 'takeoff';
    g.t = 1.3 + Math.random() * 0.5;
    // spring off into the wind
    const sp = 3 + Math.random();
    g.vel.x += -w.wind.dirX * sp + Math.sin(g.yaw) * 2;
    g.vel.z += -w.wind.dirZ * sp + Math.cos(g.yaw) * 2;
    g.vel.y = 3.2;
    g.phase = -0.6;
  }

  private scare(at: THREE.Vector3, radius: number, w: World, ship: Ship | null) {
    let shrieks = 0;
    for (const g of this.gulls) {
      if (g.mode === 'flee' || g.mode === 'off' || g.errand) continue;
      const onBoard = !!g.perch && g.perch.ship === ship && !!ship;
      const d = Math.hypot(g.pos.x - at.x, g.pos.z - at.z);
      if (!onBoard && (d > radius * (0.7 + Math.random() * 0.3) || (g.mode === 'soar' && Math.random() < 0.35))) continue;
      const grounded = g.mode === 'perch' || g.mode === 'float';
      this.release(g);
      g.escort = null;
      g.mode = 'flee';
      g.t = 2.6 + Math.random() * 2;
      g.from.copy(at);
      if (grounded) {
        g.vel.y = 4.5;
        g.phase = -0.6;
      }
      if (shrieks < 3 && Math.random() < 0.5) {
        shrieks++;
        this.cry(g, w, 1 + ((Math.random() * 3) | 0), 0.1 + Math.random() * 0.5);
      }
    }
  }

  private cry(g: Gull, w: World, notes: number, delay = 0) {
    if (!this.mesh.visible) return;
    const [vol, pan] = w.soundAt(g.pos);
    if (vol < 0.18) return;
    w.audio.gull(vol * vol, pan, notes, delay);
    if (g.mode === 'perch' || g.mode === 'float') g.call = 0.35 * notes + 0.3;
  }

  update(dt: number, w: World, ships: Ship[], cam: THREE.Camera) {
    if (dt <= 0) {
      // time stands still (a paused photo), but the camera may still roam
      this.pack(cam);
      return;
    }
    this.time += dt;
    const time = this.time;

    // the guns (and a magazine going up) put every gull nearby to flight
    for (const s of ships) {
      let last = -100;
      for (const t of s.gunFiredAt) if (t > last) last = t;
      const seen = this.gunsSeen.get(s) ?? -100;
      if (last > seen) {
        this.gunsSeen.set(s, last);
        this.scare(s.pos, SCARE_GUNS, w, s);
      }
      if (!s.alive && !this.dead.has(s)) {
        this.dead.add(s);
        this.scare(s.pos, SCARE_BOOM, w, s);
      }
    }

    // a gull somewhere within earshot calls now and then
    this.cryClock -= dt;
    if (this.cryClock < 0) {
      this.cryClock = 3 + Math.random() * 9;
      const g = this.gulls[(Math.random() * this.gulls.length) | 0];
      if (g.mode !== 'flee') this.cry(g, w, Math.random() < 0.3 ? 3 + ((Math.random() * 3) | 0) : 1 + ((Math.random() * 2) | 0));
    }

    const synced = new Set<Ship>();
    const gusty = w.gustAt;
    const upwind = Math.atan2(-w.wind.dirX, -w.wind.dirZ);

    this.gulls.forEach((g) => {
      if (g.mode === 'off') return;
      g.t -= dt;
      // a rider without its flotsam, or the carrier with her errand run, flies off and away
      if (g.kind !== 'flock' && !g.raft && !g.errand) {
        g.life -= dt;
        if (g.life < 0) {
          this.release(g);
          g.mode = 'off';
          return;
        }
      }
      let ampT = 0;
      let foldT = 0;
      let legsT = 0;
      let dihT = 0.12;
      let tailT = 0;
      let rate = 13;
      let flying = true;
      let pitchT = 0;
      let bankT = 0;
      let headT = 0;
      let nodT = 0;
      const gust = gusty(g.pos.x, g.pos.z);

      if (g.perch && g.perch.ship && !synced.has(g.perch.ship)) {
        synced.add(g.perch.ship);
        g.perch.ship.model.root.updateWorldMatrix(true, false);
      }
      if ((g.perch && !this.perchOk(g.perch)) || (g.escort && (!g.escort.alive || !g.escort.root.visible))) {
        if (g.errand) {
          // her ship is gone: the news goes back where it came from
          g.news = null;
          g.errand = false;
          g.life = 12;
        }
        if (g.mode === 'perch') this.takeOff(g, w);
        else {
          this.release(g);
          g.escort = null;
          if (g.mode === 'land') {
            this.newCircle(g);
            g.mode = 'soar';
            g.t = 8 + Math.random() * 10;
          }
        }
      }

      const hs = Math.hypot(g.vel.x, g.vel.z);
      _dv.set(0, 0, 0);
      let acc = 7;

      switch (g.mode) {
        case 'soar': {
          if (g.escort) {
            g.cx = g.escort.pos.x + g.escort.vel.x * 1.2;
            g.cz = g.escort.pos.z + g.escort.vel.z * 1.2;
          } else if (g.raft) {
            g.cx = g.raft.local.x;
            g.cz = g.raft.local.z;
          } else {
            // circles drift downwind like thermals, then the gull works back upwind
            g.cx += w.wind.dirX * 0.7 * dt;
            g.cz += w.wind.dirZ * 0.7 * dt;
          }
          const dx = g.pos.x - g.cx;
          const dz = g.pos.z - g.cz;
          const d = Math.max(0.1, Math.hypot(dx, dz));
          const err = clamp((d - g.r) / g.r, -1, 1) * 1.6;
          const sp = 9 + gust * 2.5 + (g.escort ? Math.min(g.escort.speed, 9) * 0.6 : 0);
          _dv.set(-dz / d * g.dir - (dx / d) * err, 0, dx / d * g.dir - (dz / d) * err).normalize().multiplyScalar(sp);
          const floor = w.terrain.heightAt(g.pos.x + g.vel.x * 2, g.pos.z + g.vel.z * 2) + 8;
          const hT = Math.max(g.h + Math.sin(time * 0.31 + g.seed) * 3, floor);
          _dv.y = clamp((hT - g.pos.y) * 0.6, -2.2, 3.2);
          if (g.escort) _dv.add(_t.set(g.escort.vel.x, 0, g.escort.vel.z).multiplyScalar(0.8));
          // mostly gliding, with a burst of wingbeats every so often
          g.burstClock -= dt;
          if (g.burstClock < 0) {
            g.burst = 0.9 + Math.random() * 1.8;
            g.burstClock = 4 + Math.random() * 8;
          }
          g.burst -= dt;
          const need = clamp(_dv.y * 0.35 + (sp - hs) * 0.25, 0, 1);
          ampT = Math.max(g.burst > 0 ? 0.62 : 0, need * 0.7);
          dihT = 0.14 + gust * 0.08 * Math.sin(time * 5.3 + g.seed);
          headT = -g.bank * 0.5;
          if (g.t < 0) this.plan(g, ships, w);
          break;
        }
        case 'land': {
          const T = g.perch ? this.perchWorld(g.perch, _T).setY(_T.y + LEG) : _T.set(g.water!.x, w.waterHeight(g.water!.x, g.water!.z) + 0.05 * S, g.water!.z);
          const tv = g.perch && g.perch.ship ? g.perch.ship.vel : null;
          const dx = T.x - g.pos.x;
          const dz = T.z - g.pos.z;
          const dh = Math.hypot(dx, dz);
          const d3 = Math.hypot(dh, T.y - g.pos.y);
          const sp = clamp(dh * 0.65, 1.4, 10);
          _dv.set((dx / Math.max(dh, 0.01)) * sp, 0, (dz / Math.max(dh, 0.01)) * sp);
          if (tv) _dv.add(_t.set(tv.x, 0, tv.z));
          // glide down a slope that steepens into a flare over the spot
          const above = dh > 8 ? Math.min(dh * 0.3, 14) : dh * 0.16;
          const floor = dh > 14 ? w.terrain.heightAt(g.pos.x + g.vel.x * 2, g.pos.z + g.vel.z * 2) + 6 : -Infinity;
          _dv.y = clamp((Math.max(T.y + above, floor) - g.pos.y) * 1.3, -4, 3);
          acc = dh < 10 ? 10 : 7;
          const flare = smoothstep(9, 2, dh);
          ampT = Math.max(flare * 0.9, clamp(_dv.y * 0.3, 0, 0.7));
          rate = lerp(13, 19, flare);
          dihT = lerp(0.14, 0.55, flare);
          tailT = flare;
          legsT = g.perch ? smoothstep(7, 2.5, dh) : 0;
          pitchT = -0.55 * flare;
          if (d3 < 0.45 * S || (dh < 0.6 && g.pos.y < T.y + 0.5)) {
            g.mode = g.perch ? 'perch' : 'float';
            g.t = g.perch ? 8 + Math.random() * 40 : 10 + Math.random() * 35;
            g.off.subVectors(g.pos, T);
            g.vel.set(0, 0, 0);
            g.call = 0;
            if (g.errand) {
              // feet on the rail: a long call to say she's here, and the news is told
              g.t = 7.5;
              this.cry(g, w, 4);
              g.call = 1.6;
              this.deliver(g);
            } else if (g.raft) g.t = 25 + Math.random() * 40;
          } else if (g.errand && g.t < 0) {
            // she never caught the ship up: the news is shouted down from the sky
            this.deliver(g);
            g.errand = false;
            g.life = 12;
            this.release(g);
            this.newCircle(g);
            g.mode = 'soar';
            g.t = 10;
          } else if (g.t < 0) {
            this.release(g);
            this.newCircle(g);
            g.mode = 'soar';
            g.t = 10;
          }
          break;
        }
        case 'perch':
        case 'float': {
          flying = false;
          foldT = 1;
          legsT = g.mode === 'perch' ? 1 : 0;
          if (g.mode === 'perch') {
            g.off.multiplyScalar(1 - damp(9, dt));
            this.perchWorld(g.perch!, g.pos);
            g.pos.y += LEG;
            g.pos.add(g.off);
            pitchT = 0.06;
          } else {
            const x = g.water!.x + w.wind.dirX * 0.25 * dt;
            const z = g.water!.z + w.wind.dirZ * 0.25 * dt;
            g.water!.set(x, 0, z);
            const y = w.waterHeight(x, z);
            g.pos.set(lerp(g.pos.x, x, damp(8, dt)), lerp(g.pos.y, y + 0.05 * S, damp(10, dt)), lerp(g.pos.z, z, damp(8, dt)));
            // ride the swell: tilt with the water under it
            const fx = Math.sin(g.yaw) * 0.5;
            const fz = Math.cos(g.yaw) * 0.5;
            pitchT = (w.waterHeight(x + fx, z + fz) - w.waterHeight(x - fx, z - fz)) * -0.9;
            bankT = (w.waterHeight(x + fz, z - fx) - y) * 1.2;
            for (const s of ships) {
              if (s.alive && Math.hypot(s.pos.x - x, s.pos.z - z) < s.cls.length * 0.6 + 8) {
                g.t = 0;
                break;
              }
            }
          }
          // a hull bearing down on the flotsam puts its gull up
          if (g.raft && g.mode === 'perch' && shipNear(ships, g.pos, 22)) g.t = Math.min(g.t, Math.random() * 0.4);
          // face into the wind, looking about (the carrier looks aft, along her ship, at whoever reads her news)
          const face = g.errand && g.perch?.ship ? g.perch.ship.heading + Math.PI - 0.5 : upwind + Math.sin(g.seed) * 0.5;
          g.yaw += angleDelta(g.yaw, face) * damp(1.2, dt);
          g.headClock -= dt;
          if (g.headClock < 0) {
            g.headClock = 0.6 + Math.random() * 2.4;
            g.headT = Math.random() < 0.3 ? 0 : (Math.random() - 0.5) * 2.2;
          }
          headT = g.headT;
          nodT = 0.1 + Math.sin(time * 1.7 + g.seed) * 0.05;
          if (g.call > 0) {
            // the long call: head thrown back, beak to the sky
            g.call -= dt;
            headT = 0;
            nodT = -0.7 * smoothstep(0, 0.25, g.call);
          } else if (Math.random() < dt * 0.04) this.cry(g, w, 2 + ((Math.random() * 4) | 0));
          // a lazy wing stretch now and then
          if (Math.sin(time * 0.23 + g.seed * 7) > 0.985) {
            foldT = 0.35;
            dihT = 0.9;
          }
          if (g.t < 0) {
            if (g.errand) {
              g.errand = false;
              g.life = 14;
            }
            this.takeOff(g, w);
          }
          break;
        }
        case 'takeoff': {
          const fx = Math.sin(g.yaw);
          const fz = Math.cos(g.yaw);
          _dv.set(fx * 8, 3, fz * 8);
          acc = 9;
          ampT = 1;
          rate = 19;
          dihT = 0.3;
          tailT = 0.5;
          pitchT = -0.3;
          if (g.t < 0) {
            g.mode = 'soar';
            g.t = 8 + Math.random() * 18;
            this.newCircle(g);
          }
          break;
        }
        case 'flee': {
          const dx = g.pos.x - g.from.x;
          const dz = g.pos.z - g.from.z;
          const d = Math.max(0.1, Math.hypot(dx, dz));
          const wob = Math.sin(time * 2.3 + g.seed) * 0.5;
          const ax = dx / d;
          const az = dz / d;
          _dv.set(ax * Math.cos(wob) - az * Math.sin(wob), 0, az * Math.cos(wob) + ax * Math.sin(wob)).multiplyScalar(13);
          _dv.y = 5;
          acc = 13;
          ampT = 1;
          rate = 20;
          dihT = 0.2;
          if (g.t < 0) {
            g.mode = 'soar';
            g.t = 10 + Math.random() * 15;
            this.newCircle(g);
            g.h += 6;
          }
          break;
        }
      }

      if (flying) {
        // steer: ease the velocity toward the wish, limited like real wing loading
        _v.subVectors(_dv, g.vel).multiplyScalar(1.6);
        const ah = Math.hypot(_v.x, _v.z);
        if (ah > acc) {
          _v.x *= acc / ah;
          _v.z *= acc / ah;
        }
        _v.y = clamp(_v.y, -6, 8);
        // a gust lifts and rocks it
        _v.y += gust * Math.sin(time * 3.1 + g.seed * 3) * 1.5;
        g.vel.addScaledVector(_v, dt);
        g.pos.addScaledVector(g.vel, dt);
        const sp = Math.hypot(g.vel.x, g.vel.z);
        if (sp > 0.4) g.yaw += angleDelta(g.yaw, Math.atan2(g.vel.x, g.vel.z)) * damp(6, dt);
        const lat = (g.vel.z * _v.x - g.vel.x * _v.z) / Math.max(sp, 1);
        bankT = clamp(-Math.atan(lat / 9.8) * 1.4, -1.0, 1.0) + gust * Math.sin(time * 6.7 + g.seed) * 0.12;
        pitchT += clamp(-Math.atan2(g.vel.y, Math.max(sp, 1)) * 0.6, -0.45, 0.45);
        // a strong climb or a slow crawl through the air needs wingbeats
        ampT = Math.max(ampT, clamp((g.vel.y - 1) * 0.25, 0, 0.8));
      }

      // ease the rig toward this frame's pose
      const k = damp(flying ? 5 : 8, dt);
      g.amp = lerp(g.amp, ampT, damp(4, dt));
      g.fold = lerp(g.fold, foldT, damp(foldT > g.fold ? 5 : 9, dt));
      g.legs = lerp(g.legs, legsT, damp(4, dt));
      g.dih = lerp(g.dih, dihT, damp(5, dt));
      g.tail = lerp(g.tail, tailT, damp(5, dt));
      g.head = lerp(g.head, headT, damp(6, dt));
      g.nod = lerp(g.nod, nodT, damp(8, dt));
      g.bank = lerp(g.bank, bankT, k);
      g.pitch = lerp(g.pitch, pitchT, k);
      // keep beating through the stroke while gliding settles the wings level
      g.phase = (g.phase + dt * rate * (0.3 + 0.7 * Math.min(1, g.amp * 2))) % TAU;

    });
    this.pack(cam);
  }

  /**
   * Only the gulls in view (or casting a shadow into it) go to the GPU,
   * packed to the front; a speck past the fog's reach is left out too.
   */
  private pack(cam: THREE.Camera) {
    _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _fr.setFromProjectionMatrix(_pm);
    let n = 0;
    const c = this.carrier;
    if (c.news && c.mode !== 'off') {
      _e.set(c.pitch, c.yaw, c.bank);
      _q.setFromEuler(_e);
      _m.compose(c.pos, _q, _s);
      this.scroll.setMatrixAt(0, _m);
      this.scroll.count = 1;
      this.scroll.instanceMatrix.needsUpdate = true;
    } else this.scroll.count = 0;
    for (const g of this.gulls) {
      if (g.mode === 'off') continue;
      // the shadow can land well to the side of a high gull: the sphere grows with height
      _sph.center.copy(g.pos);
      _sph.radius = 2 + Math.max(0, g.pos.y) * 1.6;
      if (_sph.center.distanceToSquared(cam.position) > GULL_FAR * GULL_FAR || !_fr.intersectsSphere(_sph)) continue;
      this.wingA.setXYZW(n, g.phase, g.amp, g.fold, g.legs);
      this.wingB.setXYZW(n, g.dih, g.head, g.tail, g.nod);
      _e.set(g.pitch, g.yaw, g.bank);
      _q.setFromEuler(_e);
      _m.compose(g.pos, _q, _s);
      this.mesh.setMatrixAt(n++, _m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.wingA.needsUpdate = true;
    this.wingB.needsUpdate = true;
  }
}
