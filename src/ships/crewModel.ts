import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../render/environment';

// One sailor mesh for every crewman on every ship. Each vertex knows which
// bone it rides (aRig.x), which palette slot colours it (aRig.y) and which
// optional group it belongs to (aRig.z: hats, beards, coats, peg legs,
// parrots, held props...). Per instance the CPU only uploads a placement
// matrix, 16 joint angles and a style (palette row, hat, prop, flags); the
// vertex shader poses the body, hides the groups that aren't worn, blinks the
// eyes, ruffles the parrot and looks colours up in a tiny palette texture.
// The whole crew of the whole sea is one draw call.
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
  white: 18,
  pupil: 19,
  parrot: 20,
  wing: 21,
  beak: 22,
  vest: 23,
  plume: 24,
  leather: 25,
} as const;
export const TINT_SLOTS = 26;

export const HAT = { none: 0, tricorn: 1, bandana: 2, knit: 3, straw: 4 } as const;
// group ids: 1-9 hats, 10-29 shown with a flag bit, 30-49 hidden by a flag bit, 50+ held props
export const PROP = { none: 0, rammer: 50, spyglass: 51, mop: 52, bucket: 53, cutlass: 54, linstock: 55, fiddle: 56, mug: 57, pipe: 58 } as const;
const BIT = {
  beard: 0,
  coat: 1,
  ponytail: 2,
  patch: 3,
  earring: 4,
  vest: 5,
  peg: 6,
  parrot: 7,
  boots: 8,
  pistol: 9,
  plume: 10,
  moustache: 11,
  bald: 12,
  belt: 13,
  longhair: 14,
  kerchief: 15,
} as const;
export const FLAG = Object.fromEntries(Object.entries(BIT).map(([k, b]) => [k, 1 << b])) as { [K in keyof typeof BIT]: number };
const SHOWN = (b: number) => 10 + b;
const HIDDEN = (b: number) => 30 + b;

// joint pivots, mirrored in the shader
const SPINE = new THREE.Vector3(0, 0.98, 0);
const NECK = new THREE.Vector3(0, 1.48, 0);
const SH_X = 0.215;
const SH_Y = 1.4;
const EL_Y = 1.125;
const HIP_X = 0.09;
const HIP_Y = 0.88;
const KNEE_Y = 0.5;
/** Toy proportions: everything on the head bone is built at life size, then scaled up about the neck. */
const HEAD_K = 1.14;
const EYE_Y = 1.655;
const EYE_Y_SCALED = NECK.y + (EYE_Y - NECK.y) * HEAD_K;
// the captain's parrot perches on the left shoulder
const PARROT = new THREE.Vector3(SH_X * 0.95, SH_Y + 0.085, -0.02);

/** Joint angle layout shared with the vertex shader (4 x vec4). */
export const P = {
  spineX: 0, spineY: 1, spineZ: 2, headX: 3,
  headY: 4, armLX: 5, armLZ: 6, elbowL: 7,
  armRX: 8, armRZ: 9, elbowR: 10, legLX: 11,
  kneeL: 12, legRX: 13, kneeR: 14, rootY: 15,
} as const;
export const POSE_SIZE = 16;

const _headM = new THREE.Matrix4().makeTranslation(0, NECK.y, 0).multiply(new THREE.Matrix4().makeScale(HEAD_K, HEAD_K, HEAD_K)).multiply(new THREE.Matrix4().makeTranslation(0, -NECK.y, 0));

function tag(geo: THREE.BufferGeometry, bone: number, tint: number, group = 0, shade?: number): THREE.BufferGeometry {
  const g = geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (bone === BONE.head) g.applyMatrix4(_headM);
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

function lathe(pts: [number, number][], seg: number, phiStart = 0, phiLength = Math.PI * 2): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
    phiStart,
    phiLength,
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

/** A tapering tube through a few points. */
function strand(pts: THREE.Vector3[], r0: number, r1: number, radial = 5, segs = 8): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  // TubeGeometry has a fixed radius: rescale each ring about its centre
  const pos = g.getAttribute('position');
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    curve.getPointAt(i / segs, c);
    const r = r0 + (r1 - r0) * (i / segs);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  return g;
}

