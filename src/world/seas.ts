import * as THREE from 'three';
import { FLOOR_DEPTH, Island, Reef, SeaFloor, Terrain } from './terrain';

/**
 * Every archipelago stitched into one sea. Each Terrain keeps its own square
 * of heightfield; a question about any point goes to the square it lies in,
 * and the open ocean between them (the high seas) is deep, level seabed.
 * Islands and reefs are listed home archipelago first, so the old indices
 * (the volcano is island 0) still hold.
 */
export class Seas implements SeaFloor {
  readonly islands: Island[] = [];
  readonly reefs: Reef[] = [];

  constructor(readonly regions: Terrain[]) {
    for (const t of regions) {
      this.islands.push(...t.islands);
      this.reefs.push(...t.reefs);
    }
  }

  /** The archipelago whose square holds (x, z), if any. */
  at(x: number, z: number): Terrain | null {
    for (const t of this.regions) if (t.contains(x, z)) return t;
    return null;
  }

  get abysses() {
    return this.regions.flatMap((t) => t.abysses);
  }

  heightAt(x: number, z: number): number {
    const t = this.at(x, z);
    return t ? t.heightAt(x, z) : FLOOR_DEPTH;
  }

  reefAt(x: number, z: number): number {
    return this.at(x, z)?.reefAt(x, z) ?? 0;
  }

  reefNear(x: number, z: number, pad = 0): Reef | null {
    for (const rf of this.reefs) if (Math.hypot(rf.x - x, rf.z - z) < rf.r + pad) return rf;
    return null;
  }

  lagoonAt(x: number, z: number): boolean {
    return this.at(x, z)?.lagoonAt(x, z) ?? false;
  }

  erosionAt(x: number, z: number): number {
    return this.at(x, z)?.erosionAt(x, z) ?? 0;
  }

  gradientAt(x: number, z: number, out: THREE.Vector2): THREE.Vector2 {
    const t = this.at(x, z);
    return t ? t.gradientAt(x, z, out) : out.set(0, 0);
  }

  nearestIsland(x: number, z: number): { island: Island; dist: number } | null {
    let best: Island | null = null;
    let bd = Infinity;
    for (const isl of this.islands) {
      const d = Math.hypot(isl.x - x, isl.z - z) - isl.r;
      if (d < bd) {
        bd = d;
        best = isl;
      }
    }
    return best ? { island: best, dist: bd } : null;
  }

  stampAO(x: number, z: number, radius: number, strength: number) {
    this.at(x, z)?.stampAO(x, z, radius, strength);
  }

  stampCanopy(x: number, z: number, radius: number, strength: number) {
    this.at(x, z)?.stampCanopy(x, z, radius, strength);
  }

  carveAbyss(x: number, z: number, r: number) {
    this.at(x, z)?.carveAbyss(x, z, r);
  }
}
