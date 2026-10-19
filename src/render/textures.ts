import * as THREE from 'three';
import { mulberry32 } from '../core/noise';

// All textures are generated at startup: zero downloads, perfectly tileable,
// and tiny enough to keep the PWA cache lean.

function makeDataTexture(data: Uint8Array, size: number, srgb = false): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Tileable ripple normal map built from integer-frequency sine waves. */
export function createWaterNormalTexture(size = 256, seed = 7): THREE.DataTexture {
  const rnd = mulberry32(seed);
  const comps: { kx: number; ky: number; a: number; p: number }[] = [];
  for (let i = 0; i < 48; i++) {
    let kx = 0;
    let ky = 0;
    while (kx === 0 && ky === 0) {
      const r = 3 + Math.floor(Math.pow(rnd(), 1.6) * 26);
      const ang = rnd() * Math.PI * 2;
      kx = Math.round(Math.cos(ang) * r);
      ky = Math.round(Math.sin(ang) * r);
    }
    const len = Math.hypot(kx, ky);
    comps.push({ kx, ky, a: 1 / Math.pow(len, 1.15), p: rnd() * Math.PI * 2 });
  }
  const data = new Uint8Array(size * size * 4);
  const tau = Math.PI * 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      let h = 0;
      let dx = 0;
      let dy = 0;
      for (const c of comps) {
        const th = tau * (c.kx * u + c.ky * v) + c.p;
        // sharpen crests a little for a choppier look
        const s = Math.sin(th);
        const co = Math.cos(th);
        h += c.a * s;
        dx += c.a * co * c.kx;
        dy += c.a * co * c.ky;
      }
      const i = (y * size + x) * 4;
      const sx = dx * 0.055;
      const sy = dy * 0.055;
      const inv = 1 / Math.sqrt(sx * sx + sy * sy + 1);
      data[i] = Math.round((-sx * inv * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((-sy * inv * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round(Math.min(1, Math.max(0, h * 0.18 + 0.5)) * 255);
      data[i + 3] = 255;
    }
  }
  return makeDataTexture(data, size);
}

function periodicValueNoise(size: number, cells: number, rnd: () => number): Float32Array {
  const lat = new Float32Array(cells * cells);
  for (let i = 0; i < lat.length; i++) lat[i] = rnd();
  const out = new Float32Array(size * size);
  const q = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * cells;
    const y0 = Math.floor(fy);
    const ty = q(fy - y0);
    const ya = y0 % cells;
    const yb = (y0 + 1) % cells;
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const x0 = Math.floor(fx);
      const tx = q(fx - x0);
      const xa = x0 % cells;
      const xb = (x0 + 1) % cells;
      const a = lat[ya * cells + xa];
      const b = lat[ya * cells + xb];
      const c = lat[yb * cells + xa];
      const d = lat[yb * cells + xb];
      out[y * size + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    }
  }
  return out;
}

function periodicFbm(size: number, baseCells: number, octaves: number, rnd: () => number): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 0.5;
  let cells = baseCells;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const n = periodicValueNoise(size, cells, rnd);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    norm += amp;
    amp *= 0.5;
    cells *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

/** Periodic Worley distances: returns F1 and F2 per texel. */
function periodicWorley(size: number, cells: number, rnd: () => number): { f1: Float32Array; f2: Float32Array } {
  const pts = new Float32Array(cells * cells * 2);
  for (let i = 0; i < cells * cells; i++) {
    pts[i * 2] = rnd();
    pts[i * 2 + 1] = rnd();
  }
  const f1 = new Float32Array(size * size);
  const f2 = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * cells;
    const cy = Math.floor(fy);
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const cx = Math.floor(fx);
      let d1 = 9;
      let d2 = 9;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const gx = cx + ox;
          const gy = cy + oy;
          const wx = ((gx % cells) + cells) % cells;
          const wy = ((gy % cells) + cells) % cells;
          const px = gx + pts[(wy * cells + wx) * 2];
          const py = gy + pts[(wy * cells + wx) * 2 + 1];
          const d = Math.hypot(px - fx, py - fy);
          if (d < d1) {
            d2 = d1;
            d1 = d;
          } else if (d < d2) d2 = d;
        }
      }
      f1[y * size + x] = d1;
      f2[y * size + x] = d2;
    }
  }
  return { f1, f2 };
}

/**
 * Four-channel tileable noise:
 *  R: soft large fbm (cloud shadows), G: medium fbm (foam breakup / terrain detail),
 *  B: worley bubbles (foam cells), A: fine fbm (sparkle / grain).
 */
export function createNoiseTexture(size = 256, seed = 11): THREE.DataTexture {
  const rnd = mulberry32(seed);
  const r = periodicFbm(size, 4, 5, rnd);
  const g = periodicFbm(size, 8, 4, rnd);
  const w = periodicWorley(size, 14, rnd);
  const a = periodicFbm(size, 32, 2, rnd);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = Math.round(r[i] * 255);
    data[i * 4 + 1] = Math.round(g[i] * 255);
    data[i * 4 + 2] = Math.round(Math.min(1, w.f1[i] * 1.25) * 255);
    data[i * 4 + 3] = Math.round(a[i] * 255);
  }
  return makeDataTexture(data, size);
}

/** Tileable caustic web: bright thin lines where Worley cells meet. */
export function createCausticTexture(size = 256, seed = 23): THREE.DataTexture {
  const rnd = mulberry32(seed);
  const a = periodicWorley(size, 7, rnd);
  const b = periodicWorley(size, 11, rnd);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const e1 = a.f2[i] - a.f1[i];
    const e2 = b.f2[i] - b.f1[i];
    const l1 = Math.pow(Math.max(0, 1 - e1 / 0.22), 3.2);
    const l2 = Math.pow(Math.max(0, 1 - e2 / 0.2), 3.0);
    const v = Math.min(1, l1 * 0.85 + l2 * 0.5);
    data[i * 4] = Math.round(v * 255);
    data[i * 4 + 1] = Math.round(l1 * 255);
    data[i * 4 + 2] = Math.round(l2 * 255);
    data[i * 4 + 3] = 255;
  }
  return makeDataTexture(data, size);
}

