import * as THREE from 'three';
import { globalUniforms, patchMaterial } from '../render/environment';

// The Kraken's body, drawn entirely on the GPU from a handful of numbers.
//
// Arms: one merged tube per arm whose every vertex is placed in the vertex
// shader from a spine of 33 points the game poses each frame (written to a
// small float texture: position, girth, and the side the suckers face), so an
// arm can rear, whip down, coil round a hull and thrash without a single
// buffer upload. The skin is painted per pixel: a crimson back over a pale
// belly, chromatophore mottling, dark bands rippling down a roused arm, two
// staggered rows of suckers with raised rims, and photophores that glow in the
// dark of the storm.
//
// Head: a bulbous mantle with brow ridges, a siphon and two great eyes, each
// a gold iris split by a horizontal slit pupil, wet and glowing.
//
// Everything is built once at start-up and stays in the scene, so the warm-up
// draw compiles it (both programs and their shadow casters) behind the loading
// screen; nothing about it is ever created mid-voyage.

/** Spine points per arm (32 segments). */
export const SPINE = 33;
/** Arm slots: six that fight, two short ones that writhe about the head. */
export const ARMS = 8;
const RINGS = 88;
const SIDES = 18;
/** Texels per arm row: position + normal per spine point, then two of parameters. */
const ROW = SPINE * 2 + 2;

export interface ArmSpec {
  /** Length (m) and girth at the root (m). */
  L: number;
  R0: number;
}

/** Girth along the arm, 0 root .. 1 tip, as a fraction of the root's. */
export function armProfile(v: number) {
  return (0.05 + 0.95 * Math.pow(1 - v, 0.92)) * (1 + 0.16 * Math.exp(-v * 14));
}

const ARM_VERT_PARS = /* glsl */ `
uniform sampler2D uKrSpine;
attribute vec3 aK; // v along, angle round (0 = sucker side), arm
attribute vec3 aR; // radius (m), d radius / d length, sucker count from the root
varying vec4 vKr;  // v, angle, sucker count, metres along
varying vec4 vKrP; // hit flash, band phase, arousal, pallor
varying float vKrRad;
void krArm(out vec3 pos, out vec3 nrm) {
  int arm = int(aK.z + 0.5);
  float s = aK.x * 32.0;
  int i = int(min(floor(s), 31.0));
  float f = s - float(i);
  vec4 A = texelFetch(uKrSpine, ivec2(max(i - 1, 0) * 2, arm), 0);
  vec4 B = texelFetch(uKrSpine, ivec2(i * 2, arm), 0);
  vec4 C = texelFetch(uKrSpine, ivec2((i + 1) * 2, arm), 0);
  vec4 D = texelFetch(uKrSpine, ivec2(min(i + 2, 32) * 2, arm), 0);
  float f2 = f * f, f3 = f2 * f;
  vec3 c1 = -A.xyz + C.xyz;
  vec3 c2 = 2.0 * A.xyz - 5.0 * B.xyz + 4.0 * C.xyz - D.xyz;
  vec3 c3 = -A.xyz + 3.0 * B.xyz - 3.0 * C.xyz + D.xyz;
  vec3 p = B.xyz + 0.5 * (c1 * f + c2 * f2 + c3 * f3);
  vec3 dp = 0.5 * (c1 + 2.0 * c2 * f + 3.0 * c3 * f2);
  vec3 T = normalize(dp + vec3(0.0, 1e-5, 0.0));
  vec3 N = mix(texelFetch(uKrSpine, ivec2(i * 2 + 1, arm), 0).xyz, texelFetch(uKrSpine, ivec2((i + 1) * 2 + 1, arm), 0).xyz, f);
  N = normalize(N - T * dot(N, T) + vec3(1e-5, 0.0, 0.0));
  vec3 Bn = cross(T, N);
  float sc = mix(B.w, C.w, f);
  float r = aR.x * sc;
  float ca = cos(aK.y), sa = sin(aK.y);
  // the sucker side is a little flatter than the back
  float fl = 1.0 - 0.16 * pow(max(ca, 0.0), 3.0);
  pos = p + (N * ca * fl + Bn * sa) * r;
  nrm = normalize(N * ca / fl + Bn * sa - T * aR.y * sc);
  vec4 P1 = texelFetch(uKrSpine, ivec2(${SPINE * 2}, arm), 0);
  vec4 P2 = texelFetch(uKrSpine, ivec2(${SPINE * 2 + 1}, arm), 0);
  vKr = vec4(aK.x, aK.y, aR.z, aK.x * P2.x);
  vKrP = P1;
  vKrRad = r;
}
`;

