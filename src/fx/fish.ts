import * as THREE from 'three';
import { angleDelta, clamp, damp, lerp, mulberry32 } from '../core/noise';
import { patchMaterial } from '../render/environment';
import type { World } from '../game/world';
import type { Ship } from '../ships/ship';
import type { Island, SeaFloor } from '../world/terrain';

// Reef life. Every island's shallows teem: shoals of tropical fish (blue and
// yellow tangs, clownfish, sergeant majors, wrasse, and great glittering bait
// balls of silversides) flow over the turquoise flats in loose, breathing
// schools that follow the reef's contour, flare apart in a flash when a hull
// glides over them or a ball smacks into the water, and drift back together.
// Groupers and parrotfish cruise the bottom alone, spotted eagle rays glide
// over the sand on slow wingbeats, and sea turtles paddle about and rise to the
// surface now and then to breathe. The fish swim in the vertex shader: a
// travelling wave runs down each body to a beating tail, the body curls into
// its turns, ray wings ripple and turtle flippers row. Their colours and
// patterns are painted per pixel from the body's own coordinates. The sea
// shades them like the seabed (depth tint, refraction, sun caustics), so they
// read as truly under water. On the CPU each shoal is a leader steering along
// the depth contour and its fish chase slots around it; only shoals near the
// camera are simulated, only those in view are drawn, and it all goes out in
// three instanced draws (near reef fish, far reef fish, the big swimmers),
// sharing one shader.

const TAU = Math.PI * 2;
/** Reef fish nearer than this use the detailed body. */
const NEAR_LOD = 115;
/** Shallows a shoal will swim over (seabed height, m). */
const SHOAL_MIN = -0.9;
const SHOAL_MAX = -5.5;

// ---------------------------------------------------------------- species

interface Species {
  len: number; // body length (m)
  deep: number; // body depth multiplier
  wide: number;
  speed: number; // cruising speed (m/s)
  beat: number; // tail beat rate
}

// 0 blue tang, 1 yellow tang, 2 clownfish, 3 sergeant major, 4 wrasse,
// 5 silverside, 6 grouper, 7 parrotfish, 8 eagle ray, 9 turtle
const SPECIES: Species[] = [
  { len: 0.78, deep: 1.3, wide: 0.9, speed: 1.5, beat: 1 },
  { len: 0.66, deep: 1.42, wide: 0.85, speed: 1.4, beat: 1.1 },
  { len: 0.56, deep: 1.05, wide: 1.1, speed: 1.2, beat: 1.4 },
  { len: 0.62, deep: 1.15, wide: 0.95, speed: 1.6, beat: 1.15 },
  { len: 0.72, deep: 0.85, wide: 0.95, speed: 1.8, beat: 1.2 },
  { len: 0.48, deep: 0.72, wide: 0.9, speed: 2.4, beat: 1.6 },
  { len: 1.9, deep: 1.05, wide: 1.2, speed: 0.9, beat: 0.55 },
  { len: 1.55, deep: 1.0, wide: 1.05, speed: 1.1, beat: 0.65 },
  { len: 3.3, deep: 1, wide: 1, speed: 1.6, beat: 0.35 },
  { len: 1.7, deep: 1, wide: 1, speed: 1.0, beat: 0.3 },
];
const REEF_SCHOOLS = [0, 1, 2, 3, 4];

// ---------------------------------------------------------------- sculpt

interface Builder {
  pos: number[];
  part: number[];
  idx: number[];
}

const newBuilder = (): Builder => ({ pos: [], part: [], idx: [] });

function vtx(b: Builder, x: number, y: number, z: number, part: number) {
  b.pos.push(x, y, z);
  b.part.push(part);
  return b.part.length - 1;
}

/** A flat fin both ways round, so each face gets its own normal. */
function fin(b: Builder, pts: number[][], tris: number[][], part = 1) {
  const off = 0.006;
  for (const s of [1, -1]) {
    const ids = pts.map((p) => vtx(b, p[0] + off * s, p[1], p[2], part));
    for (const t of tris) {
      if (s > 0) b.idx.push(ids[t[0]], ids[t[1]], ids[t[2]]);
      else b.idx.push(ids[t[0]], ids[t[2]], ids[t[1]]);
    }
  }
}

/**
 * A fish one unit long, nose at +z, tail at -z: a lofted, laterally squashed
 * body with a forked tail, a dorsal and an anal fin (and pectorals on the
 * detailed one). `sides` is the body's cross-section.
 */
