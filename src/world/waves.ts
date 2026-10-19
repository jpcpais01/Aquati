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
  const defs: [number, number, number, number][] = [
    // wavelength, amplitude, direction offset, phase
    [62, 0.5, 0.12, 0.0],
    [37, 0.32, -0.55, 1.7],
    [23, 0.2, 0.75, 4.1],
    [14, 0.12, -1.15, 2.3],
    [8.5, 0.06, 1.55, 5.2],
  ];
  const steep = 0.62;
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

export const WAVE_COUNT = 5;

export const GLSL_WAVES = /* glsl */ `
uniform vec4 uWaveA[${WAVE_COUNT}];
uniform vec4 uWaveB[${WAVE_COUNT}];

// Returns displaced offset; accumulates analytic normal terms.
vec3 gerstner(vec2 p, float t, float damp, inout vec3 nrm, inout float crest) {
  vec3 o = vec3(0.0);
  vec3 n = vec3(0.0, 1.0, 0.0);
  float c = 0.0;
  for (int i = 0; i < ${WAVE_COUNT}; i++) {
    vec4 a = uWaveA[i];
    vec4 b = uWaveB[i];
    float A = a.w * damp;
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
