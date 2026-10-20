import * as THREE from 'three';
import { getSharedTextures } from './textures';
import { VORTEX_N } from '../world/vortex';
import { shadowUniforms } from './softShadows';
import {
  GLSL_DAMAGE_EMISSIVE,
  GLSL_DAMAGE_FRAGMENT,
  GLSL_DAMAGE_FRAGMENT_PARS,
  GLSL_DAMAGE_SURFACE,
  GLSL_DAMAGE_VERTEX,
  GLSL_DAMAGE_VERTEX_PARS,
} from '../ships/damageGlsl';
import { GLSL_PART_SAIL, GLSL_SKIN } from '../ships/skinGlsl';
import { GLSL_GHOST_ALPHA, GLSL_GHOST_COLOR, GLSL_GHOST_EMISSIVE, GLSL_GHOST_FRAGMENT_PARS, GLSL_GHOST_VERTEX } from '../ships/ghostGlsl';

// One global set of lighting / atmosphere uniforms. Every custom or patched
// material references the very same uniform objects, so updating them once a
// frame keeps the whole world coherent.

export const SUN_DIR = new THREE.Vector3(-0.62, 0.53, -0.58).normalize();
export const SUN_COLOR = new THREE.Color(1.0, 0.9, 0.76).multiplyScalar(3.1);
export const SKY_ZENITH = new THREE.Color(0.11, 0.33, 0.78);
export const SKY_HORIZON = new THREE.Color(0.63, 0.8, 0.94);
export const FOG_COLOR = new THREE.Color(0.55, 0.73, 0.86);
export const WATER_LEVEL = 0;
export const MAX_GUSTS = 8;

/**
 * The cloud field's recipe, shared by the GLSL below and by the CPU (which
 * finds the heaps to stand cumulus impostors on, see render/cumulus.ts).
 * Each layer is [scale, offset u, offset v] on the noise texture.
 */
export const CLOUD = {
  base: 700, // flat cloud base (m)
  uvPerM: 0.0011, // cloud-field uv per metre of ground
  sys: [0.13, 0.61, 0.17], // R: weather systems
  cell: [0.11, 0.13, 0.57], // B: one heap per Worley cell
  bil: [0.83, 0.37, 0.71], // R: billows
} as const;

/** The cloud field's threshold for a cloud cover (mirrors cloudLo() in GLSL). */
export function cloudLo(cover: number) {
  const c4 = cover * cover * cover * cover;
  return 0.89 - cover * 0.7 - c4 * c4 * c4 * c4 * 0.5;
}

/** The cloud field from its three noise samples (mirrors cloudField() in GLSL). */
export function cloudMix(sys: number, cell: number, bil: number) {
  return cell * 0.5 + (sys - 0.5) * 1.6 + (bil - 0.5) * 0.55 + 0.25;
}
/** Gust puffs are stretched along the wind by this much. Mirrored on the CPU. */
export const GUST_STRETCH = 1.8;

const tex = getSharedTextures();
const BLANK = new THREE.DataTexture(new Uint8Array(4), 1, 1);
BLANK.needsUpdate = true;

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
  // the wind's heading integrated over time: scroll textures along this, never dir * uTime,
  // which would whip them sideways whenever the wind veers
  uWindDrift: { value: new THREE.Vector2() },
  // origin for streaks laid out along the wind (dot(p - pivot, dir)): moved as the wind
  // turns so they swing round about the view instead of sweeping across it
  uWindPivot: { value: new THREE.Vector2() },
  // travelling gust puffs (see fx/wind.ts): xz centre, radius, amplitude
  uGusts: { value: Array.from({ length: MAX_GUSTS }, () => new THREE.Vector4(0, 0, 1, 0)) },
  // day cycle & weather (see world/atmosphere.ts)
  uHaze: { value: new THREE.Vector3(1, 0.8, 0.55) }, // glow around the sun / moon
  uLight: { value: new THREE.Vector3(1, 1, 1) }, // ambient light tint for unlit fx (1 = clear noon)
  uNight: { value: 0 }, // 0 day .. 1 deep night
  uCloudCover: { value: 0.3 }, // 0 clear .. 1 overcast
  uRain: { value: 0 },
  uStorm: { value: 0 },
  uWet: { value: 0 }, // surface wetness, lags the rain
  uFlash: { value: 0 }, // lightning
  uMist: { value: 0 }, // low sea mist / rain haze, thickens with distance
  // ashore: leaves between the camera and the captain thin away (xyz the captain, w the radius; 0 off)
  uSeeThru: { value: new THREE.Vector4() },
  // shadows of the low fair-weather puffs (see world/clouds.ts): a small
  // top-down map around the view; xy its centre, z 1 / its width (m), w strength
  uLowCloudTex: { value: BLANK as THREE.Texture },
  uLowCloudXf: { value: new THREE.Vector4(0, 0, 1 / 680, 0) },
  // beneath the waves (the farewell follows your ship down): x amount 0/1,
  // z how far you can see (m); uUnderColor is the water's own glow
  uUnder: { value: new THREE.Vector4(0, 0, 60, 0) },
  uUnderColor: { value: new THREE.Vector3(0.03, 0.2, 0.24) },
  // the Kraken's maelstrom (see game/kraken.ts): xz centre, radius (m), strength
  // 0..1; and the ink it spills, which stains the sea over it
  uKraken: { value: new THREE.Vector4(0, 0, 1, 0) },
  uKrakenInk: { value: 0 },
  // the maelstroms (see game/hazards.ts, world/vortex.ts): xz centre, radius (m),
  // strength signed by the way it turns; an unused slot has strength 0
  uVortex: { value: Array.from({ length: VORTEX_N }, () => new THREE.Vector4(0, 0, 1, 0)) },
};

