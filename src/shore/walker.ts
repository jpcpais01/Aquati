import * as THREE from 'three';
import { angleDelta, clamp, damp, lerp } from '../core/noise';
import { P, POSE_SIZE, PROP } from '../ships/crewModel';
import { crouch, CrewFigure, Look, rest, walk } from '../ships/crew';

// Someone on foot on an island: the captain, a hand from the landing party or
// one of the cutthroats. A walker is drawn by the crews' instanced sailor and
// posed here, joint by joint: the walk and run, a guard with the cutlass up,
// three cuts (an overhead slash, a backhand sweep and a lunging thrust), a
// parry, a flinch from a blow, a knock-out fall onto the sand, getting up
// again, sitting by a fire, chatting, keeping watch and cheering a win.

export type Team = 'party' | 'foe';
export type Idle = 'stand' | 'sit' | 'ground' | 'chat' | 'watch' | 'lean' | 'warm';

/** The three cuts: 0 overhead, 1 backhand, 2 lunge. */
export type Cut = 0 | 1 | 2;
/** Seconds into a cut: wind-up ends, the blade lands, follow-through ends, back on guard. */
export const CUT_WIND = [0.17, 0.15, 0.2];
export const CUT_HIT = [0.23, 0.21, 0.27];
const CUT_HOLD = [0.34, 0.31, 0.4];
export const CUT_END = [0.56, 0.5, 0.66];

const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const T = new Float32Array(POSE_SIZE);
const K = new Float32Array(POSE_SIZE);

let serial = 0;

export class Walker implements CrewFigure {
  readonly id = serial++;
  readonly pose = new Float32Array(POSE_SIZE);
  readonly matrix = new THREE.Matrix4();
  prop: number = PROP.none;
  visible = false;
  // where and how fast
  x = 0;
  z = 0;
  y = 0;
  vx = 0;
  vz = 0;
  /** Knock-back and shove, separate from the walker's own stride. */
  kx = 0;
  kz = 0;
  yaw = 0;
  wantYaw = 0;
  /** Ground speed this frame (m/s) and the stride cycle. */
  stride = 0;
  phase = Math.random() * 6;
  /** Depth of the water at the feet (0 on dry land). */
  wade = 0;
  // fighting
  hp: number;
  armed = false;
  cut: Cut = 0;
  /** Seconds into the current cut (-1 = not cutting). */
  cutT = -1;
  hitDone = false;
  cooldown = 0;
  /** Parrying (seconds left). */
  parry = 0;
  stagger = 0;
  flinch = 0;
  /** Knocked down: seconds since the fall (-1 standing), and 0..1 how far over. */
  downT = -1;
  fall = 0;
  rise = 0;
  aim = 0; // pistol raised 0..1
  cheer = 0;
  shout = 0;
  lastHurt = -100;
  target: Walker | null = null;
  // at ease
  idle: Idle = 'stand';
  idleT = 0;
  lookYaw = 0;
  lookT = 0;
  /** Extra hip drop for sitting on something (a log). */
  seatH = 0;
  readonly seed = Math.random() * 100;
  readonly tempo = 0.9 + Math.random() * 0.2;

  constructor(
    readonly team: Team,
    public row: number,
    public look: Look,
    readonly maxHp: number,
    readonly girth = 1,
    readonly height = 1,
    /** Whether the row was taken for this walker (and must be given back). */
    readonly ownsRow = false,
  ) {
    this.hp = maxHp;
    rest(this.pose);
  }

  get down() {
    return this.downT >= 0;
  }

  get alive() {
    return this.hp > 0;
  }

  get cutting() {
    return this.cutT >= 0;
  }

  /** Can act: standing, not reeling. */
  get ready() {
    return !this.down && this.stagger <= 0 && this.rise <= 0;
  }

  place(x: number, z: number, yaw: number) {
    this.x = x;
    this.z = z;
    this.yaw = this.wantYaw = yaw;
    this.vx = this.vz = this.kx = this.kz = 0;
  }

  /** Starts a cut; returns false if busy. */
  swing(cut: Cut) {
    if (!this.ready || this.cutting || this.cooldown > 0) return false;
    this.cut = cut;
    this.cutT = 0;
    this.hitDone = false;
    this.armed = true;
    this.parry = 0;
    return true;
  }

