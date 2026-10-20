import * as THREE from 'three';
import { createFoamTexture } from '../render/textures';
import type { Terrain } from './terrain';
import { WORLD_SIZE } from './worldSize';

// Surf: the swell rolling in to every beach, standing up, breaking, and
// running up the sand as a thin sheet before it drains back.
//
// One field, baked once at load, drives it all. For each texel of sea near
// land it stores how long a wave takes to reach the shore from there, found
// by a shortest-path march at the shallow-water wave speed sqrt(g·depth). Its
// isolines are the breaker lines: they hug the coast, wrap around headlands,
// crowd together as the water shoals and swing into the bays, the way real
// swell refracts. A wave phase of (time + travel time) / period then has every
// crest marching shoreward and arriving at the waterline exactly when the
// swash on the beach (drawn by the ground shader from the same phase) starts
// its run up the sand, so water and land always agree on where the wave is.

/** Seconds between breakers. Constant: the phase is `time / period`. */
export const SURF_PERIOD = 7;
/** Travel time (s) beyond which the field is flat open sea. */
const TAU_MAX = 18;

export const shoreUniforms = {
  // r: travel time to shore (s), g/b: unit direction pointing out to sea, a: exposure (0 lagoon .. 1 open sea)
  uShoreTex: { value: new THREE.DataTexture(new Uint16Array(4), 1, 1, THREE.RGBAFormat, THREE.HalfFloatType) as THREE.Texture },
  uFoamTex: { value: new THREE.DataTexture(new Uint8Array(4), 1, 1) as THREE.Texture },
  // the archipelago square uShoreTex covers: corner x, corner z, size, 1 / size (swapped as you sail between them)
  uShoreRect: { value: new THREE.Vector4(-WORLD_SIZE / 2, -WORLD_SIZE / 2, WORLD_SIZE, 1 / WORLD_SIZE) },
  // x: breaker height (m), y: swash run-up height (m), z: storm 0..1
  uSurf: { value: new THREE.Vector4(0.35, 0.32, 0, 0) },
};

/**
 * Shared GLSL for the ocean and the ground. Needs `uTime` and `uNoiseTex`
 * declared by the including shader.
 */
export const GLSL_SURF = /* glsl */ `
uniform sampler2D uShoreTex;
uniform sampler2D uFoamTex;
uniform vec4 uShoreRect;
uniform vec4 uSurf;
#define SURF_T ${SURF_PERIOD.toFixed(1)}

vec4 shoreField(vec2 xz) {
  return texture(uShoreTex, (xz - uShoreRect.xy) * uShoreRect.w);
}

// Wave phase: crests sit at whole numbers and march shoreward. A slow drift
// along each coast staggers when they land, so a breaker peels along a beach
// rather than slapping the whole shore at once.
float surfPhase(vec2 xz, float tau) {
  return (uTime + tau) * ${(1 / SURF_PERIOD).toFixed(6)} + textureLod(uNoiseTex, xz * 0.0041 + vec2(0.37, 0.11), 0.0).r * 3.2;
}

// Every breaker its own size: sets of bigger waves roll through, and one
// stretch of beach takes a bigger crest than the next.
float surfVar(vec2 xz, float idx) {
  float v = textureLod(uNoiseTex, xz * 0.0105 + vec2(idx * 0.173, idx * 0.291), 0.0).g;
  float set = sin(idx * 0.83 + 1.3) * sin(idx * 0.31);
  return 0.5 + 0.75 * smoothstep(0.3, 0.72, v) + 0.3 * set;
}

// Height of the breaker over one period: th = fract(phase), the crest at 0/1,
// a long easy back and a short steep face (width wf) leaning toward the beach.
float surfShape(float th, float wf) {
  float b = max(1.0 - th / (1.0 - wf), 0.0);
  return th < 1.0 - wf ? pow(b, 2.2) : smoothstep(1.0 - wf, 1.0, th);
}
float surfSlope(float th, float wf) {
  if (th < 1.0 - wf) return -2.2 / (1.0 - wf) * pow(max(1.0 - th / (1.0 - wf), 0.0), 1.2);
  float x = (th - 1.0 + wf) / wf;
  return 6.0 * x * (1.0 - x) / wf;
}

// One crest at a spot: x its height (m), y how broken it is (0 a clean
// swell, 1 a tumbling wall of whitewater), z how close it is to breaking
// (the face standing up). It grows as it feels the bottom (Green's law)
// until it is too tall for the depth and spills.
vec3 surfWave(vec2 xz, float idx, float depth, float reach) {
  float a0 = uSurf.x * surfVar(xz, idx) * reach;
  float aS = a0 * sqrt(sqrt(clamp(5.0 / max(depth, 0.05), 1.0, 12.0)));
  float cap = 0.42 * depth + 0.015;
  float r = aS / cap;
  float fade = (1.0 - smoothstep(4.5, 8.0, depth)) * smoothstep(0.04, 0.12, a0);
  return vec3(min(aS, cap), smoothstep(0.82, 1.12, r), smoothstep(0.5, 0.85, r)) * fade;
}

// Sea foam that breaks up the way the real thing does: cover (0..1) is how
// much of the surface it hides. As cover falls the dark holes open, the web
// thins to threads, and the threads snap into drifting flecks. fp is the
// pixel footprint in metres, so distant foam softens to an even veil.
// foamField samples the web once; foamCut thresholds it, so one lookup can
// serve several kinds of foam.
float foamField(vec2 xz) {
  vec2 uv = xz * 0.0625;
  float v = texture(uFoamTex, uv + vec2(uTime * 0.0021, -uTime * 0.0013)).r;
  float v2 = texture(uFoamTex, uv * 0.61 + vec2(0.37, 0.71) - vec2(uTime * 0.0011, uTime * 0.0017)).b;
  return v * 0.78 + v2 * 0.22;
}
float foamCut(float v, float cover, float fp) {
  float w = clamp(0.07 + fp * 0.35, 0.07, 0.5);
  return smoothstep(1.0 - cover - w, 1.0 - cover + w, v);
}
`;

