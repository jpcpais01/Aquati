// The shape of a maelstrom's water, shared by the GPU ocean and the CPU
// buoyancy so a ship caught in one heels down the very funnel you see. The
// sea sinks in a broad bowl toward the eye and drops away into a narrow
// throat at its heart; the swell flattens as the spinning water smooths it.
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

/** Depth of the bowl and of the throat at full strength, for an 85 m maelstrom. */
const BOWL = 4.6;
const THROAT = 4.2;
/** Width of the throat as a fraction of the radius. */
const THROAT_W = 0.1;

/** How far the surface is drawn down at (x, z) (m, positive = lower). */
export function vortexDip(v: Vortex, x: number, z: number): number {
  if (v.k <= 0) return 0;
  const u = Math.hypot(x - v.x, z - v.z) / v.r;
  if (u >= 1) return 0;
  const f = 1 - u;
  const s = v.r / 85;
  return v.k * s * (BOWL * f * f + THROAT * Math.exp(-(u * u) / (THROAT_W * THROAT_W)));
}

/** How much of the swell survives at (x, z): the turning water smooths it out. */
export function vortexCalm(v: Vortex, x: number, z: number): number {
  if (v.k <= 0) return 1;
  const u = Math.hypot(x - v.x, z - v.z) / v.r;
  return 1 - Math.min(0.75, 0.6 * v.k) * (1 - smoothstep01((u - 0.3) / 0.7));
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
// the surface's drop at p (m) and its gradient (d dip / d xz)
float vortexDip(vec2 p, out vec2 grad) {
  float dip = 0.0;
  grad = vec2(0.0);
  for (int i = 0; i < ${VORTEX_N}; i++) {
    vec4 v = uVortex[i];
    float k = abs(v.w);
    if (k < 0.001) continue;
    vec2 q = p - v.xy;
    float d = length(q);
    float u = d / v.z;
    if (u >= 1.0) continue;
    float f = 1.0 - u;
    float s = v.z / 85.0;
    float e = exp(-(u * u) / ${(THROAT_W * THROAT_W).toFixed(4)});
    dip += k * s * (${BOWL.toFixed(2)} * f * f + ${THROAT.toFixed(2)} * e);
    // d dip / d u, then down the radius
    float dd = k * s * (-2.0 * ${BOWL.toFixed(2)} * f - ${THROAT.toFixed(2)} * e * 2.0 * u / ${(THROAT_W * THROAT_W).toFixed(4)}) / v.z;
    grad += q / max(d, 0.001) * dd;
  }
  return dip;
}
float vortexCalm(vec2 p) {
  float c = 1.0;
  for (int i = 0; i < ${VORTEX_N}; i++) {
    vec4 v = uVortex[i];
    float k = abs(v.w);
    if (k < 0.001) continue;
    float u = length(p - v.xy) / v.z;
    c *= 1.0 - min(0.75, 0.6 * k) * (1.0 - smoothstep(0.3, 1.0, u));
  }
  return c;
}
`;
