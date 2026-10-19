import * as THREE from 'three';
import { mulberry32, Simplex2, smoothstep } from '../core/noise';
import { patchMaterial } from '../render/environment';
import { shadowOnly } from '../render/passCull';
import { Terrain, Island } from './terrain';
import {
  palmGeometry, broadleafGeometry, pineGeometry, bananaGeometry, fernGeometry, bushGeometry, flowerBushGeometry,
  wildflowerGeometry, tuftGeometry, rockGeometry, starfishGeometry, shellGeometry, coconutsGeometry, driftwoodGeometry,
} from './flora';

export { palmGeometry } from './flora';

// Island planting. Each island is zoned like a real tropical isle: coconut
// groves along the beaches with dune grass and fallen nuts, rain-tree jungle
// with banana and fern understorey in the valleys, sunny meadows of grass,
// wildflower drifts, hibiscus and croton with the odd scarlet flame tree or
// lilac blossom tree standing alone, and island pines up on the heights.
//
// One InstancedMesh per species variant per island keeps draw calls few. Each
// island also has a far LOD (same instances, lighter meshes, no ground cover)
// that it swaps to when the camera is well away from it, and the tiny ground
// cover shrinks away with distance in the vertex shader instead of popping.
// Within a batch every plant is culled on its own: only those in view, or
// whose shadow can reach the view, are packed to the front of the instance
// buffer and drawn. Palms and broadleaf trees hand their shadow to a stand-in
// with the very same fronds and puffs, just more coarsely cut: the detailed
// mesh is only drawn where it is seen, the stand-in only into the shadow map.

const TAU = Math.PI * 2;

interface Placement {
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale: number;
  variant: number;
  tint: number;
}

const KINDS = [
  'palm', 'tree', 'pine', 'banana', 'fern', 'bush', 'flowerBush', 'wildflower', 'tuft', 'dune', 'rock', 'beach', 'coconuts', 'drift',
] as const;
type Kind = (typeof KINDS)[number];
type Lists = Record<Kind, Placement[]>;

/** Variants of the `tree` kind (index into its geometry list). */
const T_ROUND = 0;
const T_TALL = 2;
const T_FLAME = 3;
const T_BLOSSOM = 4;

/** One instanced batch whose plants are culled one by one. */
interface Batch {
  mesh: THREE.InstancedMesh;
  /** Every plant's matrix and colour; the mesh's own buffers hold the drawn subset. */
  mat: Float32Array;
  col: Float32Array;
  /** Bounding sphere per plant: x, y, z, r. */
  sph: Float32Array;
  /** Plant indices drawn last time, so an unchanged set is never re-uploaded. */
  shown: Uint32Array;
  n: number;
  shadows: boolean;
}

interface IslandFlora {
  near: THREE.Group;
  far: THREE.Group;
  always: THREE.Group;
  nearB: Batch[];
  farB: Batch[];
  alwaysB: Batch[];
  cx: number;
  cy: number;
  cz: number;
  ext: number;
  peak: number;
  isNear: boolean;
}

const _frustum = new THREE.Frustum();
const _pv = new THREE.Matrix4();
const _dir = new THREE.Vector3();
const _sphere = new THREE.Sphere();
const _m4 = new THREE.Matrix4();
/** Frustum margin (m): small camera moves never uncover an unculled plant. */
const MARGIN = 14;

export class Vegetation {
  readonly group = new THREE.Group();
  private lists: Lists[] = [];
  private flora: IslandFlora[] = [];
  /** While set (the loading screen's warm-up draw), nothing is culled or swapped. */
  hold = false;
  // the view the batches were last culled for
  private cullPos = new THREE.Vector3(Infinity, 0, 0);
  private cullDir = new THREE.Vector3();
  private cullLight = new THREE.Vector3();
  private cullProj = new Float32Array(2);

  constructor(
    private terrain: Terrain,
    private density = 1,
    private clearings: { x: number; z: number; r: number }[] = [],
    private lite = false,
  ) {
    this.group.name = 'vegetation';
    terrain.islands.forEach((isl, i) => this.placeOnIsland(isl, i));
  }