export function buildSailorGeometry(detail = true): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, bone: number, tint: number, group = 0, shade?: number) => parts.push(tag(g, bone, tint, group, shade));
  const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
  const R = detail ? 1 : 0.7; // radial segment budget
  const seg = (n: number) => Math.max(4, Math.round(n * R));

  // ---- hips, breeches and the untucked shirt tail
  const hips = lathe([[0, 0.79], [0.115, 0.8], [0.152, 0.86], [0.16, 0.95], [0.152, 1.02], [0, 1.03]], seg(12));
  hips.scale(1, 1, 0.74);
  add(hips, BONE.hips, TINT.trousers);
  const tail = lathe([[0.17, 0.86], [0.168, 0.9], [0.158, 0.97], [0.0, 0.975]], seg(12));
  tail.scale(1, 1, 0.76);
  add(tail, BONE.hips, TINT.shirt);
  const sash = new THREE.CylinderGeometry(0.166, 0.162, 0.085, seg(12));
  sash.scale(1, 1, 0.76);
  sash.translate(0, 0.985, 0);
  add(sash, BONE.hips, TINT.sash);
  add(limb(V(0.118, 0.96, 0.05), V(0.13, 0.83, 0.06), 0.022, 5, 1), BONE.hips, TINT.sash); // knot tails
  add(limb(V(0.1, 0.96, 0.07), V(0.095, 0.86, 0.085), 0.018, 5, 1), BONE.hips, TINT.sash);
  // leather belt with a gilded buckle
  const belt = new THREE.CylinderGeometry(0.171, 0.168, 0.045, seg(12), 1, true);
  belt.scale(1, 1, 0.77);
  add(belt.translate(0, 0.935, 0), BONE.hips, TINT.leather, SHOWN(BIT.belt));
  add(new THREE.BoxGeometry(0.06, 0.05, 0.02).translate(0, 0.935, 0.13), BONE.hips, TINT.trim, SHOWN(BIT.belt), 1.1);
  // a flintlock tucked in the sash
  add(limb(V(-0.07, 1.04, 0.13), V(-0.04, 0.9, 0.14), 0.016, 5, 1), BONE.hips, TINT.metal, SHOWN(BIT.pistol), 1);
  add(limb(V(-0.07, 1.04, 0.135), V(-0.13, 1.08, 0.13), 0.022, 5, 1), BONE.hips, TINT.wood, SHOWN(BIT.pistol), 1);

  // ---- torso, open collar and neckerchief
  const torso = lathe([[0, 0.95], [0.148, 0.96], [0.165, 1.07], [0.186, 1.22], [0.193, 1.33], [0.172, 1.42], [0.11, 1.47], [0.05, 1.49], [0, 1.495]], seg(12));
  torso.scale(1, 1, 0.66);
  add(torso, BONE.chest, TINT.shirt);
  add(ball(0.06, 0, 1.415, 0.1, 0.75, 1.25, 0.32, 6, 5), BONE.chest, TINT.skin, 0, 0.95); // the open neck
  for (const sx of [-1, 1]) {
    const flap = new THREE.BoxGeometry(0.075, 0.06, 0.012);
    flap.rotateZ(sx * 0.6);
    flap.rotateX(-0.35);
    add(flap.translate(sx * 0.045, 1.44, 0.105), BONE.chest, TINT.shirt, 0, 1);
  }
  const kerchief = new THREE.TorusGeometry(0.068, 0.022, 4, seg(10));
  kerchief.rotateX(Math.PI / 2 - 0.25);
  add(kerchief.translate(0, 1.47, 0.0), BONE.chest, TINT.sash, SHOWN(BIT.kerchief), 1);
  add(ball(0.04, 0, 1.425, 0.085, 1, 1.3, 0.5, 5, 4), BONE.chest, TINT.sash, SHOWN(BIT.kerchief), 1);
  // waistcoat: the torso again, a size up and open down the front, with brass buttons
  const vest = lathe([[0.155, 1.0], [0.17, 1.07], [0.192, 1.22], [0.2, 1.33], [0.18, 1.42], [0.12, 1.465]], seg(12), 0.42, Math.PI * 2 - 0.84);
  vest.scale(1, 1, 0.68);
  add(vest, BONE.chest, TINT.vest, SHOWN(BIT.vest));
  for (const y of [1.08, 1.17, 1.26]) add(ball(0.013, -0.06, y, 0.128, 1, 1, 0.6, 5, 3), BONE.chest, TINT.trim, SHOWN(BIT.vest), 1.1);

  // ---- head: big friendly eyes, brows, a button nose and a smile
  add(new THREE.CylinderGeometry(0.052, 0.058, 0.12, seg(8)).translate(0, 1.5, 0), BONE.head, TINT.skin);
  add(ball(0.125, 0, 1.635, 0.006, 0.94, 1.05, 1.0, seg(14), seg(10)), BONE.head, TINT.skin, 0, 1);
  add(ball(0.03, 0, 1.618, 0.127, 0.95, 0.9, 1.0, 6, 5), BONE.head, TINT.skin, 0, 0.97); // nose
  for (const sx of [-1, 1]) {
    add(ball(0.024, sx * 0.045, EYE_Y, 0.106, 1, 1.2, 0.55, 6, 5), BONE.head, TINT.white, 0, 1.05);
    add(ball(0.013, sx * 0.045, EYE_Y - 0.003, 0.117, 1, 1.15, 0.6, 5, 4), BONE.head, TINT.pupil, 0, 1);
    add(limb(V(sx * 0.026, 1.69, 0.108), V(sx * 0.066, 1.686 - 0.006, 0.098), 0.008, 3, 1), BONE.head, TINT.hair, 0, 0.9); // brows
    add(ball(0.026, sx * 0.118, 1.63, -0.004, 0.6, 1, 0.9, 5, 4), BONE.head, TINT.skin, 0, 1); // ears
    add(ball(0.02, sx * 0.107, 1.6, 0.03, 0.6, 1.4, 0.8, 5, 4), BONE.head, TINT.hair, 0, 0.95); // sideburns
  }
  const smile = new THREE.TorusGeometry(0.03, 0.0065, 3, 8, Math.PI * 0.8);
  smile.rotateZ(Math.PI * 1.1);
  add(smile.translate(0, 1.585, 0.113), BONE.head, TINT.dark, 0, 1);
  // hair cap (bald pates go without), a long mane for some, beard and moustache
  add(ball(0.131, 0, 1.648, -0.016, 0.97, 1.0, 1.0, seg(12), 8), BONE.head, TINT.hair, HIDDEN(BIT.bald), 1);
  add(ball(0.1, 0, 1.565, 0.05, 1.0, 0.82, 0.86, seg(10), 6), BONE.head, TINT.hair, SHOWN(BIT.beard), 0.95);
  for (const sx of [-1, 1]) add(strand([V(sx * 0.01, 1.605, 0.124), V(sx * 0.04, 1.598, 0.12), V(sx * 0.068, 1.61, 0.105)], 0.013, 0.006, 4, 4), BONE.head, TINT.hair, SHOWN(BIT.moustache), 0.9);
  add(limb(V(0, 1.6, -0.13), V(0, 1.45, -0.16), 0.032, 6, 2), BONE.head, TINT.hair, SHOWN(BIT.ponytail), 0.95);
  add(strand([V(0, 1.7, -0.1), V(0, 1.6, -0.15), V(0, 1.5, -0.14), V(0, 1.42, -0.12)], 0.1, 0.055, 7, 6), BONE.head, TINT.hair, SHOWN(BIT.longhair), 0.95);
  // eyepatch with its strap, a gold earring
  add(ball(0.03, 0.045, EYE_Y, 0.112, 1, 1, 0.4, 6, 4), BONE.head, TINT.dark, SHOWN(BIT.patch), 1);
  const strap = new THREE.TorusGeometry(0.128, 0.006, 3, seg(16));
  strap.rotateX(Math.PI / 2);
  strap.rotateZ(-0.38);
  add(strap.translate(0, 1.67, 0.005), BONE.head, TINT.dark, SHOWN(BIT.patch), 1);
  const ring = new THREE.TorusGeometry(0.016, 0.004, 3, 8);
  ring.rotateY(Math.PI / 2);
  add(ring.translate(0.122, 1.592, 0), BONE.head, TINT.trim, SHOWN(BIT.earring), 1.2);

  // ---- arms with mitten hands
  for (const s of [1, -1]) {
    const up = s > 0 ? BONE.armL : BONE.armR;
    const lo = s > 0 ? BONE.foreL : BONE.foreR;
    add(ball(0.066, s * SH_X, SH_Y - 0.01, 0, 1, 1, 1, seg(8), 6), up, TINT.sleeve);
    add(limb(V(s * (SH_X + 0.004), SH_Y - 0.02), V(s * (SH_X + 0.01), EL_Y + 0.01), 0.057, seg(8)), up, TINT.sleeve);
    add(limb(V(s * (SH_X + 0.01), EL_Y), V(s * (SH_X + 0.01), 0.905), 0.046, seg(8)), lo, TINT.forearm);
    add(ball(0.052, s * (SH_X + 0.01), 0.857, 0.008, 0.78, 1.05, 1.0, seg(8), 6), lo, TINT.skin, 0, 0.95);
    add(ball(0.02, s * (SH_X + 0.01) - s * 0.03, 0.875, 0.04, 1, 1.4, 1, 5, 4), lo, TINT.skin, 0, 0.95); // thumb
  }

  // ---- legs: breeches gathered at the knee, stockings or bare shins, shoes or tall boots
  for (const s of [1, -1]) {
    const th = s > 0 ? BONE.thighL : BONE.thighR;
    const sh = s > 0 ? BONE.shinL : BONE.shinR;
    const legGroup = s > 0 ? 0 : HIDDEN(BIT.peg);
    const x = s * (HIP_X + 0.005);
    add(limb(V(s * HIP_X, HIP_Y), V(x, KNEE_Y + 0.02), 0.076, seg(8)), th, TINT.trousers);
    const band = new THREE.TorusGeometry(0.07, 0.02, 4, seg(10));
    band.rotateX(Math.PI / 2);
    add(band.translate(x, KNEE_Y + 0.04, 0), th, TINT.trousers, 0, 0.9);
    add(limb(V(x, KNEE_Y), V(x, 0.13), 0.058, seg(8)), sh, TINT.shin, legGroup);
    add(ball(0.066, x, 0.062, 0.045, 0.86, 0.78, 1.65, seg(8), 6), sh, TINT.boots, legGroup, 0.8);
    // tall boots with a turned-down cuff
    add(limb(V(x, 0.1), V(x, 0.3), 0.065, seg(8), 1), sh, TINT.boots, SHOWN(BIT.boots), 0.85);
    const cuff = lathe([[0.066, 0.29], [0.08, 0.3], [0.082, 0.36], [0.07, 0.37]], seg(10));
    add(cuff.translate(x, 0, 0), sh, TINT.boots, SHOWN(BIT.boots), 0.9);
  }
  // a peg leg in place of the right shin
  {
    const x = -(HIP_X + 0.005);
    add(lathe([[0.05, KNEE_Y + 0.02], [0.062, KNEE_Y - 0.06], [0.04, 0.25], [0.028, 0.05], [0.032, 0.02], [0, 0.0]], seg(8)).translate(x, 0, 0), BONE.shinR, TINT.wood, SHOWN(BIT.peg), 0.9);
    const cap = new THREE.TorusGeometry(0.05, 0.012, 3, 8);
    cap.rotateX(Math.PI / 2);
    add(cap.translate(x, KNEE_Y - 0.05, 0), BONE.shinR, TINT.metal, SHOWN(BIT.peg), 1);
  }

  // ---- coat: open-fronted skirts with a gilded hem, lapels, buttons and epaulettes
  const coatFlags = SHOWN(BIT.coat);
  const coat = lathe([[0.24, 0.47], [0.245, 0.5], [0.215, 0.7], [0.19, 0.9], [0.172, 1.04], [0.168, 1.06]], seg(12), 0.5, Math.PI * 2 - 1.0);
  coat.scale(1, 1, 0.8);
  add(coat, BONE.hips, TINT.coat, coatFlags);
  const hem = new THREE.TorusGeometry(0.243, 0.016, 4, seg(14), Math.PI * 2 - 1.0);
  hem.rotateX(Math.PI / 2);
  hem.rotateY(-Math.PI / 2 + 0.5);
  hem.scale(1, 1, 0.8);
  hem.translate(0, 0.485, 0);
  add(hem, BONE.hips, TINT.trim, coatFlags, 1);
  for (const sx of [-1, 1]) {
    const lapel = new THREE.BoxGeometry(0.055, 0.3, 0.014);
    lapel.rotateZ(sx * -0.2);
    lapel.rotateX(-0.12);
    add(lapel.translate(sx * 0.07, 1.3, 0.123), BONE.chest, TINT.sash, coatFlags, 1);
    for (const y of [1.08, 1.16, 1.24]) add(ball(0.014, sx * 0.075, y, 0.118, 1, 1, 0.6, 5, 3), BONE.chest, TINT.trim, coatFlags, 1.1);
    const ep = ball(0.05, sx * (SH_X + 0.01), SH_Y + 0.045, 0, 1.15, 0.35, 1.0, 8, 4);
    add(ep, sx > 0 ? BONE.armL : BONE.armR, TINT.trim, coatFlags, 1.1);
    const fringe = new THREE.CylinderGeometry(0.056, 0.06, 0.04, 8, 1, true);
    add(fringe.translate(sx * (SH_X + 0.01), SH_Y + 0.015, 0), sx > 0 ? BONE.armL : BONE.armR, TINT.trim, coatFlags, 0.95);
    const cuff = new THREE.TorusGeometry(0.055, 0.02, 4, 10);
    cuff.rotateX(Math.PI / 2);
    cuff.translate(sx * (SH_X + 0.01), 0.93, 0);
    add(cuff, sx > 0 ? BONE.foreL : BONE.foreR, TINT.trim, coatFlags, 1);
  }
  add(ball(0.05, 0, 1.43, 0.1, 1, 1.25, 0.6, 7, 5), BONE.chest, TINT.white, coatFlags, 1.05); // cravat

  // ---- hats
  const crown = ball(0.128, 0, 1.69, -0.01, 1, 0.78, 1, seg(12), 6);
  add(crown, BONE.head, TINT.hat, HAT.tricorn, 0.9);
  const brim = tricornify(lathe([[0.1, 1.715], [0.2, 1.72], [0.235, 1.74], [0.23, 1.8], [0.215, 1.805], [0.205, 1.76], [0.16, 1.745], [0.1, 1.74]], 18), 0.16);
  add(brim, BONE.head, TINT.hat, HAT.tricorn, 0.95);
  const lace = new THREE.TorusGeometry(0.226, 0.011, 3, 24);
  lace.rotateX(Math.PI / 2);
  lace.translate(0, 1.803, 0);
  add(tricornify(lace, 0.16), BONE.head, TINT.trim, HAT.tricorn, 1);
  // a sweeping plume for the swagger
  add(strand([V(0.12, 1.79, -0.06), V(0.17, 1.86, -0.14), V(0.13, 1.9, -0.25), V(0.04, 1.86, -0.3)], 0.032, 0.008, 5, 8), BONE.head, TINT.plume, SHOWN(BIT.plume), 1.05);

  const scarf = new THREE.SphereGeometry(0.139, seg(12), 6, 0, Math.PI * 2, 0, 1.3);
  scarf.rotateX(-0.32);
  scarf.translate(0, 1.645, -0.01);
  add(scarf, BONE.head, TINT.hat, HAT.bandana, 1);
  add(ball(0.03, 0.0, 1.635, -0.14, 1.2, 1, 1, 5, 4), BONE.head, TINT.hat, HAT.bandana, 0.9); // knot
  add(limb(V(0.02, 1.62, -0.135), V(0.06, 1.48, -0.17), 0.026, 5, 1), BONE.head, TINT.hat, HAT.bandana, 0.9);
  add(limb(V(-0.02, 1.62, -0.135), V(-0.05, 1.5, -0.18), 0.024, 5, 1), BONE.head, TINT.hat, HAT.bandana, 0.9);

  add(ball(0.137, 0, 1.68, -0.012, 1, 1.12, 1, seg(12), 7), BONE.head, TINT.hat, HAT.knit, 1);
  const roll = new THREE.TorusGeometry(0.134, 0.028, 5, seg(14));
  roll.rotateX(Math.PI / 2 + 0.12);
  roll.translate(0, 1.69, -0.01);
  add(roll, BONE.head, TINT.hat, HAT.knit, 0.92);
  add(ball(0.035, 0, 1.835, -0.03, 1, 1, 1, 6, 4), BONE.head, TINT.stripe, HAT.knit, 1); // pom-pom

  const strawCrown = new THREE.CylinderGeometry(0.105, 0.125, 0.11, seg(12));
  strawCrown.translate(0, 1.77, -0.008);
  add(strawCrown, BONE.head, TINT.hat, HAT.straw, 1);
  const strawBrim = lathe([[0.11, 1.72], [0.27, 1.69], [0.285, 1.7], [0.27, 1.715], [0.11, 1.745]], 18);
  strawBrim.translate(0, 0, -0.008);
  add(strawBrim, BONE.head, TINT.hat, HAT.straw, 1);
  const band = new THREE.CylinderGeometry(0.122, 0.126, 0.03, seg(12), 1, true);
  band.translate(0, 1.735, -0.008);
  add(band, BONE.head, TINT.sash, HAT.straw, 1);

  // ---- the parrot: red macaw on the shoulder, blue wings folded, long tail down the back
  {
    const G = SHOWN(BIT.parrot);
    const [px, py, pz] = [PARROT.x, PARROT.y, PARROT.z];
    const bodyG = new THREE.SphereGeometry(0.045, 8, 6);
    bodyG.scale(0.85, 1.3, 0.95);
    bodyG.rotateX(-0.25);
    add(bodyG.translate(px, py + 0.03, pz), BONE.chest, TINT.parrot, G, 1);
    add(ball(0.034, px, py + 0.1, pz + 0.012, 1, 1, 1, 8, 6), BONE.chest, TINT.parrot, G, 1.05);
    const beak = new THREE.ConeGeometry(0.014, 0.04, 6);
    beak.rotateX(Math.PI / 2 + 0.6);
    add(beak.translate(px, py + 0.09, pz + 0.045), BONE.chest, TINT.beak, G, 1);
    for (const sx of [-1, 1]) {
      add(ball(0.007, px + sx * 0.022, py + 0.108, pz + 0.03, 1, 1, 1, 4, 3), BONE.chest, TINT.pupil, G, 1);
      const wing = new THREE.SphereGeometry(0.04, 6, 5);
      wing.scale(0.35, 1.25, 0.9);
      wing.rotateX(-0.3);
      add(wing.translate(px + sx * 0.035, py + 0.02, pz - 0.012), BONE.chest, TINT.wing, G, 0.95);
      add(ball(0.01, px + sx * 0.015, py - 0.025, pz + 0.01, 1, 0.6, 1.4, 4, 3), BONE.chest, TINT.dark, G, 1); // toes
    }
    add(strand([V(px, py - 0.01, pz - 0.035), V(px, py - 0.08, pz - 0.075), V(px, py - 0.17, pz - 0.09)], 0.022, 0.006, 4, 5), BONE.chest, TINT.wing, G, 0.95);
  }

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
  for (const dz of [-0.05, -0.2]) {
    const r = new THREE.TorusGeometry(0.034, 0.008, 3, 8);
    add(r.translate(hx + 0.07, hy + 0.04, dz), BONE.foreR, TINT.dark, PROP.spyglass, 1);
  }
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
  // cutlass: curved blade continues from the fist, gilded basket guard
  const blade = new THREE.BoxGeometry(0.02, 0.66, 0.06, 1, 6, 1);
  {
    const bp = blade.getAttribute('position');
    for (let i = 0; i < bp.count; i++) {
      const y = bp.getY(i) + 0.33; // 0 hilt .. 0.66 tip
      // a gentle curve and a tapered point
      bp.setZ(i, bp.getZ(i) * (1 - 0.6 * (y / 0.66) ** 3) + (y / 0.66) ** 2 * 0.07);
    }
    blade.computeVertexNormals();
  }
  blade.rotateZ(Math.PI);
  blade.translate(hx, hy - 0.42, 0.03);
  add(blade, BONE.foreR, TINT.metal, PROP.cutlass, 1.15);
  add(ball(0.045, hx, hy - 0.06, 0.02, 1.4, 0.4, 1.4, 8, 4), BONE.foreR, TINT.trim, PROP.cutlass, 1);
  const guard = new THREE.TorusGeometry(0.05, 0.008, 3, 8, Math.PI);
  guard.rotateY(Math.PI / 2);
  add(guard.translate(hx, hy - 0.03, 0.06), BONE.foreR, TINT.trim, PROP.cutlass, 1);
  // linstock: a staff held toward the gun with a glowing slow-match at its tip
  add(limb(V(hx, hy + 0.18, 0.02), V(hx, hy - 0.95, 0.02), 0.017, 5, 1), BONE.foreR, TINT.wood, PROP.linstock, 1);
  add(ball(0.03, hx, hy - 0.99, 0.02, 1, 1.3, 1, 6, 4), BONE.foreR, TINT.glow, PROP.linstock, 1);
  // fiddle: the body tucked along the left forearm toward the chin, the bow in the right hand
  {
    const fx = SH_X + 0.01 - 0.035;
    const body = new THREE.SphereGeometry(0.09, 8, 6);
    body.scale(0.62, 1.15, 0.28);
    add(body.translate(fx, 1.06, 0.06), BONE.foreL, TINT.wood, PROP.fiddle, 1.05);
    add(limb(V(fx, 0.96, 0.06), V(fx + 0.005, 0.86, 0.05), 0.012, 4, 1), BONE.foreL, TINT.dark, PROP.fiddle, 1);
    add(ball(0.016, fx + 0.005, 0.845, 0.05, 1, 1.3, 1, 5, 4), BONE.foreL, TINT.dark, PROP.fiddle, 1);
    add(limb(V(hx, hy, 0.03), V(hx, hy - 0.04, 0.55), 0.006, 3, 1), BONE.foreR, TINT.wood, PROP.fiddle, 1);
  }
  // tankard of grog
  {
    const mug = new THREE.CylinderGeometry(0.048, 0.055, 0.12, 8);
    add(mug.translate(hx, hy - 0.02, 0.07), BONE.foreR, TINT.wood, PROP.mug, 0.95);
    const hoop = new THREE.TorusGeometry(0.052, 0.006, 3, 8);
    hoop.rotateX(Math.PI / 2);
    add(hoop.translate(hx, hy + 0.02, 0.07), BONE.foreR, TINT.metal, PROP.mug, 1);
    add(ball(0.04, hx, hy + 0.04, 0.07, 1, 0.25, 1, 6, 3), BONE.foreR, TINT.cloth, PROP.mug, 1.1); // froth
  }
  // clay pipe clenched in the corner of the mouth
  {
    add(limb(V(-0.035, 1.585, 0.11), V(-0.07, 1.565, 0.2), 0.006, 3, 1), BONE.head, TINT.cloth, PROP.pipe, 1);
    add(new THREE.CylinderGeometry(0.016, 0.011, 0.035, 6).translate(-0.072, 1.58, 0.205), BONE.head, TINT.cloth, PROP.pipe, 1);
    add(ball(0.009, -0.072, 1.599, 0.205, 1, 0.5, 1, 4, 3), BONE.head, TINT.glow, PROP.pipe, 1);
  }

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
  int gi = int(g + 0.5);
  if (gi == 0) return true;
  if (gi < 10) return gi == int(aStyle.y + 0.5);
  if (gi >= 50) return gi == int(aStyle.z + 0.5);
  int fl = int(aStyle.w + 0.5);
  if (gi < 30) return (fl & (1 << (gi - 10))) != 0;
  return (fl & (1 << (gi - 30))) == 0;
}

