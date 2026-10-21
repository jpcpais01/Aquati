import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, lerp, smoothstep } from '../core/noise';
import { patchInfo, patchMaterial } from '../render/environment';
import { disposeLevel, simplifiedLevels, type LodJob } from '../render/lod';
import { shadowOnly } from '../render/passCull';
import { Livery, ShipClass } from './shipTypes';
import type { SkinItem } from './cosmetics';
import { loadoutParts, type Part, type PartSlot } from './parts';
import { buildHullPart, buildSailPart, GLOW, gunBarrel, METAL, type MastInfo, type PartKit, type Spinner } from './partModels';
import { ball, colorize, hexL, lathe, rbox, spar, spiral, squareRing, surfaceMatrix, sweep, tube } from './geo';
import { bowHead, buildFigure, buildKnee, type BowHead } from './figureheads';
import { deckTextures, FLAG_ASPECT, flagTexture, hullTextures, sailNormalTexture, sailTexture, sternTexture } from './shipTextures';

// Fully procedural ships: a lofted hull with real sheer, tumblehome, bilge
// and stem; castles that sweep up out of the sheer; a rounded wale, keel and
// gilded mouldings; caulked, relief-mapped planking; stepped masts with caps,
// tops, channels, chainplates, ratlines, footropes and lifts; braced yards
// and billowing canvas; carriage guns on their tackles run out through framed
// gunports; pin rails, fife rails, gratings, binnacle, bell and skylight; a
// carved figurehead, quarter pieces, rudder and a stern ensign. Everything is
// softly rounded for a crafted, toy-like feel, and merged into a handful of
// indexed meshes. Local frame: +Z bow, +Y up, +X port, waterline at y = 0.
//
// Detail comes in three tiers. The core meshes cast shadows; small parts
// (bolts, bands, pins, coils) draw in their own buckets without a shadow
// pass; and a near-only "fine" layer (laid rope tubes in place of hairlines,
// lanyards, wooldings, gun-carriage ironwork, swivel guns, buckets, a chest
// and the ship's cat) is switched on by updateDetail() only once the ship is
// big enough on screen, when the hairline rigging is hidden in its place.

/** Fraction of the sheer height where the painted wale tops out. */
const WALE_TOP = (0.705 - 0.3) / 0.7;

export class HullShape {
  constructor(readonly c: ShipClass) {}

  z(t: number) {
    return (t - 0.5) * this.c.length;
  }

  halfBeam(t: number) {
    const B = this.c.beam / 2;
    const mid = 0.43;
    if (t < mid) {
      const u = t / mid;
      return B * (this.c.transom + (1 - this.c.transom) * Math.pow(Math.sin((u * Math.PI) / 2), 0.75));
    }
    const u = (t - mid) / (1 - mid);
    // a touch fuller and rounder in the bow than a racing hull
    return B * Math.pow(Math.max(1 - Math.pow(u, 2.5), 0), 0.56);
  }

  sheer(t: number) {
    const c = this.c;
    const fb = Math.max(0, (t - 0.5) / 0.5);
    const st = Math.max(0, (0.5 - t) / 0.5);
    return c.freeboard + c.sheerBow * fb * fb + c.sheerStern * st * st;
  }

  sternMask(t: number) {
    const sc = this.c.sternCastle;
    // full height over the whole castle deck, then a long soft sweep down into the waist
    return sc ? 1 - smoothstep(sc.t + 0.004, sc.t + 0.075, t) : 0;
  }

  foreMask(t: number) {
    const fc = this.c.foreCastle;
    return fc ? smoothstep(fc.t - 0.07, fc.t - 0.004, t) : 0;
  }

  top(t: number) {
    return this.sheer(t) + (this.c.sternCastle?.h ?? 0) * this.sternMask(t) + (this.c.foreCastle?.h ?? 0) * this.foreMask(t);
  }

  /** Stepped deck height (castles are discrete levels). */
  deckY(t: number) {
    const c = this.c;
    let y = this.sheer(t) - c.bulwark;
    if (c.sternCastle && t < c.sternCastle.t) y += c.sternCastle.h;
    if (c.foreCastle && t > c.foreCastle.t) y += c.foreCastle.h;
    return y;
  }

  mainDeckY(t: number) {
    return this.sheer(t) - this.c.bulwark;
  }

  bottom(t: number) {
    const d = this.c.draft;
    const stern = -d * (0.78 + 0.22 * smoothstep(0, 0.2, t));
    const bowT = Math.pow(smoothstep(0.72, 1.0, t), 1.5);
    return lerp(stern, this.top(t) * 0.3, bowT);
  }

  private exponent(t: number) {
    const bell = 1 - Math.pow(Math.abs(2 * t - 1), 1.4);
    return lerp(t > 0.5 ? 1.45 : 2.0, 2.55, bell);
  }

  /** Point on the section at fraction v (0 keel .. 1 rail). Returns [halfWidth, y]. */
  section(t: number, v: number): [number, number] {
    const b = this.bottom(t);
    const tp = this.top(t);
    const y = b + (tp - b) * v;
    const w = this.halfBeam(t);
    const vW = clamp((0 - b) / (tp - b), 0.05, 0.92);
    const n = this.exponent(t);
    let x: number;
    if (v < vW) {
      const q = v / vW;
      x = w * Math.pow(Math.max(0, 1 - Math.pow(1 - q, n)), 1 / n);
    } else {
      const q = (v - vW) / (1 - vW);
      x = w * (1 - this.c.tumblehome * Math.pow(q, 1.6));
    }
    return [x, y];
  }

  halfWidthAtY(t: number, y: number) {
    const b = this.bottom(t);
    const tp = this.top(t);
    return this.section(t, clamp((y - b) / (tp - b), 0, 1))[0];
  }

  /** Painted hull row for a height. The bands up to the wale follow the sheer;
   *  the strake above stretches up over the castles so the wale runs level. */
  texV(t: number, y: number) {
    if (y <= 0) return 0.3 * clamp(1 + y / this.c.draft, 0, 1);
    const sh = this.sheer(t);
    const ys = sh * WALE_TOP;
    if (y <= ys) return 0.3 + 0.7 * (y / sh);
    return 0.705 + 0.295 * clamp((y - ys) / Math.max(0.1, this.top(t) - ys), 0, 1);
  }

  /** Inverse of texV above the waterline. */
  yAtV(t: number, v: number) {
    const sh = this.sheer(t);
    const ys = sh * WALE_TOP;
    if (v <= 0.705) return ((v - 0.3) / 0.7) * sh;
    return ys + ((v - 0.705) / 0.295) * (this.top(t) - ys);
  }

  waleY(t: number) {
    return this.yAtV(t, 0.6825);
  }

  /** Outward unit normal of the skin at (t, y) on a side (+1 port, -1 starboard). */
  skinNormal(t: number, y: number, side: number) {
    const e = 0.004;
    const ey = 0.06;
    const fy = (this.halfWidthAtY(t, y + ey) - this.halfWidthAtY(t, y - ey)) / (2 * ey);
    const fz = (this.halfWidthAtY(clamp(t + e, 0, 1), y) - this.halfWidthAtY(clamp(t - e, 0, 1), y)) / (2 * e * this.c.length);
    return new THREE.Vector3(side, -fy, -fz).normalize();
  }

  skinPoint(t: number, y: number, side: number, out = 0) {
    return new THREE.Vector3(side * (this.halfWidthAtY(t, y) + out), y, this.z(t));
  }
}

export interface Muzzle {
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  side: number; // +1 port, -1 starboard
}

/** A companion stair from the waist up to a castle deck, in ship-local space. */
export interface Stair {
  x: number; // centre line of the flight
  w: number; // width
  z0: number; // foot, on the main deck
  z1: number; // head, flush with the castle deck at its bulkhead
  y0: number;
  y1: number;
}

/** Two flights flanking each castle door. Shared by the model, the crew and the captain's walk. */
export function castleStairs(c: ShipClass, s: HullShape): Stair[] {
  const out: Stair[] = [];
  const w = 0.55 + c.beam * 0.02;
  const add = (t: number, h: number, facing: number) => {
    const zw = s.z(t) + facing * 0.1;
    const run = h * 0.95;
    const y1 = s.sheer(t) + h - c.bulwark;
    const z0 = zw + facing * run;
    const y0 = s.mainDeckY(t + (facing * run) / c.length);
    for (const side of [1, -1]) out.push({ x: side * (0.5 + w / 2), w, z0, z1: zw, y0, y1 });
  };
  if (c.sternCastle) add(c.sternCastle.t, c.sternCastle.h, 1);
  if (c.foreCastle) add(c.foreCastle.t, c.foreCastle.h, -1);
  return out;
}

export interface SailRef {
  mesh: THREE.Mesh;
  tier: number;
}

interface MaterialSet {
  hull: THREE.MeshStandardMaterial;
  stern: THREE.MeshStandardMaterial;
  deck: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  iron: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
  flag: THREE.MeshStandardMaterial;
  rope: THREE.LineBasicMaterial;
  ratline: THREE.LineBasicMaterial;
  sailPlain: THREE.Texture;
  sailEmblem: THREE.Texture;
}

const materialCache = new Map<string, MaterialSet>();

/** The vault skin a ship wears, fed to its hull, woodwork and sail shaders. */
export type SkinUniforms = ReturnType<typeof makeSkinUniforms>;

function makeSkinUniforms() {
  return {
    uSkin: { value: 0 },
    uSkinA: { value: new THREE.Color() },
    uSkinB: { value: new THREE.Color() },
    uSkinC: { value: new THREE.Color() },
    uSkinP: { value: new THREE.Vector4(1, 1, 0, 0) },
    uSkinCloth: { value: new THREE.Color(1, 1, 1) },
    /** Upgrade sails: x the cloth's pattern (0 = standard canvas), w a seed. */
    uPartSail: { value: new THREE.Vector4(0, 0, 0, 0) },
  };
}

/** A ghost material's presence before a ship takes it over (her damage skin carries her own). */
const GHOST_IDLE = { value: new THREE.Vector4(1, 0, 0, 0) };

/** Shared by every ship that can never wear a skin (the pirates' cached paint). */
const NO_SKIN = makeSkinUniforms();

/** Marks a painted woodwork part as one the skin covers (see AQ_SKIN 2). */
function skinned(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const c = g.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < c.count; i++) c.setZ(i, c.getZ(i) + 4);
  return g;
}
let sharedDeck: { map: THREE.Texture; normal: THREE.Texture } | null = null;

/** Keeps only the attributes a merged bucket shares and makes sure it's indexed. */
function prepPart(g: THREE.BufferGeometry, keepColor: boolean): THREE.BufferGeometry {
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && !(keepColor && name === 'color')) g.deleteAttribute(name);
  }
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.index) g.setIndex(Array.from({ length: g.getAttribute('position').count }, (_, i) => i));
  return g;
}

function mergeParts(parts: THREE.BufferGeometry[], keepColor: boolean): THREE.BufferGeometry | null {
  if (!parts.length) return null;
  return mergeGeometries(parts.map((p) => prepPart(p, keepColor)));
}

function sailGeometry(tl: THREE.Vector2, tr: THREE.Vector2, bl: THREE.Vector2, br: THREE.Vector2, billow: number): THREE.BufferGeometry {
  const nu = 10;
  const nv = 7;
  const pos: number[] = [];
  const uv: number[] = [];
  const bil: number[] = [];
  const nrm: number[] = [];
  for (let j = 0; j <= nv; j++) {
    const v = j / nv; // 0 top .. 1 bottom
    const l = tl.clone().lerp(bl, v);
    const r = tr.clone().lerp(br, v);
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const p = l.clone().lerp(r, u);
      // a slight concave roach on the foot for elegance
      if (j === nv) p.y += Math.sin(u * Math.PI) * 0.12 * billow;
      pos.push(p.x, p.y, 0);
      uv.push(u, 1 - v);
      bil.push(billow);
      nrm.push(0, 0, 1);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      const b = a + 1;
      const c = a + nu + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aBillow', new THREE.Float32BufferAttribute(bil, 1));
  g.setIndex(idx);
  return g;
}

/** One length of rope for the close-range rigging: end to end, how thick, its colour and how much it sags. */
interface RopeSpec {
  a: THREE.Vector3;
  b: THREE.Vector3;
  r: number;
  col: THREE.Color;
  sag: number;
  radial: number;
}

const TAR = hexL(0x2a1f16);
const HEMP = hexL(0x8c7150);

/**
 * Every rope as its own little tube, all in one indexed geometry. Each vertex
 * carries the rope it belongs to (aRope), so a falling mast can take whole
 * ropes away with it rather than slicing them (see filterRopes).
 */
function ropeGeometry(specs: RopeSpec[]): THREE.BufferGeometry | null {
  if (!specs.length) return null;
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const rid: number[] = [];
  const idx: number[] = [];
  const d = new THREE.Vector3();
  const u = new THREE.Vector3();
  const v = new THREE.Vector3();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  specs.forEach((s, k) => {
    const len = s.a.distanceTo(s.b);
    if (len < 1e-3) return;
    d.subVectors(s.b, s.a).divideScalar(len);
    u.set(0, 1, 0).cross(d);
    if (u.lengthSq() < 1e-4) u.set(1, 0, 0).cross(d);
    u.normalize();
    v.crossVectors(d, u);
    const segs = s.sag > 0 && len > 4 ? 4 : 1;
    const R = s.radial;
    const base = pos.length / 3;
    const jit = 0.9 + Math.random() * 0.2;
    for (let i = 0; i <= segs; i++) {
      const f = i / segs;
      p.lerpVectors(s.a, s.b, f);
      p.y -= 4 * f * (1 - f) * s.sag;
      for (let j = 0; j < R; j++) {
        const a = (j / R) * Math.PI * 2;
        n.copy(u).multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a));
        pos.push(p.x + n.x * s.r, p.y + n.y * s.r, p.z + n.z * s.r);
        nrm.push(n.x, n.y, n.z);
        col.push(s.col.r * jit, s.col.g * jit, s.col.b * jit);
        rid.push(k);
      }
    }
    for (let i = 0; i < segs; i++) {
      for (let j = 0; j < R; j++) {
        const a = base + i * R + j;
        const b = base + i * R + ((j + 1) % R);
        idx.push(a, a + R, b, b, a + R, b + R);
      }
    }
  });
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aRope', new THREE.Float32BufferAttribute(rid, 1));
  g.setIndex(idx);
  return g;
}

/** Pixels per metre (at 1x zoom) above which a ship shows its close-range detail, and below which it drops it again. */
const FINE_ON = 21;
const FINE_OFF = 17;
/**
 * Simplified core meshes: deviation allowed (m) and the pixels per metre
 * below which each level shows. Both stay under about half a pixel on screen,
 * so the swap can't be seen.
 */
const LOD_NEAR = { job: { error: 0.018, prune: true, permissive: true } as LodJob, below: 26 };
const LOD_FAR = { job: { error: 0.07, prune: true, permissive: true } as LodJob, below: 6.5 };
/** The shadow stand-in: welded shape only, held to 5 cm (the shadow map's texels are 6-25 cm). */
const LOD_SHADOW: LodJob = { error: 0.05, weld: true, prune: true, permissive: true };

interface LodSet {
  mesh: THREE.Mesh;
  full: THREE.BufferGeometry;
  near: THREE.BufferGeometry | null;
  far: THREE.BufferGeometry | null;
  /** Coarse twin drawn into the shadow map in the mesh's place. */
  proxy: THREE.Mesh | null;
}
const _spinQ = new THREE.Quaternion();

export class ShipModel {
  readonly root = new THREE.Group();
  readonly shape: HullShape;
  readonly muzzles: Muzzle[] = [];
  readonly sails: SailRef[] = [];
  readonly yardPivots: THREE.Object3D[] = [];
  readonly foreAftPivots: THREE.Object3D[] = [];
  readonly flagPivot = new THREE.Group();
  /** Where a gull can land (hull-root space): mast caps, fighting-top rails, the jib-boom knob. `spar` is the mast index, -1 the bowsprit. */
  readonly perches: { pos: THREE.Vector3; spar: number }[] = [];
  /** The middle of the figurehead (hull-root space), for cameras. */
  readonly figureAt = new THREE.Vector3();
  /** How far forward the figurehead reaches (hull-root z): a shot-away bowsprit leaves everything under it and short of this. */
  figureReach = 0;
  /** Where the knee of the head and its figure go. */
  private readonly head: BowHead;
  /** Ensign on a staff over the taffrail; it flies the same flag. */
  readonly ensignPivot = new THREE.Group();
  readonly sailMaterial: THREE.MeshStandardMaterial;
  readonly sailEmblemMaterial: THREE.MeshStandardMaterial;
  readonly sailUniforms = { uSailFill: { value: 1 }, uSailPhase: { value: Math.random() * 10 }, uSailDepth: { value: 1 } };
  readonly deckPoints: THREE.Vector3[] = [];
  /** Deck furniture the crew walk round (root space, x/z centre and radius). */
  readonly deckProps: { x: number; z: number; r: number }[] = [];
  /** Mouth of the galley stovepipe, for its wisp of smoke. */
  chimney: THREE.Vector3 | null = null;
  readonly stairs: Stair[];
  private woodParts: THREE.BufferGeometry[] = [];
  private ironParts: THREE.BufferGeometry[] = [];
  private trimParts: THREE.BufferGeometry[] = [];
  private glowParts: THREE.BufferGeometry[] = [];
  /** Close-range detail: drawn only when the ship is big on screen, and never into the shadow map. */
  /** Small parts that always show but are too fine for the shadow map to resolve: no shadow pass. */
  private smallWood: THREE.BufferGeometry[] = [];
  private smallIron: THREE.BufferGeometry[] = [];
  private smallTrim: THREE.BufferGeometry[] = [];
  private fineWood: THREE.BufferGeometry[] = [];
  private fineIron: THREE.BufferGeometry[] = [];
  private fineTrim: THREE.BufferGeometry[] = [];
  private mats: MaterialSet;
  private ropes: number[] = [];
  private ratlines: number[] = [];
  /** The same rigging again as laid rope with real thickness, for close views. */
  private ropeTubes: RopeSpec[] = [];
  private readonly fineMeshes: THREE.Mesh[] = [];
  private readonly lineMeshes: THREE.LineSegments[] = [];
  private fineOn = true;
  private readonly detail: boolean;
  private lods: LodSet[] = [];
  /** Off while the damage model is cutting the full meshes (and until the rig is whole again). */
  private lodLive = false;
  private lodLevel = -1;
  /** Meshes still with the simplifier. */
  private lodPending = 0;
  /** The damage model has the full meshes out: no levels until it hands them back. */
  private lodHeld = false;
  private lodGone = false;
  /** Custom liveries own their materials (no cache) and must be disposed. */
  private readonly owned: boolean;
  /**
   * A cached pirate paint dressed in a skin, sails and flag of its own (the
   * named captains): own hull, woodwork and flag materials over the shared
   * textures, so nothing new compiles and only the cloth is repainted.
   */
  private readonly dressed: boolean;
  /** This ship's skin (owned liveries only; everyone else shares NO_SKIN). */
  readonly skinUniforms: SkinUniforms;

