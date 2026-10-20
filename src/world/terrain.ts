import * as THREE from 'three';
import { Simplex2, mulberry32, clamp, lerp, smoothstep } from '../core/noise';
import { patchMaterial } from '../render/environment';
import { createTerrainMaterial } from './terrainMaterial';
import { WORLD_SIZE } from './worldSize';

export type IslandKind = 'lush' | 'volcanic' | 'atoll' | 'rocky' | 'karst';

/**
 * Which archipelago's character a Terrain is built with: the sunny home isles,
 * or Las Brumas, misty emerald karst: limestone towers standing out of jade
 * water, pink coral sand and dense flowering jungle.
 */
export type TerrainStyle = 'home' | 'brumas';

/**
 * A coral reef out in open water, far from any island: a barrier arc with
 * passes through it, a horseshoe ring round a sandy pool, or a scatter of
 * coral heads. Its crest lies a metre or two under the surface, so a sloop's
 * shallow keel slips over most of it while a deep galleon grinds and sticks.
 */
export type ReefKind = 'barrier' | 'horseshoe' | 'teeth';

export interface Reef {
  name: string;
  kind: ReefKind;
  /** Middle of the reef, and a radius that takes all of it in (m). */
  x: number;
  z: number;
  r: number;
  /** Crest arcs round a centre (cx, cz) of radius R from angle a0 to a1, half-width w. */
  arcs: { cx: number; cz: number; R: number; a0: number; a1: number; w: number; passes: number[] }[];
  /** Lone coral heads (bommies): top radius r. */
  heads: { x: number; z: number; r: number }[];
  /** The sandy pool inside a horseshoe. */
  pool: { x: number; z: number; r: number } | null;
  seed: number;
}

/** Depth of a reef's crest (m), before the coral heads on it. */
const REEF_CREST = -1.45;
/** Nothing on a reef comes nearer the surface than this. */
const REEF_TOP = -0.34;

export interface Island {
  name: string;
  kind: IslandKind;
  x: number;
  z: number;
  r: number;
  peak: number;
  rot: number;
  stretch: number;
  seed: number;
  tint: number; // -1..1 hue / lushness variation
  /** The archipelago it belongs to. */
  style: TerrainStyle;
  /** Karst only: the limestone towers rising out of it (and the sea stacks off its shore). */
  towers?: { x: number; z: number; r: number; h: number; seed: number }[];
}

/**
 * The seabed as the rest of the game asks after it: one archipelago (Terrain)
 * or all of them stitched into one sea (Seas, see world/seas.ts).
 */
export interface SeaFloor {
  readonly islands: Island[];
  readonly reefs: Reef[];
  heightAt(x: number, z: number): number;
  reefAt(x: number, z: number): number;
  reefNear(x: number, z: number, pad?: number): Reef | null;
  lagoonAt(x: number, z: number): boolean;
  gradientAt(x: number, z: number, out: THREE.Vector2): THREE.Vector2;
  nearestIsland(x: number, z: number): { island: Island; dist: number } | null;
  stampAO(x: number, z: number, radius: number, strength: number): void;
  stampCanopy(x: number, z: number, radius: number, strength: number): void;
  carveAbyss(x: number, z: number, r: number): void;
}

export { WORLD_SIZE };
export const CELL = 2;
export const GRID_N = WORLD_SIZE / CELL + 1;
const HALF = WORLD_SIZE / 2;
export const FLOOR_DEPTH = -17;
/** The floor of an abyss under a maelstrom's eye (m). */
const ABYSS = -92;

// An invented island tongue: Spanish at heart, Portuguese in the vowels, a
// French lilt, Dutch dikes and corners, and old Taíno words underneath.
const NAMES = [
  'Ilhéu Corazinha', 'Cayo Vliemar', "Baía d'Ambrela", 'Esmeraldijk', 'Guanaverde', 'Punta Belleau',
  'Roca Corvão', 'Isla Marézia', 'Cayo Solenne', 'Perlabana', 'Azulhoek', 'Brisagüey', 'Ilha Nacaréu',
];
// Las Brumas, in the same tongue: mist, drizzle and dew (bruma, garoa, orvalho,
// nevel, brume), needles and towers of stone, and the ceiba and yaruma trees.
const BRUMAS_HERO = 'Peña Nebulosa';
const BRUMAS_NAMES = [
  'Cayo Garoa', 'Agulhas do Vento', 'Mornebrume', 'Nevelhoek', 'Isla Ceibana', 'Torre de Jade',
  'Ilhéu Orvalho', 'Roque Velado', 'Boca de Yaruma', 'Pináculo Azahar',
];


