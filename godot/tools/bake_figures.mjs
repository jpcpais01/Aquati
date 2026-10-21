// Converts the web game's sculpted figureheads (src/ships/figureData.*,
// meshopt-compressed) into plain arrays the Godot game reads straight into
// meshes: art/figures.json (the index) and art/figures.bin (the data).
//
//   cd godot && node tools/bake_figures.mjs   (needs the meshoptimizer npm package)
//
// Each piece keeps its own frame (see src/ships/figurehead.gd); positions and
// smooth normals are float32, paint is sRGB bytes, indices are int32.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..', '..', 'src', 'ships');
const require = createRequire(import.meta.url);
const { MeshoptDecoder } = require(process.env.MESHOPT ?? 'meshoptimizer');

await MeshoptDecoder.ready;
const index = JSON.parse(readFileSync(join(web, 'figureData.json'), 'utf8'));
const bin = readFileSync(join(web, 'figureData.bin'));
const src = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);

const chunks = [];
let offset = 0;
const push = (typed) => {
  const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
  const at = offset;
  chunks.push(bytes);
  offset += bytes.byteLength;
  // keep every array 4-byte aligned
  const pad = (4 - (offset % 4)) % 4;
  if (pad) {
    chunks.push(new Uint8Array(pad));
    offset += pad;
  }
  return at;
};

const out = {};
for (const [fig, pieces] of Object.entries(index)) {
  out[fig] = pieces.map((d) => {
    const n = d.verts;
    const vb = new Uint8Array(n * 12);
    MeshoptDecoder.decodeVertexBuffer(vb, n, 12, new Uint8Array(src, d.vb[0], d.vb[1] - d.vb[0]));
    const idx = new Uint32Array(d.indices);
    MeshoptDecoder.decodeIndexBuffer(new Uint8Array(idx.buffer), d.indices, 4, new Uint8Array(src, d.ib[0], d.ib[1] - d.ib[0]));
    const dv = new DataView(vb.buffer);
    const pos = new Float32Array(n * 3);
    const col = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      const o = i * 12;
      for (let k = 0; k < 3; k++) pos[i * 3 + k] = d.min[k] + (dv.getUint16(o + k * 2, true) / 65535) * (d.max[k] - d.min[k]);
      col[i * 4] = vb[o + 8];
      col[i * 4 + 1] = vb[o + 9];
      col[i * 4 + 2] = vb[o + 10];
      col[i * 4 + 3] = 255;
    }
    // smooth normals, area weighted (as three.js computeVertexNormals)
    const nrm = new Float32Array(n * 3);
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
      const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
      const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const v of [a, b, c]) {
        nrm[v * 3] += nx;
        nrm[v * 3 + 1] += ny;
        nrm[v * 3 + 2] += nz;
      }
    }
    for (let i = 0; i < n; i++) {
      const l = Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]) || 1;
      nrm[i * 3] /= l;
      nrm[i * 3 + 1] /= l;
      nrm[i * 3 + 2] /= l;
    }
    // three.js winds counter-clockwise for front faces, Godot clockwise
    const tri = new Int32Array(idx.length);
    for (let t = 0; t < idx.length; t += 3) {
      tri[t] = idx[t];
      tri[t + 1] = idx[t + 2];
      tri[t + 2] = idx[t + 1];
    }
    return {
      name: d.name,
      bucket: d.bucket,
      frame: d.frame,
      verts: n,
      indices: idx.length,
      pos: push(pos),
      nrm: push(nrm),
      col: push(col),
      idx: push(tri),
      jewels: d.jewels ?? [],
    };
  });
}

const all = new Uint8Array(offset);
let at = 0;
for (const c of chunks) {
  all.set(c, at);
  at += c.byteLength;
}
writeFileSync(join(here, '..', 'art', 'figures.bin'), all);
writeFileSync(join(here, '..', 'art', 'figures.json'), JSON.stringify(out));
console.log(`figures: ${Object.keys(out).join(', ')}; ${(offset / 1024).toFixed(0)} KiB`);