export const GLSL_GUST = /* glsl */ `
uniform vec3 uWind;
uniform vec2 uWindDrift;
uniform vec2 uWindPivot;
uniform vec4 uGusts[${MAX_GUSTS}];

// Sum of soft, wind-stretched puffs. Same maths as WindField.at() on the CPU.
float gustAt(vec2 p) {
  vec2 wd = uWind.xy;
  float g = 0.0;
  for (int i = 0; i < ${MAX_GUSTS}; i++) {
    vec4 q = uGusts[i];
    vec2 d = p - q.xy;
    float a = dot(d, wd) * ${(1 / GUST_STRETCH).toFixed(4)};
    float b = dot(d, vec2(-wd.y, wd.x));
    float r = max(1.0 - (a * a + b * b) / (q.z * q.z), 0.0);
    g += q.w * r * r;
  }
  return min(g, 1.4);
}
`;

export const GLSL_ATMOS = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform sampler2D uNoiseTex;
uniform sampler2D uCausticTex;
uniform vec2 uCloudOffset;
${GLSL_GUST}
uniform vec3 uHaze;
uniform vec3 uLight;
uniform float uNight;
uniform float uCloudCover;
uniform float uRain;
uniform float uStorm;
uniform float uWet;
uniform float uFlash;
uniform float uMist;
uniform sampler2D uLowCloudTex;
uniform vec4 uLowCloudXf;

// how much low mist lies between the eye and a point d metres away
float mistAt(float d) {
  return (1.0 - exp(-d * 0.0045)) * uMist * 0.7;
}

vec3 aqHash32(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}

// a sparse field of stars, only through gaps in the cloud
vec3 starField(vec3 d) {
  if (uNight < 0.01 || d.y <= 0.0) return vec3(0.0);
  vec3 q = d * 150.0;
  vec3 c = floor(q);
  vec3 r = aqHash32(c.xy + c.z * 17.13);
  float star = smoothstep(0.42, 0.0, length(fract(q) - 0.2 - r * 0.6)) * step(0.93, r.z);
  return vec3(0.8, 0.88, 1.0) * star * (r.x * 1.2 + 0.3) * uNight * (1.0 - uCloudCover) * smoothstep(0.0, 0.25, d.y);
}

// The open sky along a direction. The keyframed zenith and horizon colours
// are shaped the way real air scatters light: deep blue overhead paling into a
// bright band of thick air at the horizon (optical depth), a touch richer
// toward and away from the sun than at right angles to it (Rayleigh phase),
// and a warm forward-scattering glow around the sun itself (Mie).
vec3 skyColor(vec3 d) {
  float h = clamp(d.y, -1.0, 1.0);
  float hp = max(h, 0.0);
  float mu = dot(d, uSunDir);
  float sd = max(mu, 0.0);
  // the pale band of thick air is narrow: by twenty degrees up it is mostly blue
  vec3 col = mix(uSkyHorizon, uSkyZenith, (1.0 - exp(-hp * 7.0)) * 1.001);
  // overhead the blue deepens and saturates; the cloudier, the less of it
  float clear = 1.0 - uCloudCover * 0.75;
  col = mix(col, col * vec3(0.82, 0.92, 1.08), smoothstep(0.25, 0.9, hp) * clear * (1.0 - uNight));
  col *= 0.93 + 0.11 * mu * mu;
  // the thick-air band hugging the horizon
  col += uSkyHorizon * exp(-hp * 18.0) * 0.1;
  // warm haze toward the sun (cool glow around the moon at night): a broad
  // multiple-scattering wash, the aureole, and a tight hot corona
  col += uHaze * (pow(sd, 5.0) * 0.17 + pow(sd, 48.0) * 0.8 + pow(sd, 700.0) * 2.4);
  #ifndef AQ_NO_STARS
  col += starField(d);
  #endif
  // lightning lights the whole cloud deck from inside
  col += vec3(0.62, 0.7, 0.95) * uFlash * (0.5 + 0.5 * hp);
  // below the horizon: blend into a deep sea tint so reflections stay grounded
  col = mix(col, vec3(0.06, 0.2, 0.3) * uLight, smoothstep(0.0, -0.25, h));
  return col;
}

