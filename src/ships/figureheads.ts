import * as THREE from 'three';
import { lerp } from '../core/noise';
import { MeshoptDecoder } from 'meshoptimizer/decoder';
import { ball, colorize, hexL, spiral, sweep } from './geo';
import { GLOW, merged, METAL, type PartKit } from './partModels';
import type { Part } from './parts';
import type { HullShape } from './shipModel';
import type { ShipClass } from './shipTypes';

// Figureheads and the carved head they ride on. Every hull grows a knee of
// the head: a deep, rounded timber bracket run out forward of the stem under
// the bowsprit, gilt-edged and carved with trailboards, and the figure sits
// on its tip, big enough to read from the helm view: about a fifth of the
// ship's length, leaning out over the cutwater as far as the bowsprit lets it.
//
// Figures are sculpted offline (scripts/figureheads) in their own frame:
// upright, facing +z, the knee and stem behind them (-z, -y), about 1.3 units
// tall from tail to crown, then placed by bowHead(). Heads are levelled so
// they look ahead, not down at the sea. Everything goes into the ship's
// merged buckets (gilt, metal, wood and glow), so a figure costs triangles
// but no draw calls, no new materials and no new shaders.

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const Y = V(0, 1, 0);
const Z = V(0, 0, 1);

/** The bowsprit's rake (see ShipModel.buildRig). */
const SPRIT_ANGLE = 0.32;

export interface BowHead {
  /** The tip of the knee, where the figure's hips sit (hull-root space). */
  at: THREE.Vector3;
  /** Figure units to metres. */
  scale: number;
  /** How far the figure leans out from upright, radians. */
  lean: number;
  place: THREE.Matrix4;
  /** The middle of the figure, for cameras. */
  centre: THREE.Vector3;
  /** The figure's frame point (frame y up, frame z forward) in hull-root space. */
  P: (fy: number, fz: number, fx?: number) => THREE.Vector3;
  /** Front face of the stem post. */
  stem: number;
  /** Where the knee's lower edge meets the stem. */
  yLow: number;
  /** On the knee's cutwater, under the figure: where the bobstay is set up. */
  foot: THREE.Vector3;
}

/**
 * Where the figure goes on a hull, and how big: hips just under the rail line
 * on a knee run out ahead of the stem, leaning forward only as far as it must
 * to keep its crown clear of the bowsprit.
 */
export function bowHead(s: HullShape, c: ShipClass): BowHead {
  const L = c.length;
  const T = s.top(1);
  const B = s.bottom(1);
  const stem = s.z(1) + (0.11 + L * 0.003) * 1.4;
  // underside of the bowsprit, with room to spare
  const bz = s.z(0.985);
  const by = s.top(0.985) - 0.1 - 0.24;
  const under = (z: number) => by + Math.tan(SPRIT_ANGLE) * (z - bz) - 0.2;
  // crown and face must pass under the bowsprit, the tail's fluke must stay out of the sea
  const crown = [V(0, 1.34, 0.02), V(0, 1.27, 0.3), V(0, 1.18, 0.46)];
  const tail = [V(0, -0.68, 0.12), V(0, -0.6, 0.32)];
  const rot = (p: THREE.Vector3, a: number) => V(p.x, p.y * Math.cos(a) - p.z * Math.sin(a), p.y * Math.sin(a) + p.z * Math.cos(a));
  // the biggest figure that fits, as upright as it can stand
  const big = 1.75 + L * 0.04;
  let S = big;
  let lean = 0.62;
  let at = V(0, 0, 0);
  const fits = () => {
    const drop = Math.max(...tail.map((p) => -rot(p, lean).y));
    at = V(0, Math.max(lerp(B, T, 0.4), 0.5 + drop * S), stem + 0.3 * S);
    return crown.every((k) => {
      const p = rot(k, lean).multiplyScalar(S).add(at);
      return p.y < under(p.z);
    });
  };
  search: for (; S > big * 0.6; S -= 0.04) {
    for (lean = 0.62; lean <= 1.1; lean += 0.03) if (fits()) break search;
  }
  const place = new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(new THREE.Euler(lean, 0, 0)), V(S, S, S));
  const P = (fy: number, fz: number, fx = 0) => V(fx, fy, fz).applyMatrix4(place);
  const yLow = Math.max(B + 0.15, P(-0.62, -0.1).y - 0.35, 0.35);
  const foot = V(0, yLow + 0.12, stem).lerp(P(-0.55, -0.12), 0.4);
  return { at, scale: S, lean, place, centre: P(0.6, 0.05), P, stem, yLow, foot };
}