const HEAD_VERT_PARS = /* glsl */ `
uniform vec4 uKrHead; // breath, arousal, pallor, hit flash
varying vec3 vKrO;
`;

// Shared skin: the palette, mottling, the arousal bands and the photophores.
const SKIN_GLSL = /* glsl */ `
float krRough = 0.3;
vec3 krEmis = vec3(0.0);
float krH = 0.0;
// Mikkelsen's derivative bump, fed finite differences of the height field
vec3 krPerturb(vec3 surfPos, vec3 surfNorm, vec2 dh, float faceDir) {
  vec3 sx = dFdx(surfPos);
  vec3 sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}
vec3 krPalette(float back, float belly) {
  vec3 dorsal = vec3(0.17, 0.02, 0.034);
  vec3 flank = vec3(0.42, 0.07, 0.056);
  vec3 under = vec3(0.74, 0.42, 0.35);
  return mix(mix(dorsal, flank, 1.0 - back), under, belly);
}
// photophores: rows of little lamps that breathe slowly, brightest in the dark
vec3 krGlow(float lamp, float phase) {
  float dark = 0.25 + uNight * 0.75 + uStorm * 0.45;
  float pulse = 0.55 + 0.45 * sin(uTime * 1.7 - phase);
  return vec3(0.18, 1.1, 1.0) * lamp * pulse * dark;
}
`;