// ---- the cloud deck: one noise field shared by the sky, its reflection in
// the sea and the shadows drifting across water and islands
const float AQ_CLOUD_ALT = ${CLOUD.base.toFixed(1)};
// the weather's cloud cover as a threshold on the cloud field: calibrated so
// a clear day keeps about a tenth of the sky, fair weather a quarter, a
// cloudy one two thirds, and a storm closes it completely
float cloudLo() {
  float c = uCloudCover;
  float c4 = c * c * c * c;
  return 0.89 - c * 0.7 - c4 * c4 * c4 * c4 * 0.5;
}
// The cloud field, as fair-weather cumulus really sit in the sky: weather
// systems a couple of kilometres across that gather clouds in some quarters
// and leave wide blue gaps in others, one rounded heap per Worley cell (about
// 600 m apart), and billows that lump each heap into cauliflower. The sky,
// its reflection and the shadows on sea and islands all read this one field.
// Above cloudLo() there is cloud; how far above sets how high it heaps.
float cloudMix(float sys, float cell, float bil) {
  return cell * 0.5 + (sys - 0.5) * 1.6 + (bil - 0.5) * 0.55 + 0.25;
}
float cloudField(vec2 uv) {
  return cloudMix(
    texture(uNoiseTex, uv * ${CLOUD.sys[0]} + vec2(${CLOUD.sys[1]}, ${CLOUD.sys[2]})).r,
    1.0 - texture(uNoiseTex, uv * ${CLOUD.cell[0]} + vec2(${CLOUD.cell[1]}, ${CLOUD.cell[2]})).b,
    texture(uNoiseTex, uv * ${CLOUD.bil[0]} + vec2(${CLOUD.bil[1]}, ${CLOUD.bil[2]})).r);
}
// 0 at a cloud's rim .. 1 at its core
float heapK(float n, float lo) {
  return clamp((n - lo) * 3.3, 0.0, 1.0);
}
// How tall the heaps stand above their flat base (m): fair-weather cumulus
// tower, a grey day flattens them into rolls, a storm piles the deck high.
float heapTall() {
  return mix(480.0, 280.0, smoothstep(0.45, 0.9, uCloudCover)) + uStorm * 520.0;
}
// where the deck straight above ground point xz casts its shadow from
vec2 cloudGroundUv(vec2 xz) {
  return (xz - uSunDir.xz / max(uSunDir.y, 0.2) * AQ_CLOUD_ALT) * 0.0011 + uCloudOffset;
}
// cloud-texture coordinates where a ray from p along d meets the deck at
// altitude alt; every slice of a column maps to the patch of sea it shades
vec2 cloudUv(vec3 p, vec3 d, float alt, out float dist) {
  dist = (alt - p.y) / max(d.y, 0.012);
  return cloudGroundUv(p.xz + d.xz * dist);
}
// the cloud deck where a reflected ray meets its base: x coverage, y thickness, z sunlight
vec3 cloudSampleLite(vec2 uv) {
  float lo = cloudLo();
  float dn = cloudField(uv);
  return vec3(smoothstep(lo, lo + 0.06, dn), smoothstep(lo, lo + 0.2 + uCloudCover * 0.2, dn), 0.6);
}
// Lit cloud seen along d, for the sea's mirror and the sky's light: sunny
// where thin, sinking to a blue-grey belly lit only by the sky where thick;
// toward the sun the whole deck takes a silver forward-scattered rim.
vec3 cloudColor(vec3 c, vec3 d) {
  float mu = dot(d, uSunDir);
  float fwd = pow(max(mu, 0.0), 8.0);
  vec3 sky = mix(uSkyHorizon, uSkyZenith, 0.4) * 0.55 + uLight * 0.32;
  vec3 amb = sky * (1.05 - c.y * (0.5 + uStorm * 0.25));
  float tr = c.z * exp(-c.y * 2.0);
  vec3 sun = uSunColor * tr * (0.3 + 0.22 * max(mu, 0.0) + fwd * 1.1);
  // moonlit cloud is a dim silver-grey against the night, never a glowing sheet
  return (amb + sun) * (1.0 - uNight * 0.55) + vec3(0.62, 0.7, 0.95) * uFlash * 0.6;
}
float cloudShadow(vec2 xz) {
  vec2 uv = xz * 0.0011 + uCloudOffset;
  // the same field the sky draws, so every shadow belongs to a cloud above:
  // crisp at the rim, deepest under the tall cores
  float n = cloudField(uv);
  // coverage slides the threshold: a few puffs on a clear day, a solid deck in a storm
  float lo = cloudLo();
  float s = 1.0 - smoothstep(lo - 0.01, lo + 0.05, n) * (0.34 + 0.18 * smoothstep(lo, lo + 0.25, n));
  // the little low puffs drifting between you and the sun
  if (uLowCloudXf.w > 0.0) {
    vec2 q = (xz - uLowCloudXf.xy) * uLowCloudXf.z;
    float e = max(abs(q.x), abs(q.y));
    float lc = texture(uLowCloudTex, q + 0.5).r * (1.0 - smoothstep(0.42, 0.5, e));
    s *= 1.0 - lc * uLowCloudXf.w;
  }
  return s;
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

// Lays the equipped vault skin over the surface. Hull planking is masked by
// the alpha of its relief map (painted strakes yes, wale, gunports and bottom
// no); woodwork by a flag in its vertex colour; sails only where the bare
// cloth shows, so emblems and accent stripes stay on top.
const GLSL_SKIN_FRAGMENT = /* glsl */ `
#if defined(AQ_SKIN) && AQ_SKIN == 3
  // upgrade sails: find the bare canvas before a skin repaints it
  float pcCloth = 0.0;
  vec3 pcEmis = vec3(0.0);
  float pcMetal = 0.0;
  float pcRough = 0.5;
  float pcAmt = 0.0;
  if (uPartSail.x > 0.5) {
    vec3 pr = diffuseColor.rgb / max(uSkinCloth, vec3(0.02));
    float pm = (pr.r + pr.g + pr.b) / 3.0;
    float psp = (max(pr.r, max(pr.g, pr.b)) - min(pr.r, min(pr.g, pr.b))) / max(pm, 0.05);
    pcCloth = (1.0 - smoothstep(0.1, 0.24, psp)) * smoothstep(0.5, 0.66, pm) * (1.0 - smoothstep(1.3, 1.5, pm));
  }
#endif
#ifdef AQ_SKIN
  vec3 skEmis = vec3(0.0);
  float skAmt = 0.0;
  float skMetal = 0.0;
  float skRough = 0.5;
  if (uSkin > 0.5) {
    vec2 skp = vec2(0.0);
    float skMask = 0.0;
    float skShade = 1.0;
    #if AQ_SKIN == 1
      vec3 skn = normalize(vSkinN);
      skp = abs(skn.x) >= abs(skn.z) ? vSkinP.zy : vSkinP.xy;
      #ifdef USE_NORMALMAP
        skMask = texture2D(normalMap, vNormalMapUv).a;
      #endif
    #elif AQ_SKIN == 2
      vec3 skn = abs(normalize(vSkinN));
      skp = skn.y > max(skn.x, skn.z) ? vSkinP.zx : (skn.x >= skn.z ? vSkinP.zy : vSkinP.xy);
      skMask = vSkinW;
    #else
      #ifdef USE_MAP
        skp = vec2(vMapUv.x * 6.0, (1.0 - vMapUv.y) * 7.0);
      #endif
      vec3 skr = diffuseColor.rgb / max(uSkinCloth, vec3(0.02));
      float skMean = (skr.r + skr.g + skr.b) / 3.0;
      float skSpread = (max(skr.r, max(skr.g, skr.b)) - min(skr.r, min(skr.g, skr.b))) / max(skMean, 0.05);
      skMask = (1.0 - smoothstep(0.1, 0.24, skSpread)) * smoothstep(0.5, 0.66, skMean) * (1.0 - smoothstep(1.3, 1.5, skMean)) * uSkinP.y;
      skShade = clamp(skMean, 0.6, 1.1);
    #endif
    float skNdv = abs(dot(normalize(vNormal), normalize(vViewPosition)));
    vec3 skCol = aqSkin(skp, skNdv, uTime, AQ_SKIN == 3 ? 1.0 : 0.0, skEmis, skMetal, skRough);
    diffuseColor.rgb = mix(diffuseColor.rgb, skCol * skShade, skMask);
    // glowing skins come alive after dark
    skEmis *= skMask * (0.55 + uNight * 0.9);
    skAmt = skMask;
  }
#endif
#if defined(AQ_SKIN) && AQ_SKIN == 3
  if (uPartSail.x > 0.5) {
    vec2 pcUv = vec2(0.5);
    #ifdef USE_MAP
      pcUv = vMapUv;
    #endif
    aqSailPart(pcUv, uTime + uPartSail.w, pcCloth, diffuseColor.rgb, pcEmis, pcMetal, pcRough, pcAmt);
  }
#endif
`;

/**
 * Aerial perspective. Needs uFogColor and uFogRange declared and GLSL_ATMOS
 * included first. Distant things don't turn grey, they sink into the colour
 * of the air in front of them: the horizon sky, warm toward the sun and cool
 * blue away from it, thickest low over the sea so peaks stand out crisply.
 */
export const GLSL_AERIAL = /* glsl */ `
vec3 hazeColor(vec3 d) {
  float mu = dot(normalize(vec3(d.x, max(d.y, 0.0) * 0.4, d.z) + vec3(0.0, 1e-4, 0.0)), uSunDir);
  float sd = max(mu, 0.0);
  return uFogColor * (0.94 + 0.08 * mu * mu) + uHaze * (pow(sd, 5.0) * 0.26 + pow(sd, 40.0) * 0.3);
}
float aerialAt(float dist, float y) {
  float near = uFogRange.x * 0.8;
  float r = max(dist - near, 0.0) / max(uFogRange.y - near, 1.0);
  float a = 1.0 - exp(-r * r * 2.2 - r * 0.5);
  a *= mix(1.0, 0.72, smoothstep(12.0, 170.0, y));
  return max(a, mistAt(dist));
}
`;

export interface PatchOptions {
  caustics?: boolean;
  clouds?: boolean;
  detail?: boolean;
  sway?: number; // vegetation sway amplitude (instanced)
  foliage?: boolean; // thin leaves: sunlight bleeds through to the shaded side
  fade?: number; // small instanced props shrink away beyond this distance (m, grows with camera height)
  sail?: boolean; // billowing sails
  flag?: boolean; // waving flags (uv.x along length)
  damage?: boolean; // battle damage (holes, scorch, torn canvas, wreck split)
  cut?: boolean; // damage holes cut clean through this surface
  solid?: boolean; // never cut by damage holes (inner surfaces)
  skin?: 1 | 2 | 3; // takes a vault skin: 1 hull planking, 2 painted woodwork, 3 sailcloth
  ghost?: boolean; // a ghost ship's timber and canvas: spectral, rotting, half see-through (needs uGhost)
}

/** How each material was patched, so ships can re-patch per-hull damage clones. */
export const patchInfo = new WeakMap<THREE.Material, { opts: PatchOptions; extra: Record<string, THREE.IUniform> }>();

/** Injects the shared atmosphere into a three.js standard / physical material. */
export function patchMaterial<T extends THREE.MeshStandardMaterial>(mat: T, opts: PatchOptions, extraUniforms: Record<string, THREE.IUniform> = {}): T {
  // Only options that are on, in a fixed order: `{ ghost: false }` and no ghost
  // at all are the same shader and must be the same program. A named captain's
  // dressed paint left `ghost` out, so her hull, woodwork and flag compiled
  // copies of their own the moment she sailed in, right after the kill that
  // earned her: a stall of most of a second.
  const on = (Object.keys(opts) as (keyof PatchOptions)[]).filter((k) => opts[k]).sort();
  const key = JSON.stringify(on.map((k) => [k, opts[k]])) + Object.keys(extraUniforms).sort().join(',');
  patchInfo.set(mat, { opts, extra: extraUniforms });
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, globalUniforms, shadowUniforms, extraUniforms);
    const defs: string[] = ['#define AQ_PCSS'];
    if (opts.caustics) defs.push('#define AQ_CAUSTICS');
    if (opts.clouds) defs.push('#define AQ_CLOUDS');
    if (opts.detail) defs.push('#define AQ_DETAIL');
    if (opts.sway) defs.push(`#define AQ_SWAY ${opts.sway.toFixed(3)}`);
    if (opts.foliage) defs.push('#define AQ_FOLIAGE');
    if (opts.fade) defs.push(`#define AQ_FADE ${opts.fade.toFixed(1)}`);
    if (opts.sail) defs.push('#define AQ_SAIL');
    if (opts.flag) defs.push('#define AQ_FLAG');
    if (opts.damage) defs.push('#define AQ_DAMAGE');
    if (opts.cut) defs.push('#define AQ_DMG_CUT');
    if (opts.skin) defs.push(`#define AQ_SKIN ${opts.skin}`);
    if (opts.ghost) defs.push('#define AQ_GHOST');
    const head = defs.join('\n') + '\n';

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `${head}#include <common>
uniform float uTime;
varying vec3 vAqWorld;
#ifdef AQ_SWAY
${GLSL_GUST}
#endif
#ifdef AQ_SAIL
uniform float uSailFill;
uniform float uSailPhase;
uniform float uSailDepth;
attribute float aBillow;
#endif
#ifdef AQ_SKIN
#if AQ_SKIN < 3
varying vec3 vSkinP;
varying vec3 vSkinN;
#endif
#if AQ_SKIN == 2
varying float vSkinW;
#endif
#endif
${GLSL_DAMAGE_VERTEX_PARS}`,
      )
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
#if defined(AQ_SKIN) && AQ_SKIN == 2
  // painted woodwork arrives with +4 on blue to say "this part takes the skin"
  #ifdef USE_COLOR
    vSkinW = step(3.0, vColor.b);
    vColor.b -= vSkinW * 4.0;
  #else
    vSkinW = 0.0;
  #endif
