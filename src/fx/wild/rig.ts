import * as THREE from 'three';
import { patchMaterial } from '../../render/environment';

// The island beasts' shared skeleton. Every animal, goat or crab or macaw, is
// one sculpted, vertex-coloured mesh whose vertices each know which joint
// moves them: the head and neck (bending through a weight that grows along
// the neck), the legs (swinging through the gait with a knee lift), the tail,
// the wings (folding back along the flanks or beating), and two spare joints
// for each animal's own trick (a jaw, an ear flick, a dewlap, a raised claw).
// The pose is a dozen numbers per animal, set on the CPU and applied in the
// vertex shader, so every species draws in one instanced call and all of them
// share one program (and one shadow program).
//
// Each vertex also carries a second colouring: an individual can wear either
// (a white goat or a brown one, a scarlet macaw or a blue-and-gold, a striped
// piglet beside its sow) at no extra cost.

export type V3 = [number, number, number];
export type C3 = [number, number, number];
/** A vertex's two colourings. */
export type Paint = (p: THREE.Vector3, n: THREE.Vector3, t: number) => [C3, C3];

/** Joints (`part`): what moves a vertex. */
export const BODY = 0;
export const HEAD = 1;
export const LEG = 2;
export const TAIL = 3;
export const WING = 4;
export const SPEC_A = 5;
export const SPEC_B = 6;

/** Leg swing axes (`f` on a leg): fore-and-aft, out to the side (crabs), or round the hip (sprawling lizards). */
export const AX_X = 0;
export const AX_Z = 1;
export const AX_Y = 2;
/** Added to a leg's axis: it also folds up under the body with special A (a flamingo's one-leg stance). */
export const TUCK_A = 4;

export interface Bone {
  part: number;
  /** Weight (or per-vertex weight) of the joint. */
  w: number | ((p: THREE.Vector3) => number);
  /** Leg: phase offset in the gait. Head: how far it draws back with special A (tortoise). */
  z: number;
  /** Leg: axis (+ TUCK_A). Wing / special: side (+1 left, -1 right; 0 = nod about x). */
  f: number;
  piv: V3;
  /** How much the head joint moves it too (necks blend from 0 to 1). */
  hw: number | ((p: THREE.Vector3) => number);
}

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _t = new THREE.Vector3();
const _w = new THREE.Vector3();
const _d = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export interface TubeRing {
  p: V3;
  /** Half-width (side to side) and half-height of the cross-section. */
  rx: number;
  ry?: number;
}

/** A ring halfway between each pair, on a Catmull-Rom curve through them (radii too). */
function smoothRings(r: TubeRing[]): TubeRing[] {
  const cr = (a: number, b: number, c: number, d: number) => (-a + 9 * b + 9 * c - d) / 16;
  const out: TubeRing[] = [];
  for (let i = 0; i < r.length - 1; i++) {
    const a = r[Math.max(0, i - 1)];
    const b = r[i];
    const c = r[i + 1];
    const d = r[Math.min(r.length - 1, i + 2)];
    out.push(b);
    out.push({
      p: [cr(a.p[0], b.p[0], c.p[0], d.p[0]), cr(a.p[1], b.p[1], c.p[1], d.p[1]), cr(a.p[2], b.p[2], c.p[2], d.p[2])],
      rx: Math.max(0.0005, cr(a.rx, b.rx, c.rx, d.rx)),
      ry: Math.max(0.0005, cr(a.ry ?? a.rx, b.ry ?? b.rx, c.ry ?? c.rx, d.ry ?? d.rx)),
    });
  }
  out.push(r[r.length - 1]);
  return out;
}

/** A little modelling kit: tubes, blobs and thin slabs, each tagged with its joint. */
export class Sculpt {
  private pos: number[] = [];
  private col: number[] = [];
  private alt: number[] = [];
  private rig: number[] = [];
  private piv: number[] = [];
  private hd: number[] = [];
  private idx: number[] = [];
  private bone: Bone = { part: BODY, w: 1, z: 0, f: 0, piv: [0, 0, 0], hw: 0 };
  /** Raises (or with a negative value, lowers) everything added from now on, pivots too. */
  lift = 0;

  /** The neck's root: the head joint turns everything about it. */
  constructor(private headPiv: V3 = [0, 0, 0]) {}

  /** Tag what comes next with this joint (fields not given reset to defaults). */
  set(b: Partial<Bone>) {
    this.bone = { part: BODY, w: 1, z: 0, f: 0, piv: [0, 0, 0], hw: 0, ...b };
    return this;
  }

