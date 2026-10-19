import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CrewRenderer, FLAG, HAT, P, POSE_SIZE, PROP, RIG, TINT, TINT_SLOTS } from '../ships/crewModel';

// The harbour's pirates. They are drawn by the ship crews' sculpted, instanced
// sailor (one draw call for the whole crowd); each pirate's skeleton is a tiny
// Object3D hierarchy laid out on that sailor's joints, which behaviours pose
// and props hang from.

const lin = (hex: number) => new THREE.Color(hex).convertSRGBToLinear();

function paintGeo(geo: THREE.BufferGeometry, fn: (p: THREE.Vector3) => THREE.Color): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const c = fn(p);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const WHITE = new THREE.Color(1, 1, 1);
const solid = (geo: THREE.BufferGeometry, c: THREE.Color = WHITE) => paintGeo(geo, () => c);
const merge = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts)!;

// ------------------------------------------------------------------ figures

export type Hat = 'tricorn' | 'bandana' | 'none';

export interface PirateStyle {
  shirt: number;
  pants: number;
  skin: number;
  hat: Hat;
  hatColor: number;
  beard: number | null;
  patch: boolean;
  boots: number;
  girth?: number;
  /** extra crew-model flags (a coat, a parrot, rolled sleeves...) */
  flags?: number;
}

/** Height of the hip joint: the figures share the ship crews' sculpt and skeleton. */
export const HIP = RIG.hipY;

/**
 * A pose-able skeleton laid out on the crew model's joints, so props hung on
 * its hands and head land where the rendered sailor's hands and head are.
 * All rotations are in the parent's frame; heads turn (y) after they nod (x)
 * and tilt (z).
 */
export class Figure {
  readonly root = new THREE.Object3D();
  readonly hips = new THREE.Object3D();
  readonly chest = new THREE.Object3D();
  readonly head = new THREE.Object3D();
  readonly armL = new THREE.Object3D();
  readonly armR = new THREE.Object3D();
  readonly elbowL = new THREE.Object3D();
  readonly elbowR = new THREE.Object3D();
  readonly handL = new THREE.Object3D();
  readonly handR = new THREE.Object3D();
  readonly legL = new THREE.Object3D();
  readonly legR = new THREE.Object3D();
  readonly footL = new THREE.Object3D();
  readonly footR = new THREE.Object3D();
  /** Everything the joints don't say: fingers, jaw, brows, gaze, smile and knees. */
  readonly pose = new Float32Array(POSE_SIZE);
  /** A crew-model prop in the right fist (PROP.mug, PROP.spyglass...). */
  prop: number = PROP.none;
  readonly mood: number;

  constructor(readonly style: PirateStyle, seed: number) {
    const g = style.girth ?? 1;
    this.mood = 0.25 + 0.5 * Math.abs(Math.sin(seed * 12.9898));
    this.root.add(this.hips);
    this.hips.position.y = HIP;
    this.hips.add(this.chest);
    this.hips.add(this.head);
    this.head.position.set(0, RIG.neckY - HIP, 0);
    this.head.rotation.order = 'YXZ';
    this.hips.add(this.armL, this.armR);
    this.armL.position.set(RIG.shX * g, RIG.shY - HIP, 0);
    this.armR.position.set(-RIG.shX * g, RIG.shY - HIP, 0);
    for (const [arm, elbow, hand] of [[this.armL, this.elbowL, this.handL], [this.armR, this.elbowR, this.handR]]) {
      arm.add(elbow);
      elbow.position.y = RIG.elY - RIG.shY;
      elbow.add(hand);
      hand.position.y = RIG.gripY - RIG.elY;
    }
    this.hips.add(this.legL, this.legR);
    this.legL.position.set(RIG.hipX * g, 0, 0);
    this.legR.position.set(-RIG.hipX * g, 0, 0);
    this.legL.add(this.footL);
    this.legR.add(this.footR);
    this.footL.position.set(0, 0.05 - HIP, 0.05);
    this.footR.position.set(0, 0.05 - HIP, 0.05);
  }

