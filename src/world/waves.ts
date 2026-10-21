// Gerstner wave set shared by the GPU ocean and the CPU buoyancy so ships
// ride exactly the swell you see.

export interface Wave {
  dirX: number;
  dirZ: number;
  k: number; // wavenumber
  amp: number;
  omega: number;
  q: number; // steepness (horizontal pinch)
  phase: number;
}

const G = 9.81;

export function buildWaves(windAngle: number, scale = 1): Wave[] {
  // Eight trains with mutually irrational wavelengths and a wide fan of
  // directions: their interference never settles into a visible lattice, so
  // the swell reads as open sea instead of a repeating tile.
  const defs: [number, number, number, number][] = [
    // wavelength, amplitude, direction offset, phase
    [71.3, 0.42, 0.08, 0.0],
    [47.9, 0.29, -0.63, 1.7],
    [33.4, 0.2, 0.86, 4.1],
    [23.9, 0.135, -1.29, 2.3],
    [17.3, 0.09, 0.41, 5.2],
    [12.7, 0.06, 1.73, 0.9],
    [9.7, 0.04, -0.27, 3.6],
    [7.6, 0.028, -2.07, 1.2],
  ];
  const steep = 0.66;
  return defs.map(([len, a, off, phase]) => {
    const k = (Math.PI * 2) / len;
    const ang = windAngle + off;
    const amp = a * scale;
    return {
      dirX: Math.sin(ang),
      dirZ: Math.cos(ang),
      k,
      amp,
      omega: Math.sqrt(G * k),
      q: steep / (k * amp * defs.length),
      phase,
    };
  });
}

/**
 * Sea state: rescales a wave set in place from its calm-weather base. Long
 * swells grow the most in a storm, short chop the least, and the trains get a
 * little steeper so the crests pinch and break. A mirror calm (`calm` 0..1)
 * all but stills it: the chop dies first, and only the faintest long, glassy
 * swell is left breathing under the surface. The horizontal pinch shrinks with
 * it (q·amp is what sways the water sideways), or a flat sea would still slide.
 */
export function setSeaState(waves: Wave[], base: Wave[], sea: number, calm = 0) {
  const n = waves.length;
  const steep = 0.66 + Math.max(0, Math.min(sea, 1.2)) * 0.15;
  for (let i = 0; i < n; i++) {
    const grow = 1 + sea * (1.05 - (i / (n - 1)) * 0.6);
    const still = 1 - calm * (0.8 + 0.17 * (i / (n - 1)));
    const w = waves[i];
    w.amp = base[i].amp * Math.max(0.6, grow) * still;
    w.q = (steep * still) / (w.k * w.amp * n);
  }
}

/**
 * Swings the whole wave set round by `turn` radians from its base headings,
 * pivoting about (px, pz): each train's phase is nudged so the sea right there
 * keeps its shape, and the swell only turns slowly round the ship instead of
 * sliding. CPU and GPU read the same dirs and phases, so buoyancy stays true.
 */
export function turnWaves(waves: Wave[], base: Wave[], turn: number, px: number, pz: number) {
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  for (let i = 0; i < waves.length; i++) {
    const w = waves[i];
    const b = base[i];
    const nx = b.dirX * c + b.dirZ * s;
    const nz = b.dirZ * c - b.dirX * s;
    // never wrapped to 2π: the swell itself wouldn't notice, but the storm's
    // whitecaps key their breaking stretches off the raw phase (one pattern per
    // crest), and every wrap threw all of them somewhere else at once. Far out
    // at sea a turning swell wrapped every few seconds.
    w.phase += w.k * ((w.dirX - nx) * px + (w.dirZ - nz) * pz);
    w.dirX = nx;
    w.dirZ = nz;
  }
}

/** Packs waves for GLSL uniforms: vec4(dir.xy, k, amp), vec4(omega, q, phase, 0). */
export function packWaves(waves: Wave[]): { a: Float32Array; b: Float32Array } {
  const a = new Float32Array(waves.length * 4);
  const b = new Float32Array(waves.length * 4);
  waves.forEach((w, i) => {
    a.set([w.dirX, w.dirZ, w.k, w.amp], i * 4);
    b.set([w.omega, w.q, w.phase, 0], i * 4);
  });
  return { a, b };
}

export const WAVE_COUNT = 8;

export const GLSL_WAVES = /* glsl */ `
uniform vec4 uWaveA[${WAVE_COUNT}];
uniform vec4 uWaveB[${WAVE_COUNT}];

// The sea grid's spacing (m, along x and z) where this vertex sits, set by the
// ocean before it calls gerstner (0: no grid, nothing to fit).
vec2 aqGridSpan = vec2(0.0);

// Returns displaced offset; accumulates analytic normal terms. Short trains
// fade out with distance (lodDist, metres from the camera) before the grid gets
// too coarse to carry them, which keeps the far sea from shimmering. They also
// fade wherever the grid itself spaces its vertices under about four to a
// wavelength: there the stretched grid glides along with the ship, and a train
// it can't carry would alias into ripples racing across the sea. Gameplay
// sits well inside both fades, so CPU buoyancy still matches what you see.
vec3 gerstner(vec2 p, float t, float damp, float lodDist, inout vec3 nrm, inout float crest) {
  vec3 o = vec3(0.0);
  vec3 n = vec3(0.0, 1.0, 0.0);
  float c = 0.0;
  for (int i = 0; i < ${WAVE_COUNT}; i++) {
    vec4 a = uWaveA[i];
    vec4 b = uWaveB[i];
    float A = a.w * damp * (1.0 - smoothstep(14.0, 28.0, lodDist * a.z * 0.15915));
    float span = length(aqGridSpan * a.xy);
    if (span > 0.0) A *= smoothstep(2.8, 4.0, 6.28319 / (a.z * span));
    float th = a.z * dot(a.xy, p) - b.x * t + b.z;
    float s = sin(th);
    float co = cos(th);
    float qa = b.y * A;
    o.x += qa * a.x * co;
    o.z += qa * a.y * co;
    o.y += A * s;
    float wa = a.z * A;
    n.x -= a.x * wa * co;
    n.z -= a.y * wa * co;
    n.y -= b.y * wa * s;
    c += b.y * wa * s;
  }
  nrm = n;
  crest = c;
  return o;
}
`;

/**
 * Height of the water surface at world (x, z). The horizontal Gerstner pinch is
 * inverted with a couple of fixed-point iterations so the answer matches the
 * rendered surface to within a few centimetres.
 */
export function waveHeight(waves: Wave[], x: number, z: number, t: number, damp = 1): number {
  let px = x;
  let pz = z;
  for (let it = 0; it < 2; it++) {
    let dx = 0;
    let dz = 0;
    for (let i = 0; i < waves.length; i++) {
      const w = waves[i];
      const th = w.k * (w.dirX * px + w.dirZ * pz) - w.omega * t + w.phase;
      const qa = w.q * w.amp * damp * Math.cos(th);
      dx += qa * w.dirX;
      dz += qa * w.dirZ;
    }
    px = x - dx;
    pz = z - dz;
  }
  let y = 0;
  for (let i = 0; i < waves.length; i++) {
    const w = waves[i];
    const th = w.k * (w.dirX * px + w.dirZ * pz) - w.omega * t + w.phase;
    y += w.amp * damp * Math.sin(th);
  }
  return y;
}
