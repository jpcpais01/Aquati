// Bakes the figurehead sculpts into src/ships/figureData.bin, indexed by
// src/ships/figureData.json.
//   node --experimental-strip-types scripts/figureheads/bake.ts [figure ...]
// With names, only those figures are re-baked and the rest kept.
//
// Each piece is stored meshopt-compressed: 12-byte vertices (uint16 position
// quantized to the piece's bounds, uint8 sRGB colour) and uint32 indices, one
// after another in the .bin. Normals are left out: they are most of the bytes
// and the game rebuilds them from the triangles once, at load.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { MeshoptEncoder } from 'meshoptimizer';
import { Scene } from './sdf.ts';
import { FIGURES } from './figures.ts';
import { meshScene } from './mesh.ts';

const OUT = new URL('../../src/ships/figureData.json', import.meta.url);
const BIN = new URL('../../src/ships/figureData.bin', import.meta.url);
/** Bytes per vertex: uint16 position x3, padding, uint8 sRGB paint, padding. */
const STRIDE = 12;

interface PieceData {
  name: string;
  bucket: string;
  frame: unknown;
  min: number[];
  max: number[];
  verts: number;
  indices: number;
  /** Byte ranges in the .bin. */
  vb: [number, number];
  ib: [number, number];
  jewels?: unknown;
}

const only = process.argv.slice(2);
const data: Record<string, PieceData[]> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const oldBin = existsSync(BIN) ? readFileSync(BIN) : Buffer.alloc(0);
// every piece's encoded buffers, kept in memory until the .bin is rewritten
const bufs = new Map<PieceData, { vb: Uint8Array; ib: Uint8Array }>();
for (const pieces of Object.values(data)) for (const p of pieces) bufs.set(p, { vb: oldBin.subarray(p.vb[0], p.vb[1]), ib: oldBin.subarray(p.ib[0], p.ib[1]) });
await MeshoptEncoder.ready;

for (const [fig, pieces] of Object.entries(FIGURES)) {
  if (only.length && !only.includes(fig)) {
    // not re-meshed: refresh what is only data
    for (const p of pieces) {
      const d = data[fig]?.find((x) => x.name === p.name);
      if (d) Object.assign(d, { bucket: p.bucket, frame: p.frame, jewels: p.jewels });
    }
    continue;
  }
  const out: PieceData[] = [];
  for (const p of pieces) {
    const t0 = performance.now();
    const scene = new Scene();
    p.build(scene);
    const m = await meshScene(scene, { cell: p.cell, tris: p.tris, error: p.error });
    const idx = m.idx;
    const [remap, unique] = MeshoptEncoder.reorderMesh(idx, true, false);
    const nv = unique;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < m.pos.length; i += 3) for (let c = 0; c < 3; c++) {
      min[c] = Math.min(min[c], m.pos[i + c]);
      max[c] = Math.max(max[c], m.pos[i + c]);
    }
    const vb = new Uint8Array(nv * STRIDE);
    const dv = new DataView(vb.buffer);
    for (let old = 0; old < remap.length; old++) {
      const v = remap[old];
      if (v === 0xffffffff || v >= nv) continue;
      const o = v * STRIDE;
      for (let c = 0; c < 3; c++) {
        const q = Math.round(((m.pos[old * 3 + c] - min[c]) / (max[c] - min[c] || 1)) * 65535);
        dv.setUint16(o + c * 2, q, true);
        dv.setUint8(o + 8 + c, Math.round(Math.max(0, Math.min(1, m.col[old * 3 + c])) * 255));
      }
    }
    const ev = MeshoptEncoder.encodeVertexBuffer(vb, nv, STRIDE);
    const ei = MeshoptEncoder.encodeIndexBuffer(new Uint8Array(idx.buffer, idx.byteOffset, idx.byteLength), idx.length, 4);
    const d: PieceData = { name: p.name, bucket: p.bucket, frame: p.frame, min, max, verts: nv, indices: idx.length, vb: [0, 0], ib: [0, 0], jewels: p.jewels };
    bufs.set(d, { vb: ev, ib: ei });
    out.push(d);
    console.log(`${fig}/${p.name}: ${idx.length / 3} tris, ${nv} verts, ${ev.length + ei.length} bytes, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  }
  data[fig] = out;
}
// lay the buffers out again, 4-byte aligned, and point the index at them
const chunks: Uint8Array[] = [];
let at = 0;
const put = (b: Uint8Array): [number, number] => {
  const start = at;
  chunks.push(b);
  at += b.length;
  const pad = (4 - (at % 4)) % 4;
  if (pad) {
    chunks.push(new Uint8Array(pad));
    at += pad;
  }
  return [start, start + b.length];
};
for (const pieces of Object.values(data)) {
  for (const p of pieces) {
    const b = bufs.get(p)!;
    p.vb = put(b.vb);
    p.ib = put(b.ib);
  }
}
writeFileSync(BIN, Buffer.concat(chunks));
writeFileSync(OUT, JSON.stringify(data, (k, v) => (typeof v === 'number' && k !== 'verts' && k !== 'indices' ? Math.round(v * 1e5) / 1e5 : v)));