  /** Back to a neutral stand, hands loose, wearing their usual expression. */
  rest() {
    this.hips.position.set(0, HIP, 0);
    this.hips.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    for (const o of [this.armL, this.armR, this.legL, this.legR]) o.rotation.set(0, 0, 0, 'XYZ');
    this.armL.rotation.z = 0.12;
    this.armR.rotation.z = -0.12;
    this.elbowL.rotation.x = -0.15;
    this.elbowR.rotation.x = -0.15;
    const o = this.pose;
    o.fill(0);
    o[P.kneeL] = 0.04;
    o[P.kneeR] = 0.04;
    o[P.handL] = 0.3;
    o[P.handR] = 0.3;
    o[P.smile] = this.mood;
  }

  /** Classic toy walk cycle, now with knees and elbows. */
  walk(phase: number, amp = 1) {
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    this.legL.rotation.x = s * 0.55 * amp;
    this.legR.rotation.x = -s * 0.55 * amp;
    this.pose[P.kneeL] = 0.1 + 0.8 * amp * Math.max(0, -c);
    this.pose[P.kneeR] = 0.1 + 0.8 * amp * Math.max(0, c);
    this.armL.rotation.x = -s * 0.5 * amp;
    this.armR.rotation.x = s * 0.5 * amp;
    this.elbowL.rotation.x = -0.25 - 0.25 * amp * Math.max(0, s);
    this.elbowR.rotation.x = -0.25 - 0.25 * amp * Math.max(0, -s);
    this.hips.position.y = HIP + (Math.abs(c) - 1) * 0.035 * amp;
    this.hips.rotation.z = s * 0.045 * amp;
    this.hips.rotation.y = s * 0.08 * amp;
  }

  /** Poses an arm the way the ship crews do: swung forward, then out, then the elbow bent. */
  reach(left: boolean, fwd: number, out: number, elbow: number) {
    (left ? this.armL : this.armR).rotation.set(-fwd, 0, left ? out : -out, 'ZYX');
    (left ? this.elbowL : this.elbowR).rotation.x = -elbow;
  }

  /** Seated on something `seat` metres high, thighs forward, shins hanging. */
  sit(seat: number) {
    this.hips.position.y = seat + 0.08;
    this.legL.rotation.x = -1.35;
    this.legR.rotation.x = -1.35;
    this.pose[P.kneeL] = 1.35;
    this.pose[P.kneeR] = 1.35;
  }

  /**
   * Copies the joints into the crew pose channels. Behaviours pose arms
   * out-then-forward (Euler XYZ); the sailor swings them forward-then-out,
   * so each arm is re-expressed that way, pointing the same direction, and
   * the skeleton updated to match so props stay in the rendered fists.
   */
  write(out: Float32Array) {
    out.set(this.pose);
    const [lx, lz] = crewArm(this.armL);
    const [rx, rz] = crewArm(this.armR);
    out[P.armLX] = lx;
    out[P.armLZ] = lz;
    out[P.armRX] = rx;
    out[P.armRZ] = -rz;
    out[P.elbowL] = -this.elbowL.rotation.x;
    out[P.elbowR] = -this.elbowR.rotation.x;
    out[P.legLX] = -this.legL.rotation.x;
    out[P.legRX] = -this.legR.rotation.x;
    out[P.headX] = this.head.rotation.x;
    out[P.headY] = this.head.rotation.y;
    out[P.headZ] = this.head.rotation.z;
    if (this.prop !== PROP.none) out[P.handR] = Math.max(out[P.handR], 0.95);
  }
}

const _d = new THREE.Vector3();

/** Forward swing and outward swing (crew convention) for an arm posed as Euler XYZ. */
function crewArm(arm: THREE.Object3D): [number, number] {
  if (arm.rotation.order === 'ZYX') return [-arm.rotation.x, arm.rotation.z]; // posed by reach()
  _d.set(0, -1, 0).applyEuler(arm.rotation);
  const fwd = Math.asin(Math.max(-1, Math.min(1, _d.z)));
  let sx = fwd;
  let a = Math.atan2(_d.x, -_d.y);
  // an arm raised overhead: reach up and over rather than out and twisted round
  const a2 = Math.atan2(-_d.x, _d.y);
  if (Math.abs(a2) < Math.abs(a)) {
    sx = Math.PI - fwd;
    a = a2;
  }
  arm.rotation.set(-sx, 0, a, 'ZYX');
  arm.updateMatrixWorld(true);
  return [sx, a];
}

const hex = (h: number, a = 0): number[] => {
  const c = new THREE.Color(h);
  return [c.r, c.g, c.b, a];
};

