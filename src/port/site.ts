import { SUN_DIR } from '../render/environment';
import { clamp } from '../core/noise';
import { Terrain, Island } from '../world/terrain';

// Finds a stretch of coast for the harbour: a beach backed by land, a shelf
// that drops to deep water a short pier's length out, open sea in front for
// the camera, and the sun over the camera's shoulder.

export interface PortSite {
  island: Island;
  /** Seaward edge of the quay (centre), at sea level. */
  x: number;
  z: number;
  /** Outward normal (towards the sea). Local +x of the port runs along (nz, -nx). */
  nx: number;
  nz: number;
  /** Quay depth from the seaward edge back towards land. */
  depth: number;
}

export const PORT_HALF_WIDTH = 32;

export function findPortSite(terrain: Terrain, near: { x: number; z: number }): PortSite {
  const sl = Math.hypot(SUN_DIR.x, SUN_DIR.z);
  const sx = SUN_DIR.x / sl;
  const sz = SUN_DIR.z / sl;
  for (const strict of [true, false]) {
    let best: PortSite | null = null;
    let bestScore = -Infinity;
    for (const isl of terrain.islands) {
      if (isl.kind === 'atoll') continue;
      for (let k = 0; k < 64; k++) {
        const a = (k / 64) * Math.PI * 2;
        const nx = Math.cos(a);
        const nz = Math.sin(a);
        let shore = -1;
        let deep = -1;
        for (let d = 0; d < isl.r * 3; d += 1) {
          const h = terrain.heightAt(isl.x + nx * d, isl.z + nz * d);
          if (shore < 0) {
            if (h < 0) shore = d;
          } else if (h > 0.4) shore = -1; // a reef or islet further out: keep marching
          else if (h < -5.5) {
            deep = d;
            break;
          }
        }
        if (shore < 0 || deep < 0) continue;
        const shelf = deep - shore;
        if (shelf < 5 || shelf > (strict ? 26 : 40)) continue;
        const ox = isl.x + nx * deep;
        const oz = isl.z + nz * deep;
        const tx = nz;
        const tz = -nx;
        const depth = clamp(shelf + 6, 16, 30);
        const H = (u: number, v: number) => terrain.heightAt(ox + tx * u + nx * v, oz + tz * u + nz * v);
        let ok = true;
        // the berth must be deep enough for a galleon
        for (let u = -18; u <= 18 && ok; u += 3) for (let v = 2.5; v <= 12 && ok; v += 2.4) if (H(u, v) > -4) ok = false;
        // the quay deck must clear the ground everywhere
        const lim = strict ? 1.2 : 1.6;
        for (let u = -PORT_HALF_WIDTH; u <= PORT_HALF_WIDTH && ok; u += 3.5) for (let v = -depth; v <= 0 && ok; v += 3) if (H(u, v) > lim) ok = false;
        // open water for the camera, and the tower corner
        for (const [u, v] of [[0, 30], [0, 52], [-26, 36], [26, 36], [-42, 26], [42, 26]]) if (ok && H(u, v) > (strict ? -2 : 0)) ok = false;
        if (!ok) continue;
        // a beach right behind the quay along its whole length, and shallows under its back half
        let land = 0;
        let shallow = 0;
        let n = 0;
        for (let u = -30; u <= 30; u += 5) {
          n++;
          if (H(u, -depth - 3) > 0.25) land++;
          if (H(u, -depth * 0.6) > -3.2) shallow++;
        }
        land /= n;
        shallow /= n;
        if (strict && (land < 0.6 || shallow < 0.6)) continue;
        const ang = Math.acos(clamp(nx * sx + nz * sz, -1, 1));
        const score = 2 - Math.abs(ang - 0.55) * 1.6 + land * 1.2 + shallow * 0.8 - Math.abs(shelf - 14) * 0.03 - Math.hypot(ox - near.x, oz - near.z) / 1800;
        if (score > bestScore) {
          bestScore = score;
          best = { island: isl, x: ox, z: oz, nx, nz, depth };
        }
      }
    }
    if (best) return best;
  }
  // an open-water stilt harbour if the coast refuses
  return { island: terrain.islands[0], x: near.x, z: near.z, nx: 0, nz: 1, depth: 18 };
}

/** Circles covering the harbour, kept free of island vegetation. */
export function portClearings(s: PortSite) {
  const tx = s.nz;
  const tz = -s.nx;
  const v = -s.depth / 2 - 2;
  const r = Math.max(s.depth / 2 + 7, 15);
  return [-24, -8, 8, 24].map((u) => ({ x: s.x + tx * u + s.nx * v, z: s.z + tz * u + s.nz * v, r }));
}
