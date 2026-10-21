import * as THREE from 'three';
import { patchMaterial } from '../render/environment';
import { GLSL_SURF, shoreUniforms } from './shore';
import { REGIONS } from './regions';

// Per-pixel island shading. The heightfield is only 2 m per vertex, so any
// colour baked into vertices smears into soft blotches up close. Instead every
// layer (seabed, sand, grass, flowers, rock, lava) is resolved per pixel from
// world position, slope and tiling noise, with crisp, slightly rounded edges
// for a clean toy-diorama read, and a procedural bump gives each layer real
// lit relief: wind ripples, grass tufts, layered cliffs and basalt columns.
// Along the waterline every breaker runs up the beach as a foaming sheet and
// drains back, leaving dark glistening sand that dries between waves.
//
// Per-vertex inputs (from Terrain.buildMeshes):
//   aqKind  (volcanic, atoll, rocky) one-hot of the owning island, 0 = lush
//   aqInfo  (tint -1..1, summit rock 0..1, crater 0..1)
//   aqAO    baked horizon AO
//   aqCanopy  tree cover (0..1): mossy forest floor and leaf litter under crowns
//   aqReef    open-sea coral reef (0..1): a dense living carpet of coral heads
//   aqErode   what the rain carved (Terrain.erode): + bare spur, - green gully
//   aqBiome   archipelago: 0 the home isles, 1 Las Brumas (pink coral sand,
//             jade turf, pale limestone towers streaked grey by the rain)

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
const vec3 T_CORAL_E = ${lin(0xc98f5a)};
const vec3 T_CORAL_F = ${lin(0x7fae8c)};
const vec3 T_RUBBLE = ${lin(0xd9cdb0)};
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
const vec3 T_LIME = ${lin(0xe8d6b2)};
const vec3 T_LIME_GREY = ${lin(0xbfae94)};
const vec3 T_LIME_WARM = ${lin(0xdcaa76)};
const vec3 T_LIME_STAIN = ${lin(0x6e665a)};
const vec3 T_LIME_MOSS = ${lin(0x4f8a3a)};
const vec3 T_BASALT = ${lin(0x7d726a)};
const vec3 T_SCORIA = ${lin(0x8d5a44)};
const vec3 T_ASH = ${lin(0x9a9186)};
const vec3 T_SAND_PINK = ${lin(0xf6d9cf)};
const vec3 T_SAND_ROSE = ${lin(0xe8b4a4)};
const vec3 T_MIST_LIME = ${lin(0xd8d3c6)};
const vec3 T_MIST_LIME_WARM = ${lin(0xd2b48a)};
const vec3 T_MIST_LIME_STAIN = ${lin(0x6c6f66)};
const vec3 T_MIST_LIME_MOSS = ${lin(0x557f45)};
const vec3 T_MIST_LIME_VINE = ${lin(0x3e7034)};
const vec3 T_MIST_LIME_NOTCH = ${lin(0x3a3c36)};
`;

/**
 * The turf: where grass grows and what colour it is, shared by the ground's
 * fragment shader and the grass blades' vertex shader (world/grass.ts), so
 * every blade rises out of ground of exactly its own colour and the meadow
 * ends where the turf does. The caller defines AQ_TEX (texture() in a
 * fragment shader, textureLod() in a vertex shader).
 */
export const GLSL_TURF = /* glsl */ `
${PALETTE}
// four octaves of the shared tiling noise (R big fbm, G mid fbm, B worley, A fine)
// The tiling noise is value noise, whose square lattice shows through any
// crisp threshold. A domain warp bends that lattice into organic contours.
void aqGroundNoise(vec2 xz, out vec4 nW, out vec4 nM, out vec4 nS, out vec4 nD, out vec4 nF) {
  nW = AQ_TEX(uNoiseTex, xz * 0.013 + vec2(0.71, 0.29));
  vec2 wxz = xz + (nW.rg - 0.5) * 16.0;
  vec2 rxz = mat2(0.8, -0.6, 0.6, 0.8) * wxz;
  nM = AQ_TEX(uNoiseTex, wxz * 0.0071 + vec2(0.31, 0.17)); // ~140 m
  nS = AQ_TEX(uNoiseTex, rxz * 0.027);                      // ~37 m
  nD = AQ_TEX(uNoiseTex, wxz * 0.12 + vec2(0.53, 0.21));    // ~8 m
  nF = AQ_TEX(uNoiseTex, xz * 0.53 + vec2(0.11, 0.77));     // ~2 m
}

// metres above the top of the beach (negative: still on the sand)
float aqTurfEdge(float h, float kA, vec4 nM, vec4 nS, vec4 nD, vec4 nF) {
  float beachTop = mix(1.2, 1.55, kA) + (nS.g - 0.5) * 0.9 + (nM.r - 0.5) * 0.5;
  return h + (nD.a - 0.5) * 0.4 + (nF.g - 0.5) * 0.08 - beachTop;
}