/** The crew-model palette and flags for one harbour pirate. */
function lookOf(st: PirateStyle, seed: number) {
  let r = seed * 7.31 + 1;
  const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length) % a.length];
  const slots: number[][] = Array.from({ length: TINT_SLOTS }, () => [1, 1, 1, 0]);
  const shirt = hex(st.shirt);
  const pants = hex(st.pants);
  const skin = hex(st.skin);
  slots[TINT.skin] = skin;
  slots[TINT.shirt] = shirt;
  slots[TINT.coat] = shirt;
  const sleeves = rnd();
  slots[TINT.sleeve] = sleeves < 0.25 ? skin : shirt;
  slots[TINT.forearm] = sleeves < 0.6 ? skin : shirt;
  slots[TINT.trousers] = pants;
  slots[TINT.shin] = pants;
  slots[TINT.boots] = hex(st.boots);
  slots[TINT.sash] = hex(pick([0xa3241f, 0x2a6fd0, 0xe2b552, 0x2f6b47, 0x5e1414]));
  slots[TINT.hat] = hex(st.hatColor, st.hat === 'bandana' ? -1 : 0);
  slots[TINT.hair] = hex(st.beard ?? pick([0x1b1512, 0x2e2018, 0x4a3020, 0x6b4325, 0x8a5a2b, 0x8d8a86]));
  slots[TINT.trim] = hex(0xd4a64a);
  slots[TINT.wood] = hex(0x8a6440);
  slots[TINT.metal] = hex(0xc7ced6);
  slots[TINT.glow] = hex(0xff7a2a, 7);
  slots[TINT.cloth] = hex(0xd8ccb0);
  slots[TINT.stripe] = hex(pick([0xf1ead9, 0x1f3550, 0x9c2a2a]));
  slots[TINT.dark] = hex(0x1a1210);
  slots[TINT.white] = hex(0xf6f2ea);
  slots[TINT.pupil] = hex(pick([0x5a3a1e, 0x6b4423, 0x3b6e8f, 0x4f7a3a, 0x3f2a18]));
  slots[TINT.parrot] = hex(0xd8322a);
  slots[TINT.wing] = hex(0x2f8ad8);
  slots[TINT.beak] = hex(0xf3d27a);
  slots[TINT.vest] = hex(pick([0x3a2a22, 0x5e1414, 0x2d2a33, 0x6b4a2b]));
  slots[TINT.plume] = hex(0xefe6d6);
  slots[TINT.leather] = hex(pick([0x3b2a1e, 0x2a1f18, 0x5a3a24]));
  slots[TINT.mouth] = hex(0x4a1618);
  slots[TINT.tongue] = hex(0xc75a5e);
  slots[TINT.shine] = hex(0xffffff, 0.6);
  let flags = FLAG.boots | (st.flags ?? 0);
  if (st.beard !== null) flags |= rnd() < 0.7 ? FLAG.beard | FLAG.moustache : FLAG.moustache;
  if (st.patch) flags |= FLAG.patch;
  if (sleeves >= 0.25 && sleeves < 0.6) flags |= FLAG.rolled;
  else if (sleeves >= 0.6) flags |= FLAG.cuffs;
  if (rnd() < 0.5) flags |= FLAG.earring;
  if (rnd() < 0.4) flags |= FLAG.belt;
  if (rnd() < 0.3) flags |= FLAG.kerchief;
  if (st.hat === 'none' && rnd() < 0.3) flags |= FLAG.ponytail;
  const hat = st.hat === 'tricorn' ? HAT.tricorn : st.hat === 'bandana' ? HAT.bandana : HAT.none;
  return { slots, flags, hat };
}

/** The harbour crowd: drawn by the same sculpted, instanced sailor as the ship crews. */
export class Crowd {
  readonly group: THREE.Group;
  readonly figures: Figure[] = [];
  private readonly view: CrewRenderer;
  private readonly looks: ReturnType<typeof lookOf>[];
  private readonly pose = new Float32Array(POSE_SIZE);
  private readonly m = new THREE.Matrix4();
  private readonly off = new THREE.Matrix4();