  private readonly steps: Generator<void, void>;
  /** Upgrade parts bolted on (player ships, and the odd pirate's prize fitting). */
  readonly parts: Partial<Record<PartSlot, Part>>;
  private masts: MastInfo[] = [];
  private spinnerSpecs: Spinner[] = [];
  /** The parts that move on their own: wards, crystal crowns, a halo. */
  private readonly spinners: { mesh: THREE.Mesh; q0: THREE.Quaternion; p0: THREE.Vector3; axis: THREE.Vector3; spin: number; bob: number; rate: number; phase: number }[] = [];

  /** `deferred` leaves the geometry unbuilt: call step() (a little per frame) until it returns true. */
  constructor(readonly cls: ShipClass, readonly livery: Livery, quality = 1, deferred = false) {
    this.owned = livery.id.startsWith('custom');
    this.parts = loadoutParts(livery.parts);
    this.dressed = !this.owned && !!livery.skin;
    this.skinUniforms = this.owned || this.dressed ? makeSkinUniforms() : NO_SKIN;
    this.skinUniforms.uSkinCloth.value.set(livery.sail);
    if (this.owned) this.skinUniforms.uPartSail.value.set(this.parts.sails ? this.parts.sails.tier + 1 : 0, 0, 0, Math.random() * 10);
    this.detail = quality > 0;
    this.shape = new HullShape(cls);
    this.head = bowHead(this.shape, cls);
    this.stairs = castleStairs(cls, this.shape);
    this.mats = this.materials(quality);
    this.sailMaterial = this.makeSailMaterial(this.mats.sailPlain);
    this.sailEmblemMaterial = this.makeSailMaterial(this.mats.sailEmblem);
    this.steps = this.build();
    if (!deferred) while (!this.step());
  }

  private *build(): Generator<void, void> {
    this.buildHull();
    yield;
    this.buildMouldings();
    this.buildDeck();
    yield;
    yield* this.buildCastleWalls();
    yield;
    yield* this.buildStairs();
    this.buildStern();
    yield;
    this.buildAft();
    yield;
    yield* this.buildCannons();
    yield;
    yield* this.buildRig();
    yield;
    this.buildBow();
    yield;
    yield* this.buildDetails();
    yield;
    this.buildDeckLife();
    yield;
    if (this.cls.cargo) this.buildCargo(this.cls.cargo);
    yield;
    this.buildParts();
    yield;
    yield* this.finish();
  }

  /** Runs the next slice of a deferred build. True once the model is complete. */
  step(): boolean {
    return !!this.steps.next().done;
  }

  /**
   * Every texture a class wears in a livery, painted (once, cached) without
   * building any geometry, so the game can upload them all while it loads.
   */
  static textures(cls: ShipClass, livery: Livery, quality = 1): THREE.Texture[] {
    const m = new ShipModel(cls, livery, quality, true);
    m.sailMaterial.dispose();
    m.sailEmblemMaterial.dispose();
    const s = m.mats;
    return [s.hull.map, s.hull.normalMap, s.stern.map, s.stern.emissiveMap, s.deck.map, s.deck.normalMap, s.flag.map, s.sailPlain, s.sailEmblem, sailNormalTexture()].filter((t): t is THREE.Texture => !!t);
  }

  // ---------------------------------------------------------------- materials

  private cannonTs(): number[] {
    const [a, b] = this.cls.cannonSpan;
    const n = this.cls.cannonsPerSide;
    return Array.from({ length: n }, (_, i) => lerp(a, b, (i + 0.5) / n));
  }

  private cannonY(t: number) {
    return this.shape.mainDeckY(t) + 0.5;
  }

  private materials(quality: number): MaterialSet {
    const base = this.paint(quality);
    return this.dressed ? this.dress(base, quality) : base;
  }

