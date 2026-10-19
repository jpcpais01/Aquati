import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../render/environment';

// One sailor mesh for every crewman on every ship. Each vertex knows which
// bone it rides (aRig.x), which palette slot colours it (aRig.y) and which
// optional group it belongs to (aRig.z: hats, beard, coat, held props). Per
// instance the CPU only uploads a placement matrix, 16 joint angles and a
// style (palette row, hat, prop, flags); the vertex shader poses the body,
// hides the groups that aren't worn and looks colours up in a tiny palette
// texture. The whole crew of the whole sea is one draw call.
//
// Rest frame: feet at y = 0, facing +z, the sailor's left hand on +x.

export const BONE = { hips: 0, chest: 1, head: 2, armL: 3, foreL: 4, armR: 5, foreR: 6, thighL: 7, shinL: 8, thighR: 9, shinR: 10 } as const;

export const TINT = {
  skin: 0,
  shirt: 1,
  sleeve: 2,
  forearm: 3,
  trousers: 4,
  shin: 5,
  boots: 6,
  sash: 7,
  hat: 8,
  hair: 9,
  coat: 10,
  trim: 11,
  wood: 12,
  metal: 13,
  glow: 14,
  cloth: 15,
  stripe: 16,
  dark: 17,
} as const;
export const TINT_SLOTS = 18;

export const HAT = { none: 0, tricorn: 1, bandana: 2, knit: 3, straw: 4 } as const;
export const PROP = { none: 0, rammer: 20, spyglass: 21, mop: 22, bucket: 23, cutlass: 24, linstock: 25 } as const;
export const FLAG = { beard: 1, coat: 2, ponytail: 4 } as const;
const G_BEARD = 10;
const G_COAT = 11;
const G_TAIL = 12;

// joint pivots, mirrored in the shader
const SPINE = new THREE.Vector3(0, 0.98, 0);
const NECK = new THREE.Vector3(0, 1.48, 0);
const SH_X = 0.215;
const SH_Y = 1.4;
const EL_Y = 1.125;
const HIP_X = 0.09;
const HIP_Y = 0.88;
const KNEE_Y = 0.5;

/** Joint angle layout shared with the vertex shader (4 x vec4). */
export const P = {
  spineX: 0, spineY: 1, spineZ: 2, headX: 3,
  headY: 4, armLX: 5, armLZ: 6, elbowL: 7,
  armRX: 8, armRZ: 9, elbowR: 10, legLX: 11,
  kneeL: 12, legRX: 13, kneeR: 14, rootY: 15,
} as const;
export const POSE_SIZE = 16;

function tag(geo: THREE.BufferGeometry, bone: number, tint: number, group = 0, shade?: number): THREE.BufferGeometry {
  const g = geo;
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  if (g.getAttribute('uv1')) g.deleteAttribute('uv1');
  if (g.getAttribute('uv2')) g.deleteAttribute('uv2');
  const pos = g.getAttribute('position');
  const n = pos.count;
  const rig = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    rig[i * 3] = bone;
    rig[i * 3 + 1] = tint;
    rig[i * 3 + 2] = group;
    // a soft baked occlusion: darker toward the deck, full light up top
    const y = pos.getY(i);
    const s = shade ?? 0.74 + 0.26 * THREE.MathUtils.smoothstep(y, 0.05, 1.45);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = s;
  }
  g.setAttribute('aRig', new THREE.BufferAttribute(rig, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (!g.index) {
    const idx = Array.from({ length: n }, (_, i) => i);
    g.setIndex(idx);
  }
  return g;
}

/** A capsule spanning two points. */
function limb(a: THREE.Vector3, b: THREE.Vector3, r: number, radial = 8, caps = 2): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len), caps, radial);
  const dir = b.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.applyQuaternion(q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

function ball(r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, w = 10, h = 7): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, w, h);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return g;
}

function lathe(pts: [number, number][], seg: number): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
  );
}

/** Three-lobed radial pinch for a tricorn: the corners point fore and to either quarter. */
function tricornify(g: THREE.BufferGeometry, amt: number) {
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const th = Math.atan2(x, z);
    const k = 1 + amt * Math.cos(3 * th);
    p.setX(i, x * k);
    p.setZ(i, z * k);
    // the brim walls dip toward each corner
    p.setY(i, p.getY(i) - Math.max(0, Math.cos(3 * th)) * amt * 0.25 * Math.hypot(x, z));
  }
  g.computeVertexNormals();
  return g;
}