const ARM_FRAG = /* glsl */ `
varying vec4 vKr;
varying vec4 vKrP;
varying float vKrRad;
${SKIN_GLSL}
// sucker rims (raised), cups (sunken) and a mask, in sucker-spacing units
vec3 krSuckers(vec2 q) {
  float a = q.y;
  float rim = 0.0, cup = 0.0, h = 0.0;
  if (abs(a) < 1.05) {
    for (int k = 0; k < 2; k++) {
      float side = k == 0 ? -1.0 : 1.0;
      float cu = fract(q.x + (k == 0 ? 0.0 : 0.5)) - 0.5;
      float cv = (a - side * 0.42) / 0.95;
      float d = length(vec2(cu, cv));
      float rr = smoothstep(0.41, 0.33, d);
      float cc = smoothstep(0.27, 0.13, d);
      rim = max(rim, rr * (1.0 - cc));
      cup = max(cup, cc);
      h = max(h, rr * (1.0 - cc * 1.35) + smoothstep(0.32, 0.38, d) * smoothstep(0.46, 0.38, d) * 0.15);
    }
  }
  return vec3(rim, cup, h);
}
// seam-free noise round the arm: two lookups whose seams sit on opposite sides
vec4 krNoise(float along, float a, float rad, vec2 sc) {
  float a2 = a < 0.0 ? a + 6.2832 : a;
  vec4 n1 = texture(uNoiseTex, vec2(along, a * rad) * sc);
  vec4 n2 = texture(uNoiseTex, vec2(along, a2 * rad) * sc + 0.31);
  return mix(n1, n2, smoothstep(1.4, 2.2, abs(a)));
}
float krHeight(vec2 q, float along, float rad) {
  vec3 s = krSuckers(q);
  float pap = krNoise(along, q.y, rad, vec2(0.42, 0.5)).g;
  float back = smoothstep(0.2, -0.6, cos(q.y));
  return (s.z * 0.11 + pap * 0.05 * (0.4 + back)) * rad;
}
void krLook(inout vec3 col) {
  float a = vKr.y;
  float ca = cos(a);
  float rad = max(vKrRad, 0.05);
  float belly = smoothstep(0.05, 0.8, ca);
  float back = smoothstep(0.2, -0.75, ca);
  col = krPalette(back, belly);
  vec4 n = krNoise(vKr.w, a, rad, vec2(0.085, 0.11));
  vec4 n2 = krNoise(vKr.w, a, rad, vec2(0.33, 0.39));
  // chromatophores: dark blotches over a fine reticulated net
  float mott = smoothstep(0.48, 0.74, n.r * 0.7 + n2.g * 0.5);
  col *= mix(1.0, 0.42, mott * (1.0 - belly * 0.85));
  col *= 0.84 + 0.32 * n2.b;
  // a roused arm ripples with dark bands running down to the tip
  float band = smoothstep(0.25, 0.95, sin(vKr.w * 0.42 - uTime * 6.5 + vKrP.y));
  col *= 1.0 - vKrP.z * 0.6 * band * (1.0 - belly * 0.7);
  col = mix(col, vec3(0.5, 0.03, 0.03), vKrP.z * 0.25 * back);
  // suckers
  vec3 s = krSuckers(vec2(vKr.z, a));
  col = mix(col, vec3(0.92, 0.66, 0.58), s.x * 0.85);
  col = mix(col, vec3(0.38, 0.12, 0.13), s.y * 0.8);
  krRough = mix(0.26 + n2.a * 0.12, 0.42, s.x);
  // photophores along both flanks of the back
  float lamp = 0.0;
  for (int k = 0; k < 2; k++) {
    float side = k == 0 ? -1.0 : 1.0;
    float u = vKr.w / max(rad * 1.7, 0.4);
    float cu = fract(u + (k == 0 ? 0.0 : 0.5)) - 0.5;
    float cv = (a - side * 2.05) * rad / max(rad * 1.7, 0.4);
    lamp = max(lamp, smoothstep(0.17, 0.04, length(vec2(cu, cv))));
  }
  krEmis += krGlow(lamp * (1.0 - vKrP.w), vKr.w * 0.35);
  // struck: the flesh blanches white-hot for a moment
  krEmis += vec3(1.3, 0.55, 0.45) * vKrP.x * 0.5 * (0.4 + back);
  // dying: the colour drains out of it
  col = mix(col, vec3(0.6, 0.53, 0.52) * (0.8 + 0.2 * n2.b), vKrP.w * 0.85);
  // bump: finite differences along the screen (crisp sucker rims, no blockiness)
  vec2 q = vec2(vKr.z, a);
  vec2 dqx = dFdx(q), dqy = dFdy(q);
  dqx.y -= 6.2832 * floor(dqx.y / 6.2832 + 0.5);
  dqy.y -= 6.2832 * floor(dqy.y / 6.2832 + 0.5);
  float dax = dFdx(vKr.w), day = dFdy(vKr.w);
  float h0 = krHeight(q, vKr.w, rad);
  krH = h0;
  krDh = vec2(krHeight(q + dqx, vKr.w + dax, rad) - h0, krHeight(q + dqy, vKr.w + day, rad) - h0);
}
`;