  private placeOnIsland(isl: Island, idx: number) {
    const t = this.terrain;
    const rnd = mulberry32(Math.floor(isl.seed * 1000) + idx);
    const s = new Simplex2(Math.floor(isl.seed * 77));
    const L = Object.fromEntries(KINDS.map((k) => [k, []])) as unknown as Lists;
    const pl = (x: number, y: number, z: number, scale: number, variant: number): Placement => ({ x, y, z, rotY: rnd() * TAU, scale, variant, tint: rnd() });

    // spatial hash of occupied discs so trunks and shrubs never interpenetrate
    const taken: { x: number; z: number; r: number }[] = [];
    const grid = new Map<number, number[]>();
    const key = (gx: number, gz: number) => (gx + 1000) * 4000 + gz + 1000;
    const free = (x: number, z: number, r: number) => {
      const gx = Math.floor(x / 6);
      const gz = Math.floor(z / 6);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oz = -1; oz <= 1; oz++) {
          const list = grid.get(key(gx + ox, gz + oz));
          if (!list) continue;
          for (const ti of list) {
            const o = taken[ti];
            if (Math.hypot(o.x - x, o.z - z) < o.r + r) return false;
          }
        }
      }
      return true;
    };
    const take = (x: number, z: number, r: number) => {
      taken.push({ x, z, r });
      const k = key(Math.floor(x / 6), Math.floor(z / 6));
      const l = grid.get(k);
      if (l) l.push(taken.length - 1);
      else grid.set(k, [taken.length - 1]);
    };
    const cleared = (x: number, z: number) => this.clearings.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r);

    const ext = isl.r * Math.max(isl.stretch, 1 / isl.stretch) * 1.15;
    const area = ext * ext * 4;
    const grad = new THREE.Vector2();
    const volcanic = isl.kind === 'volcanic';
    const rocky = isl.kind === 'rocky';
    const atoll = isl.kind === 'atoll';
    const jungleAt = (x: number, z: number, h: number) =>
      smoothstep(-0.25, 0.45, s.noise(x * 0.025, z * 0.025)) * (0.55 + 0.45 * smoothstep(3, 12, h)) * (rocky ? 0.55 : 1);

    // ---------------------------------------------------------------- canopy & shrubs
    const forest: Placement[] = [];
    const tries = Math.floor((area / 9) * this.density);
    for (let n = 0; n < tries; n++) {
      const x = isl.x + (rnd() * 2 - 1) * ext;
      const z = isl.z + (rnd() * 2 - 1) * ext;
      const h = t.heightAt(x, z);
      if (h < -0.8 || cleared(x, z)) continue;
      t.gradientAt(x, z, grad);
      const slope = grad.length();
      const roll = rnd();

      // coconut groves along the beach, leaning out over the water
      if (h > 0.45 && h < 4.2 && slope < 0.42) {
        const grove = smoothstep(-0.3, 0.45, s.noise(x * 0.021 + 5.3, z * 0.021 - 2.1));
        if (roll < (0.015 + grove * grove * 0.26) * (atoll ? 1.4 : 1)) {
          if (!free(x, z, 1.9)) continue;
          take(x, z, 1.9);
          const lean = Math.atan2(grad.y, -grad.x); // rotates local +x (trunk lean) downhill
          L.palm.push({ ...pl(x, h - 0.15, z, 0.8 + rnd() * 0.45, Math.floor(rnd() * 3)), rotY: lean + (rnd() - 0.5) * 0.9 });
          t.stampAO(x, z, 2.6, 0.22);
          // palms like company: a second trunk out of the same clump, splaying away
          if (rnd() < 0.32) {
            const a = rnd() * TAU;
            const x2 = x + Math.cos(a) * 1.7;
            const z2 = z + Math.sin(a) * 1.7;
            const h2 = t.heightAt(x2, z2);
            if (h2 > 0.4 && free(x2, z2, 1.1)) {
              take(x2, z2, 1.1);
              L.palm.push({ ...pl(x2, h2 - 0.15, z2, 0.65 + rnd() * 0.3, Math.floor(rnd() * 3)), rotY: -a + (rnd() - 0.5) * 0.5 });
            }
          }
          if (h < 2.6 && rnd() < 0.45) {
            const a = rnd() * TAU;
            const cx = x + Math.cos(a) * 1.6;
            const cz = z + Math.sin(a) * 1.6;
            L.coconuts.push(pl(cx, t.heightAt(cx, cz) - 0.05, cz, 0.9 + rnd() * 0.3, Math.floor(rnd() * 2)));
          }
          continue;
        }
      }

      if (atoll) {
        // the reef crest carries a few shrubs and blooms among the palms
        if (h > 1.7 && slope < 0.4 && roll < 0.05) {
          if (!free(x, z, 1.1)) continue;
          take(x, z, 1.1);
          if (rnd() < 0.55) L.flowerBush.push(pl(x, h - 0.1, z, 0.55 + rnd() * 0.5, Math.floor(rnd() * 4)));
          else L.bush.push(pl(x, h - 0.1, z, 0.5 + rnd() * 0.6, Math.floor(rnd() * 3)));
          t.stampAO(x, z, 1.6, 0.22);
        }
        continue;
      }

      if (h > 2.6 && h < isl.peak * 0.9 && slope < 0.58) {
        const jungle = jungleAt(x, z, h);
        const high = rocky ? 0.35 + 0.65 * smoothstep(isl.peak * 0.25, isl.peak * 0.6, h) : smoothstep(isl.peak * 0.45, isl.peak * 0.75, h);
        if (roll < jungle * (0.45 + jungle * 0.3)) {
          if (rnd() < high * 0.85) {
            if (!free(x, z, 1.7)) continue;
            take(x, z, 1.7);
            L.pine.push(pl(x, h - 0.2, z, 0.7 + rnd() * 0.5, Math.floor(rnd() * 2)));
            t.stampAO(x, z, 3.2, 0.3);
            t.stampCanopy(x, z, 2.6, 0.7);
            continue;
          }
          if (!free(x, z, 2.1)) continue;
          take(x, z, 2.1);
          const v = jungle > 0.55 && rnd() < 0.3 ? T_TALL : T_ROUND + Math.floor(rnd() * 2);
          const tree = pl(x, h - 0.2, z, 0.75 + rnd() * 0.55, v);
          L.tree.push(tree);
          forest.push(tree);
          t.stampAO(x, z, 4.2, 0.38);
          t.stampCanopy(x, z, 3.8 * tree.scale, 1);
          continue;
        }
        // a lone flowering tree out in the open: the island's showpiece
        if (roll < jungle * (0.45 + jungle * 0.3) + (1 - jungle) * 0.03 * (1 - high) && h < 22) {
          if (!free(x, z, 3)) continue;
          take(x, z, 3);
          const k = rnd();
          const v = volcanic ? T_ROUND : k < 0.45 ? T_FLAME : k < 0.8 ? T_BLOSSOM + Math.floor(rnd() * 2) : T_ROUND;
          L.tree.push(pl(x, h - 0.2, z, 0.85 + rnd() * 0.35, v));
          t.stampAO(x, z, 4.6, 0.34);
          t.stampCanopy(x, z, 4.2, 0.8);
          continue;
        }
        if (roll < jungle * 0.95 + 0.05) {
          if (!free(x, z, 1.1)) continue;
          take(x, z, 1.1);
          const p = pl(x, h - 0.1, z, 0.6 + rnd() * 0.8, 0);
          // flowering shrubs brighten the sunny clearings, plain ones fill the forest
          const k = rnd();
          if (!volcanic && k < 0.5 - jungle * 0.32) L.flowerBush.push({ ...p, variant: Math.floor(rnd() * 4) });
          else if (!volcanic && k < 0.62 - jungle * 0.3) L.bush.push({ ...p, variant: 2 });
          else L.bush.push({ ...p, variant: jungle > 0.5 ? 1 : Math.floor(rnd() * 2) });
          t.stampAO(x, z, 1.8, 0.25);
          continue;
        }
      }
      const rockChance = (slope > 0.5 ? 0.06 : 0) + (h < 1.0 ? 0.02 : 0) + (rocky ? 0.03 : 0);
      if (roll < rockChance) {
        if (!free(x, z, 1.4)) continue;
        take(x, z, 1.4);
        L.rock.push(pl(x, h - 0.25, z, 0.6 + Math.pow(rnd(), 2) * 2.2, Math.floor(rnd() * 2)));
      }
    }

    // ---------------------------------------------------------------- understorey
    for (const tr of forest) {
      const n = rnd() < 0.75 ? 1 + Math.floor(rnd() * 2.5) : 0;
      for (let k = 0; k < n; k++) {
        const a = rnd() * TAU;
        const d = (2.3 + rnd() * 1.6) * tr.scale;
        const x = tr.x + Math.cos(a) * d;
        const z = tr.z + Math.sin(a) * d;
        const h = t.heightAt(x, z);
        if (h < 2.4) continue;
        t.gradientAt(x, z, grad);
        if (grad.length() > 0.6) continue;
        if (!volcanic && h < 16 && rnd() < 0.32) {
          if (!free(x, z, 1.2)) continue;
          take(x, z, 1.2);
          L.banana.push(pl(x, h - 0.1, z, 0.75 + rnd() * 0.45, Math.floor(rnd() * 2)));
          t.stampAO(x, z, 1.8, 0.2);
        } else {
          if (!free(x, z, 0.6)) continue;
          take(x, z, 0.6);
          L.fern.push(pl(x, h - 0.05, z, 0.8 + rnd() * 0.7, Math.floor(rnd() * 2)));
        }
      }
    }

    // ---------------------------------------------------------------- ground cover
    const coverTries = Math.floor((area / 30) * this.density);
    for (let n = 0; n < coverTries; n++) {
      const cx = isl.x + (rnd() * 2 - 1) * ext;
      const cz = isl.z + (rnd() * 2 - 1) * ext;
      const hc = t.heightAt(cx, cz);
      if (cleared(cx, cz)) continue;
      // sea oats bind the upper beach
      if (hc > 0.85 && hc < 2.2 && !volcanic) {
        if (rnd() < 0.4) {
          const count = 2 + Math.floor(rnd() * 3);
          for (let c = 0; c < count; c++) {
            const x = cx + (rnd() - 0.5) * 3;
            const z = cz + (rnd() - 0.5) * 3;
            const h = t.heightAt(x, z);
            if (h < 0.8 || h > 2.4) continue;
            L.dune.push(pl(x, h - 0.05, z, 1 + rnd() * 0.6, Math.floor(rnd() * 2)));
          }
        }
        continue;
      }
      const meadow = s.noise(cx * 0.04 + 17, cz * 0.04);
      if (meadow < -0.15) continue;
      const shade = hc > 2.4 ? jungleAt(cx, cz, hc) : 0;
      const count = 2 + Math.floor(rnd() * 4);
      for (let c = 0; c < count; c++) {
        const x = cx + (rnd() - 0.5) * 2.6;
        const z = cz + (rnd() - 0.5) * 2.6;
        const h = t.heightAt(x, z);
        if (h < (atoll ? 1.95 : 2.3)) continue;
        t.gradientAt(x, z, grad);
        if (grad.length() > 0.65) continue;
        if (shade > 0.55 && rnd() < 0.35) L.fern.push(pl(x, h - 0.05, z, 0.6 + rnd() * 0.5, Math.floor(rnd() * 2)));
        else L.tuft.push(pl(x, h - 0.06, z, 1.3 + rnd() * 1.1, Math.floor(rnd() * 3)));
      }
      // drifts of wildflowers, one colour to a patch, in the sunny meadows
      const drift = s.noise(cx * 0.035 - 9.1, cz * 0.035 + 3.7);
      if (!volcanic && drift > 0.12 && shade < 0.5 && rnd() < 0.7) {
        const hue = s.noise(cx * 0.012 + 40, cz * 0.012 - 11) * 0.5 + 0.5;
        const v = rocky ? (hue < 0.6 ? 1 : 0) : Math.min(3, Math.floor(hue * 4));
        const k = 2 + Math.floor(rnd() * 4);
        for (let c = 0; c < k; c++) {
          const x = cx + (rnd() - 0.5) * 3.2;
          const z = cz + (rnd() - 0.5) * 3.2;
          const h = t.heightAt(x, z);
          if (h < (atoll ? 1.9 : 2.35)) continue;
          t.gradientAt(x, z, grad);
          if (grad.length() > 0.55) continue;
          L.wildflower.push(pl(x, h - 0.03, z, 1.1 + rnd() * 0.8, rnd() < 0.85 ? v : Math.floor(rnd() * 4)));
        }
      }
    }

    // ---------------------------------------------------------------- beachcombing
    const shoreTries = Math.floor((area / 40) * this.density);
    for (let n = 0; n < shoreTries; n++) {
      const x = isl.x + (rnd() * 2 - 1) * ext;
      const z = isl.z + (rnd() * 2 - 1) * ext;
      const h = t.heightAt(x, z);
      if (h > -1.1 && h < 0.35 && !volcanic && rnd() < 0.18) {
        t.gradientAt(x, z, grad);
        if (grad.length() > 0.3) continue;
        L.beach.push(pl(x, h, z, 1.5 + rnd() * 0.9, 0));
      } else if (h > 0.05 && h < 0.95 && !volcanic && rnd() < 0.12) {
        // shells washed up along the tideline
        L.beach.push(pl(x, h - 0.01, z, 1.2 + rnd() * 0.8, 1 + Math.floor(rnd() * 2)));
      } else if (h > 0.55 && h < 1.15 && rnd() < 0.02 && L.drift.length < 4) {
        if (!free(x, z, 2)) continue;
        take(x, z, 2);
        L.drift.push(pl(x, h - 0.05, z, 0.8 + rnd() * 0.4, Math.floor(rnd() * 2)));
      }
    }
    this.lists.push(L);
  }

  build() {
    const lo = 1;
    const palms = [palmGeometry(8.5, 1.6, 3), palmGeometry(10.5, 2.4, 7), palmGeometry(7, 0.9, 13)];
    const palmsLo = [palmGeometry(8.5, 1.6, 3, lo), palmGeometry(10.5, 2.4, 7, lo), palmGeometry(7, 0.9, 13, lo)];
    const palmsSh = [palmGeometry(8.5, 1.6, 3, 0, true), palmGeometry(10.5, 2.4, 7, 0, true), palmGeometry(7, 0.9, 13, 0, true)];
    const treeSpec: [number, 'round' | 'tall' | 'flame' | 'blossom'][] = [[5, 'round'], [17, 'round'], [29, 'tall'], [41, 'flame'], [52, 'blossom'], [63, 'blossom']];
    const trees = treeSpec.map(([sd, st]) => broadleafGeometry(sd, st));
    const treesLo = treeSpec.map(([sd, st]) => broadleafGeometry(sd, st, lo));
    const treesSh = treeSpec.map(([sd, st]) => broadleafGeometry(sd, st, 0, true));
    const pines = [pineGeometry(3), pineGeometry(8)];
    const pinesLo = [pineGeometry(3, lo), pineGeometry(8, lo)];
    const bananas = [bananaGeometry(2), bananaGeometry(9)];
    const bananasLo = [bananaGeometry(2, lo), bananaGeometry(9, lo)];
    const ferns = [fernGeometry(4), fernGeometry(12)];
    const bushKinds = ['green', 'dark', 'croton'] as const;
    const bushes = bushKinds.map((k, i) => bushGeometry(5 + i * 6, k));
    const bushesLo = bushKinds.map((k, i) => bushGeometry(5 + i * 6, k, lo));
    const blooms: [number, number, number][] = [[3, 0xff3b4f, 0xffe08a], [8, 0xff8fbf, 0xc4204a], [21, 0xffc93a, 0xc8401e], [33, 0xfff3e6, 0xf06a8a]];
    const flowerBushes = blooms.map(([sd, b, h]) => flowerBushGeometry(sd, b, h));
    const flowerBushesLo = blooms.map(([sd, b, h]) => flowerBushGeometry(sd, b, h, lo));
    const wildflowers = [
      wildflowerGeometry(1, [0xfffaf0, 0xfff4dc], 0xffc82e, 8, 6), // daisies
      wildflowerGeometry(2, [0xffd83a, 0xffe98a], 0xff9a2a, 7, 5), // buttercups
      wildflowerGeometry(3, [0xff6fae, 0xff9ac8, 0xfff0f5], 0xffe08a, 7, 5), // pinks
      wildflowerGeometry(4, [0x9a7cf0, 0x7a92f5, 0xfaf6ff], 0xffe68a, 7, 5), // periwinkles
    ];
    const tufts = [tuftGeometry(2, 7), tuftGeometry(5, 9), tuftGeometry(11, 6)];
    const dunes = [
      tuftGeometry(31, 9, { h: 0.6, bend: 0.22, w: 0.03, base: 0x7d8a4a, tip: 0xe6dc9c }),
      tuftGeometry(37, 12, { h: 0.75, bend: 0.3, w: 0.028, base: 0x6f8a46, tip: 0xd8d68e }),
    ];
    const rocks = [rockGeometry(4), rockGeometry(9)];
    const mossRocks = [rockGeometry(4, true), rockGeometry(9, true)];
    const beach = [starfishGeometry(), shellGeometry(3), shellGeometry(8)];
    const coconuts = [coconutsGeometry(2), coconutsGeometry(5)];
    const drift = [driftwoodGeometry(1), driftwoodGeometry(6)];

    const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ vertexColors: true, envMapIntensity: 0.8, ...o });
    const palmMat = patchMaterial(std({ roughness: 0.7, side: THREE.DoubleSide }), { clouds: true, sway: 0.0028, foliage: true });
    const treeMat = patchMaterial(std({ roughness: 0.8 }), { clouds: true, sway: 0.0018, foliage: true });
    const bananaMat = patchMaterial(std({ roughness: 0.62, side: THREE.DoubleSide }), { clouds: true, sway: 0.02, foliage: true });
    const bushMat = patchMaterial(std({ roughness: 0.82 }), { clouds: true, foliage: true });
    const coverMat = patchMaterial(std({ roughness: 0.86, side: THREE.DoubleSide, envMapIntensity: 0.7 }), { clouds: true, sway: 0.12, foliage: true, fade: 300 });
    const rockMat = patchMaterial(std({ roughness: 0.78 }), { clouds: true, caustics: true });
    const beachMat = patchMaterial(std({ roughness: 0.6 }), { caustics: true, clouds: true, fade: 200 });
    const driftMat = patchMaterial(std({ roughness: 0.9 }), { clouds: true });

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const sc = new THREE.Vector3();
    const p = new THREE.Vector3();
    const col = new THREE.Color();
    type Tint = (t: number, c: THREE.Color) => void;
    interface Opts {
      lo?: THREE.BufferGeometry[];
      /** a lighter shadow caster standing in for the near mesh */
      shadow?: THREE.BufferGeometry[];
      tilt?: boolean;
      shadows?: boolean;
      always?: boolean;
    }

    this.terrain.islands.forEach((isl, i) => {
      const L = this.lists[i];
      const f: IslandFlora = {
        near: new THREE.Group(), far: new THREE.Group(), always: new THREE.Group(), nearB: [], farB: [], alwaysB: [],
        cx: isl.x, cy: isl.peak * 0.4, cz: isl.z, ext: isl.r * Math.max(isl.stretch, 1 / isl.stretch) * 1.15, peak: isl.peak, isNear: true,
      };
      f.near.name = `flora-near-${i}`;
      f.far.name = `flora-far-${i}`;
      f.far.visible = false;
      this.group.add(f.near, f.far, f.always);
      this.flora.push(f);

      const batch = (mesh: THREE.InstancedMesh, geo: THREE.BufferGeometry, mats: Float32Array, shadows: boolean): Batch => {
        const n = mesh.count;
        if (!geo.boundingSphere) geo.computeBoundingSphere();
        const sph = new Float32Array(n * 4);
        for (let k = 0; k < n; k++) {
          _m4.fromArray(mats, k * 16);
          _sphere.copy(geo.boundingSphere!).applyMatrix4(_m4);
          sph[k * 4] = _sphere.center.x;
          sph[k * 4 + 1] = _sphere.center.y;
          sph[k * 4 + 2] = _sphere.center.z;
          sph[k * 4 + 3] = _sphere.radius;
        }
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
        const shown = new Uint32Array(n);
        for (let k = 0; k < n; k++) shown[k] = k;
        return { mesh, mat: mats, col: (mesh.instanceColor!.array as Float32Array).slice(), sph, shown, n, shadows };
      };

      const add = (list: Placement[], geos: THREE.BufferGeometry[], mat: THREE.Material, tint: Tint, o: Opts = {}) => {
        for (let v = 0; v < geos.length; v++) {
          const sub = list.filter((pl) => pl.variant % geos.length === v);
          if (!sub.length) continue;
          const inst = new THREE.InstancedMesh(geos[v], mat, sub.length);
          sub.forEach((pl, k) => {
            e.set(o.tilt ? (pl.tint - 0.5) * 0.6 : 0, pl.rotY, o.tilt ? (pl.tint - 0.3) * 0.5 : 0);
            q.setFromEuler(e);
            sc.setScalar(pl.scale);
            p.set(pl.x, pl.y, pl.z);
            m.compose(p, q, sc);
            inst.setMatrixAt(k, m);
            tint(pl.tint, col);
            inst.setColorAt(k, col);
          });
          inst.castShadow = (o.shadows ?? true) && !o.shadow;
          inst.receiveShadow = true;
          inst.computeBoundingSphere();
          const mats = (inst.instanceMatrix.array as Float32Array).slice();
          (o.always ? f.always : f.near).add(inst);
          (o.always ? f.alwaysB : f.nearB).push(batch(inst, geos[v], mats, inst.castShadow));
          if (o.shadow) {
            const sh = shadowOnly(new THREE.InstancedMesh(o.shadow[v], mat, sub.length));
            (sh.instanceMatrix.array as Float32Array).set(mats);
            sh.instanceColor = new THREE.InstancedBufferAttribute((inst.instanceColor!.array as Float32Array).slice(), 3);
            sh.boundingSphere = inst.boundingSphere;
            f.near.add(sh);
            f.nearB.push(batch(sh, o.shadow[v], mats, true));
          }
          if (o.lo) {
            // the far LOD plants the very same instances, culled on their own
            const far = new THREE.InstancedMesh(o.lo[v], mat, sub.length);
            (far.instanceMatrix.array as Float32Array).set(mats);
            far.instanceColor = new THREE.InstancedBufferAttribute((inst.instanceColor!.array as Float32Array).slice(), 3);
            far.castShadow = inst.castShadow;
            far.receiveShadow = true;
            far.computeBoundingSphere();
            f.far.add(far);
            f.farB.push(batch(far, o.lo[v], mats, far.castShadow));
          }
        }
      };

      const leafy: Tint = (t, c) => c.setRGB(0.88 + t * 0.24, 0.93 + t * 0.12, 0.84 + (1 - t) * 0.14);
      add(L.palm, palms, palmMat, (t, c) => c.setRGB(0.9 + t * 0.2, 0.95 + t * 0.1, 0.85 + (1 - t) * 0.1), { lo: palmsLo, shadow: palmsSh });
      add(L.tree, trees, treeMat, leafy, { lo: treesLo, shadow: treesSh });
      add(L.pine, pines, treeMat, (t, c) => c.setRGB(0.9 + t * 0.15, 0.95 + t * 0.1, 0.95), { lo: pinesLo });
      add(L.banana, bananas, bananaMat, leafy, { lo: bananasLo });
      add(L.bush, bushes, bushMat, leafy, { lo: bushesLo });
      add(L.flowerBush, flowerBushes, bushMat, (t, c) => c.setRGB(0.92 + t * 0.16, 0.95 + t * 0.05, 0.92), { lo: flowerBushesLo });
      // ground cover lives only in the near set and casts no shadow (contact AO instead)
      add(L.fern, ferns, coverMat, leafy, { shadows: false });
      add(L.tuft, tufts, coverMat, (t, c) => c.setRGB(0.85 + t * 0.3, 0.92 + t * 0.12, 0.8 + t * 0.15), { shadows: false });
      add(L.dune, dunes, coverMat, (t, c) => c.setRGB(0.9 + t * 0.2, 0.92 + t * 0.12, 0.85 + t * 0.1), { shadows: false });
      add(L.wildflower, wildflowers, coverMat, (t, c) => c.setRGB(0.92 + t * 0.12, 0.92 + t * 0.12, 0.92 + t * 0.12), { shadows: false });
      add(L.beach, beach, beachMat, (t, c) => (t < 0.5 ? c.setRGB(1, 0.85 + t * 0.3, 0.8) : c.setRGB(1.05, 0.55 + t * 0.3, 0.75)), { shadows: false });
      add(L.coconuts, coconuts, beachMat, (t, c) => c.setRGB(0.9 + t * 0.2, 0.9 + t * 0.15, 0.9), { shadows: false });
      // rocks take on the island's own stone: sandstone, basalt or mossy granite
      const stone = isl.kind === 'rocky' ? [1.42, 1.02, 0.72] : isl.kind === 'volcanic' ? [0.72, 0.68, 0.66] : [1, 1, 0.96];
      add(L.rock, isl.kind === 'lush' ? mossRocks : rocks, rockMat, (t, c) => c.setRGB(stone[0] * (0.9 + t * 0.2), stone[1] * (0.9 + t * 0.15), stone[2] * (0.88 + t * 0.1)), {
        tilt: true, always: true,
      });
      add(L.drift, drift, driftMat, (t, c) => c.setRGB(0.95 + t * 0.1, 0.95 + t * 0.08, 0.95), { always: true });
    });
    return this.group;
  }

  /**
   * Swaps each island between its detailed and far planting, then culls the
   * plants of every island in play one by one. The reach grows with the
   * camera's height so a zoomed-out view keeps the island under it detailed;
   * a little hysteresis stops it flickering at the boundary.
   *
   * `toSun` is the shadow-casting light's direction: a plant out of view still
   * stays when its shadow can fall into it. Culling runs against a frustum
   * widened by MARGIN and is only redone once the camera has moved or turned
   * enough to use that margin up, so a steady view uploads nothing.
   */
  update(camera: THREE.Camera, toSun: THREE.Vector3) {
    if (this.hold) return;
    const cam = camera.position;
    const reach = (this.lite ? 150 : 210) + Math.max(cam.y, 0) * 0.9;
    let swapped = false;
    for (const f of this.flora) {
      const d = Math.hypot(cam.x - f.cx, cam.y - f.cy, cam.z - f.cz) - f.ext;
      const near = d < reach + (f.isNear ? 30 : 0);
      if (near === f.isNear) continue;
      f.isNear = near;
      f.near.visible = near;
      f.far.visible = !near;
      swapped = true;
    }

    camera.updateMatrixWorld();
    camera.getWorldDirection(_dir);
    const pe = camera.projectionMatrix.elements;
    if (
      !swapped &&
      cam.distanceToSquared(this.cullPos) < 16 &&
      _dir.dot(this.cullDir) > 0.99985 &&
      toSun.dot(this.cullLight) > 0.9998 &&
      pe[0] === this.cullProj[0] &&
      pe[5] === this.cullProj[1]
    )
      return;
    this.cullPos.copy(cam);
    this.cullDir.copy(_dir);
    this.cullLight.copy(toSun);
    this.cullProj[0] = pe[0];
    this.cullProj[1] = pe[5];

    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pv);
    // shadows fall away from the sun: a plant's shadow sweeps from its centre
    // down this way, one unit per metre of drop
    const ly = Math.max(toSun.y, 0.22);
    const sx = -toSun.x / ly;
    const sy = -toSun.y / ly;
    const sz = -toSun.z / ly;
    for (const f of this.flora) {
      // the whole island first: plants and shadows wholly out of view drop out at once
      const L = f.peak + 24;
      const island = this.inView(f.cx, f.cy, f.cz, f.ext * 1.42 + f.peak, sx * L, sy * L, sz * L);
      this.cullBatches(f.alwaysB, island, sx, sy, sz);
      this.cullBatches(f.isNear ? f.nearB : f.farB, island, sx, sy, sz);
    }
  }

  /** Is a sphere, or the capsule it sweeps along (dx, dy, dz), inside the widened frustum? */
  private inView(x: number, y: number, z: number, r: number, dx: number, dy: number, dz: number) {
    for (const pl of _frustum.planes) {
      const n = pl.normal;
      const d0 = n.x * x + n.y * y + n.z * z + pl.constant;
      const d1 = d0 + n.x * dx + n.y * dy + n.z * dz;
      if (Math.max(d0, d1) < -r - MARGIN) return false;
    }
    return true;
  }

  private cullBatches(list: Batch[], island: boolean, sx: number, sy: number, sz: number) {
    for (const b of list) {
      const { sph, shown, mat, col } = b;
      const dst = b.mesh.instanceMatrix.array as Float32Array;
      const dcol = b.mesh.instanceColor!.array as Float32Array;
      let k = 0;
      // the first slot whose plant differs from last time; everything after it is rewritten
      let first = -1;
      if (island) {
        for (let i = 0; i < b.n; i++) {
          const r = sph[i * 4 + 3];
          // the shadow can run on down the slope as far as the sea
          const L = b.shadows ? Math.max(2 * r, sph[i * 4 + 1] + r) + 1 : 0;
          if (!this.inView(sph[i * 4], sph[i * 4 + 1], sph[i * 4 + 2], r, sx * L, sy * L, sz * L)) continue;
          if (first < 0 && (shown[k] !== i || k >= b.mesh.count)) first = k;
          if (first >= 0) {
            shown[k] = i;
            const s16 = i * 16;
            const d16 = k * 16;
            for (let j = 0; j < 16; j++) dst[d16 + j] = mat[s16 + j];
            dcol[k * 3] = col[i * 3];
            dcol[k * 3 + 1] = col[i * 3 + 1];
            dcol[k * 3 + 2] = col[i * 3 + 2];
          }
          k++;
        }
      }
      b.mesh.count = k;
      b.mesh.visible = k > 0;
      if (first < 0) continue;
      const im = b.mesh.instanceMatrix;
      im.clearUpdateRanges();
      im.addUpdateRange(first * 16, (k - first) * 16);
      im.needsUpdate = true;
      const ic = b.mesh.instanceColor!;
      ic.clearUpdateRanges();
      ic.addUpdateRange(first * 3, (k - first) * 3);
      ic.needsUpdate = true;
    }
  }

  counts() {
    const out: Record<string, number> = {};
    for (const k of KINDS) out[k] = this.lists.reduce((a, l) => a + l[k].length, 0);
    return out;
  }
}