function smax(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

/** Colour of the endless deep seabed plane (matches T_SAND_DEEP in the ground shader). */
const DEEP_SAND = new THREE.Color(0xa99a76).convertSRGBToLinear();
/** Side of each archipelago's seabed plane (m). */
const FLOOR_SPAN = WORLD_SIZE * 4;

export class Terrain implements SeaFloor {
  /** Centre of this archipelago's square, and its south-west (min x, min z) corner. */
  readonly ox: number;
  readonly oz: number;
  readonly x0: number;
  readonly z0: number;
  readonly style: TerrainStyle;
  readonly heights = new Float32Array(GRID_N * GRID_N);
  readonly ao = new Float32Array(GRID_N * GRID_N).fill(1);
  /** How much tree canopy shades each cell (0..1): forest floor under the trees. */
  readonly canopy = new Float32Array(GRID_N * GRID_N);
  readonly islands: Island[] = [];
  /** Island index owning each cell (-1 = open sea); used for colouring. */
  private owner = new Int8Array(GRID_N * GRID_N).fill(-1);
  /** Normalised inland depth (0 at the shore, 1 at the island centre) of the owner. */
  private inland = new Float32Array(GRID_N * GRID_N);
  private lastInland = 0;
  /** 1 inside an atoll's lagoon, where the reef ring breaks the swell. */
  private lagoon = new Uint8Array(GRID_N * GRID_N);
  private lastLagoon = 0;
  /** Open-sea coral reefs (see Reef). */
  readonly reefs: Reef[] = [];
  /** Abysses carved under the maelstroms, so their throats have somewhere to go. */
  readonly abysses: { x: number; z: number; r: number }[] = [];
  /** How much reef each cell is (0..1): living coral a keel can strike. */
  private reefMask = new Float32Array(GRID_N * GRID_N);
  private simplex: Simplex2;
  private seed: number;
  /** Shared across archipelagos: the ground, its lite cousin and the seabed. */
  private static mats: Partial<Record<'full' | 'lite' | 'floor', THREE.Material>> = {};

  constructor(seed = 1337, opts: { ox?: number; oz?: number; style?: TerrainStyle } = {}) {
    this.seed = seed;
    this.ox = opts.ox ?? 0;
    this.oz = opts.oz ?? 0;
    this.x0 = this.ox - HALF;
    this.z0 = this.oz - HALF;
    this.style = opts.style ?? 'home';
    this.simplex = new Simplex2(seed);
    if (this.style === 'brumas') this.placeBrumas();
    else this.placeIslands();
    this.placeReefs();
    this.buildHeights();
    this.buildReefs();
  }

  // ---------------------------------------------------------------- layout

  private placeIslands() {
    const rnd = mulberry32(this.seed * 7 + 3);
    const names = NAMES.slice();
    const pickName = () => names.splice(Math.floor(rnd() * names.length), 1)[0] ?? 'Ilhéu';
    // A hero volcano anchors the composition north of the spawn point.
    this.islands.push({
      name: 'Morro Huracão', kind: 'volcanic', x: -30, z: -170, r: 125, peak: 62, rot: 0.4, stretch: 1.18,
      seed: rnd() * 100, tint: 0.2, style: 'home',
    });
    // A lagoon atoll near spawn so the first thing you see is turquoise water.
    this.islands.push({
      name: pickName(), kind: 'atoll', x: 190, z: 150, r: 78, peak: 2.2, rot: rnd() * 6, stretch: 1.1,
      seed: rnd() * 100, tint: 0, style: 'home',
    });
    const kinds: IslandKind[] = ['lush', 'lush', 'rocky', 'lush', 'atoll', 'rocky', 'lush', 'atoll', 'lush', 'rocky'];
    let attempts = 0;
    let ki = 0;
    while (this.islands.length < 12 && attempts < 4000) {
      attempts++;
      const kind = kinds[ki % kinds.length];
      const r = kind === 'atoll' ? 50 + rnd() * 40 : kind === 'rocky' ? 42 + rnd() * 38 : 50 + rnd() * 55;
      const ang = rnd() * Math.PI * 2;
      const dist = Math.sqrt(rnd()) * 780;
      const x = Math.cos(ang) * dist;
      const z = Math.sin(ang) * dist;
      // keep spawn waters open
      if (Math.hypot(x - 0, z - 150) < r + 90) continue;
      let ok = true;
      for (const o of this.islands) {
        const need = (o.r + r) * 1.32 + 70;
        if (Math.hypot(o.x - x, o.z - z) < need) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const peak = kind === 'atoll' ? 2.0 + rnd() * 0.6 : kind === 'rocky' ? 24 + rnd() * 18 : 14 + rnd() * 22;
      this.islands.push({
        name: pickName(), kind, x, z, r, peak, rot: rnd() * Math.PI, stretch: 1 + rnd() * 0.45,
        seed: rnd() * 100, tint: rnd() * 2 - 1, style: 'home',
      });
      ki++;
    }
  }


  /**
   * Las Brumas: a great karst massif in the middle, then a ring of islands
   * round it, most of them crowned with limestone towers, a lagoon atoll and
   * a couple of low jungle isles. Positions are about the archipelago's centre.
   */
  private placeBrumas() {
    const rnd = mulberry32(this.seed * 7 + 3);
    const names = BRUMAS_NAMES.slice();
    const pickName = () => names.splice(Math.floor(rnd() * names.length), 1)[0] ?? 'Ilhéu';
    const { ox, oz } = this;
    const add = (name: string, kind: IslandKind, x: number, z: number, r: number, peak: number, stretch: number, tint: number) => {
      const isl: Island = { name, kind, x, z, r, peak, rot: rnd() * Math.PI, stretch, seed: rnd() * 100, tint, style: 'brumas' };
      if (kind === 'karst') isl.towers = this.raiseTowers(isl, rnd);
      this.islands.push(isl);
    };
    add(BRUMAS_HERO, 'karst', ox + 60, oz + 40, 130, 9, 1.15, 0.3);
    const kinds: IslandKind[] = ['karst', 'karst', 'lush', 'karst', 'atoll', 'karst', 'lush', 'karst', 'karst', 'lush'];
    let attempts = 0;
    let ki = 0;
    while (this.islands.length < 10 && attempts < 4000) {
      attempts++;
      const kind = kinds[ki % kinds.length];
      const r = kind === 'atoll' ? 60 + rnd() * 25 : kind === 'karst' ? 52 + rnd() * 40 : 50 + rnd() * 40;
      const ang = rnd() * Math.PI * 2;
      const dist = 280 + Math.sqrt(rnd()) * 520;
      const x = ox + Math.cos(ang) * dist;
      const z = oz + Math.sin(ang) * dist;
      let ok = true;
      for (const o of this.islands) {
        const need = (o.r + r) * 1.32 + 80;
        if (Math.hypot(o.x - x, o.z - z) < need) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const peak = kind === 'atoll' ? 2.0 + rnd() * 0.6 : kind === 'karst' ? 5 + rnd() * 4 : 12 + rnd() * 16;
      add(pickName(), kind, x, z, r, peak, 1 + rnd() * 0.4, rnd() * 2 - 1);
      ki++;
    }
  }

  /**
   * Limestone towers for a karst isle: a crowd of them on its body, a few
   * leaning out over the water on its rim, and sea stacks standing alone in
   * the shallows offshore. Sheer sides, jungle on top.
   */
  private raiseTowers(isl: Island, rnd: () => number) {
    const out: NonNullable<Island['towers']> = [];
    const big = isl.r > 110;
    const n = big ? 11 : 4 + Math.floor(rnd() * 4);
    for (let i = 0; i < 80 && out.length < n; i++) {
      const a = rnd() * Math.PI * 2;
      const f = Math.sqrt(rnd()) * 0.72;
      const r = (big ? 16 : 11) + rnd() * (big ? 20 : 13);
      const x = isl.x + Math.cos(a) * isl.r * f * isl.stretch;
      const z = isl.z + Math.sin(a) * isl.r * f;
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < (o.r + r) * 0.8)) continue;
      // the tallest stand nearest the heart of the island
      const h = (big ? 34 : 24) + rnd() * (big ? 30 : 20) + (1 - f) * 14;
      out.push({ x, z, r, h, seed: rnd() * 100 });
    }
    // sea stacks: one to three out in the shallows, the karst's sentinels
    const stacks = 1 + Math.floor(rnd() * (big ? 4 : 3));
    let placed = 0;
    for (let i = 0; i < 40 && placed < stacks; i++) {
      const a = rnd() * Math.PI * 2;
      const d = isl.r * (1.08 + rnd() * 0.32);
      const r = 6 + rnd() * 7;
      const x = isl.x + Math.cos(a) * d * isl.stretch;
      const z = isl.z + Math.sin(a) * d;
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + 6)) continue;
      out.push({ x, z, r, h: 16 + rnd() * 22, seed: rnd() * 100 });
      placed++;
    }
    return out;
  }

  // ---------------------------------------------------------------- heights

  private islandHeight(isl: Island, x: number, z: number): number {
    const s = this.simplex;
    const dx = x - isl.x;
    const dz = z - isl.z;
    const cr = Math.cos(isl.rot);
    const sr = Math.sin(isl.rot);
    let lx = (dx * cr + dz * sr) / isl.stretch;
    let lz = (-dx * sr + dz * cr) * isl.stretch;
    lx += s.noise(x * 0.0105 + isl.seed, z * 0.0105) * isl.r * 0.2;
    lz += s.noise(x * 0.0105 - 40.3, z * 0.0105 + isl.seed) * isl.r * 0.2;
    let d = Math.sqrt(lx * lx + lz * lz) / isl.r;
    this.lastInland = 0;
    this.lastLagoon = 0;
    const ang = Math.atan2(lz, lx);
    const lobes = s.fbm(Math.cos(ang) * 1.15 + isl.seed * 3.1, Math.sin(ang) * 1.15 - isl.seed, 3);
    d *= 1 + lobes * (isl.kind === 'atoll' ? 0.12 : 0.34);
    // fine coastline wiggle
    d += s.noise(x * 0.045, z * 0.045 + isl.seed) * 0.03;

    if (isl.kind === 'atoll') {
      const ringR = 0.7;
      let ringF = 0.17 - Math.abs(d - ringR);
      const gap = s.noise(Math.cos(ang) * 2.4 + isl.seed, Math.sin(ang) * 2.4 + 9.1);
      ringF -= Math.max(0, gap) * 0.2;
      if (ringF > 0) {
        return 2.3 * smoothstep(0, 0.09, ringF) + s.noise(x * 0.06, z * 0.06) * 0.25 * smoothstep(0, 0.1, ringF);
      }
      if (d < ringR) {
        this.lastLagoon = 1;
        const lag = -2.4 + s.fbm(x * 0.02, z * 0.02, 2) * 0.9;
        return lerp(0, lag, smoothstep(0, 0.07, -ringF));
      }
      return this.shelf(-ringF * 0.9, x, z, 0.0);
    }

    const f = 1 - d;
    this.lastInland = Math.max(0, f);
    if (f <= 0) {
      const sh = this.shelf(-f, x, z, isl.kind === 'lush' ? 1 : 0.5);
      return isl.towers ? Math.max(sh, this.towerHeight(isl, x, z)) : sh;
    }

    const beachW = isl.kind === 'rocky' ? 0.05 : isl.kind === 'volcanic' ? 0.09 : 0.13;
    const beach = 1.35 * smoothstep(0, beachW, f);
    const m = smoothstep(beachW * 0.6, 0.98, f);
    let h: number;
    if (isl.kind === 'rocky') {
      const ridge = 0.65 + 0.55 * s.ridged(x * 0.011 + isl.seed, z * 0.011, 4);
      h = isl.peak * Math.pow(m, 0.8) * ridge;
      const step = 3.4;
      const k = h / step;
      const fl = Math.floor(k);
      h = step * (fl + smoothstep(0.2, 0.8, k - fl));
      h += beach;
    } else {
      const ridge = 0.5 + 0.8 * s.ridged(x * 0.0085 + isl.seed, z * 0.0085 - isl.seed, 5);
      h = beach + isl.peak * Math.pow(m, 1.55) * ridge;
      h += 3.2 * m * (s.fbm(x * 0.028, z * 0.028, 3) * 0.5 + 0.5);
      if (isl.kind === 'volcanic') {
        // crater rim at the summit
        const c = smoothstep(0.8, 0.97, f);
        h -= isl.peak * 0.32 * c;
      }
      if (isl.towers) h = Math.max(h, this.towerHeight(isl, x, z));
    }
    return h;
  }

  /**
   * The tallest limestone tower over (x, z): sheer, fluted walls (a few metres
   * from foot to lip, so they read as cliffs) up to a rounded, lumpy top where
   * the jungle grows. Far below anything where no tower stands.
   */
  private towerHeight(isl: Island, x: number, z: number): number {
    const s = this.simplex;
    let best = -40;
    for (const t of isl.towers!) {
      const dx = x - t.x;
      const dz = z - t.z;
      const reach = t.r * 1.45 + 6;
      if (dx * dx + dz * dz > reach * reach) continue;
      const a = Math.atan2(dz, dx);
      // fluted, craggy walls: rain carves grooves down the stone and buttresses stand out
      const flute = s.noise(Math.cos(a) * 2.6 + t.seed, Math.sin(a) * 2.6 - t.seed) * 0.16 + s.noise(Math.cos(a) * 7 + t.seed * 2, Math.sin(a) * 7) * 0.05;
      const d = Math.hypot(dx, dz) / (t.r * (1 + flute));
      const wall = 1 - smoothstep(0.86, 1.04, d + s.noise(x * 0.09 + t.seed, z * 0.09) * 0.04);
      if (wall <= 0) continue;
      // a domed, knobbly top that drops off at the lip
      const top = t.h * (1 - d * d * 0.16) + s.ridged(x * 0.045 + t.seed, z * 0.045, 3) * 3.4 - 1.7;
      const h = lerp(-30, top, Math.pow(wall, 0.6));
      if (h > best) best = h;
    }
    return best;
  }

  /** Underwater shelf profile; s = normalised distance beyond the shore. */
  private shelf(s: number, x: number, z: number, reef: number): number {
    let h = -2.8 * smoothstep(0, 0.3, s) - 14.5 * smoothstep(0.2, 0.95, s);
    if (reef > 0) h += reef * 1.6 * Math.exp(-Math.pow((s - 0.36) / 0.055, 2)) * (0.6 + 0.4 * this.simplex.noise(x * 0.03, z * 0.03));
    return h;
  }

  // ---------------------------------------------------------------- reefs

  private placeReefs() {
    const rnd = mulberry32(this.seed * 13 + 5);
    const plan: [string, ReefKind][] = this.style === 'brumas'
      ? [
          ['Bajo de las Agujas', 'teeth'],
          ['Os Recifes Velados', 'barrier'],
          ['La Herradura Nevel', 'horseshoe'],
        ]
      : [
          ['Rif do Diablo', 'barrier'],
          ['La Ferradura', 'horseshoe'],
          ['Os Dentelles', 'teeth'],
          ['Bajo de las Opías', 'teeth'],
        ];
    const home = this.style === 'home';
    const TAU = Math.PI * 2;
    for (const [name, kind] of plan) {
      for (let attempt = 0; attempt < 3000; attempt++) {
        const ang = rnd() * TAU;
        const dist = 220 + Math.sqrt(rnd()) * 660;
        const x = this.ox + Math.cos(ang) * dist;
        const z = this.oz + Math.sin(ang) * dist;
        const seed = rnd() * 100;
        const arcs: Reef['arcs'] = [];
        const heads: Reef['heads'] = [];
        let pool: Reef['pool'] = null;
        let r: number;
        if (kind === 'barrier') {
          // a long gentle arc, its hollow side sheltering a few lone heads
          const R = 120 + rnd() * 70;
          const span = 1.05 + rnd() * 0.55;
          const mid = rnd() * TAU;
          const cx = x - Math.cos(mid) * R;
          const cz = z - Math.sin(mid) * R;
          const w = 10 + rnd() * 4;
          // one or two passes through it, where a deep keel can thread the coral
          const passes = rnd() < 0.5 ? [0.38 + rnd() * 0.24] : [0.22 + rnd() * 0.14, 0.64 + rnd() * 0.14];
          arcs.push({ cx, cz, R, a0: mid - span / 2, a1: mid + span / 2, w, passes });
          for (let i = 0; i < 7; i++) {
            const a = mid + (rnd() - 0.5) * span * 0.9;
            const rr = R - 26 - rnd() * 46;
            heads.push({ x: cx + Math.cos(a) * rr, z: cz + Math.sin(a) * rr, r: 3.5 + rnd() * 6 });
          }
          r = R * Math.sin(span / 2) + w * 3 + 20;
        } else if (kind === 'horseshoe') {
          // a ring of coral round a pale sandy pool, open on one side
          const R = 54 + rnd() * 16;
          const gap = 0.85 + rnd() * 0.3;
          const open = rnd() * TAU;
          const w = 9 + rnd() * 2.5;
          arcs.push({ cx: x, cz: z, R, a0: open + gap / 2, a1: open + TAU - gap / 2, w, passes: [] });
          pool = { x, z, r: R - w * 0.6 };
          for (let i = 0; i < 4; i++) {
            const a = open + (rnd() - 0.5) * gap * 1.6;
            const rr = R + 18 + rnd() * 30;
            heads.push({ x: x + Math.cos(a) * rr, z: z + Math.sin(a) * rr, r: 3 + rnd() * 4 });
          }
          r = R + w * 3 + 34;
        } else {
          // the teeth: a maze of coral heads, some fused into ridges
          const spread = 70 + rnd() * 30;
          const n = 18 + Math.floor(rnd() * 6);
          for (let i = 0; i < n; i++) {
            const a = rnd() * TAU;
            const rr = Math.sqrt(rnd()) * spread;
            const hx = x + Math.cos(a) * rr;
            const hz = z + Math.sin(a) * rr;
            heads.push({ x: hx, z: hz, r: 5 + rnd() * 8 });
            if (rnd() < 0.35) {
              const b = rnd() * TAU;
              heads.push({ x: hx + Math.cos(b) * 9, z: hz + Math.sin(b) * 9, r: 4 + rnd() * 5 });
            }
          }
          r = spread + 30;
        }
        if (Math.hypot(x - this.ox, z - this.oz) + r > 900) continue;
        // well clear of every island (their towns, forts and anchorages), of the
        // waters you set sail in, and of each other
        if (home && (Math.hypot(x - 0, z - 150) < r + 260 || Math.hypot(x - 40, z - 210) < r + 260)) continue;
        let ok = true;
        for (const isl of this.islands) {
          const ir = isl.r * Math.max(isl.stretch, 1 / isl.stretch) * 1.2 + 36;
          if (Math.hypot(isl.x - x, isl.z - z) < ir + r) {
            ok = false;
            break;
          }
        }
        for (const o of this.reefs) if (Math.hypot(o.x - x, o.z - z) < o.r + r + 110) ok = false;
        if (!ok) continue;
        this.reefs.push({ name, kind, x, z, r, arcs, heads, pool, seed });
        break;
      }
    }
  }

  /** Height of one reef at (x, z), and how much living coral is there (the pool's sand isn't). */
  private reefHeight(rf: Reef, x: number, z: number, out: [number, number]): [number, number] {
    const s = this.simplex;
    const TAU = Math.PI * 2;
    // a ragged, lumpy crest, never quite level
    const crestN = s.noise(x * 0.021 + rf.seed, z * 0.021) * 0.32 + s.noise(x * 0.07, z * 0.07 - rf.seed) * 0.12;
    const crest = REEF_CREST + crestN;
    let h = -40;
    let m = 0;
    for (const a of rf.arcs) {
      const dx = x - a.cx;
      const dz = z - a.cz;
      const d = Math.hypot(dx, dz);
      const span = a.a1 - a.a0;
      let t = (Math.atan2(dz, dx) - a.a0) % TAU;
      if (t < 0) t += TAU;
      let dc: number;
      let u: number;
      if (t <= span) {
        dc = Math.abs(d - a.R);
        u = t / span;
      } else {
        // past the end of the arc: round it off
        const e0x = a.cx + Math.cos(a.a0) * a.R, e0z = a.cz + Math.sin(a.a0) * a.R;
        const e1x = a.cx + Math.cos(a.a1) * a.R, e1z = a.cz + Math.sin(a.a1) * a.R;
        const d0 = Math.hypot(x - e0x, z - e0z);
        const d1 = Math.hypot(x - e1x, z - e1z);
        dc = Math.min(d0, d1);
        u = d0 < d1 ? 0 : 1;
      }
      // the crest tapers to the tips and its edges fray into spurs and grooves
      const w = a.w * (0.5 + 0.5 * Math.sqrt(Math.sin(Math.PI * clamp(u, 0, 1)))) * (0.8 + 0.4 * (s.noise(x * 0.035 - rf.seed, z * 0.035) * 0.5 + 0.5));
      dc += s.noise(x * 0.09 + rf.seed, z * 0.09) * a.w * 0.22;
      // passes: the coral gives way to a channel a deep keel can thread, its banks a little crooked
      const along = u * span * a.R + s.noise(x * 0.03, z * 0.03 + rf.seed) * 5;
      let pass = 0;
      for (const pu of a.passes) pass = Math.max(pass, 1 - smoothstep(9, 17, Math.abs(along - pu * span * a.R)));
      const c = crest - pass * 2.6;
      const prof = 1 - smoothstep(w * 0.7, w * 2.5, dc);
      const hh = lerp(-26, c, Math.pow(prof, 0.85));
      if (hh > h) h = hh;
      m = Math.max(m, (1 - smoothstep(w * 1.3, w * 2.6, dc)) * (1 - pass * 0.85));
    }
    for (const hd of rf.heads) {
      const d = Math.hypot(x - hd.x, z - hd.z) + s.noise(x * 0.15, z * 0.15 + rf.seed) * hd.r * 0.25;
      const prof = 1 - smoothstep(hd.r * 0.55, hd.r * 1.9, d);
      const hh = lerp(-26, crest + 0.2, Math.pow(prof, 0.9));
      if (hh > h) h = hh;
      m = Math.max(m, 1 - smoothstep(hd.r * 1.1, hd.r * 2.0, d));
    }
    // knobs of brain and staghorn coral standing proud of the crest
    const knob = smoothstep(0.32, 0.85, s.noise(x * 0.16 + rf.seed, z * 0.16)) * 0.42 + smoothstep(0.5, 0.9, s.noise(x * 0.41, z * 0.41 - rf.seed)) * 0.16;
    h += knob * smoothstep(crest - 1.4, crest, h);
    if (rf.pool) {
      // inside the horseshoe the bottom shoals to pale sand you can see from the deck
      const d = Math.hypot(x - rf.pool.x, z - rf.pool.z);
      const ph = -5.2 + s.fbm(x * 0.03, z * 0.03, 2) * 0.9;
      const hh = lerp(-26, ph, 1 - smoothstep(rf.pool.r * 0.75, rf.pool.r * 1.15, d));
      if (hh > h) h = hh;
    }
    out[0] = Math.min(h, REEF_TOP);
    out[1] = m;
    return out;
  }

  /** Raises the reefs out of the seafloor and marks their coral. */
  private buildReefs() {
    const H = this.heights;
    const o: [number, number] = [0, 0];
    for (const rf of this.reefs) {
      const i0 = Math.max(0, Math.floor((rf.x - rf.r - this.x0) / CELL));
      const i1 = Math.min(GRID_N - 1, Math.ceil((rf.x + rf.r - this.x0) / CELL));
      const j0 = Math.max(0, Math.floor((rf.z - rf.r - this.z0) / CELL));
      const j1 = Math.min(GRID_N - 1, Math.ceil((rf.z + rf.r - this.z0) / CELL));
      for (let j = j0; j <= j1; j++) {
        const z = this.z0 + j * CELL;
        for (let i = i0; i <= i1; i++) {
          const x = this.x0 + i * CELL;
          const k = j * GRID_N + i;
          this.reefHeight(rf, x, z, o);
          if (o[0] > H[k] - 3) H[k] = Math.min(REEF_TOP, smax(H[k], o[0], 2.5));
          if (o[1] > this.reefMask[k]) this.reefMask[k] = o[1];
        }
      }
    }
  }

  private buildHeights() {
    const H = this.heights;
    // coarse rolling seafloor
    const coarse = 8;
    const cn = Math.ceil(GRID_N / coarse) + 1;
    const floor = new Float32Array(cn * cn);
    for (let j = 0; j < cn; j++) {
      for (let i = 0; i < cn; i++) {
        const x = this.x0 + i * coarse * CELL;
        const z = this.z0 + j * coarse * CELL;
        floor[j * cn + i] = FLOOR_DEPTH + this.simplex.fbm(x * 0.0035, z * 0.0035, 3) * 3.2;
      }
    }
    for (let j = 0; j < GRID_N; j++) {
      const fj = j / coarse;
      const j0 = Math.floor(fj);
      const tj = fj - j0;
      for (let i = 0; i < GRID_N; i++) {
        const fi = i / coarse;
        const i0 = Math.floor(fi);
        const ti = fi - i0;
        const a = floor[j0 * cn + i0];
        const b = floor[j0 * cn + i0 + 1];
        const c = floor[(j0 + 1) * cn + i0];
        const d = floor[(j0 + 1) * cn + i0 + 1];
        H[j * GRID_N + i] = lerp(lerp(a, b, ti), lerp(c, d, ti), tj);
      }
    }
    const best = new Float32Array(GRID_N * GRID_N).fill(-1e9);
    this.islands.forEach((isl, idx) => {
      const ext = isl.r * Math.max(isl.stretch, 1 / isl.stretch) * 2.05 + 20;
      const i0 = Math.max(0, Math.floor((isl.x - ext - this.x0) / CELL));
      const i1 = Math.min(GRID_N - 1, Math.ceil((isl.x + ext - this.x0) / CELL));
      const j0 = Math.max(0, Math.floor((isl.z - ext - this.z0) / CELL));
      const j1 = Math.min(GRID_N - 1, Math.ceil((isl.z + ext - this.z0) / CELL));
      for (let j = j0; j <= j1; j++) {
        const z = this.z0 + j * CELL;
        for (let i = i0; i <= i1; i++) {
          const x = this.x0 + i * CELL;
          const k = j * GRID_N + i;
          const h = this.islandHeight(isl, x, z);
          if (h > best[k]) {
            best[k] = h;
            if (h > -14) {
              this.owner[k] = idx;
              this.inland[k] = this.lastInland;
              this.lagoon[k] = this.lastLagoon;
            }
          }
          H[k] = smax(H[k], h, 3);
        }
      }
    });
  }

  /**
   * Bores an abyss into the seabed under a maelstrom: the floor falls away from
   * its rim to ABYSS deep under the eye, so its throat can drop tens of metres
   * through open water. Call before buildMeshes and createHeightTexture.
   */
  carveAbyss(x: number, z: number, r: number) {
    this.abysses.push({ x, z, r });
    const H = this.heights;
    const i0 = Math.max(0, Math.floor((x - r - this.x0) / CELL));
    const i1 = Math.min(GRID_N - 1, Math.ceil((x + r - this.x0) / CELL));
    const j0 = Math.max(0, Math.floor((z - r - this.z0) / CELL));
    const j1 = Math.min(GRID_N - 1, Math.ceil((z + r - this.z0) / CELL));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const u = Math.hypot(this.x0 + i * CELL - x, this.z0 + j * CELL - z) / r;
        if (u >= 1) continue;
        const k = j * GRID_N + i;
        H[k] = Math.min(H[k], lerp(ABYSS, H[k], smoothstep(0.08, 1, u)));
      }
    }
  }

  // ---------------------------------------------------------------- queries

  heightAt(x: number, z: number): number {
    const fx = clamp((x - this.x0) / CELL, 0, GRID_N - 1.001);
    const fz = clamp((z - this.z0) / CELL, 0, GRID_N - 1.001);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const H = this.heights;
    const k = j * GRID_N + i;
    const a = H[k];
    const b = H[k + 1];
    const c = H[k + GRID_N];
    const d = H[k + GRID_N + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  }

  /** How much living reef lies under (x, z): 0 open water or island shelf .. 1 coral (bilinear). */
  reefAt(x: number, z: number): number {
    const fx = clamp((x - this.x0) / CELL, 0, GRID_N - 1.001);
    const fz = clamp((z - this.z0) / CELL, 0, GRID_N - 1.001);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const M = this.reefMask;
    const k = j * GRID_N + i;
    return lerp(lerp(M[k], M[k + 1], tx), lerp(M[k + GRID_N], M[k + GRID_N + 1], tx), tz);
  }

  /** The reef whose waters (x, z) lies in, if any, and how far out from its middle. */
  reefNear(x: number, z: number, pad = 0): Reef | null {
    for (const rf of this.reefs) if (Math.hypot(rf.x - x, rf.z - z) < rf.r + pad) return rf;
    return null;
  }

  /** Whether (x, z) lies in a sheltered atoll lagoon (nearest grid cell). */
  lagoonAt(x: number, z: number): boolean {
    const i = Math.round(clamp((x - this.x0) / CELL, 0, GRID_N - 1));
    const j = Math.round(clamp((z - this.z0) / CELL, 0, GRID_N - 1));
    return this.lagoon[j * GRID_N + i] === 1;
  }

  /** Downhill gradient (dh/dx, dh/dz). */
  gradientAt(x: number, z: number, out: THREE.Vector2): THREE.Vector2 {
    const e = CELL;
    out.set(
      (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e),
      (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e),
    );
    return out;
  }

  private gridH(i: number, j: number): number {
    i = clamp(i, 0, GRID_N - 1);
    j = clamp(j, 0, GRID_N - 1);
    return this.heights[j * GRID_N + i];
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

  // ---------------------------------------------------------------- baking

  /**
   * Horizon-based ambient occlusion: march 8 rays across the heightfield from
   * every land/shallow cell. A cheap, offline cousin of ray-traced AO.
   */
  bakeAO(step = 2) {
    const dirs = 8;
    const dists = [2, 4.5, 8, 13, 21, 34, 52];
    const cs: number[] = [];
    const sn: number[] = [];
    for (let d = 0; d < dirs; d++) {
      const a = (d / dirs) * Math.PI * 2 + 0.3;
      cs.push(Math.cos(a));
      sn.push(Math.sin(a));
    }
    const ao = this.ao;
    const H = this.heights;
    for (let j = 0; j < GRID_N; j += step) {
      for (let i = 0; i < GRID_N; i += step) {
        const k = j * GRID_N + i;
        const h0 = H[k];
        if (h0 < -15.5) continue;
        const x = this.x0 + i * CELL;
        const z = this.z0 + j * CELL;
        let occ = 0;
        for (let d = 0; d < dirs; d++) {
          let maxSlope = 0;
          for (const dist of dists) {
            const hh = this.heightAt(x + cs[d] * dist, z + sn[d] * dist);
            const sl = (hh - h0 - 0.3) / dist;
            if (sl > maxSlope) maxSlope = sl;
          }
          occ += maxSlope / Math.sqrt(1 + maxSlope * maxSlope);
        }
        occ /= dirs;
        const v = clamp(1 - occ * 1.35, 0.25, 1);
        for (let oj = 0; oj < step && j + oj < GRID_N; oj++) {
          for (let oi = 0; oi < step && i + oi < GRID_N; oi++) ao[(j + oj) * GRID_N + i + oi] = v;
        }
      }
    }
    // smooth the blocky upsample
    if (step > 1) this.blurAO();
  }

  private blurAO() {
    const src = this.ao.slice();
    const ao = this.ao;
    for (let j = 1; j < GRID_N - 1; j++) {
      for (let i = 1; i < GRID_N - 1; i++) {
        const k = j * GRID_N + i;
        ao[k] = (src[k] * 4 + src[k - 1] + src[k + 1] + src[k - GRID_N] + src[k + GRID_N]) / 8;
      }
    }
  }

  /** Darken AO around a point (vegetation contact shadows). */
  stampAO(x: number, z: number, radius: number, strength: number) {
    const i0 = Math.floor((x - radius - this.x0) / CELL);
    const i1 = Math.ceil((x + radius - this.x0) / CELL);
    const j0 = Math.floor((z - radius - this.z0) / CELL);
    const j1 = Math.ceil((z + radius - this.z0) / CELL);
    for (let j = Math.max(0, j0); j <= Math.min(GRID_N - 1, j1); j++) {
      for (let i = Math.max(0, i0); i <= Math.min(GRID_N - 1, i1); i++) {
        const px = this.x0 + i * CELL;
        const pz = this.z0 + j * CELL;
        const d = Math.hypot(px - x, pz - z) / radius;
        if (d < 1) {
          const k = j * GRID_N + i;
          this.ao[k] *= 1 - strength * (1 - d * d);
        }
      }
    }
  }

  /** Mark the ground under a tree crown as forest floor. */
  stampCanopy(x: number, z: number, radius: number, strength: number) {
    const i0 = Math.max(0, Math.floor((x - radius - this.x0) / CELL));
    const i1 = Math.min(GRID_N - 1, Math.ceil((x + radius - this.x0) / CELL));
    const j0 = Math.max(0, Math.floor((z - radius - this.z0) / CELL));
    const j1 = Math.min(GRID_N - 1, Math.ceil((z + radius - this.z0) / CELL));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(this.x0 + i * CELL - x, this.z0 + j * CELL - z) / radius;
        if (d < 1) {
          const k = j * GRID_N + i;
          this.canopy[k] = Math.min(1, this.canopy[k] + strength * (1 - d * d));
        }
      }
    }
  }

  // ---------------------------------------------------------------- meshing

  /** Per-vertex inputs for the ground shader: island kind, tint, summit and crater masks. */
  private surfaceInfo(k: number, h: number, kind: Float32Array, info: Float32Array, o: number) {
    const own = this.owner[k];
    const isl = own >= 0 ? this.islands[own] : null;
    if (!isl) return;
    kind[o] = isl.kind === 'volcanic' ? 1 : 0;
    kind[o + 1] = isl.kind === 'atoll' ? 1 : 0;
    kind[o + 2] = isl.kind === 'rocky' ? 1 : 0;
    info[o] = isl.tint;
    // a karst tower's flat top is jungle, not a bare summit
    if (isl.kind !== 'atoll' && isl.kind !== 'karst') {
      info[o + 1] = smoothstep(isl.peak * 0.7, isl.peak * 0.95, h) * (isl.kind === 'volcanic' ? 1 : 0.6);
    }
    if (isl.kind === 'volcanic') info[o + 2] = smoothstep(0.86, 0.975, this.inland[k]);
  }

  /**
   * Builds the terrain as 64 m chunks (so frustum culling works) sharing the
   * global height grid: seams are exact and normals continuous.
   */
  buildMeshes(lod = 1, lite = false): THREE.Group {
    const group = new THREE.Group();
    group.name = 'terrain';
    // one ground material and one seabed for every archipelago, so a second
    // set of islands never brings a shader of its own
    const mat = (Terrain.mats[lite ? 'lite' : 'full'] ??= createTerrainMaterial(lite));
    const chunkCells = 32;
    const chunks = Math.floor((GRID_N - 1) / chunkCells);
    const span = chunkCells * CELL;
    // chunks over an abyss are built whole, and the seabed plane leaves them a hole
    const pit = new Uint8Array(chunks * chunks);
    for (const a of this.abysses) {
      for (let cj = 0; cj < chunks; cj++) {
        for (let ci = 0; ci < chunks; ci++) {
          const x0 = this.x0 + ci * span;
          const z0 = this.z0 + cj * span;
          const dx = Math.max(x0 - a.x, 0, a.x - x0 - span);
          const dz = Math.max(z0 - a.z, 0, a.z - z0 - span);
          if (Math.hypot(dx, dz) < a.r) pit[cj * chunks + ci] = 1;
        }
      }
    }
    for (let cj = 0; cj < chunks; cj++) {
      for (let ci = 0; ci < chunks; ci++) {
        const inPit = pit[cj * chunks + ci] === 1;
        // skip chunks that are pure deep seafloor (the floor plane covers them)
        let maxH = -1e9;
        for (let j = cj * chunkCells; j <= (cj + 1) * chunkCells; j += 2) {
          for (let i = ci * chunkCells; i <= (ci + 1) * chunkCells; i += 2) {
            const h = this.heights[j * GRID_N + i];
            if (h > maxH) maxH = h;
          }
        }
        if (maxH < -14.2 && !inPit) continue;
        // an abyss lies deep under the water: coarser cells do there
        const step = inPit && maxH < -14.2 ? Math.max(lod, 2) : lod;
        const res = chunkCells / step;
        const vn = res + 1;
        const pos = new Float32Array(vn * vn * 3);
        const nrm = new Float32Array(vn * vn * 3);
        const kindA = new Float32Array(vn * vn * 3);
        const infoA = new Float32Array(vn * vn * 3);
        const aoA = new Float32Array(vn * vn);
        const canA = new Float32Array(vn * vn);
        const reefA = new Float32Array(vn * vn);
        const biomeA = new Float32Array(vn * vn).fill(this.style === 'brumas' ? 1 : 0);
        for (let vj = 0; vj < vn; vj++) {
          for (let vi = 0; vi < vn; vi++) {
            const i = ci * chunkCells + vi * step;
            const j = cj * chunkCells + vj * step;
            const k = vj * vn + vi;
            const h = this.heights[j * GRID_N + i];
            pos[k * 3] = this.x0 + i * CELL;
            pos[k * 3 + 1] = h;
            pos[k * 3 + 2] = this.z0 + j * CELL;
            const hx = this.gridH(i + 1, j) - this.gridH(i - 1, j);
            const hz = this.gridH(i, j + 1) - this.gridH(i, j - 1);
            const nx = -hx;
            const ny = 2 * CELL;
            const nz = -hz;
            const inv = 1 / Math.hypot(nx, ny, nz);
            nrm[k * 3] = nx * inv;
            nrm[k * 3 + 1] = ny * inv;
            nrm[k * 3 + 2] = nz * inv;
            this.surfaceInfo(j * GRID_N + i, h, kindA, infoA, k * 3);
            aoA[k] = this.ao[j * GRID_N + i];
            canA[k] = this.canopy[j * GRID_N + i];
            reefA[k] = this.reefMask[j * GRID_N + i];
          }
        }
        const idx: number[] = [];
        for (let vj = 0; vj < res; vj++) {
          for (let vi = 0; vi < res; vi++) {
            const a = vj * vn + vi;
            const b = a + 1;
            const c = a + vn;
            const d = c + 1;
            if (!inPit && pos[a * 3 + 1] < -15.5 && pos[b * 3 + 1] < -15.5 && pos[c * 3 + 1] < -15.5 && pos[d * 3 + 1] < -15.5) continue;
            // alternate the diagonal for nicer silhouettes
            if ((vi + vj) & 1) idx.push(a, c, b, b, c, d);
            else idx.push(a, c, d, a, d, b);
          }
        }
        if (!idx.length) continue;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
        geo.setAttribute('aqKind', new THREE.BufferAttribute(kindA, 3));
        geo.setAttribute('aqInfo', new THREE.BufferAttribute(infoA, 3));
        geo.setAttribute('aqAO', new THREE.BufferAttribute(aoA, 1));
        geo.setAttribute('aqCanopy', new THREE.BufferAttribute(canA, 1));
        geo.setAttribute('aqReef', new THREE.BufferAttribute(reefA, 1));
        geo.setAttribute('aqBiome', new THREE.BufferAttribute(biomeA, 1));
        geo.setIndex(idx);
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = maxH > 0.5;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
      }
    }
    // the endless seabed under everything (each archipelago's reaches half way
    // across the high seas and a little more, so the two meet out there)
    const floorGeo = new THREE.PlaneGeometry(FLOOR_SPAN, FLOOR_SPAN, 1, 1);
    floorGeo.rotateX(-Math.PI / 2);
    if (this.abysses.length) {
      // the plane in chunk-sized squares, leaving out those over an abyss
      // (rows of squares merge into strips, so it stays a few hundred triangles)
      const Q = Math.round(FLOOR_SPAN / span);
      const o = -FLOOR_SPAN / 2;
      const off = Math.round((o + HALF) / span);
      const fp: number[] = [];
      const fi: number[] = [];
      const strip = (x0: number, x1: number, z0: number, z1: number) => {
        const b = fp.length / 3;
        fp.push(x0, 0, z0, x1, 0, z0, x0, 0, z1, x1, 0, z1);
        fi.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      };
      for (let qj = 0; qj < Q; qj++) {
        let start = -1;
        for (let qi = 0; qi <= Q; qi++) {
          const ci = qi + off;
          const cj = qj + off;
          const hole = qi < Q && ci >= 0 && cj >= 0 && ci < chunks && cj < chunks && pit[cj * chunks + ci] === 1;
          const open = qi < Q && !hole;
          if (open && start < 0) start = qi;
          if (!open && start >= 0) {
            strip(o + start * span, o + qi * span, o + qj * span, o + (qj + 1) * span);
            start = -1;
          }
        }
      }
      floorGeo.setIndex(fi);
      floorGeo.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
      floorGeo.deleteAttribute('uv');
      floorGeo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(fp.length / 3).fill(0).flatMap(() => [0, 1, 0]), 3));
      floorGeo.computeBoundingSphere();
    }
    const floorMat = (Terrain.mats.floor ??= patchMaterial(new THREE.MeshStandardMaterial({ color: DEEP_SAND, roughness: 1 }), { caustics: true, detail: true }));
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.name = 'seabed';
    // where two archipelagos' seabeds overlap out on the high seas, the home one
    // lies a hand's breadth higher so they never fight over the same depth
    floor.position.set(this.ox, FLOOR_DEPTH - 1.2 - (this.style === 'home' ? 0 : 0.35), this.oz);
    floor.receiveShadow = false;
    floor.matrixAutoUpdate = false;
    floor.updateMatrix();
    group.add(floor);
    return group;
  }

  /**
   * Half-float heightmap for the water shader (shore foam + wave damping) in
   * r, and the reef mask in g (the swell breaks white over open-sea coral).
   */
  /** This archipelago's square for the water shaders: corner x, corner z, size, 1 / size. */
  get rect() {
    return new THREE.Vector4(this.x0, this.z0, WORLD_SIZE, 1 / WORLD_SIZE);
  }

  /** Whether (x, z) lies in this archipelago's square. */
  contains(x: number, z: number) {
    return Math.abs(x - this.ox) < HALF && Math.abs(z - this.oz) < HALF;
  }

  createHeightTexture(res = 512): THREE.DataTexture {
    const data = new Uint16Array(res * res * 2);
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const x = this.x0 + (i + 0.5) * (WORLD_SIZE / res);
        const z = this.z0 + (j + 0.5) * (WORLD_SIZE / res);
        data[(j * res + i) * 2] = THREE.DataUtils.toHalfFloat(this.heightAt(x, z));
        data[(j * res + i) * 2 + 1] = THREE.DataUtils.toHalfFloat(this.reefAt(x, z));
      }
    }
    const tex = new THREE.DataTexture(data, res, res, THREE.RGFormat, THREE.HalfFloatType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }
}