float aqJungleAt(float h, float kA, vec4 nM, vec4 nD) {
  return smoothstep(3.5, 10.0, h) * smoothstep(0.44, 0.58, nM.g + (nD.g - 0.5) * 0.08) * (1.0 - kA);
}

// forest floor under the trees
float aqUnderAt(float canopy, float kA, vec4 nD) {
  return smoothstep(0.15, 0.85, canopy + (nD.g - 0.5) * 0.35) * (1.0 - kA);
}

// bare rock: steep ground, bald summits, the sandstone isles' cliffs
float aqRockAt(float h, float slope, float summit, float kR, float erode, float biome, vec4 nD) {
  // spurs go bare a little sooner, gullies hold their green on steeper ground
  float rn = (nD.g - 0.5) * 0.26 + erode * 0.09;
  // (in the mist the jungle clings on to steeper ground)
  float rockT = smoothstep(0.26, 0.33, slope + rn - biome * 0.09);
  rockT = max(rockT, smoothstep(0.32, 0.42, summit + rn));
  rockT = max(rockT, kR * smoothstep(0.18, 0.24, slope + rn));
  return rockT * (smoothstep(-6.0, -1.0, h) * 0.6 + 0.4);
}

// the turf's colour (before the wildflowers and the wind's sheen)
vec3 aqTurfColor(float h, vec3 kind, float tint, float erode, float biome, float jungle, float under, float edge, vec4 nM, vec4 nS, vec4 nD, vec4 nF) {
  float kV = kind.x;
  float kL = clamp(1.0 - kind.x - kind.y - kind.z, 0.0, 1.0);
  vec3 g = mix(T_GRASS, T_GRASS_LIGHT, smoothstep(0.46, 0.66, nS.r + (nD.g - 0.5) * 0.12) * 0.5);
  g = mix(g, T_GRASS_DRY, smoothstep(0.52, 0.66, nM.r + tint * 0.14 + (nD.g - 0.5) * 0.1) * 0.7);
  g = mix(g, T_GRASS_DEEP, smoothstep(0.5, 0.62, 1.0 - nS.g + (nD.r - 0.5) * 0.1) * 0.6);
  // Las Brumas: wetter, bluer jade turf
  g = mix(g, g * vec3(0.74, 1.0, 0.86), biome);
  g = mix(g, T_JUNGLE, jungle * 0.8);
  // sun-cured grass up on the high lush ridges
  g = mix(g, T_GRASS_GOLD, smoothstep(14.0, 32.0, h + (nM.g - 0.5) * 10.0) * 0.42 * kL);
  // the rain's work: deep, damp green down every gully, sunlit and a little
  // drier along the spurs between them, so each hillside reads as ribs
  float gully = smoothstep(-0.05, -0.6, erode + (nD.r - 0.5) * 0.2);
  float spur = smoothstep(0.1, 0.65, erode + (nD.r - 0.5) * 0.2);
  g = mix(g, T_JUNGLE * 0.9, gully * 0.5);
  g = mix(g, mix(T_GRASS_LIGHT, T_GRASS_GOLD, 0.35 + kV * 0.4), spur * 0.32);
  // forest floor under the trees: deep moss with drifts of fallen leaves
  vec3 floorC = mix(T_FOREST_FLOOR, T_LEAF_LITTER, smoothstep(0.52, 0.7, nF.r + (nD.a - 0.5) * 0.3) * 0.75);
  g = mix(g, floorC, under * 0.72);
  // tufts: per-blade-clump light and dark
  g *= 0.9 + nF.g * 0.2;
  // a richer, darker lip where turf meets the sand
  float lip = 1.0 - smoothstep(0.1, 0.55, edge);
  return mix(g, g * vec3(0.78, 0.86, 0.8), lip * 0.5);
}
`;

// Las Brumas lies ~7 km out from the world's origin. Out there a world
// position carries only half a millimetre of precision, which a texture
// coordinate of a few cycles per metre turns into a stepping, crawling grain,
// and whose screen derivatives (the pixel's footprint, the triangle's slope)
// turn to noise. So the vertex shader hands the fragment its position about
// its own archipelago's centre (vAqLocal), where every digit counts.
const LOCAL_ORIGIN = /* glsl */ `vec3(${REGIONS[1].x.toFixed(1)}, 0.0, ${REGIONS[1].z.toFixed(1)})`;

const FRAG_HEAD = /* glsl */ `
varying vec3 vAqLocal;
varying vec3 vAqKind;
varying vec3 vAqInfo;
varying float vAqCanopy;
varying float vAqReef;
varying float vAqErode;
varying float vAqBiome;
#define AQ_TEX(s, uv) texture(s, uv)
${GLSL_TURF}
${GLSL_SURF}
// the swash cycle, as fractions of a wave period: the sheet runs up until
// SW_UP, then drains back until SW_END
#define SW_UP 0.3
#define SW_END 0.82
float aqBump = 0.0;
float aqRough = 0.94;
vec3 aqLava = vec3(0.0);