function fishBody(b: Builder, sides: number, detailed: boolean) {
  // z, half-width, half-height, centre y
  const rings: number[][] = detailed
    ? [
        [0.43, 0.05, 0.075, -0.005],
        [0.32, 0.085, 0.145, 0.008],
        [0.13, 0.1, 0.19, 0.018],
        [-0.08, 0.085, 0.165, 0.014],
        [-0.22, 0.05, 0.095, 0.01],
        [-0.31, 0.02, 0.045, 0.01],
      ]
    : [
        [0.36, 0.07, 0.12, 0.0],
        [0.1, 0.1, 0.19, 0.016],
        [-0.16, 0.07, 0.13, 0.012],
        [-0.31, 0.02, 0.045, 0.01],
      ];
  const ids: number[][] = [];
  for (const [z, w, h, yc] of rings) {
    const ring: number[] = [];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * TAU;
      ring.push(vtx(b, Math.sin(a) * w, yc + Math.cos(a) * h, z, 0));
    }
    ids.push(ring);
  }
  const nose = vtx(b, 0, 0.0, 0.5, 0);
  const tail = vtx(b, 0, 0.01, -0.33, 0);
  for (let k = 0; k < sides; k++) {
    const k1 = (k + 1) % sides;
    // nose cap (outward: nose, k1, k when viewed from front)
    b.idx.push(nose, ids[0][k1], ids[0][k]);
    for (let r = 0; r + 1 < ids.length; r++) {
      const a = ids[r][k], c = ids[r][k1], d = ids[r + 1][k], e = ids[r + 1][k1];
      b.idx.push(a, c, d, c, e, d);
    }
    const L = ids[ids.length - 1];
    b.idx.push(tail, L[k], L[k1]);
  }
  // forked tail
  fin(b, [[0, 0.04, -0.29], [0, -0.03, -0.29], [0, 0.21, -0.52], [0, 0.005, -0.42], [0, -0.19, -0.51]], [[0, 2, 3], [0, 3, 1], [1, 3, 4]]);
  // dorsal and anal fins
  fin(b, detailed ? [[0, 0.18, 0.2], [0, 0.15, -0.21], [0, 0.29, -0.02], [0, 0.24, -0.2]] : [[0, 0.18, 0.15], [0, 0.13, -0.2], [0, 0.28, -0.08]], detailed ? [[0, 2, 1], [2, 3, 1]] : [[0, 2, 1]]);
  fin(b, [[0, -0.15, 0.02], [0, -0.1, -0.22], [0, -0.25, -0.16]], [[0, 1, 2]]);
  if (detailed) {
    // pectorals, swept back off the flanks
    for (const s of [1, -1]) {
      const p = [[s * 0.09, -0.02, 0.24], [s * 0.09, -0.06, 0.2], [s * 0.2, -0.07, 0.1]];
      const a = vtx(b, p[0][0], p[0][1], p[0][2], 1);
      const c = vtx(b, p[1][0], p[1][1], p[1][2], 1);
      const d = vtx(b, p[2][0], p[2][1], p[2][2], 1);
      b.idx.push(a, c, d, a, d, c);
    }
  }
}

/** A spotted eagle ray, one unit from wingtip to wingtip, with a long whip tail. */
function rayBody(b: Builder) {
  const cols = 9;
  const top: number[][] = [];
  const bot: number[][] = [];
  for (let i = 0; i < cols; i++) {
    const x = i / (cols - 1) - 0.5;
    const ax = Math.abs(x) * 2;
    // swept, pointed wings: the leading edge runs back from the snout to the tips
    const le = 0.33 - 0.36 * Math.pow(ax, 0.9);
    const te = -0.2 + 0.14 * ax * ax;
    const zs = [le, lerp(le, te, 0.45), te];
    const th = 0.075 * Math.pow(1 - ax, 1.3) + 0.004;
    const tRow: number[] = [];
    const bRow: number[] = [];
    zs.forEach((z, j) => {
      const mid = j === 1 ? 1 : 0.45;
      tRow.push(vtx(b, x, th * mid, z, 2));
      bRow.push(vtx(b, x, -th * 0.4 * mid, z, 2));
    });
    top.push(tRow);
    bot.push(bRow);
  }
  for (let i = 0; i + 1 < cols; i++) {
    for (let j = 0; j < 2; j++) {
      const a = top[i][j], c = top[i + 1][j], d = top[i][j + 1], e = top[i + 1][j + 1];
      b.idx.push(a, c, d, c, e, d);
      const a2 = bot[i][j], c2 = bot[i + 1][j], d2 = bot[i][j + 1], e2 = bot[i + 1][j + 1];
      b.idx.push(a2, d2, c2, c2, d2, e2);
    }
  }
  // head lobe
  const n = vtx(b, 0, 0.02, 0.42, 2);
  const m = (cols - 1) / 2;
  b.idx.push(n, top[m][0], top[m - 1][0], n, top[m + 1][0], top[m][0]);
  b.idx.push(n, bot[m - 1][0], bot[m][0], n, bot[m][0], bot[m + 1][0]);
  // whip tail
  fin(b, [[0, 0.025, -0.18], [0, -0.01, -0.18], [0, 0.0, -1.05]], [[0, 2, 1]], 2);
}

/** Ellipsoid (top and bottom halves can differ) for the turtle's shell and head. */
function ellipsoid(b: Builder, c: number[], rx: number, ryTop: number, ryBot: number, rz: number, lat: number, lon: number, part: number) {
  const rows: number[][] = [];
  for (let i = 0; i <= lat; i++) {
    const th = (i / lat) * Math.PI; // 0 top .. PI bottom
    const cy = Math.cos(th);
    const sy = Math.sin(th);
    const row: number[] = [];
    for (let j = 0; j < lon; j++) {
      const ph = (j / lon) * TAU;
      const ry = cy > 0 ? ryTop : ryBot;
      row.push(vtx(b, c[0] + Math.cos(ph) * sy * rx, c[1] + cy * ry, c[2] + Math.sin(ph) * sy * rz, part));
    }
    rows.push(row);
  }
  for (let i = 0; i < lat; i++) {
    for (let j = 0; j < lon; j++) {
      const j1 = (j + 1) % lon;
      const a = rows[i][j], c2 = rows[i][j1], d = rows[i + 1][j], e = rows[i + 1][j1];
      b.idx.push(a, c2, d, c2, e, d);
    }
  }
}

/** A green sea turtle, one unit nose to tail. */
function turtleBody(b: Builder) {
  ellipsoid(b, [0, 0, -0.02], 0.3, 0.15, 0.05, 0.42, 5, 10, 3);
  ellipsoid(b, [0, 0.0, 0.47], 0.075, 0.065, 0.055, 0.11, 3, 6, 4);
  // front flippers: long, swept-back paddles
  for (const s of [1, -1]) {
    fin(b, [[s * 0.22, 0.0, 0.26], [s * 0.24, -0.02, 0.14], [s * 0.5, -0.02, 0.18], [s * 0.72, -0.03, -0.02], [s * 0.46, -0.02, 0.06]], [[0, 2, 1], [1, 2, 4], [2, 3, 4]], 5);
    fin(b, [[s * 0.16, -0.01, -0.3], [s * 0.14, -0.02, -0.4], [s * 0.34, -0.02, -0.5]], [[0, 2, 1]], 6);
  }
}

