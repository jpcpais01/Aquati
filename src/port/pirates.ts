import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../render/environment';

// Chunky toy pirates for the harbour. Every body part of every pirate is one
// instance in a shared InstancedMesh (ten draw calls for the whole crowd);
// each pirate's skeleton is a tiny Object3D hierarchy that behaviours pose.

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

// ------------------------------------------------------------------ part geometry

function torsoGeo() {
  const prof: [number, number][] = [[0.01, 0], [0.2, 0.0], [0.25, 0.08], [0.275, 0.24], [0.265, 0.42], [0.22, 0.57], [0.12, 0.65], [0.01, 0.67]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 14);
  const belt = new THREE.Color(0.16, 0.1, 0.06);
  const body = paintGeo(g, (p) => (p.y > 0.07 && p.y < 0.16 ? belt : WHITE));
  const buckle = solid(new THREE.BoxGeometry(0.1, 0.08, 0.04).translate(0, 0.115, 0.265), lin(0xe2b552).multiplyScalar(1.6));
  // buttons down the shirt front
  const btn = [0.24, 0.34, 0.44].map((y) => solid(new THREE.SphereGeometry(0.022, 6, 4).translate(0, y, 0.272), new THREE.Color(0.5, 0.5, 0.5)));
  return merge([body, buckle, ...btn]);
}

function headGeo() {
  const skull = new THREE.SphereGeometry(0.245, 16, 12);
  skull.scale(1, 1.02, 0.96);
  const eye = (x: number) => solid(new THREE.SphereGeometry(0.036, 8, 6).scale(1, 1.25, 0.6).translate(x, 0.035, 0.222), new THREE.Color(0.02, 0.02, 0.02));
  const shine = (x: number) => solid(new THREE.SphereGeometry(0.011, 5, 4).translate(x + 0.01, 0.05, 0.243), new THREE.Color(3, 3, 3));
  const nose = new THREE.SphereGeometry(0.055, 8, 6).scale(0.9, 1, 1).translate(0, -0.03, 0.24);
  const ears = [-1, 1].map((s) => new THREE.SphereGeometry(0.06, 8, 6).scale(0.5, 1, 0.8).translate(s * 0.24, 0, 0));
  const blush = new THREE.Color(1.0, 0.75, 0.72);
  const cheek = (x: number) => solid(new THREE.SphereGeometry(0.045, 8, 6).scale(1, 0.6, 0.4).translate(x, -0.06, 0.205), blush);
  const mouth = solid(new THREE.TorusGeometry(0.05, 0.012, 4, 10, Math.PI).rotateZ(Math.PI).translate(0, -0.1, 0.22), new THREE.Color(0.25, 0.08, 0.06));
  return merge([solid(skull), eye(-0.085), eye(0.085), shine(-0.085), shine(0.085), solid(nose), ...ears.map((e) => solid(e)), cheek(-0.14), cheek(0.14), mouth]);
}

function tricornGeo() {
  const crown = new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  crown.scale(1.05, 0.85, 1.05).translate(0, 0.1, -0.01);
  const parts: THREE.BufferGeometry[] = [solid(crown)];
  const trim = lin(0xe2b552).multiplyScalar(4);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const brim = new RoundedBrim(0.46, 0.17, 0.05);
    brim.rotateX(-0.95);
    brim.translate(0, 0.12, 0.22);
    brim.rotateY(a + Math.PI / 3);
    parts.push(solid(brim));
    const t = new THREE.BoxGeometry(0.44, 0.02, 0.02);
    t.translate(0, 0.2, 0.27).rotateY(a + Math.PI / 3);
    parts.push(solid(t, trim));
  }
  return merge(parts);
}

/** A flat rounded slab for hat brims. */
class RoundedBrim extends THREE.BufferGeometry {
  constructor(w: number, h: number, d: number) {
    super();
    const shape = new THREE.Shape();
    const r = h * 0.5;
    shape.moveTo(-w / 2 + r, -h / 2);
    shape.lineTo(w / 2 - r, -h / 2);
    shape.quadraticCurveTo(w / 2, -h / 2, w / 2, 0);
    shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    shape.lineTo(-w / 2 + r, h / 2);
    shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, 0);
    shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 6 });
    g.translate(0, 0, -d / 2);
    this.copy(g.toNonIndexed());
  }
}