const HEAD_FRAG = /* glsl */ `
uniform vec4 uKrHead; // breath, arousal, pallor, hit flash
uniform vec4 uKrEye;  // eye centre (x mirrored), radius
uniform vec4 uKrGaze; // look x, y, lid open, pupil dilation
varying vec3 vKrO;
${SKIN_GLSL}
float krHeadH(vec3 o) {
  vec4 n = texture(uNoiseTex, o.xy * 0.13 + o.z * 0.07);
  vec4 n2 = texture(uNoiseTex, o.zy * 0.29 + o.x * 0.05 + 0.4);
  // warty papillae and the creases of the mantle
  float ridge = 1.0 - abs(n.g * 2.0 - 1.0);
  return n2.r * 0.07 + smoothstep(0.75, 1.0, ridge) * 0.06 + n.a * 0.04;
}
void krLook(inout vec3 col) {
  vec3 o = vKrO;
  vec3 dir = normalize(o - vec3(0.0, -2.0, 0.0));
  float up = clamp(dir.y * 0.8 + 0.3 - dir.z * 0.35, 0.0, 1.0);
  float belly = smoothstep(0.1, 0.75, dir.z * 0.8 - dir.y * 0.9 - 0.15);
  col = krPalette(up, belly);
  vec4 n = texture(uNoiseTex, o.xy * 0.07 + o.z * 0.031);
  vec4 n2 = texture(uNoiseTex, o.zy * 0.21 + o.x * 0.043 + 0.17);
  float mott = smoothstep(0.47, 0.74, n.r * 0.7 + n2.g * 0.5);
  col *= mix(1.0, 0.4, mott * (1.0 - belly * 0.8));
  col *= 0.84 + 0.32 * n2.b;
  // veins branching over the mantle
  float vein = 1.0 - smoothstep(0.0, 0.035, abs(n2.r - 0.5));
  col = mix(col, vec3(0.3, 0.02, 0.05), vein * 0.45 * up);
  float band = smoothstep(0.3, 0.95, sin(o.y * 0.55 + uTime * 5.0 + n.g * 3.0));
  col *= 1.0 - uKrHead.y * 0.45 * band * up;
  col = mix(col, vec3(0.55, 0.03, 0.03), uKrHead.y * 0.25 * up);
  krRough = 0.28 + n2.a * 0.14;

  // the eyes
  float sx = o.x < 0.0 ? -1.0 : 1.0;
  vec3 ec = vec3(uKrEye.x * sx, uKrEye.y, uKrEye.z);
  vec3 q = o - ec;
  float qd = length(q);
  vec3 F = normalize(vec3(sx * 0.78, 0.06, 0.62));
  vec3 qn = q / max(qd, 1e-3);
  float cd = dot(qn, F);
  float lamp = 0.0;
  if (qd < uKrEye.w * 1.6 && cd > 0.0) {
    vec3 U = normalize(cross(vec3(0.0, 1.0, 0.0), F)) * sx;
    vec3 W = cross(F, U) * sx;
    vec2 e = vec2(dot(qn, U), dot(qn, W));
    float rr = length(e);
    // lids: a heavy brow of skin above, a softer fold below
    float open = uKrGaze.z;
    float lidTop = mix(-0.08, 0.66, open) - e.x * e.x * 0.6;
    float lidBot = mix(-0.04, -0.7, open) + e.x * e.x * 0.5;
    float lid = smoothstep(lidTop - 0.03, lidTop + 0.03, e.y) + smoothstep(lidBot + 0.03, lidBot - 0.03, e.y);
    float ball = smoothstep(0.8, 0.74, rr) * (1.0 - clamp(lid, 0.0, 1.0));
    vec2 g = e - uKrGaze.xy * 0.16;
    float gr = length(g);
    float iris = smoothstep(0.6, 0.56, gr);
    float ang = atan(g.y, g.x);
    float fib = texture(uNoiseTex, vec2(ang * 0.32, gr * 0.9)).g;
    vec3 irisCol = mix(vec3(1.0, 0.62, 0.08), vec3(1.0, 0.86, 0.32), smoothstep(0.1, 0.55, gr) * fib);
    irisCol *= 0.55 + 0.6 * fib;
    float limbal = smoothstep(0.42, 0.6, gr);
    irisCol = mix(irisCol, vec3(0.45, 0.12, 0.02), limbal * 0.7);
    // a horizontal slit pupil that widens as it rouses or tires
    float dil = uKrGaze.w;
    float pup = smoothstep(1.0, 0.85, length(vec2(g.x / (0.38 + dil * 0.06), g.y / (0.05 + dil * 0.17))));
    vec3 eyeCol = mix(vec3(0.02, 0.02, 0.025), irisCol, iris);
    eyeCol = mix(eyeCol, vec3(0.0), pup);
    float glow = (0.9 + uNight * 2.2 + uStorm * 1.2) * (1.0 + uKrHead.y * 0.8) * (1.0 - uKrHead.z * 0.9);
    krEmis += irisCol * iris * (1.0 - pup) * ball * glow * 0.9;
    col = mix(col, eyeCol, ball);
    krRough = mix(krRough, 0.05, ball);
    // a ring of little lamps round the socket
    float ring = abs(rr - 0.98);
    float dots = smoothstep(0.55, 0.95, sin(atan(e.y, e.x) * 9.0));
    lamp = smoothstep(0.07, 0.0, ring) * dots * smoothstep(0.0, 0.2, cd);
    krH = -ball * 0.05;
  }
  // photophores in a line down each side of the mantle
  vec2 pl = vec2(o.y * 0.55, (abs(o.x) - (3.4 + o.y * 0.12)) * 1.6);
  float pc = length(vec2(fract(pl.x) - 0.5, pl.y));
  lamp = max(lamp, smoothstep(0.2, 0.05, pc) * step(-1.0, o.y) * step(o.y, 9.5) * step(0.0, -o.z + 2.0));
  krEmis += krGlow(lamp * (1.0 - uKrHead.z), o.y);
  krEmis += vec3(1.3, 0.55, 0.45) * uKrHead.w * 0.4;
  col = mix(col, vec3(0.6, 0.53, 0.52) * (0.8 + 0.2 * n2.b), uKrHead.z * 0.85);
  // relief from finite differences of the skin's height
  vec3 ox = dFdx(o), oy = dFdy(o);
  float h0 = krHeadH(o) + krH;
  krH = h0;
  krDh = vec2(krHeadH(o + ox) - krHeadH(o), krHeadH(o + oy) - krHeadH(o));
}
`;