/**
 * Tileable sea foam. Real foam is a web of bubble rafts around dark holes of
 * every size, thick in some places and frayed to threads in others. R holds
 * that web as a "foam potential", histogram-equalised so a threshold of
 * 1 - c covers exactly c of the surface: shaders dissolve foam just by lowering
 * c, and the holes open, the rafts thin to threads and the threads snap into
 * flecks. G is a finer fbm (fraying), B a second web from the smaller holes
 * (to break the tiling), A a soft fbm for patchiness.
 */
export function createFoamTexture(size = 384, seed = 31): THREE.DataTexture {
  const rnd = mulberry32(seed);
  const warpX = periodicFbm(size, 4, 3, rnd);
  const warpY = periodicFbm(size, 4, 3, rnd);
  const patch = periodicFbm(size, 3, 4, rnd);
  const fray = periodicFbm(size, 12, 3, rnd);
  const soft = periodicFbm(size, 4, 4, rnd);
  // cell sites, each with its own size so holes range from pinpricks to pools
  const sites = (cells: number, spread: number) => {
    const p = new Float32Array(cells * cells * 3);
    for (let i = 0; i < cells * cells; i++) {
      p[i * 3] = 0.1 + rnd() * 0.8;
      p[i * 3 + 1] = 0.1 + rnd() * 0.8;
      p[i * 3 + 2] = 1 / (1 - spread + rnd() * spread * 2);
    }
    return p;
  };
  // weighted Worley: distance to the nearest site (F1) and how far inside
  // its cell we are, measured against the runner-up (the wall falls at 0)
  let wallD = 0;
  const cell = (pts: Float32Array, cells: number, fx: number, fy: number) => {
    const cx = Math.floor(fx);
    const cy = Math.floor(fy);
    let d1 = 9;
    let d2 = 9;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const gx = cx + ox;
        const gy = cy + oy;
        const k = ((((gy % cells) + cells) % cells) * cells + (((gx % cells) + cells) % cells)) * 3;
        const ddx = gx + pts[k] - fx;
        const ddy = gy + pts[k + 1] - fy;
        const d = Math.sqrt(ddx * ddx + ddy * ddy) * pts[k + 2];
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) d2 = d;
      }
    }
    wallD = d2 - d1;
  };
  const cA = 7;
  const cB = 17;
  const cC = 38;
  const pA = sites(cA, 0.45);
  const pB = sites(cB, 0.4);
  const pC = sites(cC, 0.35);
  const n = size * size;
  const webA = new Float32Array(n);
  const webB = new Float32Array(n);
  const hole = (e: number, w: number) => Math.min(1, e / w);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      // a strong warp so the holes are soft, lopsided blobs, never polygons
      const wx = (warpX[i] - 0.5) * 1.6;
      const wy = (warpY[i] - 0.5) * 1.6;
      const u = x / size;
      const v = y / size;
      cell(pA, cA, (u + wx / cA) * cA, (v + wy / cA) * cA);
      const hA = hole(wallD, 0.55);
      cell(pB, cB, (u - wy / cB) * cB, (v + wx / cB) * cB);
      const hB = hole(wallD, 0.5);
      cell(pC, cC, (u + wy * 0.6 / cC) * cC, (v - wx * 0.6 / cC) * cC);
      const hC = hole(wallD, 0.45);
      // foam is wherever no hole has opened: the deepest hole of the three
      // scales wins, so big pools are fringed with smaller bubbles
      const open = Math.max(hA * hA * (0.75 + 0.5 * patch[i]), hB * (0.8 + 0.3 * fray[i]) * 0.9, hC * 0.72);
      webA[i] = 1 - open + (patch[i] - 0.5) * 0.55 + (fray[i] - 0.5) * 0.25;
      webB[i] = 1 - Math.max(hB * hB, hC * 0.6) + (soft[i] - 0.5) * 0.5;
    }
  }
  const equalise = (f: Float32Array) => {
    // value and index packed in one float64, so the native numeric sort does it
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < n; i++) {
      lo = Math.min(lo, f[i]);
      hi = Math.max(hi, f[i]);
    }
    const keys = new Float64Array(n);
    const scale = 1e6 / Math.max(hi - lo, 1e-6);
    for (let i = 0; i < n; i++) keys[i] = Math.floor((f[i] - lo) * scale) * 262144 + i;
    keys.sort();
    const out = new Float32Array(n);
    for (let r = 0; r < n; r++) out[keys[r] % 262144] = r / (n - 1);
    return out;
  };
  const eA = equalise(webA);
  const eB = equalise(webB);
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    data[i * 4] = Math.round(eA[i] * 255);
    data[i * 4 + 1] = Math.round(fray[i] * 255);
    data[i * 4 + 2] = Math.round(eB[i] * 255);
    data[i * 4 + 3] = Math.round(soft[i] * 255);
  }
  return makeDataTexture(data, size);
}

export interface SharedTextures {
  waterNormal: THREE.DataTexture;
  noise: THREE.DataTexture;
  caustics: THREE.DataTexture;
}

let shared: SharedTextures | null = null;
export function getSharedTextures(): SharedTextures {
  if (!shared) {
    shared = {
      waterNormal: createWaterNormalTexture(),
      noise: createNoiseTexture(),
      caustics: createCausticTexture(),
    };
  }
  return shared;
}