function bandanaGeo() {
  const cap = new THREE.SphereGeometry(0.258, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.46);
  cap.translate(0, 0.0, -0.005);
  const knot = new THREE.SphereGeometry(0.06, 8, 6).translate(0, 0.06, -0.25);
  const tail1 = new THREE.CapsuleGeometry(0.035, 0.16, 3, 6).rotateX(0.5).translate(0.03, -0.04, -0.28);
  const tail2 = new THREE.CapsuleGeometry(0.035, 0.13, 3, 6).rotateX(0.35).rotateZ(-0.3).translate(-0.04, -0.03, -0.27);
  const dots: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const y = 0.13 + (i % 2) * 0.06;
    const r = Math.sqrt(Math.max(0, 0.262 * 0.262 - y * y));
    dots.push(solid(new THREE.SphereGeometry(0.022, 5, 4).scale(1, 1, 0.4).translate(Math.cos(a) * r, y, Math.sin(a) * r), new THREE.Color(3, 3, 3)));
  }
  return merge([solid(cap), solid(knot), solid(tail1), solid(tail2), ...dots]);
}

function beardGeo() {
  const parts: THREE.BufferGeometry[] = [
    new THREE.SphereGeometry(0.16, 10, 8).scale(1.15, 1, 0.8).translate(0, -0.14, 0.13),
    new THREE.SphereGeometry(0.1, 8, 6).translate(-0.1, -0.08, 0.15),
    new THREE.SphereGeometry(0.1, 8, 6).translate(0.1, -0.08, 0.15),
    new THREE.SphereGeometry(0.08, 8, 6).translate(0, -0.27, 0.12),
  ];
  // moustache
  parts.push(new THREE.CapsuleGeometry(0.03, 0.14, 3, 6).rotateZ(Math.PI / 2 + 0.2).translate(-0.07, -0.06, 0.235));
  parts.push(new THREE.CapsuleGeometry(0.03, 0.14, 3, 6).rotateZ(Math.PI / 2 - 0.2).translate(0.07, -0.06, 0.235));
  return merge(parts.map((p) => solid(p)));
}

function patchGeo() {
  const strap = new THREE.TorusGeometry(0.252, 0.012, 4, 24);
  strap.rotateX(Math.PI / 2).rotateZ(0.35).translate(0, 0.07, 0);
  const pad = new THREE.SphereGeometry(0.06, 10, 6).scale(1, 1, 0.35).translate(-0.085, 0.04, 0.225);
  return merge([solid(strap), solid(pad)]);
}

function armGeo() {
  const g = new THREE.CapsuleGeometry(0.085, 0.34, 4, 8);
  g.translate(0, -0.23, 0);
  const cuff = new THREE.CylinderGeometry(0.098, 0.098, 0.07, 10).translate(0, -0.4, 0);
  return merge([solid(g), solid(cuff, new THREE.Color(0.85, 0.85, 0.85))]);
}

function legGeo() {
  const g = new THREE.CapsuleGeometry(0.105, 0.36, 4, 8);
  g.translate(0, -0.26, 0);
  return solid(g);
}

function bootGeo() {
  const foot = new THREE.SphereGeometry(0.12, 10, 8).scale(0.95, 0.75, 1.5).translate(0, -0.04, 0.06);
  const shaft = new THREE.CylinderGeometry(0.115, 0.12, 0.2, 10).translate(0, 0.06, 0);
  const cuff = new THREE.CylinderGeometry(0.135, 0.125, 0.06, 10).translate(0, 0.17, 0);
  return merge([solid(foot), solid(shaft), solid(cuff, new THREE.Color(1.25, 1.25, 1.25))]);
}

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
}

export const HIP = 0.66;

/** A pose-able skeleton. All rotations are in the parent's frame. */
export class Figure {
  readonly root = new THREE.Object3D();
  readonly hips = new THREE.Object3D();
  readonly chest = new THREE.Object3D();
  readonly head = new THREE.Object3D();
  readonly armL = new THREE.Object3D();
  readonly armR = new THREE.Object3D();
  readonly handL = new THREE.Object3D();
  readonly handR = new THREE.Object3D();
  readonly legL = new THREE.Object3D();
  readonly legR = new THREE.Object3D();
  readonly footL = new THREE.Object3D();
  readonly footR = new THREE.Object3D();