  constructor(styles: PirateStyle[]) {
    const n = styles.length;
    this.view = new CrewRenderer(n, 0.8, 0.45, n);
    this.group = this.view.group;
    this.group.name = 'pirates';
    this.looks = styles.map((st, i) => lookOf(st, i + 1));
    this.looks.forEach((l, i) => this.view.setRow(i, l.slots));
    styles.forEach((st, i) => {
      const f = new Figure(st, i + 1);
      f.rest();
      this.figures.push(f);
    });
  }

  /** Copies every posed skeleton into the instance buffers (world space). */
  sync() {
    const v = this.view;
    v.begin();
    this.figures.forEach((f, i) => {
      const g = f.style.girth ?? 1;
      // the sculpt's hip joint sits on the skeleton's hips
      this.off.makeScale(g, 1, g).setPosition(0, -HIP, 0);
      this.m.multiplyMatrices(f.hips.matrixWorld, this.off);
      f.write(this.pose);
      const l = this.looks[i];
      v.push(this.m, this.pose, i, l.hat, f.prop, l.flags, true);
    });
    v.end();
  }
}

/** Little vertex-coloured props in pirates' hands. */
export const PropGeo = {
  crate(s = 0.62) {
    const box = solid(new THREE.BoxGeometry(s, s, s), lin(0xb8864e));
    const parts = [box];
    const dark = lin(0x6e4a28);
    for (const ax of [0, 1, 2]) {
      for (const o of [-1, 1]) {
        const b = new THREE.BoxGeometry(ax === 0 ? 0.04 : s + 0.02, ax === 1 ? 0.04 : s + 0.02, ax === 2 ? 0.04 : s + 0.02);
        const v = new THREE.Vector3();
        v.setComponent(ax, o * (s / 2 - 0.01));
        parts.push(solid(b.translate(v.x, v.y, v.z), dark));
      }
    }
    return merge(parts);
  },
  barrel(h = 0.9, r = 0.36) {
    const prof: [number, number][] = [[0.01, -h / 2], [r * 0.84, -h / 2], [r * 0.96, -h * 0.25], [r, 0], [r * 0.96, h * 0.25], [r * 0.84, h / 2], [0.01, h / 2]];
    const body = paintGeo(new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 14), (p) =>
      Math.abs(Math.abs(p.y) - h * 0.32) < 0.035 || Math.abs(Math.abs(p.y) - h * 0.47) < 0.03 ? lin(0x3a3532) : lin(0x9a6a3c).multiplyScalar(0.9 + 0.12 * Math.sin(Math.atan2(p.z, p.x) * 7)),
    );
    return body;
  },
  rod() {
    const pole = solid(new THREE.CylinderGeometry(0.012, 0.03, 3.2, 6).translate(0, 1.6, 0), lin(0x6e4a28));
    const reel = solid(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10).rotateZ(Math.PI / 2).translate(0.05, 0.35, 0), lin(0x3a3a3a));
    return merge([pole, reel]);
  },
  accordion() {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) parts.push(solid(new THREE.BoxGeometry(0.06, 0.32, 0.22).translate(-0.18 + i * 0.072, 0, 0), i % 2 ? lin(0x9c2a2a) : lin(0xf0e2c0)));
    for (const s of [-1, 1]) parts.push(solid(new THREE.BoxGeometry(0.08, 0.36, 0.25).translate(s * 0.25, 0, 0), lin(0x2a1f16)));
    return merge(parts);
  },
  brush(len = 2.4) {
    const pole = solid(new THREE.CylinderGeometry(0.025, 0.025, len, 6).translate(0, -len / 2, 0), lin(0xb8864e));
    const ferrule = solid(new THREE.CylinderGeometry(0.06, 0.04, 0.08, 8).translate(0, -len - 0.02, 0), lin(0x8c8a84));
    return merge([pole, ferrule]);
  },
  brushTip(len = 2.4) {
    return new THREE.BoxGeometry(0.22, 0.14, 0.07).translate(0, -len - 0.12, 0);
  },
  mop() {
    const pole = solid(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 6).translate(0, -0.75, 0), lin(0xb8864e));
    const strands: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      strands.push(solid(new THREE.CapsuleGeometry(0.03, 0.22, 2, 5).rotateZ(Math.cos(a) * 0.5).rotateX(Math.sin(a) * 0.5).translate(Math.cos(a) * 0.06, -1.6, Math.sin(a) * 0.06), lin(0xe8e0cc)));
    }
    return merge([pole, ...strands]);
  },
};
