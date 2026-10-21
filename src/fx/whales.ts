import * as THREE from 'three';
import { angleDelta, clamp, damp, lerp } from '../core/noise';
import { patchMaterial } from '../render/environment';
import type { World } from '../game/world';
import type { Ship } from '../ships/ship';
import type { SongUnit } from '../core/audio';

// Humpback whales on their long migration across the high seas. Now and then
// a pod passes ahead of you: three or four adults strung out in a line, often
// a mother with her calf tucked in at her flank. For a while they travel just
// under the surface, rising every few breaths: the blowholes break first and
// a bushy column of spray booms up and drifts off on the wind, then the long
// dark back rolls through, the little dorsal, and under. After the last breath
// each one arches and sounds: the tail stock heaves up and the great flukes
// lift clear, streaming water, the white underside showing her own black
// pattern, and slide down into a smooth slick. Now and then one breaches: a
// steep run up from the deep and two thirds of her clear of the sea, flippers
// spread, twisting onto her back before she crashes down in a tower of white
// water. Some lie on their side and slap a long white flipper on the water.
// And while they're near you can hear them singing through the hull: long
// moans, whoops and cries, phrase after phrase, each theme sung a few times
// before the song moves on.
//
// One instanced draw (built at load, so the warm-up compiles it). The stroke
// of the flukes, the arch of the body and the flippers are posed in the vertex
// shader; the skin (countershading, throat pleats, the knobbly head, barnacles
// and each whale's own fluke pattern) is painted in the fragment shader.

const TAU = Math.PI * 2;
/** Most whales in the sea at once (one pod). */
const CAP = 6;
/** An adult's length (m). */
const LEN = 14;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- sculpt

/**
 * A humpback one unit long, rostrum at +z, flukes at -z: a stocky lofted body
 * (a broad, flat-topped head over a deep pleated throat, tapering to a
 * flattened tail stock), a small dorsal on its hump, very long flippers with a
 * scalloped leading edge, and broad flukes with a ragged trailing edge.
 * aPart: 0 body, 1 flukes (top), 2 flippers (top), 3 dorsal, 4 flukes (under), 5 flippers (under).
 */
function whaleGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const part: number[] = [];
  const idx: number[] = [];
  const vtx = (x: number, y: number, z: number, p: number) => {
    pos.push(x, y, z);
    part.push(p);
    return part.length - 1;
  };
  // z, half-width, height above the axis, depth below it, squareness (1 round, lower boxier)
  const rings: number[][] = [
    [0.5, 0.012, 0.008, 0.012, 1],
    [0.475, 0.042, 0.02, 0.034, 0.8],
    [0.43, 0.07, 0.034, 0.058, 0.72],
    [0.36, 0.093, 0.05, 0.082, 0.72],
    [0.28, 0.108, 0.066, 0.1, 0.78],
    [0.19, 0.117, 0.083, 0.11, 0.86],
    [0.09, 0.12, 0.098, 0.112, 0.95],
    [-0.01, 0.112, 0.104, 0.1, 1],
    [-0.11, 0.092, 0.1, 0.086, 1],
    [-0.2, 0.064, 0.086, 0.07, 1],
    [-0.28, 0.038, 0.068, 0.052, 1],
    [-0.35, 0.02, 0.048, 0.036, 1],
    [-0.41, 0.012, 0.03, 0.022, 1],
    [-0.445, 0.009, 0.015, 0.012, 1],
  ];
  const sides = 18;
  const ids: number[][] = [];
  for (const [z, w, hu, hd, e] of rings) {
    const ring: number[] = [];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * TAU;
      const s = Math.sin(a);
      const c = Math.cos(a);
      const x = Math.sign(s) * Math.pow(Math.abs(s), e) * w;
      const y = Math.sign(c) * Math.pow(Math.abs(c), e) * (c > 0 ? hu : hd);
      ring.push(vtx(x, y, z, 0));
    }
    ids.push(ring);
  }
  const nose = vtx(0, -0.002, 0.506, 0);
  const tail = vtx(0, 0, -0.452, 0);
  for (let k = 0; k < sides; k++) {
    const k1 = (k + 1) % sides;
    idx.push(nose, ids[0][k1], ids[0][k]);
    for (let r = 0; r + 1 < ids.length; r++) {
      const a = ids[r][k], c = ids[r][k1], d = ids[r + 1][k], e = ids[r + 1][k1];
      idx.push(a, c, d, c, e, d);
    }
    const L = ids[ids.length - 1];
    idx.push(tail, L[k], L[k1]);
  }
  // a fin both ways round (offset a hair along `n`), each face wound to look its own way
  const fin = (pts: number[][], tris: number[][], top: number, under: number, n: [number, number, number]) => {
    const off = 0.0028;
    for (const s of [1, -1]) {
      const v = pts.map((q) => vtx(q[0] + n[0] * off * s, q[1] + n[1] * off * s, q[2] + n[2] * off * s, s > 0 ? top : under));
      for (const [i, j, k] of tris) {
        const a = pts[i], b = pts[j], c = pts[k];
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const d = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
        if (d * s > 0) idx.push(v[i], v[j], v[k]);
        else idx.push(v[i], v[k], v[j]);
      }
    }
  };
  // the dorsal: a small hooked fin on the hump
  fin([[0, 0.098, -0.06], [0, 0.086, -0.2], [0, 0.128, -0.15], [0, 0.124, -0.178]], [[0, 2, 1], [2, 3, 1]], 3, 3, [1, 0, 0]);
  // flukes: broad, swept, pointed tips, a ragged trailing edge and a notch
  const N = 8;
  for (const sx of [1, -1]) {
    const pts: number[][] = [];
    const tris: number[][] = [];
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const x = sx * 0.172 * u;
      const lead = -0.418 - 0.09 * Math.pow(u, 1.5);
      const chord = 0.006 + 0.052 * (1 - Math.pow(u, 2.2));
      const trail = i === 0 ? -0.462 : lead - chord - (i % 2 ? 0.004 : 0);
      pts.push([x, 0, lead], [x, 0, trail]);
      if (i) tris.push([2 * i - 2, 2 * i - 1, 2 * i], [2 * i - 1, 2 * i + 1, 2 * i]);
    }
    fin(pts, tris, 1, 4, [0, 1, 0]);
  }
  // flippers: a third of her length, slung low and swept back, knobbed along the leading edge
  for (const sx of [1, -1]) {
    const R = new THREE.Vector3(sx * 0.098, -0.052, 0.21);
    const T = new THREE.Vector3(sx * 0.3, -0.125, 0.0);
    const S = T.clone().sub(R);
    const len = S.length();
    S.normalize();
    const C = new THREE.Vector3(0, 0, -1).addScaledVector(S, S.z).normalize();
    const n = new THREE.Vector3().crossVectors(S, C).normalize();
    if (n.y < 0) n.negate();
    const pts: number[][] = [];
    const tris: number[][] = [];
    const M = 10;
    for (let i = 0; i < M; i++) {
      const u = i / (M - 1);
      const chord = 0.008 + 0.052 * Math.pow(1 - u, 0.7);
      const bump = 0.0045 * Math.max(0, Math.sin(u * Math.PI * 9));
      const a = R.clone().addScaledVector(S, u * len).addScaledVector(C, -0.35 * chord - bump);
      const b = R.clone().addScaledVector(S, u * len).addScaledVector(C, 0.65 * chord);
      pts.push([a.x, a.y, a.z], [b.x, b.y, b.z]);
      if (i) tris.push([2 * i - 2, 2 * i - 1, 2 * i], [2 * i - 1, 2 * i + 1, 2 * i]);
    }
    fin(pts, tris, 2, 5, [n.x, n.y, n.z]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- shader

const POSE_GLSL = /* glsl */ `
attribute float aPart;
attribute vec4 aStroke; // fluke phase, stroke amplitude, arch along her path, flippers raised
attribute vec2 aSkin;   // who she is (0..1), calf paleness
varying vec3 vWhaleP;
varying vec3 vWhaleN;
varying float vWhalePart;
varying vec2 vWhaleSkin;
// A slow beat of the flukes running back from the shoulders, the flippers
// raised from the shoulder (spread in a breach, lifted for a slap) and sculling
// a little, the whole body bending along the arc she swims.
void whalePose(inout vec3 p, inout vec3 n) {
  vWhaleP = p;
  vWhaleN = n;
  vWhalePart = aPart;
  vWhaleSkin = aSkin;
  float part = floor(aPart + 0.5);
  if (part == 2.0 || part == 5.0) {
    float s = sign(p.x);
    vec2 root = vec2(s * 0.098, -0.052);
    float a = s * (aStroke.w + 0.07 * sin(aStroke.x * 0.5 + 1.0));
    float c = cos(a), si = sin(a);
    vec2 r = p.xy - root;
    p.xy = root + vec2(c * r.x - si * r.y, si * r.x + c * r.y);
    n.xy = vec2(c * n.x - si * n.y, si * n.x + c * n.y);
  }
  float t = clamp((0.05 - p.z) / 0.5, 0.0, 1.0);
  float w = t * t * (0.35 + 0.65 * t);
  float wave = aStroke.x + p.z * 3.6;
  float head = smoothstep(0.15, 0.5, p.z) * 0.08;
  p.y += aStroke.y * (w * sin(wave) - head * sin(aStroke.x + 0.6));
  float slope = aStroke.y * ((-1.0 / 0.5) * (0.7 * t + 1.95 * t * t) * sin(wave) + w * 3.6 * cos(wave));
  // the flukes feather against the stroke, a quarter beat behind it
  if (part == 1.0 || part == 4.0) {
    float f = cos(aStroke.x - 0.45) * aStroke.y * 2.4;
    p.y += (p.z + 0.42) * f;
    slope += f;
  }
  p.y += aStroke.z * (p.z * p.z * 4.0 - 0.12);
  slope += aStroke.z * p.z * 8.0;
  n = normalize(vec3(n.x, n.y, n.z - n.y * slope));
}
`;

const SKIN_GLSL = /* glsl */ `
varying vec3 vWhaleP;
varying vec3 vWhaleN;
varying float vWhalePart;
varying vec2 vWhaleSkin;
float whHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float whNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(whHash(i), whHash(i + vec2(1.0, 0.0)), f.x), mix(whHash(i + vec2(0.0, 1.0)), whHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 whaleSkin() {
  vec3 p = vWhaleP;
  float part = floor(vWhalePart + 0.5);
  float id = vWhaleSkin.x;
  vec3 dark = mix(vec3(0.02, 0.024, 0.03), vec3(0.08, 0.09, 0.1), vWhaleSkin.y);
  vec3 white = vec3(0.7, 0.72, 0.72);
  float n1 = whNoise(p.xz * 24.0 + id * 71.0);
  float n2 = whNoise(p.zy * 70.0 + id * 13.0);
  vec3 col = dark * (0.85 + 0.3 * n2);
  if (part == 0.0) {
    // dark above; how far the white comes up her belly and flanks is her own
    float n0 = whNoise(p.xz * vec2(9.0, 7.0) + id * 31.0);
    float under = -vWhaleN.y + (n0 - 0.5) * 0.45 + mix(-0.4, 0.25, fract(id * 7.31));
    float wt = smoothstep(0.32, 0.62, under) * smoothstep(-0.36, -0.2, p.z);
    // freckled where the white meets the dark
    wt *= 1.0 - step(0.6, n1) * smoothstep(0.62, 0.38, under) * 0.8;
    col = mix(col, white * (0.82 + 0.18 * n2), wt);
    // the throat pleats, chin to navel
    float pleat = smoothstep(0.4, 1.0, sin(atan(p.x, -p.y) * 44.0)) * smoothstep(-0.25, -0.6, vWhaleN.y) * smoothstep(-0.06, 0.06, p.z) * smoothstep(0.49, 0.4, p.z);
    col *= 1.0 - pleat * 0.5;
    if (p.z > 0.25) {
      // knobs on the rostrum and the chin, each with a stiff hair and a pale rim
      vec2 g = vec2(p.x * 40.0, p.z * 32.0);
      float knob = (1.0 - smoothstep(0.14, 0.32, length(fract(g) - 0.5))) * step(0.45, whHash(floor(g) + id * 17.0)) * step(0.35, abs(vWhaleN.y));
      col = mix(col, col * 1.7 + 0.025, knob * 0.7);
      // the twin blowholes behind their splash guard
      float bh = length(vec2(abs(p.x) - 0.011, (p.z - 0.33) * 0.4));
      col *= 1.0 - 0.8 * (1.0 - smoothstep(0.003, 0.006, bh)) * step(0.5, vWhaleN.y);
      // the long curve of the mouth, and the eye at its corner
      float my = -0.012 - (0.5 - p.z) * 0.1;
      col *= 1.0 - 0.6 * (1.0 - smoothstep(0.0015, 0.004, abs(p.y - my))) * step(abs(vWhaleN.y), 0.75);
      col *= 1.0 - 0.75 * (1.0 - smoothstep(0.005, 0.008, length(vec2(p.z - 0.262, p.y + 0.032)))) * step(0.5, abs(vWhaleN.x));
    }
    // barnacles crusting the chin and the tip of the jaw
    float barn = step(0.74, whNoise(p.xz * 150.0 + id * 9.0)) * smoothstep(0.38, 0.47, p.z) * smoothstep(0.3, -0.4, vWhaleN.y);
    col = mix(col, vec3(0.55, 0.55, 0.5), barn * 0.85);
    // a few pale old scars raked along the flanks
    float rake = smoothstep(0.93, 0.99, sin(p.y * 240.0 + p.z * 50.0 + id * 40.0)) * step(0.72, whNoise(p.zy * vec2(9.0, 4.0) + id * 23.0)) * step(abs(vWhaleN.y), 0.6);
    col = mix(col, vec3(0.32, 0.33, 0.34), rake * 0.5);
  } else if (part == 4.0) {
    // the underside of her flukes: white, splashed with a black pattern that is hers alone
    float k = whNoise(p.xz * vec2(16.0, 34.0) + id * 37.0) * 0.7 + whNoise(p.xz * 60.0 + id * 11.0) * 0.3;
    float black = smoothstep(0.5, 0.56, k + mix(-0.28, 0.22, fract(id * 3.7)));
    black = max(black, smoothstep(-0.445, -0.425, p.z));
    col = mix(white * (0.9 + 0.1 * n2), dark, black);
    col = mix(col, vec3(0.55, 0.55, 0.5), step(0.82, whNoise(p.xz * 180.0 + id)) * 0.7);
  } else if (part == 2.0) {
    // the tops of the flippers: white, or mottled, or nearly black
    col = mix(col, white, smoothstep(0.45, 0.6, n1 + fract(id * 5.1) - 0.3));
    col = mix(col, vec3(0.55, 0.55, 0.5), step(0.8, whNoise(p.xz * 150.0 + id * 3.0)) * 0.6);
  } else if (part == 5.0) {
    col = white * (0.88 + 0.12 * n2);
  }
  return col;
}
`;

function whaleShader(shader: { vertexShader: string; fragmentShader: string }) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${POSE_GLSL}`)
    .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normal;\n  vec3 whaleP = position;\n  whalePose(whaleP, objectNormal);')
    .replace('#include <begin_vertex>', 'vec3 transformed = whaleP;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${SKIN_GLSL}`)
    .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = whaleSkin();');
}

