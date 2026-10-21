import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../render/environment';
import { damp } from '../core/noise';
import { CrewFigure, CrewSystem, makeLook, rest } from '../ships/crew';
import { P, POSE_SIZE, PROP } from '../ships/crewModel';
import { colored, at } from './loot';
import type { World } from './world';
import type { Ship } from '../ships/ship';
import type { ShipClassId } from '../ships/shipTypes';

// Shipwreck survivors. When a pirate goes down, a few of her hands make it to
// the wreckage: a broken yard or a torn-off hatch cover, two or three of them
// clinging to it with their arms over the wood and their legs kicking in the
// water. As a ship comes near, one hauls himself up and waves both arms,
// shouting; they tire as the minutes pass. Throw them a line and they swim
// for your side and climb the hull, one after another, to sign on with your
// crew. Sail on, and the current takes them.

const RAFT_MAX = 6;
const LIFE = 150;
/** From the hull's side, how far a line can be thrown. */
export const LINE_REACH = 14;

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);

/** A snapped yard, still trailing a rag of sail and a coil of line (long axis x). */
function sparGeometry() {
  const parts = [colored(new THREE.CylinderGeometry(0.15, 0.19, 4.6, 10), 0x5b3d24)];
  parts[0].rotateZ(Math.PI / 2);
  // the splintered break
  for (let i = 0; i < 4; i++) {
    const sp = new THREE.ConeGeometry(0.06, 0.4 + i * 0.08, 4);
    sp.rotateZ(-Math.PI / 2);
    parts.push(colored(at(sp, 2.45, Math.sin(i * 2.1) * 0.08, Math.cos(i * 2.1) * 0.08), 0x8a6440));
  }
  for (const x of [-1.6, 0.2, 1.4]) {
    const band = new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10);
    band.rotateZ(Math.PI / 2);
    parts.push(colored(at(band, x, 0, 0), 0x2f2a26));
  }
  // a torn rag of sail still lashed to it, half awash
  const rag = new THREE.BoxGeometry(1.1, 0.03, 0.6, 1, 1, 1);
  rag.rotateX(0.35);
  rag.rotateY(0.2);
  parts.push(colored(at(rag, -0.9, 0.02, -0.4), 0xbfb293));
  const coil = new THREE.TorusGeometry(0.28, 0.05, 5, 14);
  coil.rotateX(Math.PI / 2);
  parts.push(colored(at(coil, 0.9, 0.17, -0.15), 0xb8a172));
  return mergeGeometries(parts);
}

/** A hatch cover torn off the deck: a grating in a heavy frame. */
function hatchGeometry() {
  const parts = [colored(new THREE.BoxGeometry(2.0, 0.14, 1.5), 0x6e4a2b)];
  for (let i = -3; i <= 3; i++) parts.push(colored(at(new THREE.BoxGeometry(0.07, 0.05, 1.36), i * 0.26, 0.09, 0), 0x4a3019));
  for (const z of [-0.4, 0, 0.4]) parts.push(colored(at(new THREE.BoxGeometry(1.86, 0.05, 0.06), 0, 0.09, z), 0x4a3019));
  const barrel = new THREE.CylinderGeometry(0.26, 0.26, 0.7, 10);
  barrel.rotateZ(Math.PI / 2);
  parts.push(colored(at(barrel, 0.5, 0.25, -0.35), 0x8f5d34));
  return mergeGeometries(parts);
}

/** Where the hands hang on, in raft space: [along x, side z, facing yaw]. */
const HOLDS: [number, number, number][][] = [
  [[-1.4, 0.42, Math.PI], [0.2, -0.42, 0], [1.3, 0.42, Math.PI], [-0.5, -0.42, 0]],
  [[0, 0.95, Math.PI], [1.2, 0, -Math.PI / 2], [0, -0.95, 0], [-1.2, 0, Math.PI / 2]],
];

interface Hand {
  fig: CrewFigure;
  hold: number;
  seed: number;
  /** cling → swim (to the ship) → climb (her side) → aboard. */
  mode: 'cling' | 'swim' | 'climb' | 'aboard';
  t: number;
  delay: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Which of them waves and shouts when a ship comes by. */
  caller: boolean;
  target: Float32Array;
}

export interface Raft {
  kind: 0 | 1;
  x: number;
  z: number;
  y: number;
  yaw: number;
  quat: THREE.Quaternion;
  age: number;
  sink: number;
  hands: Hand[];
  /** The ship they sailed in. */
  from: string;
  /** How many clung to it to begin with. */
  crew: number;
  /** A line is aboard: they're coming. */
  saved: Ship | null;
}