/**
 * The knee of the head: a deep bracket from the stem out to the figure's
 * hips, its front edge running down under the figure's tail to the
 * cutwater, gilt beading round its edges and a carved trailboard scroll on
 * each cheek.
 */
export function buildKnee(s: HullShape, c: ShipClass, h: BowHead, wood: THREE.BufferGeometry[], trim: THREE.BufferGeometry[], col: THREE.Color, detail: boolean) {
  const L = c.length;
  const T = s.top(1);
  const yLow = h.yLow;
  const back = h.stem - 0.35;
  const shoulder = h.P(0.3, -0.32);
  const yTop = Math.min(T - 0.5, shoulder.y - 0.15);
  const P = h.P;
  const v2 = (p: THREE.Vector3) => new THREE.Vector2(p.z, p.y);
  // lower edge: from the forefoot, sweeping out and up under the tail to the tip
  const low = [
    new THREE.Vector2(back, yLow),
    new THREE.Vector2(h.stem, yLow + 0.12),
    v2(P(-0.55, -0.12)),
    v2(P(-0.24, -0.06)),
    v2(P(0.02, -0.05)),
  ];
  // back over the hips and down along her back to the stem under the rail
  const top = [v2(P(0.2, -0.12)), v2(shoulder), new THREE.Vector2(lerp(h.stem, shoulder.z, 0.4), lerp(yTop, shoulder.y, 0.3)), new THREE.Vector2(back, yTop)];
  const sh = new THREE.Shape();
  sh.moveTo(low[0].x, low[0].y);
  sh.splineThru(low.slice(1));
  sh.splineThru(top);
  sh.lineTo(low[0].x, low[0].y);
  const th = 0.24 + L * 0.006;
  const bev = 0.07 + L * 0.0015;
  const knee = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: detail ? 3 : 2, curveSegments: detail ? 14 : 8, steps: 1 });
  knee.applyMatrix4(new THREE.Matrix4().makeBasis(V(0, 0, 1), V(0, 1, 0), V(-1, 0, 0)).setPosition(th / 2, 0, 0));
  // thinning towards the tip, like a cutwater
  const tip = P(0.02, -0.05).z;
  const kp = knee.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < kp.count; i++) kp.setX(i, kp.getX(i) * lerp(1, 0.6, Math.min(1, Math.max(0, (kp.getZ(i) - h.stem) / (tip - h.stem)))));
  knee.computeVertexNormals();
  wood.push(colorize(knee, col, 0.02));

  // gilt beading along both cheeks of the lower edge, and a scrolled trailboard above it
  const edge = new THREE.SplineCurve(low.slice(1));
  const topC = new THREE.SplineCurve(top);
  const half = th / 2 + bev * 0.7;
  const r = 0.045 + L * 0.0012;
  for (const side of [1, -1]) {
    const bead: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k++) {
      const p = edge.getPoint(k / 10);
      const f = Math.min(1, Math.max(0, (p.x - h.stem) / (tip - h.stem)));
      bead.push(V(side * lerp(half, half * 0.6, f), p.y + 0.06, p.x - 0.05));
    }
    trim.push(sweep(bead, () => r, 5, 20));
    const crest: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k++) {
      const p = topC.getPoint(k / 10);
      const f = Math.min(1, Math.max(0, (p.x - h.stem) / (tip - h.stem)));
      crest.push(V(side * lerp(half, half * 0.6, f), p.y - 0.06, p.x));
    }
    trim.push(sweep(crest, () => r * 0.85, 5, 20));
    const board: THREE.Vector3[] = [];
    for (let k = 0; k <= 8; k++) {
      const u = k / 8;
      const a = edge.getPoint(lerp(0.15, 0.95, u));
      const b = topC.getPoint(lerp(0.85, 0.05, u));
      const m = new THREE.Vector2().lerpVectors(a, b, 0.45);
      const f = Math.min(1, Math.max(0, (m.x - h.stem) / (tip - h.stem)));
      board.push(V(side * (lerp(half, half * 0.6, f) + 0.01), m.y, m.x));
    }
    const end = board[board.length - 1];
    const prev = board[board.length - 2];
    const dir = end.clone().sub(prev).normalize();
    const curl = spiral(end.clone().addScaledVector(dir, 0.05).add(V(0, -0.16, 0)), Z, Y, 0.16 + L * 0.004, 0.9, Math.PI / 2, 10);
    trim.push(sweep([...board.slice(0, -1), ...curl], (u) => lerp(r * 1.5, r * 0.6, u), 6, 34));
    trim.push(ball(r * 1.4, curl[curl.length - 1], 6, 4));
    // a carved acanthus leaf at the start of the board
    trim.push(ball(r * 2.2, board[0], 8, 6));
  }
  return { top: topC, edge, half };
}

