import * as THREE from 'three';
import { simplifiedLevels, type LodJob } from '../render/lod';
import { shadowOnly } from '../render/passCull';
import { viewCull } from '../render/viewCull';

// Distance levels for the island ground. Every 64 m chunk of the 2 m grid is
// simplified (in the worker) to a few error budgets; each frame a chunk shows
// the lightest level whose error stays under SUB_PX pixels at its distance.
// Chunks simplify independently, so their shared edges no longer match
// exactly: every level hangs a skirt down from its open edges, which fills
// the hairline gaps with ground-coloured wall. The waterline band is locked,
// so beaches meet the sea exactly where they always did, and the shadow map
// is drawn from a coarse stand-in of each chunk.

/**
 * Deviation (m) each level may have, finest first (the full grid is level 0).
 * The ground keeps its own smooth normals at every level, so only an outline
 * (a ridge against the sea or sky) can show a level's error at all.
 */
const LEVELS = [0.05, 0.14, 0.35, 0.8];
/**
 * The painted ground (contact shade under plants and rocks, forest floor,
 * bare spurs and green gullies) rides on the vertices: from COARSE metres of
 * error on, a level also holds each of these within its tolerance, so a far
 * island's big flat triangles never smear it away.
 */
const PAINT = ['aqAO', 'aqCanopy', 'aqErode'];
const PAINT_TOL = [0.12, 0.15, 0.25];
const COARSE = 0.3;
/** The shadow stand-in's deviation (m): about a shadow-map texel at the widest zoom, under the soft penumbra. */
const SHADOW_ERROR = 0.3;
/** How far a level's error may show on screen (CSS px). */
const SUB_PX = 1.5;
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
  /** World-space bounds of the ground (any level, its skirt too). */
  c: THREE.Vector3;
  r: number;
}

export class TerrainLod {
  private chunks: Chunk[] = [];
  private ready = false;

  constructor(
    list: TerrainChunk[],
    private group: THREE.Group,
  ) {
    for (const c of list) {
      this.chunks.push({ ...c, levels: [c.mesh.geometry], scale: c.top < -1 ? UNDER_SCALE : 1, level: 0, proxy: null, c: new THREE.Vector3(), r: 0 });
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
        const paint = PAINT.every((a) => surface.getAttribute(a));
        const jobs: LodJob[] = LEVELS.map((e) => {
          const error = e * c.scale;
          const j: LodJob = { error, lockY: SHORE_BAND, keep: 0.9 };
          if (paint && e >= COARSE) j.attrWeights = PAINT_TOL.map((t) => error / t);
          return j;
        });
        if (c.mesh.castShadow) jobs.push({ error: SHADOW_ERROR, keep: 0.9 });
        const out = await simplifiedLevels(surface, jobs, paint ? PAINT : undefined);
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
      c.mesh.updateMatrixWorld(true);
      const s = new THREE.Sphere().copy(c.levels[0]!.boundingSphere!).applyMatrix4(c.mesh.matrixWorld);
      c.c.copy(s.center);
      c.r = s.radius + SKIRT_DROP;
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
      // a chunk out of view leaves the scene's walks (its shadow stand-in stays
      // while its shadow can still reach the map); three's own culling would
      // only find the same, after visiting it in every pass
      const seen = viewCull.sees(c.c, c.r) || (!c.proxy && c.mesh.castShadow && viewCull.shades(c.c, c.r));
      if (c.mesh.visible !== seen) c.mesh.visible = seen;
      if (c.proxy) {
        const shade = viewCull.shades(c.c, c.r);
        if (c.proxy.visible !== shade) c.proxy.visible = shade;
      }
      if (!seen) continue;
      const d = Math.max(1, cam.distanceTo(c.c) - c.r);
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