export function buildSailorGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, bone: number, tint: number, group = 0, shade?: number) => parts.push(tag(g, bone, tint, group, shade));
  const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

  // ---- body
  const hips = lathe([[0, 0.79], [0.115, 0.8], [0.152, 0.86], [0.16, 0.95], [0.152, 1.02], [0, 1.03]], 12);
  hips.scale(1, 1, 0.74);
  add(hips, BONE.hips, TINT.trousers);
  const sash = new THREE.CylinderGeometry(0.166, 0.162, 0.085, 12);
  sash.scale(1, 1, 0.76);
  sash.translate(0, 0.985, 0);
  add(sash, BONE.hips, TINT.sash);
  add(limb(V(0.118, 0.96, 0.05), V(0.13, 0.83, 0.06), 0.022, 5, 1), BONE.hips, TINT.sash); // knot tail

  const torso = lathe([[0, 0.95], [0.148, 0.96], [0.165, 1.07], [0.186, 1.22], [0.193, 1.33], [0.172, 1.42], [0.11, 1.47], [0.05, 1.49], [0, 1.495]], 12);
  torso.scale(1, 1, 0.66);
  add(torso, BONE.chest, TINT.shirt);

  // ---- head
  add(new THREE.CylinderGeometry(0.052, 0.058, 0.12, 8).translate(0, 1.5, 0), BONE.head, TINT.skin);
  add(ball(0.125, 0, 1.635, 0.006, 0.94, 1.05, 1.0, 14, 10), BONE.head, TINT.skin, 0, 1);
  add(ball(0.03, 0, 1.622, 0.125, 0.8, 1.0, 1.0, 6, 5), BONE.head, TINT.skin, 0, 1); // nose
  for (const sx of [-1, 1]) {
    add(ball(0.016, sx * 0.043, 1.655, 0.113, 1, 1.2, 0.6, 5, 4), BONE.head, TINT.dark, 0, 1); // eyes
    add(ball(0.026, sx * 0.118, 1.63, -0.004, 0.6, 1, 0.9, 5, 4), BONE.head, TINT.skin, 0, 1); // ears
  }
  add(ball(0.131, 0, 1.648, -0.016, 0.97, 1.0, 1.0, 12, 8), BONE.head, TINT.hair, 0, 1); // hair cap
  add(ball(0.1, 0, 1.565, 0.05, 1.0, 0.82, 0.86, 10, 6), BONE.head, TINT.hair, G_BEARD, 0.95);
  add(limb(V(0, 1.6, -0.13), V(0, 1.45, -0.16), 0.032, 6, 2), BONE.head, TINT.hair, G_TAIL, 0.95);

  // ---- arms
  for (const s of [1, -1]) {
    const up = s > 0 ? BONE.armL : BONE.armR;
    const lo = s > 0 ? BONE.foreL : BONE.foreR;
    add(ball(0.066, s * SH_X, SH_Y - 0.01, 0, 1, 1, 1, 8, 6), up, TINT.sleeve);
    add(limb(V(s * (SH_X + 0.004), SH_Y - 0.02), V(s * (SH_X + 0.01), EL_Y + 0.01), 0.056), up, TINT.sleeve);
    add(limb(V(s * (SH_X + 0.01), EL_Y), V(s * (SH_X + 0.01), 0.905), 0.046), lo, TINT.forearm);
    add(ball(0.05, s * (SH_X + 0.01), 0.855, 0.012, 0.78, 1.1, 1.0, 8, 6), lo, TINT.skin, 0, 0.95);
  }

  // ---- legs
  for (const s of [1, -1]) {
    const th = s > 0 ? BONE.thighL : BONE.thighR;
    const sh = s > 0 ? BONE.shinL : BONE.shinR;
    add(limb(V(s * HIP_X, HIP_Y), V(s * (HIP_X + 0.005), KNEE_Y), 0.074), th, TINT.trousers);
    add(limb(V(s * (HIP_X + 0.005), KNEE_Y), V(s * (HIP_X + 0.005), 0.13), 0.058), sh, TINT.shin);
    add(ball(0.066, s * (HIP_X + 0.005), 0.062, 0.045, 0.86, 0.78, 1.65, 8, 6), sh, TINT.boots, 0, 0.8);
  }

  // ---- coat: a flared skirt with a gilded hem
  const coat = lathe([[0, 0.47], [0.24, 0.47], [0.245, 0.5], [0.215, 0.7], [0.19, 0.9], [0.172, 1.04], [0, 1.04]], 12);
  coat.scale(1, 1, 0.8);
  add(coat, BONE.hips, TINT.coat, G_COAT);
  const hem = new THREE.TorusGeometry(0.243, 0.016, 4, 14);
  hem.rotateX(Math.PI / 2);
  hem.scale(1, 1, 0.8);
  hem.translate(0, 0.485, 0);
  add(hem, BONE.hips, TINT.trim, G_COAT, 1);
  for (const s of [1, -1]) {
    const cuff = new THREE.TorusGeometry(0.055, 0.02, 4, 10);
    cuff.rotateX(Math.PI / 2);
    cuff.translate(s * (SH_X + 0.01), 0.93, 0);
    add(cuff, s > 0 ? BONE.foreL : BONE.foreR, TINT.trim, G_COAT, 1);
  }

  // ---- hats
  const crown = ball(0.128, 0, 1.69, -0.01, 1, 0.78, 1, 12, 6);
  add(crown, BONE.head, TINT.hat, HAT.tricorn, 0.9);
  const brim = tricornify(lathe([[0.1, 1.715], [0.2, 1.72], [0.235, 1.74], [0.23, 1.8], [0.215, 1.805], [0.205, 1.76], [0.16, 1.745], [0.1, 1.74]], 18), 0.16);
  add(brim, BONE.head, TINT.hat, HAT.tricorn, 0.95);
  const lace = new THREE.TorusGeometry(0.226, 0.011, 3, 24);
  lace.rotateX(Math.PI / 2);
  lace.translate(0, 1.803, 0);
  add(tricornify(lace, 0.16), BONE.head, TINT.trim, HAT.tricorn, 1);

  const scarf = new THREE.SphereGeometry(0.139, 12, 6, 0, Math.PI * 2, 0, 1.3);
  scarf.rotateX(-0.32);
  scarf.translate(0, 1.645, -0.01);
  add(scarf, BONE.head, TINT.hat, HAT.bandana, 1);
  add(limb(V(0.02, 1.62, -0.135), V(0.06, 1.48, -0.17), 0.026, 5, 1), BONE.head, TINT.hat, HAT.bandana, 0.9);
  add(limb(V(-0.02, 1.62, -0.135), V(-0.05, 1.5, -0.18), 0.024, 5, 1), BONE.head, TINT.hat, HAT.bandana, 0.9);

  add(ball(0.137, 0, 1.68, -0.012, 1, 1.12, 1, 12, 7), BONE.head, TINT.hat, HAT.knit, 1);
  const roll = new THREE.TorusGeometry(0.134, 0.028, 5, 14);
  roll.rotateX(Math.PI / 2 + 0.12);
  roll.translate(0, 1.69, -0.01);
  add(roll, BONE.head, TINT.hat, HAT.knit, 0.92);

  const strawCrown = new THREE.CylinderGeometry(0.105, 0.125, 0.11, 12);
  strawCrown.translate(0, 1.77, -0.008);
  add(strawCrown, BONE.head, TINT.hat, HAT.straw, 1);
  const strawBrim = lathe([[0.11, 1.72], [0.27, 1.69], [0.285, 1.7], [0.27, 1.715], [0.11, 1.745]], 18);
  strawBrim.translate(0, 0, -0.008);
  add(strawBrim, BONE.head, TINT.hat, HAT.straw, 1);
  const band = new THREE.CylinderGeometry(0.122, 0.126, 0.03, 12, 1, true);
  band.translate(0, 1.735, -0.008);
  add(band, BONE.head, TINT.sash, HAT.straw, 1);

  // ---- held props (right hand at x = -0.225, y = 0.855)
  const hx = -(SH_X + 0.01);
  const hy = 0.855;
  // rammer & sponge: a staff along the forearm, sheepskin head on the far end
  add(limb(V(hx, hy - 0.82, 0.02), V(hx, hy + 1.1, 0.02), 0.02, 5, 1), BONE.foreR, TINT.wood, PROP.rammer, 1);
  add(limb(V(hx, hy + 1.06, 0.02), V(hx, hy + 1.22, 0.02), 0.06, 7, 2), BONE.foreR, TINT.cloth, PROP.rammer, 1);
  // spyglass: points back along the rest pose, so it looks forward once raised to the eye
  const tube = new THREE.CylinderGeometry(0.026, 0.036, 0.44, 8);
  tube.rotateX(Math.PI / 2);
  tube.translate(hx + 0.07, hy + 0.04, -0.12);
  add(tube, BONE.foreR, TINT.trim, PROP.spyglass, 1);
  // swab: a pole running down past the hand with a shaggy head
  add(limb(V(hx, hy + 0.25, 0.02), V(hx, hy - 1.15, 0.02), 0.018, 5, 1), BONE.foreR, TINT.wood, PROP.mop, 1);
  add(ball(0.11, hx, hy - 1.2, 0.02, 1, 0.75, 1, 8, 5), BONE.foreR, TINT.cloth, PROP.mop, 0.9);
  // bucket hanging from the fist
  const bucket = new THREE.CylinderGeometry(0.105, 0.085, 0.19, 10);
  bucket.translate(hx, hy - 0.17, 0.02);
  add(bucket, BONE.foreR, TINT.wood, PROP.bucket, 0.9);
  const bh = new THREE.TorusGeometry(0.09, 0.008, 3, 10, Math.PI);
  bh.rotateY(Math.PI / 2);
  bh.translate(hx, hy - 0.08, 0.02);
  add(bh, BONE.foreR, TINT.metal, PROP.bucket, 1);
  // cutlass: blade continues from the fist, gilded guard
  const blade = new THREE.BoxGeometry(0.022, 0.66, 0.055);
  blade.translate(hx, hy - 0.42, 0.03);
  add(blade, BONE.foreR, TINT.metal, PROP.cutlass, 1.15);
  add(ball(0.045, hx, hy - 0.06, 0.02, 1.4, 0.4, 1.4, 8, 4), BONE.foreR, TINT.trim, PROP.cutlass, 1);
  // linstock: a staff held toward the gun with a glowing slow-match at its tip
  add(limb(V(hx, hy + 0.18, 0.02), V(hx, hy - 0.95, 0.02), 0.017, 5, 1), BONE.foreR, TINT.wood, PROP.linstock, 1);
  add(ball(0.03, hx, hy - 0.99, 0.02, 1, 1.3, 1, 6, 4), BONE.foreR, TINT.glow, PROP.linstock, 1);

  for (const g of parts) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'aRig'].includes(k)) g.deleteAttribute(k);
  const merged = mergeGeometries(parts, false)!;
  merged.computeBoundingSphere();
  return merged;
}