#endif`,
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
#if defined(AQ_SKIN) && AQ_SKIN < 3
  vSkinP = transformed;
  vSkinN = objectNormal;
#endif
#ifdef AQ_SWAY
  {
    // Plants lean with the prevailing wind and get shoved over as gust puffs
    // roll across the island, then spring back once they've passed.
    vec3 ip = vec3(0.0);
    mat3 im = mat3(1.0);
    #ifdef USE_INSTANCING
      ip = instanceMatrix[3].xyz;
      im = mat3(instanceMatrix);
    #endif
    vec3 base = (modelMatrix * vec4(ip, 1.0)).xyz;
    float ph = ip.x * 0.13 + ip.z * 0.17;
    float hgt = max(position.y, 0.0);
    float w = hgt * hgt * AQ_SWAY;
    float g = gustAt(base.xz);
    // wind direction in the instance's own frame (instances only yaw + scale)
    vec2 ld = normalize((transpose(im) * vec3(uWind.x, 0.0, uWind.y)).xz + 1e-5);
    vec2 side = vec2(-ld.y, ld.x);
    float lean = uWind.z * (0.35 + 0.12 * sin(uTime * 0.45 + ph)) + g * 2.4;
    // leaves shiver hardest inside a gust
    float shiver = sin(uTime * 9.0 + ph * 5.0 + position.x * 1.7 + position.z * 1.3) * (0.05 + g * 0.45);
    float sway = sin(uTime * 2.3 + ph * 3.0) * g * 0.35;
    transformed.xz += (ld * lean + side * (shiver * 0.6 + sway)) * w;
    transformed.y -= lean * lean * w * w * 0.5 / max(hgt, 1.0);
  }