// Forward kinematics, leaf to root, on both the position and its normal.
void crewDeform(inout vec3 p, inout vec3 n) {
  if (!crewShown(aRig.z)) { p = vec3(0.0); return; }
  int b = int(aRig.x + 0.5);
  int tint = int(aRig.y + 0.5);
#ifdef CREW_ANIM
  float seed = aStyle.x * 0.6180339;
  // blink: the eyes squash shut for a tenth of a second every few seconds
  if (b == 2 && (tint == ${TINT.white} || tint == ${TINT.pupil})) {
    float ph = fract(uTime * (0.27 + fract(seed * 7.0) * 0.08) + seed);
    float shut = smoothstep(0.0, 0.012, ph) * (1.0 - smoothstep(0.02, 0.035, ph));
    p.y = ${f(EYE_Y_SCALED)} + (p.y - ${f(EYE_Y_SCALED)}) * (1.0 - 0.88 * shut);
  }
  // the parrot looks about, bobs, and every so often flaps its wings
  if (int(aRig.z + 0.5) == ${SHOWN(BIT.parrot)}) {
    vec3 pc = vec3(${f(PARROT.x)}, ${f(PARROT.y)}, ${f(PARROT.z)});
    float t = uTime + seed * 13.0;
    if (tint == ${TINT.wing} && p.y > pc.y - 0.05) {
      float burst = step(fract(t * 0.11), 0.06);
      float side = sign(p.x - pc.x);
      float a = burst * (0.6 + 0.6 * sin(t * 34.0)) * side;
      vec3 hinge = pc + vec3(side * 0.03, 0.05, 0.0);
      p = hinge + crZ(p - hinge, a); n = crZ(n, a);
    }
    if (p.y > pc.y + 0.065) {
      vec3 neck = pc + vec3(0.0, 0.07, 0.0);
      float yaw = sin(t * 0.7) * 0.7 + sin(t * 1.9) * 0.25;
      float nod = max(0.0, sin(t * 2.3)) * 0.25 * step(0.5, fract(t * 0.21));
      p = neck + crY(crX(p - neck, nod), yaw); n = crY(crX(n, nod), yaw);
    }
    p.y += abs(sin(t * 1.3)) * 0.006;
  }
#endif
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
        '#include <uv_pars_vertex>',
        `#include <uv_pars_vertex>
#define CREW_ANIM
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
  totalEmissiveRadiance += vColor.rgb * vCrewEmit * (0.8 + 0.2 * sin(uTime * 23.0 + vCrewY * 40.0));
  // a soft sky-lit rim so the little figures read crisply against the deck
  {
    float rim = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
    totalEmissiveRadiance += diffuseColor.rgb * vec3(0.32, 0.36, 0.42) * rim * rim * rim;
  }`,
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
