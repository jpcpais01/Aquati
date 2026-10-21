// A small signed-distance sculpting kit for the figureheads, used offline by
// bake.ts. Shapes are blended with smooth unions (and carved with smooth
// subtractions) the way a carver would rough out and round over a block, so
// faces, hair, feathers and scales flow into each other instead of reading
// as stacked primitives. Colour rides along with the blend.
//
// Coordinates are figure units (a figure is about 1.3 units tall).

export type V3 = [number, number, number];
export type RGB = [number, number, number];

export interface Shape {
  /** Bounds of the shape itself (blend radius is added when culling). */
  min: V3;
  max: V3;
  d: (x: number, y: number, z: number) => number;
  col: RGB;
  /** Smooth radius of this shape's union (or carve) with what came before. */
  k: number;
  /** Carves the shape out of what came before, leaving `col` on the cut. */
  sub?: boolean;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const hex = (h: number): RGB => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
export const mixC = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => mul(a, 1 / (len(a) || 1));
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Rotates about x by a (y up, z forward: positive tips +y towards +z). */
export const rotX = (p: V3, a: number): V3 => [p[0], p[1] * Math.cos(a) - p[2] * Math.sin(a), p[1] * Math.sin(a) + p[2] * Math.cos(a)];
export const rotY = (p: V3, a: number): V3 => [p[0] * Math.cos(a) + p[2] * Math.sin(a), p[1], -p[0] * Math.sin(a) + p[2] * Math.cos(a)];
export const rotZ = (p: V3, a: number): V3 => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a), p[2]];

/** An orthonormal frame with its y along `up`, its z as close to `fwd` as it can be. */
export function frameY(up: V3, fwd: V3 = [0, 0, 1]): [V3, V3, V3] {
  const y = norm(up);
  let x = cross(y, fwd);
  if (len(x) < 1e-4) x = cross(y, [1, 0, 0]);
  x = norm(x);
  const z = cross(x, y);
  return [x, y, z];
}

/** Catmull-Rom (centripetal-ish uniform) through points: samples n+1 points. */
export function spline(pts: V3[], n: number): V3[] {
  const out: V3[] = [];
  const m = pts.length - 1;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * m;
    const s = Math.min(m - 1, Math.floor(t));
    const u = t - s;
    const p0 = pts[Math.max(0, s - 1)];
    const p1 = pts[s];
    const p2 = pts[s + 1];
    const p3 = pts[Math.min(m, s + 2)];
    const u2 = u * u;
    const u3 = u2 * u;
    const c = (a: number, b: number, cc: number, d: number) => 0.5 * (2 * b + (-a + cc) * u + (2 * a - 5 * b + 4 * cc - d) * u2 + (-a + 3 * b - 3 * cc + d) * u3);
    out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1]), c(p0[2], p1[2], p2[2], p3[2])]);
  }
  return out;
}

function boundsOf(pts: V3[], r: number): [V3, V3] {
  const mn: V3 = [Infinity, Infinity, Infinity];
  const mx: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let i = 0; i < 3; i++) {
    mn[i] = Math.min(mn[i], p[i] - r);
    mx[i] = Math.max(mx[i], p[i] + r);
  }
  return [mn, mx];
}

/** Exact distance to a round cone (a sphere-swept cone from a, radius ra, to b, radius rb). */
function roundCone(a: V3, b: V3, ra: number, rb: number) {
  const ba = sub(b, a);
  const l2 = dot(ba, ba);
  if (l2 < 1e-10) return (x: number, y: number, z: number) => Math.hypot(x - a[0], y - a[1], z - a[2]) - Math.max(ra, rb);
  const rr = ra - rb;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  return (x: number, y: number, z: number) => {
    const pax = x - a[0];
    const pay = y - a[1];
    const paz = z - a[2];
    const yv = pax * ba[0] + pay * ba[1] + paz * ba[2];
    const zz = yv - l2;
    const qx = pax * l2 - ba[0] * yv;
    const qy = pay * l2 - ba[1] * yv;
    const qz = paz * l2 - ba[2] * yv;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = yv * yv * l2;
    const zz2 = zz * zz * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zz) * a2 * zz2 > k) return Math.sqrt(x2 + zz2) * il2 - rb;
    if (Math.sign(yv) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
    return (Math.sqrt(x2 * a2 * il2) + yv * rr) * il2 - ra;
  };
}