  /** Down onto the sand. */
  knockDown() {
    this.downT = 0;
    this.cutT = -1;
    this.parry = 0;
    this.aim = 0;
    this.vx = this.vz = 0;
  }

  getUp(hp: number) {
    if (!this.down) return;
    this.downT = -1;
    this.rise = 1;
    this.hp = Math.max(this.hp, hp);
  }

  /** Clock the timers on. */
  tick(dt: number) {
    if (this.cutT >= 0) {
      this.cutT += dt;
      if (this.cutT >= CUT_END[this.cut]) this.cutT = -1;
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.parry = Math.max(0, this.parry - dt);
    this.stagger = Math.max(0, this.stagger - dt);
    this.flinch = Math.max(0, this.flinch - dt);
    this.cheer = Math.max(0, this.cheer - dt);
    this.shout = Math.max(0, this.shout - dt);
    if (this.downT >= 0) {
      this.downT += dt;
      this.fall = Math.min(1, this.fall + dt * 2.4);
    } else if (this.rise > 0) {
      this.rise = Math.max(0, this.rise - dt * 1.1);
      this.fall = this.rise;
    } else this.fall = 0;
  }

  /** Builds this frame's pose from what the walker is doing, and eases into it. */
  animate(dt: number, time: number, run: number) {
    const tt = time * this.tempo + this.seed;
    rest(T);
    const moving = this.stride > 0.25 && !this.down;
    // at ease: what they're about while nobody fights
    if (!moving && !this.armed && !this.down) this.ease(T, tt);
    if (moving) {
      walk(T, this.phase, run, this.armed);
      if (this.wade > 0.15) {
        // high steps through the shallows, arms out for balance
        T[P.kneeL] += 0.5 * Math.min(1, this.wade);
        T[P.kneeR] += 0.5 * Math.min(1, this.wade);
        T[P.armLZ] = 0.45;
        T[P.armRZ] = 0.45;
      }
    }
    if (this.armed && !this.down) this.guard(T, moving, tt);
    if (this.cutT >= 0) this.cutPose(T);
    if (this.aim > 0) {
      // the pistol at arm's length, the head sighting along it
      const w = Math.min(1, this.aim * 1.6);
      T[P.armLX] = lerp(T[P.armLX], 1.52, w);
      T[P.armLZ] = lerp(T[P.armLZ], -0.18, w);
      T[P.elbowL] = lerp(T[P.elbowL], 0.05, w);
      T[P.handL] = lerp(T[P.handL], 0.85, w);
      T[P.spineY] = lerp(T[P.spineY], 0.45, w);
      T[P.headY] = lerp(T[P.headY], 0.2, w);
      T[P.brow] = -0.6;
    }
    if (this.parry > 0) {
      // blade across the body, edge out
      T[P.armRX] = 1.35;
      T[P.armRZ] = -0.55;
      T[P.elbowR] = 1.55;
      T[P.armLX] = 0.6;
      T[P.armLZ] = 0.55;
      T[P.spineX] = -0.12;
      T[P.brow] = -0.9;
      crouch(T, 0.35);
    }
    if (this.flinch > 0 && !this.down) {
      const w = Math.min(1, this.flinch * 5);
      T[P.spineX] = lerp(T[P.spineX], -0.38, w);
      T[P.headX] = lerp(T[P.headX], -0.32, w);
      T[P.armLZ] = lerp(T[P.armLZ], 0.75, w);
      T[P.armLX] = lerp(T[P.armLX], 0.5, w);
      T[P.jaw] = 0.55 * w;
      T[P.brow] = 0.9;
      T[P.smile] = -0.8;
    }
    if (this.down || this.fall > 0) this.sprawl(T, tt);
    if (this.cheer > 0 && !this.down) {
      const w = Math.min(1, this.cheer * 2, (3 - this.cheer) * 4);
      const j = Math.max(0, Math.sin(tt * 8.5));
      K.set(T);
      K[P.armRX] = 2.75 + 0.25 * Math.sin(tt * 8.5);
      K[P.armRZ] = -0.35;
      K[P.elbowR] = 0.2;
      K[P.armLX] = 2.5 + 0.3 * Math.sin(tt * 8.5 + 1.3);
      K[P.armLZ] = -0.35;
      K[P.elbowL] = 0.35;
      K[P.handL] = 1;
      K[P.handR] = 1;
      K[P.headX] = -0.3;
      K[P.jaw] = 0.65 + 0.35 * Math.sin(tt * 8.5);
      K[P.brow] = 0.8;
      K[P.smile] = 1;
      K[P.rootY] = j * 0.2 - (1 - j) * 0.06;
      for (let i = 0; i < POSE_SIZE; i++) T[i] = lerp(T[i], K[i], w);
    }
    this.face(T, tt, moving);
    // cuts and blows snap; everything else eases
    const k = damp(this.cutT >= 0 || this.flinch > 0 || this.parry > 0 ? 34 : this.down ? 9 : 13, dt);
    for (let i = 0; i < POSE_SIZE; i++) this.pose[i] += (T[i] - this.pose[i]) * k;
    this.prop = this.armed || this.cheer > 0 ? PROP.cutlass : PROP.none;
  }

  /** Blade up: a crouched guard, the cutlass held out ahead, the off hand out for balance. */
  private guard(o: Float32Array, moving: boolean, tt: number) {
    const b = Math.sin(tt * 2.2) * 0.04;
    if (moving) {
      o[P.armRX] = 0.95;
      o[P.armRZ] = 0.2;
      o[P.elbowR] = 0.9;
      o[P.armLZ] = 0.35;
      return;
    }
    o[P.armRX] = 0.78 + b;
    o[P.armRZ] = 0.18;
    o[P.elbowR] = 1.12;
    o[P.armLX] = 0.4;
    o[P.armLZ] = 0.48;
    o[P.elbowL] = 1.15;
    o[P.handL] = 0.45;
    o[P.spineY] = -0.18;
    o[P.spineX] = 0.12;
    o[P.legLX] = 0.22;
    o[P.legRX] = -0.18;
    crouch(o, 0.28 + b);
  }

  private cutPose(o: Float32Array) {
    const t = this.cutT;
    const c = this.cut;
    const wind = CUT_WIND[c];
    const hit = CUT_HIT[c];
    const hold = CUT_HOLD[c];
    const end = CUT_END[c];
    // 0 guard -> 1 wound up -> 2 struck -> back to guard
    let a: number;
    let w: number;
    if (t < wind) {
      a = 0;
      w = smooth(t / wind);
    } else if (t < hit) {
      a = 1;
      w = (t - wind) / (hit - wind);
    } else if (t < hold) {
      a = 2;
      w = 1;
    } else {
      a = 3;
      w = smooth((t - hold) / (end - hold));
    }
    const up = CUTS[c][0];
    const down = CUTS[c][1];
    const from = a === 0 ? null : a === 1 ? up : down;
    const to = a === 0 ? up : a === 1 ? down : a === 2 ? down : null;
    for (const k of KEYS) {
      const f = from ? from[k] ?? o[k] : o[k];
      const g = to ? to[k] ?? o[k] : o[k];
      o[k] = lerp(f, g, w);
    }
    o[P.handR] = 1;
    o[P.brow] = -0.9;
    o[P.jaw] = a === 1 || a === 2 ? 0.55 : 0.2;
    o[P.smile] = -0.5;
  }

  /** On the sand: limbs flung out, dazed. */
  private sprawl(o: Float32Array, tt: number) {
    const w = this.fall;
    const lie = (k: number, v: number) => (o[k] = lerp(o[k], v, w));
    lie(P.armLX, 0.4);
    lie(P.armLZ, 1.25 + 0.1 * Math.sin(this.seed));
    lie(P.elbowL, 0.4);
    lie(P.armRX, 0.2);
    lie(P.armRZ, 1.1);
    lie(P.elbowR, 0.6);
    lie(P.legLX, 0.15);
    lie(P.kneeL, 0.35);
    lie(P.legRX, 0.5);
    lie(P.kneeR, 0.9);
    lie(P.spineX, -0.15);
    lie(P.headX, -0.25);
    lie(P.headY, 0.45 * Math.sin(this.seed * 3));
    lie(P.rootY, 0);
    o[P.jaw] = 0.35 + 0.1 * Math.sin(tt * 1.7);
    o[P.brow] = 0.7;
    o[P.smile] = -0.3;
    o[P.handL] = 0.2;
    o[P.handR] = 0.2;
  }

  /** At ease: sitting by the fire, warming hands, chatting, keeping watch. */
  private ease(o: Float32Array, tt: number) {
    switch (this.idle) {
      case 'sit': {
        const drop = Math.max(0.3, 0.88 - this.seatH - 0.06);
        o[P.rootY] = -drop;
        o[P.legLX] = 1.35;
        o[P.legRX] = 1.3;
        o[P.kneeL] = 1.4;
        o[P.kneeR] = 1.25;
        o[P.spineX] = 0.18;
        o[P.armLX] = 0.65;
        o[P.armRX] = 0.6;
        o[P.elbowL] = 1.1;
        o[P.elbowR] = 1.0;
        o[P.armLZ] = 0.12;
        o[P.armRZ] = 0.12;
        o[P.headX] = 0.12 + 0.08 * Math.sin(tt * 0.4);
        break;
      }
      case 'warm':
        // hands out to the flames
        o[P.armLX] = 1.15;
        o[P.armRX] = 1.15;
        o[P.elbowL] = 0.55;
        o[P.elbowR] = 0.55;
        o[P.armLZ] = -0.08;
        o[P.armRZ] = -0.08;
        o[P.handL] = 0.05;
        o[P.handR] = 0.05;
        o[P.spineX] = 0.15;
        crouch(o, 0.18);
        break;
      case 'ground':
        // sat on the sand, leaning back on both hands
        o[P.rootY] = -0.74;
        o[P.legLX] = 1.45;
        o[P.legRX] = 1.38;
        o[P.kneeL] = 0.55;
        o[P.kneeR] = 1.0;
        o[P.spineX] = -0.32;
        o[P.armLX] = -0.55;
        o[P.armRX] = -0.55;
        o[P.armLZ] = 0.28;
        o[P.armRZ] = 0.28;
        o[P.elbowL] = 0.05;
        o[P.elbowR] = 0.05;
        o[P.headX] = 0.15;
        break;
      case 'watch':
        // a hand shading the eyes, squinting out to sea
        o[P.armRX] = 2.25;
        o[P.armRZ] = 0.35;
        o[P.elbowR] = 2.35;
        o[P.handR] = 0.1;
        o[P.armLZ] = 0.6;
        o[P.elbowL] = 1.6;
        o[P.handL] = 0.55;
        o[P.headX] = -0.08;
        break;
      case 'lean':
        // hands on hips
        o[P.armLZ] = 0.55;
        o[P.armRZ] = 0.55;
        o[P.elbowL] = 1.7;
        o[P.elbowR] = 1.7;
        o[P.armLX] = -0.15;
        o[P.armRX] = -0.15;
        break;
      case 'chat': {
        const talk = Math.sin(tt * 0.9) > 0;
        if (talk) {
          o[P.armRX] = 0.75 + 0.3 * Math.sin(tt * 2.6);
          o[P.elbowR] = 1.2 + 0.4 * Math.sin(tt * 3.1);
          o[P.armRZ] = 0.2;
        }
        o[P.headY] = 0.15 * Math.sin(tt * 0.7);
        break;
      }
      default:
        o[P.headY] = this.lookYaw * 0.7;
        o[P.spineY] = this.lookYaw * 0.25;
    }
  }

  private face(o: Float32Array, tt: number, moving: boolean) {
    if (this.down) return;
    if (this.armed) {
      o[P.brow] = Math.min(o[P.brow], -0.6);
      o[P.smile] = Math.min(o[P.smile], this.team === 'foe' ? 0.2 : -0.1);
      if (this.team === 'foe') o[P.smile] = 0.35; // an ugly grin
    } else if (this.cheer <= 0) {
      o[P.smile] = 0.3 + 0.2 * Math.sin(this.seed);
      if (this.idle === 'chat' && !moving) {
        const talk = Math.sin(tt * 0.9) > 0;
        o[P.jaw] = talk ? 0.12 + 0.4 * Math.max(0, Math.sin(tt * 11)) * (0.5 + 0.5 * Math.sin(tt * 2.7)) : 0;
        o[P.smile] = talk ? 0.6 : 0.45 + 0.3 * Math.max(0, Math.sin(tt * 1.3));
        o[P.brow] = talk ? 0.4 * Math.max(0, Math.sin(tt * 1.9)) : 0.1;
      }
      if (this.idle === 'watch') o[P.brow] = -0.4;
    }
    if (this.shout > 0) {
      // a roar: mouth wide, brows down
      o[P.jaw] = 0.7 + 0.3 * Math.sin(tt * 14);
      o[P.brow] = -1;
      o[P.smile] = -0.4;
    }
    o[P.handR] = this.armed ? 1 : o[P.handR];
  }

  /** Writes the world matrix: feet on the ground, falling backwards when knocked down. */
  place3(ground: number) {
    const f = this.fall;
    const ease = f * f * (3 - 2 * f);
    // a body on its back is a hand's breadth off the sand
    this.y = ground;
    _e.set(-ease * 1.5, this.yaw, 0);
    _q.setFromEuler(_e);
    _s.set(this.girth, this.height, this.girth);
    _p.set(this.x, ground + ease * 0.16 - (this.wade > 0 ? 0.04 : 0), this.z);
    this.matrix.compose(_p, _q, _s);
  }

  turn(dt: number, rate = 9) {
    this.yaw += angleDelta(this.yaw, this.wantYaw) * damp(rate, dt);
  }
}

const smooth = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

type Keys = Partial<Record<number, number>>;
const KEYS = [P.armRX, P.armRZ, P.elbowR, P.spineX, P.spineY, P.legLX, P.legRX, P.kneeL, P.kneeR, P.rootY, P.armLX, P.armLZ, P.headX];

/** Each cut as [wound up, struck]. */
const CUTS: [Keys, Keys][] = [
  // overhead: blade back over the shoulder, then down hard with a step in
  [
    { [P.armRX]: 2.65, [P.armRZ]: 0.38, [P.elbowR]: 1.55, [P.spineY]: 0.32, [P.spineX]: -0.14, [P.armLX]: 0.7, [P.armLZ]: 0.5 },
    { [P.armRX]: 0.35, [P.armRZ]: -0.12, [P.elbowR]: 0.12, [P.spineY]: -0.3, [P.spineX]: 0.34, [P.legLX]: 0.5, [P.kneeL]: 0.45, [P.legRX]: -0.3, [P.rootY]: -0.08, [P.armLX]: -0.2, [P.armLZ]: 0.7 },
  ],
  // backhand: blade across to the off side, then swept out wide
  [
    { [P.armRX]: 1.4, [P.armRZ]: -0.95, [P.elbowR]: 1.35, [P.spineY]: -0.6, [P.spineX]: 0.08 },
    { [P.armRX]: 1.45, [P.armRZ]: 1.05, [P.elbowR]: 0.12, [P.spineY]: 0.6, [P.spineX]: 0.16, [P.legRX]: 0.35, [P.kneeR]: 0.35, [P.legLX]: -0.2, [P.armLZ]: 0.9 },
  ],
  // lunge: drawn back, then the point driven forward with the whole body behind it
  [
    { [P.armRX]: 1.05, [P.armRZ]: 0.25, [P.elbowR]: 2.05, [P.spineY]: 0.45, [P.spineX]: -0.05, [P.legRX]: -0.2, [P.kneeR]: 0.3 },
    { [P.armRX]: 1.55, [P.armRZ]: 0.04, [P.elbowR]: 0.0, [P.spineY]: -0.4, [P.spineX]: 0.38, [P.legLX]: 0.8, [P.kneeL]: 0.7, [P.legRX]: -0.55, [P.kneeR]: 0.1, [P.rootY]: -0.16, [P.armLX]: -0.35, [P.armLZ]: 0.85, [P.headX]: 0.2 },
  ],
];
