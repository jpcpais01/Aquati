import * as THREE from 'three';
import { angleDelta, clamp, damp, lerp, mulberry32, smoothstep } from '../../core/noise';
import type { World } from '../../game/world';
import type { Ship } from '../../ships/ship';
import type { Island, SeaFloor } from '../../world/terrain';
import type { Placement, Vegetation } from '../../world/vegetation';
import { wildGeometries } from './models';
import { wildMaterials } from './rig';

// Island wildlife. Fifteen kinds of beast live on the isles, each where it
// would: goats on the crags, deer and giant tortoises in the meadows, wild
// boar rooting along the forest edge with a file of striped piglets behind,
// capuchins foraging below the trees and swarming up them, scarlet macaws in
// noisy pairs from crown to crown, iguanas basking on the rocks, sea lions
// hauled out on the shore, red crabs scuttling at the tideline, flamingo
// flocks and stalking egrets in the shallows, pelicans patrolling the surf
// and plunging for fish, blue-footed boobies dancing on the sea rocks, blue
// morphos over the wildflowers and hummingbirds at the hibiscus.
//
// Each one goes about its own life (grazing, rooting, preening, displaying,
// sleeping when the sun goes down) and minds the world around it: a captain
// walking up makes them look, then edge away or bolt, each in its own way. A
// goat bounds up the crag, a deer stots off flashing its tail, the sow
// bluff-charges before her family flees squealing, the monkeys shriek and go
// up the nearest tree, the tortoise just pulls its head in, the crabs dash
// for their burrows and the flamingos run across the water and take wing. A
// broadside, a pistol shot or a ball thumping into the hillside scatters the
// whole island. Only the isles near the camera are alive at any moment; every
// species is one instanced draw (see rig.ts for the GPU skeleton).

const TAU = Math.PI * 2;

export const GOAT = 0, DEER = 1, BOAR = 2, MONKEY = 3, MACAW = 4, PELICAN = 5, BOOBY = 6, FLAMINGO = 7;
export const EGRET = 8, IGUANA = 9, TORTOISE = 10, SEAL = 11, CRAB = 12, BUTTERFLY = 13, HUMMER = 14;

/** The calls the beasts make (see core/wildCalls.ts). */
export type CallKind = 'bleat' | 'kid' | 'snort' | 'grunt' | 'squeal' | 'chatter' | 'screech' | 'squawk' | 'honk' | 'croak' | 'bark' | 'hiss' | 'whistle' | 'click' | 'chip' | 'clack';

interface Spec {
  name: string;
  /** Model scale (the sculpts are life size). */
  scale: number;
  /** Rough size at scale 1 (m), for culling and spotting. */
  size: number;
  /** Instance capacity of each of its meshes. */
  max: number;
  shadow: boolean;
  /** Metres covered in one gait cycle, and the legs' swing at a run (rad). */
  stride: number;
  swing: number;
  walk: number;
  run: number;
  /** Turn rate (rad/s). */
  turn: number;
  /** How near a walker may come before it bolts (m). */
  wary: number;
  /** Pivot of the body's pitch (y, z at scale 1): the hips, for sitting up and rearing. */
  hip: [number, number];
  /** How far the body drops lying down (m at scale 1). */
  rest: number;
}

export const SPECIES: Spec[] = [
  { name: 'Wild goat', scale: 1.1, size: 1.3, max: 32, shadow: true, stride: 0.95, swing: 0.55, walk: 0.9, run: 5.2, turn: 3.2, wary: 13, hip: [0.72, -0.36], rest: 0.44 },
  { name: 'Island deer', scale: 1.1, size: 1.5, max: 24, shadow: true, stride: 1.25, swing: 0.6, walk: 1.0, run: 7.5, turn: 3.5, wary: 16, hip: [0.85, -0.34], rest: 0.52 },
  { name: 'Wild boar', scale: 1.1, size: 1.1, max: 36, shadow: true, stride: 0.75, swing: 0.6, walk: 0.8, run: 5.5, turn: 3.6, wary: 9, hip: [0.46, -0.34], rest: 0.3 },
  { name: 'Capuchin monkey', scale: 1.2, size: 0.8, max: 36, shadow: true, stride: 0.55, swing: 0.7, walk: 0.9, run: 4.2, turn: 5, wary: 6, hip: [0.27, -0.15], rest: 0.13 },
  { name: 'Scarlet macaw', scale: 1.35, size: 0.9, max: 32, shadow: true, stride: 0.2, swing: 0.4, walk: 0.3, run: 0.5, turn: 4, wary: 10, hip: [0.11, -0.02], rest: 0 },
  { name: 'Brown pelican', scale: 1.15, size: 1.4, max: 28, shadow: true, stride: 0.4, swing: 0.45, walk: 0.5, run: 1.4, turn: 3, wary: 14, hip: [0.25, -0.05], rest: 0.15 },
  { name: 'Blue-footed booby', scale: 1.2, size: 0.9, max: 36, shadow: true, stride: 0.3, swing: 0.5, walk: 0.45, run: 1.2, turn: 3.5, wary: 7, hip: [0.18, 0], rest: 0.1 },
  { name: 'Flamingo', scale: 1.1, size: 1.7, max: 48, shadow: true, stride: 0.7, swing: 0.5, walk: 0.35, run: 4.5, turn: 2.6, wary: 26, hip: [0.92, 0], rest: 0 },
  { name: 'Great egret', scale: 1.15, size: 1.2, max: 20, shadow: true, stride: 0.55, swing: 0.55, walk: 0.3, run: 1.8, turn: 2.5, wary: 18, hip: [0.66, 0], rest: 0 },
  { name: 'Green iguana', scale: 1.25, size: 1.4, max: 32, shadow: false, stride: 0.45, swing: 0.6, walk: 0.35, run: 3.4, turn: 3, wary: 6, hip: [0.13, 0], rest: 0.04 },
  { name: 'Giant tortoise', scale: 1.15, size: 1.1, max: 16, shadow: true, stride: 0.5, swing: 0.32, walk: 0.18, run: 0.22, turn: 0.7, wary: 3.2, hip: [0.26, 0], rest: 0.12 },
  { name: 'Sea lion', scale: 1.0, size: 2.0, max: 32, shadow: true, stride: 0.9, swing: 0.6, walk: 0.9, run: 2.2, turn: 1.8, wary: 10, hip: [0.2, -0.6], rest: 0 },
  { name: 'Red land crab', scale: 1.7, size: 0.5, max: 64, shadow: false, stride: 0.12, swing: 0.6, walk: 0.9, run: 3.2, turn: 9, wary: 4, hip: [0.07, 0], rest: 0 },
  { name: 'Blue morpho', scale: 1.8, size: 0.25, max: 48, shadow: false, stride: 1, swing: 0, walk: 0, run: 0, turn: 8, wary: 2.5, hip: [0, 0], rest: 0 },
  { name: 'Hummingbird', scale: 2.2, size: 0.3, max: 24, shadow: false, stride: 1, swing: 0, walk: 0, run: 0, turn: 10, wary: 3, hip: [0, 0], rest: 0 },
];

// pose channels (eased toward their targets every frame)
const HP = 0, HY = 1, FLAP = 2, FOLD = 3, TAILW = 4, SA = 5, SB = 6, TUCK = 7, PITCH = 8, ROLL = 9, LIFT = 10, STRIDE = 11;
const NP = 12;
const RATE = [6, 5, 7, 6, 6, 6, 6, 5, 5, 5, 4, 6];

// modes (each species uses the ones it needs)
const IDLE = 0, WALK = 1, FLEE = 2, REST = 3, ALERT = 4, FLY = 5, LAND = 6, PERCH = 7, SWIM = 8;
const CLIMB = 9, HIDE = 10, SHOW = 11, DUEL = 12, PLAY = 13, LOOK = 14, CHARGE = 15, SIT = 16, DIVE = 17;
const TAKEOFF = 18, DANCE = 19, MARCH = 20, STRIKE = 21, DOWN = 22, HOVER = 23, CURIOUS = 24, FOLLOW = 25;

interface Spot {
  x: number;
  y: number;
  z: number;
}

/** A tree a monkey can climb or a macaw perch on. */
interface Tree {
  x: number;
  y: number;
  z: number;
  /** Where the trunk is climbed to, and the top of the crown. */
  limb: THREE.Vector3;
  top: THREE.Vector3;
  /** Palms lean and curve: the trunk's point at t (0 foot .. 1 crown). */
  at: (t: number, out: THREE.Vector3) => THREE.Vector3;
  palm: boolean;
}

interface Pop {
  isl: Island;
  i: number;
  ext: number;
  built: boolean;
  beasts: Beast[];
  shallows: Spot[];
  beach: Spot[];
  rocks: Spot[];
  meadow: Spot[];
  forest: Spot[];
  crags: Spot[];
  trees: Tree[];
  blooms: Spot[];
  flowers: Spot[];
  /** Round the island a little way out (3 m of water): pelicans patrol it, sea lions and boobies fish there. */
  ring: Spot[];
}

interface Beast {
  k: number;
  geo: number;
  s: number;
  shade: number;
  pop: Pop;
  x: number;
  y: number;
  z: number;
  yaw: number;
  vx: number;
  vy: number;
  vz: number;
  speed: number;
  want: number;
  /** Walks this far off its heading (crabs go sideways). */
  side: number;
  tx: number;
  ty: number;
  tz: number;
  mode: number;
  t: number;
  u: number;
  air: boolean;
  wet: boolean;
  hidden: boolean;
  /** Held mid-stride (a stalking heron): the gait doesn't advance and the legs stay where they are. */
  hold: boolean;
  gait: number;
  /** Extra gait cycles a second, stepping on the spot (a booby's dance). */
  step: number;
  flapPh: number;
  flapHz: number;
  slope: number;
  cur: Float32Array;
  tgt: Float32Array;
  /** Pose easing this frame, times RATE. */
  quick: number;
  fear: number;
  fx: number;
  fz: number;
  lead: Beast | null;
  mate: Beast | null;
  ox: number;
  oz: number;
  home: Spot;
  tree: Tree | null;
  climbT: number;
  /** Height of a leap in progress (m). */
  jump: number;
  seed: number;
  clock: number;
  adult: boolean;
}

interface Threat {
  x: number;
  z: number;
  /** Multiplies every beast's wariness (running feet, a ship's bulk). */
  k: number;
  pad: number;
  /** Seconds this walker has kept still (a captain who waits is approached). */
  still: number;
  yaw: number;
  y: number;
}

/** Someone on foot the beasts keep an eye on. */
export interface Walkerish {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
}

export interface WildEnv {
  night: number;
  storm: number;
  rain: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _v = new THREE.Vector3();
const _h1 = new THREE.Vector3();
const _h2 = new THREE.Vector3();
const _sc = new THREE.Vector3();
const _pm = new THREE.Matrix4();
const _fr = new THREE.Frustum();
const _sph = new THREE.Sphere();
const _Y = new THREE.Vector3(0, 1, 0);
const _tp = new THREE.Vector3();
const _th: { d: number; t: Threat | null } = { d: Infinity, t: null };

/** An island comes alive when the view comes this near its shore (m). */
const ACTIVE = 320;
/** Below this many pixels tall a beast isn't drawn. */
const MIN_PX = 1.4;
const SEEN_KEY = 'aquati.fauna.v1';

// broadleaf trunk heights by `tree` variant (see vegetation.ts T_*), and palm heights / leans
const TREE_H = [3.3, 3.3, 6.4, 2.9, 3.3, 3.3];
const PALM = [
  { h: 8.5, lean: 1.6, seed: 3 },
  { h: 10.5, lean: 2.4, seed: 7 },
  { h: 7, lean: 0.9, seed: 13 },
].map((p) => ({ ...p, sway: (mulberry32(p.seed)() - 0.5) * 0.9 }));

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(l: T[]): T => l[(Math.random() * l.length) | 0];

interface WildMesh {
  mesh: THREE.InstancedMesh;
  a: THREE.InstancedBufferAttribute;
  b: THREE.InstancedBufferAttribute;
  c: THREE.InstancedBufferAttribute;
  n: number;
}

export class Wildlife {
  readonly group = new THREE.Group();
  private meshes: WildMesh[][] = [];
  private pops: Pop[];
  private active: Pop[] = [];
  private time = 0;
  private gunsSeen = new WeakMap<Ship, number>();
  private dead = new WeakSet<Ship>();
  private threats: Threat[] = [];
  private stillT = new Map<Walkerish, { x: number; z: number; t: number }>();
  private calls = 0;
  private env: WildEnv = { night: 0, storm: 0, rain: 0 };
  private w!: World;
  private seen = new Set<number>();
  /** A new kind of beast was seen up close for the first time. */
  onSpot: (name: string, count: number, total: number) => void = () => {};
  private builtThisFrame = false;

  constructor(
    private floor: SeaFloor,
    private veg: Vegetation,
    private avoid: { x: number; z: number; r: number }[],
    private lite: boolean,
  ) {
    this.group.name = 'wildlife';
    const { mat, depth } = wildMaterials();
    const geos = wildGeometries();
    geos.forEach((list, k) => {
      const sp = SPECIES[k];
      this.meshes.push(
        list.map((geo) => {
          const mk = () => {
            const at = new THREE.InstancedBufferAttribute(new Float32Array(sp.max * 4), 4);
            at.setUsage(THREE.DynamicDrawUsage);
            return at;
          };
          const a = mk();
          const b = mk();
          const c = mk();
          geo.setAttribute('aPoseA', a);
          geo.setAttribute('aPoseB', b);
          geo.setAttribute('aPoseC', c);
          const mesh = new THREE.InstancedMesh(geo, mat, sp.max);
          mesh.name = `wild:${sp.name}`;
          mesh.customDepthMaterial = depth;
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          mesh.castShadow = sp.shadow;
          mesh.receiveShadow = true;
          mesh.frustumCulled = false;
          mesh.count = 0;
          mesh.visible = false;
          this.group.add(mesh);
          return { mesh, a, b, c, n: 0 };
        }),
      );
    });
    this.pops = floor.islands.map((isl, i) => ({
      isl, i, ext: isl.r * Math.max(isl.stretch, 1 / isl.stretch) * 1.15, built: false, beasts: [],
      shallows: [], beach: [], rocks: [], meadow: [], forest: [], crags: [], trees: [], blooms: [], flowers: [], ring: [],
    }));
    try {
      const raw = localStorage.getItem(SEEN_KEY);
      if (raw) for (const k of JSON.parse(raw) as number[]) if (SPECIES[k]) this.seen.add(k);
    } catch {
      /* private mode: sightings just aren't remembered */
    }
  }

  /** Kinds of beast seen so far. */
  get spotted() {
    return this.seen.size;
  }

  // ---------------------------------------------------------------- habitats

  private h(x: number, z: number) {
    return this.floor.heightAt(x, z);
  }

  private slopeAt(x: number, z: number) {
    const e = 1.5;
    return Math.hypot(this.h(x + e, z) - this.h(x - e, z), this.h(x, z + e) - this.h(x, z - e)) / (2 * e);
  }

  private avoided(x: number, z: number) {
    for (const c of this.avoid) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return true;
    return false;
  }