// ---------------------------------------------------------------- the pod

/**
 * What she's doing: travelling below, up for a breath (and rolling her back
 * through), lying on her side slapping a flipper, sounding (flukes up and
 * down deep), running up from the deep for a breach, or in the air.
 */
type Act = 'swim' | 'blow' | 'slap' | 'sound' | 'rise' | 'air';

interface Whale {
  x: number;
  y: number;
  z: number;
  yaw: number;
  yawRate: number;
  /** Nose up (+) or down; she swims where she points. */
  pitch: number;
  pitchRate: number;
  roll: number;
  rollTo: number;
  vy: number;
  speed: number;
  phase: number;
  amp: number;
  bend: number;
  /** Flippers raised (rad) and where they're headed. */
  pec: number;
  pecTo: number;
  size: number;
  /** Her markings (0..1) and how pale she is (a calf is a softer grey). */
  id: number;
  pale: number;
  mother: Whale | null;
  /** Her place in the line: metres behind the head of the pod, and across. */
  back: number;
  side: number;
  wobble: number;
  act: Act;
  actT: number;
  /** Where she travels (m below the surface) between breaths, and while the pod is down. */
  depth: number;
  breaths: number;
  nextT: number;
  sounded: boolean;
  /** This bout she'll breach (instead of a breath), or lie on her side and slap. */
  breach: number;
  slaps: number;
  blown: boolean;
  primed: boolean;
  washT: number;
  dripT: number;
  tailUp: boolean;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();

/** The pieces a humpback's song is made of. */
function composeTheme(): SongUnit[] {
  const n = 3 + Math.floor(Math.random() * 3);
  const out: SongUnit[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.random();
    if (r < 0.38) {
      // a long moan, sliding
      const f = rand(150, 380);
      out.push({ kind: 'moan', f0: f, f1: f * rand(0.75, 1.5), f2: f * rand(0.6, 1.1), len: rand(1.4, 2.6), gap: rand(0.3, 0.8) });
    } else if (r < 0.58) {
      // a high, plaintive cry
      const f = rand(520, 1100);
      out.push({ kind: 'cry', f0: f, f1: f * rand(1.1, 1.6), f2: f * rand(0.7, 1.0), len: rand(0.8, 1.6), gap: rand(0.3, 0.7) });
    } else if (r < 0.8) {
      // a whoop that swoops up
      const f = rand(110, 220);
      out.push({ kind: 'whoop', f0: f, f1: f * rand(2, 3.2), f2: f * rand(2.2, 3.4), len: rand(0.45, 0.9), gap: rand(0.2, 0.5) });
    } else {
      // a deep, rattling groan
      const f = rand(55, 110);
      out.push({ kind: 'groan', f0: f, f1: f * rand(0.8, 1.15), f2: f * rand(0.7, 0.9), len: rand(1.0, 2.0), gap: rand(0.3, 0.8) });
    }
  }
  return out;
}

export class Whales {
  readonly mesh: THREE.InstancedMesh;
  private stroke: THREE.InstancedBufferAttribute;
  private skin: THREE.InstancedBufferAttribute;
  private pod: Whale[] = [];
  /** The head of the pod, moving on along its migration. */
  private ax = 0;
  private az = 0;
  private dirX = 0;
  private dirZ = 1;
  private podSpeed = 2.4;
  private down = true;
  private podT = 0;
  private age = 0;
  private seen = false;
  private themes: SongUnit[][] = [];
  private theme = 0;
  private reps = 0;
  private songT = 6;
  /** The golden hours: a breach is far likelier then. */
  golden = false;
  /** First blow seen from your ship; and a breach. */
  onSighted: (at: THREE.Vector3) => void = () => {};
  onBreach: (at: THREE.Vector3) => void = () => {};