export interface TubeOpts {
  /** Radius along the tube, u 0..1. */
  r: (u: number) => number;
  /** Squash of the cross-section across the tube (1 round, <1 flat ribbon), and which way is "flat". */
  flat?: number;
  flatN?: V3;
  /** Surface relief: given u, the angle round the tube and arc length, a distance to add. */
  relief?: (u: number, ang: number, s: number) => number;
  samples?: number;
}

export class Scene {
  shapes: Shape[] = [];

  private push(min: V3, max: V3, d: Shape['d'], col: RGB, k: number, isSub = false) {
    this.shapes.push({ min, max, d, col, k, sub: isSub });
    return this;
  }

  sphere(c: V3, r: number, col: RGB, k = 0.02, isSub = false) {
    return this.push(sub(c, [r, r, r]), add(c, [r, r, r]), (x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r, col, k, isSub);
  }

  /** An ellipsoid with radii along a frame (default world axes). */
  ellipsoid(c: V3, rad: V3, col: RGB, k = 0.02, frame?: [V3, V3, V3], isSub = false) {
    const [X, Y, Z] = frame ?? [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const m = Math.max(...rad);
    return this.push(sub(c, [m, m, m]), add(c, [m, m, m]), (x, y, z) => {
      const px = x - c[0];
      const py = y - c[1];
      const pz = z - c[2];
      const lx = (px * X[0] + py * X[1] + pz * X[2]) / rad[0];
      const ly = (px * Y[0] + py * Y[1] + pz * Y[2]) / rad[1];
      const lz = (px * Z[0] + py * Z[1] + pz * Z[2]) / rad[2];
      const k0 = Math.hypot(lx, ly, lz);
      const k1 = Math.hypot(lx / rad[0], ly / rad[1], lz / rad[2]);
      return k1 < 1e-9 ? -Math.min(...rad) : (k0 * (k0 - 1)) / k1;
    }, col, k, isSub);
  }

  cone(a: V3, b: V3, ra: number, rb: number, col: RGB, k = 0.02, isSub = false) {
    const [mn, mx] = boundsOf([a, b], Math.max(ra, rb));
    return this.push(mn, mx, roundCone(a, b, ra, rb), col, k, isSub);
  }

  /** A smooth tube through points: a chain of round cones, optionally flattened and carved with relief. */
  tube(pts: V3[], o: TubeOpts, col: RGB, k = 0.02, isSub = false) {
    const n = o.samples ?? Math.max(8, pts.length * 6);
    const P = spline(pts, n);
    const R = P.map((_, i) => o.r(i / n));
    const S: number[] = [0];
    for (let i = 1; i <= n; i++) S.push(S[i - 1] + len(sub(P[i], P[i - 1])));
    const segs = P.slice(0, -1).map((p, i) => roundCone(p, P[i + 1], R[i], R[i + 1]));
    const mids = P.slice(0, -1).map((p, i) => lerp3(p, P[i + 1], 0.5));
    const reach = P.slice(0, -1).map((p, i) => len(sub(P[i + 1], p)) / 2 + Math.max(R[i], R[i + 1]));
    const flat = o.flat ?? 1;
    const fN = o.flatN ? norm(o.flatN) : null;
    // a reference "up" round the tube for the relief angle
    const ups: V3[] = P.map((p, i) => {
      const t = norm(sub(P[Math.min(n, i + 1)], P[Math.max(0, i - 1)]));
      const ref: V3 = fN ?? (Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
      return norm(cross(t, cross(ref, t)));
    });
    const tns = P.slice(0, -1).map((p, i) => norm(sub(P[i + 1], p)));
    const segL = P.slice(0, -1).map((p, i) => len(sub(P[i + 1], p)) || 1e-6);
    const sides = tns.map((t, i) => cross(t, ups[i]));
    const [mn, mx] = boundsOf(P, Math.max(...R) + 0.02);
    const relief = o.relief;
    return this.push(mn, mx, (x, y, z) => {
      let best = Infinity;
      let bi = 0;
      for (let i = 0; i < segs.length; i++) {
        const c = mids[i];
        const dc = Math.sqrt((x - c[0]) * (x - c[0]) + (y - c[1]) * (y - c[1]) + (z - c[2]) * (z - c[2])) - reach[i];
        if (dc > best) continue;
        // flatten: squash the point's offset along the flat normal before measuring
        let qx = x;
        let qy = y;
        let qz = z;
        if (fN && flat !== 1) {
          const c = P[i];
          const off = (x - c[0]) * fN[0] + (y - c[1]) * fN[1] + (z - c[2]) * fN[2];
          const sq = off * (1 / flat - 1);
          qx += fN[0] * sq;
          qy += fN[1] * sq;
          qz += fN[2] * sq;
        }
        const d = segs[i](qx, qy, qz);
        if (d < best) {
          best = d;
          bi = i;
        }
      }
      if (fN && flat !== 1) best *= flat;
      if (relief) {
        const a = P[bi];
        const T = tns[bi];
        const sl = segL[bi];
        const t = clamp(((x - a[0]) * T[0] + (y - a[1]) * T[1] + (z - a[2]) * T[2]) / sl, 0, 1);
        const rx = x - a[0] - T[0] * sl * t;
        const ry = y - a[1] - T[1] * sl * t;
        const rz = z - a[2] - T[2] * sl * t;
        const up = ups[bi];
        const sd = sides[bi];
        const ang = Math.atan2(rx * sd[0] + ry * sd[1] + rz * sd[2], rx * up[0] + ry * up[1] + rz * up[2]);
        best += relief((bi + t) / segs.length, ang, S[bi] + sl * t);
      }
      return best;
    }, col, k, isSub);
  }

  /** A torus round `axis` through c. */
  torus(c: V3, axis: V3, R: number, r: number, col: RGB, k = 0.01, isSub = false) {
    const [X, Y, Z] = frameY(axis);
    const m = R + r;
    return this.push(sub(c, [m, m, m]), add(c, [m, m, m]), (x, y, z) => {
      const px = x - c[0];
      const py = y - c[1];
      const pz = z - c[2];
      const lx = px * X[0] + py * X[1] + pz * X[2];
      const ly = px * Y[0] + py * Y[1] + pz * Y[2];
      const lz = px * Z[0] + py * Z[1] + pz * Z[2];
      return Math.hypot(Math.hypot(lx, lz) - R, ly) - r;
    }, col, k, isSub);
  }

  /** A rounded box in a frame. */
  box(c: V3, half: V3, round: number, col: RGB, k = 0.01, frame?: [V3, V3, V3], isSub = false) {
    const [X, Y, Z] = frame ?? [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const m = Math.hypot(...half);
    return this.push(sub(c, [m, m, m]), add(c, [m, m, m]), (x, y, z) => {
      const px = x - c[0];
      const py = y - c[1];
      const pz = z - c[2];
      const qx = Math.abs(px * X[0] + py * X[1] + pz * X[2]) - half[0] + round;
      const qy = Math.abs(px * Y[0] + py * Y[1] + pz * Y[2]) - half[1] + round;
      const qz = Math.abs(px * Z[0] + py * Z[1] + pz * Z[2]) - half[2] + round;
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - round;
    }, col, k, isSub);
  }

  /**
   * A leaf, feather or fin: a flattened, tapering blade from a towards b, its
   * flat face across n, curling by `curl` (along n) towards the tip.
   */
  blade(a: V3, b: V3, width: number, thick: number, n: V3, col: RGB, k = 0.01, curl = 0, rib = 0) {
    const dir = norm(sub(b, a));
    const L = len(sub(b, a));
    const nn = norm(sub(n, mul(dir, dot(n, dir))));
    const across = cross(dir, nn);
    const [mn, mx] = boundsOf([a, b], width + Math.abs(curl) + thick);
    return this.push(mn, mx, (x, y, z) => {
      const px = x - a[0];
      const py = y - a[1];
      const pz = z - a[2];
      const t = (px * dir[0] + py * dir[1] + pz * dir[2]) / L;
      const tc = clamp(t, 0, 1);
      let w = (px * nn[0] + py * nn[1] + pz * nn[2]) - curl * tc * tc;
      const s = px * across[0] + py * across[1] + pz * across[2];
      // half-width: round at the root, a point at the tip
      const hw = width * Math.sqrt(Math.max(0, tc * (1 - tc))) * 2 * (1 - 0.35 * tc) + 1e-4;
      const ht = thick * (1 - 0.6 * tc) + 1e-4;
      if (rib) w -= rib * Math.max(0, 1 - Math.abs(s) / (hw * 0.25 + 1e-4)) * (1 - tc);
      // distance to an ellipse-ish section, plus the run past the ends
      const e = Math.hypot(s / hw, w / ht) - 1;
      const inside = e * Math.min(hw, ht);
      const past = Math.max(-t, t - 1) * L;
      return Math.max(inside, past);
    }, col, k);
  }
  /** A flat triangular sheet of a given half-thickness, rounded at its edges: a membrane or a panel. */
  sheet(a: V3, b: V3, c: V3, thick: number, col: RGB, k = 0.01, isSub = false) {
    const ba = sub(b, a), cb = sub(c, b), ac = sub(a, c);
    const nor = cross(ba, ac);
    const n2 = dot(nor, nor);
    const e1 = cross(ba, nor), e2 = cross(cb, nor), e3 = cross(ac, nor);
    const d2 = (e: V3, px: number, py: number, pz: number) => {
      const t = clamp((e[0] * px + e[1] * py + e[2] * pz) / dot(e, e), 0, 1);
      const qx = e[0] * t - px, qy = e[1] * t - py, qz = e[2] * t - pz;
      return qx * qx + qy * qy + qz * qz;
    };
    const [mn, mx] = boundsOf([a, b, c], thick);
    return this.push(mn, mx, (x, y, z) => {
      const pa: V3 = [x - a[0], y - a[1], z - a[2]];
      const pb: V3 = [x - b[0], y - b[1], z - b[2]];
      const pc: V3 = [x - c[0], y - c[1], z - c[2]];
      const out = Math.sign(dot(e1, pa)) + Math.sign(dot(e2, pb)) + Math.sign(dot(e3, pc)) < 2;
      const dd = out ? Math.min(d2(ba, pa[0], pa[1], pa[2]), d2(cb, pb[0], pb[1], pb[2]), d2(ac, pc[0], pc[1], pc[2])) : (dot(nor, pa) * dot(nor, pa)) / n2;
      return Math.sqrt(dd) - thick;
    }, col, k, isSub);
  }

}

/** Evaluates a list of shapes (in order) at a point: distance only. */
/** Distance from a point to a shape's bounds (0 inside): a lower bound on its distance. */
function boxDist(s: Shape, x: number, y: number, z: number) {
  const dx = Math.max(s.min[0] - x, 0, x - s.max[0]);
  const dy = Math.max(s.min[1] - y, 0, y - s.max[1]);
  const dz = Math.max(s.min[2] - z, 0, z - s.max[2]);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function evalD(list: Shape[], x: number, y: number, z: number) {
  let d = 1e9;
  for (const s of list) {
    // a shape this far off can't change the result
    const lb = boxDist(s, x, y, z);
    if (s.sub ? lb > s.k + Math.max(0, -d) : lb > d + s.k) continue;
    const b = s.d(x, y, z);
    const k = s.k;
    if (s.sub) {
      if (k <= 1e-6) d = Math.max(d, -b);
      else {
        const h = clamp(0.5 - (0.5 * (d + b)) / k, 0, 1);
        d = d + (-b - d) * h + k * h * (1 - h);
      }
    } else if (k <= 1e-6) d = Math.min(d, b);
    else {
      const h = clamp(0.5 + (0.5 * (b - d)) / k, 0, 1);
      d = b + (d - b) * h - k * h * (1 - h);
    }
  }
  return d;
}

/** Distance and colour. Colour transitions are a little sharper than the shape blends. */
export function evalDC(list: Shape[], x: number, y: number, z: number): [number, RGB] {
  let d = 1e9;
  let c: RGB = [1, 0, 1];
  const sharp = (h: number) => clamp((h - 0.5) * 1.8 + 0.5, 0, 1);
  for (const s of list) {
    const b = s.d(x, y, z);
    const k = s.k;
    if (s.sub) {
      const kk = Math.max(k, 1e-6);
      const h = clamp(0.5 - (0.5 * (d + b)) / kk, 0, 1);
      d = d + (-b - d) * h + kk * h * (1 - h);
      c = mixC(c, s.col, sharp(h));
    } else {
      const kk = Math.max(k, 1e-6);
      const h = clamp(0.5 + (0.5 * (b - d)) / kk, 0, 1);
      d = b + (d - b) * h - kk * h * (1 - h);
      c = mixC(s.col, c, sharp(h));
    }
  }
  return [d, c];
}