  /** Surveys an island (once, the first time it comes near) and lets loose its beasts. */
  private build(p: Pop) {
    p.built = true;
    const isl = p.isl;
    const rnd = mulberry32(Math.floor(isl.seed * 9973) + p.i * 31 + 5);
    const ext = p.ext;
    const step = clamp(ext / 40, 4, 8);
    const plants = this.veg.plantsOf(p.i);
    // trees first: the forest floor is wherever they crowd
    const treeHash = new Map<number, number>();
    const tkey = (x: number, z: number) => Math.floor(x / 6) * 100003 + Math.floor(z / 6);
    const addTree = (pl: Placement, palm: boolean) => {
      if (this.avoided(pl.x, pl.z)) return;
      treeHash.set(tkey(pl.x, pl.z), (treeHash.get(tkey(pl.x, pl.z)) ?? 0) + 1);
      const s = pl.scale;
      const c = Math.cos(pl.rotY);
      const sn = Math.sin(pl.rotY);
      let at: Tree['at'];
      let limb: THREE.Vector3;
      let top: THREE.Vector3;
      if (palm) {
        const P = PALM[pl.variant % 3];
        at = (t, out) => {
          const lx = P.lean * t * t * s;
          const ly = P.h * t * s;
          const lz = P.sway * Math.sin(t * Math.PI) * 0.5 * s;
          return out.set(pl.x + c * lx + sn * lz, pl.y + ly, pl.z - sn * lx + c * lz);
        };
        limb = at(1, new THREE.Vector3()).add(_v.set(0, 0.15, 0));
        top = limb.clone().add(_v.set(0, 0.25, 0));
      } else {
        const H = TREE_H[pl.variant] ?? 3.3;
        at = (t, out) => out.set(pl.x, pl.y + H * 0.85 * s * t, pl.z);
        // a limb a little out from the trunk, low in the crown
        const a = rnd() * TAU;
        limb = new THREE.Vector3(pl.x + Math.cos(a) * 0.55 * s, pl.y + H * 0.85 * s, pl.z + Math.sin(a) * 0.55 * s);
        top = new THREE.Vector3(pl.x, pl.y + (H + 3.4) * s, pl.z);
      }
      p.trees.push({ x: pl.x, y: pl.y, z: pl.z, limb, top, at, palm });
    };
    plants.palm.forEach((pl) => addTree(pl, true));
    plants.tree.forEach((pl) => addTree(pl, false));
    // thin long lists (a big isle has hundreds of palms)
    if (p.trees.length > 120) p.trees = p.trees.filter((_t, i) => i % Math.ceil(p.trees.length / 120) === 0);
    for (const f of plants.flowers) if (!this.avoided(f.x, f.z)) p.blooms.push({ x: f.x, y: f.y + 1.0 * f.scale, z: f.z });
    for (let i = 0; i < plants.wild.length; i += 3) {
      const f = plants.wild[i];
      if (!this.avoided(f.x, f.z)) p.flowers.push({ x: f.x, y: f.y + 0.22 * f.scale, z: f.z });
    }
    if (p.blooms.length > 40) p.blooms = p.blooms.filter((_b, i) => i % Math.ceil(p.blooms.length / 40) === 0);
    if (p.flowers.length > 60) p.flowers = p.flowers.filter((_b, i) => i % Math.ceil(p.flowers.length / 60) === 0);

    for (let gx = -ext; gx <= ext; gx += step) {
      for (let gz = -ext; gz <= ext; gz += step) {
        const x = isl.x + gx + (rnd() - 0.5) * step;
        const z = isl.z + gz + (rnd() - 0.5) * step;
        const h = this.h(x, z);
        if (h < -0.8 || this.avoided(x, z)) continue;
        const sl = this.slopeAt(x, z);
        const spot = { x, y: h, z };
        if (h < -0.1) {
          if (sl < 0.12 && h > -0.62 && !this.floor.reefAt(x, z)) p.shallows.push(spot);
        } else if (h < 1.7 && sl < 0.22) p.beach.push(spot);
        else if (h < 5 && sl > 0.35) p.rocks.push(spot);
        else if (h > 2.4 && sl < 0.3) {
          const trees = treeHash.get(tkey(x, z)) ?? 0;
          (trees > 0 ? p.forest : p.meadow).push(spot);
        }
        if (h > 6 && sl > 0.45 && sl < 1.7) p.crags.push(spot);
      }
    }
    // the ring: out from the middle until there's three metres of water under the keel
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * TAU;
      let land = false;
      for (let d = 0; d < ext * 1.8; d += 4) {
        const x = isl.x + Math.cos(a) * d;
        const z = isl.z + Math.sin(a) * d;
        const h = this.h(x, z);
        if (h > 0) land = true;
        else if (land && h < -2.8) {
          if (!this.avoided(x, z)) p.ring.push({ x, y: 0, z });
          break;
        }
      }
    }

    // who lives here: each kind of isle has its own fauna, and no two isles quite the same
    const kind = isl.kind;
    const chance = (base: Partial<Record<Island['kind'], number>>, need: number, have: number) => have >= need && rnd() < (base[kind] ?? 0);
    const n = (a: number, b: number) => Math.round(a + rnd() * (b - a) * (this.lite ? 0.6 : 1));
    const big = clamp(isl.r / 120, 0.6, 1.6);
    if (chance({ rocky: 0.95, volcanic: 0.85, karst: 0.75, lush: 0.5 }, 6, p.crags.length)) {
      for (let h = 0; h < (big > 1.2 && rnd() < 0.5 ? 2 : 1); h++) this.herd(p, GOAT, pick(p.crags), n(3, 6), rnd);
    }
    if (chance({ lush: 0.75, karst: 0.35, rocky: 0.35, volcanic: 0.25 }, 16, p.meadow.length)) this.herd(p, DEER, pick(p.meadow), n(2, 5), rnd);
    if (chance({ lush: 0.75, karst: 0.65, volcanic: 0.35, rocky: 0.25 }, 12, p.forest.length + p.trees.length / 3)) this.herd(p, BOAR, pick(p.forest.length ? p.forest : p.meadow.length ? p.meadow : p.beach), n(3, 6), rnd);
    if (chance({ lush: 0.75, karst: 0.95, volcanic: 0.3, rocky: 0.25, atoll: 0.3 }, 10, p.trees.length)) this.herd(p, MONKEY, pick(p.trees), n(4, 8), rnd);
    if (chance({ lush: 0.75, karst: 0.85, atoll: 0.45, volcanic: 0.35, rocky: 0.35 }, 6, p.trees.length)) this.herd(p, MACAW, pick(p.trees).top, n(2, 3) * 2, rnd);
    if (chance({ lush: 0.6, karst: 0.5, atoll: 0.75, volcanic: 0.55, rocky: 0.6 }, 4, p.ring.length) && p.rocks.length + p.beach.length > 4) this.herd(p, PELICAN, pick(p.rocks.length ? p.rocks : p.beach), n(3, 6), rnd);
    if (chance({ rocky: 0.85, volcanic: 0.85, karst: 0.5, atoll: 0.55, lush: 0.3 }, 5, p.rocks.length + p.beach.length / 4)) this.herd(p, BOOBY, pick(p.rocks.length ? p.rocks : p.beach), n(4, 8), rnd);
    if (chance({ atoll: 0.95, lush: 0.55, karst: 0.35, volcanic: 0.3, rocky: 0.25 }, 14, p.shallows.length)) this.herd(p, FLAMINGO, pick(p.shallows), n(8, 15), rnd);
    if (chance({ atoll: 0.7, lush: 0.65, karst: 0.6, volcanic: 0.4, rocky: 0.45 }, 4, p.shallows.length + p.beach.length / 3)) {
      for (let e = n(1, 3); e > 0; e--) this.herd(p, EGRET, pick(p.shallows.length ? p.shallows : p.beach), 1, rnd);
    }
    if (chance({ volcanic: 0.95, rocky: 0.65, atoll: 0.6, lush: 0.55, karst: 0.45 }, 5, p.rocks.length + p.beach.length)) {
      for (let e = n(3, 6); e > 0; e--) this.herd(p, IGUANA, pick(p.rocks.length && rnd() < 0.6 ? p.rocks : p.beach.length ? p.beach : p.rocks), 1, rnd);
    }
    if (chance({ volcanic: 0.75, lush: 0.45, rocky: 0.35, atoll: 0.25 }, 10, p.meadow.length)) {
      for (let e = n(1, 3); e > 0; e--) this.herd(p, TORTOISE, pick(p.meadow), 1, rnd);
    }
    if (chance({ rocky: 0.75, volcanic: 0.65, karst: 0.4, lush: 0.35, atoll: 0.35 }, 4, p.rocks.length + p.beach.length / 2) && p.ring.length) this.herd(p, SEAL, pick(p.rocks.length && rnd() < 0.6 ? p.rocks : p.beach.length ? p.beach : p.rocks), n(3, 7), rnd);
    if (p.beach.length >= 6 && rnd() < 0.92) {
      for (let c = n(2, 3); c > 0; c--) this.herd(p, CRAB, pick(p.beach), n(5, 8), rnd);
    }
    if (kind !== 'volcanic' && chance({ lush: 0.85, karst: 0.8, rocky: 0.6, atoll: 0.5 }, 5, p.flowers.length)) {
      for (let c = n(2, 3); c > 0; c--) this.herd(p, BUTTERFLY, pick(p.flowers), n(4, 7), rnd);
    }
    if (chance({ lush: 0.85, karst: 0.85, rocky: 0.6, atoll: 0.6, volcanic: 0.3 }, 2, p.blooms.length)) {
      for (let c = n(2, 4); c > 0; c--) this.herd(p, HUMMER, pick(p.blooms), 1, rnd);
    }
  }

  /** A herd, troop, flock, colony or swarm of `n` round `at`. */
  private herd(p: Pop, k: number, at: Spot, count: number, rnd: () => number) {
    const sp = SPECIES[k];
    let lead: Beast | null = null;
    let prev: Beast | null = null;
    for (let i = 0; i < count; i++) {
      // the young: kids, fawns, piglets, pups
      const young = i > 0 && ((k === GOAT && rnd() < 0.3) || (k === DEER && rnd() < 0.25) || k === BOAR || (k === SEAL && rnd() < 0.3));
      const a = rnd() * TAU;
      const r = k === FLAMINGO ? 1.5 + rnd() * 5 : k === CRAB ? 1 + rnd() * 5 : k === BUTTERFLY || k === HUMMER ? 0.5 : 2 + rnd() * 5;
      let x = at.x + Math.cos(a) * r * (i ? 1 : 0);
      let z = at.z + Math.sin(a) * r * (i ? 1 : 0);
      const flying = k === BUTTERFLY || k === HUMMER || k === MACAW;
      if (!flying) {
        const h = this.h(x, z);
        const wader = k === FLAMINGO || k === EGRET;
        if (wader ? h < -0.7 || h > 1 : h < 0.1) {
          x = at.x;
          z = at.z;
        }
      }
      let s = sp.scale * (0.92 + rnd() * 0.16) * (young ? (k === BOAR ? 0.42 : 0.6) : 1);
      let geo = 0;
      if (k === DEER && i === 0 && rnd() < 0.55) {
        geo = 1;
        s *= 1.08;
      }
      // which of the two colourings: piglets wear stripes, fawns spots; the rest vary by breed
      const alt =
        k === BOAR ? young : k === DEER ? young : k === SEAL ? young || rnd() < 0.3 : k === MACAW ? Math.floor(i / 2) % 2 === 1 && rnd() < 0.7 : k === EGRET ? rnd() < 0.4
          : k === GOAT ? rnd() < 0.45 : k === FLAMINGO ? rnd() < 0.12 : k === IGUANA ? rnd() < 0.3 : k === CRAB ? rnd() < 0.35 : k === BUTTERFLY ? rnd() < 0.4 : k === HUMMER ? rnd() < 0.4
            : k === MONKEY ? rnd() < 0.25 : k === BOOBY ? young : k === TORTOISE ? rnd() < 0.4 : k === PELICAN ? rnd() < 0.3 : false;
      const shade = (alt ? 2 : 0) + 0.86 + rnd() * 0.24;
      const b: Beast = {
        k, geo, s, shade, pop: p,
        x, y: flying ? at.y : this.h(x, z), z, yaw: rnd() * TAU,
        vx: 0, vy: 0, vz: 0, speed: 0, want: 0, side: 0,
        tx: x, ty: at.y, tz: z,
        mode: IDLE, t: rnd() * 6, u: 0,
        air: false, wet: false, hidden: false, hold: false,
        gait: rnd() * TAU, step: 0, flapPh: rnd() * TAU, flapHz: 0, slope: 0,
        cur: new Float32Array(NP), tgt: new Float32Array(NP), quick: 1,
        fear: 0, fx: 0, fz: 0,
        lead: i === 0 ? null : k === BOAR ? prev : lead, mate: null, ox: 0, oz: 0,
        home: { x: at.x, y: at.y, z: at.z }, tree: null, climbT: 0, jump: 0,
        seed: rnd() * 100, clock: rnd() * 5, adult: !young,
      };
      if (k === MACAW && i % 2 === 1 && prev) {
        b.mate = prev;
        prev.mate = b;
      }
      if (k === BOAR && i === 0) b.s *= 1.05;
      if (k === MONKEY || k === MACAW) {
        // they start the voyage up in the trees
        const t = this.nearTree(p, x, z, 30);
        if (t) {
          b.tree = t;
          b.mode = PERCH;
          b.air = true;
          const pp = k === MACAW ? t.top : t.limb;
          b.x = pp.x + (rnd() - 0.5) * (k === MACAW ? 0.6 : 0);
          b.y = pp.y;
          b.z = pp.z + (rnd() - 0.5) * (k === MACAW ? 0.6 : 0);
          b.climbT = 1;
        }
      }
      if (k === BUTTERFLY || k === HUMMER) {
        b.air = true;
        b.y = at.y + 0.6;
        b.mode = FLY;
      }
      if (k === FLAMINGO || k === EGRET || k === BOOBY || k === PELICAN) b.cur[FOLD] = b.tgt[FOLD] = 1;
      if (k === MACAW) b.cur[FOLD] = b.tgt[FOLD] = 1;
      p.beasts.push(b);
      if (i === 0) lead = b;
      prev = b;
    }
  }