// world-space screen derivatives of the surface, taken once in uniform control flow
vec3 aqDX = vec3(0.0);
vec3 aqDY = vec3(0.0);

// Stone in the plane of its own face: top-down on a ledge, side-on up a wall.
// Sampled top-down, as the ground is, a sheer cliff smears every crack and
// grain into pixel-thin stripes that run its whole height and crawl as the
// view moves. w are the triplanar weights; the blend is stretched back to the
// noise's own contrast, so cracks don't fade out where two planes meet.
vec4 aqRockTex(vec3 p, vec3 w, float s, vec2 o) {
  vec4 c = vec4(0.0);
  if (w.y > 0.0) c += w.y * textureGrad(uNoiseTex, p.xz * s + o, aqDX.xz * s, aqDY.xz * s);
  if (w.x > 0.0) c += w.x * textureGrad(uNoiseTex, p.zy * s + o + vec2(0.31, 0.53), aqDX.zy * s, aqDY.zy * s);
  if (w.z > 0.0) c += w.z * textureGrad(uNoiseTex, p.xy * s + o + vec2(0.67, 0.19), aqDX.xy * s, aqDY.xy * s);
  return 0.5 + (c - 0.5) * inversesqrt(dot(w, w));
}

// Noise hung on the walls, stretched down them (s: across, down): rain
// stains, creepers and flutes, side-on on whichever way the face looks.
vec4 aqWallTex(vec3 p, vec3 n, vec2 s, vec2 o) {
  vec2 w = n.xz * n.xz + 1e-5;
  w *= w;
  w = max(w / (w.x + w.y) - 0.04, 0.0);
  w /= w.x + w.y;
  vec4 c = vec4(0.0);
  if (w.x > 0.0) c += w.x * textureGrad(uNoiseTex, p.zy * s + o, aqDX.zy * s, aqDY.zy * s);
  if (w.y > 0.0) c += w.y * textureGrad(uNoiseTex, p.xy * s + o + vec2(0.43, 0.29), aqDX.xy * s, aqDY.xy * s);
  return 0.5 + (c - 0.5) * inversesqrt(dot(w, w));
}