#endif
#ifdef AQ_FADE
  {
    // ground cover too small to read far off shrinks smoothly away (no pop),
    // further out the higher the camera flies
    vec3 fp = vec3(0.0);
    #ifdef USE_INSTANCING
      fp = instanceMatrix[3].xyz;
    #endif
    fp = (modelMatrix * vec4(fp, 1.0)).xyz;
    float aqFar = AQ_FADE + max(cameraPosition.y, 0.0) * 0.8;
    transformed *= 1.0 - smoothstep(aqFar * 0.72, aqFar, distance(fp, cameraPosition));
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
${GLSL_GHOST_VERTEX}
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
uniform vec3 uFogColor;
uniform vec2 uFogRange;
#ifdef AQ_FOLIAGE
uniform vec4 uSeeThru;
#endif
uniform vec4 uUnder;
uniform vec3 uUnderColor;
${GLSL_ATMOS}
${GLSL_AERIAL}
${GLSL_DAMAGE_FRAGMENT_PARS}
${GLSL_GHOST_FRAGMENT_PARS}
#ifdef AQ_SKIN
${GLSL_SKIN}
uniform vec3 uSkinCloth;
#if AQ_SKIN == 3
${GLSL_PART_SAIL}
#endif
#if AQ_SKIN < 3
varying vec3 vSkinP;
varying vec3 vSkinN;
#endif
#if AQ_SKIN == 2
varying float vSkinW;
#endif
#endif`,
      )
      .replace(
        '#include <fog_fragment>',
        `{
    vec3 aqView = vAqWorld - cameraPosition;
    if (uUnder.x > 0.5) {
      // beneath the surface: reds drown first along the way to the eye, then
      // everything sinks into the blue-green glow of the water around it,
      // darker the deeper it lies
      float aqD = length(aqView);
      vec3 aqCol = gl_FragColor.rgb * exp(-aqD * vec3(0.16, 0.05, 0.035) * 0.55);
#ifndef AQ_CAUSTICS
      // sunlight thins on its way down to it too (caustic materials already do this in their lighting)
      aqCol *= exp(-max(-vAqWorld.y, 0.0) * vec3(0.1, 0.038, 0.026));
#endif
      vec3 aqWater = uUnderColor * (1.0 - clamp(-vAqWorld.y / 22.0, 0.0, 1.0) * 0.5);
      gl_FragColor.rgb = mix(aqCol, aqWater, 1.0 - exp(-aqD / uUnder.z));
    } else {
      gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor(normalize(aqView)), aerialAt(length(aqView), vAqWorld.y));
    }
  }`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
#ifdef AQ_FOLIAGE
  if (uSeeThru.w > 0.0) {
    // a dithered window through the canopy along the line from the eye to the captain
    vec3 aqAB = uSeeThru.xyz - cameraPosition;
    float aqT = clamp(dot(vAqWorld - cameraPosition, aqAB) / dot(aqAB, aqAB), 0.0, 1.0);
    float aqD = distance(vAqWorld, cameraPosition + aqAB * aqT);
    float aqK = (1.0 - smoothstep(uSeeThru.w * 0.45, uSeeThru.w, aqD)) * (1.0 - smoothstep(0.82, 0.96, aqT));
    if (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) < aqK * 0.88) discard;
  }
