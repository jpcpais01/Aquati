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
  rigging?: (p: THREE.Vector3) => boolean; // extra rope ends that lose their purchase
}

export interface SplitResult {
  keep: THREE.BufferGeometry;
  piece: THREE.BufferGeometry;
  rim: THREE.Vector3[]; // points where the plane sliced through
  /**
   * An indexed source keeps its vertex buffers: `keep` shares them and only
   * gets a new index, so nothing big is copied or re-uploaded. The kept halves
   * of the clipped triangles need new vertices, so they come back here (or null).
   */
  keepEdge: THREE.BufferGeometry | null;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _cen = new THREE.Vector3();
const _box = new THREE.Box3();

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
  if (src.index) return splitIndexed(src, toRoot, cut);
  const geo = src;
  const names = Object.keys(geo.attributes).filter((n) => !(geo.attributes[n] as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute);
  const pi = names.indexOf('position');
  if (pi < 0) return null;
  // keep position first so a vertex's root-space point can be read straight off it
  if (pi !== 0) names.unshift(names.splice(pi, 1)[0]);
  const attrs = names.map((n) => geo.attributes[n] as THREE.BufferAttribute);
  const sizes = attrs.map((a) => a.itemSize);
  const stride = sizes.reduce((s, x) => s + x, 0);
  const position = attrs[0];
  const triCount = Math.floor(position.count / 3);
  if (!triCount) return null;
  const plane = cut.plane;
  const pn = plane.normal;
  // the whole mesh on the kept side of the plane: nothing to slice (and nothing allocated)
  if (!geo.boundingBox) geo.computeBoundingBox();
  _box.copy(geo.boundingBox!).applyMatrix4(toRoot);
  if (plane.distanceToPoint(_box.max.set(pn.x >= 0 ? _box.max.x : _box.min.x, pn.y >= 0 ? _box.max.y : _box.min.y, pn.z >= 0 ? _box.max.z : _box.min.z)) <= 0) return null;

  // plain float attributes are copied a whole run of triangles at a time
  const fast = attrs.every((a) => a.array instanceof Float32Array && !a.normalized);
  const arrays = attrs.map((a) => (fast ? (a.array as Float32Array) : Float32Array.from({ length: a.count * a.itemSize }, (_, i) => a.getComponent(Math.floor(i / a.itemSize), i % a.itemSize))));
  const P = arrays[0];
  const e = toRoot.elements;
  const nx = pn.x, ny = pn.y, nz = pn.z, pc = plane.constant;

  // pass 1: classify every triangle (0 keep, 1 piece, 2 straddles: clip it), all in place
  const cls = new Uint8Array(triCount);
  const ds = new Float32Array(triCount * 3);
  let pieceTris = 0;
  for (let t = 0; t < triCount; t++) {
    let cx = 0, cy = 0, cz = 0, pos = 0, neg = 0;
    for (let k = 0; k < 3; k++) {
      const o = (t * 3 + k) * 3;
      const x = P[o], y = P[o + 1], z = P[o + 2];
      const rx = e[0] * x + e[4] * y + e[8] * z + e[12];
      const ry = e[1] * x + e[5] * y + e[9] * z + e[13];
      const rz = e[2] * x + e[6] * y + e[10] * z + e[14];
      const d = nx * rx + ny * ry + nz * rz + pc;
      ds[t * 3 + k] = d;
      if (d > 0) pos++;
      else if (d < 0) neg++;
      cx += rx;
      cy += ry;
      cz += rz;
    }
    if (!pos) continue;
    if (!neg) {
      if (cut.lateral(_cen.set(cx / 3, cy / 3, cz / 3))) {
        cls[t] = 1;
        pieceTris++;
      }
      continue;
    }
    cls[t] = 2;
  }

  // pass 2: clip the straddling triangles, deciding by the broken-off half
  const keepExtra: Vert[][] = [];
  const pieceExtra: Vert[][] = [];
  const rim: THREE.Vector3[] = [];
  const read = (i: number): Vert => {
    const v = new Float32Array(stride);
    let o = 0;
    for (let k = 0; k < arrays.length; k++) {
      const s = sizes[k];
      const a = arrays[k];
      for (let c = 0; c < s; c++) v[o++] = a[i * s + c];
    }
    return v;
  };
  for (let t = 0; t < triCount; t++) {
    if (cls[t] !== 2) continue;
    const vs = [read(t * 3), read(t * 3 + 1), read(t * 3 + 2)];
    const [pos, neg] = clipTri(vs, [ds[t * 3], ds[t * 3 + 1], ds[t * 3 + 2]]);
    _cen.set(0, 0, 0);
    for (const v of pos) _cen.add(_a.set(v[0], v[1], v[2]).applyMatrix4(toRoot));
    _cen.divideScalar(pos.length);
    if (!cut.lateral(_cen)) {
      cls[t] = 0;
      continue;
    }
    pieceExtra.push(pos);
    keepExtra.push(neg);
    pieceTris++;
    for (const v of pos) {
      const p = new THREE.Vector3(v[0], v[1], v[2]).applyMatrix4(toRoot);
      if (Math.abs(plane.distanceToPoint(p)) < 1e-3) rim.push(p);
    }
  }
  if (!pieceTris) return null;

  const polyTris = (polys: Vert[][]) => polys.reduce((n, p) => n + Math.max(0, p.length - 2), 0);
  const build = (want: number, extra: Vert[][]) => {
    let tris = polyTris(extra);
    for (let t = 0; t < triCount; t++) if (cls[t] === want) tris++;
    const out = sizes.map((s) => new Float32Array(tris * 3 * s));
    const off = sizes.map(() => 0);
    // whole triangles: one copy per run of consecutive ones
    for (let t = 0; t < triCount; ) {
      if (cls[t] !== want) {
        t++;
        continue;
      }
      let end = t + 1;
      while (end < triCount && cls[end] === want) end++;
      for (let k = 0; k < arrays.length; k++) {
        const n = sizes[k] * 3;
        out[k].set(arrays[k].subarray(t * n, end * n), off[k]);
        off[k] += (end - t) * n;
      }
      t = end;
    }
    for (const poly of extra) {
      for (let i = 1; i + 1 < poly.length; i++) {
        for (const v of [poly[0], poly[i], poly[i + 1]]) {
          let o = 0;
          for (let k = 0; k < arrays.length; k++) {
            for (let c = 0; c < sizes[k]; c++) out[k][off[k]++] = v[o++];
          }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    names.forEach((n, k) => g.setAttribute(n, new THREE.BufferAttribute(out[k], sizes[k])));
    // both halves lie on the source's triangles, so its bounds still hold: saves
    // the renderer a pass over every vertex when it first culls them
    g.boundingBox = geo.boundingBox!.clone();
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    g.boundingSphere = geo.boundingSphere!.clone();
    return g;
  };
  return { keep: build(0, keepExtra), piece: build(1, pieceExtra), rim, keepEdge: null };
}

/**
 * The indexed path, for a ship's big merged meshes. Copying and re-uploading a
 * whole hull for every spar that came down cost a sinking several frames of
 * tens of milliseconds and megabytes of garbage; now the hull keeps its vertex
 * buffers and only the triangles that change are touched: the kept ones get a
 * new index, the broken-off ones and the clipped seam become small geometries.
 */
function splitIndexed(src: THREE.BufferGeometry, toRoot: THREE.Matrix4, cut: Cut): SplitResult | null {
  const index = src.index!;
  const position = src.getAttribute('position') as THREE.BufferAttribute;
  if ((position as unknown as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) return null;
  const names = Object.keys(src.attributes).filter((n) => !(src.attributes[n] as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute);
  // position first, so a clipped vertex's point can be read straight off it
  names.splice(names.indexOf('position'), 1);
  names.unshift('position');
  const attrs = names.map((n) => src.attributes[n] as THREE.BufferAttribute);
  const sizes = attrs.map((a) => a.itemSize);
  const stride = sizes.reduce((s, x) => s + x, 0);
  const idx = index.array;
  const triCount = Math.floor(index.count / 3);
  if (!triCount) return null;
  const plane = cut.plane;
  const pn = plane.normal;
  if (!src.boundingBox) src.computeBoundingBox();
  _box.copy(src.boundingBox!).applyMatrix4(toRoot);
  if (plane.distanceToPoint(_box.max.set(pn.x >= 0 ? _box.max.x : _box.min.x, pn.y >= 0 ? _box.max.y : _box.min.y, pn.z >= 0 ? _box.max.z : _box.min.z)) <= 0) return null;

  // each vertex's signed distance, once (vertices are shared between triangles)
  const P = position.array as ArrayLike<number>;
  const e = toRoot.elements;
  const nx = pn.x, ny = pn.y, nz = pn.z, pc = plane.constant;
  const nv = position.count;
  const dv = new Float32Array(nv);
  const plain = P instanceof Float32Array && !position.normalized && position.itemSize === 3;
  for (let i = 0; i < nv; i++) {
    let x: number, y: number, z: number;
    if (plain) {
      x = P[i * 3];
      y = P[i * 3 + 1];
      z = P[i * 3 + 2];
    } else {
      x = position.getX(i);
      y = position.getY(i);
      z = position.getZ(i);
    }
    dv[i] = nx * (e[0] * x + e[4] * y + e[8] * z + e[12]) + ny * (e[1] * x + e[5] * y + e[9] * z + e[13]) + nz * (e[2] * x + e[6] * y + e[10] * z + e[14]) + pc;
  }

  // classify: 0 keep, 1 piece, 2 straddles (clipped below)
  const cls = new Uint8Array(triCount);
  let pieceTris = 0;
  let straddle = 0;
  for (let t = 0; t < triCount; t++) {
    const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
    const da = dv[a], db = dv[b], dc = dv[c];
    if (da <= 0 && db <= 0 && dc <= 0) continue;
    if (da >= 0 && db >= 0 && dc >= 0) {
      if (plain) _cen.set((P[a * 3] + P[b * 3] + P[c * 3]) / 3, (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3, (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3);
      else _cen.fromBufferAttribute(position, a).add(_a.fromBufferAttribute(position, b)).add(_b.fromBufferAttribute(position, c)).divideScalar(3);
      if (cut.lateral(_cen.applyMatrix4(toRoot))) {
        cls[t] = 1;
        pieceTris++;
      }
      continue;
    }
    cls[t] = 2;
    straddle++;
  }
  if (!pieceTris && !straddle) return null;

  const read = (i: number): Vert => {
    const v = new Float32Array(stride);
    let o = 0;
    for (let k = 0; k < attrs.length; k++) for (let c = 0; c < sizes[k]; c++) v[o++] = attrs[k].getComponent(i, c);
    return v;
  };
  const pieceExtra: Vert[][] = [];
  const keepExtra: Vert[][] = [];
  const rim: THREE.Vector3[] = [];
  for (let t = 0; t < triCount; t++) {
    if (cls[t] !== 2) continue;
    const i0 = idx[t * 3], i1 = idx[t * 3 + 1], i2 = idx[t * 3 + 2];
    const [pos, neg] = clipTri([read(i0), read(i1), read(i2)], [dv[i0], dv[i1], dv[i2]]);
    _cen.set(0, 0, 0);
    for (const v of pos) _cen.add(_a.set(v[0], v[1], v[2]).applyMatrix4(toRoot));
    _cen.divideScalar(pos.length);
    if (!cut.lateral(_cen)) {
      cls[t] = 0;
      continue;
    }
    pieceExtra.push(pos);
    keepExtra.push(neg);
    pieceTris++;
    for (const v of pos) {
      const p = new THREE.Vector3(v[0], v[1], v[2]).applyMatrix4(toRoot);
      if (Math.abs(plane.distanceToPoint(p)) < 1e-3) rim.push(p);
    }
  }
  if (!pieceTris) return null;

  // both halves lie on the source's triangles, so its bounds still hold: saves
  // the renderer a pass over every vertex when it first culls them
  if (!src.boundingSphere) src.computeBoundingSphere();
  const bounds = (g: THREE.BufferGeometry) => {
    g.boundingBox = src.boundingBox!.clone();
    g.boundingSphere = src.boundingSphere!.clone();
    return g;
  };

  // the kept triangles: the same vertex buffers under a shorter index
  let keepTris = 0;
  for (let t = 0; t < triCount; t++) if (cls[t] === 0) keepTris++;
  const kidx = new (idx.constructor as Uint32ArrayConstructor)(keepTris * 3);
  let o = 0;
  for (let t = 0; t < triCount; t++) {
    if (cls[t] !== 0) continue;
    kidx[o++] = idx[t * 3];
    kidx[o++] = idx[t * 3 + 1];
    kidx[o++] = idx[t * 3 + 2];
  }
  const keep = new THREE.BufferGeometry();
  names.forEach((n, k) => keep.setAttribute(n, attrs[k]));
  keep.setIndex(new THREE.BufferAttribute(kidx, 1));
  bounds(keep);

  // the small loose geometries: whole broken-off triangles plus clipped polygons
  const loose = (whole: number, polys: Vert[][]) => {
    let tris = 0;
    for (let t = 0; t < triCount; t++) if (cls[t] === whole) tris++;
    for (const p of polys) tris += Math.max(0, p.length - 2);
    if (!tris) return null;
    const out = sizes.map((s) => new Float32Array(tris * 3 * s));
    const off = sizes.map(() => 0);
    const put = (v: Vert) => {
      let q = 0;
      for (let k = 0; k < attrs.length; k++) for (let c = 0; c < sizes[k]; c++) out[k][off[k]++] = v[q++];
    };
    for (let k = 0; k < attrs.length; k++) {
      const a = attrs[k];
      const n = sizes[k];
      const o = out[k];
      // plain float buffers copy straight across; anything packed goes through three
      const src = a.array instanceof Float32Array && !a.normalized ? a.array : null;
      let w = 0;
      for (let t = 0; t < triCount; t++) {
        if (cls[t] !== whole) continue;
        for (let j = 0; j < 3; j++) {
          const i = idx[t * 3 + j];
          if (src) for (let c = 0; c < n; c++) o[w++] = src[i * n + c];
          else for (let c = 0; c < n; c++) o[w++] = a.getComponent(i, c);
        }
      }
      off[k] = w;
    }
    for (const poly of polys) for (let i = 1; i + 1 < poly.length; i++) for (const v of [poly[0], poly[i], poly[i + 1]]) put(v);
    const g = new THREE.BufferGeometry();
    names.forEach((n, k) => g.setAttribute(n, new THREE.BufferAttribute(out[k], sizes[k])));
    return bounds(g);
  };
  // class 3 never occurs: the seam's kept side has no whole triangles
  return { keep, piece: loose(1, pieceExtra)!, rim, keepEdge: loose(3, keepExtra) };
}

/**
 * Frees a geometry's GPU buffers except those it shares with `base` (a split
 * hull shares the whole ship's vertex buffers with the original it came from).
 */
export function disposeUnshared(g: THREE.BufferGeometry, base: THREE.BufferGeometry) {
  if (g === base) return;
  const attrs = g.attributes;
  const index = g.index;
  const own: Record<string, THREE.BufferAttribute | THREE.InterleavedBufferAttribute> = {};
  for (const k in attrs) if (base.attributes[k] !== attrs[k]) own[k] = attrs[k];
  // three frees whatever the geometry holds when it is disposed: hold back the shared ones
  g.attributes = own;
  if (index === base.index) g.index = null;
  g.dispose();
  g.attributes = attrs;
  g.index = index;
}

/** Drops rope segments that touch the broken-off region. */
export function filterLines(src: THREE.BufferGeometry, toRoot: THREE.Matrix4, cut: Cut): THREE.BufferGeometry | null {
  const p = src.getAttribute('position') as THREE.BufferAttribute;
  const out: number[] = [];
  let dropped = 0;
  const inCut = (v: THREE.Vector3) => (cut.plane.distanceToPoint(v) > -0.05 && cut.lateral(v)) || (!!cut.rigging && cut.rigging(v));
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

/**
 * The laid-rope twin of filterLines: a rope (all the triangles sharing an
 * aRope id) goes as a whole when any part of it is caught by the cut.
 */
export function filterRopes(src: THREE.BufferGeometry, toRoot: THREE.Matrix4, cut: Cut): THREE.BufferGeometry | null {
  const p = src.getAttribute('position') as THREE.BufferAttribute;
  const id = src.getAttribute('aRope') as THREE.BufferAttribute | undefined;
  const index = src.index;
  if (!id || !index) return null;
  const inCut = (v: THREE.Vector3) => (cut.plane.distanceToPoint(v) > -0.05 && cut.lateral(v)) || (!!cut.rigging && cut.rigging(v));
  const dead = new Set<number>();
  for (let i = 0; i < p.count; i++) {
    const r = id.getX(i);
    if (dead.has(r)) continue;
    if (inCut(_a.fromBufferAttribute(p, i).applyMatrix4(toRoot))) dead.add(r);
  }
  if (!dead.size) return null;
  const keep: number[] = [];
  for (let t = 0; t < index.count; t += 3) {
    const a = index.getX(t);
    if (!dead.has(id.getX(a))) keep.push(a, index.getX(t + 1), index.getX(t + 2));
  }
  const g = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) g.setAttribute(name, (attr as THREE.BufferAttribute).clone());
  g.setIndex(keep);
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