  private vert(p: THREE.Vector3, n: THREE.Vector3, paint: Paint, t: number) {
    const [a, b] = paint(p, n, t);
    const bn = this.bone;
    const l = this.lift;
    this.pos.push(p.x, p.y + l, p.z);
    this.col.push(a[0], a[1], a[2]);
    this.alt.push(b[0], b[1], b[2]);
    const w = typeof bn.w === 'number' ? bn.w : bn.w(p);
    const hw = typeof bn.hw === 'number' ? bn.hw : bn.hw(p);
    this.rig.push(bn.part, w, bn.z, bn.f);
    this.piv.push(bn.piv[0], bn.piv[1] + l, bn.piv[2]);
    this.hd.push(this.headPiv[0], this.headPiv[1] + l, this.headPiv[2], hw);
    return this.pos.length / 3 - 1;
  }

  /**
   * A tube through `rings` (each an ellipse, side half-width rx, half-height
   * ry), its frame carried along the path so it never twists. The ends are
   * rounded off with a cap reaching `cap0` / `cap1` radii past them (0 = flat-ish).
   * Longer tubes get a ring between each pair, on a smooth curve through them.
   */
  tube(rings: TubeRing[], paint: Paint, sides = 8, cap0 = 0.6, cap1 = 0.6, smooth = true) {
    if (smooth && rings.length > 2) rings = smoothRings(rings);
    const n = rings.length;
    const ids: number[][] = [];
    const pts = rings.map((r) => new THREE.Vector3(...r.p));
    let u0: THREE.Vector3 | null = null;
    const tans: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const t = new THREE.Vector3().subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
      tans.push(t);
    }
    // a frame that starts side-on and is carried along without spinning
    const u = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const t = tans[i];
      if (!u0) {
        const ref = Math.abs(t.y) > 0.9 ? _a.set(0, 0, 1) : _a.set(0, 1, 0);
        u.crossVectors(t, ref).normalize();
        if (Math.abs(t.y) <= 0.9 && u.x < 0) u.negate();
        u0 = u.clone();
      } else u.addScaledVector(t, -u.dot(t)).normalize();
      const w = _w.crossVectors(t, u).normalize();
      if (Math.abs(t.y) <= 0.9 && w.y < 0) w.negate();
      const R = rings[i];
      const ry = R.ry ?? R.rx;
      const ring: number[] = [];
      for (let s = 0; s < sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        _d.copy(u).multiplyScalar(sn * R.rx).addScaledVector(w, c * ry);
        _p.copy(pts[i]).add(_d);
        _n.copy(u).multiplyScalar(sn / Math.max(R.rx, 1e-4)).addScaledVector(w, c / Math.max(ry, 1e-4)).normalize();
        ring.push(this.vert(_p, _n, paint, i / (n - 1)));
      }
      ids.push(ring);
    }
    for (let i = 0; i < n - 1; i++) {
      for (let s = 0; s < sides; s++) {
        const s2 = (s + 1) % sides;
        this.quad(ids[i][s], ids[i][s2], ids[i + 1][s2], ids[i + 1][s], pts[i].clone().lerp(pts[i + 1], 0.5));
      }
    }
    // rounded ends
    const capEnd = (i: number, dir: number, k: number) => {
      const R = rings[i];
      const r = Math.min(R.rx, R.ry ?? R.rx);
      _p.copy(pts[i]).addScaledVector(tans[i], dir * r * k);
      _n.copy(tans[i]).multiplyScalar(dir);
      const tip = this.vert(_p, _n, paint, dir < 0 ? 0 : 1);
      for (let s = 0; s < sides; s++) this.tri(ids[i][s], ids[i][(s + 1) % sides], tip, pts[i]);
    };
    capEnd(0, -1, cap0);
    capEnd(n - 1, 1, cap1);
    return this;
  }

  /** An ellipsoid centred at `c` with half-axes r, its long axis along `axis` (default z). */
  blob(c: V3, r: V3, paint: Paint, sides = 8, rings = 6, axis: V3 = [0, 0, 1]) {
    const ax = new THREE.Vector3(...axis).normalize();
    const along = Math.abs(ax.z) > 0.5 ? r[2] : Math.abs(ax.y) > 0.5 ? r[1] : r[0];
    const sx = Math.abs(ax.x) > 0.5 ? r[2] : r[0];
    const sy = Math.abs(ax.y) > 0.5 ? r[2] : r[1];
    const out: TubeRing[] = [];
    for (let i = 0; i <= rings; i++) {
      const th = 0.12 + (i / rings) * (Math.PI - 0.24);
      const k = Math.sin(th);
      const o = -Math.cos(th) * along;
      out.push({ p: [c[0] + ax.x * o, c[1] + ax.y * o, c[2] + ax.z * o], rx: sx * k, ry: sy * k });
    }
    return this.tube(out, paint, sides, 0.9, 0.9, false);
  }

  /**
   * A thin double-sided plate (wing, ear, fin, webbed foot, tail fan): the
   * outline is fanned from its first point, `top` painting the side the
   * outline's winding faces (or the side toward `face`), `bottom` the other.
   */
  slab(outline: V3[], thick: number, top: Paint, bottom: Paint = top, face?: V3) {
    const pts = outline.map((p) => new THREE.Vector3(...p));
    // the plate's facing, from the winding (turned toward `face` when given)
    const nrm = new THREE.Vector3();
    for (let i = 1; i + 1 < pts.length; i++) nrm.add(_a.subVectors(pts[i], pts[0]).cross(_b.subVectors(pts[i + 1], pts[0])));
    nrm.normalize();
    if (face && nrm.dot(_a.set(...face)) < 0) nrm.negate();
    const mid = pts.reduce((m, p) => m.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    for (const side of [1, -1]) {
      const ids = pts.map((p, i) => this.vert(_p.copy(p).addScaledVector(nrm, (side * thick) / 2), _n.copy(nrm).multiplyScalar(side), side > 0 ? top : bottom, i / (pts.length - 1)));
      const inside = _t.copy(mid).addScaledVector(nrm, -side);
      for (let i = 1; i + 1 < ids.length; i++) this.tri(ids[0], ids[i], ids[i + 1], inside.clone());
    }
    return this;
  }

  /** A triangle wound to face away from `inside`. */
  private tri(a: number, b: number, c: number, inside: THREE.Vector3) {
    const P = this.pos;
    _a.set(P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]);
    _b.set(P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]);
    _a.cross(_b);
    _d.set((P[a * 3] + P[b * 3] + P[c * 3]) / 3 - inside.x, (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3 - inside.y, (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3 - inside.z);
    if (_a.dot(_d) < 0) this.idx.push(a, c, b);
    else this.idx.push(a, b, c);
  }

  private quad(a: number, b: number, c: number, d: number, inside: THREE.Vector3) {
    this.tri(a, b, c, inside);
    this.tri(a, c, d, inside);
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aAlt', new THREE.Float32BufferAttribute(this.alt, 3));
    g.setAttribute('aRig', new THREE.Float32BufferAttribute(this.rig, 4));
    g.setAttribute('aPivot', new THREE.Float32BufferAttribute(this.piv, 3));
    g.setAttribute('aHead', new THREE.Float32BufferAttribute(this.hd, 4));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------- shader

const RIG_GLSL = /* glsl */ `
attribute vec4 aRig;   // joint, weight, leg phase / head draw-back, axis / side
attribute vec3 aPivot;
attribute vec4 aHead;  // neck root, head weight
attribute vec3 aAlt;
attribute vec4 aPoseA; // gait phase, stride, head pitch, head yaw
attribute vec4 aPoseB; // wingbeat phase, wingbeat, wing fold, tail wag
attribute vec4 aPoseC; // special A, special B (also lifts the tail and raises the wings), legs tucked, shade (+2: the second colouring)
vec3 wRotX(vec3 p, vec3 o, float a) { p -= o; float c = cos(a), s = sin(a); return o + vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
vec3 wRotY(vec3 p, vec3 o, float a) { p -= o; float c = cos(a), s = sin(a); return o + vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 wRotZ(vec3 p, vec3 o, float a) { p -= o; float c = cos(a), s = sin(a); return o + vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
// k = 1 poses a point, k = 0 a normal (pivots collapse to the origin, shifts vanish)
vec3 wildPose(vec3 p, float k) {
  float part = aRig.x;
  float w = aRig.y;
  vec3 o = aPivot * k;
  if (part > 1.5 && part < 2.5) {
    // a leg swings through the gait; the foot lifts as it comes forward
    float ph = aPoseA.x + aRig.z;
    float a = sin(ph) * aPoseA.y;
    float ax = mod(aRig.w, 4.0);
    // tucked: folded up under the belly (lying down) or trailed behind (in flight)
    p = o + (p - o) * mix(1.0, 0.45, aPoseC.z);
    a = mix(a, 1.35, aPoseC.z);
    if (aRig.w > 3.5) {
      // drawn up into the belly feathers
      p = o + (p - o) * mix(1.0, 0.3, aPoseC.x);
      a = mix(a, 1.6, aPoseC.x);
    }
    float lift = max(0.0, cos(ph)) * aPoseA.y * 0.55 * (1.0 - aPoseC.z) * max(0.0, aPivot.y - p.y) * k;
    if (ax < 0.5) p = wRotX(p, o, a);
    else if (ax < 1.5) p = wRotZ(p, o, a * sign(aPivot.x + 1e-4));
    else p = wRotY(p, o, a * sign(aPivot.x + 1e-4));
    p.y += lift;
  } else if (part > 2.5 && part < 3.5) {
    p = wRotY(p, o, aPoseB.w * w);
    p = wRotX(p, o, aPoseC.y * w);
  } else if (part > 3.5 && part < 4.5) {
    // a wing folds back along the flank (span drawn in, swept back) or beats, the hand lagging
    float side = aRig.w;
    float fold = aPoseB.z;
    vec3 d = p - o;
    d.x *= mix(1.0, 0.42, fold);
    d.y *= mix(1.0, 0.6, fold);
    p = o + d;
    p = wRotY(p, o, side * fold * 1.45);
    p = wRotZ(p, o, -side * fold * 0.12);
    float beat = sin(aPoseB.x - w * 0.8) * aPoseB.y * (1.0 + 0.35 * w) + 0.08 * (1.0 - fold) + aPoseC.y;
    p = wRotZ(p, o, side * beat * (1.0 - fold * 0.85));
  } else if (part > 4.5) {
    float s = part < 5.5 ? aPoseC.x : aPoseC.y;
    if (abs(aRig.w) < 0.5) p = wRotX(p, o, s * w);
    else p = wRotZ(p, o, s * w * aRig.w);
  }
  if (aHead.w > 0.0) {
    vec3 h = aHead.xyz * k;
    if (part < 4.5) p.z -= aPoseC.x * aRig.z * aHead.w * k;
    p = wRotX(p, h, aPoseA.z * aHead.w);
    p = wRotY(p, h, aPoseA.w * aHead.w);
  }
  return p;
}
`;

export function rigShader(shader: { vertexShader: string }, full: boolean) {
  let v = shader.vertexShader.replace('#include <common>', `#include <common>\n${RIG_GLSL}`);
  if (full) {
    v = v.replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(wildPose(normal, 0.0));');
    // the shade, and which of the two colourings this one wears
    v = v.replace('#include <color_vertex>', '#include <color_vertex>\n  vColor.rgb = aPoseC.w > 1.9 ? aAlt * (aPoseC.w - 2.0) : vColor.rgb * aPoseC.w;');
  }
  shader.vertexShader = v.replace('#include <begin_vertex>', 'vec3 transformed = wildPose(position, 1.0);');
}

/** The one material every beast draws with, and its shadow twin. */
export function wildMaterials() {
  const mat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 }), { clouds: true });
  const base = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    base.call(mat, shader, r);
    rigShader(shader, true);
  };
  const prevKey = mat.customProgramCacheKey;
  mat.customProgramCacheKey = () => prevKey.call(mat) + '|wild';
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => rigShader(shader, false);
  depth.customProgramCacheKey = () => 'wild-depth';
  return { mat, depth };
}

// ---------------------------------------------------------------- paint helpers

/** An sRGB hex colour, in the working (linear) space vertex colours are read in. */
export const hex = (h: number): C3 => {
  const c = new THREE.Color(h);
  return [c.r, c.g, c.b];
};
export const mix3 = (a: C3, b: C3, t: number): C3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mul3 = (a: C3, k: number): C3 => [a[0] * k, a[1] * k, a[2] * k];
/** One colour for both colourings. */
export const flat = (c: C3, alt: C3 = c): Paint => () => [c, alt];
/** Darker back, paler belly, blended over the flank. */
export const twoTone = (back: C3, belly: C3, altBack: C3 = back, altBelly: C3 = belly, lo = -0.35, hi = 0.25): Paint => (_p, n) => {
  const k = Math.min(1, Math.max(0, (n.y - lo) / (hi - lo)));
  return [mix3(belly, back, k), mix3(altBelly, altBack, k)];
};