/** Sets the surf from the weather: bigger, longer-running breakers in a blow. */
export function setSurf(storm: number, sea: number, wind: number) {
  const s = Math.max(0, Math.min(1.4, sea));
  const u = shoreUniforms.uSurf.value;
  u.x = 0.3 + s * 0.55 + wind * 0.06;
  u.y = 0.26 + s * 0.42 + wind * 0.05;
  u.z = storm;
}

// ------------------------------------------------------------------ baking

/** Binary min-heap of cell indices keyed by a float array. */
class Heap {
  private idx: Int32Array;
  private key: Float32Array;
  size = 0;
  constructor(cap: number) {
    this.idx = new Int32Array(cap);
    this.key = new Float32Array(cap);
  }
  push(i: number, k: number) {
    if (this.size >= this.idx.length) {
      const ni = new Int32Array(this.idx.length * 2);
      ni.set(this.idx);
      const nk = new Float32Array(this.key.length * 2);
      nk.set(this.key);
      this.idx = ni;
      this.key = nk;
    }
    let p = this.size++;
    while (p > 0) {
      const q = (p - 1) >> 1;
      if (this.key[q] <= k) break;
      this.idx[p] = this.idx[q];
      this.key[p] = this.key[q];
      p = q;
    }
    this.idx[p] = i;
    this.key[p] = k;
  }
  /** Pops the smallest; its key is left in `top`. */
  top = 0;
  pop(): number {
    const out = this.idx[0];
    this.top = this.key[0];
    const li = this.idx[--this.size];
    const lk = this.key[this.size];
    let p = 0;
    for (;;) {
      let c = p * 2 + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.key[c + 1] < this.key[c]) c++;
      if (this.key[c] >= lk) break;
      this.idx[p] = this.idx[c];
      this.key[p] = this.key[c];
      p = c;
    }
    this.idx[p] = li;
    this.key[p] = lk;
    return out;
  }
}

/**
 * Bakes the foam texture and one archipelago's surf field (at load, behind the
 * loading screen), returning the field. The first one baked goes live.
 */
export function buildShore(terrain: Terrain): THREE.DataTexture {
  const tex = bakeShoreField(terrain, 512);
  if (!shoreUniforms.uFoamTex.value.image || (shoreUniforms.uFoamTex.value.image as { width: number }).width <= 1) {
    shoreUniforms.uFoamTex.value = createFoamTexture();
    setShoreField(tex, terrain.rect);
  }
  return tex;
}

/** Points the surf at an archipelago's own field (see Game's region swap). */
export function setShoreField(tex: THREE.Texture, rect: THREE.Vector4) {
  shoreUniforms.uShoreTex.value = tex;
  shoreUniforms.uShoreRect.value.copy(rect);
}

/**
 * Bakes the surf field (see the top of this file) as an RGBA half-float
 * texture over the whole world: travel time to shore, the seaward direction,
 * and how exposed the water is to the open swell.
 */