  constructor(readonly style: PirateStyle) {
    this.root.add(this.hips);
    this.hips.position.y = HIP;
    this.hips.add(this.chest);
    const g = style.girth ?? 1;
    this.chest.scale.set(g, 1, g);
    this.hips.add(this.head);
    this.head.position.set(0, 0.88, 0);
    this.hips.add(this.armL, this.armR);
    this.armL.position.set(0.29 * g, 0.53, 0);
    this.armR.position.set(-0.29 * g, 0.53, 0);
    this.armL.add(this.handL);
    this.armR.add(this.handR);
    this.handL.position.y = -0.5;
    this.handR.position.y = -0.5;
    this.hips.add(this.legL, this.legR);
    this.legL.position.set(0.125, 0.02, 0);
    this.legR.position.set(-0.125, 0.02, 0);
    this.legL.add(this.footL);
    this.legR.add(this.footR);
    this.footL.position.y = -0.56;
    this.footR.position.y = -0.56;
  }

  /** Back to a neutral stand. */
  rest() {
    this.hips.position.set(0, HIP, 0);
    this.hips.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    for (const o of [this.armL, this.armR, this.legL, this.legR]) o.rotation.set(0, 0, 0);
    this.armL.rotation.z = 0.12;
    this.armR.rotation.z = -0.12;
  }

  /** Classic toy walk cycle. */
  walk(phase: number, amp = 1) {
    const s = Math.sin(phase);
    this.legL.rotation.x = s * 0.55 * amp;
    this.legR.rotation.x = -s * 0.55 * amp;
    this.armL.rotation.x = -s * 0.5 * amp;
    this.armR.rotation.x = s * 0.5 * amp;
    this.hips.position.y = HIP + Math.abs(Math.cos(phase)) * 0.045 * amp;
    this.hips.rotation.z = s * 0.045 * amp;
    this.hips.rotation.y = s * 0.08 * amp;
  }

  /** Seated on something `seat` metres high, thighs forward. */
  sit(seat: number) {
    this.hips.position.y = seat + 0.08;
    this.legL.rotation.x = -1.35;
    this.legR.rotation.x = -1.35;
  }
}

const PARTS = ['torso', 'head', 'tricorn', 'bandana', 'beard', 'patch', 'arm', 'hand', 'leg', 'boot'] as const;
type Part = (typeof PARTS)[number];

/** All figures' parts as instanced meshes. */
export class Crowd {
  readonly group = new THREE.Group();
  readonly figures: Figure[] = [];
  private meshes = {} as Record<Part, THREE.InstancedMesh>;
  private slots: { fig: Figure; part: Part; obj: THREE.Object3D; idx: number }[] = [];
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private tmp = new THREE.Matrix4();

  constructor(styles: PirateStyle[]) {
    this.group.name = 'pirates';
    const n = styles.length;
    const mat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, envMapIntensity: 0.9 }), { clouds: true });
    const geos: Record<Part, THREE.BufferGeometry> = {
      torso: torsoGeo(),
      head: headGeo(),
      tricorn: tricornGeo(),
      bandana: bandanaGeo(),
      beard: beardGeo(),
      patch: patchGeo(),
      arm: armGeo(),
      hand: solid(new THREE.SphereGeometry(0.085, 10, 8)),
      leg: legGeo(),
      boot: bootGeo(),
    };
    const counts: Record<Part, number> = { torso: n, head: n, tricorn: n, bandana: n, beard: n, patch: n, arm: n * 2, hand: n * 2, leg: n * 2, boot: n * 2 };
    for (const p of PARTS) {
      const m = new THREE.InstancedMesh(geos[p], mat, counts[p]);
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.meshes[p] = m;
      this.group.add(m);
    }
    const c = new THREE.Color();
    const used: Record<Part, number> = { torso: 0, head: 0, tricorn: 0, bandana: 0, beard: 0, patch: 0, arm: 0, hand: 0, leg: 0, boot: 0 };
    const slot = (fig: Figure, part: Part, obj: THREE.Object3D, color: number | null) => {
      const idx = used[part]++;
      const m = this.meshes[part];
      m.setColorAt(idx, color === null ? c.setRGB(0, 0, 0) : c.copy(lin(color)));
      if (color === null) m.setMatrixAt(idx, this.zero);
      else this.slots.push({ fig, part, obj, idx });
    };
    for (const st of styles) {
      const f = new Figure(st);
      this.figures.push(f);
      slot(f, 'torso', f.chest, st.shirt);
      slot(f, 'head', f.head, st.skin);
      slot(f, 'tricorn', f.head, st.hat === 'tricorn' ? st.hatColor : null);
      slot(f, 'bandana', f.head, st.hat === 'bandana' ? st.hatColor : null);
      slot(f, 'beard', f.head, st.beard);
      slot(f, 'patch', f.head, st.patch ? 0x161210 : null);
      slot(f, 'arm', f.armL, st.shirt);
      slot(f, 'arm', f.armR, st.shirt);
      slot(f, 'hand', f.handL, st.skin);
      slot(f, 'hand', f.handR, st.skin);
      slot(f, 'leg', f.legL, st.pants);
      slot(f, 'leg', f.legR, st.pants);
      slot(f, 'boot', f.footL, st.boots);
      slot(f, 'boot', f.footR, st.boots);
      f.rest();
    }
    for (const p of PARTS) {
      this.meshes[p].instanceColor!.needsUpdate = true;
    }
  }

  /** Copies every posed skeleton into the instance buffers (world space). */
  sync() {
    for (const s of this.slots) this.meshes[s.part].setMatrixAt(s.idx, this.tmp.copy(s.obj.matrixWorld));
    for (const p of PARTS) this.meshes[p].instanceMatrix.needsUpdate = true;
  }
}