/** Wires a patched standard material into the arm or head shader. */
function krakenMaterial(head: boolean, extra: Record<string, THREE.IUniform>) {
  const mat = patchMaterial(new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0, color: 0xffffff }), { clouds: true, caustics: true });
  const base = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    base.call(mat, shader, r);
    Object.assign(shader.uniforms, extra);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${head ? HEAD_VERT_PARS : ARM_VERT_PARS}`)
      .replace(
        '#include <beginnormal_vertex>',
        head
          ? `vec3 objectNormal = vec3(normal);`
          : `vec3 krP; vec3 objectNormal; krArm(krP, objectNormal);`,
      )
      .replace(
        '#include <begin_vertex>',
        head
          ? `vKrO = position;
  // the mantle swells and empties as it breathes
  float krM = smoothstep(-1.0, 7.0, position.y);
  vec3 transformed = position + normal * uKrHead.x * krM * 0.55;`
          : `vec3 transformed = krP;`,
      );
    shader.fragmentShader = shader.fragmentShader
      // after the atmosphere's uniforms (patchMaterial puts them below <common>)
      .replace('void main() {', `vec2 krDh = vec2(0.0);\n${head ? HEAD_FRAG : ARM_FRAG}\nvoid main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n  krLook(diffuseColor.rgb);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n  roughnessFactor = krRough;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n  normal = krPerturb(-vViewPosition, normal, krDh, faceDirection);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n  totalEmissiveRadiance += krEmis;`)
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
  {
    // thin flesh: the light glows red through it, strongest toward the sun
    vec3 krL = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
    float krBack = clamp(0.35 - dot(normal, krL), 0.0, 1.0);
    reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * krBack * vec3(0.16, 0.035, 0.025);
  }`,
      );
  };
  const prevKey = mat.customProgramCacheKey;
  mat.customProgramCacheKey = () => prevKey.call(mat) + (head ? '|krhead' : '|krarm');
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, extra);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${head ? HEAD_VERT_PARS : ARM_VERT_PARS}`)
      .replace(
        '#include <begin_vertex>',
        head
          ? `vKrO = position;
  vec3 transformed = position + normal * uKrHead.x * smoothstep(-1.0, 7.0, position.y) * 0.55;`
          : `vec3 krP, krN; krArm(krP, krN); vec3 transformed = krP;`,
      );
  };
  depth.customProgramCacheKey = () => (head ? 'krhead-depth' : 'krarm-depth');
  return { mat, depth };
}

/** All the arms in one buffer: a tube per arm, its vertices placed by the shader. */
function armGeometry(specs: ArmSpec[]) {
  const per = (RINGS + 1) * (SIDES + 1);
  const n = per * specs.length;
  const pos = new Float32Array(n * 3);
  const aK = new Float32Array(n * 3);
  const aR = new Float32Array(n * 3);
  const idx: number[] = [];
  specs.forEach((sp, arm) => {
    let suck = 0;
    let lastV = 0;
    for (let i = 0; i <= RINGS; i++) {
      // rings bunch up toward the tip, where it curls tightest
      const vv = 1 - Math.pow(1 - i / RINGS, 1.25);
      const r = i === RINGS ? 0 : sp.R0 * armProfile(vv);
      const dv = 0.002;
      const slope = (sp.R0 * (armProfile(Math.min(1, vv + dv)) - armProfile(Math.max(0, vv - dv)))) / (2 * dv * sp.L);
      // suckers stay a set fraction of the girth apart
      if (i > 0) suck += ((vv - lastV) * sp.L) / Math.max(0.95 * sp.R0 * armProfile((vv + lastV) / 2), 0.04);
      lastV = vv;
      for (let j = 0; j <= SIDES; j++) {
        const a = (j / SIDES) * Math.PI * 2 - Math.PI;
        const k = arm * per + i * (SIDES + 1) + j;
        aK.set([vv, a, arm], k * 3);
        aR.set([r, i === RINGS ? 0 : slope, suck], k * 3);
      }
    }
    for (let i = 0; i < RINGS; i++) {
      for (let j = 0; j < SIDES; j++) {
        const a = arm * per + i * (SIDES + 1) + j;
        const b = a + SIDES + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aK', new THREE.BufferAttribute(aK, 3));
  g.setAttribute('aR', new THREE.BufferAttribute(aR, 3));
  // three wants a normal to build the standard program's varyings; the shader makes its own
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return g;
}

/** Eye centre (x mirrored) and radius, in the head's own frame. */
export const EYE = new THREE.Vector4(3.7, -0.9, 3.9, 1.35);

/**
 * The mantle and face: a sphere pushed into a tall, back-swept sac with a
 * flared crown below the water, brow ridges, bulging eyes and a siphon.
 * Origin at the eyes' level; +z faces the prey.
 */
function headGeometry() {
  const g = new THREE.SphereGeometry(1, 72, 52);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const eye = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const d = v.clone();
    // the sac: taller than wide, swept back toward the top
    let x = d.x * 5.6;
    let y = d.y * 8.8 + 2.4;
    let z = d.z * 6.0;
    const top = Math.max(0, d.y);
    z -= Math.pow(top, 1.5) * 4.2;
    x *= 1 - top * top * 0.28;
    // a waist under the eyes, then the crown of arm roots flaring out below the water
    const low = Math.max(0, -d.y);
    const waist = Math.exp(-Math.pow((d.y + 0.25) / 0.16, 2)) * 0.1;
    x *= 1 - waist + low * low * 0.55;
    z *= 1 - waist + low * low * 0.55;
    // eyes bulge out of the sides of the face
    for (const sx of [-1, 1]) {
      eye.set(sx * 0.7, -0.38, 0.62).normalize();
      const k = Math.exp(-d.distanceToSquared(eye) * 26);
      const out = new THREE.Vector3(x, y - 2.4, z).normalize();
      x += out.x * k * 1.25;
      y += out.y * k * 1.25;
      z += out.z * k * 1.25;
      // a heavy brow ridge arching over each eye
      eye.set(sx * 0.62, -0.12, 0.6).normalize();
      const b = Math.exp(-d.distanceToSquared(eye) * 30) * 0.7;
      y += b * 0.5;
      z += b * 0.6;
      x += sx * b * 0.3;
    }
    // the siphon: a fleshy funnel on the left of the face, low down
    const sip = new THREE.Vector3(-0.35, -0.7, 0.62).normalize();
    const s = Math.exp(-d.distanceToSquared(sip) * 40);
    x -= s * 0.6;
    y -= s * 0.4;
    z += s * 1.7;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  g.deleteAttribute('uv');
  return g;
}

/** Where the slam will land: a crimson shimmer laid on the sea. */
function markMaterial(depthU: Record<string, THREE.IUniform>) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    premultipliedAlpha: true,
    uniforms: { uTime: globalUniforms.uTime, uNight: globalUniforms.uNight, ...depthU },
    vertexShader: /* glsl */ `
      attribute vec4 aMk; // alpha, kind (0 strip, 1 ring), seed, urgency
      varying vec2 vP; varying vec4 vMk; varying float vViewZ;
      void main() {
        vP = position.xz;
        vMk = aMk;
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vViewZ = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uNight;
      uniform sampler2D uSceneDepth; uniform vec2 uResolution; uniform vec2 uCamNearFar;
      varying vec2 vP; varying vec4 vMk; varying float vViewZ;
      float linearDepth(float d) { float n = uCamNearFar.x, f = uCamNearFar.y; return (n * f) / (f - d * (f - n)); }
      void main() {
        float sz = linearDepth(texture(uSceneDepth, gl_FragCoord.xy / uResolution).r);
        float occ = smoothstep(-0.8, 0.4, sz - vViewZ);
        float a;
        if (vMk.y < 0.5) {
          // the strip: along x 0..1 from the root, across z -0.5..0.5
          float u = vP.x + 0.5;
          float w = vP.y * 2.0;
          float body = exp(-w * w * 3.2) * smoothstep(0.0, 0.12, u) * smoothstep(1.0, 0.82, u);
          float edge = exp(-pow((abs(w) - 0.72) * 7.0, 2.0)) * smoothstep(0.0, 0.2, u) * smoothstep(1.0, 0.9, u);
          float run = 0.55 + 0.45 * sin(u * 34.0 - uTime * (9.0 + vMk.w * 10.0) + vMk.z * 6.0);
          a = (body * 0.35 * run + edge * 0.55) * (0.6 + 0.4 * vMk.w);
        } else {
          // the ring: a pulsing circle where something vast is about to break the surface
          float r = length(vP) * 2.0;
          float rd = (r - 0.8 - 0.06 * sin(uTime * 5.0)) * 10.0;
          a = exp(-rd * rd) * 0.7 + (1.0 - smoothstep(0.0, 0.85, r)) * 0.12 * (0.5 + 0.5 * sin(uTime * 7.0 - r * 9.0));
        }
        a *= vMk.x * occ;
        if (a < 0.002) discard;
        vec3 col = vec3(1.9, 0.16, 0.08) * (1.0 - uNight * 0.45);
        gl_FragColor = vec4(col * a, 0.0);
      }`,
  });
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export class KrakenView {
  /** Opaque pass: the arms and the head. */
  readonly group = new THREE.Group();
  /** Water/fx pass: the warning marks on the sea. */
  readonly fx = new THREE.Group();
  readonly arms: THREE.Mesh;
  readonly head: THREE.Mesh;
  readonly headRoot = new THREE.Group();
  /** Per arm: SPINE points (xyz girth), SPINE sucker-side normals, then two params. */
  readonly data = new Float32Array(ROW * ARMS * 4);
  private tex: THREE.DataTexture;
  readonly headU = {
    uKrHead: { value: new THREE.Vector4() },
    uKrEye: { value: EYE.clone() },
    uKrGaze: { value: new THREE.Vector4(0, 0, 1, 0.3) },
  };
  private marks: THREE.InstancedMesh;
  private markAttr: THREE.InstancedBufferAttribute;
  private depthU = {
    uSceneDepth: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCamNearFar: { value: new THREE.Vector2(1, 1000) },
  };
  private nMarks = 0;

  constructor(readonly specs: ArmSpec[]) {
    this.tex = new THREE.DataTexture(this.data, ROW, ARMS, THREE.RGBAFormat, THREE.FloatType);
    this.tex.minFilter = this.tex.magFilter = THREE.NearestFilter;
    this.tex.generateMipmaps = false;
    this.tex.needsUpdate = true;
    const spineU = { uKrSpine: { value: this.tex } };
    const arm = krakenMaterial(false, spineU);
    this.arms = new THREE.Mesh(armGeometry(specs), arm.mat);
    this.arms.customDepthMaterial = arm.depth;
    this.arms.castShadow = true;
    this.arms.receiveShadow = true;
    this.arms.frustumCulled = false;
    const hd = krakenMaterial(true, this.headU);
    this.head = new THREE.Mesh(headGeometry(), hd.mat);
    this.head.customDepthMaterial = hd.depth;
    this.head.castShadow = true;
    this.head.receiveShadow = true;
    this.headRoot.add(this.head);
    this.group.add(this.arms, this.headRoot);
    // until it first comes, every arm hangs straight down far below the sea
    for (let a = 0; a < ARMS; a++) this.writeRest(a, 0, -400, 0);
    const mg = new THREE.PlaneGeometry(1, 1);
    mg.rotateX(-Math.PI / 2);
    this.markAttr = new THREE.InstancedBufferAttribute(new Float32Array(ARMS * 2 * 4), 4).setUsage(THREE.DynamicDrawUsage);
    mg.setAttribute('aMk', this.markAttr);
    this.marks = new THREE.InstancedMesh(mg, markMaterial(this.depthU), ARMS * 2);
    this.marks.count = 0;
    this.marks.frustumCulled = false;
    this.marks.renderOrder = 5;
    this.fx.add(this.marks);
    this.group.visible = false;
  }

  /** An arm folded away to nothing (no girth, every point in one place): drawn, but no pixels. */
  writeRest(arm: number, x: number, y: number, z: number) {
    const L = this.specs[arm].L;
    const d = this.data;
    const o = arm * ROW * 4;
    for (let i = 0; i < SPINE; i++) {
      d.set([x, y, z, 0], o + i * 8);
      d.set([1, 0, 0, 0], o + i * 8 + 4);
    }
    d.set([0, 0, 0, 0], o + SPINE * 8);
    d.set([L, this.specs[arm].R0, 0, 0], o + SPINE * 8 + 4);
  }

  /** Writes a posed spine: positions (xyz), girth scale per point and the sucker-side normals. */
  writeArm(arm: number, pts: Float32Array, nrm: Float32Array, girth: Float32Array, flash: number, band: number, arousal: number, pallor: number) {
    const d = this.data;
    const o = arm * ROW * 4;
    for (let i = 0; i < SPINE; i++) {
      const b = o + i * 8;
      d[b] = pts[i * 3];
      d[b + 1] = pts[i * 3 + 1];
      d[b + 2] = pts[i * 3 + 2];
      d[b + 3] = girth[i];
      d[b + 4] = nrm[i * 3];
      d[b + 5] = nrm[i * 3 + 1];
      d[b + 6] = nrm[i * 3 + 2];
    }
    const p = o + SPINE * 8;
    d[p] = flash;
    d[p + 1] = band;
    d[p + 2] = arousal;
    d[p + 3] = pallor;
  }

  commit() {
    this.tex.needsUpdate = true;
  }

  setHead(x: number, y: number, z: number, yaw: number, pitch: number, roll: number, breath: number, arousal: number, pallor: number, flash: number) {
    this.headRoot.position.set(x, y, z);
    this.headRoot.rotation.set(pitch, yaw, roll, 'YXZ');
    this.headU.uKrHead.value.set(breath, arousal, pallor, flash);
  }

  setGaze(x: number, y: number, open: number, dilate: number) {
    this.headU.uKrGaze.value.set(x, y, open, dilate);
  }

  beginMarks() {
    this.nMarks = 0;
  }

  /** A slam's landing strip: from (x, z) along `ang` for `len` metres, `w` wide. */
  strip(x: number, y: number, z: number, ang: number, len: number, w: number, alpha: number, urgency: number, seed: number) {
    if (this.nMarks >= this.marks.instanceMatrix.count) return;
    _q.setFromAxisAngle(_up, ang - Math.PI / 2);
    _p.set(x + Math.sin(ang) * len * 0.5, y, z + Math.cos(ang) * len * 0.5);
    _s.set(len, 1, w);
    _m.compose(_p, _q, _s);
    this.marks.setMatrixAt(this.nMarks, _m);
    this.markAttr.setXYZW(this.nMarks++, alpha, 0, seed, urgency);
  }

  ring(x: number, y: number, z: number, r: number, alpha: number) {
    if (this.nMarks >= this.marks.instanceMatrix.count) return;
    _q.identity();
    _p.set(x, y, z);
    _s.set(r * 2, 1, r * 2);
    _m.compose(_p, _q, _s);
    this.marks.setMatrixAt(this.nMarks, _m);
    this.markAttr.setXYZW(this.nMarks++, alpha, 1, 0, 0);
  }

  endMarks() {
    this.marks.count = this.nMarks;
    this.marks.instanceMatrix.needsUpdate = true;
    this.markAttr.needsUpdate = true;
  }

  setScene(depth: THREE.Texture, w: number, h: number, cam: THREE.PerspectiveCamera) {
    this.depthU.uSceneDepth.value = depth;
    this.depthU.uResolution.value.set(w, h);
    this.depthU.uCamNearFar.value.set(cam.near, cam.far);
  }
}
