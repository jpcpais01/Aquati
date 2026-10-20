import * as THREE from 'three';
import { mulberry32 } from '../core/noise';
import { GLSL_GUST, patchMaterial } from '../render/environment';
import { GLSL_TURF } from './terrainMaterial';
import { CELL, Terrain } from './terrain';

// Real grass around the eye. The ground shader paints every meadow; from a
// few dozen metres in, blades rise out of it: one instanced patch of tufts per
// 2 m cell of the heightfield, set on the cell's own four corner heights so
// every blade stands exactly on the ground, whatever its LOD.
//
// The blades take their colour, and whether they grow at all, from the very
// same turf function the ground shader runs (terrainMaterial.ts GLSL_TURF): a
// blade rises out of ground of exactly its own colour, the meadow stops where
// the turf meets the sand or bare rock, thins out on the forest floor, and
// grows lush in the damp hollows and cropped along the dry spurs.
//
// It costs nothing at sea: only cells within reach of the camera are drawn
// (none from the follow view), cut by the view on the CPU. Further out the
// tufts thin away one by one and their blades broaden so the meadow keeps its
// cover, then shrink to nothing where a blade is a few pixels tall; past the
// dense ring, cells switch to a patch holding only the tufts that survive out
// there, so the hand-over can't be seen. Blades sway in the wind and bow
// under the passing gust puffs, and part around feet walking through them.
// No shadows cast (the screen-space contact shadows ground them), one
// program, built and drawn behind the loading screen.

/** Tufts per cell, and blades per tuft (most to fewest). */
const TUFTS = 24;
/** The share of tufts (lowest ranks) that carry on past the dense ring. */
const SPARSE = 0.3;
/** Blades' height on screen (CSS px) at which a cell goes sparse, and at which the grass ends. */
const DENSE_PX = 26;
const END_PX = 7;
/** Typical blade height (m) used for those thresholds. */
const BLADE_H = 0.42;
/** Walkers that part the grass. */
export const GRASS_PUSHERS = 6;

const GRASS_VERTEX_PARS = /* glsl */ `
uniform sampler2D uNoiseTex;
uniform vec4 uGrass;
uniform vec4 uGrassPush[${GRASS_PUSHERS}];
attribute vec4 aBlade;
attribute vec3 aSeg;
attribute vec4 aTurfH;
attribute vec4 aTurfK;
attribute vec4 aTurfI;
#define AQ_TEX(s, uv) textureLod(s, uv, 0.0)
${GLSL_TURF}
#ifndef AQ_SWAY
${GLSL_GUST}
#endif
`;