/** Little vertex-coloured props in pirates' hands. */
export const PropGeo = {
  mug() {
    const body = solid(new THREE.CylinderGeometry(0.07, 0.065, 0.16, 10), lin(0x8a5a32));
    const hoops = [0.04, -0.04].map((y) => solid(new THREE.TorusGeometry(0.071, 0.008, 4, 12).rotateX(Math.PI / 2).translate(0, y, 0), lin(0x3a3a3a)));
    const foam = solid(new THREE.SphereGeometry(0.07, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1).translate(0, 0.08, 0), new THREE.Color(1.6, 1.55, 1.4));
    const handle = solid(new THREE.TorusGeometry(0.045, 0.014, 4, 8, Math.PI).rotateZ(-Math.PI / 2).translate(0.07, 0, 0), lin(0x6e4626));
    return merge([body, ...hoops, foam, handle]);
  },
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
  spyglass() {
    const a = solid(new THREE.CylinderGeometry(0.045, 0.05, 0.28, 10).rotateX(Math.PI / 2).translate(0, 0, 0.14), lin(0x8a5a32));
    const b = solid(new THREE.CylinderGeometry(0.035, 0.04, 0.26, 10).rotateX(Math.PI / 2).translate(0, 0, 0.38), lin(0xe2b552).multiplyScalar(1.4));
    const ring = solid(new THREE.TorusGeometry(0.05, 0.01, 4, 10).translate(0, 0, 0.28), lin(0xe2b552).multiplyScalar(1.6));
    return merge([a, b, ring]);
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
  parrot() {
    const red = lin(0xd8322a);
    const parts = [
      solid(new THREE.SphereGeometry(0.09, 10, 8).scale(0.9, 1.3, 1).translate(0, 0.1, 0), red),
      solid(new THREE.SphereGeometry(0.075, 10, 8).translate(0, 0.25, 0.03), red),
      solid(new THREE.ConeGeometry(0.035, 0.08, 6).rotateX(Math.PI / 2 + 0.5).translate(0, 0.23, 0.11), lin(0xf3d27a)),
      solid(new THREE.SphereGeometry(0.06, 8, 6).scale(0.5, 1.4, 1).translate(0.075, 0.09, -0.01), lin(0x2f8ad8)),
      solid(new THREE.SphereGeometry(0.06, 8, 6).scale(0.5, 1.4, 1).translate(-0.075, 0.09, -0.01), lin(0x2f8ad8)),
      solid(new THREE.CapsuleGeometry(0.03, 0.2, 2, 5).rotateX(-0.4).translate(0, -0.06, -0.08), lin(0xf3c23a)),
      solid(new THREE.SphereGeometry(0.016, 5, 4).translate(0.05, 0.27, 0.07), new THREE.Color(0.02, 0.02, 0.02)),
      solid(new THREE.SphereGeometry(0.016, 5, 4).translate(-0.05, 0.27, 0.07), new THREE.Color(0.02, 0.02, 0.02)),
    ];
    return merge(parts);
  },
};