export class Survivors {
  readonly group = new THREE.Group();
  readonly rafts: Raft[] = [];
  /** One more hand is over the rail and aboard. */
  onAboard: (raft: Raft, left: number) => void = () => {};
  private meshes: THREE.InstancedMesh[] = [];

  constructor(private crew: CrewSystem) {
    const mat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 }), { clouds: true, caustics: true });
    for (const g of [sparGeometry(), hatchGeometry()]) {
      const im = new THREE.InstancedMesh(g, mat, RAFT_MAX);
      im.count = 0;
      im.castShadow = true;
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.meshes.push(im);
      this.group.add(im);
    }
  }

  /** `n` of a sunken ship's hands cling to her wreckage here. */
  spawn(x: number, z: number, n: number, from: string) {
    if (this.rafts.length >= RAFT_MAX) this.drop(0);
    const kind: 0 | 1 = Math.random() < 0.6 ? 0 : 1;
    const r: Raft = { kind, x, z, y: 0, yaw: Math.random() * Math.PI * 2, quat: new THREE.Quaternion(), age: 0, sink: 0, hands: [], from, crew: 0, saved: null };
    const holds = HOLDS[kind];
    const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(n, holds.length); i++) {
      const look = makeLook('pirate', 'hand');
      const row = this.crew.takeRow(look);
      if (row < 0) break;
      const fig: CrewFigure = { row, look, pose: new Float32Array(POSE_SIZE), matrix: new THREE.Matrix4(), prop: PROP.none, visible: true };
      rest(fig.pose);
      this.crew.figures.add(fig);
      r.hands.push({ fig, hold: order[i], seed: Math.random() * 100, mode: 'cling', t: 0, delay: 0, x: 0, y: 0, z: 0, yaw: 0, caller: i === 0, target: new Float32Array(POSE_SIZE) });
    }
    if (!r.hands.length) return;
    r.crew = r.hands.length;
    this.rafts.push(r);
  }

  /** The nearest raft of survivors a line from `s` can reach (none while one is already coming aboard). */
  reachable(s: Ship): Raft | null {
    let best: Raft | null = null;
    let bd = LINE_REACH;
    for (const r of this.rafts) {
      if (r.saved) return null;
      if (!r.hands.length) continue;
      const d = Math.hypot(r.x - s.pos.x, r.z - s.pos.z) - Math.max(s.cls.beam * 0.5, s.cls.length * 0.25);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return best;
  }

  /** Any raft within `d` of a point (for the cries for help). */
  nearest(x: number, z: number): { raft: Raft; d: number } | null {
    let best: { raft: Raft; d: number } | null = null;
    for (const r of this.rafts) {
      if (!r.hands.length || r.saved) continue;
      const d = Math.hypot(r.x - x, r.z - z);
      if (!best || d < best.d) best = { raft: r, d };
    }
    return best;
  }

  /** A line thrown: one after another they let go and swim for `s`. */
  rescue(r: Raft, s: Ship) {
    r.saved = s;
    r.hands.forEach((h, i) => {
      h.delay = 0.3 + i * 0.7;
      h.mode = 'swim';
      h.t = 0;
    });
  }

  private drop(i: number) {
    for (const h of this.rafts[i].hands) this.release(h);
    this.rafts.splice(i, 1);
  }

  private release(h: Hand) {
    this.crew.figures.delete(h.fig);
    this.crew.freeRow(h.fig.row);
    h.fig.row = -1;
  }

  /** `focus` is where the camera looks: a raft left far behind is taken by the current. */
  update(dt: number, w: World, focus: THREE.Vector3) {
    const counts = [0, 0];
    for (let i = this.rafts.length - 1; i >= 0; i--) {
      const r = this.rafts[i];
      if (dt > 0) {
        r.age += dt;
        r.x += w.wind.dirX * 0.3 * dt;
        r.z += w.wind.dirZ * 0.3 * dt;
        const far = Math.hypot(r.x - focus.x, r.z - focus.z);
        if (!r.hands.length || (r.age > LIFE && far > 260) || far > 900) r.sink += dt * 0.3;
        if (r.sink > 1.5) {
          this.drop(i);
          continue;
        }
      }
      // ride the swell
      const h0 = w.waterHeight(r.x, r.z);
      const hx = w.waterHeight(r.x + 1.2, r.z);
      const hz = w.waterHeight(r.x, r.z + 1.2);
      _n.set(-(hx - h0) / 1.2, 1, -(hz - h0) / 1.2).normalize();
      _q.setFromUnitVectors(UP, _n).multiply(_q2.setFromAxisAngle(UP, r.yaw));
      r.quat.slerp(_q, Math.min(1, dt * 4 + (r.age < 0.1 ? 1 : 0)));
      r.y += (h0 - 0.06 - r.sink - r.y) * Math.min(1, dt * 6 + (r.age < 0.1 ? 1 : 0));
      _m.compose(_v.set(r.x, r.y, r.z), r.quat, _s);
      this.meshes[r.kind].setMatrixAt(counts[r.kind]++, _m);
      if (dt > 0) this.hands(r, w, dt, focus);
    }
    this.meshes.forEach((m, k) => {
      m.count = counts[k];
      m.visible = counts[k] > 0;
      if (counts[k]) m.instanceMatrix.needsUpdate = true;
    });
  }

  private hands(r: Raft, w: World, dt: number, focus: THREE.Vector3) {
    const tt = w.time;
    const raftM = _m2.compose(_v.set(r.x, r.y, r.z), r.quat, _s);
    // someone to wave at: the rescuer, or whatever ship the camera follows near them
    const near = Math.hypot(r.x - focus.x, r.z - focus.z);
    const tired = Math.min(1, Math.max(0, (r.age - 80) / 60));
    for (let i = r.hands.length - 1; i >= 0; i--) {
      const h = r.hands[i];
      const T = h.target;
      rest(T);
      const k = tt * (0.9 + (h.seed % 0.3)) + h.seed;
      if (h.mode === 'cling' || (h.mode === 'swim' && h.delay > 0)) {
        if (h.mode === 'swim') h.delay -= dt;
        const [ax, az, fy] = HOLDS[r.kind][h.hold];
        // chest against the wood, arms thrown over it, legs kicking slowly below
        _v.set(ax, 0, az).applyMatrix4(raftM);
        h.x = _v.x;
        h.z = _v.z;
        h.y = r.y + 0.02;
        _e.setFromQuaternion(r.quat, 'YXZ');
        h.yaw = _e.y + fy;
        const waving = h.caller && near < 90 && !r.saved && tired < 0.8;
        T[P.armLX] = 1.45;
        T[P.armRX] = 1.45;
        T[P.armLZ] = 0.25;
        T[P.armRZ] = 0.25;
        T[P.elbowL] = 0.9;
        T[P.elbowR] = 0.9;
        T[P.legLX] = 0.35 + 0.3 * Math.sin(k * 2.2);
        T[P.legRX] = 0.35 - 0.3 * Math.sin(k * 2.2);
        T[P.kneeL] = 0.6 + 0.3 * Math.sin(k * 2.2 + 1);
        T[P.kneeR] = 0.6 - 0.3 * Math.sin(k * 2.2 + 1);
        T[P.headX] = -0.55 + tired * 0.6;
        T[P.headY] = Math.sin(k * 0.3) * 0.4;
        T[P.brow] = 0.6;
        T[P.smile] = -0.3 - tired * 0.3;
        T[P.handL] = 0.8;
        T[P.handR] = 0.8;
        T[P.jaw] = 0.15 + 0.1 * Math.max(0, Math.sin(k * 1.1));
        if (waving) {
          // up on the spar, both arms over his head, hollering
          const wv = Math.sin(k * 7);
          T[P.armLX] = 2.75;
          T[P.armRX] = 2.75;
          T[P.armLZ] = 0.35 + 0.35 * wv;
          T[P.armRZ] = 0.35 - 0.35 * wv;
          T[P.elbowL] = 0.25;
          T[P.elbowR] = 0.25;
          T[P.handL] = 0;
          T[P.handR] = 0;
          T[P.headX] = -0.35;
          T[P.jaw] = 0.55 + 0.35 * Math.max(0, Math.sin(k * 5));
          T[P.brow] = 1;
          T[P.smile] = 0.1;
        } else if (r.saved) {
          // a line! grins all round
          T[P.smile] = 0.7;
          T[P.headX] = -0.4;
        }
        this.pose(h, dt, waving ? 0.3 : 0.62 - tired * 0.12);
        continue;
      }
      const s = r.saved;
      if (!s || !s.alive) {
        // the ship is gone: back to the wreckage
        h.mode = 'cling';
        r.saved = null;
        continue;
      }
      // the side of her hull nearest them, at the waterline
      const side = s.portDir(_n);
      const dx = h.x - s.pos.x, dz = h.z - s.pos.z;
      const sg = dx * side.x + dz * side.z >= 0 ? 1 : -1;
      const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
      const along = Math.max(-s.cls.length * 0.25, Math.min(s.cls.length * 0.2, dx * fx + dz * fz));
      const hull = s.cls.beam * 0.5 + 0.35;
      const tx = s.pos.x + fx * along + side.x * sg * hull;
      const tz = s.pos.z + fz * along + side.z * sg * hull;
      const face = Math.atan2(-side.x * sg, -side.z * sg);
      if (h.mode === 'swim') {
        // a hard crawl for the ship's side
        h.t += dt;
        const ox = tx - h.x, oz = tz - h.z;
        const d = Math.hypot(ox, oz);
        const sp = 2.4 + Math.abs(s.speed) * 0.9;
        const step = Math.min(d, sp * dt);
        h.x += (ox / Math.max(d, 1e-3)) * step;
        h.z += (oz / Math.max(d, 1e-3)) * step;
        h.y = w.waterHeight(h.x, h.z);
        const want = d > 0.6 ? Math.atan2(ox, oz) : face;
        h.yaw += Math.atan2(Math.sin(want - h.yaw), Math.cos(want - h.yaw)) * damp(5, dt);
        const st = k * 4.5;
        T[P.armLX] = 2.6 + 0.5 * Math.sin(st);
        T[P.armRX] = 2.6 - 0.5 * Math.sin(st);
        T[P.armLZ] = 0.3;
        T[P.armRZ] = 0.3;
        T[P.legLX] = 0.4 + 0.4 * Math.sin(st * 1.4);
        T[P.legRX] = 0.4 - 0.4 * Math.sin(st * 1.4);
        T[P.headX] = -1.0;
        T[P.jaw] = 0.3;
        this.pose(h, dt, 1.1);
        if (d < 0.5 || h.t > 9) {
          h.mode = 'climb';
          h.t = 0;
        }
        continue;
      }
      if (h.mode === 'climb') {
        // up the tumblehome on the man-ropes, hand over hand
        h.t += dt;
        const deck = s.root.position.y + s.cls.freeboard;
        const k2 = Math.min(1, h.t / 1.6);
        h.x = tx;
        h.z = tz;
        h.y = w.waterHeight(tx, tz) - 0.9 + (deck + 0.2 - w.waterHeight(tx, tz) + 0.9) * (k2 * k2 * (3 - 2 * k2));
        h.yaw = face;
        const st = h.t * 9;
        T[P.armLX] = 2.6 + 0.35 * Math.sin(st);
        T[P.armRX] = 2.6 - 0.35 * Math.sin(st);
        T[P.elbowL] = 0.6 + 0.4 * Math.sin(st);
        T[P.elbowR] = 0.6 - 0.4 * Math.sin(st);
        T[P.legLX] = 0.9 + 0.5 * Math.sin(st);
        T[P.legRX] = 0.9 - 0.5 * Math.sin(st);
        T[P.kneeL] = 1.2;
        T[P.kneeR] = 1.2;
        T[P.headX] = -0.4;
        T[P.handL] = 1;
        T[P.handR] = 1;
        this.pose(h, dt, 0);
        if (h.t > 1.7) {
          h.mode = 'aboard';
          this.release(h);
          r.hands.splice(i, 1);
          this.onAboard(r, r.hands.length);
        }
      }
    }
  }

  /** Eases the pose and writes the figure's world matrix: `tilt` leans the body forward into the water. */
  private pose(h: Hand, dt: number, tilt: number) {
    const f = h.fig;
    const kk = damp(8, dt);
    for (let i = 0; i < POSE_SIZE; i++) f.pose[i] += (h.target[i] - f.pose[i]) * kk;
    if (h.mode === 'climb') {
      // feet at the origin, standing against her side
      _e.set(0, h.yaw, 0, 'YXZ');
      _q.setFromEuler(_e);
      f.matrix.compose(_v.set(h.x, h.y, h.z), _q, _s);
      return;
    }
    // the chest at the surface, the rest hanging down into the sea
    _e.set(tilt, h.yaw, 0, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_v.set(h.x, h.y - 0.05, h.z), _q, _s);
    f.matrix.multiplyMatrices(_m, _mDown);
  }

  clear() {
    for (let i = this.rafts.length - 1; i >= 0; i--) this.drop(i);
    for (const m of this.meshes) m.count = 0;
  }
}

const _mDown = new THREE.Matrix4().makeTranslation(0, -1.3, 0);

/** Spreads a sunken ship's lucky few over the wreckage. */
export function survivorsOf(cls: ShipClassId): number[] {
  const n = cls === 'sloop' ? (Math.random() < 0.5 ? 1 : 2) : cls === 'brig' ? 2 + (Math.random() < 0.4 ? 1 : 0) : 3 + (Math.random() < 0.5 ? 1 : 0);
  // more than three take two pieces of wreckage
  return n > 3 ? [2, n - 2] : [n];
}