function bakeShoreField(terrain: Terrain, res: number): THREE.DataTexture {
  const N = res;
  const cs = WORLD_SIZE / N;
  const H = new Float32Array(N * N);
  const shelter = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = terrain.x0 + (i + 0.5) * cs;
      const z = terrain.z0 + (j + 0.5) * cs;
      H[j * N + i] = terrain.heightAt(x, z);
      shelter[j * N + i] = terrain.lagoonAt(x, z) ? 1 : 0;
    }
  }
  const speed = (d: number) => Math.sqrt(9.81 * Math.max(d, 0.3));
  const tau = new Float32Array(N * N).fill(TAU_MAX);
  const heap = new Heap(1 << 16);

  // seeds: sea texels next to land, at the time to reach the sub-texel waterline
  const n4 = [1, 0, -1, 0, 0, 1, 0, -1];
  for (let j = 1; j < N - 1; j++) {
    for (let i = 1; i < N - 1; i++) {
      const k = j * N + i;
      const h = H[k];
      for (let q = 0; q < 8; q += 2) {
        const m = k + n4[q] + n4[q + 1] * N;
        const hm = H[m];
        if ((h < 0) === (hm < 0)) continue;
        // fraction of the way from this texel to the neighbour where the height crosses zero
        const f = h / (h - hm);
        if (h < 0) {
          const t = (f * cs) / speed(-h * 0.5);
          if (t < tau[k]) tau[k] = t;
        } else {
          // land just above the waterline continues the field below zero, so the
          // linear filter puts the zero crossing on the real shore
          const t = -(f * cs) / speed(0.3);
          if (tau[k] >= TAU_MAX || t > tau[k]) tau[k] = t;
        }
      }
      if (h < 0 && tau[k] < TAU_MAX) heap.push(k, tau[k]);
    }
  }
  // 16 neighbours (with knight moves) keep the wavefronts round, not octagonal
  const offs: number[][] = [];
  for (let dj = -2; dj <= 2; dj++) {
    for (let di = -2; di <= 2; di++) {
      if ((di === 0 && dj === 0) || (Math.abs(di) === 2 && Math.abs(dj) !== 1) || (Math.abs(dj) === 2 && Math.abs(di) !== 1)) continue;
      offs.push([di, dj, Math.hypot(di, dj) * cs]);
    }
  }
  while (heap.size) {
    const k = heap.pop();
    const tk = heap.top;
    if (tk > tau[k]) continue;
    const i = k % N;
    const j = (k / N) | 0;
    const dk = -H[k];
    for (const [di, dj, len] of offs) {
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
      const m = jj * N + ii;
      if (H[m] >= 0) continue;
      // the knight move must not hop a spit of land
      if (Math.abs(di) + Math.abs(dj) === 3 && (H[j * N + i + Math.sign(di)] >= 0 || H[(j + Math.sign(dj)) * N + i] >= 0)) continue;
      const t = tk + len / speed((dk - H[m]) * 0.5);
      if (t < tau[m] && t < TAU_MAX) {
        tau[m] = t;
        heap.push(m, t);
      }
    }
  }

  // seaward direction: the gradient of travel time, smoothed so it turns gently
  let dx = new Float32Array(N * N);
  let dz = new Float32Array(N * N);
  for (let j = 1; j < N - 1; j++) {
    for (let i = 1; i < N - 1; i++) {
      const k = j * N + i;
      const gx = tau[k + 1] - tau[k - 1];
      const gz = tau[k + N] - tau[k - N];
      const l = Math.hypot(gx, gz);
      if (l > 1e-5 && tau[k] < TAU_MAX - 0.5) {
        dx[k] = gx / l;
        dz[k] = gz / l;
      }
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    const ox = new Float32Array(N * N);
    const oz = new Float32Array(N * N);
    for (let j = 1; j < N - 1; j++) {
      for (let i = 1; i < N - 1; i++) {
        const k = j * N + i;
        ox[k] = dx[k] * 2 + dx[k - 1] + dx[k + 1] + dx[k - N] + dx[k + N];
        oz[k] = dz[k] * 2 + dz[k - 1] + dz[k + 1] + dz[k - N] + dz[k + N];
      }
    }
    dx = ox;
    dz = oz;
  }
  // exposure: lagoons behind a reef only see small ripples lapping in; blurred
  // so the swell eases off through the reef passes
  let ex = new Float32Array(N * N);
  for (let k = 0; k < N * N; k++) ex[k] = 1 - shelter[k];
  for (let pass = 0; pass < 3; pass++) {
    const o = ex.slice();
    for (let j = 1; j < N - 1; j++) {
      for (let i = 1; i < N - 1; i++) {
        const k = j * N + i;
        o[k] = (ex[k] * 4 + ex[k - 1] + ex[k + 1] + ex[k - N] + ex[k + N]) / 8;
      }
    }
    ex = o;
  }

  const data = new Uint16Array(N * N * 4);
  const hf = THREE.DataUtils.toHalfFloat;
  for (let k = 0; k < N * N; k++) {
    const l = Math.hypot(dx[k], dz[k]);
    data[k * 4] = hf(tau[k] >= TAU_MAX ? TAU_MAX : H[k] >= 0 && tau[k] >= 0 ? 0 : tau[k]);
    data[k * 4 + 1] = hf(l > 1e-5 ? dx[k] / l : 0);
    data[k * 4 + 2] = hf(l > 1e-5 ? dz[k] / l : 0);
    data[k * 4 + 3] = hf(ex[k]);
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}