#endif`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
${GLSL_SKIN_FRAGMENT}
${GLSL_DAMAGE_FRAGMENT}
${GLSL_GHOST_COLOR}
#ifdef AQ_DETAIL
  {
    vec4 nz = texture(uNoiseTex, vAqWorld.xz * 0.021);
    vec4 nz2 = texture(uNoiseTex, vAqWorld.xz * 0.19);
    diffuseColor.rgb *= 0.86 + nz.g * 0.22 + (nz2.a - 0.5) * 0.12;
  }
#endif
  // rain-soaked surfaces darken (and turn glossy below)
  diffuseColor.rgb *= 1.0 - uWet * 0.26;
`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.42, uWet);
`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
#ifdef AQ_SKIN
  metalnessFactor = mix(metalnessFactor, skMetal, skAmt);
  roughnessFactor = mix(roughnessFactor, skRough, skAmt);
#endif
#if defined(AQ_SKIN) && AQ_SKIN == 3
  metalnessFactor = mix(metalnessFactor, pcMetal, pcAmt);
  roughnessFactor = mix(roughnessFactor, pcRough, pcAmt);
#endif
${GLSL_DAMAGE_SURFACE}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
#ifdef AQ_SKIN
  totalEmissiveRadiance += skEmis;
#endif
#if defined(AQ_SKIN) && AQ_SKIN == 3
  totalEmissiveRadiance += pcEmis * (0.6 + uNight * 0.9);