/** A figurehead's pieces go to the ship's buckets by material. */
type Bucket = 'wood' | 'iron' | 'glow' | 'trim';

/**
 * Builds a figure into the ship's buckets: the part's own, or the standard
 * gilded mermaid when no figurehead part is fitted.
 */
export function buildFigure(k: PartKit, p: Part | undefined, h: BowHead) {
  const fig = p?.id.split(':')[1] ?? 'mermaid';
  const pieces = baked?.[fig] ?? baked?.mermaid;
  if (!pieces) return;
  placeBaked(k, pieces, h);
  if (fig === 'seraph') seraphLights(k, h);
}

/** The seraph's star cupped in her hands, and the halo turning level over her head. */
function seraphLights(k: PartKit, h: BowHead) {
  const star = V(0, 1.13, 0.44);
  const ray = (g: THREE.BufferGeometry) => k.glow.push(colorize(g.translate(star.x, star.y, star.z).applyMatrix4(h.place), GLOW.star, 0));
  ray(new THREE.OctahedronGeometry(0.1, 0));
  for (let i = 0; i < 8; i++) ray(new THREE.ConeGeometry(0.016, i % 2 ? 0.1 : 0.18, 3).translate(0, i % 2 ? 0.1 : 0.14, 0).rotateZ((i * Math.PI) / 4));
  const c = Math.cos(h.lean);
  const s = Math.sin(h.lean);
  const halo = merged([
    colorize(new THREE.TorusGeometry(0.16, 0.015, 3, 32).rotateX(Math.PI / 2), GLOW.star, 0),
    colorize(new THREE.TorusGeometry(0.115, 0.008, 3, 6).rotateX(Math.PI / 2), GLOW.aether, 0),
  ]).scale(h.scale, h.scale, h.scale);
  const pos = V(0, 1.07 + 0.24 * c - 0.06 * s, 0.03 - 0.24 * s - 0.06 * c).applyMatrix4(h.place);
  const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-h.lean - 0.3, 0, 0)).premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(h.lean, 0, 0)));
  k.spinners.push({ geo: halo, mat: 'glow', pos, quat, axis: Y, spin: 0.9, bob: 0.025, rate: 1.6, phase: 0 });
}

// ------------------------------------------------------------------ baked

// The figures are sculpted offline (scripts/figureheads): smooth blended forms
// carved like wood and gilt, meshed and simplified to a few thousand
// triangles, and shipped meshopt-compressed in figureData.bin (indexed by
// figureData.json), fetched and decoded once at start. Each piece has its own frame so one bake
// fits every hull: the body in the figure frame, a head levelled here, wings
// and arms in ship axes so they spread out over the bows.

type BakedFrame = { kind: 'body' } | { kind: 'head'; at: number[]; tilt: number } | { kind: 'ship'; at: number[] };
interface Jewel {
  at: number[];
  r: number;
  kind: string;
}
interface PieceData {
  name: string;
  bucket: Bucket;
  frame: BakedFrame;
  min: number[];
  max: number[];
  verts: number;
  indices: number;
  /** Byte ranges in figureData.bin. */
  vb: [number, number];
  ib: [number, number];
  jewels?: Jewel[];
}
interface BakedPiece {
  bucket: Bucket;
  frame: BakedFrame;
  geo: THREE.BufferGeometry;
  /** Luminance of each vertex's paint against the bake's gilt (trim pieces take the ship's trim). */
  shade: Float32Array | null;
  jewels: Jewel[];
}

