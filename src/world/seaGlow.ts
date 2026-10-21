import { HIGH_SEAS_R, REGIONS } from './regions';

// Sea-spark blooms: stretches of the high seas thick with glowing plankton. By
// day they are just open water; on a dark night every wake, bow wave, breaking
// crest and cannonball splash in them lights up electric blue. The blooms lie
// in broad warped patches (a few hundred metres to a kilometre across) only out
// past the archipelagos, and one or two always lie across the main crossing.
// The same field runs on the CPU (to tell the crew) and in the sea's shader.

/** Shifts the pattern so the crossing between the archipelagos runs through two blooms. */
const OX = 4200;
const OZ = 1350;
/** The blooms only start this far out (m), and come in over the next stretch. */
const START = HIGH_SEAS_R + 40;
const RAMP = 360;

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** How thick the bloom is at (x, z): 0 none .. 1 the heart of one. */
export function seaGlowAt(x: number, z: number): number {
  let d = Infinity;
  for (const r of REGIONS) d = Math.min(d, Math.hypot(x - r.x, z - r.z));
  const open = smooth(START, START + RAMP, d);
  if (open <= 0) return 0;
  const px = x + OX;
  const pz = z + OZ;
  const g = Math.sin(px * 0.0021 + 1.7 * Math.sin(pz * 0.0013 + 0.4)) * Math.sin(pz * 0.0026 + 1.5 * Math.sin(px * 0.0011 + 2.2));
  return open * smooth(0.22, 0.52, g);
}

const f = (v: number) => v.toFixed(1);

export const GLSL_SEA_GLOW = /* glsl */ `
float seaGlowAt(vec2 p) {
  float d = 1e9;
  ${REGIONS.map((r) => `d = min(d, length(p - vec2(${f(r.x)}, ${f(r.z)})));`).join('\n  ')}
  float open = smoothstep(${f(START)}, ${f(START + RAMP)}, d);
  if (open <= 0.0) return 0.0;
  vec2 q = p + vec2(${f(OX)}, ${f(OZ)});
  float g = sin(q.x * 0.0021 + 1.7 * sin(q.y * 0.0013 + 0.4)) * sin(q.y * 0.0026 + 1.5 * sin(q.x * 0.0011 + 2.2));
  return open * smoothstep(0.22, 0.52, g);
}
`;
