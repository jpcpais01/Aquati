import * as THREE from 'three';
import { CLOUD, GLSL_ATMOS, globalUniforms } from './environment';

// Sun shafts: the light you see in the air itself.
//
// The humid air over the archipelago holds a thin haze, densest by the sea.
// Wherever a cloud stands between a parcel of that air and the sun, the parcel
// goes dark; between the clouds it glows. Marched through, that turns every
// gap in the clouds into a slanting beam that runs down to the water, and
// every cloud shadow into a dark column, the way crepuscular rays really form.
//
// The cloud shadows already exist as maps laid on the ground (the deck's
// noise field and the low puffs' splat map, see cloudShadow()). A point in the
// air at height y is lit exactly when the ground point its sun ray lands on is,
// so one lookup per step needs no shadow volume at all.
//
//   march (quarter res): per pixel, the share of the haze along the view ray
//     that the sun reaches (r), and the light the shallows scatter up from
//     beams swaying down through the water (g)
//   apply (final pass): the haze's own depth along the ray is worked out
//     analytically per full-res pixel, so a mast against the sky never picks up
//     a quarter-res fringe; only the slowly varying lit share is upsampled.
//
// No jitter: each step reads the cloud maps at a mip as wide as the step, so
// the beams come out smooth without any screen-locked noise.
//
// When the sun itself is in view (the deck view, photo mode) the haze around it
// is far too thin to show the beams cloud by cloud, so the classic trick takes
// over: the bright sky by the sun, with clouds, masts and sails blotting it,
// is smeared out radially from the sun in two short passes (12 x 12 taps), and
// every gap throws a ray across the picture.

const VERT = /* glsl */ `
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** Haze scale height (m), the top of the hazy layer (m), the longest ray (m). */
export const SHAFT_H = 70;
const SHAFT_TOP = 260;
const SHAFT_FAR = 1000;
/** The low puffs float above this (m): air higher up is not under them. */
const LOW_CLOUD_BASE = 88;

const FRAG = /* glsl */ `
precision highp float;
${GLSL_ATMOS}
uniform sampler2D uDepth;
uniform vec2 uFull;
uniform vec2 uNearFar;
uniform mat4 uInvProj;
uniform mat3 uCamRot;
uniform vec3 uEye;
uniform vec2 uLeanW; // the sun's ray bent into the water: horizontal drift per metre of depth
uniform float uWaterOn;
in vec2 vUv;
out vec4 outColor;

const float H = ${SHAFT_H.toFixed(1)};
const float TOP = ${SHAFT_TOP.toFixed(1)};
const float FAR = ${SHAFT_FAR.toFixed(1)};

// Sunlight reaching a parcel of air at P (0 shaded .. 1 lit). 'blur' is how
// far apart (m) neighbouring samples land on the ground maps.
float airVis(vec3 P, float blur) {
  vec2 G = P.xz - uSunDir.xz / max(uSunDir.y, 0.12) * max(P.y, 0.0);
  // the deck: its finest layer (256 texels) has a texel of about 4.3 m
  float lod = log2(max(blur * ${(CLOUD.uvPerM * CLOUD.bil[0] * 256).toFixed(5)}, 1.0));
  // (the same field as cloudShadow(), read at a mip as wide as the step)
  vec2 uv = G * ${CLOUD.uvPerM} + uCloudOffset;
  float n = cloudMix(
    textureLod(uNoiseTex, uv * ${CLOUD.sys[0]} + vec2(${CLOUD.sys[1]}, ${CLOUD.sys[2]}), max(lod - ${Math.log2(CLOUD.bil[0] / CLOUD.sys[0]).toFixed(2)}, 0.0)).r,
    1.0 - textureLod(uNoiseTex, uv * ${CLOUD.cell[0]} + vec2(${CLOUD.cell[1]}, ${CLOUD.cell[2]}), max(lod - ${Math.log2(CLOUD.bil[0] / CLOUD.cell[0]).toFixed(2)}, 0.0)).b,
    textureLod(uNoiseTex, uv * ${CLOUD.bil[0]} + vec2(${CLOUD.bil[1]}, ${CLOUD.bil[2]}), lod).r);
  float lo = cloudLo();
  float v = 1.0 - smoothstep(lo - 0.03, lo + 0.08, n) * 0.75;
  // the little low puffs, only for air beneath them
  if (uLowCloudXf.w > 0.0 && P.y < ${LOW_CLOUD_BASE.toFixed(1)}) {
    vec2 q = (G - uLowCloudXf.xy) * uLowCloudXf.z;
    float e = max(abs(q.x), abs(q.y));
    float ll = log2(max(blur * uLowCloudXf.z * 256.0, 1.0));
    float lc = textureLod(uLowCloudTex, q + 0.5, ll).r * (1.0 - smoothstep(0.42, 0.5, e));
    v *= 1.0 - lc * 0.92;
  }
  return v;
}

