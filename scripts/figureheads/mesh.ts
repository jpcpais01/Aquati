// Turns a sculpt (sdf.ts) into a game mesh: samples the field on a fine grid
// in narrow-band bricks, extracts the surface with surface nets, snaps the
// vertices onto the true surface, takes normals from the field's gradient and
// colour from the blend, then lets meshoptimizer fold it down to a budget.

import { MeshoptSimplifier } from 'meshoptimizer';
import { evalD, evalDC, type Scene, type Shape, type V3 } from './sdf.ts';

export interface Mesh {
  pos: Float32Array;
  nrm: Float32Array;
  col: Float32Array;
  idx: Uint32Array;
}

export interface MeshOpts {
  cell: number;
  tris: number;
  error: number;
}

const BRICK = 8;

export async function meshScene(scene: Scene, o: MeshOpts): Promise<Mesh> {
  const shapes = scene.shapes;
  const T0 = performance.now();
  const lap = (what: string) => process.env.FIG_PROFILE && console.log(`  ${what}: ${((performance.now() - T0) / 1000).toFixed(1)} s`);
  const h = o.cell;
  const mn: V3 = [Infinity, Infinity, Infinity];
  const mx: V3 = [-Infinity, -Infinity, -Infinity];
  for (const s of shapes) {
    if (s.sub) continue;
    for (let i = 0; i < 3; i++) {
      mn[i] = Math.min(mn[i], s.min[i] - s.k - 3 * h);
      mx[i] = Math.max(mx[i], s.max[i] + s.k + 3 * h);
    }
  }
  const nx = Math.ceil((mx[0] - mn[0]) / h) + 1;
  const ny = Math.ceil((mx[1] - mn[1]) / h) + 1;
  const nz = Math.ceil((mx[2] - mn[2]) / h) + 1;
  const val = new Float32Array(nx * ny * nz).fill(1e9);
  const bx = Math.ceil(nx / BRICK);
  const by = Math.ceil(ny / BRICK);
  const bz = Math.ceil(nz / BRICK);
  const lists: (Shape[] | null)[] = new Array(bx * by * bz).fill(null);
  const pad = 3 * h;
  for (let k = 0; k < bz; k++)
    for (let j = 0; j < by; j++)
      for (let i = 0; i < bx; i++) {
        const lo: V3 = [mn[0] + i * BRICK * h - pad, mn[1] + j * BRICK * h - pad, mn[2] + k * BRICK * h - pad];
        const hi: V3 = [lo[0] + BRICK * h + 2 * pad, lo[1] + BRICK * h + 2 * pad, lo[2] + BRICK * h + 2 * pad];
        const list = shapes.filter((s) => s.min[0] - s.k <= hi[0] && s.max[0] + s.k >= lo[0] && s.min[1] - s.k <= hi[1] && s.max[1] + s.k >= lo[1] && s.min[2] - s.k <= hi[2] && s.max[2] + s.k >= lo[2]);
        if (!list.some((s) => !s.sub)) continue;
        lists[i + bx * (j + by * k)] = list;
        // far from the surface the whole brick takes its centre's value
        const half = (BRICK * h) / 2;
        const dc = evalD(list, lo[0] + pad + half, lo[1] + pad + half, lo[2] + pad + half);
        if (Math.abs(dc) > half * Math.sqrt(3) * 1.6 + 2 * h) {
          for (let z = k * BRICK; z < Math.min(nz, (k + 1) * BRICK); z++)
            for (let y = j * BRICK; y < Math.min(ny, (j + 1) * BRICK); y++)
              for (let x = i * BRICK; x < Math.min(nx, (i + 1) * BRICK); x++) val[x + nx * (y + ny * z)] = dc;
          continue;
        }
        for (let z = k * BRICK; z < Math.min(nz, (k + 1) * BRICK); z++)
          for (let y = j * BRICK; y < Math.min(ny, (j + 1) * BRICK); y++)
            for (let x = i * BRICK; x < Math.min(nx, (i + 1) * BRICK); x++) val[x + nx * (y + ny * z)] = evalD(list, mn[0] + x * h, mn[1] + y * h, mn[2] + z * h);
      }
  const listAt = (x: number, y: number, z: number): Shape[] => {
    const i = Math.min(bx - 1, Math.max(0, Math.floor((x - mn[0]) / h / BRICK)));
    const j = Math.min(by - 1, Math.max(0, Math.floor((y - mn[1]) / h / BRICK)));
    const k = Math.min(bz - 1, Math.max(0, Math.floor((z - mn[2]) / h / BRICK)));
    return lists[i + bx * (j + by * k)] ?? shapes;
  };

  lap(`sampled ${nx}x${ny}x${nz}`);
  // surface nets: one vertex per cell the surface passes through
  const cx = nx - 1;
  const cy = ny - 1;
  const cellV = new Int32Array(cx * cy * (nz - 1)).fill(-1);
  const verts: number[] = [];
  const corner = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ];
  const edges = [
    [0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const v = new Float64Array(8);
  for (let z = 0; z < nz - 1; z++)
    for (let y = 0; y < ny - 1; y++)
      for (let x = 0; x < nx - 1; x++) {
        let neg = 0;
        for (let c = 0; c < 8; c++) {
          const q = corner[c];
          v[c] = val[x + q[0] + nx * (y + q[1] + ny * (z + q[2]))];
          if (v[c] < 0) neg++;
        }
        if (neg === 0 || neg === 8) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (const [a, b] of edges) {
          if (v[a] < 0 === v[b] < 0) continue;
          const t = v[a] / (v[a] - v[b]);
          const qa = corner[a];
          const qb = corner[b];
          sx += qa[0] + (qb[0] - qa[0]) * t;
          sy += qa[1] + (qb[1] - qa[1]) * t;
          sz += qa[2] + (qb[2] - qa[2]) * t;
          n++;
        }
        cellV[x + cx * (y + cy * z)] = verts.length / 3;
        verts.push(mn[0] + (x + sx / n) * h, mn[1] + (y + sy / n) * h, mn[2] + (z + sz / n) * h);
      }
  const quads: number[] = [];
  const cv = (x: number, y: number, z: number) => cellV[x + cx * (y + cy * z)];
  for (let z = 1; z < nz - 1; z++)
    for (let y = 1; y < ny - 1; y++)
      for (let x = 1; x < nx - 1; x++) {
        const p = val[x + nx * (y + ny * z)] < 0;
        if (p !== val[x + 1 + nx * (y + ny * z)] < 0) quads.push(cv(x, y - 1, z - 1), cv(x, y, z - 1), cv(x, y, z), cv(x, y - 1, z));
        if (p !== val[x + nx * (y + 1 + ny * z)] < 0) quads.push(cv(x - 1, y, z - 1), cv(x, y, z - 1), cv(x, y, z), cv(x - 1, y, z));
        if (p !== val[x + nx * (y + ny * (z + 1))] < 0) quads.push(cv(x - 1, y - 1, z), cv(x, y - 1, z), cv(x, y, z), cv(x - 1, y, z));
      }
  // left at x == 0 etc. never cross: the grid is padded

  lap(`nets ${verts.length / 3} verts`);
  // snap to the surface, then normals and paint from the field
  const nv = verts.length / 3;
  const pos = new Float32Array(verts);
  const nrm = new Float32Array(nv * 3);
  const col = new Float32Array(nv * 3);
  const e = h * 0.5;
  for (let i = 0; i < nv; i++) {
    let x = pos[i * 3];
    let y = pos[i * 3 + 1];
    let z = pos[i * 3 + 2];
    const list = listAt(x, y, z);
    let gx = 0;
    let gy = 0;
    let gz = 0;
    for (let it = 0; it < 2; it++) {
      const d = evalD(list, x, y, z);
      gx = evalD(list, x + e, y, z) - evalD(list, x - e, y, z);
      gy = evalD(list, x, y + e, z) - evalD(list, x, y - e, z);
      gz = evalD(list, x, y, z + e) - evalD(list, x, y, z - e);
      gx /= 2 * e;
      gy /= 2 * e;
      gz /= 2 * e;
      const g2 = gx * gx + gy * gy + gz * gz;
      if (g2 < 1e-8) break;
      let step = d / g2;
      const run = Math.abs(d) / Math.sqrt(g2);
      if (run > h * 0.7) step *= (h * 0.7) / run;
      x -= gx * step;
      y -= gy * step;
      z -= gz * step;
    }
    gx = evalD(list, x + e, y, z) - evalD(list, x - e, y, z);
    gy = evalD(list, x, y + e, z) - evalD(list, x, y - e, z);
    gz = evalD(list, x, y, z + e) - evalD(list, x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1;
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    nrm[i * 3] = gx / gl;
    nrm[i * 3 + 1] = gy / gl;
    nrm[i * 3 + 2] = gz / gl;
    const [, c] = evalDC(list, x, y, z);
    col[i * 3] = c[0];
    col[i * 3 + 1] = c[1];
    col[i * 3 + 2] = c[2];
  }
  // triangles, wound to face along the field's gradient
  const tri: number[] = [];
  const face = (a: number, b: number, c: number) => {
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const ux = pos[b * 3] - ax, uy = pos[b * 3 + 1] - ay, uz = pos[b * 3 + 2] - az;
    const vx = pos[c * 3] - ax, vy = pos[c * 3 + 1] - ay, vz = pos[c * 3 + 2] - az;
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const ndot = fx * (nrm[a * 3] + nrm[b * 3] + nrm[c * 3]) + fy * (nrm[a * 3 + 1] + nrm[b * 3 + 1] + nrm[c * 3 + 1]) + fz * (nrm[a * 3 + 2] + nrm[b * 3 + 2] + nrm[c * 3 + 2]);
    if (fx * fx + fy * fy + fz * fz < 1e-20) return;
    if (ndot >= 0) tri.push(a, b, c);
    else tri.push(a, c, b);
  };
  for (let q = 0; q < quads.length; q += 4) {
    const [a, b, c, d] = [quads[q], quads[q + 1], quads[q + 2], quads[q + 3]];
    if (a < 0 || b < 0 || c < 0 || d < 0) continue;
    face(a, b, c);
    face(a, c, d);
  }
  const idx0 = new Uint32Array(tri);

  lap('snapped');
  await MeshoptSimplifier.ready;
  const attrs = new Float32Array(nv * 6);
  for (let i = 0; i < nv; i++) {
    attrs.set(nrm.subarray(i * 3, i * 3 + 3), i * 6);
    attrs.set(col.subarray(i * 3, i * 3 + 3), i * 6 + 3);
  }
  const [simp] = MeshoptSimplifier.simplifyWithAttributes(idx0, pos, 3, attrs, 6, [0.02, 0.02, 0.02, 0.04, 0.04, 0.04], null, o.tris * 3, o.error, ['ErrorAbsolute']);
  lap('simplified');
  // keep only the vertices still in use
  const remap = new Int32Array(nv).fill(-1);
  let m = 0;
  for (const i of simp) if (remap[i] < 0) remap[i] = m++;
  const out: Mesh = { pos: new Float32Array(m * 3), nrm: new Float32Array(m * 3), col: new Float32Array(m * 3), idx: new Uint32Array(simp.length) };
  for (let i = 0; i < nv; i++) {
    const r = remap[i];
    if (r < 0) continue;
    out.pos.set(pos.subarray(i * 3, i * 3 + 3), r * 3);
    out.nrm.set(nrm.subarray(i * 3, i * 3 + 3), r * 3);
    out.col.set(col.subarray(i * 3, i * 3 + 3), r * 3);
  }
  for (let i = 0; i < simp.length; i++) out.idx[i] = remap[simp[i]];
  return out;
}
