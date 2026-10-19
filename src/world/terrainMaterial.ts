import * as THREE from 'three';
import { patchMaterial } from '../render/environment';

// Per-pixel island shading. The heightfield is only 2 m per vertex, so any
// colour baked into vertices smears into soft blotches up close. Instead every
// layer (seabed, sand, grass, flowers, rock, lava) is resolved per pixel from
// world position, slope and tiling noise, with crisp, slightly rounded edges
// for a clean toy-diorama read, and a procedural bump gives each layer real
// lit relief: wind ripples, grass tufts, layered cliffs and basalt columns.
//
// Per-vertex inputs (from Terrain.buildMeshes):
//   aqKind  (volcanic, atoll, rocky) one-hot of the owning island, 0 = lush
//   aqInfo  (tint -1..1, summit rock 0..1, crater 0..1)
//   aqAO    baked horizon AO
//   aqCanopy  tree cover (0..1): mossy forest floor and leaf litter under crowns

function lin(hex: number): string {
  const c = new THREE.Color(hex).convertSRGBToLinear();
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
}

const PALETTE = /* glsl */ `
const vec3 T_SAND = ${lin(0xf6e9c8)};
const vec3 T_SAND_WARM = ${lin(0xecd29c)};
const vec3 T_SAND_DEEP = ${lin(0xa99a76)};
const vec3 T_SEAGRASS = ${lin(0x3f7a4a)};
const vec3 T_SEAGRASS_DARK = ${lin(0x24543a)};
const vec3 T_CORAL_A = ${lin(0xf27e74)};
const vec3 T_CORAL_B = ${lin(0xffb07a)};
const vec3 T_CORAL_C = ${lin(0xb98ad6)};
const vec3 T_CORAL_D = ${lin(0xf5d06a)};
const vec3 T_GRASS = ${lin(0x6eaa48)};
const vec3 T_GRASS_LIGHT = ${lin(0xa2cc5e)};
const vec3 T_GRASS_DRY = ${lin(0xb4bd56)};
const vec3 T_GRASS_DEEP = ${lin(0x3d8a35)};
const vec3 T_JUNGLE = ${lin(0x2b6a2e)};
const vec3 T_GRASS_GOLD = ${lin(0xc2c062)};
const vec3 T_FOREST_FLOOR = ${lin(0x34562a)};
const vec3 T_LEAF_LITTER = ${lin(0x7a6440)};
const vec3 T_FLOWER_A = ${lin(0xfff6e0)};
const vec3 T_FLOWER_B = ${lin(0xffd34a)};
const vec3 T_FLOWER_C = ${lin(0xff7aa8)};
const vec3 T_ROCK = ${lin(0xaaa192)};
const vec3 T_ROCK_DARK = ${lin(0x7a736a)};
const vec3 T_MOSS = ${lin(0x5d8f3e)};
const vec3 T_SANDSTONE = ${lin(0xdca06a)};
const vec3 T_SANDSTONE_DARK = ${lin(0xb07a58)};
const vec3 T_SANDSTONE_PALE = ${lin(0xf0c896)};
const vec3 T_BASALT = ${lin(0x7d726a)};
const vec3 T_SCORIA = ${lin(0x8d5a44)};
const vec3 T_ASH = ${lin(0x9a9186)};
`;