// --------------------------------------------------------------------- shader

const f = (n: number) => n.toFixed(4);

const GLSL_CREW = /* glsl */ `
attribute vec3 aRig;
attribute vec4 aPose0;
attribute vec4 aPose1;
attribute vec4 aPose2;
attribute vec4 aPose3;
attribute vec4 aStyle;

vec3 crX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, c * v.y - s * v.z, s * v.y + c * v.z); }
vec3 crY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z); }
vec3 crZ(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c * v.x - s * v.y, s * v.x + c * v.y, v.z); }

bool crewShown(float g) {
  if (g < 0.5) return true;
  if (g < 9.5) return abs(g - aStyle.y) < 0.5;
  if (g > 19.5) return abs(g - aStyle.z) < 0.5;
  int fl = int(aStyle.w + 0.5);
  if (g < 10.5) return (fl & 1) != 0;
  if (g < 11.5) return (fl & 2) != 0;
  return (fl & 4) != 0;
}

// Forward kinematics, leaf to root, on both the position and its normal.
void crewDeform(inout vec3 p, inout vec3 n) {
  if (!crewShown(aRig.z)) { p = vec3(0.0); return; }
  int b = int(aRig.x + 0.5);
  if (b == 4 || b == 6) {
    bool L = b == 4;
    float e = L ? aPose1.w : aPose2.z;
    vec3 pv = vec3(L ? ${f(SH_X)} : -${f(SH_X)}, ${f(EL_Y)}, 0.0);
    p = pv + crX(p - pv, -e); n = crX(n, -e);
  }
  if (b >= 3 && b <= 6) {
    bool L = b <= 4;
    float sx = L ? aPose1.y : aPose2.x;
    float sz = L ? aPose1.z : -aPose2.y;
    vec3 pv = vec3(L ? ${f(SH_X)} : -${f(SH_X)}, ${f(SH_Y)}, 0.0);
    p = pv + crZ(crX(p - pv, -sx), sz); n = crZ(crX(n, -sx), sz);
  }
  if (b == 2) {
    vec3 pv = vec3(0.0, ${f(NECK.y)}, 0.0);
    p = pv + crY(crX(p - pv, aPose0.w), aPose1.x); n = crY(crX(n, aPose0.w), aPose1.x);
  }
  if (b >= 1 && b <= 6) {
    vec3 pv = vec3(0.0, ${f(SPINE.y)}, 0.0);
    p = pv + crY(crZ(crX(p - pv, aPose0.x), aPose0.z), aPose0.y); n = crY(crZ(crX(n, aPose0.x), aPose0.z), aPose0.y);
  }
  if (b == 8 || b == 10) {
    bool L = b == 8;
    float k = L ? aPose3.x : aPose3.z;
    vec3 pv = vec3(L ? ${f(HIP_X)} : -${f(HIP_X)}, ${f(KNEE_Y)}, 0.0);
    p = pv + crX(p - pv, k); n = crX(n, k);
  }
  if (b >= 7) {
    bool L = b <= 8;
    float a = L ? aPose2.w : aPose3.y;
    vec3 pv = vec3(L ? ${f(HIP_X)} : -${f(HIP_X)}, ${f(HIP_Y)}, 0.0);
    p = pv + crX(p - pv, -a); n = crX(n, -a);
  }
  p.y += aPose3.w;
}
`;

