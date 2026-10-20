// The shape of a maelstrom's water, shared by the GPU ocean and the CPU
// buoyancy so a ship caught in one heels down the very funnel you see. The
// sea sinks in a broad bowl toward the eye, then falls away down steep walls
// into a throat tens of metres deep (an abyss is carved in the seabed under
// it, see Terrain.carveAbyss); the swell flattens as the spinning water
// smooths it. The ocean draws each funnel on its own ring mesh, dense toward
// the throat (Ocean.placeVortices), so the walls stay smooth at any range.
// See game/hazards.ts for the currents and everything else a maelstrom does.

/** At most this many maelstroms turn at once (one uniform slot each). */
export const VORTEX_N = 3;

export interface Vortex {
  x: number;
  z: number;
  /** Radius of its pull (m). */
  r: number;
  /** Strength 0 (still) .. ~1.3 (raging in a storm). */
  k: number;
  /** Which way it turns: 1 anticlockwise seen from above, -1 clockwise. */
  dir: 1 | -1;
}

/** Depth of the bowl and of the throat at full strength, for a 100 m maelstrom (m). */
const BOWL = 8;
const THROAT = 30;
/** Radius of the throat (where it is half its depth), as a fraction of the radius. */
const THROAT_W = 0.12;
const C2 = THROAT_W * THROAT_W;
/** Height of the spiral ridges that wind down the walls (m, GPU only: too small to steer a hull). */
const RIDGE = 0.75;
/** The ring mesh reaches a little past the rim, under the flat sea it joins. */
export const VORTEX_RIM = 1.1;

/** Bigger maelstroms dig deeper, but less than in proportion. */
function depthScale(r: number) {
  return Math.sqrt(r / 100);
}

/** The deepest a maelstrom of radius r can draw the sea down at strength k (m). */
export function vortexDepth(r: number, k: number): number {
  return Math.abs(k) * depthScale(r) * (BOWL + THROAT);
}

/** How far the surface is drawn down at (x, z) (m, positive = lower). */
export function vortexDip(v: Vortex, x: number, z: number): number {
  if (v.k <= 0) return 0;
  const u = Math.hypot(x - v.x, z - v.z) / v.r;
  if (u >= 1) return 0;
  const f = 1 - u;
  const g = 1 - u * u;
  return v.k * depthScale(v.r) * (BOWL * f * f + ((THROAT * C2) / (u * u + C2)) * g * g);
}

/** How much of the swell survives at (x, z): the turning water smooths it out. */
export function vortexCalm(v: Vortex, x: number, z: number): number {
  if (v.k <= 0) return 1;
  const u = Math.hypot(x - v.x, z - v.z) / v.r;
  return 1 - Math.min(0.8, 0.65 * v.k) * (1 - smoothstep01((u - 0.3) / 0.7));
}

function smoothstep01(t: number) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

/**
 * GLSL twins of the above. uVortex[i] = (x, z, radius, strength * direction);
 * an empty slot has strength 0.
 */
export const GLSL_VORTEX = /* glsl */ `
uniform vec4 uVortex[${VORTEX_N}];
// the funnel's height (m, negative = drawn down) at p and its gradient, with
// the spiral ridges winding down its walls, turning with the water at time t
float vortexOne(vec4 v, vec2 p, float t, bool ridges, out vec2 grad) {
  grad = vec2(0.0);
  float k = abs(v.w);
  if (k < 0.001) return 0.0;
  vec2 q = p - v.xy;
  float d = max(length(q), 0.01);
  float u = d / v.z;
  if (u >= 1.0) return 0.0;
  float s = sqrt(v.z / 100.0) * k;
  float f = 1.0 - u;
  float g = 1.0 - u * u;
  float c = ${C2.toFixed(4)} / (u * u + ${C2.toFixed(4)});
  float h = -s * (${BOWL.toFixed(2)} * f * f + ${THROAT.toFixed(2)} * c * g * g);
  // d h / d u, then down the radius
  float dc = -2.0 * u * c * c / ${C2.toFixed(4)};
  float dh = -s * (-2.0 * ${BOWL.toFixed(2)} * f + ${THROAT.toFixed(2)} * (dc * g * g - 4.0 * u * c * g));
  vec2 rd = q / d;
  grad = rd * dh / v.z;
  if (ridges) {
    // trailing log-spiral arms (the same phase the foam is laid along)
    float dir = v.w > 0.0 ? 1.0 : -1.0;
    float ph = 4.0 * atan(q.y, q.x) * dir + 7.6 * log(d + 4.0) - t * k * 1.1;
    float band = smoothstep(0.08, 0.3, u) * (1.0 - smoothstep(0.55, 1.0, u));
    float amp = ${RIDGE.toFixed(2)} * s * band;
    h += amp * sin(ph);
    vec2 dph = 4.0 * dir * vec2(-q.y, q.x) / (d * d) + 7.6 * rd / (d + 4.0);
    grad += amp * cos(ph) * dph;
  }
  return h;
}
float vortexHeight(vec2 p, float t, bool ridges, out vec2 grad) {
  float h = 0.0;
  grad = vec2(0.0);
  for (int i = 0; i < ${VORTEX_N}; i++) {
    vec2 g;
    h += vortexOne(uVortex[i], p, t, ridges, g);
    grad += g;
  }
  return h;
}
float vortexCalm(vec2 p) {
  float c = 1.0;
  for (int i = 0; i < ${VORTEX_N}; i++) {
    vec4 v = uVortex[i];
    float k = abs(v.w);
    if (k < 0.001) continue;
    float u = length(p - v.xy) / v.z;
    c *= 1.0 - min(0.8, 0.65 * k) * (1.0 - smoothstep(0.3, 1.0, u));
  }
  return c;
}
// > 0 inside a live maelstrom's rim, where its own ring mesh draws the sea
float vortexCut(vec2 p) {
  float c = -1.0;
  for (int i = 0; i < ${VORTEX_N}; i++) {
    vec4 v = uVortex[i];
    if (abs(v.w) < 0.001) continue;
    c = max(c, 1.0 - length(p - v.xy) / v.z);
  }
  return c;
}
`;
