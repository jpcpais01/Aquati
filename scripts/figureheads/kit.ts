// What every figurehead sculpt shares. Each figure is a few pieces, each in
// its own frame so a baked mesh fits every hull whatever its lean:
//   body  the figure frame: upright, facing +z, the knee behind (-z, -y)
//   head  a head's own frame (origin mid-skull, looking +z), levelled at runtime
//   ship  ship axes (y up, z ahead) from an anchor in the figure frame:
//         for wings and arms that must spread out over the bows
// Units: a figure is about 1.3 units from tail to crown.

import { add, hex, mixC, type RGB, type Scene, type V3 } from './sdf.ts';

export type Bucket = 'trim' | 'iron' | 'wood';
export type Frame = { kind: 'body' } | { kind: 'head'; at: V3; tilt: number } | { kind: 'ship'; at: V3 };

export interface Piece {
  name: string;
  bucket: Bucket;
  frame: Frame;
  cell: number;
  tris: number;
  error: number;
  build: (s: Scene) => void;
  /** Stones set in the game, in the piece's frame: pearls, glowing eyes (a METAL or GLOW colour). */
  jewels?: Jewel[];
}

export interface Jewel {
  at: V3;
  r: number;
  kind: string;
}

// gilt, as painted for the standard trim (the game tints it to the ship's trim colour)
export const GILT: RGB = hex(0xe8b649);
export const GILT_DEEP = mixC(GILT, [0.36, 0.22, 0.08], 0.38);
export const GILT_PALE = mixC(GILT, [1, 0.96, 0.84], 0.4);

// ------------------------------------------------------------------ helpers

/** Fish scales: overlapping rows of little domes along a tube (s arc length, a angle). */
export function scales(size: number, depth: number, r: (u: number) => number) {
  return (u: number, ang: number, s: number) => {
    const row = s / size;
    const ri = Math.floor(row);
    const around = (ang * r(u)) / size + (ri % 2 ? 0.5 : 0);
    const fu = row - ri;
    const fa = around - Math.floor(around) - 0.5;
    // each scale: a dome highest near its free (tailward) edge, cut off sharply there
    const dome = Math.max(0, 1 - (fa * fa * 4 + (1 - fu) * (1 - fu) * 1.2));
    // rounded over at the free edge so it reads as a lip, not a crack
    const lip = fu > 0.82 ? 1 - Math.pow((fu - 0.82) / 0.18, 2) * 0.85 : 1;
    return -depth * dome * lip;
  };
}

/** Hair or feather grooves running along a tube. */
export function strands(count: number, depth: number, twist = 0) {
  return (_u: number, ang: number, s: number) => -depth * Math.pow(0.5 + 0.5 * Math.cos(ang * count + s * twist), 3);
}

/**
 * A spiral curl in the plane of unit vectors u and v, from a start angle,
 * its radius shrinking each turn: the end of a tentacle, a lock, a tail.
 */
export function curl(c: V3, u: V3, v: V3, r: number, shrink: number, a0: number, turns: number, n = 10): V3[] {
  const out: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + t * turns * Math.PI * 2;
    const rr = r * Math.pow(shrink, t * turns * 2);
    out.push(add(c, add([u[0] * Math.cos(a) * rr, u[1] * Math.cos(a) * rr, u[2] * Math.cos(a) * rr], [v[0] * Math.sin(a) * rr, v[1] * Math.sin(a) * rr, v[2] * Math.sin(a) * rr])));
  }
  return out;
}

/** A woman's face in a head frame (origin mid-skull, looking +z): the mermaid's and the seraph's. */
export function ladyFace(s: Scene, g: RGB, deep: RGB, pale: RGB) {
  // skull, face, jaw and cheeks
  s.ellipsoid([0, 0.02, -0.012], [0.088, 0.1, 0.097], g, 0);
  s.ellipsoid([0, -0.03, 0.035], [0.07, 0.083, 0.072], g, 0.04);
  s.ellipsoid([0, -0.083, 0.05], [0.04, 0.032, 0.038], g, 0.035);
  for (const sx of [-1, 1]) s.sphere([sx * 0.044, -0.022, 0.07], 0.028, g, 0.03);
  // brow and nose
  s.ellipsoid([0, 0.034, 0.086], [0.062, 0.017, 0.022], g, 0.025);
  s.cone([0, 0.018, 0.1], [0, -0.024, 0.118], 0.011, 0.015, g, 0.018);
  for (const sx of [-1, 1]) s.sphere([sx * 0.012, -0.03, 0.112], 0.009, g, 0.01);
  // eyes: sockets carved in, lidded eyes set in them, gazing ahead
  for (const sx of [-1, 1]) {
    s.ellipsoid([sx * 0.032, 0.012, 0.098], [0.022, 0.016, 0.014], deep, 0.012, undefined, true);
    s.sphere([sx * 0.032, 0.01, 0.086], 0.017, pale, 0.004);
    s.ellipsoid([sx * 0.032, 0.022, 0.092], [0.021, 0.008, 0.014], g, 0.006);
  }
  // lips, and the line between them
  s.ellipsoid([0, -0.056, 0.104], [0.021, 0.0075, 0.011], g, 0.008);
  s.ellipsoid([0, -0.069, 0.1], [0.018, 0.009, 0.011], g, 0.008);
  s.ellipsoid([0, -0.062, 0.113], [0.019, 0.002, 0.006], deep, 0.002, undefined, true);
}


/**
 * A feather or a shard: a flat kite from `a` to `b`, widest a third of the
 * way out, its face across `n`, with a quill down the middle. Built from
 * sheets, whose distances are exact, so even thin feathers mesh cleanly.
 */
export function feather(s: Scene, a: V3, b: V3, width: number, n: V3, col: RGB, half = 0.011, quill: RGB | null = null) {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L = Math.hypot(d[0], d[1], d[2]);
  const dir: V3 = [d[0] / L, d[1] / L, d[2] / L];
  const c: V3 = [n[1] * dir[2] - n[2] * dir[1], n[2] * dir[0] - n[0] * dir[2], n[0] * dir[1] - n[1] * dir[0]];
  const cl = Math.hypot(c[0], c[1], c[2]) || 1;
  const w = width / 2 / cl;
  const mid = add(a, [dir[0] * L * 0.36, dir[1] * L * 0.36, dir[2] * L * 0.36]);
  const left = add(mid, [c[0] * w, c[1] * w, c[2] * w]);
  const right = add(mid, [-c[0] * w, -c[1] * w, -c[2] * w]);
  s.sheet(a, left, b, half, col, 0.004);
  s.sheet(a, b, right, half, col, 0.004);
  s.cone(a, b, half * 1.5, half * 0.8, quill ?? col, 0.006);
}
