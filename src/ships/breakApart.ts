import * as THREE from 'three';

// Generic "snap this part off" for procedural ships. A cut is a plane plus a
// lateral test, both in hull-root space. Merged meshes are sliced triangle by
// triangle (triangles straddling the plane are clipped exactly, every vertex
// attribute interpolated), so a mast breaks cleanly mid-spar however the model
// happens to be built. Whole sub-objects (yard pivots, loose sails, the
// pennant) that sit inside the cut are cloned into the broken piece and the
// originals hidden, so everything can be restored when the crew repairs it.

export interface Cut {
  plane: THREE.Plane; // positive side breaks away
  lateral: (p: THREE.Vector3) => boolean; // which part of the positive side
}

export interface SplitResult {
  keep: THREE.BufferGeometry;
  piece: THREE.BufferGeometry;
  rim: THREE.Vector3[]; // points where the plane sliced through
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _cen = new THREE.Vector3();

type Vert = Float32Array;

function lerpVert(a: Vert, b: Vert, t: number): Vert {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

/** Sutherland–Hodgman against one plane; returns [positive, negative] polygons. */
function clipTri(vs: Vert[], ds: number[]): [Vert[], Vert[]] {
  const pos: Vert[] = [];
  const neg: Vert[] = [];
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    const a = vs[i];
    const b = vs[j];
    const da = ds[i];
    const db = ds[j];
    if (da >= 0) pos.push(a);
    else neg.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const p = lerpVert(a, b, da / (da - db));
      pos.push(p);
      neg.push(p);
    }
  }
  return [pos, neg];
}