  /** Over the cached paint: this ship's own skinned hull and woodwork, flag and sailcloth. */
  private dress(base: MaterialSet, quality: number): MaterialSet {
    const su = this.skinUniforms;
    const b = base.hull;
    const hullParams = { map: b.map, normalMap: b.normalMap, normalScale: b.normalScale.clone(), roughness: b.roughness, metalness: 0, envMapIntensity: b.envMapIntensity };
    const hull =
      quality > 0
        ? new THREE.MeshPhysicalMaterial({ ...hullParams, clearcoat: 0.55, clearcoatRoughness: 0.28 })
        : new THREE.MeshStandardMaterial(hullParams);
    patchMaterial(hull, { clouds: true, caustics: true, skin: 1 }, su);
    const wood = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66 }), { clouds: true, caustics: true, skin: 2 }, su);
    const flag = patchMaterial(new THREE.MeshStandardMaterial({ map: flagTexture(this.livery), side: THREE.DoubleSide, roughness: 0.8, alphaTest: 0.5 }), { flag: true });
    return { ...base, hull, wood, flag, sailPlain: sailTexture(this.livery, false), sailEmblem: sailTexture(this.livery, true) };
  }

  /** The textures only this ship carries (a dressed captain's cloth and flag), for uploading ahead of the first draw. */
  ownTextures(): THREE.Texture[] {
    if (!this.dressed) return [];
    return [this.mats.flag.map, this.mats.sailPlain, this.mats.sailEmblem].filter((t): t is THREE.Texture => !!t);
  }

  private paint(quality: number): MaterialSet {
    const key = `${this.cls.key ?? this.cls.id}|${this.livery.id}|${quality}`;
    const cached = this.owned ? undefined : materialCache.get(key);
    if (cached) return cached;
    const s = this.shape;
    const L = this.cls.length;
    const ports = this.cannonTs().map((t) => {
      const y = this.cannonY(t);
      return { u: t, v: s.texV(t, y), w: 0.62 / L, h: s.texV(t, y + 0.31) - s.texV(t, y - 0.31) };
    });
    const hullTex = hullTextures(this.livery, ports, L, this.cls.length * 7);
    const hullMap = hullTex.map;
    hullMap.anisotropy = 8;
    const hullParams = { map: hullMap, normalMap: hullTex.normal, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.48, metalness: 0, envMapIntensity: 1.0 };
    const hull =
      quality > 0
        ? new THREE.MeshPhysicalMaterial({ ...hullParams, clearcoat: 0.55, clearcoatRoughness: 0.28 })
        : new THREE.MeshStandardMaterial(hullParams);
    const su = this.owned ? this.skinUniforms : NO_SKIN;
    // a phantom's every surface takes the ghost look (and needs a presence uniform even uncloned)
    const ghost = !!this.livery.ghost;
    const gx: Record<string, THREE.IUniform> = ghost ? { uGhost: GHOST_IDLE } : {};
    patchMaterial(hull, { clouds: true, caustics: true, skin: 1, ghost }, { ...su, ...gx });
    const sternRows = this.cls.sternCastle ? (this.cls.id === 'galleon' ? 3 : 2) : 1;
    const st = sternTexture(this.livery, sternRows);
    const stern = patchMaterial(
      new THREE.MeshStandardMaterial({ map: st.map, emissiveMap: st.emissive, emissive: ghost ? new THREE.Color(0.35, 1.6, 0.9) : new THREE.Color(1, 0.75, 0.4), emissiveIntensity: 1.4, roughness: 0.5 }),
      { clouds: true, ghost },
      gx,
    );
    if (!sharedDeck) sharedDeck = deckTextures();
    const deck = patchMaterial(new THREE.MeshStandardMaterial({ map: sharedDeck.map, normalMap: sharedDeck.normal, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.78 }), { clouds: true, ghost }, gx);
    const wood = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66 }), { clouds: true, caustics: true, skin: 2, ghost }, { ...su, ...gx });
    // metal and gilt carry their colour in the vertex paint, so bronze, gold and blued steel share one material
    const iron = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.75, envMapIntensity: 1.3 }), { clouds: true, ghost }, gx);
    const trim = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.8, envMapIntensity: 1.4 }), { clouds: true, ghost }, gx);
    // lights carry their colour in the vertex paint (warm lamplight by default); a phantom tints it to a cold corpse-light
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true, color: ghost ? new THREE.Color(0.14, 1, 1.36) : 0xffffff });
    const flag = patchMaterial(new THREE.MeshStandardMaterial({ map: flagTexture(this.livery), side: THREE.DoubleSide, roughness: 0.8, alphaTest: 0.5 }), { flag: true, ghost }, gx);
    const rope = new THREE.LineBasicMaterial({ color: ghost ? 0x6fae94 : 0x2a1f16, transparent: true, opacity: ghost ? 0.5 : 0.75 });
    const ratline = new THREE.LineBasicMaterial({ color: ghost ? 0x6fae94 : 0x2a1f16, transparent: true, opacity: ghost ? 0.26 : 0.38 });
    const set: MaterialSet = {
      hull,
      stern,
      deck,
      wood,
      iron,
      trim,
      glow,
      flag,
      rope,
      ratline,
      sailPlain: sailTexture(this.livery, false),
      sailEmblem: sailTexture(this.livery, true),
    };
    if (!this.owned) materialCache.set(key, set);
    return set;
  }

  private makeSailMaterial(map: THREE.Texture) {
    const m = new THREE.MeshStandardMaterial({ map, normalMap: sailNormalTexture(), normalScale: new THREE.Vector2(0.45, 0.45), side: THREE.DoubleSide, roughness: 0.92, envMapIntensity: 0.9 });
    const ghost = !!this.livery.ghost;
    return patchMaterial(m, { sail: true, clouds: true, skin: 3, ghost }, { ...this.sailUniforms, ...this.skinUniforms, ...(ghost ? { uGhost: GHOST_IDLE } : {}) });
  }

  // ---------------------------------------------------------------- hull

  private tSamples(n: number): number[] {
    return Array.from({ length: n + 1 }, (_, k) => 0.5 - 0.5 * Math.cos((k / n) * Math.PI));
  }

  private buildHull() {
    const s = this.shape;
    const ts = this.tSamples(64);
    const M = 14;
    const vs = Array.from({ length: M }, (_, k) => {
      const q = k / (M - 1);
      return q * q * (3 - 2 * q) * 0.35 + q * 0.65;
    });
    const ringN = M * 2 - 1;
    const pos: number[] = [];
    const uv: number[] = [];
    for (const t of ts) {
      const z = s.z(t);
      for (let k = 0; k < ringN; k++) {
        const side = k < M - 1 ? -1 : 1;
        const vi = k < M - 1 ? M - 1 - k : k - (M - 1);
        const [x, y] = s.section(t, vs[vi]);
        pos.push(side * x, y, z);
        uv.push(t, s.texV(t, y));
      }
    }
    const idx: number[] = [];
    for (let r = 0; r < ts.length - 1; r++) {
      for (let k = 0; k < ringN - 1; k++) {
        const a = r * ringN + k;
        const b = a + 1;
        const c = a + ringN;
        const d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const hull = new THREE.Mesh(g, this.mats.hull);
    hull.castShadow = true;
    hull.receiveShadow = true;
    this.root.add(hull);

    // transom: a gently bulged counter, flat only where it meets the hull ring
    const t0 = ts[0];
    const z0 = s.z(t0) - 0.02;
    const b0 = s.bottom(t0);
    const top0 = s.top(t0);
    const w0 = s.halfBeam(t0);
    const bulge = this.cls.beam * 0.05;
    const NC = 10;
    const tp: number[] = [];
    const tuv: number[] = [];
    for (let vi = 0; vi < M; vi++) {
      const [x, y] = s.section(t0, vs[vi]);
      const h = clamp((y - b0) / (top0 - b0), 0, 1);
      for (let c = 0; c <= NC; c++) {
        const u = (c / NC) * 2 - 1;
        tp.push(u * x, y, z0 - bulge * (1 - u * u) * Math.pow(Math.sin(Math.PI * h), 0.6));
        tuv.push(0.5 + (u * x) / (2.2 * w0), h);
      }
    }
    const tidx: number[] = [];
    for (let r = 0; r < M - 1; r++) {
      for (let c = 0; c < NC; c++) {
        const a = r * (NC + 1) + c;
        const b = a + 1;
        const d = a + NC + 1;
        const e = d + 1;
        tidx.push(a, d, b, b, d, e);
      }
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
    tg.setAttribute('uv', new THREE.Float32BufferAttribute(tuv, 2));
    tg.setIndex(tidx);
    tg.computeVertexNormals();
    const transom = new THREE.Mesh(tg, this.mats.stern);
    transom.castShadow = true;
    this.root.add(transom);

    // inner bulwark walls + rounded rail cap
    const wallCol = hexL(this.livery.strake).multiplyScalar(0.8);
    const inner: number[] = [];
    const innerCol: number[] = [];
    const its = ts.filter((t) => t > 0.004 && t < 0.985);
    for (const t of its) {
      const z = s.z(t);
      const y0 = s.mainDeckY(t) - 0.05;
      const y1 = s.top(t) - 0.02;
      const x0 = s.halfWidthAtY(t, y0) - 0.13;
      const x1 = s.halfWidthAtY(t, y1) - 0.13;
      inner.push(x0, y0, z, x1, y1, z, -x0, y0, z, -x1, y1, z);
      for (let q = 0; q < 4; q++) innerCol.push(wallCol.r, wallCol.g, wallCol.b);
    }
    const iidx: number[] = [];
    for (let r = 0; r < its.length - 1; r++) {
      const a = r * 4;
      const n = a + 4;
      // port wall faces -x (inward), starboard faces +x
      iidx.push(a, n, a + 1, a + 1, n, n + 1);
      iidx.push(a + 2, a + 3, n + 2, a + 3, n + 3, n + 2);
    }
    const ig = new THREE.BufferGeometry();
    ig.setAttribute('position', new THREE.Float32BufferAttribute(inner, 3));
    ig.setAttribute('color', new THREE.Float32BufferAttribute(innerCol, 3));
    ig.setIndex(iidx);
    ig.computeVertexNormals();
    this.woodParts.push(skinned(ig));

    // frames standing proud of the inner bulwark, and a capping plank along the deck edge
    const frameCol = hexL(this.livery.hull).multiplyScalar(0.95);
    const guns = this.cannonTs().map((t) => s.z(t));
    const castleEdges = [this.cls.sternCastle?.t, this.cls.foreCastle?.t].filter((t): t is number => t !== undefined);
    const step = this.detail ? 0.95 : 1.4;
    for (let z = s.z(0.03); z < s.z(0.95); z += step) {
      const t = z / this.cls.length + 0.5;
      if (guns.some((gz) => Math.abs(gz - z) < 0.5)) continue;
      if (castleEdges.some((ct) => Math.abs(ct - t) * this.cls.length < 0.55)) continue;
      const y0 = s.deckY(t);
      const y1 = s.top(t) - 0.04;
      if (y1 - y0 < 0.3) continue;
      for (const side of [1, -1]) {
        const x0 = s.halfWidthAtY(t, y0) - 0.13;
        const x1 = s.halfWidthAtY(t, y1) - 0.13;
        const st = spar(new THREE.Vector3(side * (x0 - 0.06), y0, z), new THREE.Vector3(side * (x1 - 0.06), y1, z), 0.07, 0.06, 4);
        this.smallWood.push(colorize(st, frameCol));
      }
    }

    // rail: one closed loop around the sheer
    const pts: THREE.Vector3[] = [];
    const railTs = this.tSamples(40).filter((t) => t > 0.003 && t < 0.997);
    for (const t of railTs) pts.push(new THREE.Vector3(-(s.halfWidthAtY(t, s.top(t)) - 0.065), s.top(t) + 0.03, s.z(t)));
    pts.push(new THREE.Vector3(0, s.top(1) + 0.03, s.z(1) + 0.05));
    for (let i = railTs.length - 1; i >= 0; i--) {
      const t = railTs[i];
      pts.push(new THREE.Vector3(s.halfWidthAtY(t, s.top(t)) - 0.065, s.top(t) + 0.03, s.z(t)));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    const railR = 0.09 + this.cls.length * 0.0034;
    const rail = new THREE.TubeGeometry(curve, 240, railR, this.detail ? 8 : 6, true);
    rail.deleteAttribute('uv');
    this.trimParts.push(rail);
  }

  /** A line running along one side from the stern, round the stem and back down the other. */
  private girdle(yOf: (t: number) => number, out: number, t0 = 0.006): THREE.Vector3[] {
    const s = this.shape;
    const ts = this.tSamples(30).map((k) => lerp(t0, 0.992, k));
    const port = ts.map((t) => s.skinPoint(t, yOf(t), 1, out));
    const nose = new THREE.Vector3(0, yOf(1), s.z(1) + out * 0.9);
    const star = ts
      .slice()
      .reverse()
      .map((t) => s.skinPoint(t, yOf(t), -1, out));
    return [...port, nose, ...star];
  }

  private buildMouldings() {
    const s = this.shape;
    const L = this.cls.length;
    // a fat rounded wale: the bumper line that gives the hull its heft
    const waleR = 0.13 + L * 0.0035;
    const waleCol = hexL(this.livery.wale).lerp(hexL(this.livery.hull), 0.4);
    const wale = this.girdle((t) => s.waleY(t), waleR * 0.45);
    this.woodParts.push(colorize(tube(wale, waleR, false, this.detail ? 7 : 5, 3), waleCol));
    for (const end of [wale[0], wale[wale.length - 1]]) this.woodParts.push(colorize(ball(waleR, end), waleCol));
    // a slim gilded moulding picks out the painted band under the rail
    const mR = 0.045 + L * 0.0012;
    const band = this.girdle((t) => s.yAtV(t, 0.945), mR * 0.4);
    this.trimParts.push(tube(band, mR, false, this.detail ? 5 : 4, 3));
    for (const end of [band[0], band[band.length - 1]]) this.trimParts.push(ball(mR * 1.3, end, 6, 4));

    // keel and stem: one rounded bar from the sternpost, under the hull and up the cutwater
    const kr = 0.11 + L * 0.003;
    const keel: THREE.Vector3[] = [];
    for (const k of this.tSamples(14)) {
      const t = lerp(0.012, 0.99, k);
      keel.push(new THREE.Vector3(0, s.bottom(t) - kr * 0.3, s.z(t) + (t > 0.9 ? kr * 0.6 : 0)));
    }
    keel.push(new THREE.Vector3(0, lerp(s.bottom(1), s.top(1), 0.45), s.z(1) + kr * 0.9));
    keel.push(new THREE.Vector3(0, s.top(1) - 0.55, s.z(1) + kr * 1.4));
    this.woodParts.push(colorize(tube(keel, kr, false, 6, 4), waleCol));
    this.woodParts.push(colorize(ball(kr, keel[0]), waleCol));
  }

  private buildDeck() {
    const s = this.shape;
    const c = this.cls;
    const segs: [number, number][] = [];
    const a = c.sternCastle?.t ?? 0;
    const b = c.foreCastle?.t ?? 1;
    if (c.sternCastle) segs.push([0.003, a]);
    segs.push([Math.max(0.003, a), Math.min(0.975, b)]);
    if (c.foreCastle) segs.push([b, 0.975]);
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (const [t0, t1] of segs) {
      const base = pos.length / 3;
      const n = 24;
      for (let k = 0; k <= n; k++) {
        const t = lerp(t0, t1, k / n);
        const z = s.z(t);
        // keep each deck level flat at its own height (follows the sheer)
        const y = t0 < a && c.sternCastle ? s.sheer(t) + c.sternCastle.h - c.bulwark : t1 > b && c.foreCastle && t0 >= b ? s.sheer(t) + c.foreCastle.h - c.bulwark : s.mainDeckY(t);
        const w = Math.max(0.05, s.halfWidthAtY(t, y) - 0.14);
        pos.push(-w, y, z, 0, y + 0.06, z, w, y, z);
        uv.push(-w * 0.25, z * 0.25, 0, z * 0.25, w * 0.25, z * 0.25);
        if (k > 0 && k < n && k % 3 === 0) this.deckPoints.push(new THREE.Vector3(0, y, z));
      }
      for (let k = 0; k < n; k++) {
        const r0 = base + k * 3;
        const r1 = r0 + 3;
        idx.push(r0, r1, r0 + 1, r1, r1 + 1, r0 + 1, r0 + 1, r1 + 1, r0 + 2, r1 + 1, r1 + 2, r0 + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const deck = new THREE.Mesh(g, this.mats.deck);
    deck.receiveShadow = true;
    deck.castShadow = false;
    this.root.add(deck);
  }

  private balustrade(t: number, yDeck: number, facing: number) {
    const s = this.shape;
    const z = s.z(t) + facing * 0.05;
    const w = s.halfWidthAtY(t, yDeck) - 0.2;
    const n = Math.max(4, Math.floor((w * 2) / (this.detail ? 0.42 : 0.6)));
    const baluster = lathe(
      [
        [0, 0],
        [0.065, 0],
        [0.065, 0.06],
        [0.035, 0.12],
        [0.07, 0.3],
        [0.035, 0.5],
        [0.06, 0.56],
        [0, 0.58],
      ],
      6,
    );
    // open where a stair comes up through the rail
    const gaps = this.stairs.filter((st) => Math.abs(st.z1 - s.z(t)) < 0.3).map((st) => [st.x - st.w / 2 - 0.04, st.x + st.w / 2 + 0.04]);
    const open = (x: number) => gaps.some(([a, b]) => x > a - 0.05 && x < b + 0.05);
    for (let i = 0; i <= n; i++) {
      const x = -w + (i / n) * w * 2;
      if (!open(x)) this.trimParts.push(baluster.clone().translate(x, yDeck, z));
    }
    const y = yDeck + 0.63;
    const cuts = [-w - 0.06, ...gaps.sort((a, b) => a[0] - b[0]).flat(), w + 0.06];
    for (let i = 0; i < cuts.length; i += 2) {
      const [a, b] = [cuts[i], cuts[i + 1]];
      if (b - a < 0.1) continue;
      this.trimParts.push(tube([new THREE.Vector3(a, y, z), new THREE.Vector3((a + b) / 2, y + 0.03, z), new THREE.Vector3(b, y, z)], 0.07, false, 6, 3));
      for (const x of [a, b]) {
        this.trimParts.push(ball(0.12, new THREE.Vector3(x, y + 0.06, z)));
        // newel posts frame each stair opening
        if (gaps.some(([g0, g1]) => Math.abs(x - g0) < 1e-3 || Math.abs(x - g1) < 1e-3)) this.trimParts.push(rbox(0.13, 0.66, 0.13, 0.04).translate(x, yDeck + 0.31, z));
      }
    }
  }

  /** Steep companion stairs up to the castle decks: treads on notched stringers with a rail each side. */
  private *buildStairs(): Generator<void, void> {
    const wood = hexL(0x6a4a2e);
    const dark = hexL(0x3e2a1a);
    for (const st of this.stairs) {
      const h = st.y1 - st.y0;
      const run = st.z1 - st.z0;
      const n = Math.max(3, Math.round(h / 0.22));
      const d = Math.abs(run) / n;
      // every tread of a flight is the same board: round its edges once
      const tread = rbox(st.w - 0.06, 0.07, d + 0.05, 0.025);
      for (let k = 1; k <= n; k++) {
        const y = st.y0 + (k / n) * h;
        const z = st.z0 + ((k - 0.5) / n) * run;
        this.woodParts.push(colorize(tread.clone().translate(st.x, y - 0.035, z), wood));
      }
      for (const sx of [-1, 1]) {
        const x = st.x + sx * (st.w / 2 - 0.02);
        const foot = new THREE.Vector3(x, st.y0, st.z0 - Math.sign(run) * 0.05);
        const head = new THREE.Vector3(x, st.y1 - 0.02, st.z1);
        const len = foot.distanceTo(head);
        const str = rbox(0.06, 0.22, len, 0.025);
        str.rotateX(Math.atan2(h, Math.abs(run)) * -Math.sign(run));
        str.translate((foot.x + head.x) / 2, (foot.y + head.y) / 2 - 0.06, (foot.z + head.z) / 2);
        this.woodParts.push(colorize(str, dark));
        // hand rope rail on turned posts
        const r0 = foot.clone().add(new THREE.Vector3(0, 0.9, 0));
        const r1 = head.clone().add(new THREE.Vector3(0, 0.82, -Math.sign(run) * 0.02));
        this.smallWood.push(colorize(spar(r0, r1, 0.035, 0.035, 5), dark));
        for (const p of [0.08, 0.92]) {
          const b = foot.clone().lerp(head, p);
          this.smallWood.push(colorize(spar(b, b.clone().lerp(r0.clone().lerp(r1, p), 1), 0.03, 0.03, 5), dark));
        }
        this.smallTrim.push(ball(0.06, r0.clone().add(new THREE.Vector3(0, 0.02, 0)), 6, 4));
      }
      yield;
    }
  }

  private *buildCastleWalls(): Generator<void, void> {
    const s = this.shape;
    const c = this.cls;
    const strake = hexL(this.livery.strake);
    const dark = hexL(this.livery.wale);
    const addWall = (t: number, yLow: number, yHigh: number, facing: number) => {
      const z = s.z(t);
      const w = s.halfWidthAtY(t, yLow) - 0.12;
      const h = yHigh - yLow;
      const wall = rbox(w * 2, h + 0.1, 0.2, 0.08);
      wall.translate(0, yLow + h / 2, z);
      this.woodParts.push(skinned(colorize(wall, strake.clone().multiplyScalar(0.9))));
      // arched door with a brass knob
      const dh = Math.min(1.3, h - 0.15);
      const door = rbox(0.8, dh, 0.1, 0.12);
      door.translate(0, yLow + dh / 2, z + facing * 0.1);
      this.woodParts.push(colorize(door, dark));
      this.trimParts.push(ball(0.05, new THREE.Vector3(0.25, yLow + dh * 0.5, z + facing * 0.17), 6, 4));
      // glowing cabin windows in gilded frames
      for (const sx of [-1, 1]) {
        const wy = yLow + h * 0.6;
        const win = rbox(0.44, 0.4, 0.06, 0.06);
        win.translate(sx * w * 0.55, wy, z + facing * 0.1);
        this.glowParts.push(win);
        this.trimParts.push(squareRing(0.24, 0.04).translate(sx * w * 0.55, wy, z + facing * 0.12));
      }
    };
    if (c.sternCastle) {
      const t = c.sternCastle.t;
      const low = s.mainDeckY(t);
      const high = s.sheer(t) + c.sternCastle.h - c.bulwark;
      addWall(t, low, high, 1);
      this.balustrade(t, high, 1);
    }
    yield;
    if (c.foreCastle) {
      const t = c.foreCastle.t;
      const low = s.mainDeckY(t);
      const high = s.sheer(t) + c.foreCastle.h - c.bulwark;
      addWall(t, low, high, -1);
      this.balustrade(t, high, -1);
    }
  }

  // ---------------------------------------------------------------- stern

  private buildStern() {
    const s = this.shape;
    const c = this.cls;
    if (!c.sternCastle) return;
    const t0 = 0.0;
    const b0 = s.bottom(t0);
    const top0 = s.top(t0);
    const z0 = s.z(t0) - 0.02;
    const bulge = c.beam * 0.05;
    const strake = hexL(this.livery.strake);
    // stern galleries: rounded balconies under the great cabin windows
    const levels = c.id === 'galleon' ? [0.8, 0.655] : [0.8];
    for (const f of levels) {
      const y = lerp(b0, top0, f);
      const hw = s.halfWidthAtY(t0, y) * 0.8;
      const depth = 0.5 + c.length * 0.012;
      const zc = z0 - bulge * 0.9;
      const floor = new THREE.CylinderGeometry(1, 1, 0.16, 18, 1, false, Math.PI / 2, Math.PI);
      floor.scale(hw, 1, depth);
      floor.translate(0, y, zc);
      this.woodParts.push(colorize(floor, strake.clone().multiplyScalar(0.85)));
      // rounded gilded skirt under the floor
      const skirt = new THREE.SphereGeometry(1, 14, 4, Math.PI, Math.PI, Math.PI / 2, Math.PI / 2);
      skirt.scale(hw * 0.92, 0.35, depth * 0.85);
      skirt.translate(0, y - 0.07, zc);
      this.trimParts.push(skirt);
      const arc: THREE.Vector3[] = [];
      const N = 12;
      for (let i = 0; i <= N; i++) {
        const a = Math.PI / 2 + (i / N) * Math.PI;
        arc.push(new THREE.Vector3(Math.sin(a) * hw * 0.96, y + 0.52, zc + Math.cos(a) * depth * 0.96));
      }
      this.trimParts.push(tube(arc, 0.05, false, 5, 3));
      const post = new THREE.CylinderGeometry(0.035, 0.045, 0.5, 5);
      for (let i = 1; i < N; i += this.detail ? 1 : 2) this.smallTrim.push(post.clone().translate(arc[i].x, y + 0.27, arc[i].z));
    }
    // quarter galleries: rounded bay windows bulging from each stern quarter
    const qt = 0.075;
    const qy = s.top(qt) - c.sternCastle.h * 0.55;
    const ry = c.sternCastle.h * 0.36;
    const rz = c.length * 0.05;
    for (const side of [1, -1]) {
      const n = s.skinNormal(qt, qy, side);
      n.y = 0;
      n.normalize();
      const m = surfaceMatrix(s.skinPoint(qt, qy, side, -0.05), n);
      const bay = new THREE.SphereGeometry(1, 14, 10, 0, Math.PI * 2, 0, Math.PI);
      bay.scale(rz, ry, 0.5);
      this.woodParts.push(colorize(bay.applyMatrix4(m), strake));
      const cap = new THREE.SphereGeometry(1, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2);
      cap.scale(rz * 0.8, ry * 0.45, 0.42);
      cap.translate(0, ry * 0.8, 0);
      this.trimParts.push(cap.applyMatrix4(m));
      const finial = new THREE.ConeGeometry(0.16, ry * 0.7, 8);
      finial.rotateX(Math.PI);
      finial.translate(0, -ry * 1.15, 0.18);
      this.trimParts.push(finial.applyMatrix4(m));
      for (const wx of [-0.42, 0, 0.42]) {
        const win = rbox(0.3, ry * 0.7, 0.08, 0.05);
        win.translate(wx * rz, 0, 0.47 - Math.abs(wx) * 0.12);
        this.glowParts.push(win.applyMatrix4(m));
      }
    }
  }

  /** Rudder hung on the sternpost, and gilded quarter pieces framing the transom. */
  private buildAft() {
    const s = this.shape;
    const c = this.cls;
    const b0 = s.bottom(0);
    const top0 = s.top(0);
    const z0 = s.z(0) - 0.02;
    const bulge = c.beam * 0.05;
    const yTop = lerp(b0, top0, 0.5);
    const chord0 = 0.55 + c.length * 0.02;
    const thick = 0.09 + c.length * 0.003;
    const bottomCol = hexL(this.livery.bottom);
    const bootCol = hexL(this.livery.boot);
    const woodCol = hexL(this.livery.hull).multiplyScalar(0.8);
    const N = 9;
    const M = 12;
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const ring = (y: number, chord: number, th: number) => {
      const h = clamp((y - b0) / (top0 - b0), 0, 1);
      const zle = z0 - bulge * Math.pow(Math.sin(Math.PI * h), 0.6) - 0.03;
      const cc = y < -0.02 ? bottomCol : y < 0.14 ? bootCol : woodCol;
      for (let j = 0; j <= M; j++) {
        const a = (j / M) * Math.PI * 2;
        const along = (1 - Math.cos(a)) / 2;
        pos.push(th * Math.sin(a) * (1 - 0.4 * along), y, zle - chord * along);
        col.push(cc.r, cc.g, cc.b);
      }
      return zle;
    };
    const zles: number[] = [];
    ring(b0 + 0.04, chord0 * 0.92, thick * 0.3);
    for (let i = 0; i <= N; i++) {
      const f = i / N;
      zles.push(ring(lerp(b0 + 0.1, yTop, f), lerp(chord0, chord0 * 0.42, f), thick));
    }
    ring(yTop + 0.06, chord0 * 0.36, thick * 0.35);
    const rows = N + 3;
    for (let r = 0; r < rows - 1; r++) {
      for (let j = 0; j < M; j++) {
        const a = r * (M + 1) + j;
        const b = a + M + 1;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    rg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    rg.setIndex(idx);
    rg.computeVertexNormals();
    this.woodParts.push(rg);
    // pintle straps and the rudder head running up into the counter
    for (let i = 1; i <= 4; i++) {
      const f = i / 5;
      const y = lerp(b0 + 0.1, yTop, f);
      const zle = zles[Math.round(f * N)];
      const ch = lerp(chord0, chord0 * 0.42, f);
      const strap = rbox(thick * 2 + 0.07, 0.08, ch * 0.5, 0.03, 1);
      this.ironParts.push(strap.translate(0, y, zle - ch * 0.22));
    }
    const headZ = zles[N] - 0.14;
    this.woodParts.push(colorize(spar(new THREE.Vector3(0, yTop, headZ), new THREE.Vector3(0, yTop + 0.35, headZ + 0.03), 0.13, 0.12, 8), woodCol));

    // quarter pieces: gilded scrolled pilasters up each corner of the transom
    for (const side of [1, -1]) {
      const yA = lerp(b0, top0, c.sternCastle ? 0.5 : 0.62);
      const yB = top0 - 0.12;
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 6; k++) {
        const y = lerp(yA, yB, k / 6);
        pts.push(new THREE.Vector3(side * (s.halfWidthAtY(0, y) + 0.01), y, z0 - 0.03));
      }
      const top = pts[pts.length - 1];
      // rolls up and outward into a volute
      const curl = spiral(top.clone().add(new THREE.Vector3(side * 0.13, 0, 0)), new THREE.Vector3(side, 0, 0), new THREE.Vector3(0, -1, 0), 0.13, 0.9, Math.PI, 9);
      const r = 0.06 + c.length * 0.0016;
      this.trimParts.push(sweep([...pts, ...curl.slice(1)], (u) => (u < 0.7 ? r : lerp(r, r * 0.4, (u - 0.7) / 0.3)), 6, 24));
      const fin = new THREE.ConeGeometry(r * 1.4, 0.32, 8);
      fin.rotateX(Math.PI);
      this.trimParts.push(fin.translate(pts[0].x, pts[0].y - 0.14, pts[0].z));
      this.trimParts.push(ball(r * 1.5, pts[0], 7, 5));
    }
  }

  // ---------------------------------------------------------------- guns

  private *buildCannons(): Generator<void, void> {
    const s = this.shape;
    const k = 0.75 + this.cls.length * 0.011;
    // a chunky turned barrel: cascabel knob, reinforce rings, muzzle swell (+y = muzzle)
    const barrelG = lathe(
      [
        [0, -0.86],
        [0.07, -0.85],
        [0.1, -0.79],
        [0.06, -0.73],
        [0.19, -0.69],
        [0.215, -0.6],
        [0.205, -0.5],
        [0.215, -0.42],
        [0.2, -0.36],
        [0.185, -0.05],
        [0.2, 0.0],
        [0.17, 0.05],
        [0.155, 0.52],
        [0.19, 0.6],
        [0.2, 0.68],
        [0.17, 0.71],
        [0.1, 0.71],
        [0.1, 0.6],
        [0, 0.6],
      ],
      this.detail ? 12 : 8,
    );
    barrelG.scale(k, k, k);
    // an upgrade swaps the standard barrel for its own (and moves the muzzle with it)
    const fit = this.parts.guns ? gunBarrel(this.parts.guns, this.detail) : null;
    for (const b of fit?.parts ?? []) b.g.scale(k, k, k);
    const tip = fit ? fit.tip + 0.14 : 0.85;
    const mount = (place: (g: THREE.BufferGeometry) => THREE.BufferGeometry) => {
      if (!fit) return void this.ironParts.push(place(barrelG.clone()));
      for (const b of fit.parts) (b.bucket === 'glow' ? this.glowParts : this.ironParts).push(place(b.g.clone()));
    };
    const carriageCol = hexL(this.livery.bottom).multiplyScalar(0.8);
    const wheelCol = hexL(0x3e2a1a);
    const strake = hexL(this.livery.strake);
    const lining = hexL(this.livery.bottom);
    for (const side of [1, -1]) {
      for (const t of this.cannonTs()) {
        const y = this.cannonY(t);
        const z = s.z(t);
        const x = s.halfWidthAtY(t, y);
        mount((g) => g.rotateZ((-side * Math.PI) / 2).translate(side * (x + 0.12 * k), y, z));
        this.muzzles.push({ pos: new THREE.Vector3(side * (x + tip * k), y, z), dir: new THREE.Vector3(side, 0, 0), side });

        // truck carriage on the deck behind the port
        const deck = s.mainDeckY(t);
        const cx = side * (x - 0.13 - 0.42 * k);
        const ch = y - deck - 0.05;
        // stepped cheeks bolted across a bed, the trunnions riding in the high front step
        const cl = 0.85 * k;
        const base = deck + 0.09 * k;
        for (const dz of [-0.19 * k, 0.19 * k]) {
          const front = rbox(cl * 0.56, y - base + 0.02, 0.08 * k, 0.03, 1);
          front.translate(cx + side * cl * 0.22, (base + y + 0.02) / 2, z + dz);
          const rear = rbox(cl * 0.48, (y - base) * 0.62, 0.08 * k, 0.03, 1);
          rear.translate(cx - side * cl * 0.25, base + (y - base) * 0.31, z + dz);
          this.woodParts.push(colorize(front, carriageCol), colorize(rear, carriageCol));
          if (this.detail) {
            // iron cap-squares over the trunnions and bolt heads down the cheeks
            this.fineIron.push(new THREE.BoxGeometry(0.16 * k, 0.05, 0.1 * k).translate(cx + side * cl * 0.3, y + 0.03, z + dz));
            for (const bx of [0.05, 0.38]) this.fineIron.push(ball(0.022, new THREE.Vector3(cx + side * cl * bx, base + 0.06, z + dz + Math.sign(dz) * 0.045 * k), 4, 3));
          }
        }
        this.smallWood.push(colorize(new THREE.BoxGeometry(cl * 0.92, 0.06 * k, 0.34 * k).translate(cx, base + 0.03 * k, z), carriageCol.clone().multiplyScalar(0.85)));
        // axletrees on four trucks, bigger in front, with iron tyres
        for (const [ax, tr] of [
          [0.3, 0.13],
          [-0.3, 0.115],
        ]) {
          const axle = new THREE.CylinderGeometry(0.05 * k, 0.05 * k, 0.6 * k, 6);
          axle.rotateX(Math.PI / 2);
          this.smallWood.push(colorize(axle.translate(cx + side * ax * k, deck + tr * k, z), wheelCol));
          for (const tz of [-0.27 * k, 0.27 * k]) {
            const truck = new THREE.CylinderGeometry(tr * k, tr * k, 0.07 * k, 10);
            truck.rotateX(Math.PI / 2);
            this.woodParts.push(colorize(truck.translate(cx + side * ax * k, deck + tr * k, z + tz), wheelCol));
            if (this.detail) this.fineIron.push(new THREE.TorusGeometry(tr * k, 0.014, 3, 8).translate(cx + side * ax * k, deck + tr * k, z + tz));
          }
        }
        if (this.detail) {
          // the quoin wedged under the breech, its handle sticking out aft
          const q = new THREE.BoxGeometry(0.34 * k, 0.07 * k, 0.2 * k);
          q.rotateZ(side * 0.12);
          this.fineWood.push(colorize(q.translate(cx - side * cl * 0.18, y - 0.2 * k, z), wheelCol.clone().multiplyScalar(1.3)));
          this.fineWood.push(colorize(ball(0.03 * k, new THREE.Vector3(cx - side * cl * 0.38, y - 0.19 * k, z), 5, 4), wheelCol));
        }
        // breeching rope round the cascabel and the run-out tackles, all set up on eyebolts in the bulwark
        const xi = side * (x - 0.16);
        const casc = new THREE.Vector3(side * (x - 0.74 * k), y + 0.02, z);
        for (const dz of [-1, 1]) {
          const eye = new THREE.Vector3(xi, y + 0.06, z + dz * 0.55);
          this.rope(eye, casc, 0.032, HEMP, 0.05);
          const low = new THREE.Vector3(xi, deck + 0.28, z + dz * 0.42);
          this.rope(low, new THREE.Vector3(cx - side * 0.36 * k, deck + ch * 0.7, z + dz * 0.25 * k), 0.018, HEMP);
          if (this.detail) {
            for (const e of [eye, low]) this.smallIron.push(ball(0.035, e, 5, 3));
            // a double block at each end of the run-out tackle
            for (const bp of [low.clone().lerp(new THREE.Vector3(cx - side * 0.36 * k, deck + ch * 0.7, z + dz * 0.25 * k), 0.18), new THREE.Vector3(cx - side * 0.36 * k, deck + ch * 0.7, z + dz * 0.25 * k)]) {
              this.fineWood.push(colorize(new THREE.SphereGeometry(0.055, 5, 3).scale(1.3, 0.8, 0.9).translate(bp.x, bp.y, bp.z), wheelCol.clone().multiplyScalar(1.4)));
            }
          }
        }

        // framed gunport with its lid hinged open above it, where the side is tall enough
        if (s.top(t) - y < 0.48) continue;
        const n = s.skinNormal(t, y, side);
        const m = surfaceMatrix(s.skinPoint(t, y, side, -0.01), n);
        this.trimParts.push(squareRing(0.36, 0.055).applyMatrix4(m));
        const lid = rbox(0.76, 0.62, 0.09, 0.04);
        lid.translate(0, -0.31, 0.045);
        const inner = new THREE.BoxGeometry(0.62, 0.5, 0.02);
        inner.translate(0, -0.31, -0.008);
        for (const [g, col] of [
          [lid, strake],
          [inner, lining],
        ] as const) {
          g.rotateX(-2.05);
          g.translate(0, 0.4, 0.03);
          this.woodParts.push(colorize(g.applyMatrix4(m), col));
        }
        if (this.detail) {
          // the port lanyards holding the lid up, led in over the rail
          const top = s.top(t) - y;
          for (const lx of [-0.28, 0.28]) {
            const a = new THREE.Vector3(lx, 0.72, 0.55).applyMatrix4(m);
            const b = new THREE.Vector3(lx * 0.8, top + 0.02, 0.04).applyMatrix4(m);
            this.ropeTubes.push({ a, b, r: 0.011, col: HEMP, sag: 0, radial: 3 });
            this.fineIron.push(ball(0.02, a, 4, 3));
          }
        }
        yield;
      }
    }
    yield;
    // shot garlands between the guns: round shot racked along the waterway
    const ts = this.cannonTs();
    const k2 = 0.75 + this.cls.length * 0.011;
    const t0 = (this.cls.sternCastle?.t ?? 0) + 0.02;
    const t1 = (this.cls.foreCastle?.t ?? 1) - 0.02;
    for (let i = 0; i < ts.length - 1; i++) {
      const t = (ts[i] + ts[i + 1]) / 2;
      if (t < t0 || t > t1) continue;
      const deck = s.mainDeckY(t);
      for (const side of [1, -1]) {
        const x = side * (s.halfWidthAtY(t, deck + 0.1) - 0.13 - 0.13);
        const z = s.z(t);
        const board = rbox(0.2, 0.12, 0.95, 0.04, 1);
        board.translate(x, deck + 0.06, z);
        this.woodParts.push(colorize(board, lining.clone().multiplyScalar(0.7)));
        if (this.detail) {
          // rammer and sponge racked on hooks along the bulwark above the shot
          const hx = side * (s.halfWidthAtY(t, deck + 0.95) - 0.13 - 0.07);
          for (const [dy, head] of [
            [0.92, 0],
            [1.06, 1],
          ]) {
            const a = new THREE.Vector3(hx, deck + dy, z - 1.0);
            const b = new THREE.Vector3(hx, deck + dy, z + 1.0);
            this.fineWood.push(colorize(spar(a, b, 0.022, 0.022, 5), hexL(0xa07a4e)));
            const hd = new THREE.CylinderGeometry(head ? 0.075 : 0.065, head ? 0.075 : 0.065, head ? 0.3 : 0.16, 7);
            hd.rotateX(Math.PI / 2);
            this.fineWood.push(colorize(hd.translate(hx, deck + dy, z + 1.0 + (head ? 0.12 : 0.05)), head ? hexL(0x3a3028) : hexL(0x7a5634)));
            for (const hz of [-0.6, 0.6]) this.fineIron.push(spar(new THREE.Vector3(hx + side * 0.06, deck + dy - 0.06, z + hz), new THREE.Vector3(hx - side * 0.01, deck + dy - 0.04, z + hz), 0.012, 0.012, 3));
          }
        }
        for (let b = -2; b <= 2; b++) this.smallIron.push(ball(0.085 * k2, new THREE.Vector3(x, deck + 0.13 + 0.06 * k2, z + b * 0.19), 6, 5));
      }
    }
    yield;
    // stern chasers through the transom
    for (let i = 0; i < this.cls.chasers; i++) {
      const x = (i - (this.cls.chasers - 1) / 2) * 1.3;
      const y = this.shape.mainDeckY(0.05) + 0.4;
      const z = s.z(0.01);
      mount((g) => g.scale(0.8, 0.8, 0.8).rotateX(-Math.PI / 2).translate(x, y, z - 0.3));
    }
  }

  // ---------------------------------------------------------------- rig

  /** Which side of a mast its fife rail stands: abaft (-1) unless a hatch is in the way there, then before it (+1). */
  private fifeSide(mt: number) {
    const s = this.shape;
    const c = this.cls;
    const hatches = [0.46, 0.6].filter((t) => !c.masts.some((mm) => Math.abs(mm.t - t) < 0.05)).map((t) => [s.z(t), c.length * 0.035 + 0.3]);
    const blocked = (zz: number) => hatches.some(([hz, hl]) => Math.abs(zz - hz) < hl + 0.2);
    return blocked(s.z(mt) - 0.78) ? 1 : -1;
  }

  private *buildRig(): Generator<void, void> {
    const s = this.shape;
    const c = this.cls;
    const woodCol = hexL(0x6a4a2e);
    const darkWood = hexL(0x3e2a1a);
    const B = c.beam;
    let maxMast = 0;
    let maxMastTop = new THREE.Vector3();
    const mastTops: THREE.Vector3[] = [];

    for (const [mi, m] of c.masts.entries()) {
      const z = s.z(m.t);
      const y0 = s.deckY(m.t);
      const H = m.height;
      const r0 = 0.12 + H * 0.0085;
      // stepped spars: lower mast, topmast and topgallant overlap at doublings
      // capped with iron-bound blocks, so the silhouette reads as a real rig
      const radial = this.detail ? 10 : 7;
      const pole = (ya: number, yb: number, ra: number, rb: number) => this.woodParts.push(colorize(spar(new THREE.Vector3(0, ya, z), new THREE.Vector3(0, yb, z), ra, rb, radial), woodCol));
      const capAt = (y: number, rLow: number, rUp: number) => {
        const cap = rbox(rLow * 2.6, 0.26 + rLow * 0.4, rLow * 2.6 + rUp * 2.4, 0.07, 1);
        cap.translate(0, y, z);
        this.woodParts.push(colorize(cap, darkWood));
        const ring = new THREE.TorusGeometry(rUp + 0.03, 0.03, 4, 10);
        ring.rotateX(Math.PI / 2);
        ring.translate(0, y + 0.16 + rLow * 0.2, z);
        this.smallIron.push(ring);
      };
      if (m.rig === 'lateen') pole(y0, y0 + H, r0, r0 * 0.45);
      else {
        const lowTop = m.rig === 'gaff' ? y0 + H * 0.8 : y0 + H * 0.6 + 0.85;
        const r1 = r0 * 0.78;
        pole(y0, lowTop + 0.1, r0, r1);
        const tmBase = lowTop - (m.rig === 'gaff' ? 1.6 : 0.9);
        const tmTop = m.rig === 'gaff' || !m.top ? y0 + H : y0 + H * 0.87 + 0.55;
        pole(tmBase, tmTop, r1 * 0.72, r1 * 0.5);
        capAt(lowTop, r1, r1 * 0.72);
        if (tmTop < y0 + H - 0.5) {
          const tg = r1 * 0.5;
          pole(y0 + H * 0.87 - 0.3, y0 + H, tg * 0.82, tg * 0.55);
          capAt(tmTop - 0.05, r1 * 0.5, tg * 0.82);
        }
      }
      // rounded collar where it passes the deck, and iron bands up the lower mast
      const collar = new THREE.TorusGeometry(r0 * 1.15, r0 * 0.45, 6, 14);
      collar.rotateX(Math.PI / 2);
      collar.translate(0, y0 + r0 * 0.3, z);
      this.woodParts.push(colorize(collar, darkWood));
      const lowLen = m.rig === 'lateen' ? H : m.rig === 'gaff' ? H * 0.8 : H * 0.6 + 0.95;
      const lowTaper = m.rig === 'lateen' ? 0.55 : 0.22;
      for (const f of this.detail ? [0.1, 0.2, 0.3, 0.4] : [0.15, 0.35]) {
        const band = new THREE.TorusGeometry(r0 * (1 - lowTaper * Math.min(1, (f * H) / lowLen)) + 0.012, 0.035, 4, 12);
        band.rotateX(Math.PI / 2);
        band.translate(0, y0 + H * f, z);
        this.smallIron.push(band);
      }
      // rope wooldings bound round the lower mast between the iron hoops
      if (this.detail) {
        for (const f of [0.15, 0.25, 0.35]) {
          for (let k = -1; k <= 1; k++) {
            const yy = y0 + H * f + k * 0.075;
            const w = new THREE.TorusGeometry(r0 * (1 - lowTaper * Math.min(1, (yy - y0) / lowLen)) + 0.014, 0.026, 4, 12);
            this.fineWood.push(colorize(w.rotateX(Math.PI / 2).translate(0, yy, z), HEMP.clone().multiplyScalar(0.8)));
          }
        }
      }
      // mast cap + truck
      const cap = new THREE.SphereGeometry(r0 * 0.5, 10, 6);
      cap.scale(1, 0.8, 1);
      cap.translate(0, y0 + H + 0.05, z);
      this.trimParts.push(cap);
      const top = new THREE.Vector3(0, y0 + H, z);
      mastTops.push(top);
      this.masts.push({ z, y0, H, r0 });
      this.perches.push({ pos: new THREE.Vector3(0, y0 + H + 0.05 + r0 * 0.4, z), spar: mi });
      if (H > maxMast) {
        maxMast = H;
        maxMastTop = top.clone();
      }
      if (m.top) {
        // round fighting top with a soft rim and a little railing
        const ty = y0 + H * 0.6;
        const plat = new THREE.CylinderGeometry(B * 0.16, B * 0.12, 0.2, 16);
        plat.translate(0, ty, z);
        this.woodParts.push(colorize(plat, darkWood));
        const rim = new THREE.TorusGeometry(B * 0.16, 0.09, 5, 20);
        rim.rotateX(Math.PI / 2);
        rim.translate(0, ty + 0.05, z);
        this.woodParts.push(colorize(rim, woodCol));
        const rail = new THREE.TorusGeometry(B * 0.155, 0.04, 4, 20);
        rail.rotateX(Math.PI / 2);
        rail.translate(0, ty + 0.62, z);
        this.trimParts.push(rail);
        for (const side of [1, -1]) this.perches.push({ pos: new THREE.Vector3(side * B * 0.155, ty + 0.66, z), spar: mi });
        for (let i = 0; i < 8; i++) {
          if (i === 2 || i === 6) continue; // gaps where the shrouds come up
          const a = (i / 8) * Math.PI * 2;
          const post = new THREE.CylinderGeometry(0.03, 0.03, 0.58, 4);
          post.translate(Math.cos(a) * B * 0.155, ty + 0.33, z + Math.sin(a) * B * 0.155);
          this.smallTrim.push(post);
        }
        // futtock shrouds from the rim of the top in to a band round the mast below it
        if (this.detail) {
          for (const side of [1, -1]) {
            for (const dz of [-0.2, 0, 0.2]) this.rope(new THREE.Vector3(side * B * 0.145, ty - 0.02, z + dz), new THREE.Vector3(side * r0 * 0.85, ty - 1.05, z + dz * 0.3), 0.02);
          }
          this.fineIron.push(new THREE.TorusGeometry(r0 * 0.86, 0.03, 4, 12).rotateX(Math.PI / 2).translate(0, ty - 1.05, z));
          // halyard blocks hung under the top
          for (const side of [1, -1]) {
            const blk = new THREE.SphereGeometry(0.09, 7, 5).scale(0.7, 1.25, 0.8);
            this.fineWood.push(colorize(blk.translate(side * (r0 + 0.12), ty - 0.32, z - 0.05), darkWood));
          }
        }
        // crosstrees higher up
        const cy = y0 + H * 0.87;
        for (const dz of [-0.22, 0.22]) {
          const ct = spar(new THREE.Vector3(-B * 0.11, cy, z + dz), new THREE.Vector3(B * 0.11, cy, z + dz), 0.06, 0.06, 6);
          this.woodParts.push(colorize(ct, darkWood));
        }
      }

      // shrouds set up on deadeyes along a channel board, with ratlines to climb
      const dts = [-0.055, -0.03, -0.005, 0.02].map((dt) => (dt * 21) / c.length);
      const head = new THREE.Vector3(0, y0 + H * 0.6, z);
      for (const side of [1, -1]) {
        const ct0 = clamp(m.t + dts[0] - 0.012, 0.02, 0.96);
        const ct1 = clamp(m.t + dts[dts.length - 1] + 0.012, 0.02, 0.96);
        // channels ride just outboard of the rail cap, clear of the gunports
        const cyAt = (tt: number) => s.top(tt) + 0.02;
        const chT = (ct0 + ct1) / 2;
        const nH = s.skinNormal(chT, cyAt(chT), side);
        nH.y = 0;
        nH.normalize();
        const chLen = s.z(ct1) - s.z(ct0);
        const channel = rbox(chLen, 0.12, 0.46, 0.05);
        channel.translate(0, 0, 0.2);
        this.woodParts.push(colorize(channel.applyMatrix4(surfaceMatrix(s.skinPoint(chT, cyAt(chT), side, -0.02), nH)), darkWood));
        const feet: THREE.Vector3[] = [];
        for (const dt of dts) {
          const tt = clamp(m.t + dt, 0.02, 0.96);
          const base = s.skinPoint(tt, cyAt(tt), side).addScaledVector(nH, 0.36);
          const eye = base.clone().add(new THREE.Vector3(0, 0.2, 0));
          const dEye = new THREE.SphereGeometry(0.1, 7, 5);
          dEye.scale(1, 1, 0.6);
          dEye.translate(eye.x, eye.y, eye.z);
          this.smallWood.push(colorize(dEye, darkWood));
          if (this.detail) {
            // the shroud ends in an upper deadeye, set up to the lower one with a three-part lanyard
            const up = head.clone().sub(eye).normalize();
            const upper = eye.clone().addScaledVector(up, 0.42);
            const uEye = new THREE.SphereGeometry(0.085, 7, 5);
            uEye.scale(1, 1, 0.6);
            this.fineWood.push(colorize(uEye.translate(upper.x, upper.y, upper.z), darkWood));
            const across = new THREE.Vector3(0, 0, 1);
            for (const o of [-0.045, 0, 0.045]) {
              this.ropeTubes.push({ a: eye.clone().addScaledVector(across, o), b: upper.clone().addScaledVector(across, o * 0.9), r: 0.011, col: HEMP, sag: 0, radial: 3 });
            }
            this.ropes.push(eye.x, eye.y, eye.z, head.x, head.y, head.z);
            this.ropeTubes.push({ a: upper, b: head.clone(), r: 0.034, col: TAR, sag: 0, radial: 5 });
          } else this.rope(eye, head, 0.034);
          // chainplate: an iron strap bolted down the side below the channel
          this.smallIron.push(spar(base.clone().add(new THREE.Vector3(0, 0.12, 0)), base.clone().addScaledVector(nH, -0.3).add(new THREE.Vector3(0, -0.75, 0)), 0.028, 0.028, 4));
          feet.push(eye);
        }
        if (this.detail) {
          const len = feet[0].distanceTo(head);
          const n = Math.floor((len * 0.85) / 0.6);
          for (let r = 1; r <= n; r++) {
            const f = r / (n + 1.6);
            for (let i = 0; i < feet.length - 1; i++) {
              const a = feet[i].clone().lerp(head, f);
              const b = feet[i + 1].clone().lerp(head, f);
              this.ratlines.push(a.x, a.y, a.z, b.x, b.y, b.z);
              this.ropeTubes.push({ a, b, r: 0.014, col: TAR, sag: 0, radial: 3 });
            }
          }
        }
        this.rope(new THREE.Vector3(0, y0 + H * 0.93, z), new THREE.Vector3(side * B * 0.16, y0 + H * 0.6, z), 0.028);
      }

      if (m.rig === 'square') {
        const pivot = new THREE.Group();
        pivot.position.set(0, 0, z);
        this.root.add(pivot);
        this.yardPivots.push(pivot);
        const fr = m.tiers === 1 ? [0.75] : m.tiers === 2 ? [0.5, 0.84] : [0.4, 0.66, 0.89];
        const widths = m.tiers === 1 ? [1.4] : m.tiers === 2 ? [1.6, 1.2] : [1.75, 1.35, 0.95];
        const yards: { y: number; half: number }[] = [];
        const yardParts: THREE.BufferGeometry[] = [];
        const lines: number[] = [];
        const tubes: RopeSpec[] = [];
        const seg = (a: THREE.Vector3, b: THREE.Vector3, r = 0.02, col = TAR) => {
          lines.push(a.x, a.y, a.z, b.x, b.y, b.z);
          tubes.push({ a: a.clone(), b: b.clone(), r, col, sag: 0, radial: 4 });
        };
        fr.forEach((f, i) => {
          const y = y0 + H * f;
          const half = (B * widths[i]) / 2;
          yards.push({ y, half });
          // tapered both ways from the slings, with rounded yardarm ends, an iron sling band and sheave blocks
          const ry = 0.1 + H * 0.0022;
          yardParts.push(
            spar(new THREE.Vector3(0, y, 0), new THREE.Vector3(-half, y, 0), ry, 0.055, 8),
            spar(new THREE.Vector3(0, y, 0), new THREE.Vector3(half, y, 0), ry, 0.055, 8),
            ball(0.075, new THREE.Vector3(-half, y, 0), 6, 4),
            ball(0.075, new THREE.Vector3(half, y, 0), 6, 4),
          );
          const sling = new THREE.TorusGeometry(ry + 0.02, 0.035, 4, 10);
          sling.rotateY(Math.PI / 2);
          yardParts.push(sling.translate(0, y, 0), rbox(0.36, 0.3, 0.42, 0.08, 1).translate(0, y + 0.02, -0.12));
          const liftTop = i < fr.length - 1 ? y0 + H * fr[i + 1] - 0.35 : y0 + H * 0.97;
          for (const sx of [-1, 1]) {
            const arm = new THREE.Vector3(sx * half * 0.96, y, 0);
            const blk = ball(0.1, arm.clone().add(new THREE.Vector3(0, -0.12, -0.05)), 6, 4);
            yardParts.push(blk);
            // lift from the yardarm up to the mast, braces' pendants hanging off the arm
            seg(arm, new THREE.Vector3(sx * 0.2, liftTop, 0), 0.026);
            // clewlines and buntlines leading down abaft the canvas to the pin rails at the mast's foot
            if (m.rig === 'square') for (const f of [0.38, 0.78]) seg(new THREE.Vector3(sx * half * f, y - 0.06, -0.14), new THREE.Vector3(sx * (0.1 + f * 0.25), y0 + 0.86, -0.72), 0.016, HEMP);
            // footrope sagging under the yard, held up by stirrups
            const pts: THREE.Vector3[] = [];
            for (let k = 0; k <= 6; k++) {
              const u = k / 6;
              const fx = lerp(0.35, half * 0.98, u);
              pts.push(new THREE.Vector3(sx * fx, y - 0.25 - Math.sin(u * Math.PI) * 0.5, -0.3));
            }
            for (let k = 0; k < pts.length - 1; k++) seg(pts[k], pts[k + 1], 0.022, HEMP);
            for (const k of [2, 4]) seg(pts[k], new THREE.Vector3(pts[k].x, y, -0.06), 0.014, HEMP);
          }
        });
        const yardMesh = new THREE.Mesh(colorize(mergeParts(yardParts, false)!, darkWood, 0), this.mats.wood);
        yardMesh.castShadow = true;
        pivot.add(yardMesh);
        if (lines.length) {
          const lg = new THREE.BufferGeometry();
          lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
          const ls = new THREE.LineSegments(lg, this.mats.rope);
          ls.userData.lod = true;
          pivot.add(ls);
          this.lineMeshes.push(ls);
          if (this.detail) this.addRopeMesh(pivot, tubes);
        }
        yards.forEach((yd, i) => {
          const bottomY = i === 0 ? Math.max(y0 + 2.1, yd.y - H * 0.38) : yards[i - 1].y + 0.2;
          const bottomHalf = i === 0 ? yd.half * 1.04 : yards[i - 1].half * 0.97;
          const h = yd.y - bottomY;
          const geo = sailGeometry(
            new THREE.Vector2(-yd.half * 0.95, 0),
            new THREE.Vector2(yd.half * 0.95, 0),
            new THREE.Vector2(-bottomHalf * 0.95, -h),
            new THREE.Vector2(bottomHalf * 0.95, -h),
            Math.min(yd.half * 0.32, 1.4),
          );
          const emblem = i === 0 && (mi === c.masts.length - 1 || c.masts.length === 1 || (c.masts.length === 3 && mi === 1));
          const sail = new THREE.Mesh(geo, emblem ? this.sailEmblemMaterial : this.sailMaterial);
          sail.position.set(0, yd.y - 0.12, 0.18);
          sail.castShadow = true;
          pivot.add(sail);
          this.sails.push({ mesh: sail, tier: i });
        });
      } else if (m.rig === 'gaff') {
        const pivot = new THREE.Group();
        pivot.position.set(0, 0, z);
        this.root.add(pivot);
        this.foreAftPivots.push(pivot);
        const footY = y0 + 1.9;
        const throatY = y0 + H * 0.78;
        const boomLen = c.length * 0.5 * (m.span ?? 1);
        const gaffLen = c.length * 0.36 * (m.span ?? 1);
        const peakY = throatY + gaffLen * 0.55;
        const peakA = gaffLen * 0.83;
        const boom = spar(new THREE.Vector3(0, footY, 0), new THREE.Vector3(0, footY, -boomLen), 0.13, 0.09);
        const gaff = spar(new THREE.Vector3(0, throatY, 0), new THREE.Vector3(0, peakY, -peakA), 0.11, 0.07);
        // jaws hugging the mast, a knob on the boom end
        const jawB = new THREE.TorusGeometry(0.24, 0.06, 4, 10, Math.PI * 1.4);
        jawB.rotateX(Math.PI / 2);
        jawB.rotateY(-Math.PI * 0.2 + Math.PI / 2);
        const jawG = jawB.clone();
        jawB.translate(0, footY, 0);
        jawG.translate(0, throatY, 0);
        const spars = mergeParts([boom, gaff, jawB, jawG, ball(0.13, new THREE.Vector3(0, footY, -boomLen), 6, 4)], false)!;
        const sparMesh = new THREE.Mesh(colorize(spars, darkWood, 0), this.mats.wood);
        sparMesh.castShadow = true;
        pivot.add(sparMesh);
        // peak and throat halyards to the masthead, topping lift to the boom end
        const gl: number[] = [];
        const gseg = (a: THREE.Vector3, b: THREE.Vector3) => gl.push(a.x, a.y, a.z, b.x, b.y, b.z);
        const mh = new THREE.Vector3(0, y0 + H * 0.93, 0);
        for (const f of [0.45, 0.8]) gseg(new THREE.Vector3(0, throatY, 0).lerp(new THREE.Vector3(0, peakY, -peakA), f), mh);
        gseg(new THREE.Vector3(0, throatY + 0.2, 0), new THREE.Vector3(0, y0 + H * 0.86, 0));
        gseg(new THREE.Vector3(0, footY, -boomLen * 0.98), new THREE.Vector3(0, y0 + H * 0.97, 0));
        const glg = new THREE.BufferGeometry();
        glg.setAttribute('position', new THREE.Float32BufferAttribute(gl, 3));
        const gls = new THREE.LineSegments(glg, this.mats.rope);
        gls.userData.lod = true;
        pivot.add(gls);
        this.lineMeshes.push(gls);
        if (this.detail) {
          const gt: RopeSpec[] = [];
          for (let i = 0; i < gl.length; i += 6) gt.push({ a: new THREE.Vector3(gl[i], gl[i + 1], gl[i + 2]), b: new THREE.Vector3(gl[i + 3], gl[i + 4], gl[i + 5]), r: 0.026, col: HEMP, sag: 0.06, radial: 4 });
          this.addRopeMesh(pivot, gt);
        }
        // mast hoops hold the luff of the mainsail to the mast
        const r1 = r0 * (1 - 0.22 * ((footY - y0) / (H * 0.8)));
        for (let hy = footY + 0.7; hy < throatY - 0.3; hy += this.detail ? 0.85 : 1.4) {
          const hoop = new THREE.TorusGeometry(r1 + 0.06, 0.045, 4, 12);
          hoop.rotateX(Math.PI / 2);
          hoop.translate(0, hy, z);
          this.smallWood.push(colorize(hoop, woodCol.clone().multiplyScalar(1.15)));
        }
        // plane coords: x = aft distance, y = up from foot
        const geo = sailGeometry(
          new THREE.Vector2(0.15, throatY - footY),
          new THREE.Vector2(peakA, peakY - footY),
          new THREE.Vector2(0.15, 0.1),
          new THREE.Vector2(boomLen * 0.96, 0.1),
          1.2,
        );
        const sail = new THREE.Mesh(geo, this.sailEmblemMaterial);
        sail.position.set(0, footY, 0);
        sail.rotation.y = Math.PI / 2;
        sail.castShadow = true;
        pivot.add(sail);
        this.sails.push({ mesh: sail, tier: 0 });
        // a small square topsail above for charm
        const ty = y0 + H * 0.92;
        const half = B * 0.42;
        const tyard = spar(new THREE.Vector3(-half, ty, z), new THREE.Vector3(half, ty, z), 0.07, 0.05);
        this.woodParts.push(colorize(tyard, darkWood));
        const tgeo = sailGeometry(
          new THREE.Vector2(-half * 0.92, 0),
          new THREE.Vector2(half * 0.92, 0),
          new THREE.Vector2(-half * 1.05, -(ty - throatY - 0.4)),
          new THREE.Vector2(half * 1.05, -(ty - throatY - 0.4)),
          0.6,
        );
        const ts = new THREE.Mesh(tgeo, this.sailMaterial);
        ts.position.set(0, ty - 0.1, z + 0.18);
        ts.castShadow = true;
        this.root.add(ts);
        this.sails.push({ mesh: ts, tier: 1 });
      } else {
        // lateen: long slanted yard with a triangular sail
        const pivot = new THREE.Group();
        pivot.position.set(0, 0, z);
        this.root.add(pivot);
        this.foreAftPivots.push(pivot);
        const lowY = y0 + H * 0.3;
        const k = m.span ?? 1;
        const fwd = new THREE.Vector3(0, y0 + H * 0.42, c.length * 0.12 * k);
        const aft = new THREE.Vector3(0, y0 + H * 1.0, -c.length * 0.2 * k);
        const yard = spar(fwd, aft, 0.1, 0.06);
        const yardMesh = new THREE.Mesh(colorize(yard, darkWood), this.mats.wood);
        yardMesh.castShadow = true;
        pivot.add(yardMesh);
        const geo = sailGeometry(
          new THREE.Vector2(-fwd.z + 0.2, fwd.y - lowY - 0.1),
          new THREE.Vector2(-aft.z - 0.3, aft.y - lowY - 0.2),
          new THREE.Vector2(0.3, 0.05),
          new THREE.Vector2(-aft.z * 0.55, 0.05),
          0.9,
        );
        const sail = new THREE.Mesh(geo, this.sailMaterial);
        sail.position.set(0, lowY, 0);
        sail.rotation.y = Math.PI / 2;
        sail.castShadow = true;
        pivot.add(sail);
        this.sails.push({ mesh: sail, tier: 0 });
      }
      yield;
    }

    // bowsprit + jib
    const bowT = 0.985;
    const bowTop = new THREE.Vector3(0, s.top(bowT) - 0.1, s.z(bowT));
    const ang = 0.32;
    const tip = bowTop.clone().add(new THREE.Vector3(0, Math.sin(ang) * c.bowsprit, Math.cos(ang) * c.bowsprit));
    const bsDir = tip.clone().sub(bowTop).normalize();
    const bsHeel = bowTop.clone().add(new THREE.Vector3(0, -0.1, -1.6));
    this.woodParts.push(colorize(spar(bsHeel, tip, 0.2, 0.11), woodCol));
    // jib-boom run out beyond the bowsprit cap, with a gilded knob
    const jbEnd = tip.clone().addScaledVector(bsDir, c.bowsprit * 0.4);
    this.woodParts.push(colorize(spar(tip.clone().addScaledVector(bsDir, -1.2).add(new THREE.Vector3(0, 0.16, 0)), jbEnd.clone().add(new THREE.Vector3(0, 0.12, 0)), 0.09, 0.06, 6), woodCol));
    this.trimParts.push(ball(0.11, jbEnd.clone().add(new THREE.Vector3(0, 0.12, 0))));
    this.perches.push({ pos: jbEnd.clone().add(new THREE.Vector3(0, 0.23, 0)), spar: -1 });
    const capG = rbox(0.42, 0.62, 0.3, 0.1);
    capG.applyMatrix4(new THREE.Matrix4().compose(tip.clone().add(new THREE.Vector3(0, 0.1, 0)), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), bsDir), new THREE.Vector3(1, 1, 1)));
    this.woodParts.push(colorize(capG, darkWood));
    const heelDir = tip.clone().sub(bsHeel).normalize();
    for (const f of [0.45, 0.75]) {
      const band = new THREE.TorusGeometry(lerp(0.2, 0.11, f) + 0.012, 0.035, 4, 12);
      band.applyMatrix4(new THREE.Matrix4().compose(bsHeel.clone().lerp(tip, f), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), heelDir), new THREE.Vector3(1, 1, 1)));
      this.smallIron.push(band);
    }
    this.rope(jbEnd.clone().add(new THREE.Vector3(0, 0.12, 0)), mastTops[mastTops.length - 1], 0.03, TAR, 0.12);
    const fore = c.masts[c.masts.length - 1];
    const foreTop = mastTops[mastTops.length - 1];
    this.rope(foreTop, tip, 0.038, TAR, 0.1);
    this.rope(tip, this.head.foot, 0.05); // bobstay, down to the knee's cutwater under the figure
    // dolphin striker under the cap spreading the martingale, gammoning lashed round the heel,
    // and footropes slung under the jib-boom
    const strikerTop = tip.clone().add(new THREE.Vector3(0, -0.12, -0.05));
    const strikerEnd = strikerTop.clone().add(new THREE.Vector3(0, -1.0 - c.bowsprit * 0.08, 0.2));
    this.woodParts.push(colorize(spar(strikerTop, strikerEnd, 0.065, 0.045, 5), darkWood));
    this.ironParts.push(ball(0.06, strikerEnd, 5, 4));
    const jbTip = jbEnd.clone().add(new THREE.Vector3(0, 0.12, 0));
    this.rope(jbTip, strikerEnd, 0.03);
    for (const side of [1, -1]) {
      const bowY = s.top(0.95) - 0.9;
      this.rope(strikerEnd, s.skinPoint(0.95, bowY, side, 0.05), 0.03);
      const capP = tip.clone().add(new THREE.Vector3(0, 0.1, 0));
      let prev: THREE.Vector3 | null = null;
      for (let k = 0; k <= 5; k++) {
        const u = k / 5;
        const p = capP.clone().lerp(jbTip, u).add(new THREE.Vector3(side * 0.32, -0.25 - Math.sin(u * Math.PI) * 0.45, 0));
        if (prev) this.rope(prev, p, 0.02, HEMP);
        prev = p;
      }
    }
    for (const f of [0.1, 0.15, 0.2]) {
      const g = new THREE.TorusGeometry(lerp(0.2, 0.11, f) + 0.035, 0.03, 4, 10);
      g.applyMatrix4(new THREE.Matrix4().compose(bsHeel.clone().lerp(tip, f), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), heelDir), new THREE.Vector3(1, 1, 1)));
      this.smallWood.push(colorize(g, hexL(0x9a7a50)));
    }
    if (c.jib) {
      const pivot = new THREE.Group();
      pivot.position.set(0, 0, tip.z);
      this.root.add(pivot);
      this.foreAftPivots.push(pivot);
      const head = new THREE.Vector3(0, s.deckY(fore.t) + fore.height * 0.82, s.z(fore.t) + 0.3);
      const tack = tip.clone().add(new THREE.Vector3(0, 0.15, -0.4));
      const clew = new THREE.Vector3(0, s.top(0.9) + 1.0, s.z(fore.t) + (tip.z - s.z(fore.t)) * 0.32);
      const base = tack;
      // plane: x = aft distance from tip, y = up from tack
      const geo = sailGeometry(
        new THREE.Vector2(tip.z - head.z - 0.2, head.y - base.y),
        new THREE.Vector2(tip.z - head.z, head.y - base.y),
        new THREE.Vector2(0.4, 0.15),
        new THREE.Vector2(tip.z - clew.z, clew.y - base.y),
        0.8,
      );
      const sail = new THREE.Mesh(geo, this.sailMaterial);
      sail.position.set(0, base.y, 0);
      sail.rotation.y = Math.PI / 2;
      sail.castShadow = true;
      pivot.add(sail);
      this.sails.push({ mesh: sail, tier: 0 });
    }
    // stays between mastheads and to the stern
    for (let i = 0; i < mastTops.length - 1; i++) this.rope(mastTops[i], mastTops[i + 1].clone().add(new THREE.Vector3(0, -c.masts[i + 1].height * 0.35, 0)), 0.038, TAR, 0.12);
    for (const side of [1, -1]) this.rope(mastTops[0], s.skinPoint(0.05, s.top(0.05) + 0.05, side, -0.12), 0.03, TAR, 0.1);

    // the ship's flag on the tallest mast (so no gull sits on that cap)
    const flagCap = this.perches.findIndex((p) => p.pos.x === 0 && Math.abs(p.pos.z - maxMastTop.z) < 1e-4);
    if (flagCap >= 0) this.perches.splice(flagCap, 1);
    this.flagPivot.position.copy(maxMastTop).add(new THREE.Vector3(0, 0.35, 0));
    const flagW = 2.2 + c.length * 0.07;
    const flag = new THREE.Mesh(this.flagGeometry(flagW), this.mats.flag);
    flag.castShadow = true;
    this.flagPivot.add(flag);
    this.root.add(this.flagPivot);

    // and again as an ensign on a raked staff over the taffrail
    const et = 0.03;
    const ex = (c.sternCastle ? 0.3 : 0.5) * s.halfBeam(et); // clear of the stern lanterns
    const eBase = new THREE.Vector3(ex, s.top(et) - 0.1, s.z(et));
    const staffLen = 1.6 + c.length * 0.05;
    const eTop = eBase.clone().add(new THREE.Vector3(0, Math.cos(0.4), -Math.sin(0.4)).multiplyScalar(staffLen));
    this.woodParts.push(colorize(spar(eBase, eTop, 0.06, 0.04, 6), hexL(0x3e2a1a)));
    this.trimParts.push(ball(0.08, eTop.clone().add(new THREE.Vector3(0, 0.06, 0)), 6, 4));
    this.ensignPivot.position.copy(eTop);
    const ensign = new THREE.Mesh(this.flagGeometry(1.3 + c.length * 0.045), this.mats.flag);
    ensign.castShadow = true;
    this.ensignPivot.add(ensign);
    this.root.add(this.ensignPivot);
  }

  /** A flag plane hanging from its hoist at the origin, flying along +x. */
  private flagGeometry(w: number) {
    const h = w * FLAG_ASPECT;
    const g = new THREE.PlaneGeometry(w, h, 16, 4);
    g.translate(w / 2, -h / 2 + 0.05, 0);
    return g;
  }

  /** A line of rigging: a 1-pixel line from afar, laid rope of radius `r` up close. */
  private rope(a: THREE.Vector3, b: THREE.Vector3, r = 0.03, col = TAR, sag = 0) {
    this.ropes.push(a.x, a.y, a.z, b.x, b.y, b.z);
    if (this.detail) this.ropeTubes.push({ a: a.clone(), b: b.clone(), r, col, sag, radial: r > 0.025 ? 5 : 4 });
  }

  // ---------------------------------------------------------------- bow

  private buildBow() {
    const s = this.shape;
    const c = this.cls;
    const L = c.length;
    const darkWood = hexL(0x3e2a1a);
    const stemTop = new THREE.Vector3(0, s.top(1) - 0.55, s.z(1) + 0.25);
    // the knee of the head run out from the stem, and the figure on its tip (see figureheads.ts)
    const head = this.head;
    this.figureAt.copy(head.centre);
    this.figureReach = head.P(1.45, 0.8).z;
    const waleCol = hexL(this.livery.wale).lerp(hexL(this.livery.hull), 0.4);
    const knee = buildKnee(s, c, head, this.woodParts, this.trimParts, waleCol, this.detail);
    buildFigure(this.partKit(), this.parts.figure, head);
    // gilded trailboards: carved scrolls down each side of the bows, laid on the planking
    const onBow = (y: number, zz: number, side: number) => {
      const t = clamp(zz / L + 0.5, 0, 1);
      return new THREE.Vector3(side * (s.halfWidthAtY(t, y) + 0.05), y, zz);
    };
    for (const side of [1, -1]) {
      const path: [number, number][] = [
        [stemTop.y - 0.05, stemTop.z - 0.3],
        [stemTop.y - 0.32, stemTop.z - 0.62],
      ];
      const cy = stemTop.y - 0.58;
      const cz = stemTop.z - 0.98;
      for (let k = 0; k <= 12; k++) {
        const f = k / 12;
        const a = Math.PI / 2 + f * 1.15 * Math.PI * 2;
        const r = 0.24 * (1 - 0.7 * f);
        path.push([cy + Math.sin(a) * r, cz + Math.cos(a) * r]);
      }
      const pts = path.map(([y, zz]) => onBow(y, zz, side));
      this.trimParts.push(sweep(pts, (u) => lerp(0.085, 0.035, u), 6, 26));
      this.trimParts.push(ball(0.06, pts[pts.length - 1], 6, 4));
    }
    // curved head rails sweeping from the bows out along the knee to the figure's back
    for (const side of [1, -1]) {
      for (const [h, r, u] of [
        [0, 0.06, 0.32],
        [0.42, 0.048, 0.62],
      ]) {
        const t0 = 0.93;
        const y0 = s.top(t0) - 0.3 - h;
        const n = s.skinNormal(t0, y0, side);
        const p0 = s.skinPoint(t0, y0, side).addScaledVector(n, r);
        const kt = knee.top.getPoint(u);
        const p2 = new THREE.Vector3(side * (knee.half + r * 0.6), kt.y - r, kt.x);
        const p1 = new THREE.Vector3(side * lerp(Math.abs(p0.x), knee.half + 0.2, 0.6), lerp(p0.y, p2.y, 0.5) - 0.12, lerp(p0.z, p2.z, 0.55));
        // each rail ends in a little carved curl on the knee's cheek
        const curl = spiral(p2.clone().add(new THREE.Vector3(0, -0.1, 0)), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), 0.1, 0.85, Math.PI / 2, 8);
        this.trimParts.push(sweep([p0, p1, ...curl], (v) => (v < 0.75 ? r : lerp(r, r * 0.45, (v - 0.75) / 0.25)), 5, 22));
      }
      // cathead with an anchor hanging from it
      const ct = 0.88;
      const cy = s.top(ct) - 0.05;
      const hw = s.halfWidthAtY(ct, cy);
      const end = new THREE.Vector3(side * (hw + 0.75), cy + 0.08, s.z(ct) + 0.3);
      this.woodParts.push(colorize(spar(new THREE.Vector3(side * (hw - 0.4), cy, s.z(ct)), end, 0.13, 0.11, 6), darkWood));
      this.woodParts.push(colorize(ball(0.13, end, 6, 5), darkWood));
      const ak = 0.75 + L * 0.012;
      this.buildAnchor(end.clone().add(new THREE.Vector3(0, -0.15, 0)), ak);
      // hawse hole with an iron lip, the anchor cable running out of it to the ring
      const ht = 0.955;
      const hy = s.waleY(ht) + 0.42;
      const hn = s.skinNormal(ht, hy, side);
      const hm = surfaceMatrix(s.skinPoint(ht, hy, side, -0.02), hn);
      this.ironParts.push(new THREE.TorusGeometry(0.15, 0.045, 5, 12).applyMatrix4(hm));
      this.ironParts.push(new THREE.CircleGeometry(0.14, 10).applyMatrix4(hm));
      this.rope(s.skinPoint(ht, hy - 0.05, side, 0.04), end.clone().add(new THREE.Vector3(0, -0.15 - 0.12 * ak, 0)), 0.05, HEMP, 0.06);
    }
  }

  private buildAnchor(top: THREE.Vector3, k: number) {
    const ring = new THREE.TorusGeometry(0.13 * k, 0.03 * k, 4, 10);
    ring.rotateY(Math.PI / 2);
    ring.translate(top.x, top.y - 0.12 * k, top.z);
    const shank = new THREE.CylinderGeometry(0.05 * k, 0.065 * k, 1.25 * k, 6);
    shank.translate(top.x, top.y - 0.85 * k, top.z);
    const stock = new THREE.CylinderGeometry(0.045 * k, 0.045 * k, 0.9 * k, 6);
    stock.rotateX(Math.PI / 2);
    stock.translate(top.x, top.y - 0.38 * k, top.z);
    const arms = new THREE.TorusGeometry(0.42 * k, 0.055 * k, 5, 10, Math.PI);
    arms.rotateZ(Math.PI);
    arms.rotateY(Math.PI / 2);
    arms.translate(top.x, top.y - 1.05 * k, top.z);
    this.ironParts.push(ring, shank, stock, arms);
    for (const sz of [-1, 1]) {
      const fluke = new THREE.SphereGeometry(0.12 * k, 6, 4);
      fluke.scale(0.5, 1, 1);
      fluke.translate(top.x, top.y - 1.05 * k + 0.05 * k, top.z + sz * 0.42 * k);
      this.ironParts.push(fluke);
    }
  }

  // ---------------------------------------------------------------- details

  private *buildDetails(): Generator<void, void> {
    const s = this.shape;
    const c = this.cls;
    const barrelCol = hexL(0x8b5a33);
    const hoop = hexL(0x2f2a26);
    const crateCol = hexL(0xb08356);
    const grate = hexL(0x5a3e26);
    const coilCol = hexL(0xa3845a);

    const barrelG = lathe(
      [
        [0, 0],
        [0.235, 0],
        [0.27, 0.1],
        [0.3, 0.36],
        [0.27, 0.62],
        [0.235, 0.72],
        [0, 0.72],
      ],
      10,
    );
    const barrelAt = (x: number, z: number) => {
      const y = s.deckY(z / c.length + 0.5);
      this.woodParts.push(colorize(barrelG.clone().translate(x, y, z), barrelCol));
      for (const [hy, r] of [
        [0.14, 0.28],
        [0.58, 0.28],
      ]) {
        const h = new THREE.TorusGeometry(r, 0.025, 3, 12);
        h.rotateX(Math.PI / 2);
        h.translate(x, y + hy, z);
        this.smallWood.push(colorize(h, hoop));
      }
    };
    const crateAt = (x: number, z: number, sz: number, rot: number) => {
      const y = s.deckY(z / c.length + 0.5);
      const g = rbox(sz, sz, sz, sz * 0.12);
      g.rotateY(rot);
      g.translate(x, y + sz / 2, z);
      this.woodParts.push(colorize(g, crateCol));
      const lid = rbox(sz * 0.8, 0.04, sz * 0.8, 0.02);
      lid.rotateY(rot);
      lid.translate(x, y + sz, z);
      this.woodParts.push(colorize(lid, crateCol.clone().multiplyScalar(0.8)));
    };
    const coilAt = (x: number, z: number) => {
      const y = s.deckY(z / c.length + 0.5);
      for (const [r, dy] of [
        [0.3, 0.05],
        [0.22, 0.12],
      ]) {
        const g = new THREE.TorusGeometry(r, 0.06, 4, 12);
        g.rotateX(Math.PI / 2);
        g.translate(x, y + dy, z);
        this.smallWood.push(colorize(g, coilCol));
      }
    };

    // hatch gratings on the main deck: a raised coaming round a lattice over the dark hold
    for (const t of [0.46, 0.6]) {
      if (c.masts.some((m) => Math.abs(m.t - t) < 0.05)) continue;
      const y = s.mainDeckY(t);
      const z = s.z(t);
      const w = c.beam * 0.28;
      const l = c.length * 0.07;
      const ch = 0.24;
      for (const sx of [-1, 1]) {
        this.woodParts.push(colorize(rbox(0.14, ch, l, 0.04, 1).translate((sx * (w - 0.14)) / 2, y + ch / 2, z), grate));
        this.woodParts.push(colorize(rbox(w, ch, 0.14, 0.04, 1).translate(0, y + ch / 2, z + (sx * (l - 0.14)) / 2), grate));
      }
      this.woodParts.push(colorize(new THREE.BoxGeometry(w - 0.2, 0.02, l - 0.2).translate(0, y + 0.08, z), hexL(0x120c08), 0));
      const pitch = this.detail ? 0.17 : 0.26;
      const nx = Math.max(2, Math.floor((w - 0.28) / pitch));
      const nz = Math.max(2, Math.floor((l - 0.28) / pitch));
      const barCol = grate.clone().multiplyScalar(1.25);
      for (let i = 1; i < nx; i++) this.smallWood.push(colorize(new THREE.BoxGeometry(0.05, 0.07, l - 0.24).translate(-w / 2 + 0.14 + ((w - 0.28) * i) / nx, y + ch - 0.06, z), barCol, 0.02));
      for (let i = 1; i < nz; i++) this.smallWood.push(colorize(new THREE.BoxGeometry(w - 0.24, 0.05, 0.05).translate(0, y + ch - 0.05, z - l / 2 + 0.14 + ((l - 0.28) * i) / nz), barCol, 0.02));
    }
    // barrels, crates and coiled lines by the masts
    const B = c.beam;
    c.masts.forEach((m, i) => {
      const z = s.z(m.t);
      barrelAt(B * 0.24, z - 0.9);
      barrelAt(B * 0.27, z - 0.3);
      if (i % 2 === 0) crateAt(-B * 0.24, z - 0.8, 0.6, 0.3);
      else barrelAt(-B * 0.26, z + 0.7);
      coilAt(-B * 0.1, z + 0.9);
    });
    crateAt(B * 0.2, s.z(0.86), 0.5, 0.7);

    yield;
    // ship's wheel near the stern
    const wt = c.sternCastle ? c.sternCastle.t * 0.55 : 0.16;
    const wy = s.deckY(wt) + 1.05;
    const wz = s.z(wt);
    const wheelCol = barrelCol.clone().multiplyScalar(1.1);
    const wheel = new THREE.TorusGeometry(0.42, 0.05, 6, 20);
    wheel.translate(0, wy, wz);
    this.woodParts.push(colorize(wheel, wheelCol));
    const hubRing = new THREE.TorusGeometry(0.17, 0.035, 5, 14);
    this.trimParts.push(hubRing.translate(0, wy, wz));
    const spoke = lathe(
      [
        [0.024, 0],
        [0.03, 0.42],
        [0.045, 0.47],
        [0.03, 0.52],
        [0.04, 0.58],
        [0.03, 0.63],
        [0, 0.65],
      ],
      5,
    );
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const g = spoke.clone();
      g.rotateZ(a - Math.PI / 2);
      this.woodParts.push(colorize(g.translate(0, wy, wz), wheelCol));
    }
    this.trimParts.push(ball(0.09, new THREE.Vector3(0, wy, wz - 0.04), 6, 4));
    // the drum the tiller ropes wind round, between two stanchions
    const drum = new THREE.CylinderGeometry(0.17, 0.17, 0.6, 10);
    drum.rotateX(Math.PI / 2);
    this.woodParts.push(colorize(drum.translate(0, wy, wz + 0.42), barrelCol.clone().multiplyScalar(0.85)));
    this.ironParts.push(spar(new THREE.Vector3(0, wy, wz - 0.08), new THREE.Vector3(0, wy, wz + 0.8), 0.04, 0.04, 5));
    for (const dz of [0.08, 0.76]) {
      const st = rbox(0.22, 1.12, 0.12, 0.05, 1);
      this.woodParts.push(colorize(st.translate(0, s.deckY(wt) + 0.56, wz + dz), grate));
    }
    for (const sx of [-1, 1]) this.rope(new THREE.Vector3(sx * 0.1, wy - 0.12, wz + 0.42), new THREE.Vector3(sx * 0.35, s.deckY(wt) + 0.02, wz + 0.42), 0.018, HEMP);
    this.deckProps.push({ x: 0, z: wz + 0.48, r: 0.4 });
    // binnacle: a turned pedestal with a brass hood over the compass
    const bz = wz + 1.25;
    const by = s.deckY(wt);
    const bin = lathe(
      [
        [0, 0],
        [0.28, 0],
        [0.28, 0.08],
        [0.2, 0.16],
        [0.17, 0.62],
        [0.24, 0.72],
        [0.24, 0.82],
        [0, 0.82],
      ],
      10,
    );
    this.woodParts.push(colorize(bin.translate(0, by, bz), barrelCol));
    const hood = new THREE.SphereGeometry(0.24, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    this.trimParts.push(hood.translate(0, by + 0.82, bz));
    this.trimParts.push(ball(0.05, new THREE.Vector3(0, by + 1.08, bz), 5, 4));
    for (const sx of [-1, 1]) this.smallIron.push(ball(0.09, new THREE.Vector3(sx * 0.34, by + 0.75, bz), 7, 5));
    this.deckProps.push({ x: 0, z: bz, r: 0.34 });

    yield;
    // skylight over the great cabin, where the quarterdeck has room for it
    if (c.sternCastle) {
      const front = s.z(c.sternCastle.t) - 0.75;
      const zz = (bz + 0.9 + front) / 2;
      if (front - (bz + 0.9) > 0.9) {
        const ky = s.deckY(c.sternCastle.t * 0.9);
        this.woodParts.push(colorize(rbox(1.15, 0.42, 0.95, 0.06, 1).translate(0, ky + 0.21, zz), hexL(this.livery.strake).multiplyScalar(0.7)));
        for (const sx of [-1, 1]) {
          const pane = new THREE.BoxGeometry(0.5, 0.03, 0.8);
          pane.rotateZ(sx * 0.42);
          this.ironParts.push(pane.translate(sx * 0.25, ky + 0.53, zz));
          for (const dz of [-0.26, 0, 0.26]) {
            const bar = new THREE.BoxGeometry(0.52, 0.035, 0.035);
            bar.rotateZ(sx * 0.42);
            this.smallTrim.push(bar.translate(sx * 0.25, ky + 0.56, zz + dz));
          }
        }
        this.trimParts.push(spar(new THREE.Vector3(0, ky + 0.64, zz - 0.42), new THREE.Vector3(0, ky + 0.64, zz + 0.42), 0.035, 0.035, 5));
        this.deckProps.push({ x: 0, z: zz, r: 0.7 });
      }
    }

    // ship's bell in a little belfry on the break of the castle
    const belfry = c.foreCastle ? { t: c.foreCastle.t, f: -1, h: c.foreCastle.h } : c.sternCastle ? { t: c.sternCastle.t, f: 1, h: c.sternCastle.h } : null;
    if (belfry) {
      const ry = s.sheer(belfry.t) + belfry.h - c.bulwark + 0.7;
      const rz = s.z(belfry.t) + belfry.f * 0.05;
      for (const sx of [-1, 1]) this.woodParts.push(colorize(rbox(0.09, 0.62, 0.09, 0.03, 1).translate(sx * 0.27, ry + 0.31, rz), grate));
      this.woodParts.push(colorize(rbox(0.7, 0.1, 0.14, 0.04, 1).translate(0, ry + 0.64, rz), grate));
      const bell = lathe(
        [
          [0, 0],
          [0.17, 0],
          [0.16, 0.04],
          [0.12, 0.12],
          [0.1, 0.24],
          [0.07, 0.3],
          [0, 0.31],
        ],
        12,
      );
      this.trimParts.push(bell.translate(0, ry + 0.24, rz));
      this.ironParts.push(ball(0.035, new THREE.Vector3(0, ry + 0.2, rz), 5, 4));
    }

    // pin rails along the bulwarks at each mast, belaying pins set with coils hung off them
    const pin = lathe(
      [
        [0, -0.1],
        [0.022, -0.1],
        [0.022, 0.05],
        [0.036, 0.07],
        [0.03, 0.14],
        [0.04, 0.18],
        [0, 0.2],
      ],
      5,
    );
    const pinCol = hexL(0xc79a62);
    const gunZs = this.cannonTs().map((t) => s.z(t));
    const hangCoil = (x: number, y: number, z: number, along: 'x' | 'z') => {
      const g = new THREE.TorusGeometry(0.15, 0.035, 4, 10);
      if (along === 'z') g.rotateY(Math.PI / 2);
      g.scale(1, 1.5, 1);
      this.smallWood.push(colorize(g.translate(x, y - 0.24, z), coilCol));
    };
    for (const m of c.masts) {
      const t = m.t + 0.55 / c.length;
      const dy = s.deckY(t);
      const ry = dy + 0.6;
      const zc = s.z(t);
      for (const side of [1, -1]) {
        const x = side * (s.halfWidthAtY(t, ry) - 0.13 - 0.1);
        const zs = [-0.5, -0.25, 0, 0.25, 0.5].map((dz) => zc + dz).filter((zz) => !gunZs.some((g) => Math.abs(g - zz) < 0.45));
        if (zs.length < 2) continue;
        const z0 = zs[0] - 0.15;
        const z1 = zs[zs.length - 1] + 0.15;
        this.woodParts.push(colorize(rbox(0.2, 0.09, z1 - z0, 0.035, 1).translate(x, ry, (z0 + z1) / 2), grate));
        for (const zz of zs) this.smallWood.push(colorize(pin.clone().translate(x, ry, zz), pinCol, 0.08));
        for (const zz of [zs[0], zs[zs.length - 1]]) hangCoil(x - side * 0.02, ry, zz, 'z');
      }
      // a fife rail by the foot of the mast
      if (m.rig === 'lateen') continue;
      const fz = s.z(m.t) + this.fifeSide(m.t) * 0.78;
      const fy = s.deckY(m.t);
      for (const sx of [-1, 1]) {
        const postG = lathe(
          [
            [0, 0],
            [0.08, 0],
            [0.08, 0.06],
            [0.05, 0.12],
            [0.065, 0.45],
            [0.05, 0.78],
            [0.07, 0.82],
            [0, 0.86],
          ],
          6,
        );
        this.woodParts.push(colorize(postG.translate(sx * 0.52, fy, fz), barrelCol));
        hangCoil(sx * 0.52, fy + 0.66, fz - 0.09, 'x');
      }
      this.woodParts.push(colorize(rbox(1.25, 0.1, 0.18, 0.04, 1).translate(0, fy + 0.8, fz), grate));
      for (const px of [-0.3, -0.1, 0.1, 0.3]) this.smallWood.push(colorize(pin.clone().translate(px, fy + 0.8, fz), pinCol, 0.08));
      this.deckProps.push({ x: 0, z: fz, r: 0.6 });
      // halyards and lifts led down from aloft and belayed round the pins
      const mr = 0.12 + m.height * 0.0085;
      const upY = m.top ? fy + m.height * 0.6 - 0.36 : fy + m.height * 0.5;
      for (const px of [-0.3, -0.1, 0.1, 0.3]) {
        const sx = Math.sign(px);
        this.rope(new THREE.Vector3(px, fy + 0.95, fz), new THREE.Vector3(sx * (mr + 0.12 + Math.abs(px) * 0.15), upY, s.z(m.t) - 0.05), 0.017, HEMP);
      }
      if (this.detail && this.fifeSide(m.t) > 0 && m.rig === 'square') {
        // the clewlines abaft the mast belay to a pair of bitts there
        const bz = s.z(m.t) - 0.72;
        for (const sx of [-1, 1]) this.fineWood.push(colorize(rbox(0.12, 0.9, 0.12, 0.03, 1).translate(sx * 0.4, fy + 0.45, bz), barrelCol));
        this.fineWood.push(colorize(rbox(0.95, 0.1, 0.14, 0.03, 1).translate(0, fy + 0.84, bz), grate));
      }
    }

    // galley stovepipe forward of the foremast, smoking when the cook is busy
    {
      const fm = c.masts[c.masts.length - 1];
      const t = fm.t + 2.4 / c.length;
      const x = -c.beam * 0.13;
      const z = s.z(t);
      const y = s.mainDeckY(t);
      this.ironParts.push(new THREE.CylinderGeometry(0.2, 0.22, 0.12, 8).translate(x, y + 0.06, z));
      this.ironParts.push(spar(new THREE.Vector3(x, y, z), new THREE.Vector3(x, y + 1.15, z), 0.11, 0.1, 8));
      const elbowTop = new THREE.Vector3(x, y + 1.15, z);
      const mouth = elbowTop.clone().add(new THREE.Vector3(0, 0.22, -0.28));
      this.ironParts.push(spar(elbowTop, mouth, 0.1, 0.12, 8));
      this.ironParts.push(ball(0.105, elbowTop, 8, 5));
      this.chimney = mouth;
      this.deckProps.push({ x, z, r: 0.35 });
    }

    // capstan with its bars shipped
    const capT = 0.53;
    const capZ = s.z(capT) + (c.masts.some((m) => Math.abs(m.t - capT) < 0.05) ? 1.6 : 0);
    const capY = s.mainDeckY(capT);
    const cap = lathe(
      [
        [0, 0],
        [0.45, 0],
        [0.45, 0.1],
        [0.32, 0.18],
        [0.28, 0.5],
        [0.38, 0.62],
        [0.38, 0.76],
        [0, 0.8],
      ],
      12,
    );
    cap.translate(0, capY, capZ);
    this.woodParts.push(colorize(cap, barrelCol));
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      this.smallWood.push(colorize(spar(new THREE.Vector3(0, capY + 0.68, capZ), new THREE.Vector3(Math.cos(a) * 0.8, capY + 0.68, capZ + Math.sin(a) * 0.8), 0.04, 0.035, 4), grate));
    }

    // ship's boat stowed on skids amidships
    if (c.id === 'galleon') this.buildBoat(new THREE.Vector3(0, s.mainDeckY(0.62) + 0.62, s.z(0.62)), 4.4, 1.7);

    // stern lanterns: glowing glass under iron caps with gilded finials
    const lanterns = c.sternCastle ? [-0.6, 0, 0.6] : [0];
    for (const lx of lanterns) {
      const k = lx === 0 && c.sternCastle ? 1.35 : 1;
      const ty = s.top(0.01);
      const x = lx * s.halfBeam(0.01);
      const z = s.z(0.01) - 0.05;
      const pole = new THREE.CylinderGeometry(0.04, 0.05, 0.6 * k, 5);
      pole.translate(x, ty + 0.3 * k, z);
      this.ironParts.push(pole);
      const lamp = new THREE.SphereGeometry(0.2 * k, 8, 6);
      lamp.scale(1, 1.35, 1);
      lamp.translate(x, ty + 0.82 * k, z);
      this.glowParts.push(lamp);
      const capg = new THREE.ConeGeometry(0.24 * k, 0.24 * k, 8);
      capg.translate(x, ty + 1.15 * k, z);
      this.ironParts.push(capg);
      const base = new THREE.CylinderGeometry(0.17 * k, 0.12 * k, 0.1 * k, 8);
      base.translate(x, ty + 0.58 * k, z);
      this.ironParts.push(base);
      this.trimParts.push(ball(0.07 * k, new THREE.Vector3(x, ty + 1.3 * k, z), 6, 4));
    }
  }

  /**
   * The lived-in layer: bronze swivel guns on the rails, entry battens and man
   * ropes up the side, scuppers, fire buckets and a sea chest by the break of
   * the deck, and the ship's cat keeping an eye on things from a crate.
   */
  private buildDeckLife() {
    const s = this.shape;
    const c = this.cls;
    const L = c.length;
    const darkWood = hexL(0x3e2a1a);

    // swivel guns on their iron crutches along the rail aft (and forward, if she has a forecastle)
    const swivelTs = [c.sternCastle ? c.sternCastle.t * 0.45 : 0.13, c.foreCastle ? (c.foreCastle.t + 0.96) / 2 : 0.8];
    const sw = lathe(
      [
        [0, -0.36],
        [0.04, -0.35],
        [0.05, -0.3],
        [0.035, -0.27],
        [0.06, -0.24],
        [0.055, 0.0],
        [0.045, 0.3],
        [0.055, 0.34],
        [0.035, 0.36],
        [0.035, 0.3],
        [0, 0.3],
      ],
      this.detail ? 8 : 6,
    );
    for (const t of swivelTs) {
      if (c.masts.some((m) => Math.abs(m.t - t) * L < 1.6)) continue;
      for (const side of [1, -1]) {
        const ry = s.top(t) + 0.03;
        const rx = side * (s.halfWidthAtY(t, s.top(t)) - 0.065);
        const z = s.z(t);
        const y = ry + 0.2;
        // the crutch: a post dropped into the rail, a fork cradling the trunnions
        this.ironParts.push(spar(new THREE.Vector3(rx, ry - 0.05, z), new THREE.Vector3(rx, y - 0.05, z), 0.025, 0.025, 5));
        const fork = new THREE.TorusGeometry(0.07, 0.016, 4, 8, Math.PI);
        fork.rotateY(Math.PI / 2);
        fork.rotateX(Math.PI);
        this.ironParts.push(fork.translate(rx, y + 0.02, z));
        const g = sw.clone();
        g.rotateZ((-side * Math.PI) / 2 + side * 0.08);
        this.trimParts.push(g.translate(rx + side * 0.06, y + 0.02, z));
        // the tiller to train it by, angled down and inboard
        this.ironParts.push(spar(new THREE.Vector3(rx - side * 0.29, y + 0.01, z), new THREE.Vector3(rx - side * 0.62, y - 0.1, z), 0.014, 0.012, 4));
        this.ironParts.push(ball(0.025, new THREE.Vector3(rx - side * 0.63, y - 0.1, z), 5, 3));
      }
    }

    // entry battens and man ropes up the side amidships, between two guns
    const ts = this.cannonTs();
    const gaps = ts.slice(1).map((t, i) => (t + ts[i]) / 2);
    // between two guns, clear of the channels and chainplates
    const entry = gaps.filter((t) => c.masts.every((m) => Math.abs(m.t - t) > 0.075)).sort((a, b) => Math.abs(a - 0.5) - Math.abs(b - 0.5))[0];
    const et = entry ?? -1;
    for (const side of et > 0 ? [1, -1] : []) {
      const top = s.top(et);
      for (let y = 0.35; y < top - 0.25; y += 0.36) {
        const n = s.skinNormal(et, y, side);
        const m = surfaceMatrix(s.skinPoint(et, y, side, 0.02), n);
        this.smallWood.push(colorize(new THREE.BoxGeometry(0.46, 0.07, 0.1).translate(0, 0, 0.04).applyMatrix4(m), darkWood.clone().multiplyScalar(1.3)));
      }
      if (this.detail) {
        for (const dz of [-0.36, 0.36]) {
          const tt = et + dz / L;
          const a = s.skinPoint(tt, top + 0.5, side, -0.08);
          const b = s.skinPoint(tt, 0.45, side, 0.12);
          this.ropeTubes.push({ a, b, r: 0.016, col: HEMP, sag: 0.04, radial: 4 });
          this.fineIron.push(spar(s.skinPoint(tt, top - 0.1, side, -0.08), a, 0.016, 0.016, 4));
          this.fineTrim.push(ball(0.03, a, 5, 4));
        }
        // scuppers: lead-lined drains through the side at the waterway
        for (const tt of gaps) {
          if (Math.abs(tt - et) < 0.02) continue;
          const y = s.mainDeckY(tt) + 0.06;
          const m = surfaceMatrix(s.skinPoint(tt, y, side, 0.014), s.skinNormal(tt, y, side));
          this.fineIron.push(new THREE.CircleGeometry(0.06, 8).scale(1.3, 0.8, 1).applyMatrix4(m));
        }
      }
    }

    if (!this.detail) return;

    // fire buckets in a row and a sailor's sea chest at the break of the quarterdeck
    const bt = c.sternCastle ? c.sternCastle.t : 0.3;
    const bz = s.z(bt) + (c.sternCastle ? 0.42 : 0);
    const by = s.mainDeckY(bt + 0.42 / L);
    const bx = Math.min(c.beam * 0.26, s.halfWidthAtY(bt, by) - 1.2);
    const bucket = lathe(
      [
        [0, 0],
        [0.1, 0],
        [0.13, 0.26],
        [0.115, 0.27],
        [0.105, 0.04],
        [0, 0.04],
      ],
      9,
    );
    const leather = hexL(0x3a2418);
    for (let i = 0; i < 3; i++) {
      const x = bx + (i - 1) * 0.3;
      this.fineWood.push(colorize(bucket.clone().translate(x, by, bz), leather));
      // a painted band and a rope bail
      this.fineWood.push(colorize(new THREE.TorusGeometry(0.122, 0.012, 3, 10).rotateX(Math.PI / 2).translate(x, by + 0.18, bz), hexL(this.livery.trim)));
      this.fineWood.push(colorize(new THREE.TorusGeometry(0.12, 0.01, 3, 8, Math.PI).translate(x, by + 0.27, bz), HEMP));
    }
    this.deckProps.push({ x: bx, z: bz, r: 0.55 });
    {
      const x = -bx;
      const z = bz + 0.05;
      const chest = rbox(0.8, 0.38, 0.46, 0.04, 1).translate(x, by + 0.19, z);
      this.fineWood.push(colorize(chest, hexL(0x6b4a2c)));
      // a rounded lid and iron straps
      const lid = new THREE.CylinderGeometry(0.23, 0.23, 0.8, 10, 1, false, -Math.PI / 2, Math.PI);
      lid.rotateZ(Math.PI / 2);
      this.fineWood.push(colorize(lid.scale(1, 0.45, 1).translate(x, by + 0.38, z), hexL(0x5a3c22)));
      for (const sx of [-0.27, 0.27]) {
        const strap = new THREE.TorusGeometry(0.235, 0.014, 3, 10, Math.PI);
        strap.rotateY(Math.PI / 2);
        this.fineIron.push(strap.scale(1, 0.47, 1).translate(x + sx, by + 0.38, z));
        this.fineIron.push(new THREE.BoxGeometry(0.03, 0.38, 0.48).translate(x + sx, by + 0.19, z));
      }
      this.fineTrim.push(rbox(0.09, 0.1, 0.03, 0.01, 1).translate(x, by + 0.33, z + 0.24));
      this.deckProps.push({ x, z, r: 0.55 });
    }

    // the ship's cat, sat on the crate in the bows with her tail curled round her paws
    {
      const sz = 0.5;
      const zc = s.z(0.86);
      const x0 = c.beam * 0.2;
      const y0 = s.deckY(0.86) + sz + 0.04;
      const fur = [hexL(0xd9853b), hexL(0x2a2622), hexL(0x8a8580), hexL(0xe8e0d0)][Math.floor(Math.random() * 4)];
      const k = 1.0;
      const face = Math.random() * Math.PI * 2;
      const rot = new THREE.Matrix4().makeRotationY(face);
      const at = new THREE.Matrix4().makeTranslation(x0, y0, zc).multiply(rot);
      const parts: THREE.BufferGeometry[] = [];
      parts.push(new THREE.SphereGeometry(0.1 * k, 9, 7).scale(0.85, 1.05, 1.2).translate(0, 0.1, -0.02)); // haunches
      parts.push(new THREE.SphereGeometry(0.07 * k, 8, 6).scale(0.8, 1.2, 0.9).translate(0, 0.17, 0.05)); // chest
      parts.push(new THREE.SphereGeometry(0.058 * k, 9, 7).scale(1.05, 0.95, 1).translate(0, 0.27, 0.07)); // head
      parts.push(new THREE.SphereGeometry(0.024, 6, 4).scale(1.1, 0.8, 1).translate(0, 0.255, 0.122)); // muzzle
      for (const ex of [-1, 1]) {
        const ear = new THREE.ConeGeometry(0.022, 0.05, 4);
        ear.rotateZ(-ex * 0.25);
        parts.push(ear.translate(ex * 0.034, 0.325, 0.065));
        parts.push(new THREE.SphereGeometry(0.022, 6, 4).scale(0.8, 0.6, 1.4).translate(ex * 0.03, 0.012, 0.1)); // front paws
      }
      parts.push(sweep([new THREE.Vector3(0, 0.04, -0.12), new THREE.Vector3(0.09, 0.02, -0.09), new THREE.Vector3(0.11, 0.015, 0.02), new THREE.Vector3(0.06, 0.015, 0.1)], (u) => lerp(0.022, 0.014, u), 5, 10));
      for (const g of parts) this.fineWood.push(colorize(g.applyMatrix4(at), fur, 0.03));
      // glossy dark eyes and a pink nose
      for (const ex of [-1, 1]) this.fineIron.push(new THREE.SphereGeometry(0.011, 5, 4).translate(ex * 0.023, 0.282, 0.118).applyMatrix4(at));
      this.fineWood.push(colorize(new THREE.SphereGeometry(0.008, 4, 3).translate(0, 0.27, 0.147).applyMatrix4(at), hexL(0xd27a82)));
    }
  }

  /**
   * A merchantman's deck cargo: tarpaulins lashed down over her hatches,
   * crates stacked in pairs, barrels laid in tiers and chocked, sacks piled
   * against the bulwarks. Stowed clear of the masts and capstan, and set down
   * as deck props so the crew walk round it.
   */
  private buildCargo(amount: number) {
    const s = this.shape;
    const c = this.cls;
    const L = c.length;
    const B = c.beam;
    // a fixed pattern per hull, so every ship of a kind is stowed alike
    let seed = Math.round(L * 131 + B * 17);
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const crateCols = [hexL(0xb08356), hexL(0x9c7046), hexL(0xc29a68), hexL(0x8a6a48)];
    const stripe = hexL(this.livery.strake);
    // weathered tarpaulin, tarred dark against the spray
    const tarp = hexL(0x6e6853);
    const barrelCol = hexL(0x8b5a33);
    const hoop = hexL(0x2f2a26);
    const burlap = hexL(0xb39566);
    const clear = (t: number, r: number) => c.masts.every((m) => Math.abs(m.t - t) * L > 1.5 + r) && Math.abs(t - 0.53) * L > 1.1 + r;
    const prop = (x: number, z: number, r: number) => this.deckProps.push({ x, z, r });

    // tarpaulins over the hatches, humped over the goods beneath and roped down
    for (const t of [0.46, 0.6]) {
      if (c.masts.some((m) => Math.abs(m.t - t) < 0.05)) continue;
      const y = s.mainDeckY(t);
      const z = s.z(t);
      const w = B * 0.34;
      const l = L * 0.085;
      const h = 0.55 + 0.35 * amount;
      this.woodParts.push(colorize(rbox(w, h, l, Math.min(0.3, h * 0.45), 2).translate(0, y + h / 2, z), tarp, 0.03));
      for (const f of [-0.3, 0.3]) {
        const band = new THREE.TorusGeometry(w * 0.5, 0.03, 3, 12, Math.PI);
        band.scale(1, (h + 0.04) / (w * 0.5), 1);
        this.smallWood.push(colorize(band.translate(0, y + 0.02, z + f * l), HEMP));
      }
      prop(0, z, Math.max(w, l) * 0.55);
    }

    const crate = (x: number, y: number, z: number, sz: number, rot: number) => {
      const col = crateCols[Math.floor(rnd() * crateCols.length)];
      this.woodParts.push(colorize(rbox(sz, sz * 0.82, sz, sz * 0.1, 1).rotateY(rot).translate(x, y + sz * 0.41, z), col, 0.04));
      // a painted house band round some of them
      if (rnd() < 0.45) this.smallWood.push(colorize(new THREE.BoxGeometry(sz * 1.02, sz * 0.12, sz * 1.02).rotateY(rot).translate(x, y + sz * 0.5, z), stripe));
    };
    const barrel = lathe(
      [
        [0, 0],
        [0.2, 0],
        [0.23, 0.08],
        [0.255, 0.3],
        [0.23, 0.52],
        [0.2, 0.6],
        [0, 0.6],
      ],
      9,
    );
    const cask = (x: number, y: number, z: number) => {
      // laid on her side, fore and aft
      this.woodParts.push(colorize(barrel.clone().translate(0, -0.3, 0).rotateX(Math.PI / 2).translate(x, y + 0.25, z), barrelCol, 0.06));
      for (const dz of [-0.17, 0.17]) this.smallWood.push(colorize(new THREE.TorusGeometry(0.24, 0.02, 3, 10).translate(x, y + 0.25, z + dz), hoop));
    };
    const sack = (x: number, y: number, z: number, k: number) => {
      const g = new THREE.SphereGeometry(0.3 * k, 7, 5).scale(1, 0.55, 0.78).rotateY(rnd() * Math.PI);
      this.woodParts.push(colorize(g.translate(x, y + 0.14 * k, z), burlap, 0.08));
    };

    // stacks along both sides of the waist, clear of the masts, the capstan and the gangway down the middle
    const sc = c.sternCastle?.t ?? 0.12;
    const fc = c.foreCastle?.t ?? 0.86;
    for (let t = sc + 1.4 / L; t < fc - 1.2 / L; t += 1.35 / L) {
      for (const side of [1, -1]) {
        if (rnd() > 0.45 + amount * 0.5) continue;
        const kind = rnd();
        const y = s.mainDeckY(t);
        const hw = s.halfWidthAtY(t, y + 0.3) - 0.2;
        const z = s.z(t);
        if (kind < 0.42) {
          const sz = 0.55 + rnd() * 0.2;
          if (!clear(t, sz * 0.7)) continue;
          const x = side * (hw - sz * 0.62);
          if (Math.abs(x) < B * 0.2) continue;
          crate(x, y, z, sz, (rnd() - 0.5) * 0.3);
          // a second crate stacked on top, a little askew
          if (rnd() < 0.55 * amount + 0.15) crate(x + (rnd() - 0.5) * 0.1, y + sz * 0.82, z + (rnd() - 0.5) * 0.12, sz * 0.82, (rnd() - 0.5) * 0.6);
          prop(x, z, sz * 0.75);
        } else if (kind < 0.74) {
          if (!clear(t, 0.7)) continue;
          // a tier of casks: two below, one chocked in on top
          const x = side * (hw - 0.3);
          if (Math.abs(x) < B * 0.2) continue;
          const xi = x - side * 0.5;
          cask(x, y, z);
          cask(xi, y, z);
          if (rnd() < 0.6) cask((x + xi) / 2, y + 0.42, z);
          prop((x + xi) / 2, z, 0.75);
        } else {
          if (!clear(t, 0.5)) continue;
          const x = side * (hw - 0.32);
          if (Math.abs(x) < B * 0.2) continue;
          sack(x, y, z - 0.25, 1);
          sack(x - side * 0.08, y, z + 0.3, 0.9);
          if (rnd() < 0.7) sack(x - side * 0.04, y + 0.2, z + 0.02, 0.85);
          prop(x, z, 0.6);
        }
      }
    }
  }

  private buildBoat(at: THREE.Vector3, len: number, wid: number) {
    const hullCol = hexL(this.livery.boot);
    const rimCol = hexL(this.livery.strake);
    const floorCol = hexL(0xa9814f);
    const depth = 0.55;
    const hull = new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    hull.scale(wid / 2, depth, len / 2);
    hull.translate(at.x, at.y, at.z);
    this.woodParts.push(colorize(hull, hullCol));
    const floor = new THREE.CircleGeometry(1, 16);
    floor.rotateX(-Math.PI / 2);
    floor.scale(wid * 0.44, 1, len * 0.44);
    floor.translate(at.x, at.y - 0.12, at.z);
    this.woodParts.push(colorize(floor, floorCol));
    const rim: THREE.Vector3[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      rim.push(new THREE.Vector3(at.x + Math.cos(a) * wid * 0.48, at.y + 0.02, at.z + Math.sin(a) * len * 0.48));
    }
    this.woodParts.push(colorize(tube(rim, 0.07, true, 5, 3), rimCol));
    for (const f of [-0.25, 0.08, 0.36]) {
      const w = wid * Math.sqrt(1 - (f * 2) ** 2) * 0.9;
      const th = rbox(w, 0.06, 0.26, 0.025);
      th.translate(at.x, at.y - 0.06, at.z + f * len);
      this.woodParts.push(colorize(th, floorCol.clone().multiplyScalar(0.85)));
    }
    // skids across the deck
    const skidCol = hexL(0x3e2a1a);
    for (const f of [-0.28, 0.28]) {
      const sk = rbox(wid * 1.5, 0.5, 0.22, 0.06);
      sk.translate(at.x, at.y - 0.62, at.z + f * len);
      this.woodParts.push(colorize(sk, skidCol));
    }
  }

  // ---------------------------------------------------------------- upgrade parts

  /** What the part builders may touch. */
  private partKit(): PartKit {
    return {
      shape: this.shape,
      cls: this.cls,
      livery: this.livery,
      detail: this.detail,
      wood: this.woodParts,
      iron: this.ironParts,
      trim: this.trimParts,
      glow: this.glowParts,
      smallWood: this.smallWood,
      smallIron: this.smallIron,
      fineIron: this.fineIron,
      spinners: this.spinnerSpecs,
      cannonTs: this.cannonTs(),
      masts: this.masts,
      rope: (a, b, r, col, sag) => this.rope(a, b, r, col, sag),
    };
  }

  /** Hull plating and the sails' mast dressing (guns and figureheads go on with the standard fittings they replace). */
  private buildParts() {
    const p = this.parts;
    if (!p.hull && !p.sails) return;
    const kit = this.partKit();
    if (p.hull) buildHullPart(kit, p.hull);
    if (p.sails) buildSailPart(kit, p.sails);
  }

  /** Floating parts drift and turn; call every frame with the world clock. */
  tick(time: number) {
    for (const s of this.spinners) {
      s.mesh.quaternion.copy(s.q0).multiply(_spinQ.setFromAxisAngle(s.axis, time * s.spin + s.phase));
      s.mesh.position.copy(s.p0);
      s.mesh.position.y += Math.sin(time * s.rate + s.phase) * s.bob;
    }
  }

  // ---------------------------------------------------------------- merge

  private *finish(): Generator<void, void> {
    // metal, gilt and lamps take their colour from the vertex paint; standard fittings get the usual one
    const paint = (parts: THREE.BufferGeometry[], c: THREE.Color, jitter: number) => {
      for (const g of parts) if (!g.getAttribute('color')) colorize(g, c, jitter);
    };
    const trimCol = hexL(this.livery.trim);
    paint(this.ironParts, METAL.iron, 0.03);
    paint(this.smallIron, METAL.iron, 0.03);
    paint(this.fineIron, METAL.iron, 0.03);
    paint(this.trimParts, trimCol, 0.02);
    paint(this.smallTrim, trimCol, 0.02);
    paint(this.fineTrim, trimCol, 0.02);
    paint(this.glowParts, GLOW.window, 0);
    for (const sp of this.spinnerSpecs) {
      const mesh = new THREE.Mesh(sp.geo, sp.mat === 'glow' ? this.mats.glow : this.mats.iron);
      mesh.position.copy(sp.pos);
      mesh.quaternion.copy(sp.quat);
      this.root.add(mesh);
      this.spinners.push({ mesh, q0: sp.quat.clone(), p0: sp.pos.clone(), axis: sp.axis, spin: sp.spin, bob: sp.bob, rate: sp.rate, phase: sp.phase });
    }
    this.spinnerSpecs = [];
    const mk = (parts: THREE.BufferGeometry[], mat: THREE.Material, keepColor: boolean, shadow = true) => {
      const merged = mergeParts(parts, keepColor);
      if (!merged) return;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      this.root.add(mesh);
    };
    mk(this.woodParts, this.mats.wood, true);
    yield;
    mk(this.ironParts, this.mats.iron, true);
    yield;
    mk(this.trimParts, this.mats.trim, true);
    yield;
    mk(this.glowParts, this.mats.glow, true, false);
    yield;
    mk(this.smallWood, this.mats.wood, true, false);
    yield;
    mk(this.smallIron, this.mats.iron, true, false);
    yield;
    mk(this.smallTrim, this.mats.trim, true, false);
    yield;
    // close-range detail rides the same materials (no new shaders), but stays out of the shadow pass
    const fine = (parts: THREE.BufferGeometry[], mat: THREE.Material, keepColor: boolean) => {
      const merged = mergeParts(parts, keepColor);
      if (!merged) return;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.receiveShadow = true;
      mesh.userData.fine = true;
      mesh.userData.lod = true;
      this.root.add(mesh);
      this.fineMeshes.push(mesh);
    };
    fine(this.fineWood, this.mats.wood, true);
    yield;
    fine(this.fineIron, this.mats.iron, true);
    yield;
    fine(this.fineTrim, this.mats.trim, true);
    yield;
    this.addRopeMesh(this.root, this.ropeTubes);
    if (this.ropes.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.ropes, 3));
      const ls = new THREE.LineSegments(g, this.mats.rope);
      ls.userData.lod = true;
      this.root.add(ls);
      this.lineMeshes.push(ls);
    }
    if (this.ratlines.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.ratlines, 3));
      const ls = new THREE.LineSegments(g, this.mats.ratline);
      ls.userData.lod = true;
      this.root.add(ls);
      this.lineMeshes.push(ls);
    }
    this.fineWood = [];
    this.fineIron = [];
    this.fineTrim = [];
    this.ropeTubes = [];
    this.buildLods();
    this.root.traverse((o) => {
      o.matrixAutoUpdate = true;
    });
  }

  /**
   * Simplified levels of the core meshes (hull, planking, ironwork, trim): a
   * near and a far one for the main view, and a welded, pruned stand-in that
   * casts the shadow instead of the full mesh. Each is only an index over the
   * mesh's own vertices (see render/lod.ts).
   */
  private buildLods() {
    for (const child of [...this.root.children]) {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || mesh.userData.fine || Array.isArray(mesh.material)) continue;
      const opts = patchInfo.get(mesh.material)?.opts;
      // the sails and flags bend in the vertex shader: their flat rest pose would fold away
      if (opts?.sail || opts?.flag) continue;
      const full = mesh.geometry;
      const jobs = [LOD_NEAR.job, LOD_FAR.job];
      if (mesh.castShadow) jobs.push(LOD_SHADOW);
      this.lodPending++;
      void simplifiedLevels(full, jobs).then(([near, far, shadow]) => {
        this.lodPending--;
        // gone, or already cut up by a hit while the worker was busy
        if (this.lodGone || mesh.geometry !== full || mesh.parent !== this.root || mesh.userData.dmgOff) {
          for (const g of [near, far, shadow]) if (g) disposeLevel(g);
          return;
        }
        let proxy: THREE.Mesh | null = null;
        if (shadow) {
          proxy = shadowOnly(new THREE.Mesh(shadow, mesh.material));
          proxy.customDepthMaterial = mesh.customDepthMaterial;
          proxy.position.copy(mesh.position);
          proxy.quaternion.copy(mesh.quaternion);
          proxy.scale.copy(mesh.scale);
          proxy.receiveShadow = false;
          proxy.visible = false;
          proxy.userData.dmgSkip = true;
          proxy.userData.lodProxy = true;
          this.root.add(proxy);
        }
        if (near || far || proxy) this.lods.push({ mesh, full, near, far, proxy });
        if (!this.lodPending && !this.lodHeld) this.resumeLods();
      });
    }
  }

  /** Puts every full mesh back (and its own shadow) before the damage model cuts them. */
  suspendLods() {
    this.lodHeld = true;
    if (!this.lodLive) return;
    this.lodLive = false;
    this.lodLevel = -1;
    for (const l of this.lods) {
      l.mesh.geometry = l.full;
      if (l.proxy) {
        l.proxy.visible = false;
        l.mesh.castShadow = true;
      }
    }
  }

  /** Back to the light levels once the rig is whole and every mesh has its own geometry again. */
  resumeLods() {
    this.lodHeld = false;
    if (this.lodLive || this.lodPending || !this.lods.length) return;
    for (const l of this.lods) if (l.mesh.geometry !== l.full || l.mesh.userData.dmgOff || l.mesh.parent !== this.root) return;
    this.lodLive = true;
    for (const l of this.lods) {
      if (!l.proxy) continue;
      l.proxy.visible = true;
      l.mesh.castShadow = false;
    }
  }

  /** Laid rope for one assembly (the hull, or a yard that braces round): close range only. */
  private addRopeMesh(parent: THREE.Object3D, specs: RopeSpec[]) {
    const g = ropeGeometry(specs);
    if (!g) return;
    const mesh = new THREE.Mesh(g, this.mats.wood);
    mesh.receiveShadow = true;
    mesh.userData.fine = true;
    mesh.userData.lod = true;
    mesh.userData.rope = true;
    parent.add(mesh);
    this.fineMeshes.push(mesh);
  }

  /**
   * Level of detail by how big the ship sits on screen (pixels per metre at
   * her distance). Close up she shows her laid rope, blocks, lanyards and deck
   * clutter; further out those drop away and hairline rigging takes over.
   * Both sets carry userData.lod, so a breaking mast still cuts them while
   * they're hidden.
   */
  updateDetail(pxPerM: number) {
    if (this.lodLive) {
      const was = this.lodLevel;
      // each boundary leans toward the level already showing, so a ship
      // sitting right on one doesn't flick back and forth
      const nearT = LOD_NEAR.below * (was >= 1 ? 1.08 : 0.92);
      const farT = LOD_FAR.below * (was === 2 ? 1.08 : 0.92);
      const level = pxPerM < farT ? 2 : pxPerM < nearT ? 1 : 0;
      if (level !== was) {
        this.lodLevel = level;
        for (const l of this.lods) l.mesh.geometry = (level === 2 ? (l.far ?? l.near) : level === 1 ? l.near : null) ?? l.full;
      }
    }
    if (this.fineOn ? pxPerM < FINE_OFF : pxPerM > FINE_ON) this.fineOn = !this.fineOn;
    const near = this.fineOn && this.fineMeshes.length > 0;
    // anything the damage model has taken down (dmgOff) stays down
    for (const m of this.fineMeshes) if (!m.userData.dmgOff) m.visible = near;
    for (const l of this.lineMeshes) if (!l.userData.dmgOff) l.visible = !near;
  }

  /** Visual sailing state: furl/brace/billow/flag. */
  updateRig(sailLevel: number, braceAngle: number, leeSide: number, windRelAngle: number, fill: number) {
    for (const s of this.sails) {
      const lvl = clamp(sailLevel * 1.15 - s.tier * 0.12, 0.08, 1);
      s.mesh.scale.y = lvl;
      s.mesh.visible = sailLevel > 0.02 || s.tier === 0;
    }
    for (const p of this.yardPivots) p.rotation.y = braceAngle;
    for (const p of this.foreAftPivots) {
      p.rotation.y = -leeSide * 0.35 * (0.4 + 0.6 * fill);
      // billow follows the swing through flat; never exactly 0 so normals stay valid
      const bz = (leeSide < 0 ? -1 : 1) * Math.max(0.04, Math.abs(leeSide));
      for (const ch of p.children) if ((ch as THREE.Mesh).geometry?.getAttribute('aBillow')) ch.scale.z = bz;
    }
    this.flagPivot.rotation.y = windRelAngle;
    this.ensignPivot.rotation.y = windRelAngle;
    this.sailUniforms.uSailFill.value = fill * sailLevel;
  }

  /** Dresses the ship in a vault skin (null or pattern 0: her own paintwork). Uniforms only, never a recompile. */
  setSkin(skin: SkinItem | null) {
    const u = this.skinUniforms;
    if (u === NO_SKIN) return;
    u.uSkin.value = skin ? skin.pattern : 0;
    if (!skin || !skin.pattern) return;
    u.uSkinA.value.set(skin.colors[0]);
    u.uSkinB.value.set(skin.colors[1]);
    u.uSkinC.value.set(skin.colors[2]);
    u.uSkinP.value.set(skin.glow, skin.sail, 0, (skin.pattern * 7.31) % 10);
  }

  /** Repaints flag and sails in place for a new livery with the same hull. */
  restyle(livery: Livery) {
    if (!this.owned) return;
    this.skinUniforms.uSkinCloth.value.set(livery.sail);
    flagTexture(livery, this.mats.flag.map as THREE.CanvasTexture);
    sailTexture(livery, false, 5, this.mats.sailPlain as THREE.CanvasTexture);
    sailTexture(livery, true, 5, this.mats.sailEmblem as THREE.CanvasTexture);
  }

  /** Repaints just the flag (cheap; used while painting). */
  restyleFlag(livery: Livery) {
    if (this.owned) flagTexture(livery, this.mats.flag.map as THREE.CanvasTexture);
  }

  dispose() {
    // the levels not on show (the ship's own traversal disposes the rest)
    this.lodGone = true;
    for (const l of this.lods) {
      if (l.mesh.geometry !== l.full) l.full.dispose();
      for (const g of [l.near, l.far]) if (g && l.mesh.geometry !== g) disposeLevel(g);
    }
    this.lods = [];
    this.sailMaterial.dispose();
    this.sailEmblemMaterial.dispose();
    const m = this.mats;
    if (this.dressed) {
      // only what dress() made: the hull's textures belong to the cache
      m.flag.map?.dispose();
      for (const mat of [m.hull, m.wood, m.flag]) mat.dispose();
      m.sailPlain.dispose();
      m.sailEmblem.dispose();
      return;
    }
    if (!this.owned) return;
    for (const mat of [m.hull, m.stern, m.wood, m.iron, m.trim, m.glow, m.flag, m.rope, m.ratline]) {
      const ms = mat as THREE.MeshStandardMaterial;
      if (ms.map && ms.map !== sharedDeck?.map) ms.map.dispose();
      if (ms.emissiveMap) ms.emissiveMap.dispose();
      if (mat === m.hull && ms.normalMap) ms.normalMap.dispose();
      mat.dispose();
    }
    m.sailPlain.dispose();
    m.sailEmblem.dispose();
  }
}