#endif
${GLSL_DAMAGE_EMISSIVE}
${GLSL_GHOST_EMISSIVE}`,
      )
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>\n${GLSL_GHOST_ALPHA}`)
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
#ifdef AQ_FOLIAGE
  {
    // leaves are thin: the sun glows through to their shaded side, warm and
    // yellow-green, so canopies read as soft lit volumes, never black blobs
    vec3 aqL = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
    float aqBack = clamp(0.25 - dot(normal, aqL), 0.0, 1.0);
    reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * aqBack * vec3(0.05, 0.058, 0.026);
  }
#endif
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

/**
 * Bakes a small PMREM environment from the analytic sky for IBL. The sky
 * changes with the day and the weather, so the bake is cheap (a 64px cube) and
 * reuses the same targets every time: the texture object never changes, so no
 * material ever recompiles.
 */
/** Everything the baked sky depends on, flattened. */
function skySignature(out: number[]): number[] {
  const u = globalUniforms;
  out.length = 0;
  for (const v of [u.uSunDir.value, u.uSunColor.value, u.uSkyZenith.value, u.uSkyHorizon.value, u.uFogColor.value] as (THREE.Vector3 | THREE.Color)[]) {
    if ('r' in v) out.push(v.r, v.g, v.b);
    else out.push(v.x, v.y, v.z);
  }
  for (const k of ['uLight', 'uNight', 'uCloudCover', 'uStorm', 'uMist', 'uHaze'] as const) {
    const v = u[k].value as unknown;
    if (typeof v === 'number') out.push(v);
    else if (v && typeof v === 'object' && 'x' in v) {
      const w = v as THREE.Vector3;
      out.push(w.x, w.y, w.z);
    } else if (v && typeof v === 'object' && 'r' in v) {
      const c = v as THREE.Color;
      out.push(c.r, c.g, c.b);
    }
  }
  return out;
}
const _sig: number[] = [];