// beams in the water column: broad, soft caustic cells cast from the surface
// (a texel of the caustic map is 0.2 m here; 'blur' is the step's footprint in m)
float beam(vec2 xz, float blur) {
  vec2 uv = xz * 0.02;
  float lod = log2(max(blur * 5.12, 1.0)) + 1.5;
  float c1 = textureLod(uCausticTex, uv + vec2(uTime * 0.006, uTime * 0.004), lod).r;
  float c2 = textureLod(uCausticTex, uv * 1.37 + vec2(-uTime * 0.0045, uTime * 0.0075) + 0.5, lod).r;
  return max(c1 * c2 * 3.0 - 0.12, 0.0) + max(c1 + c2 - 0.9, 0.0) * 1.2;
}

float linZ(float d) {
  float n = uNearFar.x, f = uNearFar.y;
  return (n * f) / (f - d * (f - n));
}

void main() {
  // one real full-res pixel inside this quarter-res texel (never the corner between four)
  ivec2 fs = ivec2(uFull) - 1;
  ivec2 pc = min(ivec2(gl_FragCoord.xy) * 4 + 1, fs);
  float d = texelFetch(uDepth, pc, 0).r;
  vec2 uv = (vec2(pc) + 0.5) / uFull;
  vec4 vp = uInvProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 rv = normalize(vp.xyz / vp.w);
  vec3 rw = uCamRot * rv;
  vec3 E = uEye;
  float tScene = d >= 0.99999 ? 1e9 : linZ(d) / max(-rv.z, 1e-4);
  float tSea = rw.y < -1e-4 && E.y > 0.0 ? E.y / -rw.y : 1e9;

  // ---- the haze: the ray's stretch below the top of the hazy layer
  float t0 = 0.0;
  if (E.y > TOP) t0 = rw.y < -1e-4 ? (E.y - TOP) / -rw.y : 1e9;
  float t1 = min(min(tScene, tSea), FAR);
  if (rw.y > 1e-4) t1 = min(t1, (TOP - E.y) / rw.y);
  float lit = 1.0;
  if (t1 > t0 + 0.5) {
    float y0 = E.y + rw.y * t0, y1 = E.y + rw.y * t1;
    float e0 = exp(-max(y0, 0.0) / H), e1 = exp(-max(y1, 0.0) / H);
    bool slope = abs(y1 - y0) > 1.0;
    // how fast the ray sweeps across the ground maps per metre travelled
    vec2 lean = uSunDir.xz / max(uSunDir.y, 0.12);
    float sweep = length(rw.xz - lean * rw.y);
    float acc = 0.0;
    for (int i = 0; i < STEPS; i++) {
      float f = (float(i) + 0.5) / float(STEPS);
      // steps placed at equal shares of the haze, so each counts the same
      float t = slope ? (-H * log(mix(e0, e1, f)) - E.y) / rw.y : mix(t0, t1, f);
      t = clamp(t, t0, t1);
      vec3 P = E + rw * t;
      float gap = sweep * (t1 - t0) / float(STEPS) + t * 0.004;
      acc += airVis(P, gap);
    }
    lit = acc / float(STEPS);
  }

  // ---- the shallows: beams of sun swaying down through the water column
  float water = 0.0;
  if (uWaterOn > 0.0 && tSea < tScene && tSea < FAR) {
    float w0 = tSea, w1 = min(tScene, tSea + 26.0);
    float L = w1 - w0;
    if (L > 0.2) {
      float acc = 0.0;
      for (int j = 0; j < 6; j++) {
        float t = w0 + L * (float(j) + 0.5) / 6.0;
        vec3 P = E + rw * t;
        float dd = max(-P.y, 0.0);
        // where this parcel's light came in through the surface
        acc += beam(P.xz + uLeanW * dd, t * 0.004 + L / 6.0) * exp(-dd * 0.15 - (t - w0) * 0.05);
      }
      // a beam needs a lit sea above it, and a pale floor near enough to see it against:
      // in the deep blue there is nothing behind it, so it fades away past a few fathoms
      float bed = max(-(E.y + rw.y * w1), 0.0);
      water = acc * L / 6.0 * airVis(E + rw * w0, 2.0) * smoothstep(16.0, 3.0, bed) * 0.11;
    }
  }
  outColor = vec4(lit, water, 0.0, 1.0);
}`;

/** Final-pass GLSL (WebGL1-style) that lays the shafts over the picture. */
export const GLSL_SHAFT_APPLY = /* glsl */ `
uniform sampler2D uShaft;
uniform vec4 uShaftAir;  // rgb: lit haze colour (0 = off), w: the glow lit haze adds on its own
uniform vec3 uShaftSea;  // colour of the beams in the shallows
uniform vec2 uShaftHaze;  // haze extinction at sea level (1/m), how dark the shaded haze reads
uniform vec3 uShaftSun;
uniform sampler2D uRays;
uniform vec3 uRayColor;  // rays from the sun on screen (0 = sun out of view)
vec3 applyShafts(vec3 col, vec3 E, vec3 rw, float tScene, float wa) {
  vec2 sh = texture2D(uShaft, vUv).rg;
  // the lit share across the whole view (the last mip): the haze adds only what
  // differs from it, so beams and dark columns stand out without milking over the picture
  float mean = texture2D(uShaft, vec2(0.5), 16.0).r;
  const float H = ${SHAFT_H.toFixed(1)};
  const float TOP = ${SHAFT_TOP.toFixed(1)};
  float tSea = rw.y < -1e-4 && E.y > 0.0 ? E.y / -rw.y : 1e9;
  float t0 = 0.0;
  if (E.y > TOP) t0 = rw.y < -1e-4 ? (E.y - TOP) / -rw.y : 1e9;
  float t1 = min(min(tScene, tSea), ${SHAFT_FAR.toFixed(1)});
  if (rw.y > 1e-4) t1 = min(t1, (TOP - E.y) / rw.y);
  if (t1 > t0) {
    float y0 = max(E.y + rw.y * t0, 0.0), y1 = max(E.y + rw.y * t1, 0.0);
    float dy = y1 - y0;
    // the haze along the ray, exactly: exponential with height
    float od = abs(dy) > 0.05 ? H * (exp(-y0 / H) - exp(-y1 / H)) / dy * (t1 - t0) : exp(-y0 / H) * (t1 - t0);
    float scat = 1.0 - exp(-od * uShaftHaze.x);
    // forward scattering: the beams blaze looking toward the sun, and still read looking down
    float mu = dot(rw, uShaftSun);
    float g = 0.55;
    float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5);
    float phase = 0.4 + 0.15 * hg;
    // (square root: a short look down through thin haze still shows its beams,
    // a long look toward the sun through thick haze doesn't blow out)
    float k = phase * sqrt(scat);
    float d = sh.r - mean;
    // lit haze glows with the sun's colour; behind a cloud its shade hangs in the air as a dark column
    col += uShaftAir.rgb * k * (max(d, 0.0) + sh.r * uShaftAir.w);
    col *= 1.0 - min(max(-d, 0.0) * k * uShaftHaze.y, 0.35);
  }
  col += uShaftSea * sh.g * wa;
  col += uRayColor * texture2D(uRays, vUv).r;
  return col;
}`;

// rays from the sun on screen, pass 1: the bright sky by the sun (where no cloud,
// mast or sea covers it), blurred a twelfth of the way toward the sun
const RAYS_MASK = /* glsl */ `
precision highp float;
uniform sampler2D uHalf;
uniform sampler2D uDepth;
uniform sampler2D uWater;
uniform vec2 uSunUv;
uniform float uAspect;
in vec2 vUv;
out vec4 outColor;
float source(vec2 p) {
  if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) return 0.0;
  if (texture(uDepth, p).r < 0.99999 || texture(uWater, p).a > 0.02) return 0.0;
  vec3 c = texture(uHalf, p).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec2 d = (p - uSunUv) * vec2(uAspect, 1.0);
  return smoothstep(0.7, 2.2, l) * smoothstep(0.6, 0.0, length(d));
}
void main() {
  vec2 st = (uSunUv - vUv) / 144.0;
  float acc = 0.0;
  for (int i = 0; i < 12; i++) acc += source(vUv + st * float(i));
  outColor = vec4(acc / 12.0, 0.0, 0.0, 1.0);
}`;

// pass 2: the rest of the way, with the light dying away from the sun
const RAYS_BLUR = /* glsl */ `
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uSunUv;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec2 st = (uSunUv - vUv) / 12.0;
  float acc = 0.0, wsum = 0.0, w = 1.0;
  for (int i = 0; i < 12; i++) {
    acc += texture(uSrc, vUv + st * float(i)).r * w;
    wsum += w;
    w *= 0.93;
  }
  outColor = vec4(acc / wsum, 0.0, 0.0, 1.0);
}`;

const quarterRT = () =>
  new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });

export class LightShafts {
  /**
   * Quarter-res: r the lit share of the haze along each ray, g the light from
   * beams in the water. Mipmapped, so the final pass can read the view's average.
   */
  rt = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    depthBuffer: false,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: true,
  });
  private mat: THREE.ShaderMaterial;
  private quad: THREE.Mesh;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private steps = 0;
  /** Rays from the sun on screen (pass 2 result in rtRays). */
  private rtMask = quarterRT();
  readonly rtRays = quarterRT();
  private maskMat: THREE.ShaderMaterial;
  private blurMat: THREE.ShaderMaterial;

  constructor() {
    const fs = (frag: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this.maskMat = fs(RAYS_MASK, {
      uHalf: { value: null },
      uDepth: { value: null },
      uWater: { value: null },
      uSunUv: { value: new THREE.Vector2() },
      uAspect: { value: 1 },
    });
    this.blurMat = fs(RAYS_BLUR, { uSrc: { value: this.rtMask.texture }, uSunUv: { value: new THREE.Vector2() } });
    this.mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG,
      defines: { STEPS: 12 },
      depthTest: false,
      depthWrite: false,
      uniforms: {
        ...globalUniforms,
        uDepth: { value: null },
        uFull: { value: new THREE.Vector2(1, 1) },
        uNearFar: { value: new THREE.Vector2(1, 1000) },
        uInvProj: { value: new THREE.Matrix4() },
        uCamRot: { value: new THREE.Matrix3() },
        uEye: { value: new THREE.Vector3() },
        uLeanW: { value: new THREE.Vector2() },
        uWaterOn: { value: 1 },
      },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  /** Steps per ray; 0 turns the effect off. */
  configure(steps: number) {
    if (steps === this.steps) return;
    this.steps = steps;
    if (steps > 0 && this.mat.defines.STEPS !== steps) {
      this.mat.defines.STEPS = steps;
      this.mat.needsUpdate = true;
    }
  }

  get enabled() {
    return this.steps > 0;
  }

  render(r: THREE.WebGLRenderer, depth: THREE.Texture, w: number, h: number, cam: THREE.PerspectiveCamera, water: boolean) {
    const qw = Math.max(1, Math.ceil(w / 4));
    const qh = Math.max(1, Math.ceil(h / 4));
    if (this.rt.width !== qw || this.rt.height !== qh) this.rt.setSize(qw, qh);
    const u = this.mat.uniforms;
    u.uDepth.value = depth;
    u.uFull.value.set(w, h);
    u.uNearFar.value.set(cam.near, cam.far);
    u.uInvProj.value.copy(cam.projectionMatrixInverse);
    u.uCamRot.value.setFromMatrix4(cam.matrixWorld);
    u.uEye.value.copy(cam.position);
    u.uWaterOn.value = water ? 1 : 0;
    // Snell: the sun's ray bends steeper as it enters the water
    const s = globalUniforms.uSunDir.value as THREE.Vector3;
    const sh = Math.hypot(s.x, s.z);
    const sinW = Math.min(sh, 1) / 1.333;
    const cosW = Math.sqrt(1 - sinW * sinW);
    const k = sh > 1e-4 ? sinW / cosW / sh : 0;
    u.uLeanW.value.set(s.x * k, s.z * k);
    this.quad.material = this.mat;
    r.setRenderTarget(this.rt);
    r.render(this.scene, this.cam);
  }

  /** Rays from the sun at screen uv `sun`, through the gaps in what blots it out of the half-res picture. */
  renderRays(r: THREE.WebGLRenderer, half: THREE.Texture, depth: THREE.Texture, water: THREE.Texture, w: number, h: number, sun: THREE.Vector2) {
    const qw = Math.max(1, Math.ceil(w / 4));
    const qh = Math.max(1, Math.ceil(h / 4));
    for (const t of [this.rtMask, this.rtRays]) if (t.width !== qw || t.height !== qh) t.setSize(qw, qh);
    const m = this.maskMat.uniforms;
    m.uHalf.value = half;
    m.uDepth.value = depth;
    m.uWater.value = water;
    m.uSunUv.value.copy(sun);
    m.uAspect.value = w / h;
    this.blurMat.uniforms.uSunUv.value.copy(sun);
    this.quad.material = this.maskMat;
    r.setRenderTarget(this.rtMask);
    r.render(this.scene, this.cam);
    this.quad.material = this.blurMat;
    r.setRenderTarget(this.rtRays);
    r.render(this.scene, this.cam);
  }
}