/** Gilt as painted in the bake. */
const BAKED_GILT = hexL(0xe8b649);
const lum = (c: THREE.Color) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
let baked: Record<string, BakedPiece[]> | null = null;

/** Decodes the baked figures. Called once at start, before any ship is built. */
export async function loadFigureheads() {
  if (baked) return;
  try {
    const [index, bin] = await Promise.all([
      import('./figureData.json').then((m) => m.default as unknown as Record<string, PieceData[]>),
      import('./figureData.bin?url').then((m) => fetch(m.default)).then((r) => r.arrayBuffer()),
      MeshoptDecoder.ready,
    ]);
    const out: Record<string, BakedPiece[]> = {};
    for (const [fig, pieces] of Object.entries(index)) out[fig] = pieces.map((d) => decodePiece(d, bin));
    baked = out;
  } catch (e) {
    // no figureheads then: ships sail without them
    console.warn('figureheads: could not load', e);
  }
}

/** 12-byte vertices: uint16 position in the piece's bounds, uint8 sRGB paint. Normals are rebuilt here. */
function decodePiece(d: PieceData, bin: ArrayBuffer): BakedPiece {
  const n = d.verts;
  const vb = new Uint8Array(n * 12);
  MeshoptDecoder.decodeVertexBuffer(vb, n, 12, new Uint8Array(bin, d.vb[0], d.vb[1] - d.vb[0]));
  const idx = new Uint32Array(d.indices);
  MeshoptDecoder.decodeIndexBuffer(new Uint8Array(idx.buffer), d.indices, 4, new Uint8Array(bin, d.ib[0], d.ib[1] - d.ib[0]));
  const dv = new DataView(vb.buffer);
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const shade = d.bucket === 'trim' ? new Float32Array(n) : null;
  const c = new THREE.Color();
  const gl = lum(BAKED_GILT);
  for (let i = 0; i < n; i++) {
    const o = i * 12;
    for (let k = 0; k < 3; k++) pos[i * 3 + k] = d.min[k] + (dv.getUint16(o + k * 2, true) / 65535) * (d.max[k] - d.min[k]);
    c.setRGB(vb[o + 8] / 255, vb[o + 9] / 255, vb[o + 10] / 255, THREE.SRGBColorSpace);
    c.toArray(col, i * 3);
    if (shade) shade[i] = lum(c) / gl;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  return { bucket: d.bucket, frame: d.frame, geo, shade, jewels: d.jewels ?? [] };
}

/** Where a piece's frame sits in the figure frame. */
function frameMatrix(f: BakedFrame, lean: number) {
  if (f.kind === 'body') return new THREE.Matrix4();
  // a head is levelled to look ahead, a touch up by its tilt; ship-axis pieces undo the lean altogether
  const pitch = f.kind === 'head' ? -lean * 0.85 - f.tilt : -lean;
  return new THREE.Matrix4().compose(V(f.at[0], f.at[1], f.at[2]), new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, 0, 0)), V(1, 1, 1));
}

function placeBaked(k: PartKit, pieces: BakedPiece[], h: BowHead) {
  const trim = hexL(k.livery.trim);
  for (const pc of pieces) {
    const g = pc.geo.clone();
    if (pc.shade) {
      // gilt in the ship's own trim colour, its carved shading kept
      const col = g.getAttribute('color') as THREE.BufferAttribute;
      for (let i = 0; i < col.count; i++) {
        const t = pc.shade[i];
        col.setXYZ(i, Math.min(1, trim.r * t), Math.min(1, trim.g * t), Math.min(1, trim.b * t));
      }
    }
    const m = frameMatrix(pc.frame, h.lean).premultiply(h.place);
    g.applyMatrix4(m);
    k[pc.bucket].push(g);
    for (const j of pc.jewels) {
      const glow = (GLOW as Record<string, THREE.Color>)[j.kind];
      const at = V(j.at[0], j.at[1], j.at[2]).applyMatrix4(m);
      const r = j.r * h.scale;
      const w = r > 0.08 ? 12 : 7;
      k[glow ? 'glow' : 'trim'].push(colorize(ball(r, at, w, Math.ceil(w * 0.7)), glow ?? (METAL as Record<string, THREE.Color>)[j.kind] ?? METAL.pearl, 0.03));
    }
  }
}