/** Prefilter samples per texel for the sky's image-based light. */
const GGX_SAMPLES = 64;

export class SkyEnvironment {
  private scene = new THREE.Scene();
  private cubeRT = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType });
  private cubeCam = new THREE.CubeCamera(0.1, 100, this.cubeRT);
  private pmrem: THREE.PMREMGenerator;
  private rt: THREE.WebGLRenderTarget | null = null;
  /** The sky's inputs at the last bake, and how long ago that was (s). */
  private baked: number[] = [];
  private age = Infinity;

  constructor(private renderer: THREE.WebGLRenderer) {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: globalUniforms,
      defines: { AQ_NO_STARS: 1 },
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
          // the cloud deck, on average: sunny crowns and grey bellies by how much sky it hides
          float cf = smoothstep(0.08, 0.95, uCloudCover) * smoothstep(-0.02, 0.25, d.y);
          vec3 cl = cloudColor(vec3(1.0, 0.3 + 0.6 * uCloudCover, 0.8 - 0.6 * uCloudCover), d);
          c = mix(c, cl, cf * 0.85);
          gl_FragColor = vec4(c * 1.08, 1.0);
        }`,
    });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), mat));
    this.pmrem = new THREE.PMREMGenerator(renderer);
  }

  /**
   * Whether the sky has drifted enough since the last bake to show in the
   * light it casts. The bake is a cube render plus a chain of ~20 blur passes:
   * a regular GPU bump if run blindly a few times a second, while the sun and
   * the weather move far too slowly to see between most of them.
   */
  stale(dt: number): boolean {
    this.age += dt;
    if (this.age > 4) return true;
    const now = skySignature(_sig);
    const was = this.baked;
    if (was.length !== now.length) return true;
    for (let i = 0; i < now.length; i++) if (Math.abs(now[i] - was[i]) > 0.004 * (1 + Math.abs(was[i]))) return true;
    return false;
  }

  /** Re-renders the sky into the environment map. Returns the (stable) texture. */
  update(): THREE.Texture {
    this.age = 0;
    this.baked = skySignature([]);
    const r = this.renderer;
    const prev = r.getRenderTarget();
    this.cubeCam.update(r, this.scene);
    // three's prefilter takes 256 GGX samples per texel per mip, sized for
    // sharp HDR photos. A smooth sky needs a fraction of that, and this runs
    // a few times a second. The filter material only exists once the
    // generator has its targets, so the first bake (behind the loading screen)
    // makes them itself and trims the samples before anything compiles. It
    // used to trim after that bake, and the light version then compiled on
    // the next refresh, seconds into play: a stall of most of a second.
    const pm = this.pmrem as unknown as { _ggxMaterial?: THREE.ShaderMaterial | null; _setSize?(size: number): void; _allocateTargets?(): THREE.WebGLRenderTarget };
    if (!this.rt && pm._setSize && pm._allocateTargets) {
      pm._setSize(this.cubeRT.width);
      this.rt = pm._allocateTargets();
    }
    const trim = () => {
      const ggx = pm._ggxMaterial;
      if (!ggx || ggx.defines.GGX_SAMPLES === GGX_SAMPLES) return false;
      ggx.defines.GGX_SAMPLES = GGX_SAMPLES;
      ggx.needsUpdate = true;
      return true;
    };
    trim();
    this.rt = this.pmrem.fromCubemap(this.cubeRT.texture, this.rt);
    // should three ever stop making them that way: bake again now, still at load
    if (trim()) this.rt = this.pmrem.fromCubemap(this.cubeRT.texture, this.rt);
    r.setRenderTarget(prev);
    return this.rt.texture;
  }
}