/** Palette rows: one per crewman, TINT_SLOTS texels wide. a > 0 glows, a < 0 stripes with the stripe slot. */
export function createCrewMaterial(palette: THREE.DataTexture): { material: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial } {
  const material = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0, envMapIntensity: 0.85 }), { clouds: true });
  const base = material.onBeforeCompile;
  const uniforms = { uCrewPalette: { value: palette } };
  material.onBeforeCompile = (shader, r) => {
    base.call(material, shader, r);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
${GLSL_CREW}
uniform highp sampler2D uCrewPalette;
varying vec3 vCrewStripe;
varying float vCrewPattern;
varying float vCrewEmit;
varying float vCrewY;`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
  vec3 crewPos = position;
  crewDeform(crewPos, objectNormal);`,
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n  transformed = crewPos;`)
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
  {
    int row = int(aStyle.x + 0.5);
    vec4 pal = texelFetch(uCrewPalette, ivec2(int(aRig.y + 0.5), row), 0);
    vec4 stripe = texelFetch(uCrewPalette, ivec2(${TINT.stripe}, row), 0);
    vCrewStripe = stripe.rgb * vColor.rgb;
    vColor.rgb *= pal.rgb;
    vCrewPattern = max(-pal.a, 0.0);
    vCrewEmit = max(pal.a, 0.0);
    vCrewY = position.y;
  }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vCrewStripe;
varying float vCrewPattern;
varying float vCrewEmit;
varying float vCrewY;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  if (vCrewPattern > 0.0) {
    float st = abs(fract(vCrewY * vCrewPattern) - 0.5) * 2.0;
    diffuseColor.rgb = mix(diffuseColor.rgb, vCrewStripe, smoothstep(0.45, 0.6, st));
  }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  totalEmissiveRadiance += vColor.rgb * vCrewEmit * (0.8 + 0.2 * sin(uTime * 23.0 + vCrewY * 40.0));`,
      );
  };
  const prevKey = material.customProgramCacheKey;
  material.customProgramCacheKey = () => prevKey.call(material) + '|crew';

  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${GLSL_CREW}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n  { vec3 crN = vec3(0.0, 1.0, 0.0); crewDeform(transformed, crN); }`);
  };
  depth.customProgramCacheKey = () => 'crew-depth';
  return { material, depth };
}