// A threshold that widens to what one pixel spans of x, so a crisp edge
// softens into its average with distance instead of sparkling.
float aqStep(float a, float b, float x) {
  float fw = fwidth(x);
  return smoothstep(a - fw, b + fw, x);
}

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
  // A cliff's foot shares its vertex normal with the flat ground below, so the
  // smooth normal fades the wall's lower triangles toward level and the turf
  // climbs it in long green spikes. The triangle's own slope settles it.
  // (Screen derivatives in camera space, turned to world axes: the camera's
  // own coordinates are small near the lens, so they hold their precision
  // where a world position several kilometres out turns them to noise.)
  aqDX = dFdx(-vViewPosition) * mat3(viewMatrix);
  aqDY = dFdy(-vViewPosition) * mat3(viewMatrix);
  vec3 fn = cross(aqDX, aqDY);
  float fSlope = 1.0 - abs(fn.y) * inversesqrt(max(dot(fn, fn), 1e-20));
  slope = max(slope, fSlope * smoothstep(0.5, 0.7, fSlope));
  float kV = vAqKind.x;
  float kA = vAqKind.y;
  float kR = vAqKind.z;
  float kL = clamp(1.0 - kV - kA - kR, 0.0, 1.0);
  float tint = vAqInfo.x;
  // metres covered by one pixel: bump detail smaller than a few pixels is
  // faded out, since derivative bump on it would only show 2x2-pixel grain.
  // (All three axes: up a sheer wall the ground plane's xz barely moves while
  // a pixel spans metres of height.)
  vec3 lp = vAqLocal;
  float fp = length(abs(aqDX) + abs(aqDY));
  // triplanar weights for stone (see aqRockTex)
  vec3 tw = max(abs(wn) - 0.3, 0.0);
  tw *= tw;
  tw /= tw.x + tw.y + tw.z;

  vec4 nW, nM, nS, nD, nF;
  aqGroundNoise(xz, nW, nM, nS, nD, nF);

  // ---------------------------------------------------------------- sand
  vec3 sand = mix(T_SAND, T_SAND_WARM, smoothstep(0.38, 0.68, nS.g) * 0.75);
  // Las Brumas: sand ground from pink coral and shell, rosier in drifts
  sand = mix(sand, mix(T_SAND_PINK, T_SAND_ROSE, smoothstep(0.42, 0.7, nS.g) * 0.7), vAqBiome);
  sand *= 0.94 + nF.a * 0.12;
  // wind-combed ripples: strong in the shallows, a whisper on dry beach
  float rph = dot(lp.xz, vec2(0.79, 0.61)) * 2.4 + (nD.g - 0.5) * 7.0 + (nS.r - 0.5) * 14.0;
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
  // open-sea reefs: the crest is one crowded garden of coral, heads of every
  // shape and colour packed shoulder to shoulder over pale rubble, bleaching
  // toward the shallowest knobs. It reads through the water as a warm mosaic.
  if (vAqReef > 0.01) {
    float rBand = smoothstep(-10.0, -3.5, h);
    vec4 nC2 = texture(uNoiseTex, xz * 0.11 + vec2(0.61, 0.07)); // ~9 m tile, heads under a metre
    float rBlob = 1.0 - smoothstep(0.16, 0.44, nC2.b);
    float rBig = 1.0 - smoothstep(0.2, 0.5, nC.b);
    float heads = max(rBlob, rBig * 0.9);
    float rCover = smoothstep(0.25, 0.5, vAqReef + (nS.a - 0.5) * 0.5 + (nD.g - 0.5) * 0.3) * rBand;
    vec3 rc = mix(T_CORAL_A, T_CORAL_C, smoothstep(0.42, 0.6, nM.a + (nD.r - 0.5) * 0.3));
    rc = mix(rc, T_CORAL_D, smoothstep(0.55, 0.68, nC2.r) * 0.75);
    rc = mix(rc, T_CORAL_E, smoothstep(0.5, 0.62, nD.r) * 0.65);
    rc = mix(rc, T_CORAL_F, smoothstep(0.56, 0.7, nC2.g) * 0.6);
    rc = mix(rc, T_CORAL_B, smoothstep(0.62, 0.72, nC.r) * 0.5);
    rc = mix(rc, vec3(0.86, 0.82, 0.74), smoothstep(-1.3, -0.55, h) * 0.4);
    vec3 rubble = T_RUBBLE * (0.8 + nF.a * 0.3);
    vec3 reefCol = mix(rubble, rc * (0.7 + heads * 0.45), smoothstep(0.1, 0.45, heads));
    bed = mix(bed, reefCol, rCover);
    bBed += rCover * (heads * 0.42 + (nF.a - 0.5) * 0.1) * (1.0 - smoothstep(0.25, 0.6, fp));
  }

  // ---------------------------------------------------------------- grass
  float edge = aqTurfEdge(h, kA, nM, nS, nD, nF);
  float grassT = smoothstep(-0.05, 0.1, edge);
  float jungle = aqJungleAt(h, kA, nM, nD);
  float under = aqUnderAt(vAqCanopy, kA, nD);
  vec3 g = aqTurfColor(h, vAqKind, tint, vAqErode, vAqBiome, jungle, under, edge, nM, nS, nD, nF);
  float tuft = nF.g;
  float lip = 1.0 - smoothstep(0.1, 0.55, edge);
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
  vec2 wv = xz * 0.045 - uWindDrift * 0.22;
  float sheen = texture(uNoiseTex, wv).r * 0.6 + texture(uNoiseTex, wv * 2.3 + 0.37).g * 0.4;
  sheen = smoothstep(0.45, 0.8, sheen) * (0.35 + gustAt(xz) * 0.8);
  g *= 1.0 + sheen * 0.14 * (1.0 - under) * (1.0 - jungle * 0.7);
  #endif
  float bGrass = ((tuft - 0.5) * 0.09 + fl * 0.06) * (1.0 - smoothstep(0.04, 0.1, fp)) - lip * 0.02;
  // sun-bleached dry rim on the sand just below the turf
  float rim = smoothstep(-0.5, -0.05, edge) * (1.0 - grassT);
  vec3 beach = sand * (1.0 + rim * 0.07);

  // ---------------------------------------------------------------- rock
  vec4 nR = aqRockTex(lp, tw, 0.07, vec2(0.27, 0.6)); // ~1 m crack cells
  vec4 nR2 = aqRockTex(lp, tw, 0.045, (nW.rg - 0.5) * 0.4 + vec2(0.8, 0.4));
  // (top-down on purpose: basalt columns stand upright, so they run down the walls)
  vec4 nCol = texture(uNoiseTex, (xz + vec2(0.0, h * 0.35)) * 0.055 + vec2(0.13, 0.91)); // ~1.3 m basalt columns
  float cells = mix(nR.b, nCol.b, kV);
  float crack = aqStep(0.55, 0.75, cells);
  // Las Brumas: limestone parts along upright joints and level beds, so up
  // the walls its cracks run in long verticals, not round cells
  if (vAqBiome > 0.01) {
    float joint = aqStep(0.6, 0.8, aqWallTex(lp, wn, vec2(0.12, 0.028), vec2(0.21, 0.66)).b);
    crack = mix(crack, joint, smoothstep(0.3, 0.6, slope) * vAqBiome);
  }

  vec3 rLush = mix(T_ROCK, T_ROCK_DARK, smoothstep(0.4, 0.7, nR2.g) * 0.65);
  rLush *= 1.0 - crack * 0.3;
  rLush = mix(rLush, T_MOSS, smoothstep(0.75, 0.9, wn.y + (nR.g - 0.5) * 0.35) * 0.7);
  // Karst limestone: pale weathered stone in beds of uneven thickness (a 1D
  // slice of the noise up the face, gently dipping across the isle), warm
  // iron stains in places, dark rain streaks hanging down the walls and moss
  // on every ledge and down the runnels.
  float bedPh = (h + (nR2.g - 0.5) * 2.4 + (nM.b - 0.5) * 6.0 + dot(lp.xz, vec2(0.05, 0.03))) * 0.012;
  vec4 nB = texture(uNoiseTex, vec2(bedPh, 0.37 + tint * 0.1));
  float beds = nB.a * 0.55 + nB.g * 0.45;
  // the thinnest beds (~1.3 m) blur into their average once a pixel spans one
  float bedsT = aqStep(0.3, 0.7, beds);
  vec3 rSand = mix(T_LIME_GREY, T_LIME, smoothstep(0.32, 0.68, nM.g + (nS.r - 0.5) * 0.4));
  rSand = mix(rSand, T_LIME_WARM, smoothstep(0.5, 0.74, nR2.r + (nS.b - 0.5) * 0.3) * (0.45 + 0.3 * tint));
  rSand *= 0.86 + bedsT * 0.22 + nR.a * 0.06;
  float streak = 0.0;
  #ifndef AQ_TERRAIN_LITE
  // streaks hang down the face, side-on to it
  streak = aqWallTex(lp, wn, vec2(0.21, 0.007), vec2(0.13, 0.57)).a * 0.55 + aqWallTex(lp, wn, vec2(0.084, 0.007), vec2(0.71, 0.2)).g * 0.45;
  streak = aqStep(0.5, 0.7, streak) * smoothstep(0.3, 0.6, slope);
  rSand = mix(rSand, T_LIME_STAIN, streak * 0.32);
  #endif
  rSand = mix(rSand, T_LIME_MOSS, clamp(smoothstep(0.58, 0.8, wn.y + (nR.g - 0.5) * 0.3) * 0.8 + smoothstep(-0.2, -0.75, vAqErode) * 0.35, 0.0, 0.85));
  vec3 rVol = mix(T_ASH, T_BASALT, smoothstep(6.0, 30.0, h) * 0.7 + 0.3);
  rVol = mix(rVol, T_SCORIA, smoothstep(0.55, 0.7, nR2.r + vAqInfo.y * 0.25) * 0.7);
  rVol *= 0.92 + (1.0 - cells) * 0.14; // basalt column tops catch light
  // weathered, ashy spurs between dark, damp ravines
  rVol *= 0.88 + smoothstep(-0.6, 0.6, vAqErode) * 0.24;
  // streaks of ash washing downhill
  #ifndef AQ_TERRAIN_LITE
  rVol = mix(rVol, T_ASH, smoothstep(0.6, 0.75, texture(uNoiseTex, vec2(xz.x * 0.06 + xz.y * 0.02, h * 0.012)).g) * 0.35);
  #endif
  vec3 rock = rLush * kL + rLush * kA + rSand * kR + rVol * kV;
  float bLime = 0.0;
  if (vAqBiome > 0.01) {
    // Limestone as Ha Long has it: pale cream-grey stone, cooler in the shade
    // of the walls, warm where it broke away not long ago; long grey-black rain
    // stains hanging down from every lip; moss on each ledge, creepers in
    // tongues down the walls, and solution flutes (the rain's own runnels)
    // fluting every face. All of it hung side-on on the walls (aqWallTex).
    vec4 sW = aqWallTex(lp, wn, vec2(0.11, 0.0065), vec2(0.17, 0.39));
    vec4 sF = aqWallTex(lp, wn, vec2(0.045, 0.004), vec2(0.58, 0.12));
    float stain = aqStep(0.5, 0.74, sW.g * 0.7 + sF.r * 0.3 + (nR.a - 0.5) * 0.16);
    // the broad stains: whole curtains of darker stone where water runs most
    float curtain = smoothstep(0.48, 0.7, sF.g + (nM.b - 0.5) * 0.3);
    vec3 lime = mix(T_MIST_LIME, T_MIST_LIME * vec3(0.9, 0.93, 0.96), smoothstep(0.35, 0.7, nR2.g));
    lime = mix(lime, T_MIST_LIME_WARM, bedsT * 0.32);
    // iron-ochre where a slab broke away
    lime = mix(lime, T_MIST_LIME_WARM, aqStep(0.6, 0.76, nR2.r + (nS.g - 0.5) * 0.35) * 0.6);
    lime = mix(lime, T_MIST_LIME_STAIN, max(stain * 0.6, curtain * 0.34));
    lime *= 1.0 - crack * 0.18;
    lime = mix(lime, T_MIST_LIME_MOSS, smoothstep(0.55, 0.8, wn.y + (nR.g - 0.5) * 0.4) * 0.85);
    // creepers and ferns hang in long tongues down the walls from every ledge
    float vine = aqWallTex(lp, wn, vec2(0.09, 0.012), vec2(0.41, 0.83)).g + (nS.r - 0.5) * 0.35 + (nD.a - 0.5) * 0.2;
    float vineT = aqStep(0.56, 0.68, vine) * smoothstep(3.0, 9.0, h);
    lime = mix(lime, mix(T_MIST_LIME_VINE, T_MIST_LIME_MOSS, nD.g * 0.6), vineT * 0.9);
    // the sea gnaws a dark, dripping notch into the foot of every wall
    float notch = (1.0 - smoothstep(1.4, 2.6, h + (nS.b - 0.5) * 1.2)) * smoothstep(-0.8, 0.2, h);
    lime = mix(lime, T_MIST_LIME_NOTCH, notch * 0.8);
    // solution flutes: runnels a hand to an arm's span across, down every
    // steep face, the bigger ones out to where a pixel spans a few of them
    #ifndef AQ_TERRAIN_LITE
    float wall = smoothstep(0.35, 0.7, slope);
    float flF = aqWallTex(lp, wn, vec2(0.6, 0.03), vec2(0.73, 0.61)).g;
    // (the big runnels are the stains' own: the rain darkens the grooves it cut)
    float flC = 1.0 - sW.g;
    bLime = wall * (1.0 - vineT * 0.7) * ((flF - 0.5) * 0.09 * (1.0 - smoothstep(0.04, 0.12, fp)) + (flC - 0.5) * 0.3 * (1.0 - smoothstep(0.2, 0.6, fp)))
      + vineT * 0.08 * (1.0 - smoothstep(0.1, 0.3, fp));
    lime *= 1.0 + ((flF - 0.5) * 0.12 * (1.0 - smoothstep(0.04, 0.12, fp)) + (flC - 0.5) * 0.08) * wall;
    #endif
    rock = mix(rock, lime, vAqBiome * (1.0 - kV));
  }
  float fineFade = 1.0 - smoothstep(0.1, 0.25, fp);
  float bRock = mix(-crack * 0.2 * fineFade + nR.a * 0.08 * fineFade, (beds - 0.5) * 0.2 * (1.0 - smoothstep(0.25, 0.7, fp)) - crack * 0.1 * fineFade + nR.a * 0.06 * fineFade - streak * 0.03, kR)
    + kV * ((1.0 - cells) * 0.22) * (1.0 - smoothstep(0.25, 0.6, fp));
  bRock += bLime * vAqBiome * (1.0 - kV);

  float rockT = aqRockAt(h, slope, vAqInfo.y, kR, vAqErode, vAqBiome, nD);

  // ---------------------------------------------------------------- compose
  float land = smoothstep(-0.05, 0.05, h);
  vec3 ground = mix(bed, mix(beach, g, grassT), land);
  float bGround = mix(bSand + bBed, mix(bSand, bGrass, grassT), land);
  vec3 albedo = mix(ground, rock, rockT);
  aqBump = mix(bGround, bRock, rockT);
  aqRough = mix(mix(0.96, 0.9, grassT * land), 0.82, rockT);
  // cavities: cracks and crevices darken a touch
  albedo *= 1.0 - crack * rockT * 0.15;

  // ---------------------------------------------------------------- underfoot
  // What a captain on foot sees at their boots: grains and bits of shell and
  // pebble in the sand, soil and dry thatch between the turf's blades, fallen
  // leaves on the forest floor, and stone that is granular, finely cracked and
  // freckled with lichen. Only within a few dozen metres of the eye (from the
  // follow view the whole branch is skipped), and its relief only where a
  // pixel is no more than a centimetre or two across.
  #ifndef AQ_TERRAIN_LITE
  float nearW = 1.0 - smoothstep(0.045, 0.13, fp);
  if (nearW > 0.0 && h > -3.0) {
    // (in the plane of the face: on a wall, top-down grain would be stripes)
    vec4 u1 = aqRockTex(lp, tw, 1.9, vec2(0.37, 0.81));   // 53 cm tile: ~4 cm cells
    vec4 u2 = aqRockTex(lp, tw, 0.71, vec2(0.62, 0.05));  // 1.4 m tile: ~10 cm cells
    vec4 u3 = aqRockTex(lp, tw, 5.3, vec2(0.19, 0.44));   // 19 cm tile: millimetre grain
    // (millimetre grain: its relief only once a pixel is well under a grain across)
    float fineB = 1.0 - smoothstep(0.0015, 0.005, fp);
    float midB = 1.0 - smoothstep(0.006, 0.026, fp);
    float turfW = grassT * land * (1.0 - rockT);
    float sandW = (1.0 - grassT * land) * (1.0 - rockT);
    float floorW = turfW * under;
    turfW *= 1.0 - under;
    float grain = (u3.a - 0.5) * 2.0;
    // sand: fine grain, and grit, shell and coral bits in drifts
    float grit = (1.0 - smoothstep(0.08, 0.15, u1.b)) * smoothstep(0.56, 0.7, u2.g + (nD.a - 0.5) * 0.4);
    vec3 gritC = mix(vec3(0.66, 0.54, 0.4), vec3(1.1, 1.07, 1.0), step(0.45, u1.r));
    gritC = mix(gritC, T_CORAL_B * 1.1, step(0.62, u2.r) * max(vAqBiome, kA));
    vec3 sandM = mix(albedo * (1.0 + grain * 0.07), albedo * gritC, grit * 0.7);
    // turf: the soil showing between clumps, sun-dried thatch, blade-scale grain
    vec2 tq = mat2(0.96, 0.28, -0.28, 0.96) * lp.xz;
    vec2 tqs = vec2(2.6, 0.45);
    float thatch = textureGrad(uNoiseTex, tq * tqs + vec2(0.71, 0.33), (mat2(0.96, 0.28, -0.28, 0.96) * aqDX.xz) * tqs, (mat2(0.96, 0.28, -0.28, 0.96) * aqDY.xz) * tqs).a;
    float soil = smoothstep(0.55, 0.85, u2.b + (u1.a - 0.5) * 0.3);
    vec3 turfM = albedo * (1.0 + grain * 0.07);
    turfM = mix(turfM, albedo * vec3(0.62, 0.5, 0.36), soil * 0.4 * (1.0 - vAqBiome * 0.4));
    turfM = mix(turfM, T_GRASS_GOLD * 0.9, smoothstep(0.62, 0.78, thatch) * 0.35);
    // forest floor: a litter of fallen leaves, ochre, brown and old green
    float leaf = 1.0 - smoothstep(0.24, 0.36, u2.b);
    vec3 leafC = mix(T_LEAF_LITTER, vec3(0.32, 0.12, 0.04), smoothstep(0.4, 0.6, u1.r));
    leafC = mix(leafC, T_FOREST_FLOOR * 1.2, smoothstep(0.55, 0.7, u2.r));
    vec3 floorM = mix(albedo * (1.0 + grain * 0.1), leafC * (0.85 + u3.a * 0.3), leaf * 0.7);
    // rock: grain, a web of fine cracks, lichen rosettes (none on fresh basalt)
    // (edges no sharper than a pixel: the derivative bump would show them as 2x2 steps)
    float fcrack = aqStep(0.62, 0.8, u1.b);
    // (Las Brumas' limestone walls: hairline fissures running down the face, the rain's karren)
    if (vAqBiome > 0.01) fcrack = mix(fcrack, aqStep(0.6, 0.8, aqWallTex(lp, wn, vec2(1.3, 0.28), vec2(0.52, 0.17)).b), smoothstep(0.3, 0.6, slope) * vAqBiome);
    // (ragged rosettes: the cells broken up by the fine noise)
    float lichen = (1.0 - smoothstep(0.16, 0.36, u2.b + (u1.a - 0.5) * 0.35)) * smoothstep(0.56, 0.7, u2.g + (nR.g - 0.5) * 0.3) * (1.0 - kV) * smoothstep(0.2, 0.6, wn.y + 0.4);
    vec3 lichC = albedo * mix(vec3(1.25, 1.3, 0.95), vec3(1.4, 1.05, 0.6), kR * step(0.5, u1.g));
    vec3 rockM = albedo * (1.0 + grain * 0.06 * midB) * (1.0 - fcrack * 0.24);
    rockM = mix(rockM, lichC * (0.9 + u3.a * 0.2), lichen * 0.45);
    // volcanic: gas bubbles frozen into the stone
    rockM *= 1.0 - kV * (1.0 - smoothstep(0.06, 0.14, u1.b)) * 0.45;
    // (the turf's own detail only right underfoot: further out the blades say it)
    turfM = mix(albedo, turfM, 1.0 - smoothstep(0.015, 0.05, fp));
    vec3 near = sandM * sandW + turfM * turfW + floorM * floorW + rockM * rockT;
    albedo = mix(albedo, near, nearW);
    aqBump += (sandW * (grit * 0.012 + grain * 0.0015 * fineB)
      + turfW * ((u1.a - 0.5) * 0.02 - soil * 0.008)
      + floorW * (leaf * 0.006 + (u1.a - 0.5) * 0.01)
      + rockT * (grain * 0.003 * fineB - fcrack * 0.012 + lichen * 0.002 - kV * (1.0 - smoothstep(0.06, 0.14, u1.b)) * 0.01)) * midB;
    aqRough = mix(aqRough, aqRough * (0.92 + u3.a * 0.16), nearW);
  }
  #endif

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

  // ---------------------------------------------------------------- swash
  // Each breaker that reaches the beach runs on up the sand as a thin sheet,
  // its foaming front scalloped into tongues, slows, stops and drains back.
  // It leaves dark, glossy sand that dries out between waves and a stranded
  // line of foam that pops away. The phase is the ocean's own (shore.ts), so
  // the sheet sets off the moment the whitewater reaches the waterline.
  float wetSand = 1.0 - smoothstep(-0.06, 0.04, h); // under the sea it is all wet
  float film = 0.0;
  float gloss = 0.0;
  float sFoam = 0.0;
  if (h > -0.1 && h < 2.6) {
    float reach = mix(0.22, 1.0, shoreField(xz).a);
    float psi = surfPhase(xz, 0.0);
    float sn = floor(psi);
    float su = psi - sn;
    // the band the bigger sets reach stays damp
    wetSand = max(wetSand, (1.0 - smoothstep(0.0, uSurf.y * reach * 1.6 + 0.12, h)) * 0.38);
    // this wave and the one before it (still draining, or its sand still wet)
    for (int c = 0; c < 2; c++) {
      float idx = sn - float(c);
      float uc = su + float(c);
      float lobe = texture(uNoiseTex, xz * 0.012 + vec2(idx * 0.41, idx * 0.23)).b;
      float R = uSurf.y * reach * surfVar(xz, idx) * (0.62 + 0.6 * (1.0 - lobe));
      if (h >= R) continue;
      R = max(R, 1e-3);
      float q = sqrt(max(1.0 - max(h, 0.0) / R, 0.0));
      float ua = SW_UP * (1.0 - q);
      float ul = SW_UP + (SW_END - SW_UP) * q;
      if (uc < ua) continue;
      if (uc < ul) {
        // under the sheet: how far below its leading edge, in metres of height
        float x = (uc - SW_UP) / (SW_END - SW_UP);
        float front = uc < SW_UP ? R * (1.0 - (1.0 - uc / SW_UP) * (1.0 - uc / SW_UP)) : R * (1.0 - x * x);
        float d = front - h;
        film = max(film, smoothstep(0.0, 0.03, d));
        wetSand = 1.0;
        float ta = (uc - ua) * SURF_T;
        float edgeBand = 1.0 - smoothstep(0.0, 0.02 + R * 0.09, d);
        sFoam = max(sFoam, uc < SW_UP ? max(edgeBand, 0.62 * exp(-ta * 1.1)) : max(edgeBand * 0.4, 0.38 * exp(-ta * 0.6)));
      } else {
        float td = (uc - ul) * SURF_T; // seconds since the water left
        wetSand = max(wetSand, exp(-td * 0.15));
        gloss = max(gloss, exp(-td * 0.9));
        // foam stranded where the sheet stopped
        float strand = mix(0.08, 0.5, smoothstep(0.55 * R, 0.97 * R, h));
        sFoam = max(sFoam, strand * exp(-td * 0.45));
      }
    }
  }
  // under the resting sea the ocean draws the water; here only the sand is wet
  film *= step(0.0, h);
  gloss *= step(0.0, h);
  albedo *= mix(1.0, 0.62, wetSand);
  // the sheet itself: a sliver of clear sea water over the sand
  albedo = mix(albedo, albedo * vec3(0.6, 0.86, 0.9), film * 0.55);
  aqRough = mix(aqRough, 0.38, wetSand * 0.6 * step(0.0, h));
  aqRough = mix(aqRough, 0.05, max(film, gloss * 0.75));
  aqBump *= 1.0 - film * 0.75;
  float sLace = sFoam > 0.002 ? foamCut(foamField(xz), sFoam, fp) : 0.0;
  albedo = mix(albedo, vec3(0.9, 0.92, 0.94), sLace * 0.95);
  aqRough = mix(aqRough, 0.8, sLace);
  aqBump += sLace * 0.012;

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
    { caustics: true, clouds: true },
    shoreUniforms,
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
attribute float aqReef;
attribute float aqErode;
attribute float aqBiome;
varying float vAqBiome;
varying vec3 vAqLocal;
varying vec3 vAqKind;
varying vec3 vAqInfo;
varying float vAqAO;
varying float vAqCanopy;
varying float vAqReef;
varying float vAqErode;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vAqKind = aqKind;
vAqInfo = aqInfo;
vAqAO = aqAO;
vAqCanopy = aqCanopy;
vAqReef = aqReef;
vAqErode = aqErode;
vAqBiome = aqBiome;
vAqLocal = (modelMatrix * vec4(transformed, 1.0)).xyz - ${LOCAL_ORIGIN} * step(0.5, aqBiome);`,
      );
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
