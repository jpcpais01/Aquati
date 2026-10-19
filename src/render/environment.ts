import * as THREE from 'three';
import { getSharedTextures } from './textures';
import {
  GLSL_DAMAGE_EMISSIVE,
  GLSL_DAMAGE_FRAGMENT,
  GLSL_DAMAGE_FRAGMENT_PARS,
  GLSL_DAMAGE_SURFACE,
  GLSL_DAMAGE_VERTEX,
  GLSL_DAMAGE_VERTEX_PARS,
} from '../ships/damageGlsl';

// One global set of lighting / atmosphere uniforms. Every custom or patched
// material references the very same uniform objects, so updating them once a
// frame keeps the whole world coherent.

export const SUN_DIR = new THREE.Vector3(-0.62, 0.53, -0.58).normalize();
export const SUN_COLOR = new THREE.Color(1.0, 0.9, 0.76).multiplyScalar(3.1);
export const SKY_ZENITH = new THREE.Color(0.11, 0.33, 0.78);
export const SKY_HORIZON = new THREE.Color(0.63, 0.8, 0.94);
export const FOG_COLOR = new THREE.Color(0.55, 0.73, 0.86);
export const WATER_LEVEL = 0;

const tex = getSharedTextures();

export const globalUniforms = {
  uTime: { value: 0 },
  uSunDir: { value: SUN_DIR.clone() },
  uSunColor: { value: new THREE.Vector3(SUN_COLOR.r, SUN_COLOR.g, SUN_COLOR.b) },
  uSkyZenith: { value: new THREE.Vector3(SKY_ZENITH.r, SKY_ZENITH.g, SKY_ZENITH.b) },
  uSkyHorizon: { value: new THREE.Vector3(SKY_HORIZON.r, SKY_HORIZON.g, SKY_HORIZON.b) },
  uFogColor: { value: new THREE.Vector3(FOG_COLOR.r, FOG_COLOR.g, FOG_COLOR.b) },
  uFogRange: { value: new THREE.Vector2(380, 1500) },
  uNoiseTex: { value: tex.noise as THREE.Texture },
  uCausticTex: { value: tex.caustics as THREE.Texture },
  uCloudOffset: { value: new THREE.Vector2() },
  uWind: { value: new THREE.Vector3(0, 1, 1) }, // dir.xz, strength
};

export const GLSL_ATMOS = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform sampler2D uNoiseTex;
uniform sampler2D uCausticTex;
uniform vec2 uCloudOffset;

vec3 skyColor(vec3 d) {
  float h = clamp(d.y, -1.0, 1.0);
  vec3 col = mix(uSkyHorizon, uSkyZenith, pow(max(h, 0.0), 0.55));
  // warm haze toward the sun
  float sd = max(dot(d, uSunDir), 0.0);
  col += vec3(1.0, 0.78, 0.5) * pow(sd, 6.0) * 0.35;
  col += vec3(1.0, 0.85, 0.65) * pow(sd, 64.0) * 1.2;
  // below the horizon: blend into a deep sea tint so reflections stay grounded
  col = mix(col, vec3(0.06, 0.2, 0.3), smoothstep(0.0, -0.25, h));
  return col;
}

float cloudShadow(vec2 xz) {
  vec2 uv = xz * 0.0011 + uCloudOffset;
  float n = texture(uNoiseTex, uv).r * 0.62 + texture(uNoiseTex, uv * 2.7 + vec2(0.37, 0.71)).r * 0.38;
  return mix(1.0, 0.5, smoothstep(0.5, 0.68, n));
}

float causticsAt(vec3 wp, float depth) {
  vec2 p = wp.xz - uSunDir.xz / max(uSunDir.y, 0.2) * depth * 0.7;
  float t = uTime;
  vec2 uv = p * 0.075;
  float c1 = texture(uCausticTex, uv + vec2(t * 0.019, t * 0.011)).r;
  float c2 = texture(uCausticTex, uv * 1.31 + vec2(-t * 0.014, t * 0.022) + 0.5).r;
  float c = min(c1, c2) * 1.6 + c1 * c2 * 1.2;
  float fade = smoothstep(0.05, 0.9, depth) * exp(-depth * 0.16);
  return c * fade;
}
`;

export interface PatchOptions {
  caustics?: boolean;
  clouds?: boolean;
  wetSand?: boolean;
  detail?: boolean;
  sway?: number; // vegetation sway amplitude (instanced)
  sail?: boolean; // billowing sails
  flag?: boolean; // waving flags (uv.x along length)
  damage?: boolean; // battle damage (holes, scorch, torn canvas, wreck split)
  cut?: boolean; // damage holes cut clean through this surface
}

/** How each material was patched, so ships can re-patch per-hull damage clones. */
export const patchInfo = new WeakMap<THREE.Material, { opts: PatchOptions; extra: Record<string, THREE.IUniform> }>();

/** Injects the shared atmosphere into a three.js standard / physical material. */
export function patchMaterial<T extends THREE.MeshStandardMaterial>(mat: T, opts: PatchOptions, extraUniforms: Record<string, THREE.IUniform> = {}): T {
  const key = JSON.stringify(opts) + Object.keys(extraUniforms).join(',');
  patchInfo.set(mat, { opts, extra: extraUniforms });
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, globalUniforms, extraUniforms);
    const defs: string[] = [];
    if (opts.caustics) defs.push('#define AQ_CAUSTICS');
    if (opts.clouds) defs.push('#define AQ_CLOUDS');
    if (opts.wetSand) defs.push('#define AQ_WET');
    if (opts.detail) defs.push('#define AQ_DETAIL');
    if (opts.sway) defs.push(`#define AQ_SWAY ${opts.sway.toFixed(3)}`);
    if (opts.sail) defs.push('#define AQ_SAIL');
    if (opts.flag) defs.push('#define AQ_FLAG');
    if (opts.damage) defs.push('#define AQ_DAMAGE');
    if (opts.cut) defs.push('#define AQ_DMG_CUT');
    const head = defs.join('\n') + '\n';

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `${head}#include <common>
uniform float uTime;
varying vec3 vAqWorld;
#ifdef AQ_SAIL
uniform float uSailFill;
uniform float uSailPhase;
uniform float uSailDepth;
attribute float aBillow;
#endif
${GLSL_DAMAGE_VERTEX_PARS}`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
#ifdef AQ_SAIL
  {
    float k = (0.25 + uSailFill) * 0.55;
    float dzdu = cos(uv.x * 3.14159) * sin(uv.y * 2.89 + 0.12);
    float dzdv = sin(uv.x * 3.14159) * cos(uv.y * 2.89 + 0.12);
    objectNormal = normalize(objectNormal + vec3(-dzdu * k, -dzdv * k * 0.6, 0.0) * sign(objectNormal.z));
  }
#endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef AQ_SWAY
  {
    vec3 ip = vec3(0.0);
    #ifdef USE_INSTANCING
      ip = instanceMatrix[3].xyz;
    #endif
    float ph = ip.x * 0.13 + ip.z * 0.17;
    float hgt = max(position.y, 0.0);
    float w = hgt * hgt * AQ_SWAY;
    transformed.x += (sin(uTime * 1.3 + ph) * 0.7 + sin(uTime * 2.9 + ph * 2.1) * 0.3) * w;
    transformed.z += (cos(uTime * 1.1 + ph * 1.3) * 0.6) * w;
  }
#endif
#ifdef AQ_SAIL
  {
    // uv.x across the sail, uv.y down from the yard. Belly bulges forward (+z).
    float bx = sin(uv.x * 3.14159);
    float by = sin(uv.y * 3.14159 * 0.92 + 0.12);
    float flutter = sin(uTime * 6.0 + uv.x * 7.0 + uv.y * 5.0 + uSailPhase) * 0.04 * (1.0 - uSailFill * 0.7);
    transformed.z += (bx * by * (0.25 + uSailFill * 1.0) + flutter) * uSailDepth * aBillow;
  }
#endif
${GLSL_DAMAGE_VERTEX}
#ifdef AQ_FLAG
  {
    float a = uv.x;
    transformed.z += sin(uTime * 7.0 - a * 9.0) * 0.18 * a;
    transformed.y += sin(uTime * 5.0 - a * 6.0) * 0.06 * a;
  }
#endif`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
  {
    vec4 aqw = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      aqw = instanceMatrix * aqw;
    #endif
    vAqWorld = (modelMatrix * aqw).xyz;
  }`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `${head}#include <common>
varying vec3 vAqWorld;
${GLSL_ATMOS}
${GLSL_DAMAGE_FRAGMENT_PARS}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
${GLSL_DAMAGE_FRAGMENT}
#ifdef AQ_DETAIL
  {
    vec4 nz = texture(uNoiseTex, vAqWorld.xz * 0.021);
    vec4 nz2 = texture(uNoiseTex, vAqWorld.xz * 0.19);
    diffuseColor.rgb *= 0.86 + nz.g * 0.22 + (nz2.a - 0.5) * 0.12;
  }
#endif
#ifdef AQ_WET
  float aqWet = 1.0 - smoothstep(0.05, 1.1 + sin(uTime * 0.6 + vAqWorld.x * 0.05) * 0.25, vAqWorld.y);
  diffuseColor.rgb *= mix(1.0, 0.64, aqWet);
#endif`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
#ifdef AQ_WET
  roughnessFactor = mix(roughnessFactor, 0.3, aqWet * step(0.0, vAqWorld.y));
#endif`,
      )
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${GLSL_DAMAGE_SURFACE}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${GLSL_DAMAGE_EMISSIVE}`)
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
#ifdef AQ_CLOUDS
  {
    float cs = cloudShadow(vAqWorld.xz);
    reflectedLight.directDiffuse *= cs;
    reflectedLight.directSpecular *= cs;
  }
#endif
#ifdef AQ_CAUSTICS
  {
    float depth = -vAqWorld.y;
    if (depth > 0.0) {
      float c = causticsAt(vAqWorld, depth);
      float nl = max(dot(normal, (viewMatrix * vec4(uSunDir, 0.0)).xyz), 0.0);
      #ifdef AQ_CLOUDS
        c *= cloudShadow(vAqWorld.xz);
      #endif
      reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * c * nl * 0.9;
      reflectedLight.directDiffuse *= exp(-depth * vec3(0.16, 0.05, 0.035));
    }
  }
#endif`,
      );
  };
  return mat;
}

/** Bakes a small PMREM environment from the analytic sky for IBL. */
export function createEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: globalUniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      ${GLSL_ATMOS}
      void main() {
        vec3 d = normalize(vDir);
        vec3 c = skyColor(d);
        // soft sun lobe without the hot disk (direct light handles that)
        gl_FragColor = vec4(c * 1.15, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), mat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0, 0.1, 100);
  pmrem.dispose();
  mat.dispose();
  return rt.texture;
}