  constructor() {
    const geo = whaleGeometry();
    this.stroke = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4);
    this.stroke.setUsage(THREE.DynamicDrawUsage);
    this.skin = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 2), 2);
    this.skin.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aStroke', this.stroke);
    geo.setAttribute('aSkin', this.skin);
    const mat = patchMaterial(new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0, envMapIntensity: 1.15 }), { caustics: true, clouds: true });
    const base = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, r) => {
      base.call(mat, shader, r);
      whaleShader(shader);
    };
    const prevKey = mat.customProgramCacheKey;
    mat.customProgramCacheKey = () => prevKey.call(mat) + '|whale';
    this.mesh = new THREE.InstancedMesh(geo, mat, CAP);
    this.mesh.name = 'whales';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  /** Whether a pod is passing. */
  get active() {
    return this.pod.length > 0;
  }

  /**
   * A pod on its migration (heading `course`, rad) passes ahead of `ship`,
   * starting down deep so the first you see of them is a blow. False if
   * there's no deep water there for them (too near an archipelago).
   */
  summon(ship: Ship, course: number, w: World) {
    if (this.pod.length) return false;
    const fx = Math.sin(ship.heading);
    const fz = Math.cos(ship.heading);
    // where they'll cross your course: well ahead, a little to one side
    const ahead = clamp(120 + Math.max(0, ship.speed) * 16, 120, 380);
    const off = rand(-50, 50);
    const cx = ship.pos.x + fx * ahead - fz * off;
    const cz = ship.pos.z + fz * ahead + fx * off;
    const dx = Math.sin(course);
    const dz = Math.cos(course);
    const lead = rand(50, 100);
    for (let k = -1; k <= 3; k++) if (w.terrain.heightAt(cx + dx * lead * k, cz + dz * lead * k) > -15) return false;
    this.dirX = dx;
    this.dirZ = dz;
    this.ax = cx - this.dirX * lead;
    this.az = cz - this.dirZ * lead;
    this.podSpeed = rand(2.1, 2.8);
    const n = 2 + Math.floor(Math.random() * 3);
    const calf = n < CAP && Math.random() < 0.45;
    const px = -this.dirZ;
    const pz = this.dirX;
    let back = 0;
    for (let i = 0; i < n; i++) {
      const size = i === 0 ? rand(1.0, 1.1) : rand(0.82, 1.02);
      const side = i === 0 ? 0 : (i % 2 ? 1 : -1) * rand(3, 9);
      this.pod.push(this.whale(size, back, side, null, px, pz));
      back += LEN * size * rand(1.3, 1.8);
    }
    if (calf) {
      // the calf keeps close in at her mother's flank, a little behind her eye
      const mother = this.pod[this.pod.length > 1 ? 1 : 0];
      mother.size = Math.max(mother.size, 1.02);
      const c = this.whale(rand(0.36, 0.44), 0, (Math.random() < 0.5 ? 1 : -1) * LEN * 0.36, mother, px, pz);
      c.pale = rand(0.55, 0.9);
      this.pod.push(c);
    }
    this.down = true;
    this.podT = rand(3, 6);
    this.age = 0;
    this.seen = false;
    this.themes = [composeTheme(), composeTheme(), composeTheme()];
    this.theme = 0;
    this.reps = 0;
    this.songT = rand(2, 5);
    return true;
  }

  private whale(size: number, back: number, side: number, mother: Whale | null, px: number, pz: number): Whale {
    const x = this.ax - this.dirX * back + px * side;
    const z = this.az - this.dirZ * back + pz * side;
    return {
      x, y: -9, z, yaw: Math.atan2(this.dirX, this.dirZ), yawRate: 0, pitch: 0, pitchRate: 0, roll: 0, rollTo: 0, vy: 0,
      speed: this.podSpeed, phase: Math.random() * TAU, amp: 0.02, bend: 0, pec: 0, pecTo: 0,
      size, id: Math.random(), pale: 0, mother, back, side, wobble: Math.random() * TAU, act: 'swim', actT: 0,
      depth: rand(7, 10), breaths: 0, nextT: 0, sounded: false, breach: 0, slaps: 0, blown: false, primed: false,
      washT: 0, dripT: 0, tailUp: false,
    };
  }

  /** Two drawn just under the sea at `at` for the loading screen's warm-up (cleared after). */
  warm(at: THREE.Vector3) {
    this.mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(at.x + 30, -4, at.z));
    this.mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(at.x - 30, -4, at.z));
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.count = 2;
  }

  /** Gone at once (a fresh voyage). */
  clear() {
    this.pod.length = 0;
    this.mesh.count = 0;
  }

  /** Up for another round of breaths: each in her turn, one perhaps breaching, one perhaps slapping. */
  private startBout() {
    this.down = false;
    this.podT = rand(55, 80);
    const adults = this.pod.filter((d) => !d.mother);
    const breacher = Math.random() < (this.golden ? 0.85 : 0.4) ? adults[(Math.random() * adults.length) | 0] : null;
    const slapper = Math.random() < 0.3 ? this.pod[(Math.random() * this.pod.length) | 0] : null;
    this.pod.forEach((d, i) => {
      d.sounded = false;
      d.breaths = d.mother ? 6 + Math.floor(Math.random() * 3) : 3 + Math.floor(Math.random() * 3);
      d.nextT = d.mother ? d.mother.nextT + rand(0.6, 2) : i * rand(1, 2.4) + rand(0, 1.5);
      d.breach = d === breacher ? 1 + Math.floor(Math.random() * 3) : 0;
      d.slaps = d === slapper && d !== breacher ? 2 + Math.floor(Math.random() * 3) : 0;
      d.depth = d.mother ? 2 : rand(3, 4.5);
    });
    // a calf now and then tries a breach of its own, after its mother
    const calf = this.pod.find((d) => d.mother);
    if (calf && calf.mother!.breach && Math.random() < 0.5) calf.breach = 1;
  }

  update(dt: number, w: World, ship: Ship | null) {
    if (!this.pod.length || dt <= 0) {
      if (!this.pod.length) this.mesh.count = 0;
      return;
    }
    dt = Math.min(dt, 0.05);
    this.age += dt;
    this.ax += this.dirX * this.podSpeed * dt;
    this.az += this.dirZ * this.podSpeed * dt;
    // the pod's rhythm: down travelling deep, then up for a round of breaths
    this.podT -= dt;
    if (this.down && this.podT <= 0) this.startBout();
    else if (!this.down) {
      if (this.podT <= 0) for (const d of this.pod) d.breaths = Math.min(d.breaths, d.breach ? 1 : 0);
      if (this.pod.every((d) => d.sounded)) {
        this.down = true;
        this.podT = rand(16, 30);
      }
    }
    const lx = w.listener.x;
    const lz = w.listener.z;
    const px = -this.dirZ;
    const pz = this.dirX;
    const sArr = this.stroke.array as Float32Array;
    const kArr = this.skin.array as Float32Array;
    let near = Infinity;
    let n = 0;
    for (const d of this.pod) {
      const Ls = LEN * d.size;
      const wh = w.waterHeight(d.x, d.z);
      const fx = Math.sin(d.yaw);
      const fz = Math.cos(d.yaw);
      const close = Math.hypot(d.x - lx, d.z - lz);
      near = Math.min(near, close);
      const show = close < 520;

      // ------------------------------------------------ her place in the line, a little ahead of it
      d.wobble += dt * 0.11;
      let sx: number;
      let sz: number;
      if (d.mother) {
        const m = d.mother;
        sx = m.x + px * d.side - this.dirX * Ls * 0.4;
        sz = m.z + pz * d.side - this.dirZ * Ls * 0.4;
      } else {
        const side = d.side + Math.sin(d.wobble) * 4;
        sx = this.ax - this.dirX * d.back + px * side;
        sz = this.az - this.dirZ * d.back + pz * side;
      }
      // a ship bearing down on her: she sounds and lets it pass over
      if (ship && ship.alive && d.act !== 'air' && d.act !== 'sound' && d.y > wh - 8) {
        const gap = Math.hypot(ship.pos.x - d.x, ship.pos.z - d.z);
        if (gap < Ls * 0.6 + ship.cls.length * 0.6 + 6) this.sound(d);
      }
      const along = (sx - d.x) * this.dirX + (sz - d.z) * this.dirZ;
      const tx = sx + this.dirX * 30;
      const tz = sz + this.dirZ * 30;
      if (d.act !== 'air') {
        const toYaw = Math.atan2(tx - d.x, tz - d.z);
        const wantRate = clamp(angleDelta(d.yaw, toYaw) * 0.5, -0.16, 0.16);
        d.yawRate += (wantRate - d.yawRate) * damp(1.2, dt);
        let want = this.podSpeed + clamp(along * 0.1, -1.2, 2.2);
        if (d.act === 'sound') want = 1.7;
        else if (d.act === 'slap') want = this.podSpeed * 0.5;
        else if (d.act === 'rise' && d.primed) want = 14;
        d.speed = lerp(d.speed, want, damp(d.act === 'rise' ? 1.1 : 0.5, dt));
      }
      d.yaw += d.yawRate * dt;

      // ------------------------------------------------ what she does next
      d.nextT -= dt;
      if (!this.down && d.act === 'swim' && !d.sounded && d.nextT <= 0) {
        if (d.breach && d.breaths <= (d.mother ? 4 : 2) && !(ship && Math.hypot(ship.pos.x - d.x, ship.pos.z - d.z) < 45)) {
          d.act = 'rise';
          d.primed = false;
        } else if (d.breaths > 0) {
          d.act = 'blow';
          d.blown = false;
          d.actT = 0;
          d.breaths--;
        } else this.sound(d);
      }

      // ------------------------------------------------ up and down: she swims where she points
      let wantPitch = 0;
      let maxRate = 0.28;
      const crown = wh - 0.068 * Ls;
      if (d.act === 'swim') {
        const target = wh - d.depth + Math.sin(d.wobble * 3) * 0.4;
        wantPitch = clamp((target - d.y) * 0.08, -0.3, 0.3);
        // pulling out of a steep dive
        if (Math.abs(d.pitch) > 0.5) maxRate = 0.6;
      } else if (d.act === 'blow' || d.act === 'slap') {
        wantPitch = clamp((crown + 0.15 - d.y) * 0.3, -0.12, 0.3);
        if (d.act === 'blow' && !d.blown && d.y > crown - 0.25) {
          d.blown = true;
          d.actT = 0;
          this.blow(w, d, show, ship);
        }
        if (d.blown) d.actT += dt;
        if (d.act === 'blow' && d.blown && d.actT > (d.mother ? 1.1 : 1.8)) {
          if (d.slaps) {
            d.act = 'slap';
            d.actT = 0;
            d.rollTo = (Math.random() < 0.5 ? 1 : -1) * 1.4;
          } else if (d.breaths <= 0 && !d.breach) this.sound(d);
          else {
            d.act = 'swim';
            d.nextT = d.mother ? rand(3.5, 6) : rand(6, 10);
          }
        }
        if (d.act === 'slap') this.slap(w, d, dt, show);
      } else if (d.act === 'sound') {
        // the arch over and the flukes lifted clear: the dive down deep
        wantPitch = -1.36;
        maxRate = 0.62;
        if (d.y < wh - 7.5) {
          d.act = 'swim';
          d.sounded = true;
          d.depth = rand(7, 10);
        }
      } else if (d.act === 'rise') {
        if (!d.primed) {
          // down a way first, to run up at the surface
          wantPitch = clamp((wh - 11 - d.y) * 0.1, -0.55, 0.1);
          maxRate = 0.45;
          if (d.y < wh - 9) d.primed = true;
        } else {
          wantPitch = 1.22;
          maxRate = 0.75;
          // the head breaks the surface: up she goes
          if (d.y + Math.sin(d.pitch) * Ls * 0.5 > wh && d.pitch > 0.7) this.launch(w, d, show);
        }
      }
      const prevPitch = d.pitch;
      if (d.act === 'air') {
        // two thirds of her clear, rolling over onto her back, flippers spread
        d.vy -= 9.81 * dt;
        d.y += d.vy * dt;
        d.pitch = Math.max(-0.25, d.pitch - dt * 0.62);
        d.x += fx * d.speed * dt;
        d.z += fz * d.speed * dt;
        d.pecTo = 0.55;
        this.stream(w, d, dt, show);
        if (d.vy < 0 && d.y < wh + 0.02 * Ls) this.land(w, d, show);
      } else {
        const wr = clamp((wantPitch - d.pitch) * 1.5, -maxRate, maxRate);
        d.pitchRate += (wr - d.pitchRate) * damp(2.5, dt);
        d.pitch = clamp(d.pitch + d.pitchRate * dt, -1.42, 1.3);
        const c = Math.cos(d.pitch);
        d.x += fx * d.speed * c * dt;
        d.z += fz * d.speed * c * dt;
        d.y += Math.sin(d.pitch) * d.speed * dt;
        // never more of her above the water than her back, unless she's breaching or sounding
        // (and back down smoothly from a breach)
        const cap = crown + 0.15;
        if (d.act !== 'rise' && d.act !== 'sound' && d.y > cap) d.y += (cap - d.y) * damp(5, dt);
        // and never into the seabed
        d.y = Math.max(d.y, w.terrain.heightAt(d.x, d.z) + 0.12 * Ls);
        if (d.act !== 'slap') d.pecTo = 0;
      }
      // her back washing through the surface
      if (show && d.y > crown - 0.6 && d.act !== 'air') {
        d.washT -= dt;
        if (d.washT <= 0) {
          d.washT = 0.3;
          w.wake.stamp(d.x - fx * Ls * 0.1, d.z - fz * Ls * 0.1, Ls * 0.13, 0.14);
        }
      }
      if (d.act === 'sound' && show) this.flukes(w, d, dt, wh);

      d.roll += (d.rollTo + clamp(-d.yawRate * 2, -0.2, 0.2) - d.roll) * damp(d.act === 'air' ? 1.6 : 1.4, dt);
      d.pec += (d.pecTo - d.pec) * damp(d.pecTo < d.pec - 0.3 ? 11 : 2.5, dt);
      // the stroke: slow and deep, harder on the run up, a glide in the air
      const thrust = d.act === 'air' ? 0.004 : d.act === 'rise' && d.primed ? 0.075 : d.act === 'slap' ? 0.01 : d.act === 'sound' ? 0.03 : 0.022 + Math.min(0.02, d.speed * 0.004);
      d.amp += (thrust - d.amp) * damp(2, dt);
      d.phase += TAU * Math.max(0.22, d.speed / (1.6 * Ls)) * dt * (d.act === 'air' ? 0.3 : 1);
      const curve = (d.pitch - prevPitch) / dt / Math.max(d.speed, 2);
      d.bend += (clamp(curve * 1.4, -0.07, 0.07) - d.bend) * damp(3, dt);

      _e.set(-d.pitch, d.yaw, d.roll, 'YXZ');
      _q.setFromEuler(_e);
      _m.compose(_p.set(d.x, d.y, d.z), _q, _s.set(Ls, Ls, Ls));
      _m.toArray(this.mesh.instanceMatrix.array, n * 16);
      sArr[n * 4] = d.phase;
      sArr[n * 4 + 1] = d.amp;
      sArr[n * 4 + 2] = d.bend;
      sArr[n * 4 + 3] = d.pec;
      kArr[n * 2] = d.id;
      kArr[n * 2 + 1] = d.pale;
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.clearUpdateRanges();
    this.mesh.instanceMatrix.addUpdateRange(0, n * 16);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.stroke.clearUpdateRanges();
    this.stroke.addUpdateRange(0, n * 4);
    this.stroke.needsUpdate = true;
    this.skin.clearUpdateRanges();
    this.skin.addUpdateRange(0, n * 2);
    this.skin.needsUpdate = true;

    // their song, through the hull: each theme a few times over, then the next
    this.songT -= dt;
    if (this.songT <= 0 && near < 700) {
      const d = this.pod[(Math.random() * this.pod.length) | 0];
      const [, pan] = w.soundAt(_p.set(d.x, 0, d.z));
      const still = ship ? 1 - clamp(ship.speed / Math.max(1, ship.cls.maxSpeed), 0, 1) : 1;
      const vol = 0.5 * Math.pow(clamp(1 - near / 700, 0, 1), 1.4) * (0.55 + 0.45 * still);
      const len = w.audio.whaleSong(this.themes[this.theme], vol, pan * 0.6);
      this.songT = len + rand(2.5, 6);
      if (++this.reps >= 2 + Math.floor(Math.random() * 2)) {
        this.reps = 0;
        this.theme = (this.theme + 1) % this.themes.length;
      }
    } else if (this.songT <= 0) this.songT = 3;

    // passed by and gone into the blue
    if ((this.age > 45 && near > 820) || (this.age > 420 && near > 480)) this.clear();
  }

  // ---------------------------------------------------------------- moments

  /** The last breath taken: she arches over, lifts her flukes and goes down deep. */
  private sound(d: Whale) {
    d.act = 'sound';
    d.rollTo = 0;
    d.slaps = 0;
    d.breach = 0;
    d.breaths = 0;
    d.tailUp = false;
  }

  /** A breath: a bushy column of spray from the blowholes, gone on the wind, and its boom. */
  private blow(w: World, d: Whale, show: boolean, ship: Ship | null) {
    if (!show) return;
    const Ls = LEN * d.size;
    _v.set(0, 0.075, 0.33).multiplyScalar(Ls).applyQuaternion(_q.setFromEuler(_e.set(-d.pitch, d.yaw, d.roll, 'YXZ')));
    const x = d.x + _v.x;
    const z = d.z + _v.z;
    const y = w.waterHeight(x, z) + 0.15;
    const k = Math.sqrt(d.size);
    const wd = w.wind;
    const P = w.particles;
    // a tall, bushy column, widening as it climbs
    for (let i = 0; i < 12 + 8 * k; i++) {
      const up = rand(0.55, 1);
      P.emit({
        x: x + rand(-0.3, 0.3) * k, y, z: z + rand(-0.3, 0.3) * k,
        vx: wd.dirX * 1.4 * wd.strength + rand(-1.2, 1.2) * k * (1.3 - up), vy: 15 * up * k, vz: wd.dirZ * 1.4 * wd.strength + rand(-1.2, 1.2) * k * (1.3 - up),
        life: rand(2.4, 3.6), size: rand(0.5, 0.9) * k, sizeEnd: rand(3, 4.6) * k, color: [1.45, 1.5, 1.55], alpha: 0.42, drag: 2.4, grav: 1.3, spin: rand(-0.4, 0.4), kind: 1, fadeIn: 0.04,
      });
    }
    for (let i = 0; i < 8; i++) {
      P.emit({
        x, y, z, vx: rand(-1.4, 1.4), vy: rand(6, 11) * k, vz: rand(-1.4, 1.4),
        life: rand(0.9, 1.5), size: rand(0.12, 0.22), sizeEnd: 0.08, color: [1.35, 1.42, 1.48], alpha: 0.85, grav: 9, drag: 0.9, kind: 0, fadeIn: 0.01,
      });
    }
    w.wake.stamp(x, z, 2.2 * k, 0.5);
    const [vol, pan, dist] = w.soundAt(_p.set(x, y, z));
    w.audio.whaleBlow(vol, pan, dist, d.size);
    if (!this.seen && ship && Math.hypot(x - ship.pos.x, z - ship.pos.z) < 480) {
      this.seen = true;
      this.onSighted(_p.set(x, y, z));
    }
  }

  /** On her side, a long white flipper lifted high and brought down flat on the water: again, and again. */
  private slap(w: World, d: Whale, dt: number, show: boolean) {
    if (Math.abs(d.roll) < 1.05) return;
    const before = d.actT % 2.6;
    d.actT += dt;
    const c = d.actT % 2.6;
    // up until it stands straight into the sky, then over and down flat on the water
    d.pecTo = c < 1.7 ? 0.55 : -1.05;
    if (before < 1.95 && c >= 1.95) {
      d.slaps--;
      if (show) {
        const Ls = LEN * d.size;
        // where the flipper meets the water: out past her belly on the upturned side
        const up = Math.sign(d.roll);
        const fx = Math.sin(d.yaw);
        const fz = Math.cos(d.yaw);
        const x = d.x + fx * Ls * 0.08 + fz * up * Ls * 0.3;
        const z = d.z + fz * Ls * 0.08 - fx * up * Ls * 0.3;
        _p.set(x, w.waterHeight(x, z), z);
        w.particles.splash(_p, 0.75);
        w.wake.stamp(x, z, 3.2, 0.9, true);
        const [vol, pan, dist] = w.soundAt(_p);
        w.audio.whaleSlap(vol, pan, dist);
      }
      if (d.slaps <= 0) {
        d.rollTo = 0;
        d.act = 'swim';
        d.nextT = rand(4, 7);
      }
    }
  }

  /** Flukes up: water streaming off their trailing edge, then a slick where they slid under. */
  private flukes(w: World, d: Whale, dt: number, wh: number) {
    const Ls = LEN * d.size;
    _q.setFromEuler(_e.set(-d.pitch, d.yaw, d.roll, 'YXZ'));
    _v.set(0, 0, -0.47 * Ls).applyQuaternion(_q);
    const tx = d.x + _v.x;
    const ty = d.y + _v.y;
    const tz = d.z + _v.z;
    const up = ty > wh + 0.35 * d.size;
    if (up && !d.tailUp) {
      // breaking the surface: a curtain of water pours off
      _p.set(tx, wh, tz);
      w.particles.splash(_p, 0.45 * d.size);
    }
    if (up) {
      d.dripT += dt * 55 * d.size;
      const P = w.particles;
      while (d.dripT >= 1) {
        d.dripT--;
        _v.set(rand(-0.17, 0.17), 0, -0.5 + rand(0, 0.03)).multiplyScalar(Ls).applyQuaternion(_q);
        P.emit({
          x: d.x + _v.x, y: d.y + _v.y, z: d.z + _v.z, vx: rand(-0.3, 0.3), vy: rand(-1, 0.3), vz: rand(-0.3, 0.3),
          life: rand(0.6, 1.0), size: rand(0.08, 0.16), sizeEnd: 0.05, color: [1.35, 1.42, 1.5], alpha: 0.85, grav: 9.8, drag: 0.2, kind: 0, fadeIn: 0.01,
        });
      }
    } else if (d.tailUp) {
      // the fluke print: a smooth ring left where she went down
      w.wake.stamp(tx, tz, Ls * 0.22, 0.45, true);
      w.wake.stamp(tx, tz, Ls * 0.12, 0.35);
      _p.set(tx, wh, tz);
      const [vol, pan, dist] = w.soundAt(_p);
      w.audio.splash(vol * 0.5 * d.size, pan, dist);
    }
    d.tailUp = up;
  }

  /** Out of the sea in a rush of white water. */
  private launch(w: World, d: Whale, show: boolean) {
    d.act = 'air';
    d.vy = clamp(d.speed * Math.sin(d.pitch), 11, 13.2) * Math.sqrt(d.size);
    d.speed = Math.max(2, d.speed * Math.cos(d.pitch));
    d.rollTo = (Math.random() < 0.5 ? 1 : -1) * rand(1.3, 1.9);
    d.dripT = 0;
    if (!show) return;
    const fx = Math.sin(d.yaw);
    const fz = Math.cos(d.yaw);
    const Ls = LEN * d.size;
    _p.set(d.x + fx * Ls * 0.2, w.waterHeight(d.x, d.z), d.z + fz * Ls * 0.2);
    w.particles.splash(_p, 1.1 * d.size);
    w.wake.stamp(_p.x, _p.z, Ls * 0.3, 0.9);
    const [vol, pan, dist] = w.soundAt(_p);
    w.audio.krakenRise(vol * 0.55, pan, dist, 0.7 + 0.3 * d.size);
    this.onBreach(_p);
  }

  /** Sheets and ropes of water pouring off her as she climbs. */
  private stream(w: World, d: Whale, dt: number, show: boolean) {
    if (!show) return;
    const Ls = LEN * d.size;
    d.dripT += dt * (d.vy > 3 ? 70 : 28) * d.size;
    _q.setFromEuler(_e.set(-d.pitch, d.yaw, d.roll, 'YXZ'));
    const vx = Math.sin(d.yaw) * d.speed;
    const vz = Math.cos(d.yaw) * d.speed;
    const P = w.particles;
    while (d.dripT >= 1) {
      d.dripT--;
      _v.set(rand(-0.08, 0.08), rand(-0.06, 0.08), rand(-0.42, 0.3)).multiplyScalar(Ls).applyQuaternion(_q);
      const y = d.y + _v.y;
      if (y < w.waterHeight(d.x, d.z) + 0.2) continue;
      P.emit({
        x: d.x + _v.x, y, z: d.z + _v.z, vx: vx * 0.7 + rand(-0.8, 0.8), vy: d.vy * 0.6 + rand(-1, 1), vz: vz * 0.7 + rand(-0.8, 0.8),
        life: rand(0.8, 1.4), size: rand(0.14, 0.32), sizeEnd: 0.08, color: [1.35, 1.42, 1.5], alpha: 0.85, grav: 11, drag: 0.4, kind: 0, fadeIn: 0.01,
      });
    }
  }

  /** Down on her back in a tower of white water: the boom carries for miles. */
  private land(w: World, d: Whale, show: boolean) {
    d.act = 'swim';
    d.speed = Math.max(3, d.speed * 0.7);
    d.pitch = Math.min(d.pitch, -0.15);
    d.pitchRate = -0.2;
    d.rollTo = 0;
    d.pecTo = 0;
    if (--d.breach > 0 && !this.down && Math.random() < 0.7) d.nextT = rand(3, 6);
    else {
      d.breach = 0;
      d.nextT = rand(4, 7);
    }
    if (!show) return;
    const Ls = LEN * d.size;
    const k = d.size;
    const fx = Math.sin(d.yaw);
    const fz = Math.cos(d.yaw);
    const wh = w.waterHeight(d.x, d.z);
    const P = w.particles;
    // a crown thrown out all along her length
    for (let i = 0; i < 60 * k; i++) {
      const u = rand(-0.42, 0.4) * Ls;
      const a = Math.random() * TAU;
      const out = rand(2, 8) * k;
      P.emit({
        x: d.x + fx * u + Math.cos(a) * 1.2, y: wh + 0.2, z: d.z + fz * u + Math.sin(a) * 1.2,
        vx: Math.cos(a) * out, vy: rand(6, 17) * Math.sqrt(k), vz: Math.sin(a) * out,
        life: rand(1.2, 2.2), size: rand(0.4, 1.0) * k, sizeEnd: 0.3, color: [1.35, 1.42, 1.48], alpha: 0.95, grav: 11, drag: 0.5, kind: 0, fadeIn: 0.01,
      });
    }
    // white sheets rising and falling back
    for (let i = 0; i < 14; i++) {
      const u = rand(-0.35, 0.3) * Ls;
      P.emit({
        x: d.x + fx * u + rand(-1.5, 1.5), y: wh + 0.4, z: d.z + fz * u + rand(-1.5, 1.5), vx: rand(-1.5, 1.5), vy: rand(4, 10) * Math.sqrt(k), vz: rand(-1.5, 1.5),
        life: rand(1.3, 2.1), size: rand(2, 3) * k, sizeEnd: rand(5.5, 8) * k, color: [1.3, 1.36, 1.42], alpha: 0.72, grav: 6, drag: 1.2, spin: rand(-0.5, 0.5), kind: 1, fadeIn: 0.01,
      });
    }
    // and a drifting cloud of mist that hangs a long moment
    const wd = w.wind;
    for (let i = 0; i < 10; i++) {
      const u = rand(-0.35, 0.3) * Ls;
      P.emit({
        x: d.x + fx * u, y: wh + rand(1, 4), z: d.z + fz * u, vx: wd.dirX * 1.6 + rand(-1, 1), vy: rand(0.4, 1.6), vz: wd.dirZ * 1.6 + rand(-1, 1),
        life: rand(3, 5), size: rand(3, 5) * k, sizeEnd: rand(10, 15) * k, color: [1.2, 1.26, 1.32], alpha: 0.28, drag: 1.4, spin: rand(-0.3, 0.3), kind: 1, fadeIn: 0.15,
      });
    }
    w.wake.push(d.x, d.z, Ls * 0.4, -1.1 * k);
    w.wake.stamp(d.x, d.z, Ls * 0.62, 1, true);
    w.wake.stamp(d.x, d.z, Ls * 0.42, 1.2);
    const [vol, pan, dist] = w.soundAt(_p.set(d.x, wh, d.z));
    w.audio.whaleSlam(vol, pan, dist, k);
  }
}