/** Slices a mesh's geometry by a cut expressed in hull-root space. */
export function splitGeometry(src: THREE.BufferGeometry, toRoot: THREE.Matrix4, cut: Cut): SplitResult | null {
  const geo = src.index ? src.toNonIndexed() : src;
  const names = Object.keys(geo.attributes).filter((n) => !(geo.attributes[n] as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute);
  const attrs = names.map((n) => geo.attributes[n] as THREE.BufferAttribute);
  const sizes = attrs.map((a) => a.itemSize);
  const stride = sizes.reduce((s, x) => s + x, 0);
  const position = geo.getAttribute('position') as THREE.BufferAttribute;
  const triCount = Math.floor(position.count / 3);
  const keep: number[][] = names.map(() => []);
  const piece: number[][] = names.map(() => []);
  const rim: THREE.Vector3[] = [];
  let pieceTris = 0;
  const plane = cut.plane;

  const read = (i: number): Vert => {
    const v = new Float32Array(stride);
    let o = 0;
    for (let k = 0; k < attrs.length; k++) {
      const a = attrs[k];
      for (let c = 0; c < sizes[k]; c++) v[o++] = a.getComponent(i, c);
    }
    return v;
  };
  const write = (dst: number[][], poly: Vert[]) => {
    for (let t = 1; t + 1 < poly.length; t++) {
      for (const v of [poly[0], poly[t], poly[t + 1]]) {
        let o = 0;
        for (let k = 0; k < attrs.length; k++) for (let c = 0; c < sizes[k]; c++) dst[k].push(v[o++]);
      }
    }
  };
  const fast = attrs.every((a) => a.array instanceof Float32Array && !a.normalized);
  const copyTri = (dst: number[][], t: number) => {
    if (!fast) {
      write(dst, [read(t * 3), read(t * 3 + 1), read(t * 3 + 2)]);
      return;
    }
    for (let k = 0; k < attrs.length; k++) {
      const arr = attrs[k].array;
      const n = sizes[k] * 3;
      const start = t * n;
      const d = dst[k];
      for (let j = 0; j < n; j++) d.push(arr[start + j]);
    }
  };
  const rootPos = (v: Vert, out: THREE.Vector3) => out.set(v[0], v[1], v[2]).applyMatrix4(toRoot);

  const pi = names.indexOf('position');
  if (pi !== 0) {
    // keep position first so rootPos() can read it straight off the vertex
    names.unshift(names.splice(pi, 1)[0]);
    attrs.unshift(attrs.splice(pi, 1)[0]);
    sizes.unshift(sizes.splice(pi, 1)[0]);
  }

  for (let t = 0; t < triCount; t++) {
    _a.fromBufferAttribute(position, t * 3).applyMatrix4(toRoot);
    _b.fromBufferAttribute(position, t * 3 + 1).applyMatrix4(toRoot);
    _c.fromBufferAttribute(position, t * 3 + 2).applyMatrix4(toRoot);
    const ds = [plane.distanceToPoint(_a), plane.distanceToPoint(_b), plane.distanceToPoint(_c)];
    if (ds[0] <= 0 && ds[1] <= 0 && ds[2] <= 0) {
      copyTri(keep, t);
      continue;
    }
    if (ds[0] >= 0 && ds[1] >= 0 && ds[2] >= 0) {
      _cen.copy(_a).add(_b).add(_c).divideScalar(3);
      if (cut.lateral(_cen)) {
        copyTri(piece, t);
        pieceTris++;
      } else copyTri(keep, t);
      continue;
    }
    // straddles the plane: clip, and decide by the broken-off half
    const vs = [read(t * 3), read(t * 3 + 1), read(t * 3 + 2)];
    const [pos, neg] = clipTri(vs, ds);
    _cen.set(0, 0, 0);
    for (const v of pos) _cen.add(rootPos(v, _a));
    _cen.divideScalar(pos.length);
    if (!cut.lateral(_cen)) {
      copyTri(keep, t);
      continue;
    }
    write(piece, pos);
    write(keep, neg);
    pieceTris++;
    for (const v of pos) {
      const p = rootPos(v, new THREE.Vector3());
      if (Math.abs(plane.distanceToPoint(p)) < 1e-3) rim.push(p);
    }
  }
  if (!pieceTris) return null;
  const build = (data: number[][]) => {
    const g = new THREE.BufferGeometry();
    names.forEach((n, k) => g.setAttribute(n, new THREE.Float32BufferAttribute(data[k], sizes[k])));
    return g;
  };
  return { keep: build(keep), piece: build(piece), rim };
}

/** Drops rope segments that touch the broken-off region. */
export function filterLines(src: THREE.BufferGeometry, toRoot: THREE.Matrix4, cut: Cut): THREE.BufferGeometry | null {
  const p = src.getAttribute('position') as THREE.BufferAttribute;
  const out: number[] = [];
  let dropped = 0;
  const inCut = (v: THREE.Vector3) => cut.plane.distanceToPoint(v) > -0.05 && cut.lateral(v);
  for (let i = 0; i + 1 < p.count; i += 2) {
    _a.fromBufferAttribute(p, i).applyMatrix4(toRoot);
    _b.fromBufferAttribute(p, i + 1).applyMatrix4(toRoot);
    if (inCut(_a) || inCut(_b)) {
      dropped++;
      continue;
    }
    out.push(p.getX(i), p.getY(i), p.getZ(i), p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1));
  }
  if (!dropped) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  return g;
}

/** A ring of jagged splinters, raw timber, for both faces of a snapped spar. */
export function breakSplinters(center: THREE.Vector3, radius: number, dir: number, seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = 7;
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.5;
    const h = (0.15 + rnd() * 0.55) * Math.max(1, radius * 3);
    const w = radius * (0.55 + rnd() * 0.4);
    const g = new THREE.ConeGeometry(w * 0.55, h, 3, 1);
    g.translate(0, h / 2 - 0.02, 0);
    g.rotateZ((rnd() - 0.5) * 0.5);
    g.translate(Math.cos(a) * radius * 0.45, 0, Math.sin(a) * radius * 0.45);
    if (dir < 0) g.rotateX(Math.PI);
    parts.push(g.toNonIndexed());
  }
  // splintered heartwood disc
  const disc = new THREE.CylinderGeometry(radius * 0.95, radius * 0.95, 0.05, 8, 1);
  parts.push(disc.toNonIndexed());
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  for (const g of parts) {
    g.computeVertexNormals();
    const p = g.getAttribute('position');
    const nn = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i) + center.x, p.getY(i) + center.y, p.getZ(i) + center.z);
      nrm.push(nn.getX(i), nn.getY(i), nn.getZ(i));
      const k = 0.85 + rnd() * 0.3;
      col.push(0.78 * k, 0.6 * k, 0.4 * k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