// Runs in place of three's beginnormal: works out the whole blade (its
// position aqGrassP, in the instance's frame, for begin_vertex), its normal
// and its colour.
const GRASS_VERTEX = /* glsl */ `
vec3 aqGrassP;
{
  vec2 root = aBlade.xy;
  float yaw = aBlade.z;
  float rank = aBlade.w;
  float side = aSeg.x;
  float t = aSeg.y;
  float rnd = aSeg.z;
  vec3 cell = instanceMatrix[3].xyz;
  // the ground, bilinear over the cell exactly as the heightfield is
  vec2 cuv = root * ${(1 / CELL).toFixed(4)};
  float hb = mix(mix(aTurfH.x, aTurfH.y, cuv.x), mix(aTurfH.z, aTurfH.w, cuv.x), cuv.y);
  vec3 wroot = vec3(cell.x + root.x, hb - 0.03, cell.z + root.y);
  vec2 grad = vec2(mix(aTurfH.y - aTurfH.x, aTurfH.w - aTurfH.z, cuv.y), mix(aTurfH.z - aTurfH.x, aTurfH.w - aTurfH.y, cuv.x)) * ${(1 / CELL).toFixed(4)};
  vec3 tn = normalize(vec3(-grad.x, 1.0, -grad.y));

  // the turf here: the ground shader's own sums
  vec4 nW, nM, nS, nD, nF;
  aqGroundNoise(wroot.xz, nW, nM, nS, nD, nF);
  float kA = aTurfK.y;
  float edge = aqTurfEdge(hb, kA, nM, nS, nD, nF);
  float jungle = aqJungleAt(hb, kA, nM, nD);
  float under = aqUnderAt(aTurfI.z, kA, nD);
  float rockT = aqRockAt(hb, 1.0 - tn.y, aTurfI.y, aTurfK.z, aTurfI.w, aTurfK.w, nD);
  vec3 turf = aqTurfColor(hb, aTurfK.xyz, aTurfI.x, aTurfI.w, aTurfK.w, jungle, under, edge, nM, nS, nD, nF);
  float cover = smoothstep(0.03, 0.3, edge) * (1.0 - smoothstep(0.04, 0.35, rockT)) * (1.0 - under * 0.7) * (1.0 - aTurfK.x * 0.3);
  // lush in the damp hollows and meadows' hearts, cropped along the dry spurs
  float lush = 0.62 + 0.55 * smoothstep(0.35, 0.68, nS.g + (nD.r - 0.5) * 0.5) + jungle * 0.25 - max(aTurfI.w, 0.0) * 0.35 + kA * 0.1;

  // further out, tufts drop away one by one (each by its rank) and the rest broaden
  float d = distance(cameraPosition, wroot);
  float cut = rank < ${SPARSE.toFixed(2)}
    ? mix(uGrass.y, uGrass.y * 0.62, rank / ${SPARSE.toFixed(2)})
    : mix(uGrass.x, uGrass.x * 0.5, (rank - ${SPARSE.toFixed(2)}) / ${(1 - SPARSE).toFixed(2)});
  float fade = 1.0 - smoothstep(cut * 0.72, cut, d);
  float H = (0.22 + rnd * rnd * 0.42) * lush * cover * fade * uGrass.w;
  float wide = 0.021 * (0.75 + rnd * 0.5) * (1.0 + d / max(uGrass.y, 1.0) * 2.2);

  // the wind: a steady lean, waves rolling downwind through the meadow, and
  // the gust puffs bowing it flat as they pass
  vec2 wd = uWind.xy;
  float g = gustAt(wroot.xz);
  float wave = sin(dot(wroot.xz, wd) * 0.42 - uTime * 2.1 + nF.r * 4.0) * 0.5 + 0.5;
  vec2 bend = wd * (uWind.z * 0.16 + g * 0.6 + wave * (0.1 + g * 0.3) + 0.03 * sin(uTime * 7.0 + rnd * 40.0) * (0.3 + g));
  // each blade's own droop, its way
  bend += vec2(cos(yaw * 1.7 + 0.4), sin(yaw * 1.7 + 0.4)) * (0.15 + rnd * 0.45);
  // parted by feet walking through it
  for (int i = 0; i < ${GRASS_PUSHERS}; i++) {
    vec4 pu = uGrassPush[i];
    if (pu.w <= 0.0) continue;
    vec3 pd = wroot - pu.xyz;
    float pr = length(pd.xz);
    float k = (1.0 - smoothstep(pu.w * 0.3, pu.w, pr)) * (1.0 - smoothstep(1.2, 2.2, abs(pd.y)));
    bend += pd.xz / max(pr, 0.05) * k * 1.6;
  }
  float bl = length(bend);
  // a bent blade keeps its length: it lies over as it leans
  float lie = 1.0 / sqrt(1.0 + bl * bl);
  // the blade's face: it turns its front to the camera by mirroring (the
  // blade is symmetric about its spine, so only the winding changes)
  vec2 fdir = vec2(cos(yaw), sin(yaw));
  vec2 toCam = cameraPosition.xz - wroot.xz;
  float facing = dot(fdir, toCam) < 0.0 ? -1.0 : 1.0;
  fdir *= facing;
  vec2 sdir = vec2(fdir.y, -fdir.x);
  float tt = t * t;
  vec3 pos = wroot + vec3(bend.x * H * tt, H * t * lie, bend.y * H * tt) + vec3(sdir.x, 0.0, sdir.y) * side * wide * (1.0 - t) * step(0.001, H);
  aqGrassP = pos - cell;
  // lit mostly like the ground it stands in, a little like a blade
  vec3 tang = normalize(vec3(bend.x * 2.0 * t, lie, bend.y * 2.0 * t) + 1e-4);
  vec3 fn = normalize(cross(vec3(sdir.x, 0.0, sdir.y), tang)) * -facing;
  if (dot(fn.xz, toCam) < 0.0) fn = -fn;
  objectNormal = normalize(mix(fn, tn, 0.62) + vec3(0.0, t * 0.25, 0.0));
  // dark and damp at the root (the ground's own colour), sunlit and a touch
  // straw-gold at the tip; tips glint as a gust lays them over
  vec3 tip = turf * mix(vec3(1.22, 1.16, 0.86), vec3(1.35, 1.22, 0.7), smoothstep(0.55, 0.8, nM.r + rnd * 0.2) * 0.6);
  vec3 col = mix(turf * 0.66, tip, pow(t, 0.8)) * (1.0 + g * 0.18 * t);
  vColor.rgb = col * (0.92 + rnd * 0.16);
}
`;