const FRAG_HEAD = /* glsl */ `
varying vec3 vAqKind;
varying vec3 vAqInfo;
varying float vAqCanopy;
${PALETTE}
float aqBump = 0.0;
float aqRough = 0.94;
vec3 aqLava = vec3(0.0);

// Mikkelsen's derivative bump mapping (unnormalised, so strength is in metres
// and independent of resolution).
vec3 aqPerturb(vec3 surfPos, vec3 surfNorm, float h, float faceDir) {
  vec3 sx = dFdx(surfPos);
  vec3 sy = dFdy(surfPos);
  vec2 dh = vec2(dFdx(h), dFdy(h));
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

const FRAG_ALBEDO = /* glsl */ `
{
  vec2 xz = vAqWorld.xz;
  float h = vAqWorld.y;
  vec3 wn = normalize(vNormal * mat3(viewMatrix));
  float slope = 1.0 - wn.y;
  float kV = vAqKind.x;
  float kA = vAqKind.y;
  float kR = vAqKind.z;
  float kL = clamp(1.0 - kV - kA - kR, 0.0, 1.0);
  float tint = vAqInfo.x;
  // metres covered by one pixel: bump detail smaller than a few pixels is
  // faded out, since derivative bump on it would only show 2x2-pixel grain
  float fp = length(fwidth(xz));

  // four octaves of the shared tiling noise (R big fbm, G mid fbm, B worley, A fine)
  // The tiling noise is value noise, whose square lattice shows through any
  // crisp threshold. A domain warp bends that lattice into organic contours.
  vec4 nW = texture(uNoiseTex, xz * 0.013 + vec2(0.71, 0.29));
  vec2 wxz = xz + (nW.rg - 0.5) * 16.0;
  vec2 rxz = mat2(0.8, -0.6, 0.6, 0.8) * wxz;
  vec4 nM = texture(uNoiseTex, wxz * 0.0071 + vec2(0.31, 0.17)); // ~140 m
  vec4 nS = texture(uNoiseTex, rxz * 0.027);                      // ~37 m
  vec4 nD = texture(uNoiseTex, wxz * 0.12 + vec2(0.53, 0.21));    // ~8 m
  vec4 nF = texture(uNoiseTex, xz * 0.53 + vec2(0.11, 0.77));    // ~2 m

  // ---------------------------------------------------------------- sand
  vec3 sand = mix(T_SAND, T_SAND_WARM, smoothstep(0.38, 0.68, nS.g) * 0.75);
  sand *= 0.94 + nF.a * 0.12;
  // wind-combed ripples: strong in the shallows, a whisper on dry beach
  float rph = dot(xz, vec2(0.79, 0.61)) * 2.4 + (nD.g - 0.5) * 7.0 + (nS.r - 0.5) * 14.0;
  float rFade = 1.0 - smoothstep(0.7, 1.7, fwidth(rph));
  float rip = sin(rph);
  rip = rip * rip * sign(rip) * 0.5 + 0.5;
  float ripMask = rFade * mix(0.25, 1.0, smoothstep(0.3, -0.6, h)) * smoothstep(-7.0, -2.0, h) * (1.0 - smoothstep(1.2, 2.2, h));
  sand *= 1.0 - (1.0 - rip) * 0.07 * ripMask;
  float bSand = rip * 0.05 * ripMask;

  // ---------------------------------------------------------------- seabed
  float depthT = smoothstep(-0.8, -12.0, h);
  vec3 bed = mix(sand, T_SAND_DEEP * (0.92 + nD.a * 0.16), depthT);
  // seagrass meadows: crisp patches with a blade-scale texture
  float gm = smoothstep(0.54, 0.6, nS.g + (nD.a - 0.5) * 0.16 + (nM.r - 0.5) * 0.25)
    * smoothstep(-1.3, -2.8, h) * (1.0 - smoothstep(-8.5, -12.0, h)) * (1.0 - kA * 0.6);
  bed = mix(bed, mix(T_SEAGRASS_DARK, T_SEAGRASS, nF.g * 0.7 + nD.a * 0.3), gm * 0.85);
  // coral heads: rounded worley blobs in a band of warm shallow water
  float coralBand = smoothstep(-0.7, -1.4, h) * (1.0 - smoothstep(-4.0, -5.2, h)) * (1.0 - kR);
  float coralPatch = smoothstep(0.6, 0.66, nM.g + (nS.a - 0.5) * 0.3);
  vec4 nC = texture(uNoiseTex, xz * 0.05 + vec2(0.17, 0.43)); // unwarped so heads stay round    // ~20 m tile, ~1.4 m heads
  float blob = 1.0 - smoothstep(0.22, 0.5, nC.b);
  float coral = blob * coralPatch * coralBand;
  vec3 cc = mix(T_CORAL_A, T_CORAL_B, smoothstep(0.35, 0.65, nS.r));
  cc = mix(cc, T_CORAL_C, smoothstep(0.6, 0.66, nC.r) * 0.6);
  cc = mix(cc, T_CORAL_D, smoothstep(0.62, 0.7, nC.a));
  bed = mix(bed, cc * (0.75 + blob * 0.35), smoothstep(0.05, 0.3, coral) * (1.0 - gm));
  float bBed = coral * 0.35 * (1.0 - smoothstep(0.25, 0.6, fp)) + gm * (nF.g - 0.5) * 0.08 * (1.0 - smoothstep(0.04, 0.1, fp));

  // ---------------------------------------------------------------- grass
  float beachTop = mix(1.2, 1.55, kA) + (nS.g - 0.5) * 0.9 + (nM.r - 0.5) * 0.5;
  float edge = h + (nD.a - 0.5) * 0.4 + (nF.g - 0.5) * 0.08 - beachTop;
  float grassT = smoothstep(-0.05, 0.1, edge);
  vec3 g = mix(T_GRASS, T_GRASS_LIGHT, smoothstep(0.46, 0.66, nS.r + (nD.g - 0.5) * 0.12) * 0.5);
  g = mix(g, T_GRASS_DRY, smoothstep(0.52, 0.66, nM.r + tint * 0.14 + (nD.g - 0.5) * 0.1) * 0.7);
  g = mix(g, T_GRASS_DEEP, smoothstep(0.5, 0.62, 1.0 - nS.g + (nD.r - 0.5) * 0.1) * 0.6);
  float jungle = smoothstep(3.5, 10.0, h) * smoothstep(0.44, 0.58, nM.g + (nD.g - 0.5) * 0.08) * (1.0 - kA);
  g = mix(g, T_JUNGLE, jungle * 0.8);
  // sun-cured grass up on the high lush ridges
  g = mix(g, T_GRASS_GOLD, smoothstep(14.0, 32.0, h + (nM.g - 0.5) * 10.0) * 0.42 * kL);
  // forest floor under the trees: deep moss with drifts of fallen leaves
  float under = smoothstep(0.15, 0.85, vAqCanopy + (nD.g - 0.5) * 0.35) * (1.0 - kA);
  vec3 floorC = mix(T_FOREST_FLOOR, T_LEAF_LITTER, smoothstep(0.52, 0.7, nF.r + (nD.a - 0.5) * 0.3) * 0.75);
  g = mix(g, floorC, under * 0.72);
  // tufts: per-blade-clump light and dark
  float tuft = nF.g;
  g *= 0.9 + tuft * 0.2;
  // a richer, darker lip where turf meets the sand
  float lip = 1.0 - smoothstep(0.1, 0.55, edge);
  g = mix(g, g * vec3(0.78, 0.86, 0.8), lip * 0.5);
  // wildflowers in meadow clearings
  #ifdef AQ_TERRAIN_LITE
  float fl = 0.0;
  #else
  vec4 nFl = texture(uNoiseTex, xz * 0.31 + vec2(0.71, 0.13));
  float fl = (1.0 - smoothstep(0.07, 0.13, nFl.b)) * smoothstep(0.56, 0.64, nS.a) * (1.0 - jungle) * (1.0 - kV) * smoothstep(0.35, 0.9, edge);
  #endif
  vec3 flc = mix(T_FLOWER_A, T_FLOWER_B, step(0.5, nD.r));
  flc = mix(flc, T_FLOWER_C, step(0.6, nM.a) * step(nD.g, 0.5));
  fl *= 1.0 - under;
  g = mix(g, flc, fl * 0.9);
  #ifndef AQ_TERRAIN_LITE
  // wind rolling over the meadows: bright waves of bent blades sweep downwind,
  // brightest where a gust is passing
  vec2 wv = xz * 0.045 - uWind.xy * uTime * 0.22;
  float sheen = texture(uNoiseTex, wv).r * 0.6 + texture(uNoiseTex, wv * 2.3 + 0.37).g * 0.4;
  sheen = smoothstep(0.45, 0.8, sheen) * (0.35 + gustAt(xz) * 0.8);
  g *= 1.0 + sheen * 0.14 * (1.0 - under) * (1.0 - jungle * 0.7);
  #endif
  float bGrass = ((tuft - 0.5) * 0.09 + fl * 0.06) * (1.0 - smoothstep(0.04, 0.1, fp)) - lip * 0.02;
  // sun-bleached dry rim on the sand just below the turf
  float rim = smoothstep(-0.5, -0.05, edge) * (1.0 - grassT);
  vec3 beach = sand * (1.0 + rim * 0.07);

  // ---------------------------------------------------------------- rock
  vec2 ruv = xz + vec2(0.0, h * 0.35); // a little height so stacked ledges differ
  vec4 nR = texture(uNoiseTex, ruv * 0.07 + vec2(0.27, 0.6)); // ~1 m crack cells
  vec4 nR2 = texture(uNoiseTex, ruv * 0.045 + (nW.rg - 0.5) * 0.4 + vec2(0.8, 0.4));
  float strataPh = h * 1.9 + (nR2.g - 0.5) * 4.0;
  float strata = sin(strataPh) * 0.5 + 0.5;
  float sFade = 1.0 - smoothstep(0.8, 1.8, fwidth(strataPh));
  strata = mix(0.5, strata, sFade);
  vec4 nCol = texture(uNoiseTex, ruv * 0.055 + vec2(0.13, 0.91)); // ~1.3 m basalt columns
  float cells = mix(nR.b, nCol.b, kV);
  float crack = smoothstep(0.55, 0.75, cells);

  vec3 rLush = mix(T_ROCK, T_ROCK_DARK, smoothstep(0.4, 0.7, nR2.g) * 0.65);
  rLush *= 1.0 - crack * 0.3;
  rLush = mix(rLush, T_MOSS, smoothstep(0.75, 0.9, wn.y + (nR.g - 0.5) * 0.35) * 0.7);
  vec3 rSand = mix(T_SANDSTONE_DARK, T_SANDSTONE, smoothstep(0.25, 0.75, strata));
  rSand = mix(rSand, T_SANDSTONE_PALE, smoothstep(0.82, 0.95, strata) * 0.7);
  rSand *= 0.92 + nR.a * 0.16;
  vec3 rVol = mix(T_ASH, T_BASALT, smoothstep(6.0, 30.0, h) * 0.7 + 0.3);
  rVol = mix(rVol, T_SCORIA, smoothstep(0.55, 0.7, nR2.r + vAqInfo.y * 0.25) * 0.7);
  rVol *= 0.92 + (1.0 - cells) * 0.14; // basalt column tops catch light
  // streaks of ash washing downhill
  #ifndef AQ_TERRAIN_LITE
  rVol = mix(rVol, T_ASH, smoothstep(0.6, 0.75, texture(uNoiseTex, vec2(xz.x * 0.06 + xz.y * 0.02, h * 0.012)).g) * 0.35);
  #endif
  vec3 rock = rLush * kL + rLush * kA + rSand * kR + rVol * kV;
  float fineFade = 1.0 - smoothstep(0.1, 0.25, fp);
  float bRock = mix(-crack * 0.2 * fineFade + nR.a * 0.08 * fineFade, (strata - 0.5) * 0.28 + nR.a * 0.05 * fineFade, kR)
    + kV * ((1.0 - cells) * 0.22) * (1.0 - smoothstep(0.25, 0.6, fp));

  float rn = (nD.g - 0.5) * 0.26;
  float rockT = smoothstep(0.26, 0.33, slope + rn);
  rockT = max(rockT, smoothstep(0.32, 0.42, vAqInfo.y + rn));
  rockT = max(rockT, kR * smoothstep(0.18, 0.24, slope + rn)); // sandstone isles show more cliff
  rockT *= smoothstep(-6.0, -1.0, h) * 0.6 + 0.4;

  // ---------------------------------------------------------------- compose
  float land = smoothstep(-0.05, 0.05, h);
  vec3 ground = mix(bed, mix(beach, g, grassT), land);
  float bGround = mix(bSand + bBed, mix(bSand, bGrass, grassT), land);
  vec3 albedo = mix(ground, rock, rockT);
  aqBump = mix(bGround, bRock, rockT);
  aqRough = mix(mix(0.96, 0.9, grassT * land), 0.82, rockT);
  // cavities: cracks and crevices darken a touch
  albedo *= 1.0 - crack * rockT * 0.15;

  // volcanic crater: cooling crust over glowing seams, a molten heart
  float crater = vAqInfo.z;
  if (crater > 0.001) {
    float seam = smoothstep(0.62, 0.78, cells) * smoothstep(0.2, 0.8, crater);
    float pool = smoothstep(0.86, 0.97, crater + (nR2.g - 0.5) * 0.12);
    float pulse = 0.75 + 0.25 * sin(uTime * 1.3 + nR2.r * 9.0);
    albedo = mix(albedo, T_BASALT * 0.6, smoothstep(0.0, 0.5, crater));
    albedo = mix(albedo, vec3(0.9, 0.3, 0.06), pool * (1.0 - smoothstep(0.35, 0.6, cells) * 0.85));
    aqLava = vec3(5.0, 1.35, 0.25) * (seam * 0.6 + pool * (1.0 - smoothstep(0.3, 0.62, cells) * 0.9)) * pulse;
    aqBump -= seam * 0.15;
  }

  // Relief only where the sun can rake it: on slopes turned away from the sun
  // a bumped normal would peek into the shadow map at grazing angles and show
  // its texel stair-steps.
  aqBump *= smoothstep(0.02, 0.3, dot(wn, uSunDir));

  diffuseColor.rgb = albedo;
}
`;

/**
 * The per-pixel island ground material. `lite` (low-tier devices) drops the
 * relief bump, wildflowers and ash streaks to save fetches and ALU.
 */
export function createTerrainMaterial(lite = false): THREE.MeshStandardMaterial {
  const mat = patchMaterial(
    new THREE.MeshStandardMaterial({ roughness: 0.94, metalness: 0, envMapIntensity: 0.9 }),
    { caustics: true, clouds: true, wetSand: true },
  );
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey();
  mat.customProgramCacheKey = () => prevKey + (lite ? '|terrain-lite' : '|terrain');
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 aqKind;
attribute vec3 aqInfo;
attribute float aqAO;
attribute float aqCanopy;
varying vec3 vAqKind;
varying vec3 vAqInfo;
varying float vAqAO;
varying float vAqCanopy;`,
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAqKind = aqKind;\nvAqInfo = aqInfo;\nvAqAO = aqAO;\nvAqCanopy = aqCanopy;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${lite ? '#define AQ_TERRAIN_LITE\n' : ''}varying float vAqAO;\n${FRAG_HEAD}\nvoid main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_ALBEDO}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = aqRough;')
      .replace(
        '#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\n#ifndef AQ_TERRAIN_LITE\nnormal = aqPerturb(-vViewPosition, normal, aqBump, faceDirection);\n#endif',
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += aqLava;')
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
  reflectedLight.indirectDiffuse *= vAqAO;
  reflectedLight.indirectSpecular *= vAqAO;
  reflectedLight.directDiffuse *= mix(1.0, vAqAO, 0.45);`,
      );
  };
  return mat;
}
