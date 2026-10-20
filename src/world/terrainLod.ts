import * as THREE from 'three';
import { simplifiedLevels, type LodJob } from '../render/lod';
import { shadowOnly } from '../render/passCull';

// Distance levels for the island ground. Every 64 m chunk of the 2 m grid is
// simplified (in the worker) to a few error budgets; each frame a chunk shows
// the lightest level whose error stays under SUB_PX pixels at its distance.
// Chunks simplify independently, so their shared edges no longer match
// exactly: every level hangs a skirt down from its open edges, which fills
// the hairline gaps with ground-coloured wall. The waterline band is locked,
// so beaches meet the sea exactly where they always did, and the shadow map
// is drawn from a coarse stand-in of each chunk.

/** Deviation (m) each level may have, finest first (the full grid is level 0). */
const LEVELS = [0.04, 0.1, 0.25];
/** The shadow stand-in's deviation (m): under a shadow-map texel at every zoom. */
const SHADOW_ERROR = 0.2;
/** How far a level's error may show on screen (CSS px). */
const SUB_PX = 0.75;
/** Underwater ground is seen through the waves: it can stray further. */
const UNDER_SCALE = 1.8;
/** How far below the edge the skirts hang (m), well past any level's error. */
export const SKIRT_DROP = 1.2;
/** Heights (m) that never move: the beaches and the shallows by them. */
const SHORE_BAND: [number, number] = [-0.8, 1];

export interface TerrainChunk {
  mesh: THREE.Mesh;
  /** For each grid vertex on the chunk's edge, its skirt copy (else -1). */
  skirtOf: Int32Array;
  /** Highest ground in the chunk (m). */
  top: number;
}

interface Chunk extends TerrainChunk {
  /** the full grid (skirted once ready), then one per LEVELS entry (null where it saves too little) */
  levels: (THREE.BufferGeometry | null)[];
  scale: number;
  level: number;
  proxy: THREE.Mesh | null;
}

export class TerrainLod {
  private chunks: Chunk[] = [];
  private ready = false;

  constructor(
    list: TerrainChunk[],
    private group: THREE.Group,
  ) {
    for (const c of list) {
      this.chunks.push({ ...c, levels: [c.mesh.geometry], scale: c.top < -1 ? UNDER_SCALE : 1, level: 0, proxy: null });
    }
    void this.start();
  }

  private async start() {
    await Promise.all(
      this.chunks.map(async (c) => {
        // the chunk as built is the bare surface (its skirt vertices unused):
        // each level, the full one too, gets a skirt from its own open edges
        const surface = c.mesh.geometry;
        const full = new THREE.BufferGeometry();
        for (const [name, a] of Object.entries(surface.attributes)) full.setAttribute(name, a);
        full.setIndex(Array.from(surface.index!.array));
        c.levels[0] = this.skirted(full, c.skirtOf);
        const jobs: LodJob[] = LEVELS.map((e) => ({ error: e * c.scale, lockY: SHORE_BAND, keep: 0.9 }));
        if (c.mesh.castShadow) jobs.push({ error: SHADOW_ERROR, keep: 0.9 });
        const out = await simplifiedLevels(surface, jobs);
        for (let i = 0; i < LEVELS.length; i++) c.levels.push(out[i] ? this.skirted(out[i]!, c.skirtOf) : null);
        const sh = c.mesh.castShadow ? out[LEVELS.length] : null;
        if (sh) {
          const proxy = shadowOnly(new THREE.Mesh(this.skirted(sh, c.skirtOf), c.mesh.material));
          proxy.matrixAutoUpdate = false;
          proxy.receiveShadow = false;
          proxy.visible = false;
          this.group.add(proxy);
          c.proxy = proxy;
        }
      }),
    );
    this.ready = true;
    for (const c of this.chunks) {
      c.mesh.geometry = c.levels[0]!;
      if (!c.proxy) continue;
      c.proxy.visible = true;
      c.mesh.castShadow = false;
    }
  }

  /**
   * A level's surface plus a skirt hanging from each of its open edges (the
   * chunk's rim): two triangles per edge down to the edge's skirt copies,
   * wound to face out of the chunk.
   */
  private skirted(level: THREE.BufferGeometry, skirtOf: Int32Array): THREE.BufferGeometry {
    const idx = level.index!.array;
    const pos = level.getAttribute('position');
    const n = pos.count;
    // open edges are used by one triangle only; keep the triangle's third corner
    const edges = new Map<number, number>();
    for (let t = 0; t < idx.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = idx[t + e];
        const b = idx[t + ((e + 1) % 3)];
        const key = a < b ? a * n + b : b * n + a;
        if (edges.has(key)) edges.set(key, -1);
        else edges.set(key, idx[t + ((e + 2) % 3)]);
      }
    }
    const out = Array.from(idx);
    const ab = new THREE.Vector3();
    const ad = new THREE.Vector3();
    const inward = new THREE.Vector3();
    for (const [key, c] of edges) {
      if (c < 0) continue;
      const a = Math.floor(key / n);
      const b = key - a * n;
      const a2 = skirtOf[a];
      const b2 = skirtOf[b];
      if (a2 < 0 || b2 < 0) continue;
      // face away from the triangle the edge belongs to
      ab.set(pos.getX(b) - pos.getX(a), pos.getY(b) - pos.getY(a), pos.getZ(b) - pos.getZ(a));
      ad.set(0, -1, 0);
      const nrm = ab.cross(ad);
      inward.set(pos.getX(c) - pos.getX(a), 0, pos.getZ(c) - pos.getZ(a));
      if (nrm.dot(inward) > 0) out.push(a, b2, b, a, a2, b2);
      else out.push(a, b, b2, a, b2, a2);
    }
    level.setIndex(out);
    level.computeBoundingSphere();
    return level;
  }

  /** Each chunk to the lightest level that holds under SUB_PX pixels where it lies. */
  update(camera: THREE.PerspectiveCamera) {
    if (!this.ready || !this.group.visible) return;
    const pxK = camera.projectionMatrix.elements[5] * 0.5 * (typeof innerHeight === 'number' ? innerHeight : 1080);
    const cam = camera.position;
    for (const c of this.chunks) {
      const s = c.mesh.geometry.boundingSphere!;
      const d = Math.max(1, cam.distanceTo(s.center) - s.radius);
      const pxPerM = pxK / d;
      let level = 0;
      for (let i = LEVELS.length; i >= 1; i--) {
        // a little leaning toward the level on show, so a chunk on a boundary doesn't flick
        const lean = i === c.level ? 1.1 : 0.95;
        if (c.levels[i] && LEVELS[i - 1] * c.scale * pxPerM < SUB_PX * lean) {
          level = i;
          break;
        }
      }
      if (level === c.level) continue;
      c.level = level;
      c.mesh.geometry = c.levels[level]!;
    }
  }
}