const GRASS_LIGHT = /* glsl */ `
  {
    // blades are thin: the sun glows through them, warm, from behind
    vec3 aqL = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
    float aqBack = clamp(0.3 - dot(normal, aqL), 0.0, 1.0);
    reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * aqBack * vec3(0.06, 0.07, 0.03);
  }
`;

/** One patch of tufts covering a cell: every blade, or only those tufts ranked under `upTo`. */
function patchGeometry(upTo: number): THREE.BufferGeometry {
  const rnd = mulberry32(911);
  // tufts spread evenly (jittered grid), their ranks shuffled so any share of them is spread evenly too
  const order = Array.from({ length: TUFTS }, (_, i) => i);
  for (let i = TUFTS - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const blade: number[] = [];
  const seg: number[] = [];
  const pos: number[] = [];
  const idx: number[] = [];
  const cols = 6; // TUFTS is a multiple of it
  const rows = TUFTS / cols;
  for (let k = 0; k < TUFTS; k++) {
    const rank = (order[k] + 0.5) / TUFTS;
    const tx = ((k % cols) + 0.15 + rnd() * 0.7) * (CELL / cols);
    const tz = (Math.floor(k / cols) + 0.15 + rnd() * 0.7) * (CELL / rows);
    if (rank >= upTo) {
      for (let n = 0; n < 6; n++) rnd();
      continue;
    }
    const blades = 4 + Math.floor(rnd() * 4);
    for (let b = 0; b < blades; b++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 0.11;
      const x = Math.min(CELL - 0.01, Math.max(0.01, tx + Math.cos(a) * r));
      const z = Math.min(CELL - 0.01, Math.max(0.01, tz + Math.sin(a) * r));
      const yaw = rnd() * Math.PI * 2;
      const s = rnd();
      const base = blade.length / 4;
      // two segments: base pair, middle pair, tip
      for (const [sd, t] of [[-1, 0], [1, 0], [-1, 0.55], [1, 0.55], [0, 1]]) {
        blade.push(x, z, yaw, rank);
        seg.push(sd, t, s);
        pos.push(x, t * 0.5, z);
      }
      idx.push(base, base + 1, base + 3, base, base + 3, base + 2, base + 2, base + 3, base + 4);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(1), 3));
  g.setAttribute('aBlade', new THREE.Float32BufferAttribute(blade, 4));
  g.setAttribute('aSeg', new THREE.Float32BufferAttribute(seg, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(CELL / 2, 0, CELL / 2), CELL);
  return g;
}

interface Field {
  mesh: THREE.InstancedMesh;
  h: THREE.InstancedBufferAttribute;
  k: THREE.InstancedBufferAttribute;
  i: THREE.InstancedBufferAttribute;
}

function field(geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, name: string): Field {
  const h = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const k = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const i = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aTurfH', h);
  geo.setAttribute('aTurfK', k);
  geo.setAttribute('aTurfI', i);
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.name = name;
  return { mesh, h, k, i };
}

const _frustum = new THREE.Frustum();
const _pv = new THREE.Matrix4();
const _sphere = new THREE.Sphere();
const _dir = new THREE.Vector3();
/** Per cell: corner heights (4), kind + biome (4), tint, summit, canopy, erosion (4). */
const STRIDE = 12;
const DENSE_CAP = 320;
const SPARSE_CAP = 2400;

export class Grass {
  readonly group = new THREE.Group();
  /** Lengthens (or shortens) every blade. */
  height = 1;
  private dense: Field;
  private sparse: Field;
  private readonly uniforms = {
    // x the dense ring's reach, y where the grass ends (m), w height scale
    uGrass: { value: new THREE.Vector4(10, 30, 0, 1) },
    uGrassPush: { value: Array.from({ length: GRASS_PUSHERS }, () => new THREE.Vector4()) },
  };
  /** Each cell's ground, by region and cell; null where no grass can grow. */
  private cells = new Map<number, Float32Array | null>();
  private lastPos = new THREE.Vector3(Infinity, 0, 0);
  private lastDir = new THREE.Vector3();
  private lastReach = 0;

  constructor(
    private regions: Terrain[],
    private clearings: { x: number; z: number; r: number }[],
    /** How far out it reaches, as a share of the full reach (lighter devices). */
    private reachScale = 1,
  ) {
    const mat = patchMaterial(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, envMapIntensity: 0.7 }),
      { clouds: true },
      this.uniforms,
    );
    const prev = mat.onBeforeCompile;
    const prevKey = mat.customProgramCacheKey();
    mat.customProgramCacheKey = () => prevKey + '|grass';
    mat.onBeforeCompile = (shader, renderer) => {
      prev.call(mat, shader, renderer);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${GRASS_VERTEX_PARS}`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${GRASS_VERTEX}`)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = aqGrassP;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${GRASS_LIGHT}`);
    };
    this.dense = field(patchGeometry(1), mat, DENSE_CAP, 'grass-dense');
    this.sparse = field(patchGeometry(SPARSE), mat, SPARSE_CAP, 'grass-sparse');
    this.group.name = 'grass';
    this.group.add(this.dense.mesh, this.sparse.mesh);
  }

  /** Where people walk through the grass this frame (null clears the rest). */
  setPushers(list: ({ x: number; y: number; z: number } | null)[]) {
    const p = this.uniforms.uGrassPush.value;
    for (let i = 0; i < GRASS_PUSHERS; i++) {
      const w = list[i];
      if (w) p[i].set(w.x, w.y, w.z, 0.75);
      else p[i].w = 0;
    }
  }

  private cell(r: number, t: Terrain, i: number, j: number): Float32Array | null {
    const key = (r * 4096 + i) * 4096 + j;
    let c = this.cells.get(key);
    if (c !== undefined) return c;
    const out = new Float32Array(STRIDE);
    c = t.turfCell(i, j, out, 0) < 0 ? null : out;
    if (c) {
      const top = Math.max(c[0], c[1], c[2], c[3]);
      const x = t.x0 + (i + 0.5) * CELL;
      const z = t.z0 + (j + 0.5) * CELL;
      // under the beach line, too steep for anything but rock, or paved over
      const steep = Math.max(Math.abs(c[1] - c[0]), Math.abs(c[3] - c[2]), Math.abs(c[2] - c[0]), Math.abs(c[3] - c[1])) / CELL;
      if (top < 0.9 || steep > 1.1 || this.clearings.some((q) => (x - q.x) ** 2 + (z - q.z) ** 2 < (q.r + 1) * (q.r + 1))) c = null;
    }
    if (this.cells.size > 40000) this.cells.clear();
    this.cells.set(key, c);
    return c;
  }

  /** Picks the cells in reach and in view and lays their patches out. */
  update(camera: THREE.PerspectiveCamera, hold = false) {
    const cam = camera.position;
    const pe = camera.projectionMatrix.elements;
    // pixels per metre at 1 m (CSS pixels of the viewport's height)
    const pxK = pe[5] * 0.5 * (typeof innerHeight === 'number' ? innerHeight : 1080);
    const reachD = Math.min(11, Math.max(5, (BLADE_H * pxK) / DENSE_PX)) * this.reachScale;
    const reach = Math.min(28, Math.max(14, (BLADE_H * pxK) / END_PX)) * this.reachScale;
    const u = this.uniforms.uGrass.value;
    u.set(reachD, reach, 0, this.height);
    if (hold) return;
    camera.getWorldDirection(_dir);
    if (cam.distanceToSquared(this.lastPos) < 0.12 && _dir.dot(this.lastDir) > 0.9997 && Math.abs(reach - this.lastReach) < 0.5) return;
    this.lastPos.copy(cam);
    this.lastDir.copy(_dir);
    this.lastReach = reach;

    let nd = 0;
    let ns = 0;
    const r = this.regions.findIndex((t) => t.contains(cam.x, cam.z));
    const t = r >= 0 ? this.regions[r] : null;
    if (t && cam.y < reach + 60) {
      _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      _frustum.setFromProjectionMatrix(_pv);
      const i0 = Math.floor((cam.x - reach - t.x0) / CELL);
      const i1 = Math.floor((cam.x + reach - t.x0) / CELL);
      const j0 = Math.floor((cam.z - reach - t.z0) / CELL);
      const j1 = Math.floor((cam.z + reach - t.z0) / CELL);
      const D = this.dense;
      const S = this.sparse;
      const dm = D.mesh.instanceMatrix.array as Float32Array;
      const sm = S.mesh.instanceMatrix.array as Float32Array;
      const half = CELL * 0.71;
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const c = this.cell(r, t, i, j);
          if (!c) continue;
          const x = t.x0 + i * CELL;
          const z = t.z0 + j * CELL;
          const y = (c[0] + c[1] + c[2] + c[3]) * 0.25;
          const d = Math.hypot(x + CELL / 2 - cam.x, y - cam.y, z + CELL / 2 - cam.z) - half;
          if (d > reach) continue;
          _sphere.center.set(x + CELL / 2, y + 0.3, z + CELL / 2);
          _sphere.radius = half + 0.6;
          if (!_frustum.intersectsSphere(_sphere)) continue;
          const dense = d < reachD;
          if (dense ? nd >= DENSE_CAP : ns >= SPARSE_CAP) continue;
          const f = dense ? D : S;
          const n = dense ? nd++ : ns++;
          const m = dense ? dm : sm;
          m.fill(0, n * 16, n * 16 + 16);
          m[n * 16] = m[n * 16 + 5] = m[n * 16 + 10] = m[n * 16 + 15] = 1;
          m[n * 16 + 12] = x;
          m[n * 16 + 14] = z;
          (f.h.array as Float32Array).set(c.subarray(0, 4), n * 4);
          (f.k.array as Float32Array).set(c.subarray(4, 8), n * 4);
          (f.i.array as Float32Array).set(c.subarray(8, 12), n * 4);
        }
      }
    }
    this.commit(this.dense, nd);
    this.commit(this.sparse, ns);
  }

  private commit(f: Field, n: number) {
    f.mesh.count = n;
    f.mesh.visible = n > 0;
    if (!n) return;
    for (const a of [f.mesh.instanceMatrix, f.h, f.k, f.i]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
  }
}