  private nearTree(p: Pop, x: number, z: number, r: number, not: Tree | null = null): Tree | null {
    let best: Tree | null = null;
    let bd = r;
    for (const t of p.trees) {
      if (t === not) continue;
      const d = Math.hypot(t.x - x, t.z - z);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  /** A random spot from `list` within `r` of (x, z) (or anywhere, failing that). */
  private spotNear(list: Spot[], x: number, z: number, r: number): Spot | null {
    if (!list.length) return null;
    for (let i = 0; i < 8; i++) {
      const s = pick(list);
      if (Math.hypot(s.x - x, s.z - z) < r) return s;
    }
    return null;
  }

  // ---------------------------------------------------------------- the world nudges them

  /** Something loud at (x, z): everything within `r` startles, the nearer the worse. */
  scare(x: number, z: number, r: number, level = 1) {
    for (const p of this.active) {
      if (Math.hypot(p.isl.x - x, p.isl.z - z) > p.ext + r) continue;
      for (const a of p.beasts) {
        const d = Math.hypot(a.x - x, a.z - z);
        if (d > r) continue;
        const f = level * (1 - (d / r) * 0.6);
        if (f > a.fear) {
          a.fear = Math.min(1.2, f);
          a.fx = x;
          a.fz = z;
        }
      }
    }
  }

  /** The nearest walker or hull, as `wary` sees it: distance over its menace (one shared result: read it straight away). */
  private threat(a: Beast, wary: number) {
    let best: Threat | null = null;
    let bd = Infinity;
    for (const t of this.threats) {
      const d = (Math.hypot(t.x - a.x, t.z - a.z) - t.pad) / t.k;
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    if (best && bd < wary) {
      // close enough to spook: the nearer, the more
      const f = 0.55 + (1 - bd / wary) * 0.6;
      if (f > a.fear) {
        a.fear = f;
        a.fx = best.x;
        a.fz = best.z;
      }
    }
    _th.d = bd;
    _th.t = best;
    return _th;
  }

  private call(a: Beast, kind: CallKind, n = 1, pitch = 1) {
    if (this.calls > 3 || a.hidden) return;
    _v.set(a.x, a.y, a.z);
    const [vol, pan, d] = this.w.soundAt(_v);
    // small beasts carry only a little way
    const reach = Math.min(1, (SPECIES[a.k].size * a.s) / 1.2) * 90 + 25;
    if (d > reach) return;
    const v = vol * (1 - d / reach);
    if (v < 0.03) return;
    this.calls++;
    this.w.audio.wild(kind, v, pan, n, pitch / Math.max(0.5, a.s / SPECIES[a.k].scale));
  }

  private dust(x: number, y: number, z: number, n = 3, size = 0.3) {
    const p = this.w.particles;
    for (let i = 0; i < n; i++) {
      p.emit({
        x: x + (Math.random() - 0.5) * 0.3, y: y + 0.05, z: z + (Math.random() - 0.5) * 0.3,
        vx: (Math.random() - 0.5) * 0.8, vy: 0.4 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.8,
        life: 0.8 + Math.random() * 0.6, size: size * 0.5, sizeEnd: size * 1.6, color: [0.72, 0.62, 0.48], alpha: 0.35, drag: 2.2, grav: -0.1, kind: 1, fadeIn: 0.05,
      });
    }
  }

  private splash(x: number, z: number, size: number) {
    const y = this.w.waterHeight(x, z);
    _v.set(x, y, z);
    this.w.particles.splash(_v, size);
    this.w.wake.stamp(x, z, 0.6 + size, 0.5 + size * 0.5);
    const [vol, pan, d] = this.w.soundAt(_v);
    if (d < 140) this.w.audio.splash(vol * size * 0.6, pan, d);
  }

  // ---------------------------------------------------------------- locomotion

  /**
   * Walks (or runs) toward (tx, tz) at `want`, turning as it can, keeping to
   * ground it can stand on (`wade`: shallows too; `swim`: deep water only).
   * Returns how far is left.
   */
  private walk(a: Beast, dt: number, opt: { wade?: boolean; swim?: boolean; steep?: number } = {}) {
    const sp = SPECIES[a.k];
    const dx = a.tx - a.x;
    const dz = a.tz - a.z;
    const d = Math.hypot(dx, dz);
    let want = a.want;
    if (d < 0.2 * a.s + 0.05) want = 0;
    else want = Math.min(want, d * 2 + 0.15);
    if (d > 0.05 && want > 0) {
      const yawT = Math.atan2(dx, dz) + a.side;
      const turn = angleDelta(a.yaw, yawT);
      a.yaw += clamp(turn, -sp.turn * dt, sp.turn * dt);
      // slow for a sharp turn
      want *= 1 - Math.min(0.7, Math.abs(turn) * 0.35);
    }
    const acc = want > a.speed ? 1.2 + sp.run * 1.2 : 2 + sp.run * 2;
    a.speed += clamp(want - a.speed, -acc * dt, acc * dt);
    if (a.speed > 0.001) {
      const hd = a.yaw - a.side;
      const nx = a.x + Math.sin(hd) * a.speed * dt;
      const nz = a.z + Math.cos(hd) * a.speed * dt;
      const g = this.h(nx, nz);
      const here = this.h(a.x, a.z);
      const ok = opt.swim ? g < -0.25 : opt.wade ? g > -0.72 && g < 3 : g > 0.06;
      const steep = (g - here) / Math.max(1e-3, a.speed * dt);
      if (ok && steep < (opt.steep ?? 0.8)) {
        a.x = nx;
        a.z = nz;
      } else {
        // blocked: give up on that way
        a.speed *= 0.3;
        a.tx = a.x;
        a.tz = a.z;
      }
    }
    if (!a.hold) a.gait += (a.speed / (sp.stride * a.s) + a.step) * TAU * dt;
    if (!a.hold) a.tgt[STRIDE] = a.speed > 0.03 || a.step > 0 ? clamp(0.35 + (a.speed / Math.max(sp.run, 0.1)) * 0.75, 0.3, 1) * sp.swing : 0;
    return d;
  }

  /** On its feet: stand on the ground and lean with the slope. */
  private ground(a: Beast) {
    a.y = this.h(a.x, a.z);
    const L = SPECIES[a.k].size * a.s * 0.45;
    const fx = Math.sin(a.yaw) * L;
    const fz = Math.cos(a.yaw) * L;
    a.slope = clamp(-Math.atan((this.h(a.x + fx, a.z + fz) - this.h(a.x - fx, a.z - fz)) / (2 * L)) * 0.85, -0.6, 0.6);
  }

  /** Steers through the air toward (tx, ty, tz) at `speed`. Returns the distance left. */
  private fly(a: Beast, dt: number, speed: number, agility = 2, floor = 2.5) {
    const dx = a.tx - a.x;
    const dy = a.ty - a.y;
    const dz = a.tz - a.z;
    const d = Math.hypot(dx, dy, dz);
    const sp = Math.min(speed, d * 1.6 + 0.3);
    const k = Math.min(1, agility * dt);
    const inv = 1 / Math.max(d, 1e-3);
    a.vx += (dx * inv * sp - a.vx) * k;
    a.vy += (dy * inv * sp - a.vy) * k;
    a.vz += (dz * inv * sp - a.vz) * k;
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.z += a.vz * dt;
    const g = Math.max(this.h(a.x, a.z), 0) + floor;
    if (a.y < g && d > 3) {
      a.y = lerp(a.y, g, damp(4, dt));
      a.vy = Math.max(a.vy, 0);
    }
    const hs = Math.hypot(a.vx, a.vz);
    if (hs > 0.2) {
      const yawT = Math.atan2(a.vx, a.vz);
      const turn = angleDelta(a.yaw, yawT);
      a.yaw += turn * damp(5, dt);
      a.tgt[ROLL] = clamp(-turn * 1.4, -0.9, 0.9);
    } else a.tgt[ROLL] = 0;
    a.tgt[PITCH] = clamp(-Math.atan2(a.vy, Math.max(hs, 1)) * 0.8, -0.8, 0.9);
    a.speed = hs;
    a.slope = 0;
    return d;
  }

  /** Somewhere to run: `dist` away from the fright, on footing it can take, uphill if it likes heights. */
  private fleeTo(a: Beast, dist: number, mode: 'land' | 'wade' | 'water', up = 0) {
    const ax = a.x - a.fx;
    const az = a.z - a.fz;
    const base = Math.atan2(ax, az);
    let best = -Infinity;
    for (const off of [0, 0.5, -0.5, 1, -1, 1.6, -1.6]) {
      const ang = base + off;
      const x = a.x + Math.sin(ang) * dist;
      const z = a.z + Math.cos(ang) * dist;
      const h = this.h(x, z);
      const mid = this.h((a.x + x) / 2, (a.z + z) / 2);
      const ok = mode === 'water' ? h < -0.6 : mode === 'wade' ? h > -0.7 && h < 0.8 && mid > -0.75 : h > 0.15 && mid > 0.1;
      const score = (ok ? 10 : 0) - Math.abs(off) * 2 + (up ? (h - a.y) * up : 0);
      if (score > best) {
        best = score;
        a.tx = x;
        a.tz = z;
      }
    }
  }

  /** A point within `r` of home it can stand on. */
  private wander(a: Beast, r: number, test: (h: number) => boolean = (h) => h > 0.3) {
    for (let i = 0; i < 6; i++) {
      const ang = Math.random() * TAU;
      const d = Math.random() * r;
      const x = a.home.x + Math.cos(ang) * d;
      const z = a.home.z + Math.sin(ang) * d;
      if (test(this.h(x, z)) && !this.avoided(x, z)) {
        a.tx = x;
        a.tz = z;
        return true;
      }
    }
    a.tx = a.home.x;
    a.tz = a.home.z;
    return false;
  }

  private faceTo(a: Beast, x: number, z: number, dt: number, rate = 3) {
    a.yaw += angleDelta(a.yaw, Math.atan2(x - a.x, z - a.z)) * damp(rate, dt);
  }

  /** Head turn toward (x, z), as far as the neck allows. */
  private lookAt(a: Beast, x: number, z: number, max = 1.2) {
    a.tgt[HY] = clamp(angleDelta(a.yaw, Math.atan2(x - a.x, z - a.z)), -max, max);
  }

  /** Lying down for the night (or a nap in the sun). */
  private lie(a: Beast) {
    a.tgt[LIFT] = -SPECIES[a.k].rest;
    a.tgt[TUCK] = 0.92;
    a.tgt[STRIDE] = 0;
    a.want = 0;
    a.speed = 0;
  }

  private resetPose(a: Beast) {
    const t = a.tgt;
    t[HP] = t[HY] = t[SA] = t[SB] = t[TUCK] = t[PITCH] = t[ROLL] = t[LIFT] = t[TAILW] = 0;
    a.hold = false;
    a.step = 0;
    a.side = 0;
  }

  // ---------------------------------------------------------------- the beasts

  /** Goats, deer and boar: a herd that grazes, wanders, rests and bolts together. */
  private grazer(a: Beast, dt: number) {
    const sp = SPECIES[a.k];
    const th = this.threat(a, sp.wary);
    const night = this.env.night > 0.62;
    const tgt = a.tgt;
    const leader = a.lead;
    // the herd takes fright together
    if (leader && leader.fear > 0.5 && a.fear < leader.fear * 0.9) {
      a.fear = leader.fear * 0.9;
      a.fx = leader.fx;
      a.fz = leader.fz;
    }
    if (a.fear > 0.5 && a.mode !== FLEE && a.mode !== CHARGE) {
      // the sow stands her ground once (a bluff charge), then they're off
      if (a.k === BOAR && a.adult && th.t && th.d < 7 && a.u <= 0 && a.fear < 1) {
        a.mode = CHARGE;
        a.t = 1.4;
        a.u = 25;
        this.call(a, 'grunt', 3, 0.85);
      } else {
        a.mode = FLEE;
        a.t = rand(3.5, 6);
        this.resetPose(a);
        this.fleeTo(a, a.k === DEER ? 40 : 28, 'land', a.k === GOAT ? 2 : 0);
        a.want = sp.run * (a.adult ? 1 : 0.95);
        if (a.k === GOAT) this.call(a, a.adult ? 'bleat' : 'kid');
        else if (a.k === DEER && !a.lead) this.call(a, 'snort');
        else if (a.k === BOAR) this.call(a, 'squeal', a.adult ? 1 : 2, a.adult ? 0.8 : 1.3);
      }
    } else if (th.t && th.d < sp.wary * 1.9 && (a.mode === IDLE || a.mode === WALK || a.mode === REST || a.mode === LOOK) && a.fear < 0.3) {
      a.mode = ALERT;
      a.t = rand(2.5, 5);
      a.fx = th.t.x;
      a.fz = th.t.z;
      if (a.k === DEER && Math.random() < 0.6) this.call(a, 'snort');
    }
    a.u -= dt;
    a.t -= dt;
    a.fear *= 1 - damp(a.mode === FLEE ? 0.25 : 0.6, dt);
    const time = this.time + a.seed;
    switch (a.mode) {
      case IDLE: {
        // graze: head down, cropping, a step now and then
        this.resetPose(a);
        tgt[HP] = a.k === BOAR ? 1.15 + Math.sin(time * 9) * 0.12 : 1.7 + Math.sin(time * 6.5) * 0.05;
        tgt[HY] = Math.sin(time * 0.7) * 0.25;
        tgt[PITCH] = a.k === BOAR ? 0.05 : 0.12;
        if (a.k === DEER) tgt[SA] = Math.sin(time * 0.9) > 0.92 ? 0.5 : 0;
        tgt[TAILW] = Math.sin(time * 3.1) > 0.8 ? Math.sin(time * 24) * 0.5 : 0;
        a.clock -= dt;
        if (a.clock < 0) {
          a.clock = rand(1.5, 4);
          a.tx = a.x + Math.sin(a.yaw + rand(-0.6, 0.6)) * rand(0.3, 1);
          a.tz = a.z + Math.cos(a.yaw + rand(-0.6, 0.6)) * rand(0.3, 1);
          a.want = sp.walk * 0.4;
          // the sow's snout turns the ground over
          if (a.k === BOAR) {
            this.dust(a.x + Math.sin(a.yaw) * 0.8 * a.s, a.y, a.z + Math.cos(a.yaw) * 0.8 * a.s, 3, 0.25 * a.s);
            if (Math.random() < 0.4) this.call(a, 'grunt', 1 + ((Math.random() * 2) | 0), a.adult ? 1 : 1.5);
          } else if (Math.random() < 0.08) this.call(a, a.k === GOAT ? (a.adult ? 'bleat' : 'kid') : 'snort');
        }
        this.walk(a, dt, { steep: a.k === GOAT ? 3 : 0.75 });
        // deer lift their heads to look round every so often
        if (a.k === DEER && Math.sin(time * 0.37) > 0.75) {
          tgt[HP] = -0.15;
          tgt[HY] = Math.sin(time * 0.9) * 0.8;
          tgt[SA] = Math.sin(time * 4.3) * 0.4;
        }
        if (a.t < 0) this.grazerNext(a, night);
        break;
      }
      case WALK: {
        this.resetPose(a);
        tgt[HP] = a.k === BOAR ? 0.45 : 0.25;
        if (leader) this.keepUp(a, leader);
        if (this.walk(a, dt, { steep: a.k === GOAT ? 3 : 0.75 }) < 0.4 || a.t < 0) {
          a.mode = IDLE;
          a.t = rand(4, 12);
        }
        break;
      }
      case LOOK: {
        // a billy up on a high rock, surveying his kingdom
        this.resetPose(a);
        if (this.walk(a, dt, { steep: 3 }) < 0.5) {
          tgt[HP] = -0.2;
          tgt[HY] = Math.sin(time * 0.4) * 1.1;
          if (Math.random() < dt * 0.05) this.call(a, 'bleat');
        } else tgt[HP] = 0.2;
        if (a.t < 0) {
          a.mode = IDLE;
          a.t = rand(4, 10);
        }
        break;
      }
      case PLAY: {
        // kids frisk: little leaps and twists
        this.resetPose(a);
        a.clock -= dt;
        if (a.clock < 0 && a.vy === 0) {
          a.clock = rand(0.5, 1.3);
          a.vy = rand(1.6, 2.6);
          a.yaw += rand(-1.6, 1.6);
          a.tx = a.x + Math.sin(a.yaw) * rand(0.5, 2);
          a.tz = a.z + Math.cos(a.yaw) * rand(0.5, 2);
          a.want = sp.run * 0.35;
        }
        this.walk(a, dt, { steep: 3 });
        if (a.t < 0) {
          a.mode = IDLE;
          a.t = rand(3, 8);
        }
        break;
      }
      case DUEL: {
        // two billies rear and clash horns
        const m = a.mate;
        if (!m || m.mode !== DUEL) {
          a.mode = IDLE;
          a.t = 3;
          break;
        }
        this.resetPose(a);
        const d = Math.hypot(m.x - a.x, m.z - a.z);
        this.faceTo(a, m.x, m.z, dt, 5);
        if (d > 1.7 * a.s) {
          a.tx = m.x;
          a.tz = m.z;
          a.want = sp.walk;
          this.walk(a, dt, { steep: 3 });
        } else {
          a.speed = 0;
          tgt[STRIDE] = 0;
          // rear, hold, then come down hard
          const ph = (a.u % 2.2) / 2.2;
          a.u += dt * 2;
          if (ph < 0.45) {
            tgt[PITCH] = -0.75;
            tgt[HP] = 0.5;
            tgt[TUCK] = 0.3;
          } else {
            tgt[PITCH] = 0.18;
            tgt[HP] = 1.05;
            a.quick = 3;
          }
          const was = ((a.u - dt * 2) % 2.2) / 2.2;
          if (was < 0.6 && ph >= 0.6 && a.seed < m.seed) {
            this.call(a, 'clack');
            this.dust((a.x + m.x) / 2, a.y, (a.z + m.z) / 2, 4, 0.3);
          }
        }
        if (a.t < 0) {
          a.mode = IDLE;
          a.t = rand(5, 10);
          m.mode = IDLE;
          m.t = rand(5, 10);
        }
        break;
      }
      case ALERT: {
        // stare at it, head high (a deer flags its tail, a goat stamps)
        this.resetPose(a);
        this.faceTo(a, a.fx, a.fz, dt, 2.5);
        tgt[HP] = -0.3;
        tgt[HY] = clamp(angleDelta(a.yaw, Math.atan2(a.fx - a.x, a.fz - a.z)), -0.8, 0.8);
        if (a.k === DEER) {
          tgt[SA] = 0.35;
          tgt[SB] = 1;
        }
        a.speed = 0;
        a.tgt[STRIDE] = 0;
        if (a.t < 0) {
          a.mode = IDLE;
          a.t = rand(2, 5);
        }
        break;
      }
      case CHARGE: {
        // head down, straight at them... and pull up short with a snort
        this.resetPose(a);
        const th2 = th.t;
        tgt[HP] = 0.55;
        if (th2) {
          a.tx = th2.x;
          a.tz = th2.z;
        }
        a.want = sp.run * 1.1;
        const d = this.walk(a, dt);
        if (d < 2.4 * a.s || a.t < 0) {
          this.call(a, 'snort', 2, 0.7);
          this.dust(a.x, a.y, a.z, 5, 0.35);
          a.mode = FLEE;
          a.t = rand(4, 6);
          a.fear = 1;
          if (th2) {
            a.fx = th2.x;
            a.fz = th2.z;
          }
          this.fleeTo(a, 30, 'land');
          a.want = sp.run;
        }
        break;
      }
      case FLEE: {
        this.resetPose(a);
        if (leader && leader.mode === FLEE) this.keepUp(a, leader, sp.run * 1.15);
        const d = this.walk(a, dt, { steep: a.k === GOAT ? 3 : 0.9 });
        const k = a.speed / sp.run;
        if (a.k === DEER) {
          // stotting: bounds high off all four feet, the white flag up
          if (a.vy === 0 && k > 0.4) a.vy = rand(2.6, 3.3);
          tgt[TUCK] = a.cur[LIFT] > 0.15 ? 0.55 : 0;
          tgt[SB] = 1;
          tgt[HP] = -0.25;
        } else if (a.k === GOAT) {
          if (a.vy === 0 && k > 0.5 && Math.random() < dt * 2.5) a.vy = rand(1.8, 2.6);
          tgt[HP] = -0.1;
        } else {
          tgt[HP] = 0.35;
          tgt[TAILW] = Math.sin(time * 18) * 0.3;
          tgt[SB] = 0.8;
        }
        if (d < 1 || a.t < 0) {
          if (a.fear > 0.6) this.fleeTo(a, 20, 'land', a.k === GOAT ? 2 : 0);
          else {
            a.mode = ALERT;
            a.t = rand(2, 4);
          }
          a.t = Math.max(a.t, 2);
        }
        break;
      }
      case REST: {
        this.resetPose(a);
        this.lie(a);
        tgt[HP] = 0.25 + Math.sin(time * 0.2) * 0.1;
        tgt[HY] = Math.sin(time * 0.13) * 0.5;
        if (a.t < 0 && !night) {
          a.mode = IDLE;
          a.t = rand(3, 8);
        } else if (a.t < 0) a.t = rand(10, 30);
        break;
      }
    }
    // jumps and bounds: a little ballistic hop on top of the walk
    this.hop(a, dt);
    if (a.mode !== REST && a.mode !== DUEL && a.tgt[LIFT] < 0) a.tgt[LIFT] = 0;
    this.ground(a);
  }

  /** Little ballistic leaps, carried in the LIFT channel. */
  private hop(a: Beast, dt: number) {
    if (a.vy === 0) return;
    a.jump += a.vy * dt;
    a.vy -= 9.8 * dt;
    if (a.jump <= 0) {
      a.jump = 0;
      a.vy = 0;
    }
    a.cur[LIFT] = a.tgt[LIFT] = a.jump;
  }

  private grazerNext(a: Beast, night: boolean) {
    const sp = SPECIES[a.k];
    if (night && Math.random() < 0.8) {
      a.mode = REST;
      a.t = rand(15, 40);
      return;
    }
    const leader = a.lead;
    if (leader && Math.hypot(leader.x - a.x, leader.z - a.z) > 7 * a.s) {
      a.mode = WALK;
      a.t = 12;
      this.keepUp(a, leader);
      a.want = sp.walk * 1.5;
      return;
    }
    const r = Math.random();
    if (a.k === GOAT && !a.adult && r < 0.4) {
      a.mode = PLAY;
      a.t = rand(3, 6);
      return;
    }
    if (a.k === GOAT && a.adult && r < 0.14) {
      // a high place to stand on
      let best: Spot | null = null;
      for (let i = 0; i < 8; i++) {
        const s = this.spotNear(a.pop.crags, a.x, a.z, 18);
        if (s && (!best || s.y > best.y)) best = s;
      }
      if (best) {
        a.mode = LOOK;
        a.t = rand(10, 18);
        a.tx = best.x;
        a.tz = best.z;
        a.want = sp.walk * 1.2;
        return;
      }
    }
    if (a.k === GOAT && a.adult && r < 0.24) {
      // pick a rival
      for (const b of a.pop.beasts) {
        if (b !== a && b.k === GOAT && b.adult && b.mode === IDLE && Math.hypot(b.x - a.x, b.z - a.z) < 9) {
          a.mode = b.mode = DUEL;
          a.mate = b;
          b.mate = a;
          a.t = b.t = rand(5, 8);
          a.u = 0;
          b.u = 0.1;
          return;
        }
      }
    }
    if (r < 0.55) {
      a.mode = WALK;
      a.t = 15;
      if (leader) this.keepUp(a, leader);
      else this.wander(a, a.k === GOAT ? 24 : 30, (h) => h > 1.2);
      a.want = sp.walk;
      return;
    }
    a.t = rand(4, 12);
  }

  /** Keep with the leader (piglets in a file behind their mother, the rest round the leader). */
  private keepUp(a: Beast, lead: Beast, speed = 0) {
    const sp = SPECIES[a.k];
    if (a.k === BOAR) {
      a.tx = lead.x - Math.sin(lead.yaw) * 0.75 * lead.s;
      a.tz = lead.z - Math.cos(lead.yaw) * 0.75 * lead.s;
    } else {
      if (!a.ox && !a.oz) {
        const ang = Math.random() * TAU;
        a.ox = Math.cos(ang) * rand(2, 5);
        a.oz = Math.sin(ang) * rand(2, 5);
      }
      a.tx = lead.x + a.ox;
      a.tz = lead.z + a.oz;
    }
    const d = Math.hypot(a.tx - a.x, a.tz - a.z);
    a.want = speed || Math.max(lead.speed * 1.05, d > 3 ? sp.walk * 1.4 : sp.walk * 0.6);
    a.want = Math.min(a.want, sp.run * 1.15);
  }

  /** Capuchins: forage on the ground, sit and groom, swarm up the trees, chatter at intruders. */
  private monkey(a: Beast, dt: number) {
    const sp = SPECIES[a.k];
    const th = this.threat(a, sp.wary);
    const tgt = a.tgt;
    const time = this.time + a.seed;
    const night = this.env.night > 0.62;
    a.t -= dt;
    a.fear *= 1 - damp(0.4, dt);
    const up = a.mode === PERCH || a.mode === CLIMB;
    if (a.fear > 0.5 && !up && a.mode !== FLEE) {
      a.mode = FLEE;
      a.tree = this.nearTree(a.pop, a.x, a.z, 40);
      this.call(a, 'screech', 2);
      a.t = 8;
    }
    // a captain who keeps still (or walks slowly) is worth a closer look
    if (th.t && !up && a.mode === IDLE && th.d < sp.wary * 3 && th.d > sp.wary * 1.2 && Math.random() < dt * 0.3) {
      a.mode = CURIOUS;
      a.t = rand(6, 12);
    }
    switch (a.mode) {
      case IDLE:
      case WALK: {
        this.resetPose(a);
        tgt[HP] = 0.6 + Math.sin(time * 2.1) * 0.2;
        tgt[TAILW] = Math.sin(time * 0.8) * 0.3;
        tgt[SB] = 0.4;
        a.want = a.mode === WALK ? sp.walk : 0;
        if (this.walk(a, dt, { steep: 1.2 }) < 0.3 && a.mode === WALK) {
          a.mode = IDLE;
          a.t = rand(1, 3);
        }
        if (a.t < 0) this.monkeyNext(a, night);
        this.ground(a);
        break;
      }
      case SIT: {
        // sat up on its haunches, nibbling, looking about
        this.resetPose(a);
        a.speed = 0;
        tgt[STRIDE] = 0.25;
        a.gait = Math.sin(time * 3) * 0.8 + 1.6;
        tgt[PITCH] = -1.05;
        tgt[HP] = 0.85 + Math.sin(time * 1.7) * 0.15;
        tgt[HY] = Math.sin(time * 0.6) * 1.0;
        tgt[SB] = -0.6;
        if (a.mate && a.mate.mode === SIT) {
          // grooming a friend
          this.faceTo(a, a.mate.x, a.mate.z, dt);
          tgt[HP] = 1.3 + Math.sin(time * 5) * 0.12;
          tgt[HY] = 0;
        }
        if (th.t && th.d < sp.wary * 2.5) this.lookAt(a, th.t.x, th.t.z, 1.4);
        this.ground(a);
        if (a.t < 0) {
          a.mate = null;
          this.monkeyNext(a, night);
        }
        break;
      }
      case CURIOUS: {
        // edges up for a look, sits and watches the visitor
        this.resetPose(a);
        const t2 = th.t;
        if (!t2) {
          a.mode = IDLE;
          break;
        }
        const d = Math.hypot(t2.x - a.x, t2.z - a.z);
        if (d > 5.5) {
          a.tx = t2.x;
          a.tz = t2.z;
          a.want = sp.walk;
          this.walk(a, dt, { steep: 1.2 });
          tgt[HP] = 0.3;
        } else {
          a.speed = 0;
          tgt[STRIDE] = 0;
          tgt[PITCH] = -1.05;
          tgt[HP] = 0.9;
          this.faceTo(a, t2.x, t2.z, dt, 2);
          tgt[HY] = Math.sin(time * 0.9) * 0.3;
          if (Math.random() < dt * 0.25) this.call(a, 'chatter', 3);
        }
        this.ground(a);
        if (a.t < 0) {
          a.mode = WALK;
          this.wander(a, 15);
          a.t = 10;
        }
        break;
      }
      case FLEE: {
        // scamper for the nearest tree
        this.resetPose(a);
        const tr = a.tree;
        if (!tr) {
          this.fleeTo(a, 20, 'land');
          a.want = sp.run;
          this.walk(a, dt, { steep: 1.5 });
          this.ground(a);
          if (a.t < 0) {
            a.mode = IDLE;
            a.t = 2;
          }
          break;
        }
        a.tx = tr.x;
        a.tz = tr.z;
        a.want = sp.run;
        tgt[HP] = 0.2;
        tgt[SB] = 0.6;
        if (this.walk(a, dt, { steep: 2 }) < 0.5) {
          a.mode = CLIMB;
          a.climbT = 0;
          a.air = true;
        }
        this.ground(a);
        break;
      }
      case CLIMB:
      case DOWN: {
        // hand over hand up (or down) the trunk
        this.resetPose(a);
        const tr = a.tree!;
        const len = (tr.palm ? tr.top.y - tr.y : tr.limb.y - tr.y) + 1;
        const rate = (a.fear > 0.4 ? sp.run * 0.7 : sp.walk * 1.4) / len;
        a.climbT = clamp(a.climbT + (a.mode === CLIMB ? rate : -rate) * dt, 0, 1);
        tr.at(a.climbT, _tp);
        tr.at(Math.min(1, a.climbT + 0.05), _h1);
        // cling to the trunk's side, belly to the bark
        const off = 0.16 * a.s;
        a.x = _tp.x - Math.sin(a.yaw) * off;
        a.z = _tp.z - Math.cos(a.yaw) * off;
        a.y = _tp.y;
        a.speed = sp.walk;
        a.gait += dt * 6;
        tgt[STRIDE] = sp.swing;
        // (it comes down tail first, looking down past its feet)
        tgt[PITCH] = -1.45;
        tgt[HP] = a.mode === CLIMB ? 1.0 : 1.35;
        tgt[SB] = -0.8;
        a.slope = 0;
        if (a.mode === CLIMB && a.climbT >= 1) {
          a.mode = PERCH;
          a.t = a.fear > 0.3 ? rand(15, 30) : rand(10, 40);
          if (a.fear > 0.3) this.call(a, 'chatter', 4, 1.1);
        } else if (a.mode === DOWN && a.climbT <= 0) {
          a.mode = IDLE;
          a.air = false;
          a.t = rand(2, 5);
          a.x = tr.x + Math.sin(a.yaw) * 0.5;
          a.z = tr.z + Math.cos(a.yaw) * 0.5;
        }
        break;
      }
      case PERCH: {
        // sat on a limb (or among the fronds), tail hanging, scolding anyone below
        this.resetPose(a);
        const tr = a.tree!;
        const p = tr.palm ? tr.top : tr.limb;
        a.x = lerp(a.x, p.x, damp(4, dt));
        a.y = lerp(a.y, p.y, damp(4, dt));
        a.z = lerp(a.z, p.z, damp(4, dt));
        a.speed = 0;
        if (!tr.palm) this.faceTo(a, p.x * 2 - tr.x, p.z * 2 - tr.z, dt, 2);
        tgt[STRIDE] = 0;
        tgt[PITCH] = -1.0;
        tgt[HP] = 0.9 + Math.sin(time * 1.3) * 0.2;
        tgt[HY] = Math.sin(time * 0.5) * 1.1;
        tgt[SB] = -1.3;
        tgt[TAILW] = Math.sin(time * 0.7) * 0.3;
        a.slope = 0;
        if (th.t && th.d < sp.wary * 3) {
          // a scolding: bobbing and shrieking at them
          this.lookAt(a, th.t.x, th.t.z, 1.4);
          tgt[HP] = 1.2;
          if (a.fear > 0.2) {
            tgt[LIFT] = Math.abs(Math.sin(time * 9)) * 0.05;
            if (Math.random() < dt * 0.6) this.call(a, 'chatter', 3 + ((Math.random() * 3) | 0), 1.1);
          }
        }
        if (a.t < 0 && a.fear < 0.25 && !night) {
          // across to a neighbouring tree, or back down
          const next = Math.random() < 0.35 ? this.nearTree(a.pop, tr.x, tr.z, 9, tr) : null;
          if (next) {
            a.mode = PLAY;
            a.tree = next;
            const q = next.palm ? next.top : next.limb;
            a.tx = q.x;
            a.ty = q.y;
            a.tz = q.z;
            const d = Math.hypot(q.x - a.x, q.z - a.z);
            a.u = d / 6;
            a.vy = ((q.y - a.y) + 0.5 * 9.8 * a.u * a.u) / Math.max(a.u, 0.1);
            a.vx = (q.x - a.x) / Math.max(a.u, 0.1);
            a.vz = (q.z - a.z) / Math.max(a.u, 0.1);
            a.yaw = Math.atan2(a.vx, a.vz);
            this.call(a, 'chatter', 2);
          } else {
            a.mode = DOWN;
          }
        } else if (a.t < 0) a.t = rand(10, 30);
        break;
      }
      case PLAY: {
        // the leap from tree to tree
        a.x += a.vx * dt;
        a.y += a.vy * dt;
        a.z += a.vz * dt;
        a.vy -= 9.8 * dt;
        a.u -= dt;
        tgt[PITCH] = -0.3;
        tgt[TUCK] = 0.6;
        tgt[SB] = 0.6;
        tgt[STRIDE] = 0;
        if (a.u <= 0) {
          a.mode = PERCH;
          a.t = rand(6, 20);
          a.vx = a.vz = a.vy = 0;
        }
        break;
      }
    }
  }

  private monkeyNext(a: Beast, night: boolean) {
    const r = Math.random();
    if (night || r < 0.22) {
      const t = this.nearTree(a.pop, a.x, a.z, 25);
      if (t) {
        a.tree = t;
        a.mode = FLEE;
        a.fear = 0;
        a.t = 20;
        return;
      }
    }
    if (r < 0.5) {
      a.mode = SIT;
      a.t = rand(4, 12);
      // a friend to groom
      if (Math.random() < 0.4) {
        for (const b of a.pop.beasts) {
          if (b !== a && b.k === MONKEY && b.mode === IDLE && Math.hypot(b.x - a.x, b.z - a.z) < 4) {
            b.mode = SIT;
            b.t = a.t;
            a.mate = b;
            b.mate = a;
            b.yaw = Math.atan2(a.x - b.x, a.z - b.z);
            break;
          }
        }
      }
      return;
    }
    a.mode = WALK;
    a.t = 10;
    const lead = a.lead;
    if (lead && Math.hypot(lead.x - a.x, lead.z - a.z) > 10) {
      a.tx = lead.x + rand(-3, 3);
      a.tz = lead.z + rand(-3, 3);
    } else this.wander(a, 14);
  }

  /** Birds of the trees and shores: the shared flying, landing and perching. */
  private bird(a: Beast, dt: number) {
    switch (a.k) {
      case MACAW:
        return this.macaw(a, dt);
      case PELICAN:
      case BOOBY:
        return this.seabird(a, dt);
      case FLAMINGO:
        return this.flamingo(a, dt);
      case EGRET:
        return this.egret(a, dt);
    }
  }

  /** Beats its wings for flight; `amp` and `hz` per species. */
  private wings(a: Beast, amp: number, hz: number) {
    a.tgt[FOLD] = 0;
    a.tgt[FLAP] = amp;
    a.flapHz = hz;
    a.tgt[TUCK] = 1;
  }

  /** Folds up on landing. */
  private settleWings(a: Beast) {
    a.tgt[FOLD] = 1;
    a.tgt[FLAP] = 0;
    a.flapHz = 0.5;
    a.tgt[TUCK] = 0;
    a.tgt[ROLL] = 0;
  }

  /** Glides in to (x, y, z), flaring at the end. Returns true on touchdown. */
  private landing(a: Beast, dt: number, x: number, y: number, z: number, speed: number, hz: number) {
    const dh = Math.hypot(x - a.x, z - a.z);
    a.tx = x;
    a.tz = z;
    a.ty = y + (dh > 6 ? Math.min(dh * 0.3, 10) : dh * 0.15);
    this.fly(a, dt, Math.max(1.2, Math.min(speed, dh * 0.9)), 2.5, dh > 10 ? 2 : -10);
    const flare = smoothstep(7, 1.5, dh);
    this.wings(a, 0.35 + flare * 0.5, hz * (1 + flare * 0.4));
    a.tgt[TUCK] = 1 - smoothstep(6, 2, dh);
    a.tgt[PITCH] -= flare * 0.5;
    if (dh < 0.35 && Math.abs(a.y - y) < 0.35) {
      a.x = x;
      a.y = y;
      a.z = z;
      a.vx = a.vy = a.vz = 0;
      this.settleWings(a);
      return true;
    }
    return false;
  }

  private takeOff(a: Beast) {
    a.air = true;
    a.wet = false;
    a.vy = 2.5;
    a.vx = Math.sin(a.yaw) * 2;
    a.vz = Math.cos(a.yaw) * 2;
  }

  private macaw(a: Beast, dt: number) {
    const sp = SPECIES[a.k];
    const th = this.threat(a, sp.wary);
    const tgt = a.tgt;
    const time = this.time + a.seed;
    const night = this.env.night > 0.6;
    a.t -= dt;
    a.fear *= 1 - damp(0.5, dt);
    if (a.fear > 0.5 && a.mode === PERCH) {
      // bursts out of the crown, screaming
      a.mode = FLY;
      a.tree = this.farTree(a);
      a.t = 30;
      this.takeOff(a);
      this.call(a, 'squawk', 2 + ((Math.random() * 2) | 0));
      if (a.mate && a.mate.mode === PERCH) {
        a.mate.mode = FLY;
        a.mate.tree = a.tree;
        this.takeOff(a.mate);
      }
    }
    switch (a.mode) {
      case PERCH: {
        this.resetPose(a);
        this.settleWings(a);
        const tr = a.tree;
        if (tr) {
          a.y = lerp(a.y, tr.top.y, damp(5, dt));
        }
        tgt[PITCH] = -0.55;
        tgt[SB] = -0.3;
        a.speed = 0;
        tgt[STRIDE] = 0;
        // preening, head-bobbing, looking about
        const mood = Math.sin(time * 0.31);
        if (night) {
          tgt[HY] = 2.4;
          tgt[HP] = 0.3;
        } else if (mood > 0.6) {
          tgt[HY] = 1.6 * Math.sign(Math.sin(time * 0.11));
          tgt[HP] = 1.1 + Math.sin(time * 6) * 0.15;
        } else {
          tgt[HY] = Math.sin(time * 0.8) * 1.2;
          tgt[HP] = 0.55 + (mood < -0.7 ? Math.abs(Math.sin(time * 7)) * 0.35 : 0);
        }
        if (th.t && th.d < sp.wary * 2) this.lookAt(a, th.t.x, th.t.z, 1.5);
        if (!night && Math.random() < dt * 0.05) this.call(a, 'squawk', 1 + ((Math.random() * 2) | 0));
        if (a.t < 0 && !night && (!a.mate || a.seed < a.mate.seed)) {
          // off across the island, the pair together
          a.t = rand(14, 40);
          if (Math.random() < 0.7 && a.pop.trees.length > 1) {
            a.mode = FLY;
            a.tree = this.farTree(a);
            this.takeOff(a);
            if (Math.random() < 0.6) this.call(a, 'squawk', 2);
            if (a.mate && a.mate.mode === PERCH) {
              a.mate.mode = FLY;
              a.mate.tree = a.tree;
              a.mate.t = 30;
              this.takeOff(a.mate);
            }
          }
        } else if (a.t < 0) a.t = rand(10, 30);
        break;
      }
      case FLY: {
        this.resetPose(a);
        const tr = a.tree!;
        // the mate flies at the leader's shoulder
        const m = a.mate;
        let ox = 0;
        let oz = 0;
        if (m && m.mode === FLY && a.seed > m.seed) {
          ox = Math.cos(m.yaw) * 1.4;
          oz = -Math.sin(m.yaw) * 1.4;
        }
        const tx = tr.top.x + ox * 0.3;
        const tz = tr.top.z + oz * 0.3;
        const dh = Math.hypot(tx - a.x, tz - a.z);
        if (dh > 14) {
          a.tx = m && m.mode === FLY && a.seed > m.seed ? m.x + ox : tx;
          a.tz = m && m.mode === FLY && a.seed > m.seed ? m.z + oz : tz;
          a.ty = Math.max(tr.top.y, this.h(a.x, a.z) + 8) + 6;
          this.fly(a, dt, 11, 2.2, 6);
          this.wings(a, 0.75, 4.2);
          tgt[SB] = 0.2;
        } else if (this.landing(a, dt, tx, tr.top.y, tz, 9, 4.2)) {
          a.mode = PERCH;
          a.t = rand(15, 50);
        }
        if (a.t < -30) {
          a.mode = PERCH;
          a.t = 5;
        }
        break;
      }
    }
  }

  /** A tree well across the island. */
  private farTree(a: Beast): Tree {
    let best = a.tree ?? a.pop.trees[0];
    let bd = -1;
    for (let i = 0; i < 6; i++) {
      const t = pick(a.pop.trees);
      const d = Math.hypot(t.x - a.x, t.z - a.z);
      const score = d < 120 ? d : 240 - d;
      if (score > bd) {
        bd = score;
        best = t;
      }
    }
    return best;
  }

  /** Pelicans and boobies: a colony on the rocks, fishing trips out round the island. */
  private seabird(a: Beast, dt: number) {
    const sp = SPECIES[a.k];
    const th = this.threat(a, sp.wary);
    const tgt = a.tgt;
    const time = this.time + a.seed;
    const pel = a.k === PELICAN;
    const night = this.env.night > 0.62;
    const ring = a.pop.ring;
    a.t -= dt;
    a.fear *= 1 - damp(0.5, dt);
    if (a.fear > 0.5 && (a.mode === IDLE || a.mode === DANCE || a.mode === SWIM || a.mode === WALK)) {
      a.mode = FLY;
      a.u = 0;
      a.t = rand(20, 40);
      a.clock = (Math.random() * ring.length) | 0;
      this.takeOff(a);
      if (!pel) this.call(a, 'whistle', 2);
    }
    switch (a.mode) {
      case IDLE:
      case WALK: {
        this.resetPose(a);
        this.settleWings(a);
        tgt[HP] = 0.15 + Math.sin(time * 0.5) * 0.15;
        tgt[HY] = Math.sin(time * 0.37) * 0.9;
        const mood = Math.sin(time * 0.23 + a.seed);
        if (pel && mood > 0.85) {
          // the pouch stretch: bill to the sky, gape wide
          tgt[HP] = -0.5;
          tgt[SA] = 0.7;
        } else if (mood < -0.75) {
          // preening under a wing
          tgt[HY] = 1.9 * Math.sign(Math.sin(a.seed));
          tgt[HP] = 1.3 + Math.sin(time * 5) * 0.2;
        }
        if (night) {
          tgt[HY] = 2.5;
          tgt[HP] = 0.25;
        }
        a.want = a.mode === WALK ? sp.walk : 0;
        if (this.walk(a, dt, { steep: 2 }) < 0.2 && a.mode === WALK) a.mode = IDLE;
        // a waddle's sway
        tgt[ROLL] = a.speed > 0.05 ? Math.sin(a.gait) * 0.12 : 0;
        this.ground(a);
        if (th.t && th.d < sp.wary * 2) this.lookAt(a, th.t.x, th.t.z);
        if (a.t < 0) {
          const r = Math.random();
          a.t = rand(6, 16);
          if (night) break;
          if (!pel && r < 0.3) {
            // a male's courtship: the slow high-stepping of those famous blue feet
            const mate = a.pop.beasts.find((b) => b !== a && b.k === BOOBY && b.mode === IDLE && Math.hypot(b.x - a.x, b.z - a.z) < 4);
            if (mate) {
              a.mode = DANCE;
              a.mate = mate;
              a.t = rand(6, 10);
              this.call(a, 'whistle', 2);
              break;
            }
          }
          if (ring.length && r < (pel ? 0.55 : 0.5)) {
            a.mode = FLY;
            a.u = 0;
            a.t = rand(25, 50);
            a.clock = (Math.random() * ring.length) | 0;
            this.takeOff(a);
            // the others in the group follow the first one out
            if (pel) {
              let n = 0;
              for (const b of a.pop.beasts) {
                if (b !== a && b.k === PELICAN && b.mode === IDLE && n < 4 && Math.hypot(b.x - a.x, b.z - a.z) < 20) {
                  b.mode = FOLLOW;
                  b.lead = a;
                  b.u = ++n;
                  b.t = a.t;
                  this.takeOff(b);
                }
              }
            }
          } else if (r < 0.75) {
            a.mode = WALK;
            this.wander(a, 6, (h) => h > 0.1);
          }
        }
        break;
      }
      case DANCE: {
        this.resetPose(a);
        const m = a.mate;
        if (m) this.faceTo(a, m.x, m.z, dt, 3);
        // lift one bright foot, then the other, slowly and with great ceremony; then point to the sky
        const ph = (a.t % 4) / 4;
        a.speed = 0;
        if (ph > 0.35) {
          a.step = 0.9;
          tgt[STRIDE] = 1.1;
          tgt[HP] = 0.35;
          tgt[LIFT] = Math.abs(Math.sin(a.gait)) * 0.03;
        } else {
          a.step = 0;
          tgt[STRIDE] = 0;
          tgt[HP] = -0.9;
          tgt[SB] = 0.85;
          tgt[FOLD] = 0.35;
          if (ph > 0.3 && Math.random() < dt * 2) this.call(a, 'whistle', 1, 1.2);
        }
        a.gait += a.step * TAU * dt;
        this.ground(a);
        if (a.t < 0) {
          a.mode = IDLE;
          a.t = rand(4, 10);
        }
        break;
      }
      case FLY:
      case FOLLOW: {
        // out round the island, low over the water; pelicans in a file behind their leader
        this.resetPose(a);
        const lead = a.mode === FOLLOW ? a.lead : null;
        if (a.mode === FOLLOW && (!lead || (lead.mode !== FLY && lead.mode !== DIVE))) {
          a.mode = FLY;
          a.clock = (Math.random() * Math.max(1, ring.length)) | 0;
        }
        if (!ring.length) {
          a.mode = LAND;
          break;
        }
        const alt = pel ? 4 : 9;
        if (lead) {
          // echelon: each a few lengths behind and to one side of the bird ahead
          const back = 3.2 * a.u;
          a.tx = lead.x - Math.sin(lead.yaw) * back + Math.cos(lead.yaw) * 1.2 * a.u;
          a.tz = lead.z - Math.cos(lead.yaw) * back - Math.sin(lead.yaw) * 1.2 * a.u;
          a.ty = lead.mode === DIVE ? Math.max(a.y, 4) : lead.y;
          this.fly(a, dt, 12, 2.2, 1.5);
          // the wingbeats roll back down the line
          a.flapPh = lead.flapPh - a.u * 0.9;
        } else {
          const p = ring[a.clock % ring.length];
          a.tx = p.x;
          a.tz = p.z;
          a.ty = alt + Math.sin(time * 0.4) * 1.5;
          if (this.fly(a, dt, pel ? 9 : 11, 1.4, 1.5) < 14) a.clock++;
        }
        // mostly gliding, with steady bursts of beats
        const beat = Math.sin(time * 0.6) > -0.2;
        this.wings(a, beat ? (pel ? 0.5 : 0.65) : 0.08, pel ? 2.2 : 3.6);
        if (lead) a.flapHz = lead.flapHz;
        // spotted a fish
        if (!lead && Math.random() < dt * (pel ? 0.06 : 0.09) && !night) {
          a.mode = DIVE;
          a.u = 0;
          a.tx = a.x + Math.sin(a.yaw) * 8;
          a.tz = a.z + Math.cos(a.yaw) * 8;
        }
        if (a.t < 0 || night) a.mode = LAND;
        break;
      }
      case DIVE: {
        // climb, roll over and plunge, wings swept back like an arrow
        this.resetPose(a);
        a.u += dt;
        const top = pel ? 9 : 15;
        if (a.u < 1.4) {
          a.ty = top;
          this.fly(a, dt, 8, 2.5, 1);
          this.wings(a, 0.5, pel ? 2.4 : 3.8);
        } else {
          a.vy -= 22 * dt;
          a.vx *= 1 - damp(0.8, dt);
          a.vz *= 1 - damp(0.8, dt);
          a.x += a.vx * dt;
          a.y += a.vy * dt;
          a.z += a.vz * dt;
          tgt[FOLD] = pel ? 0.75 : 0.95;
          tgt[FLAP] = 0;
          tgt[PITCH] = 1.35;
          tgt[TUCK] = 1;
          a.quick = 2;
          const wy = this.w.waterHeight(a.x, a.z);
          if (a.y < wy + 0.3) {
            this.splash(a.x, a.z, pel ? 0.8 : 0.55);
            a.mode = SWIM;
            a.wet = true;
            a.air = false;
            a.vx = a.vy = a.vz = 0;
            a.t = rand(4, 9);
            a.y = wy - 0.5;
            a.u = 0;
          }
        }
        break;
      }
      case SWIM: {
        // bob on the swell, bill down, then toss the catch back
        this.resetPose(a);
        this.settleWings(a);
        a.u += dt;
        const wy = this.w.waterHeight(a.x, a.z);
        a.y = lerp(a.y, wy - 0.38 * a.s, damp(3, dt));
        tgt[HP] = a.u < 1.5 ? 0.9 : a.u < 2.2 ? -0.9 : 0.1;
        tgt[SA] = a.u < 1.5 && pel ? 0.5 : 0;
        tgt[PITCH] = 0.05;
        tgt[TUCK] = 1;
        a.slope = 0;
        if (a.t < 0) {
          a.mode = FLY;
          a.t = rand(10, 25);
          this.takeOff(a);
          this.splash(a.x, a.z, 0.25);
        }
        break;
      }
      case LAND: {
        this.resetPose(a);
        if (this.landing(a, dt, a.home.x, Math.max(a.home.y, this.h(a.home.x, a.home.z)), a.home.z, pel ? 8 : 10, pel ? 2.2 : 3.6)) {
          a.mode = IDLE;
          a.air = false;
          a.t = rand(10, 30);
        }
        break;
      }
    }
  }

  private flamingo(a: Beast, dt: number) {
    const sp = SPECIES[a.k];
    this.threat(a, sp.wary);
    const tgt = a.tgt;
    const time = this.time + a.seed;
    const lead = a.lead;
    const night = this.env.night > 0.62;
    a.t -= dt;
    a.fear *= 1 - damp(0.3, dt);
    // the whole flock goes when one does
    if (lead && lead.fear > 0.5 && a.fear < lead.fear * 0.95) {
      a.fear = lead.fear * 0.95;
      a.fx = lead.fx;
      a.fz = lead.fz;
    }
    const grounded = a.mode === IDLE || a.mode === WALK || a.mode === REST || a.mode === ALERT || a.mode === MARCH;
    if (a.fear > 0.75 && grounded) {
      // run across the water, wings going, and lift off
      a.mode = TAKEOFF;
      a.u = 0;
      this.resetPose(a);
      this.fleeTo(a, 50, 'wade');
      a.want = sp.run;
      if (Math.random() < 0.5) this.call(a, 'honk', 2 + ((Math.random() * 2) | 0));
    } else if (a.fear > 0.4 && grounded && a.mode !== ALERT) {
      a.mode = ALERT;
      a.t = rand(3, 6);
      this.fleeTo(a, 10, 'wade');
      if (Math.random() < 0.3) this.call(a, 'honk', 1);
    }
    // the flock's leader now and then starts the march: the famous massed display
    if (!lead && a.mode === IDLE && !night && Math.random() < dt * 0.012) {
      const dir = Math.random() * TAU;
      for (const b of a.pop.beasts) {
        if (b.k === FLAMINGO && (b === a || b.lead === a) && b.mode === IDLE) {
          b.mode = MARCH;
          b.t = rand(9, 14);
          b.u = dir;
        }
      }
      this.call(a, 'honk', 4);
    }
    const wade = { wade: true };
    switch (a.mode) {
      case IDLE:
      case WALK: {
        // feeding: head upside down in the water, sweeping side to side, stamping the mud
        this.resetPose(a);
        this.settleWings(a);
        tgt[HP] = 2.75;
        tgt[HY] = Math.sin(time * 1.4) * 0.4;
        tgt[PITCH] = 0.12;
        a.want = sp.walk * 0.6;
        a.clock -= dt;
        if (a.clock < 0) {
          a.clock = rand(2, 5);
          const cx = lead ? lead.x : a.home.x;
          const cz = lead ? lead.z : a.home.z;
          const ang = Math.random() * TAU;
          const r = lead ? rand(1.5, 6) : rand(0, 8);
          if (this.h(cx + Math.cos(ang) * r, cz + Math.sin(ang) * r) > -0.65 && this.h(cx + Math.cos(ang) * r, cz + Math.sin(ang) * r) < -0.08) {
            a.tx = cx + Math.cos(ang) * r;
            a.tz = cz + Math.sin(ang) * r;
          }
          if (Math.random() < 0.05) this.call(a, 'honk', 1 + ((Math.random() * 2) | 0));
        }
        this.walk(a, dt, wade);
        this.ground(a);
        if (a.t < 0) {
          a.t = rand(8, 25);
          if (night || Math.random() < 0.25) {
            a.mode = REST;
            a.t = rand(15, 40);
          }
        }
        break;
      }
      case REST: {
        // asleep on one leg, head laid back along the body
        this.resetPose(a);
        this.settleWings(a);
        a.speed = 0;
        tgt[STRIDE] = 0;
        tgt[SA] = 1;
        tgt[HY] = 2.7;
        tgt[HP] = 1.25;
        if (Math.sin(time * 0.3) > 0.8) {
          // preening
          tgt[SA] = 0;
          tgt[HY] = 1.5 * Math.sign(Math.sin(a.seed));
          tgt[HP] = 1.0 + Math.sin(time * 4) * 0.15;
        }
        this.ground(a);
        if (a.t < 0 && !night) {
          a.mode = IDLE;
          a.t = rand(10, 20);
        } else if (a.t < 0) a.t = 20;
        break;
      }
      case ALERT: {
        this.resetPose(a);
        this.settleWings(a);
        tgt[HP] = -0.15;
        tgt[HY] = Math.sin(time * 2) * 0.4;
        a.want = sp.walk * 1.6;
        this.walk(a, dt, wade);
        this.ground(a);
        if (a.t < 0) {
          a.mode = IDLE;
          a.t = rand(4, 10);
        }
        break;
      }
      case MARCH: {
        // heads high, the flock bunched and stepping together, heads flagging, wings flashing open
        this.resetPose(a);
        this.settleWings(a);
        const cx = lead ? lead.x : a.x;
        const cz = lead ? lead.z : a.z;
        a.tx = cx + Math.sin(a.u) * 6 + (lead ? (a.x - cx) * 0.4 : 0);
        a.tz = cz + Math.cos(a.u) * 6 + (lead ? (a.z - cz) * 0.4 : 0);
        a.want = sp.walk * 1.8;
        tgt[HP] = -0.12;
        tgt[HY] = Math.sin(time * 5.5) * 0.7;
        if (Math.sin(time * 0.9) > 0.85) {
          tgt[FOLD] = 0.25;
          tgt[SB] = 0.5;
        }
        this.walk(a, dt, wade);
        this.ground(a);
        if (Math.random() < dt * 0.15) this.call(a, 'honk', 2);
        if (a.t < 0) {
          a.mode = IDLE;
          a.t = rand(6, 15);
        }
        break;
      }
      case TAKEOFF: {
        this.resetPose(a);
        a.u += dt;
        this.walk(a, dt, wade);
        this.ground(a);
        this.wings(a, 0.75, 3);
        tgt[TUCK] = 0;
        tgt[HP] = 1.1;
        tgt[PITCH] = -0.1;
        if (a.u > 1.1) {
          a.mode = FLY;
          a.air = true;
          a.vx = Math.sin(a.yaw) * a.speed;
          a.vz = Math.cos(a.yaw) * a.speed;
          a.vy = 1.5;
          a.t = 25;
          // somewhere else in the shallows to settle
          const s = this.spotNear(a.pop.shallows, a.x, a.z, 400) ?? a.home;
          a.home = lead ? lead.home : { ...s };
          a.u = 0;
        }
        break;
      }
      case FLY: {
        // neck stretched out ahead, legs trailing: a pink arrow in a loose line
        this.resetPose(a);
        const L = lead && lead.mode === FLY ? lead : null;
        if (L) {
          const i = a.pop.beasts.indexOf(a) - a.pop.beasts.indexOf(L);
          a.tx = L.x - Math.sin(L.yaw) * 2.5 * (i % 6) + Math.cos(L.yaw) * 1.6 * Math.floor(i / 6) * (i % 2 ? 1 : -1);
          a.tz = L.z - Math.cos(L.yaw) * 2.5 * (i % 6) - Math.sin(L.yaw) * 1.6 * Math.floor(i / 6) * (i % 2 ? 1 : -1);
          a.ty = L.y;
          this.fly(a, dt, 13, 2.4, 3);
        } else {
          // (a straggler heads for wherever its leader is bound)
          const H = lead ? lead.home : a.home;
          const dh = Math.hypot(H.x - a.x, H.z - a.z);
          a.u += dt;
          if (dh > 18 || a.u < 6) {
            // a wide circle first, then on to the new feeding ground
            const ang = a.u < 6 ? a.yaw + 0.5 : Math.atan2(H.x - a.x, H.z - a.z);
            a.tx = a.x + Math.sin(ang) * 20;
            a.tz = a.z + Math.cos(ang) * 20;
            a.ty = Math.max(12, this.h(a.x, a.z) + 10);
            this.fly(a, dt, 11, 1.6, 4);
          } else {
            a.mode = LAND;
          }
        }
        this.wings(a, 0.55, 2.6);
        tgt[HP] = 1.45;
        if (L && L.mode === LAND) a.mode = LAND;
        break;
      }
      case LAND: {
        this.resetPose(a);
        const tx = lead ? lead.home.x + (a.seed % 7) - 3.5 : a.home.x;
        const tz = lead ? lead.home.z + ((a.seed * 7) % 7) - 3.5 : a.home.z;
        tgt[HP] = 1.2;
        if (this.landing(a, dt, tx, this.h(tx, tz), tz, 10, 2.6)) {
          a.mode = ALERT;
          a.air = false;
          a.t = rand(3, 6);
          a.fear = 0;
          a.tx = a.x + Math.sin(a.yaw) * 2;
          a.tz = a.z + Math.cos(a.yaw) * 2;
        }
        if (a.t < -40) {
          a.mode = IDLE;
          a.air = false;
        }
        a.t -= dt;
        break;
      }
    }
  }

  private egret(a: Beast, dt: number) {
    const sp = SPECIES[a.k];
    const th = this.threat(a, sp.wary);
    const tgt = a.tgt;
    const time = this.time + a.seed;
    a.t -= dt;
    a.u -= dt;
    a.fear *= 1 - damp(0.4, dt);
    if (a.fear > 0.55 && (a.mode === IDLE || a.mode === STRIKE || a.mode === WALK)) {
      a.mode = FLY;
      a.t = rand(6, 10);
      this.takeOff(a);
      this.fleeTo(a, 60, 'wade');
      a.home = { x: a.tx, y: 0, z: a.tz };
      const s = this.spotNear(a.pop.shallows.length ? a.pop.shallows : a.pop.beach, a.tx, a.tz, 120);
      if (s) a.home = { ...s };
      this.call(a, 'croak', 2);
    }
    switch (a.mode) {
      case IDLE:
      case WALK: {
        // stalking: a slow step, then frozen mid-stride, neck drawn back, eyes on the water
        this.resetPose(a);
        this.settleWings(a);
        tgt[HP] = 0.55;
        tgt[HY] = Math.sin(time * 0.5) * 0.4;
        tgt[PITCH] = 0.08;
        a.clock -= dt;
        if (a.clock < 0) {
          a.hold = !a.hold;
          a.clock = a.hold ? rand(1, 3.5) : rand(0.5, 1.2);
          if (!a.hold && Math.hypot(a.tx - a.x, a.tz - a.z) < 0.5) this.wander(a, 14, (h) => h > -0.55 && h < 0.4);
          // a fish!
          if (a.hold && Math.random() < 0.35) {
            a.mode = STRIKE;
            a.u = 0.9;
          }
        }
        a.want = a.hold ? 0 : sp.walk;
        if (a.hold) a.speed = 0;
        this.walk(a, dt, { wade: true });
        this.ground(a);
        if (th.t && th.d < sp.wary * 1.8) this.lookAt(a, th.t.x, th.t.z);
        break;
      }
      case STRIKE: {
        // the stab, and (sometimes) the fish tossed back and swallowed
        this.resetPose(a);
        this.settleWings(a);
        a.speed = 0;
        a.hold = true;
        if (a.u > 0.65) tgt[HP] = 0.2;
        else if (a.u > 0.45) {
          tgt[HP] = 2.1;
          a.quick = 6;
          if (a.u - dt <= 0.45) {
            const bx = a.x + Math.sin(a.yaw) * 0.45 * a.s;
            const bz = a.z + Math.cos(a.yaw) * 0.45 * a.s;
            if (this.h(bx, bz) < -0.05) this.splash(bx, bz, 0.12);
          }
        } else if (a.u > 0.1) {
          tgt[HP] = -0.7;
          a.quick = 2;
        } else {
          a.mode = IDLE;
          a.hold = false;
        }
        this.ground(a);
        break;
      }
      case FLY: {
        // slow, deep wingbeats, neck folded back, legs trailing
        this.resetPose(a);
        a.ty = Math.max(this.h(a.x, a.z), 0) + 6;
        a.tx = a.home.x;
        a.tz = a.home.z;
        const d = this.fly(a, dt, 7, 1.5, 2);
        this.wings(a, 0.62, 1.9);
        tgt[HP] = 0.35;
        if (d < 14 || a.t < 0) a.mode = LAND;
        break;
      }
      case LAND: {
        this.resetPose(a);
        tgt[HP] = -0.2;
        if (this.landing(a, dt, a.home.x, this.h(a.home.x, a.home.z), a.home.z, 6, 1.9)) {
          a.mode = IDLE;
          a.air = false;
          a.fear = 0;
          a.tx = a.x;
          a.tz = a.z;
        }
        break;
      }
    }
  }

  private iguana(a: Beast, dt: number) {
    const sp = SPECIES[a.k];
    const th = this.threat(a, sp.wary);
    const tgt = a.tgt;
    const time = this.time + a.seed;
    a.t -= dt;
    a.u -= dt;
    a.fear *= 1 - damp(0.25, dt);
    if (a.fear > 0.5 && a.mode !== FLEE && a.mode !== SWIM) {
      a.mode = FLEE;
      a.t = 4;
      // the sea if it's handy, else away into the scrub
      let water = false;
      for (let i = 0; i < 8 && !water; i++) {
        const ang = Math.atan2(a.x - a.fx, a.z - a.fz) + (i - 3.5) * 0.6;
        const x = a.x + Math.sin(ang) * 18;
        const z = a.z + Math.cos(ang) * 18;
        if (this.h(x, z) < -0.6) {
          a.tx = x;
          a.tz = z;
          water = true;
        }
      }
      if (!water) this.fleeTo(a, 14, 'land');
      a.want = sp.run;
      if (Math.random() < 0.4) this.call(a, 'hiss');
    } else if (th.t && th.d < sp.wary * 1.7 && a.mode === WALK) {
      // freeze: perhaps it hasn't been seen
      a.mode = IDLE;
      a.t = rand(3, 6);
    }
    tgt[TAILW] = 0;
    switch (a.mode) {
      case IDLE: {
        // basking, belly to the warm rock; now and then the head-bobbing display, dewlap out
        this.resetPose(a);
        a.speed = 0;
        tgt[STRIDE] = 0;
        tgt[LIFT] = -0.03;
        tgt[HP] = -0.12;
        tgt[TAILW] = Math.sin(a.seed) * 0.3;
        if (a.u > 0) {
          tgt[HP] = -0.3 + Math.sin(a.u * 14) * 0.28;
          tgt[SA] = -0.75;
          tgt[LIFT] = 0.03 + Math.max(0, Math.sin(a.u * 7)) * 0.03;
          a.quick = 2;
        } else if (Math.random() < dt * 0.06) a.u = rand(1.2, 2.2);
        if (th.t && th.d < sp.wary * 2.2) this.lookAt(a, th.t.x, th.t.z, 0.6);
        this.ground(a);
        if (a.t < 0) {
          a.t = rand(10, 40);
          if (Math.random() < 0.4) {
            a.mode = WALK;
            this.wander(a, 10, (h) => h > 0.15);
            a.want = sp.walk;
          }
        }
        break;
      }
      case WALK:
      case FLEE: {
        this.resetPose(a);
        tgt[HP] = -0.1;
        // the body and tail swing from side to side with the legs
        tgt[TAILW] = -Math.sin(a.gait) * 0.4;
        a.quick = 2;
        const d = this.walk(a, dt, { wade: true });
        this.ground(a);
        if (this.h(a.x, a.z) < -0.35) {
          a.mode = SWIM;
          a.wet = true;
          a.t = rand(12, 25);
          this.splash(a.x, a.z, 0.2);
          a.tx = a.x + Math.sin(a.yaw) * 14;
          a.tz = a.z + Math.cos(a.yaw) * 14;
        } else if (d < 0.4 || a.t < -10) {
          a.mode = IDLE;
          a.t = rand(8, 20);
        }
        break;
      }
      case SWIM: {
        // legs folded back, swimming with great sweeps of the tail
        this.resetPose(a);
        tgt[TUCK] = 1;
        tgt[TAILW] = Math.sin(time * 5) * 0.6;
        tgt[HP] = -0.25;
        a.quick = 2;
        a.want = 1.1;
        a.gait = 0;
        // after a while, back ashore to bask
        if (a.t < 0) {
          a.tx = a.home.x;
          a.tz = a.home.z;
        }
        this.walk(a, dt, a.t < 0 ? { wade: true } : { swim: true });
        a.y = this.w.waterHeight(a.x, a.z) - 0.12 * a.s;
        a.slope = 0;
        if (a.t < 0 && this.h(a.x, a.z) > -0.3) {
          a.mode = WALK;
          a.wet = false;
          a.want = sp.walk;
          a.t = 10;
        }
        break;
      }
    }
  }

  private tortoise(a: Beast, dt: number) {
    const sp = SPECIES[a.k];
    const th = this.threat(a, sp.wary);
    const tgt = a.tgt;
    const time = this.time + a.seed;
    const night = this.env.night > 0.62;
    a.t -= dt;
    a.fear *= 1 - damp(0.15, dt);
    if (a.fear > 0.45 && a.mode !== HIDE) {
      a.mode = HIDE;
      a.t = rand(6, 12);
      this.call(a, 'hiss');
    }
    switch (a.mode) {
      case IDLE:
      case WALK: {
        // cropping the grass, or plodding on to the next patch, rocking from foot to foot
        this.resetPose(a);
        tgt[HP] = a.mode === WALK ? 0.15 : 0.85 + Math.sin(time * 2.4) * 0.07;
        tgt[HY] = Math.sin(time * 0.3) * 0.4;
        a.want = a.mode === WALK ? sp.walk : 0;
        this.walk(a, dt, { steep: 0.6 });
        tgt[ROLL] = a.speed > 0.02 ? Math.sin(a.gait) * 0.05 : 0;
        if (Math.sin(time * 0.17) > 0.9) {
          // a long stretch of the neck to look about
          tgt[HP] = -0.75;
          tgt[HY] = Math.sin(time * 0.5) * 0.9;
        }
        this.ground(a);
        if (a.t < 0) {
          a.t = rand(10, 30);
          if (night) {
            a.mode = REST;
            a.t = rand(30, 60);
          } else if (Math.random() < 0.5) {
            a.mode = WALK;
            this.wander(a, 12, (h) => h > 1.5);
          } else a.mode = IDLE;
        }
        break;
      }
      case REST: {
        this.resetPose(a);
        a.speed = 0;
        tgt[STRIDE] = 0;
        tgt[LIFT] = -0.1;
        tgt[TUCK] = 0.5;
        tgt[SA] = 0.18;
        tgt[HP] = 0.3;
        this.ground(a);
        if (a.t < 0) {
          a.mode = night ? REST : IDLE;
          a.t = rand(20, 40);
        }
        break;
      }
      case HIDE: {
        // head and legs drawn in, the shell down on the ground; a peek, and out again
        this.resetPose(a);
        a.speed = 0;
        tgt[STRIDE] = 0;
        const peek = a.t < 2.2 && a.t > 0;
        tgt[SA] = peek ? 0.2 : 0.42;
        tgt[LIFT] = -0.13;
        tgt[TUCK] = peek ? 0.4 : 0.7;
        tgt[HP] = peek ? -0.1 : 0;
        a.quick = peek ? 0.5 : 2.5;
        this.ground(a);
        if (a.t < 0) {
          if (a.fear > 0.3 || (th.t && th.d < sp.wary)) a.t = rand(3, 6);
          else {
            a.mode = IDLE;
            a.t = rand(5, 10);
          }
        }
        break;
      }
    }
  }

  private seal(a: Beast, dt: number) {
    const sp = SPECIES[a.k];
    const th = this.threat(a, sp.wary);
    const tgt = a.tgt;
    const time = this.time + a.seed;
    a.t -= dt;
    a.u -= dt;
    a.fear *= 1 - damp(0.3, dt);
    const inSea = this.h(a.x, a.z) < -0.35;
    if (a.fear > 0.55 && !inSea && a.mode !== FLEE) {
      // barking, off down the rocks into the sea
      a.mode = FLEE;
      a.t = 12;
      let found = false;
      for (const r of a.pop.ring) {
        if (Math.hypot(r.x - a.x, r.z - a.z) < 80 && (!found || Math.hypot(r.x - a.x, r.z - a.z) < Math.hypot(a.tx - a.x, a.tz - a.z))) {
          a.tx = r.x;
          a.tz = r.z;
          found = true;
        }
      }
      if (!found) this.fleeTo(a, 20, 'water');
      this.call(a, 'bark', 2 + ((Math.random() * 2) | 0), a.adult ? 1 : 1.4);
    }
    if (inSea) {
      // swimming: low in the water, rolling lazily, porpoising out now and then
      this.resetPose(a);
      a.wet = true;
      if (a.mode !== SWIM) {
        a.mode = SWIM;
        if (a.t < 6) a.t = rand(20, 50);
        this.splash(a.x, a.z, 0.5);
      }
      a.want = a.fear > 0.3 ? 3.2 : 1.6;
      a.clock -= dt;
      if (a.clock < 0 || Math.hypot(a.tx - a.x, a.tz - a.z) < 2) {
        a.clock = rand(4, 9);
        const r = a.pop.ring.length ? this.spotNear(a.pop.ring, a.home.x, a.home.z, 90) : null;
        a.tx = (r ? r.x : a.x) + rand(-12, 12);
        a.tz = (r ? r.z : a.z) + rand(-12, 12);
      }
      if (a.t < 0) {
        a.tx = a.home.x;
        a.tz = a.home.z;
        a.want = 1.6;
      }
      a.gait += dt * 3;
      tgt[STRIDE] = 0.4;
      const porp = Math.sin(time * 0.9) > 0.94;
      const wy = this.w.waterHeight(a.x, a.z);
      a.y = lerp(a.y, wy - (porp ? 0.05 : 0.3) * a.s, damp(3, dt));
      tgt[ROLL] = Math.sin(time * 0.35) * 0.6;
      tgt[HP] = -0.35;
      tgt[PITCH] = porp ? -0.25 : 0;
      a.slope = 0;
      this.walk(a, dt, a.t < 0 ? { wade: true } : { swim: true });
      if (a.t < 0 && this.h(a.x, a.z) > -0.35) {
        a.mode = WALK;
        a.wet = false;
        a.t = 20;
      }
      return;
    }
    a.wet = false;
    switch (a.mode) {
      case SWIM:
      case WALK:
      case FLEE: {
        // galumphing: the chest heaves up, the hips humped after it
        this.resetPose(a);
        if (a.mode === SWIM) {
          a.mode = WALK;
          a.tx = a.home.x;
          a.tz = a.home.z;
        }
        a.want = a.mode === FLEE ? sp.run : sp.walk;
        const d = this.walk(a, dt, { wade: true, steep: 1.6 });
        tgt[PITCH] = Math.sin(a.gait) * 0.12;
        tgt[LIFT] = Math.max(0, Math.sin(a.gait)) * 0.06;
        tgt[HP] = -0.25;
        a.quick = 2;
        this.ground(a);
        if (a.mode === WALK && d < 0.6) {
          a.mode = IDLE;
          a.t = rand(15, 40);
        }
        if (a.mode === FLEE && d < 0.5) this.fleeTo(a, 10, 'water');
        break;
      }
      case IDLE: {
        // hauled out: dozing, rolling over, scratching with a flipper, barking at the world
        this.resetPose(a);
        a.speed = 0;
        const mood = Math.sin(time * 0.13 + a.seed);
        if (mood > 0.55) {
          // on its side, waving a flipper
          tgt[ROLL] = 1.15;
          tgt[STRIDE] = 0.7;
          a.gait = Math.sin(time * 2.2) * 1.4;
          tgt[HP] = 0.1;
        } else if (mood < -0.6) {
          tgt[HP] = 0.42;
          tgt[STRIDE] = 0;
        } else {
          tgt[HP] = -0.35 + Math.sin(time * 0.4) * 0.15;
          tgt[HY] = Math.sin(time * 0.3) * 0.7;
          tgt[STRIDE] = 0;
        }
        if (a.u > 0) {
          // the bark: head flung up, bobbing with each
          tgt[HP] = -0.85 + Math.sin(a.u * 11) * 0.18;
          tgt[ROLL] = 0;
          a.quick = 2;
        } else if (Math.random() < dt * 0.04) {
          a.u = rand(1.2, 2.2);
          this.call(a, 'bark', 2 + ((Math.random() * 3) | 0), a.adult ? 1 : 1.4);
        }
        if (th.t && th.d < sp.wary * 2) {
          this.lookAt(a, th.t.x, th.t.z, 0.9);
          tgt[HP] = -0.5;
          tgt[ROLL] = 0;
        }
        this.ground(a);
        if (a.t < 0) {
          a.t = rand(20, 60);
          if (Math.random() < 0.35 && a.pop.ring.length) {
            // a swim
            a.mode = FLEE;
            a.fear = 0;
            const r = this.spotNear(a.pop.ring, a.x, a.z, 80) ?? pick(a.pop.ring);
            a.tx = r.x;
            a.tz = r.z;
            a.t = 30;
          }
        }
        break;
      }
    }
  }

  private crab(a: Beast, dt: number) {
    const sp = SPECIES[a.k];
    const th = this.threat(a, sp.wary);
    const tgt = a.tgt;
    const time = this.time + a.seed;
    const night = this.env.night > 0.5;
    a.t -= dt;
    a.fear *= 1 - damp(0.5, dt);
    if (a.mode !== HIDE && a.mode !== FLEE && a.mode !== DOWN) {
      if (a.fear > 0.85 || (th.t && th.d < sp.wary * 0.6)) {
        // dash for it
        a.mode = FLEE;
        a.t = rand(0.8, 1.6);
        this.fleeTo(a, 6, 'land');
        a.want = sp.run;
        if (Math.random() < 0.3) this.call(a, 'click', 3);
      } else if (a.fear > 0.4 || (th.t && th.d < sp.wary * 1.3)) {
        if (a.mode !== ALERT) {
          a.mode = ALERT;
          a.t = rand(1.5, 3);
        }
        if (th.t) {
          a.fx = th.t.x;
          a.fz = th.t.z;
        }
      }
    }
    // pick the sideways direction nearest to where it's facing
    const sideways = (x: number, z: number) => {
      const h = Math.atan2(x - a.x, z - a.z);
      a.side = Math.abs(angleDelta(a.yaw, h + Math.PI / 2)) < Math.abs(angleDelta(a.yaw, h - Math.PI / 2)) ? Math.PI / 2 : -Math.PI / 2;
    };
    switch (a.mode) {
      case IDLE:
      case WALK: {
        // scuttle a little way, stop, pick at the sand with alternate claws
        tgt[HP] = tgt[HY] = tgt[LIFT] = 0;
        tgt[SB] = 0;
        a.hidden = false;
        if (a.mode === IDLE) {
          a.want = 0;
          tgt[SA] = Math.max(0, Math.sin(time * 5)) * -0.35;
        } else tgt[SA] = 0;
        const d = this.walk(a, dt);
        this.ground(a);
        if (a.mode === WALK && d < 0.15) a.mode = IDLE;
        if (a.t < 0) {
          a.t = rand(1, night ? 2.5 : 4);
          if (!night && Math.random() < 0.06) {
            a.mode = DOWN;
            a.t = rand(0.5, 0.8);
            break;
          }
          a.mode = WALK;
          this.wander(a, night ? 9 : 5, (h) => h > 0.08 && h < 2.5);
          sideways(a.tx, a.tz);
          a.want = sp.walk * rand(0.6, 1.3);
        }
        break;
      }
      case ALERT: {
        // claws up, body raised: come on then
        a.want = 0;
        a.side = 0;
        this.faceTo(a, a.fx, a.fz, dt, 8);
        tgt[SA] = -1.0;
        tgt[LIFT] = 0.025;
        tgt[SB] = 0;
        this.walk(a, dt);
        this.ground(a);
        if (a.t < 0) {
          a.mode = IDLE;
          a.t = rand(1, 3);
        }
        break;
      }
      case FLEE: {
        sideways(a.tx, a.tz);
        tgt[SA] = -0.3;
        tgt[LIFT] = 0.015;
        a.want = sp.run;
        this.walk(a, dt);
        this.ground(a);
        if (a.t < 0) {
          a.mode = DOWN;
          a.t = 0.5;
        }
        break;
      }
      case DOWN: {
        // into the burrow, sand spraying
        a.want = 0;
        a.speed = 0;
        tgt[LIFT] = -0.2;
        tgt[SB] = 1.3;
        tgt[SA] = 0.4;
        a.gait += dt * 30;
        tgt[STRIDE] = 0.5;
        if (Math.random() < dt * 8) this.dust(a.x, a.y, a.z, 1, 0.12);
        this.ground(a);
        if (a.t < 0) {
          a.mode = HIDE;
          a.hidden = true;
          a.t = rand(5, 14);
        }
        break;
      }
      case HIDE: {
        if (a.t < 0) {
          if (a.fear > 0.2 || (th.t && th.d < sp.wary * 1.6)) a.t = rand(2, 5);
          else {
            // eyes up out of the sand first, then the rest
            a.mode = SHOW;
            a.hidden = false;
            a.t = 1.6;
            a.cur[LIFT] = -0.17;
          }
        }
        break;
      }
      case SHOW: {
        tgt[LIFT] = a.t > 0.9 ? -0.09 : 0;
        tgt[SB] = 0;
        a.quick = 0.6;
        this.ground(a);
        if (a.t < 0) {
          a.mode = IDLE;
          a.t = rand(0.5, 2);
        }
        break;
      }
    }
  }

  private butterfly(a: Beast, dt: number) {
    const sp = SPECIES[a.k];
    const th = this.threat(a, sp.wary);
    const tgt = a.tgt;
    const time = this.time + a.seed;
    const away = this.env.night > 0.45 || this.env.rain > 0.3 || this.env.storm > 0.3;
    a.t -= dt;
    a.fear *= 1 - damp(1, dt);
    a.hidden = away;
    if (away) return;
    if (a.fear > 0.4 && a.mode === PERCH) {
      a.mode = FLY;
      a.t = rand(1, 2);
      a.ty = a.y + 1.5;
    }
    switch (a.mode) {
      case FLY: {
        // the erratic, bobbing flutter
        a.clock -= dt;
        if (a.clock < 0) {
          a.clock = rand(0.6, 1.8);
          const lead = a.lead && Math.random() < 0.5 ? a.lead : null;
          const ang = Math.random() * TAU;
          const r = rand(0.5, 3.5);
          const cx = lead ? lead.x : a.home.x;
          const cz = lead ? lead.z : a.home.z;
          a.tx = cx + Math.cos(ang) * r * (lead ? 0.3 : 1);
          a.tz = cz + Math.sin(ang) * r * (lead ? 0.3 : 1);
          a.ty = Math.max(this.h(a.tx, a.tz), 0) + rand(0.4, 1.8);
          if (a.fear > 0.3) {
            a.ty += 2;
            a.tx += (a.x - a.fx) * 0.5;
            a.tz += (a.z - a.fz) * 0.5;
          }
        }
        this.fly(a, dt, 1.6 + a.fear * 2, 3, 0.3);
        a.y += Math.sin(time * 9) * dt * 1.2;
        a.yaw += Math.sin(time * 3.7) * dt * 2;
        tgt[ROLL] = Math.sin(time * 5) * 0.3;
        tgt[PITCH] = -0.2;
        tgt[FLAP] = 1.15;
        tgt[SB] = 0.1;
        a.flapHz = 8.5;
        tgt[FOLD] = 0;
        if (a.t < 0 && a.fear < 0.2 && a.pop.flowers.length) {
          const f = this.spotNear(a.pop.flowers, a.home.x, a.home.z, 6);
          if (f) {
            a.mode = LAND;
            a.tx = f.x + rand(-0.15, 0.15);
            a.ty = f.y;
            a.tz = f.z + rand(-0.15, 0.15);
          }
          a.t = rand(2, 5);
        }
        break;
      }
      case LAND: {
        this.fly(a, dt, 1.3, 4, -5);
        a.flapHz = 8;
        tgt[FLAP] = 1.1;
        if (Math.hypot(a.tx - a.x, a.ty - a.y, a.tz - a.z) < 0.08) {
          a.mode = PERCH;
          a.t = rand(3, 9);
          a.vx = a.vy = a.vz = 0;
        }
        if (a.t < -6) a.mode = FLY;
        break;
      }
      case PERCH: {
        // sat on a flower, wings slowly opening and closing in the sun
        a.speed = 0;
        tgt[ROLL] = tgt[PITCH] = 0;
        tgt[FLAP] = 0.65;
        tgt[SB] = 0.72;
        a.flapHz = 0.35;
        if (th.t && th.d < sp.wary) a.fear = 0.6;
        if (a.t < 0) {
          a.mode = FLY;
          a.t = rand(3, 8);
        }
        break;
      }
    }
  }

  private hummer(a: Beast, dt: number, walkers: Walkerish[]) {
    const tgt = a.tgt;
    const time = this.time + a.seed;
    a.hidden = this.env.night > 0.45 || this.env.storm > 0.4;
    if (a.hidden) return;
    a.t -= dt;
    a.fear *= 1 - damp(1, dt);
    const blooms = a.pop.blooms;
    if (a.fear > 0.5 && a.mode !== FLY) {
      a.mode = FLY;
      a.t = 0;
    }
    switch (a.mode) {
      case HOVER: {
        // at a flower: body upright, bill in the bloom, wings a blur, little backing-off and darting in
        this.fly(a, dt, 2, 6, -5);
        tgt[PITCH] = -0.6;
        tgt[ROLL] = 0;
        tgt[SB] = 0.3;
        tgt[TAILW] = Math.sin(time * 3) * 0.2;
        this.faceTo(a, a.ox, a.oz, dt, 8);
        if (Math.random() < dt * 0.4) this.call(a, 'chip', 1 + ((Math.random() * 2) | 0));
        // someone standing near on foot: come and have a look at them
        for (const wk of walkers) {
          const d = Math.hypot(wk.x - a.x, wk.z - a.z);
          if (d < 9 && d > 2 && Math.random() < dt * 0.08) {
            a.mode = CURIOUS;
            a.t = rand(2.2, 3.4);
            a.lead = null;
            a.mate = null;
            a.clock = walkers.indexOf(wk);
          }
        }
        if (a.t < 0) {
          a.mode = FLY;
          a.t = 0;
        }
        break;
      }
      case CURIOUS: {
        // hums up to the captain's face and hangs there, looking
        const wk = walkers[a.clock];
        if (!wk) {
          a.mode = FLY;
          break;
        }
        const fx = Math.sin(wk.yaw);
        const fz = Math.cos(wk.yaw);
        a.tx = wk.x + fx * 0.85;
        a.tz = wk.z + fz * 0.85;
        a.ty = wk.y + 1.6 + Math.sin(time * 2.5) * 0.06;
        this.fly(a, dt, 6, 4, -5);
        this.faceTo(a, wk.x, wk.z, dt, 8);
        tgt[PITCH] = -0.55;
        tgt[ROLL] = 0;
        tgt[HY] = Math.sin(time * 1.7) * 0.5;
        if (Math.random() < dt * 1.5) this.call(a, 'chip', 1);
        if (a.t < 0) {
          a.mode = FLY;
          a.t = 0;
        }
        break;
      }
      case FLY:
      default: {
        // darting from bloom to bloom
        if (a.mode !== FLY) a.mode = FLY;
        if (a.t <= 0) {
          a.t = 4;
          const b = blooms.length ? this.spotNear(blooms, a.home.x, a.home.z, 25) ?? pick(blooms) : a.home;
          const ang = Math.random() * TAU;
          a.ox = b.x;
          a.oz = b.z;
          a.tx = b.x + Math.cos(ang) * 0.45 * 1.2;
          a.tz = b.z + Math.sin(ang) * 0.45 * 1.2;
          a.ty = b.y + rand(-0.1, 0.2);
          if (a.fear > 0.3) {
            a.tx = a.x + (a.x - a.fx) * 2;
            a.tz = a.z + (a.z - a.fz) * 2;
            a.ty = a.y + 3;
          }
        }
        const d = this.fly(a, dt, 9, 5, 0.4);
        tgt[PITCH] = 0.1;
        if (d < 0.2) {
          a.mode = HOVER;
          a.t = rand(1.5, 4);
          a.vx = a.vy = a.vz = 0;
        }
        if (a.t < -4) a.t = 0;
        break;
      }
    }
    // the wings beat too fast to see: a different blur of a stroke every frame
    tgt[FOLD] = 0;
    tgt[FLAP] = 1.05;
    a.flapPh += 2.3 + Math.random() * 1.2;
    a.flapHz = 0;
    a.cur[FLAP] = 1.05;
  }

  // ---------------------------------------------------------------- the frame

  update(dt: number, w: World, ships: Ship[], cam: THREE.PerspectiveCamera, focus: THREE.Vector3, walkers: Walkerish[], env: WildEnv, pxK: number) {
    this.w = w;
    this.env = env;
    this.builtThisFrame = false;
    // which isles are alive
    this.active.length = 0;
    for (const p of this.pops) {
      const dc = Math.hypot(p.isl.x - cam.position.x, p.isl.z - cam.position.z) - p.ext;
      const df = Math.hypot(p.isl.x - focus.x, p.isl.z - focus.z) - p.ext;
      if (Math.min(dc, df) > ACTIVE) continue;
      if (!p.built) {
        // one survey a frame at most
        if (this.builtThisFrame) continue;
        this.builtThisFrame = true;
        this.build(p);
      }
      this.active.push(p);
    }
    if (dt > 0 && this.active.length) this.step(Math.min(dt, 0.1), ships, walkers);
    this.pack(cam, pxK);
  }

  private step(dt: number, ships: Ship[], walkers: Walkerish[]) {
    this.time += dt;
    this.calls = 0;
    // the guns (and a magazine going up): every beast for a long way round startles
    for (const s of ships) {
      let last = -100;
      for (const t of s.gunFiredAt) if (t > last) last = t;
      const seen = this.gunsSeen.get(s) ?? -100;
      if (last > seen) {
        this.gunsSeen.set(s, last);
        this.scare(s.pos.x, s.pos.z, 260, 1.05);
      }
      if (!s.alive && !this.dead.has(s)) {
        this.dead.add(s);
        this.scare(s.pos.x, s.pos.z, 360, 1.1);
      }
    }
    // who's about: people on foot (running doubles their menace) and hulls close inshore
    this.threats.length = 0;
    for (const wk of walkers) {
      const sp = Math.hypot(wk.vx, wk.vz);
      let st = this.stillT.get(wk);
      if (!st) this.stillT.set(wk, (st = { x: wk.x, z: wk.z, t: 0 }));
      st.t = sp < 0.3 ? st.t + dt : 0;
      // a captain who stands quietly is less of a fright
      const k = sp > 3.2 ? 1.75 : sp > 0.4 ? 1 : st.t > 4 ? 0.55 : 0.8;
      this.threats.push({ x: wk.x, z: wk.z, y: wk.y, k, pad: 0, still: st.t, yaw: wk.yaw });
    }
    for (const s of ships) {
      if (!s.alive || !s.root.visible) continue;
      this.threats.push({ x: s.pos.x, z: s.pos.z, y: 0, k: 1.1, pad: s.cls.length * 0.5, still: 0, yaw: s.heading });
    }

    for (const p of this.active) {
      for (const a of p.beasts) {
        a.quick = 1;
        switch (a.k) {
          case GOAT:
          case DEER:
          case BOAR:
            this.grazer(a, dt);
            break;
          case MONKEY:
            this.monkey(a, dt);
            break;
          case MACAW:
          case PELICAN:
          case BOOBY:
          case FLAMINGO:
          case EGRET:
            this.bird(a, dt);
            break;
          case IGUANA:
            this.iguana(a, dt);
            break;
          case TORTOISE:
            this.tortoise(a, dt);
            break;
          case SEAL:
            this.seal(a, dt);
            break;
          case CRAB:
            this.crab(a, dt);
            break;
          case BUTTERFLY:
            this.butterfly(a, dt);
            break;
          case HUMMER:
            this.hummer(a, dt, walkers);
            break;
        }
        // ease the pose toward this frame's wishes
        const c = a.cur;
        const t = a.tgt;
        for (let i = 0; i < NP; i++) {
          if (i === LIFT && a.jump > 0) continue;
          c[i] = lerp(c[i], t[i], damp(RATE[i] * a.quick, dt));
        }
        a.flapPh += a.flapHz * TAU * dt;
      }
    }
  }

  /** Packs the beasts in view into their meshes, nearest-first doesn't matter: they're opaque. */
  private pack(cam: THREE.PerspectiveCamera, pxK: number) {
    _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _fr.setFromProjectionMatrix(_pm);
    for (const list of this.meshes) for (const m of list) m.n = 0;
    for (const p of this.active) {
      for (const a of p.beasts) {
        if (a.hidden) continue;
        const sp = SPECIES[a.k];
        const size = sp.size * a.s;
        _sph.center.set(a.x, a.y + size * 0.4, a.z);
        _sph.radius = size * (sp.shadow ? 1.6 : 0.8);
        const d = _sph.center.distanceTo(cam.position);
        if (d * MIN_PX > size * pxK || !_fr.intersectsSphere(_sph)) continue;
        const m = this.meshes[a.k][a.geo];
        if (m.n >= sp.max) continue;
        const i = m.n++;
        const c = a.cur;
        m.a.setXYZW(i, a.gait, c[STRIDE], c[HP], c[HY]);
        m.b.setXYZW(i, a.flapPh, c[FLAP], c[FOLD], c[TAILW]);
        m.c.setXYZW(i, c[SA], c[SB], c[TUCK], a.shade);
        // the body pitches about its hips
        const yaw = a.yaw + (a.k === IGUANA && a.speed > 0.05 ? Math.sin(a.gait) * 0.14 : 0);
        _e.set(c[PITCH] + a.slope, yaw, c[ROLL]);
        _q.setFromEuler(_e);
        _qy.setFromAxisAngle(_Y, yaw);
        _h1.set(0, sp.hip[0] * a.s, sp.hip[1] * a.s).applyQuaternion(_qy);
        _h2.set(0, sp.hip[0] * a.s, sp.hip[1] * a.s).applyQuaternion(_q);
        _v.set(a.x, a.y + c[LIFT] * a.s, a.z).add(_h1).sub(_h2);
        _sc.setScalar(a.s);
        _m.compose(_v, _q, _sc);
        m.mesh.setMatrixAt(i, _m);
        // close enough for a proper look: a new kind of beast for the log
        if (!this.seen.has(a.k) && d < 12 + size * 18) this.spot(a.k);
      }
    }
    for (const list of this.meshes) {
      for (const m of list) {
        m.mesh.count = m.n;
        m.mesh.visible = m.n > 0;
        if (m.n) {
          m.mesh.instanceMatrix.needsUpdate = true;
          m.a.needsUpdate = m.b.needsUpdate = m.c.needsUpdate = true;
        }
      }
    }
  }

  private spot(k: number) {
    this.seen.add(k);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...this.seen]));
    } catch {
      /* not remembered */
    }
    this.onSpot(SPECIES[k].name, this.seen.size, SPECIES.length);
  }
}