function toGeometry(b: Builder): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(b.part, 1));
  g.setIndex(b.idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- shaders

const POSE_GLSL = /* glsl */ `
attribute float aPart;
attribute vec4 aSwim; // tail phase, swim amplitude, turn, kind (0 fish, 1 ray, 2 turtle)
attribute vec4 aLook; // species
varying vec3 vFishP;
varying float vFishSp;
varying float vFishFin;

vec3 fishRotZ(vec3 q, float a) { float c = cos(a), s = sin(a); return vec3(q.x * c - q.y * s, q.x * s + q.y * c, q.z); }
vec3 fishRotY(vec3 q, float a) { float c = cos(a), s = sin(a); return vec3(q.x * c + q.z * s, q.y, -q.x * s + q.z * c); }

void fishPose(inout vec3 p, inout vec3 n) {
  float part = aPart;
  float kind = part < 1.5 ? 0.0 : part < 2.5 ? 1.0 : 2.0;
  if (abs(kind - aSwim.w) > 0.5) { p = vec3(0.0); return; }
  float ph = aSwim.x;
  float amp = aSwim.y;
  float turn = aSwim.z;
  if (kind < 0.5) {
    // a wave runs from the shoulders down to the tail, which sweeps widest;
    // the whole body curls into a turn
    float t = clamp((0.3 - p.z) / 0.8, 0.0, 1.0);
    float w = 0.04 + t * t;
    float wave = ph + p.z * 7.0;
    float zc = p.z - 0.05;
    p.x += amp * w * sin(wave) + turn * zc * zc;
    float slope = amp * (-2.5 * t * sin(wave) + w * 7.0 * cos(wave)) + turn * 2.0 * zc;
    n = normalize(vec3(n.x, n.y, n.z - n.x * slope));
  } else if (kind < 1.5) {
    // the wings ripple from root to tip; the tail trails and wavers
    float ax = abs(p.x) * 2.0;
    float wave = ph - ax * 1.8;
    p.y += amp * pow(ax, 1.6) * sin(wave);
    float dg = amp * 2.0 * sign(p.x) * (1.6 * pow(ax, 0.6) * sin(wave) - 1.8 * pow(ax, 1.6) * cos(wave));
    n = normalize(vec3(n.x - n.y * dg, n.y, n.z));
    float tl = max(-p.z - 0.2, 0.0);
    p.x += sin(ph * 0.5 + p.z * 5.0) * 0.07 * tl;
    p.y += sin(ph + 1.2) * 0.04 * tl;
  } else if (part > 4.5) {
    float sx = sign(p.x);
    if (part < 5.5) {
      // front flippers row: down and back, up and forward
      vec3 piv = vec3(sx * 0.22, -0.01, 0.2);
      float a = sin(ph) * 0.7 * amp;
      float b = (cos(ph) * 0.5 - 0.1) * amp;
      p = fishRotY(fishRotZ(p - piv, a * sx), b * sx) + piv;
      n = fishRotY(fishRotZ(n, a * sx), b * sx);
    } else {
      vec3 piv = vec3(sx * 0.15, -0.015, -0.32);
      float a = sin(ph + 1.6) * 0.35 * amp;
      p = fishRotY(p - piv, a * sx) + piv;
      n = fishRotY(n, a * sx);
    }
  } else if (part > 3.5) {
    p.y += sin(ph * 0.5) * 0.015 * smoothstep(0.38, 0.5, p.z);
  }
}
`;

const LOOK_GLSL = /* glsl */ `
varying vec3 vFishP;
varying float vFishSp;
varying float vFishFin;

float fishBand(float x, float c, float w) { return 1.0 - smoothstep(w * 0.55, w, abs(x - c)); }

void fishLook(out vec3 col, out float rough, out float metal) {
  vec3 p = vFishP;
  float sp = floor(vFishSp + 0.5);
  float fin = vFishFin;
  float belly = smoothstep(0.03, -0.13, p.y);
  rough = 0.45;
  metal = 0.0;
  col = vec3(0.5);
  if (sp < 0.5) {
    // blue tang: royal blue, a black palette swirl, a yellow tail
    col = vec3(0.02, 0.13, 0.72);
    float sw = abs(p.y - 0.04 - 0.09 * sin((p.z + 0.05) * 7.0));
    col = mix(col, vec3(0.008, 0.012, 0.035), (1.0 - smoothstep(0.025, 0.045, sw)) * step(-0.24, p.z) * step(p.z, 0.3));
    if (fin > 0.5) col = mix(vec3(0.015, 0.06, 0.38), vec3(0.005), smoothstep(0.19, 0.25, abs(p.y)));
    col = mix(col, vec3(1.0, 0.72, 0.02), smoothstep(-0.27, -0.33, p.z));
    rough = 0.38;
  } else if (sp < 1.5) {
    // yellow tang
    col = mix(vec3(1.0, 0.74, 0.02), vec3(1.0, 0.86, 0.2), belly);
    col = mix(col, vec3(0.95), fishBand(p.z, -0.27, 0.02) * fishBand(p.y, 0.0, 0.03));
    rough = 0.35;
  } else if (sp < 2.5) {
    // clownfish: orange with three black-edged white bands
    col = vec3(1.0, 0.3, 0.02);
    float d = min(min(abs(p.z - 0.28), abs(p.z - 0.03)), abs(p.z + 0.27));
    col = mix(col, vec3(0.01), 1.0 - smoothstep(0.045, 0.06, d));
    col = mix(col, vec3(0.95, 0.95, 0.92), 1.0 - smoothstep(0.03, 0.04, d));
    if (fin > 0.5 && abs(p.y) > 0.2) col = vec3(0.02);
    rough = 0.32;
  } else if (sp < 3.5) {
    // sergeant major: yellow back, silver belly, five black bars
    col = mix(vec3(0.95, 0.8, 0.12), vec3(0.85, 0.9, 0.86), belly);
    float bars = fract((p.z + 0.32) / 0.13);
    col = mix(col, vec3(0.02, 0.025, 0.03), (1.0 - smoothstep(0.1, 0.2, abs(bars - 0.5) * 2.0 - 0.6)) * step(-0.3, p.z) * step(p.z, 0.33) * step(p.y, 0.16) * (fin > 0.5 ? 0.0 : 1.0));
    metal = 0.25;
    rough = 0.32;
  } else if (sp < 4.5) {
    // wrasse: green with pink racing stripes and a blue face
    col = vec3(0.04, 0.7, 0.4);
    float st = fishBand(p.y, 0.05 + p.z * 0.06, 0.035) + fishBand(p.y, -0.06 + p.z * 0.04, 0.03);
    col = mix(col, vec3(0.95, 0.22, 0.55), clamp(st, 0.0, 1.0));
    col = mix(col, vec3(0.08, 0.32, 0.95), smoothstep(0.3, 0.4, p.z));
    if (fin > 0.5) col = mix(vec3(0.95, 0.3, 0.5), vec3(0.1, 0.5, 0.9), smoothstep(0.15, 0.27, abs(p.y)));
    rough = 0.35;
  } else if (sp < 5.5) {
    // silverside: steel-blue back, mirror flanks
    col = mix(vec3(0.05, 0.16, 0.3), vec3(0.7, 0.76, 0.8), smoothstep(0.0, -0.09, p.y));
    col = mix(col, vec3(0.02, 0.06, 0.12), fishBand(p.y, -0.005, 0.014));
    col = mix(col, vec3(0.1, 0.3, 0.42), smoothstep(-0.3, -0.4, p.z));
    metal = 0.5;
    rough = 0.3;
  } else if (sp < 6.5) {
    // grouper: mottled brown with pale blotches
    col = mix(vec3(0.2, 0.12, 0.06), vec3(0.5, 0.4, 0.28), belly * 0.6);
    float m = sin(p.z * 38.0 + sin(p.y * 30.0 + p.x * 20.0)) * sin(p.y * 34.0 + p.z * 12.0 + p.x * 25.0);
    col = mix(col, vec3(0.45, 0.33, 0.2), smoothstep(0.45, 0.8, m) * 0.6);
    col = mix(col, vec3(0.06, 0.035, 0.02), smoothstep(0.4, 0.8, -m) * 0.6);
    rough = 0.6;
  } else if (sp < 7.5) {
    // parrotfish: turquoise scales edged in pink, a beaky face
    col = vec3(0.05, 0.6, 0.52);
    float sc = fishBand(fract(p.z * 22.0 + abs(p.y) * 10.0), 0.5, 0.18);
    col = mix(col, vec3(0.75, 0.32, 0.55), sc * 0.55);
    col = mix(col, vec3(0.85, 0.35, 0.6), smoothstep(0.36, 0.44, p.z));
    if (fin > 0.5) col = mix(col, vec3(0.9, 0.4, 0.65), smoothstep(-0.4, -0.5, p.z));
    rough = 0.4;
  } else if (sp < 8.5) {
    // spotted eagle ray: ink-blue back strewn with white spots, white belly
    col = vec3(0.025, 0.035, 0.06);
    vec2 c = p.xz * vec2(16.0, 16.0);
    vec2 cell = floor(c);
    vec2 f = fract(c) - 0.5 + (vec2(fract(sin(dot(cell, vec2(12.9, 78.2))) * 437.5), fract(sin(dot(cell, vec2(39.3, 11.1))) * 917.3)) - 0.5) * 0.4;
    col = mix(col, vec3(0.85, 0.88, 0.9), 1.0 - smoothstep(0.12, 0.2, length(f)));
    col = mix(col, vec3(0.92, 0.93, 0.9), smoothstep(0.0, -0.01, p.y));
    rough = 0.4;
  } else {
    // sea turtle: amber shell scutes with dark seams, olive scaly skin
    if (vFishFin < 0.5) {
      // staggered scutes: a spine row down the middle, ribs either side
      float row = floor(p.z * 4.6 + 0.5);
      vec2 s = vec2(p.x * 5.2 + 0.5 + mod(row, 2.0) * 0.5 * step(0.1, abs(p.x)), p.z * 4.6 + 0.5);
      vec2 cell = floor(s);
      vec2 f = fract(s) - 0.5;
      float seam = smoothstep(0.36, 0.47, max(abs(f.x) * 0.9 + abs(f.y) * 0.25, abs(f.y)));
      col = mix(vec3(0.42, 0.24, 0.08), vec3(0.62, 0.42, 0.16), fract(sin(dot(cell, vec2(7.1, 3.7))) * 91.3) * 0.6);
      col = mix(col, vec3(0.62, 0.42, 0.16), 1.0 - smoothstep(0.0, 0.35, length(f)));
      col = mix(col, vec3(0.1, 0.06, 0.02), seam);
      col = mix(col, vec3(0.78, 0.7, 0.45), smoothstep(-0.01, -0.03, p.y));
      rough = 0.32;
    } else {
      col = vec3(0.3, 0.3, 0.16);
      vec2 s = fract(p.xz * 26.0) - 0.5;
      col = mix(col, vec3(0.6, 0.58, 0.4), smoothstep(0.32, 0.45, max(abs(s.x), abs(s.y))));
      col = mix(col, vec3(0.75, 0.7, 0.5), smoothstep(-0.0, -0.04, p.y));
      rough = 0.55;
    }
  }
  if (sp < 7.5 && fin < 0.5) {
    // the eye: dark, with a glint ring
    float e = length(vec2(p.y - 0.04, p.z - 0.355));
    float side = step(0.035, abs(p.x));
    col = mix(col, vec3(0.9, 0.85, 0.6), (1.0 - smoothstep(0.03, 0.038, e)) * side);
    col = mix(col, vec3(0.004), (1.0 - smoothstep(0.018, 0.026, e)) * side);
    // a soft countershade on every fish
    col *= mix(1.0, 1.18, belly);
  }
}
`;

function poseShader(shader: { vertexShader: string }, normals: boolean) {
  let v = shader.vertexShader.replace('#include <common>', `#include <common>\n${POSE_GLSL}`);
  if (normals) {
    v = v.replace(
      '#include <beginnormal_vertex>',
      `vec3 objectNormal = normal;
  vec3 fishP = position;
  vFishP = position;
  vFishSp = aLook.x;
  vFishFin = (aPart > 0.5 && aPart < 1.5) || aPart > 3.5 ? 1.0 : 0.0;
  fishPose(fishP, objectNormal);`,
    );
    v = v.replace('#include <begin_vertex>', 'vec3 transformed = fishP;');
  } else {
    v = v.replace('#include <begin_vertex>', 'vec3 transformed = position;\n  { vec3 fN = vec3(0.0, 1.0, 0.0); fishPose(transformed, fN); }');
  }
  shader.vertexShader = v;
}

// ---------------------------------------------------------------- swimmers

interface Fish {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  // home slot in the shoal (shoal frame: s across, f along, u up)
  s: number;
  f: number;
  u: number;
  yaw: number;
  pitch: number;
  turn: number;
  phase: number;
  amp: number;
  size: number;
  seed: number;
}

/** An agent that roams an island's shallows: a shoal's leader, or a lone big swimmer. */
interface Rover {
  home: Island;
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  turn: number;
  wander: number;
  panic: number;
  fx: number; // where the fright came from
  fz: number;
  minD: number; // seabed band it keeps to
  maxD: number;
}

interface Shoal {
  lead: Rover;
  species: number;
  fish: Fish[];
  spread: number;
  sleep: boolean;
}

interface Loner {
  lead: Rover;
  species: number;
  kind: number; // 0 fish, 1 ray, 2 turtle
  phase: number;
  amp: number;
  yaw: number;
  pitch: number;
  roll: number;
  size: number;
  breath: number; // turtles: seconds until it rises for air
  rising: number;
  breathed: boolean;
}

interface Scare {
  x: number;
  z: number;
  r: number;
  k: number; // strength
  t: number; // life left
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _g = new THREE.Vector2();
const _frustum = new THREE.Frustum();
const _pv = new THREE.Matrix4();
const _sphere = new THREE.Sphere();

class Batch {
  readonly mesh: THREE.InstancedMesh;
  readonly swim: THREE.InstancedBufferAttribute;
  readonly look: THREE.InstancedBufferAttribute;
  n = 0;
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, readonly cap: number) {
    this.swim = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.look = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.swim.setUsage(THREE.DynamicDrawUsage);
    this.look.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aSwim', this.swim);
    geo.setAttribute('aLook', this.look);
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  push(x: number, y: number, z: number, yaw: number, pitch: number, roll: number, sx: number, sy: number, sz: number, phase: number, amp: number, turn: number, kind: number, species: number) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    _e.set(pitch, yaw, roll, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    _m.toArray(this.mesh.instanceMatrix.array, i * 16);
    const sw = this.swim.array as Float32Array;
    sw[i * 4] = phase;
    sw[i * 4 + 1] = amp;
    sw[i * 4 + 2] = turn;
    sw[i * 4 + 3] = kind;
    (this.look.array as Float32Array)[i * 4] = species;
  }

  flush() {
    this.mesh.count = this.n;
    if (this.n) {
      this.mesh.instanceMatrix.clearUpdateRanges();
      this.mesh.instanceMatrix.addUpdateRange(0, this.n * 16);
      this.mesh.instanceMatrix.needsUpdate = true;
      this.swim.clearUpdateRanges();
      this.swim.addUpdateRange(0, this.n * 4);
      this.swim.needsUpdate = true;
      this.look.clearUpdateRanges();
      this.look.addUpdateRange(0, this.n * 4);
      this.look.needsUpdate = true;
    }
    this.n = 0;
  }
}

export class ReefLife {
  /** Everything that swims, for the opaque scene. */
  readonly group = new THREE.Group();
  private near: Batch;
  private far: Batch;
  private big: Batch;
  private shoals: Shoal[] = [];
  private loners: Loner[] = [];
  private scares: Scare[] = [];
  private gunsSeen = new WeakMap<Ship, number>();
  private time = 0;
  private rnd = mulberry32(4242);

  constructor(private terrain: SeaFloor, lite: boolean) {
    const mat = patchMaterial(new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0 }), { caustics: true, clouds: true });
    const base = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, r) => {
      base.call(mat, shader, r);
      poseShader(shader, true);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${LOOK_GLSL}`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
  vec3 fishCol; float fishRough; float fishMetal;
  fishLook(fishCol, fishRough, fishMetal);
  diffuseColor.rgb = fishCol;`,
        )
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = fishRough;')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = fishMetal;');
    };
    const prevKey = mat.customProgramCacheKey;
    mat.customProgramCacheKey = () => prevKey.call(mat) + '|fish';
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = (shader) => poseShader(shader, false);
    depth.customProgramCacheKey = () => 'fish-depth';

    const nb = newBuilder();
    fishBody(nb, 6, true);
    const fb = newBuilder();
    fishBody(fb, 4, false);
    const bb = newBuilder();
    fishBody(bb, 7, true);
    rayBody(bb);
    turtleBody(bb);
    this.near = new Batch(toGeometry(nb), mat, lite ? 140 : 300);
    this.far = new Batch(toGeometry(fb), mat, lite ? 220 : 520);
    this.big = new Batch(toGeometry(bb), mat, 40);
    this.big.mesh.castShadow = true;
    this.big.mesh.customDepthMaterial = depth;
    this.group.add(this.near.mesh, this.far.mesh, this.big.mesh);
    this.populate(lite);
  }

  // ------------------------------------------------------------ population

  /** A random spot in an island's shallows whose seabed lies in the band. */
  private spot(isl: Island, minD: number, maxD: number): [number, number] | null {
    const rnd = this.rnd;
    for (let k = 0; k < 160; k++) {
      const a = rnd() * TAU;
      const d = isl.r * (0.2 + rnd() * 1.6);
      const x = isl.x + Math.cos(a) * d;
      const z = isl.z + Math.sin(a) * d;
      const h = this.terrain.heightAt(x, z);
      if (h < minD - 0.4 && h > maxD + 0.6) return [x, z];
    }
    return null;
  }

  private rover(isl: Island, minD: number, maxD: number, speed: number): Rover | null {
    const at = this.spot(isl, minD, maxD);
    if (!at) return null;
    return {
      home: isl, x: at[0], y: -1.2, z: at[1], heading: this.rnd() * TAU, speed, turn: 0,
      wander: this.rnd() * 100, panic: 0, fx: 0, fz: 0, minD, maxD,
    };
  }

  private populate(lite: boolean) {
    const rnd = this.rnd;
    for (const isl of this.terrain.islands) {
      const schools = (lite ? 3 : 5) + (isl.kind === 'atoll' ? 1 : 0);
      for (let k = 0; k < schools; k++) {
        // one great bait ball per island, the rest reef fish
        const bait = k === 0;
        const species = bait ? 5 : REEF_SCHOOLS[(rnd() * REEF_SCHOOLS.length) | 0];
        const sp = SPECIES[species];
        const lead = this.rover(isl, SHOAL_MIN, bait ? SHOAL_MAX : -4, sp.speed);
        if (!lead) continue;
        const n = Math.round((bait ? 40 : 12 + rnd() * 10) * (lite ? 0.6 : 1));
        const spread = Math.sqrt(n) * sp.len * (bait ? 0.5 : 0.85);
        const fish: Fish[] = [];
        for (let i = 0; i < n; i++) {
          // slots fill an egg-shaped school, longer than it is wide
          const a = rnd() * TAU;
          const r = Math.sqrt(rnd());
          const f: Fish = {
            x: lead.x, y: lead.y, z: lead.z, vx: 0, vy: 0, vz: 0,
            s: Math.cos(a) * r, f: Math.sin(a) * r * 1.5, u: (rnd() - 0.5) * 0.7,
            yaw: lead.heading, pitch: 0, turn: 0, phase: rnd() * TAU, amp: 0.1,
            size: sp.len * (0.82 + rnd() * 0.36), seed: rnd() * 100,
          };
          f.x += f.s * spread;
          f.z += f.f * spread;
          fish.push(f);
        }
        this.shoals.push({ lead, species, fish, spread, sleep: true });
      }
      // the big swimmers: a couple of bottom fish, a ray over the sand, a turtle
      const big: [number, number][] = lite ? [[6, 0], [9, 2]] : [[6, 0], [7, 0], [8, 1], [9, 2]];
      for (const [species, kind] of big) {
        const sp = SPECIES[species];
        const lead = this.rover(isl, kind === 1 ? -1.6 : -1.3, kind === 2 ? -9 : -6.5, sp.speed);
        if (!lead) continue;
        this.loners.push({
          lead, species, kind, phase: rnd() * TAU, amp: 0, yaw: lead.heading, pitch: 0, roll: 0,
          size: sp.len * (0.85 + rnd() * 0.3), breath: 6 + rnd() * 30, rising: 0, breathed: false,
        });
      }
    }
  }

  // ------------------------------------------------------------ fright

  /** Something hit the water: everything nearby bolts. */
  splash(x: number, z: number, scale = 1) {
    if (this.scares.length > 24) this.scares.shift();
    this.scares.push({ x, z, r: 9 + 7 * scale, k: 1.6 * scale, t: 0.35 });
  }

  private frighten(r: Rover, x: number, z: number) {
    if (r.panic < 0.5) {
      r.fx = x;
      r.fz = z;
    }
    r.panic = 1;
  }

  // ------------------------------------------------------------ steering

  /** Roams the island's shallows, keeping to its depth band by feel. */
  private steer(r: Rover, dt: number, cruise: number) {
    const T = this.terrain;
    r.wander += dt * 0.35;
    // a lazy meander, the occasional change of mind
    let want = r.heading + Math.sin(r.wander * 1.7) * 0.9 + Math.sin(r.wander * 0.43 + 2) * 0.6;
    const fx = Math.sin(r.heading);
    const fz = Math.cos(r.heading);
    const look = 4 + r.speed * 2;
    const ax = r.x + fx * look;
    const az = r.z + fz * look;
    const h = T.heightAt(ax, az);
    let urgent = 0;
    if (h > r.minD) {
      // shoaling up ahead: turn toward deeper water
      T.gradientAt(ax, az, _g);
      if (_g.lengthSq() > 1e-6) want = Math.atan2(-_g.x, -_g.y);
      urgent = 1;
    } else if (h < r.maxD) {
      T.gradientAt(ax, az, _g);
      if (_g.lengthSq() > 1e-6) want = Math.atan2(_g.x, _g.y);
      urgent = 0.7;
    }
    const isl = r.home;
    const dx = r.x - isl.x;
    const dz = r.z - isl.z;
    if (dx * dx + dz * dz > isl.r * isl.r * 4.4) {
      want = Math.atan2(-dx, -dz);
      urgent = Math.max(urgent, 0.6);
    }
    if (r.panic > 0.05) {
      // bolt straight away from the fright
      want = Math.atan2(r.x - r.fx, r.z - r.fz);
      if (urgent < 1) urgent = 1;
      r.panic = Math.max(0, r.panic - dt * 0.45);
    }
    const rate = 0.5 + urgent * 1.6 + r.panic * 2;
    const turn = clamp(angleDelta(r.heading, want), -rate * dt, rate * dt);
    r.heading += turn;
    r.turn = lerp(r.turn, turn / Math.max(dt, 1e-4), damp(4, dt));
    const sp = cruise * (1 + r.panic * 2.6) * (0.85 + 0.25 * Math.sin(r.wander * 2.3));
    r.speed = lerp(r.speed, sp, damp(r.panic > 0.3 ? 6 : 1.5, dt));
    r.x += Math.sin(r.heading) * r.speed * dt;
    r.z += Math.cos(r.heading) * r.speed * dt;
    // beached somehow (pushed by a scare, a sandbar): back to open shallows
    if (T.heightAt(r.x, r.z) > -0.45) {
      const at = this.spot(isl, r.minD, r.maxD);
      if (at) {
        r.x = at[0];
        r.z = at[1];
      }
    }
  }

  // ------------------------------------------------------------ update

  update(dt: number, w: World, ships: Ship[], cam: THREE.Camera) {
    if (dt > 0) this.time += dt;
    dt = Math.min(dt, 0.05);
    const T = this.terrain;
    const cp = cam.position;
    // the farther the camera, the sooner fish fade into the blue
    const far = clamp(150 + cp.y * 0.55, 170, 300);
    const wake = far + 30;
    _pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pv);

    // hulls are frights that move; cannon fire thumps through the water
    for (const sc of this.scares) sc.t -= dt;
    this.scares = this.scares.filter((s) => s.t > 0);
    const hulls: Scare[] = [];
    for (const s of ships) {
      if (s.removed) continue;
      hulls.push({ x: s.pos.x + Math.sin(s.heading) * s.cls.length * 0.25, z: s.pos.z + Math.cos(s.heading) * s.cls.length * 0.25, r: s.cls.length * 0.55 + 7, k: 0.6 + Math.min(1, s.speed * 0.12), t: 1 });
      let last = -100;
      for (const t of s.gunFiredAt) if (t > last) last = t;
      const seen = this.gunsSeen.get(s) ?? -100;
      if (last > seen) {
        this.gunsSeen.set(s, last);
        if (seen > -100) this.scares.push({ x: s.pos.x, z: s.pos.z, r: 26, k: 1, t: 0.3 });
      }
    }

    // ---- shoals
    for (const sh of this.shoals) {
      const L = sh.lead;
      const dx = L.x - cp.x;
      const dz = L.z - cp.z;
      const dist = Math.hypot(dx, dz, L.y - cp.y);
      if (dist > wake) {
        sh.sleep = true;
        continue;
      }
      const sp = SPECIES[sh.species];
      if (dt > 0) {
        // frights reaching the shoal
        for (const list of [this.scares, hulls]) {
          for (const sc of list) {
            const d = Math.hypot(sc.x - L.x, sc.z - L.z);
            if (d < sc.r + sh.spread + 4) this.frighten(L, sc.x, sc.z);
          }
        }
        this.steer(L, dt, sp.speed);
        const wh = Math.min(0, w.waterHeight(L.x, L.z));
        L.y = lerp(L.y, Math.max(T.heightAt(L.x, L.z) * 0.5, wh - 1.6), damp(1, dt));
      }
      const ch = Math.cos(L.heading);
      const shd = Math.sin(L.heading);
      const flare = 1 + L.panic * 1.6;
      const wh = Math.min(0, w.waterHeight(L.x, L.z)) - 0.45;
      const near = dist < NEAR_LOD;
      _sphere.center.set(L.x, L.y, L.z);
      _sphere.radius = sh.spread * flare * 1.6 + 3;
      const seen = _frustum.intersectsSphere(_sphere);
      const fade = 1 - clamp((dist - far * 0.75) / (far * 0.25), 0, 1);
      const time = this.time;
      if (sh.sleep) {
        // waking up: drop the school into its slots, swimming
        for (const f of sh.fish) {
          f.x = L.x + (f.s * ch + f.f * shd) * sh.spread;
          f.z = L.z + (-f.s * shd + f.f * ch) * sh.spread;
          f.y = L.y + f.u * sh.spread * 0.4;
          f.yaw = L.heading;
          f.vx = shd * L.speed;
          f.vz = ch * L.speed;
          f.vy = 0;
        }
        sh.sleep = false;
      }
      for (const f of sh.fish) {
        if (dt > 0) {
          // each fish keeps a drifting slot around the leader
          const ds = f.s + Math.sin(time * 0.6 + f.seed) * 0.25;
          const df = f.f + Math.sin(time * 0.45 + f.seed * 1.7) * 0.3;
          const tx = L.x + (ds * ch + df * shd) * sh.spread * flare;
          const tz = L.z + (-ds * shd + df * ch) * sh.spread * flare;
          const ty = L.y + (f.u + Math.sin(time * 0.7 + f.seed * 2.3) * 0.15) * sh.spread * 0.45 * flare;
          const k = 2.2;
          let ax = (tx - f.x) * k - (f.vx - shd * L.speed) * 1.6;
          let ay = (ty - f.y) * k - f.vy * 2;
          let az = (tz - f.z) * k - (f.vz - ch * L.speed) * 1.6;
          // hulls part the school; splashes blast it apart
          for (const list of [this.scares, hulls]) {
            for (const sc of list) {
              const ex = f.x - sc.x;
              const ez = f.z - sc.z;
              const d2 = ex * ex + ez * ez;
              if (d2 > sc.r * sc.r || d2 < 1e-4) continue;
              const d = Math.sqrt(d2);
              const push = (1 - d / sc.r) * sc.k * 30;
              ax += (ex / d) * push;
              az += (ez / d) * push;
            }
          }
          f.vx += ax * dt;
          f.vy += ay * dt;
          f.vz += az * dt;
          const lim = sp.speed * 2 + L.panic * 7 + 2;
          const v = Math.hypot(f.vx, f.vy, f.vz);
          if (v > lim) {
            f.vx *= lim / v;
            f.vy *= lim / v;
            f.vz *= lim / v;
          }
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          f.z += f.vz * dt;
          // stay between the seabed and the troughs
          const bed = T.heightAt(f.x, f.z) + f.size * 0.3;
          if (f.y < bed) {
            f.y = bed;
            if (f.vy < 0) f.vy = 0;
          }
          if (f.y > wh) {
            f.y = wh;
            if (f.vy > 0) f.vy = 0;
          }
          const hs = Math.hypot(f.vx, f.vz);
          if (hs > 0.08) {
            const turn = angleDelta(f.yaw, Math.atan2(f.vx, f.vz));
            const step = clamp(turn, -7 * dt, 7 * dt);
            f.yaw += step;
            f.turn = lerp(f.turn, clamp(turn * 0.9, -0.55, 0.55), damp(8, dt));
          }
          f.pitch = lerp(f.pitch, -Math.atan2(f.vy, Math.max(hs, 0.3)) * 0.8, damp(5, dt));
          const sv = Math.hypot(hs, f.vy);
          f.phase += dt * (7 + sv * 4.5) * sp.beat;
          f.amp = lerp(f.amp, 0.06 + Math.min(sv, 8) * 0.022, damp(4, dt));
        }
        if (!seen || fade <= 0.01) continue;
        const b = near ? this.near : this.far;
        const s = f.size * fade;
        b.push(f.x, f.y, f.z, f.yaw, f.pitch, -f.turn * 0.4, s * sp.wide, s * sp.deep, s, f.phase, f.amp, f.turn, 0, sh.species);
      }
    }

    // ---- the big swimmers
    for (const lo of this.loners) {
      const L = lo.lead;
      const dist = Math.hypot(L.x - cp.x, L.z - cp.z, L.y - cp.y);
      if (dist > wake) continue;
      const sp = SPECIES[lo.species];
      const bed = T.heightAt(L.x, L.z);
      const wh = Math.min(0.2, w.waterHeight(L.x, L.z));
      if (dt > 0) {
        for (const list of [this.scares, hulls]) {
          for (const sc of list) {
            if (Math.hypot(sc.x - L.x, sc.z - L.z) < sc.r + sp.len) this.frighten(L, sc.x, sc.z);
          }
        }
        this.steer(L, dt, sp.speed * (lo.rising > 0 ? 0.4 : 1));
        let ty: number;
        if (lo.kind === 2) {
          // turtles cruise mid-water and come up now and then to breathe
          lo.breath -= dt;
          if (lo.breath < 0 && lo.rising <= 0 && L.panic < 0.1) {
            lo.rising = 7 + this.rnd() * 3;
            lo.breathed = false;
          }
          if (lo.rising > 0) {
            lo.rising -= dt;
            if (L.panic > 0.2) lo.rising = 0;
            ty = wh - 0.08 * lo.size;
            if (!lo.breathed && Math.abs(L.y - ty) < 0.15) {
              lo.breathed = true;
              w.wake.stamp(L.x + Math.sin(L.heading) * lo.size * 0.45, L.z + Math.cos(L.heading) * lo.size * 0.45, 1.1, 0.35);
            }
            if (lo.rising <= 0) lo.breath = 20 + this.rnd() * 35;
          } else ty = Math.max(bed + 0.9, Math.min(wh - 1.4, bed * 0.45));
        } else if (lo.kind === 1) ty = bed + 0.35;
        else ty = bed + 0.55 * lo.size * 0.5 + 0.3;
        ty = Math.min(ty, wh - (lo.kind === 2 && lo.rising > 0 ? 0 : 0.4));
        ty = Math.max(ty, bed + 0.2);
        const vy = (ty - L.y) * damp(lo.kind === 2 ? 0.8 : 1.6, dt);
        L.y += vy;
        lo.yaw = L.heading;
        lo.pitch = lerp(lo.pitch, clamp(-vy / Math.max(dt, 1e-4) / Math.max(L.speed, 0.4), -0.5, 0.5) * 0.7, damp(3, dt));
        lo.roll = lerp(lo.roll, clamp(-L.turn * (lo.kind === 1 ? 0.9 : 0.35), -0.5, 0.5), damp(3, dt));
        const rate = lo.kind === 0 ? (5 + L.speed * 3) * sp.beat : lo.kind === 1 ? 2.2 + L.speed * 1.2 : 1.6 + L.speed * 1.4;
        lo.phase += dt * rate;
        const ampT = lo.kind === 0 ? 0.05 + Math.min(L.speed, 6) * 0.02 : lo.kind === 1 ? 0.07 + L.panic * 0.1 : (lo.rising > 0 && Math.abs(L.y - ty) < 0.3 ? 0.35 : 1);
        lo.amp = lerp(lo.amp, ampT, damp(3, dt));
      }
      _sphere.center.set(L.x, L.y, L.z);
      _sphere.radius = lo.size + 1;
      if (!_frustum.intersectsSphere(_sphere)) continue;
      const fade = 1 - clamp((dist - far * 0.75) / (far * 0.25), 0, 1);
      if (fade <= 0.01) continue;
      const s = lo.size * fade;
      const turn = lo.kind === 0 ? clamp(L.turn * 0.35, -0.35, 0.35) : 0;
      this.big.push(L.x, L.y, L.z, lo.yaw, lo.pitch, lo.roll, s * sp.wide, s * sp.deep, s, lo.phase, lo.amp, turn, lo.kind, lo.species);
    }

    this.near.flush();
    this.far.flush();
    this.big.flush();
  }
}
